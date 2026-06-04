#!/usr/bin/env bun
/**
 * release.mjs — publish-and-deploy orchestrator for Ship Shit Games.
 *
 * Pipeline (in order):
 *   1. Discover publishable packages (packages/*, private !== true), topo-sorted by intra-scope deps.
 *   2. (optional) bump versions: --bump=patch|minor|major.
 *   3. Publish each to npm — IDEMPOTENT: skips any name@version already on the registry.
 *   4. Cutover: rewrite every consumer's "workspace:*" / "*" / "file:..." spec for a *published*
 *      @shipshitgames/* package to "^<version>". Consumers = monorepo apps + packages + ../games/*.
 *   5. PR: per git repo with changes, branch + commit + push + `gh pr create`.
 *   6. Deploy: `npx vercel --prod` for every Vercel-linked target (.vercel/project.json) among apps + games.
 *
 * SAFETY: DRY RUN by default — prints the plan, touches nothing. Pass --execute to perform side effects.
 *   Flags: --execute  --no-publish  --no-pr  --no-deploy  --bump=patch|minor|major
 *          --only=engine,ui   (restrict to these package short-names)
 *          --base=master      (PR base branch; default: the repo's default branch)
 *
 * Auth needed for --execute: `npm whoami` (publish), `gh auth status` (PR), Vercel login / VERCEL_TOKEN (deploy).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MONO = resolve(HERE, '..') // the monorepo (shipshitgames/)
const WORKSPACE = resolve(MONO, '..') // parent holding shipshitgames/ + games/
const GAMES = join(WORKSPACE, 'games')
const SCOPE = '@shipshitgames/'
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const EXECUTE = has('--execute')
const DRY = !EXECUTE
const DO_PUBLISH = !has('--no-publish')
const DO_PR = !has('--no-pr')
const DO_DEPLOY = !has('--no-deploy')
const BUMP = val('bump') // patch|minor|major|undefined
const ONLY = val('only')?.split(',').map((s) => s.trim()).filter(Boolean)
const BASE = val('base')

const C = { dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m', rst: '\x1b[0m' }
const tag = DRY ? `${C.yel}[dry-run]${C.rst}` : `${C.grn}[execute]${C.rst}`
const log = (...a) => console.log(...a)
const step = (s) => log(`\n${C.cyn}━━ ${s}${C.rst}`)
const plan = (...a) => log(`  ${C.yel}plan${C.rst}`, ...a)
const done = (...a) => log(`  ${C.grn}✓${C.rst}`, ...a)
const skip = (...a) => log(`  ${C.dim}· ${a.join(' ')}${C.rst}`)
const die = (m) => { console.error(`${C.red}✗ ${m}${C.rst}`); process.exit(1) }

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))
const writeJson = (f, o) => writeFileSync(f, JSON.stringify(o, null, 2) + '\n')
/** Run a command. Read-only commands always run; mutating ones are skipped (printed) in dry-run. */
function run(cmd, { cwd = MONO, mutating = false, capture = false } = {}) {
  if (mutating && DRY) { plan(`${C.dim}${cmd}${C.rst} ${C.dim}(cwd ${cwd.replace(WORKSPACE, '.')})${C.rst}`); return '' }
  try {
    return execSync(cmd, { cwd, stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit', encoding: 'utf8' })?.trim() ?? ''
  } catch (e) {
    if (capture) return ''
    throw e
  }
}

const listDirs = (d) => (existsSync(d) ? readdirSync(d).map((n) => join(d, n)).filter((p) => statSync(p).isDirectory()) : [])
const pkgFileOf = (dir) => join(dir, 'package.json')
const hasPkg = (dir) => existsSync(pkgFileOf(dir))

// ── 1. discover packages ───────────────────────────────────────────────────
step('Discover publishable packages')
const pkgDirs = listDirs(join(MONO, 'packages')).filter(hasPkg)
let publishable = pkgDirs
  .map((dir) => ({ dir, json: readJson(pkgFileOf(dir)) }))
  .filter((p) => p.json.private !== true && p.json.name?.startsWith(SCOPE))
if (ONLY) publishable = publishable.filter((p) => ONLY.includes(p.json.name.slice(SCOPE.length)))
if (!publishable.length) die('no publishable packages found (all private? wrong --only?)')

// topo-sort by intra-scope deps so dependencies publish first
const byName = new Map(publishable.map((p) => [p.json.name, p]))
const scopeDeps = (j) => DEP_FIELDS.flatMap((f) => Object.keys(j[f] || {})).filter((k) => byName.has(k))
const sorted = []
const seen = new Set()
const visit = (p, stack = new Set()) => {
  if (seen.has(p.json.name)) return
  if (stack.has(p.json.name)) die(`dependency cycle at ${p.json.name}`)
  stack.add(p.json.name)
  for (const d of scopeDeps(p.json)) visit(byName.get(d), stack)
  seen.add(p.json.name); sorted.push(p)
}
publishable.forEach((p) => visit(p))
for (const p of sorted) log(`  ${p.json.name}@${p.json.version} ${C.dim}(${basename(p.dir)})${C.rst}`)

// ── 2. optional version bump ────────────────────────────────────────────────
if (BUMP) {
  step(`Bump (${BUMP})`)
  for (const p of sorted) {
    const out = run(`npm version ${BUMP} --no-git-tag-version`, { cwd: p.dir, mutating: true, capture: true })
    p.json = readJson(pkgFileOf(p.dir)) // re-read new version
    done(`${p.json.name} -> ${p.json.version}${out ? '' : DRY ? ' (planned)' : ''}`)
  }
}

// ── 3. publish (idempotent) ─────────────────────────────────────────────────
step('Publish to npm')
if (DO_PUBLISH) {
  if (!DRY && !run('npm whoami', { capture: true })) die('not logged in to npm (`npm login`)')
  for (const p of sorted) {
    const { name, version } = p.json
    const onNpm = run(`npm view ${name}@${version} version`, { capture: true })
    if (onNpm === version) { skip(`${name}@${version} already published`); continue }
    run('bun publish --access public', { cwd: p.dir, mutating: true })
    done(`published ${name}@${version}`)
  }
} else skip('--no-publish')

// published version map (whatever the package.json now declares)
const published = new Map(sorted.map((p) => [p.json.name, p.json.version]))

// ── 4. cutover: workspace:/file:/* -> ^version in every consumer ─────────────
step('Cutover consumer specs -> ^version')
const consumerDirs = [
  ...listDirs(join(MONO, 'apps')),
  ...pkgDirs,
  ...listDirs(GAMES).filter((d) => basename(d) !== 'scourge-survivors-funpack'), // other agent's worktree
].filter(hasPkg)
const changedRepos = new Map() // gitRoot -> Set(files)
const gitRootOf = (dir) => {
  let d = dir
  while (d !== WORKSPACE && d !== '/') { if (existsSync(join(d, '.git'))) return d; d = dirname(d) }
  return null
}
for (const dir of consumerDirs) {
  const file = pkgFileOf(dir)
  const j = readJson(file)
  let changed = false
  for (const field of DEP_FIELDS) {
    for (const [dep, spec] of Object.entries(j[field] || {})) {
      if (!published.has(dep)) continue // unpublished/private -> leave the local link
      const want = `^${published.get(dep)}`
      const local = /^(workspace:|file:|\*$|link:)/.test(spec)
      if (spec !== want && (local || spec === '*')) {
        j[field][dep] = want
        changed = true
        plan(`${basename(dir)}: ${dep} ${C.dim}${spec}${C.rst} -> ${want}`)
      }
    }
  }
  if (changed) {
    if (!DRY) writeJson(file, j)
    const root = gitRootOf(dir)
    if (root) (changedRepos.get(root) ?? changedRepos.set(root, new Set()).get(root)).add(file)
  }
}
if (!changedRepos.size) skip('no consumer specs needed cutover')

// ── 5. PR per changed git repo ──────────────────────────────────────────────
step('Open PRs')
if (DO_PR && changedRepos.size) {
  const branch = `release/cutover-${new Date().toISOString().slice(0, 10)}`
  for (const [root, files] of changedRepos) {
    const rel = root.replace(WORKSPACE + '/', '')
    const base = BASE || run('git rev-parse --abbrev-ref HEAD', { cwd: root, capture: true }) || 'master'
    run(`git checkout -b ${branch}`, { cwd: root, mutating: true })
    for (const f of files) run(`git add ${JSON.stringify(f)}`, { cwd: root, mutating: true })
    run(`git commit -m ${JSON.stringify('chore(release): cut over @shipshitgames/* deps to published versions')}`, { cwd: root, mutating: true })
    run(`git push -u origin ${branch}`, { cwd: root, mutating: true })
    run(`gh pr create --base ${base} --head ${branch} --fill`, { cwd: root, mutating: true })
    done(`PR opened: ${rel} (${branch} -> ${base})`)
  }
} else skip(DO_PR ? 'nothing to PR' : '--no-pr')

// ── 6. deploy Vercel-linked targets ─────────────────────────────────────────
step('Deploy (vercel --prod)')
if (DO_DEPLOY) {
  const targets = [...listDirs(join(MONO, 'apps')), ...listDirs(GAMES)]
    .filter((d) => existsSync(join(d, '.vercel', 'project.json')))
  if (!targets.length) skip('no Vercel-linked targets (.vercel/project.json) found')
  for (const dir of targets) {
    run('npx vercel pull --yes --environment=production', { cwd: dir, mutating: true })
    run('npx vercel deploy --prod --yes', { cwd: dir, mutating: true })
    done(`deployed ${dir.replace(WORKSPACE + '/', '')}`)
  }
} else skip('--no-deploy')

log(`\n${tag} ${DRY ? 'plan only — re-run with --execute to publish/PR/deploy.' : 'release complete.'}`)

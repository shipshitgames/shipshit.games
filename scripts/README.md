# Package releases and production deploys

Package publication and application deployment are deliberately separate.

## Publish public packages

```sh
bun run release:packages       # dry-run: list publishable packages
bun run release:packages:run   # verify and publish
```

`release.mjs` publishes already-versioned public `@shipshitgames/*` packages.
The execute form requires a clean `master` that exactly matches
`origin/master`, runs each package's typecheck/tests and a pack dry-run, and
skips versions already present on npm.

It never bumps versions, rewrites consumers, creates branches, or deploys apps.
Land version changes through review first. After publishing, update downstream
Deadrot dependencies through an explicit PR.

Optional flag: `--only=engine,ui`.

## Deploy applications

Production deploys are exclusively driven by a published semver `v*` GitHub
Release through
[`deploy-production.yml`](../.github/workflows/deploy-production.yml). See
[`RELEASING.md`](../RELEASING.md) for the release and rollback runbook.

`release-tag.mjs` creates deployment-neutral `prod-*` marker tags. It does not
deploy unless a deliberately requested semver GitHub Release invokes the
production workflow.

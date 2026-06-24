#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const scanHistory = process.argv.includes("--history");
const maxBytes = 5 * 1024 * 1024;

const patterns = [
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["AWS secret access key assignment", /\baws_secret_access_key\s*[:=]\s*["']?[^"'\s#]+/i],
  ["AWS session token assignment", /\baws_session_token\s*[:=]\s*["']?[^"'\s#]+/i],
  ["Stripe or Clerk secret key", /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/],
  ["Webhook signing secret", /\bwhsec_[A-Za-z0-9_+/=-]{16,}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/],
  ["Replicate token", /\br8_[A-Za-z0-9]{20,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Postgres URL with credentials", /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i],
  ["Mongo URL with credentials", /mongodb(?:\+srv)?:\/\/[^\s:@]+:[^\s@]+@/i],
];

const allowed = [
  /placeholder/i,
  /example/i,
  /dummy/i,
  /changeme/i,
  /replace/i,
  /your_/i,
  /ci[_-]?/i,
  /<redacted>/i,
  /\$\{/,
  /process\.env/,
  /postgres(?:ql)?:\/\/shipshit:shipshit@postgres/i,
  /postgres(?:ql)?:\/\/shipshit:shipshit_dev@postgres/i,
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function gitBuffer(args) {
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
}

function nulList(args) {
  const output = git(args);
  return output ? output.split("\0").filter(Boolean) : [];
}

function isAllowed(line) {
  return allowed.some((pattern) => pattern.test(line));
}

function matchingPattern(line) {
  if (isAllowed(line)) return null;
  for (const [name, pattern] of patterns) {
    if (pattern.test(line)) return name;
  }
  return null;
}

function scanFile(file) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return [];
  }
  if (!stat.isFile() || stat.size > maxBytes) return [];

  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    return [];
  }
  if (buffer.includes(0)) return [];

  const findings = [];
  const lines = buffer.toString("utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = matchingPattern(lines[index]);
    if (match) findings.push({ file, line: index + 1, match });
  }
  return findings;
}

function scanWorkingTree() {
  const files = new Set([...nulList(["ls-files", "-z"]), ...nulList(["ls-files", "--others", "--exclude-standard", "-z"])]);
  return [...files].flatMap(scanFile);
}

function scanGitHistory() {
  // In CI, `actions/checkout` with full history may fetch other open branches.
  // Scan the checked-out ref's history so an unrelated branch cannot fail this PR.
  const commits = git(["rev-list", process.env.SECRET_SCAN_HISTORY_REF || "HEAD"]).trim().split("\n").filter(Boolean);
  const findings = [];
  const scannedBlobs = new Set();

  for (const commit of commits) {
    let tree = "";
    try {
      tree = git(["ls-tree", "-r", "-z", "--full-tree", commit]);
    } catch {
      continue;
    }

    for (const row of tree.split("\0").filter(Boolean)) {
      const tab = row.indexOf("\t");
      if (tab === -1) continue;

      const metadata = row.slice(0, tab).split(/\s+/);
      const blob = metadata[2];
      const file = row.slice(tab + 1);
      if (!blob || scannedBlobs.has(blob)) continue;
      scannedBlobs.add(blob);

      const size = Number(git(["cat-file", "-s", blob]));
      if (!Number.isFinite(size) || size > maxBytes) continue;

      const buffer = gitBuffer(["cat-file", "blob", blob]);
      if (buffer.includes(0)) continue;

      const lines = buffer.toString("utf8").split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const match = matchingPattern(lines[index]);
        if (!match) continue;
        findings.push({
          commit: commit.slice(0, 12),
          file,
          line: index + 1,
          match,
        });
      }
    }
  }

  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.commit}:${finding.file}:${finding.line}:${finding.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const findings = [...scanWorkingTree(), ...(scanHistory ? scanGitHistory() : [])];

if (findings.length > 0) {
  console.error("Potential secrets found. Values are intentionally not printed.");
  for (const finding of findings) {
    const prefix = finding.commit ? `${finding.commit} ` : "";
    console.error(`${prefix}${finding.file}:${finding.line} ${finding.match}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${scanHistory ? "working tree + history" : "working tree"}).`);

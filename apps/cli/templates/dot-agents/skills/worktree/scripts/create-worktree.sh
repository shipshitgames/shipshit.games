#!/usr/bin/env bash
#
# create-worktree.sh — create a git worktree for a GitHub issue/PR.
#
# Usage:
#   create-worktree.sh <issue-ref> [type]
#
#   <issue-ref>  A GitHub issue or PR reference, in any of these forms:
#                  https://github.com/owner/repo/issues/65
#                  https://github.com/owner/repo/pull/65
#                  owner/repo#65
#                  #65
#                  65
#   [type]       Branch prefix. Default: feat
#
# Behaviour:
#   - Resolves the issue/PR title via the GitHub API and slugifies it.
#   - Branch name:  <type>/<number>-<slug>     e.g. feat/65-add-login-screen
#   - Base branch:  develop -> master -> main  (first that exists wins)
#   - Worktree dir: <repo-root>/.worktrees/<branch-with-slashes-as-dashes>
#   - Prints WORKTREE_PATH=<abs-path> and BRANCH=<name> on the last lines.
#
# Requires: git, gh (authenticated).

set -euo pipefail

die() { printf 'worktree: %s\n' "$1" >&2; exit 1; }

[ "$#" -ge 1 ] || die "missing issue reference. Usage: create-worktree.sh <issue-ref> [type]"
command -v git >/dev/null 2>&1 || die "git not found"
command -v gh  >/dev/null 2>&1 || die "gh CLI not found (needed to read the issue title)"

INPUT="$1"
TYPE="${2:-feat}"

# --- Locate the repository root -------------------------------------------
TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"

# --- Extract the issue/PR number ------------------------------------------
NUMBER=""
if   [[ "$INPUT" =~ /(issues|pull)/([0-9]+) ]]; then NUMBER="${BASH_REMATCH[2]}"
elif [[ "$INPUT" =~ \#([0-9]+) ]];               then NUMBER="${BASH_REMATCH[1]}"
elif [[ "$INPUT" =~ ^[0-9]+$ ]];                 then NUMBER="$INPUT"
else NUMBER="$(printf '%s' "$INPUT" | grep -oE '[0-9]+' | tail -1 || true)"
fi
[ -n "$NUMBER" ] || die "could not find an issue/PR number in: $INPUT"

# --- Resolve owner/repo (from the URL, else the current repo) -------------
if [[ "$INPUT" =~ github\.com[:/]+([^/]+)/([^/#[:space:]]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]%.git}"
  NWO="$OWNER/$REPO"
else
  NWO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" \
    || die "no GitHub repo detected; pass a full issue URL"
fi

# --- Fetch the title (the issues endpoint serves issues AND PRs) ----------
TITLE="$(gh api "repos/$NWO/issues/$NUMBER" --jq .title 2>/dev/null || true)"
[ -n "$TITLE" ] || die "could not read issue/PR #$NUMBER from $NWO (check the number and gh auth)"

# --- Slugify --------------------------------------------------------------
SLUG="$(printf '%s' "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
  | cut -c1-50 \
  | sed -E 's/-+$//')"
[ -n "$SLUG" ] || SLUG="issue"

BRANCH="$TYPE/$NUMBER-$SLUG"
WTDIR="$TOPLEVEL/.worktrees/${BRANCH//\//-}"

# --- Determine the base branch (develop -> master -> main) ----------------
if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin --quiet --prune 2>/dev/null || true
fi

BASE_REF=""
for cand in develop master main; do
  if   git show-ref --verify --quiet "refs/remotes/origin/$cand"; then BASE_REF="origin/$cand"; break
  elif git show-ref --verify --quiet "refs/heads/$cand";          then BASE_REF="$cand";        break
  fi
done
[ -n "$BASE_REF" ] || die "no develop/master/main branch found to base the worktree on"

# --- Include ignored local environment files ------------------------------
include_env_local_files() {
  local src_root="$1"
  local dst_root="$2"
  local rel src dest
  local env_files=(
    "apps/web/.env.local"
    "apps/app/.env.local"
    "apps/api/.env.local"
    "apps/docs/.env.local"
  )

  if [ ! -e "$src_root/apps/docs/.env.local" ] && [ -f "$src_root/apps/docs/.env.example" ]; then
    cp "$src_root/apps/docs/.env.example" "$src_root/apps/docs/.env.local"
    printf 'worktree: seeded apps/docs/.env.local from apps/docs/.env.example.\n' >&2
  fi

  for rel in "${env_files[@]}"; do
    src="$src_root/$rel"
    dest="$dst_root/$rel"
    [ -e "$src" ] || continue
    if [ -e "$dest" ] || [ -L "$dest" ]; then
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    ln -s "$src" "$dest"
    printf 'worktree: linked %s from source checkout.\n' "$rel" >&2
  done
}

# --- Create the worktree --------------------------------------------------
mkdir -p "$TOPLEVEL/.worktrees"

if [ -e "$WTDIR" ]; then
  printf 'worktree: %s already exists — reusing it.\n' "$WTDIR" >&2
elif git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  # Branch already exists: attach a worktree to it without re-creating.
  git worktree add "$WTDIR" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$WTDIR" "$BASE_REF"
fi

include_env_local_files "$TOPLEVEL" "$WTDIR"

# --- Report ---------------------------------------------------------------
printf '\n'
printf 'Issue/PR : %s#%s — %s\n' "$NWO" "$NUMBER" "$TITLE"
printf 'Base     : %s\n' "$BASE_REF"
printf 'Branch   : %s\n' "$BRANCH"
printf 'BRANCH=%s\n' "$BRANCH"
printf 'WORKTREE_PATH=%s\n' "$WTDIR"

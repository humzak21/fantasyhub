#!/usr/bin/env bash
#
# Merge driver for package-lock.json.
#
# The lockfile is generated, not written, and git does not know that: it merges
# it line by line like prose. Two branches that both touched dependencies
# therefore conflict textually even when they do not disagree about anything —
# which is why a 150-file PR can merge clean everywhere except here.
#
# Hand-merging is also the wrong repair. A lockfile is a resolved dependency
# graph; stitching two of them together line by line can produce a tree npm
# would never generate, and the result installs fine right up until it doesn't.
#
# The correct resolution is always the same: settle package.json, which is
# small and human-authored and where the actual disagreement lives, then
# regenerate the lock from it. That is all this does.
#
# Git calls this with %O %A %B — ancestor, ours, theirs. The result must be
# written to the "ours" path.
set -uo pipefail

OURS="${2:-}"
[ -n "$OURS" ] || exit 1

# package.json first. If it is still conflicted, the intent has not been
# decided yet and no generated lockfile can be correct — fall through to a
# normal conflict and let a person choose.
if grep -qE '^(<<<<<<< |>>>>>>> )' package.json 2>/dev/null; then
  echo "package-lock.json: package.json is still conflicted." >&2
  echo "  Resolve package.json, then: npm install --package-lock-only && git add package-lock.json" >&2
  exit 1
fi

cp "$OURS" package-lock.json 2>/dev/null || true

if npm install --package-lock-only --no-audit --no-fund >/dev/null 2>&1; then
  cp package-lock.json "$OURS"
  echo "package-lock.json: regenerated from the merged package.json." >&2
  exit 0
fi

# Regeneration needs the registry. Offline, or on a genuinely broken
# package.json, leave a normal conflict rather than inventing a lockfile.
echo "package-lock.json: could not regenerate (offline?). Resolve manually:" >&2
echo "  npm install --package-lock-only && git add package-lock.json" >&2
exit 1

#!/usr/bin/env bash
#
# Registers the package-lock.json merge driver.
#
# `.gitattributes` names the driver, but the driver *itself* is defined in
# `.git/config`, which is not committed. Without this step the attribute points
# at nothing and git silently falls back to a line-by-line merge — the exact
# failure it is there to prevent, with no error to say so.
#
# Hooked to `prepare`, so it runs on `npm install` and nobody has to know it
# exists. It exits 0 unconditionally: a git config detail must never be the
# reason an install fails.
set -uo pipefail

# Not a git checkout — a tarball, a CI cache restore, an install as a
# dependency. Nothing to configure.
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

git config merge.npm-lockfile.name \
  "regenerate package-lock.json from the merged package.json" >/dev/null 2>&1 || exit 0
git config merge.npm-lockfile.driver \
  "scripts/git-merge-lockfile.sh %O %A %B" >/dev/null 2>&1 || exit 0

exit 0

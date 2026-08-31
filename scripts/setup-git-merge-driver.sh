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
#
# The `prepare` entry in package.json guards on this file *existing*, which is
# not paranoia. npm runs `prepare` in contexts where the repository is not
# present — most importantly a Docker build, which copies package*.json and
# runs `npm ci` before copying the source, precisely so the install layer
# caches. In that layer `scripts/` does not exist yet, and `sh: not found`
# exits 127 before anything in this file can decide otherwise.
set -uo pipefail

# Not a git checkout — a tarball, a CI cache restore, an install as a
# dependency. Nothing to configure.
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

git config merge.npm-lockfile.name \
  "regenerate package-lock.json from the merged package.json" >/dev/null 2>&1 || exit 0
git config merge.npm-lockfile.driver \
  "scripts/git-merge-lockfile.sh %O %A %B" >/dev/null 2>&1 || exit 0

exit 0

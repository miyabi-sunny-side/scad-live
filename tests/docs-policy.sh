#!/bin/sh
set -eu

fail() {
  printf '%s\n' "docs-policy: $1" >&2
  exit 1
}

test -f DESIGN.md || fail 'DESIGN.md must live at the repository root'
test ! -e docs/DESIGN.md || fail 'docs/DESIGN.md must be removed after migration'

grep -q '^consulted: Sumi + Kinari @ 2026-08-11$' DESIGN.md ||
  fail 'DESIGN.md must record its consulted templates without a private path'

for heading in Colors Typography 'Spacing and shape' Layout Components 'Implementation mapping' Verification; do
  grep -q "^## $heading$" DESIGN.md || fail "DESIGN.md is missing the $heading section"
done

grep -q '](DESIGN.md)' README.md ||
  fail 'README.md must link to the root design contract'

private_home='/''home/'
private_dotfiles='.dot''files/'
private_knowledge='arona-''knowledge'
private_broker='agent''-talk'
private_deliver='$''deliver'
private_release='$''bump-tag'

for forbidden in \
  "$private_home" \
  "$private_dotfiles" \
  "$private_knowledge" \
  "$private_broker" \
  "$private_deliver" \
  "$private_release"
do
  if git grep -n -I -F "$forbidden" -- . ':!client/vendor/**' ||
    grep -n -F "$forbidden" DESIGN.md
  then
    fail "repository content contains a private workflow reference: $forbidden"
  fi
done

printf '%s\n' 'docs-policy: ok'

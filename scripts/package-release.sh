#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo 'usage: package-release.sh <binary> <output-directory>' >&2
  exit 2
fi

binary=$1
output=$2
artifact=scad-live-linux-x86_64.tar.gz

test -f "$binary" && test -x "$binary" || {
  echo "package-release: binary is missing or not executable: $binary" >&2
  exit 1
}
test -s LICENSE || {
  echo 'package-release: LICENSE is missing or empty' >&2
  exit 1
}

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT INT TERM
mkdir -p "$output"
install -m 755 "$binary" "$stage/scad-live"
install -m 644 LICENSE "$stage/LICENSE"
cat client/vendor/LICENSE client/vendor/examples/jsm/libs/fflate-LICENSE > "$stage/THIRD_PARTY_LICENSES"
tar -czf "$output/$artifact" -C "$stage" scad-live LICENSE THIRD_PARTY_LICENSES
(cd "$output" && sha256sum "$artifact" > "$artifact.sha256")

printf '%s\n' "$output/$artifact" "$output/$artifact.sha256"

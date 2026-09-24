#!/bin/sh
set -eu

fail() {
  printf '%s\n' "release-contract: $1" >&2
  exit 1
}

workflow=.github/workflows/release.yml
packager=scripts/package-release.sh

test -f "$workflow" || fail 'release workflow is missing'
test -x "$packager" || fail 'release packager is missing or not executable'
test -f LICENSE || fail 'MIT license is missing from the release payload'
test -f rust-toolchain.toml || fail 'Rust release toolchain is not pinned'

grep -Fq "'v*.*.*'" "$workflow" || fail 'tag pushes do not trigger the workflow'
grep -Fq 'GITHUB_REF_NAME" =~ ^v[0-9]+' "$workflow" ||
  fail 'workflow does not reject non-SemVer tags'
# The workflow expression is intentionally matched as literal shell source.
# shellcheck disable=SC2016
grep -Fq 'test "v$version" = "$GITHUB_REF_NAME"' "$workflow" ||
  fail 'tag and Cargo package version are not compared'
grep -Fq 'contents: write' "$workflow" || fail 'release job cannot create a GitHub Release'
grep -Fq "github.event_name == 'push' && github.ref_type == 'tag'" "$workflow" ||
  fail 'manual dispatch can publish a GitHub Release'
grep -Fq 'scripts/package-release.sh' "$workflow" || fail 'workflow bypasses the tested packager'
grep -Fq 'SCAD_LIVE_BIN=' "$workflow" || fail 'packaged binary is not smoke-tested'
grep -Fq 'gh release create' "$workflow" || fail 'workflow does not publish a GitHub Release'
grep -Fq -- '--verify-tag' "$workflow" || fail 'release creation does not verify the pushed tag'
grep -Fq 'GH_REPO:' "$workflow" || fail 'release job cannot resolve the repository without checkout'

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT INT TERM
mkdir -p "$root/bin" "$root/out"
printf '%s\n' '#!/bin/sh' 'echo "scad-live 0.1.0"' > "$root/bin/scad-live"
chmod 755 "$root/bin/scad-live"

"$packager" "$root/bin/scad-live" "$root/out"
archive="$root/out/scad-live-linux-x86_64.tar.gz"
checksum="$archive.sha256"
test -s "$archive" || fail 'release archive was not created'
test -s "$checksum" || fail 'release checksum was not created'
(cd "$root/out" && sha256sum -c "$(basename "$checksum")") >/dev/null ||
  fail 'release checksum does not verify'

tar -tzf "$archive" | sort > "$root/members"
printf '%s\n' LICENSE THIRD_PARTY_LICENSES scad-live | sort > "$root/expected"
cmp -s "$root/expected" "$root/members" || fail 'release archive members changed'

mkdir "$root/unpacked"
tar -xzf "$archive" -C "$root/unpacked"
test -x "$root/unpacked/scad-live" || fail 'packaged binary is not executable'
test -s "$root/unpacked/LICENSE" || fail 'packaged license is empty'
cat client/vendor/LICENSE client/vendor/examples/jsm/libs/fflate-LICENSE > "$root/expected-licenses"
cmp "$root/expected-licenses" "$root/unpacked/THIRD_PARTY_LICENSES" || fail 'vendored licenses differ from package'

printf '%s\n' 'release-contract: ok'

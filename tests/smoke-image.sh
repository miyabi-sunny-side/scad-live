#!/bin/sh
# Run the image as the host user against a mounted base camp: the bundled
# OpenSCAD renders, a saved SCAD re-renders, and dist/ stays host-owned.
set -eu

image="${SCAD_LIVE_IMAGE:-scad-live:dev}"
port="${SCAD_LIVE_SMOKE_PORT:-18083}"
camp=$(mktemp -d)
container=''

cleanup() {
  status=$?
  if [ -n "$container" ]; then
    [ "$status" -eq 0 ] || docker logs "$container" 2>&1 | tail -20
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
  rm -rf "$camp"
}
trap cleanup EXIT INT TERM

wait_for() {
  attempt=0
  until eval "$1"; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 300 ]; then
      echo "image smoke: timed out waiting for: $1" >&2
      exit 1
    fi
    sleep 0.1
  done
}

mkdir -p "$camp/assets"
cp tests/fixtures/material-roles.scad "$camp/assets/"
container=$(docker run -d --user "$(id -u):$(id -g)" -v "$camp:/camp" \
  -p "127.0.0.1:$port:8080" "$image")

model="$camp/dist/material-roles.3mf"
wait_for 'test -s "$model"'
test "$(stat -c %u:%g "$model")" = "$(id -u):$(id -g)"
wait_for 'curl --fail --silent "http://127.0.0.1:$port/api/models" | grep -q material-roles.3mf'

before=$(sha256sum "$model")
sed -i 's/cube(\[10, 10, 2\])/cube([10, 10, 3])/' "$camp/assets/material-roles.scad"
wait_for 'test "$(sha256sum "$model")" != "$before"'
test "$(stat -c %u:%g "$model")" = "$(id -u):$(id -g)"

echo 'image smoke test passed'

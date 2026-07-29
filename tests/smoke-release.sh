#!/bin/sh
set -eu

port="${SCAD_LIVE_SMOKE_PORT:-18081}"
root=$(mktemp -d)
pid=''

cleanup() {
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$root"
}
trap cleanup EXIT INT TERM

mkdir -p "$root/run/dist"
cp target/release/scad-live "$root/scad-live"
cp tests/fixtures/dist/box.stl "$root/run/dist/box.stl"

(
  cd "$root/run"
  exec "$root/scad-live" serve --dist dist --bind 127.0.0.1 --port "$port"
) >"$root/server.log" 2>&1 &
pid=$!

base="http://127.0.0.1:$port"
attempt=0
while ! curl --fail --silent --dump-header "$root/index-headers" --output "$root/index.html" "$base/"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then
    cat "$root/server.log"
    exit 1
  fi
  sleep 0.1
done
grep -qi '^content-type: text/html' "$root/index-headers"
grep -qi '^cache-control: no-store' "$root/index-headers"

references=$(tr '"' '\n' <"$root/index.html" | sed -n '\#^/assets/#p')
test -n "$references"

for reference in $references; do
  name=${reference#/}
  curl --fail --silent --dump-header "$root/headers" --output "$root/response" "$base$reference"
  case "$reference" in
    *.js) expected='text/javascript' ;;
    *.css) expected='text/css' ;;
    *) expected='application/octet-stream' ;;
  esac
  grep -qi "^content-type: $expected" "$root/headers"
  grep -qi '^cache-control: no-store' "$root/headers"
  test "$(sha256sum "$root/response" | cut -d ' ' -f 1)" = "$(sha256sum "client/dist/$name" | cut -d ' ' -f 1)"
done

curl --fail --silent --dump-header "$root/headers" --output "$root/favicon.svg" "$base/favicon.svg"
grep -qi '^content-type: image/svg+xml' "$root/headers"
grep -qi '^cache-control: no-store' "$root/headers"
curl --fail --silent --output "$root/models.json" "$base/api/models"
grep -q '"box.stl"' "$root/models.json"

echo 'release smoke test passed'

# syntax=docker/dockerfile:1
# The image pins its own OpenSCAD so a host upgrade cannot change the output.

FROM node:24-trixie-slim AS frontend
WORKDIR /src
COPY package.json package-lock.json vite.config.js ./
RUN npm ci
COPY client client
RUN npm run build

FROM rust:1.96.0-trixie AS binary
WORKDIR /src
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY src src
COPY --from=frontend /src/client/dist client/dist
RUN cargo build --release --locked

# OpenSCAD snapshot with the Manifold backend. Upgrade by changing both values.
FROM debian:trixie-slim AS openscad
ADD --checksum=sha256:033762f4e0b0de7a2c6cf2b5a12febb29d60ba62ede227d57b1c8b675a94710a \
    https://files.openscad.org/snapshots/OpenSCAD-2026.09.23-x86_64.AppImage /openscad.AppImage
RUN chmod +x /openscad.AppImage \
    && cd /opt && /openscad.AppImage --appimage-extract >/dev/null \
    && mv squashfs-root openscad

FROM debian:trixie-slim
LABEL org.opencontainers.image.source=https://github.com/miyabi-sunny-side/scad-live
# System libraries the AppImage expects from its host, plus a font for text().
RUN apt-get update && apt-get install -y --no-install-recommends \
        fonts-liberation libcom-err2 libdrm2 libegl1 libexpat1 libfontconfig1 \
        libfreetype6 libgbm1 libgl1 libglx0 libgpg-error0 libharfbuzz0b \
        libopengl0 libwayland-client0 libx11-6 libx11-xcb1 libxcb1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=openscad /opt/openscad /opt/openscad
COPY --from=binary /src/target/release/scad-live /usr/local/bin/scad-live
COPY LICENSE /usr/share/licenses/scad-live/LICENSE
COPY client/vendor/LICENSE /usr/share/licenses/scad-live/three.js-LICENSE
COPY client/vendor/examples/jsm/libs/fflate-LICENSE /usr/share/licenses/scad-live/
RUN ln -s /opt/openscad/AppRun /usr/local/bin/openscad && openscad --version
# Any --user works: OpenSCAD only needs a writable HOME for its caches.
ENV HOME=/tmp
WORKDIR /camp
EXPOSE 8080
ENTRYPOINT ["scad-live"]
CMD ["/camp"]

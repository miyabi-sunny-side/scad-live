# 開発ガイド

ソースからのビルド、検証、リリースの手順をまとめます。利用者向けの導入は
[README](../README.md) を参照してください。

## 必要なもの

- Rust toolchain（Cargo を含む）。この crate は Rust 2024 edition を使用します。
- Node.js と npm。Svelte viewer の検査と production bundle の生成に使用します。
- `openscad` コマンド。watcher と smoke test が子プロセスとして起動します。
- E2E テストを実行する場合のみ Playwright の Chromium。

## ビルド

環境を確認し、依存 package の導入、frontend の検査と bundle 生成を済ませてから
release binary をビルドします。

```sh
rustc --version
node --version
npm --version
openscad --version
npm ci
npm run format:check
npm run check
npm run test:unit
npm run build
touch src/server.rs
cargo build --release
```

生成物は `target/release/scad-live` です。Vite は Svelte 5 runes で実装された
frontend とローカルの three.js を `client/dist/` に bundle し（埋め込み asset の
配信パスは `/static/`）、RustEmbed がその生成物を binary に埋め込みます。
`client/dist/` は生成物であり Git 管理対象ではありません。

frontend を変更したときは、必ず `npm run build` の後に Rust binary も再ビルド
してください。Cargo は `client/dist/` だけの変更では再コンパイルしないことが
あるため、`touch src/server.rs` で再ビルドを明示します。順序を逆にすると、
binary には変更前の bundle が残ります。

## frontend 開発

production と同じ bundle を Rust server で確認する手順を標準とします。

```sh
npm run format:check
npm run check
npm run test:unit
npm run build
touch src/server.rs
SCAD_LIVE_BIND=127.0.0.1 cargo run -- tests/fixtures
```

ブラウザで `http://127.0.0.1:8080` を開きます。frontend を変更するたびに server
を止め、上記の順に bundle と Rust binary を再ビルドしてください。この
リポジトリは Vite development server 用の npm script を提供していません。

## テスト

frontend の format、Svelte 5 runes、型、unit test、production build を検証します。

```sh
npm ci
npm run format:check
npm run check
npm run test:unit
npm run build
```

Rust の format、lint、unit/integration-level tests は、path mapping、設定の
解決、失敗時の既存 STL 保持、model API、埋め込み asset、配信 path の境界を
検証します。

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

Playwright E2E は viewer の初期表示、選択復元、空状態、SSE 更新、camera 保持を
Chromium で検証します。初回だけ browser を用意してください。E2E は
`npm run build` と Rust server の起動を自動で行い、test server を
`127.0.0.1:18080` で使用します。

```sh
npx playwright install chromium
npm run test:e2e
```

release binary に production bundle が正しく埋め込まれ、`/static/*`、favicon、
model API から配信されることは smoke test で確認します。

```sh
npm run build
touch src/server.rs
cargo build --release
sh tests/smoke-release.sh
```

文書の配置と release workflow の契約は専用テストで検証します。

```sh
npm run test:docs
npm run test:release
```

## リリース

公式配布物は、frontend を埋め込んだ static Linux x86_64 binary と MIT License
を含む `scad-live-linux-x86_64.tar.gz`、および同名の `.sha256` sidecar です。
scad-live は host の OpenSCAD command と project files を直接扱うため、
container image は公開しません。

`Cargo.toml` の version と一致する厳密な `vMAJOR.MINOR.PATCH` tag を push
すると、GitHub Actions が format、lint、test、production build、release smoke
test を実行し、成功時だけ GitHub Release を作成します。tag だけを先に作らず、
version 変更を含む verified commit を tag の対象にしてください。

```sh
git tag v0.2.0
git push origin v0.2.0
```

`workflow_dispatch` は release 相当 artifact の build 検証に使えますが、GitHub
Release は作成しません。配備先の service unit、更新、health check、rollback は
deployment consumer の責務で、この repository の workflow は artifact の公開
までを担当します。

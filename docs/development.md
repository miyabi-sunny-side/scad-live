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
frontend とローカルの three.js を `client/dist/` にまとめます。
RustEmbed がその生成物を binary に埋め込み、`/static/`から配信します。
`client/dist/` は生成物であり Git 管理対象ではありません。

release profile は次の設定を使います。
`opt-level = 3`、`lto = false`、`codegen-units = 16`、`strip = true`です。
サイズの最小化より Rust のビルド待ち時間を優先します。
OpenSCAD 自体のレンダリング設定は変更しません。CI では host 向けの lint/test
と、配布用の Linux musl 向け release build をそれぞれ実行します。

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
PORT=8080 cargo run -- tests/fixtures
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

Rustのテストは、パスの対応、設定の解決、失敗時の既存3MF保持を検証します。
モデルAPI、埋め込みアセット、配信パスの境界も対象です。

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

smoke testでは、release binaryにfrontendが埋め込まれることを確認します。
`/static/*`、favicon、モデルAPIの配信も確かめます。

```sh
npm run build
touch src/server.rs
cargo build --release
sh tests/smoke-release.sh
```

release workflow の契約は専用テストで検証します。文書は意味と参照の整合を確認します。

```sh
npm run test:release
```

## 材料付き3MFのfixture

`tests/fixtures/material-roles.scad`は隣接する立方体です。
primaryがX=0〜10、secondaryがX=10〜20 mmです。
両方ともY=0〜10・Z=0〜2 mmで、組立全体は20×10×2 mmです。
`tests/fixtures/material-roles.3mf`はscad-liveの生成処理とOpenSCAD 2021.01で
作成した出力です。OrcaServerの取込み確認にも使えます。

再生成する場合は、空の作業ディレクトリに`assets/`を作り、SCAD例をコピーして
scad-liveを起動します。`dist/material-roles.3mf`が完成したら停止してください。
生成物の数値IDや圧縮バイト列の一致は契約ではありません。

```sh
mkdir -p /tmp/material-example/assets
cp tests/fixtures/material-roles.scad /tmp/material-example/assets/
PORT=18082 cargo run -- /tmp/material-example
```

`cargo test --test material_roles`は実OpenSCADで単色と2材料を生成し、材料参照・
頂点座標・失敗時の既存ファイル保持を確かめます。ブラウザE2Eは、同じ表示色・
入替えたパレットと数値IDでも役割を識別し、実SCAD更新・失敗・削除とSSEを検証します。
[共通規約](https://github.com/miyabisun/3d-cad-data/blob/main/docs/multi-material.md)が
SCAD・scad-live・OrcaServer間の材料キーと座標系を定めています。

## リリース

公式配布物は`scad-live-linux-x86_64.tar.gz`と同名の`.sha256`ファイルです。
アーカイブにはfrontendを埋め込んだstatic Linux x86_64 binaryを収録します。
`LICENSE`には本体・Three.js・fflateのライセンス本文をまとめて同梱します。
`ghcr.io/miyabi-sunny-side/scad-live`へ、版と`latest`のタグでcontainer imageも公開します。
imageは`Dockerfile`がsourceからbuildし、OpenSCAD snapshotのAppImageを
sha256で固定して同梱します。OpenSCADを更新するときは、URLとchecksumを一緒に変えます。
`tests/smoke-image.sh`は、ホストのuserで起動したimageでの生成、SCAD保存後の再生成、
生成物の所有者を確かめます。

```sh
docker build -t scad-live:dev .
sh tests/smoke-image.sh
```

`Cargo.toml`のversionと一致する厳密な`vMAJOR.MINOR.PATCH`タグをpushします。
GitHub Actionsがformat、lint、test、production build、smoke testを実行します。
成功した場合だけGitHub Releaseを作成し、imageのsmoke testを通ったimageを公開します。tag だけを先に作らず、
version 変更を含む verified commit を tag の対象にしてください。

```sh
git tag v0.2.0
git push origin v0.2.0
```

`workflow_dispatch`は配布物のビルド検証に使えます。
この手動実行ではGitHub Releaseを作成しません。配備先でのサービス設定、更新、稼働確認、ロールバックは配備側で管理します。
このリポジトリは配布物の公開までを担当します。

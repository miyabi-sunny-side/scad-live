# scad-live

`scad-live` は、OpenSCAD のプロジェクトを監視して STL を `dist` に書き出し、その STL をブラウザで確認するための小さな CLI/Web サーバーです。ソースの保存からプレビューの更新までを自動化しますが、ブラウザ上でのモデリング、スライス、印刷設定は扱いません。

## 必要なもの

- Rust toolchain（Cargo を含む）。この crate は Rust 2024 edition を使用します。
- Node.js と npm。Svelte viewer の検査と production bundle の生成に使用します。
- `openscad` コマンド。`watch` が子プロセスとして起動するため、`PATH` から実行できる必要があります。
- WebGL を利用できるモダンブラウザ。
- E2E テストを実行する場合のみ Playwright の Chromium。

環境を確認し、依存 package の導入、frontend の検査と bundle 生成を済ませてから release binary をビルドします。

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

生成物は `target/release/scad-live` です。Vite は Svelte 5 runes で実装された frontend とローカルの three.js を `client/dist/` に bundle し、RustEmbed がその生成物を binary に埋め込みます。`client/dist/` は生成物であり Git 管理対象ではありません。実行時に Node.js、`client/dist/`、`assets/` を binary の隣へ配置する必要はありません。

frontend を変更したときは、必ず `npm run build` の後に Rust binary も再ビルドしてください。Cargo は `client/dist/` だけの変更では再コンパイルしないことがあるため、`touch src/server.rs` で再ビルドを明示します。順序を逆にすると、binary には変更前の bundle が残ります。

## Quickstart

既存の OpenSCAD ディレクトリへ触れずに試せる一時 fixture です。まず Terminal 1 で一時ディレクトリを作り、その出力されたパスを控えます。

```sh
DEMO_DIR="$(mktemp -d /tmp/scad-live-demo.XXXXXX)"
mkdir -p "$DEMO_DIR/src/projects" "$DEMO_DIR/src/modules" "$DEMO_DIR/dist"
printf '%s\n' 'cube([10, 20, 30]);' > "$DEMO_DIR/src/projects/box.scad"
printf 'demo directory: %s\n' "$DEMO_DIR"

./target/release/scad-live watch \
  --src "$DEMO_DIR/src/projects" \
  --modules "$DEMO_DIR/src/modules" \
  --dist "$DEMO_DIR/dist"
```

Terminal 2 では、`/tmp/scad-live-demo.XXXXXX` を Terminal 1 が表示した実際のパスへ置き換えます。

```sh
DEMO_DIR=/tmp/scad-live-demo.XXXXXX

./target/release/scad-live serve \
  --dist "$DEMO_DIR/dist" \
  --bind 127.0.0.1 \
  --port 8080
```

ブラウザで `http://127.0.0.1:8080` を開きます。`box.scad` の寸法を変更して保存すると、対応する `dist/box.stl` が再生成され、表示中のモデルと寸法が更新されます。終了時は両方のプロセスを `Ctrl-C` で止めます。一時 fixture が不要になったら、Terminal 1 が表示したディレクトリだけを削除してください。

## ディレクトリ構成

オプションを省略した場合、コマンドを実行したディレクトリを基準に次の構成を使います。

```text
src/
├── projects/  # STL に変換する .scad
└── modules/   # 変更時に全 project を再変換する共有 .scad
dist/          # 生成した .stl
```

`src/projects/chassis/front.scad` は `dist/chassis/front.stl` へ対応します。`src/modules` は変更検知の対象ですが、OpenSCAD の include path を自動設定するものではありません。プロジェクトから共有 module を参照する方法は、OpenSCAD 側の相対パスまたは利用環境の設定に合わせてください。

自宅の既存ディレクトリを使う場合は、既定 layout に移動してオプションなしで実行するか、上の Quickstart と同様に `--src`、`--modules`、`--dist` へ明示的なパスを渡します。

## CLI

```text
scad-live <COMMAND>

Commands:
  watch  Watch OpenSCAD sources and render projects into dist
  serve  Serve the viewer and STL files
  help   Print this message or the help of the given subcommand(s)

Options:
  -h, --help  Print help
```

### `watch`

```text
scad-live watch [OPTIONS]

Options:
      --src <SRC>          [default: src/projects]
      --modules <MODULES>  [default: src/modules]
      --dist <DIST>        [default: dist]
  -h, --help               Print help
```

監視対象と出力先がなければ起動時に作成します。挙動は次のとおりです。

- 起動時に `--src` 以下の `.scad` を再帰的に列挙し、それぞれ対応する `.stl` を生成します。
- `--src` 以下の `.scad` の作成・保存は、対応する STL だけを再生成します。短時間の連続イベントは 350 ms 単位でまとめられます。
- `--modules` 以下の `.scad` に変更があると、全 project を再生成します。
- project の `.scad` を削除すると、対応する STL も削除します。空になった出力ディレクトリは削除しません。
- 1 回の OpenSCAD 実行が 120 秒を超えるとその処理を停止し、エラーを端末へ出して監視を継続します。
- 変換結果は一時ファイルへ書き、OpenSCAD が成功した後に出力先へ移します。起動失敗、変換エラー、timeout の場合、同じ出力先に以前の STL があれば保持されます。
- `.scad` 以外の変更は変換対象になりません。起動時に source が存在しないことだけを理由に、`dist` 内の既存 STL を整理することもありません。

### `serve`

```text
scad-live serve [OPTIONS]

Options:
      --dist <DIST>  [default: dist]
      --bind <BIND>  [default: 0.0.0.0]
      --port <PORT>  [default: 8080]
  -h, --help         Print help
```

`--dist` がなければ作成し、再帰的に監視します。既定の `--bind 0.0.0.0` はマシンの全 IPv4 interface で待ち受けるため、同じ LAN など到達可能な端末からアクセスできます。このサーバーは認証や TLS を提供しません。手元のブラウザだけで使う場合は `--bind 127.0.0.1` を指定し、信頼できないネットワークへ直接公開しないでください。

公開する GET endpoint は次のとおりです。すべてのレスポンスに `Cache-Control: no-store` を設定します。

| Endpoint | 内容 |
| --- | --- |
| `/` | Vite が生成した viewer の `index.html` |
| `/assets/{path}` | Vite が生成し、binary に埋め込まれた JavaScript と CSS |
| `/favicon.svg` | binary に埋め込まれた favicon |
| `/api/models` | `dist` 以下の表示可能な STL 相対パスをソートした JSON 配列 |
| `/models/{path}` | 指定した STL。成功時の Content-Type は `model/stl` |
| `/events` | STL の追加・変更・削除を通知する Server-Sent Events stream |

隠しディレクトリ内の STL は一覧・イベントから除外されます。STL 以外、`dist` の外へ解決される path、隠し path はモデルとして配信しません。

## Viewer

- Model selector で `dist` 内の STL を 1 個選択します。最後の選択はブラウザの local storage に保存され、次回もその path が存在すれば復元されます。
- ドラッグで orbit、pinch で zoom、2 本指ドラッグで pan します。Z 軸を上として表示します。
- 選択時はモデル全体が収まるよう camera を合わせ、軸平行 bounding box の `X × Y × Z mm` を小数 1 桁で表示します。
- 選択中の STL が更新されると、camera の位置・注視点・zoom を保ったまま mesh と寸法を更新します。STL の追加・削除は selector に反映されます。
- STL がない場合、selector は無効になり、空状態を表示します。接続断、読み込み中、更新、読み込み失敗も inspector の State に表示します。
- UI は OS/browser の light/dark preference に追従します。

## Frontend 開発

production と同じ bundle を Rust server で確認する手順を標準とします。

```sh
npm run format:check
npm run check
npm run test:unit
npm run build
touch src/server.rs
cargo run -- serve --dist tests/fixtures/dist --bind 127.0.0.1 --port 8080
```

ブラウザで `http://127.0.0.1:8080` を開きます。frontend を変更するたびに server を止め、上記の順に bundle と Rust binary を再ビルドしてください。このリポジトリは Vite development server 用の npm script を提供していません。

## テスト

Frontend の format、Svelte 5 runes、型、unit test、production build を検証します。

```sh
npm ci
npm run format:check
npm run check
npm run test:unit
npm run build
```

Rust の format、lint、unit/integration-level tests は、path mapping、失敗時の既存 STL 保持、model API、埋め込み asset、配信 path の境界を検証します。

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

Playwright E2E は viewer の初期表示、選択復元、空状態、SSE 更新、camera 保持を Chromium で検証します。初回だけ browser を用意してください。E2E は `npm run build` と Rust server の起動を自動で行い、test server を `127.0.0.1:18080` で使用します。

```sh
npx playwright install chromium
npm run test:e2e
```

release binary に production bundle が正しく埋め込まれ、`/assets/*`、favicon、model API から配信されることは smoke test で確認します。

```sh
npm run build
touch src/server.rs
cargo build --release
sh tests/smoke-release.sh
```

## Third-party assets

viewer は three.js 0.185.1（revision 185）の必要な build、`OrbitControls`、`STLLoader` を `client/vendor/` に vendoring しています。Vite がこれらを production bundle に含めるため、実行時に `/vendor` endpoint、import map、CDN は使用しません。three.js の MIT License は [`client/vendor/LICENSE`](client/vendor/LICENSE) に収録しています。

UI の設計方針と不変条件は [`docs/DESIGN.md`](docs/DESIGN.md) を参照してください。

# scad-live

`scad-live` は、OpenSCAD のプロジェクトを監視して STL を `dist` に書き出し、その STL をブラウザで確認するための小さな CLI/Web サーバーです。ソースの保存からプレビューの更新までを自動化しますが、ブラウザ上でのモデリング、スライス、印刷設定は扱いません。

## 必要なもの

- Rust toolchain（Cargo を含む）。この crate は Rust 2024 edition を使用します。
- `openscad` コマンド。`watch` が子プロセスとして起動するため、`PATH` から実行できる必要があります。
- WebGL を利用できるモダンブラウザ。
- E2E テストを実行する場合のみ Node.js/npm と Playwright の Chromium。

環境を確認して release binary をビルドします。

```sh
rustc --version
openscad --version
cargo build --release
```

生成物は `target/release/scad-live` です。HTML、CSS、JavaScript、three.js はこの binary に埋め込まれるため、実行時に `assets/` を隣へ配置する必要はありません。Web asset を変更した場合は binary を再ビルドしてください。

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
| `/` | viewer の HTML |
| `/app.js`, `/app.css`, `/favicon.svg` | 埋め込み UI asset |
| `/vendor/{path}` | 埋め込まれた three.js module |
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

## テスト

Rust の unit/integration-level tests は、path mapping、失敗時の既存 STL 保持、model API、asset、配信 path の境界を検証します。

```sh
cargo test --all-targets
```

Playwright E2E は viewer の初期表示、選択復元、空状態、SSE 更新、camera 保持を Chromium で検証します。初回だけ依存 package と browser を用意してください。

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

E2E は test server を `127.0.0.1:18080` で一時的に起動します。

## Third-party assets

viewer は three.js 0.185.1（revision 185）の必要な build、`OrbitControls`、`STLLoader` を `assets/vendor/` に vendoring しています。これらは release binary に埋め込まれ、実行時に CDN へ接続しません。three.js の MIT License は [`assets/vendor/LICENSE`](assets/vendor/LICENSE) に収録しています。

UI の設計方針と不変条件は [`docs/DESIGN.md`](docs/DESIGN.md) を参照してください。

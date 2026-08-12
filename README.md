# scad-live

`scad-live` は、OpenSCAD のプロジェクトを監視して STL を書き出し、その STL をブラウザで確認するための小さな CLI です。1 つの実行で watcher と viewer サーバーの両方が動きます。ブラウザ上でのモデリング、スライス、印刷設定は扱いません。

## Quickstart

必要なものは `openscad` コマンド（`PATH` から実行できること）と、WebGL が使えるモダンブラウザだけです。

1. [Releases](../../releases) から `scad-live-linux-x86_64.tar.gz` をダウンロードして展開します。
2. OpenSCAD プロジェクトのディレクトリ（ベースキャンプ）で実行します。

```sh
tar -xzf scad-live-linux-x86_64.tar.gz
cd /path/to/your/cad
scad-live
```

3. ブラウザで `http://127.0.0.1:8080` を開きます。`assets/` の `.scad` を保存するたびに `dist/` の STL が再生成され、表示中のモデルが自動更新されます。

## ベースキャンプ

`scad-live [ディレクトリ]` は指定したディレクトリ（省略時はカレントディレクトリ）をベースキャンプとして、配下の決め打ちの 3 ディレクトリを使います。無ければ起動時に作られます。

```text
assets/    # STL に変換する .scad（サブディレクトリ可）
modules/   # 変更時に全プロジェクトを再変換する共有 .scad
dist/      # 生成した .stl（assets/ と同じ階層構造）
```

`assets/chassis/front.scad` は `dist/chassis/front.stl` へ対応します。`openscad` が `PATH` に無い場合は起動せず exit 1 を返します。

## 設定

ディレクトリを個別に変えたい場合だけ、YAML を `--config` で渡します（例: [`docs/examples/config.yaml`](docs/examples/config.yaml)）。書いたキーだけが上書きされます。

```sh
scad-live --config /path/to/config.yaml
```

ポートと listen アドレスは環境変数で指定します。`.env` ファイルの読み込み機能はありません（必要なら dotenvx などを併用してください）。

| 環境変数 | 既定値 | 内容 |
| --- | --- | --- |
| `SCAD_LIVE_PORT` | `8080` | viewer のポート番号 |
| `SCAD_LIVE_BIND` | `0.0.0.0` | listen アドレス（`127.0.0.1` または `0.0.0.0`） |

既定では同じ LAN の端末から `http://<ホストのIP>:8080` で閲覧できます。認証や TLS はないため、信頼できるネットワークの外へ公開しないでください。

## Viewer

- Model selector で `dist/` 内の STL を 1 個選択します。最後の選択はブラウザの local storage に保存され、次回もその path が存在すれば復元されます。
- ドラッグで orbit、pinch で zoom、2 本指ドラッグで pan します。Z 軸を上として表示します。
- 選択時はモデル全体が収まるよう camera を合わせ、軸平行 bounding box の `X × Y × Z mm` を小数 1 桁で表示します。
- 選択中の STL が更新されると、camera の位置・注視点・zoom を保ったまま mesh と寸法を更新します。STL の追加・削除は selector に反映されます。
- STL がない場合、selector は無効になり、空状態を表示します。接続断、読み込み中、更新、読み込み失敗も inspector の State に表示します。
- UI は OS/browser の light/dark preference に追従します。

## 開発

ソースからのビルド、テスト、リリース手順は [`docs/development.md`](docs/development.md) を参照してください。UI の設計方針と不変条件は [`DESIGN.md`](DESIGN.md) にあります。

viewer は three.js 0.185.1 の必要な build を `client/vendor/` に vendoring しています（MIT License、[`client/vendor/LICENSE`](client/vendor/LICENSE) に収録）。実行時に CDN へはアクセスしません。

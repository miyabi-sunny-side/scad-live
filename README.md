# scad-live

`scad-live` は、OpenSCAD のプロジェクトを監視して STL を書き出し、その STL をブラウザで確認するための小さな CLI です。1 つの実行で watcher と viewer サーバーの両方が動きます。ブラウザ上でのモデリング、スライス、印刷設定は扱いません。

## Quickstart

必要なものは `openscad` コマンド（`PATH` から実行できること）と、WebGL が使えるモダンブラウザだけです。

1. [Releases](../../releases) から `scad-live-linux-x86_64.tar.gz` をダウンロードし、展開した `scad-live` を PATH の通った場所へ置きます。
2. OpenSCAD プロジェクトのディレクトリ（ベースキャンプ）で実行します。

```sh
tar -xzf scad-live-linux-x86_64.tar.gz
install -m 755 scad-live ~/.local/bin/scad-live  # ~/.local/bin が PATH にある前提
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

ディレクトリを個別に変えたい場合だけ、YAML を `--config` で渡します（例: [`docs/examples/config.yaml`](docs/examples/config.yaml)）。書いたキーだけが上書きされ、相対パスはベースキャンプ基準で解決されます。

```sh
scad-live --config /path/to/config.yaml
```

## 環境変数

この一覧は main のソースが読む契約です。アプリ設定は起動時に読み込みます。
`.env` ファイルを自動で読み込む機能はありません。

| 変数 | 必須 / 任意 | 未設定時の既定値 | 用途・不正値の扱い |
| --- | --- | --- | --- |
| `PORT` | 任意 | `8080` | viewer のポート。`1`〜`65535` の ASCII 数字のみ。空文字、符号、空白、範囲外、Unicode として読めない値はエラーで起動を停止する。 |

```sh
PORT=5003 scad-live /path/to/your/cad
```

待受アドレスは `0.0.0.0` 固定です。旧 `SCAD_LIVE_PORT` のポート番号は `PORT` へ移し、
旧 `SCAD_LIVE_BIND` は廃止します。どちらの旧変数も現在のアプリは参照しません。
ログ用のアプリ環境変数はありません。読み取り元は [`src/main.rs`](src/main.rs) です。

OS / 外部 CLI の実行環境として、`PATH` から `openscad` を実行できる必要があります。
アプリが `PATH` を設定する既定値はなく、呼び出し元の環境を使います。
`openscad --version` を起動できなければ exit 1 で停止します。
ベースキャンプは位置引数、個別ディレクトリは `--config` の YAML で指定します。
CI の `SCAD_LIVE_BIN` / `SCAD_LIVE_SMOKE_PORT` はテスト用で、アプリ設定ではありません。

同じ LAN の端末からは `http://<ホストのIP>:<PORT>` で閲覧できます。
認証や TLS はないため、到達範囲は Tailscale やプロキシなど配布側で管理します。

### home-server での指定と移行

home-server の systemd 配布では `~/.config/scad-live/.env` が設定の保存元です。
既存の運用ポートを維持する `PORT=5003` と、ベースキャンプの絶対パスを持つ
`BASE_DIR` を用意します。`BASE_DIR` は systemd の `ExecStart` が位置引数へ展開する値で、
scad-live 自身が読む環境変数ではありません。

PORT 対応の新 release を公開する前に、home 側の設定と unit / updater の反映を確認する必要があります。
main の変更だけでは、公開済みの旧 artifact や実機の設定は移行されません。
旧 binary / unit へ戻せる間の旧キー保持と切替順序は
[home-server の配布手順](https://github.com/miyabisun/home-server/blob/main/systemd/README.md#共通-port-への移行)
を参照してください。

## Viewer

- Model ボタンで `dist/` 内の STL を 1 個選択します。選択は URL のパス（`/` が `dist/` の根、`/nested/part.stl` が `dist/nested/part.stl`）に載るので、リロードしても選び直しません。ピッカーは左でディレクトリを絞り、右でその配下のファイルをファジー検索します。
- Grid スライダーで地面グリッドの 1 マス幅（既定 1 mm）を切り替えます。
- ドラッグで orbit、pinch で zoom、2 本指ドラッグで pan します。Z 軸を上として表示します。
- 選択時はモデル全体が収まるよう camera を合わせ、軸平行 bounding box の `X × Y × Z mm` を小数 1 桁で表示します。
- 選択中の STL が更新されると、camera の位置・注視点・zoom を保ったまま mesh と寸法を更新します。STL の追加・削除は一覧に反映されます。
- 選択中の STL が消えても選択と URL はそのままです。State に `Missing: <パス>` と出しつつ直前の mesh と寸法を残し、同じパスのファイルが戻ってきたら camera を保ったまま読み直します。`dist/` を丸ごと消して作り直すビルドでも、見ていたモデルを見失いません。
- STL がない場合、Model ボタンは無効になり、空状態を表示します。接続断、読み込み中、更新、読み込み失敗も inspector の State に表示します。
- UI は OS/browser の light/dark preference に追従します。

## 開発

ソースからのビルド、テスト、リリース手順は [`docs/development.md`](docs/development.md) を参照してください。UI の設計方針と不変条件は [`DESIGN.md`](DESIGN.md) にあります。

viewer は three.js 0.185.1 の必要な build を `client/vendor/` に vendoring しています（MIT License、[`client/vendor/LICENSE`](client/vendor/LICENSE) に収録）。実行時に CDN へはアクセスしません。

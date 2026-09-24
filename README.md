# scad-live

`scad-live` は、OpenSCAD のプロジェクトを監視して 3MF を書き出し、その 3MF をブラウザで確認するための小さな CLI です。1 つの実行で watcher と viewer サーバーの両方が動きます。ブラウザ上でのモデリング、スライス、印刷設定は扱いません。

## Quickstart

必要なものは `openscad` コマンド（`PATH` から実行できること）と、WebGL が使えるモダンブラウザだけです。

1. [Releases](https://github.com/miyabi-sunny-side/scad-live/releases/latest) から `scad-live-linux-x86_64.tar.gz` をダウンロードし、展開した `scad-live` を PATH の通った場所へ置きます。
2. OpenSCAD プロジェクトのディレクトリ（ベースキャンプ）で実行します。

```sh
tar -xzf scad-live-linux-x86_64.tar.gz
mkdir -p ~/.local/bin
install -m 755 scad-live ~/.local/bin/scad-live  # ~/.local/bin が PATH にある前提
cd /path/to/your/cad
scad-live
```

3. ブラウザで `http://127.0.0.1:8080` を開きます。`assets/` の `.scad` を保存するたびに `dist/` の 3MF が再生成され、表示中のモデルが自動更新されます。

## ベースキャンプ

`scad-live [ディレクトリ]` は指定したディレクトリ（省略時はカレントディレクトリ）をベースキャンプとして、配下の決め打ちの 3 ディレクトリを使います。無ければ起動時に作られます。

```text
assets/    # 3MF に変換する .scad（サブディレクトリ可）
modules/   # 変更時に全プロジェクトを再変換する共有 .scad
dist/      # 生成した .3mf（assets/ と同じ階層構造）
```

`assets/chassis/front.scad` は `dist/chassis/front.3mf` へ対応します。`openscad` が `PATH` に無い場合は起動せず exit 1 を返します。

## 材料を分ける

宣言のないSCADは全体を`primary`として出力します。2材料に分ける場合は
[`primary`・`secondary`の共通規約](https://github.com/miyabisun/3d-cad-data/blob/main/docs/multi-material.md)
に沿って、役割ごとの形状を同じ座標系で生成してください。
[隣接する立方体のSCAD例](tests/fixtures/material-roles.scad)と
[生成済み3MF](tests/fixtures/material-roles.3mf)を利用できます。
OpenSCAD 2021.01で動作し、nightlyの色付き出力は必要ありません。

プレビューは役割名と色見本を表示します。表示色は材料の識別子ではなく、
実際のフィラメントはOrcaServerのプレートで割り当てます。
宣言の不正・重複、空形状、役割ごとの生成失敗では、直前の正常な3MFを残し、
エラーを端末へ出力します。1回のOpenSCAD実行は120秒、各役割の圧縮3MFと
モデルXMLはそれぞれ64 MiB、宣言とログはそれぞれ1 MiBを上限とします。

### STL版からの移行

3MF出力はscad-live v0.2.8以降で利用できます。OrcaServerと組み合わせる場合は、
先に[OrcaServer v0.1.50以降](https://github.com/miyabi-sunny-side/orca-server/releases)へ更新してください。
それ以前のOrcaServerは、この材料規約に対応していません。

起動時に`assets/`を再生成します。以前の`dist/*.stl`は削除しませんが、一覧と
ダウンロードには出しません。既存のブラウザURL`/nested/part.stl`は
`/nested/part.3mf`へ置き換わります。モデル選択の履歴は増やしません。
HTTPで直接取得するクライアントは`/models/<path>.3mf`と`model/3mf`へ更新してください。
OrcaServerは旧プレートの`<path>.stl`参照を同名の3MFへ解決するため、
モデル名・数量・印刷条件を作り直す必要はありません。

## 設定

ディレクトリを個別に変えたい場合だけ、YAML を `--config` で渡します（例: [`docs/examples/config.yaml`](docs/examples/config.yaml)）。書いたキーだけが上書きされ、相対パスはベースキャンプ基準で解決されます。

```sh
scad-live --config /path/to/config.yaml
```

## 環境変数

アプリ設定は起動時に読み込みます。
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

同じ LAN の端末からは `http://<ホストのIP>:<PORT>` で閲覧できます。
認証や TLS はないため、到達範囲は Tailscale やプロキシなど配布側で管理します。

### 旧設定からの移行

サービスマネージャーを使う場合は、起動するプロセスへ`PORT`を渡してください。
旧`SCAD_LIVE_PORT`の値を`PORT`へ移すと、使用中のポート番号を維持できます。
ベースキャンプは位置引数で指定します。`BASE_DIR`という環境変数を設定しても、
アプリ自身は読み込みません。

更新前に、現在の実行ファイルとサービス設定を退避します。
更新後は設定したポートとベースキャンプで動作することを確認してください。
以前の版へ戻す場合は、その版が使用する設定も一緒に戻します。
待受アドレスは`0.0.0.0`固定のため、旧`SCAD_LIVE_BIND`で限定していた
到達範囲はサービスの配備先で管理してください。

## Viewer

- Model ボタンで `dist/` 内の 3MF を 1 個選択します。選択は URL のパス（`/` が `dist/` の根、`/nested/part.3mf` が `dist/nested/part.3mf`）に載るので、リロードしても選び直しません。ピッカーは左でディレクトリを絞り、右でその配下のファイルをファジー検索します。
- Grid スライダーで地面グリッドの 1 マス幅（既定 1 mm）を切り替えます。
- ドラッグで orbit、pinch で zoom、2 本指ドラッグで pan します。Z 軸を上として表示します。
- 選択時はモデル全体が収まるよう camera を合わせ、軸平行 bounding box の `X × Y × Z mm` を小数 1 桁で表示します。
- 選択中の 3MF が更新されると、camera の位置・注視点・zoom を保ったまま mesh と寸法を更新します。3MF の追加・削除は一覧に反映されます。
- 選択中の 3MF が消えても選択と URL はそのままです。State に `Missing: <パス>` と出しつつ直前の mesh と寸法を残し、同じパスのファイルが戻ってきたら camera を保ったまま読み直します。`dist/` を丸ごと消して作り直すビルドでも、見ていたモデルを見失いません。
- 3MF がない場合、Model ボタンは無効になり、空状態を表示します。接続断、読み込み中、更新、読み込み失敗も inspector の State に表示します。
- UI は OS/browser の light/dark preference に追従します。

## 開発

ソースからのビルド、テスト、リリース手順は [`docs/development.md`](docs/development.md) を参照してください。UI の設計方針と不変条件は [`DESIGN.md`](DESIGN.md) にあります。

viewer は three.js 0.185.1 の必要な build を `client/vendor/` に vendoring しています（MIT License、[`client/vendor/LICENSE`](client/vendor/LICENSE) に収録）。3MFLoaderは同じr185系列の標準ローダーで、ZIP読込みに[fflate 0.8.2](client/vendor/examples/jsm/libs/fflate-LICENSE)を使います。配布物にも両ライセンスを同梱します。実行時に CDN へはアクセスしません。

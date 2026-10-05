# 構造によるLLMO改善（2026-10-05）

## 変更

画面の説明文、デザイン、操作は変更せず、公開済みの対戦統計を機械が参照できる構造を追加した。

- WebSite・WebApplication・運営主体・ゲーム・キャラ・モード・マップに共通の `@id` を付与。各ページの BreadcrumbList / ItemList と関連エンティティを結び付ける。
- 統計に `Dataset` を追加。全体とガチバトル（エリート以上）を分離し、更新日時、分析対象期間、取得元の性質、測定項目・単位、JSONダウンロードURLを記述する。
- キャラの Dataset から、表示しているモード成績とおすすめマップを参照する。マップの Dataset は対応するモードも参照する。
- `/data/index.json` はページ・エンティティ・データセットIDの一覧、`/data/catalog.jsonld` は JSON-LD の DataCatalog とする。
- `/data/brawlers/{slug}.json`、`/data/modes/{slug}.json`、`/data/maps/{slug}.json` を追加。各一覧にも `/data/{category}/index.json` を追加。
- HTMLの `alternate` と `describedby` で機械用データの所在を明示する。サイト全体のheadからカタログを発見できる。

## データの意味と整合性

JSONは画面を生成した公開payloadから明示的に投影する。別のAPI問い合わせで数値を取得し直さない。ブラウザー表示と同じ丸め桁を用い、集計件数の単位はユニーク試合数ではなく `player_battle_records`（プレイヤーごとの対戦件数）とする。記録されたプレイヤーの戦績であり、全プレイヤーの全試合を網羅したデータとは記述しない。

サンプル不足の順位・Tierはnull、該当詳細のJSONはHTMLと同様にnoindexとする。実測できていないガジェット・スターパワーのおすすめ、非公開のプレイヤータグや生ログは出力しない。専用ページが存在しないモードのおすすめマップに、架空の公開URLを付与しない。

Workerでは既存HTMLの5分キャッシュ・最大1日のstale期間・ビルドスナップショット・バックグラウンド更新を共用する。HTML読み取りは2MBに制限する。未登録URLは404、未取得かつAPI停止時は503、GET/HEAD以外は405。新キャラのデータURLも既存の動的ページ生成に従って増える。モード・マップの一覧カタログはビルド時の一覧を引き継ぐため、新マップの詳細URLが解決できても一覧の追加は再ビルド時となる。

## 検証

`npm run test:llm-data` でHTML/JSONの値・ID・時刻の一致、区分と単位、関連エンティティ、全モード・マップのDataset、コールド応答、連続・並列読み取り、バックグラウンド更新、staleフォールバック、新キャラ、サンプル不足、404/503/HEAD/405を確認。既存のキャラ・条件ページの回帰テスト、本番ビルド、対象ファイルのlintも実施。

最終ビルドでサイトマップの生成がタイムアウトしたため、Route Handlerがキャラごとに集計ファイルを読み直す処理を、1回の読み込みから各URLを組み立てる処理へ変更した。生成するURLとサンプル不足の除外条件は維持する。生成後のHTMLとJSONのデータセットID・更新日時・配布URL、カタログの件数、サイトマップのURL集合も照合する。

最終生成物の照合結果は189ページ（詳細186・一覧3）、328データセット、カタログ186エンティティ、サイトマップ193 URLで一致。本番ビルドは修正後に成功した。

ブラウザー側のキャラ・モード・マップ共通runtimeのファイルハッシュは変更前と同じ `8a142a7cecdcf4d1`。追加コードはサーバー側に限定する。

## 根拠と公開状態

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — AI検索向けの専用ファイルや特別なschemaは必須ではない。クロール可能な公開情報と、表示内容に一致した構造化データを整備する。
- [Google: Dataset structured data](https://developers.google.com/search/docs/appearance/structured-data/dataset) / [Schema.org Dataset](https://schema.org/Dataset) — データセットの出典・測定項目・配布URLを記述する。
- [Schema.org DataCatalog](https://schema.org/DataCatalog) / [DataDownload](https://schema.org/DataDownload) — データの発見と取得経路を結び付ける。

構造の追加によってAIによる引用や検索順位を保証するものではない。前回の構造SEOのコミット `e69d7d3` と今回の変更は公開承認待ち。mainへのpushが本番デプロイを開始するため、自動承認レビューで明示的な許可が要求された。許可を得るまではローカルで保持する。

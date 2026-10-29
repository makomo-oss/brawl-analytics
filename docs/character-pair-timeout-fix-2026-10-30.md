# キャラ相性SQLのタイムアウト対策

対象: `/meta/characters/{id}` と `/meta/brawler-pages/{id}` が利用する `character_pair_stats`。

## 原因と変更

- 本番の旧SQLは Colt の通常対戦で 12.113 秒を記録した。対象履歴43,909行、ヒープ10,324ページを読み、一時ファイルを2,016ブロック書き込んでいた。別の暖まった実行は3.226秒で、I/Oや競合により所要時間が大きく変わる。
- SQL関数内だけ `work_mem=16MB` を設定し、中間結果と重複排除のディスク退避を減らした。全体設定や8秒のAPIタイムアウトは変更していない。
- 通常対戦では不要なランク対象プレイヤーの読み取りをスキップする。キャラのインデックス条件には正規化した引数を直接渡し、履歴の中間結果は明示的に一度だけ作る。
- キャッシュにない相性RPCをPythonプロセスあたり最大2件に制限する。同じキーのリクエスト共有とキャッシュヒットは従来どおりで、ヒットは空き枠を待たない。失敗時も枠を解放する。

試合識別、勝敗、逆方向の相性、60日窓、数値型の減衰計算、重複排除、現在のランク条件とレスポンス形式は維持する。匿名アクセスは許可せず、SECURITY INVOKERとservice_roleのみの実行権限を維持する。

## 検証

- バックエンド144件成功。変更前から失敗していたクローラーの1件は従来どおり除外。
- 合成データ135条件で旧SQLと新SQLのJSON結果が完全一致。別観測者の重複、勝敗、キャラ表記、ランク各層、不正ランク、対象外モード、60日外、モード・マップ絞り込みを含む。
- 同じ本番スナップショットで Colt/global、Wendy/gachi、Colt/gachi/masters/brawlBallの3条件が完全一致。
- 本番データの変更後EXPLAIN: Colt/global 1.686秒、Colt/gachi 1.094秒、どちらも一時ファイル書き込み0。キャッシュ状態が異なるため、この比率を常時の改善率とは扱わない。
- 8種類の同時リクエストでもDB実行が最大2件になること、待機中でもキャッシュを返すこと、失敗後に再取得できることをテスト。
- Supabase security advisorsに新しい指摘なし。

SQL比較の再実行:

```powershell
backend/.venv/Scripts/python.exe backend/scripts/verify_character_pair_sql.py
backend/.venv/Scripts/python.exe backend/scripts/verify_character_pair_sql.py --live --character colt --cohort global
```

出力はSELECTのみのSQL。Supabase SQL実行で `mismatches=0` を確認する。SQLの考え方は[Supabase Query Optimization](https://supabase.com/docs/guides/database/query-optimization)と[PostgreSQL CTE Materialization](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION)を参照。

同時実行数はプロセス単位なので、将来ワーカーやインスタンスを増やす際はDB容量に合わせて見直す必要がある。初回に重なったリクエストは枠を待つため、待ち時間を含めた本番APIの確認も行う。

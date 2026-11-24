# STARR ARENA UI（NEO-STARR HYBRID）

採用デザインは **NEO-STARR HYBRID**（STARR ARENA の構造・遊び心ある対面ステージ・実戦ドラフト体験に、`#090E1D` ミッドナイトネイビー・`#FFCE00` チャンピオンシップイエロー・ガラス質感とリムハイライトを統合）。

## 実装

- `frontend/src/app/arena.css`：フロストグラスヘッダー、ホーム画面、ダークガラス検索バー、アップグレードされた「THE MATCHUP LAB」対面ステージ（2色ラジアルライティング・コーナーブラケット・`>= 10px`ラベル）、3つのカラーコード攻略導線カード、メタ速報カード、レスポンシブ表示。
- `frontend/src/app/arena-workspace.css`：NEO-STARR ダークテーマ変数、`tabular-nums` 数値整列、ガラスカード・入力欄・Portal（Sheet/Select）、ピック支援セットアップ（モードタイルグリッド・マップカード・青/赤チームトグル・BAN枠のモバイル可読性）、Tierヘッダー・統合フィルターバー・横長キャラチップ（`.arena-tier-chip`）・S+紫〜ゴールド発光、ジュエルグラデーションポートレートカード（`.arena-jewel-card`＋下部暗色スクリム`.arena-jewel-scrim`＋画像欠損モノグラム`.arena-jewel-fallback`）、プレイヤー/クラブダッシュボード（`.arena-player-toolbar`/`.arena-trophy-banner`/`.arena-kpi-box`/`.arena-rank-pedestal`/`.arena-match-card`）。
- `frontend/src/app/arena-motion.css`：登場、選択、ホバー・押下、メニューと詳細表示の共通アニメーション（`prefers-reduced-motion: reduce` 対応）。
- `frontend/src/components/arena-home-panels.tsx`：装飾用「THE MATCHUP LAB」対面ステージと、事実ベースの機能ピル付き3つの攻略ツール導線。
- `frontend/src/components/arena-navigation.tsx`：ホーム、ダッシュボード、Tier表、キャラ一覧、ピック支援。既存のリンクコンポーネントとモバイルのスクロール連動を利用。

入力欄と主要な操作はスマホで高さ44px以上を確保し、入力文字は16pxにする。検索候補と履歴にも共通の配色とフォーカスを適用する。

ナビゲーションの先頭に、キーボードで表示される「メインコンテンツへ」を用意する。Next.jsのページとEdgeの公開ページの両方が、同じ本文の移動先を提供する。モード別・マップ別の一覧と詳細も共通テーマを利用する。

Tier表の行、ランク表示、キャラのグリッドとブレークポイントは維持しつつクライアント側キャラ名検索を追加。検索、候補、履歴、詳細プレビュー、分析、BAN/Pick（Undo含む）、キャッシュと統計処理は既存実装を利用する。装飾カードに架空の勝率・Tierを表示しない。

ホームとTier表のキャラカードは暗い背景と高コントラストな名前で統一。TierラベルはS+が紫〜ゴールド、Sが赤、A+がオレンジ、Aが黄、Bが緑、Cが青、DとN/Aがグレー系。

キャラ一覧はカード全体をレアリティのジュエルグラデーションで塗り分け、下部暗色スクリム（`.arena-directory-scrim`）で視認性を確保する。名称はリンクのツールチップと読み上げ用の説明に保持する。

## 検証

`frontend` で `npm run build`、ESLint (`npx eslint src edge scripts`)、および `package.json` の全 `test:*` 回帰スクリプト＋`scripts/prepare-brawler-pages.test.mjs` を実行して検証する。

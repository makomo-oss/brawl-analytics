# STARR ARENA UI

採用デザインは C1「STARR ARENA」。ホームと各分析画面を、ネイビー、黄色の操作色、濃いTier色、暗いキャラカードで統一する。

## 実装

- `frontend/src/app/arena.css`：ホーム、キャラ対面の装飾、3つの攻略導線、ナビゲーション、レスポンシブ表示。
- `frontend/src/app/arena-workspace.css`：共通テーマ、分析画面、入力欄、タブ、Tier表、キャラ一覧、ポータルの配色。
- `frontend/src/components/arena-navigation.tsx`：ホーム、ダッシュボード、Tier表、キャラ一覧、ピック支援。既存のリンクコンポーネントとモバイルのスクロール連動を利用。
- `frontend/src/components/arena-home-panels.tsx`：装飾用の対面カードと、既存ツールへの導線。

入力欄と主要な操作はスマホで高さ44px以上を確保し、入力文字は16pxにする。ピック支援のモード／マップは既存の2列構成のまま、各列の幅を使う。検索候補と履歴にも共通の配色とフォーカスを適用する。

ナビゲーションの先頭に、キーボードで表示される「メインコンテンツへ」を用意する。Next.jsのページとEdgeの公開ページの両方が、同じ本文の移動先を提供する。モード別・マップ別の一覧と詳細も共通テーマを利用する。

Tier表の行、ランク表示、キャラのグリッドとブレークポイントは維持。検索、候補、履歴、詳細プレビュー、分析、BAN/Pick、キャッシュと統計処理は既存実装を利用する。装飾カードに架空の勝率・Tierを表示しない。

ホーム、Tier表、キャラ一覧のキャラカードは暗い背景と明るい名前で統一。TierラベルはS+が紫、Sが赤、A+がオレンジ、Aが黄、Bが緑、Cが青、DとN/Aがグレー系。文字は背景に応じて白か濃紺を使用する。

## 検証

`frontend` で `npm run build` を実行する。Wrangler型生成、EdgeのTypeScript、Next.js、動的な公開ページの生成をまとめて確認できる。

既存の回帰スクリプトは `package.json` の `test:*` を利用する。キャッシュ、対面プレビュー、ドラフトデータ、詳細リンク、プレイヤーの並び替え、ホームとTierの配信、キャラページ、条件別ページ、キャラ一覧、公開データを対象にする。

実ブラウザでは、PCとスマホで以下を確認する。

- ホームから各ツールへの遷移、上部と下部ナビの現在地。
- Tierタブ、詳細プレビュー、条件フィルター。
- キャラ名検索、並び替え、集計対象の切り替え。
- プレイヤー／クラブ検索の切り替え。
- モードとマップの連動、ドラフト開始、BAN選択。
- 横方向のはみ出し、キーボードのフォーカス、文字と背景のコントラスト。

## ローカルプレビュー

ビルド後、`frontend` で実行する。

```powershell
node node_modules/wrangler/bin/wrangler.js pages dev out --ip 127.0.0.1 --port 3000 --show-interactive-dev-session=false
```

ブラウザでは <http://localhost:3000/> を開く。公開APIの既存CORS設定がこのOriginを許可している。APIの許可範囲はUIのために変更しない。

## 装飾画像

既存のブランド資産とキャラ画像を利用。ホームの追加画像はBrawlifyの公開CDNを出典とする。

- Amber：<https://cdn.brawlify.com/brawlers/emoji/16000040.png>
- Spike：<https://cdn.brawlify.com/brawlers/emoji/16000005.png>

デザイン検討用のプロトタイプや画面キャプチャは、実アプリのデータ処理から独立している。

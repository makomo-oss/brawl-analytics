# お問い合わせフォーム × Google スプレッドシート連携セットアップ手順

サイト内フォーム（`https://brawl-lab.sozai-hub.com/contact`）から送信された内容を、Cloudflare Pages Worker（`POST /api/contact`）経由で Google スプレッドシートに記録するための初回設定手順です（所要時間：約3分）。

## 1. 管理スプレッドシート

Google Drive の「ブロラボ」フォルダに作成済みです。

- **スプレッドシート:** [ブロラボ_お問い合わせ・要望管理](https://docs.google.com/spreadsheets/d/1ca1SvXsRQX2PaO6Z3z0oWm1PwOnDZawoap-6XYO8gYE/edit)
- **シート構成:**
  - `お問い合わせ一覧`: 受付ID・受付日時・種別・優先度・ステータス・件名・内容・関連ページ・返信先・環境情報・対応メモ・更新日時（ドロップダウン入力規則・条件付き書式・フィルター・1行目固定済み）
  - `集計ダッシュボード`: ステータス別・優先度別・種別別の自動集計（`COUNTIF` / `COUNTIFS`）

## 2. Apps Script をスプレッドシートに設定してデプロイ

1. 上記スプレッドシートを開き、メニューから **拡張機能 → Apps Script** をクリックします。
2. エディタの既存コードを消し、[`docs/contact-sheets-gas.gs`](./contact-sheets-gas.gs) の内容をすべて貼り付けて保存します（Ctrl+S）。
3. 左メニューの **プロジェクトの設定（歯車アイコン）→ スクリプト プロパティ → スクリプト プロパティを追加** を開きます。
4. 以下のプロパティを追加して保存します。
   - **プロパティ:** `CONTACT_WEBHOOK_SECRET`
     - **値:** 任意の長いランダム文字列（例: `openssl rand -hex 32` などで生成）
   - **プロパティ（任意）:** `NOTIFY_EMAIL`
     - **値:** 新規送信時にメール通知を受け取りたいメールアドレス（不要なら未設定でOK）
5. 右上の **デプロイ → 新しいデプロイ** をクリックします。
   - 種類の選択（歯車アイコン）: **ウェブアプリ**
   - 説明: `ブロラボ お問い合わせ受信`
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
6. **デプロイ** をクリックし、権限承認画面が表示されたら許可します。
7. 表示された **ウェブアプリ URL**（`https://script.google.com/macros/s/.../exec`）をコピーします。

## 3. Cloudflare Pages に環境変数を登録

Cloudflare ダッシュボードで対象プロジェクト（`brawl-analytics`）を開き、**Settings → Environment variables**（Production / Preview）に以下2つを **Secret（暗号化）** として追加します。

| 変数名 | 値 |
| --- | --- |
| `CONTACT_WEBHOOK_URL` | 手順2でコピーした Apps Script ウェブアプリ URL |
| `CONTACT_WEBHOOK_SECRET` | 手順2で設定した `CONTACT_WEBHOOK_SECRET` と完全一致する文字列 |

追加後、最新のコードを再デプロイすると `/contact` からの送信がスプレッドシートに即座に記録されます。

## セキュリティ設計

- ブラウザは自サイトの `POST /api/contact` にのみ送信するため、Apps Script URL と秘密鍵はクライアント側に露出しません。
- Worker 側で **Origin チェック**、**入力値バリデーション**、**ハニーポット（スパム対策）**、**IP単位レート制限（10分あたり5回まで）**、**数式インジェクション対策** を実施します。
- Apps Script 側でも **秘密鍵の定数時間検証**、**`LockService` による排他制御（採番重複防止）**、**数式インジェクション対策** を二重で実施します。

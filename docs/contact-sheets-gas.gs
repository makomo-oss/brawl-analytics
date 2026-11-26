/**
 * ブロラボ お問い合わせ・要望フォーム -> Google スプレッドシート記録用 Apps Script
 *
 * セットアップ手順:
 * 1. Google Drive「ブロラボ」フォルダの「ブロラボ お問い合わせ・要望管理」スプレッドシートを開く
 * 2. メニュー「拡張機能」->「Apps Script」を開く
 * 3. このファイルの内容を貼り付けて保存する
 * 4. 左メニュー「プロジェクトの設定」->「スクリプト プロパティ」に以下を追加:
 *    - CONTACT_WEBHOOK_SECRET : 任意のランダムな長い秘密鍵（Cloudflare Pages側と一致させる）
 *    - NOTIFY_EMAIL（任意）    : 新規受付時にメール通知を受け取りたい場合の送信先アドレス
 * 5. 右上「デプロイ」->「新しいデプロイ」-> 種類「ウェブアプリ」
 *    - 実行ユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 6. 発行されたウェブアプリURLを Cloudflare Pages の環境変数 `CONTACT_WEBHOOK_URL` に設定し、
 *    同じ秘密鍵を `CONTACT_WEBHOOK_SECRET` に設定する。
 */

const SHEET_NAME = "お問い合わせ一覧";

const ALLOWED_CATEGORIES = {
  "機能要望": "中",
  "不具合報告": "高",
  "データ・表記ミス": "中",
  "その他": "中",
};

const VALID_PRIORITIES = ["高", "中", "低"];
const VALID_STATUSES = ["未対応", "確認中", "対応中", "対応完了", "保留", "対応見送り"];

/**
 * 簡易ヘルスチェック用（設定確認に利用可能。秘密情報は返さない）
 */
function doGet() {
  return jsonResponse({ ok: true, service: "burolabo-contact" });
}

/**
 * Cloudflare Pages Worker (/api/contact) からのPOSTを受信してシートに1行追記する
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse({ ok: false, error: "busy" });
  }

  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : "";
    if (!rawBody) {
      return jsonResponse({ ok: false, error: "empty_body" });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      return jsonResponse({ ok: false, error: "invalid_json" });
    }

    const expectedSecret = PropertiesService.getScriptProperties().getProperty("CONTACT_WEBHOOK_SECRET") || "";
    const providedSecret = typeof payload.secret === "string" ? payload.secret : "";
    if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }

    const categoryLabel = typeof payload.categoryLabel === "string" ? payload.categoryLabel.trim() : "";
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_CATEGORIES, categoryLabel)) {
      return jsonResponse({ ok: false, error: "invalid_category" });
    }

    const message = normalizeText(payload.message, 2000, true);
    if (message.length < 5) {
      return jsonResponse({ ok: false, error: "invalid_message" });
    }

    const subject = normalizeText(payload.subject, 80, false) || fallbackSubject(message);
    const pageUrl = normalizeText(payload.pageUrl, 200, false);
    const replyContact = normalizeText(payload.replyContact, 120, false);
    const clientInfo = normalizeText(payload.clientInfo, 160, false);
    const defaultPriority = ALLOWED_CATEGORIES[categoryLabel];
    const priority = VALID_PRIORITIES.indexOf(payload.priority) >= 0 ? payload.priority : defaultPriority;
    const status = "未対応";

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];

    const nextNumber = getNextTicketNumber(sheet);
    const ticketId = "BL-" + String(nextNumber).padStart(4, "0");
    const nowJst = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

    const rowValues = [
      ticketId,
      nowJst,
      categoryLabel,
      priority,
      status,
      escapeFormula(subject),
      escapeFormula(message),
      escapeFormula(pageUrl),
      escapeFormula(replyContact),
      escapeFormula(clientInfo),
      "",
      "",
    ];

    const targetRow = Math.max(sheet.getLastRow() + 1, 2);
    const range = sheet.getRange(targetRow, 1, 1, rowValues.length);
    range.setValues([rowValues]);
    range.setVerticalAlignment("top");
    sheet.getRange(targetRow, 6, 1, 2).setWrap(true);
    sheet.getRange(targetRow, 11).setWrap(true);

    // 1000行を超えた場合も入力規則が切れないように対象行へ設定
    ensureRowValidations(sheet, targetRow);

    notifyIfConfigured({
      ticketId: ticketId,
      receivedAt: nowJst,
      categoryLabel: categoryLabel,
      priority: priority,
      subject: subject,
      message: message,
      pageUrl: pageUrl,
      replyContact: replyContact,
      sheetUrl: spreadsheet.getUrl(),
    });

    return jsonResponse({ ok: true, id: ticketId });
  } catch (err) {
    console.error("doPost error:", err);
    return jsonResponse({ ok: false, error: "internal_error" });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 既存の受付ID (BL-0001 など) の最大値 + 1 を返す
 */
function getNextTicketNumber(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxNum = 0;
  for (let i = 0; i < values.length; i++) {
    const match = String(values[i][0] || "").match(/^BL-(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return maxNum + 1;
}

/**
 * スプレッドシートの数式インジェクション対策
 */
function escapeFormula(value) {
  if (!value) return "";
  if (/^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function normalizeText(value, maxLen, allowNewlines) {
  if (typeof value !== "string") return "";
  const cleaned = allowNewlines
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    : value.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "");
  return cleaned.trim().slice(0, maxLen);
}

function fallbackSubject(message) {
  const firstLine = message.split("\n")[0].trim();
  return firstLine.length > 32 ? firstLine.slice(0, 32) + "…" : firstLine;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function ensureRowValidations(sheet, row) {
  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(ALLOWED_CATEGORIES), true)
    .setAllowInvalid(false)
    .build();
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(VALID_PRIORITIES, true)
    .setAllowInvalid(false)
    .build();
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(VALID_STATUSES, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(row, 3).setDataValidation(categoryRule);
  sheet.getRange(row, 4).setDataValidation(priorityRule);
  sheet.getRange(row, 5).setDataValidation(statusRule);
}

function notifyIfConfigured(item) {
  const to = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
  if (!to) return;
  try {
    const mailSubject = "[ブロラボ] " + item.categoryLabel + " (" + item.ticketId + "): " + item.subject;
    const body = [
      "ブロラボのお問い合わせフォームに新しい投稿がありました。",
      "",
      "受付ID: " + item.ticketId,
      "受付日時: " + item.receivedAt,
      "種別: " + item.categoryLabel,
      "初期優先度: " + item.priority,
      "件名: " + item.subject,
      "関連ページ: " + (item.pageUrl || "(未指定)"),
      "返信先: " + (item.replyContact || "(未記入)"),
      "",
      "--- 内容 ---",
      item.message,
      "",
      "管理スプレッドシート:",
      item.sheetUrl,
    ].join("\n");
    MailApp.sendEmail({ to: to, subject: mailSubject, body: body });
  } catch (err) {
    console.warn("notifyIfConfigured skipped:", err);
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

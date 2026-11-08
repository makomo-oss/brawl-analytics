import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const compile = async entry => {
  const output = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", write: false,
    alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url))])), define: { "process.env.NODE_ENV": '"production"' } })
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
}
const { tierSummary, rankedRows, brawlerSummary, conditionSummary, clampDescription } = await compile("src/lib/page-insights.ts")
const { tierFaq, brawlerFaq, faqNode, PLAYER_FAQ } = await compile("src/lib/faq.ts")
const { tierCopy, brawlerCopy, conditionPageCopy } = await compile("src/lib/page-copy.ts")
const { jstDate } = await compile("src/lib/dates.ts")
const { searchCopy, brawlerSearchCopy } = await compile("src/lib/seo.ts")
const { brawlerPage, brawlerEntries } = await compile("src/lib/brawler-page-data.ts")
const { conditionIndex, conditionPage } = await compile("src/lib/condition-pages.ts")
const snapshot = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
const bad = /NaN|undefined|null|Infinity/

// Dates: zone-less UTC rolls into the next JST day.
assert.deepEqual(jstDate("2026-11-08T22:30:00"), { iso: "2026-11-08T22:30:00.000Z", long: "2026年11月9日", short: "11/9" })
assert.equal(jstDate("not a date"), null)
assert.equal(jstDate(null), null)

// Tier: values come straight from the sample-sufficient rows, in rank order.
const global = snapshot.overview.global
const rows = rankedRows(global)
assert.ok(rows.length >= 3)
rows.forEach((row, i) => { if (i) assert.ok(row.rank >= rows[i - 1].rank) })
for (const row of rows) {
  const stats = global.characters[row.id]
  assert.equal(stats.sample_sufficient, true)
  assert.equal(row.winRate, stats.win_rate)
  assert.ok(global.tiers[row.tier].includes(row.id))
}
const summary = tierSummary(global, "global")
assert.ok(summary.text.startsWith(summary.date.long))
assert.ok(summary.text.includes(`1位は${rows[0].name}（Tier ${rows[0].tier}・勝率${rows[0].winRate.toFixed(1)}%）`))
assert.ok(summary.text.includes(global.metrics.analyzed_matches.toLocaleString("ja-JP")))
assert.equal(summary.top.length, Math.min(10, rows.length))
assert.doesNotMatch(summary.text, bad)

// Invalid, empty or insufficient data: no summary, static copy, no numbers.
const insufficient = structuredClone(global)
Object.values(insufficient.characters).forEach(stats => { stats.sample_sufficient = false })
for (const data of [null, { ...global, updated_at: null }, insufficient, { ...global, characters: {}, tiers: {} }]) {
  assert.equal(tierSummary(data, "global"), null)
  const copy = tierCopy(data, Date.parse(global.updated_at + "Z"))
  assert.equal(copy.description, searchCopy.tier.description)
  assert.doesNotMatch(copy.description, /\d+\.\d%/)
}
assert.equal(tierFaq(null, null).some(item => item.question.includes("一番強い")), false)

// Title freshness guard.
const now = Date.parse(jstDate(global.updated_at).iso)
assert.match(tierCopy(global, now + 60_000).title, new RegExp(`【${jstDate(global.updated_at).short}更新】$`))
assert.equal(tierCopy(global, now + 8 * 24 * 3600_000).title, searchCopy.tier.title)
assert.ok(tierCopy(global, now).description.length <= 150)

// Characters: summary and FAQ only claim what the data supports.
const entries = brawlerEntries(snapshot)
let sufficient = 0, insufficientPages = 0
for (const entry of entries) {
  const data = brawlerPage(snapshot, entry.slug)
  const copy = brawlerCopy(data)
  const faq = brawlerFaq(data)
  const text = brawlerSummary(data)?.text || ""
  assert.doesNotMatch(copy.title + copy.description + text + JSON.stringify(faq), bad)
  const judged = ["global", "gachi"].some(type => data.cohorts[type].stats?.sample_sufficient && data.cohorts[type].tier !== "N/A")
  if (judged) {
    sufficient++
    assert.match(copy.title, /【(?:ガチ)?Tier [^】]+】$/)
    assert.ok(text.startsWith(brawlerSummary(data).date.long))
    assert.ok(faq.some(item => item.question.endsWith("強いですか？")))
  } else {
    insufficientPages++
    assert.deepEqual(copy, brawlerSearchCopy(data.nameJa))
    assert.equal(brawlerSummary(data), null)
    assert.equal(faq.some(item => item.question.endsWith("強いですか？")), false)
  }
  const node = faqNode("https://example.com/x", faq)
  if (faq.length) assert.deepEqual(node.mainEntity.map(q => [q.name, q.acceptedAnswer.text]), faq.map(item => [item.question, item.answer]))
  else assert.equal(node, null)
}
assert.ok(sufficient > 0)

// A character without matchups or maps gets no counter/map questions.
const sample = brawlerPage(snapshot, entries[0].slug)
const bare = structuredClone(sample)
for (const type of ["global", "gachi"]) Object.assign(bare.cohorts[type], { unfavorable: [], maps: [], allies: [] })
assert.deepEqual(brawlerFaq(bare).map(item => item.question).filter(q => /カウンター|マップ|味方/.test(q)), [])

// Conditions.
const index = conditionIndex(snapshot)
for (const entry of [...index.modes, ...index.maps]) {
  const data = conditionPage(snapshot, entry, index)
  const copy = conditionPageCopy(data)
  assert.doesNotMatch(copy.title + copy.description, bad)
  const s = conditionSummary(data)
  if (s) { assert.ok(s.text.startsWith(s.date.long)); assert.ok(copy.description.length <= 150) }
}

// llms.txt: real top names and links, no invented numbers, and no ranking
// sections when the data is unusable.
const { llmsTxt, llmsFullTxt } = await compile("src/lib/llms-txt.ts")
const llms = llmsTxt(snapshot)
assert.match(llms, /^# ブロラボ/)
assert.ok(llms.includes(`1. [${rows[0].name}](https://brawl-lab.sozai-hub.com/brawlers/${rows[0].slug}): Tier ${rows[0].tier}、勝率${rows[0].winRate.toFixed(1)}%`))
assert.ok(llms.includes("https://brawl-lab.sozai-hub.com/about"))
assert.doesNotMatch(llms, bad)
const full = llmsFullTxt(snapshot, index)
assert.ok(full.includes(index.maps[0].path))
assert.doesNotMatch(full, bad)
const empty = structuredClone(snapshot)
for (const type of ["global", "gachi"]) Object.values(empty.overview[type].characters).forEach(stats => { stats.sample_sufficient = false })
assert.doesNotMatch(llmsTxt(empty), /上位|勝率\d/)
assert.doesNotMatch(llmsFullTxt(empty, { modes: [], maps: [] }), /全キャラの統計|勝率\d/)

assert.equal(clampDescription("あ。".repeat(100), 60).endsWith("。"), true)
assert.equal(PLAYER_FAQ.every(item => !/#[0-9A-Z]{4,}/.test(item.answer)), true)
console.log(`page insights ok: ${sufficient} judged, ${insufficientPages} without tier, ${index.modes.length + index.maps.length} conditions`)

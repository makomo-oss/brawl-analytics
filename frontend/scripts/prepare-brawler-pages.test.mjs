import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchData, validStats, validTier } from './prepare-brawler-pages.mjs'

const stats = { score: 55, win_rate: 58, use_rate: 2.7, total_matches: 2827, sample_sufficient: true }
const tier = { characters: { amber: stats }, tiers: { S: ['amber'] }, metrics: { analyzed_matches: 2827 } }

test('rejects invalid counts, percentages and incomplete Tier references', () => {
  assert.ok(validTier(tier))
  assert.equal(validStats({ ...stats, total_matches: -1 }), false)
  assert.equal(validStats({ ...stats, win_rate: 101 }), false)
  assert.equal(validStats({ ...stats, win_rate: null }), false)
  assert.equal(validTier({ ...tier, tiers: { S: ['missing'] } }), false)
})

test('recovers from a temporary API error without publishing fallback statistics', async () => {
  let calls = 0
  const data = await fetchData('https://example.com', '/meta/tier-list', validTier, async () => {
    calls++
    return calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => tier }
  })
  assert.equal(calls, 2)
  assert.deepEqual(data, tier)
})

test('fails the build after repeated malformed responses', async () => {
  let calls = 0
  await assert.rejects(fetchData('https://example.com', '/meta/tier-list', validTier, async () => {
    calls++
    return { ok: true, json: async () => ({ ...tier, characters: { amber: { ...stats, total_matches: null } } }) }
  }), /Cannot build character pages/)
  assert.equal(calls, 3)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { draftPrediction, matchupRate, synergyLift, signedPoints } from "../src/lib/draft-analysis.ts"

const allies = ["colt", "rico", "piper"]
const enemies = ["bull", "shelly", "brock"]

function fixture() {
  const characters = {}
  for (const name of [...allies, ...enemies]) {
    characters[name] = { score: allies.includes(name) ? 60 : 50, sample_sufficient: true, matchups: {}, synergies: {} }
  }
  for (const own of allies) {
    for (const enemy of enemies) {
      characters[own].matchups[enemy] = 55
      characters[enemy].matchups[own] = 45
    }
  }
  for (const group of [allies, enemies]) {
    for (const first of group) {
      for (const second of group) {
        if (first !== second) characters[first].synergies[second] = { lift: group === allies ? 6 : 3 }
      }
    }
  }
  return characters
}

test("character aliases and reciprocal matchup data resolve consistently", () => {
  const characters = { "MR. P": { matchups: { rt: 60 } }, "r-t": { matchups: { mrp: 40 } } }
  assert.equal(matchupRate(characters, "mr_p", "R-T"), 60)
  assert.equal(matchupRate(characters, "R-T", "mr. p"), 40)
  assert.equal(matchupRate({ "r-t": characters["r-t"] }, "mr_p", "R-T"), 60)
})

test("display-only sparse matchups and invalid numbers cannot become evidence", () => {
  const characters = { colt: { kamo: [{ brawler: "bull", win_rate: 90, matches: 5 }], matchups: { bull: NaN }, synergies: { rico: { lift: Infinity } } } }
  assert.equal(matchupRate(characters, "colt", "bull"), null)
  assert.equal(synergyLift(characters, "colt", "rico"), null)
})

test("three slots and three teammate pairs use averages without doubling points", () => {
  const prediction = draftPrediction(fixture(), allies, enemies)
  assert.equal(prediction.allyEnvAvg, 60)
  assert.equal(prediction.enemyEnvAvg, 50)
  assert.equal(prediction.matchupAdvantage, 5)
  assert.equal(prediction.allySynergyAvg, 6)
  assert.equal(prediction.enemySynergyAvg, 3)
  assert.equal(signedPoints(prediction.matchupAdvantage), "+5.0pt")
  assert.ok(prediction.winRate > 50 && prediction.winRate < 95)
})

test("swapping teams reverses advantage and complements the estimate", () => {
  const characters = fixture()
  const own = draftPrediction(characters, allies, enemies)
  const reverse = draftPrediction(characters, enemies, allies)
  assert.equal(own.winRate + reverse.winRate, 100)
  assert.equal(own.matchupAdvantage, -reverse.matchupAdvantage)
  assert.equal(own.allyEnvAvg, reverse.enemyEnvAvg)
  assert.equal(own.allySynergyAvg, reverse.enemySynergyAvg)
})

test("absent or insufficient map evidence does not invent a 50 percent forecast", () => {
  assert.equal(draftPrediction({}, allies, enemies).winRate, null)
  const sparse = Object.fromEntries([...allies, ...enemies].map(name => [name, { score: 90, sample_sufficient: false }]))
  assert.equal(draftPrediction(sparse, allies, enemies).winRate, null)
  assert.equal(draftPrediction(fixture(), allies.slice(0, 2), enemies).winRate, null)
})

test("opponent synergy and missing teammate pairs affect the estimate consistently", () => {
  const neutral = Object.fromEntries([...allies, ...enemies].map(name => [name, { score: 50, sample_sufficient: true, synergies: {} }]))
  assert.equal(draftPrediction(neutral, allies, enemies).winRate, 50)
  neutral.bull.synergies.shelly = { lift: 9 }
  neutral.shelly.synergies.bull = { lift: 9 }
  const result = draftPrediction(neutral, allies, enemies)
  assert.equal(result.enemySynergyAvg, 3)
  assert.ok(result.winRate < 50)
  assert.equal(signedPoints(-0.01), "+0.0pt")
})

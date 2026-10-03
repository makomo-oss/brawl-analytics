import { test } from "node:test"
import assert from "node:assert/strict"
import { matchupRate, synergyLift, signedPoints } from "../src/lib/draft-analysis.ts"

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

test("point labels preserve the actual scale and avoid negative zero", () => {
  assert.equal(signedPoints(5), "+5.0pt")
  assert.equal(signedPoints(-3.25), "-3.2pt")
  assert.equal(signedPoints(-0.01), "+0.0pt")
})

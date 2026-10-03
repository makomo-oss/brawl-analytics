export interface DraftCharacterStats {
  score?: number
  sample_sufficient?: boolean
  matchups?: Record<string, number>
  synergies?: Record<string, { lift?: number }>
}

export type DraftCharacters = Record<string, DraftCharacterStats>

export const normalizeDraftCharacter = (name: string) => name.toLowerCase().replace(/[\s_\-&.]/g, "")
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const validRate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100

export function characterStats(characters: DraftCharacters, name: string) {
  const target = normalizeDraftCharacter(name)
  return Object.entries(characters).find(([key]) => normalizeDraftCharacter(key) === target)?.[1]
}

export function matchupRate(characters: DraftCharacters, own: string, enemy: string): number | null {
  const forward = characterStats(characters, own)?.matchups?.[normalizeDraftCharacter(enemy)]
  const reverse = characterStats(characters, enemy)?.matchups?.[normalizeDraftCharacter(own)]
  // The API's matchups matrix enforces support thresholds. Display-only
  // kamo/tenteki lists can contain smaller samples and must not bypass them.
  const rates = [validRate(forward) ? forward : null, validRate(reverse) ? 100 - reverse : null]
    .filter((value): value is number => value !== null)
  return rates.length ? mean(rates) : null
}

export function synergyLift(characters: DraftCharacters, first: string, second: string): number | null {
  const forward = characterStats(characters, first)?.synergies?.[normalizeDraftCharacter(second)]?.lift
  const reverse = characterStats(characters, second)?.synergies?.[normalizeDraftCharacter(first)]?.lift
  const lifts = [forward, reverse].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100)
  return lifts.length ? mean(lifts) : null
}

function teamSynergy(characters: DraftCharacters, picks: string[]) {
  const pairs: number[] = []
  let supported = 0
  for (let first = 0; first < picks.length; first++) {
    for (let second = first + 1; second < picks.length; second++) {
      const lift = synergyLift(characters, picks[first], picks[second])
      if (lift !== null) supported += 1
      pairs.push(lift ?? 0)
    }
  }
  return { average: mean(pairs), supported }
}

export function draftPrediction(characters: DraftCharacters, allies: string[], enemies: string[]) {
  const stats = [...allies, ...enemies].map(name => characterStats(characters, name))
  const scores = stats.map(value => value?.sample_sufficient !== false && validRate(value?.score) ? value.score : 50)
  const allyEnvAvg = allies.length ? mean(scores.slice(0, allies.length)) : 50
  const enemyEnvAvg = enemies.length ? mean(scores.slice(allies.length)) : 50
  const matchups: number[] = []
  let supportedMatchups = 0
  for (const own of allies) {
    for (const enemy of enemies) {
      const rate = matchupRate(characters, own, enemy)
      if (rate !== null) supportedMatchups += 1
      matchups.push((rate ?? 50) - 50)
    }
  }
  const matchupAdvantage = mean(matchups)
  const allySynergy = teamSynergy(characters, allies)
  const enemySynergy = teamSynergy(characters, enemies)
  const supportedMaps = stats.filter(value => value?.sample_sufficient !== false && validRate(value?.score)).length
  const hasEvidence = supportedMaps + supportedMatchups + allySynergy.supported + enemySynergy.supported > 0

  // This remains an uncalibrated composition estimate, not a fitted outcome
  // model. Use team/pair averages consistently so displayed factors have
  // the same scale as their contributions, independent of slot count.
  const advantage = (allyEnvAvg - enemyEnvAvg) * 0.4 + matchupAdvantage * 1.5 * 0.4
    + (allySynergy.average - enemySynergy.average) * 1.2 * 0.2
  const winRate = allies.length === 3 && enemies.length === 3 && hasEvidence
    ? Math.min(95, Math.max(5, Math.round(100 / (1 + Math.exp(-0.15 * advantage)))))
    : null

  return { winRate, allyEnvAvg, enemyEnvAvg, matchupAdvantage,
    allySynergyAvg: allySynergy.average, enemySynergyAvg: enemySynergy.average }
}

export function signedPoints(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)}pt`
}

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

export interface DraftPrediction {
  winRate: number
  allyEnvAvg: number
  enemyEnvAvg: number
  matchupAdvantage: number
  allySynergyAvg: number
  enemySynergyAvg: number
  confidence: "low" | "medium" | "high"
}

export function signedPoints(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)}pt`
}

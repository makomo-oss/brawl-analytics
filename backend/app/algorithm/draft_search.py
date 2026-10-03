"""Bounded adversarial draft search. No invented opponent choice probabilities."""
from itertools import combinations
import numpy as np
from app.algorithm.draft_outcome import sigmoid
from app.algorithm.composition_model import pair_effect, pair_points, set_residual, character_effect, outcome_probabilities
from app.algorithm.draft_rules import other


class DraftSearch:
    def __init__(self, model, catalog, mode, map_id, available=None):
        self.model, self.mode, self.map = model, mode, map_id
        self.names = tuple(sorted(set(catalog)))
        self.ids = {n: i for i, n in enumerate(self.names)}
        self.c = np.array([character_effect(model, n, mode, map_id) for n in self.names])
        self.e = np.array([[pair_effect(model, a, b, mode, map_id) for b in self.names] for a in self.names])
        self.s = np.array([[pair_effect(model, a, b, mode, map_id, "s") for b in self.names] for a in self.names])
        # None is an unknown roster; an empty roster really permits no picks.
        self.available = available or {}
        self.memo, self.evaluations = {}, 0
        self.exact = False

    def legal(self, state):
        excluded = set(state.blue_bans + state.red_bans) | {n for _, n in state.picks}
        roster = self.available.get(state.turn)
        return [n for n in self.names if n not in excluded and (roster is None or n in roster)]

    def z(self, state, side):
        a, b = [self.ids[n] for n in state.team(side)], [self.ids[n] for n in state.team(other(side))]
        z = self.c[a].sum() - self.c[b].sum()
        z += sum(self.s[i, j] for i, j in combinations(a, 2)) - sum(self.s[i, j] for i, j in combinations(b, 2))
        z += self.e[np.ix_(a, b)].sum()
        if len(state.picks) == 6:
            self.evaluations += 1
            z += set_residual(self.model, state.team(side), state.team(other(side)), self.mode) / self.model.get("temperature", 1)
        return float(z)

    def ordered(self, state):
        names = self.legal(state)
        ids = [self.ids[n] for n in names]
        own = [self.ids[n] for n in state.team(state.turn)]
        enemy = [self.ids[n] for n in state.team(other(state.turn))]
        values = self.c[ids] + self.s[np.ix_(ids, own)].sum(axis=1) + self.e[np.ix_(ids, enemy)].sum(axis=1)
        return sorted(zip(names, values), key=lambda v: (-v[1], v[0]))

    def value(self, state, side, depth):
        key = (state.picks, state.blue_bans, state.red_bans, side, depth)
        if key in self.memo:
            return self.memo[key]
        if len(state.picks) == 6:
            return self.z(state, side)
        moves = self.ordered(state)
        if not moves:
            return None
        # The final reply is exhaustive. Earlier stages use a small beam and a
        # deterministic best-response rollout after the lookahead horizon.
        exhaustive = self.exact and len(state.picks) >= 5
        width = len(moves) if exhaustive else (3 if depth > 0 else 1)
        values = [self.value(state.pick(n), side, depth - 1) for n, _ in moves[:width]]
        values = [v for v in values if v is not None]
        result = (max(values) if state.turn == side else min(values)) if values else None
        self.memo[key] = result
        return result

    def recommend(self, state):
        side, results = state.turn, []
        self.exact = len(state.picks) >= 4
        if side is None:
            return {"suggestions": [], "search": {"exact": True, "evaluations": 0}}
        for name, _ in self.ordered(state):
            z = self.value(state.pick(name), side, 2)
            if z is None:
                continue
            effects = []
            for enemy in state.team(other(side)):
                pair = ":".join(sorted((name, enemy)))
                support = self.model.get("support", {}).get(f"e|mode:{self.mode}|{pair}", 0)
                effect = pair_points(self.model, name, enemy, self.mode, self.map)
                # Shrunk coefficients alone do not justify a confident badge.
                if support >= 100 and abs(effect) >= 2:
                    effects.append({"enemy": enemy, "points": round(effect, 1)})
            effects.sort(key=lambda v: -abs(v["points"]))
            results.append({"name": name, "score": 100 * outcome_probabilities(self.model, z, self.mode)[0], "counterEffects": effects[:2]})
        results.sort(key=lambda v: (-v["score"], v["name"]))
        return {"suggestions": results[:10], "search": {"exact": len(state.picks) >= 4,
                "evaluations": self.evaluations, "method": "bounded_best_response"}}

    def bans(self, state, side):
        # Opponent bans are concealed: never condition our advice on them.
        from app.algorithm.draft_rules import DraftState
        own_bans = state.blue_bans if side == "blue" else state.red_bans
        baseline = DraftState(state.first, (), own_bans if side == "blue" else (), own_bans if side == "red" else ())
        legal = self.ordered(baseline)
        suggestions = []
        for name, _ in legal:
            removed = DraftState(state.first, (), baseline.blue_bans + (name,), baseline.red_bans)
            if side == "red":
                removed = DraftState(state.first, (), baseline.blue_bans, baseline.red_bans + (name,))
            z = self.value(removed, side, 1)
            if z is not None:
                suggestions.append({"name": name, "score": 100 * outcome_probabilities(self.model, z, self.mode)[0], "counterEffects": []})
        return {"suggestions": sorted(suggestions, key=lambda v: (-v["score"], v["name"]))[:10],
                "search": {"exact": False, "evaluations": self.evaluations, "method": "blind_ban_removal"}}

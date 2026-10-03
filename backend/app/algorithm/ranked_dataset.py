"""As-of controls from real official fields. Never backfill future profiles."""
from bisect import bisect_right
from collections import defaultdict
from datetime import datetime, timezone
import re
from app.algorithm.draft_outcome import normalize
from app.algorithm.draft_training import canonical_games


def date(value):
    text = re.sub(r"\.(\d+)(?=[+-]|$)", lambda m: "." + m[1][:6].ljust(6, "0"), str(value).replace("Z", "+00:00"))
    parsed = datetime.fromisoformat(text)
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def build_games(records, eligible_tags, observations=(), snapshots=(), now=None, population="gachi"):
    history = defaultdict(list)
    for row in snapshots:
        history[str(row["player_tag"]).lstrip("#")].append((date(row["observed_at"]), row["ranked_rank"]))
    for values in history.values():
        values.sort()

    def rank(tag, at):
        values = history.get(str(tag).lstrip("#"), [])
        index = bisect_right(values, (at, 101)) - 1
        return values[index][1] if index >= 0 else None

    selected, eligible = [], set(eligible_tags)
    for row in records:
        actual = rank(row.get("player_tag", ""), date(row["match_at"]))
        if population == "gachi" and actual is not None and actual < 13:
            continue
        if actual is not None and actual >= 13:
            eligible.add(row["player_tag"])
        selected.append(row)
    games = canonical_games(selected, eligible, now, population, include_draws=True)
    evidence = {r["battle_uid"]: r for r in observations}
    result = []
    ratings, counts = defaultdict(float), defaultdict(int)
    pending, pending_date = [], None
    for game in games:
        # Apply outcomes only after every game at the preceding timestamp.
        if game["date"] != pending_date:
            for team, sign, error in pending:
                for p in team:
                    ratings[p["tag"]] += sign * .06 * error
                    counts[p["tag"]] += 1
            pending, pending_date = [], game["date"]
        row = evidence.get(game["game"])
        if row and row.get("quality_state") == "conflict":
            continue
        game["nuisance"] = {"o|global|bias": sum(game["observers"])}
        game["collected_at"] = None
        if row and row.get("quality_state") == "complete":
            teams = row["teams"]
            if tuple(sorted(normalize(p["name"]) for p in teams[0])) != game["own"]:
                teams = teams[::-1]
            if (tuple(sorted(normalize(p["name"]) for p in teams[0])) != game["own"] or
                    tuple(sorted(normalize(p["name"]) for p in teams[1])) != game["enemy"]):
                continue
            game["collected_at"] = date(row["collected_at"])
            ranks = [[rank(p["tag"], game["date"]) for p in t] for t in teams]
            if all(r is not None for t in ranks for r in t):
                game["nuisance"]["n|global|rank_gap"] = (sum(ranks[0]) - sum(ranks[1])) / 9
            if all(p.get("power") is not None for t in teams for p in t):
                game["nuisance"]["n|global|power_gap"] = (sum(p["power"] for p in teams[0]) - sum(p["power"] for p in teams[1])) / 3
            skill = [sum(ratings[p["tag"]] for p in t) / 3 for t in teams]
            if all(counts[p["tag"]] >= 5 for t in teams for p in t):
                game["nuisance"]["n|global|past_skill_gap"] = skill[0] - skill[1]
            from app.algorithm.draft_outcome import sigmoid
            error = game["win"] - sigmoid(skill[0] - skill[1])
            pending.extend([(teams[0], 1, error), (teams[1], -1, error)])
        result.append(game)
    return result


def training_features(game, controls=True):
    from app.algorithm.composition_model import features
    f = features(game["own"], game["enemy"], game["mode"], game["map"])
    if controls:
        f.update(game.get("nuisance", {}))
    return f

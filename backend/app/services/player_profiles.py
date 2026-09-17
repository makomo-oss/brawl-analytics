"""One schema for all verified profile writers; syncing must not erase rank data."""
from datetime import datetime, timezone


def profile_record(tag: str, info: dict) -> dict:
    tag = tag.replace('%23', '').replace('#', '').strip().upper()
    actual = str(info.get('tag', '')).replace('#', '').upper()
    if actual != tag or not info.get('name'):
        raise ValueError('Profile does not match the requested player')
    current = info.get('rankedRank') or 0
    highest = max(current, info.get('highestAllTimeRankedRank') or 0,
                  info.get('highestSeasonRankedRank') or 0)
    return {
        'player_tag': tag, 'name': info['name'],
        'trophies': info.get('trophies', 0),
        'highest_trophies': info.get('highestTrophies', 0),
        'unlocked_characters': {
            'ranked_rank': current, 'highest_ranked_rank': highest,
            'ranked_name': info.get('rankedRankName', ''),
            'highest_ranked_name': info.get('highestAllTimeRankedRankName') or info.get('highestSeasonRankedRankName', ''),
            'brawlers': info.get('brawlers', []), 'profile_status': 'verified',
        },
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }

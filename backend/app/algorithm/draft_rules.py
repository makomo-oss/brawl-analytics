"""Ranked app contract: blind team bans, unique picks, ABBAAB turn order."""
from dataclasses import dataclass


def other(team):
    return "red" if team == "blue" else "blue"


@dataclass(frozen=True)
class DraftState:
    first: str
    picks: tuple
    blue_bans: tuple = ()
    red_bans: tuple = ()

    @property
    def order(self):
        return (self.first, other(self.first), other(self.first), self.first, self.first, other(self.first))

    @property
    def turn(self):
        return self.order[len(self.picks)] if len(self.picks) < 6 else None

    def team(self, side):
        return tuple(name for team, name in self.picks if team == side)

    def validate(self, catalog):
        if self.first not in ("blue", "red") or len(self.picks) > 6:
            raise ValueError("ドラフトの手番が正しくありません。")
        for bans in (self.blue_bans, self.red_bans):
            if len(bans) > 3 or len(set(bans)) != len(bans):
                raise ValueError("BANは各チーム3体までです。")
        names = [name for _, name in self.picks]
        if len(set(names)) != len(names) or set(names) & set(self.blue_bans + self.red_bans):
            raise ValueError("選択済み・BAN済みのキャラクターは選べません。")
        if any(side != self.order[i] for i, (side, _) in enumerate(self.picks)):
            raise ValueError("ピックの順序が正しくありません。")
        if not set(names + list(self.blue_bans + self.red_bans)) <= set(catalog):
            raise ValueError("キャラクター情報を再読み込みしてください。")
        return self

    def pick(self, name):
        return DraftState(self.first, self.picks + ((self.turn, name),), self.blue_bans, self.red_bans)

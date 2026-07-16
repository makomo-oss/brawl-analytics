CREATE TABLE players (
    player_tag VARCHAR(15) PRIMARY KEY,
    updated_at TIMESTAMP NOT NULL,
    unlocked_characters JSONB NOT NULL
);

CREATE TABLE season_booster_characters (
    season_id VARCHAR(10) PRIMARY KEY,
    character_ids TEXT[] NOT NULL
);

CREATE TABLE match_raw_history (
    match_id VARCHAR(50) PRIMARY KEY,
    player_tag VARCHAR(15) REFERENCES players(player_tag),
    match_at TIMESTAMP NOT NULL,
    mode VARCHAR(20) NOT NULL,
    map_id VARCHAR(50) NOT NULL,
    result VARCHAR(10) NOT NULL,
    hero_used VARCHAR(30) NOT NULL,
    allies TEXT[] NOT NULL,
    opponents TEXT[] NOT NULL
);
CREATE INDEX idx_match_raw_history_tag_date ON match_raw_history (player_tag, match_at DESC);

CREATE TABLE player_map_stats (
    player_tag VARCHAR(15) REFERENCES players(player_tag),
    map_id VARCHAR(50) NOT NULL,
    character_id VARCHAR(30) NOT NULL,
    total_wins INT DEFAULT 0,
    total_losses INT DEFAULT 0,
    PRIMARY KEY (player_tag, map_id, character_id)
);

CREATE TABLE dynamic_counters (
    char_a VARCHAR(30) NOT NULL,
    char_b VARCHAR(30) NOT NULL,
    match_count INT DEFAULT 0,
    win_count INT DEFAULT 0,
    counter_coefficient REAL DEFAULT 0.0,
    PRIMARY KEY (char_a, char_b)
);

CREATE TABLE macro_map_stats (
    map_id VARCHAR(50) NOT NULL,
    character_id VARCHAR(30) NOT NULL,
    total_wins INT DEFAULT 0,
    total_matches INT DEFAULT 0,
    win_rate REAL DEFAULT 50.0,
    pick_rate_deviation REAL DEFAULT 50.0,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (map_id, character_id)
);

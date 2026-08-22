CREATE TABLE IF NOT EXISTS dynamic_synergies (
    char_a VARCHAR(30) NOT NULL,
    char_b VARCHAR(30) NOT NULL,
    match_count INT DEFAULT 0,
    win_count INT DEFAULT 0,
    win_rate REAL DEFAULT 50.0,
    lift REAL DEFAULT 0.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (char_a, char_b)
);

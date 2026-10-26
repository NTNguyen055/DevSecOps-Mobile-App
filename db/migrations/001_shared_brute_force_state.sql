-- Shared brute force detection state for multiple API replicas.
-- PostgreSQL 16.

CREATE TABLE IF NOT EXISTS security_brute_force_state (
    source_ip INET PRIMARY KEY,

    failure_timestamps_ms BIGINT[]
        NOT NULL DEFAULT '{}'::BIGINT[],

    last_seen_ms BIGINT NOT NULL
        CHECK (last_seen_ms >= 0),

    last_alert_at_ms BIGINT
        CHECK (
            last_alert_at_ms IS NULL
            OR last_alert_at_ms >= 0
        ),

    CONSTRAINT security_brute_force_max_events
        CHECK (cardinality(failure_timestamps_ms) <= 256)
);

CREATE INDEX IF NOT EXISTS
    idx_security_brute_force_last_seen
ON security_brute_force_state (last_seen_ms);

-- Preserve truncated detection-window state across API replicas.
ALTER TABLE security_brute_force_state
    ADD COLUMN IF NOT EXISTS truncated_until_ms BIGINT
    CHECK (
        truncated_until_ms IS NULL
        OR truncated_until_ms >= 0
    );

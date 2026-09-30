-- Incremented when a user deletes all of their data. Devices holding a different epoch
-- discard their local copy and re-download, so deleted data can't be pushed back.
ALTER TABLE users ADD COLUMN data_epoch INT UNSIGNED NOT NULL DEFAULT 1 AFTER sync_seq;

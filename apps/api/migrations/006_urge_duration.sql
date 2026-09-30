-- How long an urge lasted, in minutes. NULL = not recorded (all existing records).
ALTER TABLE urge_records ADD COLUMN duration_minutes SMALLINT UNSIGNED NULL AFTER intensity;
ALTER TABLE urge_records ADD CONSTRAINT ck_urge_records_duration CHECK (duration_minutes IS NULL OR duration_minutes <= 1440);

-- The viewer's name, given by the owner when sharing from the app (greets them in emails).
ALTER TABLE dashboard_access ADD COLUMN viewer_name VARCHAR(100) NULL AFTER viewer_email;

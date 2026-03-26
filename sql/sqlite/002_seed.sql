INSERT INTO app_settings (setting_key, setting_value)
VALUES ('signup_invite_key', 'party-friends-v1')
ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value;
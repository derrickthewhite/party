USE `u709836584_party`;

INSERT INTO `app_settings` (`setting_key`, `setting_value`)
VALUES ('signup_invite_key', 'party-friends-v1')
ON DUPLICATE KEY UPDATE
  `setting_value` = VALUES(`setting_value`);

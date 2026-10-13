USE `u709836584_party`;

INSERT INTO `rooms` (`name`, `code`)
VALUES ('Main', 'party-friends-v1')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`);

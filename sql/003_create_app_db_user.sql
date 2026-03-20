-- Run in phpMyAdmin as a MySQL admin account (if your host allows CREATE USER/GRANT).
-- Replace placeholders before executing.

USE `u709836584_party`;

-- 1) Create application user.
-- On many shared hosts you may need to do this in the host control panel instead.
CREATE USER IF NOT EXISTS 'u709836584_party_app'@'localhost'
IDENTIFIED BY 'BaconTreasureMonkeyBible';

-- 2) Grant only needed privileges for this app.
GRANT SELECT, INSERT, UPDATE, DELETE
ON `u709836584_party`.*
TO 'u709836584_party_app'@'localhost';

-- 3) Apply privilege changes.
FLUSH PRIVILEGES;

-- 4) Quick checks.
SELECT USER() AS current_mysql_user;
SHOW GRANTS FOR 'u709836584_party_app'@'localhost';

--- THIS FILE CANNOT BE RUN ON THE HOST. use the provided root user instead: 
-- user: u709836584_party
-- password: 1Angelpuss&1Persephone

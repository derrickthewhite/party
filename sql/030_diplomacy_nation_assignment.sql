-- Split Diplomacy nation selection from how many nations each player gets.
ALTER TABLE `games`
  ADD COLUMN `diplomacy_nation_count` ENUM('single', 'even', 'all') NOT NULL DEFAULT 'single' AFTER `diplomacy_nation_mode`;

UPDATE `games`
  SET `diplomacy_nation_count` = 'all'
  WHERE `diplomacy_nation_mode` = 'assign_all';

UPDATE `games`
  SET `diplomacy_nation_count` = 'even'
  WHERE `diplomacy_nation_mode` = 'even';

ALTER TABLE `games`
  MODIFY `diplomacy_nation_mode` VARCHAR(20) NOT NULL DEFAULT 'pick';

UPDATE `games`
  SET `diplomacy_nation_mode` = 'owner'
  WHERE `diplomacy_nation_mode` IN ('assign_all', 'one_each', 'even');

ALTER TABLE `games`
  MODIFY `diplomacy_nation_mode` ENUM('pick', 'random', 'owner') NOT NULL DEFAULT 'pick';

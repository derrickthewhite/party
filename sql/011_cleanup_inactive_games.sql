USE `u709836584_party`;

-- Deletes closed games and related memberships/messages via cascading FKs.
DELETE FROM `games`
WHERE `status` = 'closed';

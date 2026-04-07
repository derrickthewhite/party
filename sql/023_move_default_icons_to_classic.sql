-- 023_move_default_icons_to_classic.sql
-- Prefix root-level default icon_key values with "Classic/" so icons move into the Classic folder.
-- This migration only targets icon_key values that match the original default catalog filenames.

UPDATE game_members
SET icon_key = CONCAT('Classic/', icon_key)
WHERE icon_key IN (
  'AmberHardHat.svg','AquaAviators.svg','BlackMask.svg','blueHappy.svg','BronzeTriangle.svg',
  'CobaltDiamond.svg','CoralBeret.svg','CyanHeadphones.svg','ForestHex.svg','GoldMonocle.svg',
  'GrayNeutral.svg','GreenChill.svg','IndigoWizard.svg','IvoryStar.svg','LavenderCloud.svg',
  'LimeEyepatch.svg','MintMustache.svg','NavyTopHat.svg','NeonAlien.svg','OliveCaptain.svg',
  'OrangeLaugh.svg','PeachHalo.svg','PinkBow.svg','PlumBeanie.svg','PurpleSmirk.svg',
  'RedGrin.svg','RoseCatGlasses.svg','RubySquare.svg','SkyBandana.svg','SlateFedora.svg',
  'TealWink.svg','yellowSmile.svg'
);

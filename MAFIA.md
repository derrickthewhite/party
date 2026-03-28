# Mafia Rules

This repository now targets a simple Mafia ruleset for the first implementation pass.

## Roles

- Every living player is either `town` or `mafia`.
- Mafia membership is assigned automatically when the game starts.
- Mafia roles are hidden from town players.
- Mafia players know who the other mafia players are.

## Phases

The game uses three phases.

### Start

- The game begins in `start`.
- Each living player sees their role.
- Each living player submits a ready acknowledgement.
- The game advances to `day` automatically once every living player is ready.

### Day

- Every living player votes for one living target.
- Players cannot target themselves.
- The day advances automatically once every living player has submitted a vote.
- The player with the highest vote count is eliminated.
- If the vote is tied, the eliminated target is chosen deterministically by the server.
- Eliminated players are removed from active play.

### Night

- Only living mafia players vote during the night.
- Mafia cannot target themselves or other mafia members.
- The night advances automatically once every living mafia player has submitted a vote.
- The target with the highest mafia vote count is eliminated.
- If the vote is tied, the eliminated target is chosen deterministically by the server.

## Elimination

- Eliminated players become observers.
- Eliminated players cannot chat or submit actions.
- The eliminated player's role is revealed in the server-generated phase result summary.

## Win Conditions

- Town wins when no living mafia remain.
- Mafia wins when the number of living mafia is greater than or equal to the number of living town players.

## UI Behavior

- The mafia screen uses a dedicated role-reveal panel for `start`.
- Day and night share the same target-selection UI.
- Local target selection is preserved across refreshes in the same phase.
- Local target selection resets when the phase or round changes.
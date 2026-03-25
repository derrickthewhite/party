# Rumble: Rules, Ability Framework, and Phase 2 Plan

This document defines the Rumble rules used by this site, the phase-2 ability and bidding system, and the implementation plan for extending Rumble safely.

## Core Terms

- Health: Primary survivability resource. A player is defeated at 0 Health.
- Energy: Per-round action budget. Base Energy equals current Health unless modified.
- Spend: Consume Energy to power actions.
- Burn N: Spend N Energy and also lose N Health.
- Defense: Unspent Energy that absorbs incoming attack damage in the current round.
- Unblockable damage: Damage that bypasses Defense.

## Game Flow

- Status flow: open -> in_progress -> closed
- Rumble phase flow at game start:
  1. Bidding phase (round 1): players submit secret bids on offered abilities.
  2. Battle phase (round 1+): normal attack/defense turn loop.

Bidding happens once at game start. Won abilities persist until game end.

## Bidding Rules

- A random offer of abilities is generated when the game starts.
- The same ability may appear multiple times in that offer.
- Players submit secret integer bids per offered ability.
- Bid constraints:
  - Each bid is an integer >= 0.
  - Sum of a player bids cannot exceed that player current Health.
- Resolution by ability:
  - Highest non-zero bid wins.
  - If multiple players tie at the same highest non-zero bid, winner is chosen randomly among tied players.
  - Winner loses Health equal to winning bid.
  - Winner permanently gains that offered copy of the ability for the game.
- Players may win multiple abilities if they can afford the winning bids.
- Players may also end up owning multiple copies of the same ability if they win repeated offer slots.
- Bidding resolves automatically when all eligible players submit.
- Owner/admin can force-end bidding.

## Bidding Screen Plan

The bidding screen should follow retained-DOM reconciliation rules used elsewhere in the app.

### Table Layout

Columns:
- Ability Name
- Description
- Bid

Rows:
- One row per offered ability.
- Bid cell is a numeric text box (integer, minimum 0).

### Player Controls

- Submit Bids: create initial bid submission.
- Edit Bids: switch to editable mode using latest submitted bids as baseline.
- Save Bids: submit edited bids.
- Cancel Bids: remove current submitted bids for this phase.

### Owner/Admin Controls

- End Bidding: resolves bidding and transitions to battle phase.

### UX Requirements

- Poll refresh updates server snapshot but never erases dirty local bid draft.
- Focused bid input remains usable through refresh reconciliation.
- Draft resets only on explicit transitions:
  - submit success
  - cancel success
  - bidding resolution / phase transition

## Ability Framework (Phase 2)

The ability system is data-driven and template-based.

Each ability has:
- id
- name
- template_type
- tags
- description

Template examples:
- activated_attack
- activated_defense
- passive_modifier
- trigger_on_attacked
- trigger_on_defeat
- round_start_effect
- win_condition
- utility_status

Phase 2 uses a static library. Future phases can add custom ability authoring that maps into the same template schema.

## Ability Catalog (Current)

1. Meson Beam: Spend 10 Energy. Deal 5 unblockable damage to one opponent.
2. Heavy Meson Beam: Spend 20 Energy. Deal 10 unblockable damage to one opponent.
3. Ion Beam: Spend 10 Energy. Deal 20 defense-only damage to one opponent.
4. Loitering Munitions: Spend X Energy. At the start of next round, deal X damage to one opponent.
5. Torpedo Bays: Spend X Energy. Next round, add X bonus damage to one attack.
6. Efficient Targeting: Spend 10 Energy. Your second-largest attack this round costs 0 Energy.
7. Phase Bomb: Spend X Energy. Deal floor(X/2) damage to all other opponents.
8. Mine Layer: Spend X Energy. This round, each player who attacks you takes floor(X/2) damage.
9. Hailing Frequencies: Choose one opponent. Next round, neither of you may attack the other. Not valid if only two players remain.
10. Scheming: Burn 10. Choose one opponent. If that opponent attacks you this round, you ignore their largest attack and they take that much damage.
11. Death Ray: Passive. If you make exactly one attack this round, increase that attack by 50%.
12. Heavy Guns: Passive. Each of your attacks deals +10 damage.
13. Holoship: Passive. You cannot be targeted by attacks. At end of round, lose 5 Health.
14. Hyperdrive: Burn 5 to enter or leave Hyperspace. In Hyperspace, you cannot attack or be attacked. If only one non-eliminated player remains outside Hyperspace, that player wins.
15. Cloaking Field: Spend 20 Energy and Burn 5. You cannot be attacked next round.
16. Shield Capacitors: Spend 10 Energy. Gain +20 Defense this round.
17. Shield Boosters: Passive. Gain +20 Defense at the start of each round.
18. Reflective Shield: Passive. Whenever you take attack damage, the attacker takes half that damage.
19. Energy Absorption: Spend 10 Energy. At the start of next round, gain Energy equal to half the damage your Defense blocked this round.
20. Armor: Passive. Reduce each incoming attack by 5.
21. Heavy Armor: Passive. Reduce each incoming attack by 10.
22. Backup Generator: Triggered. If reduced to 0 Health, lose this ability and set Health to 30.
23. Escape Pods: Triggered. If reduced to 0 Health, lose this ability and set Health to 20.
24. Nimble Dodge: Spend 10 Energy. Negate the largest attack against you this round. Not valid if only two players remain.
25. Focused Defense: Choose one opponent. Halve attacks from that opponent this round.
26. Turbo Generator: Passive. Your per-round Energy is Health + 10.
27. McGuffin Generator: Triggered. At the start of round 3, gain 50 Health.
28. Courier Mission: Win condition. If you are alive at end of round 10, you win.
29. Automated Repair Systems: Passive. Gain 5 Health each round, up to your starting maximum Health.
30. Replicators: Passive. Gain 5 Health each round.
31. Mining Rig: Spend 3X Energy. Gain X Health.

## Phase 2 Implementation Notes

Implemented foundation:
- Ability library module in backend.
- Bidding endpoints:
  - submit/edit bids
  - cancel bids
  - end bidding
- Auto resolve when all eligible players submit bids.
- Ability assignment and Health deduction during bidding resolution.
- Persistent player-owned ability storage.
- Game detail payload now includes offered abilities and current bids during bidding.

Planned next:
- Full frontend bidding UI integrated into rumble screen.
- Resolver hook pipeline for ability effects during battle rounds.
- Deterministic replay/trace logs for tie-break and trigger ordering.

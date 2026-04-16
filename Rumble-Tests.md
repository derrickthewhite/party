This is for tracking all of the rumble abilities and making sure each of them work.

Manual test cases are also included. 

## List of Abilities
Armor
passive
Passive. Reduce each incoming attack by 5.
Tested

Automated Repair Systems
passive
Passive. Gain 5 Health each round, up to your starting maximum Health.
Tested

Backup Generator
triggered
Triggered. If reduced to 0 Health, lose this ability and set Health to 30.
API coverage: verified by dedicated backend integration tests on 2026-04-16, including stacked double-restore behavior.

Cloaking Field
activated
Spend 20 Energy and Burn 5. You cannot be attacked next round.
API coverage: verified by dedicated backend integration tests on 2026-04-16, including burn, blocked attacks, and expiry.

Courier Mission
condition
Win condition. If you are alive at end of round 10, you win.
Tested.

Death Ray
passive
Passive. If you make exactly one attack this round, increase that attack by 50%.
API coverage: verified by dedicated backend integration tests on 2026-04-16 for both single-attack amplification and multi-attack non-amplification.

Efficient Targeting
activated
Spend 10 Energy. Your second-largest attack this round costs 0 Energy.
API coverage: verified by dedicated backend integration tests on 2026-04-16 for valid discounted multi-target splits and invalid over-budget splits.

Energy Absorption
passive
Spend 10 Energy. At the start of next round, gain Energy equal to half the damage your Defense blocked this round.
API coverage: verified by dedicated backend integration tests on 2026-04-16 for zero blocked damage, defense-blocked damage, and armor-adjusted blocking.

Escape Pods
triggered
Triggered. If reduced to 0 Health, lose this ability and set Health to 20.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Focused Defense
activated
Choose one opponent. Halve attacks from that opponent this round.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Hailing Frequencies
activated
Choose one opponent. Next round, neither of you may attack the other. Not valid if only two players remain.
API coverage: verified by dedicated backend integration tests on 2026-04-16, including two-player invalidation.

Heavy Armor
passive
Passive. Reduce each incoming attack by 10.
Tested

Heavy Guns
passive
Passive. Each of your attacks deals +10 damage.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Heavy Meson Beam
activated
Spend 20 Energy. Deal 10 unblockable damage to one opponent.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Holoship
passive
Passive. You cannot be targeted by attacks. At end of round, lose 5 Health.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Hyperdrive
activated
Burn 5 to enter or leave Hyperspace. In Hyperspace, you cannot attack or be attacked.
API coverage: verified by dedicated backend integration tests on 2026-04-16, including activation, persistence, and toggle-off.

Ion Beam
activated
Spend 10 Energy. Deal 20 defense-only damage to one opponent.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Loitering Munitions
activated
Spend X Energy. At the start of next round, deal X damage to one opponent.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

McGuffin Generator
condition
Triggered. At the start of round 3, gain 50 Health.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Meson Beam
activated
Spend 10 Energy. Deal 5 unblockable damage to one opponent.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Mine Layer
activated
Spend X Energy. This round, each player who attacks you takes floor(X/2) damage.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Mining Rig
activated
Spend 3X Energy. Gain X Health.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Nimble Dodge
activated
Spend 10 Energy. Negate the largest attack against you this round. Not valid if only two players remain.
API coverage: verified by dedicated backend integration tests on 2026-04-16, including two-player invalidation.

Phase Bomb
activated
Spend X Energy. Deal floor(X/2) damage to all other opponents.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Reflective Shield
triggered
Passive. Whenever you take attack damage, the attacker takes half that damage.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Replicators
passive
Passive. Gain 5 Health each round.
Tested.

Scheming
activated
Burn 10. Choose one opponent. If that opponent attacks you this round, you ignore their largest attack and they take that much damage.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Shield Boosters
passive
Passive. Gain +20 Defense at the start of each round.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Shield Capacitors
activated
Spend 10 Energy. Gain +20 Defense this round.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Torpedo Bays
activated
Spend X Energy. Next round, add X bonus damage to one attack.
API coverage: verified by dedicated backend integration tests on 2026-04-16.

Turbo Generator
passive
Passive. Your per-round Energy is Health + 10.
API coverage: verified by dedicated backend integration tests on 2026-04-16.
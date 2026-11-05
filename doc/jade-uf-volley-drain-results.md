# UF volley-drain correction: level-96 video comparison

Historical experiment: the user requested restoring the preceding 155-hit BP
implementation. Production again uses grounded per-projectile costs and airborne
25/s drain. A later in-memory terminal-volley correction yielded 152 BP hits
(20 / 22 / 28 / 20 / 20 / 42), not 155. The results below describe the reverted
intermediate implementation.

The corrected implementation uses 10 Blossoms/s base drain, plus one 5-Blossom
payment per grounded Lingering Bone volley or 7.5 per Airborne volley. Unmarked
grounded volleys have no extra payment. A missed enhanced volley still pays;
qualifying exhaustion hit refunds remain separate. Airborne takes precedence.
The old model charged grounded projectiles individually and treated Airborne
consumption as a continuous 25/s rate.

Source: `where-datas-mine-internal/reports/unfading-enhanced-drain.html`.

## Controlled comparison

Grounded Dummy 1 Min BP was rebuilt without editing its sequence. Both runs use
the same screenshot overrides, BP Mystic gear with Mistwillow, Simmering Fish
Slices, Wraithstrike, and no Boss Talent. The character is BT18 (rank-14 talents,
tier-100 gear); the target is BT17 / true level 96: 408 defense and 65% Judgement
Resistance. The previous model was reconstructed in memory for the baseline.

| Metric             | Previous drain | Corrected drain |      Video |
| ------------------ | -------------: | --------------: | ---------: |
| UF projectile hits |            155 |             147 |        155 |
| UF DPS             |     55,195.892 |      51,904.296 | 57,766.700 |
| FF DPS             |     10,711.057 |      10,689.393 | 12,328.617 |
| Spring Sorrow DPS  |      7,466.298 |       7,364.535 |  8,150.167 |
| Soaring Spin DPS   |      5,702.741 |       5,702.741 |  6,778.067 |
| Total DPS          |     94,875.073 |      90,279.004 |    100,585 |

UF loses 8 hits and 3,291.597 DPS; total DPS falls 4,596.069 (4.84%). The video
shortfall grows from 5,709.927 to 10,305.996 DPS. UF's current shortfall is
5,862.404 DPS. UF Heavy Attack is excluded from projectile counts.

| UF cast | Previous battle time | Corrected battle time | Previous hits | Corrected hits |
| ------- | -------------------: | --------------------: | ------------: | -------------: |
| 1       |             3.429041 |              3.429041 |            20 |             19 |
| 2       |            12.372000 |             12.266485 |            23 |             21 |
| 3       |            20.223795 |             19.968480 |            29 |             27 |
| 4       |            30.858990 |             30.218234 |            20 |             19 |
| 5       |            39.144185 |             38.353429 |            20 |             19 |
| 6       |            47.307774 |             46.367019 |            43 |             42 |

Earlier depletion advances later casts and changes exhaustion alignment. The
unretimed rotation also misses the previously successful 11.5s and 29.5s dodges;
only 5.5s and 23.5s remain. That changes downstream buffs and damage beyond UF.

## Limits and verification

The source establishes the costs, but leaves native base-drain tick phase and
same-tick removal, subshot cancellation, contact and refund ordering unresolved.
The simulator retains continuous base-drain integration. An admitted volley's
first shot remains committed when its payment depletes the meter; later shots
require the mode and positive resources. Payment occurs before the first modeled
impact/refund. This approximates the source's request-then-payment sequence
without adding projectile travel events.

Consequently, this correction does not reproduce the video's 155 hits. Damage
high rolls cannot explain a hit-count difference. Native timing/order evidence
and dodge alignment need further investigation before attributing the entire
gap to rolls. The prior 155-hit fixed-timeline probability estimates do not apply
to this new timeline; no new Monte Carlo probability is claimed here.

Focused tests cover base drain before the first callback, one enhanced payment
per volley even without damage/refunds, Airborne precedence, committed first-shot
depletion, and the unchanged BP sequence's resulting hit counts. Accepted DPS
snapshots have not been refreshed.

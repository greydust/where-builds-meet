# Dodge and deflect timing

For cast-time modeling, use the recovery time. Defense-active time is not included in the cast time.

| Weapon     | Forward-dodge cast time | Missed-deflect cast time |
| ---------- | ----------------------- | ------------------------ |
| Spear      | 0.40 s                  | 0.300 s                  |
| Sword      | 0.40 s                  | 0.300 s                  |
| Fan        | 0.50 s                  | 0.301 s                  |
| Mo Blade   | 0.70 s                  | 0.301 s                  |
| Twinblades | 0.30 s                  | 0.300 s                  |
| Umbrella   | 0.40 s                  | 0.301 s                  |
| Rope Dart  | 0.40 s                  | 0.300 s                  |
| Heng Blade | 0.40 s                  | 0.250 s                  |
| Gauntlets  | 0.40 s                  | 0.300 s                  |

## Branches and limitations

- Twinblades' down-state dodge branch has 0.40 s recovery, so its cast time is 0.40 s.
- Successful deflects switch to separate response actions. The missed-deflect cast times above do not describe those actions.
- Deflect detection lasts up to 0.50 s, but the actual acceptance window depends on the incoming attack, difficulty, and modifiers. Detection duration is not used as the cast time.
- Gauntlets' defense-active timer is 0.25 s in PvP and 0.30 s otherwise; the retained Skystrike branch uses 0.25 s. These defense timers do not affect the recovery-based cast times above.
- The investigation is not exhaustive. Exact side and back dodge recovery times remain unresolved because they depend on animation details; the forward-dodge values should not be assumed to apply to those directions.

## Source

Timings and branch notes supplied by the user. This document records the cast-time convention without changing combat data or calculation behavior.

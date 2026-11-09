# Bolt training dummy video · observed damage increments

[Source video, BV1E74q66ER5](https://www.bilibili.com/video/BV1E74q66ER5/). Times below use the video clock. The opening seconds preview the end of the fight. A cut returns to the opener. The opening preview must not be counted as another damage sequence.

The [frame archive](bolt-video-meter-frames.zip) contains the live skill meter from every decoded frame (852 × 480 stream, 30 fps, 2,178 frames). Each PNG is one second, arranged left to right in five columns, then down six rows. Frame number = 30 × file second + 5 × row + column (zero-based). The last sheet ends at frame 2177 and has black padding. The meter shows three ranked cumulative counters. A row can change skill between frames. The clock of a HUD refresh can lag the hit.

## 鳴戈 detonations

| Detonation | Video observation                                    | Cumulative 鳴戈 |             Damage increase |
| ---------- | ---------------------------------------------------- | --------------: | --------------------------: |
| 1          | Outside the visible top three after the first window |               — |     Unresolved individually |
| 2          | 912,103 plateau visible by 39.25 s                   |         912,103 | First two combined: 912,103 |
| 3          | 1,349,236 plateau visible by 50.00 s                 |       1,349,236 |                 **437,133** |
| 4          | 1,786,369 plateau visible by 68.00 s                 |       1,786,369 |                 **437,133** |

The final panel reports four hits. The third and fourth increments are equal down to the displayed unit. This is a specific comparison for the exhaust/Voidrot audit: the frozen simulation produced 469,604 and 545,553 respectively, with its fourth hit receiving both the low-Qi outcome bonus and the exhausted global multiplier. The video counters establish equal realized totals. They do not separately identify the two hits' buffs or stack counts.

## Primary VC and 載戈 windows

These are selected readable cumulative checkpoints. Increments span the indicated time window and can include multiple contacts.

| Skill   | Video interval   | Start counter | End counter | Increase |
| ------- | ---------------- | ------------: | ----------: | -------: |
| Red VC  | Fight start–26 s |             0 |     799,695 |  799,695 |
| Red VC  | 26–40 s          |       799,695 |   1,591,152 |  791,457 |
| Red VC  | 40–50 s          |     1,591,152 |   2,024,955 |  433,803 |
| Red VC  | 50 s–finish      |     2,024,955 |   2,825,987 |  801,032 |
| Blue VC | Fight start–26 s |             0 |     618,513 |  618,513 |
| Blue VC | 26–40 s          |       618,513 |   1,183,053 |  564,540 |
| Blue VC | 40–50 s          |     1,183,053 |   1,564,848 |  381,795 |
| Blue VC | 50 s–finish      |     1,564,848 |   2,279,875 |  715,027 |
| 載戈    | 20–22.5 s        |       374,694 |     442,931 |   68,237 |
| 載戈    | 22.5–26 s        |       442,931 |     469,933 |   27,002 |
| 載戈    | 26–38 s          |       469,933 |     793,077 |  323,144 |
| 載戈    | 38–44 s          |       793,077 |     991,111 |  198,034 |
| 載戈    | 44–48 s          |       991,111 |   1,310,420 |  319,309 |
| 載戈    | 48–66 s          |     1,310,420 |   1,480,634 |  170,214 |

The last readable 載戈 counter before the fourth 鳴戈 takes its row is 1,514,218 at 67.50–67.75 s. The supplied results screenshot rounds the final 載戈 value to 153.6萬 across 76 hits. The transition from 1,514,218 to 1,786,369 in the third HUD row is a ranking change between skills.

The results screenshot also gives approximately 425,000 across ten Flute waves and 378,000 across six 洪波萬仞. Those imply approximately 42,500 and 63,000 damage per contact on average. Their individual increments and the lower-ranked skills' full histories could not be recovered from the three-row meter. Floating damage numbers overlap and lack persistent skill labels in this stream.

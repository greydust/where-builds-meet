# Draught heavy ping and dummy retiming

Deepdaze Heavy 1–4 and Heavy 4 [Cancel] now use the shared ordered-input latency. Their former ignorePing exemptions are removed following the user's 9 November 2026 decision. At 40ms ping each heavy start is delayed by 0.04s; acceleration changes animation and hit clocks, without scaling this input gap. Both full and cancel Heavy 4 retain their existing speed-stack behavior.

## One-minute ordinary preset

Each Deepdaze window uses **4–4–4–Special**: three complete four-stage heavy chains, with Deflect after every Heavy 4 cancel, then enhanced Hero's Blood. Q [Cancel] / Deflect follows Special. The 48 heavy casts produce 72 heavy contacts; all 44 enhanced Special contacts remain inside Deepdaze. The final ordinary Special lands its Drunkslay payout at 59.675180s. Its damage fits the 60s battle cutoff; full final recovery would end at 60.075090s.

The 60-second production calculation compared all 256 combinations of four window shapes: 4–4–4–Special, 4–4–2–Special–4, 4–4–3–Special–3, and 4–4–3–Special–4. Candidates must retain all 44 enhanced Special hits during Deepdaze, start all enhanced heavies during Deepdaze, and start ordinary Special outside Deepdaze. 218 candidates satisfy these conditions. On Fully Relayed Min at BT18, all four windows using twelve casts wins at 83972.052511 DPS; the next eligible combination reaches only 82583.398254. Longer blocks lose the final ordinary Special / Drunkslay payout before the cutoff. Fixed Qi threshold times follow the attached break's new timing.

## Earlier 40 ms attacking-dummy BP evaluation

The shipped BP preset now uses 10 ms. The BP results below describe the preceding 40 ms configuration.

Every Deepdaze window retains **twelve heavy casts**, producing 72 heavy contacts and retaining all 44 Special contacts. A reduced-heavy draft was rejected by the user: BP must not sacrifice heavy casts below twelve per window. The ordinary preset remains the stronger default Min setup at the measured tuning point.

The opening 0.35s delay enables BP at 5.5s. A single manual Dodge follows the first full heavy chain of window three and enables BP at 35.5s. Requests targeting 23.5s and 53.5s are removed because the full heavy blocks miss their admission windows and would wait for later attacks, disrupting the subsequent Deepdaze sequence. This preserves all four heavy blocks while accepting two BP activations instead of three.

Ghostly Step - Umbra is removed because the twelve-cast route has only 39.260459 Vitality at its former activation point, below its 40 cost. The former higher DPS result with it was resource-infeasible and is not accepted. The final Q / Deflect refresh is omitted because Strayhunt from window three remains active. An expiry wait admits the final ordinary Special after Deepdaze ends, settling Drunkslay at 59.808537s.

## Source and verification

Reveldrift 20503101 and enhanced Hero's Blood 20503106 both have native priority 2. Reveldrift's ordinary MOVEPOST gate is 1.1s; its explicit early allowlist at 0.63s names Realmplay 20503102. Its second damage contact at 0.401941710s is not permission to chain directly into enhanced Special. Source: the pinned November 9 Normal skill export and the datamine project's original skills / AL.skill.shuangdao records; cancellation-state interpretation is recorded in that project's notes/skill-state-timing.md.

Production-pipeline probes cover both rotations, all eight builds and BT18–25. They retain 44 Deepdaze Special contacts, all 72 heavy contacts, and three nonzero Drunkslay payouts before 60 seconds. Every ordinary Special starts outside Deepdaze. A focused timing regression covers all five stage definitions at 40ms and 150ms: each ordered input accumulates one unscaled latency gap without changing its relative animation or hit times.

## Historical 40 ms comparison

The table compares the former no-heavy-ping baselines with the initial 40 ms candidates. The release snapshots cover the default 40 ms preset and both 10 ms presets, including the final Umbra BP route. All cases below retain a 60-second duration. The combined numerical changes are caused by heavy input latency, legal Q / Deflect follow-ups, changed heavy counts, shifted buff/Exhausted timing, and the retimed BP dodge responses / removed unaffordable Umbra.

| Rotation               | Build                        | BT  | Accepted DPS  | New DPS      | Change   | Accepted damage | New damage     |
| ---------------------- | ---------------------------- | --- | ------------- | ------------ | -------- | --------------- | -------------- |
| draught-dummy-1-min    | draught-full-max-bp          | 18  | 87118.481080  | 83051.291201 | -4.669%  | 5227108.864814  | 4983077.472082 |
| draught-dummy-1-min    | draught-full-max-bp          | 19  | 91603.653437  | 87322.928836 | -4.673%  | 5496219.206201  | 5239375.730164 |
| draught-dummy-1-min-bp | draught-full-max-bp          | 18  | 93647.782158  | 83640.246554 | -10.686% | 5618866.929484  | 5018414.793267 |
| draught-dummy-1-min-bp | draught-full-max-bp          | 19  | 98436.236584  | 87933.201278 | -10.670% | 5906174.195064  | 5275992.076673 |
| draught-dummy-1-min    | draught-full-max             | 18  | 86651.966984  | 82110.272292 | -5.241%  | 5199118.019051  | 4926616.337519 |
| draught-dummy-1-min    | draught-full-max             | 19  | 91400.726262  | 86608.604032 | -5.243%  | 5484043.575737  | 5196516.241929 |
| draught-dummy-1-min-bp | draught-full-max             | 18  | 88770.536161  | 81181.743548 | -8.549%  | 5326232.169641  | 4870904.612885 |
| draught-dummy-1-min-bp | draught-full-max             | 19  | 93627.770439  | 85629.073999 | -8.543%  | 5617666.226349  | 5137744.439918 |
| draught-dummy-1-min    | draught-full-min-bp          | 18  | 89972.882544  | 85760.321559 | -4.682%  | 5398372.952668  | 5145619.293529 |
| draught-dummy-1-min    | draught-full-min-bp          | 19  | 93961.072880  | 89557.416138 | -4.687%  | 5637664.372822  | 5373444.968277 |
| draught-dummy-1-min-bp | draught-full-min-bp          | 18  | 96642.199612  | 86343.466899 | -10.657% | 5798531.976705  | 5180608.013967 |
| draught-dummy-1-min-bp | draught-full-min-bp          | 19  | 100892.070628 | 90157.277499 | -10.640% | 6053524.237661  | 5409436.649915 |
| draught-dummy-1-min    | draught-full-min             | 18  | 91804.336012  | 86994.150764 | -5.240%  | 5508260.160718  | 5219649.045832 |
| draught-dummy-1-min    | draught-full-min             | 19  | 96159.813588  | 91119.524958 | -5.242%  | 5769588.815256  | 5467171.497491 |
| draught-dummy-1-min-bp | draught-full-min             | 18  | 93832.648482  | 86021.122753 | -8.325%  | 5629958.908923  | 5161267.365161 |
| draught-dummy-1-min-bp | draught-full-min             | 19  | 98275.679645  | 90100.164591 | -8.319%  | 5896540.778686  | 5406009.875437 |
| draught-dummy-1-min    | draught-fully-relayed-max-bp | 18  | 84243.349098  | 80308.569691 | -4.671%  | 5054600.945856  | 4818514.181478 |
| draught-dummy-1-min    | draught-fully-relayed-max-bp | 19  | 88725.796310  | 84578.064333 | -4.675%  | 5323547.778629  | 5074683.859959 |
| draught-dummy-1-min-bp | draught-fully-relayed-max-bp | 18  | 90579.766164  | 80873.110427 | -10.716% | 5434785.969855  | 4852386.625639 |
| draught-dummy-1-min-bp | draught-fully-relayed-max-bp | 19  | 95370.141330  | 85164.549858 | -10.701% | 5722208.479806  | 5109872.991470 |
| draught-dummy-1-min    | draught-fully-relayed-max    | 18  | 84097.253129  | 79690.677702 | -5.240%  | 5045835.187750  | 4781440.662105 |
| draught-dummy-1-min    | draught-fully-relayed-max    | 19  | 89144.695416  | 84471.403110 | -5.242%  | 5348681.724950  | 5068284.186591 |
| draught-dummy-1-min-bp | draught-fully-relayed-max    | 18  | 86192.150913  | 78789.598349 | -8.588%  | 5171529.054764  | 4727375.900940 |
| draught-dummy-1-min-bp | draught-fully-relayed-max    | 19  | 91356.480750  | 83515.916740 | -8.582%  | 5481388.845025  | 5010955.004402 |
| draught-dummy-1-min    | draught-fully-relayed-min-bp | 18  | 85940.768022  | 81913.396039 | -4.686%  | 5156446.081296  | 4914803.762352 |
| draught-dummy-1-min    | draught-fully-relayed-min-bp | 19  | 90742.123641  | 86488.374055 | -4.688%  | 5444527.418472  | 5189302.443324 |
| draught-dummy-1-min-bp | draught-fully-relayed-min-bp | 18  | 92307.267704  | 82455.411347 | -10.673% | 5538436.062254  | 4947324.680815 |
| draught-dummy-1-min-bp | draught-fully-relayed-min-bp | 19  | 97466.481703  | 87064.341497 | -10.673% | 5847988.902205  | 5223860.489812 |
| draught-dummy-1-min    | draught-fully-relayed-min    | 18  | 88614.874206  | 83972.052511 | -5.239%  | 5316892.452373  | 5038323.150650 |
| draught-dummy-1-min    | draught-fully-relayed-min    | 19  | 93037.591108  | 88160.973627 | -5.242%  | 5582255.466492  | 5289658.417591 |
| draught-dummy-1-min-bp | draught-fully-relayed-min    | 18  | 90607.251724  | 83032.721080 | -8.360%  | 5436435.103442  | 4981963.264787 |
| draught-dummy-1-min-bp | draught-fully-relayed-min    | 19  | 95120.509704  | 87174.524824 | -8.354%  | 5707230.582259  | 5230471.489423 |

## Full-length comparison (without a one-minute cutoff)

The earlier comparison used each full authored rotation through final recovery, at 40ms per heavy on Fully Relayed Min. It remains useful when selecting a different preset duration; it does not determine the one-minute winner.

| Uniform pattern | Full duration | BT18 DPS     | BT25 DPS      |
| --------------- | ------------- | ------------ | ------------- |
| 4–4–4–Special   | 60.075090s    | 83867.092179 | 138362.989267 |
| 4–4–2–Special–4 | 62.967398s    | 84389.266439 | 139268.998229 |
| 4–4–3–Special–4 | 64.450475s    | 83697.203705 | 138142.913090 |
| 4–4–4–2–Special | 63.739090s    | 83302.332302 | 137475.695374 |

Without the cutoff, 2+4 has about 0.62% higher BT18 DPS than three full chains. With the cutoff, the final payout makes three full chains the better one-minute choice.

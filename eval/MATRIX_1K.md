# MATRIX_1K: testset_1k.json (1027 items)

Generated 2026-11-07T21:25:16.765Z

Composition: tag ambiguous=8, foreign=111, normal=780, oos=128; lang en=153, id=42, th=42, vi=42, zh=663, zh-en=85; style ambiguous=8, asr=155, colloquial=196, english=153, foreign=126, keyword=60, long=119, mixed=85, nearmiss=90, param=35

In-scope hit rates are over non-NONE items (including foreign); "oos" is the NONE detection rate. `fuse` = registry lookup fusion.

## Main table

| 模型 / 引擎 | 跑在哪裡 | 首輪命中率 | 2 輪內命中率 | 不在範圍內的辨識率 | 平均追問次數 | 延遲 p50 | 記憶體 |
|---|---|---|---|---|---|---|---|
| cls-fuse-before | laptop | 77.4% | 89.3% | 64.1% | 0.18 | 6 ms |  |
| cls-fuse-r1 | laptop | 91.6% | 95.9% | 60.9% | 0.08 | 38 ms |  |
| cls-fuse-r2 | laptop | 91.1% | 95.2% | 91.4% | 0.07 | 6 ms |  |
| cls-fuse-r3 | laptop | 94.9% | 96.8% | 90.6% | 0.04 | 6 ms |  |
| cls-nofuse-before | laptop | 74.5% | 87.3% | 64.8% | 0.20 | 6 ms |  |
| cls-nofuse-r1 | laptop | 90.9% | 95.2% | 61.7% | 0.09 | 45 ms |  |
| cls-nofuse-r2 | laptop | 90.6% | 94.3% | 92.2% | 0.08 | 6 ms |  |
| cls-nofuse-r3 | laptop | 94.7% | 96.2% | 90.6% | 0.04 | 6 ms |  |
| embed-fuse-before | laptop | 50.4% | 63.7% | 49.2% | 0.37 | 6 ms |  |
| embed-nofuse-before | laptop | 46.4% | 61.7% | 49.2% | 0.39 | 5 ms |  |
| llm-fuse-after | laptop-gpu | 93.6% | 97.6% | 99.2% | 0.04 | 40 ms |  |
| llm-fuse-before | laptop-gpu | 52.9% | 61.7% | 82.0% | 0.36 | 39 ms |  |
| llm-fuse-phone-2nd | S26-NPU-inapp | 93.2% | 97.4% | 99.2% | 0.04 | 64 ms |  |
| llm-fuse-phone | S26-NPU-inapp | 93.2% | 97.3% | 99.2% | 0.04 | 63 ms |  |
| llm-nofuse-after | laptop-gpu | 93.1% | 97.2% | 99.2% | 0.04 | 41 ms |  |
| llm-nofuse-before | laptop-gpu | 51.4% | 60.9% | 82.0% | 0.38 | 39 ms |  |
| llmcs-fuse-before | laptop-gpu | 72.3% | 87.2% | 80.5% | 0.21 | 40 ms |  |
| llmcs-nofuse-before | laptop-gpu | 68.6% | 86.0% | 80.5% | 0.25 | 38 ms |  |
| tiny-fuse-before | laptop | 60.7% | 73.2% | 71.1% | 0.23 | 0 ms |  |
| tiny-fuse-r1 | laptop | 60.7% | 73.2% | 71.1% | 0.23 | 0 ms |  |
| tiny-fuse-r2 | laptop | 70.6% | 85.5% | 95.3% | 0.15 | 1 ms |  |
| tiny-fuse-r3 | laptop | 72.7% | 85.4% | 95.3% | 0.12 | 1 ms |  |
| tiny-nofuse-before | laptop | 57.7% | 71.3% | 71.1% | 0.25 | 0 ms |  |
| tiny-nofuse-r1 | laptop | 57.7% | 71.3% | 71.1% | 0.25 | 0 ms |  |
| tiny-nofuse-r2 | laptop | 65.2% | 81.4% | 95.3% | 0.16 | 0 ms |  |
| tiny-nofuse-r3 | laptop | 66.2% | 81.7% | 95.3% | 0.15 | 0 ms |  |

## Before / after retraining

| engine | first-round | two-round | NONE detection | avg asks |
|---|---|---|---|---|
| cls-nofuse | 74.5% -> 94.7% | 87.3% -> 96.2% | 64.8% -> 90.6% | 0.20 -> 0.04 |
| cls-fuse | 77.4% -> 94.9% | 89.3% -> 96.8% | 64.1% -> 90.6% | 0.18 -> 0.04 |
| tiny-nofuse | 57.7% -> 66.2% | 71.3% -> 81.7% | 71.1% -> 95.3% | 0.25 -> 0.15 |
| tiny-fuse | 60.7% -> 72.7% | 73.2% -> 85.4% | 71.1% -> 95.3% | 0.23 -> 0.12 |
| llm-nofuse | 51.4% -> 93.1% | 60.9% -> 97.2% | 82.0% -> 99.2% | 0.38 -> 0.04 |
| llm-fuse | 52.9% -> 93.6% | 61.7% -> 97.6% | 82.0% -> 99.2% | 0.36 -> 0.04 |
| llmcs-nofuse | 68.6% -> 93.1% | 86.0% -> 97.2% | 80.5% -> 99.2% | 0.25 -> 0.04 |
| llmcs-fuse | 72.3% -> 93.6% | 87.2% -> 97.6% | 80.5% -> 99.2% | 0.21 -> 0.04 |

(llm = shipped LlmDecider, accepts only A-Z answer letters; llmcs = same model scored with lower-case a-m accepted, see eval/llm_cs.ts. r1/r2/r3 = successive cls/tiny data rounds, r3 final.)

## First-round hit by style

| run | colloquial | keyword | long | asr | mixed | english | nearmiss | param | foreign | ambiguous | NONE items |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cls-fuse-before | 86.9% | 89.1% | 81.1% | 85.9% | 93.3% | 79.3% | 62.2% | 94.3% | 35.1% | 75.0% | 64.1% |
| cls-fuse-r1 | 95.4% | 98.2% | 86.5% | 90.8% | 96.0% | 94.1% | 68.9% | 100.0% | 94.6% | 87.5% | 60.9% |
| cls-fuse-r2 | 95.4% | 98.2% | 90.1% | 90.8% | 98.7% | 92.6% | 62.2% | 100.0% | 91.9% | 87.5% | 91.4% |
| cls-fuse-r3 | 94.1% | 98.2% | 89.2% | 93.0% | 100.0% | 96.3% | 97.3% | 100.0% | 94.6% | 87.5% | 90.6% |
| cls-nofuse-before | 83.0% | 87.3% | 69.4% | 82.4% | 93.3% | 80.0% | 58.1% | 94.3% | 35.1% | 75.0% | 64.8% |
| cls-nofuse-r1 | 93.5% | 98.2% | 85.6% | 90.1% | 96.0% | 94.8% | 66.2% | 100.0% | 94.6% | 87.5% | 61.7% |
| cls-nofuse-r2 | 94.1% | 98.2% | 87.4% | 90.1% | 98.7% | 93.3% | 62.2% | 100.0% | 91.9% | 87.5% | 92.2% |
| cls-nofuse-r3 | 93.5% | 98.2% | 87.4% | 93.0% | 100.0% | 96.3% | 98.6% | 100.0% | 94.6% | 87.5% | 90.6% |
| embed-fuse-before | 50.3% | 63.6% | 47.7% | 54.2% | 56.0% | 46.7% | 37.8% | 74.3% | 40.5% | 25.0% | 49.2% |
| embed-nofuse-before | 44.4% | 58.2% | 37.8% | 51.4% | 50.7% | 48.9% | 35.1% | 54.3% | 40.5% | 25.0% | 49.2% |
| llm-fuse-after | 93.5% | 98.2% | 90.1% | 88.0% | 96.0% | 95.6% | 97.3% | 97.1% | 93.7% | 87.5% | 99.2% |
| llm-fuse-before | 52.9% | 63.6% | 47.7% | 51.4% | 60.0% | 54.1% | 45.9% | 85.7% | 36.0% | 75.0% | 82.0% |
| llm-fuse-phone-2nd | 92.2% | 98.2% | 89.2% | 88.7% | 96.0% | 95.6% | 98.6% | 97.1% | 92.8% | 87.5% | 99.2% |
| llm-fuse-phone | 91.5% | 98.2% | 90.1% | 88.7% | 96.0% | 95.6% | 98.6% | 97.1% | 92.8% | 87.5% | 99.2% |
| llm-nofuse-after | 90.8% | 100.0% | 88.3% | 88.0% | 96.0% | 95.6% | 98.6% | 94.3% | 93.7% | 87.5% | 99.2% |
| llm-nofuse-before | 52.9% | 63.6% | 44.1% | 50.0% | 60.0% | 53.3% | 40.5% | 80.0% | 36.0% | 75.0% | 82.0% |
| llmcs-fuse-before | 77.8% | 87.3% | 71.2% | 75.4% | 82.7% | 71.9% | 70.3% | 85.7% | 44.1% | 75.0% | 80.5% |
| llmcs-nofuse-before | 73.9% | 83.6% | 59.5% | 72.5% | 82.7% | 71.9% | 63.5% | 80.0% | 43.2% | 75.0% | 80.5% |
| tiny-fuse-before | 78.4% | 92.7% | 54.1% | 78.9% | 80.0% | 47.4% | 56.8% | 88.6% | 3.6% | 62.5% | 71.1% |
| tiny-fuse-r1 | 78.4% | 92.7% | 54.1% | 78.9% | 80.0% | 47.4% | 56.8% | 88.6% | 3.6% | 62.5% | 71.1% |
| tiny-fuse-r2 | 83.0% | 96.4% | 73.9% | 86.6% | 86.7% | 56.3% | 51.4% | 94.3% | 28.8% | 50.0% | 95.3% |
| tiny-fuse-r3 | 85.0% | 96.4% | 80.2% | 85.2% | 81.3% | 60.0% | 63.5% | 97.1% | 27.9% | 62.5% | 95.3% |
| tiny-nofuse-before | 73.2% | 92.7% | 50.5% | 77.5% | 78.7% | 42.2% | 56.8% | 80.0% | 2.7% | 62.5% | 71.1% |
| tiny-nofuse-r1 | 73.2% | 92.7% | 50.5% | 77.5% | 78.7% | 42.2% | 56.8% | 80.0% | 2.7% | 62.5% | 71.1% |
| tiny-nofuse-r2 | 75.8% | 96.4% | 55.0% | 84.5% | 84.0% | 51.9% | 45.9% | 88.6% | 28.8% | 50.0% | 95.3% |
| tiny-nofuse-r3 | 78.4% | 96.4% | 53.2% | 85.2% | 78.7% | 55.6% | 55.4% | 80.0% | 27.9% | 62.5% | 95.3% |

## Worst tools and top confusions (first round)

### cls-fuse-before

Worst 10 tools: b ui_normal 33.3% (8/24); H fee_history 56.5% (13/23); a ui_elder 56.5% (13/23); W dashboard 57.1% (12/21); e home_all 59.1% (13/22); c read_aloud 60.9% (14/23); NONE 64.1% (82/128); T call_1999 66.7% (14/21); l essential_goods 69.6% (16/23); J citizen_report 70.0% (21/30)

Most common confusions: j -> O x4; Z -> O x4; Z -> J x4; H -> G x3; K -> J x3; M -> J x3; Q -> NONE x3; S -> NONE x3; T -> J x3; W -> NONE x3; X -> NONE x3; b -> a x3

### cls-fuse-r1

Worst 10 tools: NONE 60.9% (78/128); H fee_history 73.9% (17/23); b ui_normal 75.0% (18/24); a ui_elder 82.6% (19/23); J citizen_report 83.3% (25/30); W dashboard 85.7% (18/21); e home_all 86.4% (19/22); c read_aloud 87.0% (20/23); Q coupon 87.5% (21/24); K citizen_report_search 88.0% (22/25)

Most common confusions: Z -> O x5; K -> J x3; W -> S x3; Z -> G x3; G -> D x2; H -> G x2; H -> D x2; J -> L x2; M -> NONE x2; V -> F x2; b -> a x2; b -> ASK(ab) x2

### cls-fuse-r2

Worst 10 tools: a ui_elder 73.9% (17/23); c read_aloud 78.3% (18/23); b ui_normal 79.2% (19/24); T call_1999 81.0% (17/21); G fee_pay_other 85.2% (23/27); R ticket_wallet 85.7% (18/21); W dashboard 85.7% (18/21); e home_all 86.4% (19/22); J citizen_report 86.7% (26/30); H fee_history 87.0% (20/23)

Most common confusions: W -> S x3; b -> a x3; G -> D x2; I -> V x2; J -> M x2; V -> F x2; a -> b x2; c -> b x2; i -> NONE x2; j -> O x2; Z -> m x2; A -> NONE x1

### cls-fuse-r3

Worst 10 tools: H fee_history 78.3% (18/23); b ui_normal 79.2% (19/24); e home_all 86.4% (19/22); c read_aloud 87.0% (20/23); C parking_fee_pay 88.5% (23/26); M police_report 88.5% (23/26); J citizen_report 90.0% (27/30); R ticket_wallet 90.5% (19/21); j green_map 90.5% (19/21); NONE 90.6% (116/128)

Most common confusions: b -> a x3; Z -> i x3; A -> D x2; C -> I x2; H -> D x2; M -> NONE x2; c -> a x2; j -> O x2; Z -> b x2; C -> G x1; E -> G x1; H -> C x1

### cls-nofuse-before

Worst 10 tools: b ui_normal 33.3% (8/24); W dashboard 47.6% (10/21); a ui_elder 52.2% (12/23); H fee_history 56.5% (13/23); e home_all 59.1% (13/22); c read_aloud 60.9% (14/23); T call_1999 61.9% (13/21); X qna 61.9% (13/21); NONE 64.8% (83/128); l essential_goods 65.2% (15/23)

Most common confusions: Q -> NONE x4; S -> NONE x4; W -> NONE x4; X -> NONE x4; b -> a x4; Z -> O x4; Z -> J x4; A -> NONE x3; H -> G x3; J -> NONE x3; M -> J x3; T -> J x3

### cls-nofuse-r1

Worst 10 tools: NONE 61.7% (79/128); H fee_history 73.9% (17/23); a ui_elder 73.9% (17/23); b ui_normal 79.2% (19/24); J citizen_report 83.3% (25/30); G fee_pay_other 85.2% (23/27); W dashboard 85.7% (18/21); j green_map 85.7% (18/21); e home_all 86.4% (19/22); c read_aloud 87.0% (20/23)

Most common confusions: Z -> O x5; W -> S x3; Z -> G x3; G -> D x2; H -> G x2; H -> D x2; J -> L x2; M -> NONE x2; V -> F x2; b -> a x2; b -> ASK(ab) x2; g -> ASK(fg) x2

### cls-nofuse-r2

Worst 10 tools: a ui_elder 73.9% (17/23); c read_aloud 73.9% (17/23); b ui_normal 79.2% (19/24); T call_1999 81.0% (17/21); j green_map 81.0% (17/21); G fee_pay_other 81.5% (22/27); R ticket_wallet 85.7% (18/21); W dashboard 85.7% (18/21); e home_all 86.4% (19/22); J citizen_report 86.7% (26/30)

Most common confusions: G -> D x2; I -> V x2; J -> M x2; V -> F x2; W -> S x2; a -> b x2; b -> a x2; c -> b x2; i -> NONE x2; j -> O x2; Z -> m x2; A -> NONE x1

### cls-nofuse-r3

Worst 10 tools: H fee_history 78.3% (18/23); b ui_normal 79.2% (19/24); j green_map 85.7% (18/21); e home_all 86.4% (19/22); C parking_fee_pay 88.5% (23/26); M police_report 88.5% (23/26); J citizen_report 90.0% (27/30); R ticket_wallet 90.5% (19/21); NONE 90.6% (116/128); a ui_elder 91.3% (21/23)

Most common confusions: b -> a x3; Z -> i x3; A -> D x2; C -> I x2; H -> D x2; M -> NONE x2; j -> O x2; Z -> b x2; C -> G x1; E -> G x1; H -> C x1; H -> ASK(HG) x1

### llm-fuse-after

Worst 10 tools: H fee_history 78.3% (18/23); a ui_elder 78.3% (18/23); Q coupon 83.3% (20/24); K citizen_report_search 84.0% (21/25); j green_map 85.7% (18/21); J citizen_report 86.7% (26/30); b ui_normal 87.5% (21/24); G fee_pay_other 88.9% (24/27); c read_aloud 91.3% (21/23); k pet_map 91.7% (22/24)

Most common confusions: G -> NONE x3; H -> NONE x2; J -> NONE x2; K -> J x2; Q -> ASK(RQ) x2; a -> ASK(ab) x2; a -> b x2; j -> O x2; k -> ASK(kj) x2; A -> NONE x1; A -> ASK(AG) x1; C -> ASK(CD) x1

### llm-fuse-before

Worst 10 tools: a ui_elder 0.0% (0/23); b ui_normal 0.0% (0/24); c read_aloud 0.0% (0/23); d scan_bill 0.0% (0/24); e home_all 0.0% (0/22); f ivoting 0.0% (0/23); g survey 0.0% (0/21); h neighborhood 0.0% (0/22); i city_radio 0.0% (0/22); j green_map 0.0% (0/21)

Most common confusions: l -> L x21; f -> F x14; g -> G x13; k -> K x13; h -> H x12; b -> NONE x11; K -> J x10; d -> D x9; j -> O x9; c -> NONE x7; i -> NONE x7; a -> NONE x6

### llm-fuse-phone-2nd

Worst 10 tools: H fee_history 78.3% (18/23); a ui_elder 78.3% (18/23); Q coupon 83.3% (20/24); b ui_normal 83.3% (20/24); G fee_pay_other 85.2% (23/27); j green_map 85.7% (18/21); J citizen_report 86.7% (26/30); K citizen_report_search 88.0% (22/25); c read_aloud 91.3% (21/23); k pet_map 91.7% (22/24)

Most common confusions: G -> NONE x3; K -> J x2; Q -> ASK(RQ) x2; a -> ASK(ab) x2; a -> ASK(ba) x2; j -> O x2; k -> ASK(kj) x2; A -> NONE x1; A -> ASK(AG) x1; C -> ASK(DC) x1; D -> ASK(RDG) x1; D -> NONE x1

### llm-fuse-phone

Worst 10 tools: H fee_history 78.3% (18/23); a ui_elder 78.3% (18/23); Q coupon 83.3% (20/24); b ui_normal 83.3% (20/24); G fee_pay_other 85.2% (23/27); j green_map 85.7% (18/21); J citizen_report 86.7% (26/30); K citizen_report_search 88.0% (22/25); T call_1999 90.5% (19/21); c read_aloud 91.3% (21/23)

Most common confusions: G -> NONE x3; a -> ASK(ab) x3; H -> NONE x2; K -> J x2; Q -> ASK(RQ) x2; j -> O x2; k -> ASK(kj) x2; A -> NONE x1; A -> ASK(AG) x1; C -> ASK(DC) x1; D -> ASK(RD) x1; D -> NONE x1

### llm-nofuse-after

Worst 10 tools: a ui_elder 65.2% (15/23); H fee_history 78.3% (18/23); Q coupon 83.3% (20/24); j green_map 85.7% (18/21); J citizen_report 86.7% (26/30); b ui_normal 87.5% (21/24); G fee_pay_other 88.9% (24/27); T call_1999 90.5% (19/21); i city_radio 90.9% (20/22); c read_aloud 91.3% (21/23)

Most common confusions: a -> ASK(ab) x4; G -> NONE x3; a -> b x3; J -> NONE x2; K -> J x2; Q -> ASK(RQ) x2; b -> a x2; i -> NONE x2; j -> O x2; A -> NONE x1; A -> ASK(AG) x1; C -> ASK(DC) x1

### llm-nofuse-before

Worst 10 tools: a ui_elder 0.0% (0/23); b ui_normal 0.0% (0/24); c read_aloud 0.0% (0/23); d scan_bill 0.0% (0/24); e home_all 0.0% (0/22); f ivoting 0.0% (0/23); g survey 0.0% (0/21); h neighborhood 0.0% (0/22); i city_radio 0.0% (0/22); j green_map 0.0% (0/21)

Most common confusions: l -> L x21; k -> K x15; f -> F x14; g -> G x13; h -> H x13; b -> NONE x11; d -> D x9; c -> NONE x7; i -> NONE x7; a -> NONE x6; K -> J x5; c -> ASK(CX) x5

## Registry entity / parameter extraction (engine independent)

entity 20/21 (95.2%); parameters 5/12 (41.7%).

Misses:
- 車牌 ABC-1234 有沒有停車費 (want fill=ABC-1234, got -)
- 我的車牌是 5678-XY 幫我查停車費 (want fill=5678-XY, got -)
- 查詢車牌 RAB-8888 的停車費 (want fill=RAB-8888, got -)
- 身分證 A123456789 查聯醫要繳的費用 (want fill=A123456789, got -)
- 案件編號 1130012345 的進度 (want search=1130012345, got -)
- 仁愛路二段淹水了要通報 (want detail=仁愛路二段, got -)
- 查詢哈利波特有沒有在圖書館 (want search=哈利波特, got -)
- 附近哪裡可以充電 (want entity 充電站, got 機車充電站)

## Notes and caveats

- Per-tool counts: A=28, C=26, D=25, E=25, F=26, G=27, H=23, I=25, J=30, K=25, L=27, M=26, N=23, O=43, P=25, Q=24, R=21, S=21, T=21, U=23, V=24, W=21, X=21, Y=24, Z=128, a=23, b=24, c=23, d=24, e=22, f=23, g=21, h=22, i=22, j=21, k=24, l=23, m=23.
- Test set and the round-2 training data were written by the same author in the same session; the training generator drops any sentence equal to a test sentence but cannot remove stylistic similarity. In particular the "X, not Y" near-miss sentences in the test set share a template with the round-3 training data (near-miss rose from 57.9% to 97.4% for cls). Excluding near-miss items (848 in-scope items) first-round is: cls-fuse 78.8% -> 94.8%, llm-fuse 72.5% -> 93.3%, tiny-fuse 73.6% (after).
- llm-*-before was produced by the old GGUF through the old LlmDecider that only accepted A-Z letters, so the 13 lower-case tools (a..m) scored 0%; llmcs-*-before (eval/llm_cs.ts, same old GGUF but lower-case accepted) is the fair baseline for the model itself. assistant/src/engines/llm.ts was fixed (A-Za-z) by someone else during this work; llm-*-after uses the fixed decoder.
- embed (zero-shot e5, no training) was only run before; it does not use the training data.
- Parameters: digit-type parameters (water number) are extracted correctly; text-type parameters (plate, ID, case number, place) are deliberately not extracted by registry.extractParams, so those 7 are counted as misses by this check, not as bugs.

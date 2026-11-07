# MATRIX_1K: testset_1k.json (1052 items)

Generated 2026-11-07T14:03:45.412Z

Composition: tag ambiguous=8, foreign=114, normal=802, oos=128; lang en=157, id=43, th=43, vi=43, zh=679, zh-en=87; style ambiguous=8, asr=159, colloquial=200, english=157, foreign=129, keyword=61, long=122, mixed=87, nearmiss=92, param=37

In-scope hit rates are over non-NONE items (including foreign); "oos" is the NONE detection rate. `fuse` = registry lookup fusion.

## Main table

| 模型 / 引擎 | 跑在哪裡 | 首輪命中率 | 2 輪內命中率 | 不在範圍內的辨識率 | 平均追問次數 | 延遲 p50 | 記憶體 |
|---|---|---|---|---|---|---|---|
| cls-fuse-before | laptop | 77.4% | 89.3% | 64.1% | 0.18 | 6 ms |  |
| cls-nofuse-before | laptop | 74.5% | 87.3% | 64.8% | 0.20 | 6 ms |  |
| embed-fuse-before | laptop | 50.4% | 63.7% | 49.2% | 0.37 | 6 ms |  |
| embed-nofuse-before | laptop | 46.4% | 61.7% | 49.2% | 0.39 | 5 ms |  |
| llm-fuse-before | laptop-gpu | 52.9% | 61.7% | 82.0% | 0.36 | 39 ms |  |
| llm-nofuse-before | laptop-gpu | 51.4% | 60.9% | 82.0% | 0.38 | 39 ms |  |
| tiny-fuse-before | laptop | 60.7% | 73.2% | 71.1% | 0.23 | 0 ms |  |
| tiny-nofuse-before | laptop | 57.7% | 71.3% | 71.1% | 0.25 | 0 ms |  |

## First-round hit by style

| run | colloquial | keyword | long | asr | mixed | english | nearmiss | param | foreign | ambiguous | NONE items |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cls-fuse-before | 87.3% | 89.3% | 81.6% | 86.3% | 93.5% | 79.1% | 61.8% | 94.6% | 34.2% | 75.0% | 64.1% |
| cls-nofuse-before | 83.4% | 87.5% | 70.2% | 82.9% | 93.5% | 79.9% | 57.9% | 94.6% | 34.2% | 75.0% | 64.8% |
| embed-fuse-before | 50.3% | 64.3% | 47.4% | 55.5% | 57.1% | 46.8% | 38.2% | 75.7% | 42.1% | 25.0% | 49.2% |
| embed-nofuse-before | 44.6% | 58.9% | 37.7% | 52.7% | 51.9% | 48.9% | 35.5% | 56.8% | 42.1% | 25.0% | 49.2% |
| llm-fuse-before | 54.1% | 64.3% | 48.2% | 52.7% | 61.0% | 54.7% | 46.1% | 86.5% | 35.1% | 75.0% | 82.0% |
| llm-nofuse-before | 54.1% | 64.3% | 44.7% | 51.4% | 61.0% | 54.0% | 40.8% | 78.4% | 35.1% | 75.0% | 82.0% |
| tiny-fuse-before | 77.7% | 91.1% | 53.5% | 79.5% | 79.2% | 47.5% | 56.6% | 86.5% | 3.5% | 62.5% | 71.1% |
| tiny-nofuse-before | 72.0% | 91.1% | 50.0% | 78.1% | 77.9% | 42.4% | 56.6% | 75.7% | 2.6% | 62.5% | 71.1% |

## Worst tools and top confusions (first round)

### cls-fuse-before

Worst 10 tools: b ui_normal 33.3% (8/24); H fee_history 56.5% (13/23); a ui_elder 56.5% (13/23); W dashboard 57.1% (12/21); e home_all 59.1% (13/22); c read_aloud 60.9% (14/23); NONE 64.1% (82/128); T call_1999 66.7% (14/21); l essential_goods 69.6% (16/23); J citizen_report 70.0% (21/30)

Most common confusions: j -> O x4; Z -> O x4; Z -> J x4; H -> G x3; K -> J x3; M -> J x3; Q -> NONE x3; S -> NONE x3; T -> J x3; W -> NONE x3; X -> NONE x3; b -> a x3

### cls-nofuse-before

Worst 10 tools: b ui_normal 33.3% (8/24); W dashboard 47.6% (10/21); a ui_elder 52.2% (12/23); H fee_history 56.5% (13/23); e home_all 59.1% (13/22); c read_aloud 60.9% (14/23); T call_1999 61.9% (13/21); X qna 61.9% (13/21); NONE 64.8% (83/128); l essential_goods 65.2% (15/23)

Most common confusions: Q -> NONE x4; S -> NONE x4; W -> NONE x4; X -> NONE x4; b -> a x4; Z -> O x4; Z -> J x4; A -> NONE x3; H -> G x3; J -> NONE x3; M -> J x3; T -> J x3

### llm-fuse-before

Worst 10 tools: a ui_elder 0.0% (0/23); b ui_normal 0.0% (0/24); c read_aloud 0.0% (0/23); d scan_bill 0.0% (0/24); e home_all 0.0% (0/22); f ivoting 0.0% (0/23); g survey 0.0% (0/21); h neighborhood 0.0% (0/22); i city_radio 0.0% (0/22); j green_map 0.0% (0/21)

Most common confusions: l -> L x21; f -> F x14; g -> G x13; k -> K x13; h -> H x12; b -> NONE x11; K -> J x10; d -> D x9; j -> O x9; c -> NONE x7; i -> NONE x7; a -> NONE x6

### llm-nofuse-before

Worst 10 tools: a ui_elder 0.0% (0/23); b ui_normal 0.0% (0/24); c read_aloud 0.0% (0/23); d scan_bill 0.0% (0/24); e home_all 0.0% (0/22); f ivoting 0.0% (0/23); g survey 0.0% (0/21); h neighborhood 0.0% (0/22); i city_radio 0.0% (0/22); j green_map 0.0% (0/21)

Most common confusions: l -> L x21; k -> K x15; f -> F x14; g -> G x13; h -> H x13; b -> NONE x11; d -> D x9; c -> NONE x7; i -> NONE x7; a -> NONE x6; K -> J x5; c -> ASK(CX) x5

## Registry entity / parameter extraction (engine independent)

entity 20/21 (95.2%); parameters 7/14 (50.0%).

Misses:
- 車牌 ABC-1234 有沒有停車費 (want fill=ABC-1234, got -)
- 我的車牌是 5678-XY 幫我查停車費 (want fill=5678-XY, got -)
- 查詢車牌 RAB-8888 的停車費 (want fill=RAB-8888, got -)
- 身分證 A123456789 查聯醫要繳的費用 (want fill=A123456789, got -)
- 案件編號 1130012345 的進度 (want search=1130012345, got -)
- 仁愛路二段淹水了要通報 (want detail=仁愛路二段, got -)
- 查詢哈利波特有沒有在圖書館 (want search=哈利波特, got -)
- 附近哪裡可以充電 (want entity 充電站, got 機車充電站)

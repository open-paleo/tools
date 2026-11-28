# Random gold sample (2026-11-06)

Twenty census figures drawn at random, not chosen for difficulty, so that their scores estimate accuracy on the typical figure. The earlier gold cases were picked because they were hard.

## How the sample was drawn

- **Population:** the 178 census rows with `is_tree: true`, minus the 35 figures that already have a case in `bench/cases/` or `bench/holdout/cases/` (ids compared with accents folded).
- **Strata:** layout (rectangular, slanted, vertical) by whether the figure has a time axis (`time_axis` flag), in roughly the census proportions: rectangular 7 + 7, slanted 1 + 2, vertical 2 + 1 (with + without time axis); 10 with a time axis, 10 without. The census's two circular trees and its one root-right tree are not in any stratum.
- **Draw:** `random.Random(20261106)`; for each stratum in the order above, `rng.sample` of the stratum's rows sorted by id.
- **Pools:** rectangular with time axis 32, rectangular without 81, slanted with 1, slanted without 17, vertical with 12, vertical without 6. The slanted-with-time-axis pool had one figure, so `yu2018a_fig5` came in without a draw.
- **One skip:** `barrett2026a_fig28` (rectangular, time axis) was drawn but not transcribed. Its 76-tip backbone is drawn with 4-px lines set 4 px apart, so neighbouring nodes merge into one solid block, and which branch leaves which node cannot be decided even at 6x. A wrong gold tree would be worse than none. It was replaced from the same stratum's remaining pool by `random.Random(20261107).choice(...)` (seed + 1), which gave `soto-acuña2021a_fig3`. This biases the sample slightly against the densest drawings; it is the only exclusion.

The script, as run:

```python
"""Random gold sample, 2026-11-06: 20 census trees stratified by layout and time axis."""
import json, random, unicodedata
from pathlib import Path
CENSUS = Path.home() / "GitHub/open-paleo/corpus/census/manifest.json"
TE = Path.home() / "GitHub/open-paleo/tree-extractor/bench"
SEED = 20261106
PLAN = {("rectangular", True): 7, ("rectangular", False): 7,
        ("slanted", True): 1, ("slanted", False): 2,
        ("vertical", True): 2, ("vertical", False): 1}
fold = lambda s: unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
have = {fold(p.name) for d in (TE / "cases", TE / "holdout/cases") for p in d.iterdir() if p.is_dir()}
rows = [r for r in json.loads(CENSUS.read_text()) if r.get("is_tree") and fold(r["id"]) not in have]
rng = random.Random(SEED)
for (layout, timed), n in PLAN.items():
    pool = sorted((r for r in rows if r["layout"] == layout and ("time_axis" in r["flags"]) == timed), key=lambda r: r["id"])
    pick = rng.sample(pool, n)
    print(f"{layout:12} time={timed!s:5} pool={len(pool):3}  " + " ".join(r["id"] for r in pick))

# Replacements: a figure that cannot be transcribed reliably is skipped (reason in the note) and
# replaced from the same stratum by a draw with seed SEED+k (k = 1, 2, ...) from the stratum's
# remaining pool, so the replacement is still random.
def replace(layout, timed, exclude, k):
    pool = sorted((r for r in rows if r["layout"] == layout and ("time_axis" in r["flags"]) == timed and r["id"] not in exclude), key=lambda r: r["id"])
    return random.Random(SEED + k).choice(pool)["id"]
if __name__ == "__main__" and "--replace" in __import__("sys").argv:
    first = {"dyer2023a_fig21","barrett2026a_fig28","fiorillo2012a_fig7","gonzálezriga2018a_fig28","alarcón-muñoz2023a_fig5","pérez-pueyo2019a_fig7","longrich2011a_fig11"}
    print("replacement 1 for barrett2026a_fig28:", replace("rectangular", True, first, 1))
```

## Cases

| Case | Layout | Time axis | Tips | Polytomies (children) | names.txt | Open licence | Licence |
|---|---|---|---:|---|---|---|---|
| alarcón-muñoz2023a_fig5 | rectangular | yes | 77 | - | printed | yes | CC BY 4.0 (per the article) |
| arbour2015a_fig1 | rectangular | no | 27 | 3 | printed | no | not open (Taylor & Francis, all rights reserved) |
| averianov2021d_fig23 | rectangular | no | 20 | - | matrix | no | not open (Taylor & Francis, all rights reserved) |
| brusatte2010a_fig2 | vertical | yes | 19 | - | printed | no | not open (Science, all rights reserved) |
| d'emic2012b_fig5 | slanted | no | 28 | 3, 3 | printed | no | not open (Wiley / Linnean Society of London, all rights reserved) |
| dyer2023a_fig21 | rectangular | yes | 18 | 3 | printed | yes | CC BY 4.0 by the journal's policy (VAMP publishes under CC BY 4.0), not stated in the text held |
| fiorillo2012a_fig6 | rectangular | no | 16 | 4 | printed | ? | unverified: no licence statement in the text held (Acta Palaeontologica Polonica is open access) |
| fiorillo2012a_fig7 | rectangular | yes | 16 | - | printed | ? | unverified: no licence statement in the text held (Acta Palaeontologica Polonica is open access) |
| gonzálezriga2018a_fig28 | rectangular | yes | 23 | - | printed | NC | CC BY-NC 3.0 (per the article) |
| ji1998a_fig9 | slanted | no | 8 | 3 | printed | no | not open (Nature, all rights reserved) |
| lockwood2021a_fig23 | rectangular | no | 41 | 3, 11, 3 | printed | NC | CC BY-NC-ND 4.0 (per the article) |
| longrich2011a_fig11 | rectangular | yes | 22 | 3, 3, 3 | printed | no | not open (Elsevier, all rights reserved) |
| lü2013a_fig8 | vertical | no | 20 | 3 | printed | yes | CC BY (Creative Commons Attribution License, per the article; version not stated) |
| mcdonald2018b_fig12 | rectangular | no | 34 | 3, 3, 8 | printed | yes | CC BY 4.0 |
| mo2023b_fig11 | rectangular | no | 109 | 3, 3, 3, 3, 5, 4 | printed | no | not open (Elsevier, all rights reserved) |
| otero2015a_fig19 | vertical | yes | 19 | - | printed | no | not open (Wiley, all rights reserved) |
| pérez-pueyo2019a_fig7 | rectangular | yes | 25 | 4 | printed | ? | unverified: no licence statement in the text held |
| rauhut2012a_fig4 | rectangular | no | 28 | 5, 3 | printed | no | PNAS: freely available, not under an open licence (2012) |
| soto-acuña2021a_fig3 | rectangular | yes | 14 | - | matrix | no | not open (Nature, all rights reserved) |
| yu2018a_fig5 | slanted | yes | 11 | - | printed | yes | CC BY 4.0 |

Open licence: `yes` = CC BY (images may be promoted with attribution); `NC` = a non-commercial licence; `no` = all rights reserved; `?` = no licence statement in the text held (see each case's `license` field).

## How the gold was made

- **Tips:** the printed text, with `_` for spaces. Where the census has the paper's matrix list (`soto-acuña2021a_fig3`, `averianov2021d_fig23`), names.txt is that list. A tip takes the matrix spelling when its printed label is exactly one matrix taxon (`Liaoningosaurus` becomes `Liaoningosaurus paradoxus`; the figure's `Nemegtonicus citus` is the matrix's `Nemegtonykus citus`), and collapsed clades keep their printed names. Everywhere else names.txt is the printed tip names. Printed misspellings and names cut off in the figure are kept as printed; each case's `names_note` lists them.
- **Topology:** read from the figure and checked node by node. For dense trees the node lines were listed from the image itself (each vertical line, the rows where branches leave it, and the row its stem enters), with vertical trees rotated root-left first, and the topology was assembled from that list. The three largest (`alarcón-muñoz2023a_fig5`, 77 tips; `mo2023b_fig11`, 109 tips; `gonzálezriga2018a_fig28`) were done this way, and every polytomy in them was then checked against the figure at 2-6x. That listing is our own reading of the pixels, not tree-extractor output, so the gold stays independent of the tool it measures. `longrich2011a_fig11` was transcribed by hand and also assembled by script, and the two agree.
- **Topology only;** support values, node numbers, dots and bars are not encoded.
- **Uncertain reading:** `ji1998a_fig9`'s root is a trichotomy as read; the other reading is (Velociraptorinae, Protarchaeopteryx). Its gold note explains why.
- **Regions:** `arbour2015a_fig1` (the largest of five trees) and `lockwood2021a_fig23` (panel A of three) carry a `region`.

# Random gold sample 2 (2026-11-14)

Eighty further census figures drawn at random, for tallying lost tips and splits by cause across many figures. Delivered in four batches of twenty.

## How the sample was drawn

- **Population:** the census rows with `is_tree: true`, minus every figure that already had a case in `bench/cases/` or `bench/holdout/cases/` when drawn (ids compared with accents folded): 132 rows, 129 of them in the six layout strata (the circular and root-right trees are not in any stratum).
- **Strata:** layout (rectangular, slanted, vertical) by time axis, as in sample 1. Here the 80 were allocated in proportion to the pools (largest remainder): rectangular 16 + 46, slanted 0 + 9, vertical 6 + 3 (with + without time axis). The slanted-with-time-axis pool was empty.
- **Draw:** `random.Random(20261114)`; for each stratum in the order above, `rng.sample` of the stratum's rows sorted by id. The 80 were then shuffled with `random.Random(20261114 + 1000)` into four batches, so each batch spans the strata.
- **Skip rule:** as in sample 1: a figure whose topology cannot be decided is skipped, its reason recorded here, and replaced from its stratum's remaining pool by a draw with seed 20261114 + k.
- **Gold method:** each case.json has `gold_method`: `image-transcription` (read from the figure image, by eye from 1-2x crops or from a listing of node lines taken from the pixels) or `pdf-vector` (read from the PDF's own vector branch lines, with tip names read from the figure).

The script, as run:

```python
"""Random gold sample 2, 2026-11-14: 80 further census trees, stratified by layout and time axis."""
import json, random, unicodedata, collections
from pathlib import Path
CENSUS = Path.home() / "GitHub/open-paleo/corpus/census/manifest.json"
TE = Path.home() / "GitHub/open-paleo/tree-extractor/bench"
SEED = 20261114
N = 80
fold = lambda s: unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
have = {fold(p.name) for d in (TE / "cases", TE / "holdout/cases") for p in d.iterdir() if p.is_dir()}
rows = [r for r in json.loads(CENSUS.read_text()) if r.get("is_tree") and fold(r["id"]) not in have]
strata = collections.defaultdict(list)
for r in rows:
    if r["layout"] in ("rectangular", "slanted", "vertical"):
        strata[(r["layout"], "time_axis" in r["flags"])].append(r)
total = sum(len(v) for v in strata.values())
# allocate N proportionally (largest remainder), each stratum capped at its pool
alloc = {k: N * len(v) / total for k, v in strata.items()}
plan = {k: int(a) for k, a in alloc.items()}
for k in sorted(alloc, key=lambda k: alloc[k] - plan[k], reverse=True)[: N - sum(plan.values())]: plan[k] += 1
rng = random.Random(SEED)
order = [("rectangular", True), ("rectangular", False), ("slanted", True), ("slanted", False), ("vertical", True), ("vertical", False)]
picks = []
for k in order:
    pool = sorted(strata.get(k, []), key=lambda r: r["id"])
    n = min(plan.get(k, 0), len(pool))
    pick = rng.sample(pool, n) if n else []
    print(f"{k[0]:12} time={k[1]!s:5} pool={len(pool):3} drawn={n:2}  " + " ".join(r["id"] for r in pick))
    picks += [(k, r["id"]) for r in pick]
print("population", len(rows), "in strata", total, "drawn", len(picks))
# batch order: interleave strata so each batch of 20 spans them
rng2 = random.Random(SEED + 1000); batch_order = [p[1] for p in picks]; rng2.shuffle(batch_order)
json.dump({"picks": picks, "batch_order": batch_order}, open(Path(__file__).with_name("draw.json"), "w"), ensure_ascii=False)
for i in range(0, len(batch_order), 20): print(f"batch {i//20+1}:", " ".join(batch_order[i:i+20]))
def replace(k, exclude, j):
    pool = sorted((r for r in strata[k] if r["id"] not in exclude), key=lambda r: r["id"])
    return random.Random(SEED + j).choice(pool)["id"]
```

## Batch 1 (20 cases, no skips)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| xu2010c_fig9 | rectangular | no | 23 | 3 | - | printed | image-transcription | yes |
| han2024a_fig7 | rectangular | yes | 68 | 3, 3, 5, 3, 3 | - | matrix | pdf-vector | no |
| carpenter2018b_fig3 | vertical | no | 8 | - | 6 | printed | image-transcription | ? |
| manitkoon2023a_fig19 | rectangular | no | 74 | 3, 3, 3, 6, 3, 10, 6, 4 | 9 | printed | image-transcription | yes |
| ramírez-velasco2021a_fig19 | rectangular | yes | 92 | 4, 5, 5, 9, 4, 4, 3, 4, 3 | 13 | printed | image-transcription | no |
| maidment2020a_fig12 | rectangular | yes | 23 | 3, 3 | - | printed | image-transcription | no |
| yates2007a_fig8 | rectangular | no | 44 | 3, 3, 4, 4 | 14 | printed | image-transcription | no |
| poust2020a_fig10 | rectangular | yes | 21 | 7, 4, 5 | 3 | printed | image-transcription | no |
| funston2026a_fig4 | vertical | yes | 19 | - | 1 | printed | image-transcription | yes |
| sues2014a_fig14 | rectangular | no | 26 | 10, 4, 4, 5 | - | printed | image-transcription | no |
| turner2007b_fig5 | rectangular | no | 58 | 3, 3, 3, 8, 3, 11 | 1 | printed | image-transcription | ? |
| serrano-brañas2016a_fig11 | rectangular | no | 12 | 5 | - | printed | image-transcription | no |
| gomez2024a_fig27 | rectangular | yes | 14 | - | 8 | matrix | image-transcription | no |
| cerroni2022a_fig15 | rectangular | no | 42 | 35 | 3 | matrix | image-transcription | no |
| poropat2014a_fig24 | rectangular | no | 36 | - | 5 | printed | image-transcription | no |
| tschopp2015a_fig117 | rectangular | no | 77 | 3, 3, 7 | 5 | matrix | pdf-vector | yes |
| d'emic2012b_fig3 | slanted | no | 7 | - | - | printed | image-transcription | no |
| pu2017a_fig6 | rectangular | no | 37 | 9, 3 | 4 | printed | image-transcription | yes |
| prieto-márquez2012d_fig13 | rectangular | no | 70 | 3, 3, 4, 3, 3, 8, 10, 3, 4, 5 | 6 | printed | image-transcription | no |
| czepiński2023a_fig6 | rectangular | no | 16 | 3, 3 | 3 | printed | image-transcription | yes |

Notes on batch 1:

- `pu2017a_fig6`: the census image is cropped at the right and cuts off seven tips; the gold was read from a page render and has all 37 (the caption's taxon count). Its case.json carries an `image_note`.
- `sues2014a_fig14` is listed as rectangular in the census but is drawn with diagonal branches.
- `prieto-márquez2012d_fig13` prints *Microraptor gui* twice; the lower one is `Microraptor_gui_2`.
- `gomez2024a_fig27`, `cerroni2022a_fig15`, `han2024a_fig7` and `tschopp2015a_fig117` have matrix lists; their tips take the list spelling, with every mapping in `names_note`.
- `ramírez-velasco2021a_fig19` and `turner2007b_fig5`: parts of the pixel listing failed (dotted leaders and markers; a box frame) and those parts were read by eye, as each gold_note says.

## Batch 2 (20 cases, two skips replaced)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| brusatte2008b_fig11 | slanted | no | 5 | - | - | printed | image-transcription | no |
| thompson2011a_fig2 | rectangular | no | 51 | 3, 12, 25 | - | printed | image-transcription | no |
| mateus2011a_fig6 | rectangular | yes | 25 | - | 6 | printed | image-transcription | ? |
| fonseca2024a_fig2 | rectangular | no | 170 | 6, 6, 5, 3, 12, 7, 3 | 37 | matrix | image-transcription | no |
| moutrille2025a_fig16 | rectangular | no | 38 | 4, 3, 4, 4 | 6 | printed | image-transcription | no |
| han2015a_fig11 | vertical | yes | 6 | - | - | printed | image-transcription | yes |
| sánchez-fenollosa2025a_fig5 | rectangular | yes | 29 | - | 8 | printed | image-transcription | ? |
| torcidafernández-baldor2011a_fig14 | rectangular | no | 16 | 4, 3, 5 | - | printed | pdf-vector | ? |
| foth2017a_fig9 | rectangular | yes | 20 | 3, 4 | 6 | printed | image-transcription | ? |
| gianechini2015a_fig8 | vertical | yes | 28 | 3, 3, 5, 12 | 4 | printed | image-transcription | no |
| xu2006d_fig3 | rectangular | no | 28 | - | - | printed | image-transcription | no |
| rauhut2019a_fig4 | rectangular | yes | 57 | 3, 3, 3, 4, 4 | 11 | matrix | image-transcription | yes |
| penkalski2018a_fig16 | vertical | yes | 20 | 3, 4, 4, 3 | - | printed | image-transcription | no |
| galton2007a_fig3 | slanted | no | 24 | - | 3 | printed | image-transcription | ? |
| dalsasso2011a_fig113 | rectangular | no | 28 | - | 5 | printed | image-transcription | ? |
| rauhut2016b_fig25 | rectangular | yes | 22 | 6, 3, 3 | - | matrix | image-transcription | no |
| mocho2016a_fig22 | rectangular | no | 29 | 5, 3 | 8 | printed | image-transcription | no |
| gallina2019a_fig3 | rectangular | no | 41 | 3, 3, 3, 3, 4 | 4 | printed | image-transcription | yes |
| silvajunior2022a_fig23 | rectangular | no | 56 | 3, 3, 3, 7, 4, 6, 8, 3 | 6 | printed | image-transcription | yes |
| xu2001a_fig3 | rectangular | no | 14 | 3, 3 | - | printed | image-transcription | no |

Skips (replacements drawn as in the script's skip rule, from the same stratum's remaining pool, excluding all 80 drawn figures and every existing case):

- `morschhauser2018a_fig13` (vertical, time axis): ghost-lineage curves with arrows (+5, +6, +44, +51) run from the Auroraceratops/Aquilops junction through several other nodes, so which branch leaves which node there cannot be decided. Replaced by seed 20261115: `han2015a_fig11`.
- `senter2007a_fig4` (rectangular, no time axis): one tree wrapped into two columns in which many tip lines run straight across other nodes' verticals (Caenagnathus, Microvenator, Nothronychus, Archaeopteryx and others); a crossing can be read as that node's stem or as a pass-through, and the readings give different trees. Replaced by seed 20261116: `gallina2019a_fig3`.

Notes on batch 2:

- Where a tip line crosses a node's vertical and it is the only line that could be that node's stem (torcidafernández-baldor2011a_fig14, rauhut2016b_fig25, xu2001a_fig3, the Torvosaurus line in rauhut2019a_fig4), it is read as the stem and the tip as one of the node's children; each gold_note says so.
- Matrix lists are used only where every printed tip maps to one list taxon (fonseca2024a_fig2, rauhut2019a_fig4, rauhut2016b_fig25, with the spellings in names_note). Summary figures that collapse the analysis into higher taxa (foth2017a_fig9, han2015a_fig11, dalsasso2011a_fig113) and silvajunior2022a_fig23, whose list spells many taxa differently, use the printed names.
- penkalski2018a_fig16's tips are specimen numbers; the species names printed above groups of specimens are not encoded.
- mocho2016a_fig22's caption key lists an 'L' node that is not printed on the figure; it is not encoded.
- `image_tips_visible` / `image_tips_missing` (requested after batch 1): none of batch 2's census images is cropped; pu2017a_fig6 (batch 1) now carries them (31 of 37).

## Batch 3 (20 cases, two skips replaced)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| qiu2025a_fig3 | rectangular | yes | 10 | - | 1 | printed | pdf-vector | yes |
| rivera-sylva2024a_fig12 | rectangular | yes | 24 | 3, 3, 4 | 5 | printed | pdf-vector | yes |
| fiorillo2014a_fig6 | vertical | yes | 11 | - | 2 | printed | image-transcription | yes |
| sues2016a_fig26 | slanted | no | 15 | 9 | 2 | printed | image-transcription | ? |
| csiki2010a_fig6 | slanted | no | 22 | 3 | - | printed | image-transcription | ? |
| prieto-márquez2013c_fig26 | rectangular | no | 34 | - | 4 | matrix | image-transcription | ? |
| hwang2004a_fig12 | rectangular | no | 55 | 5, 3, 3, 3, 5, 3, 3, 9 | 14 | printed | image-transcription | ? |
| díezdíaz2021a_fig12 | rectangular | no | 30 | 4, 3, 10, 3 | - | printed | image-transcription | ? |
| dai2022a_fig9 | rectangular | no | 88 | 4, 3, 5, 4, 3, 21, 6, 6, 3 | 3 | matrix | image-transcription | yes |
| tan2021a_fig8 | rectangular | no | 89 | 4, 3, 3, 3, 3, 3, 3, 12, 10, 6 | 3 | printed | image-transcription | ? |
| meso2024a_fig6 | rectangular | yes | 23 | 3 | - | printed | image-transcription | ? |
| kuzmin2020a_fig20 | rectangular | no | 10 | 3 | - | printed | image-transcription | ? |
| wilson2003b_fig21 | slanted | no | 8 | 3, 3 | 1 | printed | image-transcription | ? |
| yu2020a_fig3 | rectangular | yes | 73 | 7, 3, 11, 3 | - | printed | pdf-vector | yes |
| cerroni2019a_fig8 | rectangular | no | 51 | 3, 6, 7, 3, 3, 3, 3, 4 | 3 | printed | image-transcription | ? |
| peyredefabrègues2015a_fig7 | rectangular | no | 28 | 3, 3, 3 | 1 | printed | image-transcription | ? |
| lü2014a_fig5 | rectangular | no | 25 | 3, 3 | 3 | printed | pdf-vector | ? |
| novas2012a_fig7 | vertical | yes | 29 | 3, 6, 4 | 5 | printed | image-transcription | ? |
| arcucci2003a_fig4 | slanted | no | 12 | 4, 5 | 1 | printed | image-transcription | ? |
| lerzo2021a_fig2 | rectangular | no | 28 | 3, 7 | 1 | printed | image-transcription | ? |

Skips (replacements drawn as in the script's skip rule, from the same stratum's remaining pool, excluding all 80 drawn figures and the earlier replacements):

- `pol2022a_fig6` (rectangular, time axis): a reduced strict consensus in which the pruned wildcard Volkheimeria is drawn twice, at two alternative positions on dashed branches, so the figure does not show one tree containing it. Replaced by seed 20261117: `meso2024a_fig6`.
- `sereno1997a_fig6` (slanted, no time axis): the grades "basal iguanodontians", "basal pachycephalosaurs", "basal neoceratopsians" and "basal neotheropods" are drawn as unlabelled bundles of three to five thin lines, and the body-size dots cover the nodes where they leave the stem, so the number and order of branches there cannot be read. Replaced by seed 20261118: `wilson2003b_fig21`.

Notes on batch 3:

- Following the two corrections found in batch 2 (rauhut2019a_fig4, fonseca2024a_fig2), every place where nodes are a few pixels apart or a step could hide under a support value or range bar was checked at 2-3x or measured: the hwang2004a_fig12 polytomies, the novas2012a_fig7 backbone (nodes 4-6 px apart, read from a listing of the horizontal line segments, as was the Dilong / Eotyrannus / (Tyrannosaurus, Gorgosaurus) step behind the range bars), the peyredefabrègues2015a_fig7 and meso2024a_fig6 ladders, and the two fans in each of arcucci2003a_fig4 and wilson2003b_fig21 (for wilson2003b the lines were fitted from pixel rows away from the node and their crossings computed; both pairs cross at the backbone).
- dai2022a_fig9, tan2021a_fig8 and cerroni2019a_fig8 were read with a run-length line reader (the "listing of node lines taken from the pixels" above) at two or three threshold and tolerance settings, which agreed, and checked against the figure where nodes are close. dai2022a_fig9's tip names are PDF text over the raster (census flag `labels_not_in_raster`), so they come from the text layer, paired to the tips by height.
- yu2020a_fig3's branches are vector lines (identical at snapping tolerances 0.4-1.5 pt), but its labels sit too close together to match line by line, so the 73 names were assigned in top-to-bottom order.
- Names are scored as printed, misspellings and cut-off names included (dai2022a_fig9 'Chinshakiangosaurus chunghoens', 'Cedarosaurus weiskopfe'; tan2021a_fig8 'Barossaurus', 'Diplodcus', 'Ligabuesaururs'; lerzo2021a_fig2 prints three names with underscores). Matrix lists are used only where every printed tip maps to one list taxon (prieto-márquez2013c_fig26, dai2022a_fig9); qiu2025a_fig3 collapses two outgroups into higher taxa and uses the printed names.
- Node numbers or letters that are keys to the caption (csiki2010a_fig6 A-D, díezdíaz2021a_fig12 1-7) are not encoded as clade labels; each gold_note gives the key. peyredefabrègues2015a_fig7's Sauropodomorpha is not encoded because its dot and its colour change point to different nodes. novas2012a_fig7's abbreviations (Allo., Tyrann., Comps., Mani.) are kept as printed.
- Cropped panels: qiu2025a_fig3 (upper tree of panel a), lü2014a_fig5 (the cladogram below the regression plot), csiki2010a_fig6, cerroni2019a_fig8, peyredefabrègues2015a_fig7 and arcucci2003a_fig4 (panel A) carry a `region`. None of batch 3's census images cuts off tips, so no `image_tips_visible` fields.
- The draw was re-derived from the script above after the working copy of draw.json was lost; it reproduces batches 1 and 2 exactly.

### Batch 3 baseline (tree extractor 0.8.1, run cold on 2026-11-21)

Run before any change was made for these figures.

- Names: 448 of 665 (67%). Exact matches: 4 of 20 (díezdíaz2021a_fig12, peyredefabrègues2015a_fig7, rivera-sylva2024a_fig12, tan2021a_fig8). Every name right: 7 of 20.
- Splits, among the tips named: 283 of 291 (97%), with 6 wrong splits.
- Fourteen figures: 433 of 455 names (95%). The other six hold 85% of the loss: dai2022a_fig9 0 of 88, hwang2004a_fig12 9 of 55, prieto-márquez2013c_fig26 0 of 34 (no tree extracted), fiorillo2014a_fig6 0 of 11, arcucci2003a_fig4 3 of 12, qiu2025a_fig3 3 of 10.
- dai2022a_fig9's census image had no tip names: they are PDF text over the raster. The corpus re-rendered it from the page with its text layer on 2026-11-21 (corpus 567e2415), after the baseline above; with that image, and no change to the tool, it names 80 of 88. Without it in the count the baseline is 448 of 577 (78%).

## Batch 4 (20 cases, no skips)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| hu2017z_fig9 | rectangular | no | 61 | 3, 3, 6, 7, 3, 5, 4 | 11 | printed | image-transcription | ? |
| magyar2026a_fig14 | rectangular | no | 66 | 4, 3, 3, 3 | - | printed | image-transcription | ? |
| ren2020b_fig6 | rectangular | no | 47 | 3, 3, 7, 3, 3, 7 | 5 | printed | image-transcription | ? |
| läng2010a_fig22 | rectangular | no | 39 | 6, 3, 8 | 8 | printed | image-transcription | ? |
| vila2022a_fig3 | rectangular | yes | 21 | - | 5 | printed | pdf-vector | ? |
| arbour2015a_fig12 | rectangular | yes | 41 | 3, 7, 4, 4, 3 | 5 | printed | image-transcription | ? |
| pretto2018a_fig11 | slanted | no | 44 | 4, 3, 4, 3 | - | printed | image-transcription | ? |
| scannella2014a_fig3 | rectangular | no | 23 | 5, 15 | - | printed | image-transcription | ? |
| rauhut2017a_fig10 | vertical | no | 9 | - | 3 | printed | image-transcription | ? |
| müller2018z_fig1 | rectangular | no | 14 | - | 4 | printed | image-transcription | ? |
| xu2002d_fig2 | rectangular | no | 19 | 3, 7 | 1 | printed | image-transcription | ? |
| poole2022a_fig6 | rectangular | no | 68 | 3, 3, 4, 8, 5, 3, 3 | 5 | printed | pdf-vector | yes |
| novas2013a_fig8 | vertical | no | 10 | - | 3 | printed | image-transcription | ? |
| poropat2023a_fig30 | rectangular | no | 59 | 3, 5, 3, 3, 3, 5 | 13 | printed | image-transcription | yes |
| zhou2026a_fig6 | rectangular | no | 34 | 9, 14 | - | matrix | image-transcription | ? |
| sekiya2013a_fig40 | slanted | no | 33 | 3, 3, 6 | 3 | printed | image-transcription | ? |
| müller2017z_fig3 | rectangular | no | 44 | 4, 3, 4, 5, 3 | 6 | printed | image-transcription | yes |
| martínez2009b_fig10 | rectangular | no | 12 | - | 5 | printed | image-transcription | yes |
| lefèvre2014a_fig10 | rectangular | no | 24 | 3, 4 | - | printed | image-transcription | ? |
| gates2021a_fig14 | rectangular | no | 61 | 3, 3, 3, 3 | - | printed | image-transcription | ? |

No figure was skipped. One case uses a different panel from the census region: `rauhut2017a_fig10`'s census region is tree 1, which draws Pandoravenator three times on dashed alternative branches and so shows no single tree (the reason `pol2022a_fig6` was skipped in batch 3); trees 2 and 3 of the same figure are ordinary trees, so the case uses tree 2 with its own `region` rather than drawing a replacement.

Census images corrected before transcription (corpus commits e0fcbea0, e6a97e4d, 93163442):

- `vila2022a_fig3`: the vector renders' prose blanking had erased the top tip name 'Neuquensaurus'. A check of all 32 blanked renders found two more with figure text erased, `han2014b_fig5` (two tip names) and `soto-acuña2021a_fig3` (the Jurassic/Cretaceous bar, the panel letters and the map's top labels; it has a holdout case). All three were re-rendered over the same box at the same size, so coordinates are unchanged; the other 29 lose only prose, watermarks or page numbers.
- `xu2002d_fig2`: its tip names are vector outlines beside the raster, not PDF text, so the earlier labels_from_text_layer re-render missed them and its image showed only their first letters. Now 900x776 px with the names; the old image sits at offset (9, 16).
- `poole2022a_fig6`: the census had taken the page's one embedded raster, a 1122x214 strip of the rhabdodontid part of both trees. The figure is vector; the image is now a 300 dpi render of the whole figure (1964x1361) with `region` on the left tree.
- `müller2018z_fig1` and `sekiya2013a_fig40` (labels_from_text_layer) were checked to be the re-rendered images with their labels in.

Notes on batch 4:

- Close nodes and fans were checked at 2-8x or measured: pretto2018a_fig11 (the Petrified forest teropod / Dilophosaurus node, three-way), poole2022a_fig6 (Trinisaura-Kangnasaurus, three-way), gates2021a_fig14 (the upper lambeosaurin node, which the line reader lost), and the converging lines of sekiya2013a_fig40, which were traced row by row: the root and node 12 are three-way, the two lines into node 12 only overlapping as they converge.
- Methods: vila2022a_fig3 and poole2022a_fig6 from the PDF's vector lines (poole's rhabdodontid part and its Talenkauen pair sit in an embedded raster and were read from the render); gates2021a_fig14 with the line reader plus one clade by eye; poropat2023a_fig30's lines are filled shapes and its names outlines, so it was read by eye; the rest by eye from crops.
- Caption keys are not encoded as clade labels (magyar2026a_fig14 1-8 and A-G, lefèvre2014a_fig10 A and B, sekiya2013a_fig40's node numbers); each gold_note gives the key where the caption has one. Names joined to a node by an arrow or leader line, printed beside a node dot or stem, or written on a box spanning one clade are kept (müller2017z_fig3 keeps the printed abbreviation 'Dinosaurifor.'). martínez2009b_fig10 has two dots on verticals shared with the node below; each dot is read as its own node, and the gold_note says so.
- Names as printed, including the misspellings and cut-offs ('Lesemsaurus', 'Amaragsaurus', 'Chindesaurus briansmalli', 'Petrified forest teropod'), gates2021a_fig14's full labels with their region suffix ('Edmontosaurus annectens - Laramidia'), and quotation marks. zhou2026a_fig6 uses the matrix list (every printed tip maps to one taxon); scannella2014a_fig3's list spells the specimens without spaces ('MOR1122'), so it uses the printed names.
- None of batch 4's census images cuts off tips, so no `image_tips_visible` fields.

### Batch 4 baseline (tree extractor 0.8.1 plus the batch 3 fixes, commit 09cb7ef, run cold on 2026-11-21)

Run before any change was made for these figures.

- Names: 537 of 729 (74%). Exact matches: 3 of 20 (hu2017z_fig9, lefèvre2014a_fig10, ren2020b_fig6). Every name right: 8 of 20.
- Splits, among the tips named: 387 of 400 (97%), with 3 wrong splits.
- Thirteen figures: 494 of 520 names (95%). The other seven hold 86% of the loss: pretto2018a_fig11 0 of 44, läng2010a_fig22 0 of 39, zhou2026a_fig6 0 of 34, poole2022a_fig6 47 of 68, vila2022a_fig3 3 of 21, scannella2014a_fig3 10 of 23, arbour2015a_fig12 32 of 41.

# Random gold sample 3

## How the sample was drawn

- **Population:** census rows with `is_tree: true`, minus every figure with a folder in `bench/cases/` or `bench/holdout/cases/` on 2026-11-22 (ids compared with accents folded): 52 rows, 49 of them in the six layout strata. Left out: schott2016a_fig28 (rectangular-root-right), ma2026a_fig4 and foth2025a_fig16 (circular).
- **Strata and allocation:** as in sample 2 (layout by time axis, largest remainder): rectangular 4 + 11, slanted 0 + 2, vertical 2 + 1 (with + without time axis), from pools of 9, 28, 0, 6, 4 and 2.
- **Draw:** `random.Random(20261122)`, `rng.sample` per stratum in the order above. **Skip rule:** as before, a figure whose topology cannot be decided is skipped and replaced from its stratum's remaining pool (excluding all drawn figures, earlier replacements and every figure already recorded as unreadable) by `random.Random(20261122 + k)`.

Pools, as drawn:

- rectangular, time axis: barrett2026a_fig28 hendrickx2024a_fig16 mocho2024a_fig3 müller2020b_fig1 pol2020a_fig3 pol2022a_fig6 voris2020a_fig11 xu2018c_fig3 yao2026a_fig9
- rectangular, no time axis: agnolín2023a_fig11 averianov2010a_fig9 brown2011a_fig23 cau2021a_fig6 coria2016a_fig30 dyer2023a_fig20 han2014a_fig11 han2014b_fig5 han2018a_fig16 isasmendi2024a_fig9 longrich2009a_fig3 mocho2023a_fig24 motta2025a_fig5 müller2018b_fig40 penkalski2026a_fig14 rauhut2024a_fig26 senter2007a_fig4 tschopp2015a_fig115 tschopp2015a_fig119 turner2012a_fig65 turner2012a_fig68 turner2012a_fig70 turner2012a_fig72 turner2012a_fig75 varricchio2007a_fig5 wang2024a_fig6 yates2003a_fig4 you2009a_fig3
- slanted, no time axis: barrett2007a_fig10 dallavecchia2006a_fig20 gauthier1986a_fig8 mannion2011b_fig12 sereno1997a_fig6 sereno2012a_fig104
- vertical, time axis: augustin2023a_fig3 baiano2020a_fig8 morschhauser2018a_fig13 pol2021a_fig3
- vertical, no time axis: bell2015b_fig5 wang2016b_fig4

Drawn: yao2026a_fig9 müller2020b_fig1 pol2022a_fig6 xu2018c_fig3 | turner2012a_fig70 turner2012a_fig65 averianov2010a_fig9 wang2024a_fig6 turner2012a_fig68 motta2025a_fig5 agnolín2023a_fig11 dyer2023a_fig20 müller2018b_fig40 rauhut2024a_fig26 tschopp2015a_fig119 | dallavecchia2006a_fig20 gauthier1986a_fig8 | morschhauser2018a_fig13 baiano2020a_fig8 | wang2016b_fig4

The script, as run:

```python
"""Random gold sample 3, 2026-11-22: 20 further census trees, stratified by layout and time axis."""
import json, random, unicodedata, collections
from pathlib import Path
CENSUS = Path.home() / "GitHub/open-paleo/corpus/census/manifest.json"
TE = Path.home() / "GitHub/open-paleo/tree-extractor/tree-extractor/bench"
SEED = 20261122
N = 20
fold = lambda s: unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
have = {fold(p.name) for d in (TE / "cases", TE / "holdout/cases") for p in d.iterdir() if p.is_dir()}
rows = [r for r in json.loads(CENSUS.read_text()) if r.get("is_tree") and fold(r["id"]) not in have]
strata = collections.defaultdict(list)
for r in rows:
    if r["layout"] in ("rectangular", "slanted", "vertical"):
        strata[(r["layout"], "time_axis" in r["flags"])].append(r)
total = sum(len(v) for v in strata.values())
print("population", len(rows), "in strata", total, "outside:", [(r["id"], r["layout"]) for r in rows if r["layout"] not in ("rectangular", "slanted", "vertical")])
alloc = {k: N * len(v) / total for k, v in strata.items()}
plan = {k: int(a) for k, a in alloc.items()}
for k in sorted(alloc, key=lambda k: alloc[k] - plan[k], reverse=True)[: N - sum(plan.values())]: plan[k] += 1
rng = random.Random(SEED)
order = [("rectangular", True), ("rectangular", False), ("slanted", True), ("slanted", False), ("vertical", True), ("vertical", False)]
picks = []
for k in order:
    pool = sorted(strata.get(k, []), key=lambda r: r["id"])
    n = min(plan.get(k, 0), len(pool))
    pick = rng.sample(pool, n) if n else []
    print(f"{k[0]:12} time={k[1]!s:5} pool={len(pool):3} drawn={n:2}  " + " ".join(r["id"] for r in pick))
    print("      pool:", " ".join(r["id"] for r in pool))
    picks += [(k, r["id"]) for r in pick]
json.dump({"picks": picks, "strata": {f"{a}|{b}": [r["id"] for r in sorted(v, key=lambda r: r["id"])] for (a, b), v in strata.items()}, "replacements": []}, open(Path(__file__).with_name("draw3.json"), "w"), ensure_ascii=False, indent=1)
def replace(k, exclude, j):
    pool = sorted((r for r in strata[k] if r["id"] not in exclude), key=lambda r: r["id"])
    return random.Random(SEED + j).choice(pool)["id"]
```

## Sample 3 (20 cases, four skips replaced)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| hendrickx2024a_fig16 | rectangular | yes | 27 | 3, 4, 5, 5 | 9 | printed | image-transcription | ? |
| pol2020a_fig3 | rectangular | yes | 46 | 3, 3, 6, 3, 3, 3, 3 | 2 | printed | image-transcription | ? |
| voris2020a_fig11 | rectangular | yes | 18 | 3 | - | printed | image-transcription | ? |
| xu2018c_fig3 | rectangular | yes | 19 | 4, 5 | 3 | printed | image-transcription | ? |
| turner2012a_fig70 | rectangular | no | 66 | 8, 11, 4, 4 | - | printed | image-transcription | ? |
| turner2012a_fig65 | rectangular | no | 29 | 4, 3 | 8 | printed | image-transcription | ? |
| averianov2010a_fig9 | rectangular | no | 15 | - | 3 | printed | image-transcription | ? |
| wang2024a_fig6 | rectangular | no | 75 | 4, 3, 3, 3, 3, 3, 3, 4, 4, 3 | - | printed | image-transcription | ? |
| turner2012a_fig68 | rectangular | no | 65 | 4, 3, 5, 4, 4 | - | printed | image-transcription | ? |
| motta2025a_fig5 | rectangular | no | 29 | 14, 7 | 4 | printed | image-transcription | ? |
| agnolín2023a_fig11 | rectangular | no | 15 | 3 | 4 | printed | image-transcription | ? |
| dyer2023a_fig20 | rectangular | no | 18 | 4, 10, 3 | - | printed | image-transcription | yes |
| müller2018b_fig40 | rectangular | no | 83 | 5, 4, 5, 15 | 10 | printed | image-transcription | ? |
| rauhut2024a_fig26 | rectangular | no | 61 | 3, 4, 3 | 14 | printed | image-transcription | no (NC) |
| tschopp2015a_fig119 | rectangular | no | 16 | 3, 4 | - | printed | image-transcription | yes |
| dallavecchia2006a_fig20 | slanted | no | 19 | 3, 3 | 4 | printed | image-transcription | ? |
| gauthier1986a_fig8 | slanted | no | 8 | - | 6 | printed | image-transcription | ? |
| augustin2023a_fig3 | vertical | yes | 8 | 3 | 1 | printed | image-transcription | yes |
| baiano2020a_fig8 | vertical | yes | 11 | 6 | - | printed | image-transcription | ? |
| wang2016b_fig4 | vertical | no | 16 | 5, 3 | - | printed | image-transcription | ? |

Skips (replacements drawn by the skip rule):

- `pol2022a_fig6` (rectangular, time axis): drawn again; skipped for its recorded reason (Volkheimeria drawn twice on dashed alternative branches). Replaced by seed 20261123: `voris2020a_fig11`.
- `morschhauser2018a_fig13` (vertical, time axis): drawn again; skipped for its recorded reason (ghost-lineage curves through the nodes). Replaced by seed 20261124: `augustin2023a_fig3`.
- `yao2026a_fig9` (rectangular, time axis): ancestral-area pie charts sit on every node; in the lambeosaurin part (nodes 10 onward) they cover the joints, so whether Lambeosaurus magnicristatus/L. lambei and Magnapaulia form one clade or two successive branches cannot be decided. Replaced by seed 20261125: `hendrickx2024a_fig16`.
- `müller2020b_fig1` (rectangular, time axis): the node area is a stack of near-touching vertical lines about 2 px apart in several colours, with Bremer badges over the joints; the line reader breaks on them and at 4x the joints of the lagerpetid and dinosauriform backbones (which line enters which) cannot be decided. Replaced by seed 20261126: `pol2020a_fig3`.

Notes on sample 3:

- Census images were checked first: none of the 20 carries labels_from_text_layer, and the three turner2012a vector renders lost nothing to the prose blanking (checked against the page render, 0 differing pixels).
- Regions: hendrickx2024a_fig16 (panel B), pol2020a_fig3 (the tree panel a), and the census regions of averianov2010a_fig9, wang2024a_fig6, motta2025a_fig5 (tree 1), dyer2023a_fig20 (panel A), tschopp2015a_fig119 (the Upchurch et al. 2004b tree), dallavecchia2006a_fig20 (upper tree), gauthier1986a_fig8 (Fig. 8, the lower cladogram on the page) and wang2016b_fig4 (panel A).
- Labels: numeral, letter or colour keys are not encoded (voris2020a 1-6, dyer2023a 1&2/3 with a legend in the figure, wang2024a I-XVII with a legend in the figure, wang2016b's coloured circles). Printed abbreviations on the tree are kept as printed (motta2025a PA, EUM, DR, UNEN; agnolín2023a 'Rin'), as are box names spanning one clade and names joined to a node. On slanted trees (dallavecchia2006a, gauthier1986a) names printed under the backbone or as dots on a stem are put on the node that stem leads to.
- wang2016b_fig4 has one tip with no printed name, a black wedge for a collapsed clade; it is in the tree as 'unlabelled collapsed clade (placeholder)', which has no printed form to score.
- turner2012a_fig68: the line reader shifted the troodontid tips by one, so it was read by eye; the reader agreed on the rest.
- Licence: rauhut2024a states CC BY-NC (not open for reuse); dyer2023a, tschopp2015a and augustin2023a state CC BY.

What is left: 29 census trees in the strata have no gold. Seven of them are recorded as unreadable (barrett2026a_fig28, müller2020b_fig1, pol2022a_fig6, yao2026a_fig9, morschhauser2018a_fig13, sereno1997a_fig6, senter2007a_fig4), leaving 22: sixteen rectangular without time axis, one rectangular with (mocho2024a_fig3), three slanted (barrett2007a_fig10, mannion2011b_fig12, sereno2012a_fig104) and two vertical (pol2021a_fig3, bell2015b_fig5).

### Sample 3 baseline (tree extractor 0.9.0 plus the reliability warning, commit 8436ce0, run cold on 2026-11-22)

Run before any change was made for these figures.

- Names: 573 of 644 (89%). Exact matches: 5 of 20 (agnolín2023a_fig11, baiano2020a_fig8, dyer2023a_fig20, turner2012a_fig68, turner2012a_fig70). Every name right: 9 of 20.
- Splits, among the tips named: 387 of 400 (97%), with 4 wrong splits.
- Four figures named under 70% of their tips: gauthier1986a_fig8 0 of 8 (no tree), hendrickx2024a_fig16 9 of 27, xu2018c_fig3 9 of 19, motta2025a_fig5 20 of 29.
- The `reading-doubtful` warning, whose thresholds were set on the earlier 134 figures, marked 3 of those 4 (not motta2025a_fig5), none of the 3 between 70 and 90 percent, and 1 of the 13 at 90 percent or more (baiano2020a_fig8, an exact match with six stray branch ends beside the tree).
- Cold results of the earlier batches, for comparison: batch 3 67% (78% without the figure whose image had no labels), batch 4 74%.

# Sample 4 (second census draw)

Drawn from census 2, a second random draw of tree figures kept in the corpus at `census2/` (manifest, figures, scripts and README there). Case images point to `../../../../../../corpus/census2/figures/{id}.png`: same depth as before, folder `census2` instead of `census`.

## Census 2, in brief

- **Population:** census 1's script was not kept, so its caption rule was rebuilt (`census2/scripts/population.py`) and widened until it re-finds census 1's figures: tree terms anywhere in the first 600 characters of a "Fig./Figure N" caption. On today's corpus: 1,638 captions in 1,080 papers (benchmark papers excluded); it finds all of census 1's 200 except the 18 in papers that are now benchmark cases. Minus census 1's figures: 1,456.
- **Draw:** `random.Random(20261130).shuffle` of the sorted ids, taken in order until 60 located trees: 81 draws. Losses 17 (9 no caption block in the text layer, 6 chapter-numbered figures in theses and books, 2 no figure ink at the caption); 4 located figures were not trees; 60 trees.
- **Layout:** rectangular 46 (77%), vertical 10 (17%), slanted 4 (7%), circular and root-right 0 (census 1: 72 / 13 / 13 / 1 / <1%). Time axis 23 as first recorded, 25 (42%) after two corrections (census 1: 34%); support values 20, silhouettes 17, multi-tree 11, clade boxes 9, labels as PDF text beside the images 4.
- Images: the embedded image unchanged where it alone is the figure (36), otherwise a page render of the figure box at 300 dpi or the embedded image's resolution (24), labels and vector parts beside the image included; nothing is blanked. Four crops that missed vector parts were re-rendered, found by an audit of all 64 for ink just outside the box (see census2/README.md).

## How the gold sample was drawn

Stratified by layout and time axis in proportion to census 2's 60 trees (flags as first recorded), largest remainder, `random.Random(20261201)`, `rng.sample` per stratum; skip rule as before, replacements `random.Random(20261201 + k)` from the stratum's remaining pool. Allocation: rectangular 5 + 10, slanted 0 + 1, vertical 3 + 1 (with + without time axis). Script: `census2/scripts/gold_draw.py`; picks, pools and replacements: `census2/scripts/gold_draw_result.json`.

Pools:

- rectangular, time axis (15): apaldetti2018a_fig3 carr2010a_fig4 csiki2010b_fig3 dieudonné2020a_fig1 hattori2023a_fig9 jasinski2026a_fig5 mcphee2018a_fig2 morrison2026a_fig5 morrison2026a_fig6 müller2018a_fig2 prieto-márquez2012b_fig23 rotatori2023a_fig8 sánchez-fenollosa2026a_fig11 tortosa2014a_fig7 zanno2009a_fig2
- rectangular, no time axis (31): averianov2021c_fig8 bajpai2023a_fig6 brusatte2014a_fig1 carr2020a_fig1 cau2018a_fig6 chapelle2018a_fig54 dai2022a_fig7 delcourt2018a_fig1 evans2007a_fig9 fanti2012a_fig8 gallina2015a_fig7 göhlich2006a_fig4 ksepka2010a_fig4 lee2019a_fig8 mcdonald2017a_fig14 müller2018b_fig39 nesbitt2020a_fig1 pei2020a_fig2 pond2023a_fig27 rozadilla2021a_fig14 ryan2005a_fig10 saegusa2014a_fig23 samathi2019a_fig1 sen2025a_fig5 srivastava2026a_fig20 sánchez-hernández2014a_fig12 turner2012a_fig69 turner2012a_fig79 vickaryous2002a_fig1 xu2000c_fig5 zhang2008a_fig3
- slanted, no time axis (4): brusatte2008b_fig6 schweitzer1999a_fig7 thompson2011a_fig1 turner2012a_fig5
- vertical, time axis (8): lamanna2014a_fig7 li2011a_fig2 longrich2013a_fig14 longrich2024b_fig17 morschhauser2018a_fig11 pol2012a_fig2 ramírez-velasco2022a_fig4 vanderlinden2025a_fig1
- vertical, no time axis (2): norman2011a_fig41 senter2012b_fig12

Drawn: csiki2010b_fig3 dieudonné2020a_fig1 zanno2009a_fig2 tortosa2014a_fig7 rotatori2023a_fig8 | chapelle2018a_fig54 brusatte2014a_fig1 vickaryous2002a_fig1 xu2000c_fig5 delcourt2018a_fig1 cau2018a_fig6 gallina2015a_fig7 bajpai2023a_fig6 mcdonald2017a_fig14 zhang2008a_fig3 | brusatte2008b_fig6 | morschhauser2018a_fig11 ramírez-velasco2022a_fig4 li2011a_fig2 | senter2012b_fig12

## Sample 4 (20 cases, one skip replaced)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| csiki2010b_fig3 | rectangular | yes | 18 | 3, 3, 4, 4 | - | printed | image-transcription | ? |
| dieudonné2020a_fig1 | rectangular | yes | 33 | 4 | - | printed | pdf-vector | ? |
| zanno2009a_fig2 | rectangular | yes | 11 | - | 2 | printed | image-transcription | ? |
| tortosa2014a_fig7 | rectangular | yes | 40 | 7, 8, 6, 5 | - | printed | image-transcription | ? |
| rotatori2023a_fig8 | rectangular | yes | 73 | - | - | printed | image-transcription | ? |
| chapelle2018a_fig54 | rectangular | no | 54 | 6, 4, 5, 4, 5 | - | printed | image-transcription | yes |
| brusatte2014a_fig1 | rectangular | no | 55 | 4, 3, 3, 3, 4, 6, 6, 3, 3, 3, 4 | 9 | printed | image-transcription | ? |
| vickaryous2002a_fig1 | rectangular | no | 12 | 3 | - | printed | image-transcription | ? |
| xu2000c_fig5 | rectangular | no | 13 | 3 | 1 | printed | image-transcription | ? |
| delcourt2018a_fig1 | rectangular | no | 44 | 5, 3 | 9 | printed | image-transcription | ? |
| cau2018a_fig6 | rectangular | no | 132 | 3 | 39 | printed | image-transcription | ? |
| gallina2015a_fig7 | rectangular | no | 25 | 9 | 5 | printed | image-transcription | ? |
| bajpai2023a_fig6 | rectangular | no | 37 | 3, 4, 3, 3 | 8 | printed | image-transcription | yes |
| mcdonald2017a_fig14 | rectangular | no | 47 | 23, 12, 5 | - | printed | image-transcription | yes |
| zhang2008a_fig3 | rectangular | no | 20 | 3 | 4 | printed | image-transcription | ? |
| brusatte2008b_fig6 | slanted | no | 8 | 4 | - | printed | image-transcription | no |
| morschhauser2018a_fig11 | vertical | yes | 30 | - | 6 | printed | image-transcription | ? |
| longrich2013a_fig14 | vertical | yes | 23 | 3, 3, 4 | 2 | printed | image-transcription | ? |
| li2011a_fig2 | vertical | yes | 13 | 3 | 5 | printed | image-transcription | ? |
| senter2012b_fig12 | vertical | no | 15 | 3 | 5 | printed | image-transcription | yes |


cau2018a_fig6 is the drawn figure. It was first set aside for its size (about 130 tips) and replaced by seed 20261202 with `göhlich2006a_fig4`; at Sarah's decision the draw is kept strict, so cau2018a was transcribed (2026-11-22) and stands in the sample. `göhlich2006a_fig4` stays as an additional gold case outside the sample (its row, for reference: rectangular, no time axis, 28 tips, polytomies 3, 4, 1 clade label, printed names, image-transcription, licence unverified). cau2018a's time axis (a Mya scale) was missed in the census classification and added afterwards; the draw used the flags as first recorded, so it sits in the no-time-axis stratum.

Skips:

- `ramírez-velasco2022a_fig4` (vertical, time axis): in the lambeosaurin cluster the orange and red backbones run over each other with nodes about 2 px apart, so the branching order of Lambeosaurus, Corythosaurus and Hypacrosaurus cannot be decided. Replaced by seed 20261203: `longrich2013a_fig14`.

Notes on sample 4:

- Census images checked first: delcourt2018a_fig1 (labels as PDF text and a vector backbone beside the raster) was re-rendered before transcription; it is the one case here with labels_from_text_layer. No prose is blanked in census 2, so nothing was erased.
- Methods: dieudonné2020a_fig1 from the PDF's vector lines, which drop two lines, read by eye; the rest by eye from crops at native resolution or 2-3x.
- Labels: node numbers and circled keys are not encoded (dieudonné2020a 1-7, tortosa2014a 1-10, vickaryous2002a 1-4, göhlich2006a 1-24). göhlich2006a's COELUROSAURIA box does not span one clade (node 3 also holds the Allosaurus pair) and is not encoded; its MANIRAPTORA box is. On vertical trees (morschhauser2018a, li2011a, longrich2013a, senter2012b) names printed beside a node's horizontal or written up its stem are put on that node; longrich2013a's AVIMIMIDAE labels a single tip's line and is not encoded.
- Names as printed: li2011a 'Volcanodon', 'Omcisaurus', 'Titanosarus' (the text layer agrees); zhang2008a 'Therizinosauriodea'; abbreviations such as 'P. mongoliensis' and 'Protoceratops hellink.' kept.
- None of these census images cuts off tips, so no image_tips_visible fields.

### Sample 4 baseline (tree extractor at commit 36321f2, run cold on 2026-11-22)

Run before any change was made for these figures.

- Names: 460 of 599 (77%). Exact matches: 4 of 20 (csiki2010b_fig3, gallina2015a_fig7, mcdonald2017a_fig14, morschhauser2018a_fig11). Every name right: 6 of 20.
- Splits, among the tips named: 300 of 313 (96%), with 5 wrong splits.
- Seven figures named under 70% of their tips: vickaryous2002a_fig1 0 of 12, li2011a_fig2 2 of 13, tortosa2014a_fig7 10 of 40, brusatte2008b_fig6 3 of 8, dieudonné2020a_fig1 14 of 33, bajpai2023a_fig6 18 of 37, senter2012b_fig12 10 of 15.
- The `reading-doubtful` warning marked 6 of those 7 (not dieudonné2020a_fig1), 1 of the 5 between 70 and 90 percent (zanno2009a_fig2), and none of the 8 at 90 percent or more.
- Cold results of the earlier batches, for comparison: batch 3 67% (78% without the figure whose image had no labels), batch 4 74%, sample 3 89%.

### Sample 4 baseline restated with cau2018a_fig6 (run cold on 2026-11-22, commit d635574)

cau2018a_fig6 was the figure drawn; it was transcribed afterwards and takes the place of göhlich2006a_fig4, which stays as a gold case outside the sample. Cold, it named 43 of its 132 tips, with 38 of 39 scored splits, and the `reading-doubtful` warning marked it.

Over the twenty figures as drawn:

- Names: 479 of 703 (68%). Exact matches: 4 of 20. Every name right: 6 of 20.
- Eight figures named under 70% of their tips; the warning marked 7 of them.

# Sample 5 (second census draw)

Drawn from census 2's trees that had no gold case (corpus `census2/`; images at `../../../../../../corpus/census2/figures/{id}.png`, as for sample 4).

## How the sample was drawn

- **Population:** census 2's 60 trees, minus the 21 with cases (sample 4's 20 including cau2018a_fig6, and göhlich2006a_fig4), minus ramírez-velasco2022a_fig4 (recorded unreadable in sample 4): 38 trees, all in the three layout strata. Census 2 has no circular or root-right figures.
- **Strata:** layout by time axis, using the census flags as corrected (dai2022a_fig7 and cau2018a_fig6 gained `time_axis`), largest remainder: rectangular 6 + 10, slanted 0 + 2, vertical 2 + 0 (with + without time axis), from pools of 11, 19, 0, 3, 4 and 1.
- **Draw:** `random.Random(20261215)`, `rng.sample` per stratum; skips replaced from the stratum's remaining pool by `random.Random(20261215 + k)`. Strict on size: a figure is skipped only when its tree cannot be read from the image. Script: `census2/scripts/gold_draw5.py`; picks, pools and replacements: `census2/scripts/gold_draw5_result.json`.

Pools:

- rectangular, time axis (11): apaldetti2018a_fig3 carr2010a_fig4 dai2022a_fig7 hattori2023a_fig9 jasinski2026a_fig5 mcphee2018a_fig2 morrison2026a_fig5 morrison2026a_fig6 müller2018a_fig2 prieto-márquez2012b_fig23 sánchez-fenollosa2026a_fig11
- rectangular, no time axis (19): averianov2021c_fig8 carr2020a_fig1 evans2007a_fig9 fanti2012a_fig8 ksepka2010a_fig4 lee2019a_fig8 müller2018b_fig39 nesbitt2020a_fig1 pei2020a_fig2 pond2023a_fig27 rozadilla2021a_fig14 ryan2005a_fig10 saegusa2014a_fig23 samathi2019a_fig1 sen2025a_fig5 srivastava2026a_fig20 sánchez-hernández2014a_fig12 turner2012a_fig69 turner2012a_fig79
- slanted, no time axis (3): schweitzer1999a_fig7 thompson2011a_fig1 turner2012a_fig5
- vertical, time axis (4): lamanna2014a_fig7 longrich2024b_fig17 pol2012a_fig2 vanderlinden2025a_fig1
- vertical, no time axis (1): norman2011a_fig41

Drawn: mcphee2018a_fig2 carr2010a_fig4 morrison2026a_fig6 jasinski2026a_fig5 müller2018a_fig2 morrison2026a_fig5 | rozadilla2021a_fig14 turner2012a_fig69 ksepka2010a_fig4 nesbitt2020a_fig1 samathi2019a_fig1 carr2020a_fig1 pei2020a_fig2 sánchez-hernández2014a_fig12 sen2025a_fig5 saegusa2014a_fig23 | thompson2011a_fig1 schweitzer1999a_fig7 | longrich2024b_fig17 pol2012a_fig2

## Sample 5 (20 cases, four skips replaced)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| apaldetti2018a_fig3 | rectangular | yes | 11 | - | 4 | printed | image-transcription | ? |
| carr2010a_fig4 | rectangular | yes | 25 | 5, 7, 5 | 5 | printed | image-transcription | ? |
| dai2022a_fig7 | rectangular | yes | 41 | 3, 4, 3, 3 | 7 | printed | image-transcription | yes |
| jasinski2026a_fig5 | rectangular | yes | 8 | - | 2 | printed | image-transcription | yes |
| müller2018a_fig2 | rectangular | yes | 31 | 4, 3 | 5 | printed | image-transcription | ? |
| prieto-márquez2012b_fig23 | rectangular | yes | 20 | - | 1 | printed | image-transcription | ? |
| rozadilla2021a_fig14 | rectangular | no | 26 | 3 | - | printed | image-transcription | ? |
| turner2012a_fig69 | rectangular | no | 45 | 4, 4, 4, 4, 3, 3, 3, 4 | - | printed | image-transcription | ? |
| ksepka2010a_fig4 | rectangular | no | 43 | 3, 3, 5, 3, 4 | 8 | printed | image-transcription | ? |
| nesbitt2020a_fig1 | rectangular | no | 7 | - | 1 | printed | image-transcription | ? |
| pond2023a_fig27 | rectangular | no | 14 | - | 1 | printed | image-transcription | ? |
| carr2020a_fig1 | rectangular | no | 45 | 12, 32 | - | printed | image-transcription | yes |
| pei2020a_fig2 | rectangular | no | 37 | - | 17 | printed | image-transcription | ? |
| sánchez-hernández2014a_fig12 | rectangular | no | 23 | 19 | - | printed | image-transcription | yes |
| sen2025a_fig5 | rectangular | no | 38 | 4, 3, 3 | 12 | printed | image-transcription | ? |
| saegusa2014a_fig23 | rectangular | no | 29 | 3, 3, 6 | - | printed | image-transcription | ? |
| thompson2011a_fig1 | slanted | no | 16 | - | - | printed | image-transcription | ? |
| schweitzer1999a_fig7 | slanted | no | 4 | - | 1 | printed | image-transcription | ? |
| longrich2024b_fig17 | vertical | yes | 30 | - | 6 | printed | image-transcription | yes |
| pol2012a_fig2 | vertical | yes | 24 | 3, 4, 3, 3 | 5 | printed | image-transcription | ? |

Skips (all for unreadable topology; none for size):

- `mcphee2018a_fig2` (rectangular, time axis): the sauropodiform backbone is a stack of near-parallel lines 2-3 px apart under node dots, so which line leaves which node cannot be decided (at 5x, the Lessemsaurus, Antetonitrus-Ledumahadi and "Other sauropods" lines meet the backbone under overlapping dots). Replaced by seed 20261216: `apaldetti2018a_fig3`.
- `morrison2026a_fig6` and `morrison2026a_fig5` (rectangular, time axis; two analyses in the same style): the megaraptorid ladder has six to eight node dots on doubled vertical lines, with dots where no branch leaves; the branching order of Megaraptor, Australovenator, Orkoraptor, Aerosteon, Aniksosaurus, Fukuiraptor and Siats cannot be decided. Replaced by seeds 20261217 and 20261218: `dai2022a_fig7` and `prieto-márquez2012b_fig23`.
- `samathi2019a_fig1` (rectangular, no time axis): Megaraptora is drawn three times on dashed alternative branches, so the figure shows no single tree (the pol2022a_fig6 reason). Replaced by seed 20261219: `pond2023a_fig27`.

Notes on sample 5:

- Panels, each with a `region`: nesbitt2020a_fig1 A (one of four published hypotheses), thompson2011a_fig1 A, schweitzer1999a_fig7 A, jasinski2026a_fig5 A, apaldetti2018a_fig3 a (b is a body-mass plot), saegusa2014a_fig23 left (strict consensus with the shared tip column), carr2020a_fig1 A (B is a majority-rule tree with dashed wildcard boxes), sánchez-hernández2014a_fig12 B (the census region). rozadilla2021a_fig14 uses panel B, which a rectangle separates cleanly; panel A extends under it.
- Labels as printed, including descriptive ones (pei2020a 'Archaeopteryx + later-diverging avialans' and four like it; carr2010a's character-list headings joined to nodes by arrows, among them 'Derived tyrannosaurines'). Not encoded: keys and support digits; thompson2011a's clade numbers; sánchez-hernández2014a's CERATOSAURIA, which panel B prints under a different node from panel A.
- sen2025a_fig5's Saurischia vertical is broken only by the overprinted word 'Sauropodomorpha' and has no support value above the Sauropodomorpha stem, so it is read as a three-way node (ISIR306c, Sauropodomorpha, theropods); the gold_note says so.
- müller2018a_fig2 (labels as PDF text; the census image is the render with them) was read from a listing of its grey line segments.
- None of these census images cuts off tips.

What is left in census 2 after sample 5: 18 trees without gold, 5 of them recorded unreadable (ramírez-velasco2022a_fig4, mcphee2018a_fig2, morrison2026a_fig5, morrison2026a_fig6, samathi2019a_fig1), leaving 13.

### Sample 5 baseline (tree extractor at commit 4f41ffb, run cold on 2026-11-22)

Run before any change was made for these figures.

- Names: 413 of 517 (80%). Exact matches: 8 of 20 (carr2020a_fig1, nesbitt2020a_fig1, pond2023a_fig27, rozadilla2021a_fig14, saegusa2014a_fig23, schweitzer1999a_fig7, sánchez-hernández2014a_fig12, turner2012a_fig69). Every name right: 9 of 20.
- Splits, among the tips named: 243 of 256 (95%), with 4 wrong splits.
- Five figures named under 70% of their tips: sen2025a_fig5 9 of 38, pei2020a_fig2 10 of 37, apaldetti2018a_fig3 3 of 11, pol2012a_fig2 9 of 24, carr2010a_fig4 14 of 25.
- The `reading-doubtful` warning marked all 5 of those, 1 of the 3 between 70 and 90 percent (jasinski2026a_fig5), and 2 of the 12 at 90 percent or more (dai2022a_fig7 and müller2018a_fig2, each with many unnamed tips in the tree beside the named ones).
- Cold results of the earlier batches, for comparison: batch 3 67%, batch 4 74%, sample 3 89%, sample 4 68%.

# Picked cases: character marks (not a sample)

Four cases chosen for one feature, numbered character marks on branches (tools issue #19), after the feature survey of census and census 2. They were picked, not drawn: they are **not to be counted in any estimate of accuracy**. Tips and topology as usual, names as printed; the marks and their numbers are not encoded.

| Case | Image | Marks | Tips | Polytomies | Clade labels |
|---|---|---|---:|---|---:|
| you2009a_fig3 | census/figures | rows of small solid circles and squares, character number above, state below | 35 | 5 | 3 |
| tschopp2012a_fig11 | picked/figures | WinClada rows of solid (unambiguous) and open (ambiguous) circles, number above, state below; figure printed sideways | 14 | 3 | 5 |
| ryan2005a_fig10 | census2/figures | short ticks across the branch, character numbers with state superscripts beside them | 9 | - | 2 |
| xu2011b_fig9 | picked/figures | short ticks across the stems, character numbers beside them; root at the bottom | 13 | 5 | 2 |

- you2009a_fig3 and ryan2005a_fig10 are the two census trees the survey found with this feature and no gold case. tschopp2012a_fig11 and xu2011b_fig9 were chosen from outside the censuses after a caption search and a look at about 30 candidates (most captions that mention mapped characters print only numbers, without marks). Their images are in the corpus at `picked/figures/` (same depth as census: `../../../../../../corpus/picked/figures/{id}.png`), with `picked/manifest.json` and a README.
- you2009a_fig3 is one tree wrapped into two parts: a connector from the Aralosaurus node runs along the right edge and back to the left, continuing as Hadrosauridae.

### Picked character-mark cases, cold (tree extractor 0.11.0, commit c9887b8, run on 2026-11-23)

Run before any change was made for these figures. They are not a sample and are not counted in any estimate of accuracy.

- ryan2005a_fig10: 9 of 9 names, 6 of 6 splits, exact. Ticks across the branches.
- xu2011b_fig9: 13 of 13, 7 of 7, exact. Ticks across the stems.
- you2009a_fig3: 12 of 35, 8 of 9 scored splits, one wrong. Rows of solid circles and squares.
- tschopp2012a_fig11: 0 of 14. Rows of solid and open circles on every branch; printed on its side.
- With serrano-brañas2016a_fig11 (6 of 12): the figures whose marks are ticks read whole, and the three whose marks are rows of circles or squares do not.


# Sample 6 (census 2 extended to draw 120)

Drawn from census 2's trees that had no gold case, after the census was extended for this sample (corpus `census2/`, commit e6df0d64; images at `../../../../../../corpus/census2/figures/{id}.png`, as for samples 4 and 5).

## How the sample was drawn

- **Census extension:** after sample 5, 13 readable census-2 trees had no gold. Census 2 was continued along its own seeded order (seed 20261130) with draws 82-120, located and classified with the same rules: 2 losses, 3 located non-trees, 34 trees. Census 2 now has 120 draws and 94 trees. One drawn figure's paper key changed after the draw (fernández2022a_fig21, now paper regaladofernández2022a); the case id keeps the drawn id. See `census2/README.md`.
- **Population:** census 2's 94 trees, minus those with cases, minus the five recorded unreadable (ramírez-velasco2022a_fig4, mcphee2018a_fig2, morrison2026a_fig5, morrison2026a_fig6, samathi2019a_fig1): 47 trees (13 from draws 1-81, 34 from draws 82-120), all in the three layout strata.
- **Strata:** layout by time axis, largest remainder: rectangular 3 + 10, slanted 0 + 3, vertical 3 + 1 (with + without time axis), from pools of 8, 23, 0, 7, 6 and 3.
- **Draw:** `random.Random(20261231)`, `rng.sample` per stratum; skips replaced from the stratum's remaining pool by `random.Random(20261231 + k)`. Strict on size: a figure is skipped only when its tree cannot be read from the image. Script: `census2/scripts/gold_draw6.py`; picks, pools and replacements: `census2/scripts/gold_draw6_result.json`.

Pools:

- rectangular, no time axis (23): agnolín2021a_fig10 averianov2018b_fig6 averianov2021c_fig8 cau2015a_fig6 evans2007a_fig9 fanti2012a_fig8 gasca2015a_fig7 godefroit2012b_fig21 lee2019a_fig8 moore2020a_fig25 müller2018b_fig39 prieto-márquez2011b_fig3 raven2023a_fig3 rotatori2026a_fig4 sancarlo2026a_fig13 sancarlo2026a_fig14 sethapanichsakul2026a_fig14 srivastava2026a_fig20 turner2012a_fig59 turner2012a_fig62 turner2012a_fig79 wang2016z_fig8 yu2018a_fig4
- slanted, no time axis (7): czepiński2019a_fig18 harris2004a_fig4 krause2007a_fig9 otero2010a_fig15 turner2012a_fig1 turner2012a_fig5 wilson2002a_fig13
- rectangular, time axis (8): cruzado-caballero2017a_fig14 fernández2022a_fig21 hattori2023a_fig9 jiménezvelandia2025a_fig8 meso2024a_fig7 poole2022a_fig8 salgado2017a_fig4 sánchez-fenollosa2026a_fig11
- vertical, time axis (6): fanti2013a_fig4 lamanna2014a_fig7 langer2019a_fig13 pinheiro2018a_fig11 vanderlinden2025a_fig1 zaher2011a_fig7
- vertical, no time axis (3): knoll2019z_fig4 norman2011a_fig41 norman2020b_fig24

Drawn: meso2024a_fig7 hattori2023a_fig9 poole2022a_fig8 | wang2016z_fig8 agnolín2021a_fig10 sancarlo2026a_fig13 lee2019a_fig8 averianov2018b_fig6 moore2020a_fig25 gasca2015a_fig7 evans2007a_fig9 turner2012a_fig59 yu2018a_fig4 | krause2007a_fig9 wilson2002a_fig13 turner2012a_fig1 | vanderlinden2025a_fig1 zaher2011a_fig7 lamanna2014a_fig7 | norman2011a_fig41

## Sample 6 (20 cases, one skip replaced)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| meso2024a_fig7 | rectangular | yes | 23 | 3 | - | printed | image-transcription | ? |
| hattori2023a_fig9 | rectangular | yes | 19 | 7, 3, 7 | 2 | printed | image-transcription | yes |
| poole2022a_fig8 | rectangular | yes | 68 | - | 13 | printed | pdf-vector | yes |
| wang2016z_fig8 | rectangular | no | 61 | 22, 4 | 8 | printed | image-transcription | ? |
| agnolín2021a_fig10 | rectangular | no | 30 | 3, 3, 7 | 7 | printed | image-transcription | ? |
| sancarlo2026a_fig13 | rectangular | no | 42 | 3, 4, 3, 3 | - | printed | image-transcription | ? |
| lee2019a_fig8 | rectangular | no | 21 | 7 | 3 | printed | image-transcription | yes |
| averianov2018b_fig6 | rectangular | no | 35 | 7, 6, 3, 3, 3 | 3 | printed | image-transcription | ? |
| moore2020a_fig25 | rectangular | no | 92 | 4, 4, 4, 3, 3, 3, 3, 3, 5, 3, 4 | 9 | printed | image-transcription | ? |
| gasca2015a_fig7 | rectangular | no | 43 | 5, 3, 7 | - | printed | image-transcription | ? |
| evans2007a_fig9 | rectangular | no | 18 | 3 | - | printed | image-transcription | ? |
| sancarlo2026a_fig14 | rectangular | no | 42 | 4, 3, 3, 3 | - | printed | image-transcription | ? |
| yu2018a_fig4 | rectangular | no | 18 | 4, 3, 6 | - | printed | image-transcription | yes |
| krause2007a_fig9 | slanted | no | 7 | 4 | 2 | printed | image-transcription | ? |
| wilson2002a_fig13 | slanted | no | 27 | 3 | 14 | printed | image-transcription | ? |
| turner2012a_fig1 | slanted | no | 9 | - | - | printed | image-transcription | ? |
| vanderlinden2025a_fig1 | vertical | yes | 7 | - | 5 | printed | image-transcription | ? |
| zaher2011a_fig7 | vertical | yes | 24 | 3 | 7 | printed | image-transcription | yes |
| lamanna2014a_fig7 | vertical | yes | 33 | 3, 7 | 5 | printed | image-transcription | yes |
| norman2011a_fig41 | vertical | no | 14 | - | - | printed | image-transcription | ? |

Skip (for unreadable topology; none for size):

- `turner2012a_fig59` (rectangular, no time axis): Pyroraptor olympius is drawn 13 times in grey on alternative branches ('13 positions'), so the figure shows no single tree (the samathi2019a_fig1 and pol2022a_fig6 reason). Replaced by seed 20261232: `sancarlo2026a_fig14`.

Notes on sample 6:

- Panels, each with a `region`: yu2018a_fig4 a (b is another tree), sancarlo2026a_fig13 left tree (the caption reads the two right to left: equal weights, extended implied weights), krause2007a_fig9 A (one of four published hypotheses), wilson2002a_fig13 A (B is a majority-rule tree from a pruned matrix). moore2020a_fig25's census image is panel B only; the case says Fig. 25B and needs no region.
- Not encoded: lettered node discs (evans2007a A-F), open node circles (meso2024a), 'Unnamed node' (poole2022a), 'basal eusauropods' on an arrow leaving the root (zaher2011a), the dashed arrows marking alternative placements in wilson2002a_fig13 A (the solid tree is the gold), and hattori2023a's Aviatyrannis, printed on a dotted line that joins nothing (the caption says the analysis did not include it; not in names.txt).
- Labels as printed: abbreviations agnolín2021a 'NOAS.' and 'MAJUN.'; zaher2011a '“advanced titanosaurians”' with its quotation marks; moore2020a 'CMT clade'. Tip spellings as printed: 'Diplococus' (zaher2011a), 'Ligabuesaurus lenzai' (moore2020a), '"Probactrosaurus" mazongshanens' (gasca2015a).
- vanderlinden2025a_fig1 is a clade diagram: six terminal branches are clades named by stem-based labels (Macronaria's at its base) and one is the genus Haplocanthosaurus. Rebbachisauridae has the same content as Khebbashia in this tree and is not encoded (one label per node).
- Where a stem enters a node at a tip's level and runs on as that tip's branch, the tip is read as a child of the node (as in earlier batches): hattori2023a (Deinocheirus, Galimimus), meso2024a, sancarlo2026a_fig13 and fig14, moore2020a (Camarasaurus node).
- poole2022a_fig8 was read from the PDF's own vector lines (68 tips in printed order; the text is outlined, so names were assigned by order and checked against the image). averianov2018b_fig6 and wilson2002a's nodes are diagonal fans or slanted joins; moore2020a_fig25 is a low-resolution raster with small type.
- None of these census images cuts off tips.

What is left in census 2 after sample 6: 32 trees without gold, 6 of them recorded unreadable (the five above and turner2012a_fig59), leaving 26.

### Sample 6 baseline (tree extractor 0.12.0 plus the enlarged reading, commit d7a28c6, run cold on 2026-11-23)

Run before any change was made for these figures.

- Names: 557 of 633 (88%). Exact matches: 8 of 20 (wang2016z_fig8, agnolín2021a_fig10, sancarlo2026a_fig13, sancarlo2026a_fig14, evans2007a_fig9, krause2007a_fig9, turner2012a_fig1, norman2011a_fig41).
- Splits, among the tips named: 371 of 404 (92%), with 14 wrong splits, nine of them on two upward time trees (zaher2011a_fig7 3 of 12 with 5 wrong, lamanna2014a_fig7 6 of 21 with 4 wrong).
- Three figures named under 70% of their tips: yu2018a_fig4 0 of 18, vanderlinden2025a_fig1 1 of 7, averianov2018b_fig6 20 of 35. zaher2011a_fig7 named 15 of 24 (63%) as well, which makes four.
- The `reading-doubtful` warning marked three of those four (not zaher2011a_fig7) and none of the 14 at 90 percent or more.
- The commit the batch ran at is one after 0.12.0: it reads a figure of small type at twice its size as well, made for pretto2018a_fig11 an hour before the batch arrived and without sight of it. moore2020a_fig25 was read that way and named 89 of 92; without the step it names 76. At 0.12.0 as tagged the batch would so have named 544 of 633 (86%).
- Cold results of the earlier batches, for comparison: batch 3 67%, batch 4 74%, sample 3 89%, sample 4 68%, sample 5 80%.


# Sample 7 (census 2)

Drawn from the 26 readable census-2 trees left without gold after sample 6 (corpus `census2/`; images at `../../../../../../corpus/census2/figures/{id}.png`).

## How the sample was drawn

- **Population:** census 2's 94 trees, minus those with cases, minus the six recorded unreadable (ramírez-velasco2022a_fig4, mcphee2018a_fig2, morrison2026a_fig5, morrison2026a_fig6, samathi2019a_fig1, turner2012a_fig59): 26 trees, all in the three layout strata.
- **Strata:** layout by time axis, largest remainder: rectangular 4 + 9, slanted 0 + 3, vertical 2 + 2 (with + without time axis), from pools of 5, 12, 0, 4, 3 and 2.
- **Draw:** `random.Random(20261241)`, `rng.sample` per stratum; a skip would be replaced from the stratum's remaining pool by `random.Random(20261241 + k)`. Strict on size. Script: `census2/scripts/gold_draw7.py`; picks and pools: `census2/scripts/gold_draw7_result.json`.

Pools:

- rectangular, no time axis (12): averianov2021c_fig8 cau2015a_fig6 fanti2012a_fig8 godefroit2012b_fig21 müller2018b_fig39 prieto-márquez2011b_fig3 raven2023a_fig3 rotatori2026a_fig4 sethapanichsakul2026a_fig14 srivastava2026a_fig20 turner2012a_fig62 turner2012a_fig79
- slanted, no time axis (4): czepiński2019a_fig18 harris2004a_fig4 otero2010a_fig15 turner2012a_fig5
- rectangular, time axis (5): cruzado-caballero2017a_fig14 fernández2022a_fig21 jiménezvelandia2025a_fig8 salgado2017a_fig4 sánchez-fenollosa2026a_fig11
- vertical, time axis (3): fanti2013a_fig4 langer2019a_fig13 pinheiro2018a_fig11
- vertical, no time axis (2): knoll2019z_fig4 norman2020b_fig24

Drawn: cruzado-caballero2017a_fig14 fernández2022a_fig21 jiménezvelandia2025a_fig8 sánchez-fenollosa2026a_fig11 | averianov2021c_fig8 srivastava2026a_fig20 godefroit2012b_fig21 raven2023a_fig3 müller2018b_fig39 fanti2012a_fig8 turner2012a_fig79 rotatori2026a_fig4 sethapanichsakul2026a_fig14 | czepiński2019a_fig18 harris2004a_fig4 turner2012a_fig5 | fanti2013a_fig4 pinheiro2018a_fig11 | norman2020b_fig24 knoll2019z_fig4

## Sample 7 (20 cases, no skips)

| Case | Layout | Time axis | Tips | Polytomies (children) | Clade labels | names.txt | Gold method | Open licence |
|---|---|---|---:|---|---:|---|---|---|
| cruzado-caballero2017a_fig14 | rectangular | yes | 20 | - | - | printed | image-transcription | ? |
| fernández2022a_fig21 | rectangular | yes | 14 | - | - | printed | image-transcription | ? |
| jiménezvelandia2025a_fig8 | rectangular | yes | 40 | 3, 4, 7, 6, 3, 14 | 5 | printed | image-transcription | ? |
| sánchez-fenollosa2026a_fig11 | rectangular | yes | 36 | - | 3 | printed | image-transcription | ? |
| averianov2021c_fig8 | rectangular | no | 14 | 3, 10 | 1 | printed | image-transcription | ? |
| srivastava2026a_fig20 | rectangular | no | 16 | 4 | 4 | printed | image-transcription | ? |
| godefroit2012b_fig21 | rectangular | no | 15 | 3 | - | printed | image-transcription | yes |
| raven2023a_fig3 | rectangular | no | 47 | - | 5 | printed | image-transcription | ? |
| müller2018b_fig39 | rectangular | no | 39 | 4, 3, 4, 3, 3 | 5 | printed | image-transcription | ? |
| fanti2012a_fig8 | rectangular | no | 12 | 3 | - | printed | image-transcription | yes |
| turner2012a_fig79 | rectangular | no | 24 | 5, 4, 4 | 4 | printed | image-transcription | ? |
| rotatori2026a_fig4 | rectangular | no | 51 | 3, 3, 5, 3, 3, 3 | 9 | printed | image-transcription | ? |
| sethapanichsakul2026a_fig14 | rectangular | no | 23 | 3, 3 | 1 | printed | image-transcription | yes |
| czepiński2019a_fig18 | slanted | no | 4 | 3 | - | printed | image-transcription | ? |
| harris2004a_fig4 | slanted | no | 29 | 3, 3, 4 | 4 | printed | image-transcription | ? |
| turner2012a_fig5 | slanted | no | 8 | - | - | printed | image-transcription | ? |
| fanti2013a_fig4 | vertical | yes | 12 | 3, 3 | 1 | printed | image-transcription | ? |
| pinheiro2018a_fig11 | vertical | yes | 85 | 3, 3, 4, 4, 3, 4, 5 | 21 | printed | image-transcription | yes |
| norman2020b_fig24 | vertical | no | 5 | - | 3 | printed | image-transcription | ? |
| knoll2019z_fig4 | vertical | no | 6 | - | - | printed | image-transcription | yes |

No figure was skipped.

Notes on sample 7:

- **Drawn over grey or coloured bands or boxes** (said in each source line): fernández2022a_fig21 (stage chart in coloured bands above the tree), jiménezvelandia2025a_fig8 (coloured period and stage bands under the whole tree), sánchez-fenollosa2026a_fig11 (alternating grey and white epoch bands), pinheiro2018a_fig11 (blue-grey Mesozoic and pink Cenozoic backgrounds), raven2023a_fig3 and rotatori2026a_fig4 (one coloured box per named clade), sethapanichsakul2026a_fig14 b (grey box behind Euhelopodidae), srivastava2026a_fig20 B (coloured boxes behind two clades, gradient bands behind triangle tips), cruzado-caballero2017a_fig14 (grey dashed stage boundaries).
- **Tips that are clade names, not taxa** (said in each source line): norman2020b_fig24 (all five), turner2012a_fig5 (four of eight), turner2012a_fig79 (Avialae, Troodontidae), knoll2019z_fig4 (three locality-and-clade specimen labels), harris2004a_fig4 A (Theropoda, Prosauropoda), fanti2013a_fig4 h (Flagellicaudata), srivastava2026a_fig20 B (five triangle tips), sethapanichsakul2026a_fig14 b (DIAMANTINASAURIA, TITANOSAURIA).
- Panels, each with a `region`: averianov2021c_fig8 a, harris2004a_fig4 A, fanti2013a_fig4 h (a-g are photographs), müller2018b_fig39 A (one of four analyses), srivastava2026a_fig20 B, sethapanichsakul2026a_fig14 b. For srivastava2026a and sethapanichsakul2026a no rectangle holds one panel alone: srivastava's B region is clean (panel A runs under it), sethapanichsakul's b region has the ends of two panel-a labels in its lower-left corner.
- Not encoded: node letters (godefroit2012b, C-R), character marks (fanti2013a a-l; norman2020b's 'no gastralia'), the alternative-placement arrows with step costs in turner2012a_fig79 (+7, +11), the LAB/XII arrows in knoll2019z, stars and Bremer values (rotatori2026a and others), and jiménezvelandia2025a's coloured circles for six wildcard taxa named only in the legend (not tips; not in names.txt).
- Stem-based names (triangles, arrows, maximum-clade marks, bars across stems) are put on the node at the end of their stem: müller2018b_fig39, sánchez-fenollosa2026a_fig11 (Diplodocinae, Diplodocidae), srivastava2026a_fig20 (Dinosauriformes, Dinosauria), pinheiro2018a_fig11. rotatori2026a_fig4's bold names sit just left of where each node's stem enters, and go on that node; 'Ig.' is kept as printed.
- czepiński2019a_fig18 is an ancestor-descendant diagram (morphology against time): P. andrewsi sits on the main line where P. hellenikorhinus branches, read as a child of that node; the line from Bag. rozhdestvenskyi up to an unlabelled circle is that taxon's range.
- pinheiro2018a_fig11 (85 tips) was read from the image's black lines by a tracer (root at the bottom, only the tree's connected ink, short tip lines kept where a coloured range bar sits on them), then checked against the figure; MESOEUCROCODYLIA excludes Hsisosuchus and THALATTOSUCHIA excludes Hyposaurus, as their bars show.
- None of these census images cuts off tips.

What is left in census 2 after sample 7: 6 trees without gold (salgado2017a_fig4, cau2015a_fig6, prieto-márquez2011b_fig3, turner2012a_fig62, otero2010a_fig15, langer2019a_fig13), plus the six recorded unreadable.

### Sample 7 baseline (tree extractor 0.14.0 plus the hollow bar in the ink, commit bf31ee3, run cold on 2026-11-25)

Run before any change was made for these figures.

- Names: 429 of 500 (86%). Exact matches: 6 of 20 (srivastava2026a_fig20, godefroit2012b_fig21, müller2018b_fig39, fanti2012a_fig8, sethapanichsakul2026a_fig14, turner2012a_fig5).
- Splits, among the tips named: 303 of 312 (97%), with 4 wrong splits, three of them on harris2004a_fig4.
- Five figures named under 70% of their tips: fernández2022a_fig21 0 of 14, norman2020b_fig24 0 of 5, knoll2019z_fig4 0 of 6, czepiński2019a_fig18 1 of 4, averianov2021c_fig8 8 of 14. Three of the five have tips that are clade names, or are not a cladogram in the usual sense (czepiński2019a_fig18 is an ancestor-descendant diagram of four tips).
- The `reading-doubtful` warning marked all 5 of those and none of the 15 others.
- Four of the steps added for sample 6 ran on this batch unprompted: gray bands were lifted on four figures (sánchez-fenollosa2026a_fig11, rotatori2026a_fig4, sethapanichsakul2026a_fig14, pinheiro2018a_fig11), hollow bars read on one, and two figures were read reduced.
- Cold results of the earlier batches, for comparison: batch 3 67%, batch 4 74%, sample 3 89%, sample 4 68%, sample 5 80%, sample 6 88%.
- Out of scope, by Sarah's decision of 2026-11-25: czepiński2019a_fig18. It is an ancestor-descendant scenario plotted as morphology against time, with taxa as circles on slanted lines and no nodes in a cladogram's sense. It was drawn in the sample and stays in it, and in the cold figure above; it is not a failure to be worked on.
- Out of scope as well, by Sarah's decision of 2026-11-25: yu2018a_fig5, from the first sample. It is a summary tree drawn at 45 degrees against a body-mass axis, with dots for tips and no rectangular branches; it reads 0 of 11. It stays in its sample and in that sample's cold figure, and is not a failure to be worked on. The paper's cladogram is its Fig. 4, which is a case of its own (yu2018a_fig4).


# Picked cases: pie charts on nodes (not a sample)

Four cases chosen for one feature: a tree of ancestral ranges with a pie chart set on every node. They were picked, not drawn, and count in no estimate of accuracy.

- **Why.** A step added for vila2022a_fig3, a tree with a lettered box on every node, rested on that one figure. The corpus was searched for more (captions naming ancestral areas or ranges, DEC, DIVALIKE, BayArea, BioGeoBEARS, S-DIVA, BBM; about thirty candidates looked at). No other figure has a lettered box on every node. Ten relatives were picked into corpus `picked/figures` (commit bde7dd90, `picked_for` "ancestral-range trees, relatives of vila2022a_fig3"), and seven of the ten mark their nodes with pie charts.
- **The four.** Chosen from the ten to span how badly they read.

| Case | Image | What marks the nodes and tips | Tips | License |
|---|---|---|---|---|
| fanti2015a_fig22 | picked/figures | large pies on nodes, two pairs touching; a colored dot on each tip | 29 | CC BY 4.0 |
| sallam2018a_fig3 | picked/figures | pies on nodes with a pale bar across each for its age; a colored bar on each tip (panel b) | 20 | not open |
| poole2022a_fig9 | picked/figures | pies on nodes, often overlapping; a colored square on each tip; thirteen clade names beside nodes | 68 | CC BY 4.0 |
| zhang2024a_fig7 | picked/figures | small pies on a long ladder of nodes; a colored square on each tip | 56 | CC BY 4.0 |

- zhang2024a_fig7 stands in for gorscak2016a_fig6_4, where three junctions or more read more than one way and the corpus holds no other drawing of the tree to settle them. oyabu2026a_fig7 was looked at and left out: its polytomies are drawn as branches of no length with the pies stacked on them.
- poole2022a_fig9 was checked node by node against the paper's Fig. 8, the same tree drawn without pies.
- The gold tree of zhang2024a_fig7 rests on a rule of the drawing as well as on what is drawn: each pie sits halfway between its two children. Several of the ladder's uprights pass behind the neighboring pies, and the rule places the tips that hang from them.
- sallam2018a_fig3 is not openly licensed; its image stays out of this repository, and the case runs only where the corpus is at hand.

### Picked pie-chart cases, cold (tree extractor 0.16.0, commit 6bdc8c2, run on 2026-11-26)

| Case | Tips found | Names | Splits | Wrong splits |
|---|---|---|---|---|
| fanti2015a_fig22 | 26 | 12 of 29 | 7 of 9 | 1 |
| sallam2018a_fig3 | 16 | 2 of 20 | 0 of 0 | 0 |
| poole2022a_fig9 | 49 | 35 of 68 | 18 of 32 | 4 |
| zhang2024a_fig7 | 58 | 39 of 56 | 25 of 36 | 3 |

88 of 173 names, 51 percent. The random samples came in cold between 67 and 89 percent.


# Sample 8 (census 2, extended to draw 160)

Drawn from the census-2 trees with no gold case, after the census was extended for this sample (corpus `census2/`, commit 27b9a14d; images at `../../../../../../corpus/census2/figures/{id}.png`).

## How the sample was drawn

- **Census extension:** census 2 was continued along its own seeded order (`draw.py`, seed 20261130) with draws 121-160, located and classified with the same rules: 5 losses (prieto-márquez2020a_fig19 and _fig20, no figure ink beside the caption; norman2004z_fig15 and sereno2000a_fig25, chapter-numbered figures; bakker1988a_fig10, no caption in the text layer), 5 located non-trees (cruzado-caballero2010a_fig4, a photo plate; mcphee2017b_fig8, a phylomorphospace; chokchaloemwong2019a_fig12, a crop of the page header; hu2018a_fig6, scatter plots; evans2013b_fig5, a table) and 30 trees (rectangular 20, slanted 5, vertical 5). Census 2 is now 160 draws and 124 trees.
- **Population:** the 36 census-2 trees with no gold case and no recorded unreadable topology.
- **Strata:** layout by time axis, as for sample 7: rectangular 2 + 12, slanted 0 + 3, vertical 1 + 2 (with + without time axis), from pools of 3, 21, 0, 6, 2 and 4.
- **Draw:** `random.Random(20261251)`, `rng.sample` per stratum. Script: `census2/scripts/gold_draw8.py`; picks and pools: `census2/scripts/gold_draw8_result.json`.

Pools and picks:

- rectangular, time axis (3): díezdíaz2025a_fig64 moore2020a_fig27 salgado2017a_fig4; drew salgado2017a_fig4 and moore2020a_fig27
- rectangular, no time axis (21); drew 12: chokchaloemwong2019a_fig13 ezcurra2010a_fig15 poole2022z_fig3 paulina-carabajal2019a_fig6 prieto-márquez2011b_fig3 prieto-márquez2006b_fig11 cau2015a_fig6 cau2018a_fig3 martínez2012a_fig16 xing2014a_fig13 mcdonald2017a_fig15 turner2012a_fig62
- slanted, no time axis (6): gay2010a_fig5 he2015a_fig13 kobayashi2025a_fig7 otero2010a_fig15 wilson2002a_fig10 yates2005a_fig9; drew otero2010a_fig15 yates2005a_fig9 he2015a_fig13
- vertical, time axis (2): langer2019a_fig13 meso2024a_fig5; drew meso2024a_fig5
- vertical, no time axis (4): gates2014a_fig9 norman2015a_fig48 norman2020b_fig41 sales2017a_fig7; drew norman2020b_fig41 sales2017a_fig7

- **One loss:** moore2020a_fig27, a 150-dpi raster of about 95 tips with stacked short nodes and diagonal leaders for its support values, could not be settled and is recorded unreadable. It was replaced by díezdíaz2025a_fig64, the only other tree in its stratum.
- he2015a_fig13 was classed slanted from its thumbnail, for its long leader lines; the tree is rectangular. It stays in the stratum it was drawn from.
- otero2010a_fig15 is a slanted cladogram on a spine, fully pectinate, with character changes along the spine and no rectangular branches. Out of scope, by Sarah's decision of 2026-11-26, as czepiński2019a_fig18 and yu2018a_fig5 are. It was drawn in the sample and stays in it, and in the cold figure below; it is not a failure to be worked on.
- Two-panel figures, panel A taken, each with a `region`: martínez2012a_fig16, ezcurra2010a_fig15. cau2018a_fig3 is two columns joined by an arrow and is encoded as one tree. prieto-márquez2011b_fig3 is a tree of five tips in a figure that is mostly photographs; its region leaves the photographs out.
- Not openly licensed: ezcurra2010a_fig15, martínez2012a_fig16, norman2020b_fig41, paulina-carabajal2019a_fig6, prieto-márquez2006b_fig11, prieto-márquez2011b_fig3. No licence statement found: cau2018a_fig3, otero2010a_fig15, turner2012a_fig62, yates2005a_fig9. meso2024a_fig5 is CC BY-NC-ND 4.0. The cases hold no images.

### Sample 8 baseline (tree extractor 0.16.0 plus the pie-chart steps, commit bf4d134, run cold on 2026-11-26)

| Case | Layout | Tips found | Names | Splits | Wrong splits | Identical |
|---|---|---:|---:|---:|---:|---|
| salgado2017a_fig4 | rectangular, time axis | 30 | 29 of 29 | 10 of 10 | 0 | no |
| díezdíaz2025a_fig64 | rectangular, time axis | 37 | 32 of 43 | 24 of 29 | 1 | no |
| chokchaloemwong2019a_fig13 | rectangular | 48 | 46 of 46 | 32 of 32 | 0 | no |
| ezcurra2010a_fig15 | rectangular | 36 | 36 of 36 | 28 of 28 | 0 | yes |
| poole2022z_fig3 | rectangular | 61 | 61 of 69 | 46 of 49 | 2 | no |
| paulina-carabajal2019a_fig6 | rectangular | 7 | 1 of 12 | 0 of 0 | 0 | no |
| prieto-márquez2011b_fig3 | rectangular | 2 | 0 of 5 | 0 of 0 | 0 | no |
| prieto-márquez2006b_fig11 | rectangular | 24 | 24 of 24 | 13 of 13 | 0 | yes |
| cau2015a_fig6 | rectangular | 121 | 64 of 121 | 57 of 57 | 0 | no |
| cau2018a_fig3 | rectangular | 120 | 60 of 131 | 24 of 47 | 14 | no |
| martínez2012a_fig16 | rectangular | 16 | 16 of 16 | 6 of 6 | 0 | yes |
| xing2014a_fig13 | rectangular | 61 | 61 of 61 | 50 of 50 | 0 | yes |
| mcdonald2017a_fig15 | rectangular | 47 | 47 of 47 | 34 of 34 | 0 | yes |
| turner2012a_fig62 | rectangular | 21 | 21 of 21 | 11 of 13 | 1 | no |
| otero2010a_fig15 | slanted | 11 | 0 of 17 | 0 of 0 | 0 | no |
| yates2005a_fig9 | slanted | 36 | 36 of 37 | 24 of 27 | 2 | no |
| he2015a_fig13 | slanted (rectangular) | 34 | 34 of 34 | 31 of 31 | 0 | yes |
| meso2024a_fig5 | vertical, time axis | 11 | 0 of 23 | 0 of 0 | 0 | no |
| norman2020b_fig41 | vertical | 10 | 0 of 18 | 0 of 0 | 0 | no |
| sales2017a_fig7 | vertical | 58 | 58 of 58 | 33 of 33 | 0 | yes |

- 626 of 848 names, 74 percent; 423 of 459 scored splits, 20 wrong; 7 of 20 identical.
- By figure and not by tip, half the figures name every tip: 10 of the 20 do, and 11 name nine tenths or more.
- The sample is carried down by a few figures. Five name none or one of their tips: otero2010a_fig15, meso2024a_fig5, norman2020b_fig41, paulina-carabajal2019a_fig6 and prieto-márquez2011b_fig3, 75 tips between them. The two largest name half each: cau2015a_fig6 (64 of 121, every scored split right, 57 named tips off the tree) and cau2018a_fig3 (60 of 131, 14 splits wrong). Those seven hold 205 of the 222 names missing.
- The `reading-doubtful` warning marked exactly those seven and none of the other thirteen.
- Of the steps added since sample 7 for kinds of figure, two ran: a tip was carried through a pale bar on díezdíaz2025a_fig64, and a broken stem was joined on meso2024a_fig5. The steps for lettered boxes, pies and flat grounds ran on none of the twenty.
- Without otero2010a_fig15, which is out of scope: 626 of 831 names, 75 percent.
- Cold results of the earlier batches, for comparison: batch 3 67%, batch 4 74%, sample 3 89%, sample 4 68%, sample 5 80%, sample 6 88%, sample 7 86%.

## Sample 9 (20 cases, one unreadable figure replaced)

Drawn by the corpus session from a third census (corpus f3db12a0, `census3/README.md`): the same population rule as censuses 1 and 2, every figure they drew left out (1,306 remaining), shuffled with seed 20261271, the order kept in the repository. Census 2 could not be extended: the corpus has grown and its seed no longer gives the order its draws followed.

- 60 draws: 17 lost (7 with no caption in the text layer, 5 numbered by chapter, 5 with no figure ink), 3 not trees (boyd2015a_fig4, barrett2014a_fig3, hunt2018a_fig7), 40 trees: 29 rectangular (7 with a time axis), 8 vertical (6 with a time axis), 3 slanted.
- The draw: `census3/scripts/gold_draw9.py`, seed 20261272, stratified as samples 7 and 8; pools and picks in `gold_draw9_result.json`.
- xu2010e_fig3 is unreadable as printed (18 tip branches for 17 names, the names drifting below their lines) and was replaced by godefroit2012b_fig20, drawn with seed 20261273 from the same stratum.
- Panel A is taken on carballido2015a_fig6, longrich2010a_fig7, mcphee2015b_fig12 and morschhauser2018a_fig4; regaladofernández2022a_fig19 is the top one of three trees on its image.
- 654 tips.

### Sample 9 baseline (tree extractor 0.17.0 plus the thickness guard, commit a87f1e9, run cold on 2026-11-27)

| Case | Layout | Tips found | Names | Splits | Wrong splits | Identical |
|---|---|---:|---:|---:|---:|---|
| arai2023a_fig3 | rectangular, time axis | 19 | 19 of 19 | 11 of 12 | 0 | no |
| peyredefabrègues2020a_fig12 | rectangular, time axis | 32 | 14 of 39 | 8 of 11 | 3 | no |
| vanderreest2017a_fig3 | rectangular, time axis | 15 | 15 of 15 | 10 of 10 | 0 | yes |
| carballido2015a_fig6 | rectangular | 20 | 20 of 20 | 12 of 12 | 0 | yes |
| delcourt2020a_fig3 | rectangular | 43 | 41 of 42 | 20 of 20 | 0 | no |
| godefroit2012b_fig20 | rectangular | 21 | 21 of 21 | 18 of 18 | 0 | yes |
| longrich2010a_fig7 | rectangular | 52 | 0 of 17 | 0 of 0 | 0 | no |
| mcphee2015b_fig12 | rectangular | 37 | 37 of 37 | 29 of 29 | 0 | yes |
| prieto-márquez2010a_fig3 | rectangular | 53 | 37 of 52 | 34 of 34 | 0 | no |
| prieto-márquez2011c_fig3 | rectangular | 49 | 47 of 48 | 44 of 44 | 0 | no |
| royo-torres2020a_fig18 | rectangular | 112 | 111 of 112 | 94 of 95 | 1 | no |
| smith2007a_fig7 | rectangular | 36 | 36 of 36 | 27 of 27 | 0 | yes |
| torcidafernández-baldor2017a_fig20 | rectangular | 18 | 18 of 18 | 8 of 8 | 0 | yes |
| zhang2022a_fig16 | rectangular | 24 | 24 of 24 | 7 of 7 | 0 | yes |
| averianov2016a_fig11 | slanted | 15 | 15 of 15 | 10 of 11 | 0 | no |
| regaladofernández2022a_fig19 | slanted (rectangular nodes) | 100 | 41 of 67 | 16 of 16 | 1 | no |
| herne2019a_fig28 | vertical, time axis | 9 | 5 of 16 | 0 of 0 | 0 | no |
| martínez2017a_fig11 | vertical, time axis | 31 | 13 of 17 | 7 of 10 | 2 | no |
| whitlock2020a_fig15 | vertical, time axis | 39 | 11 of 29 | 3 of 3 | 0 | no |
| morschhauser2018a_fig4 | vertical | 9 | 8 of 10 | 5 of 5 | 0 | no |

- 533 of 654 names, 81 percent; 363 of 372 scored splits, 7 wrong; 7 of 20 identical.
- By figure: 9 of the 20 name every tip, and 12 name nine tenths or more.
- One figure names none: longrich2010a_fig7, 17 tips, where 26 tips are found and none matches a name. Six more name between a third and three quarters: herne2019a_fig28 (5 of 16), whitlock2020a_fig15 (11 of 29), peyredefabrègues2020a_fig12 (14 of 39), regaladofernández2022a_fig19 (41 of 67), prieto-márquez2010a_fig3 (37 of 52), martínez2017a_fig11 (13 of 17). Those seven hold 116 of the 121 missing names.
- The vertical figures with a time axis are the weak stratum: 29 of 62 names over the three. The other strata: rectangular with a time axis 48 of 73, rectangular 392 of 427, slanted 56 of 82, vertical 8 of 10.
- `reading-doubtful` marked five: herne, longrich, martínez, peyre de fabrègues and whitlock. It did not mark regaladofernández2022a_fig19 (100 tips found for 67, the other trees of the image read with it) or prieto-márquez2010a_fig3 (53 tips found, 37 named).
- averianov2016a_fig11, flagged by the corpus session as a slanted cladogram of the kind of otero2010a_fig15, names all 15 of its tips, with 10 of 11 splits.
- royo-torres2020a_fig18, 112 tips with names about 8 pixels tall, names 111.
- Cold results of the earlier batches, for comparison: batch 3 67%, batch 4 74%, sample 3 89%, sample 4 68%, sample 5 80%, sample 6 88%, sample 7 86%, sample 8 74%.

## Sample 10 (20 cases, none replaced)

Drawn by the corpus session from census 3 extended along its kept order (corpus 2518a5b2, `census3/order.json`): draws 61 to 120, located and classified as before, 5 lost, 7 not trees, 48 trees.

- The pool: the 66 trees of census 3 without a gold case, over draws 1 to 120, less butler2007a_fig3 (a tree with no tip names) and xu2010e_fig3 (unreadable, sample 9).
- The draw: seed 20261274, stratified as samples 7 to 9; pools, picks and flags in `census3/scripts/gold_draw10_result.json`.
- Two trees on the image, the gold the left one: arbour2014b_fig12, isasmendi2024a_fig10.
- Flagged by the corpus session as slanted cladograms on a spine, the kind of otero2010a_fig15: canale2009a_fig3, curryrogers2001a_fig4, hill2003a_fig9; and lü2004a_fig8, slanted with every branch a straight diagonal.
- Noted as likely to need a person's help and left plain: martínez2016a_fig10 (names beside renderings, not at the branch ends), martz2017a_fig6 (skull drawings), canale2009a_fig3 (bone photographs), rauhut2024a_fig25 (colored boxes behind the branches), jiménezvelandia2025a_fig9 (colored dots on the branches).
- zheng2026a_fig7 has one tip that is an unnamed empty oval, left out of its gold tree.
- 591 tips.

### Sample 10 baseline (tree extractor 0.19.0, commit 1623b3a, run cold on 2026-11-27)

| Case | Layout | Tips found | Names | Splits | Wrong splits | Identical |
|---|---|---:|---:|---:|---:|---|
| boyd2015a_fig5 | rectangular, time axis | 112 | 62 of 65 | 47 of 51 | 3 | no |
| jasinski2020a_fig3 | rectangular, time axis | 40 | 38 of 38 | 24 of 24 | 0 | yes |
| jiménezvelandia2025a_fig9 | rectangular, time axis | 38 | 14 of 40 | 8 of 8 | 0 | no |
| maidment2025b_fig3 | rectangular, time axis | 13 | 13 of 14 | 8 of 8 | 0 | no |
| zheng2026a_fig7 | rectangular, time axis | 36 | 11 of 11 | 3 of 3 | 0 | no |
| arbour2014b_fig12 | rectangular | 37 | 20 of 20 | 14 of 14 | 0 | yes |
| currie2019a_fig22 | rectangular | 37 | 37 of 37 | 25 of 25 | 0 | yes |
| dalman2025a_fig32 | rectangular | 75 | 74 of 84 | 62 of 63 | 0 | no |
| isasmendi2024a_fig10 | rectangular | 43 | 25 of 25 | 9 of 9 | 0 | yes |
| maidment2006b_fig8 | rectangular | 10 | 10 of 10 | 7 of 7 | 0 | yes |
| martínez2016a_fig10 | rectangular | 0 | 0 of 5 | 0 of 0 | 0 | no |
| mcdonald2011a_fig1 | rectangular | 46 | 46 of 46 | 24 of 24 | 0 | yes |
| rauhut2024a_fig25 | rectangular | 47 | 47 of 47 | 36 of 36 | 0 | yes |
| canale2009a_fig3 | slanted | 3 | 0 of 17 | 0 of 0 | 0 | no |
| curryrogers2001a_fig4 | slanted | 17 | 15 of 17 | 9 of 11 | 0 | no |
| hill2003a_fig9 | slanted | 25 | 24 of 24 | 14 of 17 | 1 | no |
| lü2004a_fig8 | slanted | 20 | 20 of 20 | 17 of 17 | 0 | yes |
| godefroit2013b_fig3 | vertical, time axis | 24 | 24 of 24 | 20 of 20 | 0 | yes |
| martz2017a_fig6 | vertical, time axis | 24 | 24 of 24 | 17 of 17 | 0 | yes |
| lindoso2019a_fig11 | vertical | 23 | 23 of 23 | 15 of 20 | 2 | no |

- 527 of 591 names, 89 percent; 359 of 374 scored splits, 6 wrong; 10 of 20 identical.
- By figure: 13 of the 20 name every tip, and 15 name nine tenths or more.
- Three figures hold 48 of the 64 missing names: jiménezvelandia2025a_fig9 (14 of 40, read in three pieces with 35 names over the whole figure), canale2009a_fig3 (0 of 17, bone photographs beside a slanted cladogram) and martínez2016a_fig10 (0 of 5, names beside renderings). dalman2025a_fig32, a page render of 84 tips, misses 10.
- By layout: rectangular, time axis 138 of 168, rectangular 259 of 274, slanted 59 of 78, vertical, time axis 48 of 48, vertical 23 of 23.
- The slanted figures the corpus session flagged: lü2004a_fig8 is identical to its gold tree, hill2003a_fig9 names 24 of 24 with 14 of 17 splits, curryrogers2001a_fig4 15 of 17. Only canale2009a_fig3 is not read.
- The two figures with a second tree are both identical to gold on the tree scored, and each reading holds two trees (20 and 17 tips; 25 and 18).
- `reading-doubtful` marked two: canale2009a_fig3 and jiménezvelandia2025a_fig9. It did not mark martínez2016a_fig10, where no tree was found to judge.
- Ruled out of scope by Sarah on 2026-11-27, kept in the sample and not worked on: canale2009a_fig3, a cladogram drawn as a V on its root with every branch a diagonal and the names set upright along the top, the kind of otero2010a_fig15 (cropped to its tree alone it still gives no tree); and martínez2016a_fig10, whose names stand beside renderings and not at the ends of the branches. Without the two: 527 of 569 names cold, 93 percent.
- Cold results of the earlier batches, for comparison: batch 3 67%, batch 4 74%, sample 3 89%, sample 4 68%, sample 5 80%, sample 6 88%, sample 7 86%, sample 8 74%, sample 9 81%.

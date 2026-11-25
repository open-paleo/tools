# tree-extractor

Extracts phylogenetic trees from figure images and writes them as Newick and Nexus. Built for the
[Open Paleo](https://github.com/open-paleo) project, where published cladograms are the only
machine-unreadable source for many fossil groups, but general enough for any tree figure drawn
with straight branches.

Everything runs in TypeScript with no native image library and no machine-learning model: the
figure is reduced to dark pixels, its straight lines are traced into a graph, and labels are read with
[Tesseract.js](https://github.com/naptha/tesseract.js) and matched against a list of taxon names
when one is supplied. The same core runs in the browser and in Node, so the interactive viewer and
the batch command line give identical results.

## Status

Early, and measured. Three sets of figures say where it stands.

**Benchmark** (`npm run bench`): twenty-five published figures with gold trees and fifteen
synthetic ones. Fourteen of the published figures come out identical, tips, names and splits, among
them a 75-tip staircase consensus with clade arrows, a 74-tip and a 68-tip strict consensus, a
60-tip stegosaur consensus and a 28-tip centrosaurine time tree. Of the rest, most name nearly
every tip and recover most splits: a 69-tip sauropodomorph time tree names 66 with all 47
scored splits, a 52-tip paravian time tree names 50 with 46 of 47, a 30-tip centrosaurine tree
with node discs, range ovals and silhouettes names 29 with all 19. The weakest is a 15-tip
slanted cladogram from a low-resolution 1990s scan, whose labels are too small to read. Twelve
of the fifteen synthetic figures are identical. Nineteen of the published figures are openly
licensed and ship with the benchmark; `bench/README.md` says how to supply the rest. The
figures that must stay identical are listed in `bench/expectations.json` and checked on every
change.

**Gold sample** (`npm run bench:holdout`): 194 more figures with gold trees. A hundred and
eighty of them were drawn at random, in batches of twenty and one of eighty: most from the
census below, the last three batches from a second census of ninety-four trees drawn the
same way from captions the first had not drawn. Their scores so estimate accuracy on the typical
figure and not on figures picked for being hard. Each batch was first run cold, before any
change was made for it, and only then worked on; `bench/holdout/random-sample.md` gives the
draws and each batch's cold result. The last six batches of twenty named 67, 74, 89, 68, 80
and 88 percent of their tips cold, the last three of those being the ones from the second
census. Four more were picked for a feature, marks for character changes drawn on the
branches, and count in no estimate. Over all 219 figures with gold trees the pipeline now
names 6,792 of 7,194 tips, and 81 figures come out identical.

**Census** (`npm run bench:census`): 178 tree figures drawn from the Open Paleo corpus
(`bench/holdout/census.md` gives the sampling), run with the batch runner and not scored
against gold trees. All 178 run without a crash and 174 give a tree of three tips or more, at
a median of 3.6 seconds a figure; rectangular figures yield a median of 29 tips, slanted 15,
vertical 18. On the 66 figures with a taxon list, 93 percent of the tips in the tree carry an
accepted name. The class that still lags is the time-calibrated figure: 27 percent of the tips
found on those have no label read, against 16 percent elsewhere, mostly from range bars and
node markers that stand between a tip and its label. The census itself lives in the private
corpus archive, not here; the gold sample above was drawn from it.

**What it handles**

- Layouts: rectangular trees with the root on the left; vertical trees, which are turned a
  quarter, with their labels set on their side read in a level frame; slanted trees, traced
  from the skeleton of their line art; trees drawn with forks or fans in place of verticals,
  and with rounded corners; staircases whose nodes stand a few pixels apart.
- Tree content: polytomies, also drawn as fans; support values and node labels, beside a node
  or printed on it; clade names, told from tip names; filled, open and numbered node markers;
  collapsed clades drawn as wedges or bars.
- Time trees: stage charts, time axes and range bars, with ages assigned when an axis reads;
  dotted guide lines; stage bands and clade boxes behind the tree, including ones as dark as
  ink.
- What stands around a tree: silhouettes, legends, frames, callouts and icons set on
  branches; several trees in one figure, through a region.
- Names: labels matched to a list of taxa, with the abbreviations of nomenclature ("sp.",
  "cf.", "gen. et sp. nov.", "nom. dub.") left out of the match; names set apart from their
  branch ends, beside a drawing of each taxon, paired in order.

`docs/design.md` describes each step and its known gaps.

**When it fails, it says so.** Most figures are read nearly whole and a few hardly at all, so
every reading is judged by what it shows of itself: how many tips the tree has, how many were
named, how many of the tips found are joined to it, and how many rows that look like labels
were left over. A reading that fails one of these begins its quality checks with the warning
`reading-doubtful` and the reason; the viewer shows it above the results. Over the gold
figures the warning marks 10 of the 14 readings that named under 70 percent of their tips and
4 of the 170 that named 90 percent or more.

## Use

Requires Node 24 or later.

```sh
npm install        # from the repository root or from this folder

# Batch: one image in; Newick, Nexus, a redrawn SVG and the JSON document out, with a QC report on stdout
npm run extract -- extract figure.png --names taxa.txt --out results/ --overlay

# A folder of figures, each with its own name list beside it (figure.txt next to figure.png),
# or a shared names.txt in the folder; one summary line per figure
npm run extract -- extract figures/ --out results/

# Interactive: build the browser bundle and serve the viewer at http://localhost:8787/src/web/
npm run web
```

The viewer page loads Tesseract.js, its core and its language data from `node_modules`, so it
makes no request to any other host.

`--crop x,y,w,h` restricts the analysis to one region of the image (for example to leave out a
time scale or a second panel); results are still reported in full-image coordinates.
`--exclude "x,y,w,h;x,y,w,h"` leaves areas out of the analysis, a legend, a pie chart or a
silhouette beside the tree; each is painted out before the figure is read. `--no-rotation`
takes the figure as drawn where the tool would turn a tree on its side.

`--names` is a text file with one taxon name per line (for example the taxa of the paper's
character matrix). OCR output is fuzzy-matched against it, which turns imperfect reads of small
italic text into exact names. A label the list does not explain is then offered to the known
taxa of the Open Paleo data set (`names/known-taxa.txt`, every genus, species and synonym) at a
stricter threshold, and a match from there is flagged in the quality checks as coming from
outside the paper's own taxa; `--known-names` substitutes another list, `--known-clades` does the same for the list of
clades that mends the spelling of clade names, and `--no-known-names`
skips the tier. Without any list the raw OCR text is kept and uncertain tips are flagged.

The viewer runs the same pipeline on a dropped image, in a Web Worker so the page stays
responsive, and draws what it found over the figure.
Scroll to zoom, drag to pan (or use the view controls on the figure), and use *Select region*
beside the extract button to mark where the tree is when the figure holds more than the tree.
*Exclude area* marks things to leave out, a legend, a pie chart or a silhouette beside the tree:
drag a rectangle over each, and click one to take it away. They are painted out before the
figure is read.

Clicking a tip or node on the canvas selects it in the lists and the other way round; labels
are editable in place and the Newick updates. Missed or spurious
elements can be fixed by hand: *Add tip* then click a branch end, *Add node* then drag along the
missing vertical connector (it takes over the branches it crosses), *Move* then drag a tip or
node onto the node it should hang from (the parent it leaves collapses if only one child
remains), and *Delete* removes the selected tip or node, dissolving a node into its parent. A
piece the trace could not connect stays in the results, drawn in red; the quality check that
names it selects it when clicked, and moving its root onto the right node restores it. Every
edit can be undone and redone (Ctrl+Z and Ctrl+Shift+Z, or the buttons), back to the extraction.
Below the Newick, the traced tree is redrawn clean: root on the left, tips evenly spaced, branch
lengths from the time axis when one was read; unchecking *Draw branch lengths* sets every tip
on one line with each level apart, which is easier to compare with the figure. It updates with every edit, doubles as a check on
the trace, and downloads as SVG, so a figure that went in on its side with silhouettes and bands
comes out as a plain horizontal tree.

## Embedding the viewer

The viewer is a component a page can mount; the standalone page above is a thin wrapper over
the same function. The package ships built JavaScript with type declarations as a tarball
attached to each GitHub release.

```ts
import { mountTreeExtractor } from "@open-paleo/tree-extractor/viewer";
import "@open-paleo/tree-extractor/viewer.css";

const viewer = mountTreeExtractor(document.querySelector("#tool"), {
    workerUrl,                      // URL of the package's ./worker module, built or bundled
    loadTesseract,                  // returns the Tesseract.js module; omit to trace without reading labels
    tesseractPaths: { workerPath, corePath, langPath },
    knownNames,                     // an array of names, or the URL of a text file, one per line
    knownClades,                    // the same, for clade names above the genus
});

viewer.getNewick();                 // the tree with the user's edits, or null
viewer.getDocument();               // the extraction document, or null
viewer.destroy();                   // removes listeners, worker, OCR engine and markup
```

The same viewer is available as a custom element, which mounts when it joins the page and
removes itself when it leaves. Locations are attributes; the Tesseract.js loader and a list of
names are properties, set before or after the element is defined:

```html
<tree-extractor worker-url="/assets/worker.js" known-names-url="/data/taxa.txt" known-clades-url="/data/clades.txt"
    tesseract-worker-path="/assets/tesseract/worker.min.js" tesseract-core-path="/assets/tesseract-core/"
    tesseract-lang-path="/assets/tessdata"></tree-extractor>
```

```ts
import { defineTreeExtractorElement } from "@open-paleo/tree-extractor/element";

defineTreeExtractorElement();           // importing alone defines nothing
document.querySelector("tree-extractor").loadTesseract = loadTesseract;
```

A second OCR engine is optional. Given `loadSecondOcr`, a function that returns an engine, the
viewer shows a checkbox, *Read unmatched labels a second time*; when it is checked, a label
whose first reading matches no name is read again and the second reading kept if it matches
one. `createPaddleOcr` from `@open-paleo/tree-extractor/paddle` makes such an engine from
PaddleOCR's PP-OCRv5 recognition model: it takes the ONNX Runtime module (`onnxruntime-web`
1.31.1 is what the tests ran against), the model's location or bytes, and its dictionary as
text, one character to a line. On the custom element the loader is the `loadSecondOcr`
property, set before the element joins the page. The runtime's WebAssembly binary and the model come to about
11 MB compressed, fetched on the first run that uses them.

The viewer requests nothing the host did not name. Tesseract.js loads three things of its own,
and a host that allows no third-party requests serves them itself and passes their locations:
the worker script (`tesseract.js` 6.0.1, `dist/worker.min.js`), the core (`tesseract.js-core`
6.1.2, the whole package directory) and the English language data (`@tesseract.js-data/eng`
1.0.0, the `4.0.0_best_int` directory). Those are the versions the tests here run against.
`sharp` is an optional peer, needed only by the command line, so installing the package for
the viewer does not bring it in.

Everything the viewer adds sits inside the element it is given, which gets the class
`tree-extractor`; ids carry a `te-` prefix. Its stylesheet has no rule outside that class and
takes its colors, fonts and corner radius from custom properties the host may set:
`--te-background`, `--te-surface`, `--te-ink`, `--te-muted`, `--te-line`, `--te-accent`,
`--te-accent-soft`, `--te-on-accent`, `--te-caution`, `--te-danger`, `--te-font-sans`,
`--te-font-mono`, `--te-font-size`, `--te-radius` and `--te-canvas-height`. No text is smaller
than 14 px. The fallbacks follow the page's
`color-scheme`. The controls form a bar across the top with the figure and the results side by side below;
under 760 px of its own width the viewer becomes one column, down to 320 px.

Controls are labeled and reachable from the keyboard: an entry in the tip or node list selects
on focus, Delete, Undo and Redo are buttons and keys, and *Move the selection under* moves the
selected tip or node to a node chosen from a list. Adding a tip or a node needs a pointer. The
browser test checks the page with axe at WCAG 2.2 AA in light and dark.

## Scope

Trees drawn with straight branches: rectangular, with the root at the left, bottom or top,
slanted, and drawn with forks, fans or rounded corners. Tip labels, support values at nodes,
polytomies, collapsed clades drawn as wedges or bars. When a time axis with readable numbers
is found, nodes and tips get ages and the Newick carries branch lengths in the axis's units; a
phylogram with no readable axis, told by its tips not lining up, gets its branch lengths in
pixels.

Not yet, or not well:

- Circular trees.
- A figure that holds several trees is read one region at a time.
- Labels that are PDF text laid over a picture are not in the picture: render the page with
  its text and crop to the figure.
- Small figures in small type, with letters under about ten pixels tall, where words blur into
  bars.
- Lettering as heavy as the branches and set against them.
- A tree with the root on the right.

## Development

```sh
npm test                 # unit tests (node:test)
npm run test:web         # drives the built viewer in headless Chromium through an editing session
npm run bench            # benchmark against gold trees; see bench/README.md for supplying images
npm run bench:strict     # the same, failing when a case expected identical is not
npm run bench:holdout    # the gold sample: 194 more figures with gold trees
npm run bench:census     # the corpus census, from a checkout named corpus beside this repository
npm run bench:generate   # render synthetic figures in several styles for the benchmark
npm run lint             # eslint, same style as the other Open Paleo repositories
npm run typecheck
npm run spellcheck
```

The three benchmark commands spread their cases over several processes, one fewer than the
machine has cores and eight at most; `-- --jobs=N` sets the number, and `-- --only=text` keeps
the cases whose names hold that text.

Any change under `src/core` must leave `npm run bench:strict` green; the cases it must keep
identical are listed in `bench/expectations.json`.

A release is a version tag: pushing `tree-extractor-v1.2.3` with that version in `package.json`
and its entry in `CHANGELOG.md` runs the checks, attaches the packed tarball to a GitHub
release, and notifies `open-paleo/web`, which pins the tarball by URL and hash. Releases up to
0.7.2 were tagged `v1.2.3`, before this tool shared its repository with others.

Code style follows the Open Paleo conventions (Allman braces, four-space indent, `type` over
`interface`, no abbreviated names, JSDoc on everything exported).

## License

MIT. Tesseract.js is Apache-2.0; sharp (used only by the command line for image decoding) is
Apache-2.0. The optional second OCR engine runs on ONNX Runtime (MIT) with PaddleOCR's PP-OCRv5
recognition model (Apache-2.0, published by PaddlePaddle); neither ships with this package, and
a host that serves the model keeps the Apache-2.0 text with it.

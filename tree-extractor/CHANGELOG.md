# Changelog

## 0.10.0 (2026-11-22)

- A slanted tree drawn without a root stub, two lines meeting at a corner, is rooted at that
  corner (`root-at-corner`). It was rooted at one of its tips, which paired the first two
  tips and lost another (Brusatte 2008, 5 of 8 names to 7, in the right order).
- A nearly level branch of a slanted tree that ends in line with the other tips is a tip's
  branch, not a leader line to a label.
- A figure is also read reduced when its letters are 38 pixels tall or more and at least a
  fiftieth of its shorter side: bold labels of that size on a small tree (Brusatte 2008, two
  figures; Han 2015; Arcucci 2003: 8 of 31 names to 16 between them).
- Fixed: a figure read reduced and also turned on its side gave its image size the wrong way
  round, and no overlay could be drawn on it.
- In a figure with thick colored branches, three more things that lettering on the branches
  did (Cau 2018, 117 of 132 names to 127, and its wrong split gone): the stub of a tip in
  dark ink as thick as the colored lines is no longer cut by a number's row beside it; a
  rough text row that took in a number, a stub and a label is parted at the stub; and two
  level pieces are not joined across a number when a vertical crosses the gap between them.
- Colored and gray branches are followed under black lettering printed on them. In a figure
  with thick colored branches and a number at each node, the numbers lie on the short steps
  between branches and the tree parted at each one (Cau 2018, 43 of 132 names to 117).
  Lettering on a tinted panel is left alone. A branch known for line by its color is also
  no longer cut where it passes through the row of such a number.
- Branches in a light color are read from a line thickness of 6 pixels, not 8.
- A figure with very large type is read. Letters taller than 60 pixels were not taken for
  letters at all; a figure whose letters are 56 pixels tall or more is now read at the size
  that brings them to 28, and the reading is put back in the figure's own coordinates, with
  a note `figure-reduced` (Vickaryous 2002, 0 of 12 names to an exact match).
- A stem with several clade names printed across it stays in one piece. A vertical cut by
  one name was mended already; one cut by two or three was taken for a rule across the
  labels. It is mended now when branches leave its top and bottom pieces (Bajpai 2023, 18 of
  37 names to an exact match).
- Branches drawn in a light color are read where a figure draws its branches in thick color:
  straight strokes in yellow, pink or light green, as thick as the colored lines and joined
  to the tree, were too light to count as ink (Motta 2025, 20 of 29 names to an exact match).
- A ring on a node may be an oval. An upright oval was not taken for a node's ring, not being
  round, and cut the node's vertical in two (Xu 2018, 9 of 19 names to 15).
- A reading that is not to be relied on says so. The quality checks begin with a warning,
  `reading-doubtful`, when the tree has under four tips, when under three quarters of its tips
  match a name (or have a label, where no list was given), when under seven tenths of the
  named tips found are joined to it, or when rows that look like labels and belong to no tip
  outnumber what a sound reading leaves. The viewer shows it as a notice above the results,
  and the command line marks such a figure in a folder's summary. Over the 134 gold figures
  it marked 12 of the 13 readings that named under 70 percent of their tips and 2 of the 99
  that named 90 percent or more; on a further twenty figures it had not been set on, 3 of 4
  and 1 of 13.

## 0.9.0 (2026-11-21)

- A branch is carried under a small colored shape set on it, an icon that says where a clade
  lived, where a line of ink arrives at the shape on both sides (Arbour 2015 fig. 12, 32 of
  41 names to 37, two detached groups joined).
- A clade's box in a color dark enough to be solid in the text ink is painted out as a
  ground: the names printed on it could not be read (Poole 2022, 47 of 68 names to 62).
- A dark gray ground is painted out as a deep-colored one is: a stratigraphic band in gray
  under the line threshold was one block of ink, and the names printed on it had no branch
  to end at (Scannella 2014, 10 of 23 names to 20).
- A tree set in type large for its branches is no longer turned on its side. Tip branches
  shorter than two letter heights were not counted as branches, so only the verticals' ends
  were; where much more of the line art lies in runs one letter height long, the ends are
  counted on those (Zhou 2026, no names to 30 of 34).
- A rectangular tree of hairlines among colored arrows and numbers is no longer taken for a
  slanted one: lines are taken to slant where under 24% of the line art lies in long runs,
  not 30% (Lang 2010, no tree to 38 of 39 names).
- Trees drawn with rounded corners are read. Where each branch leaves its node through a
  small curve, the node's vertical is carried to the branch's row and the branch back to the
  vertical, on figures that have such a corner at nearly every node (Lerzo 2021, four wrong
  splits to none and all 18 splits right).
- A ground as dark as ink behind the tree, a stage of the time scale in deep green, is
  painted out before the figure is measured; it was read as one solid block of ink and the
  branches crossing it were lost (Qiu 2025, 3 of 10 names to 8).
- Dotted guide lines are erased before a figure is measured. The dots of a time scale's grid
  passed for letters, hundreds of them, and the figure's letter height became a dot's
  (Fiorillo 2014 fig. 6, no names to all 11).
- A support value printed on a node, in a gap left in the lines for it, no longer breaks the
  tree there: the lines that end around a small number are drawn on to where they meet under
  it, also where a mark set on the branch runs it on into the number's row (Hwang 2004, 9 of
  55 names to 48; Brusatte 2010 to an exact match).
- A small figure in small type is no longer taken for a slanted tree. Its branches, shorter
  than what counts as a line when the letter height is first estimated, ran together with
  the labels, the height came out several times too large, and no branch was then long
  enough to count (Prieto-Marquez 2013 fig. 26, no tree to all 34 names).

## 0.8.1 (2026-11-21)

- Trees drawn with fans are read: where several risers leave one node and the steeper ones
  come out as a single leaning line, the fork found there adds its branches to that node
  (Averianov 2021 fig. 4 to an exact match; Sues 2014, 6 of 8 splits to 7 and its extra tip
  gone).
- More abbreviations of nomenclature are left out when a label is matched to a name: "tax.",
  "fam.", "comb.", "stat.", "nom. dub.", "nom. nud.", "incertae sedis", "spp.", "ssp.",
  "subsp.", "var." and "sensu lato" join "sp.", "cf.", "aff.", "gen." and "nov.".
- A clade's name followed by a note of status is still a clade's name: "Riojasauridae tax.
  nov." was matched to the genus Riojasaurus of the list (Yates 2007 to an exact match).
- A name of the paper's own list read at a node is a tip of that node. Where a node's branch
  runs straight on into its middle child's, the tip's stretch is too short to be a line, and
  the name was kept as the node's label (Poropat 2014, 33 of 36 names to 35; Fonseca 2024;
  Prieto-Marquez 2012).
- A small numbered dot on a node beside a tip's label is found although the ends of its
  lines were sorted with the lettering, and is kept out of the label's row.
- In a slanted tree, the forks inside a fan's wedge are one node. A polytomy drawn as a fan
  has its lines run together into a black wedge at the node, and the skeleton forked wherever
  a line parted from the rest (Upchurch 2015, six wrong splits to two; Gallina 2014, four to
  none).
- A clade's name standing near its node with no branch drawn to it is no tip, whether printed
  against the node or set off on a leader line, and though it has lost its first letter
  (Gomez 2024 to an exact match; Han 2024 loses its extra tip).
- Lines that arrive at the edge of a numbered disc are carried on to the cross drawn through
  it. A disc set on the step between two verticals, or beside a line it only touches, was
  cleared with the parts of those lines beside it (Rauhut 2012 fig. 4 to an exact match;
  Perez-Pueyo 2019, 6 of 15 splits to 13 and four wrong ones gone).
- A family's or higher name printed against a node, with no branch of its own, names the
  node where the paper's list does not have it, in place of standing as a tip (Fiorillo 2012
  fig. 7 to an exact match).

## 0.8.0 (2026-11-21)

- A branch may begin a little past the end of a riser that leans, where no upright one is in
  reach (Mateus and others 2011, Brachiosaurus).
- A filled dot before a tip's label gets a row of its own, so the branch may reach it; in the
  label's row it had the end of a short branch cut away.
- A thin stem run together with the range bar of a tip beyond its node is parted at the node.
  As one segment its middle was the bar's, and the stem missed the node it came from (Mateus
  and others 2011, 17 of 25 names to 20, wrong splits 3 to 1).
- Large figures read several times faster. A figure whose first reading names half its tips
  is no longer read again turned on its side, and a candidate time axis is given up once
  six labels beside it hold no number (Fonseca 2024: 1,386 OCR calls to 200, 56 s to 14 s).
- The benchmark spreads its cases over several processes (`--jobs=N`); a full run takes about
  two minutes where it took over thirty.
- Trees drawn with forks are read. Where each node is a point with one line slanting up to a
  child and another slanting down, and the figure has hardly a vertical in it, a vertical is
  stood in for every fork and the children's branches are carried back to it (Averianov
  2021 fig. 23, 11 of 20 names to an exact match).
- A short upright that one branch crosses and none ends at is left out as a stroke of
  lettering: a digit of a support value printed against a stem cut the stem in two and left
  everything past it detached (Fonseca 2024, four tips).
- A support value printed just before a tip's label gets a row of its own. The two clustered
  into one row, and the short branch between them, lying inside a text row, was cut away
  with its tip (Fonseca 2024, 151 of 170 names to 155).
- A label's row is measured by its letters when a branch is tested for running through it:
  a row that took in the label's own range bar stood taller than its text and cut the branch
  of the tip above (Rauhut 2019's Suchomimus).
- A vertical is no longer split at a jog where two lines run side by side along it and its
  stem arrives below the jog: the upper line goes on down beside the lower, and the split
  cut it off from its stem (Rauhut 2019's Dilophosaurus).
- The step of a staircase only a few pixels long is found: where a vertical ends in a join to
  a second vertical at most three pixels beside it, which goes on past that end and has no
  branch of its own arriving, the join is taken as the branch between them (Rauhut 2019, 49
  of 57 names to 53). The wider search between any two close verticals stays a setting.
- A staircase read as one node is taken apart again. Where the nodes of a backbone stand a
  few pixels apart, their verticals close into one broad vertical holding every branch; its
  children are now nested by where each branch begins along that breadth (Rauhut 2019, 22
  of 39 splits to 34).
- Two verticals in one column stay two nodes when each turns into a branch of its own at the
  end facing the other and the column between them is blank, however much ink stands beside
  the gap.
- Names that stand apart from the branch ends are paired with the tips in order. Where most
  tips of the tree are unnamed and rows elsewhere read as names, beside a drawing of each
  taxon, say, the tips from the top down take the names from the top down; at least three
  must pair, and the quality checks say how many did (Gomez 2024, 1 of 14 names to all 14).
- Two verticals a few pixels apart, closed into one broad line, no longer join every branch
  that meets them into a single piece. The breadth of such a line counted as horizontal ink
  in each of its rows; where that made a piece too tall to be a line, those short runs are
  now left out (Sanchez-Fenollosa 2025, whose tree came out in two halves).
- A figure whose orientation cannot be decided is read turned as well, when as many branch
  ends have their label above or below as beside them, and the reading that names clearly
  more tips is kept. A tree drawn root-down with level notes scattered over it used to be
  read as it stood, and gave nothing (Funston 2026). The same is done for a figure taken as
  root-left when a third of its lettering is on its side (Penkalski 2018).
- A guide line ruled across the figure is left out: a vertical running a fifth of the figure
  or more that branches cross and at most one ends at. Such a line cut every branch it met
  and held the pieces as its children.
- A tip is carried through a wedge that opens wider than a label row is tall, where a label
  begins just past it: a collapsed clade drawn as a long triangle (Funston 2026).
- The `rotation` parameter also takes `"root-bottom"` and `"root-top"`, to say how the tree
  stands.

## 0.7.4 (2026-11-20)

- On a figure drawn on a colored ground, a range bar or an arrowhead before a label is again
  kept out of the label's box. The ground had counted as one great pale marker, so that
  nothing on it stood out as a marker of its own.
- A boxed inset, such as a legend or a time scale drawn as a column of cells, is left out of
  the tree: a frame of four lines that nothing crosses goes with what it holds, and the
  quality checks name it. Its frame had served as a node, and its entries as tips.
- The few pixels of branch between a node and a range bar are traced as a branch, where they
  are too short to count as a line: the tip then runs through the bar to its label. On Wang
  2025 the bars' darker edges had been standing in for those branches, joining some tips to
  the wrong node.

## 0.7.3 (2026-11-19)

- Labels over a background band no longer lose their first letters. A band at the level of
  faint ink was faint in speckles, which joined the letters standing on it into a blob; faint
  lettering strokes must now be darker than the background around them.
- Where thickening thin lettering leaves fewer than half the text rows it started with, the
  lettering is kept as it was.
- A small solid node dot is found more readily, but only at a junction with lines on three
  sides, so that a dot ending a tip's branch is not taken for one.
- A tip on a stub too short to trace is recovered even when a node beside it had taken its
  label for the node's own.
- A tip's label set on two lines is read whole: the second line is the unclaimed row just
  under the first, starting where it starts and nearer than the next tip's label would be.
- A row at a node that is a single thin stroke and read without confidence is a leader line,
  and is no longer given as a support value.
- Over 94 gold figures, 2,899 of 3,204 tips are named, from 2,878, and no figure loses a name.
- The tool moved into the `tree-extractor` folder of a repository shared with other Open Paleo
  tools. Its releases are now tagged `tree-extractor-v1.2.3`; the package and its contents are
  unchanged.

## 0.7.2 (2026-11-19)

- Faint ink beside a line counts only where it is darker than the background around it. A
  gray band or a tint used to be taken as faint ink along every line that crossed it, which
  thickened the lines until close verticals ran together.
- Branches drawn in a dark, muted color (a slate blue) or a vivid light one (a yellow) are
  traced. Strokes in those colors that close on themselves, run along a filled shape or are
  dashed are left out: the outline of a shaded clade, the edge of a range bar, a boundary rule.
- A solid node marker beside two close verticals is found as a marker, and no longer joins
  them into one node.
- Where two verticals are equally near a branch end, to within a pixel, the taller takes it.
- Over 94 gold figures, 2,878 of 3,204 tips are named, from 2,837. Two figures lose a name.

## 0.7.1 (2026-11-19)

- `createPaddleOcr` accepts the `onnxruntime-web` module as it is typed, with no cast: the
  runtime's outputs are taken as unknown and checked to be a tensor of numbers.
- The recognition session logs errors only. The model as published carries unused
  initializers, and the runtime printed a warning for each when the engine started.

## 0.7.0 (2026-11-19)

- A second OCR engine can give a second reading. `createPaddleOcr` (`src/ocr/paddle.ts`) runs
  PaddleOCR's PP-OCRv5 line recognizer on an ONNX Runtime the caller supplies, in the browser
  or in Node. A tip's label whose first reading matches no name is read again by the second
  engine, and that reading is kept only if it does match one. Over the 94 gold figures this
  names 34 more tips when no paper's list is given, and 4 more with one.
- The viewer takes the second engine through a `loadSecondOcr` option, as it takes Tesseract;
  without the option nothing changes. With it, a checkbox appears under *Read labels (OCR)*,
  *Read unmatched labels a second time* (`#te-second-ocr`), unchecked at first; the engine is
  loaded on the first run that asks for it. The standalone page offers it with
  `?second=<folder holding inference.onnx and dict.txt>`.
- A second reading never gives a tip a name that a first reading gave another tip, so a
  label cut short cannot be matched to a name already in the tree.
- `OcrEngine` gains an optional `recognizeAgain`; the custom element takes the second engine
  as its `loadSecondOcr` property; the package exports the engine as `./paddle`.
- The benchmark runs with another engine (`OCR_MODULE`) and without the papers' lists
  (`--no-names`).

## 0.6.0 (2026-11-18)

- The redrawn tree can be drawn without branch lengths: with *Draw branch lengths* unchecked
  every tip ends on one line and every level has room of its own, which makes the drawing
  easier to check split by split against the figure. *Download redrawn .svg* follows the same
  choice. The renderer gains a `stepWidth` option.

## 0.5.5 (2026-11-17)

- A node is no longer cut off by a scrap beside the tree. A stem that only came near its node,
  from a short vertical carrying nothing else, is let go, and the node joins the vertical it
  stands against. Between two stems that are otherwise equal, the one from the taller vertical
  wins. Both arose where an arrow pointing at a node traced as short pieces, once an excluded
  area lowered the shortest vertical the figure accepts by a pixel.

## 0.5.4 (2026-11-17)

- Areas of a figure can be left out. In the viewer, *Exclude area* takes rectangles dragged
  over a legend, a pie chart or a silhouette, any number of them, each removed by a click;
  the command line takes `--exclude x,y,w,h;...` and the library an `exclude` option. The
  areas are painted out in the color that surrounds them before the figure is read. Leaving
  an area out can change the trace elsewhere, since some limits are measured over the whole
  figure; check the result for a piece drawn in red.
- A branch that runs along the edge of a text row, unbroken and past it on both sides, is no
  longer clipped at the row: a clade's name printed just above its own stem had cut the stem
  (Fonseca 2024: 125 of 170 tips named, now 149).
- A second column is joined to the first whichever of the two the trace took for the main
  tree.
- A colored arrowhead touching the tree is no longer part of it. Thin colored ink joins the
  line ink only where it is drawn as a line, and a branch the head was drawn over is carried
  across beneath it. A head had fused with the vertical beside it, putting the node in the
  wrong place and cutting it from its parent (Alarcon-Munoz 2023).
- A branch end joined to nothing and named by nothing is dropped as a stray mark: the edge
  of a silhouette, a pie chart or a legend swatch, with no label or with a scrap of text
  that was read and is no name. A loose tip whose label is a name stays.
- When a tip chooses among label rows, height counts three times over, so the label on its
  own row beats a scrap of the next row that begins nearer.
- A vertical with a jog in it is split into the two nodes it is. In a tightly drawn pectinate
  tree the step from one node to the next can be as short as the line is thick, so the two
  verticals stand end to end and read as one node with the children of both.
- A branch that had run on to the vertical just behind the corner it turns now begins at the
  corner. Where two nodes' verticals stand side by side a few pixels apart, the child's top
  branch read as the parent's own, and the two nodes as one.
- A short vertical that joins two lines is kept as line art: one that meets other lines at
  two places well apart, its children's branches at its ends or its own stem partway down.
  No taller than a letter l, the vertical of a node with two close children went with the
  glyphs, and the node with it.
- A vertical is dropped as a letter's stroke only where it stands among a row's letters, not
  in the margin kept before each label, where a small node's vertical stands.
- Where a row's letters begin is found apart from the row's box, which the first text pass
  may have started at a small node touching the label. A branch in the row's margin that
  begins a glyph before the first letter is left whole, and the elbow rule also finds its
  first tip at the end of a branch leaving the vertical's far end.
- Two sister tips are put back under the small node they share, where the trace had passed
  over its short vertical for having a single branch and handed both tips to the node behind.
- The elbow rule no longer takes the parent node, a short stem to the left, for a node
  standing on the vertical itself, and so finds the second tip of a small node it had left
  alone.
- A line drawn in dark blue is not black ink: where blue is the strongest channel a pixel
  must be darker still to count. An arrow's dark tail had stood in the line art beside the
  tree it points at.
- A pixel dark in every channel is black ink whatever its tint. A hairline in black over a
  tinted background comes out of compression as a dark shade of the background, and was
  rejected as colored, so thin lines vanished partway along (Alarcon-Munoz 2023: 46 of 77
  tips named, now 63).

## 0.5.3 (2026-11-14)

- A vertical cut by a clade's name printed across it is joined again, where the two ends at
  the gap are loose and the column is cut only once. One such cut had left half of a tree
  without a parent (Prieto-Marquez 2012: 37 of 70 tips named, now 68).
- A plain solid dot on a junction counts as a node disc down to three line widths across,
  so the branches run on through it; such dots had been taken for letters, cutting the tree
  at every named node (Manitkoon 2023: 55 of 74 tips named, now 71).
- A traced segment whose box is far broader than its line no longer erases the labels under
  it: a vertical that had taken in a whole column of a time chart was wiping out every label
  between two stage boundaries (Perez-Pueyo 2019: 8 of 25 tips named, now 19).
- A tree drawn in two columns is joined: the connector line is followed from beside the tip
  that names the continuing clade into the root of the second column, which takes that tip's
  place (Fonseca 2024: 92 of 170 tips found, now all 170).
- A branch is no longer cut where a name is printed just above it: only ink joined to the
  branch counts when judging it too thick to be a line.
- A figure drawn light on dark is read in negative: a scan printed that way, or a screenshot
  taken in a dark theme.
- A second tip hidden in an elbow is recovered. With thick lines and short last branches, a
  pair of sister tips is a vertical with a stub at each end too short to register; the label
  left without a tip beside the vertical's end gives the second tip away (Poropat 2014: 25 of
  36 tips named, now 33).
- `npm run bench:causes` tallies lost tip names by the step that lost them, and a second
  random sample of census figures with gold trees joins the holdout.

## 0.5.2 (2026-11-13)

- Qualifiers of open nomenclature stay on a name as printed: "cf.", "aff.", "indet." and
  "sp. indet.", as "sp." already did.
- In the viewer, a node named from a shaded box shows its support value in a field of its own.
- Poole 2022 figure 3 joins the holdout with a gold tree and its nine clade names.
- A list of known clades mends the spelling of a clade's name read at a node, on a shaded box
  or at a tip that is a collapsed clade, keeping the capitals it was printed in. The list
  ships as `names/known-clades.txt` (package export `./known-clades.txt`) and is supplied to
  the viewer as `knownClades`, to the element as `known-clades-url` or the `knownClades`
  property, and to the command line with `--known-clades`. It is kept apart from the known
  taxa so that a clade never competes with a genus for a tip.

## 0.5.1 (2026-11-13)

- Name matching makes alike the letters the OCR engine takes for one another: a capital O
  read as Q, a capital I read as a small L, and the digits 0 and 1. "Quranosaurus", which the
  engine reads for an italic Ouranosaurus, finds its name.

## 0.5.0 (2026-11-13)

- A clade's name printed on the colored box or band that shades it is read and attached to
  the clade's node. The region is the fill the name sits on, or a frame drawn around it; the
  clade is the node whose tips are exactly those in the region, and a region that matches no
  single clade is left alone. The name stands for the node in the Newick; a support value
  read at the same node stays in the document.

## 0.4.3 (2026-11-12)

- A node with no label to its left takes one that begins just right of its junction, level
  with it: a clade name or support value drawn over the gap between the node's branches.
- A tip is named as printed. The known taxa now include the original combination of every
  species since moved to another genus, so a figure's "Zalmoxes shqiperorum" matches as it
  stands; and a species read correctly is kept when the known taxa hold only its genus,
  where it was being cut to the genus. The paper's own name list still decides.
- An indeterminate species, "sp." with or without a number, stays on a genus the known taxa
  supplied: "Rhabdodon sp. 1" was being named "Rhabdodon".
- The quality checks remark on a known-taxa name only when it changed what was read, and note
  a species kept as read; a name merely confirmed no longer raises a warning per tip.

## 0.4.2 (2026-11-11)

- A clade name printed at a node is kept as a name; it was read as a support value, leaving
  only the letters that pass for digits ("Dryomorpha" became "00").

## 0.4.1 (2026-11-10)

- The top box holds only what starts an extraction: the image chooser and the extract button
  side by side, the OCR choice and the region tools under them, and the names field beside
  them behind a thin rule.
- The bar above the figure holds editing only: the pointer tools (Select, Add tip, Add node,
  Move) as one joined control, and Undo, Redo and Delete. View controls sit on the figure.
- The layer toggles are a plain row under the figure; moving the selection from the keyboard
  appears beside the lists when something is selected.

## 0.4.0 (2026-11-09)

- Viewer layout: the controls are a bar across the top, with the figure and the results side
  by side below it; one column under 760 px of the viewer's own width.
- No text smaller than 14 px, and a `--te-font-size` custom property for the base size.
- The layer toggles wrap with a gap between rows.

## 0.3.2 (2026-11-09)

- The actual-size button's accessible name begins with its visible text, "1:1 (actual size)":
  the 0.3.1 wording put the text in parentheses, which newer axe reads as a different word.
  The browser test now runs the same axe version as the site.

## 0.3.1 (2026-11-09)

- The actual-size button's accessible name contains its visible text, "1:1" (WCAG 2.5.3); the
  browser test now runs the WCAG 2.1 level A rules, where that check lives.

## 0.3.0 (2026-11-09)

The viewer becomes a component a site can mount, and accuracy is measured on a random sample.

- `mountTreeExtractor(element, options)` mounts the viewer and returns a handle that reads the
  current tree and removes the viewer again; the standalone page is a wrapper over it. The
  same viewer is a custom element, `<tree-extractor>`, defined on request.
- No request to a third party: the worker, Tesseract.js, its core and its language data are
  named by the host, and the standalone page serves them from `node_modules`.
- Styles sit under one class and take colors, fonts and radius from custom properties;
  element ids are prefixed; the layout follows the width of its own element.
- Package exports for the pipeline, the viewer, its stylesheet and its worker, built with type
  declarations; `sharp` is an optional peer and `tesseract.js` is pinned.
- Accessibility: labeled controls, visible focus, lists that select on focus, moving the
  selection from the keyboard, checked with axe at WCAG 2.2 AA in light and dark.
- Twenty census figures drawn at random with gold trees, and five figures from other animal
  groups, join the holdout: 78 percent of tips named and 91 percent of splits on the random
  twenty.
- Orientation and marker detection see colored branches; repeated tip names are numbered;
  pale fills no longer flood into fragmented text.

## 0.2.0 (2026-11-06)

Trees drawn in more ways, a viewer that can finish a tree by hand, and a measured census.

- Trees drawn on their side are turned a quarter and traced like the rest; a column of level
  labels beyond the branch ends vetoes a turn, and sideways text breaks a tie.
- Slanted trees are traced from the skeleton of their line art, with fans collapsed, leaders
  dropped and paired tips read.
- Time-calibrated figures: stage charts are dropped before tracing, stage lines crossed by the
  tree are removed, node discs and rings are bridged by a painted cross, range bars in any tint
  carry a tip to its label, and a time axis with readable numbers gives ages and branch lengths.
- A phylogram with no readable axis gets its branch lengths in pixels; a cladogram gets none.
- Labels set at a slant are read in a level frame; labels may stand above their branch; a tip
  of the main tree takes a row before a loose one does; range bars stay out of text rows.
- A figure drawn in gray has its ink thresholds raised to sit above the gray.
- Viewer: move a tip or node by dragging it onto the node it should hang from, restore a loose
  piece the same way, select an element from the quality check that names it, and undo and
  redo every edit back to the extraction.
- Command line: a folder of figures is read image by image, each with the name list beside it.
- Benchmark: twenty-five published figures with gold trees, eleven identical, and fifteen
  synthetic; a held-out set run cold; a batch runner for a corpus manifest; a strict mode in CI
  that fails when a case expected identical is not; a headless-browser test of the viewer.
- Census: 178 tree figures from the Open Paleo corpus run cold with no crash, 168 giving a tree
  of three tips or more, 86 percent of tips named where a taxon list exists.

## 0.1.0 (2026-10-27)

First working version: rectangular trees with the root on the left traced to Newick and
Nexus, labels read with Tesseract.js and matched against a taxon list and the known taxa of
the data set, a browser viewer with zoom, region selection, and adding and deleting of tips
and nodes, a figure profile, a time axis fit, decoration removal, and a benchmark of eight
published figures and fifteen synthetic ones.

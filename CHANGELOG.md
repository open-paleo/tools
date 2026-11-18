# Changelog

## 0.5.6 (unreleased)

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

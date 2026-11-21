# Changelog

## 0.3.0 (2026-11-21)

- New options: `select` picks the animal in a figure that shows several, `erase` blanks out
  rectangles, `eraseLines` blanks out brush strokes, `fill` fills spaces the trace leaves open,
  and `close` sets how wide a gap in the outline is closed before filling. The report gives
  `selectMissed` and `fillMissed`
- Grid and frame lines are erased, with the animal's edge drawn again where they cross it, and
  kept where they run along it
- Ground lines are found when only a little of the figure's width, and a ground strip along the
  bottom of the figure is erased too
- The background color is taken from the figure's top corners, so a gray or colored background
  isn't ink, and strongly colored drawings are ink however light they are
- Labeled call-outs hanging off the body by thin lines are dropped
- An erase stroke that strays over the animal's edge, or cuts a thin outline beside a white bone,
  gives that edge back

## 0.2.0 (2026-11-19)

- `traceOutline()` also returns the outline's `placement`: where its SVG lies on the figure, in
  the figure's pixels, to lay one over the other

## 0.1.0 (2026-11-19)

- First release, moved from open-paleo/media's tracing script: finds the animal in a skeletal
  reconstruction, fills its body and traces it with potrace's WebAssembly build. Runs in Node
  (`loadNodeTracer()` from `@open-paleo/outline-tracer/node`) and in browsers
  (`traceWithPotrace` from `@open-paleo/outline-tracer/potrace`)

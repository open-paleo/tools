# Outline tracer

Traces a skeletal reconstruction into an outline for [open-paleo/media](https://github.com/open-paleo/media):
it finds the animal in the figure, fills its body and traces the result into SVG with
[potrace](https://potrace.sourceforge.net). It adds nothing the artist didn't draw, and there is
no generative model at any step.

Every figure is traced at 2400 pixels wide, and the steps are:

1. Convert to gray over white, and resize to 2400 pixels wide.
2. Count each pixel darker than the threshold (180 by default), or strongly colored, as ink,
   unless it matches the background color taken from the top corners.
3. Blank out the erase rectangles and strokes.
4. Erase ground lines, keeping the feet that stand on them; grid and frame lines, drawing the
   animal's edge again where they cross it; and lone vertical lines. Give back what an erase
   stroke took from the animal's own edge.
5. Keep the animal (the largest shape, or the one at the select point) and any shape within a
   few pixels of it, such as teeth, and drop the rest: names, scale bars, human figures and
   smaller drawings.
6. Fill everything the body's outline encloses, once narrow gaps in it are closed, then fill
   cavities with a narrow opening, such as a claw drawn as an outline broken at the tip, and the
   spaces holding a fill point. Spaces holding a keep-open point stay open.
7. Drop drawings hanging off the body by thin lines, such as labeled call-outs.
8. Trace the body with potrace.

The same input gives the same SVG in Node and in browsers.

## Use

```ts
import { defaultTraceOptions, traceOutline } from "@open-paleo/outline-tracer";
import { loadNodeTracer } from "@open-paleo/outline-tracer/node";

const result = await traceOutline(image, defaultTraceOptions, await loadNodeTracer());
```

`image` is `{ width, height, data }`, with four bytes per pixel (red, green, blue, alpha). In a
browser, pass `traceWithPotrace` from `@open-paleo/outline-tracer/potrace` instead of loading the
Node tracer. `findOutlineBody()` returns the filled body without tracing it, to preview it.

## Options

Points and rectangles are in the figure's own pixels.

| Option | What it does |
| --- | --- |
| `threshold` | How dark a pixel must be to count as ink, from 0 to 255 |
| `keepOpen` | Points inside spaces that must stay open, such as between a leg and the belly |
| `select` | A point on the animal to keep, for figures that show several |
| `erase` | Rectangles to blank out, such as a human figure touching the animal |
| `eraseLines` | Strokes to blank out, as `[x1, y1, x2, y2, width]`, for dots and pointer lines along the animal |
| `fill` | Points inside spaces that must be filled, such as a jaw whose outline opens too wide |
| `close` | How wide a gap in the outline to close before filling, in pixels of an 800 px wide figure |

The result's `report` gives what the trace found and changed, including the keep-open and fill
points that did nothing.

## License

GPL-2.0-or-later, as it includes potrace, which is licensed under the GPL. See [LICENSE](LICENSE).

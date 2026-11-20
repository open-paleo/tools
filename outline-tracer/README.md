# Outline tracer

Traces a skeletal reconstruction into an outline for [open-paleo/media](https://github.com/open-paleo/media):
it finds the animal in the figure, fills its body and traces the result into SVG with
[potrace](https://potrace.sourceforge.net). It adds nothing the artist didn't draw, and there is
no generative model at any step.

Every figure is traced at 2400 pixels wide, and the steps are:

1. Convert to gray over white, and resize to 2400 pixels wide.
2. Count each pixel darker than the threshold (180 by default) as ink.
3. Erase ground lines (thin bands of ink across much of the figure), keeping the feet that stand
   on them.
4. Keep the largest shape and any shape within a few pixels of it, such as teeth, and drop the
   rest: names, scale bars, human figures, grids and smaller drawings.
5. Fill everything the body's outline encloses, once narrow gaps in it are closed, then fill
   cavities with a narrow opening, such as a claw drawn as an outline broken at the tip. Spaces
   holding a keep-open point stay open.
6. Trace the body with potrace.

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

## License

GPL-2.0-or-later, as it includes potrace, which is licensed under the GPL. See [LICENSE](LICENSE).

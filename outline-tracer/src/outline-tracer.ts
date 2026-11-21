// Traces a skeletal reconstruction into an outline: finds the animal in the figure, fills its body
// and returns its outline as SVG. It works on pixels alone, so the same code runs in Node and in a
// browser, and gives the same result in both.

/**
 * An image as rows of red, green, blue and alpha bytes.
 */
export type RgbaImage = {
    /**
     * The width, in pixels.
     */
    width: number;

    /**
     * The height, in pixels.
     */
    height: number;

    /**
     * Four bytes per pixel, row by row.
     */
    data: Uint8Array | Uint8ClampedArray;
};

/**
 * The settings a trace can change from its defaults.
 */
export type TraceOptions = {
    /**
     * How dark a pixel must be to count as part of the drawing, from 0 (black) to 255 (white).
     */
    threshold: number;

    /**
     * Points, in the image's own pixels, inside spaces that must stay open.
     */
    keepOpen: Array<[number, number]>;

    /**
     * A point, in the image's own pixels, on the animal to keep, for figures that show several;
     * the largest is kept when it is missing.
     */
    select?: [number, number];

    /**
     * Rectangles, in the image's own pixels as [left, top, right, bottom], to blank out before
     * tracing, such as a zoom box or a human figure touching the animal.
     */
    erase?: Array<[number, number, number, number]>;

    /**
     * Strokes to blank out before tracing, in the image's own pixels as [x1, y1, x2, y2, width]:
     * for dots and pointer lines along the animal, where a rectangle would take part of it too.
     * A stroke needn't be exact: where it clips the animal's edge, the edge is kept.
     */
    eraseLines?: Array<[number, number, number, number, number]>;

    /**
     * How wide a gap in the body's outline the trace closes before filling, in pixels of an
     * 800 px wide figure; 0.67 unless given. Wider closes skulls and jaws whose outlines have
     * wider gaps, but also closes narrow spaces between parts.
     */
    close?: number;

    /**
     * Points, in the image's own pixels, inside spaces that must be filled, such as a jaw or toe
     * whose outline opens too wide for the trace to close by itself.
     */
    fill?: Array<[number, number]>;
};

/**
 * Turns a black-on-white image into SVG: potrace, in practice.
 */
export type BitmapTracer = (image: RgbaImage, speckleArea: number) => Promise<string>;

/**
 * What a trace found and changed, to check it against the figure.
 */
export type TraceReport = {
    /**
     * How many ground lines were erased.
     */
    linesErased: number;

    /**
     * How many separate shapes were kept as the animal: the largest, and those close to it.
     */
    shapesKept: number;

    /**
     * How many shapes were dropped, such as labels, scale bars and human figures.
     */
    shapesDropped: number;

    /**
     * How many cavities with a narrow opening were filled, such as claws open at the tip.
     */
    cavitiesFilled: number;

    /**
     * Keep-open points that fell on the drawing rather than in an open space, so did nothing.
     */
    keepOpenMissed: Array<[number, number]>;

    /**
     * How many detached drawings joined to the animal by thin lines were removed, such as bones
     * drawn beside the skeleton with lines to where they belong.
     */
    calloutsRemoved: number;

    /**
     * The background color taken from the figure's top corners, as "#rrggbb", when it is not
     * white; empty when it is.
     */
    background: string;

    /**
     * Whether the select point was too far from any drawing, so the largest animal was kept.
     */
    selectMissed: boolean;

    /**
     * Fill points that were on the drawing already, or in a space too open to fill, so did nothing.
     */
    fillMissed: Array<[number, number]>;
};

/**
 * Where an outline lies on its figure, in the figure's own pixels.
 */
export type OutlinePlacement = {
    /**
     * The left edge of the outline's SVG.
     */
    left: number;

    /**
     * The top edge.
     */
    top: number;

    /**
     * The width.
     */
    width: number;

    /**
     * The height.
     */
    height: number;
};

/**
 * A traced outline.
 */
export type TraceResult = {
    /**
     * The outline, as potrace writes it.
     */
    svg: string;

    /**
     * Where the SVG lies on the figure, to lay one over the other.
     */
    placement: OutlinePlacement;

    /**
     * What the trace found and changed.
     */
    report: TraceReport;
};

/**
 * The animal's filled body, ready to trace.
 */
export type OutlineBody = {
    /**
     * The body: 1 for the animal, 0 for everything else.
     */
    mask: BinaryMask;

    /**
     * The box around the body; empty if nothing was dark enough.
     */
    box: PixelBox;

    /**
     * What the trace found and changed.
     */
    report: TraceReport;
};

/**
 * A fill point waiting for a closing that encloses its space.
 */
type FillPoint = {
    /**
     * The point, in the image's own pixels, as given.
     */
    point: [number, number];

    /**
     * The point's pixel in the mask.
     */
    index: number;
};

/**
 * A black-and-white mask: 1 for ink, 0 for paper.
 */
export type BinaryMask = {
    /**
     * The width, in pixels.
     */
    width: number;

    /**
     * The height, in pixels.
     */
    height: number;

    /**
     * One byte per pixel, row by row.
     */
    pixels: Uint8Array;
};

/**
 * A grayscale image: 0 is black, 255 white.
 */
type GrayImage = {
    /**
     * The width, in pixels.
     */
    width: number;

    /**
     * The height, in pixels.
     */
    height: number;

    /**
     * One byte per pixel, row by row.
     */
    pixels: Uint8Array;
};

/**
 * An image as three gray planes, one per color channel, over white.
 */
type ColorPlanes = {
    /**
     * The red channel.
     */
    red: GrayImage;

    /**
     * The green channel.
     */
    green: GrayImage;

    /**
     * The blue channel.
     */
    blue: GrayImage;
};

/**
 * A color, as red, green and blue from 0 to 255.
 */
type Color = [number, number, number];

/**
 * The connected regions of one value in a mask.
 */
type Regions = {
    /**
     * Each pixel's region, or -1 for pixels of the other value.
     */
    labels: Int32Array;

    /**
     * Each region's size, in pixels.
     */
    sizes: Array<number>;
};

/**
 * The longest run of ink in a row.
 */
type Run = {
    /**
     * The first column of the run.
     */
    start: number;

    /**
     * The column after the run.
     */
    end: number;
};

/**
 * A band of runs: where it starts and ends, and how much its runs' starts and ends wander.
 */
type BandMeasure = {
    /**
     * The earliest start.
     */
    start: number;

    /**
     * The latest end.
     */
    end: number;

    /**
     * How far the runs' starts spread.
     */
    startWander: number;

    /**
     * How far the runs' ends spread.
     */
    endWander: number;
};

/**
 * A rectangle of pixels.
 */
export type PixelBox = {
    /**
     * The leftmost column.
     */
    left: number;

    /**
     * The topmost row.
     */
    top: number;

    /**
     * The column after the rightmost.
     */
    right: number;

    /**
     * The row after the bottom one.
     */
    bottom: number;
};

/**
 * How to resample one axis: for each target pixel, the source pixels and their weights.
 */
type ResampleWeights = {
    /**
     * The first source pixel of each target pixel.
     */
    starts: Int32Array;

    /**
     * The number of source pixels per target pixel.
     */
    count: number;

    /**
     * The weights, count per target pixel.
     */
    weights: Float32Array;
};

/**
 * The animal: the shapes kept from the figure.
 */
type Animal = {
    /**
     * The kept shapes.
     */
    mask: BinaryMask;

    /**
     * How many shapes were kept.
     */
    shapesKept: number;

    /**
     * How many were dropped.
     */
    shapesDropped: number;

    /**
     * Whether a select point was given but too far from any drawing.
     */
    selectMissed: boolean;
};

/**
 * The settings a trace uses unless its record gives others.
 */
export const defaultTraceOptions: TraceOptions = { threshold: 180, keepOpen: [] };

// Every figure is traced at this width, so the settings below mean the same on every figure.
// They are given in pixels of an 800 px wide figure and multiplied by the unit.
const processingWidth = 2400;
const unit = processingWidth / 800;

// Gaps in the body's outline this narrow are closed before the body is filled: two-thirds of a
// pixel, which closes broken skull outlines but leaves the gaps between teeth.
const closeRadius = Math.round(0.67 * unit);

// Shapes this close to the largest belong to the animal, such as teeth drawn apart from the jaw.
const nearDistance = 4 * unit;

// A ground line: a band at most this thick whose ink runs across this share of the width, as
// straight as this (its rows start and end within this of one another), and standing alone: the
// rows just above and below it are less than this share ink. A ground strip at the foot of the
// figure may be any thickness, but runs across this share of the width.
const lineMaximumThickness = 12 * unit;
const lineMinimumShare = 0.12;
const lineStraightness = 3 * unit;
const lineIsolation = 0.5;
const groundStripShare = 0.6;

// Things stand on a ground line, so at least this share of the figure's ink lies above it; the top
// edge of a back, which is thin and straight too, has the animal below it.
const groundInkAbove = 0.6;

// A grid or frame line: a band at most this thick whose rows (or columns) are ink across this
// share of the figure, counting the animal it passes behind, with this much less ink just beside
// it, where the animal alone is.
const gridMaximumThickness = 4 * unit;
const gridCoverage = 0.85;
const gridBesideDrop = 0.25;

// Where an erased grid line crossed the animal's edge, an erased pixel is drawn again when more
// than half of the pixels this near it, other than the line's, are ink.
const repairRadius = 3 * unit;

// Under an erase stroke, an opening of this radius keeps the animal's body and loses lines and dots,
// and the body is given back this near the animal as traced with the strokes.
const strokeOpenRadius = 2 * unit;
const strokeMargin = 3 * unit;

// The widest closing that finds the dents strokes cut into the animal.
const strokeDentLimit = 30 * unit;

// A grid line that runs along the animal's edge for this long is kept there, as part of the edge.
const grazingLength = 6 * unit;

// A fill point fills the space it is in once the narrowest of these closings encloses it.
const fillRadii = [4 * unit, 6 * unit, 9 * unit, 13 * unit, 18 * unit, 26 * unit, 36 * unit];

// A fill point on the drawing moves to the nearest space this near it.
const fillReach = 3 * unit;

// A vertical line, such as a grid line or an upright scale bar: a band at most this wide whose ink
// runs down this share of the height, straight and standing alone as a ground line must.
const verticalMaximumThickness = 4 * unit;
const verticalMinimumShare = 0.4;

// Inside a hollow claw standing on a ground line, there is drawing this close above the line.
const clawReach = 6 * unit;

// The anti-aliased edge erased with a ground line, the widest hollow claw that stands on one, and
// how much of the line's top edge is kept under a foot.
const lineMargin = 2 * unit;
const footGap = 10 * unit;
const footDepth = unit;

// Cavities a closing this wide would enclose, filled when their area is at least this many times
// the square of their opening: a claw open at the tip, not the gap between two teeth.
const cavityRadius = 3 * unit;
const cavityRatio = 4;

// The background: the color of a patch at each top corner, this wide, counts as background when it
// is this light and this even; pixels this close to a background color are background.
const cornerPatch = 4 * unit;
const backgroundLightness = 120;
const backgroundEvenness = 12;
const backgroundDistance = 40;

// Pixels this colorful (the spread between their strongest and weakest channel) count as drawing
// even when they are lighter than the threshold, such as an animal drawn in yellow.
const colorSpread = 60;

// How far a select point may be from the drawing it picks.
const selectReach = 15 * unit;

// Call-outs: thin lines narrower than twice this vanish when the drawing is opened; what they join
// to the animal is removed when it is at least this share of the animal's size and this far from it.
const calloutRadius = Math.round(1.5 * unit);
const calloutShare = 0.03;
const calloutGap = 8 * unit;

// The margin around the traced outline, and the smallest speck potrace keeps, in pixels.
const cropMargin = 4 * unit;
const speckleArea = 2 * unit * unit;

/**
 * The Catmull-Rom cubic: the weight of a source pixel at a distance from the sample point.
 *
 * @param distance - The distance, in source pixels (scaled when shrinking).
 * @returns The weight.
 */
function getCubicWeight(distance: number): number
{
    const x = Math.abs(distance);

    if (x < 1)
    {
        return 1.5 * x * x * x - 2.5 * x * x + 1;
    }

    if (x < 2)
    {
        return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
    }

    return 0;
}

/**
 * Work out how to resample one axis from one size to another, widening the filter when shrinking
 * so thin lines are averaged rather than skipped.
 *
 * @param sourceSize - The size of the axis in the source.
 * @param targetSize - The size in the result.
 * @returns The weights.
 */
function createResampleWeights(sourceSize: number, targetSize: number): ResampleWeights
{
    const scale = targetSize / sourceSize;
    const filterScale = Math.max(1, 1 / scale);
    const support = 2 * filterScale;
    const count = Math.ceil(support) * 2 + 1;
    const starts = new Int32Array(targetSize);
    const weights = new Float32Array(targetSize * count);

    for (let target = 0; target < targetSize; target++)
    {
        const center = (target + 0.5) / scale - 0.5;
        const start = Math.floor(center - support) + 1;
        let total = 0;

        starts[target] = start;

        for (let offset = 0; offset < count; offset++)
        {
            const weight = getCubicWeight((start + offset - center) / filterScale);

            weights[target * count + offset] = weight;
            total += weight;
        }

        for (let offset = 0; offset < count; offset++)
        {
            weights[target * count + offset] /= total;
        }
    }

    return { starts, count, weights };
}

/**
 * Split an image into its color channels, over a white background.
 *
 * @param image - The image.
 * @returns The three channels.
 */
function createColorPlanes(image: RgbaImage): ColorPlanes
{
    const size = image.width * image.height;
    const planes: ColorPlanes = {
        red: { width: image.width, height: image.height, pixels: new Uint8Array(size) },
        green: { width: image.width, height: image.height, pixels: new Uint8Array(size) },
        blue: { width: image.width, height: image.height, pixels: new Uint8Array(size) },
    };

    for (let index = 0; index < size; index++)
    {
        const alpha = image.data[index * 4 + 3] / 255;

        planes.red.pixels[index] = Math.round(image.data[index * 4] * alpha + 255 * (1 - alpha));
        planes.green.pixels[index] = Math.round(image.data[index * 4 + 1] * alpha + 255 * (1 - alpha));
        planes.blue.pixels[index] = Math.round(image.data[index * 4 + 2] * alpha + 255 * (1 - alpha));
    }

    return planes;
}

/**
 * Find the median of a list of values.
 *
 * @param values - The values; sorted in place.
 * @returns The median.
 */
function findMedian(values: Array<number>): number
{
    values.sort((first, second) => first - second);

    return values[Math.floor(values.length / 2)];
}

/**
 * Read the color of a patch, if it is even enough to be background.
 *
 * @param planes - The image.
 * @param left - The patch's left edge.
 * @returns The patch's median color, or undefined if it is uneven or too dark to be background.
 */
function readCornerColor(planes: ColorPlanes, left: number): Color | undefined
{
    const size = Math.min(cornerPatch, planes.red.width, planes.red.height);
    const channels: Array<Array<number>> = [[], [], []];

    for (let y = 0; y < size; y++)
    {
        for (let x = left; x < left + size; x++)
        {
            const index = y * planes.red.width + x;

            channels[0].push(planes.red.pixels[index]);
            channels[1].push(planes.green.pixels[index]);
            channels[2].push(planes.blue.pixels[index]);
        }
    }

    const color: Color = [findMedian(channels[0]), findMedian(channels[1]), findMedian(channels[2])];
    let spread = 0;

    for (let channel = 0; channel < 3; channel++)
    {
        const low = channels[channel][Math.floor(channels[channel].length * 0.1)];
        const high = channels[channel][Math.floor(channels[channel].length * 0.9)];

        spread = Math.max(spread, high - low);
    }

    const lightness = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];

    return lightness >= backgroundLightness && spread <= backgroundEvenness ? color : undefined;
}

/**
 * Find the background colors: white, and the color of each top corner that is even and light.
 *
 * @param planes - The image.
 * @returns The colors.
 */
function findBackgroundColors(planes: ColorPlanes): Array<Color>
{
    const colors: Array<Color> = [[255, 255, 255]];
    const size = Math.min(cornerPatch, planes.red.width);

    for (const left of [0, planes.red.width - size])
    {
        const color = readCornerColor(planes, left);
        const distance = color ? (255 - color[0]) ** 2 + (255 - color[1]) ** 2 + (255 - color[2]) ** 2 : 0;

        // White is already a background color.
        if (color && distance >= backgroundDistance * backgroundDistance)
        {
            colors.push(color);
        }
    }

    return colors;
}

/**
 * Write a color as "#rrggbb".
 *
 * @param color - The color.
 * @returns The color as hex.
 */
function formatColor(color: Color): string
{
    let hex = "#";

    for (const channel of color)
    {
        hex += channel.toString(16).padStart(2, "0");
    }

    return hex;
}

/**
 * Find the drawing: pixels darker than the threshold or clearly colored, unless close to a
 * background color.
 *
 * @param planes - The image.
 * @param threshold - How dark a pixel must be, from 0 to 255.
 * @param backgrounds - The background colors.
 * @returns The ink.
 */
function createInkMask(planes: ColorPlanes, threshold: number, backgrounds: Array<Color>): BinaryMask
{
    const size = planes.red.pixels.length;
    const pixels = new Uint8Array(size);
    const limit = backgroundDistance * backgroundDistance;

    for (let index = 0; index < size; index++)
    {
        const red = planes.red.pixels[index];
        const green = planes.green.pixels[index];
        const blue = planes.blue.pixels[index];
        let isBackground = false;

        for (const color of backgrounds)
        {
            const distance = (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2;

            if (distance < limit)
            {
                isBackground = true;
                break;
            }
        }

        if (isBackground)
        {
            continue;
        }

        const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
        const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

        pixels[index] = luma < threshold || spread > colorSpread ? 1 : 0;
    }

    return { width: planes.red.width, height: planes.red.height, pixels };
}

/**
 * Resize a gray image to a width, keeping its proportions.
 *
 * @param image - The image.
 * @param width - The new width.
 * @returns The resized image.
 */
function resizeGrayImage(image: GrayImage, width: number): GrayImage
{
    const height = Math.max(1, Math.round(image.height * width / image.width));
    const columns = createResampleWeights(image.width, width);
    const rows = createResampleWeights(image.height, height);
    const across = new Float32Array(width * image.height);
    const pixels = new Uint8Array(width * height);

    for (let y = 0; y < image.height; y++)
    {
        for (let x = 0; x < width; x++)
        {
            let value = 0;

            for (let offset = 0; offset < columns.count; offset++)
            {
                const source = Math.min(image.width - 1, Math.max(0, columns.starts[x] + offset));

                value += image.pixels[y * image.width + source] * columns.weights[x * columns.count + offset];
            }

            across[y * width + x] = value;
        }
    }

    for (let y = 0; y < height; y++)
    {
        for (let x = 0; x < width; x++)
        {
            let value = 0;

            for (let offset = 0; offset < rows.count; offset++)
            {
                const source = Math.min(image.height - 1, Math.max(0, rows.starts[y] + offset));

                value += across[source * width + x] * rows.weights[y * rows.count + offset];
            }

            pixels[y * width + x] = Math.min(255, Math.max(0, Math.round(value)));
        }
    }

    return { width, height, pixels };
}

/**
 * Find the longest run of ink in a row.
 *
 * @param mask - The mask.
 * @param y - The row.
 * @returns The run; empty if the row has no ink.
 */
function findLongestRun(mask: BinaryMask, y: number): Run
{
    let best: Run = { start: 0, end: 0 };
    let start = -1;

    for (let x = 0; x <= mask.width; x++)
    {
        const isInk = x < mask.width && mask.pixels[y * mask.width + x] === 1;

        if (isInk && start < 0)
        {
            start = x;
        }
        else if (!isInk && start >= 0)
        {
            if (x - start > best.end - best.start)
            {
                best = { start, end: x };
            }

            start = -1;
        }
    }

    return best;
}

/**
 * Report whether there is drawing just above a row in a column, as inside a hollow claw.
 *
 * @param mask - The mask.
 * @param x - The column.
 * @param top - The row; drawing is looked for above it.
 * @returns Whether there is.
 */
function hasDrawingAbove(mask: BinaryMask, x: number, top: number): boolean
{
    for (let y = top - 1; y >= Math.max(0, top - clawReach); y--)
    {
        if (mask.pixels[y * mask.width + x] === 1)
        {
            return true;
        }
    }

    return false;
}

/**
 * Find the share of a row's span that is ink.
 *
 * @param mask - The mask.
 * @param y - The row; outside the mask counts as no ink.
 * @param left - The span's first column.
 * @param right - The column after the span.
 * @returns The share, from 0 to 1.
 */
function findRowInkShare(mask: BinaryMask, y: number, left: number, right: number): number
{
    if (y < 0 || y >= mask.height || right <= left)
    {
        return 0;
    }

    let ink = 0;

    for (let x = left; x < right; x++)
    {
        ink += mask.pixels[y * mask.width + x];
    }

    return ink / (right - left);
}

/**
 * Find the share of a column's span that is ink.
 *
 * @param mask - The mask.
 * @param x - The column; outside the mask counts as no ink.
 * @param top - The span's first row.
 * @param bottom - The row after the span.
 * @returns The share, from 0 to 1.
 */
function findColumnInkShare(mask: BinaryMask, x: number, top: number, bottom: number): number
{
    if (x < 0 || x >= mask.width || bottom <= top)
    {
        return 0;
    }

    let ink = 0;

    for (let y = top; y < bottom; y++)
    {
        ink += mask.pixels[y * mask.width + x];
    }

    return ink / (bottom - top);
}

/**
 * Find the span of a band of runs, and how much their starts and ends wander.
 *
 * @param runs - The runs, one per row or column.
 * @param first - The band's first row or column.
 * @param last - Its last.
 * @returns The band's extent and wander.
 */
function measureBand(runs: Array<Run>, first: number, last: number): BandMeasure
{
    const measure: BandMeasure = { start: Infinity, end: 0, startWander: 0, endWander: 0 };
    let longest = 0;
    let lowestStart = Infinity;
    let lowestEnd = Infinity;

    for (let index = first; index <= last; index++)
    {
        measure.start = Math.min(measure.start, runs[index].start);
        measure.end = Math.max(measure.end, runs[index].end);
        longest = Math.max(longest, runs[index].end - runs[index].start);
    }

    // Straightness counts only the band's full runs: a faint anti-aliased edge row can break into
    // a shorter one.
    for (let index = first; index <= last; index++)
    {
        if (runs[index].end - runs[index].start >= longest * 0.9)
        {
            lowestStart = Math.min(lowestStart, runs[index].start);
            lowestEnd = Math.min(lowestEnd, runs[index].end);
        }
    }

    for (let index = first; index <= last; index++)
    {
        if (runs[index].end - runs[index].start >= longest * 0.9)
        {
            measure.startWander = Math.max(measure.startWander, runs[index].start - lowestStart);
            measure.endWander = Math.max(measure.endWander, runs[index].end - lowestEnd);
        }
    }

    return measure;
}

/**
 * Erase one ground line or strip, rows first to last, keeping its top edge under anything that
 * stands on it, and under narrow gaps between such places with drawing just above them (inside a
 * hollow claw); the space between two separate feet has none.
 *
 * @param mask - The mask, changed in place.
 * @param band - The band's extent.
 * @param first - The band's first row.
 * @param last - The band's last row.
 */
function eraseGroundLine(mask: BinaryMask, band: BandMeasure, first: number, last: number): void
{
    const top = Math.max(0, first - lineMargin);
    const bottom = Math.min(mask.height - 1, last + lineMargin);
    const keepTo = Math.min(bottom, first + footDepth);
    const isStanding = new Uint8Array(mask.width);
    let lastStanding = -1;

    for (let x = band.start; x < band.end; x++)
    {
        if (top === 0 || mask.pixels[(top - 1) * mask.width + x] !== 1)
        {
            continue;
        }

        if (lastStanding >= 0 && x - lastStanding <= footGap)
        {
            let isClaw = true;

            for (let between = lastStanding + 1; between < x && isClaw; between++)
            {
                isClaw = hasDrawingAbove(mask, between, top);
            }

            if (isClaw)
            {
                isStanding.fill(1, lastStanding + 1, x);
            }
        }

        isStanding[x] = 1;
        lastStanding = x;
    }

    for (let x = band.start; x < band.end; x++)
    {
        for (let y = isStanding[x] ? keepTo + 1 : top; y <= bottom; y++)
        {
            mask.pixels[y * mask.width + x] = 0;
        }
    }
}

/**
 * Find the share of each row, or each column, that is ink.
 *
 * @param mask - The mask.
 * @param isColumns - Whether to measure columns rather than rows.
 * @returns The shares, one per row or column.
 */
function measureCoverage(mask: BinaryMask, isColumns: boolean): Float64Array
{
    const coverage = new Float64Array(isColumns ? mask.width : mask.height);

    for (let y = 0; y < mask.height; y++)
    {
        for (let x = 0; x < mask.width; x++)
        {
            coverage[isColumns ? x : y] += mask.pixels[y * mask.width + x];
        }
    }

    for (let index = 0; index < coverage.length; index++)
    {
        coverage[index] /= isColumns ? mask.height : mask.width;
    }

    return coverage;
}

/**
 * Find where a grid line runs along the animal's edge rather than across it: stretches at least
 * grazingLength long where the animal's ink lies on one side of the line only. There, erasing the
 * line would take a long sliver of the animal's edge, which the rebuild can't draw again.
 *
 * @param mask - The mask.
 * @param isColumns - Whether the line is vertical.
 * @param before - The row or column just before the line.
 * @param after - The row or column just after the line.
 * @returns 1 for each position along the line inside such a stretch.
 */
function findGrazingStretches(mask: BinaryMask, isColumns: boolean, before: number, after: number): Uint8Array
{
    const across = isColumns ? mask.height : mask.width;
    const limit = isColumns ? mask.width : mask.height;
    const kept = new Uint8Array(across);
    let start = -1;

    for (let along = 0; along <= across; along++)
    {
        let isOneSided = false;

        if (along < across)
        {
            const first = before < 0 ? 0 : isColumns ? mask.pixels[along * mask.width + before] : mask.pixels[before * mask.width + along];
            const second = after >= limit ? 0 : isColumns ? mask.pixels[along * mask.width + after] : mask.pixels[after * mask.width + along];

            isOneSided = first !== second;
        }

        if (isOneSided && start < 0)
        {
            start = along;
        }
        else if (!isOneSided && start >= 0)
        {
            if (along - start >= grazingLength)
            {
                kept.fill(1, start, along);
            }

            start = -1;
        }
    }

    return kept;
}

/**
 * Report whether a line runs through the animal at a pixel: the animal's ink lies on both sides
 * of the line there.
 *
 * @param mask - The mask.
 * @param x - The column.
 * @param y - The row.
 * @param isColumns - Whether the line is vertical, so its sides are left and right.
 * @param before - The row (or column) just before the line, with its margin.
 * @param after - The row (or column) just after it.
 * @returns Whether it is.
 */
function isInsideAnimal(mask: BinaryMask, x: number, y: number, isColumns: boolean, before: number, after: number): boolean
{
    const limit = isColumns ? mask.width : mask.height;
    const first = before < 0 ? 0 : isColumns ? mask.pixels[y * mask.width + before] : mask.pixels[before * mask.width + x];
    const second = after >= limit ? 0 : isColumns ? mask.pixels[y * mask.width + after] : mask.pixels[after * mask.width + x];

    return first === 1 && second === 1;
}

/**
 * Draw the animal's edge again where erased grid lines crossed it: an erased pixel becomes ink
 * when more than half of the pixels near it, other than erased ones, are ink. Inside the animal's
 * edge that holds; along a line standing alone, it doesn't.
 *
 * @param mask - The mask, changed in place.
 * @param erasedLines - The pixels the grid lines took.
 */
function repairLineCrossings(mask: BinaryMask, erasedLines: BinaryMask): void
{
    const width = mask.width + 1;
    const inkSums = new Float64Array(width * (mask.height + 1));
    const keptSums = new Float64Array(width * (mask.height + 1));

    for (let y = 0; y < mask.height; y++)
    {
        for (let x = 0; x < mask.width; x++)
        {
            const index = y * mask.width + x;
            const isKept = erasedLines.pixels[index] === 0 ? 1 : 0;
            const sum = (y + 1) * width + x + 1;

            inkSums[sum] = inkSums[sum - 1] + inkSums[sum - width] - inkSums[sum - width - 1] + mask.pixels[index] * isKept;
            keptSums[sum] = keptSums[sum - 1] + keptSums[sum - width] - keptSums[sum - width - 1] + isKept;
        }
    }

    for (let y = 0; y < mask.height; y++)
    {
        for (let x = 0; x < mask.width; x++)
        {
            if (erasedLines.pixels[y * mask.width + x] === 0)
            {
                continue;
            }

            const left = Math.max(0, x - repairRadius);
            const top = Math.max(0, y - repairRadius);
            const right = Math.min(mask.width, x + repairRadius + 1);
            const bottom = Math.min(mask.height, y + repairRadius + 1);
            const ink = inkSums[bottom * width + right] - inkSums[top * width + right] - inkSums[bottom * width + left] + inkSums[top * width + left];
            const kept = keptSums[bottom * width + right] - keptSums[top * width + right] - keptSums[bottom * width + left] + keptSums[top * width + left];

            if (kept > 0 && ink / kept > 0.5)
            {
                mask.pixels[y * mask.width + x] = 1;
            }
        }
    }
}

/**
 * Erase grid and frame lines, rows or columns: thin bands of ink across nearly the whole figure,
 * counting the animal they pass behind, with much less ink just beside them. Each is erased
 * except where it runs through the animal; where it crosses the animal's edge, repairLineCrossings
 * draws the edge again.
 *
 * @param mask - The mask, changed in place.
 * @param isColumns - Whether to erase vertical lines rather than horizontal ones.
 * @param erasedLines - Where to mark the pixels erased, to repair the animal's edge after.
 * @returns How many lines were erased.
 */
function eraseGridLines(mask: BinaryMask, isColumns: boolean, erasedLines: BinaryMask): number
{
    const coverage = measureCoverage(mask, isColumns);
    const length = coverage.length;
    const across = isColumns ? mask.height : mask.width;
    let erased = 0;
    let index = 0;

    while (index < length)
    {
        if (coverage[index] < gridCoverage)
        {
            index++;
            continue;
        }

        let last = index;

        while (last + 1 < length && coverage[last + 1] >= gridCoverage)
        {
            last++;
        }

        const before = index - lineMargin - 1;
        const after = last + lineMargin + 1;
        let lineCoverage = 1;

        for (let line = index; line <= last; line++)
        {
            lineCoverage = Math.min(lineCoverage, coverage[line]);
        }

        const isBesideClear = (before < 0 || coverage[before] <= lineCoverage - gridBesideDrop) && (after >= length || coverage[after] <= lineCoverage - gridBesideDrop);

        if (last - index + 1 <= gridMaximumThickness && isBesideClear)
        {
            const kept = findGrazingStretches(mask, isColumns, before, after);

            for (let along = 0; along < across; along++)
            {
                const x = isColumns ? 0 : along;
                const y = isColumns ? along : 0;

                if (kept[along] === 1 || isInsideAnimal(mask, x, y, isColumns, before, after))
                {
                    continue;
                }

                for (let line = Math.max(0, index - lineMargin); line <= Math.min(length - 1, last + lineMargin); line++)
                {
                    const pixel = isColumns ? along * mask.width + line : line * mask.width + along;

                    if (mask.pixels[pixel] === 1)
                    {
                        mask.pixels[pixel] = 0;
                        erasedLines.pixels[pixel] = 1;
                    }
                }
            }

            erased++;
        }

        index = last + 1;
    }

    return erased;
}

/**
 * Find the longest run of ink in a column.
 *
 * @param mask - The mask.
 * @param x - The column.
 * @returns The run, in rows; empty if the column has no ink.
 */
function findLongestColumnRun(mask: BinaryMask, x: number): Run
{
    let best: Run = { start: 0, end: 0 };
    let start = -1;

    for (let y = 0; y <= mask.height; y++)
    {
        const isInk = y < mask.height && mask.pixels[y * mask.width + x] === 1;

        if (isInk && start < 0)
        {
            start = y;
        }
        else if (!isInk && start >= 0)
        {
            if (y - start > best.end - best.start)
            {
                best = { start, end: y };
            }

            start = -1;
        }
    }

    return best;
}

/**
 * Erase vertical lines that stand alone, such as grid lines and upright scale bars.
 *
 * @param mask - The mask, changed in place.
 * @returns How many were erased.
 */
function eraseVerticalLines(mask: BinaryMask): number
{
    const runs = new Array<Run>();
    const minimumLength = mask.height * verticalMinimumShare;
    let erased = 0;

    for (let x = 0; x < mask.width; x++)
    {
        runs.push(findLongestColumnRun(mask, x));
    }

    let x = 0;

    while (x < mask.width)
    {
        if (runs[x].end - runs[x].start < minimumLength)
        {
            x++;
            continue;
        }

        let last = x;

        while (last + 1 < mask.width && runs[last + 1].end - runs[last + 1].start >= minimumLength)
        {
            last++;
        }

        const band = measureBand(runs, x, last);
        const isAlone = findColumnInkShare(mask, x - lineMargin - 1, band.start, band.end) < lineIsolation &&
            findColumnInkShare(mask, last + lineMargin + 1, band.start, band.end) < lineIsolation;

        if (last - x + 1 <= verticalMaximumThickness && band.startWander <= lineStraightness && band.endWander <= lineStraightness && isAlone)
        {
            const leftSide = Math.max(0, x - lineMargin - 1);
            const rightSide = Math.min(mask.width - 1, last + lineMargin + 1);

            // Only rows where the line stands alone: where the animal's ink lies on either side of
            // it, it is kept, so the animal's outline is never cut.
            for (let y = band.start; y < band.end; y++)
            {
                if (mask.pixels[y * mask.width + leftSide] === 1 || mask.pixels[y * mask.width + rightSide] === 1)
                {
                    continue;
                }

                for (let column = leftSide + 1; column < rightSide; column++)
                {
                    mask.pixels[y * mask.width + column] = 0;
                }
            }

            erased++;
        }

        x = last + 1;
    }

    return erased;
}

/**
 * Erase ground lines: thin, straight bands of ink across much of the figure that stand alone, and
 * a ground strip of any thickness along the foot of the figure.
 *
 * @param mask - The mask, changed in place.
 * @returns How many were erased.
 */
function eraseGroundLines(mask: BinaryMask): number
{
    const runs = new Array<Run>();
    const inkAbove = new Float64Array(mask.height + 1);
    let erased = 0;

    for (let y = 0; y < mask.height; y++)
    {
        let rowInk = 0;

        for (let x = 0; x < mask.width; x++)
        {
            rowInk += mask.pixels[y * mask.width + x];
        }

        inkAbove[y + 1] = inkAbove[y] + rowInk;
        runs.push(findLongestRun(mask, y));
    }

    const minimumLength = mask.width * lineMinimumShare;
    let y = 0;

    while (y < mask.height)
    {
        if (runs[y].end - runs[y].start < minimumLength)
        {
            y++;
            continue;
        }

        let last = y;

        while (last + 1 < mask.height && runs[last + 1].end - runs[last + 1].start >= minimumLength)
        {
            last++;
        }

        const band = measureBand(runs, y, last);
        const isClearAbove = findRowInkShare(mask, y - lineMargin - 1, band.start, band.end) < lineIsolation;
        const isClearBelow = findRowInkShare(mask, last + lineMargin + 1, band.start, band.end) < lineIsolation;
        const isStraight = band.startWander <= lineStraightness && band.endWander <= lineStraightness;
        const isUnderneath = inkAbove[y] >= groundInkAbove * inkAbove[mask.height];
        const isLine = last - y + 1 <= lineMaximumThickness && isStraight && isClearAbove && isClearBelow && isUnderneath;
        const isStrip = last >= mask.height - 1 - lineMargin && band.end - band.start >= mask.width * groundStripShare && isClearAbove;

        if (isLine || isStrip)
        {
            eraseGroundLine(mask, band, y, last);
            erased++;
        }

        y = last + 1;
    }

    return erased;
}

/**
 * Blank out thick line segments.
 *
 * @param mask - The mask, changed in place.
 * @param segments - The segments, in the mask's pixels as [x1, y1, x2, y2, width].
 * @param erased - Where to mark the pixels erased, so restoreStrokeEdges can draw the animal's
 * edge again where a stroke clipped it.
 */
function eraseSegments(mask: BinaryMask, segments: Array<[number, number, number, number, number]>, erased: BinaryMask): void
{
    for (const [x1, y1, x2, y2, width] of segments)
    {
        const radius = width / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;

        for (let y = Math.max(0, Math.floor(Math.min(y1, y2) - radius)); y <= Math.min(mask.height - 1, Math.ceil(Math.max(y1, y2) + radius)); y++)
        {
            for (let x = Math.max(0, Math.floor(Math.min(x1, x2) - radius)); x <= Math.min(mask.width - 1, Math.ceil(Math.max(x1, x2) + radius)); x++)
            {
                const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
                const distanceX = x - (x1 + along * dx);
                const distanceY = y - (y1 + along * dy);

                if (distanceX * distanceX + distanceY * distanceY <= radius * radius && mask.pixels[y * mask.width + x] === 1)
                {
                    mask.pixels[y * mask.width + x] = 0;
                    erased.pixels[y * mask.width + x] = 1;
                }
            }
        }
    }
}

/**
 * Give back the ink erase strokes took from the animal itself, so a stroke that strays over the
 * animal's edge doesn't cut into it. Only the animal's thick body comes back: what an opening of
 * the animal without the strokes keeps, losing thin lines and dots. Of that, a pixel comes back if
 * it lies in a dent the strokes cut into the animal, which a closing of the animal as traced with
 * the strokes fills, or within strokeMargin of the animal. A pointer line, a dot, or a shape that
 * overlaps the animal and was painted over where it meets it, stays erased.
 *
 * @param ink - The ink after the strokes and line erasing, changed in place.
 * @param erased - The pixels the strokes erased.
 * @param widest - The widest stroke, in the mask's pixels.
 * @param select - The select point, in the mask's pixels, if any.
 */
function restoreStrokeEdges(ink: BinaryMask, erased: BinaryMask, widest: number, select: [number, number] | undefined): void
{
    const whole: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(ink.pixels.length) };

    for (let index = 0; index < ink.pixels.length; index++)
    {
        whole.pixels[index] = ink.pixels[index] | erased.pixels[index];
    }

    const wholeAnimal = selectAnimal(whole, select).mask;
    const thick = dilateMask(erodeMask(wholeAnimal, strokeOpenRadius), strokeOpenRadius);
    const dents = closeMask(selectAnimal(ink, select).mask, Math.min(strokeDentLimit, Math.ceil(widest) + unit));

    for (let index = 0; index < ink.pixels.length; index++)
    {
        if (erased.pixels[index] === 1 && thick.pixels[index] === 1 && dents.pixels[index] === 1)
        {
            ink.pixels[index] = 1;
        }
    }

    const nearAnimal = dilateMask(selectAnimal(ink, select).mask, strokeMargin);

    for (let index = 0; index < ink.pixels.length; index++)
    {
        if (erased.pixels[index] === 1 && thick.pixels[index] === 1 && nearAnimal.pixels[index] === 1)
        {
            ink.pixels[index] = 1;
        }
    }
}

/**
 * Give back the outline erase strokes cut where they crossed it beside a light space, such as a
 * white bone just inside a skeletal drawing's edge: there the outline is a thin line, which
 * restoreStrokeEdges leaves erased. The animal is filled with and without the strokes; each piece
 * the strokes took from the filled body is given back if it is a space in the animal: its opening
 * to the outside is at most two strokes wide, and it borders the animal along at least twice as
 * much. A pointer line is too thin to be a piece, and a shape painted over where it meets the
 * animal, such as a scale figure's hand, borders mostly paper.
 *
 * @param ink - The ink after restoreStrokeEdges, changed in place.
 * @param erased - The pixels the strokes erased.
 * @param widest - The widest stroke, in the mask's pixels.
 * @param select - The select point, in the mask's pixels, if any.
 * @param keepOpen - The keep-open points, in the mask's pixels.
 * @param radius - The closing radius for filling the body.
 */
function restoreStrokeDents(ink: BinaryMask, erased: BinaryMask, widest: number, select: [number, number] | undefined, keepOpen: Array<[number, number]>, radius: number): void
{
    const whole: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(ink.pixels.length) };

    for (let index = 0; index < ink.pixels.length; index++)
    {
        whole.pixels[index] = ink.pixels[index] | erased.pixels[index];
    }

    const wholeBody = fillBody(selectAnimal(whole, select).mask, keepOpen, radius);

    fillCavities(wholeBody, keepOpen);

    const body = fillBody(selectAnimal(ink, select).mask, keepOpen, radius);

    fillCavities(body, keepOpen);

    const thick = dilateMask(erodeMask(wholeBody, strokeOpenRadius), strokeOpenRadius);
    const pieces: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(ink.pixels.length) };

    for (let index = 0; index < ink.pixels.length; index++)
    {
        pieces.pixels[index] = thick.pixels[index] === 1 && body.pixels[index] === 0 ? 1 : 0;
    }

    const regions = labelRegions(pieces, 1, false);
    const openings = new Float64Array(regions.sizes.length);
    const borders = new Float64Array(regions.sizes.length);
    const touchesStroke = new Uint8Array(regions.sizes.length);

    for (let y = 0; y < ink.height; y++)
    {
        for (let x = 0; x < ink.width; x++)
        {
            const index = y * ink.width + x;
            const region = regions.labels[index];

            if (region < 0)
            {
                continue;
            }

            if (erased.pixels[index] === 1)
            {
                touchesStroke[region] = 1;
            }

            if (isBesideOutside(body, pieces, x, y))
            {
                openings[region]++;
            }

            if (isBesideBody(body, x, y))
            {
                borders[region]++;
            }
        }
    }

    for (let index = 0; index < ink.pixels.length; index++)
    {
        const region = regions.labels[index];

        if (region >= 0 && erased.pixels[index] === 1 && touchesStroke[region] === 1 && openings[region] <= 2 * widest && borders[region] >= 2 * openings[region])
        {
            ink.pixels[index] = 1;
        }
    }
}

/**
 * Report whether a pixel borders the outside: a neighbor, across an edge, that is neither body
 * nor piece, or the mask's border.
 *
 * @param body - The filled body.
 * @param pieces - The pieces strokes took from the body.
 * @param x - The column.
 * @param y - The row.
 * @returns Whether it borders the outside.
 */
function isBesideOutside(body: BinaryMask, pieces: BinaryMask, x: number, y: number): boolean
{
    if (x === 0 || y === 0 || x === body.width - 1 || y === body.height - 1)
    {
        return true;
    }

    const neighbors = [y * body.width + x - 1, y * body.width + x + 1, (y - 1) * body.width + x, (y + 1) * body.width + x];

    for (const neighbor of neighbors)
    {
        if (body.pixels[neighbor] === 0 && pieces.pixels[neighbor] === 0)
        {
            return true;
        }
    }

    return false;
}

/**
 * Report whether a pixel borders the body: a neighbor, across an edge, that is body.
 *
 * @param body - The filled body.
 * @param x - The column.
 * @param y - The row.
 * @returns Whether it borders the body.
 */
function isBesideBody(body: BinaryMask, x: number, y: number): boolean
{
    const index = y * body.width + x;

    return (x > 0 && body.pixels[index - 1] === 1) || (x < body.width - 1 && body.pixels[index + 1] === 1)
        || (y > 0 && body.pixels[index - body.width] === 1) || (y < body.height - 1 && body.pixels[index + body.width] === 1);
}

/**
 * Blank out rectangles.
 *
 * @param mask - The mask, changed in place.
 * @param rectangles - The rectangles, in the mask's pixels as [left, top, right, bottom].
 */
function eraseRectangles(mask: BinaryMask, rectangles: Array<[number, number, number, number]>): void
{
    for (const [left, top, right, bottom] of rectangles)
    {
        for (let y = Math.max(0, top); y < Math.min(mask.height, bottom); y++)
        {
            mask.pixels.fill(0, y * mask.width + Math.max(0, left), y * mask.width + Math.min(mask.width, right));
        }
    }
}

/**
 * Label the connected regions of one value.
 *
 * @param mask - The mask.
 * @param value - The value whose regions to label: 1 for ink, 0 for paper.
 * @param isEightConnected - Whether diagonal neighbors connect (for ink), or only sides (paper).
 * @returns The regions.
 */
function labelRegions(mask: BinaryMask, value: number, isEightConnected: boolean): Regions
{
    const labels = new Int32Array(mask.pixels.length).fill(-1);
    const sizes = new Array<number>();
    const stack = new Array<number>();

    for (let start = 0; start < mask.pixels.length; start++)
    {
        if (mask.pixels[start] !== value || labels[start] !== -1)
        {
            continue;
        }

        const region = sizes.length;
        let size = 0;

        labels[start] = region;
        stack.push(start);

        while (stack.length > 0)
        {
            const index = stack.pop() as number;
            const x = index % mask.width;
            const y = (index - x) / mask.width;

            size++;

            for (let dy = -1; dy <= 1; dy++)
            {
                for (let dx = -1; dx <= 1; dx++)
                {
                    const isNeighbor = (dx !== 0 || dy !== 0) && (isEightConnected || dx === 0 || dy === 0);
                    const neighborX = x + dx;
                    const neighborY = y + dy;

                    if (!isNeighbor || neighborX < 0 || neighborY < 0 || neighborX >= mask.width || neighborY >= mask.height)
                    {
                        continue;
                    }

                    const neighbor = neighborY * mask.width + neighborX;

                    if (mask.pixels[neighbor] === value && labels[neighbor] === -1)
                    {
                        labels[neighbor] = region;
                        stack.push(neighbor);
                    }
                }
            }
        }

        sizes.push(size);
    }

    return { labels, sizes };
}

/**
 * Compute the squared distance transform of one line (Felzenszwalb and Huttenlocher's method).
 *
 * @param values - The squared distances along the line so far, replaced with the result.
 * @param length - The line's length.
 * @param positions - Scratch space for the parabolas' positions, at least length long.
 * @param bounds - Scratch space for the parabolas' bounds, at least length + 1 long.
 * @param result - Scratch space for the result, at least length long.
 */
function transformLine(values: Float64Array, length: number, positions: Int32Array, bounds: Float64Array, result: Float64Array): void
{
    let count = 0;

    positions[0] = 0;
    bounds[0] = -Infinity;
    bounds[1] = Infinity;

    for (let point = 1; point < length; point++)
    {
        let crossing = ((values[point] + point * point) - (values[positions[count]] + positions[count] * positions[count])) / (2 * point - 2 * positions[count]);

        while (crossing <= bounds[count])
        {
            count--;
            crossing = ((values[point] + point * point) - (values[positions[count]] + positions[count] * positions[count])) / (2 * point - 2 * positions[count]);
        }

        count++;
        positions[count] = point;
        bounds[count] = crossing;
        bounds[count + 1] = Infinity;
    }

    count = 0;

    for (let point = 0; point < length; point++)
    {
        while (bounds[count + 1] < point)
        {
            count++;
        }

        result[point] = (point - positions[count]) * (point - positions[count]) + values[positions[count]];
    }

    values.set(result.subarray(0, length));
}

/**
 * Find each pixel's squared distance to the nearest pixel of a value.
 *
 * @param mask - The mask.
 * @param value - The value to measure the distance to.
 * @returns The squared distances; very large where the mask has no such pixel.
 */
function findSquaredDistances(mask: BinaryMask, value: number): Float64Array
{
    const far = 1e20;
    const distances = new Float64Array(mask.pixels.length);
    const longest = Math.max(mask.width, mask.height);
    const line = new Float64Array(longest);
    const positions = new Int32Array(longest);
    const bounds = new Float64Array(longest + 1);
    const result = new Float64Array(longest);

    for (let index = 0; index < distances.length; index++)
    {
        distances[index] = mask.pixels[index] === value ? 0 : far;
    }

    for (let x = 0; x < mask.width; x++)
    {
        for (let y = 0; y < mask.height; y++)
        {
            line[y] = distances[y * mask.width + x];
        }

        transformLine(line, mask.height, positions, bounds, result);

        for (let y = 0; y < mask.height; y++)
        {
            distances[y * mask.width + x] = line[y];
        }
    }

    for (let y = 0; y < mask.height; y++)
    {
        line.set(distances.subarray(y * mask.width, (y + 1) * mask.width));
        transformLine(line, mask.width, positions, bounds, result);
        distances.set(line.subarray(0, mask.width), y * mask.width);
    }

    return distances;
}

/**
 * Grow the ink of a mask by a radius.
 *
 * @param mask - The mask.
 * @param radius - The radius, in pixels.
 * @returns The grown mask.
 */
function dilateMask(mask: BinaryMask, radius: number): BinaryMask
{
    const distances = findSquaredDistances(mask, 1);
    const pixels = new Uint8Array(mask.pixels.length);

    for (let index = 0; index < pixels.length; index++)
    {
        pixels[index] = distances[index] <= radius * radius ? 1 : 0;
    }

    return { width: mask.width, height: mask.height, pixels };
}

/**
 * Shrink the ink of a mask by a radius.
 *
 * @param mask - The mask.
 * @param radius - The radius, in pixels.
 * @returns The shrunk mask.
 */
function erodeMask(mask: BinaryMask, radius: number): BinaryMask
{
    const distances = findSquaredDistances(mask, 0);
    const pixels = new Uint8Array(mask.pixels.length);

    for (let index = 0; index < pixels.length; index++)
    {
        pixels[index] = distances[index] > radius * radius ? 1 : 0;
    }

    return { width: mask.width, height: mask.height, pixels };
}

/**
 * Close gaps in a mask's ink narrower than twice a radius: grow it, then shrink it back.
 *
 * @param mask - The mask.
 * @param radius - The radius, in pixels.
 * @returns The closed mask.
 */
function closeMask(mask: BinaryMask, radius: number): BinaryMask
{
    return radius > 0 ? erodeMask(dilateMask(mask, radius), radius) : mask;
}

/**
 * Find the largest region.
 *
 * @param regions - The regions.
 * @returns The largest, or -1 if there are none.
 */
function findLargestRegion(regions: Regions): number
{
    let largest = -1;

    for (let region = 0; region < regions.sizes.length; region++)
    {
        if (largest < 0 || regions.sizes[region] > regions.sizes[largest])
        {
            largest = region;
        }
    }

    return largest;
}

/**
 * Find the region a select point picks: the one under it, or the nearest within reach.
 *
 * @param regions - The ink's regions.
 * @param width - The mask's width.
 * @param height - The mask's height.
 * @param point - The point, in the mask's pixels.
 * @returns The region, or -1 if none is within reach.
 */
function findSelectedRegion(regions: Regions, width: number, height: number, point: [number, number]): number
{
    for (let radius = 0; radius <= selectReach; radius++)
    {
        for (let dy = -radius; dy <= radius; dy++)
        {
            for (let dx = -radius; dx <= radius; dx++)
            {
                const x = point[0] + dx;
                const y = point[1] + dy;
                const isOnRing = Math.abs(dx) === radius || Math.abs(dy) === radius;

                if (isOnRing && x >= 0 && y >= 0 && x < width && y < height && regions.labels[y * width + x] >= 0)
                {
                    return regions.labels[y * width + x];
                }
            }
        }
    }

    return -1;
}

/**
 * Keep the animal: the selected shape or else the largest, and the shapes close to it.
 *
 * @param ink - The figure's ink.
 * @param select - A point on the animal to keep, in the mask's pixels, if given.
 * @returns The animal.
 */
function selectAnimal(ink: BinaryMask, select: [number, number] | undefined): Animal
{
    const regions = labelRegions(ink, 1, true);
    const selected = select ? findSelectedRegion(regions, ink.width, ink.height, select) : -1;
    const chosen = selected >= 0 ? selected : findLargestRegion(regions);
    const main: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(ink.pixels.length) };

    for (let index = 0; index < ink.pixels.length; index++)
    {
        main.pixels[index] = regions.labels[index] === chosen && chosen >= 0 ? 1 : 0;
    }

    const reach = dilateMask(main, nearDistance);
    const kept = new Set<number>();

    for (let index = 0; index < ink.pixels.length; index++)
    {
        if (reach.pixels[index] === 1 && regions.labels[index] >= 0)
        {
            kept.add(regions.labels[index]);
        }
    }

    const pixels = new Uint8Array(ink.pixels.length);

    for (let index = 0; index < pixels.length; index++)
    {
        pixels[index] = kept.has(regions.labels[index]) ? 1 : 0;
    }

    return {
        mask: { width: ink.width, height: ink.height, pixels },
        shapesKept: kept.size,
        shapesDropped: regions.sizes.length - kept.size,
        selectMissed: select !== undefined && selected < 0,
    };
}

/**
 * Remove call-outs: drawings joined to the animal only by thin lines, such as bones drawn beside
 * the skeleton with lines to where they belong, and the lines that join them. Thin parts of the
 * animal itself, such as a tail tip or a claw, lead to nothing and stay.
 *
 * @param animal - The animal's filled body, changed in place.
 * @param select - A point on the animal, in the mask's pixels, if given.
 * @returns How many call-outs were removed.
 */
function removeCallouts(animal: BinaryMask, select: [number, number] | undefined): number
{
    const opened = dilateMask(erodeMask(animal, calloutRadius), calloutRadius);
    const regions = labelRegions(opened, 1, true);
    const selected = select ? findSelectedRegion(regions, animal.width, animal.height, select) : -1;
    const main = selected >= 0 ? selected : findLargestRegion(regions);

    if (main < 0)
    {
        return 0;
    }

    const mainMask: BinaryMask = { width: animal.width, height: animal.height, pixels: new Uint8Array(animal.pixels.length) };

    for (let index = 0; index < animal.pixels.length; index++)
    {
        mainMask.pixels[index] = regions.labels[index] === main ? 1 : 0;
    }

    // Shapes big enough to be drawings, and far enough from the animal not to be a part of it
    // that opening cut off, such as a leg at a narrow joint.
    const nearMain = dilateMask(mainMask, calloutGap);
    const isNear = new Uint8Array(regions.sizes.length);

    for (let index = 0; index < animal.pixels.length; index++)
    {
        if (nearMain.pixels[index] === 1 && regions.labels[index] >= 0)
        {
            isNear[regions.labels[index]] = 1;
        }
    }

    const detached: BinaryMask = { width: animal.width, height: animal.height, pixels: new Uint8Array(animal.pixels.length) };
    let count = 0;

    for (let region = 0; region < regions.sizes.length; region++)
    {
        if (region !== main && isNear[region] === 0 && regions.sizes[region] >= calloutShare * regions.sizes[main])
        {
            count++;

            for (let index = 0; index < animal.pixels.length; index++)
            {
                if (regions.labels[index] === region)
                {
                    detached.pixels[index] = 1;
                }
            }
        }
    }

    if (count === 0)
    {
        return 0;
    }

    // The thin parts: ink the opened drawing doesn't reach. Those touching a call-out are its lines.
    const callouts = dilateMask(detached, calloutRadius + 2);
    const reached = dilateMask(opened, calloutRadius + 1);
    const thin: BinaryMask = { width: animal.width, height: animal.height, pixels: new Uint8Array(animal.pixels.length) };

    for (let index = 0; index < animal.pixels.length; index++)
    {
        thin.pixels[index] = animal.pixels[index] === 1 && reached.pixels[index] === 0 ? 1 : 0;
    }

    const thinRegions = labelRegions(thin, 1, true);
    const isLine = new Uint8Array(thinRegions.sizes.length);

    for (let index = 0; index < animal.pixels.length; index++)
    {
        if (thinRegions.labels[index] >= 0 && callouts.pixels[index] === 1)
        {
            isLine[thinRegions.labels[index]] = 1;
        }
    }

    for (let index = 0; index < animal.pixels.length; index++)
    {
        const isLinePixel = thinRegions.labels[index] >= 0 && isLine[thinRegions.labels[index]] === 1;

        if (animal.pixels[index] === 1 && (callouts.pixels[index] === 1 || isLinePixel))
        {
            animal.pixels[index] = 0;
        }
    }

    return count;
}

/**
 * Find the regions of paper that are outside the animal: those touching the edge of the image, and
 * those holding a keep-open point.
 *
 * @param mask - The mask the regions are of.
 * @param paper - The paper's regions.
 * @param keepOpen - The keep-open points, in this mask's pixels.
 * @returns The outside regions.
 */
function findOutsideRegions(mask: BinaryMask, paper: Regions, keepOpen: Array<[number, number]>): Set<number>
{
    const outside = new Set<number>();

    for (let x = 0; x < mask.width; x++)
    {
        outside.add(paper.labels[x]);
        outside.add(paper.labels[(mask.height - 1) * mask.width + x]);
    }

    for (let y = 0; y < mask.height; y++)
    {
        outside.add(paper.labels[y * mask.width]);
        outside.add(paper.labels[y * mask.width + mask.width - 1]);
    }

    for (const [x, y] of keepOpen)
    {
        outside.add(paper.labels[y * mask.width + x]);
    }

    outside.delete(-1);

    return outside;
}

/**
 * Fill the animal's body: everything its outline encloses, once narrow gaps in the outline are
 * closed.
 *
 * @param animal - The animal's ink.
 * @param keepOpen - The keep-open points, in this mask's pixels.
 * @param radius - The widest gap closed, in this mask's pixels.
 * @returns The filled body.
 */
function fillBody(animal: BinaryMask, keepOpen: Array<[number, number]>, radius: number): BinaryMask
{
    const closed = closeMask(animal, radius);
    const paper = labelRegions(closed, 0, false);
    const outside = findOutsideRegions(closed, paper, keepOpen);
    const pixels = new Uint8Array(animal.pixels.length);

    for (let index = 0; index < pixels.length; index++)
    {
        const isEnclosed = paper.labels[index] >= 0 && !outside.has(paper.labels[index]);

        pixels[index] = animal.pixels[index] === 1 || closed.pixels[index] === 1 || isEnclosed ? 1 : 0;
    }

    return { width: animal.width, height: animal.height, pixels };
}

/**
 * Fill cavities: open spaces that a wider closing would enclose and whose opening is narrow for
 * their size, such as a claw drawn as an outline that is broken at the tip.
 *
 * @param body - The filled body, changed in place.
 * @param keepOpen - The keep-open points, in this mask's pixels.
 * @returns How many cavities were filled.
 */
function fillCavities(body: BinaryMask, keepOpen: Array<[number, number]>): number
{
    const wide = closeMask(body, cavityRadius);
    const paper = labelRegions(wide, 0, false);
    const outside = findOutsideRegions(wide, paper, keepOpen);
    const areas = new Map<number, number>();
    const openings = new Map<number, number>();
    const sides = [-1, 1, -body.width, body.width];

    for (let index = 0; index < body.pixels.length; index++)
    {
        if (body.pixels[index] === 1)
        {
            continue;
        }

        const region = paper.labels[index];

        if (region >= 0 && !outside.has(region))
        {
            areas.set(region, (areas.get(region) ?? 0) + 1);
            continue;
        }

        if (wide.pixels[index] !== 1)
        {
            continue;
        }

        // Paper the wider closing turned to ink: part of a cavity's opening.
        for (const side of sides)
        {
            const neighbor = index + side;
            const touching = neighbor >= 0 && neighbor < body.pixels.length ? paper.labels[neighbor] : -1;

            if (touching >= 0 && !outside.has(touching))
            {
                openings.set(touching, (openings.get(touching) ?? 0) + 1);
                break;
            }
        }
    }

    const filled = new Set<number>();

    for (const [region, area] of areas)
    {
        const opening = Math.max(1, (openings.get(region) ?? 0) / (2 * cavityRadius));

        if (area / (opening * opening) >= cavityRatio)
        {
            filled.add(region);
        }
    }

    const cavities: BinaryMask = { width: body.width, height: body.height, pixels: new Uint8Array(body.pixels.length) };

    for (let index = 0; index < body.pixels.length; index++)
    {
        cavities.pixels[index] = body.pixels[index] === 0 && filled.has(paper.labels[index]) ? 1 : 0;
    }

    // Fill the cavities and the openings that closed them off, so no notch is left.
    const nearCavities = dilateMask(cavities, cavityRadius + 1);

    for (let index = 0; index < body.pixels.length; index++)
    {
        if (cavities.pixels[index] === 1 || (wide.pixels[index] === 1 && nearCavities.pixels[index] === 1))
        {
            body.pixels[index] = 1;
        }
    }

    return filled.size;
}

/**
 * Fill the spaces fill points are in. Each space is closed with the narrowest closing, from four
 * units up to thirty-six, that encloses it or fills it, and filled along with the gaps that closed
 * it. A point on the drawing moves to the nearest space within three units.
 *
 * @param body - The filled body, changed in place.
 * @param points - The fill points, in the image's own pixels.
 * @param scale - Mask pixels per image pixel.
 * @param keepOpen - The keep-open points, in the mask's pixels; their spaces are never filled.
 * @returns The fill points that did nothing, in the image's own pixels.
 */
function fillSpaces(body: BinaryMask, points: Array<[number, number]>, scale: number, keepOpen: Array<[number, number]>): Array<[number, number]>
{
    let waiting = new Array<FillPoint>();

    for (const [x, y] of points)
    {
        const column = Math.min(body.width - 1, Math.max(0, Math.round(x * scale)));
        const row = Math.min(body.height - 1, Math.max(0, Math.round(y * scale)));

        waiting.push({ point: [x, y], index: findNearestPaper(body, column, row) });
    }

    for (const radius of fillRadii)
    {
        if (waiting.length === 0)
        {
            break;
        }

        waiting = fillSpacesAtRadius(body, waiting, radius, keepOpen);
    }

    const missed = new Array<[number, number]>();

    for (const waitingPoint of waiting)
    {
        missed.push(waitingPoint.point);
    }

    return missed;
}

/**
 * Find the paper pixel nearest a point, within fillReach of it, for a fill point that landed on
 * the drawing a pixel or two from the space meant.
 *
 * @param body - The filled body.
 * @param column - The point's column.
 * @param row - The point's row.
 * @returns The pixel's index; the point's own if it is paper or no paper is near it.
 */
function findNearestPaper(body: BinaryMask, column: number, row: number): number
{
    let nearest = row * body.width + column;
    let nearestDistance = Infinity;

    if (body.pixels[nearest] === 0)
    {
        return nearest;
    }

    for (let y = Math.max(0, row - fillReach); y <= Math.min(body.height - 1, row + fillReach); y++)
    {
        for (let x = Math.max(0, column - fillReach); x <= Math.min(body.width - 1, column + fillReach); x++)
        {
            const distance = (x - column) * (x - column) + (y - row) * (y - row);

            if (body.pixels[y * body.width + x] === 0 && distance <= fillReach * fillReach && distance < nearestDistance)
            {
                nearest = y * body.width + x;
                nearestDistance = distance;
            }
        }
    }

    return nearest;
}

/**
 * Fill the spaces that one closing encloses around fill points.
 *
 * @param body - The filled body, changed in place.
 * @param points - The fill points not yet filled.
 * @param radius - The closing's radius, in the mask's pixels.
 * @param keepOpen - The keep-open points, in the mask's pixels; their spaces are never filled.
 * @returns The fill points this closing didn't enclose.
 */
function fillSpacesAtRadius(body: BinaryMask, points: Array<FillPoint>, radius: number, keepOpen: Array<[number, number]>): Array<FillPoint>
{
    const waiting = new Array<FillPoint>();
    const wide = closeMask(body, radius);
    const paper = labelRegions(wide, 0, false);
    const outside = findOutsideRegions(wide, paper, keepOpen);
    const regions = new Set<number>();
    const closed = new Array<FillPoint>();

    for (const fillPoint of points)
    {
        const region = paper.labels[fillPoint.index];

        if (body.pixels[fillPoint.index] === 0 && wide.pixels[fillPoint.index] === 1)
        {
            closed.push(fillPoint);
            continue;
        }

        if (body.pixels[fillPoint.index] === 1 || region < 0 || outside.has(region))
        {
            waiting.push(fillPoint);
            continue;
        }

        regions.add(region);
    }

    fillClosedSpaces(body, wide, closed, radius);

    if (regions.size === 0)
    {
        return waiting;
    }

    const space: BinaryMask = { width: body.width, height: body.height, pixels: new Uint8Array(body.pixels.length) };

    for (let index = 0; index < body.pixels.length; index++)
    {
        space.pixels[index] = regions.has(paper.labels[index]) ? 1 : 0;
    }

    // The gaps the closing bridged that join a filled space, near it: its opening.
    const nearSpace = dilateMask(space, 3 * radius);
    const bridges: BinaryMask = { width: body.width, height: body.height, pixels: new Uint8Array(body.pixels.length) };

    for (let index = 0; index < body.pixels.length; index++)
    {
        const isBridge = wide.pixels[index] === 1 && body.pixels[index] === 0 && space.pixels[index] === 0;

        bridges.pixels[index] = isBridge && nearSpace.pixels[index] === 1 ? 1 : 0;
    }

    const bridgeRegions = labelRegions(bridges, 1, true);
    const touching = new Uint8Array(bridgeRegions.sizes.length);
    const touchingSpace = dilateMask(space, 1);

    for (let index = 0; index < body.pixels.length; index++)
    {
        if (bridgeRegions.labels[index] >= 0 && touchingSpace.pixels[index] === 1)
        {
            touching[bridgeRegions.labels[index]] = 1;
        }
    }

    for (let index = 0; index < body.pixels.length; index++)
    {
        const isBridge = bridgeRegions.labels[index] >= 0 && touching[bridgeRegions.labels[index]] === 1;

        if (space.pixels[index] === 1 || isBridge)
        {
            body.pixels[index] = 1;
        }
    }

    // A point on the drawing that a filled space now covers counts as filled.
    for (let index = waiting.length - 1; index >= 0; index--)
    {
        if (space.pixels[waiting[index].index] === 1)
        {
            waiting.splice(index, 1);
        }
    }

    return waiting;
}

/**
 * Fill the spaces a closing filled by itself around fill points: the closing's new ink joined to
 * each point, up to four closing radii from it.
 *
 * @param body - The filled body, changed in place.
 * @param wide - The body after the closing.
 * @param points - The fill points whose pixel the closing filled.
 * @param radius - The closing's radius, in the mask's pixels.
 */
function fillClosedSpaces(body: BinaryMask, wide: BinaryMask, points: Array<FillPoint>, radius: number): void
{
    if (points.length === 0)
    {
        return;
    }

    const added: BinaryMask = { width: body.width, height: body.height, pixels: new Uint8Array(body.pixels.length) };

    for (let index = 0; index < body.pixels.length; index++)
    {
        added.pixels[index] = wide.pixels[index] === 1 && body.pixels[index] === 0 ? 1 : 0;
    }

    const regions = labelRegions(added, 1, true);
    const reach = 4 * radius;

    for (const fillPoint of points)
    {
        const region = regions.labels[fillPoint.index];
        const pointX = fillPoint.index % body.width;
        const pointY = Math.floor(fillPoint.index / body.width);

        for (let y = Math.max(0, pointY - reach); y <= Math.min(body.height - 1, pointY + reach); y++)
        {
            for (let x = Math.max(0, pointX - reach); x <= Math.min(body.width - 1, pointX + reach); x++)
            {
                const index = y * body.width + x;
                const distanceX = x - pointX;
                const distanceY = y - pointY;

                if (regions.labels[index] === region && distanceX * distanceX + distanceY * distanceY <= reach * reach)
                {
                    body.pixels[index] = 1;
                }
            }
        }
    }
}

/**
 * Find the box around a mask's ink.
 *
 * @param mask - The mask.
 * @returns The box; empty if the mask has no ink.
 */
function findInkBox(mask: BinaryMask): PixelBox
{
    const box: PixelBox = { left: mask.width, top: mask.height, right: 0, bottom: 0 };

    for (let y = 0; y < mask.height; y++)
    {
        for (let x = 0; x < mask.width; x++)
        {
            if (mask.pixels[y * mask.width + x] === 1)
            {
                box.left = Math.min(box.left, x);
                box.top = Math.min(box.top, y);
                box.right = Math.max(box.right, x + 1);
                box.bottom = Math.max(box.bottom, y + 1);
            }
        }
    }

    return box;
}

/**
 * Crop a mask to a box with a margin, as a black-on-white image for the tracer.
 *
 * @param mask - The mask.
 * @param box - The box.
 * @returns The image.
 */
function createTraceImage(mask: BinaryMask, box: PixelBox): RgbaImage
{
    const width = box.right - box.left + 2 * cropMargin;
    const height = box.bottom - box.top + 2 * cropMargin;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);

    for (let y = box.top; y < box.bottom; y++)
    {
        for (let x = box.left; x < box.right; x++)
        {
            if (mask.pixels[y * mask.width + x] !== 1)
            {
                continue;
            }

            const index = ((y - box.top + cropMargin) * width + (x - box.left + cropMargin)) * 4;

            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
        }
    }

    return { width, height, data };
}

/**
 * Find the animal's filled body in a figure: everything up to tracing it.
 *
 * @param image - The figure.
 * @param options - The trace's settings.
 * @returns The body, at the width every figure is traced at.
 */
export function findOutlineBody(image: RgbaImage, options: TraceOptions): OutlineBody
{
    const source = createColorPlanes(image);
    const planes: ColorPlanes = {
        red: resizeGrayImage(source.red, processingWidth),
        green: resizeGrayImage(source.green, processingWidth),
        blue: resizeGrayImage(source.blue, processingWidth),
    };
    const gray = planes.red;
    const scale = processingWidth / image.width;
    const backgrounds = findBackgroundColors(planes);
    const ink = createInkMask(planes, options.threshold, backgrounds);
    const keepOpen = new Array<[number, number]>();
    const keepOpenMissed = new Array<[number, number]>();
    const select: [number, number] | undefined = options.select
        ? [Math.min(gray.width - 1, Math.round(options.select[0] * scale)), Math.min(gray.height - 1, Math.round(options.select[1] * scale))]
        : undefined;
    const erase = new Array<[number, number, number, number]>();

    for (const [left, top, right, bottom] of options.erase ?? [])
    {
        erase.push([Math.floor(left * scale), Math.floor(top * scale), Math.ceil(right * scale), Math.ceil(bottom * scale)]);
    }

    eraseRectangles(ink, erase);

    // Pixels erased by grid lines, where the animal's edge is drawn again after.
    const erasedLines: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(ink.pixels.length) };

    const segments = new Array<[number, number, number, number, number]>();

    for (const [x1, y1, x2, y2, width] of options.eraseLines ?? [])
    {
        segments.push([x1 * scale, y1 * scale, x2 * scale, y2 * scale, width * scale]);
    }

    const erasedByStrokes: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(segments.length > 0 ? ink.pixels.length : 0) };
    let widest = 0;

    for (const segment of segments)
    {
        widest = Math.max(widest, segment[4]);
    }

    eraseSegments(ink, segments, erasedByStrokes);

    // Ground lines first: their feet need care that a grid line's crossings don't.
    const groundLines = eraseGroundLines(ink);
    const gridLines = eraseGridLines(ink, false, erasedLines) + eraseGridLines(ink, true, erasedLines);

    repairLineCrossings(ink, erasedLines);

    const linesErased = groundLines + gridLines + eraseVerticalLines(ink);

    for (const [x, y] of options.keepOpen)
    {
        keepOpen.push([Math.min(gray.width - 1, Math.round(x * scale)), Math.min(gray.height - 1, Math.round(y * scale))]);
    }

    const radius = options.close === undefined ? closeRadius : Math.round(options.close * unit);

    if (segments.length > 0)
    {
        restoreStrokeEdges(ink, erasedByStrokes, widest, select);
        restoreStrokeDents(ink, erasedByStrokes, widest, select, keepOpen, radius);
    }

    const animal = selectAnimal(ink, select);

    for (let index = 0; index < keepOpen.length; index++)
    {
        const [column, row] = keepOpen[index];

        if (animal.mask.pixels[row * gray.width + column] === 1)
        {
            keepOpenMissed.push(options.keepOpen[index]);
        }
    }

    const mask = fillBody(animal.mask, keepOpen, radius);
    const cavitiesFilled = fillCavities(mask, keepOpen);
    const fillMissed = fillSpaces(mask, options.fill ?? [], scale, keepOpen);

    // On the filled body the animal is one solid shape, so only drawings hanging off it by thin
    // lines come apart when it is opened; on the drawing itself, a skeleton's thin outlines would.
    const calloutsRemoved = removeCallouts(mask, select);

    return {
        mask,
        box: findInkBox(mask),
        report: {
            linesErased,
            shapesKept: animal.shapesKept,
            shapesDropped: animal.shapesDropped,
            cavitiesFilled,
            keepOpenMissed,
            calloutsRemoved,
            background: backgrounds.length > 1 ? formatColor(backgrounds[1]) : "",
            selectMissed: animal.selectMissed,
            fillMissed,
        },
    };
}

/**
 * Trace a skeletal reconstruction into an outline.
 *
 * @param image - The figure.
 * @param options - The trace's settings.
 * @param tracer - Turns the filled body into SVG.
 * @returns The outline, and what the trace found and changed.
 */
export async function traceOutline(image: RgbaImage, options: TraceOptions, tracer: BitmapTracer): Promise<TraceResult>
{
    const body = findOutlineBody(image, options);

    if (body.box.right <= body.box.left)
    {
        throw new Error("The figure has nothing dark enough to trace; try a higher threshold.");
    }

    const traceImage = createTraceImage(body.mask, body.box);
    const svg = await tracer(traceImage, speckleArea);
    const scale = image.width / processingWidth;
    const placement: OutlinePlacement = {
        left: (body.box.left - cropMargin) * scale,
        top: (body.box.top - cropMargin) * scale,
        width: traceImage.width * scale,
        height: traceImage.height * scale,
    };

    return { svg, placement, report: body.report };
}

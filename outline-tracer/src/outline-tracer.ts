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

// A ground line: a band at most this thick whose ink runs across this share of the width.
const lineMaximumThickness = 8 * unit;
const lineMinimumShare = 0.3;

// The anti-aliased edge erased with a ground line, the widest hollow claw that stands on one, and
// how much of the line's top edge is kept under a foot.
const lineMargin = 2 * unit;
const footGap = 10 * unit;
const footDepth = unit;

// Cavities a closing this wide would enclose, filled when their area is at least this many times
// the square of their opening: a claw open at the tip, not the gap between two teeth.
const cavityRadius = 3 * unit;
const cavityRatio = 4;

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
 * Convert an image to gray, over a white background.
 *
 * @param image - The image.
 * @returns The gray image.
 */
function createGrayImage(image: RgbaImage): GrayImage
{
    const pixels = new Uint8Array(image.width * image.height);

    for (let index = 0; index < pixels.length; index++)
    {
        const alpha = image.data[index * 4 + 3] / 255;
        const luma = 0.299 * image.data[index * 4] + 0.587 * image.data[index * 4 + 1] + 0.114 * image.data[index * 4 + 2];

        pixels[index] = Math.round(luma * alpha + 255 * (1 - alpha));
    }

    return { width: image.width, height: image.height, pixels };
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
 * Erase one ground line, rows top to bottom, keeping its top edge under anything that stands on
 * it, and under narrow gaps between such places (inside a hollow claw).
 *
 * @param mask - The mask, changed in place.
 * @param runs - Each row's longest run.
 * @param first - The band's first row.
 * @param last - The band's last row.
 */
function eraseGroundLine(mask: BinaryMask, runs: Array<Run>, first: number, last: number): void
{
    const top = Math.max(0, first - lineMargin);
    const bottom = Math.min(mask.height - 1, last + lineMargin);
    const keepTo = Math.min(bottom, first + footDepth);
    let left = mask.width;
    let right = 0;

    for (let y = first; y <= last; y++)
    {
        left = Math.min(left, runs[y].start);
        right = Math.max(right, runs[y].end);
    }

    const isStanding = new Uint8Array(mask.width);
    let lastStanding = -1;

    for (let x = left; x < right; x++)
    {
        if (top === 0 || mask.pixels[(top - 1) * mask.width + x] !== 1)
        {
            continue;
        }

        if (lastStanding >= 0 && x - lastStanding <= footGap)
        {
            isStanding.fill(1, lastStanding + 1, x);
        }

        isStanding[x] = 1;
        lastStanding = x;
    }

    for (let x = left; x < right; x++)
    {
        for (let y = isStanding[x] ? keepTo + 1 : top; y <= bottom; y++)
        {
            mask.pixels[y * mask.width + x] = 0;
        }
    }
}

/**
 * Erase ground lines: thin bands whose ink runs across much of the figure.
 *
 * @param mask - The mask, changed in place.
 * @returns How many lines were erased.
 */
function eraseGroundLines(mask: BinaryMask): number
{
    const runs = new Array<Run>();
    let erased = 0;

    for (let y = 0; y < mask.height; y++)
    {
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

        if (last - y + 1 <= lineMaximumThickness)
        {
            eraseGroundLine(mask, runs, y, last);
            erased++;
        }

        y = last + 1;
    }

    return erased;
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
 * Keep the animal: the largest shape, and the shapes close to it.
 *
 * @param ink - The figure's ink.
 * @returns The animal.
 */
function selectAnimal(ink: BinaryMask): Animal
{
    const regions = labelRegions(ink, 1, true);
    let largest = -1;

    for (let region = 0; region < regions.sizes.length; region++)
    {
        if (largest < 0 || regions.sizes[region] > regions.sizes[largest])
        {
            largest = region;
        }
    }

    const main: BinaryMask = { width: ink.width, height: ink.height, pixels: new Uint8Array(ink.pixels.length) };

    for (let index = 0; index < ink.pixels.length; index++)
    {
        main.pixels[index] = regions.labels[index] === largest && largest >= 0 ? 1 : 0;
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

    return { mask: { width: ink.width, height: ink.height, pixels }, shapesKept: kept.size, shapesDropped: regions.sizes.length - kept.size };
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
 * @returns The filled body.
 */
function fillBody(animal: BinaryMask, keepOpen: Array<[number, number]>): BinaryMask
{
    const closed = closeMask(animal, closeRadius);
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
    const gray = resizeGrayImage(createGrayImage(image), processingWidth);
    const ink: BinaryMask = { width: gray.width, height: gray.height, pixels: new Uint8Array(gray.pixels.length) };
    const scale = processingWidth / image.width;
    const keepOpen = new Array<[number, number]>();
    const keepOpenMissed = new Array<[number, number]>();

    for (let index = 0; index < gray.pixels.length; index++)
    {
        ink.pixels[index] = gray.pixels[index] < options.threshold ? 1 : 0;
    }

    const linesErased = eraseGroundLines(ink);
    const animal = selectAnimal(ink);

    for (const [x, y] of options.keepOpen)
    {
        const point: [number, number] = [Math.min(gray.width - 1, Math.round(x * scale)), Math.min(gray.height - 1, Math.round(y * scale))];

        keepOpen.push(point);

        if (animal.mask.pixels[point[1] * gray.width + point[0]] === 1)
        {
            keepOpenMissed.push([x, y]);
        }
    }

    const mask = fillBody(animal.mask, keepOpen);
    const cavitiesFilled = fillCavities(mask, keepOpen);

    return {
        mask,
        box: findInkBox(mask),
        report: { linesErased, shapesKept: animal.shapesKept, shapesDropped: animal.shapesDropped, cavitiesFilled, keepOpenMissed },
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

    const svg = await tracer(createTraceImage(body.mask, body.box), speckleArea);

    return { svg, report: body.report };
}

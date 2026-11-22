/**
 * Things drawn in color or around the figure that the neutral line ink leaves out or lets in
 * wrongly: thin colored lines (branches drawn in color), fat colored shapes (range ovals, clade
 * fills), and the frame some figures draw around themselves.
 */

import type { Box, ExtractionDocument, Mask, QcIssue, RgbaImage, Segment } from "./types.ts";
import { createDirectionalRunMask, createMaskFromComponents, dilate, erode, findConnectedComponents, subtractMask, closeMask, invertMask, unionMask } from "./raster.ts";
import { deleteTip } from "./edit.ts";

/**
 * Colored ink split by shape.
 */
export type ColoredInk = {
    /**
     * Thin colored strokes: lines drawn in color, which belong with the line ink.
     */
    thin: Mask;

    /**
     * Fat colored shapes: markers and fills, which are neither lines nor text.
     */
    fat: Mask;
};

/**
 * Splits the dark colored pixels of an image into thin strokes and fat shapes. A shape is fat
 * where it survives an erosion of the given radius; the fat mask is that core grown back by a
 * pixel more, so that the anti-aliased rim of a marker goes with the marker.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which a colored pixel counts as dark.
 * @param minChroma - Chroma a pixel must exceed to count as colored. Set well above the
 * neutral limit, since JPEG leaves fringes of moderate chroma along black lines on tinted
 * backgrounds, and those would thicken the lines with false ink.
 * @param radius - Half-width of the erosion square; strokes thinner than its width are thin.
 * @returns The two masks.
 */
export function splitColoredInk(image: RgbaImage, threshold: number, minChroma: number, radius: number): ColoredInk
{
    const colored = createColoredMask(image, threshold, minChroma);
    const core = erode(colored, radius);
    const grown = dilate(core, radius + 1);
    const fat = subtractMask(colored, subtractMask(colored, grown));
    // A fat piece that is a long strip, several times longer than it is wide and no wider
    // than a few line thicknesses, is a thick colored line, a branch drawn in color (Wu 2015's
    // ten-pixel subgenus branches), not a marker; it goes with the thin ink.
    const labeling = findConnectedComponents(fat);
    const strips = new Set<number>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];
        const width = box.x1 - box.x0;
        const height = box.y1 - box.y0;
        const shorter = Math.min(width, height);
        const longer = Math.max(width, height);

        if (shorter <= 4 * radius && longer >= 4 * shorter)
        {
            strips.add(index + 1);
        }
    }

    const stripMask = createMaskFromComponents(labeling.labels, strips, fat.width, fat.height);
    const fatShapes = subtractMask(fat, stripMask);
    const thin = subtractMask(colored, fatShapes);
    removeOutlines(thin, 8 * radius, 2 * radius + 3);

    return { thin, fat: fatShapes };
}

/**
 * Luminance below which a color of moderate chroma is a dark, muted line color.
 */
const mutedLuminance = 110;

/**
 * Chroma a dark, muted color must exceed.
 */
const mutedChroma = 60;

/**
 * Luminance below which a color of high chroma is a vivid line color.
 */
const vividLuminance = 200;

/**
 * Chroma a vivid color must exceed.
 */
const vividChroma = 150;

/**
 * Narrowest a colored shape can be and still be an arrowhead or a dot, in pixels.
 */
const slightestHead = 6;

/**
 * Keeps the thin colored ink that is drawn as lines: the pieces holding a straight horizontal
 * or vertical run of some length. Thin colored ink joins the line ink, for trees drawn in
 * color; but the head of a colored arrow pointing at a node, too small to count as a fat
 * shape, is thin colored ink as well, and where it touches the tree it becomes part of it: a
 * vertical merged with the head, in the wrong place and without its parent (Alarcon-Munoz
 * 2023). A branch has a straight run; a head, a dot or a colored letter has none.
 *
 * @param thin - Thin colored ink.
 * @param minRun - Shortest straight run that makes a piece a line.
 * @returns The thin colored ink in pieces that hold such a run, or are too slight for a head.
 */
export function keepColoredLines(thin: Mask, minRun: number): Mask
{
    const straight = unionMask(createDirectionalRunMask(thin, minRun, true), createDirectionalRunMask(thin, minRun, false));
    const { components, labels } = findConnectedComponents(thin);
    const lines = new Set<number>();

    for (let index = 0; index < straight.data.length; index++)
    {
        if (straight.data[index] === 1)
        {
            lines.add(labels[index]);
        }
    }

    // A piece too slight to hold such a run, a short stub or the end of a colored bar, is no
    // arrowhead either: it is thinner than any head.
    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];

        if (Math.min(box.x1 - box.x0, box.y1 - box.y0) < slightestHead)
        {
            lines.add(index + 1);
        }
    }

    return components.length === lines.size ? thin : createMaskFromComponents(labels, lines, thin.width, thin.height);
}

/**
 * Draws on the lines that a small colored shape covers. An arrowhead is drawn over the tree,
 * so where its point lies on a branch the branch has a hole the size of the head once the
 * head is no longer line ink. On each row and each column of the shape, where dark ink stands
 * right at both of its edges, the line is carried across.
 *
 * @param dark - Neutral dark ink.
 * @param shapes - The colored shapes that were kept out of the line ink.
 * @param reach - How near to an edge the dark ink must stand.
 * @returns Mask of the stretches carried across.
 */
export function bridgeUnderShapes(dark: Mask, shapes: Mask, reach: number): Mask
{
    const { width, height } = dark;
    const data = new Uint8Array(width * height);
    const { components, labels } = findConnectedComponents(shapes);

    function hasDark(x0: number, x1: number, y0: number, y1: number): boolean
    {
        for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++)
        {
            for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++)
            {
                if (dark.data[y * width + x] === 1)
                {
                    return true;
                }
            }
        }

        return false;
    }

    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];
        const label = index + 1;

        for (let y = box.y0; y < box.y1; y++)
        {
            let first = -1;
            let last = -1;

            for (let x = box.x0; x < box.x1; x++)
            {
                if (labels[y * width + x] === label)
                {
                    first = first < 0 ? x : first;
                    last = x;
                }
            }

            if (first >= 0 && hasDark(first - reach, first - 1, y, y) && hasDark(last + 1, last + reach, y, y))
            {
                data.fill(1, y * width + first, y * width + last + 1);
            }
        }

        for (let x = box.x0; x < box.x1; x++)
        {
            let first = -1;
            let last = -1;

            for (let y = box.y0; y < box.y1; y++)
            {
                if (labels[y * width + x] === label)
                {
                    first = first < 0 ? y : first;
                    last = y;
                }
            }

            if (first >= 0 && hasDark(x, x, first - reach, first - 1) && hasDark(x, x, last + 1, last + reach))
            {
                for (let y = first; y <= last; y++)
                {
                    data[y * width + x] = 1;
                }
            }
        }
    }

    return { width, height, data };
}

/**
 * Marks pixels that are both dark and strongly colored.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which a pixel counts as dark.
 * @param minChroma - Chroma a pixel must exceed.
 * @returns The mask.
 */
export function createColoredMask(image: RgbaImage, threshold: number, minChroma: number): Mask
{
    const { width, height, data } = image;
    const mask = new Uint8Array(width * height);

    for (let index = 0; index < width * height; index++)
    {
        const offset = index * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

        if (luminance < threshold && chroma > minChroma)
        {
            mask[index] = 1;
        }
    }

    return { width, height, data: mask };
}

/**
 * Finds the lines drawn in the two kinds of color the main rule leaves out. Bands, fills and
 * photographs hold such colors too: what survives an erosion goes, and so does the rim it
 * leaves and any outline of a shape, as for the main colored ink.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which the main rule counts a colored pixel as dark.
 * @param minChroma - Chroma the main rule requires.
 * @param radius - Half-width of the erosion square; strokes thinner than its width are thin.
 * @returns The pixels of those lines.
 */
export function findOffColorLines(image: RgbaImage, threshold: number, minChroma: number, radius: number): Mask
{
    const offColor = createOffColorMask(image, threshold, minChroma);
    const thin = subtractMask(offColor, dilate(erode(offColor, radius), radius + 2));
    removeOutlines(thin, 8 * radius, 2 * radius + 3);
    removeLoops(thin, Math.max(2, radius), 8 * radius);
    const lines = keepColoredLines(thin, 6 * radius);
    removeDashes(lines);

    return lines;
}

/**
 * Finds the pixels in the two kinds of line color the main rule leaves out: a dark, muted
 * color, such as a slate blue, whose chroma is short of the limit, and a vivid light one, such
 * as a yellow, which is brighter than the threshold (Wu 2015 draws branches in both). Bands,
 * fills and photographs hold such colors too, so the caller keeps only what is drawn as lines.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which the main rule counts a colored pixel as dark.
 * @param minChroma - Chroma the main rule requires.
 * @returns The pixels in those colors that the main rule does not take.
 */
function createOffColorMask(image: RgbaImage, threshold: number, minChroma: number): Mask
{
    const { width, height, data } = image;
    const mask = new Uint8Array(width * height);

    for (let index = 0; index < width * height; index++)
    {
        const offset = index * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const muted = luminance < mutedLuminance && chroma > mutedChroma;
        const vivid = luminance < vividLuminance && chroma > vividChroma;

        if ((muted || vivid) && !(luminance < threshold && chroma > minChroma))
        {
            mask[index] = 1;
        }
    }

    return { width, height, data: mask };
}

/**
 * Clears thin components that are the outline of a rectangle: a colored border around a clade
 * box, which is neither a line of the tree nor a marker. Branches crossing the border cut it
 * into pieces, so the mask is grown first to join them again; a joined component is an outline
 * when it is at least a given size each way and nearly all of its pixels lie along its
 * bounding box.
 *
 * @param thin - Thin colored mask, modified in place.
 * @param minSize - Smallest width and height of an outline.
 * @param rim - How far in from the bounding box a pixel still counts as on the border.
 */
function removeOutlines(thin: Mask, minSize: number, rim: number): void
{
    const { width, components, labels } = { width: thin.width, ...findConnectedComponents(dilate(thin, Math.max(2, Math.round(rim / 2)))) };
    const onBorder = new Int32Array(components.length);

    for (let index = 0; index < labels.length; index++)
    {
        const label = labels[index];

        if (label === 0)
        {
            continue;
        }

        const box = components[label - 1].box;
        const x = index % width;
        const y = Math.floor(index / width);

        if (x < box.x0 + rim || x >= box.x1 - rim || y < box.y0 + rim || y >= box.y1 - rim)
        {
            onBorder[label - 1]++;
        }
    }

    const outlines = new Set<number>();

    for (let index = 0; index < components.length; index++)
    {
        const { box, area } = components[index];

        if (box.x1 - box.x0 >= minSize && box.y1 - box.y0 >= minSize && onBorder[index] >= 0.85 * area)
        {
            outlines.add(index + 1);
        }
    }

    if (outlines.size === 0)
    {
        return;
    }

    for (let index = 0; index < labels.length; index++)
    {
        if (outlines.has(labels[index]))
        {
            thin.data[index] = 0;
        }
    }
}

/**
 * Clears thin components that close on themselves. A tree's lines enclose nothing, so a stroke
 * that runs around an area is the outline of something else: a range bar drawn hollow (Wang
 * 2025), the border of a shaded clade (Poust 2020). Lines crossing the outline cut it, so the
 * mask is grown first to join it again.
 *
 * @param thin - Thin colored mask, modified in place.
 * @param grow - How far the mask is grown before looking.
 * @param smallest - Fewest pixels an enclosed area must hold, so that a pinhole is no loop.
 */
function removeLoops(thin: Mask, grow: number, smallest: number): void
{
    const { width, height } = thin;
    const grown = findConnectedComponents(dilate(thin, grow));
    const gaps = findConnectedComponents(invertMask(dilate(thin, grow)));
    const enclosed = new Set<number>();

    for (let index = 0; index < gaps.components.length; index++)
    {
        const { box, area } = gaps.components[index];

        if (area >= smallest && box.x0 > 0 && box.y0 > 0 && box.x1 < width && box.y1 < height)
        {
            enclosed.add(index + 1);
        }
    }

    const loops = new Set<number>();

    for (let y = 1; y < height - 1; y++)
    {
        for (let x = 1; x < width - 1; x++)
        {
            const index = y * width + x;

            if (!enclosed.has(gaps.labels[index]))
            {
                continue;
            }

            // The piece that walls an enclosed area in is beside it on some side.
            for (const neighbor of [index - 1, index + 1, index - width, index + width])
            {
                if (grown.labels[neighbor] !== 0)
                {
                    loops.add(grown.labels[neighbor]);
                }
            }
        }
    }

    if (loops.size === 0)
    {
        return;
    }

    for (let index = 0; index < grown.labels.length; index++)
    {
        if (loops.has(grown.labels[index]))
        {
            thin.data[index] = 0;
        }
    }
}

/**
 * Clears the pieces of a dashed rule: three or more strokes end to end on one row or in one
 * column. A branch is drawn solid; a dashed line in color marks a boundary across the figure.
 *
 * @param lines - Mask of colored strokes, modified in place.
 */
function removeDashes(lines: Mask): void
{
    const labeling = findConnectedComponents(lines);
    const onRow = new Map<number, Array<number>>();
    const inColumn = new Map<number, Array<number>>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];
        const wide = box.x1 - box.x0;
        const tall = box.y1 - box.y0;

        if (wide >= 2 * tall)
        {
            onRow.set(box.y0, [...(onRow.get(box.y0) ?? []), index + 1]);
        }
        else if (tall >= 2 * wide)
        {
            inColumn.set(box.x0, [...(inColumn.get(box.x0) ?? []), index + 1]);
        }
    }

    const dashes = new Set<number>();

    for (const group of [...onRow.values(), ...inColumn.values()])
    {
        if (group.length >= 3)
        {
            for (const label of group)
            {
                dashes.add(label);
            }
        }
    }

    for (let index = 0; index < labeling.labels.length; index++)
    {
        if (dashes.has(labeling.labels[index]))
        {
            lines.data[index] = 0;
        }
    }
}

/**
 * What removing a stage chart found.
 */
export type ChartStripFind = {
    /**
     * One informational issue per strip dropped.
     */
    issues: Array<QcIssue>;

    /**
     * The long rules of each strip, kept aside for the time axis: the ages are printed along
     * one of them.
     */
    axisRules: Array<Segment>;

    /**
     * The short verticals of each strip, kept aside with the rules: the axis may be a row of
     * ticks with no line.
     */
    axisTicks: Array<Segment>;
};

/**
 * Removes stage charts: a strip along the top or bottom of the figure, bounded by a rule
 * spanning two fifths of the width, holding eight or more dividers in rows. A time tree's
 * chart of periods, epochs and stages is drawn that way, and once a branch touches a rule,
 * every divider becomes a tip. Dividers are told from a tree's connectors by their rows: the
 * dividers between two rules share a top and a bottom, four or more at a time, as connectors
 * never do. The innermost qualifying rule with a divider row within six glyphs of it and no
 * connector running on from it into the tree bounds the strip, and every segment lying within
 * the strip goes, the rules included; the long rules and the short verticals are returned so
 * the time axis can still be read.
 *
 * @param horizontals - Horizontal segments, rewritten in place.
 * @param verticals - Vertical segments, rewritten in place.
 * @param width - Image width.
 * @param height - Image height.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @returns Issues and the rules kept for the axis.
 */
export function removeChartStrips(horizontals: Array<Segment>, verticals: Array<Segment>, width: number, height: number, glyphHeight: number, thickness: number): ChartStripFind
{
    const issues = new Array<QcIssue>();
    const axisRules = new Array<Segment>();
    const axisTicks = new Array<Segment>();
    const slack = Math.max(2, Math.round(thickness));
    // A band edge may run a little past the rule it stands on.
    const overshoot = Math.max(slack, glyphHeight);
    const bin = 2 * slack;

    function keyRow(box: Box): string
    {
        return `${Math.round(box.y0 / bin)}:${Math.round(box.y1 / bin)}`;
    }

    // A divider stands on a rule, or hangs from one: a horizontal of any length meets one of
    // its ends. The dashes of a dashed stage line through a tree align in rows too, and meet
    // nothing.
    function meetsHorizontal(box: Box): boolean
    {
        for (const horizontal of horizontals)
        {
            const other = horizontal.box;

            if (other.x0 <= box.x1 + slack && other.x1 >= box.x0 - slack
                && ((other.y1 >= box.y0 - slack && other.y0 <= box.y0 + slack) || (other.y1 >= box.y1 - slack && other.y0 <= box.y1 + slack)))
            {
                return true;
            }
        }

        return false;
    }

    function findDividerRows(stripTop: number, stripBottom: number): Map<string, number>
    {
        const rows = new Map<string, number>();

        for (const vertical of verticals)
        {
            const { box } = vertical;

            if (box.y0 >= stripTop - overshoot && box.y1 <= stripBottom + overshoot && meetsHorizontal(box))
            {
                const key = keyRow(box);
                rows.set(key, (rows.get(key) ?? 0) + 1);
            }
        }

        for (const [key, members] of rows)
        {
            if (members < 4)
            {
                rows.delete(key);
            }
        }

        return rows;
    }

    function countDividers(rows: Map<string, number>): number
    {
        let count = 0;

        for (const members of rows.values())
        {
            count += members;
        }

        return count;
    }

    // The gap between the rule and the nearest divider row: a chart's rule has its dividers
    // right under it, a long branch in the tree above the chart has the tree's last rows in
    // between.
    function measureGapToRows(rows: Map<string, number>, rule: Segment, atTop: boolean): number
    {
        let gap = Infinity;

        for (const vertical of verticals)
        {
            const { box } = vertical;

            if (rows.has(keyRow(box)))
            {
                gap = Math.min(gap, Math.max(0, atTop ? rule.box.y0 - box.y1 : box.y0 - rule.box.y1));
            }
        }

        return gap;
    }

    // A long branch just inside the chart is as long and as deep as a rule, but a connector
    // meets it and runs on into the tree; a band edge crossing a chart rule runs a couple of
    // glyphs past it at most.
    function hasConnector(rule: Segment, atTop: boolean): boolean
    {
        const reach = 3 * glyphHeight;

        for (const vertical of verticals)
        {
            const { box } = vertical;
            const meets = box.x0 <= rule.box.x1 + slack && box.x1 >= rule.box.x0 - slack && box.y1 >= rule.box.y0 - slack && box.y0 <= rule.box.y1 + slack;
            const beyond = atTop ? box.y1 - rule.box.y1 : rule.box.y0 - box.y0;

            if (meets && beyond > reach)
            {
                return true;
            }
        }

        return false;
    }

    for (const atTop of [true, false])
    {
        let best: Segment | null = null;
        let bestDepth = 0;
        let bestDividers = 0;

        for (const rule of horizontals)
        {
            const depth = atTop ? rule.box.y1 : height - rule.box.y0;

            if (rule.box.x1 - rule.box.x0 < 0.4 * width || depth > 0.35 * height)
            {
                continue;
            }

            const rows = findDividerRows(atTop ? 0 : rule.box.y0, atTop ? rule.box.y1 : height);
            const dividers = countDividers(rows);

            if (dividers >= 8 && depth > bestDepth && !hasConnector(rule, atTop) && measureGapToRows(rows, rule, atTop) <= 6 * glyphHeight)
            {
                best = rule;
                bestDepth = depth;
                bestDividers = dividers;
            }
        }

        if (best === null)
        {
            continue;
        }

        // Segments within the strip go; a divider in a row may run a little past the rule, but
        // a tree's own segment that close to the rule stays.
        const stripTop = atTop ? 0 : best.box.y0 - slack;
        const stripBottom = atTop ? best.box.y1 + slack : height;
        const rows = findDividerRows(atTop ? 0 : best.box.y0, atTop ? best.box.y1 : height);
        let dropped = 0;

        for (const list of [horizontals, verticals])
        {
            const kept = new Array<Segment>();

            for (const segment of list)
            {
                const { box } = segment;
                const inside = box.y0 >= stripTop && box.y1 <= stripBottom;
                const inRow = list === verticals && box.y0 >= stripTop - overshoot && box.y1 <= stripBottom + overshoot && rows.has(keyRow(box));

                if (inside || inRow)
                {
                    dropped++;

                    if (list === horizontals ? box.x1 - box.x0 >= 0.4 * width : box.y1 - box.y0 <= 3 * glyphHeight)
                    {
                        (list === horizontals ? axisRules : axisTicks).push(segment);
                    }
                }
                else
                {
                    kept.push(segment);
                }
            }

            list.length = 0;
            list.push(...kept);
        }

        issues.push({ severity: "info", code: "chart-strip-dropped", message: `a stage chart along the ${atTop ? "top" : "bottom"} edge, bounded by ${best.id} with ${bestDividers} divider(s) in rows, was dropped (${dropped} segment(s))`, subject: null });
    }

    return { issues, axisRules, axisTicks };
}

/**
 * Removes chart lines: a line spanning much of the figure that many segments of the other
 * direction cross or end on. A stratigraphic band at the top of a time tree is a width-wide
 * rule with dozens of stage dividers standing on it, and once a branch touches it, the
 * dividers become tips of the tree. Nothing crosses a node connector, and the stem of a dense
 * tree has many branches ending on it, so only crossings count, and they must not be dwarfed
 * by endings. A band whose dividers stand on it without crossing (Wang 2025) is not caught;
 * counting endings instead took a scale of Ke 2023 with it.
 *
 * @param horizontals - Horizontal segments, rewritten in place.
 * @param verticals - Vertical segments, rewritten in place.
 * @param width - Image width.
 * @param height - Image height.
 * @returns One informational issue per line dropped.
 */
export function removeChartLines(horizontals: Array<Segment>, verticals: Array<Segment>, width: number, height: number): Array<QcIssue>
{
    const issues = new Array<QcIssue>();

    function judge(lines: Array<Segment>, others: Array<Segment>, alongX: boolean): Array<Segment>
    {
        const kept = new Array<Segment>();
        const span = alongX ? width : height;

        for (const line of lines)
        {
            const { box } = line;
            const length = alongX ? box.x1 - box.x0 : box.y1 - box.y0;
            let crossing = 0;
            let ending = 0;

            // A line need only reach across a sixth of the figure: a stage line is cut into
            // pieces wherever a junction of the tree happens to sit on it.
            if (length >= 0.15 * span)
            {
                for (const other of others)
                {
                    const otherBox = other.box;
                    const overlaps = alongX ? otherBox.x0 < box.x1 && otherBox.x1 > box.x0 : otherBox.y0 < box.y1 && otherBox.y1 > box.y0;

                    if (!overlaps)
                    {
                        continue;
                    }

                    const before = alongX ? otherBox.y0 < box.y0 - 2 : otherBox.x0 < box.x0 - 2;
                    const after = alongX ? otherBox.y1 > box.y1 + 2 : otherBox.x1 > box.x1 + 2;

                    if (before && after)
                    {
                        crossing++;
                    }
                    else if (before || after)
                    {
                        ending++;
                    }
                }
            }

            if (crossing >= 6)
            {
                issues.push({ severity: "info", code: "chart-line-dropped", message: `${line.orientation} ${line.id} spanning the figure with ${crossing} segment(s) crossing and ${ending} ending on it was dropped as a chart line`, subject: null });
            }
            else
            {
                kept.push(line);
            }
        }

        return kept;
    }

    const keptHorizontals = judge(horizontals, verticals, true);
    const keptVerticals = judge(verticals, horizontals, false);
    horizontals.length = 0;
    horizontals.push(...keptHorizontals);
    verticals.length = 0;
    verticals.push(...keptVerticals);

    return issues;
}

/**
 * The fat shapes of a mask: regions that survive an erosion, grown back by a pixel more. On
 * the line ink these are collapsed-clade wedges, filled discs and thick bars, never lines.
 *
 * @param mask - Source mask.
 * @param radius - Half-width of the erosion square; anything thinner than its width is not fat.
 * @returns The fat shapes.
 */
export function findFatShapes(mask: Mask, radius: number): Mask
{
    const grown = dilate(erode(mask, radius), radius + 1);

    return subtractMask(mask, subtractMask(mask, grown));
}

/**
 * Drops segments that are the frame around the figure: a horizontal or vertical within a
 * margin of the image edge that spans most of the image. A frame's left edge is a vertical as
 * tall as the image, which would otherwise become the root of everything.
 *
 * @param segments - Segments of one orientation, modified in place.
 * @param width - Image width.
 * @param height - Image height.
 * @returns One issue per segment dropped.
 */
export function removeFrameSegments(segments: Array<Segment>, width: number, height: number): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const kept = new Array<Segment>();
    const marginX = Math.max(4, Math.round(0.02 * width));
    const marginY = Math.max(4, Math.round(0.02 * height));

    for (const segment of segments)
    {
        const { box } = segment;
        let frame = false;

        if (segment.orientation === "horizontal")
        {
            const atEdge = box.y0 <= marginY || box.y1 >= height - marginY;
            frame = atEdge && box.x1 - box.x0 >= 0.9 * width;
        }
        else
        {
            const atEdge = box.x0 <= marginX || box.x1 >= width - marginX;
            frame = atEdge && box.y1 - box.y0 >= 0.9 * height;
        }

        if (frame)
        {
            issues.push({
                severity: "info",
                code: "frame-dropped",
                message: `${segment.orientation} ${segment.id} along the image edge spanning the figure was dropped as a frame`,
                subject: null,
            });
        }
        else
        {
            kept.push(segment);
        }
    }

    segments.length = 0;
    segments.push(...kept);

    return issues;
}

/**
 * Keeps only the components of a mask that fit a marker: a range oval, a wedge or a bar is at
 * most a few glyphs tall, while a clade fill or a silhouette is far larger, and a branch that
 * runs into one of those does not end on its far side.
 *
 * @param mask - Fat shapes.
 * @param maxWidth - Widest component kept.
 * @param maxHeight - Tallest component kept.
 * @returns The small components as a mask.
 */
export function keepSmallShapes(mask: Mask, maxWidth: number, maxHeight: number): Mask
{
    const { components, labels } = findConnectedComponents(mask);
    const selected = new Set<number>();

    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];

        if (box.x1 - box.x0 <= maxWidth && box.y1 - box.y0 <= maxHeight)
        {
            selected.add(index + 1);
        }
    }

    return createMaskFromComponents(labels, selected, mask.width, mask.height);
}

/**
 * Moves each tip's end to the far side of a fat marker that touches it: a range oval or a bar
 * drawn in color sits between the branch end and the label, and the label is measured from
 * where the marker ends.
 *
 * @param document - Document updated in place.
 * @param fat - Fat shapes.
 * @param thickness - Line thickness in pixels.
 * @param maxGap - Largest gap between the branch end and the shape that still counts.
 * @param labelReach - When given, a move is kept only when a text row begins within this many
 * pixels past the new end; shapes in any pale tint include stage bands and fills that no
 * label follows.
 * @param labelRise - How far above or below the tip, in pixels, that row's middle may lie.
 * @returns Number of tips moved.
 */
export function extendTipsThroughMarkers(document: ExtractionDocument, fat: Mask, thickness: number, maxGap: number, labelReach: number | null = null, labelRise = 0): number
{
    const { width, height, data } = fat;
    const half = Math.max(1, Math.round(thickness));
    let moved = 0;
    const absorbed = new Array<string>();

    function hasLabelBeyond(end: number, y: number): boolean
    {
        for (const line of document.textLines)
        {
            const center = (line.box.y0 + line.box.y1) / 2;

            if (line.glyphCount >= 2 && line.box.x0 >= end - 2 && line.box.x0 <= end + (labelReach as number) && Math.abs(center - y) <= Math.max(half, labelRise))
            {
                return true;
            }
        }

        return false;
    }

    for (const tip of document.tips)
    {
        const top = Math.max(0, Math.round(tip.y) - half);
        const bottom = Math.min(height - 1, Math.round(tip.y) + half);
        let end = -1;
        let gap = 0;

        for (let x = Math.round(tip.x); x < width; x++)
        {
            let marker = false;

            for (let y = top; y <= bottom && !marker; y++)
            {
                marker = data[y * width + x] === 1;
            }

            if (marker)
            {
                end = x;
                gap = 0;
            }
            else if (++gap > (end < 0 ? maxGap : 3))
            {
                break;
            }
        }

        if (end > tip.x + 2 && (labelReach === null || hasLabelBeyond(end + 1, Math.round(tip.y))))
        {
            tip.extendedFrom ??= tip.x;
            tip.x = end + 1;
            moved++;
        }
    }

    // A range bar traced as a segment of its own has a tip at its far end already, hung from
    // whatever its end touched (a stage boundary, say), and now the branch that ran into the
    // bar ends there too. The branch that started further left is the real one; the other goes.
    for (const tip of document.tips)
    {
        for (const other of document.tips)
        {
            if (other !== tip && Math.abs(other.x - tip.x) <= 2 * half + 2 && Math.abs(other.y - tip.y) <= half
                && (other.extendedFrom ?? other.x) > (tip.extendedFrom ?? tip.x) && !absorbed.includes(tip.id))
            {
                absorbed.push(other.id);
            }
        }
    }

    for (const id of absorbed)
    {
        deleteTip(document, id);
    }

    return moved;
}

/**
 * Finds filled discs the size of a node marker: a numbered circle drawn over a junction. Such a
 * disc is round, a glyph or three across, and mostly filled even with a digit knocked out of
 * it. Its halves beside the digit pass for glyphs and leave the line art, which cuts the
 * branches at the junction they cover.
 *
 * The digit's strokes are closed first, so the disc is solid, and the ink is then eroded by
 * the line thickness, so the branches vanish and the disc's core remains, to be measured and
 * grown back. An open ring around a junction is found by its outline instead. A disc is as wide as it is tall, to a tenth, and solid before the closing (half
 * its box inked at least, where a two-digit support value closed into a blob inks a third),
 * and lines enter it on at least two sides, which a label beside a branch has not.
 *
 * @param textInk - Dark pixels at the text threshold.
 * @param lineInk - Line ink, for the branches entering the disc.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @param tintInk - Everything that is not white, for pale solid discs; the text ink by default.
 * @param anyInk - All dark ink at the line threshold, lettering included, in which hairlines
 *   too gray for the text ink still show; the text ink by default.
 * @returns Bounding boxes of the discs.
 */
export function findNodeDiscs(textInk: Mask, lineInk: Mask, glyphHeight: number, thickness: number, tintInk: Mask = textInk, anyInk: Mask = textInk): Array<Box>
{
    const radius = Math.max(2, Math.round(thickness / 2) + 1);
    const discs = new Array<Box>();

    // Solid discs: dark ones in the text ink, half inked at least; then pale ones in everything
    // that is not white, which must be nearly solid, since the gray fringe of a thick mark
    // passes the looser test.
    // The last pass takes the ink as it is: a solid dot has no digit to close over, and beside
    // two verticals a few pixels apart the closing fuses them with the dot into one tall blob
    // (Wilson 2020).
    for (const [ink, minShare, closing] of [[textInk, 0.5, true], [tintInk, 0.7, true], [textInk, 0.8, false]] as Array<[Mask, number, boolean]>)
    {
        const closed = closing ? closeMask(ink, Math.max(2, Math.round(glyphHeight / 5))) : ink;
        const { components } = findConnectedComponents(erode(closed, radius));

        for (const component of components)
        {
            const coreWidth = component.box.x1 - component.box.x0;
            const coreHeight = component.box.y1 - component.box.y0;
            const width = coreWidth + 2 * radius;
            const height = coreHeight + 2 * radius;
            const size = Math.max(width, height);

            // A disc that carries a number is a glyph and a half across at least; a plain dot on
            // a junction is smaller, down to three line widths, below which it is the line's own
            // rounded corner (Manitkoon 2023's dots are 21 px on 5 px lines, under 1.5 glyphs).
            const smallest = Math.min(1.5 * glyphHeight, Math.max(3 * thickness, 0.9 * glyphHeight));
            // A small solid dot is coarse at its edge once eroded: eleven pixels across, its
            // core holds 70 of the 121 in its box, where a larger disc holds three quarters.
            const leastFill = closing ? 0.6 : 0.57;

            if (size < smallest || size > 3.5 * glyphHeight || Math.abs(width - height) > 0.1 * size + 1 || component.area < leastFill * coreWidth * coreHeight)
            {
                continue;
            }

            const box: Box = { x0: component.box.x0 - radius, y0: component.box.y0 - radius, x1: component.box.x1 + radius, y1: component.box.y1 + radius };

            // A dot that small must be solid: a round letter of small type is as wide and stands
            // between branches too, but it is hollow or open, where a disc fills about four
            // fifths of its box.
            const wanted = size < 1.5 * glyphHeight ? Math.max(minShare, 0.72) : minShare;

            // A dot let in by the looser fill must stand at a junction, with lines on three
            // sides: a dot that ends a tip's branch is as coarse, and a cross painted through
            // it would run the branch on (Ramirez-Velasco 2021).
            const sidesWanted = component.area < 0.6 * coreWidth * coreHeight ? 3 : 2;

            // A dot beside a label is sorted with the lettering, and the ends of its lines with
            // it, so the line ink shows nothing entering. In all the ink the lines are there:
            // the right side is left out, where the label stands, and what enters on two of
            // the other three is a node's branches (Fonseca 2024's numbered dots).
            const entered = Math.max(countSidesEntered(lineInk, box, thickness), countSidesEntered(anyInk, box, thickness, true));

            if (measureInkShare(ink, box) >= wanted && entered >= sidesWanted && !overlapsAny(discs, box))
            {
                discs.push(box);
            }
        }
    }

    // Rings: an open circle drawn around a junction, with a letter or a number inside. Its
    // outline joins the lines that enter it, so it is found by its hole: a white region that
    // touches no edge, a glyph to three across, round (a circle fills about four fifths of its
    // box, less the letters inside, a gap between branches all of it), with lines entering on
    // two sides. The least fill, 0.575, lets a ring with two wide letters through (Barker 2021's
    // "DE" ring fills 0.60, its "C" rings 0.58) and keeps out the numbered callout rings of
    // Alarcón-Muñoz 2023 (0.57), which sit beside the tree with arrows to the nodes; it is a
    // thin margin.
    const holes = findConnectedComponents(invertMask(textInk)).components;

    for (const hole of holes)
    {
        const width = hole.box.x1 - hole.box.x0;
        const height = hole.box.y1 - hole.box.y0;
        const size = Math.max(width, height);
        const share = hole.area / Math.max(1, width * height);
        const touchesEdge = hole.box.x0 === 0 || hole.box.y0 === 0 || hole.box.x1 === textInk.width || hole.box.y1 === textInk.height;

        if (touchesEdge || size < glyphHeight || size > 3 * glyphHeight || Math.abs(width - height) > 0.1 * size + 1 || share < 0.575 || share > 0.88)
        {
            continue;
        }

        const rim = Math.max(2, Math.round(thickness));
        const box: Box = { x0: hole.box.x0 - rim, y0: hole.box.y0 - rim, x1: hole.box.x1 + rim, y1: hole.box.y1 + rim };

        if (countSidesEntered(lineInk, box, thickness) >= 2 && !overlapsAny(discs, box))
        {
            discs.push(box);
        }
    }

    return discs;
}

/**
 * Whether a box overlaps any box of a list.
 *
 * @param boxes - Boxes.
 * @param box - The box.
 * @returns True on overlap.
 */
function overlapsAny(boxes: Array<Box>, box: Box): boolean
{
    for (const other of boxes)
    {
        if (other.x0 < box.x1 && other.x1 > box.x0 && other.y0 < box.y1 && other.y1 > box.y0)
        {
            return true;
        }
    }

    return false;
}

/**
 * Share of a box's pixels that are inked.
 *
 * @param mask - Mask.
 * @param box - The box.
 * @returns A share from 0 to 1.
 */
export function measureInkShare(mask: Mask, box: Box): number
{
    const { width, height, data } = mask;
    let count = 0;
    let area = 0;

    for (let y = Math.max(0, box.y0); y < Math.min(height, box.y1); y++)
    {
        for (let x = Math.max(0, box.x0); x < Math.min(width, box.x1); x++)
        {
            count += data[y * width + x];
            area++;
        }
    }

    return area === 0 ? 0 : count / area;
}

/**
 * Counts the sides of a box that line ink enters: a side counts when the band just outside
 * it holds at least a line's thickness of ink.
 *
 * @param lineInk - Line ink.
 * @param box - The box.
 * @param thickness - Line thickness in pixels.
 * @param leaveRight - Whether to leave the right side out, where a label may stand.
 * @returns Sides entered, 0 to 4.
 */
function countSidesEntered(lineInk: Mask, box: Box, thickness: number, leaveRight = false): number
{
    const { width, height, data } = lineInk;
    const band = 3;
    const needed = Math.max(2, Math.round(0.6 * thickness * band));

    function countInk(x0: number, y0: number, x1: number, y1: number): number
    {
        let count = 0;

        for (let y = Math.max(0, y0); y < Math.min(height, y1); y++)
        {
            for (let x = Math.max(0, x0); x < Math.min(width, x1); x++)
            {
                count += data[y * width + x];
            }
        }

        return count;
    }

    let sides = 0;
    sides += countInk(box.x0 - band, box.y0, box.x0, box.y1) >= needed ? 1 : 0;
    sides += !leaveRight && countInk(box.x1, box.y0, box.x1 + band, box.y1) >= needed ? 1 : 0;
    sides += countInk(box.x0, box.y0 - band, box.x1, box.y0) >= needed ? 1 : 0;
    sides += countInk(box.x0, box.y1, box.x1, box.y1 + band) >= needed ? 1 : 0;

    return sides;
}

/**
 * Replaces each disc by a cross of line thickness, so that the branches meeting under it run
 * on through as lines: the disc itself is cleared, since a run through a solid disc is too
 * thick to pass for a line, and the horizontal arm then spans the disc's width and the
 * vertical its height.
 *
 * @param lineArt - Mask painted in place.
 * @param discs - Disc boxes.
 * @param thickness - Line thickness in pixels.
 * @param largeDisc - Size from which a disc's arriving lines are carried on to the cross.
 */
export function paintCrosses(lineArt: Mask, discs: Array<Box>, thickness: number, largeDisc = Infinity): void
{
    const half = Math.max(1, Math.round(thickness / 2));

    for (const disc of discs)
    {
        const centerX = Math.round((disc.x0 + disc.x1) / 2);
        const centerY = Math.round((disc.y0 + disc.y1) / 2);

        for (let y = Math.max(0, disc.y0); y < Math.min(lineArt.height, disc.y1); y++)
        {
            for (let x = Math.max(0, disc.x0); x < Math.min(lineArt.width, disc.x1); x++)
            {
                lineArt.data[y * lineArt.width + x] = 0;
            }
        }

        for (let y = Math.max(0, centerY - half); y < Math.min(lineArt.height, centerY + half); y++)
        {
            for (let x = Math.max(0, disc.x0); x < Math.min(lineArt.width, disc.x1); x++)
            {
                lineArt.data[y * lineArt.width + x] = 1;
            }
        }

        for (let y = Math.max(0, disc.y0); y < Math.min(lineArt.height, disc.y1); y++)
        {
            for (let x = Math.max(0, centerX - half); x < Math.min(lineArt.width, centerX + half); x++)
            {
                lineArt.data[y * lineArt.width + x] = 1;
            }
        }

        // A line need not make for the middle of the disc: a vertical that passes beside it,
        // touching, or ends against its rim, was cleared with it and lies off the cross's
        // arm. Each line that arrives at an edge is carried on to the arm it would meet
        // (Rauhut 2012, a disc set on the step between two verticals).
        // Only for a disc clearly larger than a letter: a smaller one is as often a blot of
        // lettering against a line, whose own strokes would be carried in (Fonseca 2024).
        if (Math.min(disc.x1 - disc.x0, disc.y1 - disc.y0) >= largeDisc)
        {
            carryLinesIn(lineArt, disc, centerX, centerY, thickness, true);
            carryLinesIn(lineArt, disc, centerX, centerY, thickness, false);
        }
    }
}

/**
 * Where a line ends beside a box, coming from one side.
 */
type LineEnd = {
    /**
     * Column of the end, or of the line for one from above or below.
     */
    x: number;

    /**
     * Row of the end, or of the line for one from the left or right.
     */
    y: number;
};

/**
 * Finds the line that ends against one side of a box: a run of ink of some length, leading
 * straight away from that side, that stops within reach of it.
 *
 * @param ink - Line ink.
 * @param box - The box.
 * @param side - Which side.
 * @param reach - How far from the side the line may stop.
 * @param least - Shortest run that is a line.
 * @returns The end, or null.
 */
function findLineEndAt(ink: Mask, box: Box, side: "left" | "right" | "top" | "bottom", reach: number, least: number): LineEnd | null
{
    const { width, height, data } = ink;
    const upright = side === "top" || side === "bottom";
    const step = side === "left" || side === "top" ? -1 : 1;
    // Only lines that make for the box itself: one that runs along its edge is a neighbor's.
    const from = upright ? box.x0 + 1 : box.y0 + 1;
    const to = upright ? box.x1 - 1 : box.y1 - 1;
    // The line may run on into the box, under a mark set on it, so its end is looked for
    // from the middle of the box outward.
    const edge = upright ? Math.round((box.y0 + box.y1) / 2) : Math.round((box.x0 + box.x1) / 2);
    const span = (upright ? box.y1 - box.y0 : box.x1 - box.x0) / 2 + reach;
    let best: LineEnd | null = null;
    let longest = 0;

    function isInk(across: number, along: number): boolean
    {
        const x = upright ? across : along;
        const y = upright ? along : across;

        return x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;
    }

    for (let across = from; across < to; across++)
    {
        let start = -1;

        for (let offset = 0; offset <= span && start < 0; offset++)
        {
            if (isInk(across, edge + step * offset))
            {
                start = edge + step * offset;
            }
        }

        if (start < 0)
        {
            continue;
        }

        let length = 0;

        while (length <= 4 * least && isInk(across, start + step * length))
        {
            length++;
        }

        if (length >= least && length > longest)
        {
            longest = length;
            best = upright ? { x: across, y: start } : { x: start, y: across };
        }
    }

    return best;
}

/**
 * Joins the lines that end around a number set in a junction. A support value printed on a
 * node, in a gap left in the lines for it, takes the node out of the line art: the branch
 * that arrives stops before the number and the node's vertical is cut above and below it
 * (Hwang 2004, whose tree came out in eight pieces). Where lines end against two or more
 * sides of a small row of text, they are drawn on to where they meet.
 *
 * @param lineArt - Mask painted in place.
 * @param ink - Line ink in which the ends are looked for.
 * @param boxes - Boxes of the small rows.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @returns How many junctions were joined.
 */
export function joinThroughNumbers(lineArt: Mask, ink: Mask, boxes: Array<Box>, glyphHeight: number, thickness: number): number
{
    const reach = Math.max(3, Math.round(glyphHeight / 3));
    const half = Math.max(1, Math.round(thickness / 2));

    // The step to such a node can be short; what is looked for is line ink, which lettering
    // is not, so half a glyph of it is a line.
    const least = Math.max(3 * Math.round(thickness), Math.round(glyphHeight / 2));
    let joined = 0;

    function paint(x0: number, y0: number, x1: number, y1: number): void
    {
        for (let y = Math.max(0, Math.min(y0, y1) - half + 1); y < Math.min(lineArt.height, Math.max(y0, y1) + half); y++)
        {
            for (let x = Math.max(0, Math.min(x0, x1) - half + 1); x < Math.min(lineArt.width, Math.max(x0, x1) + half); x++)
            {
                lineArt.data[y * lineArt.width + x] = 1;
            }
        }
    }

    for (const box of boxes)
    {
        const left = findLineEndAt(ink, box, "left", reach, least);
        const right = findLineEndAt(ink, box, "right", reach, least);
        const top = findLineEndAt(ink, box, "top", reach, least);
        const bottom = findLineEndAt(ink, box, "bottom", reach, least);
        const level = left ?? right;
        const standing = top ?? bottom;
        const ends = (left === null ? 0 : 1) + (right === null ? 0 : 1) + (top === null ? 0 : 1) + (bottom === null ? 0 : 1);

        // One line that stops at a number is a tip's branch at a label. Two that face each
        // other, or meet at a corner, were one junction.
        if (ends < 2)
        {
            continue;
        }

        // A vertical cut in two stands in one column, and a branch cut in two on one row.
        if ((top !== null && bottom !== null && Math.abs(top.x - bottom.x) > thickness + 1) || (left !== null && right !== null && Math.abs(left.y - right.y) > thickness + 1))
        {
            continue;
        }

        const x = standing === null ? Math.round((box.x0 + box.x1) / 2) : standing.x;
        const y = level === null ? Math.round((box.y0 + box.y1) / 2) : level.y;

        // The lines meet under the number. A value printed beside a node has the node's lines
        // pass it by, and where they would meet lies outside its box (Fonseca 2024).
        if (x < box.x0 || x >= box.x1 || y < box.y0 || y >= box.y1)
        {
            continue;
        }

        if (left !== null)
        {
            paint(left.x, y, x, y);
        }

        if (right !== null)
        {
            paint(x, y, right.x, y);
        }

        if (top !== null)
        {
            paint(x, top.y, x, y);
        }

        if (bottom !== null)
        {
            paint(x, y, x, bottom.y);
        }

        joined++;
    }

    return joined;
}

/**
 * Carries the lines that arrive at two facing edges of a cleared disc on to the middle: those
 * at its top and bottom edges down or up to the row of the cross's horizontal arm, or those
 * at its left and right edges across to the column of its vertical arm.
 *
 * @param lineArt - Mask painted in place.
 * @param disc - Box of the disc.
 * @param centerX - Column of the cross's vertical arm.
 * @param centerY - Row of its horizontal arm.
 * @param thickness - Line thickness in pixels.
 * @param upright - Whether the lines at the top and bottom edges are meant; otherwise those
 *   at the left and right.
 */
function carryLinesIn(lineArt: Mask, disc: Box, centerX: number, centerY: number, thickness: number, upright: boolean): void
{
    const { width, height, data } = lineArt;
    const reach = Math.max(2, Math.round(thickness));
    const widest = 2 * Math.round(thickness) + 2;
    const from = upright ? disc.x0 : disc.y0;
    const to = upright ? disc.x1 : disc.y1;

    // Whether a line stands beyond the edge at one position along it.
    function arrives(position: number, before: boolean): boolean
    {
        for (const step of [1, reach])
        {
            const x = upright ? position : (before ? disc.x0 - step : disc.x1 - 1 + step);
            const y = upright ? (before ? disc.y0 - step : disc.y1 - 1 + step) : position;

            if (x < 0 || y < 0 || x >= width || y >= height || data[y * width + x] !== 1)
            {
                return false;
            }
        }

        return true;
    }

    for (const before of [true, false])
    {
        let start = -1;

        for (let position = from; position <= to; position++)
        {
            const on = position < to && arrives(position, before);

            if (on && start < 0)
            {
                start = position;
            }
            else if (!on && start >= 0)
            {
                // A line, not the side of a box or a band the disc stands against.
                if (position - start <= widest)
                {
                    for (let along = start; along < position; along++)
                    {
                        const first = upright ? (before ? disc.y0 : centerY) : (before ? disc.x0 : centerX);
                        const last = upright ? (before ? centerY : disc.y1 - 1) : (before ? centerX : disc.x1 - 1);

                        for (let across = first; across <= last; across++)
                        {
                            data[(upright ? across : along) * width + (upright ? along : across)] = 1;
                        }
                    }
                }

                start = -1;
            }
        }
    }
}

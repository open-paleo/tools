/**
 * Extracts straight horizontal and vertical segments from a line-art mask. Each direction is
 * taken as the connected components of the mask of long runs in that direction only.
 */

import type { Box, Mask, Segment } from "./types.ts";
import { createDirectionalRunMask, findConnectedComponents } from "./raster.ts";

/**
 * The segments found in a mask.
 */
export type SegmentSet = {
    /**
     * Horizontal segments (branches).
     */
    horizontals: Array<Segment>;

    /**
     * Vertical segments (node connectors).
     */
    verticals: Array<Segment>;

    /**
     * Collinear pairs joined across a gap with ink in it.
     */
    bridgedGaps: number;
};

/**
 * Collinear merge output.
 */
type MergeResult = {
    /**
     * Merged boxes.
     */
    boxes: Array<Box>;

    /**
     * Pairs joined across a positive gap.
     */
    bridged: number;
};

/**
 * Measures, column by column, the ink that is one with a horizontal run: its own rows and
 * whatever joins them without a break, within a window. Letters printed just above a branch,
 * clear of it, are not part of its thickness; counted, they cut the branch for the width of
 * the name (Fonseca 2024's "Marginocephalia", set on its own stem).
 *
 * @param ink - All ink.
 * @param box - Box of the run.
 * @param window - How far above and below the run to follow joined ink.
 * @returns Joined ink height in each column of the box.
 */
function measureJoinedHeights(ink: Mask, box: Box, window: number): Array<number>
{
    const heights = new Array<number>();
    const top = Math.max(0, box.y0 - window);
    const bottom = Math.min(ink.height, box.y1 + window);

    for (let x = box.x0; x < box.x1; x++)
    {
        let first = -1;
        let last = -1;

        for (let y = box.y0; y < box.y1; y++)
        {
            if (ink.data[y * ink.width + x] === 1)
            {
                first = first < 0 ? y : first;
                last = y;
            }
        }

        if (first < 0)
        {
            heights.push(0);
            continue;
        }

        while (first > top && ink.data[(first - 1) * ink.width + x] === 1)
        {
            first--;
        }

        while (last + 1 < bottom && ink.data[(last + 1) * ink.width + x] === 1)
        {
            last++;
        }

        heights.push(last - first + 1);
    }

    return heights;
}

/**
 * Measures, for each column of a component, how tall the dark ink is through that column.
 *
 * @param ink - All dark pixels of the image.
 * @param box - Component box in the run mask.
 * @param window - How far above and below the box to look.
 * @returns Ink height per column.
 */
function measureColumnHeights(ink: Mask, box: Box, window: number): Array<number>
{
    const heights = new Array<number>();
    const top = Math.max(0, box.y0 - window);
    const bottom = Math.min(ink.height, box.y1 + window);

    for (let x = box.x0; x < box.x1; x++)
    {
        let count = 0;

        for (let y = top; y < bottom; y++)
        {
            count += ink.data[y * ink.width + x];
        }

        heights.push(count);
    }

    return heights;
}

/**
 * Splits a horizontal component into stretches of line and stretches of something taller, and
 * keeps the line. A stretch counts as taller once three columns running exceed the limit. A
 * label touching its branch, or the run of touching letters inside a bold word, is glyph-high
 * and uneven; a range bar is taller than the line but even, and is kept as line.
 *
 * @param heights - Ink height per column of the component.
 * @param box - Component box.
 * @param limit - Ink height above which a column is not line.
 * @param minRun - Shortest piece worth keeping.
 * @returns Pieces of the component that are line.
 */
function findLinePieces(heights: Array<number>, box: Box, limit: number, minRun: number): Array<Box>
{
    const pieces = new Array<Box>();
    let start = 0;
    let thickState = heights.length > 0 && heights[0] > limit;
    let streak = 0;

    for (let index = 1; index <= heights.length; index++)
    {
        const thick = index < heights.length && heights[index] > limit;

        if (index < heights.length && thick === thickState)
        {
            streak = 0;
            continue;
        }

        streak++;

        if (index < heights.length && streak < 3)
        {
            continue;
        }

        const end = index < heights.length ? index - streak + 1 : index;
        keepIfLine(heights, box, start, end, thickState, minRun, pieces);
        start = end;
        thickState = thick;
        streak = 0;
    }

    return pieces;
}

/**
 * Appends a stretch to the pieces when it is line: thin and long enough, or thick but even.
 *
 * @param heights - Ink height per column of the component.
 * @param box - Component box.
 * @param start - First column of the stretch.
 * @param end - Column after the stretch.
 * @param thick - Whether the stretch is above the limit.
 * @param minRun - Shortest thin piece worth keeping.
 * @param pieces - Receives the piece.
 */
function keepIfLine(heights: Array<number>, box: Box, start: number, end: number, thick: boolean, minRun: number, pieces: Array<Box>): void
{
    if (end - start < 1)
    {
        return;
    }

    if (thick)
    {
        let lowest = Infinity;
        let highest = 0;

        for (let index = start; index < end; index++)
        {
            lowest = Math.min(lowest, heights[index]);
            highest = Math.max(highest, heights[index]);
        }

        if (highest - lowest > 2)
        {
            return;
        }
    }
    else if (end - start < minRun)
    {
        return;
    }

    pieces.push({ x0: box.x0 + start, y0: box.y0, x1: box.x0 + end, y1: box.y1 });
}

/**
 * Whether a line runs unbroken on a horizontal piece's rows across a text row and a little
 * past it on both sides: line ink in nearly every column.
 *
 * @param lineArt - Line ink, without glyphs.
 * @param box - Horizontal piece, which gives the rows.
 * @param row - Text row.
 * @param beyond - How far past the row on each side the line must run.
 * @returns True when the line passes under the row.
 */
function hasLineAcross(lineArt: Mask, box: Box, row: Box, beyond: number): boolean
{
    const x0 = Math.max(0, row.x0 - beyond);
    const x1 = Math.min(lineArt.width, row.x1 + beyond);
    let filled = 0;

    for (let x = x0; x < x1; x++)
    {
        let inked = 0;

        for (let y = box.y0; y < box.y1; y++)
        {
            inked += lineArt.data[y * lineArt.width + x];
        }

        if (inked >= 1)
        {
            filled++;
        }
    }

    return x1 > x0 && filled >= 0.95 * (x1 - x0);
}

/**
 * Removes from a horizontal piece every stretch that lies under a text row, keeping the parts
 * outside. A label that touches its branch continues the branch's ink; this is where it stops.
 *
 * @param box - Horizontal piece.
 * @param textRows - Boxes of text rows.
 * @param minRun - Shortest part worth keeping.
 * @param lineArt - Line ink, without glyphs.
 * @param reachRows - For each text row, the box of its letters widened by a glyph; a piece
 *   in the row's margin that starts or ends beyond it reaches the row from outside.
 * @returns Parts of the piece outside every text row.
 */
function clipToTextRows(box: Box, textRows: Array<Box>, minRun: number, lineArt: Mask, reachRows: Array<Box> | null): Array<Box>
{
    const height = box.y1 - box.y0;
    const blocked = new Array<Box>();

    for (let index = 0; index < textRows.length; index++)
    {
        const row = textRows[index];
        const reach = reachRows === null ? row : reachRows[index];
        const overlap = Math.min(row.y1, box.y1) - Math.max(row.y0, box.y0);

        // A line that runs on unbroken along the edge of the row, and past it on both sides,
        // is a branch with a name printed just above or below it, not a label continuing its
        // branch's ink, and is left whole (Fonseca 2024's "Marginocephalia" sits on its own
        // stem). A name set in the line, level with it, is where the branch stops (the same
        // figure's "Cerapoda", before its connector).
        // The rows come widened by two pixels above and below; a line whose middle lies in
        // that margin runs along the edge of the text, under or over it, not through it.
        const middle = (box.y0 + box.y1) / 2;
        const alongEdge = middle > row.y1 - 2 || middle < row.y0 + 2;

        // Or it reaches the row from outside its letters, starting a glyph before the first or
        // ending a glyph after the last: the branch above a label that stands a pixel or two
        // under it (Alarcon-Munoz 2023's Rhinorex). A stroke lying within the letters' width
        // is part of the text, an underline or a serif.
        // A pixel or two of grace: a piece is cut where it leaves the vertical it starts at.
        const fromOutside = box.x0 <= reach.x0 + 2 || box.x1 >= reach.x1 - 2;

        if (overlap >= 0.5 * height && row.x1 > box.x0 && row.x0 < box.x1 && !(alongEdge && (fromOutside || hasLineAcross(lineArt, box, row, minRun))))
        {
            blocked.push(row);
        }
    }

    if (blocked.length === 0)
    {
        return [box];
    }

    blocked.sort(compareLeftEdges);
    const parts = new Array<Box>();
    let cursor = box.x0;

    for (const row of blocked)
    {
        const start = Math.max(box.x0, row.x0);

        if (start - cursor >= minRun)
        {
            parts.push({ x0: cursor, y0: box.y0, x1: start, y1: box.y1 });
        }

        cursor = Math.max(cursor, Math.min(box.x1, row.x1));
    }

    if (box.x1 - cursor >= minRun)
    {
        parts.push({ x0: cursor, y0: box.y0, x1: box.x1, y1: box.y1 });
    }

    return parts;
}

/**
 * Orders boxes by left edge.
 *
 * @param left - First box.
 * @param right - Second box.
 * @returns Negative when the first is further left.
 */
function compareLeftEdges(left: Box, right: Box): number
{
    return left.x0 - right.x0;
}

/**
 * Orders boxes by top edge.
 *
 * @param left - First box.
 * @param right - Second box.
 * @returns Negative when the first is higher.
 */
function compareTopEdges(left: Box, right: Box): number
{
    return left.y0 - right.y0;
}

/**
 * Whether dark pixels fill most of the gap between two collinear boxes, within a window across
 * the line. A label box that cut a branch leaves its glyphs along the whole gap; a line
 * crossing the gap, or nothing at all, means the two pieces were never one line.
 *
 * @param ink - All dark pixels of the image.
 * @param first - The earlier box along the axis.
 * @param second - The later box.
 * @param alongX - Whether the boxes run along x.
 * @param window - Extra rows (or columns) to include on each side of the boxes.
 * @param share - Share of the gap's columns (or rows) that must hold ink.
 * @returns True when enough of the gap holds ink.
 */
function hasInkBetween(ink: Mask, first: Box, second: Box, alongX: boolean, window: number, share: number): boolean
{
    const x0 = alongX ? first.x1 : Math.max(0, Math.min(first.x0, second.x0) - window);
    const x1 = alongX ? second.x0 : Math.min(ink.width, Math.max(first.x1, second.x1) + window);
    const y0 = alongX ? Math.max(0, Math.min(first.y0, second.y0) - window) : first.y1;
    const y1 = alongX ? Math.min(ink.height, Math.max(first.y1, second.y1) + window) : second.y0;
    const steps = alongX ? x1 - x0 : y1 - y0;
    let inked = 0;

    for (let step = 0; step < steps; step++)
    {
        let found = false;

        if (alongX)
        {
            for (let y = y0; y < y1 && !found; y++)
            {
                found = ink.data[y * ink.width + x0 + step] === 1;
            }
        }
        else
        {
            for (let x = x0; x < x1 && !found; x++)
            {
                found = ink.data[(y0 + step) * ink.width + x] === 1;
            }
        }

        if (found)
        {
            inked++;
        }
    }

    return steps > 0 && inked >= share * steps;
}

/**
 * Joins collinear segments separated by a small gap, such as a branch cut by the white
 * background box of a support label. Two segments join when their cross-axis extents overlap
 * by at least half of the thinner one and the along-axis gap is at most maxGap.
 *
 * Something must have cut the line: when the ink is given, a gap with no ink in it is a real
 * gap, such as the space between a node's parent branch and the branch of a child two steps
 * to the right in a staircase layout.
 *
 * @param boxes - Segment boxes of one orientation.
 * @param alongX - Whether the segments run along x (horizontal).
 * @param maxGap - Largest gap to bridge, in pixels.
 * @param ink - All dark pixels of the image, or null to bridge any gap.
 * @param window - How far across the line to look for the ink that cut it.
 * @param gapInkShare - Share of a gap that must hold ink for the pieces to join.
 * @param letterRows - Boxes of the rows' letters alone, inside which a vertical is a letter's
 *   stroke and is dropped; the text rows serve when these are not given.
 * @param reachRows - For each text row, the box of its letters widened by a glyph.
 * @returns Merged boxes and the number of gaps bridged.
 */
function mergeCollinearBoxes(boxes: Array<Box>, alongX: boolean, maxGap: number, ink: Mask | null, window: number, gapInkShare: number): MergeResult
{
    const merged = new Array<Box>();
    let bridged = 0;

    for (const box of boxes)
    {
        merged.push({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 });
    }

    let changed = true;

    while (changed)
    {
        changed = false;
        merged.sort(alongX ? compareLeftEdges : compareTopEdges);

        for (let index = 0; index < merged.length && !changed; index++)
        {
            const first = merged[index];

            for (let other = index + 1; other < merged.length; other++)
            {
                const second = merged[other];
                const gap = alongX ? second.x0 - first.x1 : second.y0 - first.y1;

                if (gap > maxGap)
                {
                    break;
                }

                const overlap = alongX
                    ? Math.min(first.y1, second.y1) - Math.max(first.y0, second.y0)
                    : Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
                const thinner = alongX
                    ? Math.min(first.y1 - first.y0, second.y1 - second.y0)
                    : Math.min(first.x1 - first.x0, second.x1 - second.x0);

                if (overlap >= 0.5 * thinner && (ink === null || gap <= 0 || hasInkBetween(ink, first, second, alongX, window, gapInkShare)))
                {
                    if (gap > 0)
                    {
                        bridged++;
                    }

                    first.x0 = Math.min(first.x0, second.x0);
                    first.y0 = Math.min(first.y0, second.y0);
                    first.x1 = Math.max(first.x1, second.x1);
                    first.y1 = Math.max(first.y1, second.y1);
                    merged.splice(other, 1);
                    changed = true;
                    break;
                }
            }
        }
    }

    return { boxes: merged, bridged };
}

/**
 * Joins the two pieces of a vertical cut by a text row printed across it: a clade's name set
 * on its own stem takes the line out of the line art for the height of the row, and the piece
 * below, with everything hanging from it, is left without a parent (Prieto-Marquez 2012's
 * AVIALAE, which detached half the tree). The pieces must be collinear, the gap between them
 * must lie within one row that crosses the line, and both ends at the gap must be loose: no
 * horizontal meets them. Two verticals of different nodes that share a column, with a label
 * lying between them, each end at a branch.
 *
 * @param boxes - Vertical boxes, changed in place.
 * @param textRows - Boxes of text rows.
 * @param horizontals - Horizontal boxes.
 * @returns How many pairs were joined.
 */
function joinVerticalsAcrossText(boxes: Array<Box>, textRows: Array<Box>, horizontals: Array<Box>): number
{
    if (textRows.length === 0)
    {
        return 0;
    }

    boxes.sort(compareTopEdges);
    const uppers = new Array<Box>();
    const lowers = new Array<Box>();

    for (let index = 0; index < boxes.length; index++)
    {
        const first = boxes[index];

        for (let other = index + 1; other < boxes.length; other++)
        {
            const second = boxes[other];
            const gap = second.y0 - first.y1;
            const overlap = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
            const thinner = Math.min(first.x1 - first.x0, second.x1 - second.x0);

            if (gap > 0 && overlap >= 0.5 * thinner && isGapInsideRow(first, second, textRows) && !hasBranchAtEnd(first, first.y1, horizontals) && !hasBranchAtEnd(second, second.y0, horizontals))
            {
                uppers.push(first);
                lowers.push(second);
            }
        }
    }

    // A column cut by labels in several places is a rule drawn across the labels, a boundary
    // or a bracket, and not a branch with a name on it; only a column cut once is mended.
    let joined = 0;

    for (let index = 0; index < uppers.length; index++)
    {
        let cuts = 0;

        for (let other = 0; other < uppers.length; other++)
        {
            if (Math.min(uppers[index].x1, uppers[other].x1) > Math.max(uppers[index].x0, uppers[other].x0))
            {
                cuts++;
            }
        }

        if (cuts === 1)
        {
            uppers[index].x0 = Math.min(uppers[index].x0, lowers[index].x0);
            uppers[index].x1 = Math.max(uppers[index].x1, lowers[index].x1);
            uppers[index].y1 = lowers[index].y1;
            boxes.splice(boxes.indexOf(lowers[index]), 1);
            joined++;
        }
    }

    return joined;
}

/**
 * Whether a horizontal meets a vertical at one of its ends.
 *
 * @param vertical - Vertical box.
 * @param endY - The end to look at: the box's top or bottom.
 * @param horizontals - Horizontal boxes.
 * @returns True when a branch arrives at or leaves from that end.
 */
function hasBranchAtEnd(vertical: Box, endY: number, horizontals: Array<Box>): boolean
{
    const reach = 2 * (vertical.x1 - vertical.x0) + 2;

    for (const horizontal of horizontals)
    {
        const touchesColumn = horizontal.x0 <= vertical.x1 + reach && horizontal.x1 >= vertical.x0 - reach;

        if (touchesColumn && horizontal.y0 <= endY + reach && horizontal.y1 >= endY - reach)
        {
            return true;
        }
    }

    return false;
}

/**
 * Whether the gap between two collinear vertical boxes lies within one text row that crosses
 * their line.
 *
 * @param first - Upper box.
 * @param second - Lower box.
 * @param textRows - Boxes of text rows.
 * @returns True when a row accounts for the gap.
 */
function isGapInsideRow(first: Box, second: Box, textRows: Array<Box>): boolean
{
    const x = (Math.max(first.x0, second.x0) + Math.min(first.x1, second.x1)) / 2;

    for (const row of textRows)
    {
        // The line art stops a few pixels short of the letters on each side.
        const slack = Math.max(3, Math.round(0.4 * (row.y1 - row.y0)));

        if (row.x0 <= x && row.x1 >= x && first.y1 >= row.y0 - slack && second.y0 <= row.y1 + slack)
        {
            return true;
        }
    }

    return false;
}

/**
 * Tells whether a box lies entirely inside any of a set of boxes.
 *
 * @param box - Box to test.
 * @param containers - Candidate containing boxes.
 * @returns True when some container holds the box.
 */
function isInsideAny(box: Box, containers: Array<Box>): boolean
{
    for (const container of containers)
    {
        if (box.x0 >= container.x0 && box.x1 <= container.x1 && box.y0 >= container.y0 && box.y1 <= container.y1)
        {
            return true;
        }
    }

    return false;
}

/**
 * Extracts horizontal and vertical segments from a line-art mask. Each direction is taken from
 * a mask of long runs in that direction only, so a thick horizontal cannot masquerade as a short
 * vertical and a vertical cannot be swallowed by the horizontal it crosses. Broken pieces of one
 * line on neighboring rows join through connectivity, and stretches where the ink is glyph-high
 * are cut away. Verticals must be at least twice as tall as they are wide.
 *
 * @param lineArt - Mask of line-art pixels (glyphs already removed).
 * @param minHorizontalRun - Shortest horizontal run that counts as a branch.
 * @param minVerticalRun - Shortest vertical run that counts as a connector.
 * @param maxGap - Largest gap bridged between collinear pieces of one horizontal.
 * @param maxVerticalGap - Largest gap bridged between collinear pieces of one vertical; kept
 * small because nodes at the same depth stack vertically.
 * @param ink - All dark pixels, used to cut text off branches by its height; null to skip.
 * @param window - How far above and below a run to look for ink when measuring height.
 * @param textRows - Boxes of text rows; horizontals are clipped out of them and verticals inside
 * them are dropped.
 * @returns The segments found.
 */
export function extractSegments(
    lineArt: Mask,
    minHorizontalRun: number,
    minVerticalRun: number,
    maxGap = 0,
    maxVerticalGap = maxGap,
    ink: Mask | null = null,
    window = 0,
    textRows: Array<Box> = [],
    gapInkShare = 0.4,
    letterRows: Array<Box> | null = null,
    reachRows: Array<Box> | null = null,
): SegmentSet
{
    const horizontalMask = createDirectionalRunMask(lineArt, minHorizontalRun, true);
    const components = findConnectedComponents(horizontalMask).components;
    let pieces = new Array<Box>();

    if (ink === null)
    {
        for (const component of components)
        {
            pieces.push(component.box);
        }
    }
    else
    {
        const heightsByComponent = new Array<Array<number>>();
        const allHeights = new Array<number>();

        for (const component of components)
        {
            const heights = measureColumnHeights(ink, component.box, window);
            heightsByComponent.push(heights);

            for (const height of heights)
            {
                if (height > 0)
                {
                    allHeights.push(height);
                }
            }
        }

        allHeights.sort(compareNumbers);
        const lineWidth = allHeights[Math.floor(allHeights.length / 2)] ?? 1;
        const limit = Math.max(2.5 * lineWidth + 1, lineWidth + 5);

        for (let index = 0; index < components.length; index++)
        {
            // The figure's line width is taken from all the ink around each run, as it always
            // was; where a run is cut for being too thick, only ink joined to it counts.
            pieces.push(...findLinePieces(measureJoinedHeights(ink, components[index].box, window), components[index].box, limit, minHorizontalRun));
        }
    }

    const clipped = new Array<Box>();

    // A range bar clipped at its label can be short and thick, so a horizontal need only be at
    // least as long as it is thick; text has already been cut away.
    for (const piece of pieces)
    {
        for (const part of clipToTextRows(piece, textRows, minHorizontalRun, lineArt, reachRows))
        {
            if (part.x1 - part.x0 >= part.y1 - part.y0)
            {
                clipped.push(part);
            }
        }
    }

    pieces = clipped;
    const verticalBoxes = new Array<Box>();

    for (const component of findConnectedComponents(createDirectionalRunMask(lineArt, minVerticalRun, false)).components)
    {
        const box = component.box;

        if (box.y1 - box.y0 >= 2 * (box.x1 - box.x0) && !isInsideAny(box, letterRows ?? textRows))
        {
            verticalBoxes.push(box);
        }
    }

    const horizontals = new Array<Segment>();
    const verticals = new Array<Segment>();

    const mergedHorizontals = mergeCollinearBoxes(pieces, true, maxGap, ink, Math.round(window / 2), gapInkShare);
    const mergedVerticals = mergeCollinearBoxes(verticalBoxes, false, maxVerticalGap, ink, Math.round(window / 2), gapInkShare);
    mergedVerticals.bridged += joinVerticalsAcrossText(mergedVerticals.boxes, textRows, mergedHorizontals.boxes);

    for (const box of mergedHorizontals.boxes)
    {
        horizontals.push({ id: `h${horizontals.length + 1}`, orientation: "horizontal", box });
    }

    for (const box of mergedVerticals.boxes)
    {
        verticals.push({ id: `v${verticals.length + 1}`, orientation: "vertical", box });
    }

    return { horizontals, verticals, bridgedGaps: mergedHorizontals.bridged + mergedVerticals.bridged };
}

/**
 * Orders numbers ascending.
 *
 * @param left - First number.
 * @param right - Second number.
 * @returns Their difference.
 */
function compareNumbers(left: number, right: number): number
{
    return left - right;
}

/**
 * Starts a branch at the corner it turns, where it had been run on to a vertical standing
 * just behind. In a tightly drawn pectinate tree a node's vertical can stand a few pixels
 * left of its child node's vertical, the two side by side. The child's top branch begins at
 * the child's corner, but closing the line ink bridges the few pixels between that corner and
 * the vertical behind it, and the branch then reads as the parent's own: a polytomy where the
 * figure has two nodes (Alarcon-Munoz 2023, Gonkoken beside Eotrachodon). A horizontal that
 * begins at one vertical and passes the end of another within three line widths begins at
 * the second.
 *
 * @param horizontals - Horizontal segments, trimmed in place.
 * @param verticals - Vertical segments.
 * @param thickness - Line thickness.
 * @param shortest - Shortest run past the corner for the horizontal to be a branch.
 * @returns How many horizontals were trimmed.
 */
export function trimBranchesAtCorners(horizontals: Array<Segment>, verticals: Array<Segment>, thickness: number, shortest: number): number
{
    const near = Math.round(thickness) + 1;
    const farthest = Math.max(6, 3 * thickness);
    let trimmed = 0;

    for (const horizontal of horizontals)
    {
        const { box } = horizontal;
        const y = (box.y0 + box.y1) / 2;
        let behind = false;
        let corner: Segment | null = null;

        for (const vertical of verticals)
        {
            const spans = y >= vertical.box.y0 - near && y <= vertical.box.y1 + near;

            if (spans && Math.abs(vertical.box.x1 - box.x0) <= near + 1)
            {
                behind = true;
            }

            const gap = vertical.box.x0 - box.x0;
            const atEnd = Math.abs(y - vertical.box.y0) <= near || Math.abs(y - vertical.box.y1) <= near;

            // The corner's vertical begins after the branch does and is not the one behind.
            if (gap >= 1 && vertical.box.x1 - box.x0 > near + 1 && gap <= farthest && atEnd && box.x1 - vertical.box.x1 >= shortest && (corner === null || vertical.box.x0 < corner.box.x0))
            {
                corner = vertical;
            }
        }

        if (behind && corner !== null)
        {
            box.x0 = corner.box.x0;
            trimmed++;
        }
    }

    return trimmed;
}

/**
 * The two verticals a jogged vertical is made of, and the connector between them.
 */
export type JogSplit = {
    /**
     * The verticals, with each jogged one replaced by its two parts.
     */
    verticals: Array<Segment>;

    /**
     * A connector at each jog, spanning both parts, as a short connector does.
     */
    connectors: Array<Segment>;
};

/**
 * Finds the column a vertical's line stands in on one row: the middle of its ink, or null on
 * a row where a branch crosses and the ink is wider than a line.
 *
 * @param lineArt - Line ink.
 * @param box - Box of the vertical.
 * @param y - Row.
 * @param widest - Widest ink that is still the line alone.
 * @returns The line's middle on that row, or null.
 */
function findLineMiddle(lineArt: Mask, box: Box, y: number, widest: number): number | null
{
    let first = -1;
    let last = -1;

    for (let x = box.x0; x < box.x1; x++)
    {
        if (lineArt.data[y * lineArt.width + x] === 1)
        {
            first = first < 0 ? x : first;
            last = x;
        }
    }

    return first < 0 || last - first + 1 > widest ? null : (first + last) / 2;
}

/**
 * Splits a vertical that is two verticals standing end to end, a line width apart. In a
 * pectinate tree drawn tightly, the step from one node to the next can be as short as the
 * line is thick: the two nodes' verticals then make one line with a jog in it, and the trace
 * reads one node with the children of both (Alarcon-Munoz 2023, where Gilmoreosaurus joined
 * the node above its own). A jog is told from a scan's slant by being a step: the line stands
 * in one column above a row and in another below it, steadily on each side, and a branch
 * leaves to the right at that row.
 *
 * @param verticals - Vertical segments.
 * @param horizontals - Horizontal segments.
 * @param lineArt - Line ink.
 * @param thickness - Line thickness.
 * @param shortest - Shortest part worth splitting off.
 * @returns The verticals with jogged ones split, and a connector for each jog.
 */
export function splitJoggedVerticals(verticals: Array<Segment>, horizontals: Array<Segment>, lineArt: Mask, thickness: number, shortest: number): JogSplit
{
    const result: JogSplit = { verticals: [], connectors: [] };
    const widest = Math.max(2, Math.round(thickness) + 1);
    const step = Math.max(1.5, 0.75 * thickness);

    for (const vertical of verticals)
    {
        const { box } = vertical;
        const width = box.x1 - box.x0;
        let jogY = -1;
        let upper = 0;
        let lower = 0;

        if (width > thickness + 1 && width <= 3 * thickness + 2 && box.y1 - box.y0 >= 2 * shortest)
        {
            const middles = new Array<number | null>();

            for (let y = box.y0; y < box.y1; y++)
            {
                middles.push(findLineMiddle(lineArt, box, y, widest));
            }

            // Try each row as the jog: every row above must stand in one column and every row
            // below in another, a step to the right apart, but for the row or two of the jog.
            for (let row = shortest; row <= middles.length - shortest && jogY < 0; row++)
            {
                const above = new Array<number>();
                const below = new Array<number>();

                for (let index = 0; index < middles.length; index++)
                {
                    const middle = middles[index];

                    if (middle !== null && Math.abs(index - row) > 1)
                    {
                        (index < row ? above : below).push(middle);
                    }
                }

                if (above.length < shortest / 2 || below.length < shortest / 2)
                {
                    continue;
                }

                above.sort(compareNumbers);
                below.sort(compareNumbers);
                const steady = above[above.length - 1] - above[0] <= 1 && below[below.length - 1] - below[0] <= 1;

                if (steady && below[0] - above[above.length - 1] >= step)
                {
                    jogY = box.y0 + row;
                    upper = above[Math.floor(above.length / 2)];
                    lower = below[Math.floor(below.length / 2)];
                }
            }
        }

        let branchLeaves = false;

        for (const horizontal of horizontals)
        {
            const y = (horizontal.box.y0 + horizontal.box.y1) / 2;
            branchLeaves = branchLeaves || (jogY >= 0 && Math.abs(y - jogY) <= thickness + 2 && horizontal.box.x0 <= box.x1 + thickness && horizontal.box.x1 > box.x1 + shortest);
        }

        if (jogY < 0 || !branchLeaves)
        {
            result.verticals.push(vertical);
            continue;
        }

        const half = Math.max(1, Math.round(thickness / 2));
        const top: Box = { x0: Math.round(upper - thickness / 2), y0: box.y0, x1: Math.round(upper + thickness / 2) + 1, y1: jogY };
        const bottom: Box = { x0: Math.round(lower - thickness / 2), y0: jogY, x1: Math.round(lower + thickness / 2) + 1, y1: box.y1 };
        result.verticals.push({ id: vertical.id, orientation: "vertical", box: top });
        result.verticals.push({ id: `${vertical.id}j`, orientation: "vertical", box: bottom });
        result.connectors.push({ id: `${vertical.id}c`, orientation: "horizontal", box: { x0: top.x0, y0: jogY - half, x1: bottom.x1, y1: jogY + half + 1 } });
    }

    return result;
}

/**
 * Finds the short horizontal pieces that join one vertical to the next in a pectinate tree,
 * where the steps between successive nodes are shorter than the shortest run that counts as a
 * line. For each pair of verticals a few pixels apart whose spans overlap, the rows between them
 * are checked for ink running from one to the other; such a row is a branch from the left
 * vertical to the right one.
 *
 * @param lineInk - Line ink mask.
 * @param verticals - Vertical segments.
 * @param horizontals - Horizontal segments already found.
 * @param maxGap - Largest gap between the verticals' edges to look across.
 * @param thickness - Line thickness in pixels.
 * @param nextId - First identifier number to use.
 * @returns The connectors as horizontal segments.
 */
export function findShortConnectors(lineInk: Mask, verticals: Array<Segment>, horizontals: Array<Segment>, maxGap: number, thickness: number, nextId: number): Array<Segment>
{
    const { width, data } = lineInk;
    const found = new Array<Segment>();
    let id = nextId;

    // A row already covered by a horizontal segment between the two verticals is that
    // segment's own business: a branch passing through, not a missing connector.
    function isCovered(x0: number, x1: number, y: number): boolean
    {
        for (const segment of horizontals)
        {
            const { box } = segment;

            if (box.x0 <= x0 + 1 && box.x1 >= x1 - 1 && y >= box.y0 - 1 && y < box.y1 + 1)
            {
                return true;
            }
        }

        return false;
    }

    for (const left of verticals)
    {
        for (const right of verticals)
        {
            const gap = right.box.x0 - left.box.x1;

            if (left === right || gap < 1 || gap > maxGap)
            {
                continue;
            }

            const top = Math.max(left.box.y0, right.box.y0);
            const bottom = Math.min(left.box.y1, right.box.y1);

            if (bottom - top < thickness)
            {
                continue;
            }

            let runStart = -1;

            for (let y = top; y <= bottom; y++)
            {
                let inked = y < bottom;

                for (let x = left.box.x1; x < right.box.x0 && inked; x++)
                {
                    inked = data[y * width + x] === 1;
                }

                if (inked && runStart < 0)
                {
                    runStart = y;
                }
                else if (!inked && runStart >= 0)
                {
                    const half = Math.max(1, Math.round(thickness / 2));
                    const center = Math.round((runStart + y - 1) / 2);

                    if (!isCovered(left.box.x1, right.box.x0, center))
                    {
                        found.push({ id: `h${id++}`, orientation: "horizontal", box: { x0: left.box.x0, y0: center - half, x1: right.box.x1, y1: center + half + 1 } });
                    }

                    runStart = -1;
                }
            }
        }
    }

    return found;
}

/**
 * Finds the branches too short to count as lines that run from a vertical into a marker: a
 * range bar begins a few pixels from the node its tip hangs from, and the piece of branch
 * between them is shorter than the shortest run that is a line (Wang 2025: seven pixels from
 * the node to the bar). Each becomes a horizontal segment ending at the marker, which the tip
 * is later carried through.
 *
 * @param lineInk - Line ink mask.
 * @param verticals - Vertical segments.
 * @param horizontals - Horizontal segments already found.
 * @param markers - Marker shapes no taller than a label row.
 * @param shortest - Shortest run that already counts as a line.
 * @param thickness - Line thickness in pixels.
 * @param nextId - First identifier number to use.
 * @returns The stubs as horizontal segments.
 */
export function findMarkerStubs(lineInk: Mask, verticals: Array<Segment>, horizontals: Array<Segment>, markers: Mask, shortest: number, thickness: number, nextId: number): Array<Segment>
{
    const { width, height, data } = lineInk;
    const found = new Array<Segment>();
    const half = Math.max(1, Math.round(thickness / 2));
    let id = nextId;

    // The end of the run of ink that leaves the vertical at a row, when the run is short and
    // a marker begins where it stops; otherwise -1.
    function findStubEnd(vertical: Box, y: number): number
    {
        let x = vertical.x1;

        while (x < width && x - vertical.x1 < shortest && data[y * width + x] === 1)
        {
            x++;
        }

        if (x - vertical.x1 < 2 || x - vertical.x1 >= shortest)
        {
            return -1;
        }

        for (let ahead = x; ahead < Math.min(width, x + 4); ahead++)
        {
            for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++)
            {
                if (markers.data[row * width + ahead] === 1)
                {
                    return x;
                }
            }
        }

        return -1;
    }

    // A horizontal that already leaves the vertical at this row is the branch itself, and
    // one that begins where the stub stops is the bar, traced as a segment of its own: a bar
    // drawn in black or in a dark color is line ink, and the trace joins it to the node
    // across the gap (Gonzalez Riga 2018, where a stub besides took the bar's tip from its
    // label).
    function isCovered(vertical: Box, y: number, end: number): boolean
    {
        for (const segment of horizontals)
        {
            const { box } = segment;
            const onRow = y >= box.y0 - half && y < box.y1 + half;

            if (onRow && ((box.x0 <= vertical.x1 + 1 && box.x1 > vertical.x1 + 2) || (box.x0 >= end - 2 && box.x0 <= end + 4)))
            {
                return true;
            }
        }

        return false;
    }

    for (const vertical of verticals)
    {
        // A vertical much thinner than the figure's lines is the edge of a box or a symbol,
        // not a node: the ink that leaves it for a marker is part of the same drawing
        // (Ramirez-Velasco 2021: the rim of the symbol that ends a range bar).
        if (vertical.box.x1 - vertical.box.x0 < Math.max(2, thickness / 2))
        {
            continue;
        }

        let runStart = -1;
        let runEnd = 0;

        for (let y = vertical.box.y0; y <= vertical.box.y1; y++)
        {
            const end = y < vertical.box.y1 ? findStubEnd(vertical.box, y) : -1;

            if (end >= 0 && runStart < 0)
            {
                runStart = y;
                runEnd = end;
            }
            else if (end >= 0)
            {
                runEnd = Math.max(runEnd, end);
            }
            else if (runStart >= 0)
            {
                const center = Math.round((runStart + y - 1) / 2);

                if (y - runStart <= 2 * thickness + 2 && !isCovered(vertical.box, center, runEnd))
                {
                    found.push({ id: `h${id++}`, orientation: "horizontal", box: { x0: vertical.box.x0, y0: center - half, x1: runEnd, y1: center + half + 1 } });
                }

                runStart = -1;
            }
        }
    }

    return found;
}

/**
 * Removes boxed insets: a frame of four lines that nothing crosses, with whatever it holds. A
 * legend drawn inside the figure is such a box, and its frame, a tall line beside the tree,
 * otherwise serves the trace as a node (Foth 2017, where half the tree hung from the legend).
 * A tree's own lines close no box, and a box around part of the tree is crossed by the
 * branches that enter it.
 *
 * @param horizontals - Horizontal segments, changed in place.
 * @param verticals - Vertical segments, changed in place.
 * @param smallest - Least width and height of an inset, in pixels.
 * @param tolerance - How far a frame's lines may miss each other at a corner.
 * @returns The boxes of the insets removed.
 */
export function dropInsets(horizontals: Array<Segment>, verticals: Array<Segment>, smallest: number, tolerance: number): Array<Box>
{
    const dropped = new Array<Box>();

    // The horizontal that runs from one vertical to the other at a height, or null.
    function findRail(left: Box, right: Box, y: number): Segment | null
    {
        for (const segment of horizontals)
        {
            const { box } = segment;

            if (Math.abs((box.y0 + box.y1) / 2 - y) <= tolerance + (box.y1 - box.y0) / 2 && box.x0 <= left.x1 + tolerance && box.x1 >= right.x0 - tolerance
                && box.x0 >= left.x0 - tolerance && box.x1 <= right.x1 + tolerance)
            {
                return segment;
            }
        }

        return null;
    }

    function isInside(box: Box, frame: Box): boolean
    {
        return box.x0 >= frame.x0 - tolerance && box.x1 <= frame.x1 + tolerance && box.y0 >= frame.y0 - tolerance && box.y1 <= frame.y1 + tolerance;
    }

    function isOutside(box: Box, frame: Box): boolean
    {
        return box.x1 <= frame.x0 + tolerance || box.x0 >= frame.x1 - tolerance || box.y1 <= frame.y0 + tolerance || box.y0 >= frame.y1 - tolerance;
    }

    for (const left of verticals)
    {
        for (const right of verticals)
        {
            const tall = left.box.y1 - left.box.y0;

            if (right.box.x0 - left.box.x1 < smallest || tall < smallest || Math.abs(right.box.y0 - left.box.y0) > tolerance || Math.abs(right.box.y1 - left.box.y1) > tolerance)
            {
                continue;
            }

            if (findRail(left.box, right.box, left.box.y0) === null || findRail(left.box, right.box, left.box.y1) === null)
            {
                continue;
            }

            const frame: Box = { x0: left.box.x0, y0: left.box.y0, x1: right.box.x1, y1: left.box.y1 };
            let crossed = false;
            let inside = 0;
            let outside = 0;

            for (const segment of [...horizontals, ...verticals])
            {
                if (isInside(segment.box, frame))
                {
                    inside++;
                }
                else if (isOutside(segment.box, frame))
                {
                    outside++;
                }
                else
                {
                    crossed = true;
                }
            }

            // The part of the figure with most of the lines is the tree, framed or not.
            if (!crossed && inside < outside)
            {
                dropped.push(frame);
            }
        }
    }

    for (const frame of dropped)
    {
        for (const list of [horizontals, verticals])
        {
            for (let index = list.length - 1; index >= 0; index--)
            {
                if (isInside(list[index].box, frame))
                {
                    list.splice(index, 1);
                }
            }
        }
    }

    return dropped;
}

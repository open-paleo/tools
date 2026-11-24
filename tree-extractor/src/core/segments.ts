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
 * Joins the pieces of one run that were parted where a letter touches the line: a digit of a
 * value printed on a stem stands on it, the run is as tall there as the digit and the line
 * together, and the stem comes out as scraps between the digits (Sen 2025). Two pieces no
 * more than a glyph apart are one when the line art runs unbroken under the gap, no thicker
 * than a line.
 *
 * @param pieces - Pieces of one run, in order.
 * @param run - Box of the run the pieces were cut from.
 * @param lineArt - Line ink, without glyphs.
 * @param ink - All dark ink, lettering included.
 * @param reach - Greatest gap to join across: a digit's width, seven tenths of a glyph's height.
 * @param limit - Greatest thickness of a line.
 * @returns The pieces, those joined given as one.
 */
function joinUnderLetters(pieces: Array<Box>, run: Box, lineArt: Mask, ink: Mask, reach: number, limit: number): Array<Box>
{
    // Whether a letter stands in a column of the run: ink that is not line art, and no
    // taller than a letter. A rule of the time scale drawn faint or in dots is such ink too,
    // and runs on far above and below the run (Gonzalez Riga 2018).
    function hasLetterAt(x: number): boolean
    {
        for (let y = run.y0; y < run.y1; y++)
        {
            if (ink.data[y * ink.width + x] !== 1 || lineArt.data[y * ink.width + x] === 1)
            {
                continue;
            }

            let top = y;
            let bottom = y;

            while (top > 0 && y - top <= 3 * reach && ink.data[(top - 1) * ink.width + x] === 1)
            {
                top--;
            }

            while (bottom < ink.height - 1 && bottom - y <= 3 * reach && ink.data[(bottom + 1) * ink.width + x] === 1)
            {
                bottom++;
            }

            if (bottom - top <= 3 * reach)
            {
                return true;
            }
        }

        return false;
    }

    // Whether the line runs on under lettering from one column to another: the line art has
    // unbroken rows over the whole stretch no thicker than a line, nothing of the tree crosses
    // in the gap (a vertical or a tick there is the tree's own, Perez-Pueyo 2019), and
    // lettering, ink that is not line art, stands in half the gap's columns.
    function runsUnder(x0: number, x1: number, gapFrom: number, gapTo: number): boolean
    {
        const whole = fitToInkRows(lineArt, { x0, y0: run.y0, x1, y1: run.y1 });

        if (whole === null || whole.y1 - whole.y0 > limit)
        {
            return false;
        }

        let lettered = 0;

        for (let x = gapFrom; x < gapTo; x++)
        {
            let top = whole.y0;
            let bottom = whole.y1;

            while (top > 0 && whole.y0 - top <= limit && lineArt.data[(top - 1) * lineArt.width + x] === 1)
            {
                top--;
            }

            while (bottom < lineArt.height && bottom - whole.y1 <= limit && lineArt.data[bottom * lineArt.width + x] === 1)
            {
                bottom++;
            }

            if (bottom - top > limit)
            {
                return false;
            }

            lettered += hasLetterAt(x) ? 1 : 0;
        }

        return 2 * lettered >= gapTo - gapFrom;
    }

    // Whether two pieces that touch are one line: the line art has unbroken rows over both,
    // no thicker than a line, and nothing of the tree stands at the seam. Pieces are parted
    // where a vertical meets the branch, and those stay apart.
    function isThinOver(x0: number, x1: number, seam: number): boolean
    {
        const whole = fitToInkRows(lineArt, { x0, y0: run.y0, x1, y1: run.y1 });

        if (whole === null || whole.y1 - whole.y0 > limit)
        {
            return false;
        }

        for (let x = Math.max(0, seam - 2); x < Math.min(lineArt.width, seam + 2); x++)
        {
            let top = whole.y0;
            let bottom = whole.y1;

            while (top > 0 && whole.y0 - top <= limit && lineArt.data[(top - 1) * lineArt.width + x] === 1)
            {
                top--;
            }

            while (bottom < lineArt.height && bottom - whole.y1 <= limit && lineArt.data[bottom * lineArt.width + x] === 1)
            {
                bottom++;
            }

            if (bottom - top > limit)
            {
                return false;
            }
        }

        // And a letter stands at the seam, within half a digit's width: a bar parted where
        // a rule of the time scale crosses it has none there (Gonzalez Riga 2018).
        let lettered = 0;

        for (let x = Math.max(run.x0, seam - Math.round(reach / 2)); x < Math.min(run.x1, seam + Math.round(reach / 2)); x++)
        {
            lettered += hasLetterAt(x) ? 1 : 0;
        }

        return lettered >= 2;
    }

    // How many columns of the run hold lettering: ink that is not line art.
    let letteredColumns = 0;

    for (let x = run.x0; x < run.x1; x++)
    {
        letteredColumns += hasLetterAt(x) ? 1 : 0;
    }

    const joined = new Array<Box>();

    // Nothing is joined in a run that no letter touches: its pieces were parted by the
    // tree's own shapes, a bar or a dot, and are told apart for good reason.
    if (2 * letteredColumns < reach)
    {
        return pieces;
    }

    // The run is no taller than a letter standing on a line: the rule of a stage chart with
    // its dividers is a run as tall as the chart (Perez-Pueyo 2019).
    if (run.y1 - run.y0 > 3 * reach)
    {
        return pieces;
    }

    for (const piece of [...pieces].sort(compareLeftEdges))
    {
        const last = joined.length > 0 ? joined[joined.length - 1] : null;
        const gap = last === null ? -1 : piece.x0 - last.x1;

        if (last !== null && gap >= 0 && gap <= reach && (gap === 0 ? isThinOver(last.x0, piece.x1, piece.x0) : runsUnder(last.x0, piece.x1, last.x1, piece.x0)))
        {
            last.x1 = piece.x1;
            last.y0 = Math.min(last.y0, piece.y0);
            last.y1 = Math.max(last.y1, piece.y1);
            continue;
        }

        joined.push({ x0: piece.x0, y0: piece.y0, x1: piece.x1, y1: piece.y1 });
    }

    // A letter may stand on the very end of the line, where it turns into its vertical: the
    // first or the last piece then starts a digit's width inside the run.
    if (joined.length > 0)
    {
        const first = joined[0];
        const last = joined[joined.length - 1];

        if (first.x0 > run.x0 && first.x0 - run.x0 <= reach && runsUnder(run.x0, first.x1, run.x0, first.x0))
        {
            first.x0 = run.x0;
        }

        if (last.x1 < run.x1 && run.x1 - last.x1 <= reach && runsUnder(last.x0, run.x1, last.x1, run.x1))
        {
            last.x1 = run.x1;
        }
    }

    return joined;
}

/**
 * Fits a box to the rows its ink fills: the rows in which ink covers nine tenths of the box's
 * width.
 *
 * @param mask - Mask.
 * @param box - Box.
 * @returns The box with those rows, or null when there are none.
 */
function fitToInkRows(mask: Mask, box: Box): Box | null
{
    let y0 = -1;
    let y1 = -1;

    for (let y = Math.max(0, box.y0); y < Math.min(mask.height, box.y1); y++)
    {
        let set = 0;

        for (let x = Math.max(0, box.x0); x < Math.min(mask.width, box.x1); x++)
        {
            set += mask.data[y * mask.width + x];
        }

        if (set >= 0.9 * (box.x1 - box.x0))
        {
            y0 = y0 < 0 ? y : y0;
            y1 = y + 1;
        }
    }

    return y0 < 0 ? null : { x0: box.x0, y0, x1: box.x1, y1 };
}

/**
 * Measures the share of a box that is set in a mask.
 *
 * @param mask - Mask.
 * @param box - Box.
 * @returns The share, 0 for an empty box.
 */
function measureMaskShare(mask: Mask, box: Box): number
{
    let set = 0;

    for (let y = Math.max(0, box.y0); y < Math.min(mask.height, box.y1); y++)
    {
        for (let x = Math.max(0, box.x0); x < Math.min(mask.width, box.x1); x++)
        {
            set += mask.data[y * mask.width + x];
        }
    }

    const area = (box.x1 - box.x0) * (box.y1 - box.y0);

    return area <= 0 ? 0 : set / area;
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
 * @param knownLines - Ink known for line by its color, which a row does not clip; or null.
 * @returns Parts of the piece outside every text row.
 */
function clipToTextRows(box: Box, textRows: Array<Box>, minRun: number, lineArt: Mask, reachRows: Array<Box> | null, knownLines: Mask | null): Array<Box>
{
    const height = box.y1 - box.y0;
    const blocked = new Array<Box>();

    for (let index = 0; index < textRows.length; index++)
    {
        const row = textRows[index];
        const reach = reachRows === null ? row : reachRows[index];
        const overlap = Math.min(row.y1, box.y1) - Math.max(row.y0, box.y0);

        // A stretch known for line by its color is no part of the row's lettering: the row
        // is a number printed on the branch (Cau 2018, an age on the step at every node).
        if (knownLines !== null && overlap > 0 && row.x1 > box.x0 && row.x0 < box.x1 && measureMaskShare(knownLines, { x0: Math.max(box.x0, row.x0), y0: box.y0, x1: Math.min(box.x1, row.x1), y1: box.y1 }) >= 0.6)
        {
            continue;
        }

        // A line that runs on unbroken along the edge of the row, and past it on both sides,
        // is a branch with a name printed just above or below it, not a label continuing its
        // branch's ink, and is left whole (Fonseca 2024's "Marginocephalia" sits on its own
        // stem). A name set in the line, level with it, is where the branch stops (the same
        // figure's "Cerapoda", before its connector).
        // The rows come widened by two pixels above and below; a line whose middle lies in
        // that margin runs along the edge of the text, under or over it, not through it.
        const middle = (box.y0 + box.y1) / 2;
        // The edge is that of the row's letters: a rough row that took in the label's range
        // bar and its stub stands taller than its text, and the branch of the tip above
        // would run through it (Rauhut 2019's Suchomimus, over Baryonyx).
        const alongEdge = middle > reach.y1 - 2 || middle < reach.y0 + 2;

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
 * Finds the branch that turns a corner at one end of a vertical: a horizontal that begins at
 * the vertical's column and reaches that end's last rows. A stem ends at the column, and a
 * node's circle begins before it and lies past the end.
 *
 * @param vertical - The vertical's box.
 * @param atBottom - Whether the bottom end is meant; otherwise the top.
 * @param horizontals - Horizontal boxes.
 * @returns The horizontal that begins there, or null.
 */
function findCorner(vertical: Box, atBottom: boolean, horizontals: Array<Box>): Box | null
{
    const end = atBottom ? vertical.y1 : vertical.y0;

    for (const horizontal of horizontals)
    {
        const reach = Math.max(3, horizontal.y1 - horizontal.y0);
        const reachesEnd = atBottom
            ? horizontal.y0 <= end && horizontal.y1 >= end - reach
            : horizontal.y1 >= end && horizontal.y0 <= end + reach;

        // A scrap no longer than the vertical is broad is the vertical's own end, not a branch,
        // and neither is a hairline beside a line several pixels thick.
        const leaves = horizontal.x1 > vertical.x1 + 2 * reach && 2 * (horizontal.y1 - horizontal.y0) >= vertical.x1 - vertical.x0;

        if (reachesEnd && leaves && horizontal.x0 >= vertical.x0 - reach && horizontal.x0 <= vertical.x1 + reach)
        {
            return horizontal;
        }
    }

    return null;
}

/**
 * Whether two verticals in one column are two nodes, one above the other: each turns a corner
 * into a branch of its own at the end facing the other, and some row of the column between
 * them is blank. A stem that joins one vertical halfway also cuts it in two, but fills the
 * gap; a label's box blanks the gap, but leaves no corners.
 *
 * @param ink - All dark pixels of the image.
 * @param upper - The upper vertical's box.
 * @param lower - The lower vertical's box.
 * @param horizontals - Horizontal boxes.
 * @returns True when the two were drawn apart.
 */
function standApart(ink: Mask, upper: Box, lower: Box, horizontals: Array<Box>): boolean
{
    const above = findCorner(upper, true, horizontals);
    const below = findCorner(lower, false, horizontals);

    if (above === null || below === null || above === below)
    {
        return false;
    }

    const x0 = Math.max(upper.x0, lower.x0);
    const x1 = Math.min(upper.x1, lower.x1);

    for (let y = upper.y1; y < lower.y0; y++)
    {
        let blank = true;

        for (let x = x0; x < x1 && blank; x++)
        {
            blank = ink.data[y * ink.width + x] !== 1;
        }

        if (blank)
        {
            return true;
        }
    }

    return false;
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
 * @param corners - Horizontal boxes, for verticals: two verticals that each turn a corner at
 *   the end facing the other are two nodes one above the other in a column, and the ink in
 *   the gap is their own branches (Rauhut 2019); null joins them all the same.
 * @param crossing - Vertical boxes, for horizontals: a vertical that crosses the gap keeps the
 *   two pieces apart; null joins them all the same.
 * @param knownLines - Ink known for line, which a crossing vertical must be made of.
 * @returns Merged boxes and the number of gaps bridged.
 */
function mergeCollinearBoxes(boxes: Array<Box>, alongX: boolean, maxGap: number, ink: Mask | null, window: number, gapInkShare: number, corners: Array<Box> | null = null, crossing: Array<Box> | null = null, knownLines: Mask | null = null): MergeResult
{
    // Whether a vertical stands in the gap between two level pieces and runs on a glyph's
    // half past them above and below. The gap is a glyph wider than the vertical: a branch
    // that a rule of the time scale crosses is cut for the rule's own width and no more
    // (Hartman 2019).
    function isCrossed(first: Box, second: Box): boolean
    {
        const top = Math.min(first.y0, second.y0);
        const bottom = Math.max(first.y1, second.y1);
        const gap = second.x0 - first.x1;

        for (const vertical of crossing ?? [])
        {
            const crosses = gap > vertical.x1 - vertical.x0 + 2 * window && vertical.x0 >= first.x1 - 1 && vertical.x1 <= second.x0 + 1 && vertical.y0 <= top - window && vertical.y1 >= bottom + window;

            // And it is a branch by its ink, not a rule of the time scale under a label.
            if (crosses && (knownLines === null || measureMaskShare(knownLines, { x0: vertical.x0, y0: top - window, x1: vertical.x1, y1: bottom + window }) >= 0.6))
            {
                return true;
            }
        }

        return false;
    }

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

                if (overlap >= 0.5 * thinner && corners !== null && ink !== null && gap > 2 && standApart(ink, first, second, corners))
                {
                    continue;
                }

                if (alongX && gap > 2 && crossing !== null && isCrossed(first, second))
                {
                    continue;
                }

                // A slanted stroke comes as a stair of level pieces, each a pixel under the
                // last, and joined they are one box as tall as the stroke climbs, which takes
                // in any branch it ends on: the shaft of an arrow that points at a branch
                // (Carr 2010). Level pieces of one line make a box no taller than four of
                // the thinner one.
                const tall = alongX ? Math.max(first.y1, second.y1) - Math.min(first.y0, second.y0) : 0;

                const taller = alongX ? Math.max(first.y1 - first.y0, second.y1 - second.y0) : 0;

                // A thin piece within the height of a solid bar adds nothing to it; a tall box
                // that is mostly white is a slanted piece itself.
                const thick = first.y1 - first.y0 >= second.y1 - second.y0 ? first : second;
                const solid = tall === taller && (ink === null || measureMaskShare(ink, thick) >= 0.6);

                // And the stroke climbs a pixel in twenty-five or more: a line of a scan set
                // a little askew climbs far less (Gohlich 2006).
                const long = Math.max(first.x1, second.x1) - Math.min(first.x0, second.x0);

                if (!solid && tall > 4 * Math.max(thinner, 2) && 25 * (tall - thinner) > long)
                {
                    continue;
                }

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
 * @param ink - All dark ink, lettering included, for the piece of a vertical that went with a
 *   name; null leaves such verticals as they are.
 * @returns How many pairs were joined.
 */
function joinVerticalsAcrossText(boxes: Array<Box>, textRows: Array<Box>, horizontals: Array<Box>, ink: Mask | null = null): number
{
    // Counts the ink across a vertical piece on one row: the breadth of its line there, or
    // of its box when the ink is not given or the row is bare.
    function measureStroke(box: Box, y: number): number
    {
        let count = 0;

        if (ink !== null && y >= 0 && y < ink.height)
        {
            for (let x = Math.max(0, box.x0); x < Math.min(ink.width, box.x1); x++)
            {
                count += ink.data[y * ink.width + x];
            }
        }

        return count > 0 ? count : box.x1 - box.x0;
    }

    if (textRows.length === 0)
    {
        return 0;
    }

    let carried = 0;

    // A vertical may stop at a name with nothing of itself left beyond it: the short
    // piece between the name and the branch the vertical turns into is no longer than a
    // letter, and went with the lettering (Sen 2025, 40 pixels of backbone between
    // "Pseudosuchia" and the stem above it). Where a branch ends in the vertical's column
    // within a row and a half's height beyond the name, the vertical is carried on to it.
    for (const box of boxes)
    {
        const x = (box.x0 + box.x1) / 2;
        const reach = 2 * (box.x1 - box.x0) + 2;

        for (const row of textRows)
        {
            const tall = row.y1 - row.y0;
            const slack = Math.max(3, Math.round(0.4 * tall));

            // The name lies across the line, a row's height of it on each side: a tip's label
            // begins beside the vertical it hangs from and does not cross it.
            if (row.x0 > x - tall || row.x1 < x + tall)
            {
                continue;
            }

            const above = box.y0 >= row.y1 - slack && box.y0 <= row.y1 + slack && !hasBranchAtEnd(box, box.y0, horizontals);
            const below = box.y1 <= row.y0 + slack && box.y1 >= row.y0 - slack && !hasBranchAtEnd(box, box.y1, horizontals);

            if (!above && !below)
            {
                continue;
            }

            let target: Box | null = null;

            for (const horizontal of horizontals)
            {
                const middle = (horizontal.y0 + horizontal.y1) / 2;
                const beyond = above ? row.y0 - middle : middle - row.y1;
                const endsHere = Math.abs(horizontal.x0 - x) <= reach || Math.abs(horizontal.x1 - x) <= reach;

                if (endsHere && beyond >= 0 && beyond <= 1.5 * tall && (target === null || beyond < (above ? row.y0 - (target.y0 + target.y1) / 2 : (target.y0 + target.y1) / 2 - row.y1)))
                {
                    target = horizontal;
                }
            }

            // No vertical stands there already: one that does is another node's, or the other
            // piece of this one, which is joined as a pair above or not at all.
            let taken = false;

            for (const other of boxes)
            {
                taken = taken || (other !== box && target !== null && Math.abs((other.x0 + other.x1) / 2 - x) <= reach && other.y0 <= target.y1 + reach && other.y1 >= target.y0 - reach);
            }

            // And the piece that went with the lettering is there to see: ink down the
            // vertical's column for four fifths of the way from the name to the branch.
            let inked = 0;
            let span = 0;

            if (target !== null && ink !== null)
            {
                const from = above ? target.y1 : row.y1;
                const to = above ? row.y0 : target.y0;

                for (let y = Math.max(0, from); y < Math.min(ink.height, to); y++)
                {
                    let dark = false;

                    for (let column = Math.max(0, box.x0); column < Math.min(ink.width, box.x1) && !dark; column++)
                    {
                        dark = ink.data[y * ink.width + column] === 1;
                    }

                    span++;
                    inked += dark ? 1 : 0;
                }
            }

            if (target !== null && !taken && inked >= 0.8 * span)
            {
                if (above)
                {
                    box.y0 = target.y0;
                }
                else
                {
                    box.y1 = target.y1;
                }

                carried++;
                break;
            }
        }
    }

    // That goes first: a backbone under several names is mended as a whole only when a
    // branch leaves its topmost piece, and the branch may be the one just reached.
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
            const narrower = Math.min(first.x1 - first.x0, second.x1 - second.x0);
            // A riser drawn at a slant has a box as broad as it leans, and its line is far
            // thinner: by the box, the shoulder a riser leaves its node on, a line's breadth
            // above the cut, was a branch at the cut (Averianov 2018, a riser behind a
            // clade's name). The line's breadth is what the ink measures at the cut ends. A
            // dot on a node is still told by the boxes, one twice as broad as the other.
            const thinner = overlap >= 0.5 * narrower ? Math.min(narrower, measureStroke(first, first.y1 - 2), measureStroke(second, second.y0 + 1)) : narrower;

            if (gap > 0 && overlap >= 0.5 * narrower && isGapInsideRow(first, second, textRows, ink) && !hasBranchAtEnd(first, first.y1, horizontals, thinner, first.x1 - first.x0 >= 2 * narrower) && !hasBranchAtEnd(second, second.y0, horizontals, thinner, second.x1 - second.x0 >= 2 * narrower))
            {
                uppers.push(first);
                lowers.push(second);
            }
        }
    }

    // A column cut by labels in several places is a rule drawn across the labels, a boundary
    // or a bracket, and not a branch with a name on it; a column cut once is mended. So is one
    // cut several times when branches leave both its topmost and its lowest piece: the stem
    // of a tree's backbone with the names of its clades set on it one below the other (Bajpai
    // 2023, four names on three columns, which left the tree in three pieces).
    const mended = new Array<boolean>(uppers.length);

    for (let index = 0; index < uppers.length; index++)
    {
        let cuts = 0;
        let top = uppers[index];
        let bottom = lowers[index];

        for (let other = 0; other < uppers.length; other++)
        {
            if (Math.min(uppers[index].x1, uppers[other].x1) > Math.max(uppers[index].x0, uppers[other].x0))
            {
                cuts++;
                top = uppers[other].y0 < top.y0 ? uppers[other] : top;
                bottom = lowers[other].y1 > bottom.y1 ? lowers[other] : bottom;
            }
        }

        mended[index] = cuts === 1 || (hasBranchAlong(top, horizontals) && hasBranchAlong(bottom, horizontals));
    }

    let joined = 0;

    // From the lowest cut up, so that a piece joined from below is whole when the piece above
    // takes it in.
    for (let index = uppers.length - 1; index >= 0; index--)
    {
        if (mended[index])
        {
            uppers[index].x0 = Math.min(uppers[index].x0, lowers[index].x0);
            uppers[index].x1 = Math.max(uppers[index].x1, lowers[index].x1);
            uppers[index].y1 = lowers[index].y1;
            boxes.splice(boxes.indexOf(lowers[index]), 1);
            joined++;
        }
    }

    return joined + carried;
}

/**
 * Whether a horizontal meets a vertical anywhere along it.
 *
 * @param vertical - Vertical box.
 * @param horizontals - Horizontal boxes.
 * @returns True when a branch arrives at or leaves from the vertical.
 */
function hasBranchAlong(vertical: Box, horizontals: Array<Box>): boolean
{
    const reach = 2 * (vertical.x1 - vertical.x0) + 2;

    for (const horizontal of horizontals)
    {
        if (horizontal.x0 <= vertical.x1 + reach && horizontal.x1 >= vertical.x0 - reach && horizontal.y1 >= vertical.y0 - reach && horizontal.y0 <= vertical.y1 + reach)
        {
            return true;
        }
    }

    return false;
}

/**
 * Whether a horizontal meets a vertical at one of its ends.
 *
 * @param vertical - Vertical box.
 * @param endY - The end to look at: the box's top or bottom.
 * @param horizontals - Horizontal boxes.
 * @param breadth - The line's breadth, when the box is broader than its line: a dot on the
 *   node makes the box as broad as the dot.
 * @param leavingOnly - Whether only a branch that leaves to the right counts, and not a stem
 *   arriving from the left.
 * @returns True when a branch arrives at or leaves from that end.
 */
function hasBranchAtEnd(vertical: Box, endY: number, horizontals: Array<Box>, breadth = vertical.x1 - vertical.x0, leavingOnly = false): boolean
{
    // No further than a third of the vertical: of a piece barely longer than it is broad, the
    // branch at its other end is not at this one (Pei 2020, the 19 pixels of the root's
    // vertical above the name printed across it).
    const reach = Math.min(2 * breadth + 2, Math.floor((vertical.y1 - vertical.y0) / 3));

    for (const horizontal of horizontals)
    {
        const touchesColumn = horizontal.x0 <= vertical.x1 + reach && horizontal.x1 >= vertical.x0 - reach;
        // A branch that arrives from the left and goes no further is the node's stem. Where
        // it arrives at a dot on a cut end, the vertical went on past the cut: a stem enters
        // between a node's branches, not at the end of them (Sen 2025, a name printed just
        // under the dot its stem runs to). Only at a dot, which makes the piece twice as
        // broad as its line: two nodes one above the other in a column each have a stem
        // too (Muller 2018, Dai 2022).
        const leaves = horizontal.x1 > vertical.x1 + reach;

        if (touchesColumn && (leaves || !leavingOnly) && horizontal.y0 <= endY + reach && horizontal.y1 >= endY - reach)
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
 * @param ink - All dark ink, for the sliver of line between two names; null leaves a gap under
 *   two names unmended.
 * @returns True when a row accounts for the gap.
 */
function isGapInsideRow(first: Box, second: Box, textRows: Array<Box>, ink: Mask | null = null): boolean
{
    const x = (Math.max(first.x0, second.x0) + Math.min(first.x1, second.x1)) / 2;
    let endsBefore = false;
    let startsAfter = false;

    for (const row of textRows)
    {
        // The line art stops a few pixels short of the letters on each side.
        const slack = Math.max(3, Math.round(0.4 * (row.y1 - row.y0)));
        const level = first.y1 >= row.y0 - slack && second.y0 <= row.y1 + slack;

        if (row.x0 <= x && row.x1 >= x && level)
        {
            return true;
        }

        // A name printed across a thick line can come out as two rows, one on each side of
        // it, where the letters on the line itself went with the line (Pei 2020,
        // "Deinonychosauria" across the root's vertical).
        const near = row.y1 - row.y0;
        endsBefore = endsBefore || (level && row.x1 < x && row.x1 >= x - near);
        startsAfter = startsAfter || (level && row.x0 > x && row.x0 <= x + near);
    }

    if (endsBefore && startsAfter)
    {
        return true;
    }

    // Or two names stand one under the other across the line, a clade's and the next one's,
    // with a sliver of the line between them that is shorter than a letter and went with the
    // lettering (Sen 2025, "Dinosauromorpha" over "Silesauridae"). The rows that cross the
    // line then cover the gap between them, no further apart than one is tall.
    const crossing = new Array<Box>();

    for (const row of textRows)
    {
        const tall = row.y1 - row.y0;

        // Lying across the line, a row's height of it on each side: the labels of two tips
        // one under the other begin beside the vertical between them (Fonseca 2024).
        if (row.x0 <= x - tall && row.x1 >= x + tall && row.y1 > first.y1 - tall && row.y0 < second.y0 + tall)
        {
            crossing.push(row);
        }
    }

    if (ink === null || crossing.length < 2 || crossing.length > 3)
    {
        return false;
    }

    crossing.sort(compareTopEdges);
    const topRow = crossing[0];
    const bottomRow = crossing[crossing.length - 1];
    const broader = Math.max(first.x1 - first.x0, second.x1 - second.x0);
    const narrower = Math.min(first.x1 - first.x0, second.x1 - second.x0);

    // Both pieces are lines of one breadth that go on a row's height past the names: the
    // strokes of letters in a block of text stand in a column too (Wu 2015, a key).
    if (first.y0 > topRow.y0 - (topRow.y1 - topRow.y0) || second.y1 < bottomRow.y1 + (bottomRow.y1 - bottomRow.y0) || broader > 2 * narrower)
    {
        return false;
    }

    let reached = first.y1;

    for (const row of crossing)
    {
        const slack = Math.max(3, Math.round(0.4 * (row.y1 - row.y0)));
        const near = reached === first.y1 ? slack : row.y1 - row.y0;

        if (row.y0 > reached + near)
        {
            return false;
        }

        // And the sliver between two names is there: ink down the column all the way.
        if (reached !== first.y1)
        {
            for (let y = reached; y < row.y0; y++)
            {
                let dark = false;

                for (let column = Math.max(first.x0, second.x0); column < Math.min(first.x1, second.x1) && !dark; column++)
                {
                    dark = ink.data[y * ink.width + column] === 1;
                }

                if (!dark)
                {
                    return false;
                }
            }
        }

        reached = Math.max(reached, row.y1);
    }

    const last = crossing[crossing.length - 1];

    return second.y0 <= reached + Math.max(3, Math.round(0.4 * (last.y1 - last.y0)));
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
 * Takes out of the horizontal runs those that are only the breadth of a thick vertical: short
 * runs lying wholly on ink that stands several times taller than they are long. Two verticals
 * a few pixels apart close into one broad line, each row of which is a horizontal run, and
 * through them every branch that meets the line joins into one piece (Sanchez-Fenollosa 2025,
 * where the branch to Stegosauridae went into a piece 133 pixels tall and was lost).
 *
 * @param horizontalMask - Pixels in horizontal runs of the least length.
 * @param lineArt - Line ink.
 * @param shortest - The least length of a horizontal run.
 * @returns The mask without those runs, in the pieces they had joined.
 */
function dropVerticalBreadth(horizontalMask: Mask, lineArt: Mask, shortest: number): Mask
{
    const { width, height } = lineArt;
    const standing = new Uint32Array(width * height);

    // The height of the vertical run of ink through each pixel.
    for (let x = 0; x < width; x++)
    {
        let start = -1;

        for (let y = 0; y <= height; y++)
        {
            const on = y < height && lineArt.data[y * width + x] === 1;

            if (on && start < 0)
            {
                start = y;
            }
            else if (!on && start >= 0)
            {
                for (let row = start; row < y; row++)
                {
                    standing[row * width + x] = y - start;
                }

                start = -1;
            }
        }
    }

    // Only where the breadth has joined branches into a piece no line could be: a broad
    // vertical on its own is left as it is, since the ink across a node drawn as a narrow
    // box is what joins its two sides (Otero 2015).
    const labeling = findConnectedComponents(horizontalMask);
    const joined = new Uint8Array(labeling.components.length + 1);

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];
        joined[index + 1] = box.y1 - box.y0 > 4 * shortest && box.x1 - box.x0 >= 3 * shortest ? 1 : 0;
    }

    const data = new Uint8Array(horizontalMask.data);

    for (let y = 0; y < height; y++)
    {
        let start = -1;

        for (let x = 0; x <= width; x++)
        {
            const on = x < width && horizontalMask.data[y * width + x] === 1;

            if (on && start < 0)
            {
                start = x;
            }
            else if (!on && start >= 0)
            {
                const length = x - start;
                let tall = 0;

                for (let column = start; column < x && length < 3 * shortest; column++)
                {
                    tall += standing[y * width + column] >= 3 * length ? 1 : 0;
                }

                if (length < 3 * shortest && tall >= 0.9 * length && joined[labeling.labels[y * width + start]] === 1)
                {
                    data.fill(0, y * width + start, y * width + x);
                }

                start = -1;
            }
        }
    }

    return { width, height, data };
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
 * @param knownLines - Ink known for line by its color, which a text row does not clip.
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
    knownLines: Mask | null = null,
): SegmentSet
{
    const horizontalMask = dropVerticalBreadth(createDirectionalRunMask(lineArt, minHorizontalRun, true), lineArt, minHorizontalRun);
    const components = findConnectedComponents(horizontalMask).components;
    let pieces = new Array<Box>();
    // The run each piece was cut from.
    const runOf = new Map<Box, Box>();

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
            const found = joinUnderLetters(findLinePieces(measureJoinedHeights(ink, components[index].box, window), components[index].box, limit, minHorizontalRun), components[index].box, lineArt, ink, Math.round(0.7 * window), limit);
            pieces.push(...found);

            for (const piece of found)
            {
                runOf.set(piece, components[index].box);
            }
        }
    }

    const verticalBoxes = new Array<Box>();

    for (const component of findConnectedComponents(createDirectionalRunMask(lineArt, minVerticalRun, false)).components)
    {
        const box = component.box;

        if (box.y1 - box.y0 >= 2 * (box.x1 - box.x0) && !isInsideAny(box, letterRows ?? textRows))
        {
            verticalBoxes.push(box);
        }
    }

    const clipped = new Array<Box>();

    // A range bar clipped at its label can be short and thick, so a horizontal need only be at
    // least as long as it is thick; text has already been cut away.
    for (const piece of pieces)
    {
        for (const part of clipToTextRows(piece, textRows, minHorizontalRun, lineArt, reachRows, knownLines))
        {
            if (part.x1 - part.x0 >= part.y1 - part.y0)
            {
                clipped.push(part);
                continue;
            }

            // A piece cut from a run that also holds something thick, a dot on the node the
            // branch runs to, has the height of the whole run and looks taller than it is
            // long (Sen 2025, 29 pixels of stem beside a dot of 31). Its own rows are the
            // ones its ink fills.
            // The thick part of the run is a dot or a small mark, no longer than three times
            // its height. Beside a range bar the piece is the stub of the bar's branch, which
            // is found in its own way (Perez-Pueyo 2019, Gonzalez Riga 2018).
            const run = runOf.get(piece);
            const beside = run !== undefined && (run.x1 - run.x0) - (part.x1 - part.x0) <= 3 * (run.y1 - run.y0);
            const fitted = beside ? fitToInkRows(lineArt, part) : null;
            let own: Box | null = null;

            // And the piece runs from a vertical: its other end stands on one. A stroke of
            // a drawing beside a blot has no line to come from (Gomez 2024).
            for (const vertical of verticalBoxes)
            {
                if (fitted !== null && vertical.y0 <= fitted.y0 && vertical.y1 >= fitted.y1 && ((vertical.x1 >= fitted.x0 - 2 && vertical.x0 <= fitted.x0 + 2) || (vertical.x0 <= fitted.x1 + 2 && vertical.x1 >= fitted.x1 - 2)))
                {
                    own = fitted;
                }
            }

            if (own !== null && own.x1 - own.x0 >= minHorizontalRun && own.x1 - own.x0 >= 2 * (own.y1 - own.y0))
            {
                clipped.push(own);
            }
        }
    }

    pieces = clipped;
    const horizontals = new Array<Segment>();
    const verticals = new Array<Segment>();

    // Two pieces on one level are joined across a gap that holds enough ink. In a figure
    // with thick colored branches a number printed between two branches is such ink, and
    // joined the stub of a tip to a branch a hundred pixels to its left, across the vertical
    // between them (Cau 2018); there a vertical that crosses the gap keeps the two apart.
    const mergedHorizontals = mergeCollinearBoxes(pieces, true, maxGap, ink, Math.round(window / 2), gapInkShare, null, knownLines === null ? null : verticalBoxes, knownLines);
    const mergedVerticals = mergeCollinearBoxes(verticalBoxes, false, maxVerticalGap, ink, Math.round(window / 2), gapInkShare, mergedHorizontals.boxes);
    mergedVerticals.bridged += joinVerticalsAcrossText(mergedVerticals.boxes, textRows, mergedHorizontals.boxes, ink);

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
        let sideBySide = false;

        if (width > thickness + 1 && width <= 3 * thickness + 2 && box.y1 - box.y0 >= 2 * shortest)
        {
            const middles = new Array<number | null>();

            let broadRows = 0;

            for (let y = box.y0; y < box.y1; y++)
            {
                const middle = findLineMiddle(lineArt, box, y, widest);
                middles.push(middle);
                broadRows += middle === null ? 1 : 0;
            }

            sideBySide = width > 2 * thickness + 1 && broadRows >= shortest;

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
        let stemBelow = false;

        for (const horizontal of horizontals)
        {
            const y = (horizontal.box.y0 + horizontal.box.y1) / 2;
            branchLeaves = branchLeaves || (jogY >= 0 && Math.abs(y - jogY) <= thickness + 2 && horizontal.box.x0 <= box.x1 + thickness && horizontal.box.x1 > box.x1 + shortest);

            // The stem arrives from the left; the part above the jog is the earlier node and
            // should be the one it reaches.
            const arrives = horizontal.box.x0 < box.x0 - shortest && horizontal.box.x1 >= box.x0 - thickness && horizontal.box.x1 <= box.x1 + thickness;
            stemBelow = stemBelow || (arrives && y > jogY + thickness + 2 && y < box.y1);
        }

        // Where two lines run side by side over a stretch of a vertical broad enough for them
        // and the stem comes in below the jog, the upper line goes on down past the jog beside
        // the lower: a staircase, taken apart after tracing by its branches (Rauhut 2019).
        if (jogY < 0 || !branchLeaves || (sideBySide && stemBelow))
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
 * @param stepsOnly - Whether to keep only the step of a staircase: a connector at one end of
 *   the left vertical, to a right vertical that no branch arrives at. The wider search finds
 *   ink between any two close verticals, which on most figures is something else.
 * @returns The connectors as horizontal segments.
 */
export function findShortConnectors(lineInk: Mask, verticals: Array<Segment>, horizontals: Array<Segment>, maxGap: number, thickness: number, nextId: number, stepsOnly = false): Array<Segment>
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

    // Whether a branch arrives at a vertical from the left: its stem.
    function hasStem(vertical: Segment): boolean
    {
        const reach = thickness + 2;

        for (const segment of horizontals)
        {
            const { box } = segment;

            if (box.x0 < vertical.box.x0 - reach && box.x1 >= vertical.box.x0 - 1 && box.x1 <= vertical.box.x1 + reach && box.y1 > vertical.box.y0 - reach && box.y0 < vertical.box.y1 + reach)
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

            if (left === right || gap < 1 || gap > maxGap || (stepsOnly && hasStem(right)))
            {
                continue;
            }

            const top = Math.max(left.box.y0, right.box.y0);
            const bottom = Math.min(left.box.y1, right.box.y1);

            if (bottom - top < thickness)
            {
                continue;
            }

            // Lines of the tree, not strokes of a letter or the sides of a small shape.
            const slight = Math.min(left.box.y1 - left.box.y0, right.box.y1 - right.box.y0) < 5 * thickness
                || Math.max(left.box.x1 - left.box.x0, right.box.x1 - right.box.x0) > 2 * thickness + 1;

            if (stepsOnly && slight)
            {
                continue;
            }

            const between = new Array<Segment>();
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

                    // The gap may have closed along the stretch where the two run side by side,
                    // so the join is taken to be at an end when its ink reaches one.
                    // The right vertical goes on past that end, as the next step of a staircase
                    // does; two strokes side by side over the same height are hatching.
                    const atTop = runStart - left.box.y0 <= thickness + 1 && right.box.y0 < left.box.y0 - thickness && right.box.y1 < left.box.y1 - thickness;
                    const atBottom = left.box.y1 - y <= thickness + 1 && right.box.y1 > left.box.y1 + thickness && right.box.y0 > left.box.y0 + thickness;
                    const atEnd = atTop || atBottom;

                    if (!isCovered(left.box.x1, right.box.x0, center) && (!stepsOnly || atEnd))
                    {
                        between.push({ id: "", orientation: "horizontal", box: { x0: left.box.x0, y0: center - half, x1: right.box.x1, y1: center + half + 1 } });
                    }

                    runStart = -1;
                }
            }

            // Two joins between one pair are the top and bottom of a closed shape.
            if (stepsOnly && between.length !== 1)
            {
                continue;
            }

            for (const connector of between)
            {
                connector.id = `h${id++}`;
                found.push(connector);
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

/**
 * A rounded corner between a vertical's end and the branch that leaves it.
 */
type RoundedCorner = {
    /**
     * The node's vertical.
     */
    vertical: Segment;

    /**
     * The branch.
     */
    horizontal: Segment;

    /**
     * Whether the corner is at the vertical's top end.
     */
    atTop: boolean;
};

/**
 * Squares rounded corners. Some figures draw each branch out of its node through a small
 * curve: the node's vertical then stops short of its children's rows, and each child's
 * branch begins a little to the right of it, with a quarter turn of ink between. The trace
 * joins a branch to a vertical it starts at, level with it, and here guessed across the
 * gaps (Lerzo 2021, four wrong splits). Where a branch begins diagonally beyond a vertical's
 * end and ink turns the corner between them, the vertical is carried to the branch's row and
 * the branch back to the vertical.
 *
 * @param verticals - Vertical segments; changed in place.
 * @param horizontals - Horizontal segments; changed in place.
 * @param ink - All dark ink: the turn of a corner is as small as a letter and may have been
 *   sorted with the lettering.
 * @param reach - Largest radius of a corner.
 * @returns How many corners were squared.
 */
export function squareRoundedCorners(verticals: Array<Segment>, horizontals: Array<Segment>, ink: Mask, reach: number): number
{
    const { width, height, data } = ink;
    let squared = 0;

    // Whether ink lies near a point: the curve passes close to the middle of the chord.
    function hasInkNear(x: number, y: number): boolean
    {
        for (let row = Math.max(0, y - 3); row <= Math.min(height - 1, y + 3); row++)
        {
            for (let column = Math.max(0, x - 3); column <= Math.min(width - 1, x + 3); column++)
            {
                if (data[row * width + column] === 1)
                {
                    return true;
                }
            }
        }

        return false;
    }

    const corners = new Array<RoundedCorner>();

    for (const vertical of verticals)
    {
        for (const horizontal of horizontals)
        {
            const middle = Math.round((horizontal.box.y0 + horizontal.box.y1) / 2);
            const across = horizontal.box.x0 - vertical.box.x1;

            // A corner has a radius: the branch begins some way off, and off the end too.
            if (across < 3 || across > reach)
            {
                continue;
            }

            const above = vertical.box.y0 - middle;
            const below = middle - vertical.box.y1;
            const beyond = Math.max(above, below);

            if (beyond < 2 || beyond > reach)
            {
                continue;
            }

            const end = above > below ? vertical.box.y0 : vertical.box.y1;
            const center = Math.round((vertical.box.x0 + vertical.box.x1) / 2);

            if (hasInkNear(Math.round((center + horizontal.box.x0) / 2), Math.round((end + middle) / 2)))
            {
                corners.push({ vertical, horizontal, atTop: above > below });
            }
        }
    }

    // A figure drawn this way has a corner at every end of every vertical. A figure drawn
    // square has a branch here and there that begins near a vertical's end with a letter
    // between, and is left as it is.
    if (corners.length < 6 || corners.length < verticals.length)
    {
        return 0;
    }

    for (const corner of corners)
    {
        if (corner.atTop)
        {
            corner.vertical.box.y0 = Math.min(corner.vertical.box.y0, corner.horizontal.box.y0);
        }
        else
        {
            corner.vertical.box.y1 = Math.max(corner.vertical.box.y1, corner.horizontal.box.y1);
        }

        corner.horizontal.box.x0 = corner.vertical.box.x0;
        squared++;
    }

    return squared;
}

/**
 * Measures the rows a stretch of a horizontal's ink fills: the rows inked over most of the
 * stretch.
 *
 * @param lineInk - Line ink.
 * @param box - Box of the whole horizontal.
 * @param x0 - First column of the stretch.
 * @param x1 - Column after its last.
 * @returns The stretch's own box, or null when it holds no such row.
 */
function measureStretch(lineInk: Mask, box: Box, x0: number, x1: number): Box | null
{
    let top = -1;
    let bottom = -1;

    for (let y = box.y0; y < box.y1; y++)
    {
        let inked = 0;

        for (let x = x0; x < x1; x++)
        {
            inked += lineInk.data[y * lineInk.width + x];
        }

        if (inked >= 0.6 * (x1 - x0))
        {
            top = top < 0 ? y : top;
            bottom = y;
        }
    }

    return top < 0 ? null : { x0, y0: top, x1, y1: bottom + 1 };
}

/**
 * Parts a horizontal where a vertical crosses it and the ink on the two sides differs in
 * height: a thin stem that arrives at a node, run together with the range bar of a tip that
 * leaves the node at the same height. As one segment its middle is the bar's, and the stem
 * can miss the node it comes from by the difference (Mateus and others 2011, four tips).
 *
 * @param horizontals - Horizontal segments; changed in place.
 * @param verticals - Vertical segments.
 * @param lineInk - Line ink.
 * @param tolerance - Attachment tolerance in pixels.
 * @returns How many horizontals were parted.
 */
export function partAtCrossings(horizontals: Array<Segment>, verticals: Array<Segment>, lineInk: Mask, tolerance: number): number
{
    let highest = 0;

    for (const segment of horizontals)
    {
        highest = Math.max(highest, Number.parseInt(segment.id.slice(1), 10) || 0);
    }

    let parted = 0;
    const count = horizontals.length;

    for (let index = 0; index < count; index++)
    {
        const { box } = horizontals[index];

        for (const vertical of verticals)
        {
            const x = Math.round((vertical.box.x0 + vertical.box.x1) / 2);

            // The vertical stands within the horizontal, with a stretch of it on each side.
            if (vertical.box.x0 < box.x0 + tolerance || vertical.box.x1 > box.x1 - tolerance || vertical.box.y1 < box.y0 || vertical.box.y0 > box.y1)
            {
                continue;
            }

            const left = measureStretch(lineInk, box, box.x0, vertical.box.x0);
            const right = measureStretch(lineInk, box, vertical.box.x1, box.x1);

            if (left === null || right === null || Math.abs((left.y1 - left.y0) - (right.y1 - right.y0)) < 2)
            {
                continue;
            }

            // A bar drawn evenly about its branch leaves the middle where the thin stretch is,
            // and nothing is amiss (Rauhut 2019); only a bar set to one side moves it off.
            const thin = left.y1 - left.y0 < right.y1 - right.y0 ? left : right;
            const middle = (box.y0 + box.y1) / 2;

            if (middle >= thin.y0 && middle <= thin.y1)
            {
                continue;
            }

            // The box must be the bar's own: one that took in a neighboring line as well is
            // some other fault, and parting it there mends nothing.
            const thick = thin === left ? right : left;

            if (thick.y0 > box.y0 + 1 || thick.y1 < box.y1 - 1)
            {
                continue;
            }

            // And a bar is longer than it is thick, which the ink beside a node need not be.
            if (thick.x1 - thick.x0 < 2 * (thick.y1 - thick.y0))
            {
                continue;
            }

            left.x1 = x;
            right.x0 = x;
            horizontals[index].box = left;
            highest++;
            horizontals.push({ id: `h${highest}`, orientation: "horizontal", box: right });
            parted++;
            break;
        }
    }

    return parted;
}

/**
 * Drops short verticals that one branch crosses and none ends at: a stroke of a support value
 * printed against a branch, or a tick. Such a stroke cuts the branch in two and stands as a
 * node between the halves, and where the branch is a short stem the half before it is left
 * joined to nothing (Fonseca 2024, where "59" under a stem's corner detached four tips).
 *
 * @param verticals - Vertical segments; changed in place.
 * @param horizontals - Horizontal segments.
 * @param tolerance - Attachment tolerance in pixels.
 * @param tallest - Tallest vertical that can be such a stroke.
 * @returns How many verticals were dropped.
 */
export function dropCrossingStrokes(verticals: Array<Segment>, horizontals: Array<Segment>, tolerance: number, tallest: number): number
{
    let dropped = 0;

    for (let index = verticals.length - 1; index >= 0; index--)
    {
        const { box } = verticals[index];

        if (box.y1 - box.y0 > tallest)
        {
            continue;
        }

        let crossing = 0;
        let ending = 0;

        for (const horizontal of horizontals)
        {
            const middle = (horizontal.box.y0 + horizontal.box.y1) / 2;

            if (middle < box.y0 - tolerance || middle > box.y1 + tolerance || horizontal.box.x1 < box.x0 - tolerance || horizontal.box.x0 > box.x1 + tolerance)
            {
                continue;
            }

            // The branch may be a stub that passes the stroke by a pixel or two on each side.
            if (horizontal.box.x0 < box.x0 - 1 && horizontal.box.x1 > box.x1 + 1 && middle > box.y0 && middle < box.y1)
            {
                crossing++;
            }
            else
            {
                ending++;
            }
        }

        if (crossing === 1 && ending === 0)
        {
            verticals.splice(index, 1);
            dropped++;
        }
    }

    return dropped;
}

/**
 * Removes the verticals that branches cross and none ends at: a guide line ruled across the
 * figure at a height or a date. A node's vertical is where its branches begin and its stem
 * ends, and no branch of the tree runs through it; left in, a rule cuts every branch it meets
 * and holds the pieces as its children (Penkalski 2018, whose dotted elevation lines gathered
 * tips from across the tree).
 *
 * @param verticals - Vertical segments, changed in place.
 * @param horizontals - Horizontal segments.
 * @param tolerance - How near a branch end must come to a vertical to end at it.
 * @param longest - Least height of a rule, in pixels.
 * @param tallest - Greatest thickness of a horizontal that counts as a branch crossing.
 * @returns The number of verticals removed.
 */
export function dropCrossedRules(verticals: Array<Segment>, horizontals: Array<Segment>, tolerance: number, longest: number, tallest: number): number
{
    let dropped = 0;

    for (let index = verticals.length - 1; index >= 0; index--)
    {
        const { box } = verticals[index];
        const half = (box.x1 - box.x0) / 2;
        const x = (box.x0 + box.x1) / 2;
        let crossing = 0;
        let ending = 0;

        for (const horizontal of horizontals)
        {
            const other = horizontal.box;
            const y = (other.y0 + other.y1) / 2;

            if (y < box.y0 - tolerance || y > box.y1 + tolerance)
            {
                continue;
            }

            // Only a line crosses: a band or a shaded box that lies over the tree's backbone
            // is as long and far taller (Poust 2020).
            if (other.x0 < x - half - tolerance && other.x1 > x + half + tolerance && other.y1 - other.y0 <= tallest)
            {
                crossing++;
            }
            else if (Math.abs(other.x0 - x) <= half + tolerance || Math.abs(other.x1 - x) <= half + tolerance)
            {
                ending++;
            }
        }

        // One branch end beside a rule is chance, the tick or the box the rule starts from; a
        // node's vertical has two at the least, its stem and a child, and is not crossed.
        // And a rule runs far across the figure, where a node spanning that much would have
        // many branches ending at it: a short vertical crossed twice is a node whose stem
        // runs on as a child, or two close nodes read as one (Wilson 2020).
        if (crossing >= 2 && ending <= 1 && box.y1 - box.y0 >= longest)
        {
            verticals.splice(index, 1);
            dropped++;
        }
    }

    return dropped;
}

/**
 * Finds the branches that are drawn as nothing but a solid bar: the bar of a tip's range in
 * time, starting at the node or a few pixels from it, in a time tree whose branches are
 * otherwise thin lines. A run through such a bar is too thick to pass for a line, so the tip
 * has no branch (Tortosa 2014, where half the tips are so drawn). For each bar with a node's
 * vertical at its left end, no branch arriving there, and no segment of its own, a branch is
 * made from the vertical to the bar's far end.
 *
 * @param bars - Boxes of the solid bars: fat shapes of the line ink.
 * @param verticals - Vertical segments.
 * @param horizontals - Horizontal segments already found.
 * @param shortest - Greatest distance from the vertical at which a bar may start.
 * @param thickness - Line thickness in pixels.
 * @param nextId - First identifier number to use.
 * @returns The branches as horizontal segments.
 */
export function findBarBranches(bars: Array<Box>, verticals: Array<Segment>, horizontals: Array<Segment>, shortest: number, thickness: number, nextId: number): Array<Segment>
{
    const found = new Array<Segment>();
    const half = Math.max(1, Math.round(thickness / 2));
    let id = nextId;

    for (const bar of bars)
    {
        const middle = Math.round((bar.y0 + bar.y1) / 2);
        let taken = false;
        let arriving: Box | null = null;

        // A segment along the bar is the bar traced already; one that stops at its start is
        // the branch that runs into it, and the tip is carried through the bar from there.
        for (const segment of horizontals)
        {
            const { box } = segment;
            const onLevel = box.y1 > bar.y0 && box.y0 < bar.y1;
            const along = Math.min(box.x1, bar.x1) - Math.max(box.x0, bar.x0) >= 0.5 * (bar.x1 - bar.x0);
            const arrives = box.x1 >= bar.x0 - thickness - 2 && box.x1 <= bar.x0 + thickness + 2 && box.x0 < bar.x0 - shortest;
            taken = taken || (onLevel && (along || arrives));
            arriving = onLevel && arrives && !along ? box : arriving;
        }

        // Unless the bar ends at a node: a bar drawn along a stem, for the doubt about its
        // age, leads to the vertical of the clade beyond it, and no tip is there to carry
        // through (Pol 2012, the stems of two families). The branch that arrives then goes on
        // to the bar's far end.
        let beyond: Box | null = null;

        for (const vertical of verticals)
        {
            const { box } = vertical;

            // Within three thicknesses: a dot on the node stands between the bar and the
            // vertical.
            if (box.x1 - box.x0 >= Math.max(2, thickness / 2) && box.x0 >= bar.x1 - 2 && box.x0 <= bar.x1 + 3 * thickness && box.y0 <= middle && box.y1 > middle && (beyond === null || box.x0 < beyond.x0))
            {
                beyond = box;
            }
        }

        if (arriving !== null && beyond !== null)
        {
            arriving.x1 = beyond.x0;
        }

        if (taken)
        {
            continue;
        }

        let node: Box | null = null;

        for (const vertical of verticals)
        {
            const { box } = vertical;

            // Not the edge of a box or a symbol, which is thinner than the figure's lines.
            if (box.x1 - box.x0 >= Math.max(2, thickness / 2) && box.x1 >= bar.x0 - shortest && box.x1 <= bar.x0 + 2 && box.y0 <= middle && box.y1 > middle && (node === null || box.x1 > node.x1))
            {
                node = box;
            }
        }

        if (node !== null)
        {
            found.push({ id: `h${id++}`, orientation: "horizontal", box: { x0: node.x0, y0: middle - half, x1: beyond === null ? bar.x1 : beyond.x0, y1: middle + half + 1 } });
        }
    }

    return found;
}

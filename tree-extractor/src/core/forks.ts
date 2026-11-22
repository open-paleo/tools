/**
 * Forks drawn with slanted risers. Some trees have no verticals: each node is a point from
 * which one line slants up to a child's branch and another slants down (Averianov 2021).
 * A vertical is stood in for each fork so that the rest of the trace can read it.
 */

import type { Mask, Segment } from "./types.ts";
import { createDirectionalRunMask, dilate, findConnectedComponents, subtractMask } from "./raster.ts";

/**
 * What standing verticals in for forks changed.
 */
export type ForkResult = {
    /**
     * Number of forks given a vertical.
     */
    forks: number;
};

/**
 * A point in the image.
 */
type Point = {
    /**
     * Column.
     */
    x: number;

    /**
     * Row.
     */
    y: number;
};

/**
 * The slanted lines of one fork: where they meet, and where each ends.
 */
type Fork = {
    /**
     * The node, where the risers meet at the left.
     */
    apex: Point;

    /**
     * Ends of the risers at the right, one or two.
     */
    ends: Array<Point>;

    /**
     * Whether the risers were told as line art, not taken for lettering.
     */
    drawn: boolean;
};

/**
 * Fewest forks for a figure to count as drawn with them.
 */
const fewestForks = 3;

/**
 * Reads one piece of slanted ink as a fork: the leftmost point is the node, and the top and
 * bottom ends are where the risers arrive, when they lie to the right of it by enough for
 * the line to be slanted and not upright.
 *
 * @param labels - Component label of every pixel.
 * @param label - Label of the piece.
 * @param box - Box of the piece.
 * @param width - Image width.
 * @param area - Pixels in the piece.
 * @param thickness - Line thickness.
 * @param lineInk - Line ink, which tells a riser drawn as line art from one taken for a letter.
 * @returns The fork, or null when the piece is not one.
 */
function readFork(labels: Int32Array, label: number, box: Segment["box"], width: number, area: number, thickness: number, lineInk: Mask): Fork | null
{
    const rows = box.y1 - box.y0;
    const firsts = new Array<number>(rows).fill(-1);
    const lasts = new Array<number>(rows).fill(-1);
    let inLine = 0;

    for (let y = box.y0; y < box.y1; y++)
    {
        for (let x = box.x0; x < box.x1; x++)
        {
            if (labels[y * width + x] === label)
            {
                firsts[y - box.y0] = firsts[y - box.y0] < 0 ? x : firsts[y - box.y0];
                lasts[y - box.y0] = x;
                inLine += lineInk.data[y * width + x];
            }
        }
    }

    // A leader line to a clade's name is slanted too, and thin.
    if (area / rows < 0.6 * thickness)
    {
        return null;
    }

    let apexRow = 0;

    for (let row = 1; row < rows; row++)
    {
        if (firsts[row] >= 0 && (firsts[apexRow] < 0 || firsts[row] < firsts[apexRow]))
        {
            apexRow = row;
        }
    }

    const apex: Point = { x: firsts[apexRow], y: box.y0 + apexRow };
    const ends = new Array<Point>();

    function addEnd(row: number): void
    {
        const rise = Math.abs(row - apexRow);
        const run = lasts[row] - apex.x;

        // Slanted: at least a quarter as far across as up, beyond the line's own breadth.
        if (rise >= 2 * thickness && run - thickness >= 0.25 * rise)
        {
            ends.push({ x: lasts[row], y: box.y0 + row });
        }
    }

    addEnd(0);
    addEnd(rows - 1);

    return ends.length === 0 ? null : { apex, ends, drawn: 2 * inLine >= area };
}

/**
 * Stands a vertical in for every fork drawn with slanted risers, and carries the branches
 * the risers lead to back to it. Nothing is done unless the figure has several.
 *
 * A short riser beside a label is the size of a letter and is sorted with the lettering, so
 * the risers are looked for in all the ink; a letter's slanted stroke is told from one by
 * leading to no branch.
 *
 * @param ink - All dark ink, lettering included.
 * @param lineInk - Line ink.
 * @param horizontals - Horizontal segments; changed in place.
 * @param verticals - Vertical segments; changed in place.
 * @param thickness - Line thickness.
 * @param shortest - Shortest run that counts as a horizontal line.
 * @returns How many forks were given a vertical.
 */
export function straightenForks(ink: Mask, lineInk: Mask, horizontals: Array<Segment>, verticals: Array<Segment>, thickness: number, shortest: number): ForkResult
{
    const level = dilate(createDirectionalRunMask(ink, shortest, true), 1);
    const labeling = findConnectedComponents(subtractMask(ink, level));
    const found = new Array<Fork>();
    const reach = Math.max(3, Math.round(thickness) + 2);

    for (let index = 0; index < labeling.components.length; index++)
    {
        const component = labeling.components[index];

        if (component.box.y1 - component.box.y0 < 2 * thickness)
        {
            continue;
        }

        const fork = readFork(labeling.labels, index + 1, component.box, ink.width, component.area, thickness, lineInk);

        if (fork === null)
        {
            continue;
        }

        // The branch that arrives at a node parts its two risers, which come out as two
        // pieces with the node between them.
        let known: Fork | null = null;

        for (const other of found)
        {
            if (Math.abs(other.apex.x - fork.apex.x) <= reach && Math.abs(other.apex.y - fork.apex.y) <= 2 * reach + thickness)
            {
                known = other;
            }
        }

        if (known === null)
        {
            found.push(fork);
        }
        else
        {
            known.apex = { x: Math.min(known.apex.x, fork.apex.x), y: Math.round((known.apex.y + fork.apex.y) / 2) };
            known.ends.push(...fork.ends);
            known.drawn = known.drawn || fork.drawn;
        }
    }

    // Whether a branch begins where a riser ends.
    function leadsOn(horizontal: Segment, apex: Point, end: Point): boolean
    {
        const middle = (horizontal.box.y0 + horizontal.box.y1) / 2;

        return Math.abs(middle - end.y) <= reach && horizontal.box.x0 >= apex.x && horizontal.box.x0 <= end.x + 2 * reach && horizontal.box.x1 > end.x;
    }

    // A fork leads to a branch, or is line art at the end of the branch that arrives at it.
    const forks = new Array<Fork>();

    for (const fork of found)
    {
        let leads = false;
        let arrives = false;
        let branched = false;

        for (const horizontal of horizontals)
        {
            const middle = (horizontal.box.y0 + horizontal.box.y1) / 2;

            // A branch that leaves a riser partway up makes it a leaning vertical with
            // children along it, which the trace reads as it stands (Mateus and others 2011).
            for (const end of fork.ends)
            {
                const between = middle > Math.min(fork.apex.y, end.y) + reach && middle < Math.max(fork.apex.y, end.y) - reach;
                branched = branched || (between && horizontal.box.x0 >= fork.apex.x - reach && horizontal.box.x0 <= end.x + reach && horizontal.box.x1 > end.x + reach);
            }

            arrives = arrives || (Math.abs(middle - fork.apex.y) <= 2 * reach && Math.abs(horizontal.box.x1 - fork.apex.x) <= 2 * reach && horizontal.box.x0 < fork.apex.x - reach);

            for (const end of fork.ends)
            {
                leads = leads || leadsOn(horizontal, fork.apex, end);
            }
        }

        if (!branched && (leads || (fork.drawn && arrives)))
        {
            forks.push(fork);
        }
    }

    // Whether a vertical is an upright piece of a fork's own riser, where it is steep.
    function liesInFork(vertical: Segment, fork: Fork): boolean
    {
        let top = fork.apex.y;
        let bottom = fork.apex.y;

        for (const end of fork.ends)
        {
            top = Math.min(top, end.y);
            bottom = Math.max(bottom, end.y);
        }

        const { box } = vertical;

        return box.y0 >= top - reach && box.y1 <= bottom + reach && box.x0 >= fork.apex.x - reach && box.x1 <= fork.apex.x + (bottom - top);
    }

    // A figure drawn with forks has hardly a vertical in it. Most figures have a slanted
    // piece or two that leads to a branch, an arrow or a leaning line, among many verticals,
    // and are left as they are.
    let upright = 0;

    for (const vertical of verticals)
    {
        let inFork = false;

        for (const fork of forks)
        {
            inFork = inFork || liesInFork(vertical, fork);
        }

        // A steep riser of a fan comes out as a vertical too, in a box several lines broad;
        // an upright line's box is as broad as the line.
        const leaning = vertical.box.x1 - vertical.box.x0 > 2 * thickness + 2;
        upright += inFork || leaning ? 0 : 1;
    }

    if (forks.length < fewestForks || 2 * upright > forks.length)
    {
        return { forks: 0 };
    }

    let highestVertical = 0;
    let highestHorizontal = 0;

    for (const segment of verticals)
    {
        highestVertical = Math.max(highestVertical, Number.parseInt(segment.id.slice(1), 10) || 0);
    }

    for (const segment of horizontals)
    {
        highestHorizontal = Math.max(highestHorizontal, Number.parseInt(segment.id.slice(1), 10) || 0);
    }

    const half = Math.max(1, Math.round(thickness / 2));

    for (const fork of forks)
    {
        let top = fork.apex.y;
        let bottom = fork.apex.y;

        // The node may be a fan, whose steeper risers came out as one leaning vertical through
        // it with their branches along it. The fork's branches are then more children of that
        // node, not a node of their own beside it (Sues 2014).
        let fan: Segment | null = null;

        for (const vertical of verticals)
        {
            const { box } = vertical;
            const through = fork.apex.x >= box.x0 - reach && fork.apex.x <= box.x1 + reach && fork.apex.y >= box.y0 - reach && fork.apex.y <= box.y1 + reach;

            if (through && !liesInFork(vertical, fork) && box.y1 - box.y0 > (fan === null ? 0 : fan.box.y1 - fan.box.y0))
            {
                fan = vertical;
            }
        }

        const column = fork.apex.x;

        for (const end of fork.ends)
        {
            top = Math.min(top, end.y);
            bottom = Math.max(bottom, end.y);
            let carried = false;

            // The branch the riser leads to now begins at the node's column.
            for (const horizontal of horizontals)
            {
                if (leadsOn(horizontal, fork.apex, end))
                {
                    horizontal.box.x0 = column;
                    carried = true;
                }
            }

            if (!carried)
            {
                highestHorizontal++;
                horizontals.push({ id: `h${highestHorizontal}`, orientation: "horizontal", box: { x0: column, y0: end.y - half, x1: end.x + 1, y1: end.y + half + 1 } });
            }
        }

        // An upright piece of the riser itself is no vertical of the tree.
        for (let index = verticals.length - 1; index >= 0; index--)
        {
            if (liesInFork(verticals[index], fork))
            {
                verticals.splice(index, 1);
            }
        }

        // The fan's vertical is stood at the node's column, where its own branch arrives.
        if (fan !== null)
        {
            fan.box = { x0: fork.apex.x, y0: Math.min(fan.box.y0, top - half), x1: fork.apex.x + Math.max(2, Math.round(thickness)), y1: Math.max(fan.box.y1, bottom + half + 1) };

            for (const horizontal of horizontals)
            {
                const middle = (horizontal.box.y0 + horizontal.box.y1) / 2;

                // Its steeper risers' branches begin along its lean; they too start at the node.
                if (middle >= fan.box.y0 - reach && middle <= fan.box.y1 + reach && horizontal.box.x0 > fork.apex.x && horizontal.box.x0 <= fork.apex.x + (bottom - top) && horizontal.box.x1 > horizontal.box.x0 + reach)
                {
                    horizontal.box.x0 = fork.apex.x;
                }
            }

            continue;
        }

        highestVertical++;
        verticals.push({ id: `v${highestVertical}`, orientation: "vertical", box: { x0: fork.apex.x, y0: top - half, x1: fork.apex.x + Math.max(2, Math.round(thickness)), y1: bottom + half + 1 } });
    }

    return { forks: forks.length };
}

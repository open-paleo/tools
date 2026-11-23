/**
 * Dotted guide lines. A row of small dots ruled across a figure, a stage boundary or a grid
 * line of the time scale, is neither a branch nor lettering, and is taken out of the image
 * before anything is measured.
 */

import type { Mask, RgbaImage } from "./types.ts";
import type { Component } from "./raster.ts";
import { findConnectedComponents } from "./raster.ts";

/**
 * What erasing the dotted lines did.
 */
export type DottedLineResult = {
    /**
     * The image without them; the given image when there were none.
     */
    image: RgbaImage;

    /**
     * Number of dotted lines erased.
     */
    lines: number;
};

/**
 * Fewest dots in a row, evenly spaced, for the row to be a dotted line.
 */
const fewestDots = 8;

/**
 * Orders dots along a row.
 *
 * @param left - First dot.
 * @param right - Second dot.
 * @returns Negative when the first is further left.
 */
function compareDotColumns(left: Component, right: Component): number
{
    return left.box.x0 - right.box.x0;
}

/**
 * Orders dots along a column.
 *
 * @param left - First dot.
 * @param right - Second dot.
 * @returns Negative when the first is higher.
 */
function compareDotRows(left: Component, right: Component): number
{
    return left.box.y0 - right.box.y0;
}

/**
 * Finds the runs of evenly spaced dots among dots that share a row or a column.
 *
 * @param dots - Dots of one row or column, in order along it.
 * @param alongX - Whether they share a row.
 * @returns The dots that belong to a dotted line, run by run.
 */
function findEvenRuns(dots: Array<Component>, alongX: boolean): Array<Array<Component>>
{
    const runs = new Array<Array<Component>>();
    let run = new Array<Component>();
    let pitch = 0;

    function closeRun(): void
    {
        if (run.length >= fewestDots)
        {
            runs.push(run);
        }

        run = [];
        pitch = 0;
    }

    for (const dot of dots)
    {
        const at = alongX ? dot.box.x0 : dot.box.y0;
        const last = run.length === 0 ? null : run[run.length - 1];
        const step = last === null ? 0 : at - (alongX ? last.box.x0 : last.box.y0);

        // The dots of a line stand close, a dot or three apart. The dots of the letter i down
        // a column of labels are evenly spaced too, a row of text apart (Dai 2022).
        const size = Math.max(dot.box.x1 - dot.box.x0, dot.box.y1 - dot.box.y0);
        const close = step <= 4 * size + 2;

        if (last === null)
        {
            run.push(dot);
        }
        else if (close && (run.length === 1 || Math.abs(step - pitch) <= 2))
        {
            pitch = run.length === 1 ? step : pitch;
            run.push(dot);
        }
        else
        {
            closeRun();
            run.push(dot);
        }
    }

    closeRun();

    return runs;
}

/**
 * Erases dotted lines from an image: eight or more dots, each a few pixels across, evenly
 * spaced on one row or in one column. Each dot is painted over with the color beside it.
 * Dashes are left alone, since a doubtful branch is drawn dashed.
 *
 * @param image - Image.
 * @returns The image without its dotted lines, and how many there were.
 */
export function eraseDottedLines(image: RgbaImage): DottedLineResult
{
    const { width, height, data } = image;
    const dark: Mask = { width, height, data: new Uint8Array(width * height) };

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        dark.data[index] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2] < 200 ? 1 : 0;
    }

    const largest = Math.max(4, Math.round(Math.min(width, height) / 150));
    const rows = new Map<number, Array<Component>>();
    const columns = new Map<number, Array<Component>>();

    for (const component of findConnectedComponents(dark).components)
    {
        const { box } = component;

        // A dot is small and solid. The letters of a word in small type are as small and as
        // evenly spaced, but are strokes with white between them (Dai 2022, "aurus").
        // A speck of four pixels or under is ragged at its edge and too small to be a letter.
        const speck = box.x1 - box.x0 <= 4 && box.y1 - box.y0 <= 4;

        if (box.x1 - box.x0 > largest || box.y1 - box.y0 > largest || (!speck && component.area < 0.7 * (box.x1 - box.x0) * (box.y1 - box.y0)))
        {
            continue;
        }

        // Dots of one line can sit a pixel apart in height, so each is entered under two rows.
        for (const key of [Math.floor((box.y0 + box.y1) / 4), Math.floor((box.y0 + box.y1 + 2) / 4)])
        {
            const row = rows.get(key) ?? [];
            row.push(component);
            rows.set(key, row);
        }

        for (const key of [Math.floor((box.x0 + box.x1) / 4), Math.floor((box.x0 + box.x1 + 2) / 4)])
        {
            const column = columns.get(key) ?? [];
            column.push(component);
            columns.set(key, column);
        }
    }

    const erased = new Set<Component>();
    let lines = 0;

    for (const [groups, alongX] of [[rows, true], [columns, false]] as Array<[Map<number, Array<Component>>, boolean]>)
    {
        for (const dots of groups.values())
        {
            if (dots.length < fewestDots)
            {
                continue;
            }

            dots.sort(alongX ? compareDotColumns : compareDotRows);

            for (const run of findEvenRuns(dots, alongX))
            {
                let fresh = 0;

                for (const dot of run)
                {
                    fresh += erased.has(dot) ? 0 : 1;
                    erased.add(dot);
                }

                lines += fresh >= fewestDots ? 1 : 0;
            }
        }
    }

    if (erased.size === 0)
    {
        return { image, lines: 0 };
    }

    const cleaned = new Uint8ClampedArray(data);

    for (const dot of erased)
    {
        // The color just outside the dot's corner is the ground it stands on.
        const fromX = Math.max(0, dot.box.x0 - 2);
        const fromY = Math.max(0, dot.box.y0 - 2);
        const from = 4 * (fromY * width + fromX);

        for (let y = Math.max(0, dot.box.y0 - 1); y < Math.min(height, dot.box.y1 + 1); y++)
        {
            for (let x = Math.max(0, dot.box.x0 - 1); x < Math.min(width, dot.box.x1 + 1); x++)
            {
                const to = 4 * (y * width + x);
                cleaned[to] = data[from];
                cleaned[to + 1] = data[from + 1];
                cleaned[to + 2] = data[from + 2];
            }
        }
    }

    return { image: { width, height, data: cleaned }, lines };
}

/**
 * What drawing the dashed branches solid did.
 */
export type DashedLineResult = {
    /**
     * The image with them solid; the given image when there were none.
     */
    image: RgbaImage;

    /**
     * Number of dashed lines drawn solid.
     */
    lines: number;
};

/**
 * Fewest dashes on one level, evenly sized and spaced, for them to be a dashed line.
 */
const fewestDashes = 4;

/**
 * Whether the ink at a pixel is the end of a solid bar: it runs on for two dashes' length,
 * and stands between two and a half and ten times as tall as a dash, which a line of the tree
 * does not.
 *
 * @param dark - Dark pixels.
 * @param x - Column of the pixel.
 * @param y - Row of the pixel.
 * @param length - A dash's length.
 * @param thickness - A dash's thickness.
 * @returns True for a bar.
 */
function isBarAt(dark: Mask, x: number, y: number, length: number, thickness: number): boolean
{
    let along = 0;

    while (x + along < dark.width && along <= 2 * length && dark.data[y * dark.width + x + along] === 1)
    {
        along++;
    }

    // Measured two dashes' length in: the last dash before a bar may run into it.
    const column = Math.min(dark.width - 1, x + along - 1);
    let top = y;
    let bottom = y;

    while (top > 0 && y - top <= 10 * thickness && dark.data[(top - 1) * dark.width + column] === 1)
    {
        top--;
    }

    while (bottom < dark.height - 1 && bottom - y <= 10 * thickness && dark.data[(bottom + 1) * dark.width + column] === 1)
    {
        bottom++;
    }

    const tall = bottom - top + 1;

    return along > 2 * length && tall >= 2.5 * thickness && tall <= 10 * thickness;
}

/**
 * Draws level dashed lines solid. A branch drawn in dashes, for a lineage with no fossils
 * over that stretch, is a row of short strokes that pass for lettering, and the tip at the end
 * of it has no branch (Tortosa 2014, where most tips hang on dashes). Dashes are small solid
 * strokes longer than they are thick, alike in size, on one level, no further apart than two
 * and a half of their length. The gaps between them are filled, and so is the gap from the
 * first and the last to the ink the line runs from and to.
 *
 * Only level dashes: the rules of a time scale are dashed too, and stand upright.
 *
 * @param image - Image, turned so that the root is on the left.
 * @param threshold - Luminance below which a pixel is ink.
 * @returns The image and the number of lines drawn solid.
 */
export function joinDashedLines(image: RgbaImage, threshold: number): DashedLineResult
{
    const { width, height, data } = image;
    const dark: Mask = { width, height, data: new Uint8Array(width * height) };

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        dark.data[index] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2] < threshold ? 1 : 0;
    }

    const longest = Math.max(12, Math.round(Math.min(width, height) / 40));
    const rows = new Map<number, Array<Component>>();
    const labeling = findConnectedComponents(dark);

    for (const component of labeling.components)
    {
        const { box } = component;
        const wide = box.x1 - box.x0;
        const tall = box.y1 - box.y0;

        if (wide < 3 || wide > longest || tall > 8 || wide < 1.5 * tall || component.area < 0.6 * wide * tall)
        {
            continue;
        }

        // Dashes of one line can sit a pixel apart in height, so each is entered under two rows.
        for (const key of [Math.floor(box.y0 / 2), Math.floor((box.y0 + 1) / 2) + 100000])
        {
            const row = rows.get(key) ?? [];
            row.push(component);
            rows.set(key, row);
        }
    }

    const fills = new Array<Component["box"]>();

    for (const dashes of rows.values())
    {
        dashes.sort(compareDotColumns);
        let start = 0;

        for (let index = 1; index <= dashes.length; index++)
        {
            const previous = dashes[index - 1].box;
            const next = index < dashes.length ? dashes[index].box : null;
            const length = previous.x1 - previous.x0;
            const alike = next !== null
                && Math.abs((next.x1 - next.x0) - length) <= Math.max(2, 0.4 * length)
                && Math.abs((next.y1 - next.y0) - (previous.y1 - previous.y0)) <= 1
                && Math.abs(next.y0 - previous.y0) <= 1
                && next.x0 - previous.x1 <= 2.5 * length
                && next.x0 > previous.x1;

            if (alike)
            {
                continue;
            }

            {
                const first = dashes[start].box;
                const reach = Math.round(2.5 * length);
                let x0 = first.x0;
                let x1 = previous.x1;
                const middle = Math.floor((first.y0 + first.y1) / 2);

                // On to the ink the line starts from and ends at, a gap's width away at most.
                let fromLine = false;
                let fromTree = false;
                let toBar = false;

                for (let x = first.x0 - 1; x >= Math.max(0, first.x0 - reach); x--)
                {
                    if (dark.data[middle * width + x] === 1)
                    {
                        // A branch is joined to the tree: what the dashes start from, or
                        // run to, is a piece of ink several glyphs across, not a letter.
                        // Dashes after a name are a doubtful range drawn beside it
                        // (Brusatte 2010).
                        const source = labeling.components[labeling.labels[middle * width + x] - 1].box;
                        fromLine = source.y1 - source.y0 > 4 * longest || source.x1 - source.x0 > 4 * longest;
                        fromTree = fromLine;
                        x0 = x;
                        break;
                    }
                }

                for (let x = previous.x1; x < Math.min(width, previous.x1 + reach); x++)
                {
                    if (dark.data[middle * width + x] === 1)
                    {
                        const target = labeling.components[labeling.labels[middle * width + x] - 1].box;
                        fromLine = fromLine || target.y1 - target.y0 > 4 * longest || target.x1 - target.x0 > 4 * longest;
                        toBar = isBarAt(dark, x, middle, length, previous.y1 - previous.y0);
                        x1 = x + 1;
                        break;
                    }
                }

                // Under four dashes are a line only from the tree to a solid bar: the dash or
                // two from a node to the bar of a tip's range (Tortosa 2014). A hyphen stands
                // between letters, and a tick between two lines of the tree.
                if (!fromLine || (index - start < fewestDashes && !(fromTree && toBar)))
                {
                    start = index;
                    continue;
                }

                fills.push({ x0, y0: Math.min(first.y0, previous.y0), x1, y1: Math.max(first.y1, previous.y1) });
            }

            start = index;
        }
    }

    if (fills.length === 0)
    {
        return { image, lines: 0 };
    }

    const joined = new Uint8ClampedArray(data);

    for (const fill of fills)
    {
        for (let y = fill.y0; y < fill.y1; y++)
        {
            for (let x = fill.x0; x < fill.x1; x++)
            {
                const offset = 4 * (y * width + x);
                joined[offset] = 0;
                joined[offset + 1] = 0;
                joined[offset + 2] = 0;
            }
        }
    }

    return { image: { width, height, data: joined }, lines: fills.length };
}

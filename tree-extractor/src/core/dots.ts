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

/**
 * Wedges for collapsed clades. A clade drawn collapsed is a solid triangle with its point at
 * the node and its broad end where the tips would be. Flattened to a line it is a branch.
 */

import type { Box, Mask, RgbaImage } from "./types.ts";
import type { DashedLineResult } from "./dots.ts";
import { erode, findConnectedComponents } from "./raster.ts";

/**
 * How many pixels the dark ink is worn by to leave only what is thicker than a line.
 */
const wedgeWear = 3;

/**
 * Measures how tall the dark ink stands in a column of a box.
 *
 * @param dark - Dark ink.
 * @param box - Box of the shape.
 * @param x - Column.
 * @returns The number of dark pixels.
 */
function measureColumn(dark: Mask, box: Box, x: number): number
{
    let count = 0;

    for (let y = box.y0; y < box.y1; y++)
    {
        count += dark.data[y * dark.width + x];
    }

    return count;
}

/**
 * Flattens the wedges of collapsed clades to lines. Left as they are, a figure's ten wedges
 * are most of its ink: they set the line thickness at the thickness of a wedge, and the short
 * branches of the taxa between them are then too short for lines (Yu 2018). A wedge is a
 * solid shape thicker than a line, four times as long as tall, that grows steadily from its
 * point on the left to its full height on the right and fills about half its box. It is
 * replaced by a line from its point to its broad end, as thick as the wedge is near its point.
 *
 * @param image - Image, turned so that the root is on the left.
 * @param threshold - Luminance below which a pixel is ink.
 * @returns The image and the number of wedges flattened.
 */
export function flattenWedges(image: RgbaImage, threshold: number): DashedLineResult
{
    const { width, height, data } = image;
    const dark: Mask = { width, height, data: new Uint8Array(width * height) };

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        dark.data[index] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2] < threshold ? 1 : 0;
    }

    const wedges = new Array<Box>();
    const stout = new Set<Box>();

    for (const component of findConnectedComponents(erode(dark, wedgeWear)).components)
    {
        const core = component.box;
        const wide = core.x1 - core.x0;
        const tall = core.y1 - core.y0;

        if (wide < 60 || 2 * wide < tall || tall < 6)
        {
            continue;
        }

        const long = wide >= 4 * tall;

        // The shape the core is worn from: the core's box, grown by what was worn away.
        const box: Box = { x0: core.x0, y0: Math.max(0, core.y0 - wedgeWear - 1), x1: Math.min(width, core.x1 + wedgeWear), y1: Math.min(height, core.y1 + wedgeWear + 1) };
        const quarter = measureColumn(dark, box, core.x0 + Math.round(wide / 4));
        const half = measureColumn(dark, box, core.x0 + Math.round(wide / 2));
        const most = measureColumn(dark, box, core.x0 + Math.round((3 * wide) / 4));
        const full = measureColumn(dark, box, core.x1 - 1);
        const grows = quarter < half && half < most && most < full && full >= 2 * quarter;

        // A clade may also be collapsed to a plain triangle, about as tall as long, set at
        // the end of its branch (Brusatte 2014, seven of them, run off the edge of the
        // figure). Short as it is, it must be a triangle and nothing else: its height
        // grows in proportion along it. A silhouette or an arrowhead's barbs do not.
        const even = Math.abs(quarter - full / 4) <= 0.08 * full && Math.abs(half - full / 2) <= 0.08 * full && Math.abs(most - (3 * full) / 4) <= 0.08 * full;

        if (grows && (long || even) && 10 * component.area >= 3 * wide * tall && 10 * component.area <= 7 * wide * tall)
        {
            wedges.push(box);

            if (!long)
            {
                stout.add(box);
            }
        }
    }

    if (wedges.length === 0)
    {
        return { image, lines: 0 };
    }

    const result: RgbaImage = { width, height, data: new Uint8ClampedArray(data) };

    function paint(x: number, y: number, value: number): void
    {
        const offset = 4 * (y * width + x);

        result.data[offset] = value;
        result.data[offset + 1] = value;
        result.data[offset + 2] = value;
        result.data[offset + 3] = 255;
    }

    for (const box of wedges)
    {
        // The line runs at the height of the wedge's point, and is as thick as the wedge
        // is where the worn core begins.
        const start = Math.round((box.y0 + box.y1) / 2);
        let top = start;
        let bottom = start;

        while (top > box.y0 && dark.data[(top - 1) * width + box.x0] === 1)
        {
            top--;
        }

        while (bottom < box.y1 - 1 && dark.data[(bottom + 1) * width + box.x0] === 1)
        {
            bottom++;
        }

        const axis = Math.round((top + bottom) / 2);
        const half = Math.max(1, Math.min(wedgeWear, Math.round((bottom - top + 1) / 2)));

        // Only the wedge's own ink is taken out: in each column, the dark pixels between
        // its two edges. A name set under a wedge by its node may touch it, and the run of
        // dark pixels through the column would take the letters too, so the edges are
        // measured at the broad end, which stands clear, and drawn straight to the point.
        const end = box.x1 - wedgeWear - 2;
        let endTop = axis;
        let endBottom = axis;

        while (endTop > box.y0 && dark.data[(endTop - 1) * width + end] === 1)
        {
            endTop--;
        }

        while (endBottom < box.y1 - 1 && dark.data[(endBottom + 1) * width + end] === 1)
        {
            endBottom++;
        }

        const long = Math.max(1, end - box.x0);

        for (let x = box.x0; x < box.x1; x++)
        {
            const along = Math.min(1, (x - box.x0) / long);
            const from = Math.max(box.y0, Math.floor(top - 2 + along * (endTop - top)));
            const to = Math.min(box.y1 - 1, Math.ceil(bottom + 2 + along * (endBottom - bottom)));

            for (let y = from; y <= to; y++)
            {
                if (dark.data[y * width + x] === 1)
                {
                    paint(x, y, 255);
                }
            }

            // A long wedge becomes a branch to its broad end, where its name stands. A
            // stout triangle is taken out and the branch ends at its point: its name is
            // printed along the branch before it.
            for (let y = Math.max(0, axis - half); y <= Math.min(height - 1, axis + half) && !stout.has(box); y++)
            {
                paint(x, y, 0);
            }
        }
    }

    return { image: result, lines: wedges.length };
}

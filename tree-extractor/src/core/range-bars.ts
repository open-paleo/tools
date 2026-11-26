/**
 * Range bars too pale to be ink. A time tree draws each tip's range as a colored bar from
 * the end of its branch to its name; a bar near the ground's tone leaves the two apart.
 */

import type { ExtractionDocument, QcIssue, RgbaImage, TextLine } from "./types.ts";

/**
 * Least difference in color, summed over the channels, between a bar and the ground above
 * and below it.
 */
const barContrast = 40;

/**
 * Carries a tip through a colored bar to the name beyond it. From the end of each branch
 * that has no name, or whose name's row begins on the branch's end, the image is followed
 * to the right for as long as the row of pixels at the branch's height differs in color from
 * the rows above and below: a bar. The name that begins where the bar ends is the tip's, and
 * a row that took the bar in with its letters is cut back to the letters.
 *
 * @param document - Extraction document, after labels were assigned; changed in place.
 * @param image - The figure in the document's frame, in color.
 * @returns A note when tips were carried.
 */
export function carryTipsThroughBars(document: ExtractionDocument, image: RgbaImage): Array<QcIssue>
{
    const { width, height, data } = image;
    const glyph = document.glyphHeight;
    const apart = Math.max(4, Math.round(0.6 * glyph));
    let carried = 0;

    function differ(x: number, y: number, otherY: number): boolean
    {
        const first = 4 * (y * width + x);
        const second = 4 * (otherY * width + x);

        return Math.abs(data[first] - data[second]) + Math.abs(data[first + 1] - data[second + 1]) + Math.abs(data[first + 2] - data[second + 2]) >= barContrast;
    }

    // Where the bar that begins at a point ends, or the point itself with no bar there. A
    // bar is of one color from end to end; lettering differs from the ground too, but
    // changes from letter to gap.
    function findBarEnd(x: number, y: number): number
    {
        let end = x;
        let misses = 0;
        let first = -1;

        if (y - apart < 0 || y + apart >= height)
        {
            return x;
        }

        for (let column = x + 2; column < width && misses <= 2; column++)
        {
            const offset = 4 * (y * width + column);
            const steady = first < 0 || Math.abs(data[offset] - data[first]) + Math.abs(data[offset + 1] - data[first + 1]) + Math.abs(data[offset + 2] - data[first + 2]) < barContrast;

            if (steady && differ(column, y, y - apart) && differ(column, y, y + apart))
            {
                first = first < 0 ? offset : first;
                end = column;
                misses = 0;
            }
            else
            {
                misses++;
            }
        }

        return end;
    }

    for (const tip of document.tips)
    {
        if (tip.parent === null)
        {
            continue;
        }

        let own: TextLine | null = null;

        for (const row of document.textLines)
        {
            own = row.id === tip.textLine ? row : own;
        }

        // A tip with a name a little way off is as it should be: only a row that begins on
        // the branch's very end may have taken a bar in (Otero 2015, where a row beginning
        // a letter's breadth off was cut and a split was lost).
        if (own !== null && own.box.x0 > tip.x + 3)
        {
            continue;
        }

        // The bar may sit a pixel or two off the branch's middle.
        let end = Math.round(tip.x);
        const level = Math.round(tip.y);

        for (let offset = -2; offset <= 2; offset++)
        {
            end = Math.max(end, findBarEnd(Math.round(tip.x), level + offset));
        }

        if (end - tip.x < 2 * glyph)
        {
            continue;
        }

        if (own !== null)
        {
            // The row took the bar in: it is cut back to what stands past the bar.
            if (own.box.x1 - end >= 3 * glyph && end > own.box.x0)
            {
                own.box = { ...own.box, x0: end + 1 };
                tip.x = end;
                carried++;
            }

            continue;
        }

        let best: TextLine | null = null;

        for (const row of document.textLines)
        {
            const middle = (row.box.y0 + row.box.y1) / 2;
            const gap = row.box.x0 - end;

            if (row.role === "unassigned" && row.frame === undefined && row.glyphCount >= 3 && Math.abs(middle - tip.y) <= 0.6 * glyph && gap >= -glyph && gap <= 1.5 * glyph && (best === null || row.box.x0 < best.box.x0))
            {
                best = row;
            }
        }

        if (best !== null)
        {
            tip.textLine = best.id;
            tip.x = end;
            best.role = "tip";
            carried++;
        }
    }

    if (carried === 0)
    {
        return [];
    }

    return [{ severity: "info", code: "tips-carried-through-bars", message: `${carried} tip(s) were carried through a colored bar, too pale to be ink, to the name at its end`, subject: null }];
}

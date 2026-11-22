/**
 * Dark grounds. A band laid behind part of a tree in a deep color or a dark gray, a stage of
 * the time scale or a stratigraphic unit, is as dark as ink and would be read as one solid
 * block of it, with the branches and names over it lost inside. Such a ground is painted white
 * before anything is measured; the lines and letters over it are black and stay.
 */

import type { Mask, RgbaImage } from "./types.ts";
import { findConnectedComponents } from "./raster.ts";

/**
 * What clearing the dark grounds did.
 */
export type GroundResult = {
    /**
     * The image without them; the given image when there were none.
     */
    image: RgbaImage;

    /**
     * Number of grounds cleared.
     */
    grounds: number;
};

/**
 * Brightest channel a colored pixel may have and still pass for ink by its darkness.
 */
const darkestGround = 110;

/**
 * Strongest channel under which a gray pixel is black: ink, whatever lies behind it.
 */
const blackest = 80;

/**
 * Paints out the dark areas that are broad both ways and solid, and not black: grounds, which
 * no line is. Two kinds are dark enough to be ink: a color so deep that its strongest
 * channel passes for black, and a gray under the line threshold. A line in a dark color or a
 * gray is thin; a black line or letter is black.
 *
 * @param image - Image.
 * @param maxChroma - Largest channel spread still neutral.
 * @param darkest - Luminance below which a neutral pixel counts as line ink.
 * @param darkText - Luminance below which a pixel of any color counts as text ink: a clade's
 *   box in a color that dark is one block in the text ink, and the names on it are lost.
 * @returns The image with such grounds white, and how many there were.
 */
export function clearDarkGrounds(image: RgbaImage, maxChroma: number, darkest: number, darkText: number): GroundResult
{
    const { width, height, data } = image;
    const cleaned = new Uint8ClampedArray(data);
    const broad = Math.max(12, 0.03 * Math.min(width, height));
    let grounds = 0;

    // The two kinds are looked for apart: the gray rim of every black line would otherwise
    // join a colored band to the lines that cross it, and the whole would be no solid area.
    for (const gray of [false, true])
    {
        const dark: Mask = { width, height, data: new Uint8Array(width * height) };
        let any = false;

        for (let index = 0; index < width * height; index++)
        {
            const offset = 4 * index;
            const strongest = Math.max(data[offset], data[offset + 1], data[offset + 2]);
            const chroma = strongest - Math.min(data[offset], data[offset + 1], data[offset + 2]);
            const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
            const deepColor = chroma > maxChroma && (strongest <= darkestGround || luminance < darkText);
            const darkGray = chroma <= maxChroma && luminance < darkest && strongest >= blackest;

            if (gray ? darkGray : deepColor)
            {
                dark.data[index] = 1;
                any = true;
            }
        }

        if (!any)
        {
            continue;
        }

        const labeling = findConnectedComponents(dark);
        const found = new Set<number>();

        for (let index = 0; index < labeling.components.length; index++)
        {
            const { box, area } = labeling.components[index];
            const boxWidth = box.x1 - box.x0;
            const boxHeight = box.y1 - box.y0;

            if (Math.min(boxWidth, boxHeight) >= broad && area >= 0.6 * boxWidth * boxHeight)
            {
                found.add(index + 1);
            }
        }

        if (found.size === 0)
        {
            continue;
        }

        grounds += found.size;

        for (let index = 0; index < width * height; index++)
        {
            if (found.has(labeling.labels[index]))
            {
                cleaned[4 * index] = 255;
                cleaned[4 * index + 1] = 255;
                cleaned[4 * index + 2] = 255;
            }
        }
    }

    return grounds === 0 ? { image, grounds: 0 } : { image: { width, height, data: cleaned }, grounds };
}

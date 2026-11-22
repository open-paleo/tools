/**
 * Dark colored grounds. A band laid behind a time tree in a deep color, a stage of the time
 * scale in dark green, is as dark as ink and would be read as one solid block of it, with the
 * branches that cross it lost inside. Such a ground is painted white before anything is
 * measured; the black lines over it are neutral and stay.
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
 * Paints out the dark colored areas that are broad both ways and solid: grounds, which no
 * line is. A line in a dark color is thin, and a black line is not colored.
 *
 * @param image - Image.
 * @param maxChroma - Largest channel spread still neutral.
 * @returns The image with such grounds white, and how many there were.
 */
export function clearDarkGrounds(image: RgbaImage, maxChroma: number): GroundResult
{
    const { width, height, data } = image;
    const dark: Mask = { width, height, data: new Uint8Array(width * height) };
    let any = false;

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        const strongest = Math.max(data[offset], data[offset + 1], data[offset + 2]);
        const chroma = strongest - Math.min(data[offset], data[offset + 1], data[offset + 2]);

        if (strongest <= darkestGround && chroma > maxChroma)
        {
            dark.data[index] = 1;
            any = true;
        }
    }

    if (!any)
    {
        return { image, grounds: 0 };
    }

    const broad = Math.max(12, 0.03 * Math.min(width, height));
    const labeling = findConnectedComponents(dark);
    const grounds = new Set<number>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box, area } = labeling.components[index];
        const boxWidth = box.x1 - box.x0;
        const boxHeight = box.y1 - box.y0;

        if (Math.min(boxWidth, boxHeight) >= broad && area >= 0.6 * boxWidth * boxHeight)
        {
            grounds.add(index + 1);
        }
    }

    if (grounds.size === 0)
    {
        return { image, grounds: 0 };
    }

    const cleaned = new Uint8ClampedArray(data);

    for (let index = 0; index < width * height; index++)
    {
        if (grounds.has(labeling.labels[index]))
        {
            cleaned[4 * index] = 255;
            cleaned[4 * index + 1] = 255;
            cleaned[4 * index + 2] = 255;
        }
    }

    return { image: { width, height, data: cleaned }, grounds: grounds.size };
}

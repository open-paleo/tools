/**
 * Dark grounds. A band laid behind part of a tree in a deep color or a dark gray, a stage of
 * the time scale or a stratigraphic unit, is as dark as ink and would be read as one solid
 * block of it, with the branches and names over it lost inside. Such a ground is painted white
 * before anything is measured; the lines and letters over it are black and stay.
 */

import type { Box, Mask, RgbaImage } from "./types.ts";
import { convertToGray, erode, estimateBackground, findConnectedComponents } from "./raster.ts";

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
 * Whether black ink is drawn inside a box: two hundredths of its pixels at least.
 *
 * @param data - Image data.
 * @param width - Image width.
 * @param box - Box.
 * @returns True when the box holds ink.
 */
function holdsInk(data: Uint8ClampedArray, width: number, box: Box): boolean
{
    let black = 0;

    for (let y = box.y0; y < box.y1; y++)
    {
        for (let x = box.x0; x < box.x1; x++)
        {
            const offset = 4 * (y * width + x);
            black += Math.max(data[offset], data[offset + 1], data[offset + 2]) < blackest ? 1 : 0;
        }
    }

    return black >= 0.02 * (box.x1 - box.x0) * (box.y1 - box.y0);
}

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
 * @param coloredDarkest - Luminance below which a strongly colored pixel counts as a colored
 *   line. It lies above the text threshold, and a band of a saturated color between the two
 *   is one block of colored ink with every branch on it lost (Poole 2022, a blue of
 *   luminance 144 for the Early Jurassic).
 * @param coloredChroma - Channel spread from which a pixel is strongly colored.
 * @returns The image with such grounds white, and how many there were.
 */
export function clearDarkGrounds(image: RgbaImage, maxChroma: number, darkest: number, darkText: number, coloredDarkest = 0, coloredChroma = 255): GroundResult
{
    const { width, height, data } = image;
    const cleaned = new Uint8ClampedArray(data);
    const broad = Math.max(12, 0.03 * Math.min(width, height));
    let grounds = 0;

    // The two kinds are looked for apart: the gray rim of every black line would otherwise
    // join a colored band to the lines that cross it, and the whole would be no solid area.
    // A gray ground is looked for twice. As it stands, which finds one that fills its box.
    // And worn by two pixels: a ground with the tree running into it is joined by the soft
    // rims of the lines that leave it to every line of the figure, and is then no solid
    // area (Sen 2025, a clade's box in gray 104); the rims are a pixel thick and wear away.
    // The worn mask alone would not do: the gray of a scan is speckled, and wears away whole
    // (Gohlich 2006).
    // A third kind is looked for by itself, last: a saturated color lighter than text ink
    // and dark enough for a colored line. Taken with the deep colors it joined the bands of
    // a stage chart into areas that passed where none had (Qiu 2025).
    for (const [gray, worn, inkColored] of [[false, false, false], [true, false, false], [true, true, false], [false, false, true]])
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

            const inkColor = chroma >= coloredChroma && luminance >= darkText && luminance < coloredDarkest && strongest > darkestGround;

            if (inkColored ? inkColor : gray ? darkGray : deepColor)
            {
                dark.data[index] = 1;
                any = true;
            }
        }

        if (!any)
        {
            continue;
        }

        const solid = worn ? erode(dark, 2) : dark;
        const labeling = findConnectedComponents(solid);
        const found = new Set<number>();

        for (let index = 0; index < labeling.components.length; index++)
        {
            const { box, area } = labeling.components[index];
            const boxWidth = box.x1 - box.x0;
            const boxHeight = box.y1 - box.y0;

            // A worn gray box with a lighter one let into its corner, and the tree's lines
            // and names across it, fills under half of its bounding box. It is a tenth of the
            // figure's shorter side both ways, since the cells of a stage chart are gray with
            // names on them too, and it has ink drawn on it, which a gray bar or a drawing
            // shaded in gray has not.
            const least = worn ? Math.max(broad, 0.1 * Math.min(width, height)) : broad;

            if (Math.min(boxWidth, boxHeight) >= least && area >= (worn ? 0.45 : 0.6) * boxWidth * boxHeight && (!worn || holdsInk(data, width, box)))
            {
                found.add(index + 1);
            }
        }

        if (found.size === 0)
        {
            continue;
        }

        grounds += found.size;

        if (!worn)
        {
            for (let index = 0; index < width * height; index++)
            {
                if (found.has(labeling.labels[index]))
                {
                    cleaned[4 * index] = 255;
                    cleaned[4 * index + 1] = 255;
                    cleaned[4 * index + 2] = 255;
                }
            }

            continue;
        }

        // A worn ground goes with everything of its own tone inside its box: what was worn
        // off its edge, and the pieces of it shut inside letters and between lines, which are
        // too small to be found as ground and would stay behind as blots of ink.
        for (const label of found)
        {
            const { box } = labeling.components[label - 1];
            let sum = 0;
            let count = 0;

            for (let y = box.y0; y < box.y1; y++)
            {
                for (let x = box.x0; x < box.x1; x++)
                {
                    if (labeling.labels[y * width + x] === label)
                    {
                        const offset = 4 * (y * width + x);
                        sum += 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
                        count++;
                    }
                }
            }

            const tone = sum / Math.max(1, count);

            for (let y = Math.max(0, box.y0 - 3); y < Math.min(height, box.y1 + 3); y++)
            {
                for (let x = Math.max(0, box.x0 - 3); x < Math.min(width, box.x1 + 3); x++)
                {
                    const offset = 4 * (y * width + x);
                    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

                    // And with what is lighter than it: the soft edge where the ground meets
                    // white, which is left as a hairline down each side of the box.
                    if (dark.data[y * width + x] === 1 && luminance >= tone - 25)
                    {
                        cleaned[offset] = 255;
                        cleaned[offset + 1] = 255;
                        cleaned[offset + 2] = 255;
                    }
                }
            }
        }
    }

    return grounds === 0 ? { image, grounds: 0 } : { image: { width, height, data: cleaned }, grounds };
}

/**
 * Share of the image that gray bands must cover for them to be flattened.
 */
const bandShare = 0.15;

/**
 * Lifts gray bands behind a figure to white. A time tree drawn over the bands of a stage
 * chart, each a different gray and the darkest shaded from one edge to the other, has no one
 * threshold that tells its lines from its ground: the darkest band is ink in patches, and
 * the edge between two bands is a line the length of the figure (Zaher 2011, where two such
 * edges were nodes with the whole tree under them). Each neutral pixel is set against the
 * ground about it, the image with everything dark and narrower than twice the radius taken
 * out, and takes the share of white that it has of that ground: the band comes out white,
 * a black line on it black, and a rule a little darker than its band a light gray.
 *
 * Nothing is done unless the gray ground is a good part of the figure. Every gray ground is
 * then lifted, a clade's box or a shaded shape with the bands: keeping to what is broad both
 * ways was tried, and lost more than it kept (Scannella 2014, Gohlich 2006).
 *
 * @param image - Image.
 * @param maxChroma - Largest channel spread still neutral.
 * @returns The image with its bands white, and whether any were found.
 */
export function flattenGrayBands(image: RgbaImage, maxChroma: number): GroundResult
{
    const { width, height, data } = image;
    const radius = Math.max(12, Math.round(0.02 * Math.min(width, height)));
    const gray = convertToGray(image);
    const ground = estimateBackground(gray, radius);
    let banded = 0;

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        const chroma = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]);

        // A pixel of a band: neutral, at the level of its ground, and that level a gray.
        banded += chroma <= maxChroma && ground.data[index] >= 130 && ground.data[index] < 250 && ground.data[index] - gray.data[index] <= 6 ? 1 : 0;
    }

    if (banded < bandShare * width * height)
    {
        return { image, grounds: 0 };
    }

    const flattened = new Uint8ClampedArray(data);

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        const chroma = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]);
        const level = ground.data[index];

        if (chroma > maxChroma || level < 130 || level >= 250)
        {
            continue;
        }

        const value = Math.min(255, Math.round((255 * gray.data[index]) / level));

        flattened[offset] = value;
        flattened[offset + 1] = value;
        flattened[offset + 2] = value;
    }

    return { image: { width, height, data: flattened }, grounds: 1 };
}

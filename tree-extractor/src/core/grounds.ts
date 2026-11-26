/**
 * Dark grounds. A band laid behind part of a tree in a deep color or a dark gray, a stage of
 * the time scale or a stratigraphic unit, is as dark as ink and would be read as one solid
 * block of it, with the branches and names over it lost inside. Such a ground is painted white
 * before anything is measured; the lines and letters over it are black and stay.
 */

import type { Box, Mask, RgbaImage } from "./types.ts";
import { convertToGray, dilate, erode, estimateBackground, findConnectedComponents } from "./raster.ts";

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

    /**
     * Where they were, when the step gives that: the boxes it painted white.
     */
    boxes?: Array<Box>;
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

/**
 * Blanks the pictures set beside a tree: a photograph or a drawing in full color, a block of
 * the page a tenth of its shorter side both ways, colored all over and textured in its
 * colors. Its texture is hundreds of small shapes, which outnumber the letters of the figure
 * and set its letter height, and pieces of it pass for a tree larger than the tree (Regalado
 * Fernandez 2022, four micrographs of bone beside a tree of fourteen tips, of which none was
 * named). A colored band with a tree drawn over it, or a stage chart, is as large and as
 * colored, and flat.
 *
 * @param image - Image.
 * @param maxChroma - Largest channel spread still neutral.
 * @returns The image with such pictures white, and how many there were.
 */
export function blankPictures(image: RgbaImage, maxChroma: number): GroundResult
{
    const { width, height, data } = image;
    const colored: Mask = { width, height, data: new Uint8Array(width * height) };
    const black: Mask = { width, height, data: new Uint8Array(width * height) };
    let any = 0;

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        const strongest = Math.max(data[offset], data[offset + 1], data[offset + 2]);
        const chroma = strongest - Math.min(data[offset], data[offset + 1], data[offset + 2]);

        colored.data[index] = chroma > maxChroma + 10 ? 1 : 0;
        black.data[index] = chroma <= maxChroma && strongest < 110 ? 1 : 0;
        any += colored.data[index];
    }

    const shorter = Math.min(width, height);

    if (any < 0.01 * width * height)
    {
        return { image, grounds: 0 };
    }

    const radius = Math.max(4, Math.round(0.008 * shorter));
    const labeling = findConnectedComponents(erode(dilate(colored, radius), radius));
    const boxes = new Array<Box>();

    for (const component of labeling.components)
    {
        const { box, area } = component;
        const boxWidth = box.x1 - box.x0;
        const boxHeight = box.y1 - box.y0;

        if (Math.min(boxWidth, boxHeight) < 0.1 * shorter || area < 0.85 * boxWidth * boxHeight)
        {
            continue;
        }

        // A picture is textured in its colors: neighboring pixels both colored and far
        // apart in tone, all over it. It holds little black, and a good part of it is off
        // its commonest tone. A band is one flat color and what is drawn on it is black
        // (Poole 2022, Foth 2017, Moutrille 2025).
        const tones = new Array<number>(16).fill(0);
        let textured = 0;
        let inked = 0;

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                const index = y * width + x;
                const here = 0.299 * data[4 * index] + 0.587 * data[4 * index + 1] + 0.114 * data[4 * index + 2];

                tones[Math.min(15, Math.floor(here / 16))]++;
                inked += black.data[index];

                if (x > box.x0 && colored.data[index] === 1 && colored.data[index - 1] === 1)
                {
                    const before = 0.299 * data[4 * index - 4] + 0.587 * data[4 * index - 3] + 0.114 * data[4 * index - 2];

                    textured += Math.abs(here - before) >= 40 ? 1 : 0;
                }
            }
        }

        let commonest = 0;

        for (let tone = 1; tone < 16; tone++)
        {
            commonest = tones[tone] > tones[commonest] ? tone : commonest;
        }

        const size = boxWidth * boxHeight;
        const onTone = tones[commonest] + (tones[commonest - 1] ?? 0) + (tones[commonest + 1] ?? 0);

        if (100 * textured < size || 100 * inked >= 3 * size || 5 * onTone > 4 * size)
        {
            continue;
        }

        // And it stands by itself. A clade's box laid over the tree in a wash of color is
        // textured too, by the tree's lines tinted in it, and has little black; but the
        // branches run into it from outside (Raven 2023).
        let crossings = 0;
        let inDark = false;

        // A branch that runs into the box comes from well outside it: dark ink six pixels
        // out that goes on outward for a fiftieth of the image. The picture's own rim, and
        // the letters of a caption under it, do not.
        const far = Math.max(30, Math.round(0.02 * shorter));

        function isDark(x: number, y: number): boolean
        {
            return x >= 0 && y >= 0 && x < width && y < height && Math.max(data[4 * (y * width + x)], data[4 * (y * width + x) + 1], data[4 * (y * width + x) + 2]) < 110;
        }

        function countAt(x: number, y: number, stepX: number, stepY: number): void
        {
            let reach = 0;

            while (reach <= far && isDark(x + reach * stepX, y + reach * stepY))
            {
                reach++;
            }

            const entering = reach > far;

            crossings += entering && !inDark ? 1 : 0;
            inDark = entering;
        }

        for (let x = box.x0; x < box.x1; x++)
        {
            countAt(x, box.y0 - 6, 0, -1);
        }

        for (let y = box.y0; y < box.y1; y++)
        {
            countAt(box.x1 + 5, y, 1, 0);
        }

        for (let x = box.x1 - 1; x >= box.x0; x--)
        {
            countAt(x, box.y1 + 5, 0, 1);
        }

        for (let y = box.y1 - 1; y >= box.y0; y--)
        {
            countAt(box.x0 - 6, y, -1, 0);
        }

        if (crossings <= 1)
        {
            boxes.push(box);
        }
    }

    if (boxes.length === 0)
    {
        return { image, grounds: 0 };
    }

    const blanked = new Uint8ClampedArray(data);

    for (const box of boxes)
    {
        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                blanked[4 * (y * width + x)] = 255;
                blanked[4 * (y * width + x) + 1] = 255;
                blanked[4 * (y * width + x) + 2] = 255;
            }
        }
    }

    return { image: { width, height, data: blanked }, grounds: boxes.length, boxes };
}

/**
 * Least share of the image a flat ground covers.
 */
const flatShare = 0.005;

/**
 * Largest difference in color, summed over the channels, between a ground's pixel and the
 * pixel the search for it began at.
 */
const flatSpread = 30;

/**
 * Luminance from which a flat ground is left alone: lighter than faint ink is taken to be.
 */
const lightestFlatGround = 200;

/**
 * Largest difference between the channels of a flat ground that is lifted.
 */
const mostFlatChroma = 60;

/**
 * A flat ground of color: its color and the box it lies in.
 */
type FlatGround = {
    /**
     * Mean red, green and blue.
     */
    color: Array<number>;

    /**
     * Extent of the pieces of this color.
     */
    box: Box;

    /**
     * Pixels of the color, over all pieces.
     */
    area: number;

    /**
     * Extent and pixels of the large pieces alone, before small ones were added.
     */
    core?: FlatGround;
};

/**
 * Lifts flat grounds of color to white: a box of one plain color laid behind a clade, with
 * the lines and the names over it. Such a ground is lighter than the lines and may still be
 * darker than lettering is taken to be, so the whole box counts as lettering and the names
 * on it are lost (Raven 2023: grounds in gray-blue, purple and gray-green). Only a muted
 * ground that dark is lifted. The lines cut a
 * ground into pieces, so pieces of one color are taken together and everything in the box
 * they span is redrawn in gray by how much darker than the ground it is: the ground and
 * what is lighter go white, the ink goes black whatever its color.
 *
 * @param image - The figure.
 * @returns The image, and how many grounds were lifted.
 */
export function flattenFlatGrounds(image: RgbaImage): GroundResult
{
    const { width, height, data } = image;
    const count = width * height;
    const seen = new Uint8Array(count);
    const stack = new Array<number>();
    const found = new Array<FlatGround>();
    const scraps = new Array<FlatGround>();

    function isSameColor(first: Array<number>, second: Array<number>): boolean
    {
        return Math.abs(first[0] - second[0]) + Math.abs(first[1] - second[1]) + Math.abs(first[2] - second[2]) <= flatSpread;
    }

    function uniteBoxes(first: Box, second: Box): Box
    {
        return { x0: Math.min(first.x0, second.x0), y0: Math.min(first.y0, second.y0), x1: Math.max(first.x1, second.x1), y1: Math.max(first.y1, second.y1) };
    }

    function isCandidate(index: number): boolean
    {
        const offset = 4 * index;
        const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
        const chroma = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]);

        return luminance >= darkestGround && (luminance < 235 || chroma > 20);
    }

    for (let start = 0; start < count; start++)
    {
        if (seen[start] === 1 || !isCandidate(start))
        {
            continue;
        }

        const red = data[4 * start];
        const green = data[4 * start + 1];
        const blue = data[4 * start + 2];
        const box = { x0: width, y0: height, x1: 0, y1: 0 };
        const sums = [0, 0, 0];
        let area = 0;
        seen[start] = 1;
        stack.push(start);

        while (stack.length > 0)
        {
            const index = stack.pop() as number;
            const x = index % width;
            const y = (index - x) / width;
            area++;
            sums[0] += data[4 * index];
            sums[1] += data[4 * index + 1];
            sums[2] += data[4 * index + 2];
            box.x0 = Math.min(box.x0, x);
            box.y0 = Math.min(box.y0, y);
            box.x1 = Math.max(box.x1, x + 1);
            box.y1 = Math.max(box.y1, y + 1);

            for (const step of [-1, 1, -width, width])
            {
                const next = index + step;

                if (next < 0 || next >= count || (step === -1 && x === 0) || (step === 1 && x === width - 1) || seen[next] === 1)
                {
                    continue;
                }

                const offset = 4 * next;

                if (Math.abs(data[offset] - red) + Math.abs(data[offset + 1] - green) + Math.abs(data[offset + 2] - blue) <= flatSpread)
                {
                    seen[next] = 1;
                    stack.push(next);
                }
            }
        }

        const color = [sums[0] / area, sums[1] / area, sums[2] / area];

        // A large piece begins a ground, or is more of one of its color already met. A
        // small piece is kept for later: where many lines cross a ground, most of it lies
        // in pieces too small to begin one.
        if (area < flatShare * count)
        {
            if (area >= 0.04 * flatShare * count)
            {
                scraps.push({ color, box, area });
            }

            continue;
        }

        let joined = false;

        for (const ground of found)
        {
            if (!joined && isSameColor(ground.color, color))
            {
                ground.box = uniteBoxes(ground.box, box);
                ground.area += area;
                joined = true;
            }
        }

        if (!joined)
        {
            found.push({ color, box, area });
        }
    }

    // The small pieces of a ground's color that lie against it are part of it (Hu 2009: a
    // gray band with the tree's nodes in it, cut by thirteen branches into strips, of which
    // the pieces large enough filled six tenths of what they spanned, short of a ground).
    const near = Math.max(4, Math.round(0.01 * Math.min(width, height)));
    let grown = true;

    for (const ground of found)
    {
        ground.core = { color: ground.color, box: ground.box, area: ground.area };
    }

    while (grown)
    {
        grown = false;

        for (const ground of found)
        {
            for (let index = scraps.length - 1; index >= 0; index--)
            {
                const scrap = scraps[index];
                const apart = scrap.box.x0 > ground.box.x1 + near || scrap.box.x1 < ground.box.x0 - near || scrap.box.y0 > ground.box.y1 + near || scrap.box.y1 < ground.box.y0 - near;

                if (!apart && isSameColor(ground.color, scrap.color))
                {
                    ground.box = uniteBoxes(ground.box, scrap.box);
                    ground.area += scrap.area;
                    scraps.splice(index, 1);
                    grown = true;
                }
            }
        }
    }

    let result: Uint8ClampedArray | null = null;
    let grounds = 0;

    for (const whole of found)
    {
        // Small pieces may lie far along a figure from the ground they were added to, and
        // the box they span is then mostly something else: the large pieces alone are the
        // ground (Xu 2018, Jimenez-Velandia 2025, each of which lost a name to it).
        const core = whole.core ?? whole;
        const ground = whole.area >= 0.6 * (whole.box.x1 - whole.box.x0) * (whole.box.y1 - whole.box.y0) ? whole : core;
        const { box, color } = ground;
        const boxArea = (box.x1 - box.x0) * (box.y1 - box.y0);

        // How much darker than the ground a pixel is, at its darkest channel.
        function measureDepth(offset: number): number
        {
            return Math.max(0, color[0] - data[offset], color[1] - data[offset + 1], color[2] - data[offset + 2]);
        }

        // A ground behind a tree fills most of its box and has the tree's ink over it. A
        // plain block of color has no ink, and a color scattered over the figure fills
        // little of the box its pieces span.
        let inked = 0;

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                inked += measureDepth(4 * (y * width + x)) >= 90 ? 1 : 0;
            }
        }

        // And it is dark enough to pass for ink. A lighter ground does no harm as it is,
        // and there are many: bands of a time scale, the cells of a chart.
        const luminance = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];

        // And it is muted. The strong colors are those of a time scale's cells and strips;
        // lifting them gained nine names and lost ten, on Jimenez-Velandia 2025,
        // Sanchez-Fenollosa 2025 and four more.
        const chroma = Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2]);

        if (ground.area < 0.6 * boxArea || inked < 0.005 * boxArea || luminance >= lightestFlatGround || chroma > mostFlatChroma)
        {
            continue;
        }

        result = result ?? new Uint8ClampedArray(data);
        grounds++;

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                const offset = 4 * (y * width + x);
                const gray = 255 - Math.min(255, Math.round(2.4 * Math.max(0, measureDepth(offset) - 12)));

                result[offset] = gray;
                result[offset + 1] = gray;
                result[offset + 2] = gray;
            }
        }
    }

    return { image: result === null ? image : { width, height, data: result }, grounds };
}

/**
 * Things drawn in color or around the figure that the neutral line ink leaves out or lets in
 * wrongly: thin colored lines (branches drawn in color), fat colored shapes (range ovals, clade
 * fills), and the frame some figures draw around themselves.
 */

import type { Box, ExtractionDocument, Mask, QcIssue, RgbaImage, Segment } from "./types.ts";
import { createDirectionalRunMask, createMaskFromComponents, dilate, erode, findConnectedComponents, subtractMask, closeMask, invertMask, unionMask } from "./raster.ts";
import { deleteTip } from "./edit.ts";

/**
 * Colored ink split by shape.
 */
export type ColoredInk = {
    /**
     * Thin colored strokes: lines drawn in color, which belong with the line ink.
     */
    thin: Mask;

    /**
     * Fat colored shapes: markers and fills, which are neither lines nor text.
     */
    fat: Mask;
};

/**
 * Splits the dark colored pixels of an image into thin strokes and fat shapes. A shape is fat
 * where it survives an erosion of the given radius; the fat mask is that core grown back by a
 * pixel more, so that the anti-aliased rim of a marker goes with the marker.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which a colored pixel counts as dark.
 * @param minChroma - Chroma a pixel must exceed to count as colored. Set well above the
 * neutral limit, since JPEG leaves fringes of moderate chroma along black lines on tinted
 * backgrounds, and those would thicken the lines with false ink.
 * @param radius - Half-width of the erosion square; strokes thinner than its width are thin.
 * @returns The two masks.
 */
export function splitColoredInk(image: RgbaImage, threshold: number, minChroma: number, radius: number): ColoredInk
{
    const colored = createColoredMask(image, threshold, minChroma);
    const core = erode(colored, radius);
    const grown = dilate(core, radius + 1);
    const fat = subtractMask(colored, subtractMask(colored, grown));
    // A fat piece that is a long strip, several times longer than it is wide and no wider
    // than a few line thicknesses, is a thick colored line, a branch drawn in color (Wu 2015's
    // ten-pixel subgenus branches), not a marker; it goes with the thin ink.
    const labeling = findConnectedComponents(fat);
    const strips = new Set<number>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];
        const width = box.x1 - box.x0;
        const height = box.y1 - box.y0;
        const shorter = Math.min(width, height);
        const longer = Math.max(width, height);

        if (shorter <= 4 * radius && longer >= 4 * shorter)
        {
            strips.add(index + 1);
        }
    }

    const stripMask = createMaskFromComponents(labeling.labels, strips, fat.width, fat.height);
    const fatShapes = subtractMask(fat, stripMask);
    const thin = subtractMask(colored, fatShapes);
    removeOutlines(thin, 8 * radius, 2 * radius + 3);

    return { thin, fat: fatShapes };
}

/**
 * Luminance below which a color of moderate chroma is a dark, muted line color.
 */
const mutedLuminance = 110;

/**
 * Chroma a dark, muted color must exceed.
 */
const mutedChroma = 60;

/**
 * Luminance below which a color of high chroma is a vivid line color.
 */
const vividLuminance = 200;

/**
 * Chroma a vivid color must exceed.
 */
const vividChroma = 150;

/**
 * Narrowest a colored shape can be and still be an arrowhead or a dot, in pixels.
 */
const slightestHead = 6;

/**
 * Keeps the thin colored ink that is drawn as lines: the pieces holding a straight horizontal
 * or vertical run of some length. Thin colored ink joins the line ink, for trees drawn in
 * color; but the head of a colored arrow pointing at a node, too small to count as a fat
 * shape, is thin colored ink as well, and where it touches the tree it becomes part of it: a
 * vertical merged with the head, in the wrong place and without its parent (Alarcon-Munoz
 * 2023). A branch has a straight run; a head, a dot or a colored letter has none.
 *
 * @param thin - Thin colored ink.
 * @param minRun - Shortest straight run that makes a piece a line.
 * @returns The thin colored ink in pieces that hold such a run, or are too slight for a head.
 */
export function keepColoredLines(thin: Mask, minRun: number): Mask
{
    const straight = unionMask(createDirectionalRunMask(thin, minRun, true), createDirectionalRunMask(thin, minRun, false));
    const { components, labels } = findConnectedComponents(thin);
    const lines = new Set<number>();

    for (let index = 0; index < straight.data.length; index++)
    {
        if (straight.data[index] === 1)
        {
            lines.add(labels[index]);
        }
    }

    // A piece too slight to hold such a run, a short stub or the end of a colored bar, is no
    // arrowhead either: it is thinner than any head.
    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];

        if (Math.min(box.x1 - box.x0, box.y1 - box.y0) < slightestHead)
        {
            lines.add(index + 1);
        }
    }

    return components.length === lines.size ? thin : createMaskFromComponents(labels, lines, thin.width, thin.height);
}

/**
 * Fills the stretches of one direction where lettering lies on a lighter line: runs of dark
 * pixels, no longer than the reach, with the line's tone right at both ends, that lie side by
 * side across at least half the line's thickness.
 *
 * @param tone - Per pixel: 2 for a line's lighter tone, 1 for dark ink, 0 for neither.
 * @param width - Width of the tone image.
 * @param height - Height of the tone image.
 * @param reach - Longest run of dark pixels carried across.
 * @param least - How many neighboring rows must carry the same stretch.
 * @param most - How many may: more than a line is thick, and it is no line.
 * @param level - True to work along rows, false along columns.
 * @param result - Mask the stretches are set in.
 */
function fillUnderLettering(tone: Uint8Array, width: number, height: number, reach: number, least: number, most: number, level: boolean, result: Mask): void
{
    const along = level ? width : height;
    const across = level ? height : width;
    const found = new Uint8Array(width * height);

    function locate(position: number, line: number): number
    {
        return level ? line * width + position : position * width + line;
    }

    for (let line = 0; line < across; line++)
    {
        let position = 1;

        while (position < along - 1)
        {
            if (tone[locate(position, line)] !== 1 || tone[locate(position - 1, line)] !== 2)
            {
                position++;
                continue;
            }

            let end = position;

            while (end < along && tone[locate(end, line)] === 1 && end - position <= reach)
            {
                end++;
            }

            if (end < along && end - position <= reach && tone[locate(end, line)] === 2)
            {
                // With the line's own pixels beside the letters, as far as the reach: the
                // pieces of line between two letters are part of the stretch.
                let from = position;
                let to = end;

                while (from > 0 && position - from < reach && tone[locate(from - 1, line)] === 2)
                {
                    from--;
                }

                while (to < along && to - end < reach && tone[locate(to, line)] === 2)
                {
                    to++;
                }

                // Three pixels of the line's tone at each end: the soft edge of a letter is
                // of that tone too, one pixel of it on each side of every stroke.
                if (position - from >= 3 && to - end >= 3)
                {
                    for (let fill = from; fill < to; fill++)
                    {
                        found[locate(fill, line)] = 1;
                    }
                }
            }

            position = Math.max(end, position + 1);
        }
    }

    // A stretch stands when it is as broad as a line: on one row alone it is the edge of a
    // letter beside something tinted, and broader than a line it is lettering on a tint.
    for (let position = 0; position < along; position++)
    {
        let start = -1;

        for (let line = 0; line <= across; line++)
        {
            const set = line < across && found[locate(position, line)] === 1;

            if (set && start < 0)
            {
                start = line;
            }
            else if (!set && start >= 0)
            {
                if (line - start >= least && line - start <= most)
                {
                    for (let fill = start; fill < line; fill++)
                    {
                        result.data[locate(position, fill)] = 1;
                    }
                }

                start = -1;
            }
        }
    }
}

/**
 * Finds the stretches of colored or gray lines that black lettering is printed on. A figure
 * with its branches in color and in gray and a number at each node has the numbers lie on the
 * steps between the branches; the step is then in pieces between the digits, each too short
 * and too broken to be line, and the tree parts there (Cau 2018, an age at every node).
 *
 * @param image - Image.
 * @param lineThreshold - Luminance below which a neutral pixel is line ink.
 * @param maxChroma - Largest channel spread still neutral.
 * @param thickness - Thickness of the figure's colored lines.
 * @returns Mask of the lettering that lies on such lines.
 */
export function bridgeUnderLettering(image: RgbaImage, lineThreshold: number, maxChroma: number, thickness: number): Mask
{
    const { width, height } = image;
    const tone = new Uint8Array(width * height);
    const marked: Mask = { width, height, data: new Uint8Array(width * height) };

    for (let index = 0; index < width * height; index++)
    {
        const red = image.data[index * 4];
        const green = image.data[index * 4 + 1];
        const blue = image.data[index * 4 + 2];
        const strongest = Math.max(red, green, blue);
        const chroma = strongest - Math.min(red, green, blue);
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;

        marked.data[index] = luminance < 245 || chroma > 20 ? 1 : 0;

        // Black printed on a color comes out as a dark shade of the color, so what tells
        // lettering is that no channel is strong, not that the pixel is neutral.
        if (chroma <= maxChroma)
        {
            tone[index] = luminance < 100 ? 1 : luminance < lineThreshold ? 2 : 0;
        }
        else if (strongest < 140)
        {
            tone[index] = 1;
        }
        else if (chroma >= 70 && luminance < 240)
        {
            tone[index] = 2;
        }
    }

    // A tinted ground with lettering on it has the tone on both sides of every letter as
    // well. A ground is broad where a line is not, and solid together with its lettering:
    // what is left of everything that is not white after wearing away three quarters of a
    // line's thickness is ground, and no line's tone (Delcourt 2018, names on a blue panel).
    const broad = Math.ceil(0.75 * thickness);
    const ground = dilate(erode(marked, broad), broad + 1);

    for (let index = 0; index < width * height; index++)
    {
        if (ground.data[index] === 1 && tone[index] === 2)
        {
            tone[index] = 0;
        }
    }

    const result: Mask = { width, height, data: new Uint8Array(width * height) };
    const reach = Math.round(3 * thickness);
    const least = Math.max(2, Math.floor(thickness / 2));
    const most = Math.floor(1.5 * thickness) + 1;
    fillUnderLettering(tone, width, height, reach, least, most, true, result);
    fillUnderLettering(tone, width, height, reach, least, most, false, result);

    return result;
}

/**
 * Draws on the lines that a small colored shape covers. An arrowhead is drawn over the tree,
 * so where its point lies on a branch the branch has a hole the size of the head once the
 * head is no longer line ink. On each row and each column of the shape, where dark ink stands
 * right at both of its edges, the line is carried across.
 *
 * @param dark - Neutral dark ink.
 * @param shapes - The colored shapes that were kept out of the line ink.
 * @param reach - How near to an edge the dark ink must stand.
 * @param run - Length of line the ink beyond each edge must make, straight on from the
 *   stretch carried across; 0 asks for no more than ink at the edge. A shape with lettering
 *   beside it has ink at its edge and no line.
 * @returns Mask of the stretches carried across.
 */
export function bridgeUnderShapes(dark: Mask, shapes: Mask, reach: number, run = 0): Mask
{
    const { width, height } = dark;
    const data = new Uint8Array(width * height);
    const { components, labels } = findConnectedComponents(shapes);

    function hasDark(x0: number, x1: number, y0: number, y1: number): boolean
    {
        for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++)
        {
            for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++)
            {
                if (dark.data[y * width + x] === 1)
                {
                    return true;
                }
            }
        }

        return false;
    }

    // Whether a straight line of ink leaves a point, along a row or a column.
    function hasLine(x: number, y: number, stepX: number, stepY: number): boolean
    {
        for (let offset = 0; offset < reach && run > 0; offset++)
        {
            let length = 0;
            let atX = x + stepX * offset;
            let atY = y + stepY * offset;

            while (atX >= 0 && atY >= 0 && atX < width && atY < height && dark.data[atY * width + atX] === 1 && length < run)
            {
                length++;
                atX += stepX;
                atY += stepY;
            }

            if (length >= run)
            {
                return true;
            }
        }

        return run === 0;
    }

    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];
        const label = index + 1;

        for (let y = box.y0; y < box.y1; y++)
        {
            let first = -1;
            let last = -1;

            for (let x = box.x0; x < box.x1; x++)
            {
                if (labels[y * width + x] === label)
                {
                    first = first < 0 ? x : first;
                    last = x;
                }
            }

            if (first >= 0 && hasDark(first - reach, first - 1, y, y) && hasDark(last + 1, last + reach, y, y) && hasLine(first - 1, y, -1, 0) && hasLine(last + 1, y, 1, 0))
            {
                data.fill(1, y * width + first, y * width + last + 1);
            }
        }

        for (let x = box.x0; x < box.x1; x++)
        {
            let first = -1;
            let last = -1;

            for (let y = box.y0; y < box.y1; y++)
            {
                if (labels[y * width + x] === label)
                {
                    first = first < 0 ? y : first;
                    last = y;
                }
            }

            if (first >= 0 && hasDark(x, x, first - reach, first - 1) && hasDark(x, x, last + 1, last + reach) && hasLine(x, first - 1, 0, -1) && hasLine(x, last + 1, 0, 1))
            {
                for (let y = first; y <= last; y++)
                {
                    data[y * width + x] = 1;
                }
            }
        }
    }

    return { width, height, data };
}

/**
 * Marks pixels that are both dark and strongly colored.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which a pixel counts as dark.
 * @param minChroma - Chroma a pixel must exceed.
 * @returns The mask.
 */
export function createColoredMask(image: RgbaImage, threshold: number, minChroma: number): Mask
{
    const { width, height, data } = image;
    const mask = new Uint8Array(width * height);

    for (let index = 0; index < width * height; index++)
    {
        const offset = index * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

        if (luminance < threshold && chroma > minChroma)
        {
            mask[index] = 1;
        }
    }

    return { width, height, data: mask };
}

/**
 * Finds the lines drawn in the two kinds of color the main rule leaves out. Bands, fills and
 * photographs hold such colors too: what survives an erosion goes, and so does the rim it
 * leaves and any outline of a shape, as for the main colored ink.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which the main rule counts a colored pixel as dark.
 * @param minChroma - Chroma the main rule requires.
 * @param radius - Half-width of the erosion square; strokes thinner than its width are thin.
 * @param beside - The thin ink of the main colored rule, or null. A stretch of a branch may
 *   be drawn in another color than the rest, where branches are colored by a rate, say, and
 *   a short one in a muted color is by itself too short for a line: it is judged together
 *   with the colored ink it continues (Meso 2024, 33 pixels of purple between blue).
 * @returns The pixels of those lines.
 */
export function findOffColorLines(image: RgbaImage, threshold: number, minChroma: number, radius: number, beside: Mask | null = null): Mask
{
    const offColor = createOffColorMask(image, threshold, minChroma);
    const thin = subtractMask(offColor, dilate(erode(offColor, radius), radius + 2));
    removeOutlines(thin, 8 * radius, 2 * radius + 3);
    removeLoops(thin, Math.max(2, radius), 8 * radius);
    const lines = keepColoredLines(thin, 6 * radius);
    removeDashes(lines);

    if (beside === null)
    {
        return lines;
    }

    // A piece too short to stand as a line is one all the same where it joins two ends of
    // the colored ink: touched at two places as far apart as most of its own length. An
    // edge of a colored bar, or a mark beside a colored branch, touches it at one.
    const near = dilate(beside, 1);
    const labeling = findConnectedComponents(thin);
    const joiners = new Array<number>();

    for (let label = 1; label <= labeling.components.length; label++)
    {
        const { box } = labeling.components[label - 1];
        const long = Math.max(box.x1 - box.x0, box.y1 - box.y0);
        const upright = box.y1 - box.y0 >= box.x1 - box.x0;
        const touched = new Set<number>();
        let first = -1;
        let last = -1;
        let kept = false;

        if (long < 2 * radius)
        {
            continue;
        }

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                const index = y * thin.width + x;

                if (labeling.labels[index] !== label)
                {
                    continue;
                }

                kept = kept || lines.data[index] === 1;

                if (near.data[index] === 1)
                {
                    const along = upright ? y : x;
                    first = first < 0 ? along : Math.min(first, along);
                    last = Math.max(last, along);
                    touched.add(along);
                }
            }
        }

        // At its two ends, and no broader than a line: within a fifth of its length of
        // each end, and its short side no more than the erosion took for thin.
        const start = upright ? box.y0 : box.x0;
        const end = upright ? box.y1 - 1 : box.x1 - 1;
        const across = Math.min(box.x1 - box.x0, box.y1 - box.y0);

        // And as broad as a line, touched at its ends alone: the soft fringe of a colored
        // line is an off-color sliver a pixel or two broad that lies against it all the
        // way (Delcourt 2018, Foth 2017).
        if (kept || first < 0 || first - start > 0.2 * long || end - last > 0.2 * long || across > radius + 2 || across < radius || 10 * touched.size > 7 * long)
        {
            continue;
        }

        joiners.push(label);
    }

    // Three or more in one column or row are the stripes of a line drawn in two colors by
    // turns, which is a pattern and not a branch with a stretch recolored (Foth 2017).
    for (const label of joiners)
    {
        const { box } = labeling.components[label - 1];
        const upright = box.y1 - box.y0 >= box.x1 - box.x0;
        let alike = 0;

        for (const other of joiners)
        {
            const otherBox = labeling.components[other - 1].box;

            alike += upright
                ? (Math.abs(otherBox.x0 - box.x0) <= 2 && Math.abs(otherBox.x1 - box.x1) <= 2 ? 1 : 0)
                : (Math.abs(otherBox.y0 - box.y0) <= 2 && Math.abs(otherBox.y1 - box.y1) <= 2 ? 1 : 0);
        }

        if (alike >= 3)
        {
            continue;
        }

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                if (labeling.labels[y * thin.width + x] === label)
                {
                    lines.data[y * thin.width + x] = 1;
                }
            }
        }
    }

    return lines;
}

/**
 * Finds the pixels in the two kinds of line color the main rule leaves out: a dark, muted
 * color, such as a slate blue, whose chroma is short of the limit, and a vivid light one, such
 * as a yellow, which is brighter than the threshold (Wu 2015 draws branches in both). Bands,
 * fills and photographs hold such colors too, so the caller keeps only what is drawn as lines.
 *
 * @param image - Source image.
 * @param threshold - Luminance below which the main rule counts a colored pixel as dark.
 * @param minChroma - Chroma the main rule requires.
 * @returns The pixels in those colors that the main rule does not take.
 */
function createOffColorMask(image: RgbaImage, threshold: number, minChroma: number): Mask
{
    const { width, height, data } = image;
    const mask = new Uint8Array(width * height);

    for (let index = 0; index < width * height; index++)
    {
        const offset = index * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const muted = luminance < mutedLuminance && chroma > mutedChroma;
        const vivid = luminance < vividLuminance && chroma > vividChroma;

        if ((muted || vivid) && !(luminance < threshold && chroma > minChroma))
        {
            mask[index] = 1;
        }
    }

    return { width, height, data: mask };
}

/**
 * Clears thin components that are the outline of a rectangle: a colored border around a clade
 * box, which is neither a line of the tree nor a marker. Branches crossing the border cut it
 * into pieces, so the mask is grown first to join them again; a joined component is an outline
 * when it is at least a given size each way and nearly all of its pixels lie along its
 * bounding box.
 *
 * @param thin - Thin colored mask, modified in place.
 * @param minSize - Smallest width and height of an outline.
 * @param rim - How far in from the bounding box a pixel still counts as on the border.
 */
function removeOutlines(thin: Mask, minSize: number, rim: number): void
{
    const { width, components, labels } = { width: thin.width, ...findConnectedComponents(dilate(thin, Math.max(2, Math.round(rim / 2)))) };
    const onBorder = new Int32Array(components.length);

    for (let index = 0; index < labels.length; index++)
    {
        const label = labels[index];

        if (label === 0)
        {
            continue;
        }

        const box = components[label - 1].box;
        const x = index % width;
        const y = Math.floor(index / width);

        if (x < box.x0 + rim || x >= box.x1 - rim || y < box.y0 + rim || y >= box.y1 - rim)
        {
            onBorder[label - 1]++;
        }
    }

    const outlines = new Set<number>();

    for (let index = 0; index < components.length; index++)
    {
        const { box, area } = components[index];

        if (box.x1 - box.x0 >= minSize && box.y1 - box.y0 >= minSize && onBorder[index] >= 0.85 * area)
        {
            outlines.add(index + 1);
        }
    }

    if (outlines.size === 0)
    {
        return;
    }

    for (let index = 0; index < labels.length; index++)
    {
        if (outlines.has(labels[index]))
        {
            thin.data[index] = 0;
        }
    }
}

/**
 * Clears thin components that close on themselves. A tree's lines enclose nothing, so a stroke
 * that runs around an area is the outline of something else: a range bar drawn hollow (Wang
 * 2025), the border of a shaded clade (Poust 2020). Lines crossing the outline cut it, so the
 * mask is grown first to join it again.
 *
 * @param thin - Thin colored mask, modified in place.
 * @param grow - How far the mask is grown before looking.
 * @param smallest - Fewest pixels an enclosed area must hold, so that a pinhole is no loop.
 */
function removeLoops(thin: Mask, grow: number, smallest: number): void
{
    const { width, height } = thin;
    const grown = findConnectedComponents(dilate(thin, grow));
    const gaps = findConnectedComponents(invertMask(dilate(thin, grow)));
    const enclosed = new Set<number>();

    for (let index = 0; index < gaps.components.length; index++)
    {
        const { box, area } = gaps.components[index];

        if (area >= smallest && box.x0 > 0 && box.y0 > 0 && box.x1 < width && box.y1 < height)
        {
            enclosed.add(index + 1);
        }
    }

    const loops = new Set<number>();

    for (let y = 1; y < height - 1; y++)
    {
        for (let x = 1; x < width - 1; x++)
        {
            const index = y * width + x;

            if (!enclosed.has(gaps.labels[index]))
            {
                continue;
            }

            // The piece that walls an enclosed area in is beside it on some side.
            for (const neighbor of [index - 1, index + 1, index - width, index + width])
            {
                if (grown.labels[neighbor] !== 0)
                {
                    loops.add(grown.labels[neighbor]);
                }
            }
        }
    }

    if (loops.size === 0)
    {
        return;
    }

    for (let index = 0; index < grown.labels.length; index++)
    {
        if (loops.has(grown.labels[index]))
        {
            thin.data[index] = 0;
        }
    }
}

/**
 * Clears the pieces of a dashed rule: three or more strokes end to end on one row or in one
 * column. A branch is drawn solid; a dashed line in color marks a boundary across the figure.
 *
 * @param lines - Mask of colored strokes, modified in place.
 */
function removeDashes(lines: Mask): void
{
    const labeling = findConnectedComponents(lines);
    const onRow = new Map<number, Array<number>>();
    const inColumn = new Map<number, Array<number>>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];
        const wide = box.x1 - box.x0;
        const tall = box.y1 - box.y0;

        if (wide >= 2 * tall)
        {
            onRow.set(box.y0, [...(onRow.get(box.y0) ?? []), index + 1]);
        }
        else if (tall >= 2 * wide)
        {
            inColumn.set(box.x0, [...(inColumn.get(box.x0) ?? []), index + 1]);
        }
    }

    const dashes = new Set<number>();

    for (const group of [...onRow.values(), ...inColumn.values()])
    {
        if (group.length >= 3)
        {
            for (const label of group)
            {
                dashes.add(label);
            }
        }
    }

    for (let index = 0; index < labeling.labels.length; index++)
    {
        if (dashes.has(labeling.labels[index]))
        {
            lines.data[index] = 0;
        }
    }
}

/**
 * What removing a stage chart found.
 */
export type ChartStripFind = {
    /**
     * One informational issue per strip dropped.
     */
    issues: Array<QcIssue>;

    /**
     * The long rules of each strip, kept aside for the time axis: the ages are printed along
     * one of them.
     */
    axisRules: Array<Segment>;

    /**
     * The short verticals of each strip, kept aside with the rules: the axis may be a row of
     * ticks with no line.
     */
    axisTicks: Array<Segment>;
};

/**
 * Removes stage charts: a strip along the top or bottom of the figure, bounded by a rule
 * spanning two fifths of the width, holding eight or more dividers in rows. A time tree's
 * chart of periods, epochs and stages is drawn that way, and once a branch touches a rule,
 * every divider becomes a tip. Dividers are told from a tree's connectors by their rows: the
 * dividers between two rules share a top and a bottom, four or more at a time, as connectors
 * never do. The innermost qualifying rule with a divider row within six glyphs of it and no
 * connector running on from it into the tree bounds the strip, and every segment lying within
 * the strip goes, the rules included; the long rules and the short verticals are returned so
 * the time axis can still be read.
 *
 * @param horizontals - Horizontal segments, rewritten in place.
 * @param verticals - Vertical segments, rewritten in place.
 * @param width - Image width.
 * @param height - Image height.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @returns Issues and the rules kept for the axis.
 */
export function removeChartStrips(horizontals: Array<Segment>, verticals: Array<Segment>, width: number, height: number, glyphHeight: number, thickness: number): ChartStripFind
{
    const issues = new Array<QcIssue>();
    const axisRules = new Array<Segment>();
    const axisTicks = new Array<Segment>();
    const slack = Math.max(2, Math.round(thickness));
    // A band edge may run a little past the rule it stands on.
    const overshoot = Math.max(slack, glyphHeight);
    const bin = 2 * slack;

    function keyRow(box: Box): string
    {
        return `${Math.round(box.y0 / bin)}:${Math.round(box.y1 / bin)}`;
    }

    // A divider stands on a rule, or hangs from one: a horizontal of any length meets one of
    // its ends. The dashes of a dashed stage line through a tree align in rows too, and meet
    // nothing.
    function meetsHorizontal(box: Box): boolean
    {
        for (const horizontal of horizontals)
        {
            const other = horizontal.box;

            if (other.x0 <= box.x1 + slack && other.x1 >= box.x0 - slack
                && ((other.y1 >= box.y0 - slack && other.y0 <= box.y0 + slack) || (other.y1 >= box.y1 - slack && other.y0 <= box.y1 + slack)))
            {
                return true;
            }
        }

        return false;
    }

    function findDividerRows(stripTop: number, stripBottom: number): Map<string, number>
    {
        const rows = new Map<string, number>();

        for (const vertical of verticals)
        {
            const { box } = vertical;

            if (box.y0 >= stripTop - overshoot && box.y1 <= stripBottom + overshoot && meetsHorizontal(box))
            {
                const key = keyRow(box);
                rows.set(key, (rows.get(key) ?? 0) + 1);
            }
        }

        for (const [key, members] of rows)
        {
            if (members < 4)
            {
                rows.delete(key);
            }
        }

        return rows;
    }

    function countDividers(rows: Map<string, number>): number
    {
        let count = 0;

        for (const members of rows.values())
        {
            count += members;
        }

        return count;
    }

    // The gap between the rule and the nearest divider row: a chart's rule has its dividers
    // right under it, a long branch in the tree above the chart has the tree's last rows in
    // between.
    function measureGapToRows(rows: Map<string, number>, rule: Segment, atTop: boolean): number
    {
        let gap = Infinity;

        for (const vertical of verticals)
        {
            const { box } = vertical;

            if (rows.has(keyRow(box)))
            {
                gap = Math.min(gap, Math.max(0, atTop ? rule.box.y0 - box.y1 : box.y0 - rule.box.y1));
            }
        }

        return gap;
    }

    // A long branch just inside the chart is as long and as deep as a rule, but a connector
    // meets it and runs on into the tree; a band edge crossing a chart rule runs a couple of
    // glyphs past it at most.
    function hasConnector(rule: Segment, atTop: boolean): boolean
    {
        const reach = 3 * glyphHeight;

        for (const vertical of verticals)
        {
            const { box } = vertical;
            const meets = box.x0 <= rule.box.x1 + slack && box.x1 >= rule.box.x0 - slack && box.y1 >= rule.box.y0 - slack && box.y0 <= rule.box.y1 + slack;
            const beyond = atTop ? box.y1 - rule.box.y1 : rule.box.y0 - box.y0;

            if (meets && beyond > reach)
            {
                return true;
            }
        }

        return false;
    }

    for (const atTop of [true, false])
    {
        let best: Segment | null = null;
        let bestDepth = 0;
        let bestDividers = 0;

        for (const rule of horizontals)
        {
            const depth = atTop ? rule.box.y1 : height - rule.box.y0;

            if (rule.box.x1 - rule.box.x0 < 0.4 * width || depth > 0.35 * height)
            {
                continue;
            }

            const rows = findDividerRows(atTop ? 0 : rule.box.y0, atTop ? rule.box.y1 : height);
            const dividers = countDividers(rows);

            if (dividers >= 8 && depth > bestDepth && !hasConnector(rule, atTop) && measureGapToRows(rows, rule, atTop) <= 6 * glyphHeight)
            {
                best = rule;
                bestDepth = depth;
                bestDividers = dividers;
            }
        }

        if (best === null)
        {
            continue;
        }

        // Segments within the strip go; a divider in a row may run a little past the rule, but
        // a tree's own segment that close to the rule stays.
        const stripTop = atTop ? 0 : best.box.y0 - slack;
        const stripBottom = atTop ? best.box.y1 + slack : height;
        const rows = findDividerRows(atTop ? 0 : best.box.y0, atTop ? best.box.y1 : height);
        let dropped = 0;

        for (const list of [horizontals, verticals])
        {
            const kept = new Array<Segment>();

            for (const segment of list)
            {
                const { box } = segment;
                const inside = box.y0 >= stripTop && box.y1 <= stripBottom;
                const inRow = list === verticals && box.y0 >= stripTop - overshoot && box.y1 <= stripBottom + overshoot && rows.has(keyRow(box));

                if (inside || inRow)
                {
                    dropped++;

                    if (list === horizontals ? box.x1 - box.x0 >= 0.4 * width : box.y1 - box.y0 <= 3 * glyphHeight)
                    {
                        (list === horizontals ? axisRules : axisTicks).push(segment);
                    }
                }
                else
                {
                    kept.push(segment);
                }
            }

            list.length = 0;
            list.push(...kept);
        }

        issues.push({ severity: "info", code: "chart-strip-dropped", message: `a stage chart along the ${atTop ? "top" : "bottom"} edge, bounded by ${best.id} with ${bestDividers} divider(s) in rows, was dropped (${dropped} segment(s))`, subject: null });
    }

    return { issues, axisRules, axisTicks };
}

/**
 * Removes chart lines: a line spanning much of the figure that many segments of the other
 * direction cross or end on. A stratigraphic band at the top of a time tree is a width-wide
 * rule with dozens of stage dividers standing on it, and once a branch touches it, the
 * dividers become tips of the tree. Nothing crosses a node connector, and the stem of a dense
 * tree has many branches ending on it, so only crossings count, and they must not be dwarfed
 * by endings. A band whose dividers stand on it without crossing (Wang 2025) is not caught;
 * counting endings instead took a scale of Ke 2023 with it.
 *
 * @param horizontals - Horizontal segments, rewritten in place.
 * @param verticals - Vertical segments, rewritten in place.
 * @param width - Image width.
 * @param height - Image height.
 * @returns One informational issue per line dropped.
 */
export function removeChartLines(horizontals: Array<Segment>, verticals: Array<Segment>, width: number, height: number): Array<QcIssue>
{
    const issues = new Array<QcIssue>();

    function judge(lines: Array<Segment>, others: Array<Segment>, alongX: boolean): Array<Segment>
    {
        const kept = new Array<Segment>();
        const span = alongX ? width : height;

        for (const line of lines)
        {
            const { box } = line;
            const length = alongX ? box.x1 - box.x0 : box.y1 - box.y0;
            let crossing = 0;
            let ending = 0;

            // A line need only reach across a sixth of the figure: a stage line is cut into
            // pieces wherever a junction of the tree happens to sit on it.
            if (length >= 0.15 * span)
            {
                for (const other of others)
                {
                    const otherBox = other.box;
                    const overlaps = alongX ? otherBox.x0 < box.x1 && otherBox.x1 > box.x0 : otherBox.y0 < box.y1 && otherBox.y1 > box.y0;

                    if (!overlaps)
                    {
                        continue;
                    }

                    const before = alongX ? otherBox.y0 < box.y0 - 2 : otherBox.x0 < box.x0 - 2;
                    const after = alongX ? otherBox.y1 > box.y1 + 2 : otherBox.x1 > box.x1 + 2;

                    if (before && after)
                    {
                        crossing++;
                    }
                    else if (before || after)
                    {
                        ending++;
                    }
                }
            }

            if (crossing >= 6)
            {
                issues.push({ severity: "info", code: "chart-line-dropped", message: `${line.orientation} ${line.id} spanning the figure with ${crossing} segment(s) crossing and ${ending} ending on it was dropped as a chart line`, subject: null });
            }
            else
            {
                kept.push(line);
            }
        }

        return kept;
    }

    const keptHorizontals = judge(horizontals, verticals, true);
    const keptVerticals = judge(verticals, horizontals, false);
    horizontals.length = 0;
    horizontals.push(...keptHorizontals);
    verticals.length = 0;
    verticals.push(...keptVerticals);

    return issues;
}

/**
 * The fat shapes of a mask: regions that survive an erosion, grown back by a pixel more. On
 * the line ink these are collapsed-clade wedges, filled discs and thick bars, never lines.
 *
 * @param mask - Source mask.
 * @param radius - Half-width of the erosion square; anything thinner than its width is not fat.
 * @returns The fat shapes.
 */
export function findFatShapes(mask: Mask, radius: number): Mask
{
    const grown = dilate(erode(mask, radius), radius + 1);

    return subtractMask(mask, subtractMask(mask, grown));
}

/**
 * Drops segments that are the frame around the figure: a horizontal or vertical within a
 * margin of the image edge that spans most of the image. A frame's left edge is a vertical as
 * tall as the image, which would otherwise become the root of everything.
 *
 * @param segments - Segments of one orientation, modified in place.
 * @param width - Image width.
 * @param height - Image height.
 * @returns One issue per segment dropped.
 */
export function removeFrameSegments(segments: Array<Segment>, width: number, height: number): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const kept = new Array<Segment>();
    const marginX = Math.max(4, Math.round(0.02 * width));
    const marginY = Math.max(4, Math.round(0.02 * height));

    for (const segment of segments)
    {
        const { box } = segment;
        let frame = false;

        if (segment.orientation === "horizontal")
        {
            const atEdge = box.y0 <= marginY || box.y1 >= height - marginY;
            frame = atEdge && box.x1 - box.x0 >= 0.9 * width;
        }
        else
        {
            const atEdge = box.x0 <= marginX || box.x1 >= width - marginX;
            frame = atEdge && box.y1 - box.y0 >= 0.9 * height;
        }

        if (frame)
        {
            issues.push({
                severity: "info",
                code: "frame-dropped",
                message: `${segment.orientation} ${segment.id} along the image edge spanning the figure was dropped as a frame`,
                subject: null,
            });
        }
        else
        {
            kept.push(segment);
        }
    }

    segments.length = 0;
    segments.push(...kept);

    return issues;
}

/**
 * Keeps only the components of a mask that fit a marker: a range oval, a wedge or a bar is at
 * most a few glyphs tall, while a clade fill or a silhouette is far larger, and a branch that
 * runs into one of those does not end on its far side.
 *
 * @param mask - Fat shapes.
 * @param maxWidth - Widest component kept.
 * @param maxHeight - Tallest component kept.
 * @returns The small components as a mask.
 */
export function keepSmallShapes(mask: Mask, maxWidth: number, maxHeight: number): Mask
{
    const { components, labels } = findConnectedComponents(mask);
    const selected = new Set<number>();

    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];

        if (box.x1 - box.x0 <= maxWidth && box.y1 - box.y0 <= maxHeight)
        {
            selected.add(index + 1);
        }
    }

    return createMaskFromComponents(labels, selected, mask.width, mask.height);
}

/**
 * Moves each tip's end to the far side of a fat marker that touches it: a range oval or a bar
 * drawn in color sits between the branch end and the label, and the label is measured from
 * where the marker ends.
 *
 * @param document - Document updated in place.
 * @param fat - Fat shapes.
 * @param thickness - Line thickness in pixels.
 * @param maxGap - Largest gap between the branch end and the shape that still counts.
 * @param labelReach - When given, a move is kept only when a text row begins within this many
 * pixels past the new end; shapes in any pale tint include stage bands and fills that no
 * label follows.
 * @param labelRise - How far above or below the tip, in pixels, that row's middle may lie.
 * @returns Number of tips moved.
 */
export function extendTipsThroughMarkers(document: ExtractionDocument, fat: Mask, thickness: number, maxGap: number, labelReach: number | null = null, labelRise = 0): number
{
    const { width, height, data } = fat;
    const half = Math.max(1, Math.round(thickness));
    let moved = 0;
    const absorbed = new Array<string>();

    function hasLabelBeyond(end: number, y: number): boolean
    {
        for (const line of document.textLines)
        {
            const center = (line.box.y0 + line.box.y1) / 2;

            if (line.glyphCount >= 2 && line.box.x0 >= end - 2 && line.box.x0 <= end + (labelReach as number) && Math.abs(center - y) <= Math.max(half, labelRise))
            {
                return true;
            }
        }

        return false;
    }

    for (const tip of document.tips)
    {
        const top = Math.max(0, Math.round(tip.y) - half);
        const bottom = Math.min(height - 1, Math.round(tip.y) + half);
        let end = -1;
        let gap = 0;

        for (let x = Math.round(tip.x); x < width; x++)
        {
            let marker = false;

            for (let y = top; y <= bottom && !marker; y++)
            {
                marker = data[y * width + x] === 1;
            }

            if (marker)
            {
                end = x;
                gap = 0;
            }
            else if (++gap > (end < 0 ? maxGap : 3))
            {
                break;
            }
        }

        if (end > tip.x + 2 && (labelReach === null || hasLabelBeyond(end + 1, Math.round(tip.y))))
        {
            tip.extendedFrom ??= tip.x;
            tip.x = end + 1;
            moved++;
        }
    }

    // A range bar traced as a segment of its own has a tip at its far end already, hung from
    // whatever its end touched (a stage boundary, say), and now the branch that ran into the
    // bar ends there too. The branch that started further left is the real one; the other goes.
    for (const tip of document.tips)
    {
        for (const other of document.tips)
        {
            if (other !== tip && Math.abs(other.x - tip.x) <= 2 * half + 2 && Math.abs(other.y - tip.y) <= half
                && (other.extendedFrom ?? other.x) > (tip.extendedFrom ?? tip.x) && !absorbed.includes(tip.id))
            {
                absorbed.push(other.id);
            }
        }
    }

    for (const id of absorbed)
    {
        deleteTip(document, id);
    }

    return moved;
}

/**
 * Finds the chains of open marks drawn on branches: rings for the characters that change on a
 * branch, joined by short pieces of the branch itself (Serrano-Branas 2016). No stretch of
 * such a chain is long enough to be line, so the whole of it goes with the lettering and the
 * branch has a hole as long as the chain. A chain is one piece of ink that is not line ink,
 * a letter tall and at least a letter and a half long, made of thin pieces at its middle
 * height and marks standing evenly about it, with line ink arriving at that height at both
 * ends.
 *
 * @param textInk - Dark ink.
 * @param lineInk - Line ink.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @returns Boxes of the chains.
 */
export function findMarkChains(textInk: Mask, lineInk: Mask, glyphHeight: number, thickness: number): Array<Box>
{
    const chains = new Array<Box>();
    const { width, height } = textInk;
    const letters = subtractMask(textInk, lineInk);
    const reach = Math.max(3, Math.round(thickness));

    function hasLineBeside(x0: number, x1: number, middle: number): boolean
    {
        for (let y = Math.max(0, middle - reach); y <= Math.min(height - 1, middle + reach); y++)
        {
            for (let x = Math.max(0, x0); x < Math.min(width, x1); x++)
            {
                if (lineInk.data[y * width + x] === 1)
                {
                    return true;
                }
            }
        }

        return false;
    }

    // Whether the three rows over a box and the three under it are all but white: a chain
    // stands clear of the numbers printed about it, and a piece of a name in a speckled
    // scan does not (Gohlich 2006).
    function standsClear(box: Box): boolean
    {
        let inked = 0;
        let all = 0;

        for (const y0 of [box.y0 - 3, box.y1])
        {
            for (let y = Math.max(0, y0); y < Math.min(height, y0 + 3); y++)
            {
                for (let x = box.x0; x < box.x1; x++)
                {
                    inked += textInk.data[y * width + x];
                    all++;
                }
            }
        }

        return 20 * inked <= all;
    }

    // Counts the columns of a box's width that have ink of one mask on a row.
    function countOnRow(mask: Mask, box: Box, y: number): number
    {
        let count = 0;

        for (let x = box.x0; x < box.x1 && y >= 0 && y < height; x++)
        {
            count += mask.data[y * width + x];
        }

        return count;
    }

    // Measures how far line ink runs up and down a column through a point.
    function measureLineRun(x: number, y: number): number
    {
        if (x < 0 || x >= width || lineInk.data[y * width + x] === 0)
        {
            return 0;
        }

        let top = y;
        let bottom = y;

        while (top > 0 && lineInk.data[(top - 1) * width + x] === 1)
        {
            top--;
        }

        while (bottom < height - 1 && lineInk.data[(bottom + 1) * width + x] === 1)
        {
            bottom++;
        }

        return bottom - top + 1;
    }

    // Finds the dot a cap is half of: the cap lies flat against a line, and across the line
    // other ink bulges as broad as the cap does. Null when it is no such cap.
    function findDotOfCap(cap: Box): Box | null
    {
        const wide = cap.x1 - cap.x0;
        const tall = cap.y1 - cap.y0;
        const center = Math.round((cap.x0 + cap.x1) / 2);

        for (const step of [-1, 1])
        {
            // The line begins on the row next to the cap, and is a line's thickness.
            let y = step < 0 ? cap.y0 - 1 : cap.y1;

            if (10 * countOnRow(lineInk, cap, y) < 9 * wide)
            {
                continue;
            }

            const from = y;

            while (y >= 0 && y < height && Math.abs(y - from) <= 2 * thickness && lineInk.data[y * width + center] === 1)
            {
                y += step;
            }

            const beyond = countOnRow(letters, cap, y);
            const middle = Math.round((from + y - step) / 2);

            if (Math.abs(y - from) > 2 * thickness || 10 * beyond < 6 * wide || !hasLineBeside(cap.x0 - reach - 1, cap.x0, middle) || !hasLineBeside(cap.x1, cap.x1 + reach + 1, middle))
            {
                continue;
            }

            // The dot stands out over the branch on both sides: a short thick stub whose
            // core alone is line has caps too, level with the line it joins (Dyer 2023).
            const dot = step < 0 ? { x0: cap.x0, y0: y + 1 - tall, x1: cap.x1, y1: cap.y1 } : { x0: cap.x0, y0: cap.y0, x1: cap.x1, y1: y + tall };
            const most = (dot.y1 - dot.y0) / 1.6;

            if (measureLineRun(cap.x0 - 2, middle) > most || measureLineRun(cap.x1 + 1, middle) > most)
            {
                continue;
            }

            return dot;
        }

        return null;
    }

    // Whether a box overlaps a chain already found: the two caps of a dot give it twice.
    function overlapsChain(box: Box): boolean
    {
        for (const chain of chains)
        {
            if (chain.x0 < box.x1 && box.x0 < chain.x1 && chain.y0 < box.y1 && box.y0 < chain.y1)
            {
                return true;
            }
        }

        return false;
    }

    // Counts the white pixels of a box that ink closes in: the insides of the rings. All
    // ink counts, since the branch itself may close the side of a ring.
    function countEnclosed(box: Box): number
    {
        const wide = box.x1 - box.x0 + 2;
        const tall = box.y1 - box.y0 + 2;
        const seen = new Uint8Array(wide * tall);
        const stack = [0];
        let open = 0;
        let white = 0;

        seen[0] = 1;

        function isInk(x: number, y: number): boolean
        {
            const atX = box.x0 - 1 + x;
            const atY = box.y0 - 1 + y;

            return x > 0 && y > 0 && x < wide - 1 && y < tall - 1 && textInk.data[atY * width + atX] === 1;
        }

        for (let y = 1; y < tall - 1; y++)
        {
            for (let x = 1; x < wide - 1; x++)
            {
                white += isInk(x, y) ? 0 : 1;
            }
        }

        while (stack.length > 0)
        {
            const at = stack.pop() as number;
            const x = at % wide;
            const y = (at - x) / wide;

            open += x > 0 && y > 0 && x < wide - 1 && y < tall - 1 ? 1 : 0;

            for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]])
            {
                if (nextX < 0 || nextY < 0 || nextX >= wide || nextY >= tall || seen[nextY * wide + nextX] === 1 || isInk(nextX, nextY))
                {
                    continue;
                }

                seen[nextY * wide + nextX] = 1;
                stack.push(nextY * wide + nextX);
            }
        }

        return white - open;
    }

    for (const component of findConnectedComponents(letters).components)
    {
        const { box } = component;
        const wide = box.x1 - box.x0;
        const tall = box.y1 - box.y0;

        // A dot the branch runs through leaves two caps as lettering, one over the line and
        // one under it. A dot is half again as broad as a line is thick: where the type is
        // tiny, pieces of letters that touch a line are caps of that kind too.
        if (tall < 0.5 * glyphHeight && tall >= 3 && wide >= 0.4 * glyphHeight && wide >= 1.5 * thickness && wide <= 1.2 * glyphHeight && wide >= 1.3 * tall && 10 * component.area >= 6 * wide * tall)
        {
            const dot = findDotOfCap(box);

            if (dot !== null && !overlapsChain(dot))
            {
                chains.push(dot);
            }

            continue;
        }

        if (tall > 1.3 * glyphHeight || tall < 0.4 * glyphHeight)
        {
            continue;
        }

        // A solid dot on a branch is a mark alone: round, filled, and with the branch
        // arriving at its middle on both sides (You 2009).
        if (wide < 1.5 * glyphHeight)
        {
            const center = Math.round((box.y0 + box.y1) / 2);
            const round = Math.abs(wide - tall) <= 0.25 * tall && 10 * component.area >= 7 * wide * tall;

            if (round && standsClear(box) && hasLineBeside(box.x0 - reach - 1, box.x0, center) && hasLineBeside(box.x1, box.x1 + reach + 1, center))
            {
                chains.push(box);
            }

            continue;
        }

        // Every column is either a piece of the branch, thin and at the middle height, or
        // part of a mark, standing above and below that height alike. A word that touches
        // the lines has columns that are neither, and a dash has no marks.
        const middle = Math.round((box.y0 + box.y1) / 2);
        const band = Math.max(2, Math.round(tall / 4));
        let thin = 0;
        let marked = 0;

        for (let x = box.x0; x < box.x1; x++)
        {
            let top = -1;
            let bottom = -1;

            for (let y = box.y0; y < box.y1; y++)
            {
                if (letters.data[y * width + x] === 1)
                {
                    top = top < 0 ? y : top;
                    bottom = y;
                }
            }

            if (top >= middle - band && bottom <= middle + band)
            {
                thin++;
            }
            else if (top < middle - band && bottom > middle + band && Math.abs((middle - top) - (bottom - middle)) <= band)
            {
                marked++;
            }
        }

        // The rounded sides of a ring are neither, so three columns in five must fit.
        const whole = 5 * (thin + marked) >= 3 * wide && 4 * thin >= wide && 5 * marked >= wide;

        // And a ring closes in white, a tenth of the mark columns' area at the least; a bend
        // in a line or a blot of a scan closes in none (Longrich 2024, Gohlich 2006).
        if (whole && standsClear(box) && 10 * countEnclosed(box) >= marked * tall && hasLineBeside(box.x0 - reach - 1, box.x0, middle) && hasLineBeside(box.x1, box.x1 + reach + 1, middle))
        {
            chains.push(box);
        }
    }

    // A figure that marks its characters so has many chains. One alone is an accident of
    // the scan (Gohlich 2006, a piece of a name in a speckled panel).
    if (chains.length < 2)
    {
        return [];
    }

    function compareLeftEdges(first: Box, second: Box): number
    {
        return first.x0 - second.x0;
    }

    chains.sort(compareLeftEdges);

    return chains;
}

/**
 * Finds the solid marks set on branches: a square, a triangle, an oval or a bar that stands
 * for a change of character on the branch it is drawn on (Senter 2012). The ink is eroded by
 * the line thickness, so the branches vanish and the cores of solid shapes remain, to be
 * measured and grown back. A mark is between a letter and six letters across, and solid for
 * two fifths of its box, which a triangle is and a silhouette is not.
 *
 * @param ink - Dark ink.
 * @param discs - Node discs already found, which are left out.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @returns Bounding boxes of the marks.
 */
export function findBranchMarks(ink: Mask, discs: Array<Box>, glyphHeight: number, thickness: number): Array<Box>
{
    const radius = Math.max(2, Math.round(thickness / 2) + 1);
    const marks = new Array<Box>();

    for (const component of findConnectedComponents(erode(ink, radius)).components)
    {
        const box: Box = { x0: component.box.x0 - radius, y0: component.box.y0 - radius, x1: component.box.x1 + radius, y1: component.box.y1 + radius };
        const width = box.x1 - box.x0;
        const height = box.y1 - box.y0;

        if (Math.min(width, height) < Math.max(3 * thickness, 0.9 * glyphHeight) || Math.max(width, height) > 6 * glyphHeight || measureInkShare(ink, box) < 0.4)
        {
            continue;
        }

        let isDisc = false;

        for (const disc of discs)
        {
            isDisc = isDisc || (disc.x0 < box.x1 && disc.x1 > box.x0 && disc.y0 < box.y1 && disc.y1 > box.y0);
        }

        if (!isDisc)
        {
            marks.push(box);
        }
    }

    return marks;
}

/**
 * Finds filled discs the size of a node marker: a numbered circle drawn over a junction. Such a
 * disc is round, a glyph or three across, and mostly filled even with a digit knocked out of
 * it. Its halves beside the digit pass for glyphs and leave the line art, which cuts the
 * branches at the junction they cover.
 *
 * The digit's strokes are closed first, so the disc is solid, and the ink is then eroded by
 * the line thickness, so the branches vanish and the disc's core remains, to be measured and
 * grown back. An open ring around a junction is found by its outline instead. A disc is as wide as it is tall, to a tenth, and solid before the closing (half
 * its box inked at least, where a two-digit support value closed into a blob inks a third),
 * and lines enter it on at least two sides, which a label beside a branch has not.
 *
 * @param textInk - Dark pixels at the text threshold.
 * @param lineInk - Line ink, for the branches entering the disc.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @param tintInk - Everything that is not white, for pale solid discs; the text ink by default.
 * @param anyInk - All dark ink at the line threshold, lettering included, in which hairlines
 *   too gray for the text ink still show; the text ink by default.
 * @returns Bounding boxes of the discs.
 */
export function findNodeDiscs(textInk: Mask, lineInk: Mask, glyphHeight: number, thickness: number, tintInk: Mask = textInk, anyInk: Mask = textInk): Array<Box>
{
    const radius = Math.max(2, Math.round(thickness / 2) + 1);
    const discs = new Array<Box>();

    // Solid discs: dark ones in the text ink, half inked at least; then pale ones in everything
    // that is not white, which must be nearly solid, since the gray fringe of a thick mark
    // passes the looser test.
    // The last pass takes the ink as it is: a solid dot has no digit to close over, and beside
    // two verticals a few pixels apart the closing fuses them with the dot into one tall blob
    // (Wilson 2020).
    for (const [ink, minShare, closing] of [[textInk, 0.5, true], [tintInk, 0.7, true], [textInk, 0.8, false]] as Array<[Mask, number, boolean]>)
    {
        const closed = closing ? closeMask(ink, Math.max(2, Math.round(glyphHeight / 5))) : ink;
        const { components } = findConnectedComponents(erode(closed, radius));

        for (const component of components)
        {
            const coreWidth = component.box.x1 - component.box.x0;
            const coreHeight = component.box.y1 - component.box.y0;
            const width = coreWidth + 2 * radius;
            const height = coreHeight + 2 * radius;
            const size = Math.max(width, height);

            // A disc that carries a number is a glyph and a half across at least; a plain dot on
            // a junction is smaller, down to three line widths, below which it is the line's own
            // rounded corner (Manitkoon 2023's dots are 21 px on 5 px lines, under 1.5 glyphs).
            // Smaller still, to eight tenths of a glyph, only when solid to its edge: nine
            // tenths of its box inked, which no letter is (Whitlock 2020, dots of 10 pixels on
            // five named nodes beside letters of 12, each left as a gap in its node's bar).
            const usual = Math.min(1.5 * glyphHeight, Math.max(3 * thickness, 0.9 * glyphHeight));
            const smallest = Math.min(usual, Math.max(3 * thickness, 0.8 * glyphHeight));
            // A small solid dot is coarse at its edge once eroded: eleven pixels across, its
            // core holds 70 of the 121 in its box, where a larger disc holds three quarters.
            const leastFill = closing ? 0.6 : 0.57;

            if (size < smallest || size > 3.5 * glyphHeight || Math.abs(width - height) > 0.1 * size + 1 || component.area < leastFill * coreWidth * coreHeight)
            {
                continue;
            }

            const box: Box = { x0: component.box.x0 - radius, y0: component.box.y0 - radius, x1: component.box.x1 + radius, y1: component.box.y1 + radius };

            // A dot that small must be solid: a round letter of small type is as wide and stands
            // between branches too, but it is hollow or open, where a disc fills about four
            // fifths of its box.
            const wanted = size < usual ? 0.9 : size < 1.5 * glyphHeight ? Math.max(minShare, 0.72) : minShare;

            // A dot let in by the looser fill must stand at a junction, with lines on three
            // sides: a dot that ends a tip's branch is as coarse, and a cross painted through
            // it would run the branch on (Ramirez-Velasco 2021).
            const sidesWanted = component.area < 0.6 * coreWidth * coreHeight ? 3 : 2;

            // A dot beside a label is sorted with the lettering, and the ends of its lines with
            // it, so the line ink shows nothing entering. In all the ink the lines are there:
            // the right side is left out, where the label stands, and what enters on two of
            // the other three is a node's branches (Fonseca 2024's numbered dots).
            const entered = Math.max(countSidesEntered(lineInk, box, thickness), countSidesEntered(anyInk, box, thickness, true));

            if (measureInkShare(ink, box) >= wanted && entered >= sidesWanted && !overlapsAny(discs, box))
            {
                discs.push(box);
            }
        }
    }

    // Rings: an open circle drawn around a junction, with a letter or a number inside. Its
    // outline joins the lines that enter it, so it is found by its hole: a white region that
    // touches no edge, a glyph to three across, round (a circle fills about four fifths of its
    // box, less the letters inside, a gap between branches all of it), with lines entering on
    // two sides. The least fill, 0.575, lets a ring with two wide letters through (Barker 2021's
    // "DE" ring fills 0.60, its "C" rings 0.58) and keeps out the numbered callout rings of
    // Alarcón-Muñoz 2023 (0.57), which sit beside the tree with arrows to the nodes; it is a
    // thin margin.
    const holes = findConnectedComponents(invertMask(textInk)).components;

    for (const hole of holes)
    {
        const width = hole.box.x1 - hole.box.x0;
        const height = hole.box.y1 - hole.box.y0;
        const size = Math.max(width, height);
        const share = hole.area / Math.max(1, width * height);
        const touchesEdge = hole.box.x0 === 0 || hole.box.y0 === 0 || hole.box.x1 === textInk.width || hole.box.y1 === textInk.height;

        // A ring may be drawn as an oval, up to twice as long as it is broad (Xu 2018, upright
        // ovals on two nodes, which cut the node's vertical in two).
        const round = Math.abs(width - height) <= 0.1 * size + 1;
        const oval = !round && Math.max(width, height) <= 2.2 * Math.min(width, height) && Math.min(width, height) >= 0.4 * glyphHeight;

        if (touchesEdge || size < glyphHeight || size > 3 * glyphHeight || !(round || oval) || share < 0.575 || share > 0.88)
        {
            continue;
        }

        const rim = Math.max(2, Math.round(thickness));
        const box: Box = { x0: hole.box.x0 - rim, y0: hole.box.y0 - rim, x1: hole.box.x1 + rim, y1: hole.box.y1 + rim };

        if (countSidesEntered(lineInk, box, thickness) >= 2 && !overlapsAny(discs, box))
        {
            discs.push(box);
        }
    }

    return discs;
}

/**
 * Whether a box overlaps any box of a list.
 *
 * @param boxes - Boxes.
 * @param box - The box.
 * @returns True on overlap.
 */
function overlapsAny(boxes: Array<Box>, box: Box): boolean
{
    for (const other of boxes)
    {
        if (other.x0 < box.x1 && other.x1 > box.x0 && other.y0 < box.y1 && other.y1 > box.y0)
        {
            return true;
        }
    }

    return false;
}

/**
 * Share of a box's pixels that are inked.
 *
 * @param mask - Mask.
 * @param box - The box.
 * @returns A share from 0 to 1.
 */
export function measureInkShare(mask: Mask, box: Box): number
{
    const { width, height, data } = mask;
    let count = 0;
    let area = 0;

    for (let y = Math.max(0, box.y0); y < Math.min(height, box.y1); y++)
    {
        for (let x = Math.max(0, box.x0); x < Math.min(width, box.x1); x++)
        {
            count += data[y * width + x];
            area++;
        }
    }

    return area === 0 ? 0 : count / area;
}

/**
 * Counts the sides of a box that line ink enters: a side counts when the band just outside
 * it holds at least a line's thickness of ink.
 *
 * @param lineInk - Line ink.
 * @param box - The box.
 * @param thickness - Line thickness in pixels.
 * @param leaveRight - Whether to leave the right side out, where a label may stand.
 * @returns Sides entered, 0 to 4.
 */
function countSidesEntered(lineInk: Mask, box: Box, thickness: number, leaveRight = false): number
{
    const { width, height, data } = lineInk;
    const band = 3;
    const needed = Math.max(2, Math.round(0.6 * thickness * band));

    function countInk(x0: number, y0: number, x1: number, y1: number): number
    {
        let count = 0;

        for (let y = Math.max(0, y0); y < Math.min(height, y1); y++)
        {
            for (let x = Math.max(0, x0); x < Math.min(width, x1); x++)
            {
                count += data[y * width + x];
            }
        }

        return count;
    }

    let sides = 0;
    sides += countInk(box.x0 - band, box.y0, box.x0, box.y1) >= needed ? 1 : 0;
    sides += !leaveRight && countInk(box.x1, box.y0, box.x1 + band, box.y1) >= needed ? 1 : 0;
    sides += countInk(box.x0, box.y0 - band, box.x1, box.y0) >= needed ? 1 : 0;
    sides += countInk(box.x0, box.y1, box.x1, box.y1 + band) >= needed ? 1 : 0;

    return sides;
}

/**
 * Replaces each disc by a cross of line thickness, so that the branches meeting under it run
 * on through as lines: the disc itself is cleared, since a run through a solid disc is too
 * thick to pass for a line, and the horizontal arm then spans the disc's width and the
 * vertical its height.
 *
 * @param lineArt - Mask painted in place.
 * @param discs - Disc boxes.
 * @param thickness - Line thickness in pixels.
 * @param largeDisc - Size from which a disc's arriving lines are carried on to the cross.
 * @param smallDisc - Size under which a dot's arms are carried out to lines stopping short of it.
 */
export function paintCrosses(lineArt: Mask, discs: Array<Box>, thickness: number, largeDisc = Infinity, smallDisc = 0): void
{
    const half = Math.max(1, Math.round(thickness / 2));

    for (const disc of discs)
    {
        const centerX = Math.round((disc.x0 + disc.x1) / 2);
        const centerY = Math.round((disc.y0 + disc.y1) / 2);

        for (let y = Math.max(0, disc.y0); y < Math.min(lineArt.height, disc.y1); y++)
        {
            for (let x = Math.max(0, disc.x0); x < Math.min(lineArt.width, disc.x1); x++)
            {
                lineArt.data[y * lineArt.width + x] = 0;
            }
        }

        for (let y = Math.max(0, centerY - half); y < Math.min(lineArt.height, centerY + half); y++)
        {
            for (let x = Math.max(0, disc.x0); x < Math.min(lineArt.width, disc.x1); x++)
            {
                lineArt.data[y * lineArt.width + x] = 1;
            }
        }

        for (let y = Math.max(0, disc.y0); y < Math.min(lineArt.height, disc.y1); y++)
        {
            for (let x = Math.max(0, centerX - half); x < Math.min(lineArt.width, centerX + half); x++)
            {
                lineArt.data[y * lineArt.width + x] = 1;
            }
        }

        // A dot sorted with the lettering takes a margin of the line art with it, and the
        // lines stop a few pixels short of its box. An arm is carried out to a line that
        // lies in its own band within that margin (Whitlock 2020, dots of 10 pixels in gaps
        // of 15, which left the node's bar in two pieces either side of the cross). Only for
        // a dot smaller than a letter, which is solid: beside a larger disc the ink a few
        // pixels off is as often its number or a neighbor's line (Moore 2020).
        const margin = Math.max(disc.x1 - disc.x0, disc.y1 - disc.y0) < smallDisc ? Math.max(3, Math.round(thickness) + 1) : 0;

        for (const [stepX, stepY] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
        {
            const startX = stepX < 0 ? disc.x0 - 1 : stepX > 0 ? disc.x1 : centerX;
            const startY = stepY < 0 ? disc.y0 - 1 : stepY > 0 ? disc.y1 : centerY;
            let found = 0;

            for (let step = 0; step < margin && found === 0; step++)
            {
                for (let offset = -half; offset < half && found === 0; offset++)
                {
                    const x = startX + step * stepX + (stepX === 0 ? offset : 0);
                    const y = startY + step * stepY + (stepY === 0 ? offset : 0);

                    found = x >= 0 && y >= 0 && x < lineArt.width && y < lineArt.height && lineArt.data[y * lineArt.width + x] === 1 ? step : 0;
                }
            }

            for (let step = 0; step < found; step++)
            {
                for (let offset = -half; offset < half; offset++)
                {
                    const x = startX + step * stepX + (stepX === 0 ? offset : 0);
                    const y = startY + step * stepY + (stepY === 0 ? offset : 0);

                    if (x >= 0 && y >= 0 && x < lineArt.width && y < lineArt.height)
                    {
                        lineArt.data[y * lineArt.width + x] = 1;
                    }
                }
            }
        }

        // A line need not make for the middle of the disc: a vertical that passes beside it,
        // touching, or ends against its rim, was cleared with it and lies off the cross's
        // arm. Each line that arrives at an edge is carried on to the arm it would meet
        // (Rauhut 2012, a disc set on the step between two verticals).
        // Only for a disc clearly larger than a letter: a smaller one is as often a blot of
        // lettering against a line, whose own strokes would be carried in (Fonseca 2024).
        if (Math.min(disc.x1 - disc.x0, disc.y1 - disc.y0) >= largeDisc)
        {
            carryLinesIn(lineArt, disc, centerX, centerY, thickness, true);
            carryLinesIn(lineArt, disc, centerX, centerY, thickness, false);
        }
    }
}

/**
 * Where a line ends beside a box, coming from one side.
 */
type LineEnd = {
    /**
     * Column of the end, or of the line for one from above or below.
     */
    x: number;

    /**
     * Row of the end, or of the line for one from the left or right.
     */
    y: number;
};

/**
 * Finds the line that ends against one side of a box: a run of ink of some length, leading
 * straight away from that side, that stops within reach of it.
 *
 * @param ink - Line ink.
 * @param box - The box.
 * @param side - Which side.
 * @param reach - How far from the side the line may stop.
 * @param least - Shortest run that is a line.
 * @returns The end, or null.
 */
function findLineEndAt(ink: Mask, box: Box, side: "left" | "right" | "top" | "bottom", reach: number, least: number): LineEnd | null
{
    const { width, height, data } = ink;
    const upright = side === "top" || side === "bottom";
    const step = side === "left" || side === "top" ? -1 : 1;
    // Only lines that make for the box itself: one that runs along its edge is a neighbor's.
    const from = upright ? box.x0 + 1 : box.y0 + 1;
    const to = upright ? box.x1 - 1 : box.y1 - 1;
    // The line may run on into the box, under a mark set on it, so its end is looked for
    // from the middle of the box outward.
    const edge = upright ? Math.round((box.y0 + box.y1) / 2) : Math.round((box.x0 + box.x1) / 2);
    const span = (upright ? box.y1 - box.y0 : box.x1 - box.x0) / 2 + reach;
    let best: LineEnd | null = null;
    let longest = 0;

    function isInk(across: number, along: number): boolean
    {
        const x = upright ? across : along;
        const y = upright ? along : across;

        return x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;
    }

    for (let across = from; across < to; across++)
    {
        let start = -1;

        for (let offset = 0; offset <= span && start < 0; offset++)
        {
            if (isInk(across, edge + step * offset))
            {
                start = edge + step * offset;
            }
        }

        if (start < 0)
        {
            continue;
        }

        let length = 0;

        while (length <= 4 * least && isInk(across, start + step * length))
        {
            length++;
        }

        if (length >= least && length > longest)
        {
            longest = length;
            best = upright ? { x: across, y: start } : { x: start, y: across };
        }
    }

    return best;
}

/**
 * Joins the lines that end around a number set in a junction. A support value printed on a
 * node, in a gap left in the lines for it, takes the node out of the line art: the branch
 * that arrives stops before the number and the node's vertical is cut above and below it
 * (Hwang 2004, whose tree came out in eight pieces). Where lines end against two or more
 * sides of a small row of text, they are drawn on to where they meet.
 *
 * @param lineArt - Mask painted in place.
 * @param ink - Line ink in which the ends are looked for.
 * @param boxes - Boxes of the small rows.
 * @param glyphHeight - Glyph height in pixels.
 * @param thickness - Line thickness in pixels.
 * @param clear - Whether to clear the box before the join is painted: for a solid mark.
 * @returns How many junctions were joined.
 */
export function joinThroughNumbers(lineArt: Mask, ink: Mask, boxes: Array<Box>, glyphHeight: number, thickness: number, clear = false): number
{
    const reach = Math.max(3, Math.round(glyphHeight / 3));
    const half = Math.max(1, Math.round(thickness / 2));

    // The step to such a node can be short; what is looked for is line ink, which lettering
    // is not, so half a glyph of it is a line.
    // Between two marks set close together on one branch there is less line than that.
    const least = clear ? Math.max(6, 2 * Math.round(thickness)) : Math.max(3 * Math.round(thickness), Math.round(glyphHeight / 2));
    let joined = 0;

    function paint(x0: number, y0: number, x1: number, y1: number): void
    {
        for (let y = Math.max(0, Math.min(y0, y1) - half + 1); y < Math.min(lineArt.height, Math.max(y0, y1) + half); y++)
        {
            for (let x = Math.max(0, Math.min(x0, x1) - half + 1); x < Math.min(lineArt.width, Math.max(x0, x1) + half); x++)
            {
                lineArt.data[y * lineArt.width + x] = 1;
            }
        }
    }

    // Where a child's branch begins above or below a number, at a corner whose upright is
    // too short to be a line: the left end of a level run of line ink, with nothing to its
    // left, in the columns of the number and within two glyphs of it. The nearest is taken.
    function findBranchStart(box: Box, above: boolean): LineEnd | null
    {
        const { width, height, data } = ink;
        const run = 2 * least;

        for (let step = 1; step <= 2 * glyphHeight; step++)
        {
            const y = above ? box.y0 - step : box.y1 - 1 + step;

            if (y < 0 || y >= height)
            {
                break;
            }

            for (let x = Math.max(reach, box.x0 - reach); x <= Math.min(width - run - 1, box.x1 + reach); x++)
            {
                if (data[y * width + x] === 0 || data[y * width + x - 1] === 1)
                {
                    continue;
                }

                let length = 0;
                let clear = true;

                while (length < run && data[y * width + x + length] === 1)
                {
                    length++;
                }

                for (let back = 1; back <= reach; back++)
                {
                    clear = clear && data[y * width + x - back] === 0;
                }

                if (length >= run && clear)
                {
                    // The row met first is the line's near edge, which a rounded corner
                    // begins late: the line's own start is the leftmost over its breadth.
                    let start = x;

                    for (let deeper = 1; deeper <= thickness + 1; deeper++)
                    {
                        const row = above ? y - deeper : y + deeper;

                        if (row < 0 || row >= height || data[row * width + x + run - 1] === 0)
                        {
                            break;
                        }

                        let first = x + run - 1;

                        while (first > 0 && data[row * width + first - 1] === 1)
                        {
                            first--;
                        }

                        start = Math.min(start, Math.max(first, x - reach));
                    }

                    return { x: start + half, y };
                }
            }
        }

        return null;
    }

    for (const box of boxes)
    {
        let left = findLineEndAt(ink, box, "left", reach, least);
        const right = findLineEndAt(ink, box, "right", reach, least);
        let top = findLineEndAt(ink, box, "top", reach, least);
        let bottom = findLineEndAt(ink, box, "bottom", reach, least);

        // A number set on a node whose children leave close above and below it leaves no
        // upright long enough to be a line on one side or on both: the stub between the
        // child's corner and the number goes with the lettering (Hwang 2004, where seven
        // tips hung from such corners). With the stem ending at the number's left, a
        // branch that begins over the number and one under it, in one column, are the
        // node's children, and the upright is drawn back in.
        let mended = false;

        if (!clear && (top === null || bottom === null))
        {
            const over = top === null ? findBranchStart(box, true) : null;
            const under = bottom === null ? findBranchStart(box, false) : null;
            const column = top?.x ?? bottom?.x ?? (over !== null && under !== null && Math.abs(over.x - under.x) <= thickness + 2 ? over.x : null);

            // The stem may stop a little further from a narrow number than a line does
            // from a mark; without a stem there is no node here.
            const stem = left ?? (column === null ? null : findLineEndAt(ink, box, "left", 3 * reach, least));

            // A narrow number, a single 1, stands a pixel or two further from its stem
            // than the reach allows: half as far again is still at the number. Looked for
            // three times as far, with nothing mended, Moore 2020 lost two splits.
            left = left ?? (column === null || column < box.x0 || column >= box.x1 ? null : findLineEndAt(ink, box, "left", Math.round(1.5 * reach), least));

            // A value printed beside a node has the node's own upright standing next to
            // it, whole: nothing is missing there, and the branches over and under the
            // number are that node's already (Fonseca 2024, Moore 2020, Silva Junior 2022,
            // which lost splits to an upright drawn in beside their own).
            let standingBy = false;

            for (let x = Math.max(0, box.x0 - 2 * reach); x < Math.min(ink.width, box.x1 + 2 * reach) && column !== null; x++)
            {
                let inked = 0;

                for (let y = box.y0; y < box.y1; y++)
                {
                    inked += ink.data[y * ink.width + x];
                }

                standingBy = standingBy || 5 * inked >= 4 * (box.y1 - box.y0);
            }

            // The column runs under the number itself: a number set beside the column is
            // a value printed by a node (Silva Junior 2022, one pixel clear of it).
            if (!standingBy && stem !== null && column !== null && column >= box.x0 && column < box.x1)
            {
                if (over !== null && Math.abs(over.x - column) <= thickness + 2)
                {
                    paint(column, over.y, column, box.y0);
                    top = { x: column, y: box.y0 };
                    left = stem;
                    mended = true;
                }

                if (under !== null && Math.abs(under.x - column) <= thickness + 2)
                {
                    paint(column, box.y1, column, under.y);
                    bottom = { x: column, y: box.y1 };
                    left = stem;
                    mended = true;
                }
            }
        }

        const level = left ?? right;
        const standing = top ?? bottom;
        const ends = (left === null ? 0 : 1) + (right === null ? 0 : 1) + (top === null ? 0 : 1) + (bottom === null ? 0 : 1);

        // One line that stops at a number is a tip's branch at a label. Two that face each
        // other, or meet at a corner, were one junction.
        if (ends < 2)
        {
            continue;
        }

        // A vertical cut in two stands in one column, and a branch cut in two on one row.
        if ((top !== null && bottom !== null && Math.abs(top.x - bottom.x) > thickness + 1) || (left !== null && right !== null && Math.abs(left.y - right.y) > thickness + 1))
        {
            continue;
        }

        const x = standing === null ? Math.round((box.x0 + box.x1) / 2) : standing.x;
        const y = level === null ? Math.round((box.y0 + box.y1) / 2) : level.y;

        // The lines meet under the number. A value printed beside a node has the node's lines
        // pass it by, and where they would meet lies outside its box (Fonseca 2024).
        if (!mended && (x < box.x0 || x >= box.x1 || y < box.y0 || y >= box.y1))
        {
            continue;
        }

        // A mark is drawn on a line that runs through its middle, and out the other side: two
        // lines that meet at a corner of a solid shape, or one that passes along its edge, have
        // a blot of something else beside them (Gomez 2024, Gallina 2015).
        if (clear)
        {
            const across = left !== null && right !== null && Math.abs(y - (box.y0 + box.y1) / 2) <= (box.y1 - box.y0) / 4;
            const down = top !== null && bottom !== null && Math.abs(x - (box.x0 + box.x1) / 2) <= (box.x1 - box.x0) / 4;

            if (!across && !down)
            {
                continue;
            }
        }

        // A solid mark is cleared first: left in, the line through it is as thick as the mark.
        if (clear)
        {
            for (let clearY = Math.max(0, box.y0); clearY < Math.min(lineArt.height, box.y1); clearY++)
            {
                for (let clearX = Math.max(0, box.x0); clearX < Math.min(lineArt.width, box.x1); clearX++)
                {
                    lineArt.data[clearY * lineArt.width + clearX] = 0;
                }
            }
        }

        if (left !== null)
        {
            paint(left.x, y, x, y);
        }

        if (right !== null)
        {
            paint(x, y, right.x, y);
        }

        if (top !== null)
        {
            paint(x, top.y, x, y);
        }

        if (bottom !== null)
        {
            paint(x, y, x, bottom.y);
        }

        joined++;
    }

    return joined;
}

/**
 * Carries the lines that arrive at two facing edges of a cleared disc on to the middle: those
 * at its top and bottom edges down or up to the row of the cross's horizontal arm, or those
 * at its left and right edges across to the column of its vertical arm.
 *
 * @param lineArt - Mask painted in place.
 * @param disc - Box of the disc.
 * @param centerX - Column of the cross's vertical arm.
 * @param centerY - Row of its horizontal arm.
 * @param thickness - Line thickness in pixels.
 * @param upright - Whether the lines at the top and bottom edges are meant; otherwise those
 *   at the left and right.
 */
function carryLinesIn(lineArt: Mask, disc: Box, centerX: number, centerY: number, thickness: number, upright: boolean): void
{
    const { width, height, data } = lineArt;
    const reach = Math.max(2, Math.round(thickness));
    const widest = 2 * Math.round(thickness) + 2;
    const from = upright ? disc.x0 : disc.y0;
    const to = upright ? disc.x1 : disc.y1;

    // Whether a line stands beyond the edge at one position along it.
    function arrives(position: number, before: boolean): boolean
    {
        for (const step of [1, reach])
        {
            const x = upright ? position : (before ? disc.x0 - step : disc.x1 - 1 + step);
            const y = upright ? (before ? disc.y0 - step : disc.y1 - 1 + step) : position;

            if (x < 0 || y < 0 || x >= width || y >= height || data[y * width + x] !== 1)
            {
                return false;
            }
        }

        return true;
    }

    for (const before of [true, false])
    {
        let start = -1;

        for (let position = from; position <= to; position++)
        {
            const on = position < to && arrives(position, before);

            if (on && start < 0)
            {
                start = position;
            }
            else if (!on && start >= 0)
            {
                // A line, not the side of a box or a band the disc stands against.
                if (position - start <= widest)
                {
                    for (let along = start; along < position; along++)
                    {
                        const first = upright ? (before ? disc.y0 : centerY) : (before ? disc.x0 : centerX);
                        const last = upright ? (before ? centerY : disc.y1 - 1) : (before ? centerX : disc.x1 - 1);

                        for (let across = first; across <= last; across++)
                        {
                            data[(upright ? across : along) * width + (upright ? along : across)] = 1;
                        }
                    }
                }

                start = -1;
            }
        }
    }
}

/**
 * Nodes drawn as lettered boxes. A tree of ancestral ranges sets a colored square with a code
 * on every node and a colored bar with a code on every tip; the lines stop at their edges.
 */

import type { Box, RgbaImage } from "./types.ts";

/**
 * Where a line of the drawing, or a neighboring box, meets a box.
 */
export type BoxLink = {
    /**
     * Side of the box it meets.
     */
    side: "left" | "right" | "top" | "bottom";

    /**
     * Position along that side: y on the left and right, x on the top and bottom.
     */
    at: number;

    /**
     * Index of the neighboring box, or null for a line.
     */
    neighbor: number | null;
};

/**
 * A solid box of one color with lettering in it.
 */
export type LetteredBox = {
    /**
     * Its extent.
     */
    box: Box;

    /**
     * The lines and boxes that meet it.
     */
    links: Array<BoxLink>;

    /**
     * True for a disc, such as a pie chart; its box is then the square around it.
     */
    round?: boolean;

    /**
     * Radius of a disc, in pixels.
     */
    radius?: number;
};

/**
 * Result of reading the lettered boxes of a figure.
 */
export type NodeBoxResult = {
    /**
     * The image with boxes replaced by lines; the given image when the figure has none.
     */
    image: RgbaImage;

    /**
     * Number of boxes read as nodes.
     */
    nodes: number;

    /**
     * Number of boxes read as the bars of tips.
     */
    bars: number;

    /**
     * Number of discs on nodes, pie charts and the like, read as junctions.
     */
    pies: number;
};

/**
 * Darkest a line or a letter is, as a luminance.
 */
const darkest = 90;

/**
 * Luminance below which a pixel is dark whatever its color.
 */
const darkestTinted = 45;

/**
 * Largest difference between the channels of a dark pixel.
 */
const darkChroma = 60;

/**
 * Largest difference in color, summed over the channels, between neighbors of one box.
 */
const sameColor = 48;

/**
 * Builds the summed-area table of a mask, one row and one column larger than it.
 *
 * @param mask - Zeros and ones.
 * @param width - Mask width.
 * @param height - Mask height.
 * @returns The table.
 */
function sumMask(mask: Uint8Array, width: number, height: number): Int32Array
{
    const table = new Int32Array((width + 1) * (height + 1));

    for (let y = 0; y < height; y++)
    {
        let row = 0;

        for (let x = 0; x < width; x++)
        {
            row += mask[y * width + x];
            table[(y + 1) * (width + 1) + x + 1] = table[y * (width + 1) + x + 1] + row;
        }
    }

    return table;
}

/**
 * Sums a table over a rectangle, clipped to the mask.
 *
 * @param table - Summed-area table.
 * @param width - Mask width.
 * @param height - Mask height.
 * @param x0 - Left, inclusive.
 * @param y0 - Top, inclusive.
 * @param x1 - Right, exclusive.
 * @param y1 - Bottom, exclusive.
 * @returns The sum.
 */
function sumOver(table: Int32Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): number
{
    const left = Math.max(0, x0);
    const top = Math.max(0, y0);
    const right = Math.min(width, x1);
    const bottom = Math.min(height, y1);

    if (right <= left || bottom <= top)
    {
        return 0;
    }

    const stride = width + 1;

    return table[bottom * stride + right] - table[top * stride + right] - table[bottom * stride + left] + table[top * stride + left];
}

/**
 * Keeps the parts of a mask that a square of a given size fits in.
 *
 * @param mask - Zeros and ones.
 * @param width - Mask width.
 * @param height - Mask height.
 * @param size - Side of the square.
 * @returns The opened mask.
 */
function openMask(mask: Uint8Array, width: number, height: number, size: number): Uint8Array
{
    const table = sumMask(mask, width, height);
    const anchors = new Uint8Array(width * height);

    for (let y = 0; y + size <= height; y++)
    {
        for (let x = 0; x + size <= width; x++)
        {
            anchors[y * width + x] = sumOver(table, width, height, x, y, x + size, y + size) === size * size ? 1 : 0;
        }
    }

    const anchorTable = sumMask(anchors, width, height);
    const opened = new Uint8Array(width * height);

    for (let y = 0; y < height; y++)
    {
        for (let x = 0; x < width; x++)
        {
            opened[y * width + x] = sumOver(anchorTable, width, height, x - size + 1, y - size + 1, x + 1, y + 1) > 0 ? 1 : 0;
        }
    }

    return opened;
}

/**
 * What was found of boxes on a figure.
 */
type BoxSurvey = {
    /**
     * The lettered boxes.
     */
    boxes: Array<LetteredBox>;

    /**
     * Colored pixels of pieces thinner than a box: bars and bands laid behind the drawing.
     */
    thin: Uint8Array;

    /**
     * Pixels of plain bars: level strips of one color with no outline.
     */
    plain: Uint8Array;

    /**
     * Whether the discs were looked for at the smaller size.
     */
    small: boolean;

    /**
     * Breadth of the lines of the drawing, in pixels.
     */
    thickness: number;
};

/**
 * Finds the solid boxes of one color that hold lettering, with the lines and the other boxes
 * that meet each.
 *
 * @param image - The figure.
 * @returns The boxes, possibly none.
 */
export function findLetteredBoxes(image: RgbaImage): Array<LetteredBox>
{
    return surveyBoxes(image).boxes;
}

/**
 * Surveys a figure for lettered boxes and for the thin colored pieces behind its drawing.
 *
 * @param image - The figure.
 * @returns The survey.
 */
function surveyBoxes(image: RgbaImage, smallDiscs = false): BoxSurvey
{
    const { width, height, data } = image;
    const count = width * height;
    const dark = new Uint8Array(count);
    const colored = new Uint8Array(count);
    const solid = new Uint8Array(count);

    for (let index = 0; index < count; index++)
    {
        const offset = 4 * index;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

        // Dark and nearly neutral, or very dark whatever its hue: a line drawn over a bar of
        // color comes out navy, and is a line still (Sallam 2018, lines of 0, 0, 99).
        dark[index] = luminance < darkest && (chroma < darkChroma || luminance < darkestTinted) ? 1 : 0;
        colored[index] = dark[index] === 0 && (luminance < 235 || chroma > 20) ? 1 : 0;
        solid[index] = dark[index] | colored[index];
    }

    // A box is as thick as a letter is tall and more; the bars of an age's uncertainty and
    // the lines are thinner than that.
    const size = Math.max(12, Math.round(0.012 * Math.min(width, height)));

    // A plain bar: a level strip of one color with no outline, laid behind the drawing for
    // the uncertainty of a node's age. It may be as thick as the opening square, and a pie
    // with such a bar across it is then no circle (Sallam 2018). Strips of one color at
    // least three squares long and at most a square and a half thick, with no dark ink on
    // both edges, are found row by row and left out of the solid ink.
    const plain = new Uint8Array(count);

    function isSameAt(first: number, second: number): boolean
    {
        return Math.abs(data[4 * first] - data[4 * second]) + Math.abs(data[4 * first + 1] - data[4 * second + 1]) + Math.abs(data[4 * first + 2] - data[4 * second + 2]) <= sameColor;
    }

    for (let y = 0; y < height; y++)
    {
        let runStart = -1;

        for (let x = 0; x <= width; x++)
        {
            const index = y * width + x;
            const chroma = x < width ? Math.max(data[4 * index], data[4 * index + 1], data[4 * index + 2]) - Math.min(data[4 * index], data[4 * index + 1], data[4 * index + 2]) : 0;
            const on = x < width && colored[index] === 1 && chroma >= 25 && (runStart < 0 || isSameAt(index, y * width + runStart));

            if (on && runStart < 0)
            {
                runStart = x;
            }
            else if (!on && runStart >= 0)
            {
                if (x - runStart >= 3 * size)
                {
                    // Its thickness and its edges, at a few places along it.
                    let thin = 0;
                    let bare = 0;
                    let sampled = 0;

                    for (let at = runStart + 2; at < x - 2; at += Math.max(4, Math.round(size / 2)))
                    {
                        let top = y;
                        let bottom = y;

                        while (top > 0 && y - top <= 2 * size && isSameAt((top - 1) * width + at, y * width + at))
                        {
                            top--;
                        }

                        while (bottom < height - 1 && bottom - y <= 2 * size && isSameAt((bottom + 1) * width + at, y * width + at))
                        {
                            bottom++;
                        }

                        const above = top > 1 && (dark[(top - 1) * width + at] === 1 || dark[(top - 2) * width + at] === 1);
                        const below = bottom < height - 2 && (dark[(bottom + 1) * width + at] === 1 || dark[(bottom + 2) * width + at] === 1);

                        sampled++;
                        thin += bottom - top + 1 <= 1.5 * size ? 1 : 0;
                        bare += above && below ? 0 : 1;
                    }

                    if (sampled > 0 && 5 * thin >= 4 * sampled && 5 * bare >= 4 * sampled)
                    {
                        plain.fill(1, y * width + runStart, y * width + x);
                    }
                }

                runStart = on ? x : -1;
            }
        }
    }

    // Discs are looked for in the ink without those bars; boxes in all of it, as before:
    // left out there too, a box of Vila 2022 was lost with the bar across it.
    const bare = new Uint8Array(count);

    for (let index = 0; index < count; index++)
    {
        bare[index] = plain[index] === 1 ? 0 : solid[index];
    }

    const opened = openMask(solid, width, height, size);
    // Small pies are looked for with a smaller square, still thicker than any line, when
    // the figure has none of the usual size (Zhang 2024: pies of 22 pixels where the
    // square for boxes is 29).
    const discSize = smallDiscs ? Math.max(8, Math.round(size / 2.5)) : size;
    const round = openMask(bare, width, height, discSize);
    const darkTable = sumMask(dark, width, height);
    const solidTable = sumMask(solid, width, height);
    const labels = new Uint8Array(count);
    const found = new Array<LetteredBox>();

    // Solid to its corners, lettered, and no taller than a few letters: a picture or a band
    // of the ground is larger, and a plain bar holds nothing. A long bar holds one letter,
    // so the least lettering is a count, not a share.
    function addBox(box: Box): void
    {
        const boxArea = (box.x1 - box.x0) * (box.y1 - box.y0);
        const lettering = sumOver(darkTable, width, height, box.x0, box.y0, box.x1, box.y1);
        const filled = sumOver(solidTable, width, height, box.x0, box.y0, box.x1, box.y1);
        const tall = box.y1 - box.y0;
        const wide = box.x1 - box.x0;

        // A sector of a pie is a solid piece of one color too, and no box.
        let sector = false;

        for (const disc of discs)
        {
            const overlapX = Math.min(disc.box.x1, box.x1) - Math.max(disc.box.x0, box.x0);
            const overlapY = Math.min(disc.box.y1, box.y1) - Math.max(disc.box.y0, box.y0);

            sector = sector || (overlapX > 0 && overlapY > 0 && 2 * overlapX * overlapY >= boxArea);
        }

        if (!sector && tall >= size && wide >= size && tall <= 6 * size && filled >= 0.9 * boxArea && lettering >= 0.05 * size * size && lettering <= 0.45 * boxArea)
        {
            found.push({ box, links: [] });
        }
    }

    const stack = new Array<number>();

    // The discs: a pie chart set on a node, in several colors, about as tall as wide and
    // filling its square as a circle does. They are looked for in the solid ink of any
    // color, since a pie's sectors differ; a disc that is all dark is a node's dot, which
    // is read by other means.
    const discLabels = new Uint8Array(count);
    const discs = new Array<LetteredBox>();
    const clumps = new Array<Box>();
    const tint = new Uint8Array(count);

    // Tinted is anything solid that is not black: a dark green sector is dark and tinted.
    for (let index = 0; index < count; index++)
    {
        const offset = 4 * index;
        const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
        const chroma = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]);

        tint[index] = solid[index] === 1 && !(luminance < darkest && chroma < 25) ? 1 : 0;
    }

    const coloredTable = sumMask(tint, width, height);
    const cornerTable = sumMask(round, width, height);

    for (let start = 0; start < count; start++)
    {
        if (round[start] === 0 || discLabels[start] !== 0)
        {
            continue;
        }

        const box = { x0: width, y0: height, x1: 0, y1: 0 };
        let area = 0;
        discLabels[start] = 1;
        stack.push(start);

        while (stack.length > 0)
        {
            const index = stack.pop() as number;
            const x = index % width;
            const y = (index - x) / width;
            area++;
            box.x0 = Math.min(box.x0, x);
            box.y0 = Math.min(box.y0, y);
            box.x1 = Math.max(box.x1, x + 1);
            box.y1 = Math.max(box.y1, y + 1);

            for (const step of [-1, 1, -width, width])
            {
                const next = index + step;

                if (next >= 0 && next < count && !(step === -1 && x === 0) && !(step === 1 && x === width - 1) && round[next] === 1 && discLabels[next] === 0)
                {
                    discLabels[next] = 1;
                    stack.push(next);
                }
            }
        }

        const wide = box.x1 - box.x0;
        const tall = box.y1 - box.y0;
        const boxArea = wide * tall;
        const tinted = sumOver(coloredTable, width, height, box.x0, box.y0, box.x1, box.y1);
        // A circle leaves the corners of its square empty. A box with something
        // standing on one edge fills its square as much as a circle does, and is a box
        // (Vila 2022, a lettered square taken for a disc with the bar across it left out).
        const corner = Math.max(2, Math.round(0.14 * Math.min(wide, tall)));
        const roundTable = cornerTable;
        const corners = [
            sumOver(roundTable, width, height, box.x0, box.y0, box.x0 + corner, box.y0 + corner),
            sumOver(roundTable, width, height, box.x1 - corner, box.y0, box.x1, box.y0 + corner),
            sumOver(roundTable, width, height, box.x0, box.y1 - corner, box.x0 + corner, box.y1),
            sumOver(roundTable, width, height, box.x1 - corner, box.y1 - corner, box.x1, box.y1),
        ];
        let full = 0;

        for (const filled of corners)
        {
            full += filled > 0.25 * corner * corner ? 1 : 0;
        }

        // One corner may hold the edge of the pie beside it.
        const cornered = full >= 2;

        if (!cornered && wide >= discSize && wide <= 8 * size && 5 * wide >= 4 * tall && 5 * tall >= 4 * wide && area >= 0.68 * boxArea && area <= 0.93 * boxArea && tinted >= 0.3 * boxArea)
        {
            discs.push({ box, links: [], round: true, radius: measureRadius(box) });
        }
        else if (wide >= size && tall >= size && wide <= 16 * size && tall <= 16 * size && area >= 0.45 * boxArea && tinted >= 0.3 * boxArea)
        {
            clumps.push(box);
        }
    }

    // Pies that touch or overlap are one piece of ink and no circle. Such a piece is taken
    // apart at the middles of its discs: the places where the largest square fits around a
    // point, which in a disc is its center. Each gives a disc of the radius that square
    // has inside it, and the next is looked for clear of those found.
    const opening = sumMask(round, width, height);

    function measureSquareAt(x: number, y: number, most: number): number
    {
        let fits = 0;
        let fails = most + 1;

        while (fails - fits > 1)
        {
            const half = Math.floor((fits + fails) / 2);

            if (sumOver(opening, width, height, x - half, y - half, x + half + 1, y + half + 1) === (2 * half + 1) * (2 * half + 1))
            {
                fits = half;
            }
            else
            {
                fails = half;
            }
        }

        return fits;
    }

    function fitsDisc(centerX: number, centerY: number, radius: number): boolean
    {
        let inside = 0;
        let filled = 0;

        for (let y = centerY - radius; y <= centerY + radius; y += 2)
        {
            for (let x = centerX - radius; x <= centerX + radius; x += 2)
            {
                if ((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY) <= radius * radius)
                {
                    inside++;
                    filled += x >= 0 && y >= 0 && x < width && y < height ? round[y * width + x] : 0;
                }
            }
        }

        return filled >= 0.95 * inside;
    }

    // Only on a figure that has pies standing alone, five or more, and only into discs of
    // the sizes those have: any thick piece of ink has places where a square fits, and
    // taken apart without this, a figure of range bars gave 204 discs (Maidment 2020).
    const radii = new Array<number>();
    let widest = 0;

    for (const disc of discs)
    {
        radii.push(disc.radius as number);
        widest = Math.max(widest, 2 * (disc.radius as number));
    }

    function isKnownRadius(radius: number): boolean
    {
        for (const known of radii)
        {
            if (Math.abs(known - radius) <= 0.12 * known)
            {
                return true;
            }
        }

        return false;
    }

    for (const clump of radii.length >= 5 && !smallDiscs ? clumps : [])
    {
        if (clump.x1 - clump.x0 > 3 * widest || clump.y1 - clump.y0 > 3 * widest)
        {
            continue;
        }

        const most = Math.ceil(Math.max(clump.x1 - clump.x0, clump.y1 - clump.y0) / 2);
        const peaks = new Array<Array<number>>();

        for (let y = clump.y0; y < clump.y1; y += 2)
        {
            for (let x = clump.x0; x < clump.x1; x += 2)
            {
                if (round[y * width + x] === 1)
                {
                    const half = measureSquareAt(x, y, most);

                    if (2 * half + 1 >= size)
                    {
                        peaks.push([half, x, y]);
                    }
                }
            }
        }

        function comparePeaks(first: Array<number>, second: Array<number>): number
        {
            return second[0] - first[0];
        }

        peaks.sort(comparePeaks);

        const parts = new Array<LetteredBox>();

        for (const [half, x, y] of peaks)
        {
            // A square of that half-side inside a circle reaches its rim at the corners.
            const radius = Math.round(half * Math.SQRT2);
            let taken = false;

            for (const part of parts)
            {
                const partX = (part.box.x0 + part.box.x1 - 1) / 2;
                const partY = (part.box.y0 + part.box.y1 - 1) / 2;
                const apart = 0.9 * Math.max(part.radius as number, radius);

                taken = taken || (x - partX) * (x - partX) + (y - partY) * (y - partY) < apart * apart;
            }

            if (!taken && isKnownRadius(radius + 3) && fitsDisc(x, y, radius - 2))
            {
                parts.push({ box: { x0: x - radius, y0: y - radius, x1: x + radius + 1, y1: y + radius + 1 }, links: [], round: true, radius: radius + 3 });
            }
        }

        // One disc found in a piece is the piece itself, and it was no circle.
        if (parts.length >= 2)
        {
            for (const part of parts)
            {
                discs.push(part);
            }
        }
    }

    for (let start = 0; start < count; start++)
    {
        if (opened[start] === 0 || colored[start] === 0 || labels[start] !== 0)
        {
            continue;
        }

        const box = { x0: width, y0: height, x1: 0, y1: 0 };
        const rowStarts = new Map<number, number>();
        const rowEnds = new Map<number, number>();
        labels[start] = 1;
        stack.push(start);

        while (stack.length > 0)
        {
            const index = stack.pop() as number;
            const x = index % width;
            const y = (index - x) / width;
            rowStarts.set(y, Math.min(rowStarts.get(y) ?? width, x));
            rowEnds.set(y, Math.max(rowEnds.get(y) ?? 0, x + 1));
            box.x0 = Math.min(box.x0, x);
            box.y0 = Math.min(box.y0, y);
            box.x1 = Math.max(box.x1, x + 1);
            box.y1 = Math.max(box.y1, y + 1);

            for (const step of [-1, 1, -width, width])
            {
                const next = index + step;

                if (next < 0 || next >= count || (step === -1 && x === 0) || (step === 1 && x === width - 1) || opened[next] === 0 || colored[next] === 0 || labels[next] !== 0)
                {
                    continue;
                }

                const difference = Math.abs(data[4 * next] - data[4 * index]) + Math.abs(data[4 * next + 1] - data[4 * index + 1]) + Math.abs(data[4 * next + 2] - data[4 * index + 2]);

                if (difference <= sameColor)
                {
                    labels[next] = 1;
                    stack.push(next);
                }
            }
        }

        // Two boxes of one color that stand against each other are one piece: a square
        // on a node with the bar of a tip under it. The piece is cut where its rows change
        // their extent.
        let bandTop = box.y0;

        for (let y = box.y0 + 1; y <= box.y1; y++)
        {
            const changed = y === box.y1
                || Math.abs((rowStarts.get(y) ?? 0) - (rowStarts.get(y - 1) ?? 0)) > 3
                || Math.abs((rowEnds.get(y) ?? 0) - (rowEnds.get(y - 1) ?? 0)) > 3;

            if (changed)
            {
                const middle = Math.floor((bandTop + y - 1) / 2);

                addBox({ x0: rowStarts.get(middle) ?? box.x0, y0: bandTop, x1: rowEnds.get(middle) ?? box.x1, y1: y });
                bandTop = y;
            }
        }
    }

    for (const disc of discs)
    {
        found.push(disc);
    }

    // The lines that meet each box: dark ink just outside an edge that goes on away from it.
    function isDark(x: number, y: number): boolean
    {
        return x >= 0 && y >= 0 && x < width && y < height && dark[y * width + x] === 1;
    }

    const breadths = new Array<number>();

    function addLineLinks(lettered: LetteredBox): void
    {
        const { box } = lettered;
        const out = 3;
        // A line may turn a few pixels from the box (Vila 2022, the branch to Saltasaurus).
        const far = out + 5;
        const sides: Array<BoxLink["side"]> = ["left", "right", "top", "bottom"];

        for (const side of sides)
        {
            const upright = side === "left" || side === "right";
            const from = upright ? box.y0 : box.x0;
            const to = upright ? box.y1 : box.x1;
            let runStart = -1;

            for (let along = from; along <= to; along++)
            {
                let near = false;
                let beyond = false;

                if (along < to)
                {
                    const nearX = side === "left" ? box.x0 - out : side === "right" ? box.x1 - 1 + out : along;
                    const nearY = side === "top" ? box.y0 - out : side === "bottom" ? box.y1 - 1 + out : along;
                    const farX = side === "left" ? box.x0 - far : side === "right" ? box.x1 - 1 + far : along;
                    const farY = side === "top" ? box.y0 - far : side === "bottom" ? box.y1 - 1 + far : along;

                    near = isDark(nearX, nearY);
                    beyond = isDark(farX, farY);
                }

                if (near && beyond && runStart < 0)
                {
                    runStart = along;
                }
                else if (!(near && beyond) && runStart >= 0)
                {
                    // A line crosses the edge in a run no longer than a line is broad.
                    if (along - runStart <= Math.max(6, Math.round(size / 3)))
                    {
                        lettered.links.push({ side, at: Math.round((runStart + along - 1) / 2), neighbor: null });
                        breadths.push(along - runStart);
                    }

                    runStart = -1;
                }
            }
        }
    }

    // A line may also come down beside a box and end against its side, where the box was
    // set a little off the line (Vila 2022, the stem into the box at Maxakalisaurus). It
    // shows as dark ink along a side that begins beyond one corner and ends short of the
    // other.
    function addEndingLinks(lettered: LetteredBox): void
    {
        const { box } = lettered;
        const sides: Array<BoxLink["side"]> = ["left", "right", "top", "bottom"];

        for (const side of sides)
        {
            const upright = side === "left" || side === "right";
            const from = (upright ? box.y0 : box.x0) - size;
            const to = (upright ? box.y1 : box.x1) + size;
            const first = upright ? box.y0 : box.x0;
            const last = upright ? box.y1 : box.x1;
            let runStart = -1;

            for (let along = from; along <= to; along++)
            {
                let near = false;

                for (let out = 2; out <= 5 && along < to && !near; out++)
                {
                    const x = side === "left" ? box.x0 - out : side === "right" ? box.x1 - 1 + out : along;
                    const y = side === "top" ? box.y0 - out : side === "bottom" ? box.y1 - 1 + out : along;

                    near = isDark(x, y);
                }

                if (near && runStart < 0)
                {
                    runStart = along;
                }
                else if (!near && runStart >= 0)
                {
                    const inset = Math.round(size / 4);

                    if (along - runStart >= size && runStart < first && along > first + inset && along < last - inset)
                    {
                        lettered.links.push({ side, at: along - 2, neighbor: null });
                    }
                    else if (along - runStart >= size && along > last && runStart > first + inset && runStart < last - inset)
                    {
                        lettered.links.push({ side, at: runStart + 1, neighbor: null });
                    }

                    runStart = -1;
                }
            }
        }
    }

    // A disc is a little larger than the square it was found in: the square that opened
    // the ink does not reach into the ends of a circle's diameters.
    function measureRadius(box: Box): number
    {
        const found = Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2;

        return found + Math.max(0, found - Math.sqrt(Math.max(0, found * found - (discSize * discSize) / 4))) + 1;
    }

    // The lines that meet a disc are looked for around its rim, not its square: the
    // corners of the square hold the lines of whatever stands beside it. A line shows as a
    // short run of dark ink just off the rim that is still there a little further out. It
    // may leave along a chord, level or upright, so further out it is looked for a little
    // to either side as well as straight on.
    function addRimLinks(lettered: LetteredBox): void
    {
        const { box } = lettered;
        const centerX = (box.x0 + box.x1 - 1) / 2;
        const centerY = (box.y0 + box.y1 - 1) / 2;
        const radius = lettered.radius ?? measureRadius(box);
        const steps = Math.max(16, Math.round(2 * Math.PI * (radius + 3)));
        const near = new Uint8Array(steps);
        const far = new Uint8Array(steps);

        for (let step = 0; step < steps; step++)
        {
            const angle = (2 * Math.PI * step) / steps;

            near[step] = isDark(Math.round(centerX + (radius + 3) * Math.cos(angle)), Math.round(centerY + (radius + 3) * Math.sin(angle))) ? 1 : 0;
            far[step] = isDark(Math.round(centerX + (radius + 10) * Math.cos(angle)), Math.round(centerY + (radius + 10) * Math.sin(angle))) ? 1 : 0;
        }

        // Begin at a gap, so that a run across the first step is not cut in two.
        let origin = 0;

        while (origin < steps && near[origin] === 1)
        {
            origin++;
        }

        if (origin === steps)
        {
            return;
        }

        const longest = Math.max(6, Math.round(size / 3));
        const aside = Math.max(4, Math.round(size / 3));
        let runStart = -1;

        for (let count = 1; count <= steps; count++)
        {
            const step = (origin + count) % steps;

            if (near[step] === 1 && runStart < 0)
            {
                runStart = count;
            }
            else if (near[step] === 0 && runStart >= 0)
            {
                const middle = (origin + Math.round((runStart + count - 1) / 2)) % steps;
                let onward = false;

                for (let offset = -aside; offset <= aside; offset++)
                {
                    onward = onward || far[(middle + offset + steps) % steps] === 1;
                }

                if (count - runStart <= longest && onward)
                {
                    const angle = (2 * Math.PI * middle) / steps;
                    const x = Math.round(centerX + (radius + 3) * Math.cos(angle));
                    const y = Math.round(centerY + (radius + 3) * Math.sin(angle));
                    const level = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));

                    lettered.links.push({ side: level ? (Math.cos(angle) > 0 ? "right" : "left") : (Math.sin(angle) > 0 ? "bottom" : "top"), at: level ? y : x, neighbor: null });
                    breadths.push(count - runStart);
                }

                runStart = -1;
            }
        }
    }

    for (const lettered of found)
    {
        if (lettered.round === true)
        {
            addRimLinks(lettered);
        }
        else
        {
            addLineLinks(lettered);
            addEndingLinks(lettered);
        }
    }

    // The boxes that stand against each other, with no line between.
    const near = 4;

    // Two pies that touch are joined where they touch: a line runs from one node to the
    // other under them, and shows on neither rim.
    for (let first = 0; first < found.length; first++)
    {
        for (let second = 0; second < found.length; second++)
        {
            const one = found[first];
            const other = found[second];

            if (first === second || one.round !== true || other.round !== true)
            {
                continue;
            }

            const oneX = (one.box.x0 + one.box.x1 - 1) / 2;
            const oneY = (one.box.y0 + one.box.y1 - 1) / 2;
            const otherX = (other.box.x0 + other.box.x1 - 1) / 2;
            const otherY = (other.box.y0 + other.box.y1 - 1) / 2;
            const reach = (one.radius as number) + (other.radius as number) + 4;

            if ((oneX - otherX) * (oneX - otherX) + (oneY - otherY) * (oneY - otherY) > reach * reach)
            {
                continue;
            }

            if (Math.abs(otherY - oneY) >= Math.abs(otherX - oneX))
            {
                one.links.push({ side: otherY > oneY ? "bottom" : "top", at: Math.round((oneX + otherX) / 2), neighbor: second });
            }
            else
            {
                one.links.push({ side: otherX > oneX ? "right" : "left", at: Math.round((oneY + otherY) / 2), neighbor: second });
            }
        }
    }

    for (let first = 0; first < found.length; first++)
    {
        for (let second = 0; second < found.length; second++)
        {
            const a = found[first].box;
            const b = found[second].box;

            // Discs do not stand against things as boxes do: their squares overlap where
            // the discs themselves are apart.
            if (first === second || found[first].round === true || found[second].round === true)
            {
                continue;
            }

            const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
            const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);

            // Against each other or a little into each other: a square is often set over
            // the end of a bar.
            if (overlapX < -near || overlapY < -near || (overlapX <= 0 && overlapY <= 0))
            {
                continue;
            }

            if (overlapX < overlapY)
            {
                found[first].links.push({ side: a.x0 + a.x1 < b.x0 + b.x1 ? "right" : "left", at: Math.round((Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2), neighbor: second });
            }
            else
            {
                found[first].links.push({ side: a.y0 + a.y1 < b.y0 + b.y1 ? "bottom" : "top", at: Math.round((Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2), neighbor: second });
            }
        }
    }

    // The colored pieces too thin to be boxes, where their color is plain: the fringe of a
    // black line is gray.
    const thin = new Uint8Array(count);

    for (let index = 0; index < count; index++)
    {
        const offset = 4 * index;
        const chroma = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]);

        const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

        // Thin, or pale: where a bar passes behind a box the two are one thick piece.
        thin[index] = colored[index] === 1 && chroma >= 25 && (opened[index] === 0 || luminance >= 150) ? 1 : 0;
    }

    breadths.sort(compareNumbers);

    return { boxes: found, thin, plain, small: smallDiscs, thickness: breadths.length === 0 ? 3 : Math.max(2, breadths[Math.floor(breadths.length / 2)]) };
}

/**
 * Orders numbers ascending.
 *
 * @param first - A number.
 * @param second - Another.
 * @returns Negative, zero or positive.
 */
function compareNumbers(first: number, second: number): number
{
    return first - second;
}

/**
 * Replaces the lettered boxes of a tree of ancestral ranges by lines: a box on a node becomes
 * the junction of the lines that meet it, and the bar of a tip becomes a branch through it.
 * The thin colored bars and bands behind the drawing are taken out with them. A figure with
 * few such boxes, or with boxes of several makes, is left as it is (Vila 2022 has twenty of
 * one height and twenty-one bars).
 *
 * @param image - The figure.
 * @returns The image, and how many boxes were read.
 */
export function resolveNodeBoxes(image: RgbaImage): NodeBoxResult
{
    const usual = resolveSurveyed(image, surveyBoxes(image));

    if (usual.nodes > 0 || usual.pies > 0)
    {
        return usual;
    }

    return resolveSurveyed(image, surveyBoxes(image, true));
}

/**
 * Replaces the boxes and discs of a survey by lines, where the figure is of a kind that has
 * them on its nodes.
 *
 * @param image - The figure.
 * @param survey - What was found on it.
 * @returns The image, and how many marks were read.
 */
function resolveSurveyed(image: RgbaImage, survey: BoxSurvey): NodeBoxResult
{
    const { width, height } = image;
    const { boxes } = survey;
    const kinds = new Array<"node" | "bar" | "other">();

    // Boxes in a row of four or more, each against the next, are the cells of a chart.
    const group = new Array<number>();

    for (let index = 0; index < boxes.length; index++)
    {
        group.push(index);
    }

    function findGroup(index: number): number
    {
        let at = index;

        while (group[at] !== at)
        {
            at = group[at];
        }

        return at;
    }

    for (let index = 0; index < boxes.length; index++)
    {
        for (const link of boxes[index].links)
        {
            if (link.neighbor !== null)
            {
                group[findGroup(index)] = findGroup(link.neighbor);
            }
        }
    }

    const groupSizes = new Map<number, number>();

    for (let index = 0; index < boxes.length; index++)
    {
        groupSizes.set(findGroup(index), (groupSizes.get(findGroup(index)) ?? 0) + 1);
    }

    let nodes = 0;
    let bars = 0;
    let pies = 0;
    let junctions = 0;

    // Whether the lines that meet a disc are those of a node: an upright through it, met
    // at one place on its top and its bottom, or a stem at its left and two branches or
    // more leaving its right. A dot drawn on a branch has the branch through it, level,
    // and a picture has a fringe of many lines.
    function isJunction(links: Array<BoxLink>): boolean
    {
        let left = 0;
        let right = 0;
        let through = false;

        for (const first of links)
        {
            left += first.side === "left" ? 1 : 0;
            right += first.side === "right" ? 1 : 0;

            for (const second of links)
            {
                through = through || (first.side === "top" && second.side === "bottom" && Math.abs(first.at - second.at) <= 2 * survey.thickness);
            }
        }

        return links.length <= 6 && (through || (left >= 1 && right >= 2));
    }

    // A node's box is met by a line and by something more. A tip's bar is met once: by a
    // line, on any side but its far one, or by the box of its node.
    const chosen = new Array<BoxLink | null>();

    for (let index = 0; index < boxes.length; index++)
    {
        let lines = 0;

        for (const link of boxes[index].links)
        {
            lines += link.neighbor === null ? 1 : 0;
        }

        const charted = (groupSizes.get(findGroup(index)) ?? 0) >= 4;

        // A node's box is compact; a strip of a chart or a band with a name on it is long.
        const { box } = boxes[index];
        const compact = box.x1 - box.x0 <= 3 * (box.y1 - box.y0);

        // A pie on a node is met by two lines or more, on two sides or more: its stem and a
        // child at the least. A disc in a legend is met by none.
        if (boxes[index].round === true)
        {
            const sides = new Set<string>();

            for (const link of boxes[index].links)
            {
                sides.add(link.side);
            }

            // A line at the least; the pie it touches counts as the other thing met.
            kinds.push(lines >= 1 && boxes[index].links.length >= 2 && sides.size >= 2 ? "node" : "other");
            chosen.push(null);
            pies += kinds[index] === "node" ? 1 : 0;
            junctions += kinds[index] === "node" && isJunction(boxes[index].links) ? 1 : 0;

            continue;
        }

        kinds.push(!charted && compact && boxes[index].links.length >= 2 && lines >= 1 ? "node" : "other");
        chosen.push(null);
        nodes += kinds[index] === "node" ? 1 : 0;
    }

    for (let index = 0; index < boxes.length; index++)
    {
        const { links } = boxes[index];

        if (kinds[index] === "node" || boxes[index].round === true || (groupSizes.get(findGroup(index)) ?? 0) >= 4)
        {
            continue;
        }

        for (const link of links)
        {
            const usable = link.neighbor === null ? links.length === 1 && link.side !== "right" : kinds[link.neighbor] === "node" && boxes[link.neighbor].round !== true;

            chosen[index] = chosen[index] ?? (usable ? link : null);
        }

        if (chosen[index] !== null)
        {
            kinds[index] = "bar";
            bars++;
        }
    }

    // The figure is a tree of ranges when its nodes' boxes are of one make and its tips
    // are lettered too: five boxes or more that lines meet on two sides, four in five of
    // them of one height, and half as many bars on tips. Lettered boxes of other kinds are
    // common, in charts, legends and labels; without this test the step fired on 65 of 239
    // figures and cost 662 names.
    const heights = new Array<number>();

    for (let index = 0; index < boxes.length; index++)
    {
        const sides = new Set<string>();

        for (const link of boxes[index].links)
        {
            if (link.neighbor === null)
            {
                sides.add(link.side);
            }
        }

        if (kinds[index] === "node" && sides.size >= 2 && boxes[index].round !== true)
        {
            heights.push(boxes[index].box.y1 - boxes[index].box.y0);
        }
    }

    heights.sort(compareNumbers);

    const median = heights.length === 0 ? 0 : heights[Math.floor(heights.length / 2)];
    let alike = 0;

    for (const tall of heights)
    {
        alike += Math.abs(tall - median) <= 0.15 * median ? 1 : 0;
    }

    const ranged = heights.length >= 5 && 5 * alike >= 4 * heights.length && 2 * bars >= nodes;

    // Pies are a figure's convention too: five or more discs met as a node is, and those
    // at least half of the discs that lines meet at all. Measured without this, the step
    // took dots drawn on branches and round pictures for pies on five gold figures, and
    // cost 17 names (Rotatori 2026, Wang 2016, Carr 2010, Gomez 2024, Longrich 2024).
    const pied = junctions >= 5 && 2 * junctions >= pies;

    if (!ranged && !pied)
    {
        return { image, nodes: 0, bars: 0, pies: 0 };
    }

    for (let index = 0; index < boxes.length; index++)
    {
        if (boxes[index].round === true ? !pied : !ranged)
        {
            kinds[index] = "other";
        }
    }

    nodes = ranged ? nodes : 0;
    bars = ranged ? bars : 0;
    pies = pied ? pies : 0;

    // Where a bar stands on a node's box and a line leaves the box's other side, the bar is
    // met at the line's place, so the two make one upright and not a step.
    for (let index = 0; index < boxes.length; index++)
    {
        const link = chosen[index];

        if (kinds[index] !== "bar" || link === null || link.neighbor === null || (link.side !== "top" && link.side !== "bottom"))
        {
            continue;
        }

        const bar = boxes[index].box;

        for (const other of boxes[link.neighbor].links)
        {
            if (other.neighbor === null && (other.side === "top" || other.side === "bottom") && other.at > bar.x0 + 2 && other.at < bar.x1 - 2)
            {
                for (const back of boxes[link.neighbor].links)
                {
                    back.at = back.neighbor === index ? other.at : back.at;
                }

                link.at = other.at;
            }
        }
    }

    const data = new Uint8ClampedArray(image.data);
    const half = Math.floor(survey.thickness / 2);

    function paint(x0: number, y0: number, x1: number, y1: number, value: number): void
    {
        for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(height - 1, Math.max(y0, y1)); y++)
        {
            for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(width - 1, Math.max(x0, x1)); x++)
            {
                const offset = 4 * (y * width + x);

                data[offset] = value;
                data[offset + 1] = value;
                data[offset + 2] = value;
                data[offset + 3] = 255;
            }
        }
    }

    function drawAcross(x0: number, x1: number, y: number): void
    {
        paint(x0 - half, y - half, x1 + half, y - half + survey.thickness - 1, 0);
    }

    function drawUpright(x: number, y0: number, y1: number): void
    {
        paint(x - half, y0 - half, x - half + survey.thickness - 1, y1 + half, 0);
    }

    // The bars and bands behind the drawing go first, then the boxes; the lines are drawn
    // last, over the white.
    const kept = new Uint8Array(width * height);

    for (const lettered of boxes)
    {
        for (let y = lettered.box.y0; y < lettered.box.y1; y++)
        {
            kept.fill(1, y * width + lettered.box.x0, y * width + lettered.box.x1);
        }
    }

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;

        // On a figure with pies the plain bars behind the nodes go, and no more.
        if (!ranged)
        {
            if (pied && survey.plain[index] === 1)
            {
                data[offset] = 255;
                data[offset + 1] = 255;
                data[offset + 2] = 255;
                data[offset + 3] = 255;
            }
            else if (pied && 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2] < darkestTinted)
            {
                // A line that took its color from the bar it crossed is made black, as
                // the other lines are.
                data[offset] = 0;
                data[offset + 1] = 0;
                data[offset + 2] = 0;
            }

            continue;
        }

        if (survey.thin[index] === 1 && kept[index] === 0)
        {
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
            data[offset + 3] = 255;
        }
        else if (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2] < darkest)
        {
            // A line drawn over a colored bar takes some of its color; with the bar gone it
            // is a line like the rest, and is made black like them.
            const chroma = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]);

            if (chroma < darkChroma && kept[index] === 0)
            {
                data[offset] = 0;
                data[offset + 1] = 0;
                data[offset + 2] = 0;
            }
        }
    }

    const rim = 2;

    for (let index = 0; index < boxes.length; index++)
    {
        if (kinds[index] !== "other" && boxes[index].round === true)
        {
            // A disc goes as a disc: the corners of its square hold other things.
            const { box } = boxes[index];
            const centerX = (box.x0 + box.x1 - 1) / 2;
            const centerY = (box.y0 + box.y1 - 1) / 2;
            const radius = (boxes[index].radius ?? Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2) + rim;

            for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(height - 1, Math.ceil(centerY + radius)); y++)
            {
                for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(width - 1, Math.ceil(centerX + radius)); x++)
                {
                    if ((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY) <= radius * radius)
                    {
                        paint(x, y, x, y, 255);
                    }
                }
            }
        }
        else if (kinds[index] !== "other")
        {
            const { box } = boxes[index];

            paint(box.x0 - rim, box.y0 - rim, box.x1 - 1 + rim, box.y1 - 1 + rim, 255);
        }
    }

    for (let index = 0; index < boxes.length; index++)
    {
        const { box, links } = boxes[index];
        const middle = Math.round((box.y0 + box.y1) / 2);

        if (kinds[index] === "bar")
        {
            // A branch through the bar to its far end, from where the line or the node's
            // box meets it.
            const link = chosen[index] as BoxLink;

            if (link.side === "left")
            {
                drawAcross(box.x0 - rim - survey.thickness, box.x1 + rim, link.at);
            }
            else
            {
                drawUpright(link.at, link.side === "top" ? box.y0 - rim - survey.thickness : middle, link.side === "top" ? middle : box.y1 + rim + survey.thickness);
                drawAcross(link.at, box.x1 + rim, middle);
            }

            continue;
        }

        if (kinds[index] !== "node")
        {
            continue;
        }

        // The uprights first: each line through the top or the bottom runs in to the
        // middle, and two at one place make one upright through the box.
        const uprights = new Array<number>();
        const met = new Array<BoxLink>();

        for (const link of links)
        {
            const other = link.neighbor;

            if (other === null || kinds[other] === "node" || (kinds[other] === "bar" && (chosen[other] as BoxLink).neighbor === index))
            {
                met.push(link);
            }
        }

        // On a ladder of nodes a few pixels apart, a small pie lies over its neighbors'
        // uprights as well as its own. (Only with small pies: tried on larger ones, it cost
        // Poole 2022 a third of its names, where two uprights run side by side.) Each upright that runs through, in at the top and out at the
        // bottom at one place, is told from the others by where it is: the pie is set on
        // its own node, so its own upright is the one nearest its middle. The others are
        // drawn straight through and joined to nothing here.
        const through = new Array<number>();

        for (const first of met)
        {
            for (const second of met)
            {
                if (survey.small && boxes[index].round === true && first.neighbor === null && second.neighbor === null && first.side === "top" && second.side === "bottom" && Math.abs(first.at - second.at) <= 2 * survey.thickness)
                {
                    through.push(Math.round((first.at + second.at) / 2));
                }
            }
        }

        if (through.length >= 2)
        {
            const center = (box.x0 + box.x1 - 1) / 2;
            let own = through[0];

            for (const x of through)
            {
                own = Math.abs(x - center) < Math.abs(own - center) ? x : own;
            }

            for (const x of through)
            {
                if (x !== own)
                {
                    drawUpright(x, box.y0 - rim - survey.thickness, box.y1 + rim + survey.thickness);

                    for (let at = met.length - 1; at >= 0; at--)
                    {
                        if (met[at].neighbor === null && (met[at].side === "top" || met[at].side === "bottom") && Math.abs(met[at].at - x) <= 2 * survey.thickness)
                        {
                            met.splice(at, 1);
                        }
                    }
                }
            }
        }

        for (const link of met)
        {
            if (link.side === "top" || link.side === "bottom")
            {
                drawUpright(link.at, link.side === "top" ? box.y0 - rim - survey.thickness : middle, link.side === "top" ? middle : box.y1 + rim + survey.thickness);
                uprights.push(link.at);
            }
        }

        // Then each line through a side runs in to the nearest upright, or to the middle
        // of the box where it has none, and from there to the middle height.
        const joins = new Array<number>();

        for (const link of met)
        {
            if (link.side !== "left" && link.side !== "right")
            {
                continue;
            }

            const edge = link.side === "left" ? box.x0 - rim - survey.thickness : box.x1 + rim + survey.thickness;
            let join = Math.round((box.x0 + box.x1) / 2);
            let nearest = Infinity;

            for (const upright of uprights)
            {
                if (Math.abs(upright - edge) < nearest)
                {
                    nearest = Math.abs(upright - edge);
                    join = upright;
                }
            }

            drawAcross(Math.min(edge, join), Math.max(edge, join), link.at);
            drawUpright(join, Math.min(link.at, middle), Math.max(link.at, middle));
            joins.push(join);
        }

        let first = Infinity;
        let last = -Infinity;

        for (const x of [...uprights, ...joins])
        {
            first = Math.min(first, x);
            last = Math.max(last, x);
        }

        if (last > first)
        {
            drawAcross(first, last, middle);
        }
    }

    return { image: { width, height, data }, nodes, bars, pies };
}

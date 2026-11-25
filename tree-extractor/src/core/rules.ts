/**
 * Rules of a time scale. A time-calibrated tree is often ruled across at every stage
 * boundary, in thin gray lines from one edge of the plot to the other.
 */

import type { RgbaImage } from "./types.ts";

/**
 * Result of erasing the rules of a time scale.
 */
export type ScaleRuleResult = {
    /**
     * The image without them; the given image when there were none.
     */
    image: RgbaImage;

    /**
     * Number of rules erased.
     */
    rules: number;
};

/**
 * A line of pixels that may be a rule: where it runs and how much of it is thin gray.
 */
type RuleCandidate = {
    /**
     * Row, or column, of the line.
     */
    at: number;

    /**
     * First thin gray pixel along it.
     */
    from: number;

    /**
     * Last thin gray pixel along it.
     */
    to: number;
};

/**
 * Darkest a rule's gray is, as a luminance.
 */
const ruleDarkest = 110;

/**
 * Lightest a rule's gray is.
 */
const ruleLightest = 215;

/**
 * Erases the rules of a time scale: thin gray lines ruled across the whole plot. Turned on
 * its side such a figure has them as uprights the height of the tree, which pass for nodes
 * with every branch they cross as a child (Lamanna 2014, eighteen rules). A rule is a row or
 * a column in which thin gray pixels, with white two pixels to either side, make up three
 * tenths of the image's breadth and darker ink crosses it three times or more; rules come
 * three or more together and begin and end together. A tree drawn in thin gray lines has
 * long gray branches too, which nothing darker crosses. Only the gray is erased: where a branch of the tree lies on a rule, as a node
 * dated to a stage boundary does, its black stays.
 *
 * @param image - Image.
 * @returns The image and the number of rules erased.
 */
export function eraseScaleRules(image: RgbaImage): ScaleRuleResult
{
    const { width, height, data } = image;
    const gray = new Uint8Array(width * height);
    const white = new Uint8Array(width * height);
    const dark = new Uint8Array(width * height);

    for (let index = 0; index < width * height; index++)
    {
        const offset = 4 * index;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

        gray[index] = luminance >= ruleDarkest && luminance <= ruleLightest && chroma <= 30 ? 1 : 0;
        white[index] = luminance > ruleLightest ? 1 : 0;
        dark[index] = luminance < ruleDarkest ? 1 : 0;
    }

    // Whether a gray pixel is part of a thin line running along x (or along y): white
    // within two pixels on both sides across the line.
    function isThin(x: number, y: number, alongX: boolean): boolean
    {
        let before = false;
        let after = false;

        for (let step = 1; step <= 2; step++)
        {
            const beforeX = alongX ? x : x - step;
            const beforeY = alongX ? y - step : y;
            const afterX = alongX ? x : x + step;
            const afterY = alongX ? y + step : y;

            before = before || beforeX < 0 || beforeY < 0 || white[beforeY * width + beforeX] === 1;
            after = after || afterX >= width || afterY >= height || white[afterY * width + afterX] === 1;
        }

        return before && after;
    }

    // Whether dark ink runs across the line at a point for eight pixels or more: a branch
    // of the tree crossing a rule. Where two thin gray lines meet, the one pixel they share
    // is darker than either and is no crossing.
    function isCrossedAt(x: number, y: number, alongX: boolean): boolean
    {
        let run = 1;

        for (const step of [-1, 1])
        {
            let nextX = alongX ? x : x + step;
            let nextY = alongX ? y + step : y;

            while (nextX >= 0 && nextY >= 0 && nextX < width && nextY < height && run < 8 && dark[nextY * width + nextX] === 1)
            {
                run++;
                nextX += alongX ? 0 : step;
                nextY += alongX ? step : 0;
            }
        }

        return run >= 8;
    }

    function findCandidates(alongX: boolean): Array<RuleCandidate>
    {
        const lines = alongX ? height : width;
        const long = alongX ? width : height;
        const candidates = new Array<RuleCandidate>();

        for (let at = 0; at < lines; at++)
        {
            let count = 0;
            let from = -1;
            let to = -1;
            let run = 0;
            let longest = 0;
            let crossings = 0;
            let inDark = false;

            for (let along = 0; along < long; along++)
            {
                const x = alongX ? along : at;
                const y = alongX ? at : along;

                if (gray[y * width + x] === 1 && isThin(x, y, alongX))
                {
                    count++;
                    from = from < 0 ? along : from;
                    to = along;
                    run++;
                    longest = Math.max(longest, run);
                }
                else
                {
                    run = 0;
                }

                // The tree is drawn over the rules in darker ink, and crosses each of them.
                const crossed = dark[y * width + x] === 1 && isCrossedAt(x, y, alongX);

                crossings += crossed && !inDark && from >= 0 ? 1 : 0;
                inDark = crossed;
            }

            // Three tenths of the breadth: a rule that node bars lie along is thin gray only
            // between them (Lamanna 2014, the rule at 86.3 Ma, 35 percent).
            // And it is ruled: some stretch of it runs unbroken for a twenty-fifth of the
            // image. A column of dots, or of the ends of thin branches, has as much gray
            // and no such stretch (Rauhut 2016, where nodes drawn in the same thin line
            // stand in those columns).
            if (10 * count >= 3 * long && crossings >= 3 && longest >= Math.max(30, Math.round(long / 25)))
            {
                candidates.push({ at, from, to });
            }
        }

        return candidates;
    }

    let result: RgbaImage | null = null;
    let rules = 0;

    for (const alongX of [true, false])
    {
        const candidates = findCandidates(alongX);
        const long = alongX ? width : height;
        const slack = Math.max(3, Math.round(long / 100));
        let erased = -10;

        const inFamily = new Array<boolean>();

        for (const candidate of candidates)
        {
            // Rules begin and end together. Two rows of one rule count once.
            let family = 0;
            let last = -10;

            for (const other of candidates)
            {
                if (Math.abs(other.from - candidate.from) <= slack && Math.abs(other.to - candidate.to) <= slack)
                {
                    family += other.at - last > 2 ? 1 : 0;
                    last = other.at;
                }
            }

            inFamily.push(family >= 3);
        }

        for (let index = 0; index < candidates.length; index++)
        {
            const candidate = candidates[index];

            // A rule two pixels broad is two candidates, and goes whole: its other row may
            // begin elsewhere for a gray pixel of a heading that happens to lie in it
            // (Rotatori 2023, where the row left standing made one upright of the tree's
            // nodes on that rule).
            const beside = (index > 0 && inFamily[index - 1] && candidate.at - candidates[index - 1].at <= 2)
                || (index + 1 < candidates.length && inFamily[index + 1] && candidates[index + 1].at - candidate.at <= 2);

            if (!inFamily[index] && !beside)
            {
                continue;
            }

            result = result ?? { width, height, data: new Uint8ClampedArray(data) };
            rules += candidate.at - erased > 2 ? 1 : 0;
            erased = candidate.at;

            for (let along = candidate.from; along <= candidate.to; along++)
            {
                const x = alongX ? along : candidate.at;
                const y = alongX ? candidate.at : along;

                if (gray[y * width + x] === 1 && isThin(x, y, alongX))
                {
                    const offset = 4 * (y * width + x);

                    result.data[offset] = 255;
                    result.data[offset + 1] = 255;
                    result.data[offset + 2] = 255;
                    result.data[offset + 3] = 255;
                }
            }
        }
    }

    return { image: result ?? image, rules };
}

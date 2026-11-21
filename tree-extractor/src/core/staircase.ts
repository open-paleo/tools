/**
 * Staircases read as one node. In a time-calibrated tree the nodes of a backbone can stand a
 * few pixels apart, each vertical a hairline beside the last, and they close into one broad
 * vertical that holds every branch of the backbone as its child.
 */

import type { ExtractionDocument, Mask, QcIssue, Segment, Tip, TreeNode } from "./types.ts";
import { createId } from "./edit.ts";

/**
 * A child of a broad node, with where its branch begins.
 */
type Rung = {
    /**
     * Identifier of the child, a tip or a node.
     */
    id: string;

    /**
     * Height at which the child's branch leaves the node.
     */
    y: number;

    /**
     * Left end of that branch in the ink as drawn.
     */
    x: number;
};

/**
 * Orders rungs from the left.
 *
 * @param left - First rung.
 * @param right - Second rung.
 * @returns Negative when the first begins further left.
 */
function compareRungStarts(left: Rung, right: Rung): number
{
    return left.x - right.x || left.y - right.y;
}

/**
 * Orders rungs from the top.
 *
 * @param left - First rung.
 * @param right - Second rung.
 * @returns Negative when the first is higher.
 */
function compareRungHeights(left: Rung, right: Rung): number
{
    return left.y - right.y;
}

/**
 * Finds where the branch at a height begins, in the ink as drawn: the left end of the run of
 * ink that passes the right edge of the node's vertical. The verticals of earlier nodes stand
 * to its left, each past a gap.
 *
 * @param ink - Dark ink before any gap was closed.
 * @param node - The broad node.
 * @param y - Height of the branch.
 * @param reach - How far past the vertical's edges to look.
 * @param rise - How far above and below the height to look for the branch's row.
 * @returns The left end, or null when no branch crosses the edge there.
 */
function findBranchStart(ink: Mask, node: TreeNode, y: number, reach: number, rise: number): number | null
{
    const { width, height, data } = ink;
    const edge = Math.min(width - 1, Math.round(node.x + reach));

    for (let step = 0; step <= 2 * rise; step++)
    {
        // Nearest rows first: 0, -1, 1, -2, 2 and so on.
        const row = Math.round(y) + (step % 2 === 0 ? step / 2 : -(step + 1) / 2);

        if (row < 0 || row >= height || data[row * width + edge] !== 1)
        {
            continue;
        }

        let x = edge;

        while (x > 0 && data[row * width + x - 1] === 1)
        {
            x--;
        }

        return x;
    }

    return null;
}

/**
 * Finds the vertical segment a node was traced from.
 *
 * @param document - Extraction document.
 * @param node - The node.
 * @returns The segment, or null.
 */
function findVertical(document: ExtractionDocument, node: TreeNode): Segment | null
{
    for (const segment of document.verticals)
    {
        if (Math.abs((segment.box.x0 + segment.box.x1) / 2 - node.x) <= 1 && segment.box.y0 <= node.y0 + 1 && segment.box.y1 >= node.y1 - 1)
        {
            return segment;
        }
    }

    return null;
}

/**
 * Turns a node that holds the branches of a staircase back into the nodes it was drawn as.
 * A node's children begin at its vertical, so branches that begin at different places along
 * the breadth of one vertical belong to different nodes, and a vertical further right stands
 * later in the tree: the children are nested in the order their branches begin, those that
 * begin together staying sisters (Rauhut 2019, whose backbone of seven nodes four pixels
 * apart came out as one node of nine children).
 *
 * @param document - Extraction document, after tracing; changed in place.
 * @param ink - Dark ink before any gap was closed.
 * @param thickness - Line thickness in pixels.
 * @returns A note when nodes were added.
 */
export function resolveStaircases(document: ExtractionDocument, ink: Mask, thickness: number): Array<QcIssue>
{
    const nodes = new Map<string, TreeNode>();
    const tips = new Map<string, Tip>();
    const heights = new Map<string, number>();

    for (const node of document.nodes)
    {
        nodes.set(node.id, node);
        heights.set(node.id, node.attachY ?? (node.y0 + node.y1) / 2);
    }

    for (const tip of document.tips)
    {
        tips.set(tip.id, tip);
        heights.set(tip.id, tip.y);
    }

    let added = 0;

    for (const node of [...document.nodes])
    {
        const vertical = findVertical(document, node);
        const breadth = vertical === null ? 0 : vertical.box.x1 - vertical.box.x0;

        // Only a vertical broader than two lines side by side can hide a second node.
        if (vertical === null || node.children.length < 3 || breadth < 2 * thickness + 2)
        {
            continue;
        }

        const rungs = new Array<Rung>();
        let unplaced = 0;

        for (const child of node.children)
        {
            const y = heights.get(child) as number;
            let nearest = Infinity;

            for (const other of node.children)
            {
                if (other !== child)
                {
                    nearest = Math.min(nearest, Math.abs((heights.get(other) as number) - y));
                }
            }

            // A child node's height is where it was joined, which may be a little off its
            // stem; the row is looked for up to a couple of line widths away, short of the
            // next child's.
            const rise = Math.max(2, Math.min(2 * Math.round(thickness) + 2, Math.floor(nearest / 2) - 1));
            const x = findBranchStart(ink, node, y, breadth / 2 + 2, rise);
            const childNode = nodes.get(child);

            if (x !== null && x >= vertical.box.x0 - 2)
            {
                rungs.push({ id: child, y, x });
            }
            else if (childNode !== undefined && childNode.x > vertical.box.x1)
            {
                // A node past the vertical with no branch drawn to it was joined across a gap:
                // the next step of the staircase, hanging from the last vertical.
                rungs.push({ id: child, y, x: vertical.box.x1 + 1 });
                unplaced++;
            }
            else
            {
                unplaced = 2;
                break;
            }
        }

        if (unplaced > 1)
        {
            continue;
        }

        // Branches that begin within two pixels of one another leave the same vertical: a
        // second vertical needs a line and a gap of its own (Sues 2014's ragged edge).
        rungs.sort(compareRungStarts);
        const steps = new Array<Array<Rung>>();

        for (const rung of rungs)
        {
            const step = steps[steps.length - 1];

            if (step !== undefined && rung.x - step[step.length - 1].x <= 2)
            {
                step.push(rung);
            }
            else
            {
                steps.push([rung]);
            }
        }

        if (steps.length < 2)
        {
            continue;
        }

        let owner = node;

        for (let index = 0; index < steps.length; index++)
        {
            const step = steps[index];
            step.sort(compareRungHeights);
            const children = new Array<string>();

            for (const rung of step)
            {
                children.push(rung.id);
                const child = nodes.get(rung.id);
                const tip = tips.get(rung.id);

                if (child !== undefined)
                {
                    child.parent = owner.id;
                }

                if (tip !== undefined)
                {
                    tip.parent = owner.id;
                }
            }

            if (index === steps.length - 1)
            {
                owner.children = children;
                continue;
            }

            let top = Infinity;
            let bottom = -Infinity;

            for (let later = index + 1; later < steps.length; later++)
            {
                for (const rung of steps[later])
                {
                    top = Math.min(top, rung.y);
                    bottom = Math.max(bottom, rung.y);
                }
            }

            const next: TreeNode = {
                id: createId(document, "n"),
                x: steps[index + 1][0].x + thickness / 2,
                y0: top,
                y1: bottom,
                attachY: (top + bottom) / 2,
                parent: owner.id,
                children: [],
                textLine: null,
                label: null,
                source: "traced",
                age: null,
            };
            owner.children = [...children, next.id];
            document.nodes.push(next);
            nodes.set(next.id, next);
            owner = next;
            added++;
        }
    }

    if (added === 0)
    {
        return [];
    }

    return [{ severity: "info", code: "staircase-resolved", message: `${added} node(s) were added where one broad vertical held the branches of several nodes a few pixels apart`, subject: null }];
}

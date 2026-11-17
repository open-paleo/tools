/**
 * Tips hidden in an elbow. Where lines are thick and the last branches short, a pair of sister
 * tips is drawn as a vertical with a stub at each end hardly longer than the line is thick.
 * The stubs are too short to be segments, so the trace sees a branch that turns a corner and
 * ends at the far end of the vertical: one tip, where the figure has a node and two (Poropat
 * 2014, ten of 36 tips). The label left without a tip, standing beside the near end of that
 * vertical, gives the second tip away.
 */

import type { ExtractionDocument, QcIssue, Segment, TextLine, Tip, TreeNode } from "./types.ts";
import { createId, sortChildren } from "./edit.ts";

/**
 * Finds the vertical a label row stands beside the end of.
 *
 * @param document - Extraction document.
 * @param row - Unassigned text row.
 * @returns The vertical, or null.
 */
function findVerticalEndingAt(document: ExtractionDocument, row: TextLine): Segment | null
{
    const glyph = document.glyphHeight;
    const center = (row.box.y0 + row.box.y1) / 2;
    let best: Segment | null = null;

    for (const vertical of document.verticals)
    {
        const gap = row.box.x0 - vertical.box.x1;
        const atEnd = Math.abs(center - vertical.box.y0) <= 0.8 * glyph || Math.abs(center - vertical.box.y1) <= 0.8 * glyph;

        if (gap >= -2 && gap <= 2.5 * glyph && atEnd && (best === null || vertical.box.x1 > best.box.x1))
        {
            best = vertical;
        }
    }

    return best;
}

/**
 * Whether a horizontal runs from a vertical to a tip, on the tip's row.
 *
 * @param document - Extraction document.
 * @param vertical - The vertical.
 * @param tip - The tip.
 * @returns True when a branch joins the two.
 */
function hasBranchBetween(document: ExtractionDocument, vertical: Segment, tip: Tip): boolean
{
    const reach = Math.max(3, document.profile.lineThickness + 2);

    for (const horizontal of document.horizontals)
    {
        const { box } = horizontal;

        if (tip.y >= box.y0 - reach && tip.y <= box.y1 + reach && box.x0 <= vertical.box.x1 + reach && Math.abs(box.x1 - tip.x) <= reach)
        {
            return true;
        }
    }

    return false;
}

/**
 * Gives each label row that stands beside the near end of an elbow its own tip: the elbow's
 * vertical becomes a node holding the tip the trace found at its far end and a new one at the
 * near end, paired with the row.
 *
 * @param document - Extraction document, after labels were assigned; changed in place.
 * @returns A note for each tip recovered.
 */
export function recoverElbowTips(document: ExtractionDocument): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const glyph = document.glyphHeight;
    const reach = Math.max(glyph, document.profile.lineThickness + 2);

    for (const row of document.textLines)
    {
        if (row.role !== "unassigned" || row.glyphCount < 4 || row.frame !== undefined)
        {
            continue;
        }

        const vertical = findVerticalEndingAt(document, row);

        if (vertical === null)
        {
            continue;
        }

        const center = (row.box.y0 + row.box.y1) / 2;
        const x = (vertical.box.x0 + vertical.box.x1) / 2;
        const nearTop = Math.abs(center - vertical.box.y0) < Math.abs(center - vertical.box.y1);
        const farY = nearTop ? vertical.box.y1 : vertical.box.y0;
        let elbowTip: Tip | null = null;
        let branched = false;

        // The tip the trace left at the far end of the vertical, on the vertical itself.
        for (const tip of document.tips)
        {
            if (tip.parent !== null && Math.abs(tip.x - x) <= reach && Math.abs(tip.y - farY) <= reach && tip.y >= vertical.box.y0 - 1 && tip.y <= vertical.box.y1 + 1)
            {
                elbowTip = tip;
            }
        }

        // Or the tip at the end of a branch that leaves the far end: the vertical then turned
        // one corner more before the trace called it a tip.
        if (elbowTip === null)
        {
            for (const tip of document.tips)
            {
                if (tip.parent !== null && tip.x > vertical.box.x1 && Math.abs(tip.y - farY) <= reach && hasBranchBetween(document, vertical, tip))
                {
                    elbowTip = elbowTip === null || tip.x < elbowTip.x ? tip : elbowTip;
                    branched = true;
                }
            }
        }

        let parent: TreeNode | null = null;

        for (const node of document.nodes)
        {
            if (elbowTip !== null && node.id === elbowTip.parent)
            {
                parent = node;
            }
        }

        // No node may stand on the vertical already: then the row is something else.
        let occupied = false;

        for (const node of document.nodes)
        {
            // On the vertical itself, within a line's width: a node a stem's length to the
            // left is the parent of this one, not a node standing here.
            occupied = occupied || (Math.abs(node.x - x) <= document.profile.lineThickness + 2 && node.y0 <= vertical.box.y1 && node.y1 >= vertical.box.y0);
        }

        if (elbowTip === null || parent === null || occupied)
        {
            continue;
        }

        const nearY = nearTop ? vertical.box.y0 + (vertical.box.x1 - vertical.box.x0) / 2 : vertical.box.y1 - (vertical.box.x1 - vertical.box.x0) / 2;
        const tip: Tip = {
            id: createId(document, "t"),
            x: vertical.box.x1,
            y: nearY,
            parent: null,
            textLine: row.id,
            label: null,
            match: null,
            source: "traced",
            age: null,
        };
        const node: TreeNode = {
            id: createId(document, "n"),
            x,
            y0: vertical.box.y0,
            y1: vertical.box.y1,
            attachY: nearY,
            parent: parent.id,
            children: [elbowTip.id, tip.id],
            textLine: null,
            label: null,
            source: "traced",
            age: null,
        };
        tip.parent = node.id;
        parent.children[parent.children.indexOf(elbowTip.id)] = node.id;
        elbowTip.parent = node.id;

        if (!branched)
        {
            elbowTip.x = vertical.box.x1;
        }

        row.role = "tip";
        document.tips.push(tip);
        document.nodes.push(node);
        sortChildren(document, node);
        sortChildren(document, parent);
        issues.push({
            severity: "info",
            code: "elbow-tip-recovered",
            message: `tip ${tip.id} added for a label beside the end of a vertical the trace had as a corner of tip ${elbowTip.id}'s branch; node ${node.id} now holds the two`,
            subject: tip.id,
        });
    }

    issues.push(...regroupSisterTips(document));

    return issues;
}

/**
 * Puts two sister tips back under the small node they share. The node's vertical is short,
 * and the stub to one tip shorter than a branch may be, so the trace sees the vertical with a
 * single branch, drops it as no node, and hands that branch's tip up to the node behind. The
 * other tip's label, standing beside the foot of the vertical, is then paired with a branch
 * end back at that same node: two sisters and their aunt in one split, where the figure has
 * the sisters apart (Alarcon-Munoz 2023, Rhinorex and Gryposaurus latidens). A vertical with
 * one tip's branch leaving an end, the label of a second tip beside its other end, both tips
 * children of one node behind it, and that second tip standing back at the node, is their
 * own node.
 *
 * @param document - Extraction document, changed in place.
 * @returns A note for each pair regrouped.
 */
function regroupSisterTips(document: ExtractionDocument): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const glyph = document.glyphHeight;
    const reach = Math.max(glyph, document.profile.lineThickness + 2);

    for (const vertical of document.verticals)
    {
        const x = (vertical.box.x0 + vertical.box.x1) / 2;
        let standing = false;

        for (const node of document.nodes)
        {
            standing = standing || (Math.abs(node.x - x) <= reach / 2 && node.y0 <= vertical.box.y1 && node.y1 >= vertical.box.y0);
        }

        if (standing)
        {
            continue;
        }

        // The tip whose branch leaves one end of the vertical.
        let branchTip: Tip | null = null;

        for (const tip of document.tips)
        {
            const atEnd = Math.abs(tip.y - vertical.box.y0) <= reach / 2 || Math.abs(tip.y - vertical.box.y1) <= reach / 2;

            if (tip.parent !== null && tip.x > vertical.box.x1 && atEnd && hasBranchBetween(document, vertical, tip))
            {
                branchTip = tip;
            }
        }

        if (branchTip === null)
        {
            continue;
        }

        const farY = Math.abs(branchTip.y - vertical.box.y0) < Math.abs(branchTip.y - vertical.box.y1) ? vertical.box.y1 : vertical.box.y0;
        let sister: Tip | null = null;

        // The tip whose label stands beside the other end, while it stands back at the node.
        for (const tip of document.tips)
        {
            if (tip === branchTip || tip.parent !== branchTip.parent || tip.x >= vertical.box.x0)
            {
                continue;
            }

            for (const line of document.textLines)
            {
                const center = (line.box.y0 + line.box.y1) / 2;
                const gap = line.box.x0 - vertical.box.x1;

                if (line.id === tip.textLine && line.frame === undefined && gap >= -2 && gap <= 2.5 * glyph && Math.abs(center - farY) <= 0.8 * glyph)
                {
                    sister = tip;
                }
            }
        }

        let parent: TreeNode | null = null;

        for (const node of document.nodes)
        {
            if (node.id === branchTip.parent)
            {
                parent = node;
            }
        }

        if (sister === null || parent === null)
        {
            continue;
        }

        const node: TreeNode = {
            id: createId(document, "n"),
            x,
            y0: vertical.box.y0,
            y1: vertical.box.y1,
            attachY: (vertical.box.y0 + vertical.box.y1) / 2,
            parent: parent.id,
            children: [branchTip.id, sister.id],
            textLine: null,
            label: null,
            source: "traced",
            age: null,
        };
        parent.children[parent.children.indexOf(branchTip.id)] = node.id;
        parent.children.splice(parent.children.indexOf(sister.id), 1);
        branchTip.parent = node.id;
        sister.parent = node.id;
        sister.x = vertical.box.x1;
        sister.y = farY;
        document.nodes.push(node);
        sortChildren(document, node);
        sortChildren(document, parent);
        issues.push({
            severity: "info",
            code: "sister-tips-regrouped",
            message: `tips ${branchTip.id} and ${sister.id} were put under a node of their own, ${node.id}, on a short vertical the trace had passed over`,
            subject: node.id,
        });
    }

    return issues;
}

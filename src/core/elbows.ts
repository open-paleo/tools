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

        // The tip the trace left at the far end of the vertical, on the vertical itself.
        for (const tip of document.tips)
        {
            if (tip.parent !== null && Math.abs(tip.x - x) <= reach && Math.abs(tip.y - farY) <= reach && tip.y >= vertical.box.y0 - 1 && tip.y <= vertical.box.y1 + 1)
            {
                elbowTip = tip;
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
            occupied = occupied || (Math.abs(node.x - x) <= reach && node.y0 <= vertical.box.y1 && node.y1 >= vertical.box.y0);
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
        elbowTip.x = vertical.box.x1;
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

    return issues;
}

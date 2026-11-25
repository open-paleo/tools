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

        // The row may begin on the vertical itself: a stub shorter than a letter is wide
        // goes with the letters, and the corner with it (Rotatori 2023, Isaberrysaura).
        const breadth = vertical.box.x1 - vertical.box.x0;

        if (gap >= -(breadth + 2) && gap <= 2.5 * glyph && atEnd && (best === null || vertical.box.x1 > best.box.x1))
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

        if (tip.y >= box.y0 - reach && tip.y <= box.y1 + reach && box.x0 <= vertical.box.x1 + reach && Math.abs(box.x1 - tip.x) <= Math.max(reach, document.glyphHeight))
        {
            return true;
        }
    }

    return false;
}

/**
 * Whether a horizontal runs from a vertical to a point to its right.
 *
 * @param document - Extraction document.
 * @param vertical - The vertical.
 * @param x - The point's x.
 * @param y - The point's height.
 * @returns True when a branch joins the two.
 */
function hasBranchTo(document: ExtractionDocument, vertical: Segment, x: number, y: number): boolean
{
    const reach = Math.max(3, document.profile.lineThickness + 2);

    for (const horizontal of document.horizontals)
    {
        const { box } = horizontal;

        if (y >= box.y0 - reach && y <= box.y1 + reach && Math.abs(box.x0 - vertical.box.x1) <= reach && Math.abs(box.x1 - x) <= Math.max(reach, document.glyphHeight))
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
        // A row a node took for its label is looked at too when it is long enough to be a
        // name: beside a vertical that carries no node, the nearest node claimed it (Otero
        // 2015: Vulcanodon, on a stub six pixels long, read as the label of the node beside it).
        const claimed = row.role === "node" && row.glyphCount >= 6;

        if ((row.role !== "unassigned" && !claimed) || row.glyphCount < 4 || row.frame !== undefined)
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

        // Or a node: the branch that leaves the far end leads on to a clade (Rotatori 2023,
        // Scelidosaurus beside the stem of the armored dinosaurs).
        let elbowNode: TreeNode | null = null;

        if (elbowTip === null)
        {
            for (const node of document.nodes)
            {
                const height = node.attachY ?? (node.y0 + node.y1) / 2;

                if (node.parent !== null && node.x > vertical.box.x1 + glyph && Math.abs(height - farY) <= reach && hasBranchTo(document, vertical, node.x, height))
                {
                    elbowNode = elbowNode === null || node.x < elbowNode.x ? node : elbowNode;
                }
            }
        }

        const far = elbowTip ?? elbowNode;
        let parent: TreeNode | null = null;

        for (const node of document.nodes)
        {
            if (far !== null && node.id === far.parent)
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

        if (far === null || parent === null || occupied)
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
            children: [far.id, tip.id],
            textLine: null,
            label: null,
            source: "traced",
            age: null,
        };
        tip.parent = node.id;
        parent.children[parent.children.indexOf(far.id)] = node.id;
        far.parent = node.id;

        if (!branched && elbowTip !== null)
        {
            elbowTip.x = vertical.box.x1;
        }

        for (const other of document.nodes)
        {
            if (other.textLine === row.id)
            {
                other.textLine = null;
                other.label = null;
            }
        }

        row.role = "tip";
        document.tips.push(tip);
        document.nodes.push(node);
        sortChildren(document, node);
        sortChildren(document, parent);
        issues.push({
            severity: "info",
            code: "elbow-tip-recovered",
            message: `tip ${tip.id} added for a label beside the end of a vertical the trace had as a corner of ${far.id}'s branch; node ${node.id} now holds the two`,
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

/**
 * Finds the node at the top of the piece a node or tip is in.
 *
 * @param document - Extraction document.
 * @param parent - Parent id of the node or tip.
 * @returns The piece's root, or null for one with no parent.
 */
function findPieceRoot(document: ExtractionDocument, parent: string | null): TreeNode | null
{
    let root: TreeNode | null = null;
    let id = parent;

    while (id !== null)
    {
        let found: TreeNode | null = null;

        for (const node of document.nodes)
        {
            if (node.id === id)
            {
                found = node;
            }
        }

        if (found === null)
        {
            break;
        }

        root = found;
        id = found.parent;
    }

    return root;
}

/**
 * Joins a tree drawn in two halves by a branch that wraps around the page: a branch of the
 * upper half runs to the margin, turns down, and comes back across the whole figure to the
 * root of the lower half (You 2009). The trace has it as two ends with no name, one in each
 * half, with a vertical between them; the lower half's root takes the place of the upper end.
 *
 * @param document - Extraction document, changed in place.
 * @returns Notes on the joins made.
 */
export function joinWrappedBranches(document: ExtractionDocument): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const glyph = document.glyphHeight;

    for (const root of document.nodes)
    {
        if (root.parent !== null)
        {
            continue;
        }

        // The returning line: an end with no name that leaves an end of the root's vertical
        // and runs most of the figure's width.
        let returning: Tip | null = null;

        for (const tip of document.tips)
        {
            const atEnd = Math.abs(tip.y - root.y0) <= glyph || Math.abs(tip.y - root.y1) <= glyph;

            if (tip.parent === root.id && tip.textLine === null && atEnd && tip.x - root.x >= 0.5 * document.image.width)
            {
                returning = tip;
            }
        }

        if (returning === null)
        {
            continue;
        }

        // The leaving branch: an end with no name in another piece, a little short of a
        // vertical that reaches from its height to the returning line's end.
        let leaving: Tip | null = null;

        for (const tip of document.tips)
        {
            if (tip.textLine !== null || tip.parent === null || findPieceRoot(document, tip.parent) === root)
            {
                continue;
            }

            for (const vertical of document.verticals)
            {
                const top = Math.min(tip.y, returning.y);
                const bottom = Math.max(tip.y, returning.y);
                const spans = vertical.box.y0 <= top + glyph && vertical.box.y1 >= bottom - glyph && vertical.box.y1 - vertical.box.y0 <= bottom - top + 2 * glyph;
                const atLine = Math.abs((vertical.box.x0 + vertical.box.x1) / 2 - returning.x) <= glyph;
                const short = vertical.box.x0 - tip.x;

                if (spans && atLine && short >= -glyph && short <= 3 * glyph)
                {
                    leaving = tip;
                }
            }
        }

        if (leaving === null)
        {
            continue;
        }

        let parent: TreeNode | null = null;

        for (const node of document.nodes)
        {
            if (node.id === leaving.parent)
            {
                parent = node;
            }
        }

        if (parent === null)
        {
            continue;
        }

        const upper = findPieceRoot(document, leaving.parent);
        const leavingId = leaving.id;
        const returningId = returning.id;

        function isKept(tip: Tip): boolean
        {
            return tip.id !== leavingId && tip.id !== returningId;
        }

        parent.children[parent.children.indexOf(leavingId)] = root.id;
        root.children.splice(root.children.indexOf(returningId), 1);
        root.parent = parent.id;
        root.attachY = returning.y;
        root.length = leaving.length;
        document.tips = document.tips.filter(isKept);
        sortChildren(document, parent);

        if (document.root === root.id && upper !== null)
        {
            document.root = upper.id;
        }

        issues.push({
            severity: "info",
            code: "wrapped-branch-joined",
            message: `node ${root.id} joined under ${parent.id} by a branch that leaves at y ${Math.round(leaving.y)}, turns at x ${Math.round(returning.x)} and returns at y ${Math.round(returning.y)}`,
            subject: root.id,
        });
    }

    return issues;
}

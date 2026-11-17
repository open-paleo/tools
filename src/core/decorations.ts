/**
 * Decorations: pieces the trace built out of things that are not the tree. Clade brackets to
 * the right of the labels, a time axis above the tree, a legend below it: each is a vertical
 * with a few horizontals, so each traces into a small disconnected subtree. They are recognized
 * by where they lie, never by what they look like, so a real subtree that lost its connection
 * to the tree is left alone: it sits inside the tree's extent, with its tips at the tip line.
 */

import type { Box, ExtractionDocument, QcIssue, Segment, Tip, TreeNode } from "./types.ts";
import { collectConnected } from "./tree.ts";

/**
 * A disconnected subtree with its extent.
 */
type Piece = {
    /**
     * Its root node.
     */
    root: TreeNode;

    /**
     * Node identifiers in it.
     */
    nodes: Array<string>;

    /**
     * Tips in it.
     */
    tips: Array<Tip>;

    /**
     * Extent of its nodes and tips.
     */
    box: Box;
};

/**
 * Collects the subtree under a node.
 *
 * @param document - Document.
 * @param root - Root of the piece.
 * @returns The piece.
 */
function collectPiece(document: ExtractionDocument, root: TreeNode): Piece
{
    const nodeById = new Map<string, TreeNode>();
    const tipById = new Map<string, Tip>();

    for (const node of document.nodes)
    {
        nodeById.set(node.id, node);
    }

    for (const tip of document.tips)
    {
        tipById.set(tip.id, tip);
    }

    const piece: Piece = { root, nodes: [], tips: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } };

    function visit(id: string): void
    {
        const node = nodeById.get(id);

        if (node !== undefined)
        {
            piece.nodes.push(node.id);
            piece.box.x0 = Math.min(piece.box.x0, node.x);
            piece.box.x1 = Math.max(piece.box.x1, node.x);
            piece.box.y0 = Math.min(piece.box.y0, node.y0);
            piece.box.y1 = Math.max(piece.box.y1, node.y1);

            for (const child of node.children)
            {
                visit(child);
            }

            return;
        }

        const tip = tipById.get(id);

        if (tip !== undefined)
        {
            piece.tips.push(tip);
            piece.box.x0 = Math.min(piece.box.x0, tip.x);
            piece.box.x1 = Math.max(piece.box.x1, tip.x);
            piece.box.y0 = Math.min(piece.box.y0, tip.y);
            piece.box.y1 = Math.max(piece.box.y1, tip.y);
        }
    }

    visit(root.id);

    return piece;
}

/**
 * Extent of the main tree: its nodes and tips.
 *
 * @param document - Document.
 * @param connected - Identifiers in the main tree.
 * @returns The box, or null when there is no tree.
 */
function measureMainExtent(document: ExtractionDocument, connected: Set<string>): Box | null
{
    const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

    for (const node of document.nodes)
    {
        if (connected.has(node.id))
        {
            box.x0 = Math.min(box.x0, node.x);
            box.x1 = Math.max(box.x1, node.x);
            box.y0 = Math.min(box.y0, node.y0);
            box.y1 = Math.max(box.y1, node.y1);
        }
    }

    for (const tip of document.tips)
    {
        if (connected.has(tip.id))
        {
            box.x0 = Math.min(box.x0, tip.x);
            box.x1 = Math.max(box.x1, tip.x);
            box.y0 = Math.min(box.y0, tip.y);
            box.y1 = Math.max(box.y1, tip.y);
        }
    }

    return Number.isFinite(box.x0) ? box : null;
}

/**
 * Why a piece counts as decoration, or null when it does not.
 *
 * @param piece - Disconnected subtree.
 * @param main - Extent of the main tree.
 * @param glyphHeight - Glyph height in pixels.
 * @returns A short reason, or null.
 */
function explainDecoration(piece: Piece, main: Box, glyphHeight: number): string | null
{
    if (piece.box.x0 > main.x1 + glyphHeight)
    {
        return "lies entirely to the right of the tips";
    }

    let labelled = false;

    for (const tip of piece.tips)
    {
        if (tip.textLine !== null)
        {
            labelled = true;
            break;
        }
    }

    if (!labelled && (piece.box.y1 < main.y0 - glyphHeight || piece.box.y0 > main.y1 + glyphHeight))
    {
        return piece.box.y1 < main.y0 ? "lies above the tree with no labels" : "lies below the tree with no labels";
    }

    return null;
}

/**
 * Fewest labelled tips for a piece right of the tips to be taken for a second column.
 */
const fewestColumnTips = 5;

/**
 * Counts the labelled tips under a node.
 *
 * @param nodeById - Nodes by identifier.
 * @param tipById - Tips by identifier.
 * @param id - Node or tip identifier.
 * @returns How many tips under it have a label row.
 */
function countLabelledTips(nodeById: Map<string, TreeNode>, tipById: Map<string, Tip>, id: string): number
{
    const node = nodeById.get(id);

    if (node === undefined)
    {
        const tip = tipById.get(id);

        return tip !== undefined && tip.textLine !== null ? 1 : 0;
    }

    let count = 0;

    for (const child of node.children)
    {
        count += countLabelledTips(nodeById, tipById, child);
    }

    return count;
}

/**
 * Finds the root of the piece a node belongs to.
 *
 * @param nodeById - Nodes by identifier.
 * @param id - Node identifier.
 * @returns Identifier of the topmost ancestor.
 */
function findPieceRoot(nodeById: Map<string, TreeNode>, id: string): string
{
    let current = id;

    for (let step = 0; step < nodeById.size; step++)
    {
        const node = nodeById.get(current);

        if (node === undefined || node.parent === null)
        {
            break;
        }

        current = node.parent;
    }

    return current;
}

/**
 * Joins the tree's second column to its first. A tree too tall for the page is drawn in two
 * columns: one tip of the first names the clade that continues, and a connector line runs
 * from beside that name to the right, up or down, and right again into the root of the
 * second column (Fonseca 2024, 170 tips). The second column, lying right of the tips, would
 * otherwise go as a decoration. The connector is followed through its three segments; the
 * node it ends on, with enough labelled tips under it and no place in the tree yet, takes the
 * tip's place, and the tip's label becomes that node's.
 *
 * @param document - Extraction document, changed when a column is joined.
 * @returns A note for each column joined.
 */
function joinColumns(document: ExtractionDocument): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const glyph = document.glyphHeight;
    const nodeById = new Map<string, TreeNode>();
    const tipById = new Map<string, Tip>();

    for (const node of document.nodes)
    {
        nodeById.set(node.id, node);
    }

    for (const tip of document.tips)
    {
        tipById.set(tip.id, tip);
    }

    for (const tip of [...document.tips])
    {
        if (tip.parent === null)
        {
            continue;
        }

        const tipRoot = findPieceRoot(nodeById, tip.parent);

        // The run from beside the tip's label to the right, the longest on its row. It starts
        // where the label ends: the edge of a shaded box behind the labels runs to the right
        // as well, but from under them, and a branch of the second column on the same row
        // starts far off.
        let labelEnd: number | null = null;

        for (const line of document.textLines)
        {
            if (line.id === tip.textLine)
            {
                labelEnd = line.box.x1;
            }
        }

        if (labelEnd === null)
        {
            continue;
        }

        let run: Segment | null = null;

        for (const segment of document.horizontals)
        {
            const { box } = segment;

            if (box.x0 >= labelEnd - glyph / 2 && box.x0 <= labelEnd + 4 * glyph && tip.y >= box.y0 - glyph / 2 && tip.y <= box.y1 + glyph / 2 && box.x1 - box.x0 >= 6 * glyph && (run === null || box.x1 > run.box.x1))
            {
                run = segment;
            }
        }

        if (run === null)
        {
            continue;
        }

        // The vertical the run ends on, and the end of it away from the run.
        let turnX = 0;
        let turnY: number | null = null;

        for (const segment of document.verticals)
        {
            const { box } = segment;

            if (Math.abs((box.x0 + box.x1) / 2 - run.box.x1) <= glyph && tip.y >= box.y0 - glyph && tip.y <= box.y1 + glyph && box.y1 - box.y0 >= 3 * glyph)
            {
                turnX = (box.x0 + box.x1) / 2;
                turnY = Math.abs(box.y0 - tip.y) > Math.abs(box.y1 - tip.y) ? box.y0 : box.y1;
            }
        }

        if (turnY === null)
        {
            continue;
        }

        // A connector's vertical carries nothing else: the right edge of a shaded box is met
        // by the top and bottom edges of every box in the column.
        let others = 0;

        for (const segment of document.horizontals)
        {
            const { box } = segment;
            const y = (box.y0 + box.y1) / 2;

            if (segment !== run && Math.abs(box.x1 - turnX) <= glyph && box.x1 - box.x0 >= 3 * glyph && y >= Math.min(tip.y, turnY) - glyph && y <= Math.max(tip.y, turnY) + glyph)
            {
                others++;
            }
        }

        if (others > 0)
        {
            continue;
        }

        // The node that end leads into: just right of it, with the end inside its span.
        let target: TreeNode | null = null;

        for (const node of document.nodes)
        {
            const gap = node.x - turnX;

            if (findPieceRoot(nodeById, node.id) !== tipRoot && gap > 0 && gap <= 8 * glyph && turnY >= node.y0 - glyph && turnY <= node.y1 + glyph && (target === null || node.x < target.x))
            {
                target = node;
            }
        }

        if (target === null || countLabelledTips(nodeById, tipById, target.id) < fewestColumnTips)
        {
            continue;
        }

        const formerParent = target.parent === null ? undefined : nodeById.get(target.parent);

        if (formerParent !== undefined)
        {
            formerParent.children.splice(formerParent.children.indexOf(target.id), 1);
        }

        const parent = nodeById.get(tip.parent);

        if (parent === undefined)
        {
            continue;
        }

        // Whichever column the trace took for the main tree, the joined tree starts where the
        // first column does.
        if (document.root === findPieceRoot(nodeById, target.id))
        {
            document.root = tipRoot;
        }

        parent.children[parent.children.indexOf(tip.id)] = target.id;
        target.parent = parent.id;
        target.attachY = turnY;

        if (target.textLine === null && tip.textLine !== null)
        {
            target.textLine = tip.textLine;

            for (const line of document.textLines)
            {
                if (line.id === tip.textLine)
                {
                    line.role = "node";
                }
            }
        }

        document.tips.splice(document.tips.indexOf(tip), 1);
        issues.push({
            severity: "info",
            code: "column-joined",
            message: `node ${target.id} right of the tips continues the tree from tip ${tip.id} by a connector line, and was joined in its place`,
            subject: target.id,
        });
    }

    return issues;
}

/**
 * Drops the tips that are joined to nothing and labelled by nothing: the end of a stroke in a
 * silhouette, a pie chart or a legend swatch. Such a tip carries no name and no place in the
 * tree; in the viewer it is one more mark to delete. A loose tip with a label stays, since
 * the label says a taxon is there and only its branch is missing.
 *
 * @param document - Extraction document, changed in place.
 * @returns A note saying how many were dropped, or nothing.
 */
export function dropLooseTips(document: ExtractionDocument): Array<QcIssue>
{
    const kept = new Array<Tip>();

    for (const tip of document.tips)
    {
        if (tip.parent !== null || tip.textLine !== null)
        {
            kept.push(tip);
        }
    }

    const dropped = document.tips.length - kept.length;

    if (dropped === 0)
    {
        return [];
    }

    document.tips = kept;

    return [{ severity: "info", code: "loose-tips-dropped", message: `${dropped} branch end(s) joined to nothing and with no label were dropped as stray marks`, subject: null }];
}

/**
 * Removes disconnected subtrees that lie where decorations go: entirely right of the tips, or
 * above or below the tree with no labels. Their text rows become unassigned again.
 *
 * @param document - Document updated in place.
 * @returns One informational issue per piece removed.
 */
export function pruneDecorations(document: ExtractionDocument): Array<QcIssue>
{
    const issues = joinColumns(document);
    const connected = collectConnected(document);
    const main = measureMainExtent(document, connected);

    if (main === null)
    {
        return issues;
    }

    const removedNodes = new Set<string>();
    const removedTips = new Set<string>();

    for (const node of document.nodes)
    {
        if (node.parent !== null || connected.has(node.id))
        {
            continue;
        }

        const piece = collectPiece(document, node);
        const reason = explainDecoration(piece, main, document.glyphHeight);

        if (reason === null)
        {
            continue;
        }

        for (const id of piece.nodes)
        {
            removedNodes.add(id);
        }

        for (const tip of piece.tips)
        {
            removedTips.add(tip.id);
        }

        issues.push({
            severity: "info",
            code: "decoration-dropped",
            message: `piece ${node.id} with ${piece.tips.length} tip(s) at x ${Math.round(piece.box.x0)}-${Math.round(piece.box.x1)}, y ${Math.round(piece.box.y0)}-${Math.round(piece.box.y1)} dropped: ${reason}`,
            subject: null,
        });
    }

    if (removedNodes.size === 0)
    {
        return issues;
    }

    const freedLines = new Set<string>();
    const nodes = new Array<TreeNode>();
    const tips = new Array<Tip>();

    for (const node of document.nodes)
    {
        if (removedNodes.has(node.id))
        {
            if (node.textLine !== null)
            {
                freedLines.add(node.textLine);
            }
        }
        else
        {
            nodes.push(node);
        }
    }

    for (const tip of document.tips)
    {
        if (removedTips.has(tip.id))
        {
            if (tip.textLine !== null)
            {
                freedLines.add(tip.textLine);
            }
        }
        else
        {
            tips.push(tip);
        }
    }

    for (const line of document.textLines)
    {
        if (freedLines.has(line.id))
        {
            line.role = "unassigned";
        }
    }

    document.nodes = nodes;
    document.tips = tips;

    return issues;
}

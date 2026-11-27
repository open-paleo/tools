/**
 * Newick reading and writing.
 */

import type { ExtractionDocument, Tip, TreeNode } from "./types.ts";
import { findTreeRoots } from "./tree.ts";

/**
 * A node of a parsed Newick tree.
 */
export type ParsedNode = {
    /**
     * Label, unquoted, or null.
     */
    label: string | null;

    /**
     * Child nodes; empty for a leaf.
     */
    children: Array<ParsedNode>;

    /**
     * Branch length, or null when absent.
     */
    length: number | null;
};

/**
 * Formats a label for Newick: underscores for spaces when that is enough, otherwise quotes.
 *
 * @param label - Label text.
 * @returns Newick-safe label.
 */
export function formatLabel(label: string): string
{
    const underscored = label.trim().replace(/\s+/g, "_");

    if (/^[A-Za-z0-9_.-]+$/.test(underscored))
    {
        return underscored;
    }

    return `'${label.trim().replace(/'/g, "''")}'`;
}

/**
 * Returns the name to print for a tip: the accepted match, else the OCR label, else the id.
 *
 * @param document - Source document.
 * @param tipId - Tip identifier.
 * @returns Display name.
 */
export function getTipDisplayName(document: ExtractionDocument, tipId: string): string
{
    let base: string | null = null;

    for (const tip of document.tips)
    {
        if (tip.id === tipId)
        {
            base = describeTip(tip);
        }
    }

    if (base === null)
    {
        return tipId;
    }

    // A name printed at several tips of the tree (a species sampled several times) is
    // numbered in figure order, so that each tip keeps a name of its own in the Newick.
    // Of its own tree: a second tree on the image that the reading left as a piece apart
    // repeats the names of the first, and is not written with it (Regalado Fernandez 2022,
    // where 26 tips of the tree read were numbered for their twins in the next).
    const parents = new Map<string, string | null>();

    for (const node of document.nodes)
    {
        parents.set(node.id, node.parent);
    }

    function findRoot(parent: string | null): string | null
    {
        let root = parent;
        let next = root === null ? null : parents.get(root) ?? null;

        for (let step = 0; next !== null && step < document.nodes.length; step++)
        {
            root = next;
            next = parents.get(root) ?? null;
        }

        return root;
    }

    let ownRoot: string | null = null;

    for (const tip of document.tips)
    {
        ownRoot = tip.id === tipId ? findRoot(tip.parent) : ownRoot;
    }

    let count = 0;
    let ordinal = 0;

    for (const tip of document.tips)
    {
        if (tip.parent !== null && describeTip(tip) === base && findRoot(tip.parent) === ownRoot)
        {
            count++;

            if (tip.id === tipId)
            {
                ordinal = count;
            }
        }
    }

    return count > 1 && ordinal > 0 ? `${base} ${ordinal}` : base;
}

/**
 * A tip's name as read: the accepted match, else the label, else the identifier.
 *
 * @param tip - The tip.
 * @returns The name.
 */
function describeTip(tip: Tip): string
{
    if (tip.match !== null && tip.match.accepted)
    {
        return tip.match.name;
    }

    return tip.label ?? tip.id;
}

/**
 * The label a node carries in the tree: its clade's name when the figure gives one, and
 * otherwise what was read at the node, typically a support value.
 *
 * @param node - Node.
 * @returns The label, or null.
 */
export function getNodeDisplayLabel(node: TreeNode): string | null
{
    return node.name ?? node.label;
}

/**
 * Choices for Newick output.
 */
export type NewickOptions = {
    /**
     * Whether to write branch lengths, where the document has ages from a time axis or
     * lengths in pixels from a phylogram without one.
     */
    branchLengths: boolean;
};

/**
 * Formats a branch length: the difference in age between a parent and its child, never
 * negative, with up to three decimals.
 *
 * @param parentAge - Age of the parent, or null.
 * @param childAge - Age of the child, or null.
 * @param pixels - Length in pixels, used when either age is unknown.
 * @returns The ":length" suffix, or an empty string when nothing is known.
 */
function formatLength(parentAge: number | null, childAge: number | null, pixels: number | undefined): string
{
    if (parentAge === null || childAge === null)
    {
        return pixels === undefined ? "" : `:${String(pixels)}`;
    }

    const length = Math.max(0, parentAge - childAge);

    return `:${String(Math.round(length * 1000) / 1000)}`;
}

/**
 * Serializes the document's main tree as Newick. Branch lengths are written when the document
 * carries ages from a time axis, in the axis's units.
 *
 * @param document - Source document.
 * @param options - Output choices; by default lengths are written when there are ages.
 * @param root - Root of the tree to write; the main tree's by default.
 * @returns Newick string with trailing semicolon, or null when there is no tree.
 */
export function formatDocumentAsNewick(document: ExtractionDocument, options: NewickOptions = { branchLengths: true }, root: string | null = document.root): string | null
{
    if (root === null)
    {
        return null;
    }

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

    function render(id: string, parentAge: number | null): string
    {
        const node = nodeById.get(id);

        if (node === undefined)
        {
            const tip = tipById.get(id);
            const length = options.branchLengths && tip !== undefined ? formatLength(parentAge, tip.age, tip.length) : "";

            return `${formatLabel(getTipDisplayName(document, id))}${length}`;
        }

        const parts = new Array<string>();

        for (const child of node.children)
        {
            parts.push(render(child, node.age));
        }

        const length = options.branchLengths && node.parent !== null ? formatLength(parentAge, node.age, node.length) : "";

        const label = getNodeDisplayLabel(node);

        return `(${parts.join(",")})${label === null ? "" : formatLabel(label)}${length}`;
    }

    return `${render(root, null)};`;
}

/**
 * Serializes every tree of the document as Newick: the main tree, and each other piece of
 * some size.
 *
 * @param document - Source document.
 * @param options - Output choices.
 * @returns One Newick string to a tree, the main tree's first; empty when there is no tree.
 */
export function formatDocumentTreesAsNewick(document: ExtractionDocument, options: NewickOptions = { branchLengths: true }): Array<string>
{
    const trees = new Array<string>();

    for (const root of findTreeRoots(document))
    {
        const newick = formatDocumentAsNewick(document, options, root);

        if (newick !== null)
        {
            trees.push(newick);
        }
    }

    return trees;
}

/**
 * Lists the names of the tips in the trees that are written, each once, in the order of the
 * tips.
 *
 * @param document - Source document.
 * @returns The names.
 */
export function collectTreeTaxa(document: ExtractionDocument): Array<string>
{
    const parents = new Map<string, string | null>();

    for (const node of document.nodes)
    {
        parents.set(node.id, node.parent);
    }

    const roots = new Set<string>(findTreeRoots(document));
    const seen = new Set<string>();
    const taxa = new Array<string>();

    for (const tip of document.tips)
    {
        let root = tip.parent;
        let next = root === null ? null : parents.get(root) ?? null;

        for (let step = 0; next !== null && step < document.nodes.length; step++)
        {
            root = next;
            next = parents.get(root) ?? null;
        }

        const name = getTipDisplayName(document, tip.id);

        if (root !== null && roots.has(root) && !seen.has(name))
        {
            seen.add(name);
            taxa.push(name);
        }
    }

    return taxa;
}

/**
 * Recursive-descent reader for Newick text. Comments in square brackets are skipped.
 */
export class NewickParser
{
    private readonly text: string;

    private position = 0;

    /**
     * Creates a parser over one Newick string.
     *
     * @param text - Newick text, with or without the trailing semicolon.
     */
    public constructor(text: string)
    {
        this.text = text;
    }

    /**
     * Parses the whole string.
     *
     * @returns The root node.
     */
    public parse(): ParsedNode
    {
        const root = this.readNode();
        this.skipTrivia();

        if (this.text[this.position] === ";")
        {
            this.position++;
        }

        this.skipTrivia();

        if (this.position < this.text.length)
        {
            throw new Error(`unexpected text at offset ${this.position}`);
        }

        return root;
    }

    /**
     * Advances past whitespace and bracketed comments.
     */
    private skipTrivia(): void
    {
        for (;;)
        {
            while (this.position < this.text.length && /\s/.test(this.text[this.position]))
            {
                this.position++;
            }

            if (this.text[this.position] !== "[")
            {
                return;
            }

            const close = this.text.indexOf("]", this.position);
            this.position = close < 0 ? this.text.length : close + 1;
        }
    }

    /**
     * Reads a quoted or bare label at the current position.
     *
     * @returns The label, or null when there is none.
     */
    private readLabel(): string | null
    {
        this.skipTrivia();

        if (this.text[this.position] === "'")
        {
            return this.readQuotedLabel();
        }

        const start = this.position;

        while (this.position < this.text.length && !"(),:;[".includes(this.text[this.position]) && !/\s/.test(this.text[this.position]))
        {
            this.position++;
        }

        const raw = this.text.slice(start, this.position);

        return raw.length === 0 ? null : raw.replace(/_/g, " ");
    }

    /**
     * Reads a single-quoted label, where a doubled quote stands for one quote.
     *
     * @returns The label text.
     */
    private readQuotedLabel(): string
    {
        let value = "";
        this.position++;

        while (this.position < this.text.length)
        {
            if (this.text[this.position] === "'" && this.text[this.position + 1] === "'")
            {
                value += "'";
                this.position += 2;
            }
            else if (this.text[this.position] === "'")
            {
                this.position++;
                break;
            }
            else
            {
                value += this.text[this.position];
                this.position++;
            }
        }

        return value;
    }

    /**
     * Reads an optional branch length after a colon.
     *
     * @returns The length, or null when absent.
     */
    private readLength(): number | null
    {
        this.skipTrivia();

        if (this.text[this.position] !== ":")
        {
            return null;
        }

        this.position++;
        this.skipTrivia();
        const start = this.position;

        while (this.position < this.text.length && /[0-9.eE+-]/.test(this.text[this.position]))
        {
            this.position++;
        }

        return Number.parseFloat(this.text.slice(start, this.position));
    }

    /**
     * Reads a subtree: an optional parenthesised child list, then a label and length.
     *
     * @returns The node.
     */
    private readNode(): ParsedNode
    {
        this.skipTrivia();
        const children = new Array<ParsedNode>();

        if (this.text[this.position] === "(")
        {
            this.position++;

            for (;;)
            {
                children.push(this.readNode());
                this.skipTrivia();

                if (this.text[this.position] !== ",")
                {
                    break;
                }

                this.position++;
            }

            this.skipTrivia();

            if (this.text[this.position] !== ")")
            {
                throw new Error(`expected ')' at offset ${this.position}`);
            }

            this.position++;
        }

        const label = this.readLabel();
        const length = this.readLength();

        return { label, children, length };
    }
}

/**
 * Parses a Newick string.
 *
 * @param text - Newick text, with or without the trailing semicolon.
 * @returns The root node.
 */
export function parseNewick(text: string): ParsedNode
{
    return new NewickParser(text).parse();
}

/**
 * Pulls the first tree out of a Nexus TREES block.
 *
 * @param text - Nexus file contents.
 * @returns The tree's Newick string, or null if none is found.
 */
export function extractFirstTreeFromNexus(text: string): string | null
{
    const withoutComments = text.replace(/\[[^\]]*\]/g, "");
    const match = /\btree\s+[^=]+=\s*([^;]+;)/i.exec(withoutComments);

    return match === null ? null : match[1].trim();
}

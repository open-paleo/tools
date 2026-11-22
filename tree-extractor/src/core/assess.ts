/**
 * Says when a reading is not to be relied on. Most figures are read nearly whole and a few
 * hardly at all; what tells them apart shows in the reading itself, without a gold tree.
 */

import type { ExtractionDocument, QcIssue } from "./types.ts";
import { collectConnected } from "./tree.ts";

/**
 * Fewest tips for a reading to count as a tree at all.
 */
const fewestTips = 4;

/**
 * Share of the tree's tips that must have a name, or a label where no list was given.
 */
const namedShare = 0.75;

/**
 * Share of all the tips found that must be joined to the tree.
 */
const joinedShare = 0.7;

/**
 * Share that rows which look like labels and belong to no tip may make up, beside the tips.
 */
const unusedShare = 0.45;

/**
 * Judges a finished reading by four things it shows of itself: how many tips the tree has,
 * how many of them were named, how many of the tips found are joined to it, and how many rows
 * that look like labels were left without a tip. Over the gold figures, twelve of the
 * thirteen readings that named under 70 percent of their tips fail one of these, and two of
 * the ninety-nine that named 90 percent or more.
 *
 * @param document - Extraction document, complete.
 * @param listed - Whether the paper's list of names was given.
 * @param read - Whether labels were read at all.
 * @returns A warning that says why the reading is doubtful, or null when it stands.
 */
export function assessReading(document: ExtractionDocument, listed: boolean, read: boolean): QcIssue | null
{
    const connected = collectConnected(document);
    let inTree = 0;
    let named = 0;
    let labelled = 0;

    for (const tip of document.tips)
    {
        if (connected.has(tip.id))
        {
            inTree++;
            named += tip.match !== null && tip.match.accepted ? 1 : 0;
            labelled += tip.label !== null && tip.label.length > 0 ? 1 : 0;
        }
    }

    const reasons = new Array<string>();

    if (inTree < fewestTips)
    {
        reasons.push(inTree === 0 ? "no tree was found" : `the tree has only ${inTree} tip(s)`);
    }

    // With the paper's list, a tip is sound when it matches a name of it; without one, when
    // a label was read for it at all.
    const sound = listed ? named : labelled;

    if (read && inTree >= fewestTips && sound < namedShare * inTree)
    {
        reasons.push(listed ? `only ${named} of the tree's ${inTree} tips match a name` : `only ${labelled} of the tree's ${inTree} tips have a label`);
    }

    if (document.tips.length > 0 && inTree < joinedShare * document.tips.length)
    {
        reasons.push(`${document.tips.length - inTree} of the ${document.tips.length} tips found are not joined to the tree`);
    }

    let unused = 0;

    for (const line of document.textLines)
    {
        unused += line.role === "unassigned" && line.glyphCount >= 6 ? 1 : 0;
    }

    // Rows of other text stand in any figure; they count against a reading only where its
    // tips are not all named already.
    if (read && unused > unusedShare * (unused + inTree) && sound < 0.95 * inTree)
    {
        reasons.push(`${unused} row(s) of text that look like labels belong to no tip`);
    }

    if (reasons.length === 0)
    {
        return null;
    }

    return { severity: "warning", code: "reading-doubtful", message: `this reading is not to be relied on: ${reasons.join("; ")}`, subject: null };
}

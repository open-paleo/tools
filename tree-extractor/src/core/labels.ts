/**
 * Assigns detected text lines to tips and nodes, reads them with OCR and matches tip labels
 * against a name list.
 */

import type { ExtractionDocument, GrayImage, NameMatch, OcrEngine, ProgressReporter, RotatedFrame, TextLine, Tip, TreeNode } from "./types.ts";
import { compareNumbers, computeMedian, cropAndScale } from "./raster.ts";
import { createId, sortChildren } from "./edit.ts";
import { mapPointToFrame } from "./geometry.ts";
import { rotateGrayToFrame } from "./slant.ts";
import { matchKnownName, matchName, normalizeName, statusTokens } from "./matching.ts";

/**
 * A candidate assignment of a text line to a tip or node.
 */
type Pairing = {
    /**
     * Tip or node identifier.
     */
    subject: string;

    /**
     * Text line.
     */
    line: TextLine;

    /**
     * How far apart they are.
     */
    distance: number;
};

/**
 * Tells whether a text line is big enough to be a tip label: several glyphs, or a couple of
 * word-sized components.
 *
 * @param line - Text line.
 * @param glyphHeight - Glyph height in pixels.
 * @returns True for label-sized lines.
 */
export function isLabelSized(line: TextLine, glyphHeight: number): boolean
{
    const width = line.box.x1 - line.box.x0;

    return line.glyphCount >= 3 || (line.glyphCount >= 1 && width >= 2 * glyphHeight);
}

/**
 * Orders pairings by distance.
 *
 * @param left - First pairing.
 * @param right - Second pairing.
 * @returns Negative when the first is closer.
 */
function comparePairingDistances(left: Pairing, right: Pairing): number
{
    return left.distance - right.distance;
}

/**
 * Assigns text lines to tips (to the right of the branch end) and to nodes (left of the
 * junction with the parent branch), nearest first, each line used at most once.
 *
 * @param document - Document whose tips, nodes and text lines are updated in place.
 */
export function assignLabels(document: ExtractionDocument): void
{
    const attached = collectAttachedTips(document);
    const glyph = document.glyphHeight;
    const used = new Set<string>();
    const tipPairings = new Array<Pairing>();

    for (const tip of document.tips)
    {
        // A tip moved to the far side of a shape may now stand inside its label row's box, when
        // the shape touches the label and the two became one glyph; the row may then start as
        // far back as the branch end did.
        const reachBack = 1.5 * glyph + (tip.extendedFrom === undefined ? 0 : tip.x - tip.extendedFrom);

        for (const line of document.textLines)
        {
            // A row found in a level frame is compared with the tip mapped into that frame, and
            // since the glyph height was measured on level fragments of these labels, the row's
            // own height sets the vertical tolerance there.
            const point = line.frame === undefined ? tip : mapPointToFrame(line.frame, tip.x, tip.y);
            const offset = line.box.x0 - point.x;
            // In a frame a label stands on or above its branch, so the tip is measured against
            // the row's bottom edge: from most of a row below it to about two glyphs above.
            const rowHeight = line.box.y1 - line.box.y0;
            const rise = line.frame === undefined ? (line.box.y0 + line.box.y1) / 2 - point.y : line.box.y1 - point.y;
            // A label may stand above its branch rather than on it, up to a glyph and a third
            // (Fanti 2015 sets every label that way; a slanted branch meets its label at the
            // baseline), and rows are paired nearest first, so a row that far above belongs to
            // this tip only when no tip sits nearer to it.
            const fits = line.frame === undefined ? rise <= 0.8 * glyph && rise >= -1.3 * glyph : rise <= 0.7 * rowHeight && rise >= -(1.8 * glyph + 0.4 * rowHeight);

            if (isLabelSized(line, glyph) && fits && offset >= -reachBack && offset <= 5 * glyph)
            {
                // A tip of the main tree takes a row before a loose one does: a colored dot
                // before a label can trace as a stub of its own, right where the label begins,
                // and would otherwise take the row from the branch that ends short of it.
                const loose = attached.has(tip.id) ? 0 : 100 * glyph;
                // Height counts three times over: where rows stand a glyph apart, the label on
                // a tip's own row, a few glyphs along, must beat a scrap of the next row that
                // happens to begin nearer (Alarcon-Munoz 2023, rows 16 px apart).
                const climb = line.frame === undefined ? 3 * Math.abs(rise) : Math.abs(rise);
                tipPairings.push({ subject: tip.id, line, distance: Math.abs(offset) + climb + loose });
            }
        }
    }

    tipPairings.sort(comparePairingDistances);

    for (const pairing of tipPairings)
    {
        for (const tip of document.tips)
        {
            if (tip.id === pairing.subject && tip.textLine === null && !used.has(pairing.line.id))
            {
                tip.textLine = pairing.line.id;
                pairing.line.role = "tip";
                used.add(pairing.line.id);
            }
        }
    }

    // A tip whose branch runs to the edge of the figure has no room for its label after it,
    // and the label is set on the branch, ending where the branch ends (Carr 2010, the tips
    // of the latest stage). A tip still without a row takes one that lies just above its
    // branch, ends at its end and begins after its node.
    const parents = new Map<string, TreeNode>();

    for (const node of document.nodes)
    {
        parents.set(node.id, node);
    }

    const overPairings = new Array<Pairing>();

    for (const tip of document.tips)
    {
        const parent = tip.parent === null ? undefined : parents.get(tip.parent);

        if (tip.textLine !== null || parent === undefined || !attached.has(tip.id))
        {
            continue;
        }

        for (const line of document.textLines)
        {
            const lift = tip.y - line.box.y1;
            const short = tip.x - line.box.x1;

            if (!used.has(line.id) && line.frame === undefined && isLabelSized(line, glyph) && lift >= -0.3 * glyph && lift <= 1.2 * glyph && short >= -4 * glyph && short <= 2 * glyph && line.box.x0 >= parent.x)
            {
                overPairings.push({ subject: tip.id, line, distance: Math.abs(short) + 3 * Math.abs(lift) });
            }
        }
    }

    overPairings.sort(comparePairingDistances);

    for (const pairing of overPairings)
    {
        for (const tip of document.tips)
        {
            if (tip.id === pairing.subject && tip.textLine === null && !used.has(pairing.line.id))
            {
                tip.textLine = pairing.line.id;
                pairing.line.role = "tip";
                used.add(pairing.line.id);
            }
        }
    }

    const nodePairings = new Array<Pairing>();

    for (const node of document.nodes)
    {
        const junctionY = node.attachY ?? (node.y0 + node.y1) / 2;

        for (const line of document.textLines)
        {
            if (used.has(line.id))
            {
                continue;
            }

            const center = (line.box.y0 + line.box.y1) / 2;
            const horizontal = line.box.x1 - node.x;
            const vertical = center - junctionY;

            if (horizontal >= -6 * glyph && horizontal <= 1.5 * glyph && Math.abs(vertical) <= 1.6 * glyph)
            {
                nodePairings.push({ subject: node.id, line, distance: Math.hypot(horizontal, vertical) });
            }
        }
    }

    nodePairings.sort(comparePairingDistances);

    for (const pairing of nodePairings)
    {
        if (pairing.distance > 4 * glyph)
        {
            break;
        }

        for (const node of document.nodes)
        {
            if (node.id === pairing.subject && node.textLine === null && !used.has(pairing.line.id))
            {
                node.textLine = pairing.line.id;
                pairing.line.role = "node";
                used.add(pairing.line.id);
            }
        }
    }

    // A node's label may also be drawn to the right of its junction, over the gap between its
    // branches (Poole 2022's "Iguanodontia"). Only nodes still without a row take one from
    // there, and it must begin close by and sit level with the junction, since rows right of a
    // node are otherwise annotations of the branches that leave it.
    const rightPairings = new Array<Pairing>();

    for (const node of document.nodes)
    {
        if (node.textLine !== null)
        {
            continue;
        }

        const junctionY = node.attachY ?? (node.y0 + node.y1) / 2;

        for (const line of document.textLines)
        {
            const horizontal = line.box.x0 - node.x;
            const vertical = (line.box.y0 + line.box.y1) / 2 - junctionY;

            if (!used.has(line.id) && horizontal >= 0 && horizontal <= 1.5 * glyph && Math.abs(vertical) <= 0.8 * glyph)
            {
                rightPairings.push({ subject: node.id, line, distance: Math.hypot(horizontal, vertical) });
            }
        }
    }

    rightPairings.sort(comparePairingDistances);

    for (const pairing of rightPairings)
    {
        for (const node of document.nodes)
        {
            if (node.id === pairing.subject && node.textLine === null && !used.has(pairing.line.id))
            {
                node.textLine = pairing.line.id;
                pairing.line.role = "node";
                used.add(pairing.line.id);
            }
        }
    }

    for (const line of document.textLines)
    {
        if (!used.has(line.id))
        {
            line.role = "unassigned";
        }
    }
}

/**
 * Tidies OCR output for a taxon label: trims decoration and keeps name-like characters.
 *
 * @param text - Raw OCR text.
 * @returns Cleaned label, possibly empty.
 */
export function cleanTaxonText(text: string): string
{
    const cleaned = text
        .replace(/[^A-Za-z0-9 .'()-]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.)]+$/g, "")
        .trim();

    return dropRubbleWords(cleaned);
}

/**
 * Whether a word is what a dashed or striped bar reads as: a letter four times in a row,
 * three or fewer different letters in six or more, or five or more with no vowel or digit.
 *
 * @param letters - The word's letters and digits.
 * @returns True for rubble.
 */
export function isRubbleWord(letters: string): boolean
{
    if (/(.)\1\1\1/i.test(letters) || (letters.length > 4 && !/[aeiouy0-9]/i.test(letters)))
    {
        return true;
    }

    return letters.length >= 6 && new Set(letters.toLowerCase()).size <= 3;
}

/**
 * Drops what a dashed or striped bar leaves in a read: words with a letter four times in a
 * row, with three or fewer different letters in six or more ("cmmmmmmmnn", "immemmmeem"), or
 * long with no vowel, and short lowercase words before the first capital ("imi
 * Confuciusornithidae"), since a name starts with a capital.
 *
 * @param text - Cleaned read.
 * @returns The read without the rubble.
 */
function dropRubbleWords(text: string): string
{
    const words = text.split(" ");
    const kept = new Array<string>();

    for (const word of words)
    {
        const letters = word.replace(/[^A-Za-z0-9]/g, "");

        if (letters.length === 0 || isRubbleWord(letters))
        {
            continue;
        }

        if (kept.length === 0 && letters.length <= 3 && letters === letters.toLowerCase() && /[A-Z]/.test(words.slice(words.indexOf(word) + 1).join("")))
        {
            continue;
        }

        kept.push(word);
    }

    return kept.join(" ");
}

/**
 * Whether text read at a node is a name and not a support value: four letters or more, and
 * at least three letters for every digit. "100", "0.98" and "87/5" are values; "Dryomorpha"
 * and "Clade A" are names.
 *
 * @param text - OCR text.
 * @returns True for a name.
 */
export function isNameText(text: string): boolean
{
    const letters = text.replace(/[^\p{L}]/gu, "").length;
    const digits = text.replace(/[^0-9]/g, "").length;

    return letters >= 4 && letters >= 3 * digits;
}

/**
 * Tidies OCR output for a support value: maps look-alike letters to digits and keeps digits,
 * slashes and dots.
 *
 * @param text - Raw OCR text.
 * @returns Cleaned value, possibly empty.
 */
export function cleanSupportText(text: string): string
{
    return text
        .replace(/[lI|]/g, "1")
        .replace(/[oO]/g, "0")
        .replace(/[^0-9/.]/g, "")
        .replace(/^[/.]+|[/.]+$/g, "");
}

/**
 * Mends the spelling of a clade's name from the known clades: a one-word read that is one of
 * them, or nearly one and clearly nearer to it than to any other. The name keeps the capitals
 * it was printed in.
 *
 * @param text - Cleaned text, as read.
 * @param knownClades - Names of known clades, possibly empty.
 * @returns The match, or null when the read is not one word or no clade explains it.
 */
export function matchCladeName(text: string, knownClades: Array<string>): NameMatch | null
{
    const word = text.trim();

    if (knownClades.length === 0 || !/^\p{L}+$/u.test(word))
    {
        return null;
    }

    const match = matchName(word, knownClades);

    if (match === null || !(match.similarity >= 0.98 || (match.similarity >= 0.85 && match.margin >= 0.1)))
    {
        return null;
    }

    const name = word === word.toUpperCase() ? match.name.toUpperCase() : match.name;

    return { name, similarity: match.similarity, margin: match.margin, accepted: true, source: "known" };
}

/**
 * Matches a label: against the paper's list first, and when that gives nothing accepted,
 * against the known taxa at the stricter bar. The paper's unaccepted match is kept when the
 * known taxa do no better, so the reader still sees the nearest name.
 *
 * @param label - Cleaned label text, or null.
 * @param names - The paper's names, possibly empty.
 * @param knownNames - Known taxa, possibly empty.
 * @param knownClades - Known clades, possibly empty, for a tip that is a collapsed clade.
 * @returns The match, or null without a label or any list.
 */
export function chooseMatch(label: string | null, names: Array<string>, knownNames: Array<string>, knownClades: Array<string> = []): NameMatch | null
{
    if (label === null)
    {
        return null;
    }

    // A tip printed in capitals is a collapsed clade (COELURIDAE), not a taxon with a typo;
    // it keeps its printed name unless a list has it exactly.
    if (isCladeName(label))
    {
        const exact = names.length === 0 ? null : matchName(label, names);

        return exact !== null && exact.similarity >= 0.98 ? exact : matchCladeName(label, knownClades);
    }

    // So is a single word with the ending of a family, subfamily, tribe, superfamily or order
    // (Ornithomimosauria, Confuciusornithidae): the list's Ornithomimus is not its name,
    // however well the stem matches. The known clades may still mend its spelling.
    // A note of rank after the name leaves it a clade's name ("Riojasauridae tax. nov.").
    const bare = dropRankNote(label);

    if (isHigherTaxonName(bare))
    {
        const exact = names.length === 0 ? null : matchName(bare, names);

        return exact !== null && exact.similarity >= 0.9 ? exact : matchCladeName(bare, knownClades);
    }

    const own = names.length === 0 ? null : matchName(label, names);

    if (own !== null && own.accepted)
    {
        return own;
    }

    const known = knownNames.length === 0 ? null : matchKnownName(label, knownNames);

    if (known !== null && known.accepted)
    {
        return keepReadSpecies(label, known);
    }

    return own ?? known;
}

/**
 * Keeps the species a label was read with when the known taxa supplied only its genus. The
 * known taxa are a fallback for spelling, not the paper's own list, and they do not hold
 * every species: a figure's "Zalmoxes shqiperorum" matched the list's "Zalmoxes" and lost
 * its species, though it had been read correctly. The genus takes the list's spelling and the
 * species stays as read; so does an indeterminate species, "sp." or "sp. 2".
 *
 * @param label - Cleaned label as read.
 * @param match - Accepted match from the known taxa.
 * @returns The match, with the read species added to a genus-only name.
 */
function keepReadSpecies(label: string, match: NameMatch): NameMatch
{
    const words = label.trim().split(/\s+/);

    // A name printed with a qualifier of open nomenclature ("Iguanodon cf. bernissartensis",
    // "aff. Zalmoxes robustus") is the list's name with the qualifier, and the qualifier is
    // part of what the figure says: the read stands when nothing else separates the two.
    if (/(^|\s)(cf|aff)\.?(\s|$)/i.test(label) && normalizeName(label.replace(/(^|\s)(cf|aff)\.?(?=\s|$)/gi, " ")) === normalizeName(match.name))
    {
        return { ...match, name: label.trim() };
    }

    if (match.name.includes(" ") || words.length < 2)
    {
        return match;
    }

    // An indeterminate species, "sp." or "indet." with or without a number ("Rhabdodon
    // sp. 1"), or a species given with "cf." or "aff.", is part of the name as printed and no
    // list holds it; it stays, written as it was read.
    const rest = words.slice(1).join(" ");

    if (/^((sp|spp|indet)\.?\s*\d*\.?|sp\.?\s+indet\.?|(cf|aff)\.?\s+\p{Ll}{3,})$/iu.test(rest))
    {
        return { ...match, name: `${match.name} ${rest}` };
    }

    if (words.length !== 2 || !/^\p{Ll}{4,}$/u.test(words[1]))
    {
        return match;
    }

    return { ...match, name: `${match.name} ${words[1]}`, speciesAsRead: true };
}

/**
 * Whether text read from a colored box or band is a clade's name: one word, in capitals or
 * with the ending of a higher taxon, and not a name the lists hold, since a genus on a band
 * is a tip whose branch was missed.
 *
 * @param name - Cleaned text.
 * @param names - The paper's own names.
 * @param knownNames - Known taxa.
 * @returns True for a clade's name.
 */
export function isBoxedCladeName(name: string, names: Array<string>, knownNames: Array<string>): boolean
{
    if (isCladeName(name) && !name.includes(" "))
    {
        return true;
    }

    if (isHigherTaxonName(name))
    {
        return true;
    }

    if (!/^\p{Lu}\p{Ll}+(ia|poda|oda|ida|ata|ina|ae|ea|ones)$/u.test(name))
    {
        return false;
    }

    const wanted = name.toLowerCase();

    for (const list of [names, knownNames])
    {
        for (const entry of list)
        {
            if (entry.toLowerCase().replace(/_/g, " ") === wanted)
            {
                return false;
            }
        }
    }

    return true;
}

/**
 * Whether a label is set in capitals, as collapsed clades are: five or more letters, none of
 * them lower case.
 *
 * @param label - Cleaned label.
 * @returns True for a name in capitals.
 */
export function isHigherTaxonName(label: string): boolean
{
    const word = label.trim();

    return /^[A-Z][a-z]+$/.test(word) && /(sauria|idae|inae|ini|oidea|iformes|morpha|thoraces)$/.test(word);
}

/**
 * Drops the note of status that follows a name: "tax. nov.", "gen. nov.", "clade nov.",
 * "new", "nom. dub.". What is left is the name.
 *
 * @param label - Label as read.
 * @returns The label without the note.
 */
export function dropRankNote(label: string): string
{
    const words = label.trim().split(/\s+/);
    let dropped = 0;

    while (words.length > 1)
    {
        const word = words[words.length - 1].toLowerCase().replace(/\./g, "");

        // "sp." goes only as part of a note ("gen. et sp. nov."); alone it is an indeterminate
        // species, and part of the name as printed.
        const inNote = dropped > 0 && (word === "sp" || word === "et");

        if (!statusTokens.has(word) && word !== "clade" && word !== "new" && word !== "n" && !inNote)
        {
            break;
        }

        words.pop();
        dropped++;
    }

    return words.join(" ");
}

/**
 * Whether a tip already has a name.
 *
 * @param document - Extraction document.
 * @param name - The name.
 * @returns True when a tip's accepted match is that name.
 */
function isNameHeld(document: ExtractionDocument, name: string): boolean
{
    const wanted = normalizeName(name);

    for (const tip of document.tips)
    {
        if (tip.match !== null && tip.match.accepted && normalizeName(tip.match.name) === wanted)
        {
            return true;
        }
    }

    return false;
}

/**
 * Whether a branch is drawn from a node to a tip: a horizontal at the tip's height over at
 * least half the way.
 *
 * @param document - Extraction document.
 * @param tip - The tip.
 * @param node - Its parent.
 * @returns True when one is.
 */
function hasOwnBranch(document: ExtractionDocument, tip: Tip, node: TreeNode): boolean
{
    const reach = document.glyphHeight / 2;

    for (const horizontal of document.horizontals)
    {
        const { box } = horizontal;
        const covered = Math.min(box.x1, tip.x) - Math.max(box.x0, node.x);

        if (box.y0 <= tip.y + reach && box.y1 >= tip.y - reach && covered >= Math.max(reach, (tip.x - node.x) / 2))
        {
            return true;
        }
    }

    return false;
}

/**
 * Takes out the tips that are a clade's name. A name printed beside a node, with no branch
 * drawn to it, is read as a collapsed tip; where it is a family's or a higher name that the
 * paper's own list does not have, and the node has other children enough, it is no tip. Set
 * against the node's vertical it names that node (Fiorillo 2012, "Ceratopsidae" beside the
 * ring on its node); set off from it, on a leader line, it is left unassigned (Gomez 2024,
 * "Diplodocoidea").
 *
 * @param document - Extraction document, after its labels are read; changed in place.
 * @param listed - Whether the paper's list of names was given.
 * @returns How many tips became node names.
 */
export function restoreCladeNames(document: ExtractionDocument, listed: boolean): number
{
    if (!listed)
    {
        return 0;
    }

    const nodes = new Map<string, TreeNode>();

    for (const node of document.nodes)
    {
        nodes.set(node.id, node);
    }

    let restored = 0;

    for (let index = document.tips.length - 1; index >= 0; index--)
    {
        const tip = document.tips[index];
        const node = tip.parent === null ? undefined : nodes.get(tip.parent);
        const fromList = tip.match !== null && tip.match.accepted && tip.match.source === "list";

        // The name may have lost its first letter to the line beside it.
        if (node === undefined || tip.label === null || fromList || !/^\p{L}{4,}(idae|inae|oidea|iformes|sauria|morpha)$/u.test(dropRankNote(tip.label)))
        {
            continue;
        }

        // A clade's name stands by its node. One out among the tips' names is a collapsed
        // clade, a tip in its own right (Upchurch 2015, "Diplodocoidea").
        const near = tip.x - node.x <= 6 * document.glyphHeight;

        if (!near || node.children.length < 3 || hasOwnBranch(document, tip, node))
        {
            continue;
        }

        const row = findTextLine(document, tip.textLine);
        node.children.splice(node.children.indexOf(tip.id), 1);
        document.tips.splice(index, 1);
        restored++;

        // Printed against the node's own vertical, the name is that node's; set further off,
        // on a leader line perhaps, it may be another's and is left unassigned.
        if (tip.x - node.x <= document.glyphHeight / 2 && node.label === null)
        {
            node.label = tip.match !== null && tip.match.accepted ? tip.match.name : tip.label;
            node.textLine = tip.textLine;

            if (row !== undefined)
            {
                row.role = "node";
            }
        }
        else if (row !== undefined)
        {
            row.role = "unassigned";
        }
    }

    return restored;
}

/**
 * Whether a label is printed in capitals, which marks a clade name.
 *
 * @param label - Cleaned label text.
 * @returns True for COELURIDAE and the like.
 */
export function isCladeName(label: string): boolean
{
    const letters = label.replace(/[^A-Za-z]/g, "");

    return letters.length >= 5 && letters === letters.toUpperCase();
}

/**
 * Finds a text line by identifier.
 *
 * @param document - Document to search.
 * @param id - Text line identifier, or null.
 * @returns The line, or undefined.
 */
function findTextLine(document: ExtractionDocument, id: string | null): TextLine | undefined
{
    if (id === null)
    {
        return undefined;
    }

    for (const line of document.textLines)
    {
        if (line.id === id)
        {
            return line;
        }
    }

    return undefined;
}

/**
 * Least width of a row, as a share of its height, for it to be judged as a lone stroke; a
 * narrow row is a single digit, whose own ink is sparse in its box only if it is a "1" or a "7".
 */
const strokeBreadth = 0.8;

/**
 * Share of a row's crop that is ink below which the row holds a thin stroke and no character.
 */
const strokeShare = 0.13;

/**
 * Confidence below which a sparse row's reading is taken for a guess at a stroke.
 */
const strokeConfidence = 50;

/**
 * Measures how much of a crop is ink.
 *
 * @param crop - Gray crop, dark ink on a light ground.
 * @returns The share of its pixels darker than the middle gray.
 */
function measureInkShare(crop: GrayImage): number
{
    let dark = 0;

    for (let index = 0; index < crop.data.length; index++)
    {
        if (crop.data[index] < 128)
        {
            dark++;
        }
    }

    return dark / Math.max(1, crop.data.length);
}

/**
 * Measures how far apart the tips' label rows stand: the median distance between the centers
 * of neighboring rows, among rows in the figure's own frame.
 *
 * @param document - Document with labels assigned.
 * @returns The distance in pixels, or null with fewer than three such rows.
 */
function measureRowPitch(document: ExtractionDocument): number | null
{
    const centers = new Array<number>();

    for (const tip of document.tips)
    {
        const line = findTextLine(document, tip.textLine);

        if (line !== undefined && line.frame === undefined)
        {
            centers.push((line.box.y0 + line.box.y1) / 2);
        }
    }

    if (centers.length < 3)
    {
        return null;
    }

    centers.sort(compareNumbers);
    const gaps = new Array<number>();

    for (let index = 1; index < centers.length; index++)
    {
        gaps.push(centers[index] - centers[index - 1]);
    }

    return computeMedian(gaps, 0);
}

/**
 * Finds the second line of a tip's label: an unclaimed row just under the first, starting at
 * the same place, and nearer to it than rows of different tips stand to one another.
 *
 * @param document - Document with labels assigned.
 * @param first - The tip's row.
 * @param rowPitch - Distance between neighboring tips' rows, or null when unknown.
 * @returns The row, or null.
 */
function findSecondLine(document: ExtractionDocument, first: TextLine, rowPitch: number | null): TextLine | null
{
    if (rowPitch === null || first.frame !== undefined)
    {
        return null;
    }

    const glyph = document.glyphHeight;
    const center = (first.box.y0 + first.box.y1) / 2;
    let found: TextLine | null = null;

    for (const row of document.textLines)
    {
        const below = (row.box.y0 + row.box.y1) / 2 - center;
        const aligned = Math.abs(row.box.x0 - first.box.x0) <= glyph / 2;
        const near = below > glyph / 2 && below <= secondLineReach * rowPitch && row.box.y0 - first.box.y1 <= glyph / 2;

        if (row.role === "unassigned" && row.frame === undefined && row.glyphCount >= 3 && aligned && near)
        {
            found = found === null || row.box.y0 < found.box.y0 ? row : found;
        }
    }

    return found;
}

/**
 * How near the second line of a label stands, as a share of the distance between tips' rows.
 */
const secondLineReach = 0.65;

/**
 * A row that reads as a name and stands apart from any tip.
 */
type DistantLabel = {
    /**
     * The row.
     */
    row: TextLine;

    /**
     * Its text, cleaned.
     */
    label: string;

    /**
     * The name it matches.
     */
    match: NameMatch;
};

/**
 * How far a name may stand from its tip's height when names are paired in order, in glyph
 * heights.
 */
const distantReach = 6;

/**
 * Fewest tips that must find a name for names to be paired in order at all.
 */
const fewestInOrder = 3;

/**
 * Orders tips from the top down.
 *
 * @param left - First tip.
 * @param right - Second tip.
 * @returns Negative when the first is higher.
 */
function compareTipHeights(left: Tip, right: Tip): number
{
    return left.y - right.y;
}

/**
 * Orders distant labels from the top down.
 *
 * @param left - First label.
 * @param right - Second label.
 * @returns Negative when the first is higher.
 */
function compareDistantHeights(left: DistantLabel, right: DistantLabel): number
{
    return left.row.box.y0 - right.row.box.y0;
}

/**
 * Reads every assigned text line with the OCR engine and fills in tip and node labels.
 *
 * @param document - Document updated in place.
 * @param erased - Gray image with line art painted out.
 * @param ocr - Engine to read crops with.
 * @param scale - Upscaling factor for crops.
 * @param names - Optional closed list to match tip labels against.
 * @param progress - Receives a count per label read, or null.
 * @param knownClades - Known clades, for mending the spelling of clade names.
 * @returns Resolves when every label has been read.
 */
export async function readLabels(
    document: ExtractionDocument,
    erased: GrayImage,
    ocr: OcrEngine,
    scale: number,
    names: Array<string>,
    knownNames: Array<string>,
    progress: ProgressReporter | null = null,
    knownClades: Array<string> = [],
): Promise<void>
{
    const total = document.tips.length + document.nodes.length;
    const framed = new Map<RotatedFrame, GrayImage>();
    let done = 0;

    // A row in a level frame is cropped from the erased image turned into that frame.
    function chooseSource(line: TextLine): GrayImage
    {
        if (line.frame === undefined)
        {
            return erased;
        }

        let turned = framed.get(line.frame);

        if (turned === undefined)
        {
            turned = rotateGrayToFrame(erased, line.frame);
            framed.set(line.frame, turned);
        }

        return turned;
    }

    // Pairs the tips with their names by order where the names stand apart from the branch
    // ends: beside a drawing of each taxon, say, some way from the tip and not at its height
    // (Gomez 2024, where every name is set by a skull). Only when most tips of the tree are
    // still unnamed, and enough rows elsewhere read as names: the tips from the top down
    // then take the names from the top down, each name within a few rows of its tip.
    async function pairLabelsInOrder(): Promise<void>
    {
        const attached = collectAttachedTips(document);
        const glyph = document.glyphHeight;
        const unnamed = new Array<Tip>();
        const held = new Set<string>();
        const heldNames = new Set<string>();

        for (const tip of document.tips)
        {
            if (!attached.has(tip.id))
            {
                continue;
            }

            if (tip.match !== null && tip.match.accepted)
            {
                heldNames.add(normalizeName(tip.match.name));

                if (tip.textLine !== null)
                {
                    held.add(tip.textLine);
                }
            }
            else
            {
                unnamed.push(tip);
            }
        }

        if (attached.size < 4 || 2 * unnamed.length < attached.size)
        {
            return;
        }

        const distant = new Array<DistantLabel>();

        for (const row of document.textLines)
        {
            if (held.has(row.id) || row.frame !== undefined || row.glyphCount < 4 || !isLabelSized(row, glyph))
            {
                continue;
            }

            row.ocr ??= await ocr.recognize(cropAndScale(chooseSource(row), row.box, 3, scale), "text");
            const label = cleanTaxonText(row.ocr.text);
            const match = chooseMatch(label.length > 0 ? label : null, names, knownNames, knownClades);

            // A clade's name printed on a branch reads as a name too, and comes near enough to
            // a genus of the list to pass for it ("Brachiosauridae" for Brachiosaurus): a row
            // with a family's or a higher ending names a tip only when the list has it so.
            // The ending is looked for in the reading as it stands, whose first letter may be
            // misread.
            const clade = /(idae|inae|oidea|iformes)$/i.test(label) && match !== null && normalizeName(match.name) !== normalizeName(label);

            if (match !== null && match.accepted && !clade && !heldNames.has(normalizeName(match.name)))
            {
                distant.push({ row, label, match });
            }
        }

        if (2 * distant.length < unnamed.length)
        {
            return;
        }

        unnamed.sort(compareTipHeights);
        distant.sort(compareDistantHeights);
        const farthest = distantReach * glyph;
        // A tip left without a name costs as much as the farthest pairing; a name passed
        // over costs little, since rows that read as names are also clade names and notes.
        const skipTip = farthest;
        const skipRow = glyph;
        const parentX = new Map<string, number>();

        for (const node of document.nodes)
        {
            for (const child of node.children)
            {
                parentX.set(child, node.x);
            }
        }

        const tipCount = unnamed.length;
        const rowCount = distant.length;
        const cost = new Float64Array((tipCount + 1) * (rowCount + 1));
        const step = new Uint8Array((tipCount + 1) * (rowCount + 1));

        // The cheapest way to pair the first tips with the first rows, in order; leaving a
        // tip or a row out costs as much as the farthest pairing allowed.
        for (let tipIndex = 0; tipIndex <= tipCount; tipIndex++)
        {
            for (let rowIndex = 0; rowIndex <= rowCount; rowIndex++)
            {
                const at = tipIndex * (rowCount + 1) + rowIndex;

                if (tipIndex === 0 && rowIndex === 0)
                {
                    continue;
                }

                let best = Infinity;
                let how = 0;

                if (tipIndex > 0 && cost[at - (rowCount + 1)] + skipTip < best)
                {
                    best = cost[at - (rowCount + 1)] + skipTip;
                    how = 1;
                }

                if (rowIndex > 0 && cost[at - 1] + skipRow < best)
                {
                    best = cost[at - 1] + skipRow;
                    how = 2;
                }

                if (tipIndex > 0 && rowIndex > 0)
                {
                    const tip = unnamed[tipIndex - 1];
                    const { box } = distant[rowIndex - 1].row;
                    const apart = Math.abs((box.y0 + box.y1) / 2 - tip.y);

                    // The name may stand before the branch end, over a dashed stretch of the
                    // branch or where a drawing left it room, but not before the node the
                    // tip hangs from, where the clade names are.
                    const leftmost = parentX.get(tip.id) ?? tip.x - glyph;

                    if (apart <= farthest && box.x0 >= leftmost && cost[at - (rowCount + 1) - 1] + apart < best)
                    {
                        best = cost[at - (rowCount + 1) - 1] + apart;
                        how = 3;
                    }
                }

                cost[at] = best;
                step[at] = how;
            }
        }

        let tipIndex = tipCount;
        let rowIndex = rowCount;
        const pairs = new Array<[Tip, DistantLabel]>();

        while (tipIndex > 0 || rowIndex > 0)
        {
            const how = step[tipIndex * (rowCount + 1) + rowIndex];

            if (how === 3)
            {
                pairs.push([unnamed[tipIndex - 1], distant[rowIndex - 1]]);
                tipIndex--;
                rowIndex--;
            }
            else if (how === 1)
            {
                tipIndex--;
            }
            else
            {
                rowIndex--;
            }
        }

        // Order is evidence only in a run of names: one or two pairings are as likely a stray
        // row beside a stray tip (Hu 2009).
        if (pairs.length < fewestInOrder)
        {
            return;
        }

        for (const [tip, found] of pairs)
        {
            const earlier = findTextLine(document, tip.textLine);

            if (earlier !== undefined)
            {
                earlier.role = "unassigned";
            }

            // A loose tip that held the row gives it up.
            for (const other of document.tips)
            {
                if (other.textLine === found.row.id)
                {
                    other.textLine = null;
                    other.label = null;
                    other.match = null;
                }
            }

            tip.textLine = found.row.id;
            tip.label = found.label;
            tip.match = found.match;
            found.row.role = "tip";
        }

        const paired = pairs.length;

        if (paired > 0)
        {
            document.qc.push({
                severity: "info",
                code: "labels-paired-in-order",
                message: `${paired} tip(s) had no name beside them and were given the names that stand apart, in order from the top`,
                subject: null,
            });
        }
    }

    const rowPitch = measureRowPitch(document);

    for (const tip of document.tips)
    {
        const line = findTextLine(document, tip.textLine);
        done++;

        if (progress !== null)
        {
            progress.report("Reading labels", done, total);
        }

        if (line !== undefined)
        {
            // The font profile describes the rows in the figure's frame; a row in a level frame
            // is read as it is.
            const condensing = line.frame === undefined ? document.profile.font.condensing : 1;
            line.ocr = await ocr.recognize(cropAndScale(chooseSource(line), line.box, 3, scale, scale * condensing), "text");
            const cleaned = cleanTaxonText(line.ocr.text);
            tip.label = cleaned.length > 0 ? cleaned : null;
            tip.match = chooseMatch(tip.label, names, knownNames, knownClades);

            // A label set on two lines: the row under this one, starting where it starts and
            // closer than the next tip's row would be, with no tip of its own (Otero 2015:
            // "basalmost" over "sauropodomorphs"). It is taken unless the first line alone
            // names a taxon and the two together do not.
            const second = findSecondLine(document, line, rowPitch);

            if (second !== null && tip.label !== null)
            {
                second.ocr = await ocr.recognize(cropAndScale(chooseSource(second), second.box, 3, scale, scale * condensing), "text");
                const rest = cleanTaxonText(second.ocr.text);
                const joined = `${tip.label} ${rest}`;
                const joinedMatch = chooseMatch(joined, names, knownNames, knownClades);
                const firstNames = tip.match !== null && tip.match.accepted;
                const bothName = joinedMatch !== null && joinedMatch.accepted;

                // Both lines must be words: marks beside the tree read as a few stray characters.
                const words = /\p{L}{3}/u.test(tip.label) && /\p{L}{3}/u.test(rest);

                if (words && (bothName || !firstNames))
                {
                    tip.label = joined;
                    tip.match = joinedMatch;
                    second.role = "tip";
                }
            }
        }
    }

    // A reading that matches no name gets a second opinion, which replaces the first only when
    // it does match one, and one that no first reading gave another tip: a label cut short
    // reads as the tail of several names ("anosaurus"), and the second engine's cleaner reading
    // of it would name a second tip Jingshanosaurus (Otero 2015).
    if (ocr.recognizeAgain !== undefined)
    {
        const taken = new Set<string>();

        for (const tip of document.tips)
        {
            if (tip.match !== null && tip.match.accepted)
            {
                taken.add(normalizeName(tip.match.name));
            }
        }

        for (const tip of document.tips)
        {
            const line = findTextLine(document, tip.textLine);

            if (line === undefined || (tip.match !== null && tip.match.accepted))
            {
                continue;
            }

            const condensing = line.frame === undefined ? document.profile.font.condensing : 1;
            const second = await ocr.recognizeAgain(cropAndScale(chooseSource(line), line.box, 3, scale, scale * condensing), "text");
            const label = cleanTaxonText(second.text);
            const match = chooseMatch(label.length > 0 ? label : null, names, knownNames, knownClades);

            if (match !== null && match.accepted && !taken.has(normalizeName(match.name)))
            {
                line.ocr = second;
                tip.label = label;
                tip.match = match;
                taken.add(normalizeName(match.name));
            }
        }
    }

    await pairLabelsInOrder();

    for (const node of document.nodes)
    {
        const line = findTextLine(document, node.textLine);
        done++;

        if (progress !== null)
        {
            progress.report("Reading labels", done, total);
        }

        if (line !== undefined)
        {
            const crop = cropAndScale(chooseSource(line), line.box, 3, scale);
            line.ocr = await ocr.recognize(crop, "digits");
            // A row at a node is a support value or a clade name. Read as a value, a name
            // comes out as the few of its letters that pass for digits ("Dryomorpha" as "00").
            const cleaned = isNameText(line.ocr.text) ? cleanTaxonText(line.ocr.text) : cleanSupportText(line.ocr.text);
            // A row that is one thin stroke across its box is a leader line pointing at the
            // node, which reads as a digit: Otero 2015 has no support values and came out with
            // a "2" and a "7" from the lines leading to its clade names. Thin or gray digits
            // are as sparse in their box, so the reading must be an unsure one as well.
            const sparse = line.box.x1 - line.box.x0 >= strokeBreadth * (line.box.y1 - line.box.y0) && measureInkShare(crop) < strokeShare;
            const stroke = sparse && line.ocr.confidence < strokeConfidence;
            node.label = cleaned.length > 0 && !stroke ? matchCladeName(cleaned, knownClades)?.name ?? cleaned : null;

            // A name of the paper's own list is a tip's, not a node's. It stands at a node
            // where the node's branch runs straight on into the tip's, the middle child of
            // three, and the tip's stretch of it is too short to be a line (Fonseca 2024,
            // Nevadadromeus beside the dot on its node).
            const listed = isNameText(line.ocr.text) ? chooseMatch(cleaned, names, knownNames, knownClades) : null;
            const beside = line.box.x0 >= node.x && line.box.x0 - node.x <= 2 * document.glyphHeight;

            if (listed !== null && listed.accepted && listed.source === "list" && beside && !isNameHeld(document, listed.name))
            {
                const middle = (line.box.y0 + line.box.y1) / 2;
                const tip: Tip = { id: createId(document, "t"), x: line.box.x0 - 1, y: middle, parent: node.id, textLine: line.id, label: cleaned, match: listed, source: "traced", age: null, length: line.box.x0 - 1 - node.x };
                document.tips.push(tip);
                node.children.push(tip.id);
                sortChildren(document, node);
                node.label = null;
                node.textLine = null;
                line.role = "tip";
            }
        }

        // The clade's name from the box or band that shades it, kept as printed.
        const nameLine = findTextLine(document, node.nameLine ?? null);

        if (nameLine !== undefined)
        {
            nameLine.ocr = await ocr.recognize(cropAndScale(chooseSource(nameLine), nameLine.box, 3, scale), "text");
            const name = cleanTaxonText(nameLine.ocr.text);
            const clade = matchCladeName(name, knownClades);
            node.name = clade !== null ? clade.name : isBoxedCladeName(name, names, knownNames) ? name : null;

            // A row on the shading that reads as anything else, a tip's name that found no
            // branch or a caption, names no clade and goes back to being unassigned.
            if (node.name === null)
            {
                node.nameLine = null;
                nameLine.role = "unassigned";
            }
        }
    }
}

/**
 * Collects the ids of the tips that hang from the document's root.
 *
 * @param document - Document.
 * @returns Tip ids under the root.
 */
function collectAttachedTips(document: ExtractionDocument): Set<string>
{
    const attached = new Set<string>();
    const nodeById = new Map<string, TreeNode>();

    for (const node of document.nodes)
    {
        nodeById.set(node.id, node);
    }

    if (document.root === null)
    {
        return attached;
    }

    const pending = [document.root];

    while (pending.length > 0)
    {
        const id = pending.pop() as string;
        const node = nodeById.get(id);

        if (node === undefined)
        {
            attached.add(id);
            continue;
        }

        pending.push(...node.children);
    }

    return attached;
}

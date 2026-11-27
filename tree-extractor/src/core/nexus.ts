/**
 * Nexus writing.
 */

import { formatLabel } from "./newick.ts";

/**
 * Wraps Newick trees in a Nexus file with TAXA and TREES blocks.
 *
 * @param newick - Newick string with trailing semicolon, or several: the second and later
 *   trees are named after the first with their number.
 * @param taxa - Tip names in the order they should be listed.
 * @param treeName - Name for the TREE statement.
 * @param comment - Optional comment placed after the header.
 * @returns Nexus file contents.
 */
export function formatNexus(newick: string | Array<string>, taxa: Array<string>, treeName: string, comment: string | null): string
{
    const lines = ["#NEXUS", ""];

    if (comment !== null)
    {
        lines.push(`[ ${comment.replace(/\]/g, ")")} ]`, "");
    }

    lines.push("BEGIN TAXA;");
    lines.push(`    DIMENSIONS NTAX=${taxa.length};`);
    lines.push("    TAXLABELS");

    for (const taxon of taxa)
    {
        lines.push(`        ${formatLabel(taxon)}`);
    }

    lines.push("    ;");
    lines.push("END;");
    lines.push("");
    lines.push("BEGIN TREES;");
    const trees = typeof newick === "string" ? [newick] : newick;

    for (let index = 0; index < trees.length; index++)
    {
        lines.push(`    TREE ${index === 0 ? treeName : `${treeName}_${index + 1}`} = [&R] ${trees[index]}`);
    }

    lines.push("END;");
    lines.push("");

    return lines.join("\n");
}

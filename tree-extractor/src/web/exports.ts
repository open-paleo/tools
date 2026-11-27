/**
 * Downloads of the extracted tree in each format.
 */

import type { ExtractionDocument } from "../core/types.ts";
import { collectTreeTaxa, formatDocumentTreesAsNewick } from "../core/newick.ts";
import { formatNexus } from "../core/nexus.ts";
import { renderTreeSvg } from "../core/render.ts";
import type { RenderOptions } from "../core/render.ts";

/**
 * Offers a text file for download.
 *
 * @param name - File name.
 * @param text - File contents.
 * @param type - Media type.
 */
function downloadText(name: string, text: string, type: string): void
{
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
}

/**
 * Downloads the trees as Newick, one to a line.
 *
 * @param extraction - Document with a tree.
 * @param fileStem - File name without extension.
 */
export function downloadNewickFile(extraction: ExtractionDocument, fileStem: string): void
{
    downloadText(`${fileStem}.nwk`, `${formatDocumentTreesAsNewick(extraction).join("\n")}\n`, "text/plain");
}

/**
 * Downloads the trees as Nexus.
 *
 * @param extraction - Document with a tree.
 * @param fileStem - File name without extension.
 */
export function downloadNexusFile(extraction: ExtractionDocument, fileStem: string): void
{
    const trees = formatDocumentTreesAsNewick(extraction);

    if (trees.length === 0)
    {
        return;
    }

    downloadText(`${fileStem}.nex`, formatNexus(trees, collectTreeTaxa(extraction), "extracted", `Extracted from ${fileStem} by tree-extractor`), "text/plain");
}

/**
 * Downloads the extraction document as JSON.
 *
 * @param extraction - Document.
 * @param fileStem - File name without extension.
 */
export function downloadDocumentFile(extraction: ExtractionDocument, fileStem: string): void
{
    downloadText(`${fileStem}.json`, JSON.stringify(extraction, null, 2), "application/json");
}

/**
 * Downloads the redrawn tree as SVG.
 *
 * @param extraction - Document with a tree.
 * @param fileStem - File name without extension.
 * @param options - Drawing options, as the page shows the tree.
 */
export function downloadSvgFile(extraction: ExtractionDocument, fileStem: string, options: Partial<RenderOptions>): void
{
    const svg = renderTreeSvg(extraction, options);

    if (svg !== null)
    {
        downloadText(`${fileStem}.svg`, `${svg}\n`, "image/svg+xml");
    }
}

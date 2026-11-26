import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractionDocument, RgbaImage, TextLine, Tip, TreeNode } from "../src/core/types.ts";
import { createEmptyProfile } from "../src/core/profile.ts";
import { carryTipsThroughBars } from "../src/core/range-bars.ts";

const ground = [152, 197, 226];
const slate = [76, 92, 118];
const black = [20, 20, 20];

/**
 * An image of one color.
 *
 * @param width - Width.
 * @param height - Height.
 * @param color - Red, green and blue.
 * @returns The image.
 */
function createImage(width: number, height: number, color: Array<number>): RgbaImage
{
    const image = { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };

    fill(image, 0, 0, width, height, color);

    return image;
}

/**
 * Fills a rectangle with one color.
 *
 * @param image - Image set in place.
 * @param x0 - Left.
 * @param y0 - Top.
 * @param x1 - Right, exclusive.
 * @param y1 - Bottom, exclusive.
 * @param color - Red, green and blue.
 */
function fill(image: RgbaImage, x0: number, y0: number, x1: number, y1: number, color: Array<number>): void
{
    for (let y = y0; y < y1; y++)
    {
        for (let x = x0; x < x1; x++)
        {
            const offset = 4 * (y * image.width + x);

            image.data[offset] = color[0];
            image.data[offset + 1] = color[1];
            image.data[offset + 2] = color[2];
        }
    }
}

/**
 * Draws lettering: strokes with gaps between them.
 *
 * @param image - Image set in place.
 * @param x0 - Left.
 * @param x1 - Right.
 * @param y - Middle height.
 */
function drawLettering(image: RgbaImage, x0: number, x1: number, y: number): void
{
    for (let x = x0; x < x1; x += 8)
    {
        fill(image, x, y - 5, x + 3, y + 5, black);
    }
}

/**
 * Builds a document of two tips under one node, each with the row of its name.
 *
 * @param tips - The tips.
 * @param rows - The rows.
 * @returns The document.
 */
function createDocument(tips: Array<Tip>, rows: Array<TextLine>): ExtractionDocument
{
    const root: TreeNode = { id: "n1", x: 20, y0: 40, y1: 160, attachY: null, parent: null, children: tips.map((tip) => tip.id), textLine: null, label: null, source: "traced", age: null };

    return {
        version: 1,
        image: { width: 600, height: 200, source: null, region: null, quarterTurns: 0 },
        horizontals: [],
        verticals: [],
        textLines: rows,
        nodes: [root],
        tips,
        root: "n1",
        qc: [],
        rejectedVerticals: [],
        branches: [],
        glyphHeight: 12,
        profile: createEmptyProfile(),
        timings: {},
    };
}

/**
 * Makes a tip.
 *
 * @param id - Identifier.
 * @param x - Branch end.
 * @param y - Height.
 * @param textLine - Row of its name, or null.
 * @returns The tip.
 */
function createTip(id: string, x: number, y: number, textLine: string | null): Tip
{
    return { id, x, y, parent: "n1", textLine, label: null, match: null, source: "traced", age: null };
}

test("carryTipsThroughBars: a tip is carried through a bar of one color to the name at its end", () =>
{
    const image = createImage(600, 200, ground);

    fill(image, 20, 59, 200, 62, black);
    fill(image, 200, 56, 320, 65, slate);
    drawLettering(image, 326, 420, 60);

    const document = createDocument([createTip("t1", 200, 60, null)], [{ id: "l1", box: { x0: 326, y0: 54, x1: 420, y1: 66 }, glyphCount: 12, role: "unassigned", ocr: null }]);
    const issues = carryTipsThroughBars(document, image);

    assert.equal(issues.length, 1);
    assert.equal(document.tips[0].textLine, "l1");
    assert.equal(document.textLines[0].role, "tip");
    assert.ok(Math.abs(document.tips[0].x - 319) <= 2);
});

test("carryTipsThroughBars: a row that took the bar in with its letters is cut back to the letters", () =>
{
    const image = createImage(600, 200, ground);

    fill(image, 20, 59, 200, 62, black);
    fill(image, 200, 56, 320, 65, slate);
    drawLettering(image, 326, 420, 60);

    const document = createDocument([createTip("t1", 200, 60, "l1")], [{ id: "l1", box: { x0: 201, y0: 54, x1: 420, y1: 66 }, glyphCount: 12, role: "tip", ocr: null }]);

    carryTipsThroughBars(document, image);

    assert.ok(document.textLines[0].box.x0 >= 318 && document.textLines[0].box.x0 <= 322);
    assert.equal(document.textLines[0].box.x1, 420);
});

test("carryTipsThroughBars: lettering is not followed as a bar, and a far name is not taken", () =>
{
    const image = createImage(600, 200, ground);

    fill(image, 20, 59, 200, 62, black);
    drawLettering(image, 204, 300, 60);
    drawLettering(image, 420, 520, 60);

    const document = createDocument(
        [createTip("t1", 200, 60, "l1")],
        [
            { id: "l1", box: { x0: 203, y0: 54, x1: 300, y1: 66 }, glyphCount: 12, role: "tip", ocr: null },
            { id: "l2", box: { x0: 420, y0: 54, x1: 520, y1: 66 }, glyphCount: 12, role: "unassigned", ocr: null },
        ],
    );
    const issues = carryTipsThroughBars(document, image);

    assert.equal(issues.length, 0);
    assert.equal(document.textLines[0].box.x0, 203);
    assert.equal(document.textLines[1].role, "unassigned");
});

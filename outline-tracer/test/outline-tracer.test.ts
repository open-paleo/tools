import assert from "node:assert/strict";
import { test } from "node:test";

import type { OutlineBody, RgbaImage } from "../src/outline-tracer.ts";
import { defaultTraceOptions, findOutlineBody, traceOutline } from "../src/outline-tracer.ts";
import { loadNodeTracer } from "../src/node.ts";

// A synthetic figure, 800 by 400: a body with a white bone inside it, two legs standing on a
// ground line, and a label well away from the animal.

/**
 * A rectangle to paint, in the figure's pixels.
 */
type Rectangle = {
    /**
     * The leftmost column.
     */
    left: number;

    /**
     * The topmost row.
     */
    top: number;

    /**
     * The column after the rightmost.
     */
    right: number;

    /**
     * The row after the bottom one.
     */
    bottom: number;
};

const figureWidth = 800;
const figureHeight = 400;

// Every figure is traced at 2400 px wide, three times this one.
const scale = 3;

/**
 * Paint a rectangle in one gray level.
 *
 * @param image - The image, changed in place.
 * @param rectangle - Where.
 * @param gray - The gray level, 0 for black.
 */
function paintRectangle(image: RgbaImage, rectangle: Rectangle, gray: number): void
{
    for (let y = rectangle.top; y < rectangle.bottom; y++)
    {
        for (let x = rectangle.left; x < rectangle.right; x++)
        {
            image.data.fill(gray, (y * image.width + x) * 4, (y * image.width + x) * 4 + 3);
        }
    }
}

/**
 * Draw the synthetic figure.
 *
 * @returns The figure.
 */
function createFigure(): RgbaImage
{
    const image: RgbaImage = { width: figureWidth, height: figureHeight, data: new Uint8ClampedArray(figureWidth * figureHeight * 4).fill(255) };

    paintRectangle(image, { left: 250, top: 120, right: 550, bottom: 230 }, 0);
    paintRectangle(image, { left: 320, top: 160, right: 480, bottom: 190 }, 255);
    paintRectangle(image, { left: 300, top: 230, right: 320, bottom: 330 }, 0);
    paintRectangle(image, { left: 480, top: 230, right: 500, bottom: 330 }, 0);
    paintRectangle(image, { left: 50, top: 330, right: 750, bottom: 334 }, 0);
    paintRectangle(image, { left: 650, top: 30, right: 750, bottom: 50 }, 0);

    return image;
}

/**
 * Read the body at a point of the figure.
 *
 * @param body - The body.
 * @param x - The column, in the figure's pixels.
 * @param y - The row, in the figure's pixels.
 * @returns 1 for the body, 0 for anything else.
 */
function readBodyAt(body: OutlineBody, x: number, y: number): number
{
    return body.mask.pixels[(y * scale + 1) * body.mask.width + x * scale + 1];
}

test("the body is filled, and the ground line and label removed", () =>
{
    const body = findOutlineBody(createFigure(), defaultTraceOptions);

    assert.equal(body.report.linesErased, 1);
    assert.equal(body.report.shapesKept, 1);
    assert.equal(body.report.shapesDropped, 1, "the label");
    assert.equal(readBodyAt(body, 400, 175), 1, "the bone is filled");
    assert.equal(readBodyAt(body, 700, 40), 0, "the label is dropped");
    assert.equal(readBodyAt(body, 100, 332), 0, "the ground line is erased");
    assert.equal(readBodyAt(body, 310, 329), 1, "the feet are kept");
});

test("a keep-open point leaves its space open, and one on the drawing is reported", () =>
{
    const body = findOutlineBody(createFigure(), { threshold: 180, keepOpen: [[400, 175], [260, 125]] });

    assert.equal(readBodyAt(body, 400, 175), 0);
    assert.deepEqual(body.report.keepOpenMissed, [[260, 125]]);
});

test("a trace is the same every time", async () =>
{
    const tracer = await loadNodeTracer();
    const first = await traceOutline(createFigure(), defaultTraceOptions, tracer);
    const second = await traceOutline(createFigure(), defaultTraceOptions, tracer);

    assert.match(first.svg, /<path /);
    assert.equal(first.svg, second.svg);
});

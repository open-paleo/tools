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
 * Paint a rectangle in one color.
 *
 * @param image - The image, changed in place.
 * @param rectangle - Where.
 * @param color - The color: one gray level (0 for black), or red, green and blue.
 */
function paintRectangle(image: RgbaImage, rectangle: Rectangle, color: number | [number, number, number]): void
{
    const channels = typeof color === "number" ? [color, color, color] : color;

    for (let y = rectangle.top; y < rectangle.bottom; y++)
    {
        for (let x = rectangle.left; x < rectangle.right; x++)
        {
            const index = (y * image.width + x) * 4;

            image.data[index] = channels[0];
            image.data[index + 1] = channels[1];
            image.data[index + 2] = channels[2];
        }
    }
}

/**
 * Create a blank figure.
 *
 * @param color - The background: one gray level, or red, green and blue.
 * @returns The figure.
 */
function createBlankFigure(color: number | [number, number, number]): RgbaImage
{
    const image: RgbaImage = { width: figureWidth, height: figureHeight, data: new Uint8ClampedArray(figureWidth * figureHeight * 4).fill(255) };

    paintRectangle(image, { left: 0, top: 0, right: figureWidth, bottom: figureHeight }, color);

    return image;
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

test("the placement puts the outline over the animal on the figure", async () =>
{
    const result = await traceOutline(createFigure(), defaultTraceOptions, await loadNodeTracer());

    // The animal spans columns 250 to 550 and rows 120 to 330, with a 4 px margin around it.
    assert.ok(Math.abs(result.placement.left - 246) <= 1, "left " + result.placement.left);
    assert.ok(Math.abs(result.placement.top - 116) <= 1, "top " + result.placement.top);
    assert.ok(Math.abs(result.placement.left + result.placement.width - 554) <= 1, "right");
    assert.ok(Math.abs(result.placement.top + result.placement.height - 334) <= 1, "bottom");
});

test("a gray background is taken from the top corners and left out", () =>
{
    const figure = createBlankFigure(160);

    paintRectangle(figure, { left: 250, top: 120, right: 550, bottom: 230 }, 0);

    const body = findOutlineBody(figure, defaultTraceOptions);

    assert.equal(body.report.background, "#a0a0a0");
    assert.equal(readBodyAt(body, 400, 175), 1);
    assert.equal(readBodyAt(body, 100, 300), 0, "the background is not traced");
});

test("an animal drawn in a light color still counts as drawing", () =>
{
    const figure = createBlankFigure(255);

    paintRectangle(figure, { left: 250, top: 120, right: 550, bottom: 230 }, [240, 200, 40]);

    const body = findOutlineBody(figure, defaultTraceOptions);

    assert.equal(body.report.background, "");
    assert.equal(readBodyAt(body, 400, 175), 1);
});

test("a select point keeps the animal it is on, not the largest", () =>
{
    const figure = createBlankFigure(255);

    paintRectangle(figure, { left: 100, top: 40, right: 300, bottom: 120 }, 0);
    paintRectangle(figure, { left: 100, top: 220, right: 700, bottom: 380 }, 0);

    const largest = findOutlineBody(figure, defaultTraceOptions);
    const selected = findOutlineBody(figure, { ...defaultTraceOptions, select: [200, 80] });
    const missed = findOutlineBody(figure, { ...defaultTraceOptions, select: [750, 30] });

    assert.equal(readBodyAt(largest, 400, 300), 1);
    assert.equal(readBodyAt(largest, 200, 80), 0);
    assert.equal(readBodyAt(selected, 200, 80), 1);
    assert.equal(readBodyAt(selected, 400, 300), 0);
    assert.equal(missed.report.selectMissed, true);
});

test("a bone drawn beside the animal with a line to it is removed, and a thin tail stays", () =>
{
    const figure = createBlankFigure(255);

    paintRectangle(figure, { left: 250, top: 150, right: 550, bottom: 250 }, 0);
    // The tail: one pixel wide, ending in nothing.
    paintRectangle(figure, { left: 550, top: 200, right: 700, bottom: 201 }, 0);
    // The call-out: a bone above the animal, and a line down to it.
    paintRectangle(figure, { left: 150, top: 40, right: 230, bottom: 70 }, 0);
    paintRectangle(figure, { left: 190, top: 70, right: 191, bottom: 160 }, 0);
    paintRectangle(figure, { left: 190, top: 159, right: 260, bottom: 160 }, 0);

    const body = findOutlineBody(figure, defaultTraceOptions);

    assert.equal(body.report.calloutsRemoved, 1);
    assert.equal(readBodyAt(body, 190, 55), 0, "the bone is removed");
    assert.equal(readBodyAt(body, 190, 110), 0, "its line is removed");
    assert.equal(readBodyAt(body, 690, 200), 1, "the tail stays");
});

test("a row of white bones near the back doesn't cut the body as if it were a ground line", () =>
{
    const figure = createBlankFigure(255);

    paintRectangle(figure, { left: 100, top: 100, right: 700, bottom: 250 }, 0);

    // White vertebrae along the back leave a thin, long band of black above them.
    for (let x = 120; x < 680; x += 14)
    {
        paintRectangle(figure, { left: x, top: 106, right: x + 8, bottom: 112 }, 255);
    }

    const body = findOutlineBody(figure, defaultTraceOptions);

    assert.equal(body.report.linesErased, 0);
    assert.equal(readBodyAt(body, 400, 103), 1, "the back above the bones");
    assert.equal(readBodyAt(body, 400, 200), 1, "the body below them");
});

test("a thick ground strip is erased, and two feet close together keep the gap between the legs", () =>
{
    const figure = createBlankFigure(255);

    paintRectangle(figure, { left: 250, top: 150, right: 550, bottom: 250 }, 0);
    paintRectangle(figure, { left: 380, top: 250, right: 395, bottom: 350 }, 0);
    paintRectangle(figure, { left: 403, top: 250, right: 418, bottom: 350 }, 0);
    paintRectangle(figure, { left: 0, top: 350, right: 800, bottom: 400 }, 90);

    const body = findOutlineBody(figure, defaultTraceOptions);

    assert.equal(body.report.linesErased, 1);
    assert.equal(readBodyAt(body, 100, 380), 0, "the strip is erased");
    assert.equal(readBodyAt(body, 399, 320), 0, "the gap between the legs stays open");
    assert.equal(readBodyAt(body, 387, 345), 1, "the feet are kept");
});

test("vertical grid lines are erased, and a rectangle can be blanked out", () =>
{
    const figure = createBlankFigure(255);

    for (let x = 20; x < 800; x += 100)
    {
        paintRectangle(figure, { left: x, top: 0, right: x + 1, bottom: 400 }, 120);
    }

    paintRectangle(figure, { left: 250, top: 150, right: 550, bottom: 250 }, 0);
    paintRectangle(figure, { left: 600, top: 60, right: 700, bottom: 140 }, 0);
    paintRectangle(figure, { left: 550, top: 140, right: 600, bottom: 160 }, 0);

    const plain = findOutlineBody(figure, defaultTraceOptions);
    const erased = findOutlineBody(figure, { ...defaultTraceOptions, erase: [[590, 50, 710, 165]] });

    assert.equal(readBodyAt(plain, 120, 300), 0, "a grid line is erased");
    assert.equal(readBodyAt(plain, 650, 100), 1, "the box joined to the animal stays without a rectangle");
    assert.equal(readBodyAt(erased, 650, 100), 0, "and goes with one");
    assert.equal(readBodyAt(erased, 400, 200), 1);
});

test("a fill point fills a space whose opening is too wide to close by itself", () =>
{
    const figure = createBlankFigure(255);

    paintRectangle(figure, { left: 250, top: 150, right: 550, bottom: 250 }, 0);

    // A white space inside the body, opening to the outside through a slot seven pixels wide:
    // wider than the cavity filler closes, narrower than a fill point does.
    paintRectangle(figure, { left: 300, top: 170, right: 360, bottom: 230 }, 255);
    paintRectangle(figure, { left: 327, top: 150, right: 334, bottom: 170 }, 255);

    const plain = findOutlineBody(figure, defaultTraceOptions);
    const filled = findOutlineBody(figure, { ...defaultTraceOptions, fill: [[330, 200], [400, 200]] });

    assert.equal(readBodyAt(plain, 330, 200), 0, "left open without a fill point");
    assert.equal(readBodyAt(filled, 330, 200), 1, "filled with one");
    assert.equal(readBodyAt(filled, 330, 160), 1, "and the slot that opened it");
    assert.deepEqual(filled.report.fillMissed, [[400, 200]], "a point on the drawing does nothing");
});

test("an erase stroke takes a pointer line but not the animal's edge it strays over", () =>
{
    const figure = createBlankFigure(255);

    // A body, and a pointer line from it to a label.
    paintRectangle(figure, { left: 250, top: 150, right: 550, bottom: 250 }, 0);
    paintRectangle(figure, { left: 300, top: 20, right: 360, bottom: 40 }, 0);
    paintRectangle(figure, { left: 330, top: 40, right: 331, bottom: 150 }, 0);

    // The stroke runs two pixels into the body.
    const stroked = findOutlineBody(figure, { ...defaultTraceOptions, eraseLines: [[330, 140, 330, 148, 8]] });

    assert.equal(readBodyAt(stroked, 330, 100), 0, "a stroke over the pointer line drops it");
    assert.equal(readBodyAt(stroked, 330, 30), 0, "and its label");
    assert.equal(readBodyAt(stroked, 330, 151), 1, "but the edge it strays over stays");

    // A wide stroke that runs well into the body leaves no dent either.
    const deep = findOutlineBody(figure, { ...defaultTraceOptions, eraseLines: [[330, 140, 330, 156, 16]] });

    assert.equal(readBodyAt(deep, 330, 100), 0);
    assert.equal(readBodyAt(deep, 330, 151), 1, "even where it runs eight pixels in");
});

test("an erase stroke that cuts a thin outline beside a white bone leaves the bone filled", () =>
{
    const figure = createBlankFigure(255);

    // A body whose top edge is a thin line over a white bone, and a pointer line from it to a label.
    paintRectangle(figure, { left: 250, top: 150, right: 550, bottom: 250 }, 0);
    paintRectangle(figure, { left: 300, top: 152, right: 360, bottom: 230 }, 255);
    paintRectangle(figure, { left: 300, top: 20, right: 360, bottom: 40 }, 0);
    paintRectangle(figure, { left: 330, top: 40, right: 331, bottom: 150 }, 0);

    const stroked = findOutlineBody(figure, { ...defaultTraceOptions, eraseLines: [[330, 140, 330, 154, 16]] });

    assert.equal(readBodyAt(stroked, 330, 100), 0, "a stroke over the pointer line drops it");
    assert.equal(readBodyAt(stroked, 330, 151), 1, "but the outline it cuts stays");
    assert.equal(readBodyAt(stroked, 330, 190), 1, "so the bone under it is still filled");
});

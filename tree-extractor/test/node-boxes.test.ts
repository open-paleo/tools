import assert from "node:assert/strict";
import { test } from "node:test";

import type { RgbaImage } from "../src/core/types.ts";
import { resolveNodeBoxes } from "../src/core/node-boxes.ts";

/**
 * A white image.
 *
 * @param width - Width.
 * @param height - Height.
 * @returns The image.
 */
function createImage(width: number, height: number): RgbaImage
{
    return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
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
 * Reads the luminance of one pixel.
 *
 * @param image - The image.
 * @param x - Column.
 * @param y - Row.
 * @returns Its luminance.
 */
function readLuminance(image: RgbaImage, x: number, y: number): number
{
    const offset = 4 * (y * image.width + x);

    return 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
}

const black = [0, 0, 0];
const green = [80, 150, 80];
const red = [220, 40, 35];
const paleBlue = [155, 167, 207];

/**
 * Draws a tree of ranges: a stem through five green boxes on nodes, each with a pale bar
 * behind it and a line up to a red bar on a tip, and a letter in every box.
 *
 * @returns The image.
 */
function createRangeTree(): RgbaImage
{
    const image = createImage(1000, 1000);

    for (let node = 0; node < 5; node++)
    {
        const left = 100 + 140 * node;

        fill(image, left - 30, 410, left + 70, 420, paleBlue);
    }

    fill(image, 40, 414, 680, 417, black);

    for (let node = 0; node < 5; node++)
    {
        const left = 100 + 140 * node;

        fill(image, left + 19, 300, left + 22, 400, black);
        fill(image, left + 19, 299, left + 50, 302, black);
        fill(image, left, 400, left + 40, 430, green);
        fill(image, left + 10, 408, left + 16, 420, black);
        fill(image, left + 50, 288, left + 110, 312, red);
        fill(image, left + 60, 294, left + 66, 306, black);
    }

    return image;
}

test("resolveNodeBoxes: boxes on nodes become junctions and bars on tips become branches", () =>
{
    const result = resolveNodeBoxes(createRangeTree());

    assert.equal(result.nodes, 5);
    assert.equal(result.bars, 5);

    // The first node's box: white at a corner, a line where the upright comes in from the
    // top, and the stem across it.
    assert.ok(readLuminance(result.image, 104, 403) > 250);
    assert.ok(readLuminance(result.image, 120, 405) < 10);
    assert.ok(readLuminance(result.image, 110, 415) < 10);

    // Its tip's bar: a branch through the middle, white above it.
    assert.ok(readLuminance(result.image, 180, 300) < 10);
    assert.ok(readLuminance(result.image, 180, 291) > 250);

    // The pale bar behind the node is gone.
    assert.ok(readLuminance(result.image, 80, 411) > 250);
});

test("resolveNodeBoxes: a row of lettered cells is a chart, and the figure is left as it is", () =>
{
    const image = createImage(1000, 600);

    fill(image, 100, 100, 700, 103, black);

    for (let cell = 0; cell < 6; cell++)
    {
        fill(image, 100 + 100 * cell, 400, 198 + 100 * cell, 440, green);
        fill(image, 130 + 100 * cell, 412, 136 + 100 * cell, 428, black);
        fill(image, 150 + 100 * cell, 103, 153 + 100 * cell, 400, black);
    }

    const result = resolveNodeBoxes(image);

    assert.equal(result.nodes, 0);
    assert.equal(result.image, image);
});

test("resolveNodeBoxes: lettered boxes on nodes with no lettered tips are left alone", () =>
{
    const image = createRangeTree();

    // The tips' bars are painted out, leaving plain branches.
    for (let node = 0; node < 5; node++)
    {
        const left = 100 + 140 * node;

        fill(image, left + 50, 288, left + 110, 312, [255, 255, 255]);
        fill(image, left + 50, 299, left + 110, 302, black);
    }

    const result = resolveNodeBoxes(image);

    assert.equal(result.nodes, 0);
    assert.equal(result.image, image);
});

const tan = [222, 178, 132];
const blue = [60, 110, 180];

/**
 * Draws a pie chart: a disc in one color with a dark rim and a sector of a second color.
 *
 * @param image - Image set in place.
 * @param centerX - Center column.
 * @param centerY - Center row.
 * @param radius - Radius in pixels.
 */
function drawPie(image: RgbaImage, centerX: number, centerY: number, radius: number): void
{
    for (let y = centerY - radius; y <= centerY + radius; y++)
    {
        for (let x = centerX - radius; x <= centerX + radius; x++)
        {
            const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));

            if (distance <= radius)
            {
                fill(image, x, y, x + 1, y + 1, distance > radius - 3 ? black : x > centerX && y < centerY ? blue : tan);
            }
        }
    }
}

test("resolveNodeBoxes: pie charts on nodes become junctions", () =>
{
    const image = createImage(1200, 900);

    // A stem through five nodes, each with an upright through it.
    fill(image, 40, 399, 900, 402, black);

    for (let node = 0; node < 5; node++)
    {
        const x = 150 + 150 * node;

        fill(image, x - 1, 300, x + 2, 500, black);
        drawPie(image, x, 400, 30);
    }

    const result = resolveNodeBoxes(image);

    assert.equal(result.pies, 5);
    assert.equal(result.nodes, 0);

    // The first pie: gone off its lines, and the stem and the upright drawn through it.
    assert.ok(readLuminance(result.image, 162, 412) > 250);
    assert.ok(readLuminance(result.image, 150, 385) < 10);
    assert.ok(readLuminance(result.image, 135, 400) < 10);
});

test("resolveNodeBoxes: colored dots drawn on a branch are no pies, and are left as they are", () =>
{
    const image = createImage(1200, 900);

    fill(image, 40, 399, 900, 402, black);

    for (let node = 0; node < 5; node++)
    {
        drawPie(image, 150 + 150 * node, 400, 30);
    }

    const result = resolveNodeBoxes(image);

    assert.equal(result.pies, 0);
    assert.equal(result.image, image);
});

test("resolveNodeBoxes: small pies are found when the figure has none of the usual size", () =>
{
    // On an image this large the usual search asks for discs of 29 pixels or more.
    const image = createImage(3000, 2400);

    fill(image, 100, 1199, 2000, 1202, black);

    for (let node = 0; node < 6; node++)
    {
        const x = 400 + 250 * node;

        fill(image, x - 1, 1000, x + 2, 1400, black);
        drawPie(image, x, 1200, 14);
    }

    const result = resolveNodeBoxes(image);

    assert.equal(result.pies, 6);
    assert.ok(readLuminance(result.image, 407, 1207) > 250);
    assert.ok(readLuminance(result.image, 400, 1191) < 10);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import type { RgbaImage } from "../src/core/types.ts";
import { blankPictures, flattenFlatGrounds } from "../src/core/grounds.ts";

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
 * Sets one pixel.
 *
 * @param image - Image set in place.
 * @param x - Column.
 * @param y - Row.
 * @param color - Red, green and blue.
 */
function paint(image: RgbaImage, x: number, y: number, color: Array<number>): void
{
    const offset = 4 * (y * image.width + x);

    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
}

/**
 * Fills a rectangle with a texture of two colors in cells a few pixels across, as a
 * micrograph has.
 *
 * @param image - Image set in place.
 * @param x0 - Left column.
 * @param y0 - Top row.
 * @param x1 - Right column (exclusive).
 * @param y1 - Bottom row (exclusive).
 */
function paintTexture(image: RgbaImage, x0: number, y0: number, x1: number, y1: number): void
{
    for (let y = y0; y < y1; y++)
    {
        for (let x = x0; x < x1; x++)
        {
            const cell = (Math.floor(x / 7) * 31 + Math.floor(y / 5) * 17) % 5;

            paint(image, x, y, cell < 2 ? [120, 70, 40] : [230, 190, 120]);
        }
    }
}

/**
 * Fills a rectangle with one color.
 *
 * @param image - Image set in place.
 * @param x0 - Left column.
 * @param y0 - Top row.
 * @param x1 - Right column (exclusive).
 * @param y1 - Bottom row (exclusive).
 * @param color - Red, green and blue.
 */
function paintBlock(image: RgbaImage, x0: number, y0: number, x1: number, y1: number, color: Array<number>): void
{
    for (let y = y0; y < y1; y++)
    {
        for (let x = x0; x < x1; x++)
        {
            paint(image, x, y, color);
        }
    }
}

test("a textured picture in full color beside the figure is found and blanked", () =>
{
    const image = createImage(900, 600);
    paintTexture(image, 600, 100, 850, 400);
    const result = blankPictures(image, 40);

    assert.equal(result.grounds, 1);
    assert.ok(result.boxes !== undefined);
    const box = result.boxes[0];
    assert.ok(Math.abs(box.x0 - 600) <= 6 && Math.abs(box.x1 - 850) <= 6 && Math.abs(box.y0 - 100) <= 6 && Math.abs(box.y1 - 400) <= 6);
    // The middle of it is white afterwards.
    assert.equal(result.image.data[4 * (250 * 900 + 700)], 255);
    assert.equal(result.image.data[4 * (250 * 900 + 700) + 2], 255);
});

test("a flat colored band with black lines on it is no picture", () =>
{
    const image = createImage(900, 600);
    paintBlock(image, 100, 50, 800, 550, [140, 200, 90]);

    for (let row = 0; row < 12; row++)
    {
        paintBlock(image, 150, 80 + 38 * row, 700, 84 + 38 * row, [20, 20, 20]);
        paintBlock(image, 150, 80 + 38 * row, 156, 110 + 38 * row, [20, 20, 20]);
    }

    const result = blankPictures(image, 40);

    assert.equal(result.grounds, 0);
    assert.equal(result.image, image);
});

test("a textured block that branches run into from outside is left in", () =>
{
    const image = createImage(900, 600);
    paintTexture(image, 400, 100, 850, 500);

    // Three branches of a tree, each from well outside the block into it.
    for (const y of [180, 300, 420])
    {
        paintBlock(image, 100, y, 520, y + 4, [10, 10, 10]);
    }

    const result = blankPictures(image, 40);

    assert.equal(result.grounds, 0);
});

/**
 * Draws a clade's branches over a block: one line across it and two names' worth of strokes.
 *
 * @param image - Image set in place.
 * @param x0 - Left of the block.
 * @param y0 - Top of the block.
 * @param color - Color of the ink.
 */
function paintBranches(image: RgbaImage, x0: number, y0: number, color: Array<number>): void
{
    paintBlock(image, x0 + 20, y0 + 30, x0 + 300, y0 + 34, color);
    paintBlock(image, x0 + 20, y0 + 70, x0 + 300, y0 + 74, color);
    paintBlock(image, x0 + 20, y0 + 30, x0 + 24, y0 + 74, color);

    for (let x = x0 + 310; x < x0 + 420; x += 8)
    {
        paintBlock(image, x, y0 + 24, x + 4, y0 + 40, color);
        paintBlock(image, x, y0 + 64, x + 4, y0 + 80, color);
    }
}

test("a flat ground of muted color behind a clade is lifted to white, its ink to black", () =>
{
    const image = createImage(800, 500);

    paintBlock(image, 100, 100, 600, 220, [152, 166, 192]);
    paintBranches(image, 100, 100, [23, 37, 63]);

    const result = flattenFlatGrounds(image);

    assert.equal(result.grounds, 1);
    assert.ok(result.image.data[4 * (200 * 800 + 300)] >= 250);
    assert.ok(result.image.data[4 * (131 * 800 + 200)] <= 10);
    // Outside the ground nothing changes.
    assert.equal(result.image.data[4 * (300 * 800 + 300)], 255);
});

test("a ground in a strong color, or too light to pass for ink, is left as it is", () =>
{
    const strong = createImage(800, 500);

    paintBlock(strong, 100, 100, 600, 220, [22, 178, 224]);
    paintBranches(strong, 100, 100, [10, 10, 10]);

    assert.equal(flattenFlatGrounds(strong).image, strong);

    const light = createImage(800, 500);

    paintBlock(light, 100, 100, 600, 220, [225, 225, 215]);
    paintBranches(light, 100, 100, [10, 10, 10]);

    assert.equal(flattenFlatGrounds(light).image, light);
});

test("a flat block of muted color with nothing drawn on it is left as it is", () =>
{
    const image = createImage(800, 500);

    paintBlock(image, 100, 100, 600, 220, [152, 166, 192]);

    assert.equal(flattenFlatGrounds(image).image, image);
});

test("a ground cut into strips by many branches is lifted whole", () =>
{
    const image = createImage(2000, 1500);

    // One strip wide enough to begin a ground, then narrow ones between the branches.
    paintBlock(image, 100, 100, 700, 220, [178, 180, 182]);

    for (let x = 240; x < 700; x += 36)
    {
        paintBlock(image, x, 60, x + 4, 260, [10, 10, 10]);
    }

    const result = flattenFlatGrounds(image);

    assert.equal(result.grounds, 1);
    assert.ok(result.image.data[4 * (150 * 2000 + 620)] >= 250);
    assert.ok(result.image.data[4 * (150 * 2000 + 150)] >= 250);
    assert.ok(result.image.data[4 * (150 * 2000 + 241)] <= 10);
});

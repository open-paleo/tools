import { init, potrace } from "esm-potrace-wasm";

import type { RgbaImage } from "./outline-tracer.ts";

// Traces a black-on-white image into SVG with potrace, from its WebAssembly build. In Node, load
// it through node.ts instead.

let initialization: Promise<void> | undefined;

/**
 * Trace a black-on-white image into SVG with potrace.
 *
 * @param image - The image.
 * @param speckleArea - The area of the largest speck to drop, in pixels.
 * @returns The SVG.
 */
export async function traceWithPotrace(image: RgbaImage, speckleArea: number): Promise<string>
{
    initialization ??= init();
    await initialization;

    // The library reads only the pixels and size of an ImageData, so a plain image will do.
    return potrace(image as unknown as ImageData, {
        turdsize: speckleArea,
        turnpolicy: 4,
        alphamax: 1,
        opticurve: 1,
        opttolerance: 0.2,
        pathonly: false,
        extractcolors: false,
        posterizelevel: 2,
        posterizationalgorithm: 0,
    });
}

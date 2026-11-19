/**
 * The standalone page: mounts the viewer on the page's own element, with the worker built
 * beside it, Tesseract.js, its core and its language data served from node_modules by the
 * development server, and the known taxa shipped with the tool. Nothing comes from a CDN.
 * An ?image= query parameter names an image to load at once, a convenience for development.
 */

import type { OcrEngine } from "../core/types.ts";
import type { OrtLike } from "../ocr/paddle.ts";
import type { TesseractLike } from "../ocr/tesseract.ts";
import { createPaddleOcr } from "../ocr/paddle.ts";
import { mountTreeExtractor } from "./viewer.ts";

/**
 * Hands the viewer the Tesseract.js module the page's script tag loaded.
 *
 * @returns The module.
 */
function loadTesseract(): TesseractLike
{
    if (window.Tesseract === undefined)
    {
        throw new Error("Tesseract.js did not load; check your network connection.");
    }

    return window.Tesseract;
}

/**
 * Loads the PaddleOCR recognizer on ONNX Runtime for the page, from files this server holds:
 * `?second=<folder>` names a folder with `inference.onnx` and `dict.txt`.
 *
 * @param folder - Folder of the model, as a URL path.
 * @returns The engine.
 */
async function loadPaddleOcr(folder: string): Promise<OcrEngine>
{
    const runtime = new URL("/node_modules/onnxruntime-web/dist/", location.href).href;
    const ort = (await import(`${runtime}ort.wasm.min.mjs`)) as OrtWebModule;
    ort.env.wasm.wasmPaths = runtime;
    ort.env.wasm.numThreads = 1;
    const base = new URL(folder.endsWith("/") ? folder : `${folder}/`, location.href).href;
    const dictionary = await (await fetch(`${base}dict.txt`)).text();
    const started = performance.now();
    const engine = await createPaddleOcr(ort, `${base}inference.onnx`, dictionary);
    console.info(`tree-extractor: second OCR engine ready in ${Math.round(performance.now() - started)} ms`);

    return engine;
}

/**
 * The ONNX Runtime web module, with the settings used here.
 */
type OrtWebModule = OrtLike & {
    /**
     * Runtime settings.
     */
    env: OrtWebEnvironment;
};

/**
 * Runtime settings of ONNX Runtime web.
 */
type OrtWebEnvironment = {
    /**
     * Settings of the WebAssembly backend.
     */
    wasm: OrtWasmSettings;
};

/**
 * Settings of the WebAssembly backend.
 */
type OrtWasmSettings = {
    /**
     * Where the runtime's own files are served from.
     */
    wasmPaths: string;

    /**
     * Threads to use; one where the page is not cross-origin isolated.
     */
    numThreads: number;
};

const secondFolder = new URLSearchParams(location.search).get("second");

/**
 * Loads the second engine named in the page's address.
 *
 * @returns The engine.
 */
function loadSecondOcr(): Promise<OcrEngine>
{
    return loadPaddleOcr(secondFolder as string);
}

const container = document.querySelector<HTMLElement>("#app");

if (container === null)
{
    throw new Error("missing element #app");
}

mountTreeExtractor(container, {
    workerUrl: new URL("./worker.js", import.meta.url).href,
    loadTesseract,
    loadSecondOcr: secondFolder === null ? undefined : loadSecondOcr,
    tesseractPaths: {
        workerPath: new URL("/node_modules/tesseract.js/dist/worker.min.js", location.href).href,
        corePath: new URL("/node_modules/tesseract.js-core/", location.href).href,
        langPath: new URL("/node_modules/@tesseract.js-data/eng/4.0.0_best_int", location.href).href,
    },
    knownNames: new URL("../../names/known-taxa.txt", import.meta.url).href,
    knownClades: new URL("../../names/known-clades.txt", import.meta.url).href,
    image: new URLSearchParams(location.search).get("image") ?? undefined,
});

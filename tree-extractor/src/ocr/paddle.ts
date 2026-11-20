/**
 * Reads label crops with a PaddleOCR line recognizer (PP-OCRv5) on ONNX Runtime. The runtime
 * and the model are the caller's to supply, so the same engine serves the browser and Node.
 */

import type { GrayImage, OcrEngine, OcrResult } from "../core/types.ts";

/**
 * A tensor of numbers as ONNX Runtime returns it.
 */
export type OrtTensorLike = {
    /**
     * Size of each dimension.
     */
    dims: ReadonlyArray<number>;

    /**
     * The values, in row-major order.
     */
    data: ArrayLike<number>;
};

/**
 * Options for a session, of which only the logging level is set here.
 */
export type OrtSessionOptionsLike = {
    /**
     * Least severity the session logs: 0 verbose, 1 info, 2 warning, 3 error, 4 fatal.
     */
    logSeverityLevel?: 0 | 1 | 2 | 3 | 4;
};

/**
 * The part of an ONNX Runtime inference session used here.
 */
export type OrtSessionLike = {
    /**
     * Names of the model's inputs.
     */
    inputNames: ReadonlyArray<string>;

    /**
     * Names of the model's outputs.
     */
    outputNames: ReadonlyArray<string>;

    /**
     * Runs the model.
     *
     * @param feeds - Input tensors by name.
     * @returns Outputs by name. The runtime's own type allows values that are not tensors
     * of numbers, so the engine checks what it is given.
     */
    run(feeds: Record<string, never>): Promise<Record<string, unknown>>;

    /**
     * Frees the session.
     *
     * @returns Resolves when the session is released.
     */
    release(): Promise<unknown>;
};

/**
 * Creates inference sessions.
 */
export type OrtSessionFactoryLike = {
    /**
     * Loads a model.
     *
     * @param model - Where to fetch the model.
     * @param options - Session options.
     * @returns The session.
     */
    create(model: string, options?: OrtSessionOptionsLike): Promise<OrtSessionLike>;

    /**
     * Loads a model.
     *
     * @param model - The model's bytes.
     * @param options - Session options.
     * @returns The session.
     */
    create(model: Uint8Array, options?: OrtSessionOptionsLike): Promise<OrtSessionLike>;
};

/**
 * The part of the ONNX Runtime module used here (`onnxruntime-web` or `onnxruntime-node`).
 */
export type OrtLike = {
    /**
     * Session factory.
     */
    InferenceSession: OrtSessionFactoryLike;

    /**
     * Tensor constructor.
     */
    Tensor: new (type: "float32", data: Float32Array, dims: Array<number>) => unknown;
};

/**
 * Height the recognizer reads lines at, in pixels.
 */
const lineHeight = 48;

/**
 * Narrowest input the recognizer is given; a shorter line is padded on the right.
 */
const leastWidth = 320;

/**
 * Widest line the recognizer is given.
 */
const greatestWidth = 3200;

/**
 * Splits a PaddleOCR dictionary file, one character to a line, into the recognizer's classes:
 * the blank first, then the characters, then the space.
 *
 * @param text - Contents of the dictionary file.
 * @returns The character of each class.
 */
export function parsePaddleDictionary(text: string): Array<string>
{
    const characters = [""];

    for (const line of text.split(/\r?\n/))
    {
        if (line.length > 0)
        {
            characters.push(line);
        }
    }

    characters.push(" ");

    return characters;
}

/**
 * Scales a crop to the recognizer's line height, keeping its proportions, and writes it as
 * the three equal channels the model expects, normalized to -1..1 and padded on the right.
 *
 * @param image - The crop.
 * @returns The tensor values and the padded width.
 */
function prepareLine(image: GrayImage): PreparedLine
{
    const width = Math.max(16, Math.min(greatestWidth, Math.ceil(lineHeight * image.width / image.height)));
    const padded = Math.max(width, leastWidth);
    const plane = lineHeight * padded;
    const values = new Float32Array(3 * plane);
    const stepX = image.width / width;
    const stepY = image.height / lineHeight;

    for (let y = 0; y < lineHeight; y++)
    {
        const top = y * stepY;
        const bottom = Math.min(image.height, (y + 1) * stepY);

        for (let x = 0; x < width; x++)
        {
            const left = x * stepX;
            const right = Math.min(image.width, (x + 1) * stepX);
            const value = (averageArea(image, left, top, right, bottom) / 255 - 0.5) / 0.5;
            const at = y * padded + x;
            values[at] = value;
            values[plane + at] = value;
            values[2 * plane + at] = value;
        }
    }

    return { values, width: padded };
}

/**
 * A crop made ready for the recognizer.
 */
type PreparedLine = {
    /**
     * Tensor values, three planes of the line height by the width.
     */
    values: Float32Array;

    /**
     * Width of the tensor in pixels.
     */
    width: number;
};

/**
 * Averages the gray level over a rectangle with fractional edges; a rectangle narrower than a
 * pixel gives that pixel's level.
 *
 * @param image - Image.
 * @param left - Left edge.
 * @param top - Top edge.
 * @param right - Right edge.
 * @param bottom - Bottom edge.
 * @returns The mean gray level.
 */
function averageArea(image: GrayImage, left: number, top: number, right: number, bottom: number): number
{
    let sum = 0;
    let weight = 0;
    const lastX = Math.min(image.width - 1, Math.max(Math.floor(left), Math.ceil(right) - 1));
    const lastY = Math.min(image.height - 1, Math.max(Math.floor(top), Math.ceil(bottom) - 1));

    for (let y = Math.floor(top); y <= lastY; y++)
    {
        const tall = Math.max(1e-6, Math.min(bottom, y + 1) - Math.max(top, y));

        for (let x = Math.floor(left); x <= lastX; x++)
        {
            const wide = Math.max(1e-6, Math.min(right, x + 1) - Math.max(left, x));
            sum += image.data[y * image.width + x] * tall * wide;
            weight += tall * wide;
        }
    }

    return weight === 0 ? 255 : sum / weight;
}

/**
 * Tells whether a model output is a tensor of numbers with the three dimensions of a
 * recognizer's answer: batch, steps and classes.
 *
 * @param value - The output.
 * @returns Whether it can be decoded.
 */
function isNumberTensor(value: unknown): value is OrtTensorLike
{
    if (typeof value !== "object" || value === null || !("dims" in value) || !("data" in value))
    {
        return false;
    }

    return Array.isArray(value.dims) && value.dims.length === 3 && value.data instanceof Float32Array;
}

/**
 * Creates the engine.
 *
 * @param ort - The ONNX Runtime module.
 * @param model - The recognition model's bytes, or where the runtime fetches it.
 * @param dictionary - Contents of the model's dictionary file, one character to a line.
 * @returns The engine.
 */
export async function createPaddleOcr(ort: OrtLike, model: Uint8Array | string, dictionary: string): Promise<OcrEngine>
{
    // The model as published carries initializers no node uses, and the runtime warns of each
    // one when the session starts; only errors are logged.
    const options: OrtSessionOptionsLike = { logSeverityLevel: 3 };
    const session = typeof model === "string" ? await ort.InferenceSession.create(model, options) : await ort.InferenceSession.create(model, options);

    return new PaddleOcrEngine(ort, session, parsePaddleDictionary(dictionary));
}

/**
 * Joins two engines: the first reads every crop, and the second gives the second reading the
 * pipeline asks for where the first matched no name.
 *
 * @param first - The engine that reads everything.
 * @param second - The engine asked for a second reading.
 * @returns The joined engine.
 */
export function addSecondOpinion(first: OcrEngine, second: OcrEngine): OcrEngine
{
    return new SecondOpinionEngine(first, second);
}

/**
 * The PaddleOCR recognizer as an OCR engine.
 */
class PaddleOcrEngine implements OcrEngine
{
    private readonly ort: OrtLike;

    private readonly session: OrtSessionLike;

    private readonly characters: Array<string>;

    /**
     * @param ort - The ONNX Runtime module.
     * @param session - Session holding the recognition model.
     * @param characters - The character of each class.
     */
    public constructor(ort: OrtLike, session: OrtSessionLike, characters: Array<string>)
    {
        this.ort = ort;
        this.session = session;
        this.characters = characters;
    }

    /**
     * Reads one line: the most likely class at each step, with repeats and blanks dropped.
     *
     * @param image - The crop to read.
     * @returns The text, and the mean probability of its characters as a percentage.
     */
    public async recognize(image: GrayImage): Promise<OcrResult>
    {
        if (image.width < 4 || image.height < 4)
        {
            return { text: "", confidence: 0 };
        }

        const line = prepareLine(image);
        const input = new this.ort.Tensor("float32", line.values, [1, 3, lineHeight, line.width]);
        const feeds = { [this.session.inputNames[0]]: input } as Record<string, never>;
        const outputs = await this.session.run(feeds);
        const output = outputs[this.session.outputNames[0]];

        if (!isNumberTensor(output))
        {
            throw new Error("the recognition model did not return a tensor of numbers");
        }

        const steps = output.dims[1];
        const classes = output.dims[2];

        if (classes !== this.characters.length)
        {
            throw new Error(`the recognition model has ${classes} classes but its dictionary gives ${this.characters.length}`);
        }

        let text = "";
        let previous = 0;
        let sum = 0;
        let kept = 0;

        for (let step = 0; step < steps; step++)
        {
            let best = 0;
            let bestValue = -Infinity;

            for (let index = 0; index < classes; index++)
            {
                const value = output.data[step * classes + index];

                if (value > bestValue)
                {
                    bestValue = value;
                    best = index;
                }
            }

            if (best !== 0 && best !== previous)
            {
                text += this.characters[best];
                sum += bestValue;
                kept++;
            }

            previous = best;
        }

        return { text: text.trim(), confidence: kept === 0 ? 0 : Math.round(100 * sum / kept) };
    }

    /**
     * Releases the session.
     *
     * @returns Resolves when the session is released.
     */
    public async terminate(): Promise<void>
    {
        await this.session.release();
    }
}

/**
 * Two engines as one, the second answering only requests for a second reading.
 */
class SecondOpinionEngine implements OcrEngine
{
    private readonly first: OcrEngine;

    private readonly second: OcrEngine;

    /**
     * @param first - The engine that reads everything.
     * @param second - The engine asked for a second reading.
     */
    public constructor(first: OcrEngine, second: OcrEngine)
    {
        this.first = first;
        this.second = second;
    }

    /**
     * Reads a crop with the first engine.
     *
     * @param image - The crop to read.
     * @param kind - Whether a taxon name or a numeric support value is expected.
     * @returns The recognized text and confidence.
     */
    public recognize(image: GrayImage, kind: "text" | "digits"): Promise<OcrResult>
    {
        return this.first.recognize(image, kind);
    }

    /**
     * Reads a crop with the second engine.
     *
     * @param image - The crop to read.
     * @param kind - Whether a taxon name or a numeric support value is expected.
     * @returns The recognized text and confidence.
     */
    public recognizeAgain(image: GrayImage, kind: "text" | "digits"): Promise<OcrResult>
    {
        return this.second.recognize(image, kind);
    }

    /**
     * Releases both engines.
     *
     * @returns Resolves when both have shut down.
     */
    public async terminate(): Promise<void>
    {
        await this.first.terminate();
        await this.second.terminate();
    }
}

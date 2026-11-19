import { test } from "node:test";
import assert from "node:assert/strict";

import type { GrayImage } from "../src/core/types.ts";
import type { OrtLike, OrtSessionLike, OrtTensorLike } from "../src/ocr/paddle.ts";
import { addSecondOpinion, createPaddleOcr, parsePaddleDictionary } from "../src/ocr/paddle.ts";

/**
 * A tensor that only records what it was built from.
 */
class FakeTensor
{
    public readonly dims: Array<number>;

    public readonly data: Float32Array;

    public constructor(_: "float32", data: Float32Array, dims: Array<number>)
    {
        this.data = data;
        this.dims = dims;
    }
}

/**
 * Builds a runtime whose model answers with a fixed class at each step.
 *
 * @param steps - The class the model favors at each step.
 * @param classes - Number of classes.
 * @param seen - Receives the input tensors.
 * @returns The runtime.
 */
function createFakeRuntime(steps: Array<number>, classes: number, seen: Array<FakeTensor>): OrtLike
{
    const session: OrtSessionLike = {
        inputNames: ["x"],
        outputNames: ["y"],
        run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>
        {
            seen.push(feeds.x as FakeTensor);
            const data = new Float32Array(steps.length * classes);

            for (let step = 0; step < steps.length; step++)
            {
                data[step * classes + steps[step]] = 0.9;
            }

            return Promise.resolve({ y: { dims: [1, steps.length, classes], data } });
        },
        release: () => Promise.resolve(),
    };

    return { InferenceSession: { create: () => Promise.resolve(session) }, Tensor: FakeTensor };
}

const crop: GrayImage = { width: 96, height: 24, data: new Uint8ClampedArray(96 * 24).fill(255) };

test("parsePaddleDictionary puts the blank first and the space last", () =>
{
    assert.deepEqual(parsePaddleDictionary("a\nb\r\n#\n"), ["", "a", "b", "#", " "]);
});

test("the recognizer drops blanks and repeats, and keeps a letter doubled across a blank", async () =>
{
    const seen = new Array<FakeTensor>();
    // a a _ a b _ space b
    const engine = await createPaddleOcr(createFakeRuntime([1, 1, 0, 1, 2, 0, 3, 2], 4, seen), "model", "a\nb\n");
    const result = await engine.recognize(crop, "text");
    assert.equal(result.text, "aab b");
    assert.equal(result.confidence, 90);
    // 96 by 24 scales to 192 by 48 and is padded to the least width.
    assert.deepEqual(seen[0].dims, [1, 3, 48, 320]);
    assert.equal(seen[0].data[0], 1, "white is 1 after normalizing");
    assert.equal(seen[0].data[200], 0, "the padding is the middle gray");
});

test("a dictionary that does not fit the model is refused", async () =>
{
    const engine = await createPaddleOcr(createFakeRuntime([1], 9, []), "model", "a\nb\n");
    await assert.rejects(engine.recognize(crop, "text"), /classes/);
});

test("addSecondOpinion keeps each engine to its own reading", async () =>
{
    const first = await createPaddleOcr(createFakeRuntime([1], 4, []), "model", "a\nb\n");
    const second = await createPaddleOcr(createFakeRuntime([2], 4, []), "model", "a\nb\n");
    const joined = addSecondOpinion(first, second);
    assert.equal((await joined.recognize(crop, "text")).text, "a");
    assert.ok(joined.recognizeAgain !== undefined);
    assert.equal((await joined.recognizeAgain(crop, "text")).text, "b");
});

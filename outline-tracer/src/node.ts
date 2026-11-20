import { createRequire } from "node:module";
import * as path from "node:path";
import * as url from "node:url";

import type { BitmapTracer } from "./outline-tracer.ts";

// Loads potrace under Node, where its WebAssembly loader expects CommonJS's require and
// __dirname.

/**
 * Load potrace under Node.
 *
 * @returns The tracer.
 */
export async function loadNodeTracer(): Promise<BitmapTracer>
{
    globalThis.require ??= createRequire(import.meta.url);
    globalThis.__dirname ??= path.dirname(url.fileURLToPath(import.meta.url));

    const potraceModule = await import("./potrace.ts");

    return potraceModule.traceWithPotrace;
}

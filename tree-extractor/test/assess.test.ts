import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractionDocument, NameMatch, Tip } from "../src/core/types.ts";
import { assessReading } from "../src/core/assess.ts";

const accepted: NameMatch = { name: "Aus bus", similarity: 1, margin: 1, accepted: true, source: "list" };

/**
 * Builds a document with one node that holds some named and some unnamed tips, and some tips
 * joined to nothing.
 *
 * @param named - Tips in the tree with an accepted name.
 * @param unnamed - Tips in the tree without one.
 * @param loose - Tips joined to nothing.
 * @param rows - Rows of text that look like labels and belong to no tip.
 * @returns The document.
 */
function buildDocument(named: number, unnamed: number, loose: number, rows: number): ExtractionDocument
{
    const tips = new Array<Tip>();

    for (let index = 0; index < named + unnamed + loose; index++)
    {
        const joined = index < named + unnamed;
        tips.push({ id: `t${index + 1}`, x: 100, y: 10 * index, parent: joined ? "n1" : null, textLine: null, label: index < named ? "Aus bus" : null, match: index < named ? accepted : null, source: "traced", age: null } as Tip);
    }

    const children = new Array<string>();

    for (const tip of tips)
    {
        if (tip.parent !== null)
        {
            children.push(tip.id);
        }
    }

    const textLines = new Array<unknown>();

    for (let index = 0; index < rows; index++)
    {
        textLines.push({ id: `l${index + 1}`, box: { x0: 0, y0: 0, x1: 50, y1: 10 }, glyphCount: 10, role: "unassigned", ocr: null });
    }

    return { tips, nodes: [{ id: "n1", x: 0, y0: 0, y1: 100, parent: null, children, textLine: null, label: null, source: "traced", age: null }], root: children.length > 0 ? "n1" : null, textLines, qc: [] } as unknown as ExtractionDocument;
}

test("a reading that named its tips and joined them stands", () =>
{
    assert.equal(assessReading(buildDocument(20, 1, 1, 3), true, true), null);
});

test("a reading is doubted for few tips, few names, loose tips or unused labels", () =>
{
    assert.match(assessReading(buildDocument(2, 0, 0, 0), true, true)?.message ?? "", /only 2 tip/);
    assert.match(assessReading(buildDocument(5, 15, 0, 0), true, true)?.message ?? "", /only 5 of the tree's 20 tips match a name/);
    // Unlabelled ends in a tree that names most of its tips are stray marks.
    assert.equal(assessReading(buildDocument(12, 8, 0, 0), true, true), null);
    assert.equal(assessReading(buildDocument(10, 0, 10, 0), true, true), null);
    assert.match(assessReading(buildDocument(10, 0, 10, 0), true, false)?.message ?? "", /10 of the 20 tips with a name are not joined/);
    assert.match(assessReading(buildDocument(8, 2, 0, 12), true, true)?.message ?? "", /12 row\(s\) of text/);
    assert.match(assessReading(buildDocument(0, 0, 0, 0), true, true)?.message ?? "", /no tree was found/);
});

test("without a list or without reading labels, names do not count against a reading", () =>
{
    assert.equal(assessReading(buildDocument(0, 20, 0, 0), true, false), null);
    assert.match(assessReading(buildDocument(0, 20, 0, 0), false, true)?.message ?? "", /have a label/);
});

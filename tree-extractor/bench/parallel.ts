/**
 * Runs the benchmark over several processes and joins their output into one report.
 * Takes the arguments of `bench/run.ts`, and --jobs=N for the number of processes.
 */

import * as childProcess from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";

/**
 * What one share of the run printed and how it ended.
 */
type ShardOutput = {
    /**
     * Everything the process wrote to standard output.
     */
    text: string;

    /**
     * Exit code of the process.
     */
    code: number;
};

/**
 * The parts of one share's report.
 */
type ShardReport = {
    /**
     * The per-case sections.
     */
    details: string;

    /**
     * Rows of the table of cases without a gold tree.
     */
    coldRows: Array<string>;

    /**
     * Rows of the summary table.
     */
    rows: Array<string>;
};

const coldHeading = "cold run (no gold tree)";
const summaryHeading = "case ";
const regressionMark = "<-- expected identical";

/**
 * Runs one share of the cases.
 *
 * @param script - Path of the benchmark script.
 * @param passed - Arguments to pass on.
 * @param index - Which share.
 * @param count - Number of shares.
 * @returns What the process printed and its exit code.
 */
function runShard(script: string, passed: Array<string>, index: number, count: number): Promise<ShardOutput>
{
    function start(resolve: (output: ShardOutput) => void): void
    {
        const child = childProcess.spawn(process.execPath, ["--experimental-strip-types", script, ...passed, `--shard=${index}/${count}`], { stdio: ["ignore", "pipe", "inherit"] });
        const chunks = new Array<Buffer>();

        function keepChunk(chunk: Buffer): void
        {
            chunks.push(chunk);
        }

        function finish(code: number | null): void
        {
            resolve({ text: Buffer.concat(chunks).toString("utf8"), code: code ?? 1 });
        }

        child.stdout.on("data", keepChunk);
        child.on("close", finish);
    }

    return new Promise<ShardOutput>(start);
}

/**
 * Takes one share's report apart: its per-case sections, and the rows of its two tables.
 *
 * @param text - What the share printed.
 * @returns The parts.
 */
function readReport(text: string): ShardReport
{
    const lines = text.split("\n");
    const report: ShardReport = { details: "", coldRows: [], rows: [] };
    let summaryAt = lines.length;

    for (let index = lines.length - 1; index >= 0; index--)
    {
        if (lines[index].startsWith(summaryHeading) && lines[index].includes("identical"))
        {
            summaryAt = index;
            break;
        }
    }

    let coldAt = summaryAt;

    for (let index = 0; index < summaryAt; index++)
    {
        if (lines[index].startsWith(coldHeading))
        {
            coldAt = index;
        }
    }

    // The blank line before each table belongs to the table.
    const detailEnd = Math.min(coldAt, summaryAt);
    report.details = lines.slice(0, detailEnd).join("\n").replace(/\n+$/, "");

    for (let index = coldAt + 1; index < summaryAt; index++)
    {
        if (lines[index].trim().length > 0)
        {
            report.coldRows.push(lines[index]);
        }
    }

    for (let index = summaryAt + 1; index < lines.length; index++)
    {
        // The table ends at the blank line before the note on cases no longer identical.
        if (lines[index].trim().length === 0)
        {
            break;
        }

        report.rows.push(lines[index]);
    }

    return report;
}

/**
 * Reads the case name at the start of a table row.
 *
 * @param row - The row.
 * @returns The name.
 */
function readCaseName(row: string): string
{
    return row.split(/\s+/)[0];
}

/**
 * Orders table rows by case name.
 *
 * @param left - First row.
 * @param right - Second row.
 * @returns Negative when the first comes first.
 */
function compareRows(left: string, right: string): number
{
    return readCaseName(left) < readCaseName(right) ? -1 : readCaseName(left) > readCaseName(right) ? 1 : 0;
}

const benchDir = path.dirname(url.fileURLToPath(import.meta.url));
const script = path.join(benchDir, "run.ts");
const passed = new Array<string>();
let jobs = Math.max(1, Math.min(8, os.availableParallelism() - 1));

for (const argument of process.argv.slice(2))
{
    if (argument.startsWith("--jobs="))
    {
        jobs = Math.max(1, Number(argument.slice("--jobs=".length)) || 1);
    }
    else
    {
        passed.push(argument);
    }
}

const running = new Array<Promise<ShardOutput>>();

for (let index = 0; index < jobs; index++)
{
    running.push(runShard(script, passed, index, jobs));
}

const outputs = await Promise.all(running);
const coldRows = new Array<string>();
const rows = new Array<string>();
let failed = false;

for (const output of outputs)
{
    const report = readReport(output.text);
    failed = failed || output.code !== 0;

    if (report.details.length > 0)
    {
        console.log(report.details);
    }

    coldRows.push(...report.coldRows);
    rows.push(...report.rows);
}

if (coldRows.length > 0)
{
    console.log("");
    console.log(coldHeading.padEnd(32), "in tree".padStart(9), "found".padStart(7), "matched".padStart(9), "warn".padStart(6), "error".padStart(6));

    for (const row of coldRows.sort(compareRows))
    {
        console.log(row);
    }
}

console.log("");
console.log("case".padEnd(32), "tips".padStart(9), "named".padStart(9), "splits".padStart(11), "extra".padStart(6), "profile".padStart(8), " identical");
const regressions = new Array<string>();

for (const row of rows.sort(compareRows))
{
    console.log(row);

    if (row.includes(regressionMark))
    {
        regressions.push(readCaseName(row));
    }
}

if (regressions.length > 0 && passed.includes("--strict"))
{
    console.log(`\n${regressions.length} case(s) expected identical are not: ${regressions.join(", ")}`);
}

if (failed)
{
    process.exitCode = 1;
}

/**
 * The extraction pipeline: image in, extraction document out. Pure apart from the injected OCR
 * engine, so it runs in Node and in the browser alike.
 */

import type { Box, ExtractionDocument, GrayImage, Mask, OcrEngine, Orientation, ProfileOverrides, ProgressReporter, QcIssue, RgbaImage, Segment, TextLine, Tip, TreeNode } from "./types.ts";
import { applyProfileOverrides, createEmptyProfile, measureProfile, measureTextMarks } from "./profile.ts";
import { checkTipAlignment, recoverAlignedTips } from "./alignment.ts";
import { dropLooseTips, pruneDecorations } from "./decorations.ts";
import { assignPixelLengths, chooseRoot, pruneDegenerateNodes, refreshDisconnectedIssues } from "./tree.ts";
import { detectOrientation } from "./orientation.ts";
import { detectSlantedLabels } from "./slant.ts";
import { traceSlantedTree } from "./slanted.ts";
import type { SlantedLabels } from "./slant.ts";
import type { OrientationFind } from "./orientation.ts";
import { assignAges, calibrateAxis } from "./timescale.ts";
import type { ChartStripFind } from "./markers.ts";
import { bridgeUnderLettering, bridgeUnderShapes, createColoredMask, findBranchMarks, findMarkChains, extendTipsThroughMarkers, keepColoredLines, findFatShapes, findOffColorLines, findNodeDiscs, joinThroughNumbers, keepSmallShapes, measureInkShare, paintCrosses, removeChartLines, removeChartStrips, removeFrameSegments, splitColoredInk } from "./markers.ts";
import { applyHysteresis, closeMask, invertMask, compareNumbers, convertToGray, createDarkMask, createDirectionalRunMask, createLongRunMask, dilate, erode, estimateBackground, estimateLineThickness, keepComponentsTouching, paintMask, rotateRgbaQuarter, subtractMask, unionMask, measureThinInkLuminance, computeMedian, createMaskFromComponents, findConnectedComponents, reduceRgba, enlargeRgba, keepComponentsWithin, transposeMask } from "./raster.ts";
import { detectTextLines } from "./text-lines.ts";
import { dropCrossedRules, drawHollowBars, mergeHollowBars, dropCrossingStrokes, dropInsets, partAtCrossings, squareRoundedCorners, extractSegments, findMarkerStubs, findShortConnectors, splitJoggedVerticals, trimBranchesAtCorners, findBarBranches } from "./segments.ts";
import { traceRectangularTree } from "./tracer.ts";
import { assignLabels, readLabels, isCladeName, isHigherTaxonName, restoreCladeNames } from "./labels.ts";
import { getTipDisplayName } from "./newick.ts";
import { assignBoxedNames } from "./clade-boxes.ts";
import { assessReading } from "./assess.ts";
import { eraseDottedLines, fillHatchedBars, joinDashedLines } from "./dots.ts";
import { eraseScaleRules } from "./rules.ts";
import { flattenWedges } from "./wedges.ts";
import { joinWrappedBranches, recoverElbowTips } from "./elbows.ts";
import { blankPictures, clearDarkGrounds, flattenGrayBands } from "./grounds.ts";
import { straightenForks } from "./forks.ts";
import { resolveStaircases } from "./staircase.ts";
import { normalizeName, scoreName } from "./matching.ts";
import { clampBox, cropImage, rotateBox, scaleDocument, translateDocument } from "./geometry.ts";
import { deleteTip } from "./edit.ts";

/**
 * Tunable thresholds for the pipeline. Defaults suit figures around 1000 to 2500 pixels wide.
 */
export type Parameters = {
    /**
     * Luminance below which a pixel is certainly text ink.
     */
    inkThreshold: number;

    /**
     * Luminance below which a pixel is text ink if it touches certain text ink. Reconnects the
     * hairlines of thin fonts, which break into fragments at the strict threshold.
     */
    inkThresholdWeak: number;

    /**
     * Glyph height, in pixels, at or below which text counts as small and gets the weak text
     * threshold regardless of fragmentation.
     */
    smallGlyphHeight: number;

    /**
     * Luminance below which a pixel is line ink. Higher than the text threshold so that faint,
     * antialiased thin lines stay continuous.
     */
    lineThreshold: number;

    /**
     * Luminance below which a pixel may be line ink if it touches certain line ink. Bridges the
     * faint stretches that compression leaves in thin lines.
     */
    lineThresholdWeak: number;

    /**
     * Radius of the morphological close that mends broken thin lines.
     */
    closeRadius: number;

    /**
     * Largest RGB channel spread still treated as black rather than colored.
     */
    maxChroma: number;

    /**
     * Largest channel spread for weak line ink. Tighter than maxChroma because a faint stretch
     * of a black line is gray, while a pastel clade box can be nearly as light and nearly as
     * neutral.
     */
    weakMaxChroma: number;

    /**
     * How far, in pixels, weak ink may lie from certain line ink. A faint gap in a line is a
     * few pixels from certain ink on both sides; a pastel fill stretches far from any line and
     * must not be flooded.
     */
    weakReach: number;

    /**
     * Shortest horizontal run stripped before glyph detection.
     */
    glyphStripHorizontalRun: number;

    /**
     * Shortest vertical run stripped before glyph detection.
     */
    glyphStripVerticalRun: number;

    /**
     * Shortest horizontal run that counts as a branch.
     */
    minHorizontalRun: number;

    /**
     * Shortest vertical run that counts as a node connector. Raised automatically to clear the
     * thickness of the horizontals, so thick branches cannot read as short connectors.
     */
    minVerticalRun: number;

    /**
     * Attachment tolerance in pixels, or null to derive it from line thickness.
     */
    attachTolerance: number | null;

    /**
     * How far, in glyph heights, a branch end may sit from its vertical and still be joined.
     * Covers the gap a support label's white background box cuts into a line.
     */
    labelReach: number;

    /**
     * Upscaling factor for OCR crops.
     */
    ocrScale: number;

    /**
     * Glyph height in pixels that label crops are scaled towards before OCR; the scale never
     * exceeds ocrScale or drops under one.
     */
    ocrGlyphTarget: number;

    /**
     * Rows above this are ignored by text detection.
     */
    textMinY: number;

    /**
     * Luminance below which a colored pixel counts as dark enough to be a line or a marker.
     */
    coloredThreshold: number;

    /**
     * Chroma a dark pixel must exceed to count as colored ink; JPEG fringes along black lines
     * on tinted backgrounds stay below it.
     */
    coloredMinChroma: number;

    /**
     * Half-width of the erosion that tells a fat colored shape from a thin colored line.
     */
    markerRadius: number;

    /**
     * Whether to add the short connectors between close verticals of a pectinate tree.
     */
    shortConnectors: boolean;

    /**
     * Whether a tip's end moves through a solid shape or a colored marker it touches.
     */
    extendThroughShapes: boolean;

    /**
     * Share of a gap's columns that must hold ink before two collinear pieces are joined.
     */
    gapInkShare: number;

    /**
     * Whether to detect a tree drawn on its side and turn it ("auto"), to take the image as
     * it is ("none"), or to take the tree as standing a given way.
     */
    rotation: "auto" | "none" | "root-bottom" | "root-top";

    /**
     * Paint a cross through filled node discs so that the branches they cover connect.
     */
    nodeDiscs: boolean;

    /**
     * Raise the ink thresholds for a figure drawn in gray, so that its lines and letters count
     * as ink.
     */
    adaptiveInk: boolean;

    /**
     * Whether to drop a stage chart along the top or bottom edge before tracing.
     */
    chartStrips: boolean;

    /**
     * Whether tips extend through shapes in any pale tint, such as light range bars.
     */
    paleMarkers: boolean;

    /**
     * Read a slanted figure from the skeleton of its line art.
     */
    slantedTrees: boolean;

    /**
     * Drop short unlabelled tips as debris; off, they stay, for seeing what the trace found.
     */
    dropDebris: boolean;

    /**
     * Look for tip labels set at a slant and read them in a level frame.
     */
    slantedLabels: boolean;

    /**
     * Smallest label slant in degrees that gets a level frame.
     */
    minLabelSlant: number;

    /**
     * Profile values fixed by the caller instead of measured.
     */
    profileOverrides: ProfileOverrides;
};

/**
 * Least half-breadth, in pixels, of the widest ink the background estimate looks past.
 */
const backgroundRadius = 5;

/**
 * Gray levels by which faint ink must be darker than its background.
 */
const faintContrast = 12;

/**
 * Default thresholds.
 */
export const defaultParameters: Parameters = {
    inkThreshold: 140,
    inkThresholdWeak: 200,
    smallGlyphHeight: 7,
    lineThreshold: 180,
    lineThresholdWeak: 230,
    closeRadius: 1,
    maxChroma: 40,
    weakMaxChroma: 40,
    weakReach: 3,
    glyphStripHorizontalRun: 28,
    glyphStripVerticalRun: 20,
    minHorizontalRun: 10,
    minVerticalRun: 6,
    attachTolerance: null,
    labelReach: 6,
    ocrScale: 3,
    ocrGlyphTarget: 45,
    textMinY: 0,
    coloredThreshold: 150,
    coloredMinChroma: 100,
    markerRadius: 4,
    shortConnectors: false,
    extendThroughShapes: true,
    gapInkShare: 0.4,
    rotation: "auto",
    nodeDiscs: true,
    adaptiveInk: true,
    chartStrips: true,
    paleMarkers: true,
    slantedTrees: true,
    dropDebris: true,
    slantedLabels: true,
    minLabelSlant: 6,
    profileOverrides: {},
};

/**
 * Inputs to one extraction run.
 */
export type ExtractOptions = {
    /**
     * OCR engine, or null to skip label reading.
     */
    ocr: OcrEngine | null;

    /**
     * Closed list of names to match tip labels against; empty to skip matching.
     */
    names: Array<string>;

    /**
     * Known taxa of the whole data set, matched as a second tier after the names; empty to
     * skip.
     */
    knownNames?: Array<string>;

    /**
     * Known clades of the data set, for mending the spelling of clade names read at nodes, on
     * shaded boxes and at tips that are collapsed clades; empty to skip.
     */
    knownClades?: Array<string>;

    /**
     * Threshold overrides.
     */
    parameters: Partial<Parameters>;

    /**
     * Where the image came from, recorded in the document.
     */
    source: string | null;

    /**
     * Part of the image to analyze, or null for all of it. Results are reported in the full
     * image's coordinates either way.
     */
    region: Box | null;

    /**
     * Areas of the image to leave out: each is painted white before anything is read, so a
     * pie chart, a legend or a silhouette beside the tree leaves no ink to trace.
     */
    exclude?: Array<Box>;

    /**
     * Whether to look for pictures beside the tree and leave them out as well. False when
     * the caller has settled the areas to leave out: the ones the extractor found on an
     * earlier run, as a person has since moved or removed them.
     */
    findPictures?: boolean;

    /**
     * Receives stage progress, or null.
     */
    progress: ProgressReporter | null;
};

/**
 * Intermediate rasters shared by the pipeline and by diagnostics.
 */
export type PreparedMasks = {
    /**
     * Luminance image.
     */
    gray: GrayImage;

    /**
     * Dark pixels at the text threshold.
     */
    textInk: Mask;

    /**
     * The text ink as the segment extractor measures run thickness on it: widened with all
     * the faint ink, pale fills included.
     */
    runInk: Mask;

    /**
     * Dark neutral pixels at the line threshold, mended, with glyphs removed.
     */
    lineInk: Mask;

    /**
     * Glyph pixels from the rough text pass.
     */
    glyphMask: Mask;

    /**
     * Fat colored shapes: range ovals, markers and fills, kept out of the line ink.
     */
    markers: Mask;

    /**
     * Fat shapes in any tint, however pale: the light green and pink range bars of a time tree
     * are too light for the ink masks and too neutral for the colored one, yet a branch ends at
     * one and its label lies beyond it.
     */
    paleMarkers: Mask;

    /**
     * Ink known for line in a figure with thick colored branches: the colored lines, the
     * stretches drawn back under lettering, and dark ink as thick as the colored lines; null
     * in any other figure.
     */
    knownLines: Mask | null;

    /**
     * Whether the strict text threshold broke letters into fragments.
     */
    fragmented: boolean;

    /**
     * Whether the text ink was widened by hysteresis.
     */
    widened: boolean;

    /**
     * Glyph height from the rough text pass.
     */
    glyphHeight: number;

    /**
     * Text lines from the rough pass, used to reject line art that lies inside a row of text.
     */
    roughLines: Array<TextLine>;
};

/**
 * Builds the masks the tracer works from.
 *
 * @param image - Decoded RGBA image.
 * @param parameters - Thresholds.
 * @param rowsFarApart - Whether the labels are known to stand far apart, so that their
 *   spacing sets no floor for the letter height.
 * @returns The masks and the glyph height.
 */
export function prepareMasks(image: RgbaImage, parameters: Parameters, rowsFarApart = false): PreparedMasks
{
    const gray = convertToGray(image);
    let textInk = createDarkMask(image, parameters.inkThreshold, false, parameters.maxChroma);
    // Lines drawn in color join the line ink; colored markers and fills stay out of it and are
    // kept aside, since a tip's branch may end at one and its label lie beyond it.
    // Branches drawn in color can be thicker than a marker radius (Wu 2015's ten-pixel subgenus
    // branches), and would then pass for markers; the colored ink's own line thickness sets the
    // radius that tells a marker from a line.
    const properThickness = estimateLineThickness(createColoredMask(image, parameters.coloredThreshold, parameters.coloredMinChroma));
    // A figure may draw its thick colored branches only in colors the main rule leaves out: a
    // vivid light green, and dark greens of little chroma (Pei 2020, lines 9 pixels thick).
    // The thickness of the level stretches of ink of any color then stands in, when it is two
    // to three and a half marker radii: thicker, it is that of fills and bands. Of the long
    // level runs only, since the soft edges of lettering are colored ink too and outnumber
    // any line.
    // And of its upright stretches as well, which must be as thick: the bars of ranges in a
    // time tree are level stretches of color of just that thickness, and nothing upright
    // (Dieudonne 2026). Not where the main rule's ink is itself nearly thick enough: its own
    // measure is the better one (Cau 2018, 7 pixels).
    const anyColor = properThickness >= 1.5 * parameters.markerRadius ? null : createColoredMask(image, 240, 70);
    const levelThickness = anyColor === null ? 0 : estimateLineThickness(createDirectionalRunMask(anyColor, 40, true));
    const uprightThickness = anyColor === null ? 0 : estimateLineThickness(transposeMask(createDirectionalRunMask(anyColor, 40, false)));
    const thickAnyColor = levelThickness >= 2 * parameters.markerRadius && levelThickness <= 3.5 * parameters.markerRadius && Math.abs(uprightThickness - levelThickness) <= 2;
    const coloredThickness = thickAnyColor ? levelThickness : properThickness;
    const markerRadius = coloredThickness >= 2 * parameters.markerRadius ? Math.round(coloredThickness) + 1 : parameters.markerRadius;
    const colored = splitColoredInk(image, parameters.coloredThreshold, parameters.coloredMinChroma, markerRadius);
    // A colored ground is pale and fat all over, and is no marker: with it in the mask every
    // glyph lies on a marker that goes on all around, and a range bar before a label can no
    // longer be told from a letter on a panel (Foth 2017, drawn on yellow).
    const paleMarkers = dropGround(findFatShapes(createColoredMask(image, 235, 30), parameters.markerRadius));
    // Row boxes leave out glyphs lying on these, so a range bar beside a label neither starts
    // the row nor clips the branch that runs into it.
    const roughMarkers = unionMask(colored.fat, paleMarkers);
    // Of the thin colored ink only what is drawn as lines joins the line ink: an arrowhead
    // touching the tree is thin and colored too.
    const thickColor = coloredThickness >= 1.5 * parameters.markerRadius;
    // Where the colored lines are thick, black lettering printed on a colored or a gray line
    // hides the line; the stretches under the letters are drawn back first, or the pieces of
    // line between the letters are too short to count as line.
    const underLettering = thickColor ? bridgeUnderLettering(image, parameters.lineThreshold, parameters.maxChroma, coloredThickness) : null;
    const coloredLines = keepColoredLines(underLettering === null ? colored.thin : unionMask(colored.thin, underLettering), 6 * markerRadius);
    const darkInk = createDarkMask(image, parameters.lineThreshold, true, parameters.maxChroma);
    // Lines in a muted or a vivid light color join the line ink too, unless they run along a
    // filled shape: a range bar's darker edge is such a stroke (Wang 2025).
    const offColorStrokes = findOffColorLines(image, parameters.coloredThreshold, parameters.coloredMinChroma, markerRadius, colored.thin);
    // Where the figure's colored lines are themselves thick, a shape is filled only if it is
    // thicker still.
    const filled = markerRadius === parameters.markerRadius ? roughMarkers : unionMask(colored.fat, findFatShapes(createColoredMask(image, 235, 30), markerRadius));
    // Along it, not merely up to it: a tree drawn in such a color whose every branch ends at
    // a range bar touches a filled shape at each tip, and is one stroke (Dieudonne 2020). An
    // edge lies beside its bar for its whole length.
    const offColorLines = subtractMask(offColorStrokes, keepComponentsWithin(offColorStrokes, dilate(filled, 2), 0.3));
    // A small filled shape set on a branch, an icon that says where a clade lived, hides the
    // branch for its own width; the branch is carried under it as under an arrowhead (Arbour
    // 2015, a continent on each of two stems). Shapes up to a twelfth of the image's shorter
    // side: a larger one is a clade's box or a drawing.
    const icons = keepSmallShapes(unionMask(colored.fat, paleMarkers), Infinity, Math.round(Math.min(image.width, image.height) / 12));
    const underShapes = unionMask(bridgeUnderShapes(darkInk, subtractMask(colored.thin, coloredLines), 2), bridgeUnderShapes(darkInk, icons, 3, 6 * markerRadius));
    // A figure that draws its branches in thick color may draw some in a light one, yellow or
    // pink, too light to count as colored ink. Where the colored lines are thick, light
    // colored strokes of their thickness that join the tree are branches as well (Motta 2025,
    // a clade in green and two tips in yellow and pink).
    // Where the lines are thin, only a soft color of middling luminance is taken so: a green
    // or a blue neither dark nor vivid (Dieudonne 2020, a clade in a green of luminance 151).
    // The lighter tints are those of bands and boxes, whose edges are as thin as the lines.
    // And only a stroke twenty thicknesses long: a colored word or the bar of a collapsed
    // clade is a stroke of the right tone too (Gonzalez Riga 2018, Qiu 2025).
    const softThickness = Math.max(coloredThickness, estimateLineThickness(darkInk));
    const lightBranches = thickColor
        ? findLightBranches(image, unionMask(unionMask(darkInk, coloredLines), offColorLines), createColoredMask(image, parameters.coloredThreshold, parameters.coloredMinChroma), coloredThickness)
        : findLightBranches(image, unionMask(unionMask(darkInk, coloredLines), offColorLines), createColoredMask(image, parameters.coloredThreshold, parameters.coloredMinChroma), softThickness, softLuminance, 20 * softThickness);
    const tracedInk = unionMask(unionMask(darkInk, coloredLines), offColorLines);
    const drawnInk = underLettering === null ? tracedInk : unionMask(tracedInk, underLettering);
    const strongInk = unionMask(lightBranches === null ? drawnInk : unionMask(drawnInk, lightBranches), underShapes);

    // A rough text pass learns the glyph size and finds glyph pixels to keep out of the line art.
    // The runs stripped as line art must be longer than a letter stroke, so when the first pass
    // finds large glyphs the strip is scaled up and the pass repeated.
    let stripHorizontal = parameters.glyphStripHorizontalRun;
    let stripVertical = parameters.glyphStripVerticalRun;
    let roughStrip = dilate(createLongRunMask(textInk, stripHorizontal, stripVertical), 1);
    let rough = detectTextLines(textInk, { lineArtMask: roughStrip, minY: parameters.textMinY, markerMask: roughMarkers, rowsFarApart });

    for (let pass = 0; pass < 6 && (2.3 * rough.glyphHeight > stripHorizontal || 1.7 * rough.glyphHeight > stripVertical); pass++)
    {
        stripHorizontal = Math.max(stripHorizontal, Math.round(2.3 * rough.glyphHeight));
        stripVertical = Math.max(stripVertical, Math.round(1.7 * rough.glyphHeight));
        roughStrip = dilate(createLongRunMask(textInk, stripHorizontal, stripVertical), 1);
        rough = detectTextLines(textInk, { lineArtMask: roughStrip, minY: parameters.textMinY, markerMask: roughMarkers, rowsFarApart });
    }

    // A thin font breaks into fragments at the strict threshold, and very small text always
    // loses strokes to it. Fainter pixels that touch certain text ink then rejoin the strokes.
    // Bold text at normal sizes is left alone, since its halo would merge letters and rows.
    // A profile override settles the question either way.
    const fragmented = rough.fragmented;
    let widened = parameters.profileOverrides.widenText ?? (fragmented || rough.glyphHeight <= parameters.smallGlyphHeight);
    let runInk: Mask | null = null;

    if (widened)
    {
        const plainInk = textInk;
        const plainStrip = roughStrip;
        const plainRough = rough;
        // Only strokes may rejoin: a pale band or fill behind the labels is faint ink too, and
        // would flood into the text ink and dissolve every label standing on it (Longrich 2011).
        const faint = createDarkMask(image, parameters.inkThresholdWeak, false, parameters.maxChroma);
        // A fill is a fat piece of the faint ink, thicker than a stroke and at least six glyphs
        // one way, that is mostly not certain ink: a pale band, where a thick black bar, which
        // is fat and large too, is certain ink through and through.
        const unfilled = subtractMask(faint, findPaleFills(faint, textInk, Math.max(4, Math.round(rough.glyphHeight / 3)), 6 * rough.glyphHeight));
        // A band whose level lies at the weak threshold is faint in speckles, which no test
        // for a fill catches; they joined the letters standing on it into one blob, and each
        // label began where the band ended (Otero 2015: "anosaurus" for Jingshanosaurus). A
        // stroke is darker than what surrounds it, and a speckle of the band is not.
        const faintStrokes = keepDarkerThanSurround(unfilled, gray, estimateBackground(gray, Math.max(backgroundRadius, Math.round(rough.glyphHeight / 3))), faintContrast);
        // The extractor measures line width on this ink, and figures with thick range bars
        // have come to rely on what the unfiltered faint ink does to that measure (Naish 2022),
        // so it keeps the ink as it was.
        runInk = applyHysteresis(textInk, faint);
        textInk = applyHysteresis(textInk, faintStrokes);
        roughStrip = dilate(createLongRunMask(textInk, stripHorizontal, stripVertical), 1);
        rough = detectTextLines(textInk, { lineArtMask: roughStrip, minY: parameters.textMinY, markerMask: roughMarkers, rowsFarApart });

        // Widening is meant to mend letters. Where it leaves fewer than half the rows the
        // plain ink gave, it has joined letters and rows instead, and the plain ink stands
        // (Longrich 2011: 46 rows of bold lettering became 3).
        if (parameters.profileOverrides.widenText === undefined && 2 * rough.lines.length < plainRough.lines.length)
        {
            textInk = plainInk;
            roughStrip = plainStrip;
            rough = plainRough;
            runInk = null;
            widened = false;
        }
    }

    const glyphHeight = rough.glyphHeight;

    // Strong ink minus glyphs, except that a glyph pixel on a long straight run of strong ink is a
    // branch or connector touching a label and stays. Faint (weak) ink then extends the strong
    // lines by hysteresis, but never near glyphs, whose compression halos would otherwise join
    // every label to its branch as one wide blob.
    // A short branch stub that joins a long vertical is protected too: it is shorter than any
    // glyph-safe run, but no letter reaches that far along one row while touching a line.
    const protectedLength = Math.round(1.5 * glyphHeight);
    const longInk = createLongRunMask(strongInk, protectedLength, protectedLength);
    const stubLength = Math.max(parameters.minHorizontalRun, Math.round(0.75 * glyphHeight));
    const stubInk = keepComponentsTouching(createDirectionalRunMask(strongInk, stubLength, true), longInk);
    // A short vertical that joins two lines is a node's vertical with two close children: no
    // taller than a letter l, it went with the glyphs, and the node with it (Alarcon-Munoz
    // 2023: Tethyshadros and Telmatosaurus, Rhinorex and Gryposaurus latidens).
    const rungInk = keepRungs(createDirectionalRunMask(strongInk, stubLength, false), unionMask(longInk, stubInk), Math.max(4, Math.round(stubLength / 2)));
    const protectedInk = unionMask(unionMask(longInk, stubInk), rungInk);
    const glyphZone = subtractMask(dilate(rough.glyphMask, 2), protectedInk);
    // A stretch of line drawn back under lettering lies among glyphs by its nature.
    // Known for line as well is dark ink as thick as the colored lines in level runs three
    // thicknesses long: a letter's stroke is a third as thick, and does not outlast being
    // worn away by half the thickness; the bar of a bold capital does, and is short.
    const thickRadius = Math.max(3, Math.floor((coloredThickness - 1) / 2));
    // A range bar is thicker than a line, and stops at its label as it always did.
    const barRadius = thickRadius + 1;
    const thickDark = subtractMask(dilate(erode(darkInk, thickRadius), thickRadius), dilate(erode(darkInk, barRadius), barRadius + 1));
    const knownLines = underLettering === null ? null : unionMask(unionMask(coloredLines, underLettering), createDirectionalRunMask(thickDark, Math.round(3 * coloredThickness), true));
    const strongLines = underLettering === null ? subtractMask(strongInk, glyphZone) : unionMask(subtractMask(strongInk, glyphZone), underLettering);
    const nearStrong = dilate(strongLines, parameters.weakReach);
    const weakCandidates = createDarkMask(image, parameters.lineThresholdWeak, true, parameters.weakMaxChroma);
    // Faint ink is darker than what surrounds it. A background band is at the weak level all
    // over, and taking the part of it that lies beside a line thickens every line that crosses
    // the band until close verticals run together (Rauhut 2019: a gray band at 184 down the
    // backbone).
    // The estimate must look past the figure's own lines: where they are thicker than its
    // reach, the middle of a line passes for background, and the soft edge beside it is then
    // no darker than its surround (Poropat 2014: lines twelve pixels thick lost their edge
    // column, and with it two tips whose stubs are barely longer than the line is thick).
    const reach = Math.max(backgroundRadius, Math.ceil(estimateLineThickness(strongLines) / 2) + 3);
    const faint = keepDarkerThanSurround(weakCandidates, gray, estimateBackground(gray, reach), faintContrast);
    const weakInk = subtractMask(subtractMask(faint, invertMask(nearStrong)), dilate(rough.glyphMask, 4));
    const lineInk = closeMask(applyHysteresis(strongLines, weakInk), parameters.closeRadius);

    return { gray, textInk, runInk: runInk ?? textInk, lineInk, glyphMask: rough.glyphMask, markers: colored.fat, paleMarkers, knownLines, fragmented, widened, glyphHeight, roughLines: rough.lines };
}

/**
 * Keeps the pixels of a mask that are darker than the background around them.
 *
 * @param mask - Candidate pixels.
 * @param gray - The image in gray.
 * @param background - The background level at each pixel.
 * @param contrast - Gray levels a pixel must lie below its background.
 * @returns The pixels that stand out.
 */
function keepDarkerThanSurround(mask: Mask, gray: GrayImage, background: GrayImage, contrast: number): Mask
{
    const data = new Uint8Array(mask.data.length);

    for (let index = 0; index < data.length; index++)
    {
        if (mask.data[index] !== 0 && gray.data[index] <= background.data[index] - contrast)
        {
            data[index] = 1;
        }
    }

    return { width: mask.width, height: mask.height, data };
}

/**
 * Paints the line art the trace used: the boxes of its segments. A box no broader than a line
 * or a bar is painted whole, so that a range bar goes with its branch. A box far broader than
 * the line it holds, a vertical that took in a whole column of a time chart, would take every
 * label under it out of the text (Perez-Pueyo 2019: a box 250 px wide down the figure), so
 * there only the ink that is not a glyph is painted.
 *
 * @param boxes - Boxes of the used segments and their stubs.
 * @param textInk - All dark ink.
 * @param glyphMask - Glyph pixels from the rough text pass.
 * @param thickness - Line thickness.
 * @returns The line art mask, before dilation.
 */
function keepInkInBoxes(boxes: Array<Box>, textInk: Mask, glyphMask: Mask, thickness: number): Mask
{
    const { width, height } = textInk;
    const data = new Uint8Array(width * height);
    const broad = Math.max(40, 8 * thickness);

    for (const box of boxes)
    {
        const isBroad = Math.min(box.x1 - box.x0, box.y1 - box.y0) > broad;

        for (let y = Math.max(0, box.y0); y < Math.min(height, box.y1); y++)
        {
            for (let x = Math.max(0, box.x0); x < Math.min(width, box.x1); x++)
            {
                const index = y * width + x;

                if (!isBroad || (textInk.data[index] === 1 && glyphMask.data[index] === 0))
                {
                    data[index] = 1;
                }
            }
        }
    }

    return { width, height, data };
}

/**
 * Luminance below which a color of middling chroma is taken for a line's in a figure of thin
 * lines.
 */
const softLuminance = 165;

/**
 * Finds the branches drawn in a light color: straight strokes of a color too light to be
 * colored ink, about as thick as the figure's colored lines, that touch the ink already taken
 * for line. A filled box or a range bar is thicker; the rim of a pale band is thinner.
 *
 * @param image - Image.
 * @param lineInk - Ink already taken for line.
 * @param strong - Colored ink proper, dark enough to have been sorted into lines and fills.
 * @param thickness - Thickness of the figure's colored lines.
 * @param lightest - Luminance below which a color counts; 240 takes yellow and pink.
 * @param leastLength - Least extent of a stroke, in pixels.
 * @returns Mask of the light branches.
 */
function findLightBranches(image: RgbaImage, lineInk: Mask, strong: Mask, thickness: number, lightest = 240, leastLength = 0): Mask
{
    // Light, but a color: the tint of a clade's box or a band has a third of this chroma.
    // And lighter than colored ink proper, whose strokes and bars are sorted already.
    const light = subtractMask(subtractMask(createColoredMask(image, lightest, 70), strong), lineInk);
    const broad = Math.ceil(0.75 * thickness);
    // What an erosion by three quarters of the lines' thickness leaves is half again as thick
    // as they are: a bar or a fill.
    // The same of the color and the line ink together: a tinted panel with the tree drawn
    // on it is cut by the branches into strips no broader than a line, each straight and
    // touching the tree, and is solid with them (Ramirez-Velasco 2021, a clade's green box).
    const solid = unionMask(light, lineInk);
    const panel = dilate(erode(solid, 2 * broad), 2 * broad + 1);
    const strokes = subtractMask(subtractMask(light, dilate(erode(light, broad), broad + 1)), panel);
    // And what an erosion by a quarter of it removes whole is a rim.
    const cores = erode(strokes, Math.max(1, Math.floor(thickness / 4)));
    const joined = keepComponentsTouching(keepComponentsTouching(strokes, cores), dilate(lineInk, 2));
    const labeling = findConnectedComponents(joined);
    // A branch is straight: most of the stroke lies in level or upright runs six thicknesses
    // long. The cells of a colored chart cut up by its lettering, or the outline of a map, are
    // strokes of the right thickness that touch a line, and are not straight.
    const length = Math.round(6 * thickness);
    const straight = unionMask(createDirectionalRunMask(joined, length, true), createDirectionalRunMask(joined, length, false));
    const inRuns = new Array<number>(labeling.components.length).fill(0);

    for (let index = 0; index < straight.data.length; index++)
    {
        if (straight.data[index] === 1 && labeling.labels[index] > 0)
        {
            inRuns[labeling.labels[index] - 1]++;
        }
    }

    const kept = new Set<number>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];

        if (inRuns[index] >= 0.7 * labeling.components[index].area && Math.max(box.x1 - box.x0, box.y1 - box.y0) >= leastLength)
        {
            kept.add(index + 1);
        }
    }

    return createMaskFromComponents(labeling.labels, kept, light.width, light.height);
}

/**
 * Takes out of a mask the shapes that span most of the image: the ground the figure is drawn
 * on.
 *
 * @param mask - Fat shapes.
 * @returns The mask without shapes whose box covers more than half the image.
 */
function dropGround(mask: Mask): Mask
{
    const labeling = findConnectedComponents(mask);
    const kept = new Set<number>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const { box } = labeling.components[index];

        if (2 * (box.x1 - box.x0) * (box.y1 - box.y0) <= mask.width * mask.height)
        {
            kept.add(index + 1);
        }
    }

    return createMaskFromComponents(labeling.labels, kept, mask.width, mask.height);
}

/**
 * Keeps the short vertical runs that join two lines: pieces that meet protected ink, a long
 * line or a stub of one, at two places well apart along their length. A node's vertical with
 * two close children meets its children's branches at its ends, or its own stem partway
 * down and one branch at an end; a letter's stroke touches a line in one place at most.
 *
 * @param runs - Short vertical runs.
 * @param anchors - Long straight runs of ink and the stubs joined to them.
 * @param apart - Least distance between the two places.
 * @returns The runs that are rungs between two lines.
 */
function keepRungs(runs: Mask, anchors: Mask, apart: number): Mask
{
    const { width, height } = runs;
    const { components, labels } = findConnectedComponents(runs);
    const rungs = new Set<number>();

    function isAnchor(x: number, y: number): boolean
    {
        return x >= 0 && x < width && y >= 0 && y < height && anchors.data[y * width + x] === 1 && runs.data[y * width + x] === 0;
    }

    for (let index = 0; index < components.length; index++)
    {
        const { box } = components[index];
        let first = -1;
        let last = -1;

        // Beside the run on either side, row by row, and just past each end.
        for (let y = box.y0 - 2; y < box.y1 + 2; y++)
        {
            let met = false;
            const beyond = y < box.y0 || y >= box.y1;

            for (let x = box.x0 - 2; x < box.x1 + 2 && !met; x++)
            {
                met = (beyond || x < box.x0 || x >= box.x1) && isAnchor(x, y);
            }

            if (met)
            {
                first = first < 0 ? y : first;
                last = y;
            }
        }

        if (first >= 0 && last - first >= apart)
        {
            rungs.add(index + 1);
        }
    }

    return createMaskFromComponents(labels, rungs, width, height);
}

/**
 * Finds the first or last row of a rough text row that holds letters, from a column on.
 *
 * @param box - Box of the rough row.
 * @param from - First column of the letters.
 * @param glyphMask - Glyph pixels of the rough text pass.
 * @param lineInk - Line ink.
 * @param fromTop - Whether to look for the first row; otherwise the last.
 * @returns The row.
 */
function findLetterEdge(box: Box, from: number, glyphMask: Mask, lineInk: Mask, fromTop: boolean): number
{
    for (let step = 0; step < box.y1 - box.y0; step++)
    {
        const y = fromTop ? box.y0 + step : box.y1 - 1 - step;
        let letters = 0;

        for (let x = from; x < box.x1; x++)
        {
            const index = y * glyphMask.width + x;
            letters += glyphMask.data[index] === 1 && lineInk.data[index] === 0 ? 1 : 0;
        }

        if (letters >= 2)
        {
            return y;
        }
    }

    return fromTop ? box.y0 : box.y1 - 1;
}

/**
 * A rough text row, or a part of one.
 */
type RowPart = {
    /**
     * Bounding box.
     */
    box: Box;

    /**
     * Glyphs in it.
     */
    glyphCount: number;
};

/**
 * Parts the rough rows that a line runs through the middle of: a number, a branch's stub and
 * the label after it, all on one level and close together, come out of the rough pass as one
 * row, and the stub between them is then lettering that no branch may pass (Cau 2018, the
 * age of a node, the stub of its upper tip and the tip's name). A stretch of a row at least
 * a glyph long that holds line ink and no letter parts it.
 *
 * @param rows - Rough rows.
 * @param glyphMask - Glyph pixels of the rough pass.
 * @param lineInk - Ink known for line.
 * @param glyphHeight - Glyph height in pixels.
 * @param onlyLeading - Whether to part a row only after a short piece at its start: a
 *   support value or the short riser of a fork, then the tip's stub, then its name, where
 *   the riser is the size of a letter and the row begins with it (Averianov 2018). The
 *   stub must then be a glyph and a half long and line all the way.
 * @returns The rows, those parted given as their parts.
 */
function splitRowsAtLines(rows: Array<TextLine>, glyphMask: Mask, lineInk: Mask, glyphHeight: number, onlyLeading = false): Array<RowPart>
{
    const parts = new Array<RowPart>();

    for (const row of rows)
    {
        const { box } = row;
        const cuts = new Array<number>();
        let lineStart = -1;
        let lined = 0;
        let seenLetters = false;
        let lettered = 0;
        let letteredBefore = 0;

        for (let x = box.x0; x < box.x1; x++)
        {
            let letters = 0;
            let line = 0;

            for (let y = box.y0; y < box.y1; y++)
            {
                const index = y * glyphMask.width + x;
                line += lineInk.data[index];
                letters += glyphMask.data[index] === 1 && lineInk.data[index] === 0 ? 1 : 0;
            }

            if (letters < 3)
            {
                letteredBefore = lineStart < 0 ? lettered : letteredBefore;
                lineStart = lineStart < 0 ? x : lineStart;
                lined += line > 0 ? 1 : 0;
                continue;
            }

            // A stretch without letters between two with them, mostly under a line; with two
            // glyphs of row before it and after it, since a single letter cut off by a mark
            // is still part of its word.
            const before = lineStart - (cuts.length === 0 ? box.x0 : cuts[cuts.length - 1]);

            const stretch = x - lineStart;
            const parted = !onlyLeading && stretch >= glyphHeight && lined >= 0.75 * stretch && before >= 2 * glyphHeight;
            // The piece at the start is strokes, a digit and a riser, and not a solid block:
            // a range bar before its branch and its name is a block (Wang 2025).
            const sparse = 10 * letteredBefore <= 4 * Math.max(1, before) * (box.y1 - box.y0);
            // And it ends in a riser: a stroke that climbs or falls to the stub's height
            // over the glyph before the stub. A node's age or a bar's end before a branch is
            // level, and the row there is left whole (two synthetic strict cases).
            const riserFrom = Math.max(box.x0, lineStart - glyphHeight);
            const rises = lineStart - riserFrom >= 6 && climbsAcross(glyphMask, { x0: riserFrom, y0: box.y0, x1: lineStart, y1: box.y1 }, 0.25);
            const led = cuts.length === 0 && before < 2.5 * glyphHeight && stretch >= 1.5 * glyphHeight && lined >= 0.9 * stretch && sparse && rises;

            if (lineStart >= 0 && seenLetters && (parted || led) && box.x1 - x >= 2 * glyphHeight)
            {
                cuts.push(lineStart, x);
            }

            seenLetters = true;
            lettered += letters;
            lineStart = -1;
            lined = 0;
        }

        if (cuts.length === 0)
        {
            parts.push({ box, glyphCount: row.glyphCount });
            continue;
        }

        let start = box.x0;

        for (let index = 0; index <= cuts.length; index += 2)
        {
            const end = index < cuts.length ? cuts[index] : box.x1;
            parts.push({ box: { x0: start, y0: box.y0, x1: end, y1: box.y1 }, glyphCount: Math.max(1, Math.round(row.glyphCount * (end - start) / (box.x1 - box.x0))) });
            start = index + 1 < cuts.length ? cuts[index + 1] : box.x1;
        }
    }

    return parts;
}

/**
 * Moves the start of a rough text row's box up to its first letter, past whatever line art
 * the rough pass took for part of the label: the glyph pixels there that proved to be line
 * ink. Only the start moves, and with it the top and bottom, and only by a modest share of the row: bold letters hold long
 * strokes that pass for line ink too, and a row cut down to what is left of them no longer
 * covers its label (Poropat 2014).
 *
 * @param box - Box of the rough row.
 * @param glyphMask - Glyph pixels of the rough text pass.
 * @param lineInk - Line ink, which holds whatever of those pixels proved to be line art.
 * @returns The box, starting at its first letter.
 */
function shrinkToLetters(box: Box, glyphMask: Mask, lineInk: Mask): Box
{
    const farthest = box.x0 + Math.round(0.35 * (box.x1 - box.x0));

    for (let x = box.x0; x < farthest; x++)
    {
        let letters = 0;

        for (let y = box.y0; y < box.y1; y++)
        {
            const index = y * glyphMask.width + x;

            if (glyphMask.data[index] === 1 && lineInk.data[index] === 0)
            {
                letters++;
            }
        }

        // A pixel or two is the end of a stroke left over from a line, not a letter.
        if (letters >= 3)
        {
            // Line art before the letters may stand above or below them too, and make the
            // row taller than its text: the rows are those the letters reach.
            const y0 = x === box.x0 ? box.y0 : findLetterEdge(box, x, glyphMask, lineInk, true);
            const y1 = x === box.x0 ? box.y1 : findLetterEdge(box, x, glyphMask, lineInk, false) + 1;

            return { x0: x, y0, x1: box.x1, y1 };
        }
    }

    return box;
}

/**
 * Finds the stretches of line ink that continue a horizontal segment beyond either end without
 * leaving its rows: the tail of a range bar or a branch stub that was clipped at a label.
 *
 * @param lineInk - Line ink mask.
 * @param boxes - Segment boxes.
 * @param reach - How far past an end to look.
 * @returns Boxes covering the stubs.
 */
function findStubExtensions(lineInk: Mask, boxes: Array<Box>, reach: number): Array<Box>
{
    const stubs = new Array<Box>();
    const { width, height, data } = lineInk;

    function staysInside(x: number, box: Box): boolean
    {
        if (x < 0 || x >= width)
        {
            return false;
        }

        let inside = 0;

        for (let y = box.y0; y < box.y1; y++)
        {
            inside += data[y * width + x];
        }

        // A range bar is a little thicker than the branch it sits on; a letter is far taller.
        const above = box.y0 - 3 >= 0 ? data[(box.y0 - 3) * width + x] : 0;
        const below = box.y1 + 2 < height ? data[(box.y1 + 2) * width + x] : 0;

        return inside > 0 && above === 0 && below === 0;
    }

    for (const box of boxes)
    {
        if (box.x1 - box.x0 < box.y1 - box.y0)
        {
            continue;
        }

        let right = box.x1;

        while (right < box.x1 + reach && staysInside(right, box))
        {
            right++;
        }

        let left = box.x0 - 1;

        while (left > box.x0 - 1 - reach && staysInside(left, box))
        {
            left--;
        }

        if (right > box.x1 || left < box.x0 - 1)
        {
            stubs.push({ x0: left + 1, y0: box.y0, x1: right, y1: box.y1 });
        }
    }

    return stubs;
}

/**
 * Length of the horizontal segment that ends at a tip, or infinity when none is found (a tip
 * added by hand has no segment).
 *
 * @param document - Extraction document.
 * @param tip - Tip to measure.
 * @returns Segment length in pixels.
 */
function measureTipPiece(document: ExtractionDocument, tip: Tip): number
{
    for (const segment of document.horizontals)
    {
        const { box } = segment;

        if (Math.abs(box.x1 - tip.x) <= 1 && tip.y >= box.y0 - 1 && tip.y <= box.y1 + 1)
        {
            return box.x1 - box.x0;
        }
    }

    return Infinity;
}

/**
 * Removes tips with no label text whose branch is shorter than a couple of glyphs: the crossbar
 * of a digit touching a vertical, the end of a clipped stub. Nodes left with one child collapse.
 *
 * @param document - Document updated in place.
 * @param maxLength - Longest branch a debris tip can have.
 * @param minPiece - Shortest line piece a real tip can end; shorter pieces are debris whatever their reach.
 */
function removeDebrisTips(document: ExtractionDocument, maxLength: number, minPiece: number): void
{
    const nodeById = new Map<string, TreeNode>();
    const tipById = new Map<string, Tip>();

    for (const node of document.nodes)
    {
        nodeById.set(node.id, node);
    }

    const debris = new Set<string>();

    for (const tip of document.tips)
    {
        const parent = tip.parent === null ? undefined : nodeById.get(tip.parent);
        // The piece of line that ends at the tip may be far shorter than its reach from the
        // parent when it attached loosely: the tip of a clade bracket, or a fleck.
        const piece = measureTipPiece(document, tip);

        if (tip.textLine === null && parent !== undefined && (tip.x - parent.x < maxLength || piece < minPiece))
        {
            debris.add(tip.id);
        }
        else
        {
            tipById.set(tip.id, tip);
        }
    }

    if (debris.size === 0)
    {
        return;
    }

    document.tips = [...tipById.values()];

    for (const node of document.nodes)
    {
        const kept = new Array<string>();

        for (const child of node.children)
        {
            if (!debris.has(child))
            {
                kept.push(child);
            }
        }

        node.children = kept;
    }

    document.qc.push({ severity: "info", code: "debris-removed", message: `${debris.size} short unlabelled tip(s) dropped as debris`, subject: null });
    let changed = true;

    while (changed)
    {
        changed = false;

        for (const node of [...nodeById.values()])
        {
            if (node.children.length > 1)
            {
                continue;
            }

            const childId = node.children[0];
            const child = childId === undefined ? undefined : (nodeById.get(childId) ?? tipById.get(childId));

            if (child !== undefined)
            {
                child.parent = node.parent;
            }

            const parent = node.parent === null ? undefined : nodeById.get(node.parent);

            if (parent !== undefined)
            {
                const index = parent.children.indexOf(node.id);

                if (index >= 0 && childId === undefined)
                {
                    parent.children.splice(index, 1);
                }
                else if (index >= 0)
                {
                    parent.children[index] = childId;
                }
            }

            if (document.root === node.id)
            {
                document.root = childId !== undefined && nodeById.has(childId) ? childId : null;
            }

            nodeById.delete(node.id);
            changed = true;
        }
    }

    document.nodes = [...nodeById.values()];
}

/**
 * Drops short tips whose label is not a name: a bare number (a fragment of a branch cut by a
 * support value, which then claimed the value as its label) or a scrap of two or three
 * characters that matched nothing. The line goes back to the pool.
 *
 * @param document - Document updated in place.
 * @param maxLength - Longest branch such a tip can have.
 */
function removeNumericDebrisTips(document: ExtractionDocument, maxLength: number, maxScrapLength = maxLength): void
{
    for (const tip of document.tips)
    {
        if (tip.label === null)
        {
            continue;
        }

        const numeric = /^[0-9./]+$/.test(tip.label);
        const scrap = tip.label.length <= 3 && (tip.match === null || !tip.match.accepted);

        if (!numeric && !scrap)
        {
            continue;
        }

        const limit = numeric ? maxLength : maxScrapLength;

        let parentX: number | null = null;

        for (const node of document.nodes)
        {
            if (node.id === tip.parent)
            {
                parentX = node.x;
            }
        }

        if (parentX !== null && tip.x - parentX < limit)
        {
            for (const line of document.textLines)
            {
                if (line.id === tip.textLine)
                {
                    line.role = "unassigned";
                }
            }

            tip.textLine = null;
            tip.label = null;
            tip.match = null;
        }
    }

    removeDebrisTips(document, maxScrapLength, 0);
}

/**
 * Pairs tips whose label matched nothing confidently with the names no other tip took. Every
 * name is used once, so once the confident matches are made the leftovers can be paired by
 * best similarity, weakest last, as long as the pairing is not a toss-up.
 *
 * @param document - Document updated in place.
 * @param names - The closed list of names.
 */
function assignLeftoverNames(document: ExtractionDocument, names: Array<string>): void
{
    if (names.length === 0)
    {
        return;
    }

    const taken = new Set<string>();
    const open = new Array<Tip>();

    for (const tip of document.tips)
    {
        if (tip.match !== null && tip.match.accepted)
        {
            taken.add(tip.match.name);
        }
        else if (tip.label !== null && !isCladeName(tip.label) && !isHigherTaxonName(tip.label))
        {
            open.push(tip);
        }
    }

    const free = new Array<string>();

    for (const name of names)
    {
        if (!taken.has(name))
        {
            free.push(name);
        }
    }

    let paired = 0;
    let changed = true;

    // Each round pairs every tip whose best free name is clear of its second-best, then the
    // taken names drop out and the remaining tips are tried again with fewer choices.
    while (changed)
    {
        changed = false;

        for (const tip of [...open])
        {
            const label = normalizeName(tip.label ?? "");
            let bestName: string | null = null;
            let bestScore = 0.4;
            let runnerUp = 0;

            for (const name of free)
            {
                const score = scoreName(label, normalizeName(name));

                if (score > bestScore)
                {
                    runnerUp = bestScore;
                    bestScore = score;
                    bestName = name;
                }
                else if (score > runnerUp)
                {
                    runnerUp = score;
                }
            }

            if (bestName === null || bestScore - runnerUp < 0.05)
            {
                continue;
            }

            tip.match = { name: bestName, similarity: bestScore, margin: bestScore - runnerUp, accepted: true, source: "list" };
            open.splice(open.indexOf(tip), 1);
            free.splice(free.indexOf(bestName), 1);
            paired++;
            changed = true;
        }
    }

    if (paired > 0)
    {
        document.qc.push({ severity: "info", code: "leftover-names", message: `${paired} tip(s) paired with the remaining names by elimination; check them`, subject: null });
    }
}

/**
 * Adds quality-control findings about labels and overall shape.
 *
 * @param document - Document whose qc list is extended.
 */
function runQualityChecks(document: ExtractionDocument): void
{
    for (const tip of document.tips)
    {
        if (tip.match !== null && tip.match.accepted && tip.match.source === "known")
        {
            // A name the known taxa only confirmed, letter for letter, needs no remark; one
            // they changed does, and so does a species they could not vouch for.
            const read = (tip.label ?? "").trim();

            if (tip.match.speciesAsRead === true)
            {
                document.qc.push({
                    severity: "info",
                    code: "species-as-read",
                    message: `tip ${tip.id}: the known taxa have the genus of "${tip.match.name}" but not this species, which is kept as read`,
                    subject: tip.id,
                });
            }
            else if (read.toLowerCase() !== tip.match.name.toLowerCase())
            {
                document.qc.push({
                    severity: "warning",
                    code: "known-name-used",
                    message: `tip ${tip.id} read as "${read}" is named "${tip.match.name}" from the known taxa, not from a supplied name list`,
                    subject: tip.id,
                });
            }
        }
    }

    const issues = new Array<QcIssue>();
    const seen = new Map<string, string>();

    for (const tip of document.tips)
    {
        if (tip.textLine === null)
        {
            issues.push({ severity: "warning", code: "tip-unlabelled", message: `tip ${tip.id} has no label text nearby`, subject: tip.id });
        }
        else if (tip.match !== null && !tip.match.accepted)
        {
            issues.push({
                severity: "warning",
                code: "label-unmatched",
                message: `tip ${tip.id} read as "${tip.label ?? ""}" matches nothing in the name list (best ${tip.match.name}, ${tip.match.similarity.toFixed(2)})`,
                subject: tip.id,
            });
        }

        const name = getTipDisplayName(document, tip.id);
        const earlier = seen.get(name);

        if (earlier !== undefined)
        {
            issues.push({ severity: "error", code: "duplicate-name", message: `tips ${earlier} and ${tip.id} both resolve to "${name}"`, subject: tip.id });
        }
        else
        {
            seen.set(name, tip.id);
        }
    }

    issues.push({
        severity: "info",
        code: "summary",
        message: `${document.tips.length} tip(s), ${document.nodes.length} node(s), ${document.textLines.length} text line(s)`,
        subject: null,
    });

    document.qc.push(...issues);
}

/**
 * Formats stage timings for display.
 *
 * @param timings - Milliseconds per stage.
 * @returns Comma-separated summary.
 */
export function formatTimings(timings: Record<string, number>): string
{
    const parts = new Array<string>();

    for (const stage of Object.keys(timings))
    {
        parts.push(`${stage} ${timings[stage]} ms`);
    }

    return parts.join(", ");
}

/**
 * Keeps the part of a mask from a little left of the tips' median column onward, and clears
 * the rest.
 *
 * @param mask - Mask, copied.
 * @param tips - Tips whose median column sets the line.
 * @param margin - How far left of the median to keep, in pixels.
 * @returns The clipped copy.
 */
function keepShapesBeyond(mask: Mask, tips: Array<Tip>, margin: number): Mask
{
    const xs = new Array<number>();

    for (const tip of tips)
    {
        if (tip.parent !== null)
        {
            xs.push(tip.x);
        }
    }

    xs.sort(compareNumbers);
    const from = xs.length === 0 ? 0 : Math.max(0, Math.round(xs[Math.floor(xs.length / 2)] - margin));
    const data = new Uint8Array(mask.data);

    for (let y = 0; y < mask.height; y++)
    {
        data.fill(0, y * mask.width, y * mask.width + Math.min(from, mask.width));
    }

    return { width: mask.width, height: mask.height, data };
}

/**
 * On a slanted figure whose tips end on one line, drops unlabelled tips that end well behind
 * it: pieces of a bracket or a letter that touched the tree and were read as stubs.
 *
 * @param document - Document with its profile measured and labels paired.
 * @param glyphHeight - Glyph height in pixels.
 * @returns One informational issue per tip dropped.
 */
function dropTipsBehindLine(document: ExtractionDocument, glyphHeight: number): Array<QcIssue>
{
    const issues = new Array<QcIssue>();
    const xs = new Array<number>();

    for (const tip of document.tips)
    {
        if (tip.parent !== null)
        {
            xs.push(tip.x);
        }
    }

    if (xs.length < 4)
    {
        return issues;
    }

    // The tip line of a slanted figure is looser than a rectangular one's, since stubs and
    // markers end at slightly different columns: the median, with most tips within a glyph.
    xs.sort(compareNumbers);
    const line = xs[Math.floor(xs.length / 2)];
    let near = 0;

    for (const x of xs)
    {
        near += Math.abs(x - line) <= glyphHeight ? 1 : 0;
    }

    if (near < 0.6 * xs.length)
    {
        return issues;
    }

    const behind = new Array<string>();

    for (const tip of document.tips)
    {
        if (tip.textLine === null && tip.x < line - 2 * glyphHeight)
        {
            behind.push(tip.id);
        }
    }

    for (const id of behind)
    {
        deleteTip(document, id);
        issues.push({ severity: "info", code: "tip-behind-line", message: `tip ${id} ended well behind the tip line with no label and was dropped`, subject: null });
    }

    return issues;
}

/**
 * Drops tips that lie on the time axis: the axis line traces as a branch when a tick or a
 * frame line connects it to the tree, and its ends then read the legend or the axis labels.
 *
 * @param document - Document with its profile measured.
 * @param glyphHeight - Glyph height in pixels.
 * @returns One informational issue per tip dropped.
 */
function dropAxisTips(document: ExtractionDocument, glyphHeight: number): Array<QcIssue>
{
    const axis = document.profile.timeScaled.axis;
    const issues = new Array<QcIssue>();

    if (axis === null)
    {
        return issues;
    }

    const onAxis = new Array<string>();

    for (const tip of document.tips)
    {
        if (tip.y >= axis.y0 - glyphHeight && tip.y <= axis.y1 + glyphHeight && tip.x >= axis.x0 - 2 * glyphHeight && tip.x <= axis.x1 + 2 * glyphHeight)
        {
            onAxis.push(tip.id);
        }
    }

    for (const id of onAxis)
    {
        deleteTip(document, id);
        issues.push({ severity: "info", code: "axis-tip-dropped", message: `tip ${id} lay on the time axis and was dropped`, subject: null });
    }

    return issues;
}

/**
 * Replaces the level rows that lie in the slanted labels' zone with the rows found in the
 * level frame, numbering the frame's rows on from the rest.
 *
 * @param lines - Rows found in the figure's frame.
 * @param slanted - Rows found in the level frame, with the zone they cover.
 * @returns The combined rows.
 */
function replaceZoneLines(lines: Array<TextLine>, slanted: SlantedLabels): Array<TextLine>
{
    const { zone } = slanted;
    const kept = new Array<TextLine>();
    let highest = 0;

    for (const line of lines)
    {
        const centerX = (line.box.x0 + line.box.x1) / 2;
        const centerY = (line.box.y0 + line.box.y1) / 2;
        highest = Math.max(highest, Number(line.id.slice(1)) || 0);

        if (!(centerX >= zone.x0 && centerX < zone.x1 && centerY >= zone.y0 && centerY < zone.y1))
        {
            kept.push(line);
        }
    }

    // Numbered on from the highest id the figure's rows had, dropped ones included, so that no
    // id is used twice.
    for (const line of slanted.lines)
    {
        highest++;
        line.id = `l${highest}`;
        kept.push(line);
    }

    return kept;
}

/**
 * Finds the pale fills in the faint ink: fat pieces at least a given size one way of which
 * less than half is certain ink.
 *
 * @param faint - Faint ink.
 * @param certain - Certain ink.
 * @param radius - Erosion radius that tells a fat piece from a stroke.
 * @param minSize - Smallest longer side of a fill.
 * @returns Mask of the fills.
 */
function findPaleFills(faint: Mask, certain: Mask, radius: number, minSize: number): Mask
{
    const fat = findFatShapes(faint, radius);
    const labeling = findConnectedComponents(fat);
    const certainArea = new Array<number>(labeling.components.length + 1).fill(0);

    for (let index = 0; index < fat.data.length; index++)
    {
        if (labeling.labels[index] > 0 && certain.data[index] === 1)
        {
            certainArea[labeling.labels[index]]++;
        }
    }

    const fills = new Set<number>();

    for (let index = 0; index < labeling.components.length; index++)
    {
        const component = labeling.components[index];
        const { box } = component;

        if (Math.max(box.x1 - box.x0, box.y1 - box.y0) >= minSize && certainArea[index + 1] < 0.5 * component.area)
        {
            fills.add(index + 1);
        }
    }

    return createMaskFromComponents(labeling.labels, fills, faint.width, faint.height);
}

/**
 * Raises the ink thresholds for a figure drawn in gray: when the thin ink's commonest
 * luminance is well above black and holds a good share of that ink, the figure's lines and
 * letters are gray by design (a tree whose parts under discussion are black and the rest
 * gray), and thresholds set for black ink fragment the lines and miss the letters. The
 * thresholds move up to sit above the gray, capped short of white so that bands and the
 * antialiased fringe of ordinary ink stay out. A scan, whose pale noise is spread thin over
 * many luminances, has no such mode; a black figure whose fringe or light bands happen to
 * be its commonest thin ink is told by its dark share; both are left alone.
 *
 * @param parameters - Parameters updated in place.
 * @param image - Source image as analyzed.
 * @returns A quality check describing the change, or null when nothing changed.
 */
function adaptInkThresholds(parameters: Parameters, image: RgbaImage): QcIssue | null
{
    const thinInk = measureThinInkLuminance(image);

    // Gray ink lies between the near-black of ordinary ink and the near-white fringe every
    // figure has around its lines; and the figure must be mostly gray, not a black figure
    // with a light fringe or a light band.
    if (thinInk.mode < 96 || thinInk.mode >= 192 || thinInk.share < 0.25 || thinInk.darkShare >= 0.5 || thinInk.pixels < 1000)
    {
        return null;
    }

    const binTop = thinInk.mode + 16;
    const before = `${parameters.inkThreshold}/${parameters.lineThreshold}/${parameters.lineThresholdWeak}`;
    const inkThreshold = Math.min(225, Math.max(parameters.inkThreshold, binTop + 16));
    const lineThreshold = Math.min(230, Math.max(parameters.lineThreshold, binTop + 24));
    const lineThresholdWeak = Math.min(240, Math.max(parameters.lineThresholdWeak, binTop + 44));

    if (inkThreshold === parameters.inkThreshold && lineThreshold === parameters.lineThreshold && lineThresholdWeak === parameters.lineThresholdWeak)
    {
        return null;
    }

    parameters.inkThreshold = inkThreshold;
    parameters.lineThreshold = lineThreshold;
    parameters.lineThresholdWeak = lineThresholdWeak;

    return { severity: "info", code: "thresholds-raised", message: `the figure's thin ink is gray (mode luminance ${thinInk.mode}-${binTop - 1}, ${Math.round(100 * thinInk.share)}% of it), so the ink thresholds were raised from ${before} to ${parameters.inkThreshold}/${parameters.lineThreshold}/${parameters.lineThresholdWeak}`, subject: null };
}

/**
 * Records how the figure's orientation was decided, when it was turned or could not be
 * decided.
 *
 * @param find - The detector's decision and evidence, or null when detection was off.
 * @param quarterTurns - Clockwise quarter turns applied.
 * @returns At most one informational issue.
 */
function describeOrientation(find: OrientationFind | null, quarterTurns: number): Array<QcIssue>
{
    if (find === null || find.orientation === "root-left")
    {
        return [];
    }

    const evidence = `${find.rightEnds} branch end(s) with a label to the right, ${find.topEnds} with one above, ${find.bottomEnds} with one below; ${find.uprightGlyphs} glyph(s) level, ${find.sidewaysGlyphs} on their side`;

    if (find.orientation === "unknown")
    {
        return [{ severity: "info", code: "orientation-undecided", message: `the figure's orientation could not be decided (${evidence}; ${Math.round(100 * find.runCoverage)}% of the line art in straight runs), so it was taken as drawn`, subject: null }];
    }

    return [{ severity: "info", code: "figure-turned", message: `the figure was turned ${quarterTurns === 1 ? "clockwise" : "counterclockwise"} to put the root on the left (${evidence})`, subject: null }];
}

/**
 * Whether a figure is drawn light on dark: most of its pixels are dark.
 *
 * @param image - Image.
 * @returns True when dark pixels outnumber the rest by three to two or more.
 */
function isDrawnOnDark(image: RgbaImage): boolean
{
    const pixels = image.width * image.height;
    let dark = 0;

    for (let index = 0; index < pixels; index++)
    {
        const offset = index * 4;

        if (0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2] < 96)
        {
            dark++;
        }
    }

    return dark >= 0.6 * pixels;
}

/**
 * Paints areas of an image out, each in the color that surrounds it: the median of the
 * pixels along its border. On a tinted figure a white patch would be a shape of its own,
 * with edges where there were none.
 *
 * @param image - Image, dark on light.
 * @param areas - Boxes to paint out, in the image's coordinates.
 * @returns A copy with the areas painted out.
 */
function blankAreas(image: RgbaImage, areas: Array<Box>): RgbaImage
{
    const data = new Uint8ClampedArray(image.data);

    for (const area of areas)
    {
        const box = clampBox(area, image.width, image.height);

        if (box.x1 <= box.x0 || box.y1 <= box.y0)
        {
            continue;
        }

        const channels: Array<Array<number>> = [[], [], []];

        for (let x = box.x0; x < box.x1; x++)
        {
            for (const y of [Math.max(0, box.y0 - 1), Math.min(image.height - 1, box.y1)])
            {
                for (let channel = 0; channel < 3; channel++)
                {
                    channels[channel].push(image.data[(y * image.width + x) * 4 + channel]);
                }
            }
        }

        for (let y = box.y0; y < box.y1; y++)
        {
            for (const x of [Math.max(0, box.x0 - 1), Math.min(image.width - 1, box.x1)])
            {
                for (let channel = 0; channel < 3; channel++)
                {
                    channels[channel].push(image.data[(y * image.width + x) * 4 + channel]);
                }
            }
        }

        const fill = [computeMedian(channels[0], 255), computeMedian(channels[1], 255), computeMedian(channels[2], 255)];

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = box.x0; x < box.x1; x++)
            {
                const offset = (y * image.width + x) * 4;
                data[offset] = fill[0];
                data[offset + 1] = fill[1];
                data[offset + 2] = fill[2];
            }
        }
    }

    return { width: image.width, height: image.height, data };
}

/**
 * Measures the longest run of ink down any one column of a box.
 *
 * @param mask - Mask.
 * @param box - Box.
 * @returns The run's length in pixels.
 */
function measureLongestColumnRun(mask: Mask, box: Box): number
{
    let longest = 0;

    for (let x = Math.max(0, box.x0); x < Math.min(mask.width, box.x1); x++)
    {
        let run = 0;

        for (let y = Math.max(0, box.y0); y < Math.min(mask.height, box.y1); y++)
        {
            run = mask.data[y * mask.width + x] === 1 ? run + 1 : 0;
            longest = Math.max(longest, run);
        }
    }

    return longest;
}

/**
 * Counts the rows of a box that hold an unbroken stretch of ink longer than a limit.
 *
 * @param mask - Mask.
 * @param box - Box.
 * @param limit - Length a stretch must exceed.
 * @returns The number of such rows.
 */
function countBroadRows(mask: Mask, box: Box, limit: number): number
{
    let rows = 0;

    for (let y = Math.max(0, box.y0); y < Math.min(mask.height, box.y1); y++)
    {
        let run = 0;
        let broad = false;

        for (let x = Math.max(0, box.x0); x < Math.min(mask.width, box.x1) && !broad; x++)
        {
            run = mask.data[y * mask.width + x] === 1 ? run + 1 : 0;
            broad = run > limit;
        }

        rows += broad ? 1 : 0;
    }

    return rows;
}

/**
 * Clears boxes out of a mask.
 *
 * @param mask - Mask.
 * @param boxes - Boxes to clear.
 * @returns A copy without the ink in the boxes.
 */
function blankMaskAreas(mask: Mask, boxes: Array<Box>): Mask
{
    const data = new Uint8Array(mask.data);

    for (const box of boxes)
    {
        for (let y = Math.max(0, box.y0); y < Math.min(mask.height, box.y1); y++)
        {
            for (let x = Math.max(0, box.x0); x < Math.min(mask.width, box.x1); x++)
            {
                data[y * mask.width + x] = 0;
            }
        }
    }

    return { width: mask.width, height: mask.height, data };
}

/**
 * Makes the negative of an image.
 *
 * @param image - Image.
 * @returns A copy with every color channel reversed.
 */
function invertImage(image: RgbaImage): RgbaImage
{
    const data = new Uint8ClampedArray(image.data.length);

    for (let offset = 0; offset < data.length; offset += 4)
    {
        data[offset] = 255 - image.data[offset];
        data[offset + 1] = 255 - image.data[offset + 1];
        data[offset + 2] = 255 - image.data[offset + 2];
        data[offset + 3] = image.data[offset + 3];
    }

    return { width: image.width, height: image.height, data };
}

/**
 * Runs the full pipeline on one image.
 *
 * @param givenImage - Decoded RGBA image, as drawn.
 * @param options - OCR engine, name list, region and threshold overrides.
 * @returns The extraction document.
 */
export async function extractTree(givenImage: RgbaImage, options: Partial<ExtractOptions> = {}): Promise<ExtractionDocument>
{
    const parameters = { ...defaultParameters, ...options.parameters };
    const typeHeights = measureTypeHeight(givenImage, options.region ?? null, parameters);
    const typeHeight = typeHeights.median;

    // The steps that tell letters from lines take a letter for at most 60 pixels tall. A
    // figure enlarged past that is read at the size where its letters are of ordinary height,
    // and the reading put back in the figure's own coordinates (Vickaryous 2002, a small
    // cladogram at 1,900 pixels across with letters 70 to 125 tall).
    const read = options.region ?? { x0: 0, y0: 0, x1: givenImage.width, y1: givenImage.height };
    const shorter = Math.min(read.x1 - read.x0, read.y1 - read.y0);

    // A figure with a number at every mark on its branches has far more digits than
    // letters, and the median is a digit's height: there the tallest tenth of the pieces,
    // the capitals of its names, tell that its type is large (You 2009, a median of 45 and
    // names 63 tall).
    const large = typeHeight >= largeTypeHeight || typeHeights.tallest >= largeTypeHeight;

    // A figure embedded small is read at twice its size as well. With letters under ten
    // pixels tall the strokes of a word can run together into a bar as thick as a branch,
    // and the lines be no thicker than a letter's stroke (Pretto 2018, 20 of 44 names as it
    // stands and 39 enlarged; Dai 2022, 80 of 88 and 88). Most figures of small type read
    // well as they are, and some read worse enlarged (Dalla Vecchia 2006 names 16 of 19 and
    // then none), so the reading as it stands is kept when it placed nearly all its tips,
    // and the enlarged one must place a tenth more to replace it.
    if (typeHeight > 0 && typeHeight <= smallTypeHeight)
    {
        const plain = await extractTreeAtSize(givenImage, options);
        const placed = countPlacedTips(plain);

        if (placed >= 4 && placed >= nearlyAllPlaced * plain.tips.length)
        {
            return plain;
        }

        const document = await extractTreeAtSize(enlargeRgba(givenImage, smallTypeFactor), {
            ...options,
            region: options.region === undefined || options.region === null ? null : reduceBox(options.region, 1 / smallTypeFactor),
            exclude: options.exclude === undefined ? undefined : options.exclude.map(function enlargeArea(area: Box): Box
            {
                return reduceBox(area, 1 / smallTypeFactor);
            }),
        });

        if (countPlacedTips(document) < placed + Math.max(3, Math.round(placed / 10)))
        {
            return plain;
        }

        scaleDocument(document, 1 / smallTypeFactor, givenImage.width, givenImage.height);
        document.qc.push({ severity: "info", code: "figure-enlarged", message: `the figure's letters are about ${typeHeight} px tall, so it was read at ${smallTypeFactor} times its size; pixel positions in these messages are at that size`, subject: null });

        return document;
    }

    if (!large && (typeHeight < largeTypeForFigure || typeHeight < largeTypeShare * shorter))
    {
        return extractTreeAtSize(givenImage, options);
    }

    const factor = typeHeight / ordinaryTypeHeight;
    const document = await extractTreeAtSize(reduceRgba(givenImage, factor), {
        ...options,
        region: options.region === undefined || options.region === null ? null : reduceBox(options.region, factor),
        exclude: options.exclude === undefined ? undefined : options.exclude.map(function reduceArea(area: Box): Box
        {
            return reduceBox(area, factor);
        }),
    });

    scaleDocument(document, factor, givenImage.width, givenImage.height);
    document.qc.push({ severity: "info", code: "figure-reduced", message: `the figure's letters are about ${typeHeight} px tall, so it was read at 1/${factor.toFixed(1)} of its size; pixel positions in these messages are at that size`, subject: null });

    return document;
}

/**
 * Fewest wedges of collapsed clades for a figure's labels to be taken as standing far apart.
 */
const wedgesForFarRows = 3;

/**
 * Median letter height in pixels up to which a figure is read enlarged.
 */
const smallTypeHeight = 9;

/**
 * Share of its tips a reading must have placed for a figure of small type not to be read
 * enlarged as well.
 */
const nearlyAllPlaced = 0.92;

/**
 * How many times its size a figure with small type is read at.
 */
const smallTypeFactor = 2;

/**
 * Median letter height in pixels from which a figure is read reduced.
 */
const largeTypeHeight = 56;

/**
 * Median letter height in pixels from which a figure is read reduced when its letters are
 * also large for the figure: bold labels of that size on a small tree have strokes as long
 * and as thick as its branches (Brusatte 2008, letters 44 pixels tall in a figure 1,429 high;
 * Bonaparte 2006 has letters of 41 in a figure 2,508 high and reads well as it is).
 */
const largeTypeForFigure = 38;

/**
 * Share of the figure's shorter side that letters must reach to be large for the figure.
 */
const largeTypeShare = 0.02;

/**
 * Median letter height in pixels a reduced figure is brought to.
 */
const ordinaryTypeHeight = 28;

/**
 * Reduces a box by a factor.
 *
 * @param box - Box in the full image.
 * @param factor - Factor the image is reduced by.
 * @returns The box in the reduced image.
 */
function reduceBox(box: Box, factor: number): Box
{
    return { x0: Math.round(box.x0 / factor), y0: Math.round(box.y0 / factor), x1: Math.round(box.x1 / factor), y1: Math.round(box.y1 / factor) };
}

/**
 * Whether the ink in a box stands at one height in its left quarter and at another, half
 * the box's height away or more, in its right quarter: a slanted stroke and not a level one.
 *
 * @param mask - Ink.
 * @param box - Box of the piece.
 * @param share - Share of the box's height the ink must climb by.
 * @returns Whether the piece climbs.
 */
function climbsAcross(mask: Mask, box: Box, share = 0.5): boolean
{
    const quarter = Math.max(1, Math.round((box.x1 - box.x0) / 4));

    function measureMeanRow(x0: number, x1: number): number
    {
        let sum = 0;
        let count = 0;

        for (let y = box.y0; y < box.y1; y++)
        {
            for (let x = x0; x < x1; x++)
            {
                if (mask.data[y * mask.width + x] === 1)
                {
                    sum += y;
                    count++;
                }
            }
        }

        return count === 0 ? (box.y0 + box.y1) / 2 : sum / count;
    }

    return Math.abs(measureMeanRow(box.x0, box.x0 + quarter) - measureMeanRow(box.x1 - quarter, box.x1)) >= share * (box.y1 - box.y0);
}

/**
 * Letter heights of a figure, in pixels.
 */
type TypeHeights = {
    /** Median height. */
    median: number;
    /** Height that the tallest tenth of the letters reach. */
    tallest: number;
};

/**
 * Measures the median height of the letters of a figure: of the pieces of ink that are
 * neither specks nor long, flat or hollow, and no taller than a fifth of the figure's shorter
 * side.
 *
 * @param image - Image.
 * @param region - Region to be read, or null for the whole image.
 * @param parameters - Thresholds.
 * @returns The median height and the height the tallest tenth reach, or 0 with under twenty such pieces.
 */
function measureTypeHeight(image: RgbaImage, region: Box | null, parameters: Parameters): TypeHeights
{
    const area = region === null ? null : clampBox(region, image.width, image.height);
    const read = area === null || area.x1 - area.x0 < 1 || area.y1 - area.y0 < 1 ? image : cropImage(image, area);
    const { components } = findConnectedComponents(createDarkMask(read, parameters.inkThreshold, false, parameters.maxChroma));
    const tallest = Math.min(read.width, read.height) / 5;
    const heights = new Array<number>();

    for (const component of components)
    {
        const width = component.box.x1 - component.box.x0;
        const height = component.box.y1 - component.box.y0;

        if (height >= 6 && height <= tallest && width <= 2.5 * height && 6 * width >= height && component.area >= 0.12 * width * height)
        {
            heights.push(height);
        }
    }

    if (heights.length < 20)
    {
        return { median: 0, tallest: 0 };
    }

    heights.sort(compareNumbers);

    return { median: heights[heights.length >> 1], tallest: heights[Math.floor(0.9 * heights.length)] };
}

/**
 * Runs the full pipeline on one image at the size given.
 *
 * @param givenImage - Decoded RGBA image, as drawn.
 * @param options - OCR engine, name list, region and threshold overrides.
 * @returns The extraction document.
 */
async function extractTreeAtSize(givenImage: RgbaImage, options: Partial<ExtractOptions> = {}): Promise<ExtractionDocument>
{
    const first = await extractTreeOnce(givenImage, options);
    const find = first.orientationFind;
    const rotation = options.parameters?.rotation ?? defaultParameters.rotation;

    // An undecided figure is read as it stands. Where as many branch ends have their label
    // above or below as beside them, it may be a tree on its side with level notes scattered
    // over it (Funston 2026: 23 ends with a label to the right, 22 with one above), so it is
    // read turned as well, and the reading that names clearly more tips is kept.
    // A figure taken for root-left with much of its lettering on its side is doubtful in the
    // same way: a root-left tree's text is level, and here the level text is the notes, the
    // key and the axis (Penkalski 2018: 17 ends with a label to the right against 7 above,
    // and a third of the glyphs sideways).
    const glyphs = find === null ? 0 : find.uprightGlyphs + find.sidewaysGlyphs;
    const sideways = find !== null && first.document.profile.orientation === "root-left" && glyphs > 0 && find.sidewaysGlyphs >= sidewaysShare * glyphs;
    const undecided = first.document.profile.orientation === "unknown";

    if (rotation !== "auto" || find === null || find.slanted || !(undecided || sideways))
    {
        return first.document;
    }

    let best = first.document;
    let bestScore = countPlacedTips(best);

    // A reading that named half its tips stands the right way up: a turned one would have to
    // name a quarter more again to replace it, and each is a full reading with its own OCR
    // (Fonseca 2024, 161 tips named, was read twice more on its side).
    if (bestScore >= 4 && 2 * bestScore >= best.tips.length)
    {
        return best;
    }

    for (const turned of ["root-bottom", "root-top"] as const)
    {
        const ends = turned === "root-bottom" ? find.topEnds : find.bottomEnds;

        if (ends < 3 || (!sideways && 2 * ends < find.rightEnds))
        {
            continue;
        }

        const other = (await extractTreeOnce(givenImage, { ...options, parameters: { ...options.parameters, rotation: turned } })).document;
        const score = countPlacedTips(other);

        if (score >= bestScore + Math.max(3, Math.round(bestScore / 4)))
        {
            best = other;
            bestScore = score;
        }
    }

    return best;
}

/**
 * Share of a figure's glyphs set on their side from which a root-left reading is doubted.
 */
const sidewaysShare = 0.3;

/**
 * One reading of a figure, with what was found about how it stands.
 */
type Reading = {
    /**
     * The extraction.
     */
    document: ExtractionDocument;

    /**
     * The orientation finder's evidence, or null when it was not asked.
     */
    orientationFind: OrientationFind | null;
};

/**
 * Counts the tips of the main tree that a reading placed: those given an accepted name, or,
 * where no label was read at all, those with a label row.
 *
 * @param document - The extraction.
 * @returns The count.
 */
function countPlacedTips(document: ExtractionDocument): number
{
    const nodes = new Map<string, TreeNode>();

    for (const node of document.nodes)
    {
        nodes.set(node.id, node);
    }

    const inTree = new Set<string>();
    const pending = document.root === null ? [] : [document.root];

    while (pending.length > 0)
    {
        const id = pending.pop() as string;
        const node = nodes.get(id);

        if (node === undefined)
        {
            inTree.add(id);
        }
        else
        {
            pending.push(...node.children);
        }
    }

    let named = 0;
    let rowed = 0;
    let read = false;

    for (const tip of document.tips)
    {
        read = read || tip.label !== null;

        if (inTree.has(tip.id))
        {
            named += tip.match !== null && tip.match.accepted ? 1 : 0;
            rowed += tip.textLine !== null ? 1 : 0;
        }
    }

    return read ? named : rowed;
}

/**
 * Reads a figure once, standing the way the options give or the way it is found to stand.
 *
 * @param givenImage - Decoded RGBA image.
 * @param options - OCR engine, name list, region and threshold overrides.
 * @returns The extraction and the orientation evidence.
 */
async function extractTreeOnce(givenImage: RgbaImage, options: Partial<ExtractOptions> = {}): Promise<Reading>
{
    const parameters = { ...defaultParameters, ...options.parameters };
    // A figure drawn light on dark, a scan printed in negative or a screenshot in a dark
    // theme, is turned into dark on light; everything after works on that.
    const inverted = isDrawnOnDark(givenImage);
    const excluded = options.exclude ?? [];
    const readable = inverted ? invertImage(givenImage) : givenImage;
    const blanked = excluded.length === 0 ? readable : blankAreas(readable, excluded);
    // Gray bands behind the figure are lifted to white first of all: the rules ruled over
    // them are then thin gray on white.
    const pictured = options.findPictures === false ? { image: blanked, grounds: 0 } : blankPictures(blanked, parameters.maxChroma);
    const banded = flattenGrayBands(pictured.image, parameters.maxChroma);
    // The rules of a time scale go next: turned, they are uprights the height of the tree.
    const unruled = eraseScaleRules(banded.image);
    // Then dotted guide lines: their dots pass for letters, hundreds of them, and a
    // figure's letter height is then the height of a dot (Fiorillo 2014).
    const undotted = eraseDottedLines(unruled.image);
    // So does a ground as dark as ink, which would be one solid block of it.
    const cleared = clearDarkGrounds(undotted.image, parameters.maxChroma, parameters.lineThreshold, parameters.inkThreshold, parameters.coloredThreshold, parameters.coloredMinChroma);
    const sourceImage = cleared.image;
    const sourceRegion = options.region === undefined || options.region === null ? null : clampBox(options.region, sourceImage.width, sourceImage.height);

    if (sourceRegion !== null && (sourceRegion.x1 - sourceRegion.x0 < 1 || sourceRegion.y1 - sourceRegion.y0 < 1))
    {
        throw new Error("the region to analyze is empty");
    }

    // A tree drawn on its side is turned so that its root is on the left. The decision is made
    // on the region alone, since the rest of a page can stand any way; everything after this
    // works in the turned frame, and the document says how many turns it took.
    const sourceCrop = sourceRegion === null ? sourceImage : cropImage(sourceImage, sourceRegion);
    const orientationStarted = performance.now();
    const inkAdaptation = parameters.adaptiveInk ? adaptInkThresholds(parameters, sourceCrop) : null;
    const orientationFind = parameters.rotation === "auto" ? detectOrientation(sourceCrop, parameters.inkThreshold, parameters.lineThreshold, parameters.maxChroma, parameters.coloredThreshold, parameters.coloredMinChroma, parameters.markerRadius) : null;
    const forced = parameters.rotation === "root-bottom" || parameters.rotation === "root-top" ? parameters.rotation : null;
    // Wedges that open to the right say where the tips are: the collapsed clades of a tree
    // with its root on the left. Their names stand under them, and by the branch ends alone
    // such a figure looks like one on its side (Yu 2018: no end with a label to its right,
    // five with one above).
    const opensRight = parameters.rotation === "auto" && flattenWedges(sourceCrop, parameters.inkThreshold).lines >= wedgesForFarRows;
    const orientation: Orientation = forced ?? (orientationFind === null || opensRight ? "root-left" : orientationFind.orientation);
    const slantedFigure = parameters.slantedTrees && orientationFind !== null && orientationFind.slanted;
    const quarterTurns = orientation === "root-bottom" ? 1 : orientation === "root-top" ? 3 : 0;
    const turnedImage = quarterTurns === 0 ? sourceCrop : rotateRgbaQuarter(sourceCrop, quarterTurns === 1);
    // The figure's profile says whether it is drawn over bands, which it reads off the image
    // as it was before they were lifted.
    const bandedCrop = banded.grounds === 0 ? null : sourceRegion === null ? blanked : cropImage(blanked, sourceRegion);
    const tintImage = bandedCrop === null ? undefined : quarterTurns === 0 ? bandedCrop : rotateRgbaQuarter(bandedCrop, quarterTurns === 1);
    // Branches drawn in dashes are drawn solid, now that the way the tree runs is known.
    const dashed = joinDashedLines(turnedImage, parameters.inkThreshold);
    // And bars drawn in hatching are filled.
    const hatched = fillHatchedBars(dashed.image, parameters.inkThreshold);
    const flattened = flattenWedges(hatched.image, parameters.inkThreshold);
    const image = flattened.image;
    const orientationIssues = describeOrientation(orientationFind, quarterTurns);

    if (pictured.grounds > 0)
    {
        const places = new Array<string>();

        for (const box of pictured.boxes ?? [])
        {
            places.push(`x ${box.x0}-${box.x1}, y ${box.y0}-${box.y1}`);
        }

        orientationIssues.push({ severity: "info", code: "pictures-blanked", message: `${pictured.grounds} picture(s) in full color beside the tree were left out, at ${places.join("; ")} of the image as given`, subject: null });
    }

    if (banded.grounds > 0)
    {
        orientationIssues.push({ severity: "info", code: "gray-bands-flattened", message: "gray bands behind the figure were lifted to white before it was read", subject: null });
    }

    if (unruled.rules > 0)
    {
        orientationIssues.push({ severity: "info", code: "scale-rules-erased", message: `${unruled.rules} thin gray rule(s) ruled across the plot were left out as the rules of a time scale`, subject: null });
    }

    if (flattened.lines > 0)
    {
        orientationIssues.push({ severity: "info", code: "wedges-flattened", message: `${flattened.lines} wedge(s) drawn for collapsed clades were read as branches`, subject: null });
    }

    if (hatched.lines > 0)
    {
        orientationIssues.push({ severity: "info", code: "hatched-bars-filled", message: `${hatched.lines} bar(s) drawn in hatching were read as solid bars`, subject: null });
    }

    if (dashed.lines > 0)
    {
        orientationIssues.push({ severity: "info", code: "dashed-lines-joined", message: `${dashed.lines} dashed line(s) were read as solid branches`, subject: null });
    }

    if (cleared.grounds > 0)
    {
        orientationIssues.unshift({ severity: "info", code: "dark-grounds-cleared", message: `${cleared.grounds} dark area(s) behind the tree were left out as its ground`, subject: null });
    }

    if (undotted.lines > 0)
    {
        orientationIssues.unshift({ severity: "info", code: "dotted-lines-erased", message: `${undotted.lines} dotted line(s) ruled across the figure were left out`, subject: null });
    }

    if (excluded.length > 0)
    {
        orientationIssues.unshift({ severity: "info", code: "areas-excluded", message: `${excluded.length} area(s) of the image were left out, as asked`, subject: null });
    }

    if (inverted)
    {
        orientationIssues.unshift({ severity: "info", code: "figure-inverted", message: "the figure is drawn light on dark and was read in negative", subject: null });
    }

    if (inkAdaptation !== null)
    {
        orientationIssues.unshift(inkAdaptation);
    }

    const fullWidth = quarterTurns % 2 === 0 ? sourceImage.width : sourceImage.height;
    const fullHeight = quarterTurns % 2 === 0 ? sourceImage.height : sourceImage.width;
    const region = sourceRegion === null ? null : rotateBox(sourceRegion, sourceImage.width, sourceImage.height, quarterTurns);
    const names = options.names ?? [];
    const knownNames = options.knownNames ?? [];
    const knownClades = options.knownClades ?? [];
    const timings: Record<string, number> = { orientation: Math.round(performance.now() - orientationStarted) };
    let clock = performance.now();

    const progress = options.progress ?? null;

    function recordLap(stage: string): void
    {
        const now = performance.now();
        timings[stage] = Math.round(now - clock);
        clock = now;
    }

    function announce(stage: string): void
    {
        if (progress !== null)
        {
            progress.report(stage, 0, 0);
        }
    }

    announce("Preparing masks");
    const { gray, textInk, runInk, lineInk, glyphMask, markers, paleMarkers, knownLines, fragmented, widened, glyphHeight, roughLines } = prepareMasks(image, parameters, flattened.lines >= wedgesForFarRows);
    recordLap("masks");
    announce("Finding segments");

    // The shortest run that counts as a line must exceed the line thickness, or a thick vertical
    // reads as a stack of short horizontal runs and glues every branch it touches into one blob.
    const thickness = estimateLineThickness(lineInk);
    const minHorizontalRun = Math.max(parameters.minHorizontalRun, 2 * thickness);

    // A numbered disc over a junction cuts the branches there; a cross painted through it, in
    // the copy the segments are taken from, lets them run on.
    const nodeDiscs = parameters.nodeDiscs ? findNodeDiscs(textInk, lineInk, glyphHeight, thickness, createDarkMask(image, 230, false, parameters.maxChroma), createDarkMask(image, parameters.lineThreshold, true, parameters.maxChroma)) : [];
    // A dot no larger than a letter, on a node beside a tip's label, stands in the label's
    // row: the row then begins at the node, and the tip's branch lies inside it. The row is
    // made to begin after the dot, and the dot is left out when the text is found again.
    const smallDiscs = new Array<Box>();

    for (const disc of nodeDiscs)
    {
        if (Math.max(disc.x1 - disc.x0, disc.y1 - disc.y0) < 1.2 * glyphHeight)
        {
            smallDiscs.push(disc);
        }
    }

    for (const line of roughLines)
    {
        for (const disc of smallDiscs)
        {
            const overlap = Math.min(disc.y1, line.box.y1) - Math.max(disc.y0, line.box.y0);
            const atStart = disc.x0 >= line.box.x0 - 2 && disc.x0 <= line.box.x0 + glyphHeight;

            if (atStart && 2 * overlap >= disc.y1 - disc.y0 && line.box.x1 - disc.x1 >= 2 * glyphHeight)
            {
                line.box = { x0: disc.x1 + 1, y0: line.box.y0, x1: line.box.x1, y1: line.box.y1 };
            }
        }
    }

    const lineArt: Mask = { width: lineInk.width, height: lineInk.height, data: new Uint8Array(lineInk.data) };
    paintCrosses(lineArt, nodeDiscs, thickness, 1.2 * glyphHeight);
    // The extractor judges a run's thickness on the text ink around it, so the disc goes there too.
    const inkForRuns: Mask = { width: runInk.width, height: runInk.height, data: new Uint8Array(runInk.data) };
    paintCrosses(inkForRuns, nodeDiscs, thickness, 1.2 * glyphHeight);

    // A chain of open marks on a branch is taken out of the lettering and the branch drawn
    // through it; a row that began with the chain begins after it, or is no row at all.
    const markChains = parameters.nodeDiscs ? findMarkChains(textInk, lineInk, glyphHeight, thickness) : [];

    for (const chain of markChains)
    {
        const middle = Math.round((chain.y0 + chain.y1) / 2);
        const half = Math.max(1, Math.round(thickness / 2));

        for (const mask of [lineArt, inkForRuns])
        {
            for (let y = Math.max(0, chain.y0); y < Math.min(mask.height, chain.y1); y++)
            {
                for (let x = Math.max(0, chain.x0 - 2); x < Math.min(mask.width, chain.x1 + 2); x++)
                {
                    mask.data[y * mask.width + x] = y >= middle - half && y < middle + half ? 1 : 0;
                }
            }
        }

        for (const line of roughLines)
        {
            const overlap = Math.min(chain.y1, line.box.y1) - Math.max(chain.y0, line.box.y0);

            // Also a row that began a little before the chain, with the stub of branch the
            // chain starts from.
            if (2 * overlap >= chain.y1 - chain.y0 && line.box.x0 >= chain.x0 - 2 * glyphHeight && line.box.x0 <= chain.x1)
            {
                line.box = { x0: Math.min(line.box.x1, chain.x1 + 1), y0: line.box.y0, x1: line.box.x1, y1: line.box.y1 };
            }
        }
    }

    // A support value printed on a node, in a gap left in the lines, is joined through too.
    const junctionNumbers = new Array<Box>();

    for (const line of roughLines)
    {
        const width = line.box.x1 - line.box.x0;
        const height = line.box.y1 - line.box.y0;

        // A digit or three: not a sliver of a line that passed for a glyph.
        if (line.glyphCount <= 3 && width <= 3 * glyphHeight && height <= 1.6 * glyphHeight && width >= 0.3 * glyphHeight && height >= 0.5 * glyphHeight)
        {
            junctionNumbers.push(line.box);
        }
    }

    joinThroughNumbers(lineArt, lineInk, junctionNumbers, glyphHeight, thickness);
    joinThroughNumbers(inkForRuns, lineInk, junctionNumbers, glyphHeight, thickness);
    // A solid mark drawn on a branch is taken off it, and the branch drawn through.
    // Not one with a label beginning after it on its own level: that is the bar of a tip's
    // range, or a marker before its name, and the tip's branch ends at it.
    const branchMarks = new Array<Box>();

    for (const mark of parameters.nodeDiscs ? findBranchMarks(textInk, nodeDiscs, glyphHeight, thickness) : [])
    {
        let labelled = false;

        for (const line of roughLines)
        {
            const level = Math.min(line.box.y1, mark.y1) - Math.max(line.box.y0, mark.y0) >= 0.5 * Math.min(line.box.y1 - line.box.y0, mark.y1 - mark.y0);
            labelled = labelled || (level && line.glyphCount >= 3 && line.box.x0 >= mark.x0 && line.box.x0 <= mark.x1 + 3 * glyphHeight);
        }

        if (!labelled)
        {
            branchMarks.push(mark);
        }
    }

    // The lines that arrive at a mark are looked for in the ink without the marks: a mark's
    // own ink would pass for a line on every side of it.
    const inkBesideMarks = branchMarks.length === 0 ? lineInk : blankMaskAreas(lineInk, branchMarks);
    joinThroughNumbers(lineArt, inkBesideMarks, branchMarks, glyphHeight, thickness, true);
    joinThroughNumbers(inkForRuns, inkBesideMarks, branchMarks, glyphHeight, thickness, true);
    // A range drawn as a hollow bar is drawn as a line, in both inks alike.
    const hollowDrawn = drawHollowBars(lineArt, thickness, Math.round(0.8 * glyphHeight), 3 * glyphHeight);
    drawHollowBars(inkForRuns, thickness, Math.round(0.8 * glyphHeight), 3 * glyphHeight);
    const probe = extractSegments(lineArt, minHorizontalRun, Number.MAX_SAFE_INTEGER);
    const thicknesses = new Array<number>();

    // Only long pieces count: a silhouette or a box is a blob of wide runs, not a thick line,
    // and would push the shortest vertical run past the figure's own node connectors.
    for (const segment of probe.horizontals)
    {
        const width = segment.box.x1 - segment.box.x0;
        const height = segment.box.y1 - segment.box.y0;

        // And only level ones: the shaft of an arrow comes as a box many times taller than
        // the stroke, two letters tall or more, nearly all white, and with its ink at one
        // height on the left and another on the right. Four of them put the shortest
        // vertical past a node's own (Carr 2010). The frame of a time scale is as tall and
        // as white, and level (Perez-Pueyo 2019).
        const slanted = height > 2 * glyphHeight && measureInkShare(lineArt, segment.box) < 0.25 && climbsAcross(lineArt, segment.box);

        if (width >= 4 * height && !slanted)
        {
            thicknesses.push(height);
        }
    }

    thicknesses.sort(compareNumbers);
    const thickest = thicknesses.length === 0 ? thickness : thicknesses[Math.floor(thicknesses.length * 0.9)];
    const minVerticalRun = Math.max(parameters.minVerticalRun, 2 * thickness, Math.round(1.5 * thickest) + 1);

    // A support label drawn over a branch with a white background box can hide up to its own
    // width of line; horizontal pieces are rejoined across that much, verticals across far less.
    const reach = Math.round(parameters.labelReach * glyphHeight);

    // Rows of label text, widened by a glyph on each side because a first letter that touches
    // its branch is often missing from the rough pass. Line art is clipped out of them. Short rows
    // are support values, which sit on branches and must not clip them.
    const textRows = new Array<Box>();
    const letterRows = new Array<Box>();
    const reachRows = new Array<Box>();
    // The ink of marks on branches: line ink, and with it the chains of open marks, which
    // are lettering by their ink.
    const marksInk: Mask = { width: lineInk.width, height: lineInk.height, data: new Uint8Array(lineInk.data) };

    for (const chain of markChains)
    {
        for (let y = Math.max(0, chain.y0); y < Math.min(marksInk.height, chain.y1); y++)
        {
            for (let x = Math.max(0, chain.x0); x < Math.min(marksInk.width, chain.x1); x++)
            {
                marksInk.data[y * marksInk.width + x] = Math.max(marksInk.data[y * marksInk.width + x], textInk.data[y * marksInk.width + x]);
            }
        }
    }

    const labelRows = new Array<Box>();
    const markerInk = unionMask(markers, paleMarkers);

    // In a figure with thick colored branches the rough rows are parted where a line runs
    // through them; elsewhere a row with a stretch of line in it is a label with its bar.
    for (const line of splitRowsAtLines(roughLines, glyphMask, knownLines ?? lineInk, glyphHeight, knownLines === null))
    {
        // Touching letters, or an underscore joining words, can make a whole label one component.
        const width = line.box.x1 - line.box.x0;
        const wordsMerged = width >= 6 * glyphHeight;
        // A row that is a range bar or oval alone, with no letters, is no text row: it must
        // neither clip the branch that runs into it nor stand in for a label.
        // Nor is a row of solid marks set on a branch, squares for the characters that change
        // on it: they stand in a row like letters, and the row would clip the branch they are
        // drawn on (Serrano-Branas 2016, six squares on a stem). Their ink is line ink.
        // Half the box, and the row's own ink within a tenth or so: a label beside a thick
        // bar has its letters besides, and one printed on a solid bar lies in line ink that
        // is far more than its letters (Wang 2025, a clade's name on its bar).
        const lineShare = measureInkShare(marksInk, line.box);
        // And several marks, each no longer than two letters and a half: one long block that
        // is all line ink is a range bar, and the row it makes is where its branch stops.
        const inkShare = measureInkShare(textInk, line.box);
        const marks = line.glyphCount >= 4 && width <= 2.5 * glyphHeight * line.glyphCount && lineShare >= 0.5 && lineShare >= 0.9 * inkShare && lineShare <= 1.15 * inkShare;
        const marker = measureInkShare(markerInk, line.box) >= 0.5 || marks;

        if ((line.glyphCount >= 5 || wordsMerged) && width >= 3 * glyphHeight && !marker)
        {
            labelRows.push(line.box);
            textRows.push({ x0: line.box.x0 - glyphHeight, y0: line.box.y0 - 2, x1: line.box.x1 + glyphHeight, y1: line.box.y1 + 2 });
            // The rough pass may have taken a small node touching the label for part of it,
            // its stem and vertical with it. The row still clips line art over its whole
            // width, but where its letters begin is what tells a letter's stroke from that
            // node's vertical, and a branch reaching the row from one running inside it.
            const letters = shrinkToLetters(line.box, glyphMask, lineInk);
            // A vertical is a letter's stroke only among the letters: the glyph's width of
            // margin before a label is where a small node's vertical stands.
            letterRows.push({ x0: letters.x0 - 2, y0: letters.y0 - 2, x1: letters.x1 + 2, y1: letters.y1 + 2 });
            reachRows.push({ x0: letters.x0 - glyphHeight, y0: letters.y0 - 2, x1: letters.x1 + glyphHeight, y1: letters.y1 + 2 });
        }
    }

    const { horizontals, verticals: allVerticals, bridgedGaps } = extractSegments(
        lineArt,
        minHorizontalRun,
        minVerticalRun,
        reach,
        Math.round(1.2 * glyphHeight),
        inkForRuns,
        glyphHeight,
        textRows,
        parameters.gapInkShare,
        letterRows,
        reachRows,
        knownLines,
    );
    // A sliver a few pixels wide and tall beside a vertical is its rounded end or a stray edge,
    // and would take the attachment of a branch that belongs to the vertical.
    const keptVerticals = new Array<Segment>();

    for (const segment of allVerticals)
    {
        const width = segment.box.x1 - segment.box.x0;
        const height = segment.box.y1 - segment.box.y0;

        // A column of drawings standing one above the other, tail to head, is as tall as a
        // vertical and several times as broad (Senter 2012, a silhouette at every tip). No
        // column of it holds ink for a quarter of its height, which tells it from the
        // verticals of several nodes a few pixels apart; and an eighth of its rows hold a
        // stretch of ink over twice a line's thickness, which tells it from a line drawn
        // leaning (Averianov 2021, Sues 2014). A thick line drawn at a slant has such rows
        // too, and its box is broader than eight thicknesses (Novas 2013).
        const ragged = width > 3 * thickness + 2 && width <= 8 * thickness && measureLongestColumnRun(lineArt, segment.box) < 0.25 * height && countBroadRows(lineArt, segment.box, 2 * thickness + 1) >= 0.125 * height;

        if ((width > thickness / 3 || height > 3 * thickness) && !ragged)
        {
            keptVerticals.push(segment);
        }
    }

    // A branch run on to the vertical just behind the corner it turns begins at the corner.
    trimBranchesAtCorners(horizontals, keptVerticals, thickness, glyphHeight);
    // Two nodes' verticals standing end to end, a line width apart, are one line with a jog.
    const jogs = splitJoggedVerticals(keptVerticals, horizontals, lineArt, thickness, Math.max(4, Math.round(glyphHeight / 2)));
    const verticals = jogs.verticals;

    const chartStrips: ChartStripFind = parameters.chartStrips ? removeChartStrips(horizontals, verticals, image.width, image.height, glyphHeight, thickness) : { issues: [], axisRules: [], axisTicks: [] };
    const frameIssues = [...removeFrameSegments(horizontals, image.width, image.height), ...removeFrameSegments(verticals, image.width, image.height), ...chartStrips.issues, ...removeChartLines(horizontals, verticals, image.width, image.height)];

    // A box inside the figure that nothing crosses goes, frame and contents: a legend, or a
    // time scale drawn as a column of cells.
    for (const inset of dropInsets(horizontals, verticals, 3 * glyphHeight, Math.max(3, Math.round(thickness) + 2)))
    {
        frameIssues.push({
            severity: "info",
            code: "inset-dropped",
            message: `a boxed inset at x ${inset.x0}-${inset.x1}, y ${inset.y0}-${inset.y1}, such as a legend or a time scale, was left out of the tree`,
            subject: null,
        });
    }

    // A range drawn as a hollow bar is one branch: what the ink did not show as a bar, two
    // thin segments side by side with a cap at each end still may.
    const hollowBars = hollowDrawn + mergeHollowBars(horizontals, verticals, Math.max(3, Math.round(thickness) + 1), Math.round(0.8 * glyphHeight));

    if (hollowBars > 0)
    {
        frameIssues.push({ severity: "info", code: "hollow-bars-read", message: `${hollowBars} range(s) drawn as hollow bars were read as branches`, subject: null });
    }

    // A guide line ruled across the branches goes.
    const crossedRules = dropCrossedRules(verticals, horizontals, Math.max(3, Math.round(thickness) + 2), Math.round(0.2 * image.height), glyphHeight);

    if (crossedRules > 0)
    {
        frameIssues.push({ severity: "info", code: "rules-dropped", message: `${crossedRules} line(s) that branches cross and none ends at were left out as rules across the figure`, subject: null });
    }

    // A tree drawn with slanted risers in place of verticals gets a vertical at each fork.
    const straightened = slantedFigure ? 0 : straightenForks(textInk, lineInk, horizontals, verticals, thickness, minHorizontalRun).forks;

    if (straightened > 0)
    {
        frameIssues.push({ severity: "info", code: "forks-straightened", message: `${straightened} fork(s) drawn with slanted risers were read as nodes`, subject: null });
    }

    // A stroke of a number printed against a branch is no node on it.
    const strokes = dropCrossingStrokes(verticals, horizontals, Math.max(3, Math.round(thickness) + 2), Math.round(1.5 * glyphHeight));

    if (strokes > 0)
    {
        frameIssues.push({ severity: "info", code: "strokes-dropped", message: `${strokes} short upright(s) that a branch crosses and none ends at were left out as strokes of lettering`, subject: null });
    }

    // Steps between successive nodes of a pectinate tree can be shorter than the shortest run
    // that counts as a line; the ink between two close verticals supplies the missing branch.
    const connectors = new Set<string>();

    for (const connector of jogs.connectors)
    {
        horizontals.push(connector);
        connectors.add(connector.id);
    }

    // Everywhere, only the step of a staircase a few pixels long; the wider search is a setting.
    const connectorGap = parameters.shortConnectors ? minHorizontalRun : 3;

    for (const connector of findShortConnectors(lineInk, verticals, horizontals, connectorGap, thickness, horizontals.length + 1, !parameters.shortConnectors))
    {
        horizontals.push(connector);
        connectors.add(connector.id);
    }

    // The piece of branch from a node into a range bar, where it is too short to be a line.
    if (parameters.extendThroughShapes)
    {
        const bars = keepSmallShapes(parameters.paleMarkers ? unionMask(markers, paleMarkers) : markers, Infinity, 2.5 * glyphHeight);
        let highest = 0;

        // Segments have been dropped along the way, so their count is no guide to a free
        // identifier.
        for (const segment of horizontals)
        {
            highest = Math.max(highest, Number(segment.id.slice(1)) || 0);
        }

        for (const stub of findMarkerStubs(lineInk, verticals, horizontals, bars, minHorizontalRun, thickness, highest + 1))
        {
            horizontals.push(stub);
            highest++;
        }

        // And the branch that is nothing but a solid bar starting at its node.
        const solidBars = new Array<Box>();

        for (const component of findConnectedComponents(findFatShapes(lineInk, Math.max(parameters.markerRadius, Math.round(thickness) + 1))).components)
        {
            const wide = component.box.x1 - component.box.x0;
            const tall = component.box.y1 - component.box.y0;

            if (wide >= 2 * tall && tall <= 2.5 * glyphHeight && component.area >= 0.8 * wide * tall)
            {
                solidBars.push(component.box);
            }
        }

        for (const branch of findBarBranches(solidBars, verticals, horizontals, minHorizontalRun, thickness, highest + 1))
        {
            horizontals.push(branch);
        }
    }

    recordLap("segments");
    announce("Tracing the tree");

    // A branch end sits within about one line width of its vertical; anything looser lets a
    // tip's branch reach the wrong node.
    const tolerance = parameters.attachTolerance ?? Math.max(3, Math.round(thickness) + 2);
    const labelBoxes = new Array<Box>();

    for (const line of roughLines)
    {
        labelBoxes.push(line.box);
    }

    // A slanted figure is read from the skeleton of its line art instead of from segments; the
    // rough text rows tell its root stub, which ends in nothing, from leaders, which end at text.
    const roughBoxes = new Array<Box>();

    for (const line of roughLines)
    {
        roughBoxes.push(line.box);
    }

    // A stem run together with the bar of a tip beyond its node is two branches.
    if (!slantedFigure)
    {
        const corners = squareRoundedCorners(verticals, horizontals, textInk, Math.round(1.2 * glyphHeight));

        if (corners > 0)
        {
            frameIssues.push({ severity: "info", code: "corners-squared", message: `${corners} rounded corner(s) between a node and its branch were squared`, subject: null });
        }

        partAtCrossings(horizontals, verticals, lineInk, tolerance);
    }

    // Filled triangles at the tips of a slanted figure read as glyphs and leave the line art;
    // the fat shapes of the text ink at the tip line are what the tips' stubs run into. A first
    // trace without them finds the tip line, so that bold text inside the tree does not pass
    // for a marker.
    const tipMarkers = slantedFigure ? keepShapesBeyond(findFatShapes(subtractMask(textInk, lineInk), Math.max(2, Math.round(thickness / 5))), traceSlantedTree(lineInk, thickness, glyphHeight, roughBoxes).result.tips, 2 * glyphHeight) : null;
    const slantedTrace = slantedFigure ? traceSlantedTree(lineInk, thickness, glyphHeight, roughBoxes, tipMarkers) : null;
    const trace = slantedTrace === null ? traceRectangularTree(horizontals, verticals, tolerance, reach, labelBoxes, 3 * glyphHeight, labelRows, 1.5 * glyphHeight, connectors, flattened.lines >= wedgesForFarRows) : slantedTrace.result;
    recordLap("trace");
    announce("Finding labels");

    // Line art is what the trace used; everything else is text or noise. Range bars and branch
    // stubs that run on past a used segment into a label are erased with it.
    const usedBoxes = new Array<Box>();

    for (const segment of horizontals)
    {
        if (trace.usedSegments.has(segment.id))
        {
            usedBoxes.push(segment.box);
        }
    }

    for (const segment of verticals)
    {
        if (trace.usedSegments.has(segment.id))
        {
            usedBoxes.push(segment.box);
        }
    }

    const lineArtBoxes = [...usedBoxes, ...findStubExtensions(lineInk, usedBoxes, glyphHeight)];
    const lineArtMask = slantedTrace === null
        ? dilate(keepInkInBoxes(lineArtBoxes, textInk, glyphMask, thickness), 1)
        : dilate(slantedTrace.skeleton, Math.max(1, Math.round(thickness / 2) + 1));
    const text = detectTextLines(smallDiscs.length + markChains.length === 0 ? textInk : blankMaskAreas(textInk, [...smallDiscs, ...markChains]), { lineArtMask, minY: parameters.textMinY, markerMask: unionMask(markers, paleMarkers), rowsFarApart: flattened.lines >= wedgesForFarRows });

    // Labels set at a slant are found again in a level frame of their own; the level rows in
    // that zone, fragments of the same labels, give way to them.
    const slanted = parameters.slantedLabels ? detectSlantedLabels(textInk, lineArtMask, trace.tips, glyphHeight, (parameters.minLabelSlant * Math.PI) / 180) : null;
    // A row that is one solid piece, long and flat, is a range bar that was too thick for a
    // line and not a word: as a row it would be its own tip's label, and the name set over
    // it would go unpaired (Carr 2010, Cf. Alectrosaurus). Letters run together into one
    // piece fill far less of their box.
    const wordLines = new Array<TextLine>();

    for (const line of text.lines)
    {
        const wide = line.box.x1 - line.box.x0;
        const tall = line.box.y1 - line.box.y0;

        if (line.glyphCount > 1 || wide < 4 * tall || measureInkShare(textInk, line.box) < 0.75)
        {
            wordLines.push(line);
        }
    }

    const textLines = slanted === null ? wordLines : replaceZoneLines(wordLines, slanted);
    const slantIssues = new Array<QcIssue>();

    if (slanted !== null)
    {
        const degrees = Math.round((slanted.measure.angle * 180) / Math.PI);
        slantIssues.push({ severity: "info", code: "labels-slanted", message: `tip labels run at ${degrees} degrees (${slanted.measure.pairs} letter pairs, ${Math.round(100 * slanted.measure.share)}% agreeing); ${slanted.lines.length} row(s) found in a level frame of the label zone`, subject: null });
    }

    recordLap("text");

    const document: ExtractionDocument = {
        version: 1,
        image: pictured.boxes === undefined
            ? { width: fullWidth, height: fullHeight, source: options.source ?? null, region, quarterTurns }
            : { width: fullWidth, height: fullHeight, source: options.source ?? null, region, quarterTurns, foundExclusions: pictured.boxes },
        horizontals,
        verticals,
        textLines,
        nodes: trace.nodes,
        tips: trace.tips,
        root: trace.root,
        qc: [...orientationIssues, ...frameIssues, ...trace.issues, ...slantIssues],
        rejectedVerticals: trace.rejected,
        branches: trace.branches,
        glyphHeight: text.glyphHeight,
        profile: createEmptyProfile(),
        timings,
    };

    // One of the chart's rules carries the ages; they return for the axis reader now that the
    // tracer has had the segments without them.
    horizontals.push(...chartStrips.axisRules);
    verticals.push(...chartStrips.axisTicks);

    // A tip whose branch runs into a solid shape (a collapsed-clade wedge) or a colored marker
    // (a range oval) ends on the far side of it, where its label is.
    if (parameters.extendThroughShapes)
    {
        // A marker is no taller than a label row; its length is a range in time and can be as
        // long as the figure.
        const maxWidth = Infinity;
        const maxHeight = 2.5 * glyphHeight;
        const solidShapes = findFatShapes(lineInk, Math.max(parameters.markerRadius, Math.round(thickness) + 1));
        extendTipsThroughMarkers(document, keepSmallShapes(solidShapes, maxWidth, maxHeight), thickness, 2);
        // A wedge for a collapsed clade can open wider than a label row is tall. A shape up to
        // twice that height is passed through as well, but only where a label begins just
        // past it: a silhouette a branch happens to end at has none (Funston 2026, a wedge
        // three glyphs high at its open end).
        // The wedge is taken at the least radius: it must count as a shape from where it is
        // barely thicker than the branch that runs into it.
        extendTipsThroughMarkers(document, keepSmallShapes(findFatShapes(lineInk, parameters.markerRadius), maxWidth, 2 * maxHeight), thickness, 2, 4 * glyphHeight, 1.3 * glyphHeight);
        extendTipsThroughMarkers(document, keepSmallShapes(markers, maxWidth, maxHeight), thickness, glyphHeight);

        if (parameters.paleMarkers)
        {
            extendTipsThroughMarkers(document, keepSmallShapes(paleMarkers, maxWidth, maxHeight), thickness, glyphHeight, 4 * glyphHeight, 1.3 * glyphHeight);
        }

        if (tipMarkers !== null)
        {
            extendTipsThroughMarkers(document, keepSmallShapes(tipMarkers, maxWidth, maxHeight), thickness, 3);
        }
    }

    // A junction the trace found nothing beyond, or one whose other children were lost, is
    // no split; it goes before the labels, so a tip never hangs from an empty node.
    const dissolved = pruneDegenerateNodes(document);

    if (dissolved > 0)
    {
        document.qc.push({ severity: "info", code: "degenerate-node-dissolved", message: `${dissolved} node(s) with fewer than two children were dissolved`, subject: null });
    }

    // A node whose vertical is several close verticals read as one is taken apart again.
    if (slantedTrace === null)
    {
        document.qc.push(...resolveStaircases(document, createDarkMask(image, parameters.lineThreshold, true, parameters.maxChroma), thickness));
    }

    assignLabels(document);

    // A label left without a tip beside the end of an elbow gives away a second tip there.
    if (slantedTrace === null)
    {
        document.qc.push(...recoverElbowTips(document));
        document.qc.push(...joinWrappedBranches(document));
    }

    // A clade's name printed on the box or band that shades it. A slanted figure's rows are
    // measured in turned frames, which the region search does not follow.
    if (slantedTrace === null)
    {
        assignBoxedNames(document, image);
    }

    // A slanted tree's spurs were pruned on the skeleton, and its labels pair less surely
    // (slanted text, tips at every depth), so an unlabelled tip is not debris there.
    if (slantedTrace === null && parameters.dropDebris)
    {
        removeDebrisTips(document, 3 * glyphHeight, glyphHeight);
    }

    // Clade brackets, axes and legends trace into small pieces beside the tree; they go now,
    // before any label of theirs is read.
    document.qc.push(...pruneDecorations(document));

    if (chooseRoot(document))
    {
        document.qc.push({ severity: "info", code: "root-changed", message: `the main tree is now ${document.root ?? ""}, the piece with the most tips once debris and decorations were removed`, subject: document.root });
    }

    recordLap("assign");

    // The profile is measured before labels are read, since reading them uses it (how far to
    // condense the crops); the parts that the read text can change are measured again after.
    document.profile = measureProfile({ image, tintImage, textInk, lineInk, glyphMask, glyphHeight, thickness, fragmented, widened, bridgedGaps, document });
    document.profile.orientation = orientation;

    if (slantedTrace !== null)
    {
        document.profile.layout = "slanted";
        document.profile.confidence.layout = 1;
    }

    applyProfileOverrides(document.profile, parameters.profileOverrides);
    // When the tips end on one line, a label row at that line with no tip is a missed branch;
    // it is looked for in the line ink and added before labels are read.
    document.qc.push(...recoverAlignedTips(document, lineInk, thickness, minHorizontalRun));
    document.qc.push(...dropAxisTips(document, glyphHeight));

    if (slantedTrace !== null)
    {
        document.qc.push(...dropTipsBehindLine(document, glyphHeight));
    }

    recordLap("profile");

    if (options.ocr)
    {
        const erased = paintMask(gray, lineArtMask, 255);
        // Large letters need no upscaling for Tesseract and cost it time in proportion to their
        // area, so the scale brings letters to about the target height and no further.
        const ocrScale = Math.min(parameters.ocrScale, Math.max(1, parameters.ocrGlyphTarget / glyphHeight));
        await readLabels(document, erased, options.ocr, ocrScale, names, knownNames, progress, knownClades);

        const cladeNames = restoreCladeNames(document, names.length > 0);

        if (cladeNames > 0)
        {
            document.qc.push({ severity: "info", code: "clade-names-restored", message: `${cladeNames} clade name(s) printed against a node, taken for tips, were given to their nodes`, subject: null });
        }

        // A slanted figure's leader lines to bracketed numbers run the tips' way and read as
        // numbers; they are debris whatever their length.
        removeNumericDebrisTips(document, slantedTrace === null ? 3 * glyphHeight : Infinity, slantedTrace === null && parameters.dropDebris ? 3 * glyphHeight : 0);

        // Reading the labels can turn a piece's tips into debris, and says which piece is the
        // tree; the main tree is chosen again, by named tips first.
        if (chooseRoot(document, true))
        {
            document.qc.push({ severity: "info", code: "root-changed", message: `the main tree is now ${document.root ?? ""}, the piece with the most tips once labels were read`, subject: document.root });
        }

        assignLeftoverNames(document, names);
        measureTextMarks(document.profile, document, textInk, glyphHeight);

        if (document.profile.timeScaled.axis !== null)
        {
            document.profile.timeScaled.calibration = await calibrateAxis(document, textInk, gray, options.ocr, glyphHeight, thickness);

            if (document.profile.timeScaled.calibration !== null)
            {
                document.qc.push(...assignAges(document, document.profile.timeScaled.calibration));
            }
        }

        recordLap("ocr");
    }

    document.qc.push(...checkTipAlignment(document));

    // A phylogram with no readable axis still says something by its branch lengths; they are
    // written in pixels.
    if (document.profile.timeScaled.calibration === null && !document.profile.tipAlignment.aligned && slantedTrace === null && document.root !== null)
    {
        const assigned = assignPixelLengths(document);

        if (assigned > 0)
        {
            document.qc.push({ severity: "info", code: "branch-lengths-pixels", message: `tips are not aligned and no time axis was read, so the ${assigned} branch length(s) are written in pixels`, subject: null });
        }
    }

    document.qc.push(...dropLooseTips(document));
    runQualityChecks(document);

    // The checks about loose pieces are made again now that every step has had its say.
    refreshDisconnectedIssues(document);

    // And the reading as a whole is judged, first in the list.
    const doubt = assessReading(document, names.length > 0, options.ocr !== undefined && options.ocr !== null);

    if (doubt !== null)
    {
        document.qc.unshift(doubt);
    }

    if (region !== null)
    {
        translateDocument(document, region.x0, region.y0);
    }

    return { document, orientationFind };
}

/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { GFXPoint, GFXRect, GFXAffineTransform } from "../GraphicsFX/GFXGeometry";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import type { GFXPathCommand } from "../GraphicsFX/graphicsTypes";
import type { IFXBarcodeDescriptorData, IFXQRCodeErrorCorrectionLevel } from "./IFXBarcodeDescriptor";
import type { IFXModelAsset, IFXModelQualityLevel } from "./analysis/IFXModelBackend";
export type IFXColourComponents = readonly [
    number,
    number,
    number,
    number
];
export type IFXBlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "difference" | "exclusion" | "hardLight" | "softLight" | "colourDodge" | "colourBurn" | "sourceIn" | "sourceOut" | "sourceAtop" | "addition";
type EmptyParameters = Readonly<Record<string, never>>;
export interface IFXFilterParameters {
    barcodeGenerator: {
        barcodeDescriptor: IFXBarcodeDescriptorData;
    };
    qrCodeGenerator: {
        message: readonly number[];
        correctionLevel: IFXQRCodeErrorCorrectionLevel;
    };
    code128BarcodeGenerator: {
        message: readonly number[];
        barcodeHeight: number;
        quietSpace: number;
    };
    aztecCodeGenerator: {
        message: readonly number[];
        correctionLevel: number;
        layers: number;
        compactStyle: boolean;
        quietSpace: number;
    };
    pdf417BarcodeGenerator: {
        message: readonly number[];
        correctionLevel: number;
        dataColumns: number;
        rows: number;
        compactStyle: boolean;
        quietSpace: number;
    };
    dataMatrixCodeGenerator: {
        message: readonly number[];
        rows: number;
        columns: number;
        quietSpace: number;
    };
    boxBlur: {
        radius?: number;
    };
    /** Portable baseline follows Apple's bokeh factory example; its native defaults/ranges are not documented. */
    bokehBlur: {
        radius?: number;
        ringAmount?: number;
        ringSize?: number;
        softness?: number;
    };
    gaussianBlur: {
        sigma?: number;
    };
    discBlur: {
        radius?: number;
    };
    median: {};
    morphologyMaximum: {
        radius?: number;
    };
    morphologyMinimum: {
        radius?: number;
    };
    morphologyGradient: {
        radius?: number;
    };
    /** Float dimensions are rounded to the nearest odd pixel support. */
    morphologyRectangleMaximum: {
        width: number;
        height: number;
    };
    /** Float dimensions are rounded to the nearest odd pixel support. */
    morphologyRectangleMinimum: {
        width: number;
        height: number;
    };
    /** A grayscale mask is the second image input. */
    maskedVariableBlur: {
        radius?: number;
    };
    motionBlur: {
        radius?: number;
        angle?: number;
    };
    /** Apple documents defaults of 0.02 and 0.40; the CPU kernel is a portable thresholded local filter. */
    noiseReduction: {
        noiseLevel?: number;
        sharpness?: number;
    };
    zoomBlur: {
        center?: GFXPoint;
        amount?: number;
    };
    sobelGradients: EmptyParameters;
    convolution: {
        width: number;
        height: number;
        weights: readonly number[];
        bias?: number;
        rgbOnly?: boolean;
    };
    colourPolynomial: {
        red: readonly number[];
        green: readonly number[];
        blue: readonly number[];
        alpha?: readonly number[];
    };
    colorCrossPolynomial: {
        redCoefficients: readonly number[];
        greenCoefficients: readonly number[];
        blueCoefficients: readonly number[];
    };
    hueAdjust: {
        angle?: number;
    };
    linearToSRGB: {};
    sRGBToLinear: {};
    colourAbsoluteDifference: {};
    colourCube: {
        cubeDimension?: number;
        cubeData: readonly number[];
        extrapolate?: boolean;
    };
    colorCubeWithColorSpace: {
        cubeDimension: number;
        cubeData: readonly number[];
        colorSpace: GFXColourSpace;
        extrapolate: boolean;
    };
    colorCubesMixedWithMask: {
        cubeDimension: number;
        cube0Data: readonly number[];
        cube1Data: readonly number[];
        colorSpace: GFXColourSpace;
        extrapolate: boolean;
    };
    colorCurves: {
        colorSpace: GFXColourSpace;
        curvesData: readonly number[];
        curvesDomain: readonly [number, number];
    };
    documentEnhancer: {
        amount: number;
    };
    paletteCentroid: {
        perceptual: boolean;
    };
    palettize: {
        perceptual: boolean;
    };
    photoEffectChrome: { extrapolate: boolean };
    photoEffectFade: { extrapolate: boolean };
    photoEffectInstant: { extrapolate: boolean };
    photoEffectMono: { extrapolate: boolean };
    photoEffectNoir: { extrapolate: boolean };
    photoEffectProcess: { extrapolate: boolean };
    photoEffectTonal: { extrapolate: boolean };
    photoEffectTransfer: { extrapolate: boolean };
    thermal: EmptyParameters;
    vignette: {
        intensity: number;
        radius: number;
    };
    vignetteEffect: {
        center: GFXPoint;
        falloff: number;
        intensity: number;
        radius: number;
    };
    xRay: EmptyParameters;
    /** CIConvertLab's normalized 0…1 channel encoding. The unnormalized encoding is not representable by ImageFX pixels. */
    convertLabToRGB: {
        normalize: true;
    };
    /** CIConvertLab's normalized 0…1 channel encoding. The unnormalized encoding is not representable by ImageFX pixels. */
    convertRGBtoLab: {
        normalize: true;
    };
    /** CIColorThresholdOtsu has no captured input parameters. */
    colourThresholdOtsu: EmptyParameters;
    /** CIDither requires an explicit intensity because no authoritative default was captured. */
    dither: {
        intensity: number;
    };
    /** CIColorMap accepts its gradient as its second image input. */
    colourMap: EmptyParameters;
    /** CILabDeltaE accepts its comparison image as its second image input. */
    labDeltaE: EmptyParameters;
    /** CITemperatureAndTint: x is correlated colour temperature in kelvin; y is tint. */
    temperatureAndTint: {
        neutral?: GFXPoint;
        targetNeutral?: GFXPoint;
    };
    /** CIToneCurve's five unit control points; ImageFX records, but cannot observe, its HDR extrapolation flag. */
    toneCurve: {
        point0?: GFXPoint;
        point1?: GFXPoint;
        point2?: GFXPoint;
        point3?: GFXPoint;
        point4?: GFXPoint;
        extrapolate?: boolean;
    };
    /** CIVibrance has no captured default amount. */
    vibrance: {
        amount: number;
    };
    /** CIWhitePointAdjust has no captured default white-point colour. */
    whitePointAdjust: {
        colour: IFXColourComponents;
    };
    exposure: {
        ev?: number;
    };
    gamma: {
        power?: number;
    };
    colourControls: {
        saturation?: number;
        brightness?: number;
        contrast?: number;
    };
    colourMatrix: {
        matrix: readonly number[];
        bias?: readonly number[];
    };
    colourClamp: {
        minimum?: IFXColourComponents;
        maximum?: IFXColourComponents;
    };
    threshold: {
        threshold?: number;
    };
    invert: {};
    sepia: {
        intensity?: number;
    };
    posterize: {
        levels?: number;
    };
    monochrome: {
        colour?: IFXColourComponents;
        intensity?: number;
    };
    falseColour: {
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    maskToAlpha: {};
    maximumComponent: {};
    minimumComponent: {};
    blend: {
        mode: IFXBlendMode;
    };
    colourBlendMode: EmptyParameters;
    divideBlendMode: EmptyParameters;
    hueBlendMode: EmptyParameters;
    linearBurnBlendMode: EmptyParameters;
    linearDodgeBlendMode: EmptyParameters;
    linearLightBlendMode: EmptyParameters;
    luminosityBlendMode: EmptyParameters;
    minimumCompositing: EmptyParameters;
    maximumCompositing: EmptyParameters;
    multiplyCompositing: EmptyParameters;
    pinLightBlendMode: EmptyParameters;
    saturationBlendMode: EmptyParameters;
    subtractBlendMode: EmptyParameters;
    vividLightBlendMode: EmptyParameters;
    twirl: {
        center?: GFXPoint;
        radius?: number;
        angle?: number;
    };
    /** CIBumpDistortion's documented centre, radius and concave/convex scale. */
    bumpDistortion: {
        center?: GFXPoint;
        radius?: number;
        scale?: number;
    };
    /** CIBumpDistortionLinear's documented line angle, centre, radius and scale. */
    bumpDistortionLinear: {
        center?: GFXPoint;
        radius?: number;
        angle?: number;
        scale?: number;
    };
    /** CICircleSplashDistortion's documented circular centre and radius. */
    circleSplashDistortion: {
        center?: GFXPoint;
        radius?: number;
    };
    /** CIHoleDistortion's documented circular centre and radius. */
    holeDistortion: {
        center?: GFXPoint;
        radius?: number;
    };
    /** CIPinchDistortion's documented centre, radius and pinch scale. */
    pinchDistortion: {
        center?: GFXPoint;
        radius?: number;
        scale?: number;
    };
    /** CIVortexDistortion's documented centre, radius and rotation angle. */
    vortexDistortion: {
        center?: GFXPoint;
        radius?: number;
        angle?: number;
    };
    /** Portable inverse-map adaptation; captured Core Image member keys have no pinned defaults in this programme. */
    circularWrap: { center: GFXPoint; radius: number; angle: number; };
    droste: { insetPoint0: GFXPoint; insetPoint1: GFXPoint; periodicity: number; rotation: number; strands: number; zoom: number; };
    /** Texture image is the second input. */
    glassDistortion: { center: GFXPoint; scale: number; };
    glassLozenge: { point0: GFXPoint; point1: GFXPoint; radius: number; refraction: number; };
    lightTunnel: { center: GFXPoint; radius: number; rotation: number; };
    torusLensDistortion: { center: GFXPoint; radius: number; width: number; refraction: number; };
    displacement: {
        scale?: number;
    };
    checkerboard: {
        center?: GFXPoint;
        width?: number;
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    stripes: {
        center?: GFXPoint;
        width?: number;
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    random: {
        seed?: number;
    };
    roundedRectangle: {
        rect: GFXRect;
        radius?: number;
        colour?: IFXColourComponents;
    };
    lanczosScale: {
        scale?: number;
        aspectRatio?: number;
    };
    bicubicScaleTransform: { scale: number; aspectRatio: number; parameterB: number; parameterC: number; };
    /** High-resolution guide is input 0 and the low-resolution colour image is input 1. */
    edgePreserveUpsample: { spatialSigma: number; lumaSigma: number; };
    /** Breakpoints are source-space coordinates; growAmount expands the finite output in pixels. */
    ninePartStretched: { breakpoint0: GFXPoint; breakpoint1: GFXPoint; growAmount: GFXPoint; };
    ninePartTiled: { breakpoint0: GFXPoint; breakpoint1: GFXPoint; growAmount: GFXPoint; flipYTiles: boolean; };
    stretchCrop: { size: GFXPoint; cropAmount: number; centerStretchAmount: number; };
    straighten: {
        angle?: number;
    };
    perspectiveTransform: {
        topLeft?: GFXPoint;
        topRight?: GFXPoint;
        bottomRight?: GFXPoint;
        bottomLeft?: GFXPoint;
        /** Source region. Omit to transform the whole finite input extent. */
        extent?: GFXRect;
    };
    /** CIPerspectiveTransformWithExtent requires the source region it constrains. */
    perspectiveTransformWithExtent: {
        topLeft?: GFXPoint;
        topRight?: GFXPoint;
        bottomRight?: GFXPoint;
        bottomLeft?: GFXPoint;
        extent: GFXRect;
    };
    /** Four-coordinate geometry members are inherited by the captured Core Image contracts. */
    perspectiveCorrection: { topLeft: GFXPoint; topRight: GFXPoint; bottomRight: GFXPoint; bottomLeft: GFXPoint; crop: boolean; };
    keystoneCorrectionCombined: { topLeft: GFXPoint; topRight: GFXPoint; bottomRight: GFXPoint; bottomLeft: GFXPoint; focalLength: number; };
    keystoneCorrectionHorizontal: { topLeft: GFXPoint; topRight: GFXPoint; bottomRight: GFXPoint; bottomLeft: GFXPoint; focalLength: number; };
    keystoneCorrectionVertical: { topLeft: GFXPoint; topRight: GFXPoint; bottomRight: GFXPoint; bottomLeft: GFXPoint; focalLength: number; };
    perspectiveRotate: { focalLength: number; pitch: number; roll: number; yaw: number; };
    /** Portable calibration is explicit: depthScale is world-units/sample; disparityScale is pixels/sample. */
    depthToDisparity: { focalLength: number; baseline: number; depthScale: number; disparityScale: number; };
    disparityToDepth: { focalLength: number; baseline: number; depthScale: number; disparityScale: number; };
    linearGradient: {
        point0?: GFXPoint;
        point1?: GFXPoint;
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    smoothLinearGradient: {
        point0?: GFXPoint;
        point1?: GFXPoint;
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    radialGradient: {
        center?: GFXPoint;
        radius0?: number;
        radius1?: number;
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    gaussianGradient: {
        center?: GFXPoint;
        radius?: number;
        colour0?: IFXColourComponents;
        colour1?: IFXColourComponents;
    };
    hueSaturationValueGradient: {
        colorSpace: GFXColourSpace;
        dither: number;
        radius: number;
        softness: number;
        value: number;
    };
    blurredRectangle: { color: IFXColourComponents; extent: GFXRect; sigma: number; };
    roundedRectangleStroke: { color: IFXColourComponents; extent: GFXRect; radius: number; width: number; smoothness: number; };
    /** Mesh contains point pairs describing independent line segments. */
    mesh: { color: IFXColourComponents; mesh: readonly GFXPoint[]; width: number; };
    lenticularHalo: { center: GFXPoint; color: IFXColourComponents; haloOverlap: number; haloRadius: number; haloWidth: number; striationContrast: number; striationStrength: number; time: number; };
    starShine: { center: GFXPoint; color: IFXColourComponents; crossAngle: number; crossOpacity: number; crossScale: number; crossWidth: number; epsilon: number; radius: number; };
    sunbeams: { center: GFXPoint; color: IFXColourComponents; maxStriationRadius: number; striationContrast: number; striationStrength: number; sunRadius: number; time: number; };
    /** Durable TextFX outline snapshot; fontName/fontSize are provenance metadata, never a browser-font lookup contract. */
    textImage: { text: string; fontName: string; fontSize: number; scaleFactor: number; padding: number; extent: GFXRect; paths: readonly (readonly GFXPathCommand[])[]; };
    /** Durable attributed TextFX outline snapshot. Live attributed/font objects are intentionally excluded from ImageFX graphs. */
    attributedTextImage: { text: string; scaleFactor: number; padding: number; extent: GFXRect; paths: readonly (readonly GFXPathCommand[])[]; };
    bloom: { intensity: number; radius: number; };
    comicEffect: EmptyParameters;
    /** Portable model contract; this does not accept Apple Core ML binaries. */
    coreMLModel: { model: IFXModelAsset; headIndex: number; softmaxNormalization: boolean; };
    /** Portable stochastic cell placement requires an explicit deterministic seed. */
    crystallize: { center: GFXPoint; radius: number; seed: number; };
    depthOfField: { point0: GFXPoint; point1: GFXPoint; radius: number; saturation: number; unsharpMaskIntensity: number; unsharpMaskRadius: number; };
    edgeWork: { radius: number; };
    gaborGradients: EmptyParameters;
    gloom: { intensity: number; radius: number; };
    heightFieldFromMask: { radius: number; };
    hexagonalPixellate: { center: GFXPoint; scale: number; };
    highlightShadowAdjust: { highlightAmount: number; radius: number; shadowAmount: number; };
    lineOverlay: { nrNoiseLevel: number; nrSharpness: number; contrast: number; edgeIntensity: number; threshold: number; };
    /** Input 0 is foreground and input 1 is the background image. */
    mix: { amount: number; };
    personSegmentation: { model: IFXModelAsset; qualityLevel: IFXModelQualityLevel; };
    /** Portable stochastic point placement requires an explicit deterministic seed. */
    pointillize: { center: GFXPoint; radius: number; seed: number; };
    saliencyMap: { model: IFXModelAsset; };
    /** Shading image is input 1. */
    shadedMaterial: { scale: number; };
    spotColor: {
        centerColor1: IFXColourComponents; centerColor2: IFXColourComponents; centerColor3: IFXColourComponents;
        closeness1: number; closeness2: number; closeness3: number;
        contrast1: number; contrast2: number; contrast3: number;
        replacementColor1: IFXColourComponents; replacementColor2: IFXColourComponents; replacementColor3: IFXColourComponents;
    };
    spotLight: { brightness: number; color: IFXColourComponents; concentration: number; lightPointsAt: readonly [number, number, number]; lightPosition: readonly [number, number, number]; };
    cmykHalftone: { angle: number; center: GFXPoint; grayComponentReplacement: number; sharpness: number; underColorRemoval: number; width: number; };
    hatchedScreen: { angle: number; center: GFXPoint; sharpness: number; width: number; };
    /** Input 1 is the one-row initial means image. */
    kMeans: { count: number; passes: number; perceptual: boolean; };
    dotScreen: {
        center?: GFXPoint;
        width?: number;
        angle?: number;
    };
    lineScreen: {
        center?: GFXPoint;
        width?: number;
        angle?: number;
    };
    circularScreen: {
        center?: GFXPoint;
        width?: number;
    };
    areaAverage: {
        extent: GFXRect;
    };
    areaMinimum: {
        extent: GFXRect;
    };
    areaMaximum: {
        extent: GFXRect;
    };
    areaHistogram: {
        extent: GFXRect;
        bins?: number;
    };
    areaLogarithmicHistogram: {
        extent: GFXRect;
        count?: number;
        minimumStop?: number;
        maximumStop?: number;
        scale?: number;
    };
    areaMaximumAlpha: {
        extent: GFXRect;
    };
    areaMinimumAlpha: {
        extent: GFXRect;
    };
    areaMinMax: {
        extent: GFXRect;
    };
    areaMinMaxRed: {
        extent: GFXRect;
    };
    histogramDisplay: {
        height?: number;
        highLimit?: number;
        lowLimit?: number;
    };
    rowAverage: {
        extent: GFXRect;
    };
    columnAverage: {
        extent: GFXRect;
    };
    unsharpMask: {
        sigma?: number;
        intensity?: number;
    };
    sharpenLuminance: {
        sharpness?: number;
    };
    pixellate: {
        center?: GFXPoint;
        scale?: number;
    };
    edges: {
        intensity?: number;
    };
    cannyEdgeDetector: {
        gaussianSigma?: number;
        perceptual?: boolean;
        thresholdLow?: number;
        thresholdHigh?: number;
        hysteresisPasses?: number;
    };
    blendWithMask: {
        channel?: "luminance" | "alpha" | "red" | "blue";
    };
    affineTile: {
        transform?: GFXAffineTransform;
    };
    affineClamp: {
        transform?: GFXAffineTransform;
    };
    /** Retained Core Image tile contracts: captured parameters have no pinned defaults, so they are required. */
    eightfoldReflectedTile: { angle: number; center: GFXPoint; width: number; };
    fourfoldReflectedTile: { acuteAngle: number; angle: number; center: GFXPoint; width: number; };
    fourfoldRotatedTile: { angle: number; center: GFXPoint; width: number; };
    fourfoldTranslatedTile: { acuteAngle: number; angle: number; center: GFXPoint; width: number; };
    glideReflectedTile: { angle: number; center: GFXPoint; width: number; };
    kaleidoscope: { angle: number; center: GFXPoint; count: number; };
    opTile: { angle: number; center: GFXPoint; scale: number; width: number; };
    parallelogramTile: { acuteAngle: number; angle: number; center: GFXPoint; width: number; };
    perspectiveTile: { topLeft: GFXPoint; topRight: GFXPoint; bottomRight: GFXPoint; bottomLeft: GFXPoint; };
    sixfoldReflectedTile: { angle: number; center: GFXPoint; width: number; };
    sixfoldRotatedTile: { angle: number; center: GFXPoint; width: number; };
    triangleKaleidoscope: { decay: number; point: GFXPoint; rotation: number; size: number; };
    triangleTile: { angle: number; center: GFXPoint; width: number; };
    twelvefoldReflectedTile: { angle: number; center: GFXPoint; width: number; };
    accordionFold: { time: number; bottomHeight: number; foldShadowAmount: number; numberOfFolds: number; };
    barsSwipe: { time: number; angle: number; barOffset: number; width: number; };
    copyMachine: { time: number; angle: number; color: IFXColourComponents; extent: GFXRect; opacity: number; width: number; };
    /** Mask is input 2. */
    disintegrateWithMask: { time: number; shadowDensity: number; shadowOffset: GFXPoint; shadowRadius: number; };
    flash: {
        time: number;
        center: GFXPoint;
        color: IFXColourComponents;
        extent: GFXRect;
        fadeThreshold: number;
        maxStriationRadius: number;
        striationContrast: number;
        striationStrength: number;
    };
    mod: { time: number; angle: number; center: GFXPoint; compression: number; radius: number; };
    /** Backside and shading images are inputs 2 and 3. */
    pageCurl: { time: number; angle: number; extent: GFXRect; radius: number; };
    /** Backside image is input 2. */
    pageCurlWithShadow: {
        time: number;
        angle: number;
        extent: GFXRect;
        radius: number;
        shadowAmount: number;
        shadowExtent: GFXRect;
        shadowSize: number;
    };
    /** Shading image is input 2. */
    ripple: { time: number; center: GFXPoint; extent: GFXRect; scale: number; width: number; };
    dissolve: {
        time?: number;
    };
    swipe: {
        time?: number;
        angle?: number;
        width?: number;
    };
}
export type IFXFilterName = keyof IFXFilterParameters;
export type IFXFilterCategory = "blur" | "colourAdjustment" | "colourEffect" | "composite" | "convolution" | "distortion" | "generator" | "geometry" | "gradient" | "halftone" | "reduction" | "sharpen" | "stylize" | "tile" | "transition";

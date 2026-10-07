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

/** Reviewed GraphicsFX surface. Pixel-storage borrowing stays internal. */
export { GFXPath, GFXMutablePath } from "./GFXPath";
export type { GFXStrokeOptions } from "./GFXPath";
export { GFXGradient } from "./GFXGradient";
export { GFXStateUnderflowError, GFXContext } from "./GFXContext";
export { GFXShadow } from "./GFXShadow";
export type { GFXPathCommand, GFXIdentifiers, GFXAffineTransform, GFXGradientStop, GFXGradientGeometry, GFXShadowValue, GFXTextFont, GFXBlendMode, GFXLineCap, GFXLineJoin, GFXTextAttributes, GFXPaintColour, GFXFillRule, GFXPaintGradient, GFXPaintPattern, GFXImageMask, GFXPaint, GFXCommandState, GFXCommand, GFXDisplayList, GFXPoint, GFXRect, GFXSize } from "./graphicsTypes";
export { convertColourComponents, parseGFXColour, compositeColour, relativeLuminance, contrastRatio, bestContrastingColour, GFXColour } from "./GFXColour";
export { GFXColourTransformUnsupportedError, GFXColourTransform } from "./GFXColourTransform";
export type { GFXExtendedRGBA, GFXCMYKComponents, GFXLabD50Components, GFXRenderingIntent, GFXGamutMapping, GFXToneMapPolicy, GFXColourTransformOptions } from "./GFXColourTransform";
export { GFXColourParseError } from "./colourTypes";
export type { GFXColourSpace, GFXRGBAComponents, GFXHSLAComponents, GFXCMYKAComponents, GFXHSVAComponents } from "./colourTypes";
export { finite, clampUnit, normalizeHue, hslaToRGBA, hsvaToRGBA, cmykaToRGBA, rgbaToCMYKA, rgbaToHSLA, rgbaToHSVA, displayP3ToSRGB, sRGBToDisplayP3, srgbLinearChannel } from "./colourConversion";
export { normalisePoint, normaliseSize, normaliseRect, offsetRect, insetRect, unionRects, intersectRects, rectContainsPoint, rectContainsRect, clampPointToRect, normaliseAffineTransform, concatenateTransforms, invertTransform, transformPoint, transformVector, transformRect, pointsEqual, sizesEqual, rectsEqual, GFXIdentityTransform } from "./GFXGeometry";
export type { GFXVector } from "./GFXGeometry";
export { bytePixelComponents, GFXImage, GFXDataProvider, GFXDataConsumer } from "./GFXImage";
export type { GFXAlphaFormat, GFXPixelFormat, GFXInterpolation, GFXImageDescriptor, GFXCallbackDataProvider, GFXImageDrawingDestination } from "./GFXImage";
export { GFXFloatImage } from "./GFXFloatImage";
export type { GFXFloatSampleFormat, GFXFloatImageDescriptor, GFXIndexedImageDescriptor } from "./GFXFloatImage";
export type { GFXBytePixelDescriptor, GFXPixelDescriptor, GFXPixelSampleFormat, GFXPixelStorageFormat } from "./GFXPixelDescriptor";
export type { GFXPixelLease } from "./GFXPixelLease";
export { GFXPattern } from "./GFXPattern";
export { GFXBitmapContext } from "./GFXBitmapContext";
export type { GFXBitmapPaint } from "./GFXBitmapContext";
export { GFXShading } from "./GFXShading";
export type { GFXShadingGeometry } from "./GFXShading";
export { GFXColourConversionInfo } from "./GFXColourConversionInfo";
export { GFXLayer } from "./GFXLayer";
export { GFXTransparencyGroup } from "./GFXTransparencyGroup";
export type { GFXTransparencyGroupOptions } from "./GFXTransparencyGroup";
export { GFXPDFContext } from "./pdf/GFXPDFContext";
export { GFXPDFDocument,GFXPDFPage } from "./pdf/GFXPDFDocument";
export { GFXPDFRenderDestination } from "./pdf/GFXPDFRenderDestination";
export type { GFXPDFRenderRequest } from "./pdf/GFXPDFRenderDestination";
export { GFXPDFRenderTask } from "./pdf/GFXPDFRenderTask";
export { GFXPDFScanner } from "./pdf/GFXPDFScanner";
export type { GFXPDFObject,GFXPDFReference,GFXPDFContentOperator } from "./pdf/GFXPDFScanner";
export { GFXPDFFontSubset } from "./pdf/GFXPDFFontSubset";
export type { GFXPDFFontEmbedding,GFXPDFFontSubsetOptions,GFXPDFPositionedTextRun } from "./pdf/GFXPDFFontSubset";
export type { GFXPDFOutline,GFXPDFLink,GFXPDFMarkedContent,GFXPDFOutputIntentOptions } from "./pdf/GFXPDFStructure";
export { GFXPDFError } from "./pdf/pdfTypes";
export type { GFXPDFPageOptions,GFXPDFMetadata,GFXPDFViewport,GFXPDFOpenOptions,GFXPDFPermissionMetadata,GFXPDFErrorCode } from "./pdf/pdfTypes";
export { GFXColourProfile } from "./GFXColourProfile";

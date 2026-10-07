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

export { TFXFont, type TFXFontShapeOptions } from "./TFXFont";
export { TFXFontDescriptor, type TFXFontDescriptorOptions } from "./TFXFontDescriptor";
export type { TFXGlyphInfo, TFXGlyphRun, TFXTextDirection } from "./TFXGlyphRun";
export { TFXAttributedString, type TFXTextAttributes } from "./TFXAttributedString";
export { TFXLine, type TFXPositionedGlyphRun, type TFXPositionedRubyRun, type TFXPositionedGlyphRunKind, type TFXLineTruncationType, type TFXLineStringRange, type TFXLineCaretOffsets, type TFXLineCaretOffset, type TFXLineCaretVisitor, type TFXLineTextPosition } from "./TFXLine";
export { TFXTypesetter } from "./TFXTypesetter";
export { TFXFrame, type TFXFrameLine, type TFXFrameProgression } from "./TFXFrame";
export { TFXFramesetter, type TFXFrameOptions } from "./TFXFramesetter";

export { TFXTextContainer, type TFXTextContainerInput } from "./TFXTextContainer";
export { TFXLayoutPlanner } from "./TFXLayoutPlanner";
export {
  TFXLayoutCache,
  type TFXLayoutCacheKey,
  type TFXLayoutCacheDiagnostics,
} from "./TFXLayoutCache";

export { TFXFontCollection } from "./TFXFontCollection";
export {
  TFX_VERTICAL_ORIENTATION_UNICODE_VERSION,
  tfxVerticalOrientationForGrapheme,
  type TFXVerticalOrientation,
  type TFXVerticalPresentation,
  type TFXTextCombine,
  type TFXLineBreakPolicy,
} from "./TFXVerticalOrientation";

export { TFXParagraphStyle, type TFXParagraphStyleOptions } from "./TFXParagraphStyle";
export { TFXTextTab, type TFXTextTabAlignment, type TFXTextTabOptions } from "./TFXTextTab";
export { TFXRunDelegate, type TFXRunDelegateAttachment, type TFXRunDelegateOptions } from "./TFXRunDelegate";
export { TFXRubyAnnotation, type TFXRubyAnnotationOptions, type TFXRubyAlignment, type TFXRubyOverhang, type TFXRubyPosition, type TFXRubyCollisionPolicy, type TFXRubyText, type TFXRubyTextValue } from "./TFXRubyAnnotation";
export { layoutTFXRuby, tfxRubyGlyphOffsets, type TFXRubyLayoutInput, type TFXRubyLayoutResult } from "./TFXRubyLayout";
export { TFXGlyphDrawing, type TFXGlyphOutline, type TFXAttachmentDrawing, type TFXLineDrawing, type TFXPDFTextRun } from "./TFXGlyphDrawing";
export type { TFXFontClient, TFXFontReadinessChange, TFXFontRegistration, TFXFontFaceRegistration, TFXFontFaceRegistrationRequest, TFXFontResourceMimeType, TFXPackagedFontResource, TFXPackagedFontResourceLoader, TFXRunDelegateRequest, TFXRunDelegateReadinessChange, TFXTextGeometryCapabilities, TFXTextLayoutResult } from "./textLayoutTypes";

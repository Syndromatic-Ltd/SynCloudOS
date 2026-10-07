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

export { NSEFontManager } from "./NSEFontManager";
export * from "./public";
export type { NSEFontManagerOptions } from "./NSEFontManager";
export type { NSEFontFamily, NSEFontPreset } from "../Text/fontDescriptors";
export { NSEFontPanel } from "./NSEFontPanel";
export type { NSEFontPanelCommandId, NSEFontPanelCommandPort, NSEFontPanelCommandResult, NSEFontPanelProps } from "./NSEFontPanel";
export { NSERuler } from "./NSERuler";
export type { NSERulerProps } from "./NSERuler";
export { cssForTextShadow, normaliseFontCommandPayload, normaliseFontDescriptor, normaliseParagraphStyle, normaliseParagraphStyleMutation, normaliseTextAttributesMutation, normaliseTextShadow } from "./typographyTypes";
export type { NSEFontCommandPayload, NSEFontDescriptor, NSEFontStretch, NSEFontStyle, NSEParagraphAlignment, NSEParagraphStyle, NSETextAttributesMutation, NSETextShadow } from "./typographyTypes";
export { NSEFontLibrary, createNSEBrowserFontFaceHost, createNSEIndexedDBUserFontStorage, createNSELocalFontPreferenceStore, cssFamilyForNSEUserFont, isNSEUserFontId, sharedNSEFontLibrary } from "./NSEFontLibrary";
export type { NSEFontImportResult, NSEFontLibraryOptions, NSEFontLibrarySnapshot, NSEFontPreferenceStore, NSEStoredUserFont, NSEUserFontFace, NSEUserFontFaceHost, NSEUserFontStorage } from "./NSEFontLibrary";
export { BodyText, TitleText } from "./Typography";
export { typographyTokens } from "./typographyTokens";

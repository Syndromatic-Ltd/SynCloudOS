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

import type { CSSProperties, Ref } from "react";
import type { TextEditingSession } from "./TextEditingSession";
import type { NSETextGeometryProvider } from "../TextLayout/textGeometryTypes";
import type { NSEAttributedAttachmentRun, NSEAttributedTextAttributes } from "../Text";
export interface NSETextViewHandle { focus(): void; geometry(): NSETextGeometryProvider | null }
/** A displayable image for an attachment (NSTextAttachment's image). */
export interface NSETextAttachmentImage { readonly src: string; readonly naturalWidth?: number; readonly naturalHeight?: number }
/** Maps an attachment's source to an image the view may show; null keeps the accessible placeholder. */
export type NSETextAttachmentResolver = (run: NSEAttributedAttachmentRun) => NSETextAttachmentImage | null;
/** How the host draws a font descriptor: its CSS family list, weight and style. */
export interface NSETextResolvedFont { readonly family: string; readonly weight?: number; readonly style?: "normal" | "italic" }
/** Maps a run's font descriptor to a CSS face; null keeps the descriptor's family name as given. */
export type NSETextFontResolver = (font: NonNullable<NSEAttributedTextAttributes["font"]>) => NSETextResolvedFont | null;
/**
 * Files dropped or pasted into editable text, with the text offset they landed
 * at. The owner inserts what it wants (usually attachments); return false to
 * decline, leaving the browser's default handling.
 */
export type NSETextFileDropHandler = (files: readonly File[], location: number) => boolean | void;
export interface NSETextViewProps {
  readonly session: TextEditingSession;
  readonly label: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly spellCheck?: boolean;
  readonly attachmentResolver?: NSETextAttachmentResolver;
  readonly fontResolver?: NSETextFontResolver;
  readonly onDropFiles?: NSETextFileDropHandler;
  readonly ref?: Ref<NSETextViewHandle>;
  readonly onInputError?: (error: unknown) => void;
  readonly onGeometry?: (provider: NSETextGeometryProvider | null) => void;
}

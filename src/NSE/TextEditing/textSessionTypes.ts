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

import type { NSEAttributedTextAttributes, NSEParagraphAttributes, NSETextRange, NSETextOwner, NSETextSnapshot } from "../Text";

export interface NSETextSelectionTarget {
  readonly sessionId: string;
  readonly documentId?: string;
  readonly flowId: string;
  readonly ownerGeneration: number;
  readonly modelRevision: number;
  readonly selectionGeneration: number;
  readonly range: NSETextRange;
  readonly anchor: number;
  readonly focus: number;
  readonly affinity: "upstream" | "downstream";
}
export interface NSETextMarkedState {
  readonly range: NSETextRange;
  readonly text: string;
  readonly baseRevision: number;
  readonly conflict: boolean;
}
export interface NSETextSessionSnapshot {
  readonly model: NSETextSnapshot;
  readonly selection: NSETextSelectionTarget;
  readonly typingAttributes: NSEAttributedTextAttributes;
  readonly marked: NSETextMarkedState | null;
  readonly editable: boolean;
  readonly disposed: boolean;
}
/** How an application custom attribute behaves while editing. */
export interface NSETextCustomAttributePolicy {
  /** Typing at the edge of a run extends it (default true). A comment anchor uses false. */
  readonly extendsWhenTyping?: boolean;
  /** A paragraph key is copied to the new paragraph when Enter splits one (default true). */
  readonly carriesAcrossParagraphSplit?: boolean;
}
export interface NSETextEditingSessionOptions {
  readonly id: string;
  readonly owner: NSETextOwner;
  readonly documentId?: string;
  readonly editable?: boolean;
  readonly signal?: AbortSignal;
  readonly history?: { undo(): unknown | Promise<unknown>; redo(): unknown | Promise<unknown> };
  readonly customAttributePolicies?: Readonly<Record<string, NSETextCustomAttributePolicy>>;
  /** The attributes Enter gives a new paragraph, as Pages' "Following paragraph style". Return
   *  `{ paragraph, typingAttributes }` to also set what the new paragraph is typed in. */
  readonly nextParagraphAttributes?: (previous: NSEParagraphAttributes) => NSEParagraphAttributes | { readonly paragraph: NSEParagraphAttributes; readonly typingAttributes?: NSEAttributedTextAttributes };
}
export type NSETextSessionSettlement =
  | { readonly status: "settled"; readonly revision: number }
  | { readonly status: "refused"; readonly issues: readonly { readonly code: string; readonly message: string }[] }
  | { readonly status: "revoked" };

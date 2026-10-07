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

import type { DocumentType, DocumentAssetReference } from "@syndromatic/syncloudos/sdk";
import { attributedContent, paragraph, textRun, parseAttributedContent, type NSEAttributedContent } from "@syndromatic/syncloudos/nse/text";
export type ExampleFlowId = "body" | "caption";
export type ExampleViewId = "body" | "bodyMirror" | "caption";
export interface TextSystemExampleModel {
  readonly title: string;
  readonly flows: Readonly<Record<ExampleFlowId, NSEAttributedContent>>;
  readonly object: { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly assets: readonly DocumentAssetReference[];
}
export function createExampleModel(): TextSystemExampleModel {
  const font = (size: number) => ({ font: { familyId: "example.noto", size } });
  return {
    title: "A small engine, two flows",
    flows: {
      body: attributedContent([
        paragraph([textRun("Small", font(18)), textRun(" engines compose useful text.", font(24))]),
        paragraph([textRun("This body flows around an app-owned object, then into explicit continuation boxes. The mirror edits the same flow with its own selection.", font(18))]),
        paragraph([textRun("Select a range, change its size, or type in either view. Caption edits share the document's undo history.", font(18))]),
      ]),
      caption: attributedContent([paragraph([textRun("Figure 1. App-owned object; independent caption flow.", font(16))])]),
    },
    object: { id: "figure-1", x: 142, y: 16, width: 94, height: 72 }, assets: [],
  };
}
function validModel(value: unknown): value is TextSystemExampleModel {
  try {
    if (!value || typeof value !== "object") return false;
    const model = value as TextSystemExampleModel;
    if (typeof model.title !== "string" || model.title.length > 256 || !model.flows || !model.object) return false;
    parseAttributedContent(model.flows.body); parseAttributedContent(model.flows.caption);
    if (!Array.isArray(model.assets) || model.assets.length > 1 || model.assets.some(ref => !ref || ref.kind !== "document-asset" || ref.mimeType !== "image/png" || !ref.scope || typeof ref.scope.authorizationId !== "string" || typeof ref.scope.documentId !== "string" || typeof ref.assetId !== "string" || !/^sha256:[a-f0-9]{64}$/.test(ref.hash) || !Number.isSafeInteger(ref.byteLength) || ref.byteLength < 1 || ref.byteLength > 8 * 1024 * 1024)) return false;
    if (typeof model.object.id !== "string" || !model.object.id || model.object.id.length > 64) return false;
    const { x, y, width, height } = model.object;
    return [x, y, width, height].every(Number.isFinite) && x >= 16 && y >= 16 && width > 0 && height > 0 && x + width <= 284 && y + height <= 204;
  } catch { return false; }
}
export const textSystemDocumentType: DocumentType<TextSystemExampleModel> = {
  id: "com.syncloudos.examples.text-system", displayName: "Text system example", schemaVersion: 1,
  extensions: ["textsystem"], mimeTypes: ["application/vnd.syncloudos.example-text+json"],
  capabilities: { versions: false, conflicts: false }, autosave: "disabled",
  create: createExampleModel, read: value => {
    if (!validModel(value)) throw new TypeError("Invalid private text-system model.");
    return { ...value, flows: { body: parseAttributedContent(value.flows.body), caption: parseAttributedContent(value.flows.caption) } };
  }, write: value => value, validate: validModel,
};

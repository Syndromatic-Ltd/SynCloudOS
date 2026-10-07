/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AppDocumentAssetPreparedEdit } from "./appClientTypes";
import type { DocumentAssetPreparedEdit } from "../HostServices/AppSDKHostServiceTypes";
import { assertDocumentAssetNotAborted, awaitDocumentAsset, DocumentAssetError } from "../Documents";
import { canonicalDocumentJson, immutableDocumentValue } from "../Documents";

/** Private adaptation of one host preflight; no store/binding/runtime crosses the app boundary. */
export async function prepareMountedDocumentAssetEdit<TModel>(input: {
  readonly before: Readonly<TModel>;
  readonly after: Readonly<TModel>;
  readonly expectedRevision: number;
  readonly typeId: string;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  current(): { readonly revision: number; readonly model: unknown };
  prepare(before: Readonly<TModel>, after: Readonly<TModel>, signal: AbortSignal): Promise<DocumentAssetPreparedEdit<TModel>>;
}): Promise<AppDocumentAssetPreparedEdit<TModel>> {
  const before = immutableDocumentValue(input.before, input.typeId);
  const after = immutableDocumentValue(input.after, input.typeId);
  const beforeIdentity = canonicalDocumentJson(before, input.typeId);
  const afterIdentity = canonicalDocumentJson(after, input.typeId);
  const assertCurrent = () => {
    assertDocumentAssetNotAborted(input.signal);
    input.assertCurrent();
    const current = input.current();
    if (current.revision !== input.expectedRevision || canonicalDocumentJson(current.model, input.typeId) !== beforeIdentity) {
      throw new DocumentAssetError("asset-conflict", "The captured document asset edit base is stale.");
    }
  };
  assertCurrent();
  let ended = false, consumed = false;
  let releasing: Promise<void> | undefined;
  // Publish cancellation cleanup before entering the asynchronous host capability.
  const pending = Promise.resolve().then(() => { assertCurrent(); return input.prepare(before, after, input.signal); });
  const release = (): Promise<void> => {
    ended = true;
    input.signal.removeEventListener("abort", onAbort);
    // Late, uncooperative completion is released too; never call host release twice.
    return releasing ??= pending.then((prepared) => prepared.release());
  };
  const onAbort = () => { void release().catch(() => undefined); };
  input.signal.addEventListener("abort", onAbort, { once: true });
  if (input.signal.aborted) onAbort();
  try {
    const prepared = await awaitDocumentAsset(pending, input.signal);
    assertCurrent();
    if (ended || prepared.expectedRevision !== input.expectedRevision) throw new DocumentAssetError("asset-conflict", "The document changed during asset preparation.");
    return Object.freeze({
      expectedRevision: prepared.expectedRevision,
      retainResources(actualBefore: Readonly<TModel>, actualAfter: Readonly<TModel>) {
        try {
          if (ended || consumed) throw new DocumentAssetError("asset-conflict", "The prepared document asset edit is released or consumed.");
          assertCurrent();
          if (canonicalDocumentJson(actualBefore, input.typeId) !== beforeIdentity || canonicalDocumentJson(actualAfter, input.typeId) !== afterIdentity) {
            throw new DocumentAssetError("asset-invalid", "The native models differ from the captured asset edit candidate.");
          }
          const retained = prepared.retainResources(actualBefore, actualAfter);
          consumed = true;
          // This pure handle is also used by the automatic core hook. Preserve
          // its identity so core deduplicates both retention paths. Canonical
          // history owns its once-only release; app release abandons preflight.
          return retained;
        } catch (error) { void release().catch(() => undefined); throw error; }
      },
      release,
    });
  } catch (error) { void release().catch(() => undefined); throw error; }
}

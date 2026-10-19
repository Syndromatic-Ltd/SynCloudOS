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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/nseRuntimeContracts";
import { attributedContent, paragraph } from "./attributedContent";
import { applyNSETextOperations, createNSETextSnapshot } from "./textOperations";
import type { NSETextChangeMap } from "./textChanges";
import type { NSEAttributedContent, NSETextSnapshot, NSETextEditOperation } from "./textTypes";
import { canonicalNSETextData } from "./textValidation";

let nextStandaloneOwnerGeneration=1;

export interface NSETextCommitRequest {
  readonly expectedRevision: number;
  readonly expectedGeneration?: number;
  readonly actionName?: string;
  readonly coalescingKey?: string;
  readonly operations: readonly NSETextEditOperation[];
}
export interface NSETextChangeReceipt {
  readonly before: NSETextSnapshot;
  readonly snapshot: NSETextSnapshot;
  readonly changeMap: NSETextChangeMap;
  readonly operations: readonly NSETextEditOperation[];
  readonly observerErrors: readonly unknown[];
}
/** Synchronous canonical authority. An adapter can commit into any native model. */
export interface NSETextOwner {
  readonly signal?: AbortSignal;
  getSnapshot(): NSETextSnapshot;
  subscribe(listener: (receipt: NSETextChangeReceipt) => void): () => void;
  commit(request: NSETextCommitRequest): NSETextChangeReceipt;
}
export interface NSEInMemoryTextOwnerOptions {
  readonly content?: NSEAttributedContent;
  readonly flowId?: string;
  readonly editable?: boolean;
}
export interface NSEDisposableTextOwner extends NSETextOwner { dispose(): void }

export function createInMemoryNSETextOwner(options: NSEInMemoryTextOwnerOptions = {}): NSEDisposableTextOwner {
  let snapshot = createNSETextSnapshot(options.content ?? attributedContent([paragraph([])]), options.flowId ?? "text", 0, nextStandaloneOwnerGeneration++);
  const editable=options.editable!==false;
  const lifetime=new AbortController();
  const lifecycle=new SynCloudOSLifecycleRecord({kind:"NSETextOwner",...(options.flowId===undefined ? {} : {id:options.flowId})});
  let disposed = false;
  let publishing = false;
  const listeners = new Set<(receipt: NSETextChangeReceipt) => void>();
  const assertLive = (operation:string) => { if (disposed) throw lifecycle.error({code:"NSE_TEXT_OWNER_DISPOSED",operation}); };
  return Object.freeze({
    signal:lifetime.signal,
    getSnapshot() { assertLive("getSnapshot"); return snapshot; },
    subscribe(listener: (receipt: NSETextChangeReceipt) => void) {
      assertLive("subscribe"); listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    commit(request: NSETextCommitRequest) {
      assertLive("commit");
      if (publishing) throw new Error("Reentrant text commit during publishing is forbidden.");
      if (!editable) throw new Error("Text owner is read-only.");
      const safe=canonicalNSETextData(request,"Text commit request",{maxDepth:24,maxNodes:100_000,maxBytes:4*1024*1024});
      if (!safe || Object.keys(safe).some(key=>!["expectedRevision","expectedGeneration","operations","actionName","coalescingKey"].includes(key))) throw new TypeError("Invalid text commit request.");
      for(const key of ["actionName","coalescingKey"] as const) if(safe[key]!==undefined && (typeof safe[key]!=="string" || !safe[key]!.trim() || safe[key]!.length>256)) throw new TypeError(`Invalid text action metadata ${key}.`);
      if (safe.expectedRevision !== snapshot.revision || (safe.expectedGeneration !== undefined && safe.expectedGeneration !== snapshot.ownerGeneration)) throw new Error("Stale text revision or owner generation.");
      const receipt = applyNSETextOperations(snapshot, safe.operations);
      if (receipt.snapshot === snapshot) return receipt;
      snapshot = receipt.snapshot;
      const errors: unknown[] = [];
      publishing = true;
      try {
        for (const listener of [...listeners]) {
          if (!listeners.has(listener)) continue;
          try { listener(receipt); } catch (error) { errors.push(error); }
        }
      } finally { publishing = false; }
      return errors.length ? Object.freeze({ ...receipt, observerErrors: Object.freeze(errors) }) : receipt;
    },
    dispose() { if (disposed) return; lifecycle.markDisposed("explicit"); disposed = true; lifetime.abort(lifecycle.error({code:"NSE_TEXT_OWNER_DISPOSED",operation:"dispose"})); listeners.clear(); },
  });
}

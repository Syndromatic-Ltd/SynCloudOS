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

import type { AFXAnimationHandle } from "../../FX/AnimationFX/animationTypes";
import { useMemo } from "react";
import { useNSEViewAnimator } from "../../NSE/Animation";
import { attributedContent, attributedContentLayoutText, paragraph, parseAttributedContent, type NSEAttributedAttachmentRun, type NSEAttributedContent } from "../../NSE/public/content";
import type {
  
  RuntimeAnimationOwnerLease,
  RuntimeAnimationService,
  TFXTextLayoutService,
} from "../SynCloudOS";
import { useSynWare } from "./SynWareContext";
import type { AppAnimationClient, AppAnimationOwner, AppTextLayoutClient } from "./appEnvironmentClientTypes";
import { NSEAttachmentProjection, type NSEProjectedAttachmentSource } from "../../NSE/public/text-layout";

export type SynWareNSETextLayoutPort = Pick<TFXTextLayoutService, "geometryCapabilities" | "segment" | "layout" | "measure" | "subscribeFontReadiness"> & Pick<AppTextLayoutClient,
  "resolveRunDelegate" | "attachmentReadinessGeneration" | "subscribeAttachmentReadiness"
> & {
  readonly acquireAttachmentSource?: (run: NSEAttributedAttachmentRun, signal?: AbortSignal) => Promise<NSEProjectedAttachmentSource>;
};

async function resolveAttributedAttachments(
  client: AppTextLayoutClient,
  value: unknown,
  signal?: AbortSignal,
  acquireSource?: (run: NSEAttributedAttachmentRun, signal?: AbortSignal) => Promise<NSEProjectedAttachmentSource>,
): Promise<NSEAttributedContent> {
  const content = parseAttributedContent(value);
  const projection = new NSEAttachmentProjection({
    resolveRunDelegate: client.resolveRunDelegate.bind(client),
    ...(acquireSource ? { acquireSource } : {}),
  });
  const blocks = [] as NSEAttributedContent["blocks"][number][];
  for (const block of content.blocks) {
    const runs = [] as NSEAttributedContent["blocks"][number]["runs"][number][];
    for (const run of block.runs) {
      signal?.throwIfAborted();
      if (run.kind !== "attachment") {
        runs.push(run);
        continue;
      }
      const delegate = (await projection.project(run, signal)).delegate;
      signal?.throwIfAborted();
      runs.push(Object.freeze({ ...run, intrinsicSize: Object.freeze({ inline: delegate.width, block: delegate.ascent + delegate.descent }) }));
    }
    blocks.push(paragraph(runs, block.attributes));
  }
  return attributedContent(blocks);
}

/** Converts the text-layout operations and font-readiness signal needed by NSE text views.
 * The underlying AppSDK client remains scoped to this mounted application. */
export function createSynWareNSETextLayoutPort(
  client: AppTextLayoutClient,
  options: Readonly<{ acquireAttachmentSource?: (run: NSEAttributedAttachmentRun, signal?: AbortSignal) => Promise<NSEProjectedAttachmentSource> }> = {},
): SynWareNSETextLayoutPort {
  return Object.freeze({
    get geometryCapabilities() { return client.geometryCapabilities; },
    segment: client.segment.bind(client) as TFXTextLayoutService["segment"],
    measure: client.measure.bind(client) as TFXTextLayoutService["measure"],
    async layout(input, containers) {
      if (input.attributedContent === undefined) return client.layout(input as unknown as Readonly<Record<string, unknown>>, containers) as Promise<ReturnType<TFXTextLayoutService["layout"]> extends Promise<infer T> ? T : never>;
      const resolved = await resolveAttributedAttachments(client, input.attributedContent, input.signal, options.acquireAttachmentSource);
      const completeText = attributedContentLayoutText(resolved);
      const textOffset = input.continuation?.textOffset ?? 0;
      if (completeText.slice(textOffset, textOffset + input.text.length) !== input.text || (textOffset === 0 && completeText.length !== input.text.length)) {
        throw new TypeError("Attributed NSE layout text must use one U+FFFC character per attachment.");
      }
      return client.layout(Object.freeze({ ...input, attributedContent: resolved }) as unknown as Readonly<Record<string, unknown>>, containers) as Promise<ReturnType<TFXTextLayoutService["layout"]> extends Promise<infer T> ? T : never>;
    },
    subscribeFontReadiness: client.subscribeFontReadiness.bind(client),
    get attachmentReadinessGeneration() { return client.attachmentReadinessGeneration; },
    resolveRunDelegate: client.resolveRunDelegate.bind(client),
    acquireAttachmentSource: options.acquireAttachmentSource,
    subscribeAttachmentReadiness: client.subscribeAttachmentReadiness.bind(client),
  });
}

/** Public hook for NSE animation controls. It keeps raw owner leases and
 * animation handles inside the adapter while applications receive an NSE view
 * animator bound to their own AppSDK animation client. */
export function useSynWareNSEViewAnimator(input: {
  readonly viewId: string;
  readonly target: object;
  readonly targetId: string;
}) {
  const app = useSynWare();
  const animations = useMemo(() => createSynWareNSEAnimations(app.animations), [app.animations]);
  return useNSEViewAnimator({
    animations,
    owner: { appId: app.appId, viewId: input.viewId },
    target: input.target,
    targetId: input.targetId,
  });
}

/** Presents the mounted application's own AnimationFX client in the shape NSE
 * animators consume. Owner leases are issued by, and stay inside, that client:
 * a lease minted elsewhere is refused, so NSE views can only ever animate as
 * the application that mounted them. */
export function createSynWareNSEAnimations(client: AppAnimationClient): Pick<RuntimeAnimationService, "acquireOwner" | "animate"> {
    const app = { animations: client };
    const owners = new WeakMap<object, AppAnimationOwner>();
    return Object.freeze({
      acquireOwner(owner: Readonly<{ appId: string; viewId: string; windowControllerId?: string }>) {
        const issued = app.animations.acquireOwner(owner.viewId);
        const lease = Object.freeze({
          ...owner,
          epoch: 0,
          release(reason?: string) {
            void reason;
            issued.dispose();
          },
        });
        owners.set(lease, issued);
        return lease as RuntimeAnimationOwnerLease;
      },
      animate(target: object, definition: object, owner: RuntimeAnimationOwnerLease, generation?: number) {
        void generation;
        const issued = owners.get(owner as object);
        if (!issued) throw new DOMException("The animation owner was not issued to this application.", "SecurityError");
        const handle = app.animations.animate(target, definition as Readonly<Record<string, unknown>>, issued);
        return Object.freeze({
          id: handle.id,
          finished: handle.finished,
          get progress() { return handle.progress; },
          cancel(reason?: string) { handle.cancel(reason); },
          seek(seconds: number) { handle.seek(seconds); },
          pause() { handle.pause(); },
          resume() { handle.resume(); },
        }) as AFXAnimationHandle;
      },
    }) as Pick<RuntimeAnimationService, "acquireOwner" | "animate">;
}

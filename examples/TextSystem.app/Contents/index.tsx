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

import React, { useEffect, useState } from "react";
import { createSynWare, useSynWare, type AppDocumentLocation } from "@syndromatic/syncloudos/sdk";
import type { NSETextInputClient } from "@syndromatic/syncloudos/nse/text";
import { createTextSystemExample, type TextSystemExample } from "./example";
import { TextSystemExampleView } from "./view";
import type { ExampleViewId } from "./model";
import manifest from "./Info";
export { textSystemDocumentType } from "./model";
export { createTextSystemExample } from "./example";
export interface TextSystemExampleAppOptions {
  /** The host supplies licensed bytes; no system-font or network fallback changes measurements. */
  readonly loadFontBytes: (signal: AbortSignal) => Promise<Uint8Array>;
  readonly onReady?: (example: TextSystemExample) => void;
  readonly onInputClient?: (view: ExampleViewId, client: NSETextInputClient | null) => void;
  readonly onError?: (error: unknown) => void;
  readonly openLocation?: AppDocumentLocation;
  readonly nativeDestination?: AppDocumentLocation;
}
/** A runnable SynWare definition whose model/codec stay private to this example. */
export function createTextSystemExampleApp(options: TextSystemExampleAppOptions) {
  function Root() {
    const app = useSynWare(), documents = app.documents.workspaceDocuments;
    const [example, setExample] = useState<TextSystemExample | null>(null), [error, setError] = useState<string | null>(null);
    useEffect(() => {
      const controller = new AbortController(), signal = AbortSignal.any([controller.signal, app.signal]);
      let current: TextSystemExample | null = null;
      void (async () => {
        const fontBytes = await options.loadFontBytes(signal);
        signal.throwIfAborted();
        current = await createTextSystemExample({ documents, documentResources: app.documents.documentResources, fontBytes, signal,
          openLocation: options.openLocation, nativeDestination: options.nativeDestination });
        signal.throwIfAborted(); setExample(current); options.onReady?.(current);
      })().catch(failure => { if (!signal.aborted) { setError(String(failure)); options.onError?.(failure); } });
      return () => { controller.abort(); current?.dispose(); };
    }, [documents, app.signal]);
    return example ? <TextSystemExampleView example={example} onInputClient={options.onInputClient} /> : <main className="text-system-example"><h1>Text System</h1><p role="status">{error ?? "Loading the example font and canonical document…"}</p></main>;
  }
  return createSynWare({ manifest, root: Root });
}

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

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from "react";
import { NSEFontManager, type FontDeclaration } from "../../NSE/Typography";
import type { TFXFontClient, TFXFontRegistration, TFXPackagedFontResourceLoader } from "../../FX/TextFX/textLayoutTypes";
import type { TFXFontDescriptor } from "../../FX/TextFX/TFXFontDescriptor";
import { useSCOS } from "./scos/useSCOS"

/** Host composition input, kept private to framework composition. */
export interface SynWareFontCatalogue {
  readonly manager: NSEFontManager;
  readonly declaration?: FontDeclaration;
  readonly loadResource?: TFXPackagedFontResourceLoader;
}
const FontCatalogueContext = createContext<SynWareFontCatalogue | null>(null);
const noSubscription = () => () => {};
const emptySnapshot = () => null;
export function FontCatalogueProvider({ catalogue, children }: PropsWithChildren<{ readonly catalogue: SynWareFontCatalogue }>) {
  return <FontCatalogueContext.Provider value={catalogue}>{children}</FontCatalogueContext.Provider>;
}
export function useFontCatalogue(): SynWareFontCatalogue {
  const supplied = useContext(FontCatalogueContext);
  return useMemo(() => supplied ?? Object.freeze({ manager:new NSEFontManager() }), [supplied]);
}

/** Private host namespace; application bundle resources retain their own loader. */
export const hostFontResourcePrefix = "Resources/HostTypography/";
function hostResourcePath(declaration: FontDeclaration, resource: string): string {
  const extension = declaration.resources[resource]!.split(".").at(-1)!;
  return `${hostFontResourcePrefix}${resource}.${extension}`;
}

/** Supplies registered host bytes to the mount's existing resource reservation. */
export function createFontCatalogueResourceLoader(catalogue: SynWareFontCatalogue): TFXPackagedFontResourceLoader | undefined {
  const { declaration, loadResource } = catalogue;
  if (!declaration || !loadResource) return undefined;
  const paths = new Map(Object.entries(declaration.resources).map(([resource, path]) => [hostResourcePath(declaration, resource), path]));
  return (path, signal) => {
    const registered = paths.get(path);
    if (!registered) throw new DOMException("The host font resource is not registered.", "NotFoundError");
    return loadResource(registered, signal);
  };
}

export interface SynWareFontAccess {
  /** Metadata and imported-font collections. Presence does not imply glyph readiness. */
  readonly manager: NSEFontManager;
  /** Registers concrete declared/imported bytes through this mount's TextFX authority.
   * Each result has its own lifetime; dispose it when the document no longer needs it. */
  loadFace(id: string, descriptor: TFXFontDescriptor, signal?: AbortSignal): Promise<TFXFontRegistration>;
}

function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, {once:true});
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

/** Internal composition: app code receives useFonts(), never the host loader. */
export function createSynWareFontAccess(catalogue: SynWareFontCatalogue, client: Pick<TFXFontClient, "registerFont" | "registerFontResource">, owner: AbortSignal): SynWareFontAccess {
  return Object.freeze({ manager: catalogue.manager,
    async loadFace(id: string, descriptor: TFXFontDescriptor, caller?: AbortSignal) {
      const signal = caller ? AbortSignal.any([owner, caller]) : owner;
      signal.throwIfAborted();
      const face = catalogue.declaration?.faces.find(face => face.id === id);
      let bytes: Uint8Array | null = null;
      if (face) {
        if (!catalogue.loadResource) throw new DOMException("The host font resource is unavailable.", "NotFoundError");
        return client.registerFontResource(hostResourcePath(catalogue.declaration!, face.resource), descriptor, signal);
      } else {
        await waitFor(catalogue.manager.library?.restore() ?? Promise.resolve(), signal);
        bytes = catalogue.manager.library?.fontBytes(id) ?? null;
      }
      signal.throwIfAborted();
      if (!bytes) throw new DOMException(`No registered bytes for font ${id}.`, "NotFoundError");
      return client.registerFont(bytes, descriptor, signal);
    },
  });
}

/** Font metadata and byte-backed registration for the active SynWare mount. */
export function useFonts(): SynWareFontAccess {
  const mount = useSCOS();
  const catalogue = useFontCatalogue();
  const library = catalogue.manager.library;
  useSyncExternalStore(library?.subscribe ?? noSubscription, library?.getSnapshot ?? emptySnapshot, library?.getSnapshot ?? emptySnapshot);
  useEffect(() => { void catalogue.manager.library?.restore(); }, [catalogue]);
  return useMemo(() => createSynWareFontAccess(catalogue, mount.textLayout, mount.signal), [catalogue, mount.textLayout, mount.signal]);
}

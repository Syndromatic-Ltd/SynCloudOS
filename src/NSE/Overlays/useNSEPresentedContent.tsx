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

import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";

const PresentedContentContext = createContext<((content: ReactNode) => ReactNode) | null>(null);

/** Host-only: retain the presenting application's services when a real
 * window renders its content elsewhere in the React tree. */
export const PresentedContentProvider = PresentedContentContext.Provider;

/**
 * Latest content for a surface a window bridge presents. The bridge receives
 * one stable element per surface; content changes reach that element through
 * this store and re-render only it.
 */
class PresentedContentStore {
  #content: ReactNode;
  readonly #listeners = new Set<() => void>();

  constructor(content: ReactNode) {
    this.#content = content;
  }

  get = (): ReactNode => this.#content;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  set(content: ReactNode): void {
    if (Object.is(content, this.#content)) return;
    this.#content = content;
    for (const listener of this.#listeners) listener();
  }
}

function PresentedContent({ store }: { readonly store: PresentedContentStore }) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Returns a stable element that renders `content` wherever a window bridge
 * mounts it. Hosts re-render the application window whenever a presented
 * surface is (re)registered, so a surface that re-presented on every new
 * children identity looped: present -> host render -> new children ->
 * present. Present once per request and let this element follow the content.
 */
export function useNSEPresentedContent(content: ReactNode): ReactNode {
  const wrap = useContext(PresentedContentContext);
  content = wrap ? wrap(content) : content;
  const [store] = useState(() => new PresentedContentStore(content));
  const [element] = useState(() => <PresentedContent store={store} />);
  useLayoutEffect(() => {
    store.set(content);
  }, [content, store]);
  return element;
}

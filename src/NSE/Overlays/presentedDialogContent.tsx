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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type PropsWithChildren } from "react";

interface DialogContentOwner {
  readonly presented: boolean;
  readonly titleInContent: boolean;
  readonly observeTitle?: (element: HTMLElement) => () => void;
}
const Context = createContext<DialogContentOwner>({ presented: false, titleInContent: false });

/** The modal dialog already renders its declared heading in its content. */
export function DialogTitleInContent({ children }: PropsWithChildren) {
  const parent = useContext(Context);
  const value = useMemo(() => ({ ...parent, titleInContent: true }), [parent]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Private composition: the presenting surface already owns dialog semantics. */
export function PresentedDialogContent({ children, onTitleChange }: PropsWithChildren<{ onTitleChange?: (title: string) => void }>) {
  const current = useRef<object | null>(null);
  const observeTitle = useCallback((element: HTMLElement) => {
    if (!onTitleChange) return () => {};
    const token = {};
    current.current = token;
    const report = () => { if (current.current === token) onTitleChange(element.textContent?.trim() ?? ""); };
    report();
    const Observer = element.ownerDocument.defaultView?.MutationObserver;
    const observer = Observer ? new Observer(report) : null;
    observer?.observe(element, { childList: true, characterData: true, subtree: true });
    return () => {
      observer?.disconnect();
      if (current.current !== token) return;
      current.current = null;
      onTitleChange("");
    };
  }, [onTitleChange]);
  // The presenting sheet consumes the heading hint; nested sheets own their titles.
  const value = useMemo(() => ({ presented: true, titleInContent: false, observeTitle }), [observeTitle]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** A rich title is rendered once so its actual text can name a native window. */
export function PresentedDialogTitle({ children }: PropsWithChildren) {
  const owner = useContext(Context);
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => element.current ? owner.observeTitle?.(element.current) : undefined, [owner]);
  return <span hidden aria-hidden="true" ref={element}>{children}</span>;
}

export function usePresentedDialogContent(): DialogContentOwner { return useContext(Context); }

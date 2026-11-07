/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import { useSynWareContext } from "../../SynCloudOS/AppSDK/SynWareContext";
import { nsePresentWindowTitle, type NSEWindow } from "../Application/NSEWindowController";

const noSubscription = () => () => {};

/** @internal System navigation text uses the framework dictionary, never an app-owned title. */
export function useNSEMoreTitle(): string {
  const locale = useSynWareContext()?.locale;
  useSyncExternalStore(locale?.subscribe ?? noSubscription, () => locale?.getSnapshot() ?? null, () => null);
  const translated = locale?.t("navigation.more");
  return translated && translated !== "navigation.more" ? translated : "More";
}

/** @internal A retained but hidden tab hierarchy cannot claim the window's title. */
export function useNSECompactMoreTitle(window: NSEWindow | null, open: boolean, root: RefObject<HTMLElement | null>): void {
  const title = useNSEMoreTitle();
  useLayoutEffect(() => {
    if (!window || !open || !root.current) return;
    let release: (() => void) | null = null;
    const update = () => {
      const visible = root.current?.isConnected && !root.current.closest("[hidden], [inert]");
      if (visible && !release) release = nsePresentWindowTitle(window, title);
      else if (!visible && release) { release(); release = null; }
    };
    update();
    const observer = new MutationObserver(update);
    for (let element: HTMLElement | null = root.current; element; element = element.parentElement) {
      observer.observe(element, { attributes: true, attributeFilter: ["hidden", "inert"] });
    }
    return () => { observer.disconnect(); release?.(); };
  }, [window, open, root, title]);
}

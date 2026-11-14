/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createStageWindowHost, type WindowHostCapabilities, type WindowHostEnvironment, type WindowHostEvent, type WindowSurfaceBinding } from "../Windows/WindowHostEnvironment";

const stylesheet = "style, link[rel~=stylesheet]";

function projectStyles(source: Document, target: Document): () => void {
  const mirrors = new Map<Element, Element>();
  const copy = (original: Element) => {
    const mirror = target.importNode(original, true);
    const url = original.getAttribute("href");
    if (url) mirror.setAttribute("href", new URL(url, source.baseURI).href);
    return mirror;
  };
  const sync = (changed: ReadonlySet<Element> = new Set()) => {
    const originals = new Set(source.querySelectorAll(stylesheet));
    for (const [original, mirror] of mirrors) {
      if (originals.has(original)) continue;
      mirror.remove();
      mirrors.delete(original);
    }
    let previousMirror: Element | null = null;
    for (const original of originals) {
      const previous = mirrors.get(original);
      const mirror = previous && !changed.has(original) ? previous : copy(original);
      if (previous && previous !== mirror) previous.replaceWith(mirror);
      const next: ChildNode | null = previousMirror ? previousMirror.nextSibling : target.head.firstChild;
      if (next !== mirror) target.head.insertBefore(mirror, next);
      mirrors.set(original, mirror);
      previousMirror = mirror;
    }
    for (const attribute of ["dir", "lang", "style"]) {
      const value = source.documentElement.getAttribute(attribute);
      if (value === null) target.documentElement.removeAttribute(attribute);
      else target.documentElement.setAttribute(attribute, value);
    }
  };
  sync();
  const Observer = source.defaultView?.MutationObserver;
  const observer = Observer && new Observer(records => {
    const changed = new Set<Element>();
    for (const { target } of records) {
      const targetElement = target.nodeType === 1 ? target as Element : target.parentElement;
      const style = targetElement?.closest(stylesheet);
      if (style) changed.add(style);
    }
    sync(changed);
  });
  observer?.observe(source.head, { subtree: true, childList: true, attributes: true, characterData: true });
  observer?.observe(source.documentElement, { attributes: true, attributeFilter: ["dir", "lang", "style"] });
  return () => observer?.disconnect();
}

interface BrowserBinding {
  readonly surface: WindowSurfaceBinding;
  readonly release: (close: boolean) => void;
  readonly unbind: () => Promise<void>;
}

/** Browser popups are opened with an inherited origin and share one runtime. */
export function createBrowserWindowHost(
  browser: Window | null,
  nativeWindowControls: () => WindowHostCapabilities["nativeWindowControls"],
): WindowHostEnvironment {
  const stage = createStageWindowHost();
  if (!browser) return stage;
  const listeners = new Set<(event: WindowHostEvent) => void>();
  const bindings = new Map<string, BrowserBinding>();
  const publish = (event: WindowHostEvent) => {
    for (const listener of [...listeners]) listener(event);
  };

  return {
    get capabilities() {
      return { ...stage.capabilities, separateSurfaces: true, nativeWindowControls: nativeWindowControls() };
    },
    requestFullScreen: stage.requestFullScreen,
    subscribe(listener) {
      listeners.add(listener);
      const unsubscribeStage = stage.subscribe(listener);
      return () => {
        unsubscribeStage();
        listeners.delete(listener);
      };
    },
    async bind(windowId, { generation, title, bounds }) {
      if (bindings.has(windowId)) return null;
      // This runs before the first await so browser user activation is live.
      const popup = browser.open("about:blank", "_blank", `popup,width=${Math.round(bounds.width)},height=${Math.round(bounds.height)}`);
      if (!popup || popup.closed) return null;
      let element: HTMLElement;
      let releaseStyles: () => void;
      try {
        const destination = popup.document;
        destination.title = title;
        destination.body.style.margin = "0";
        element = destination.createElement("div");
        element.dataset.detachedWindow = windowId;
        destination.body.append(element);
        releaseStyles = projectStyles(browser.document, destination);
      } catch (error) {
        popup.close();
        throw error;
      }
      const surface = Object.freeze({ windowId, generation, element });
      const current = () => bindings.get(windowId)?.surface === surface;
      const activate = () => { if (current()) publish({ kind: "activated", windowId, generation }); };
      const deactivate = () => { if (current()) publish({ kind: "deactivated", windowId, generation }); };
      const lost = () => {
        const binding = bindings.get(windowId);
        if (binding?.surface !== surface) return;
        binding.release(false);
        publish({ kind: "surfaceLost", windowId, generation });
      };
      const check = browser.setInterval(() => {
        if (popup.closed || !element.isConnected) lost();
      }, 250);
      let releaseObserver: MutationObserver | undefined;
      let released!: () => void;
      const releaseAcknowledgement = new Promise<void>(resolve => { released = resolve; });
      const release = (close: boolean) => {
        if (!current()) return;
        bindings.delete(windowId);
        browser.clearInterval(check);
        releaseStyles();
        releaseObserver?.disconnect();
        popup.removeEventListener("focus", activate);
        popup.removeEventListener("blur", deactivate);
        popup.removeEventListener("pagehide", lost);
        browser.removeEventListener("pagehide", openerLost);
        if (close && !popup.closed) popup.close();
        released();
      };
      const unbind = () => {
        // The renderer retires its portal in the React commit. A child may
        // still be showing an editor while that update is queued.
        const closeWhenEmpty = () => {
          if (!element.isConnected || !element.hasChildNodes()) release(true);
        };
        if (current() && !releaseObserver) {
          releaseObserver = new element.ownerDocument.defaultView!.MutationObserver(closeWhenEmpty);
          releaseObserver.observe(element, { childList: true });
          closeWhenEmpty();
        }
        return releaseAcknowledgement;
      };
      const openerLost = () => release(true);
      bindings.set(windowId, { surface, release, unbind });
      popup.addEventListener("focus", activate);
      popup.addEventListener("blur", deactivate);
      // Browsers cannot await a veto when the user closes their native caption.
      // Treat disposal of that document as loss of presentation, never loss of data.
      popup.addEventListener("pagehide", lost);
      browser.addEventListener("pagehide", openerLost);
      // Acknowledge a connected destination with style projection installed.
      if (popup.closed || !element.isConnected) {
        lost();
        return null;
      }
      return surface;
    },
    async unbind(windowId, generation) {
      const binding = bindings.get(windowId);
      if (binding?.surface.generation === generation) await binding.unbind();
    },
  };
}

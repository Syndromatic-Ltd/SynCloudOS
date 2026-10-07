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

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureNotificationSource,
  createNotificationCaptureProxy,
  shouldIgnoreNotificationCaptureElement,
  shouldUseNotificationSnapdomCapture
} from "../../src/Webspring/notificationScreenSliceCapture";

function mockRect(element: Element, rect: DOMRect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect);
}

function getElement(root: ParentNode, selector: string) {
  const element = root.querySelector(selector);
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("notification screen-slice capture", () => {
  it("captures a hidden pruned root with the visible layers behind the banner", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `
      <section class="webspring-material-stack"><div>metal</div></section>
      <div class="webspring-backdrop"><div class="webspring-brand-lockup">brand</div></div>
      <section class="webspring-composition">dial</section>
      <section class="webspring-apps-container"><div class="webspring-app-view-frame">apps</div></section>
    `;
    document.body.appendChild(root);
    const material = getElement(root, ".webspring-material-stack");
    const backdrop = getElement(root, ".webspring-backdrop");
    const composition = getElement(root, ".webspring-composition");
    const apps = getElement(root, ".webspring-apps-container");
    apps.style.position = "fixed";
    mockRect(root, new DOMRect(0, 0, 1280, 960));
    mockRect(material, new DOMRect(0, 0, 1280, 960));
    mockRect(backdrop, new DOMRect(0, 0, 1280, 430));
    mockRect(composition, new DOMRect(340, 8, 600, 500));
    mockRect(apps, new DOMRect(0, 0, 1280, 720));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(382.5, 12, 500, 104));
    const proxyRoot = getElement(proxy.element, ".webspring-view");
    const clonedApps = getElement(proxyRoot, ".webspring-apps-container");

    expect(proxy.element.dataset.syncloudosNotificationCaptureProxy).toBe("true");
    expect(proxy.element.style.left).toBe("382.5px");
    expect(proxy.element.style.top).toBe("12px");
    expect(proxy.element.style.width).toBe("500px");
    expect(proxy.element.style.height).toBe("104px");
    expect(proxy.element.style.overflow).toBe("hidden");
    expect(proxy.element.style.zIndex).toBe("-1");
    expect(proxyRoot.className).toBe("webspring-view");
    expect(proxyRoot.querySelector(".webspring-material-stack")).not.toBeNull();
    expect(proxyRoot.querySelector(".webspring-brand-lockup")).not.toBeNull();
    expect(proxyRoot.querySelector(".webspring-composition")).not.toBeNull();
    expect(proxyRoot.querySelector(".webspring-apps-container")).not.toBeNull();
    expect(proxyRoot.style.animation).toBe("none");
    expect(getElement(proxyRoot, ".webspring-material-stack").style.animation).toBe("none");
    expect(getElement(proxyRoot, ".webspring-material-stack").style.transition).toBe("none");
    expect(clonedApps.style.position).toBe("absolute");
    expect(clonedApps.style.left).toBe("0px");
    expect(clonedApps.style.top).toBe("0px");
    expect(proxyRoot.style.left).toBe("-382.5px");
    expect(proxyRoot.style.top).toBe("-12px");
    expect(proxyRoot.style.width).toBe("1280px");
    expect(proxyRoot.style.height).toBe("960px");

    proxy.dispose();
    expect(document.body.contains(proxy.element)).toBe(false);
  });

  it("uses SnapDOM's fast path and removes the capture proxy after export", async () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `
      <section class="webspring-material-stack"><div>metal</div></section>
      <aside class="syncloudos-notification-layer">banner</aside>
    `;
    document.body.appendChild(root);
    mockRect(root, new DOMRect(0, 0, 1280, 960));

    const canvas = document.createElement("canvas");
    const snapdom = {
      toCanvas: vi.fn(async (element: HTMLElement) => {
        expect(element.dataset.syncloudosNotificationCaptureProxy).toBe("true");
        expect(document.body.contains(element)).toBe(true);
        return canvas;
      })
    };

    const source = await captureNotificationSource(
      snapdom,
      [],
      1,
      new DOMRect(382.5, 12, 500, 104)
    );

    expect(source).toMatchObject({
      canvas,
      rect: {
        left: 382.5,
        top: 12,
        width: 500,
        height: 104
      }
    });
    expect(snapdom.toCanvas).toHaveBeenCalledTimes(1);
    expect(snapdom.toCanvas.mock.calls[0]?.[1]).toMatchObject({
      cache: "auto",
      dpr: 1,
      embedFonts: true,
      fast: true,
      filterMode: "remove",
      outerShadows: false,
      placeholders: false,
      resolvePicturePlaceholders: false,
      scale: 1
    });
    expect(document.querySelector("[data-syncloudos-notification-capture-proxy]")).toBeNull();
  });

  it("prunes descendants outside the banner strip while keeping intersecting content", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `
      <section class="webspring-material-stack">
        <div class="webspring-material-top">metal top</div>
        <div class="webspring-material-linen">linen below</div>
      </section>
      <section class="webspring-apps-container">
        <div class="webspring-app-view-frame">
          <header class="nse-app-topbar"><h1>Visible App Chrome</h1></header>
          <main class="webspring-app-view-content"><p>Below the fold</p></main>
        </div>
      </section>
    `;
    document.body.appendChild(root);
    const material = getElement(root, ".webspring-material-stack");
    const metalTop = getElement(root, ".webspring-material-top");
    const linen = getElement(root, ".webspring-material-linen");
    const apps = getElement(root, ".webspring-apps-container");
    const frame = getElement(root, ".webspring-app-view-frame");
    const topbar = getElement(root, ".nse-app-topbar");
    const appContent = getElement(root, ".webspring-app-view-content");
    apps.style.position = "fixed";
    mockRect(root, new DOMRect(0, 0, 1280, 960));
    mockRect(material, new DOMRect(0, 0, 1280, 960));
    mockRect(metalTop, new DOMRect(0, 0, 1280, 430));
    mockRect(linen, new DOMRect(0, 430, 1280, 530));
    mockRect(apps, new DOMRect(0, 0, 1280, 720));
    mockRect(frame, new DOMRect(0, 0, 1280, 720));
    mockRect(topbar, new DOMRect(0, 0, 1280, 68));
    mockRect(appContent, new DOMRect(0, 160, 1280, 560));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(390, 12, 500, 104));
    const proxyRoot = proxy.element;

    expect(proxyRoot.querySelector(".webspring-material-top")?.textContent).toContain("metal top");
    expect(proxyRoot.querySelector(".nse-app-topbar")?.textContent).toContain("Visible App Chrome");
    expect(proxyRoot.querySelector(".webspring-material-linen")).toBeNull();
    expect(proxyRoot.querySelector(".webspring-app-view-content")).toBeNull();

    proxy.dispose();
  });

  it("keeps fixed app chrome inside wrappers whose own rectangles miss the banner strip", () => {
    const root = document.createElement("main");
    root.className = "webspring-view route-app";
    root.innerHTML = `
      <section class="webspring-apps-container">
        <div class="webspring-app-view-frame">
          <div class="app-scroll-region">
            <header class="nse-app-topbar">Fixed App Chrome</header>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(root);
    const apps = getElement(root, ".webspring-apps-container");
    const frame = getElement(root, ".webspring-app-view-frame");
    const scrollRegion = getElement(root, ".app-scroll-region");
    const topbar = getElement(root, ".nse-app-topbar");
    apps.style.position = "fixed";
    topbar.style.position = "fixed";
    mockRect(root, new DOMRect(0, 0, 1280, 960));
    mockRect(apps, new DOMRect(0, 0, 1280, 720));
    mockRect(frame, new DOMRect(0, 0, 1280, 720));
    mockRect(scrollRegion, new DOMRect(0, 180, 1280, 520));
    mockRect(topbar, new DOMRect(0, 0, 1280, 56));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(390, 12, 500, 104));
    const proxyRoot = getElement(proxy.element, ".webspring-view");

    expect(proxyRoot.querySelector(".app-scroll-region")).not.toBeNull();
    expect(proxyRoot.querySelector(".nse-app-topbar")?.textContent).toContain("Fixed App Chrome");

    proxy.dispose();
  });

  it("pins pruned-layout survivors to their original viewport geometry", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `
      <header class="nse-app-topbar-metal">
        <div class="nse-app-topbar-metal-rail">Software</div>
        <div class="nse-app-topbar-metal-main"><h1>Overview</h1></div>
      </header>
    `;
    document.body.appendChild(root);
    const bar = getElement(root, ".nse-app-topbar-metal");
    const rail = getElement(root, ".nse-app-topbar-metal-rail");
    const main = getElement(root, ".nse-app-topbar-metal-main");
    bar.style.display = "grid";
    mockRect(root, new DOMRect(0, 0, 1600, 900));
    mockRect(bar, new DOMRect(0, 0, 1600, 56));
    mockRect(rail, new DOMRect(0, 0, 264, 56));
    mockRect(main, new DOMRect(264, 0, 1336, 56));

    // Strip sits over the centre of the bar: the rail misses it, the main bar hits it.
    const proxy = createNotificationCaptureProxy(root, new DOMRect(550, 12, 500, 104));

    expect(proxy.element.querySelector(".nse-app-topbar-metal-rail")).toBeNull();
    const clonedMain = getElement(proxy.element, ".nse-app-topbar-metal-main");
    expect(clonedMain.style.position).toBe("absolute");
    expect(clonedMain.style.left).toBe("264px");
    expect(clonedMain.style.top).toBe("0px");
    expect(clonedMain.style.width).toBe("1336px");
    expect(clonedMain.style.height).toBe("56px");
    expect(clonedMain.style.margin).toBe("0px");
    expect(clonedMain.textContent).toContain("Overview");

    proxy.dispose();
  });

  it("bakes scroll offsets into pinned geometry", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `
      <section class="app-scroll-host">
        <article class="app-scroll-content">scrolled content</article>
      </section>
    `;
    document.body.appendChild(root);
    const host = getElement(root, ".app-scroll-host");
    const content = getElement(root, ".app-scroll-content");
    mockRect(root, new DOMRect(0, 0, 1600, 900));
    mockRect(host, new DOMRect(0, 0, 1600, 104));
    // The content is scrolled up 50px inside its host.
    mockRect(content, new DOMRect(0, -50, 1600, 300));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(550, 12, 500, 104));
    const clonedContent = getElement(proxy.element, ".app-scroll-content");

    expect(clonedContent.style.position).toBe("absolute");
    expect(clonedContent.style.top).toBe("-50px");
    expect(clonedContent.style.height).toBe("300px");

    proxy.dispose();
  });

  it("keeps inline content in flow so line layout inside pinned boxes is preserved", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `
      <p class="app-title-line">Welcome to <em class="app-title-accent">SynCloudOS</em> today</p>
    `;
    document.body.appendChild(root);
    const line = getElement(root, ".app-title-line");
    const accent = getElement(root, ".app-title-accent");
    mockRect(root, new DOMRect(0, 0, 1600, 900));
    mockRect(line, new DOMRect(400, 20, 800, 24));
    // The inline accent's own box misses the strip; pruning it would reflow the line.
    mockRect(accent, new DOMRect(430, 20, 90, 24));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(550, 12, 500, 104));
    const clonedLine = getElement(proxy.element, ".app-title-line");
    const clonedAccent = getElement(proxy.element, ".app-title-accent");

    expect(clonedLine.textContent).toBe("Welcome to SynCloudOS today");
    expect(clonedAccent.style.position).not.toBe("absolute");

    proxy.dispose();
  });

  it("removes transient notification UI from the cloned capture tree", () => {
    const layer = document.createElement("aside");
    layer.className = "syncloudos-notification-layer";
    const child = document.createElement("div");
    layer.appendChild(child);

    expect(shouldIgnoreNotificationCaptureElement(child)).toBe(true);
  });

  it("keeps exact SnapDOM notification capture enabled unless explicitly disabled", () => {
    expect(shouldUseNotificationSnapdomCapture()).toBe(true);

    window.localStorage.setItem("SynCloudOS4:debug.notificationScreenCapture", "disabled");

    expect(shouldUseNotificationSnapdomCapture()).toBe(false);
  });
});

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

/** Computed values jsdom does not derive (matrices, individual transform properties). */
function mockComputedStyles(overrides: Map<Element, Record<string, string>>) {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    const values = overrides.get(element);
    if (!values) return style;
    return new Proxy(style, {
      get(target, property) {
        if (property === "getPropertyValue") return (name: string) => values[name] ?? target.getPropertyValue(name);
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
}

function mockLayoutSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: height });
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

  it("keeps a rotated box's rotation and pins it to its box before the rotation", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `<div class="dial-selector"><div class="dial-selector-tip">tip</div></div>`;
    document.body.appendChild(root);
    const selector = getElement(root, ".dial-selector");
    const tip = getElement(root, ".dial-selector-tip");
    mockRect(root, new DOMRect(0, 0, 1600, 900));
    // A 20 x 10 arrow laid out at (100, 50), turned a quarter about its centre.
    mockLayoutSize(selector, 20, 10);
    mockRect(selector, new DOMRect(105, 45, 10, 20));
    mockRect(tip, new DOMRect(105, 45, 10, 10));
    mockComputedStyles(new Map([[selector, { transform: "matrix(0, 1, -1, 0, 0, 0)", "transform-origin": "10px 5px" }]]));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(0, 0, 500, 104));
    const clonedSelector = getElement(proxy.element, ".dial-selector");

    expect(clonedSelector.style).toMatchObject({ position: "absolute", left: "100px", top: "50px", width: "20px", height: "10px" });
    expect(clonedSelector.style.transform).toMatch(/^matrix\(0,\s*1,\s*-1,\s*0,\s*0,\s*0\)$/u);
    // Its content is drawn through the rotation, so it stays in flow inside it.
    expect(getElement(proxy.element, ".dial-selector-tip").style.position).toBe("");

    proxy.dispose();
  });

  it("keeps the laid-out size of images cloned in flow, which have not loaded when captured", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `<div class="dial-composition"><span class="dial-indicator"><img class="dial-indicator-image" src="/indicator.png" alt="" style="width: 17px; height: auto"></span></div>`;
    document.body.appendChild(root);
    const composition = getElement(root, ".dial-composition");
    const image = getElement(root, ".dial-indicator-image");
    mockRect(root, new DOMRect(0, 0, 1600, 900));
    mockLayoutSize(composition, 400, 200);
    mockRect(composition, new DOMRect(0, 0, 300, 150));
    mockLayoutSize(image, 17, 19);
    mockComputedStyles(new Map([[composition, { transform: "matrix(0.75, 0, 0, 0.75, 0, 0)", "transform-origin": "0px 0px" }]]));

    const proxy = createNotificationCaptureProxy(root, new DOMRect(0, 0, 500, 104));
    const clonedImage = getElement(proxy.element, ".dial-indicator-image");

    expect(clonedImage.style).toMatchObject({ width: "17px", height: "19px", boxSizing: "border-box" });
    expect(clonedImage.style.position).toBe("");

    proxy.dispose();
  });

  it("applies a centring translate once, with children pinned inside the moved box", () => {
    const root = document.createElement("main");
    root.className = "webspring-view";
    root.innerHTML = `<div class="dial-orb"><div class="dial-orb-mark">mark</div></div>`;
    document.body.appendChild(root);
    const orb = getElement(root, ".dial-orb");
    const mark = getElement(root, ".dial-orb-mark");
    mockRect(root, new DOMRect(0, 0, 1600, 900));
    // A 40 x 40 orb laid out at (200, 30) and drawn with translate: -50% -50%.
    mockRect(orb, new DOMRect(180, 10, 40, 40));
    mockRect(mark, new DOMRect(185, 15, 10, 10));
    mockComputedStyles(new Map([[orb, { translate: "-50% -50%" }]]));
    const assigned = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

    const proxy = createNotificationCaptureProxy(root, new DOMRect(0, 0, 500, 104));
    const clonedOrb = getElement(proxy.element, ".dial-orb");
    const clonedMark = getElement(proxy.element, ".dial-orb-mark");

    expect(clonedOrb.style).toMatchObject({ position: "absolute", left: "200px", top: "30px", width: "40px", height: "40px" });
    expect(assigned).toHaveBeenCalledWith("translate", "-50% -50%");
    expect(assigned).toHaveBeenCalledWith("transform", "none");
    // 185 - 180: placed in the orb's translated frame, so the translate is not applied twice.
    expect(clonedMark.style).toMatchObject({ position: "absolute", left: "5px", top: "5px" });

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

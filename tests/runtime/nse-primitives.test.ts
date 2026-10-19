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

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NSECheckbox,
  NSEGroupBox,
  NSEListItem,
  NSEMenu,
  NSEPicker,
  NSEProgressButton,
  NSEPushButton,
  NSERadioGroup,
  NSEToggleButton,
  NSETopBar,
  useNSEControlFeedback,
} from "../../src/NSE/public/controls";
import { NSEGlassPanel } from "../../src/NSE/Components/NSEGlassPanel";
import { BrowserHapticsAdapter, createHFXVibratePattern, normalizeHFXFeedbackInput } from "../../src/SynCloudOS/PlatformAdapters/BrowserHapticsAdapter";
import { defaultHFXFeedbackPatterns, HFX_FEEDBACK_PRESET_NAMES } from "../../src/SynCloudOS/HapticsFX/feedbackPatterns";
import type { HFXFeedbackInput, HFXFeedbackPresetName, HFXFeedbackOptions } from "../../src/SynCloudOS/HapticsFX/feedbackTypes";
import { AUFXSystemFeedbackBus } from "../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { createRuntimeHapticsService } from "../../src/SynCloudOS/HapticsFX/HapticsService";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { NSEFeedbackProvider, useNSEFeedback } from "../../src/NSE/Feedback";
function createFeedbackAdapter(options: HFXFeedbackOptions = {}) {
  return new BrowserHapticsAdapter(new AUFXSystemFeedbackBus(options.audioContextFactory ?? (() => null)), options);
}
import {
  getNSESmoothSurfaceClassName,
  getNSESmoothSurfaceProps,
  getNSESmoothSurfaceRadiusValue,
  getNSESmoothSurfaceStyle,
  getOptionalNSESmoothSurfaceProps,
  resolveNSESmoothSurface
} from "../../src/NSE/SmoothSurface";
import { attributedContent, paragraph, textRun, serializeAttributedContent, parseAttributedContent, attributedContentText } from "../../src/NSE/Text";

function expectedHapticPattern(input: HFXFeedbackInput, intensity = 0.5) {
  const normalized = normalizeHFXFeedbackInput(input, { warn: null });
  return createHFXVibratePattern(normalized?.vibrations ?? [], intensity);
}

function createFakeHapticsDocument() {
  const input = {
    id: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    remove: vi.fn()
  };
  const label = {
    textContent: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
    querySelector: vi.fn(() => input),
    click: vi.fn()
  };
  const body = {
    appendChild: vi.fn()
  };

  return {
    document: {
      body,
      createElement: vi.fn((tagName: string) => tagName === "label" ? label : input)
    } as unknown as Document,
    input,
    label,
    body
  };
}

function createMockAudioContext() {
  const channelData = new Float32Array(16);
  const source = {
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    onended: null as (() => void) | null
  };
  const filter = {
    type: "",
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn()
  };
  const gain = {
    gain: { value: 0 },
    connect: vi.fn()
  };
  const buffer = {
    getChannelData: vi.fn(() => channelData)
  };
  const context = {
    sampleRate: 4000,
    state: "running",
    destination: {},
    createBiquadFilter: vi.fn(() => filter),
    createGain: vi.fn(() => gain),
    createBuffer: vi.fn(() => buffer),
    createBufferSource: vi.fn(() => source),
    resume: vi.fn(),
    close: vi.fn()
  } as unknown as AudioContext;

  return { context, source, filter, gain, buffer };
}

function createFastRaf() {
  let time = 0;
  let handle = 0;
  const requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = ++handle;
    globalThis.setTimeout(() => {
      time += 20;
      callback(time);
    }, 0);
    return id;
  };

  return {
    requestAnimationFrame,
    cancelAnimationFrame: vi.fn()
  };
}

async function installDom(vibrate = vi.fn(() => true)) {
  // @ts-expect-error The installed jsdom package has no declarations; this constructs the real test DOM.
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Element", dom.window.Element);
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("navigator", { userAgent: "vitest-jsdom", vibrate });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    dom.window.setTimeout(() => callback(Date.now()), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));

  return {
    dom,
    vibrate,
    cleanupDom: () => {
      dom.window.close();
      vi.unstubAllGlobals();
    }
  };
}

describe("HapticsFX feedback preservation", () => {
  it("publishes the upstream web-haptics preset vocabulary", () => {
    const expectedPresets: HFXFeedbackPresetName[] = [
      "selection",
      "warning",
      "error",
      "success",
      "light",
      "medium",
      "heavy",
      "soft",
      "rigid",
      "nudge",
      "buzz"
    ];

    expect(HFX_FEEDBACK_PRESET_NAMES).toEqual(expect.arrayContaining(expectedPresets));
    expect(Object.keys(defaultHFXFeedbackPatterns)).toEqual(expect.arrayContaining(expectedPresets));
    expect(defaultHFXFeedbackPatterns.success.pattern).toEqual([
      { duration: 30, intensity: 0.5 },
      { delay: 60, duration: 40, intensity: 1 }
    ]);
  });

  it("normalizes web-haptics inputs and applies PWM intensity modulation", () => {
    expect(normalizeHFXFeedbackInput(12)?.vibrations).toEqual([{ duration: 12 }]);
    expect(normalizeHFXFeedbackInput([10, 20, 30])?.vibrations).toEqual([
      { duration: 10 },
      { delay: 20, duration: 30 }
    ]);
    expect(normalizeHFXFeedbackInput({ pattern: [{ duration: 9, intensity: 0.5 }] })?.vibrations).toEqual([
      { duration: 9, intensity: 0.5 }
    ]);
    expect(createHFXVibratePattern([{ duration: 25, intensity: 0.7 }], 0.5)).toEqual([14, 6, 4, 1]);
    expect(createHFXVibratePattern(defaultHFXFeedbackPatterns.success.pattern, 0.5)).toEqual([10, 10, 5, 65, 40]);
  });

  it("uses browser vibration, clamps phases, and treats empty requests as no-ops", async () => {
    const vibrate = vi.fn(() => true);
    const warn = vi.fn();
    const controller = createFeedbackAdapter({ navigator: { vibrate }, warn });

    await controller.trigger("medium");
    expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("medium"));

    await controller.trigger(1500, { intensity: 1 });
    expect(vibrate).toHaveBeenLastCalledWith([1000]);

    await controller.trigger(false);
    await controller.trigger(null);
    await controller.trigger(undefined);
    expect(vibrate).toHaveBeenCalledTimes(2);

    await controller.trigger([{ duration: -1 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid vibration values"));
    expect(vibrate).toHaveBeenCalledTimes(2);

    controller.cancel();
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });

  it("runs the DOM and audio fallback when vibration is unavailable", async () => {
    const fakeDocument = createFakeHapticsDocument();
    const audio = createMockAudioContext();
    const raf = createFastRaf();
    const controller = createFeedbackAdapter({
      audioContextFactory: () => audio.context,
      document: fakeDocument.document,
      navigator: null,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    await controller.trigger("selection");

    expect(fakeDocument.body.appendChild).toHaveBeenCalledWith(fakeDocument.label);
    expect(fakeDocument.label.click).toHaveBeenCalled();
    expect(audio.context.createBiquadFilter).toHaveBeenCalled();
    expect(audio.context.createBufferSource).toHaveBeenCalled();
    expect(audio.source.start).toHaveBeenCalled();
    const fullVolumeGain = audio.gain.gain.value;
    controller.setMasterVolume(0.25);
    await controller.trigger("selection", { intensity: 1 });
    expect(audio.gain.gain.value).toBe(fullVolumeGain * 0.25);
    controller.setMasterVolume(0);
    await controller.trigger("selection", { intensity: 1 });
    expect(audio.gain.gain.value).toBe(0);
  });

  it("plays desktop button sound by default and lets preferences disable it", async () => {
    const vibrate = vi.fn(() => true);
    const fakeDocument = createFakeHapticsDocument();
    const audio = createMockAudioContext();
    const raf = createFastRaf();
    const controller = createFeedbackAdapter({
      audioContextFactory: () => audio.context,
      document: fakeDocument.document,
      navigator: { vibrate },
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    await controller.trigger("selection");
    expect(vibrate).toHaveBeenCalled();
    expect(audio.context.createBufferSource).toHaveBeenCalled();

    const disabledAudio = createMockAudioContext();
    controller.setButtonSoundEnabled(false);
    await controller.trigger("selection", { audioContextFactory: () => disabledAudio.context });
    expect(disabledAudio.context.createBufferSource).not.toHaveBeenCalled();
    expect(controller.getButtonSoundEnabled()).toBe(false);
  });

  it("keeps control haptics prevented when activation is cancelled", async () => {
    const { vibrate, cleanupDom } = await installDom();
    const { render, cleanup } = await import("@testing-library/react");
    const engine = createRuntimeHapticsService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
    let trigger!: ReturnType<typeof useNSEControlFeedback>["triggerNSEControlHapticForEvent"];
    function Harness() { trigger = useNSEControlFeedback().triggerNSEControlHapticForEvent; return null; }
    try {
      render(createElement(NSEFeedbackProvider, { value: engine }, createElement(Harness)));
      await trigger("medium", { defaultPrevented: false });
      expect(vibrate).toHaveBeenCalledWith(expectedHapticPattern("medium"));
      await trigger("error", { defaultPrevented: true });
      await trigger("selection", { defaultPrevented: false }, false);
      expect(vibrate).toHaveBeenCalledTimes(1);
    } finally { cleanup(); engine.dispose(); cleanupDom(); }
  });

  it("applies universal NSE control defaults", async () => {
    const { vibrate, cleanupDom } = await installDom();
    const { render: baseRender, fireEvent, cleanup } = await import("@testing-library/react");
    const engine = createRuntimeHapticsService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
    const render = (element: Parameters<typeof baseRender>[0]) => baseRender(createElement(NSEFeedbackProvider, { value: engine }, element));

    try {
      const onClick = vi.fn();
      const rendered = render(createElement("div", null,
        createElement(NSEPushButton, { tone: "medium", onClick }, "Medium"),
        createElement(NSEPushButton, { tone: "light", onClick }, "Light"),
        createElement(NSEPushButton, { tone: "dark", onClick }, "Dark"),
        createElement(NSEPushButton, { tone: "affirmative", onClick }, "OK"),
        createElement(NSEPushButton, { tone: "negative", onClick }, "Delete"),
        createElement(NSEPushButton, { tone: "negative", haptic: false, onClick }, "Silent"),
        createElement(NSECheckbox, { label: "Check", onChange: vi.fn() }),
        createElement(NSEToggleButton, { onCheckedChange: vi.fn() }),
        createElement(NSERadioGroup, {
          label: "Mode",
          options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
          defaultValue: "a",
          onValueChange: vi.fn()
        }),
        createElement(NSEListItem, { role: "button", onClick: vi.fn() }, "List item"),
        createElement(NSEProgressButton, { value: 20, onClick: vi.fn() }, "Progress"),
        createElement(NSETopBar, {
          title: "Journal",
          leadingItems: [{ kind: "webspring", label: "Return", onClick: vi.fn() }]
        })
      ));

      fireEvent.click(rendered.getByText("Medium"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("medium"));
      fireEvent.click(rendered.getByText("Light"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("light"));
      fireEvent.click(rendered.getByText("Dark"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("rigid"));
      fireEvent.click(rendered.getByText("OK"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("success"));
      fireEvent.click(rendered.getByText("Delete"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("error"));
      fireEvent.click(rendered.getByText("Silent"));
      expect(vibrate).toHaveBeenCalledTimes(5);
      fireEvent.click(rendered.getByLabelText("Check"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("selection"));
      fireEvent.click(rendered.getByRole("switch"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("selection"));
      fireEvent.click(rendered.getByRole("radio", { name: "B" }));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("selection"));
      fireEvent.click(rendered.getByText("List item"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("selection"));
      fireEvent.click(rendered.getByText("Progress"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("medium"));
      fireEvent.click(rendered.getByLabelText("Return"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("rigid"));
    } finally {
      cleanup();
      cleanupDom();
    }
  });

  it("uses soft trigger haptics and selection item haptics for menu and picker", async () => {
    const { vibrate, cleanupDom } = await installDom();
    const { render: baseRender, fireEvent, cleanup, waitFor } = await import("@testing-library/react");
    const engine = createRuntimeHapticsService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
    const render = (element: Parameters<typeof baseRender>[0]) => baseRender(createElement(NSEFeedbackProvider, { value: engine }, createElement(NSEStandaloneControlHost, { document, window, presentation: createStaticPresentationPort({ width: 1024, height: 768 }) }, element)));

    try {
      const rendered = render(createElement("div", null,
        createElement(NSEMenu, {
          label: "Actions",
          items: [{ value: "open", label: "Open" }],
          onSelect: vi.fn()
        }),
        createElement(NSEPicker, {
          label: "Format",
          options: [{ value: "plain", label: "Plain" }, { value: "rich", label: "Rich" }],
          defaultValue: "plain",
          onValueChange: vi.fn()
        })
      ));

      fireEvent.click(rendered.getByText("Actions"));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("soft"));
      fireEvent.click(await rendered.findByRole("menuitem", { name: "Open" }));
      await waitFor(() => expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("selection")));

      fireEvent.click(rendered.getByRole("button", { name: "Format Plain" }));
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("soft"));
      fireEvent.click(await rendered.findByRole("option", { name: "Rich" }));
      await waitFor(() => expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("selection")));
    } finally {
      cleanup();
      engine.dispose();
      cleanupDom();
    }
  });

  it("exposes a React hook with trigger, cancel, support, and cleanup", async () => {
    const { vibrate, cleanupDom } = await installDom();
    const { render, cleanup } = await import("@testing-library/react");
    const hook: { current: ReturnType<typeof useNSEFeedback> | null } = { current: null };

    function Harness() {
      hook.current = useNSEFeedback();
      return null;
    }

    try {
      const engine = createRuntimeHapticsService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
      const rendered = render(createElement(NSEFeedbackProvider, { value: engine }, createElement(Harness)));
      expect(hook.current?.isSupported).toBe(true);
      await hook.current?.trigger("medium");
      expect(vibrate).toHaveBeenLastCalledWith(expectedHapticPattern("medium"));
      hook.current?.cancel();
      expect(vibrate).toHaveBeenLastCalledWith(0);
      rendered.unmount();
    } finally {
      cleanup();
      cleanupDom();
    }
  });

  it("isolates two runtime feedback owners and revokes disposed engines", async () => {
    const first = vi.fn(() => true), second = vi.fn(() => true);
    const a = createRuntimeHapticsService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate: first }, audio: "off" });
    const b = createRuntimeHapticsService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate: second }, audio: "off" });
    await a.trigger("light"); expect(first).toHaveBeenCalledWith(expectedHapticPattern("light")); expect(second).not.toHaveBeenCalled();
    a.dispose(); await expect(a.trigger("medium")).rejects.toThrow(expect.objectContaining({ code: "HFX_HAPTIC_ENGINE_DISPOSED" }));
    await b.trigger("rigid"); expect(second).toHaveBeenCalledWith(expectedHapticPattern("rigid")); b.dispose();
  });
});

describe("NSESmoothSurface", () => {
  it("resolves stable classes and styles for smooth surface options", () => {
    const resolved = resolveNSESmoothSurface({
      radius: "lg",
      focus: "within",
      overflow: "clip",
      scroll: "momentum",
      shadow: "raised",
      performance: "transform",
      className: "app-surface"
    });

    expect(resolved.className.split(" ")).toEqual(expect.arrayContaining([
      "nse-smooth-surface",
      "nse-smooth-surface-radius-lg",
      "nse-smooth-surface-focus-within",
      "nse-smooth-surface-overflow-clip",
      "nse-smooth-surface-scroll-momentum",
      "nse-smooth-surface-shadow-raised",
      "nse-smooth-surface-performance-transform",
      "app-surface"
    ]));
    expect(resolved.style).toMatchObject({
      "--nse-smooth-surface-radius": "12px",
      "--nse-smooth-surface-mobile-radius": "12px",
      borderRadius: "var(--nse-smooth-surface-active-radius, var(--nse-smooth-surface-radius))",
      boxShadow: "var(--nse-smooth-surface-shadow)",
      overflow: "auto",
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
      backfaceVisibility: "hidden",
      transform: "translateZ(0)",
      willChange: "transform"
    });
  });

  it("keeps radius, class, style, and prop helpers explicit and composable", () => {
    expect(getNSESmoothSurfaceRadiusValue(18)).toBe("18px");
    expect(getNSESmoothSurfaceRadiusValue("pill")).toBe("999px");

    expect(getNSESmoothSurfaceClassName({ radius: 18, className: "local" }, "external").split(" ")).toEqual(
      expect.arrayContaining(["nse-smooth-surface-radius-custom", "local", "external"])
    );

    expect(getNSESmoothSurfaceStyle(
      {
        radius: 18,
        shadow: "none",
        style: {
          overflow: "visible",
          color: "red"
        }
      },
      {
        boxShadow: "none"
      }
    )).toMatchObject({
      "--nse-smooth-surface-radius": "18px",
      "--nse-smooth-surface-shadow": "none",
      overflow: "visible",
      color: "red",
      boxShadow: "none"
    });

    expect(getNSESmoothSurfaceProps({ radius: "sm" })).toMatchObject({
      className: expect.stringContaining("nse-smooth-surface-radius-sm"),
      style: {
        "--nse-smooth-surface-radius": "6px"
      }
    });
  });

  it("keeps smooth surface wiring opt-in for panels and app bars", () => {
    expect(getOptionalNSESmoothSurfaceProps(false, "plain-surface")).toEqual({
      className: "plain-surface",
      style: undefined
    });

    const groupBoxMarkup = renderToStaticMarkup(createElement(
      NSEGroupBox,
      {
        label: "Reader",
        smoothSurface: {
          radius: "xl",
          focus: "within",
          shadow: "floating",
          scroll: "panel"
        }
      },
      "Surface"
    ));

    expect(groupBoxMarkup).toContain("nse-control-group-box");
    expect(groupBoxMarkup).toContain("nse-smooth-surface-radius-xl");
    expect(groupBoxMarkup).toContain("nse-smooth-surface-focus-within");
    expect(groupBoxMarkup).toContain("--nse-smooth-surface-radius:18px");
    expect(groupBoxMarkup).toContain("scrollbar-gutter:stable");

    const appTopBarMarkup = renderToStaticMarkup(createElement(NSETopBar, {
      title: "Journal",
      smoothSurface: {
        radius: "lg",
        overflow: "hidden",
        shadow: "hairline"
      }
    }));

    expect(appTopBarMarkup).toContain("nse-app-topbar");
    expect(appTopBarMarkup).toContain("nse-smooth-surface-radius-lg");
    expect(appTopBarMarkup).toContain("--nse-app-topbar-height:68px");
    expect(appTopBarMarkup).toContain("--nse-smooth-surface-shadow:0 0 0 1px rgba(255, 255, 255, 0.18)");

    const appTopBarWithTitleActionMarkup = renderToStaticMarkup(createElement(NSETopBar, {
      title: "Journal",
      titleAction: {
        label: "Open QuickSwitch",
        selected: true,
        onClick: vi.fn()
      }
    }));

    expect(appTopBarWithTitleActionMarkup).toContain("nse-app-topbar-title-button");
    expect(appTopBarWithTitleActionMarkup).toContain("aria-expanded=\"true\"");
    expect(appTopBarWithTitleActionMarkup).toContain("nse-app-topbar-title-arrow-right");
    expect(appTopBarWithTitleActionMarkup).toContain("nse-app-topbar-title-arrow-down");

    const glassPanelMarkup = renderToStaticMarkup(createElement(
      NSEGlassPanel,
      {
        children: "Panel",
        smoothSurface: {
          radius: 18,
          overflow: "clip",
          performance: "paint"
        }
      }
    ));

    expect(glassPanelMarkup).toContain("nse-material-glass-panel");
    expect(glassPanelMarkup).toContain("nse-smooth-surface-radius-custom");
    expect(glassPanelMarkup).toContain("overflow:clip");
    expect(glassPanelMarkup).toContain("contain:paint");
  });
});

describe("portable NSE text primitives", () => {
  it("preserves application font data and literal text through the portable attributed boundary", () => {
    const content = attributedContent([paragraph([
      textRun("Custom <type>", { font: { familyId: "app-display", face: "Display Nova Heavy", size: 20 }, bold: true }),
      textRun("Read more", { link: "/journal/webspring" }),
    ])]);
    const restored = parseAttributedContent(JSON.parse(serializeAttributedContent(content)));
    expect(restored).toEqual(content);
    expect(attributedContentText(restored)).toBe("Custom <type>Read more");
    expect(() => textRun("Unsafe", { link: "javascript:alert(1)" })).toThrow(/link URL/);
  });
});

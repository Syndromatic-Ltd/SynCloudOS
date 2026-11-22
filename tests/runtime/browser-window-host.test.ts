// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createBrowserWindowHost } from "../../src/SynCloudOS/PlatformAdapters/BrowserWindowHost";

describe("browser child window host", () => {
  it("acknowledges the ready outlet and closes only after the renderer releases it", async () => {
    const frame = document.createElement("iframe");
    const initialStyle = document.createElement("style");
    initialStyle.textContent = ":root { --window-host-style: 1 }";
    document.head.append(initialStyle);
    document.body.append(frame);
    const popup = frame.contentWindow!;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const close = vi.spyOn(popup, "close").mockImplementation(() => undefined);
    const host = createBrowserWindowHost(window, () => null);
    const setup = { generation: 7, title: "Native editor", bounds: { x: 0, y: 0, width: 640, height: 480 } };
    try {
      const binding = await host.bind!("editor", setup);
      expect(binding?.element.isConnected).toBe(true);
      expect(binding?.nativeChrome).toBe(true);
      expect(popup.document.compatMode).toBe("CSS1Compat");
      expect(popup.document.doctype?.name).toBe("html");
      expect(popup.document.title).toBe("Native editor");
      const secondStyle = document.createElement("style");
      secondStyle.textContent = ":root { --window-host-style: 2 }";
      document.head.insertBefore(secondStyle, initialStyle);
      await new Promise<void>(resolve => queueMicrotask(resolve));
      expect([...popup.document.head.querySelectorAll("style")].map(style => style.textContent))
        .toEqual([secondStyle.textContent, initialStyle.textContent]);
      secondStyle.remove();

      const mounted = popup.document.createElement("div");
      binding!.element.append(mounted);
      await host.unbind!("editor", setup.generation + 1);
      expect(close).not.toHaveBeenCalled();

      const released = host.unbind!("editor", setup.generation);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(close).not.toHaveBeenCalled();
      mounted.remove();
      await released;
      expect(close).toHaveBeenCalledOnce();
    } finally {
      frame.remove();
      initialStyle.remove();
      open.mockRestore();
      close.mockRestore();
    }
  });

  it("always opens a native-chrome popup so browser windows keep OS minimise/maximise without duplicate titlebars", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const popup = frame.contentWindow!;
    const close = vi.spyOn(popup, "close").mockImplementation(() => undefined);
    const requestWindow = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const previousSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const previousPip = Object.getOwnPropertyDescriptor(window, "documentPictureInPicture");
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(window, "documentPictureInPicture", {
      value: { window: null, requestWindow },
      configurable: true,
    });
    const host = createBrowserWindowHost(window, () => null);
    try {
      const binding = await host.bind!("note", {
        generation: 1,
        title: "Detached note",
        bounds: { x: 0, y: 0, width: 340, height: 420 },
      });
      expect(requestWindow).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledOnce();
      expect(binding?.nativeChrome).toBe(true);
      expect(popup.document.compatMode).toBe("CSS1Compat");
      expect(popup.document.title).toBe("Detached note");
      await host.unbind!("note", 1);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      frame.remove();
      open.mockRestore();
      close.mockRestore();
      if (previousSecure) Object.defineProperty(window, "isSecureContext", previousSecure);
      else delete (window as unknown as Record<string, unknown>).isSecureContext;
      if (previousPip) Object.defineProperty(window, "documentPictureInPicture", previousPip);
      else delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
    }
  });

  it("opens popups at the in-page window's screen position and reports resize/move bounds back", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const popup = frame.contentWindow!;
    const close = vi.spyOn(popup, "close").mockImplementation(() => undefined);
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const saved = {
      screenX: Object.getOwnPropertyDescriptor(window, "screenX"),
      screenY: Object.getOwnPropertyDescriptor(window, "screenY"),
      outerWidth: Object.getOwnPropertyDescriptor(window, "outerWidth"),
      innerWidth: Object.getOwnPropertyDescriptor(window, "innerWidth"),
      outerHeight: Object.getOwnPropertyDescriptor(window, "outerHeight"),
      innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight"),
    };
    Object.defineProperties(window, {
      screenX: { value: 100, configurable: true },
      screenY: { value: 50, configurable: true },
      outerWidth: { value: 1300, configurable: true },
      innerWidth: { value: 1280, configurable: true },
      outerHeight: { value: 900, configurable: true },
      innerHeight: { value: 800, configurable: true },
    });
    Object.defineProperties(popup, {
      screenX: { value: 580, configurable: true, writable: true },
      screenY: { value: 340, configurable: true, writable: true },
      innerWidth: { value: 340, configurable: true, writable: true },
      innerHeight: { value: 420, configurable: true, writable: true },
    });
    const host = createBrowserWindowHost(window, () => null);
    const events: unknown[] = [];
    const unsubscribe = host.subscribe(event => events.push(event));
    try {
      const binding = await host.bind!("note", {
        generation: 3,
        title: "Detached note",
        bounds: { x: 470, y: 190, width: 340, height: 420 },
      });
      // Opener viewport origin is (100 + (1300 - 1280)/2, 50 + (900 - 800)) = (110, 150)
      expect(open).toHaveBeenCalledWith("about:blank", "_blank", "popup,left=580,top=340,width=340,height=420");
      expect(binding?.readBounds?.()).toEqual({ x: 470, y: 190, width: 340, height: 420 });

      Object.defineProperties(popup, {
        screenX: { value: 640, configurable: true, writable: true },
        screenY: { value: 380, configurable: true, writable: true },
        innerWidth: { value: 520, configurable: true, writable: true },
        innerHeight: { value: 600, configurable: true, writable: true },
      });
      popup.dispatchEvent(new popup.Event("resize"));
      expect(events).toContainEqual({
        kind: "boundsChanged",
        windowId: "note",
        generation: 3,
        bounds: { x: 530, y: 230, width: 520, height: 600 },
      });
      expect(binding?.readBounds?.()).toEqual({ x: 530, y: 230, width: 520, height: 600 });
      await host.unbind!("note", 3);
    } finally {
      unsubscribe();
      frame.remove();
      open.mockRestore();
      close.mockRestore();
      for (const [key, desc] of Object.entries(saved)) {
        if (desc) Object.defineProperty(window, key, desc);
      }
    }
  });
});

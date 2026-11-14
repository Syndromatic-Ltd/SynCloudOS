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
});

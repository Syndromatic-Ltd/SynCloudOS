// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { useContext, useLayoutEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createPortal } from "react-dom";
import { ApplicationHostTitlebar } from "../../src/SynCloudOSReact/ApplicationHostTitlebar";
import { WindowTitlebarHostContext } from "../../src/SynCloudOS/AppHosting/windowChrome";
import { createApplicationMenuStore } from "../../src/SynCloudOSReact/ApplicationMenuTrigger";

afterEach(cleanup);

function Window({ title, subtitle = "" }: { readonly title: string; readonly subtitle?: string }) {
  const host = useContext(WindowTitlebarHostContext);
  useLayoutEffect(() => {
    host?.setDocument({ title, subtitle, documentEdited: true });
    return () => host?.setDocument(null);
  }, [host, subtitle, title]);
  return <>
    <p>content</p>
    {host?.trailingAccessories ? createPortal(<span data-testid="accessory">— Edited</span>, host.trailingAccessories) : null}
  </>;
}

describe("ApplicationHostTitlebar", () => {
  it("draws the window's document and trailing accessories above the application", () => {
    const store = createApplicationMenuStore();
    const view = render(
      <ApplicationHostTitlebar title="Minimak" iconSrc="/icon.svg" material="metal" scheme="light" menuStore={store} menuLabel="Settings">
        <Window title="Eight-coil reference" subtitle="Draft" />
      </ApplicationHostTitlebar>,
    );
    const bar = view.container.querySelector(".nse-document-titlebar")!;
    expect(bar).not.toBeNull();
    expect(bar.querySelector(".nse-window-titlebar-title-text")?.textContent).toBe("Eight-coil reference");
    expect(bar.querySelector(".nse-window-titlebar-subtitle")?.textContent).toBe("Draft");
    expect(bar.querySelector(".nse-window-titlebar-title")?.getAttribute("data-document-edited")).toBe("true");
    expect(bar.querySelector("[data-layout-attribute='trailing'] [data-testid='accessory']")).not.toBeNull();
    expect(bar.textContent).toContain("Minimak");
    // The bar precedes the content, in flow.
    const content = view.getByText("content");
    expect(bar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the application menu from its settings item, and draws none without a label", () => {
    const store = createApplicationMenuStore();
    const view = render(
      <ApplicationHostTitlebar title="Minimak" iconSrc={null} material="cumulus" scheme="dark" menuStore={store} menuLabel="Settings">
        <Window title="Doc" />
      </ApplicationHostTitlebar>,
    );
    const settings = view.getByRole("button", { name: "Settings" });
    act(() => { settings.click(); });
    expect(store.getSnapshot().open).toBe(true);
    view.rerender(
      <ApplicationHostTitlebar title="Minimak" iconSrc={null} material="cumulus" scheme="dark" menuStore={store} menuLabel={null}>
        <Window title="Doc" />
      </ApplicationHostTitlebar>,
    );
    expect(view.queryByRole("button", { name: "Settings" })).toBeNull();
  });
});

/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GFXColour } from "../../../../src/FX/GraphicsFX/GFXColour";
import { NSEAppearance } from "../../../../src/NSE/Appearance/NSEAppearance";
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { NSEColourPanel } from "../../../../src/NSE/Colour/ColourPanel/NSEColourPanel";
import { NSEColourPanelController } from "../../../../src/NSE/Colour/ColourPanel/NSEColourPanelController";
import { NSEButton } from "../../../../src/NSE/Controls/Buttons/NSEButton";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";
import type { OpenPanelService } from "../../../../src/NSE/FilePanels/NSEOpenPanel";
import { NSESavePanel } from "../../../../src/NSE/FilePanels/NSESavePanel";
import { MenuView } from "../../../../src/NSE/Menus/MenuView";
import { NSETabView } from "../../../../src/NSE/Navigation/NSETabView";
import { NSEPopover } from "../../../../src/NSE/Overlays/NSEPopover";
import { StandaloneControlHost } from "../../../../src/NSE/Overlays/NSEStandaloneControlHost";
import type { NSEAppTheme } from "../../../../src/NSE/Theme/NSEAppTheme";
import type { NSETheme } from "../../../../src/NSE/Theme/NSETheme";
import { NSEView } from "../../../../src/NSE/Views/NSEView";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createStaticPresentationPort } from "../../../fixtures/presentationTraits";
import "../../../../src/NSE/public/styles.css";
import "../../../../src/SynCloudOS/styles/runtime.css";
// @ts-expect-error The fixture Vite plugin provides this virtual module.
import { themes } from "virtual:theme-app-scope/themes";

const dusk: NSETheme = themes["com.example.dusk"];
const redChrome: NSEAppTheme = themes["com.example.red-chrome"];
const parameters = new URLSearchParams(location.search);
const appearance = parameters.get("appearance") === "system" ? undefined
  : parameters.get("appearance") === "nameless" ? new NSEAppearance({ theme: redChrome })
  : new NSEAppearance("aqua", { theme: redChrome });
const presentation = createStaticPresentationPort({ width: 1040, height: 800, reducedMotion: true });
const responderId = "app-scope";
const colourAnchorId = "app-scope-colour";
const savePanelId = "app-scope-save";
const noop = () => undefined;
const fileService: OpenPanelService = {
  open: async () => ({ kind: "cancelled" }),
  save: async () => ({ kind: "cancelled" }),
  release() {},
  dispose() {},
};
const saveRequest = {
  id: savePanelId,
  accepts: [],
  suggestedName: "Report.txt",
  destination: "handle-or-download",
  conflictPolicy: "fail-if-exists",
} as const;
const tabs = ["Documents", "Pictures"].map(label => ({
  id: label.toLowerCase(),
  label,
  render: () => <p>{label} content</p>,
}));
const menuItems = [
  { value: "open", label: "Open document" },
  { value: "export", label: "Export document" },
];

function Specimens({ colourPanel }: { colourPanel: NSEColourPanelController }) {
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLButtonElement | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  useLayoutEffect(() => colourPanel.activateTarget({
    id: colourAnchorId,
    responderId,
    read: () => GFXColour.parse("#336699"),
    preview: noop,
    commit: noop,
    cancel: noop,
  }), [colourPanel]);

  return (
    <NSEView id="app-chrome" appearance={appearance}>
      <NSETabView aria-label="Workspace" items={tabs} defaultSelectedId="documents" />
      <NSEButton id="app-button" title="Apply" />
      <MenuView label="Actions" items={menuItems} />
      <button type="button" ref={setPopoverAnchor} onClick={() => setPopoverOpen(true)}>Show popover</button>
      <NSEPopover id="app-scope-popover" open={popoverOpen} anchor={popoverAnchor} surface="overlay"
        parentWindowControllerId={null} title="Notes" contentSize={{ width: 280, height: 180 }} onOpenChange={setPopoverOpen}>
        <p>Document notes</p>
      </NSEPopover>
      <button type="button" onClick={() => setSaveOpen(true)}>Show save panel</button>
      <NSESavePanel id={savePanelId} open={saveOpen} anchor={null} compact={false}
        parentResponderId={responderId} parentWindowControllerId={null} service={fileService}
        request={saveRequest} onOpenChange={setSaveOpen} />
      <button type="button" id={colourAnchorId} onClick={() => colourPanel.open()}>Show colour panel</button>
      <NSEColourPanel controller={colourPanel} />
    </NSEView>
  );
}

function Host() {
  const [runtime] = useState(() => {
    const value = createSynCloudOS({
      id: "theme-app-scope",
      environment: createBrowserRuntimeEnvironment(),
      authenticationPolicy: "disabled",
    });
    value.appearance.set("light");
    return value;
  });
  const [colourPanel] = useState(() => new NSEColourPanelController(runtime, { owner: nseUnowned }));
  useEffect(() => () => {
    colourPanel.dispose();
    void runtime.dispose("App theme scope fixture unmounted");
  }, [colourPanel, runtime]);

  return (
    <NSEAppearanceProvider theme={dusk} appearanceService={runtime.appearance}>
      <StandaloneControlHost document={document} window={window} presentation={presentation} parentResponderId={responderId}>
        <button id="outside-appearance" type="button" onClick={() => runtime.appearance.set("dark")}>Set dark scheme</button>
        <Specimens colourPanel={colourPanel} />
      </StandaloneControlHost>
    </NSEAppearanceProvider>
  );
}

const root = document.getElementById("root")!;
if (parameters.get("host") === "application") {
  const { mountApplication } = await import("./application");
  await mountApplication(root, dusk, redChrome, themes["com.example.blue-chrome"]);
} else {
  createRoot(root).render(<Host />);
}

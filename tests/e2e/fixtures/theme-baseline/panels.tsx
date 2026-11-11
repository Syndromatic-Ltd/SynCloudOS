import { useEffect, useLayoutEffect, useState } from "react";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { NSEColourPanelProvider } from "../../../../src/NSE/Colour/ColourPanel/NSEColourPanelProvider";
import { NSEColourPanelController } from "../../../../src/NSE/Colour/ColourPanel/NSEColourPanelController";
import { NSEColourPanel } from "../../../../src/NSE/Colour/ColourPanel/NSEColourPanel";
import { NSEColourWell } from "../../../../src/NSE/Colour/Controls/NSEColourWell";
import { GFXColour } from "../../../../src/FX/GraphicsFX/GFXColour";
import { NSEFontManager } from "../../../../src/NSE/Typography/NSEFontManager";
import { NSEFontPanel } from "../../../../src/NSE/Typography/NSEFontPanel";
import { NSEMenu } from "../../../../src/NSE/Menus/NSEMenu";
import { NSEMenuBar } from "../../../../src/NSE/Menus/NSEMenuBar";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";
import type { ThemeBaselineSurface } from "./catalogue";

const noop = () => undefined;
export function ColourWellSurface({ isEnabled }: { isEnabled: boolean }) {
  const [runtime] = useState(() => createSynCloudOS({ id: "baseline-colour-well", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" }));
  useEffect(() => () => { void runtime.dispose("baseline unmounted"); }, [runtime]);
  return <NSEColourPanelProvider service={runtime.colourPanel}><NSEColourWell aria-label="Accent" defaultValue={GFXColour.rgba(0.2, 0.5, 0.8)} isEnabled={isEnabled} /></NSEColourPanelProvider>;
}
function ColourPanelSurface({ picker }: { picker: string }) {
  const [runtime] = useState(() => createSynCloudOS({ id: "baseline-colour-panel", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" }));
  const [controller] = useState(() => new NSEColourPanelController(runtime, { owner: nseUnowned }));
  useLayoutEffect(() => {
    const release = controller.activateTarget({ id: "baseline-colour-anchor", responderId: "baseline", read: () => GFXColour.parse("#336699"), preview: noop, commit: noop, cancel: noop });
    controller.open();
    return () => { release(); controller.dispose(); void runtime.dispose("baseline unmounted"); };
  }, [runtime, controller]);
  return <><button id="baseline-colour-anchor">Accent</button><NSEColourPanel controller={controller} /></>;
}
const manager = new NSEFontManager({ library: null, families: [{ id: "sans", label: "Arial", defaultPresetId: "arial-regular", presets: [
  { id: "arial-regular", label: "Regular", familyId: "sans", family: "Arial", weight: 400, style: "normal" },
  { id: "arial-bold", label: "Bold", familyId: "sans", family: "Arial", weight: 700, style: "normal" },
] }] });
function FontPanelSurface() {
  return <NSEFontPanel open anchor={null} manager={manager} commandPort={{ execute: async () => ({ status: "cancelled" }) }} initialFontId="arial-regular" initialSize={14} showsRuler onOpenChange={noop} />;
}
function MenuBarSurface() {
  const [runtime] = useState(() => createSynCloudOS({ id: "baseline-menu-bar", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" }));
  const [menu] = useState(() => new NSEMenu({ owner: nseUnowned, title: "Main", runtime: { signal: runtime.signal, commands: {
    getPresentationGeneration: () => ({ registryGeneration: runtime.commands.inspect().generation, responderGeneration: runtime.responders.generation }),
    validateMany: runtime.commands.validateMany.bind(runtime.commands), prepareDispatch: runtime.commands.prepareDispatch.bind(runtime.commands), dispatch: runtime.commands.dispatch.bind(runtime.commands),
  } }, items: [
    { title: "File", submenu: [{ title: "New document", view: () => <span>New document</span> }, { isSeparatorItem: true }, { title: "Open…", view: () => <span>Open…</span> }] },
    { title: "Edit", submenu: [{ title: "Undo", view: () => <span>Undo</span> }] },
  ] }));
  useEffect(() => () => { menu.dispose(); void runtime.dispose("baseline unmounted"); }, [menu, runtime]);
  return <NSEMenuBar menu={menu} />;
}
export function panelThemeBaselineCatalogue(): ThemeBaselineSurface[] {
  return [
    ...Object.entries({ wheel: "Colour Wheel", sliders: "Colour Sliders", palettes: "Colour Palettes", image: "Image Palettes" }).map(([picker, chooseTab]) => ({ id: `colour-panel-${picker}`, render: () => <ColourPanelSurface picker={picker} />, ready: '[data-nse-utility-panel]', chooseTab, fullPage: true })),
    { id: "font-panel", render: () => <FontPanelSurface />, ready: '[data-nse-utility-panel]', fullPage: true },
    { id: "menu-bar", render: () => <MenuBarSurface /> },
    { id: "menu-bar-open", render: () => <MenuBarSurface />, interaction: "open", fullPage: true },
  ];
}

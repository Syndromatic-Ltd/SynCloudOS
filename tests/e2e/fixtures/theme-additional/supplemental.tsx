import { useEffect, useRef, useState, type ReactNode } from "react";
import { NSERadioGroup } from "../../../../src/NSE/Controls/Fields/NSEFields";
import { NSEColourSwatches } from "../../../../src/NSE/Colour/Pickers/NSEColourSwatches";
import { GFXColour } from "../../../../src/FX/GraphicsFX/GFXColour";
import { NSETooltip } from "../../../../src/NSE/Tooltips/NSETooltip";
import { NSEVirtualViewport, useNSEVirtualiser } from "../../../../src/NSE/DataViews/Virtualisation";
import { NSEToolbarView } from "../../../../src/NSE/Toolbars/NSEToolbarView";
import { NSEToolbarConfigurationSheet } from "../../../../src/NSE/Toolbars/NSEToolbarConfigurationSheet";
import { NSEToolbarController } from "../../../../src/NSE/Toolbars/NSEToolbarController";
import { NSEUserDefaultsController } from "../../../../src/NSE/Controllers";
import type { NSEToolbarPreferences, NSEToolbarRuntimePort } from "../../../../src/NSE/Toolbars/toolbarTypes";
import { defaultsFrom } from "../../../fixtures/userDefaults";
const noop = () => undefined;
function Virtual() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualiser = useNSEVirtualiser({ count: 20, axis: "block", overscan: 1, estimateSize: 24, getKey: String, viewportRef, viewportSize: 100 });
  return <NSEVirtualViewport ref={viewportRef} virtualiser={virtualiser} viewportSize={100} renderItem={item => <span>{item.key}</span>} />;
}
function Tooltip() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <><button ref={setAnchor}>Anchor</button><NSETooltip id="contract-tooltip" open anchor={anchor} content="Help" /></>;
}
function Toolbar({ width, customising }: { width: number; customising: boolean }) {
  const [controller] = useState(() => {
    const values = new Map<string, unknown>();
    const preferences = new NSEUserDefaultsController<NSEToolbarPreferences>({ namespace: "contract-toolbar", schema: { version: 1, defaults: { itemIds: ["save", "custom", "space", "flex", "separator"], displayMode: "icon-and-label", sizeMode: "regular" }, fields: { itemIds: { validate: (v: unknown): v is readonly string[] => Array.isArray(v) }, displayMode: { validate: (v: unknown): v is NSEToolbarPreferences["displayMode"] => typeof v === "string" }, sizeMode: { validate: (v: unknown): v is NSEToolbarPreferences["sizeMode"] => typeof v === "string" } }, migrations: [] }, defaults: defaultsFrom({ read: key => values.get(key) ?? null, write: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } }) });
    const runtime: NSEToolbarRuntimePort = { signal: new AbortController().signal, commands: { getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }), validateMany: async requests => new Map(requests.map(request => [request.key, { commandId: request.commandId, responderId: "contract", title: "Save", enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }])), prepareDispatch: async () => ({ status: "cancelled", reason: "specimen" }), dispatch: async commandId => ({ status: "cancelled", commandId, operationId: "contract", reason: "specimen" }) } };
    return new NSEToolbarController({ configuration: { identifier: "contract-toolbar", owner: { kind: "window", windowControllerId: "contract" }, allowedItemIds: ["save", "custom", "space", "flex", "separator"], defaultItemIds: ["save", "custom", "space", "flex", "separator"], displayMode: "icon-and-label", sizeMode: "regular" }, items: [{ kind: "command", id: "save", label: "Save", paletteLabel: "Save document", commandId: "save", icon: <span>S</span>, minimumWidth: 40, idealWidth: 54 }, { kind: "custom", id: "custom", label: "Custom", minimumWidth: 40, idealWidth: 62, render: () => <span>Custom</span> }, { kind: "space", id: "space", width: 8 }, { kind: "flexible-space", id: "flex", minimumWidth: 12 }, { kind: "separator", id: "separator" }], preferences, runtime });
  });
  useEffect(() => () => controller.dispose(), [controller]);
  return <><NSEToolbarView composition="configured" controller={controller} width={width} interaction={{ parentResponderId: "contract" }} />{customising ? <NSEToolbarConfigurationSheet id="contract-toolbar-palette" open anchor={null} parentResponderId="contract" parentWindowControllerId={null} controller={controller} onOpenChange={noop} /> : null}</>;
}
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../../src/NSE/Themes/Atmo";
import { freezeNSETheme } from "../../../../src/NSE/Theme/NSETheme";
import { LoginWindow } from "../../../../src/NSE/SystemUI/LoginWindow";
import { SystemSurface } from "../theme-baseline/system";
import { NSEViewController, nseUpdateTraits } from "../../../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../../../src/SynCloudOS/AppHosting/applicationHosting";
import { NSETabViewController, NSETabViewItem } from "../../../../src/NSE/Navigation/NSETabViewController";
import { createStaticPresentationTraits } from "../../../fixtures/presentationTraits";
const plainTheme = freezeNSETheme({ ...atmoTheme, presentation: { login: "plain", notifications: "plain", materialLighting: "off" } });
const colour = GFXColour.parse("#336699");
export const supplementalThemeCatalogue: readonly { id: string; render: () => ReactNode }[] = [
  { id: "plain-login", render: () => <NSEAppearanceProvider theme={plainTheme}><LoginWindow title="Sign in" methods={[{ id: "account", label: "Continue" }]} /></NSEAppearanceProvider> },
  { id: "plain-notification", render: () => <NSEAppearanceProvider theme={plainTheme}><SystemSurface kind="notifications" /></NSEAppearanceProvider> },
  ...(["compact", "regular"] as const).flatMap(widthClass => (widthClass === "compact" ? ["block-start", "block-end"] : ["source-list", "block-start"]).flatMap(placement => (["in-flow", "overlay"] as const).map(flow => ({ id: `navigation-${widthClass}-${placement}-${flow}`, render: () => <ThemeNavigation widthClass={widthClass} placement={placement} flow={flow} /> })))),
  ...[true, false].map(isEnabled => ({ id: `matrix-${isEnabled}`, render: () => <NSERadioGroup label="Layout" options={[{ label: "List", value: "list" }, { label: "Grid", value: "grid" }]} defaultValue="list" isEnabled={isEnabled} /> })),
  { id: "colour-swatches", render: () => <NSEColourSwatches colours={[colour]} selected={colour} onSelect={noop} /> },
  { id: "virtual-viewport", render: () => <Virtual /> },
  { id: "tooltip", render: () => <Tooltip /> },
  ...[50, 500].flatMap(width => [false, true].map(customising => ({ id: `configured-toolbar-${width}-${customising}`, render: () => <Toolbar width={width} customising={customising} /> }))),
];


class ContractPage extends NSEViewController { static override view = () => <p>Document</p>; }
function ThemeNavigation({ widthClass, placement, flow }: { widthClass: "compact" | "regular"; placement: string; flow: "in-flow" | "overlay" }) {
  const [tabs] = useState(() => {
    const tabs = new NSETabViewController(); tabs.tabStyle = "sidebarAdaptable";
    tabs[nseUpdateTraits]({ reducedMotion: true, presentation: createStaticPresentationTraits({ width: widthClass === "compact" ? 390 : 1000, height: 844 }) });
    for (const id of ["first", "second"]) tabs.addTabViewItem(new NSETabViewItem({ identifier: id, viewController: tabs.addChild(ContractPage, { title: id }) }));
    return tabs;
  });
  useEffect(() => () => tabs.dispose(), [tabs]);
  const theme = freezeNSETheme({ ...atmoTheme, navigation: { ...atmoTheme.navigation, [widthClass]: { placement, flow } } } as typeof atmoTheme);
  return <NSEAppearanceProvider theme={theme}><NSEViewControllerView controller={tabs} /></NSEAppearanceProvider>;
}

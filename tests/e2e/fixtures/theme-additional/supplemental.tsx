import { useEffect, useRef, useState, type ReactNode } from "react";
import { NSEBox, NSEInputBox, NSETextField, NSERadioGroup } from "../../../../src/NSE/Controls/Fields/NSEFields";
import { NSEArrayController } from "../../../../src/NSE/Controllers/NSEArrayController";
import { NSETreeController } from "../../../../src/NSE/Controllers/NSETreeController";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";
import { NSETableView } from "../../../../src/NSE/DataViews/Table";
import { NSEOutlineView } from "../../../../src/NSE/DataViews/Outline";
import { NSEBrowser } from "../../../../src/NSE/DataViews/Browser";
import { NSEDivider } from "../../../../src/NSE/Controls/Selection/NSEDivider";
import { NSEShadow } from "../../../../src/NSE/Graphics/NSEShadow";
import { NSETokenField } from "../../../../src/NSE/Controls/Completion/NSETokenField";
import { NSESegmentedControl } from "../../../../src/NSE/Controls/Values/NSESegmentedControl";
import { ColourSwatches } from "../../../../src/NSE/Colour/Pickers/ColourSwatches";
import { GFXColour } from "../../../../src/FX/GraphicsFX/GFXColour";
import { Tooltip } from "../../../../src/NSE/Tooltips/Tooltip";
import { VirtualViewport, useVirtualiser } from "../../../../src/NSE/DataViews/Virtualisation";
import { ToolbarView } from "../../../../src/NSE/Toolbars/ToolbarView";
import { ToolbarConfigurationSheet } from "../../../../src/NSE/Toolbars/ToolbarConfigurationSheet";
import { NSEToolbarController } from "../../../../src/NSE/Toolbars/NSEToolbarController";
import { NSEUserDefaultsController } from "../../../../src/NSE/Controllers";
import type { ToolbarPreferences, ToolbarRuntimePort } from "../../../../src/NSE/Toolbars/toolbarTypes";
import { defaultsFrom } from "../../../fixtures/userDefaults";
const noop = () => undefined;
interface DrawingRow { readonly id: string; readonly children: readonly DrawingRow[] }
function LoadingOutline() {
  const [controller] = useState(() => new NSETreeController<DrawingRow, string>({ owner: nseUnowned, id: "drawing-loading-outline", content: [{ id: "Remote", children: [] }], getId: row => row.id, getChildren: row => row.children, withChildren: (row, children) => ({ ...row, children }), loadChildren: () => new Promise<readonly DrawingRow[]>(() => undefined), selection: { mode: "multiple", allowsEmpty: true } }));
  useEffect(() => () => controller.dispose(), [controller]);
  return <NSEOutlineView aria-label="Remote files" controller={controller} idForItem={row => row.id} childrenForItem={row => row.children} labelForItem={row => row.id} isExpandable={() => true} />;
}
function SortableTable() {
  const [controller] = useState(() => new NSEArrayController({ owner: nseUnowned, id: "drawing-sorted-table", content: [{ id: "One" }, { id: "Two" }], getId: row => row.id, selection: { mode: "multiple", allowsEmpty: true } }));
  useEffect(() => () => controller.dispose(), [controller]);
  return <NSETableView aria-label="Sorted files" adapter={{ controller, idForItem: row => row.id, labelForItem: row => row.id }} columns={[{ id: "name", title: "Name", value: row => row.id, width: { min: 80, ideal: 120, max: 200 }, sort: { compare: (left, right) => String(left).localeCompare(String(right)) } }]} viewportBlockSize={120} />;
}
function Virtual() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualiser = useVirtualiser({ count: 20, axis: "block", overscan: 1, estimateSize: 24, getKey: String, viewportRef, viewportSize: 100 });
  return <VirtualViewport ref={viewportRef} virtualiser={virtualiser} viewportSize={100} renderItem={item => <span>{item.key}</span>} />;
}
function TooltipSpecimen() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <><button ref={setAnchor}>Anchor</button><Tooltip id="contract-tooltip" open anchor={anchor} content="Help" /></>;
}
function Toolbar({ width, customising, borderless = false, labelled = false, sizeMode = "regular" }: { width: number; customising: boolean; borderless?: boolean; labelled?: boolean; sizeMode?: "regular" | "small" }) {
  const [controller] = useState(() => {
    const values = new Map<string, unknown>();
    const preferences = new NSEUserDefaultsController<ToolbarPreferences>({ namespace: "contract-toolbar", schema: { version: 1, defaults: { itemIds: ["save", "custom", "space", "flex", "separator"], displayMode: "icon-and-label", sizeMode }, fields: { itemIds: { validate: (v: unknown): v is readonly string[] => Array.isArray(v) }, displayMode: { validate: (v: unknown): v is ToolbarPreferences["displayMode"] => typeof v === "string" }, sizeMode: { validate: (v: unknown): v is ToolbarPreferences["sizeMode"] => typeof v === "string" } }, migrations: [] }, defaults: defaultsFrom({ read: key => values.get(key) ?? null, write: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } }) });
    const runtime: ToolbarRuntimePort = { signal: new AbortController().signal, commands: { getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }), validateMany: async requests => new Map(requests.map(request => [request.key, { commandId: request.commandId, responderId: "contract", title: "Save", enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }])), prepareDispatch: async () => ({ status: "cancelled", reason: "specimen" }), dispatch: async commandId => ({ status: "cancelled", commandId, operationId: "contract", reason: "specimen" }) } };
    return new NSEToolbarController({ configuration: { identifier: "contract-toolbar", owner: { kind: "window", windowControllerId: "contract" }, allowedItemIds: ["save", "custom", "space", "flex", "separator"], defaultItemIds: ["save", "custom", "space", "flex", "separator"], displayMode: "icon-and-label", sizeMode }, items: [{ kind: "command", id: "save", label: "Save", paletteLabel: "Save document", commandId: "save", icon: <span>S</span>, minimumWidth: 40, idealWidth: 54, ...(borderless ? { bordered: false } : {}) }, { kind: "custom", id: "custom", label: "Custom", minimumWidth: 40, idealWidth: 62, render: () => <span>Custom</span>, ...(labelled ? { showsLabel: true } : {}) }, { kind: "space", id: "space", width: 8 }, { kind: "flexible-space", id: "flex", minimumWidth: 12 }, { kind: "separator", id: "separator" }], preferences, runtime });
  });
  useEffect(() => () => controller.dispose(), [controller]);
  return <><ToolbarView composition="configured" controller={controller} width={width} interaction={{ parentResponderId: "contract" }} />{customising ? <ToolbarConfigurationSheet id="contract-toolbar-palette" open anchor={null} parentResponderId="contract" parentWindowControllerId={null} controller={controller} onOpenChange={noop} /> : null}</>;
}
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../../src/NSE/Appearance/atmo";
import { freezeNSETheme } from "../../../../src/NSE/Theme/NSETheme";
import { LoginWindow } from "../../../../src/NSE/SystemUI/LoginWindow";
import { SystemSurface } from "../theme-baseline/system";
import { NSEViewController, nseUpdateTraits } from "../../../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../../../src/SynCloudOS/AppHosting/applicationHosting";
import { NSETabViewController, NSETabViewItem } from "../../../../src/NSE/Navigation/NSETabViewController";
import { createStaticPresentationTraits } from "../../../fixtures/presentationTraits";
import { windowSpecimens } from "./windowSpecimens";
import { MaterialProvider } from "../../../../src/NSE/Material/MaterialProvider";
import { NSEView } from "../../../../src/NSE/Views/NSEView";
import { NSEMediaCollectionPresenter } from "../../../../src/NSE/MediaPanels/NSEMediaCollectionPresenter";
import { ApplicationHostTitlebar } from "../../../../src/SynCloudOSReact/ApplicationHostTitlebar";
import { createApplicationMenuStore } from "../../../../src/SynCloudOSReact/ApplicationMenuTrigger";
import { NSEPopUpButton } from "../../../../src/NSE/Menus/NSEPopUpButton";
import { GroupedRow } from "../../../../src/NSE/Controls/Selection/GroupedRow";
import { NSEDatePicker } from "../../../../src/NSE/DateTime/Pickers/NSEDatePicker";
import { MenuView } from "../../../../src/NSE/Menus/MenuView";
import { SpecimenApplicationMenu, SpecimenContextMenu, SpecimenMenuBar } from "./menuSpecimens";
const plainTheme = freezeNSETheme({ ...atmoTheme, presentation: { login: "plain", notifications: "plain", materialLighting: "off" } });
const colour = GFXColour.parse("#336699");
export const supplementalThemeCatalogue: readonly { id: string; ready?: string; activate?: string; activeReady?: string; context?: string; hover?: string; bare?: boolean; render: () => ReactNode }[] = [
  { id: "loading-outline", activate: '[data-nse-part="disclosure"]', activeReady: '[data-nse-part="loading"]', render: () => <LoadingOutline /> },
  { id: "sortable-table", activate: '[data-nse-role="sort"]', render: () => <SortableTable /> },
  { id: "loaded-browser", ready: '[data-nse-control="browser"] [data-nse-part="row"]', render: () => <NSEBrowser aria-label="Loaded files" presentation="columns" dataSource={{ rootItems: async () => [{ id: "Folder", leaf: false }, { id: "File", leaf: true }], children: async () => [], idForItem: item => item.id, labelForItem: item => item.id, isLeaf: item => item.leaf }} /> },
  ...(["plain", "soft", "grey", "alpha", "arrow"] as const).map(variant => ({ id: `separator-${variant}`, render: () => <NSEDivider variant={variant} caption={variant === "alpha" ? "A" : "Section"} expanded onToggle={variant === "arrow" ? noop : undefined} /> })),
  { id: "box-reduced-transparency", render: () => <NSEAppearanceProvider theme={atmoTheme} transparency="reduced"><NSEBox boxType="custom" shadow={new NSEShadow()}>Content</NSEBox></NSEAppearanceProvider> },
  { id: "box-overrides", render: () => <NSEBox boxType="custom" borderType="grooveBorder" isTransparent fillColour="#123" borderColour="#456" borderWidth={2} shadow={new NSEShadow()}>Content</NSEBox> },
  { id: "token-menu", render: () => <NSETokenField aria-label="Tags" values={[{ id: "work", label: "Work", representedObject: "work" }]} createToken={label => ({ id: label, label, representedObject: label })} onValuesChange={noop} tokenMenu={() => [{ id: "remove", label: "Remove" }]} /> },
  { id: "field-affixes", render: () => <NSETextField label="Amount" prefix="$" suffix="units" defaultValue="10" /> },
  ...[true, false].map(highlighted => ({ id: `input-group-${highlighted}`, render: () => <NSEInputBox label="Export" invalid={highlighted} alwaysLooksFocused={highlighted}><input aria-label="Export value" /></NSEInputBox> })),
  { id: "segment-menu", render: () => <NSESegmentedControl selection={{ mode: "select-one", selectedIds: new Set<string>(), allowsEmpty: true }} aria-label="Actions" height={40} name="actions" items={[{ id: "save", label: "Save", menu: [{ id: "copy", label: "Save copy" }] }, { id: "open", label: "Open" }]} /> },
  { id: "segment-overflow", render: () => <NSESegmentedControl selection={{ mode: "select-one", selectedIds: new Set<string>(), allowsEmpty: true }} aria-label="Views" maximumVisibleSegments={1} items={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }]} /> },
  { id: "plain-login", render: () => <NSEAppearanceProvider theme={plainTheme}><LoginWindow title="Sign in" methods={[{ id: "account", label: "Continue" }]} /></NSEAppearanceProvider> },
  { id: "plain-notification", render: () => <NSEAppearanceProvider theme={plainTheme}><SystemSurface kind="notifications" /></NSEAppearanceProvider> },
  ...(["compact", "regular"] as const).flatMap(widthClass => (widthClass === "compact" ? ["block-start", "block-end"] : ["source-list", "block-start"]).flatMap(placement => (["in-flow", "overlay"] as const).map(flow => ({ id: `navigation-${widthClass}-${placement}-${flow}`, render: () => <ThemeNavigation widthClass={widthClass} placement={placement} flow={flow} /> })))),
  ...[true, false].map(isEnabled => ({ id: `matrix-${isEnabled}`, render: () => <NSERadioGroup label="Layout" options={[{ label: "List", value: "list" }, { label: "Grid", value: "grid" }]} defaultValue="list" isEnabled={isEnabled} /> })),
  { id: "colour-swatches", render: () => <ColourSwatches colours={[colour]} selected={colour} onSelect={noop} /> },
  { id: "virtual-viewport", render: () => <Virtual /> },
  { id: "tooltip", render: () => <TooltipSpecimen /> },
  ...[50, 500].flatMap(width => [false, true].map(customising => ({ id: `configured-toolbar-${width}-${customising}`, render: () => <Toolbar width={width} customising={customising} /> }))),
  { id: "configured-toolbar-borderless", render: () => <Toolbar width={500} customising={false} borderless /> },
{ id: "configured-toolbar-labelled", render: () => <Toolbar width={500} customising={false} labelled /> },
{ id: "configured-toolbar-small", render: () => <Toolbar width={500} customising={false} sizeMode="small" /> },
  { id: "menu-bar-open", activate: '[role="menubar"] [role="menuitem"]', render: () => <SpecimenMenuBar /> },
  { id: "application-menu-open", ready: '[data-nse-application-menu]', render: () => <SpecimenApplicationMenu open /> },
  { id: "application-menu-submenu", ready: '[data-nse-application-menu]', hover: '[data-nse-application-menu] [aria-haspopup]', render: () => <SpecimenApplicationMenu open id="specimen-app-submenu" /> },
  { id: "context-menu", context: '[data-specimen-context]', render: () => <SpecimenContextMenu /> },
  ...(["metal", "cumulus"] as const).map(material => ({ id: `host-titlebar-${material}`, render: () => <ApplicationHostTitlebar title="Documents" iconSrc={null} material={material} scheme="light" menuStore={createApplicationMenuStore()} menuLabel="Documents"><p>Body</p></ApplicationHostTitlebar> })),
  { id: "media-grid", render: () => <NSEMediaCollectionPresenter items={["Beach", "Forest"].map((name, index) => ({ id: `m${index}`, providerId: "local", name, kind: "image", mimeType: "image/png", thumbnailUrl: "/assets/webspring/Panel.png" }))} selectedIds={new Set(["5:local2:m1"])} selection="multiple" direction="ltr" onSelectionChange={() => undefined} onActivate={() => undefined} /> },
  { id: "date-picker-calendar-sheet", activate: '[data-nse-control="date-picker"] button[aria-label^="Choose"]', activeReady: '[data-nse-part="calendar-sheet"]', render: () => <NSEDatePicker aria-label="Date" locale="en-GB" timeZone="Europe/London" defaultValue={{ year: 2026, month: 11, day: 9 }} /> },
  { id: "time-picker-clock-sheet", activate: '[data-nse-part="clock-affix"]', activeReady: '[data-nse-part="clock-sheet"]', render: () => <NSEDatePicker aria-label="Time" locale="en-US" timeZone="America/New_York" datePickerElements={["hourMinute"]} defaultValue={{ hour: 13, minute: 30, second: 0 }} /> },
  { id: "date-range-fields", activate: '[data-nse-control="date-picker"] button[aria-label^="Choose"]', activeReady: '[data-nse-part="range-fields"]', render: () => <NSEDatePicker aria-label="Stay" locale="en-GB" timeZone="Europe/London" datePickerMode="range" defaultValue={{ start: { year: 2026, month: 11, day: 9 }, end: { year: 2026, month: 11, day: 12 } }} /> },
  { id: "calendar-events", render: () => <NSEDatePicker aria-label="Date" locale="en-GB" timeZone="Europe/London" datePickerStyle="clockAndCalendar" defaultValue={{ year: 2026, month: 11, day: 9 }} eventIndicatorsForDate={(date) => date.day === 12 ? [{ id: "review", label: "Review", tone: "accent" }] : []} /> },
  { id: "menu-shortcuts", activate: '[data-nse-control="pop-up-button"] button, button[aria-haspopup]', activeReady: '[data-nse-part="shortcut-column"]', render: () => <MenuView label="Edit" onSelect={() => undefined} items={[{ value: "copy", label: "Copy", shortcut: "⌘C" }, { value: "paste", label: "Paste", shortcut: "⌘V" }]} /> },
  { id: "view-layer-continuous", render: () => <NSEView cornerRadius={8} cornerCurve="continuous">Layer</NSEView> },
  { id: "view-layer-circular", render: () => <NSEView cornerRadius={8} cornerCurve="circular">Layer</NSEView> },
  { id: "surface-ink-light", render: () => <NSEView><section data-nse-surface-ink="light">Paper</section></NSEView> },  { id: "pop-up-native", bare: true, render: () => <NSEPopUpButton label="Zone" value="a" items={[{ value: "a", title: "A" }, { value: "b", title: "B" }]} onValueChange={noop} /> },
  { id: "label-raised", render: () => <NSETextField isEditable={false} backgroundStyle="raised">Raised</NSETextField> },
  { id: "list-item-no-highlight", render: () => <GroupedRow tapHighlight={false}>Static row</GroupedRow> },
  { id: "segment-fill-equally", render: () => <NSESegmentedControl selection={{ mode: "select-one", selectedIds: new Set(["a"]), allowsEmpty: false }} aria-label="Fill" distribution="fill-equally" name="fill" items={[{ id: "a", label: "A" }, { id: "b", label: "Longer" }]} onSelectionChange={noop} /> },
  { id: "calendar-rtl", render: () => <NSEDatePicker aria-label="Date" locale="he-IL" timeZone="Asia/Jerusalem" datePickerStyle="clockAndCalendar" datePickerElements={["yearMonthDay"]} defaultValue={{ year: 2026, month: 11, day: 9 }} /> },  { id: "material-metal", render: () => <MaterialProvider appearance="metal"><p>Metal</p></MaterialProvider> },
  ...windowSpecimens,
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

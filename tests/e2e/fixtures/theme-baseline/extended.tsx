import { useEffect, useState, type ReactNode } from "react";
import * as NSE from "../../../../src/NSE/sdkPackageEntry";
import { NSEPathControl } from "../../../../src/NSE/Controls/Values/NSEPathControl";
import { NSEMenuView } from "../../../../src/NSE/Menus/NSEMenuView";
import { NSEPopup } from "../../../../src/NSE/Overlays/NSEPopup";
import { NSEPopover } from "../../../../src/NSE/Overlays/NSEPopover";
import { TabBarController } from "../../../../src/NSE/Navigation/TabBarController";
import { TabBar } from "../../../../src/NSE/Navigation/TabBar";
import { NSEWindowTitlebarContent } from "../../../../src/NSE/Windows/windowTitlebarContext";
import { GFXColour } from "../../../../src/FX/GraphicsFX/GFXColour";
import { NSEArrayController } from "../../../../src/NSE/Controllers/NSEArrayController";
import { NSETreeController } from "../../../../src/NSE/Controllers/NSETreeController";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";
import type { ThemeBaselineSurface } from "./catalogue";
import { NSEImageView } from "../../../../src/NSE/Controls/Images/NSEImage";
import { NSEToolbarView } from "../../../../src/NSE/Toolbars/NSEToolbarView";
import { LoadingSpinner } from "../../../../src/NSE/Components/LoadingSpinner";
import { Badge } from "../../../../src/NSE/Components/Badge";
import { ColourWellSurface } from "./panels";
import type { NSEDataViewState } from "../../../../src/NSE/DataViews/Core/dataViewTypes";

const noop = () => undefined;
interface FileRow { readonly id: string; readonly label: string; readonly children: readonly FileRow[] }
const rows: readonly FileRow[] = [{ id: "one", label: "Documents", children: [{ id: "report", label: "Report", children: [] }] }, { id: "two", label: "Pictures", children: [] }];
function DataView({ kind, selected, sourceList = false, state = { kind: "ready" } }: { kind: "table" | "outline" | "collection"; selected: boolean; sourceList?: boolean; state?: NSEDataViewState }) {
  const [controller] = useState(() => {
    const value = kind === "outline" ? new NSETreeController({ owner: nseUnowned, id: "baseline-tree", content: rows, getId: item => item.id, getChildren: item => item.children, withChildren: (item, children) => ({ ...item, children }), selection: { mode: "multiple", allowsEmpty: true } })
      : new NSEArrayController({ owner: nseUnowned, id: "baseline-array", content: rows, getId: item => item.id, selection: { mode: "multiple", allowsEmpty: true } });
    if (selected) value.select(["one"]);
    return value;
  });
  useEffect(() => () => controller.dispose(), [controller]);
  if (kind === "outline") return <NSE.NSEOutlineView aria-label="Files" controller={controller as NSETreeController<typeof rows[number], string>} idForItem={item => item.id} childrenForItem={item => item.children} labelForItem={item => item.label} selectionHighlightStyle={sourceList ? "sourceList" : "regular"} state={state} />;
  const adapter = { controller: controller as NSEArrayController<typeof rows[number], string>, idForItem: (item: typeof rows[number]) => item.id, labelForItem: (item: typeof rows[number]) => item.label };
  return kind === "table" ? <NSE.NSETableView aria-label="Files" adapter={adapter} columns={[{ id: "name", title: "Name", value: item => item.label, width: { min: 120, ideal: 300, max: 480 } }]} viewportBlockSize={200} state={state} />
    : <NSE.NSECollectionView aria-label="Files" adapter={adapter} layout={NSE.createListCollectionLayout(48)} renderItem={({ item }) => <span>{item.label}</span>} viewportBlockSize={200} state={state} />;
}
function Tabs({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const [controller] = useState(() => new TabBarController<ReactNode>({ owner: nseUnowned, id: "baseline-tabs", destinations: ["Documents", "Pictures", "Music", "Movies", "Downloads", "Settings"].map((label, index) => ({ id: `tab-${index}`, label, icon: { kind: "vector" as const, path: "/src/NSE/Navigation/nse-tab-bar-more.svg" }, render: () => <p>{label}</p> })) }));
  useEffect(() => () => controller.dispose(), [controller]);
  return <TabBar controller={controller} aria-label="Workspace" orientation={orientation} />;
}
function Overlay({ popover }: { popover: boolean }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <><button ref={setAnchor}>Anchor</button>{popover ? <NSEPopover id="baseline-popover" open anchor={anchor} parentWindowControllerId={null} onOpenChange={noop} title="Details" contentSize={{ width: 300, height: 200 }}><p>Popover content</p><NSE.NSEButton title="Done" /></NSEPopover>
    : <NSEPopup id="baseline-sheet" open modal title="Save changes" onOpenChange={noop}><p>Do you want to save this document?</p><NSE.NSEButton title="Save" /></NSEPopup>}</>;
}
function TextSurface({ editable, selected }: { editable: boolean; selected: boolean }) {
  const [owner] = useState(() => NSE.createUndoableNSETextOwner({ flowId: "baseline-text", content: NSE.attributedContent([NSE.paragraph([NSE.textRun("SynCloudOS document text")])]) }));
  const [session] = useState(() => new NSE.TextEditingSession({ id: "baseline-text", textOwner: owner, history: owner.history }));
  useEffect(() => { session.setEditable(editable); if (selected) session.select(0, 10); return () => { session.dispose(); owner.dispose(); }; }, [owner, session, editable, selected]);
  return <NSE.NSETextView session={session} label="Document text" spellCheck={false} />;
}

export function extendedThemeBaselineCatalogue(): ThemeBaselineSurface[] {
  const entries: ThemeBaselineSurface[] = [];
  const add = (id: string, render: ThemeBaselineSurface["render"], extra: Partial<ThemeBaselineSurface> = {}) => entries.push({ id, render, ...extra });
  for (const state of ["normal", "focused", "disabled"] as const) {
    add(`secure-text-field-${state}`, () => <NSE.NSESecureTextField aria-label="Password" defaultValue="password" isEnabled={state !== "disabled"} />, { interaction: state === "focused" ? "focus" : undefined });
    add(`combo-box-${state}`, () => <NSE.NSEComboBox aria-label="City" dataSource={{ query: async () => ["London", "Manchester"], idForItem: item => item, labelForItem: item => item }} value={null} inputValue="London" onInputValueChange={noop} onValueChange={noop} isEnabled={state !== "disabled"} />, { interaction: state === "focused" ? "focus" : undefined });
    add(`token-field-${state}`, () => <NSE.NSETokenField aria-label="People" values={[{ id: "ada", representedObject: "Ada", label: "Ada" }]} createToken={label => ({ id: label, representedObject: label, label })} onValuesChange={noop} isEnabled={state !== "disabled"} />);
    add(`colour-well-${state}`, () => <ColourWellSurface isEnabled={state !== "disabled"} />);
  }
  for (const kind of ["table", "outline", "collection"] as const) for (const selected of [false, true]) add(`${kind}-view-${selected ? "selected" : "normal"}`, () => <DataView kind={kind} selected={selected} />);
  for (const kind of ["table", "outline", "collection"] as const) for (const state of ["loading", "empty", "disabled", "read-only", "invalid", "denied", "interrupted", "error"] as const) add(`${kind}-view-${state}`, () => <DataView kind={kind} selected={false} state={{ kind: state, message: `${state} files` }} />);
  for (const selected of [false, true]) add(`source-list-${selected ? "selected" : "normal"}`, () => <DataView kind="outline" selected={selected} sourceList />);
  add("browser", () => <NSE.NSEBrowser aria-label="Files" dataSource={{ rootItems: async () => rows, children: async item => item.children, idForItem: item => item.id, labelForItem: item => item.label, isLeaf: item => !item.children.length }} presentation="columns" />);
  add("rule-editor", () => <NSE.NSERuleEditor fields={["Name", "Size"]} />);
  add("predicate-editor", () => <NSE.NSEPredicateEditor schema={{ id: "file", fields: { name: { type: "string", read: (item: { name: string }) => item.name } } }} />);
  add("path-control", () => <NSEPathControl url="file:///Users/Example/Documents/Report.txt" />);
  for (const imageScaling of ["proportionallyUpOrDown", "none"] as const) add(`image-view-${imageScaling}`, () => <NSEImageView src="/assets/webspring/Panel.png" alt="Panel artwork" imageScaling={imageScaling} style={{ height: 240 }} />);
  for (const editable of [false, true]) for (const selected of [false, true]) add(`text-view-${editable ? "editable" : "read-only"}-${selected ? "selected" : "normal"}`, () => <TextSurface editable={editable} selected={selected} />);
  add("ruler-view", () => <NSE.NSERulerView value={{ alignment: "start", firstLineIndent: 12, headIndent: 24, tailIndent: 0, lineHeight: "normal", tabStops: [48, 96, 144] }} onChange={noop} />);
  for (const position of ["top", "bottom", "inline"] as const) add(`toolbar-${position}`, () => <NSEToolbarView composition="children" position={position}><NSE.NSEButton title="Add" bezelStyle="texturedRounded" /><NSE.NSEButton title="Remove" bezelStyle="texturedRounded" /></NSEToolbarView>);
  for (const mode of ["clip", "scroll"] as const) add(`clip-view-${mode}`, () => <NSE.NSEClipView mode={mode} style={{ height: 120 }}><p>Visible content</p><div style={{ height: 300 }}>Document content</div></NSE.NSEClipView>);
  add("badge", () => <Badge count={12} />);
  add("loading-spinner", () => <LoadingSpinner />);
  add("tab-view", () => <NSE.NSETabView aria-label="Documents" items={[{ id: "one", label: "First", render: () => <p>First document</p> }, { id: "two", label: "Second", render: () => <p>Second document</p> }]} />);
  add("tab-bar-more", () => <Tabs orientation="horizontal" />);
  add("tab-bar-rail", () => <Tabs orientation="vertical" />);
  add("menu", () => <NSEMenuView label="File" items={[{ value: "new", label: "New document" }, { value: "open", label: "Open…" }, { value: "close", label: "Close", disabled: true }]} />, { interaction: "open", fullPage: true });
  add("popover", () => <Overlay popover />, { fullPage: true });
  add("sheet", () => <Overlay popover={false} />, { fullPage: true });
  for (const toolbarStyle of ["automatic", "expanded", "preference", "unified", "unifiedCompact"] as const) for (const mode of ["light", "dark"] as const) add(`titlebar-${toolbarStyle}-${mode}`, () => <NSEWindowTitlebarContent title="Documents" subtitle="3 items" toolbarStyle={toolbarStyle} mode={mode} leading={<NSE.NSEButton title="Back" />} trailing={<NSE.NSEButton title="Add" />} />);
  return entries;
}

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

import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSESwitch, NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSESearchField } from "../../src/NSE/Controls/Fields/NSESearchField";
import { NSESlider } from "../../src/NSE/Controls/Values/NSESlider";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSEPopUpButton } from "../../src/NSE/Menus/NSEPopUpButton";
import { MenuView } from "../../src/NSE/Menus/MenuView";
import { MetalThumb } from "../../src/NSE/Appearance/MetalThumb";
// The frozen side still has TopBar; the working tree draws every bar with WindowTitlebarView.
const legacyTopBar = Object.values(import.meta.glob("../../src/NSE/Windows/Chrome/TopBar.tsx", { eager: true }))[0] as { TopBar?: React.ComponentType<Record<string, unknown>> } | undefined;
const titlebarView = Object.values(import.meta.glob("../../src/NSE/Windows/WindowTitlebarView.tsx", { eager: true }))[0] as { WindowTitlebarView?: React.ComponentType<Record<string, unknown>> } | undefined;
import { ToolbarView } from "../../src/NSE/Toolbars/ToolbarView";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline/NSEOutlineView";
import { NSETreeController } from "../../src/NSE/Controllers/NSETreeController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { themeBaselineCatalogue, type ThemeBaselineSurface } from "../e2e/fixtures/theme-baseline/catalogue";
import { elementFamilies, type ElementFamily } from "./sections";

const noop = () => undefined;
const parameters = new URLSearchParams(location.search);
const measuring = parameters.get("measure") === "1";
const scheme = parameters.get("scheme") === "dark" ? "dark" : "light";

/** One labelled specimen; with measuring on it reads back the rendered control's size. */
export function Spec({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<string | null>(null);
  useLayoutEffect(() => {
    const target = slot.current?.firstElementChild as HTMLElement | null;
    if (!measuring || !target) return;
    const read = () => { const box = target.getBoundingClientRect(); setSize(`${Math.round(box.width * 10) / 10} × ${Math.round(box.height * 10) / 10}`); };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return (
    <figure className="lab-spec" data-wide={wide || undefined}>
      <div className="lab-spec-slot" ref={slot}>{children}</div>
      <figcaption>{label}{size ? <span className="lab-spec-size">{size}</span> : null}</figcaption>
    </figure>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="lab-group"><h2>{title}</h2><div className="lab-group-body">{children}</div></section>;
}

function Switches() {
  const labels: readonly (readonly [string, string])[] = [["On", "Off"], ["Yes", "No"], ["Sound", "Mute"], ["Enabled", "Disabled"], ["Automatic", "Manual"]];
  return <>
    {(["standard", "metal"] as const).map(material => (
      <Group key={material} title={material === "metal" ? "Metal thumb" : "Standard thumb"}>
        {labels.map(([on, off]) => (["on", "off"] as const).map(state => (
          <Spec key={`${on}-${state}`} label={`${state === "on" ? on : off}`}>
            <NSESwitch aria-label={on} thumbMaterial={material} onLabel={on} offLabel={off} defaultState={state} />
          </Spec>
        )))}
        <Spec label="Disabled on"><NSESwitch aria-label="Disabled" thumbMaterial={material} defaultState="on" isEnabled={false} /></Spec>
        <Spec label="Disabled off"><NSESwitch aria-label="Disabled" thumbMaterial={material} defaultState="off" isEnabled={false} /></Spec>
      </Group>
    ))}
    <Group title="In a preference row">
      <div className="lab-rows">
        <div className="lab-row"><span>Show Notifications</span><NSESwitch aria-label="Show Notifications" defaultState="on" /></div>
        <div className="lab-row"><span>Play Alert Sound</span><NSESwitch aria-label="Play Alert Sound" onLabel="Sound" offLabel="Mute" defaultState="off" /></div>
        <div className="lab-row"><span>Brushed metal thumb</span><NSESwitch aria-label="Brushed metal thumb" thumbMaterial="metal" defaultState="on" /></div>
      </div>
    </Group>
  </>;
}

function Knob() {
  return <>
    <Group title="Thumb, enlarged">
      {[120, 64, 28].map(size => (
        <Spec key={size} label={`${size}px`}>
          <span className="lab-knob" style={{ width: size, height: size }}><MetalThumb /></span>
        </Spec>
      ))}
    </Group>
    <Group title="In controls">
      <Spec label="Slider, regular" wide><NSESlider aria-label="Volume" thumbMaterial="metal" defaultValue={40} minimum={0} maximum={100} /></Spec>
      <Spec label="Slider, small" wide><NSESlider aria-label="Balance" thumbMaterial="metal" controlSize="small" defaultValue={70} minimum={0} maximum={100} /></Spec>
      <Spec label="Switch, on"><NSESwitch aria-label="Metal" thumbMaterial="metal" defaultState="on" /></Spec>
      <Spec label="Switch, off"><NSESwitch aria-label="Metal" thumbMaterial="metal" defaultState="off" /></Spec>
    </Group>
  </>;
}

function Sizing() {
  return <>
    <Group title="Apple targets">
      {[["iOS / iPadOS default", 44], ["iOS / iPadOS minimum", 28], ["macOS default", 28], ["macOS minimum", 20]].map(([label, size]) => (
        <Spec key={label as string} label={label as string}><span className="lab-target" style={{ width: size as number, height: size as number }}>{size}</span></Spec>
      ))}
    </Group>
    {(["rounded", "texturedRounded"] as const).map(bezelStyle => (
      <Group key={bezelStyle} title={`Push buttons, ${bezelStyle}`}>
        {(["small", "regular", "large"] as const).map(controlSize => (
          <Spec key={controlSize} label={controlSize}><NSEButton title="Continue" bezelStyle={bezelStyle} controlSize={controlSize} /></Spec>
        ))}
      </Group>
    ))}
    <Group title="Fields and pickers">
      {(["mini", "small", "regular"] as const).map(controlSize => (
        <Spec key={controlSize} label={`Text field, ${controlSize}`}><NSETextField aria-label="Name" defaultValue="SynCloudOS" controlSize={controlSize} /></Spec>
      ))}
      {(["small", "regular"] as const).map(controlSize => (
        <Spec key={`search-${controlSize}`} label={`Search, ${controlSize}`}><NSESearchField aria-label="Search" defaultValue="" controlSize={controlSize} showsSearchIcon /></Spec>
      ))}
      {(["small", "regular"] as const).map(controlSize => (
        <Spec key={`popup-${controlSize}`} label={`Pop-up, ${controlSize}`}>
          <NSEPopUpButton accessibleLabel="Arrange" label="Arrange" title="Arrange" controlSize={controlSize} defaultValue="name" items={[{ title: "Name", value: "name" }, { title: "Date", value: "date" }]} />
        </Spec>
      ))}
    </Group>
    <Group title="Segmented controls">
      {(["rounded", "capsule", "texturedRounded"] as const).map(segmentStyle => (["small", "regular"] as const).map(controlSize => (
        <Spec key={`${segmentStyle}-${controlSize}`} label={`${segmentStyle}, ${controlSize}`}>
          <NSESegmentedControl aria-label="View" segmentStyle={segmentStyle} controlSize={controlSize} items={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }]}
            selection={{ mode: "select-one", selectedIds: new Set(["list"]), allowsEmpty: false }} onSelectionChange={noop} />
        </Spec>
      )))}
    </Group>
  </>;
}

interface AccountNode { readonly id: string; readonly label: string; readonly children: readonly AccountNode[] }
const leaf = (id: string, label: string): AccountNode => ({ id, label, children: [] });
const accounts: readonly AccountNode[] = [
  { id: "favourites", label: "Favourites", children: [leaf("all", "All Inboxes"), leaf("inbox-g", "Inbox")] },
  { id: "google", label: "Google", children: [leaf("g-inbox", "Inbox"), leaf("g-drafts", "Drafts"), leaf("g-sent", "Sent Mail")] },
  { id: "work", label: "Syndromatic Work Account", children: [leaf("w-inbox", "Inbox"), leaf("w-outbox", "Outbox")] },
];
const groupIds = new Set(accounts.map(account => account.id));

function Accounts({ width }: { width: number }) {
  const [controller] = useState(() => {
    const tree = new NSETreeController<AccountNode, string>({ owner: nseUnowned, id: `lab-accounts-${width}`, content: accounts, getId: item => item.id, getChildren: item => item.children,
      withChildren: (item, children) => ({ ...item, children }), selection: { mode: "single", allowsEmpty: true } });
    accounts.forEach(account => tree.expand(account.id));
    tree.select(["all"]);
    return tree;
  });
  useEffect(() => () => controller.dispose(), [controller]);
  return <div className="lab-outline" style={{ width }}>
    <NSEOutlineView aria-label="Accounts" controller={controller} idForItem={item => item.id} childrenForItem={item => item.children} labelForItem={item => item.label}
      selectionHighlightStyle="sourceList" delegate={{ isGroupItem: id => groupIds.has(id) }} />
  </div>;
}

function Outline() {
  return <Group title="Source list groups">
    <Spec label="320px" wide><Accounts width={320} /></Spec>
    <Spec label="240px" wide><Accounts width={240} /></Spec>
  </Group>;
}

const contactMenu = [
  { value: "edit", label: "Edit", children: [{ value: "name", label: "Name" }, { value: "photo", label: "Photo" }] },
  { value: "s1", label: "", separator: true },
  { value: "speed", label: "Set Speed Dial" },
  { value: "reminder", label: "Add Contact Reminder" },
  { value: "sim", label: "Copy To SIM Card" },
  { value: "launcher", label: "Add To Launcher" },
  { value: "s2", label: "", separator: true },
  { value: "delete", label: "Delete Contact" },
  { value: "send", label: "Send Contact", children: [{ value: "email", label: "Email" }, { value: "message", label: "Message" }] },
  ...Array.from({ length: 24 }, (_, index) => ({ value: `more-${index}`, label: `More option ${index + 1}` })),
];

function Menus() {
  return <Group title="Menu">
    <Spec label="Sections, submenus, overflow" wide>
      <div className="lab-menu-stage"><MenuView label="Contact" items={contactMenu} defaultOpen /></div>
    </Spec>
  </Group>;
}

function LabBar({ variant }: { variant: "atmoCumulus" | "atmoMetal" }) {
  const title = "Preferences & Accounts";
  if (legacyTopBar?.TopBar) { const TopBar = legacyTopBar.TopBar; return <TopBar title={title} variant={variant} scheme={scheme} leadingItems={[{ kind: "webspring", label: "Home" }]} trailingItems={[{ kind: "settings", label: "Settings" }]} />; }
  const View = titlebarView!.WindowTitlebarView!;
  return <View document={{ title, subtitle: "", documentEdited: false }} isKeyWindow material={variant === "atmoMetal" ? "metal" : "cumulus"}
    controls={<button type="button" aria-label="Home" className="nse-app-topbar-button" data-position="leading" data-nse-part="cell" data-nse-style="titlebar" data-nse-material="cumulus"><span className="nse-app-topbar-button-well" data-nse-part="bezel" aria-hidden="true" /></button>} />;
}

function Bars() {
  return <>
    {(["atmoCumulus", "atmoMetal"] as const).map(variant => (
      <Group key={variant} title={`Top bar, ${variant}`}>
        <Spec label="Title with items" wide>
          <div className="lab-bar"><LabBar variant={variant} /></div>
        </Spec>
      </Group>
    ))}
    <Group title="Toolbars">
      {(["top", "bottom"] as const).map(position => (
        <Spec key={position} label={position} wide>
          <ToolbarView composition="children" position={position}>
            <NSEButton title="Compose" bezelStyle="texturedRounded" /><NSEButton title="Reply" bezelStyle="texturedRounded" /><NSEButton title="Delete" bezelStyle="texturedRounded" />
          </ToolbarView>
        </Spec>
      ))}
    </Group>
    <Group title="Grouped buttons">
      <Spec label="Capsule, two items" wide>
        <NSESegmentedControl aria-label="Messaging" segmentStyle="capsule" items={[{ id: "chats", label: "Conversations" }, { id: "buddies", label: "Buddies" }]}
          selection={{ mode: "select-one", selectedIds: new Set(["chats"]), allowsEmpty: false }} onSelectionChange={noop} />
      </Spec>
      <Spec label="Textured, three items" wide>
        <NSESegmentedControl aria-label="View" segmentStyle="texturedRounded" items={[{ id: "list", label: "List" }, { id: "covers", label: "Covers" }, { id: "grid", label: "Grid" }]}
          selection={{ mode: "select-one", selectedIds: new Set(["covers"]), allowsEmpty: false }} onSelectionChange={noop} />
      </Spec>
    </Group>
  </>;
}

function Catalogue() {
  const id = parameters.get("surface") ?? themeBaselineCatalogue[0]!.id;
  const surface = themeBaselineCatalogue.find(candidate => candidate.id === id);
  if (!surface) return <p className="lab-missing">This side has no surface called “{id}”.</p>;
  return <div className="lab-catalogue" data-surface={surface.id}>{surface.render()}</div>;
}

export const catalogueIds = () => themeBaselineCatalogue.map(surface => surface.id);
export const catalogueSurface = (id: string | null) => themeBaselineCatalogue.find(surface => surface.id === id);

// A surface that throws on one side says so, instead of blanking the page.
class SurfaceBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  override state = { failed: null as string | null };
  static getDerivedStateFromError(error: unknown) { return { failed: error instanceof Error ? error.message : String(error) }; }
  override render() { return this.state.failed ? <p className="lab-missing">Failed: {this.state.failed}</p> : this.props.children; }
}

// Hover, press and focus need real input, so those captures draw the same as their resting state here.
const resting = (surface: ThemeBaselineSurface) => surface.interaction !== "hover" && surface.interaction !== "press" && surface.interaction !== "focus";
const claims = (prefix: string, id: string) => id === prefix || id.startsWith(prefix + "-");
const familyOf = (id: string) => elementFamilies.flatMap(family => family.prefixes.filter(prefix => claims(prefix, id)).map(prefix => ({ family, prefix })))
  .sort((a, b) => b.prefix.length - a.prefix.length)[0];

/** The surface's group within its family: its element, and for buttons the bezel too. */
function groupOf(id: string, prefix: string) {
  if (!prefix) return "other";
  const rest = id.slice(prefix.length + 1).split("-");
  return prefix === "button" && rest.length > 1 ? `${prefix} ${rest[0]}` : prefix;
}

// Each embedded surface boots its own NSE, so they load one at a time, in page order, rather than all at once.
let embedQueue: Promise<void> = Promise.resolve();
function EmbeddedSurface({ surface }: { surface: ThemeBaselineSurface }) {
  const [src, setSrc] = useState<string | null>(null);
  const loaded = useRef<() => void>(noop);
  useEffect(() => {
    let live = true;
    embedQueue = embedQueue.then(() => new Promise<void>(resolve => {
      if (!live) return resolve();
      loaded.current = () => setTimeout(resolve, 400);
      setTimeout(resolve, 15000);
      setSrc(`frame.html?section=catalogue&embed=1&surface=${encodeURIComponent(surface.id)}&scheme=${scheme}&backdrop=${parameters.get("backdrop") ?? "metal"}&measure=0`);
    }));
    return () => { live = false; };
  }, [surface.id]);
  return <iframe className="lab-embed" title={surface.id} src={src ?? undefined} onLoad={() => loaded.current()} style={{ height: (surface.viewport ?? { height: 800 }).height }} />;
}

function Family({ family }: { family: ElementFamily }) {
  const entries = themeBaselineCatalogue.filter(resting).flatMap(surface => {
    const match = familyOf(surface.id);
    const mine = family.id === "other" ? !match : match?.family.id === family.id;
    return mine ? [{ surface, prefix: match?.prefix ?? "" }] : [];
  });
  if (!entries.length) return <p className="lab-missing">This side's catalogue has nothing in {family.title}.</p>;
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = groupOf(entry.surface.id, entry.prefix);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return <>{[...groups].map(([title, members]) => (
    <Group key={title} title={title.replace(/-/g, " ")}>
      {members.map(({ surface }) => {
        const label = surface.id.slice(title.replace(/ /g, "-").length + 1) || surface.id;
        // Full-page surfaces cover their window, so each gets a window of its own at the size the baseline captures.
        if (surface.fullPage) return <Spec key={surface.id} label={label} wide>
          <EmbeddedSurface surface={surface} />
        </Spec>;
        return <Spec key={surface.id} label={label} wide={family.wide}><SurfaceBoundary>{surface.render()}</SurfaceBoundary></Spec>;
      })}
    </Group>
  ))}</>;
}

// Elements outside the frozen catalogue. Each loads by name, so a side whose source lacks one says so.
type AnyComponent = React.ComponentType<any>;
const named = (modules: Record<string, unknown>, name: string) => (Object.values(modules)[0] as Record<string, AnyComponent> | undefined)?.[name];
const fields = import.meta.glob("../../src/NSE/Controls/Fields/NSEFields.tsx", { eager: true });
const extra = {
  RadioGroup: named(fields, "RadioGroup"),
  Divider: named(import.meta.glob("../../src/NSE/Controls/Selection/NSEDivider.tsx", { eager: true }), "Divider"),
  GroupedRows: named(import.meta.glob("../../src/NSE/Controls/Selection/GroupedRows.tsx", { eager: true }), "GroupedRows"),
  GroupedRow: named(import.meta.glob("../../src/NSE/Controls/Selection/GroupedRow.tsx", { eager: true }), "GroupedRow"),
  Tooltip: named(import.meta.glob("../../src/NSE/Tooltips/Tooltip.tsx", { eager: true }), "Tooltip"),
  GlassPanel: named(import.meta.glob("../../src/NSE/Components/GlassPanel.tsx", { eager: true }), "GlassPanel"),
  LinenSurface: named(import.meta.glob("../../src/NSE/Components/LinenSurface.tsx", { eager: true }), "LinenSurface"),
  IconWell: named(import.meta.glob("../../src/NSE/Components/IconWell.tsx", { eager: true }), "IconWell"),
  Spinner: named(import.meta.glob("../../src/NSE/Progress/spinnerSprite.tsx", { eager: true }), "Spinner"),
  ChronosphereArrow: named(import.meta.glob("../../src/NSE/Chronosphere/ChronosphereArrow.tsx", { eager: true }), "ChronosphereArrow"),
};

function Extra({ name, render }: { name: keyof typeof extra; render: (View: AnyComponent) => ReactNode }) {
  const View = extra[name];
  return View ? <SurfaceBoundary>{render(View)}</SurfaceBoundary> : <p className="lab-missing">Not in this source</p>;
}

function TooltipSpecimen({ View }: { View: AnyComponent }) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  return <span className="lab-tooltip-anchor" ref={setAnchor}>Anchor<View id="lab-tooltip" content="Shows the original size" open anchor={anchor} onOpenChange={noop} /></span>;
}

function More() {
  const radios = [{ value: "list", label: "As list" }, { value: "icons", label: "As icons" }, { value: "columns", label: "As columns", isEnabled: false }];
  return <>
    <Group title="Radio group">
      <Spec label="enabled"><Extra name="RadioGroup" render={View => <View label="View" options={radios} defaultValue="list" />} /></Spec>
      <Spec label="disabled"><Extra name="RadioGroup" render={View => <View label="View" options={radios} defaultValue="icons" isEnabled={false} />} /></Spec>
    </Group>
    <Group title="Divider">
      {(["plain", "soft", "grey", "alpha", "arrow"] as const).map(variant => (
        <Spec key={variant} label={variant} wide><Extra name="Divider" render={View => <View variant={variant} label={variant === "arrow" ? "Details" : undefined} expanded={variant === "arrow" ? true : undefined} onToggle={variant === "arrow" ? noop : undefined} />} /></Spec>
      ))}
    </Group>
    <Group title="Grouped rows">
      <Spec label="rows, selected and disabled" wide><Extra name="GroupedRows" render={Rows => <Extra name="GroupedRow" render={Row => <Rows>
        <Row meta="On">Wi-Fi</Row><Row selected meta="Automatic">Appearance</Row><Row isEnabled={false} meta="Off">Location</Row>
      </Rows>} />} /></Spec>
    </Group>
    <Group title="Tooltip">
      <Spec label="open"><Extra name="Tooltip" render={View => <TooltipSpecimen View={View} />} /></Spec>
    </Group>
    <Group title="Surfaces">
      <Spec label="glass panel"><Extra name="GlassPanel" render={View => <View className="lab-surface-sample"><p>Glass panel</p></View>} /></Spec>
      <Spec label="linen"><Extra name="LinenSurface" render={View => <View className="lab-surface-sample"><p>Linen</p></View>} /></Spec>
      <Spec label="icon well"><Extra name="IconWell" render={View => <View>★</View>} /></Spec>
      <Spec label="icon well, active"><Extra name="IconWell" render={View => <View active>★</View>} /></Spec>
    </Group>
    <Group title="Spinner">
      {(["small", "large"] as const).map(size => (["light", "dark"] as const).map(tone => (
        <Spec key={`${size}-${tone}`} label={`${size}, ${tone}`}><Extra name="Spinner" render={View => <View size={size} tone={tone} />} /></Spec>
      )))}
    </Group>
    <Group title="Chronosphere arrows">
      {(["past", "present"] as const).map(direction => (
        <Spec key={direction} label={direction}><Extra name="ChronosphereArrow" render={View => <span className="lab-chrono-arrow"><View direction={direction} /></span>} /></Spec>
      ))}
    </Group>
  </>;
}

const partialThemeModule = import.meta.glob<{ default: React.ComponentType }>("./working-tree/PartialAppTheme.tsx")["./working-tree/PartialAppTheme.tsx"];
const PartialAppTheme = partialThemeModule ? lazy(partialThemeModule) : null;

export function renderSection(id: string): ReactNode {
  const family = elementFamilies.find(candidate => candidate.id === id);
  if (id === "more") return <More />;
  if (family) return <Family family={family} />;
  switch (id) {
    case "switches": return <Switches />;
    case "knob": return <Knob />;
    case "sizing": return <Sizing />;
    case "outline": return <Outline />;
    case "menus": return <Menus />;
    case "bars": return <Bars />;
    case "partial-app-theme": return PartialAppTheme
      ? <Suspense fallback={null}><PartialAppTheme /></Suspense>
      : <p className="lab-missing">App themes are unavailable in this frozen revision.</p>;
    case "catalogue": return <Catalogue />;
    default: return <p className="lab-missing">Unknown section “{id}”.</p>;
  }
}

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

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSESwitch, NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSESearchField } from "../../src/NSE/Controls/Fields/NSESearchField";
import { NSESlider } from "../../src/NSE/Controls/Values/NSESlider";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSEPopUpButton } from "../../src/NSE/Menus/NSEPopUpButton";
import { MenuView } from "../../src/NSE/Menus/MenuView";
import { MetalThumb } from "../../src/NSE/Appearance/MetalThumb";
import { TopBar } from "../../src/NSE/Windows/Chrome/TopBar";
import { ToolbarView } from "../../src/NSE/Toolbars/ToolbarView";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline/NSEOutlineView";
import { NSETreeController } from "../../src/NSE/Controllers/NSETreeController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";

const noop = () => undefined;
const parameters = new URLSearchParams(location.search);
const measuring = parameters.get("measure") === "1";
const scheme = parameters.get("scheme") === "dark" ? "dark" : "light";

/** One labelled specimen; with measuring on it reads back the rendered control's size. */
function Spec({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
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
  ...Array.from({ length: 8 }, (_, index) => ({ value: `more-${index}`, label: `More option ${index + 1}` })),
];

function Menus() {
  return <Group title="Menu">
    <Spec label="Sections, submenus, overflow" wide>
      <div className="lab-menu-stage"><MenuView label="Contact" items={contactMenu} defaultOpen /></div>
    </Spec>
  </Group>;
}

function Bars() {
  return <>
    {(["atmoCumulus", "atmoMetal"] as const).map(variant => (
      <Group key={variant} title={`Top bar, ${variant}`}>
        <Spec label="Title with items" wide>
          <div className="lab-bar"><TopBar title="Preferences & Accounts" variant={variant} scheme={scheme} leadingItems={[{ kind: "webspring", label: "Home" }]} trailingItems={[{ kind: "settings", label: "Settings" }]} /></div>
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

export function renderSection(id: string): ReactNode {
  switch (id) {
    case "switches": return <Switches />;
    case "knob": return <Knob />;
    case "sizing": return <Sizing />;
    case "outline": return <Outline />;
    case "menus": return <Menus />;
    case "bars": return <Bars />;
    case "catalogue": return <Catalogue />;
    default: return <p className="lab-missing">Unknown section “{id}”.</p>;
  }
}

/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useEffect, useState } from "react";
import { NSEUserDefaultsController } from "../../../src/NSE/Controllers/NSEUserDefaultsController";
import { NSEAppearance } from "../../../src/NSE/Appearance/NSEAppearance";
import { nseUnowned } from "../../../src/NSE/Controllers/ownership";
import { NSEButton } from "../../../src/NSE/Controls/Buttons/NSEButton";
import { NSESegmentedControl } from "../../../src/NSE/Controls/Values/NSESegmentedControl";
import type { NSESegmentedSelection } from "../../../src/NSE/Controls/Values/valueControlTypes";
import { NSESplitView } from "../../../src/NSE/DataViews/Split/NSESplitView";
import { MenuView } from "../../../src/NSE/Menus/MenuView";
import { NSETabView } from "../../../src/NSE/Navigation/NSETabView";
import { NSEPopover } from "../../../src/NSE/Overlays/NSEPopover";
import { NSEToolbarController } from "../../../src/NSE/Toolbars/NSEToolbarController";
import { ToolbarView } from "../../../src/NSE/Toolbars/ToolbarView";
import type { ToolbarPreferences, ToolbarRuntimePort } from "../../../src/NSE/Toolbars/toolbarTypes";
import { NSEView } from "../../../src/NSE/Views/NSEView";
import { StandardWindowView } from "../../../src/NSE/Windows/StandardWindowView";
import type { WindowRecord } from "../../../src/SynCloudOS/Windows";
import { WSStageWindowFrame, WSStageWindowSurface } from "../../../src/Webspring/WSStageWindowHost";
import { defaultsFrom } from "../../fixtures/userDefaults";
import { Spec } from "../specimens";
import { themes } from "virtual:atmo-lab/app-themes";
import "./partialAppTheme.css";

const theme = themes["com.syndromatic.atmo-lab.red-chrome"];
if (!theme || !("kind" in theme)) throw new Error("Atmo Lab could not load the Red Chrome app theme.");
const appearance = new NSEAppearance({ theme });
const specimenId = "atmo-lab-red-chrome";
const bounds = { x: 0, y: 0, width: 300, height: 160 };
const windowRecord: WindowRecord = {
  id: specimenId, runtimeId: specimenId as WindowRecord["runtimeId"], workspaceId: specimenId,
  applicationId: null, applicationSessionId: null, documentId: null, documentAssociationRole: null,
  representedDocument: null, toolbar: null, role: "standard", style: ["titled", "closable"], title: "Library",
  content: { rendererId: specimenId, parameters: {} }, bounds, minimumSize: { width: 200, height: 140 },
  maximumSize: null, level: "normal", parentWindowControllerId: null, anchor: null, pinned: false,
  state: "open", isKey: true, isMain: true, zIndex: 1, mobilePolicy: "fullscreen", restorationKey: null,
  smoothSurface: "off",
};

function ThemedWindow() {
  return <div className="lab-themed-window">
    <StandardWindowView record={windowRecord} presentation={{
      kind: "desktop-window", visible: true, bounds,
      safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
      movable: false, resizable: false, titleBarVisible: true,
    }} blocked={false} dirty={false} dispatchCommand={async () => undefined}>
      <div className="lab-themed-actions">
        <NSEButton title="Continue" bezelColour="#c8102e" />
        <NSEButton title="Cancel" />
      </div>
    </StandardWindowView>
  </div>;
}

function ThemedToolbar() {
  const [controller] = useState(() => {
    const storedValues = new Map<string, unknown>();
    const preferences = new NSEUserDefaultsController<ToolbarPreferences>({
      namespace: specimenId,
      schema: {
        version: 1,
        defaults: { itemIds: ["save"], displayMode: "label-only", sizeMode: "regular" },
        fields: {
          itemIds: { validate: (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(id => typeof id === "string") },
          displayMode: { validate: (value: unknown): value is ToolbarPreferences["displayMode"] => value === "label-only" },
          sizeMode: { validate: (value: unknown): value is ToolbarPreferences["sizeMode"] => value === "regular" },
        },
        migrations: [],
      },
      defaults: defaultsFrom({
        read: key => storedValues.get(key) ?? null,
        write: (key, value) => { storedValues.set(key, value); },
        remove: key => { storedValues.delete(key); },
      }),
    });
    const runtime: ToolbarRuntimePort = {
      signal: new AbortController().signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validateMany: async requests => new Map(requests.map(request => [request.key, {
          commandId: request.commandId, responderId: specimenId, title: "Save",
          enabled: true, denied: false, hidden: false, state: "off", stale: false,
        }])),
        prepareDispatch: async () => ({ status: "cancelled", reason: "specimen" }),
        dispatch: async commandId => ({ status: "cancelled", commandId, operationId: specimenId, reason: "specimen" }),
      },
    };
    return new NSEToolbarController({
      owner: nseUnowned, preferences, runtime,
      configuration: {
        identifier: specimenId, owner: { kind: "window", windowControllerId: specimenId },
        allowedItemIds: ["save"], defaultItemIds: ["save"], displayMode: "label-only", sizeMode: "regular",
      },
      items: [{ kind: "command", id: "save", commandId: "save", label: "Save", paletteLabel: "Save", icon: null, minimumWidth: 96, idealWidth: 112 }],
    });
  });
  useEffect(() => () => controller.dispose(), [controller]);
  return <ToolbarView composition="configured" controller={controller} width={240}
    aria-label="Library toolbar" interaction={{ parentResponderId: specimenId }} />;
}

function ThemedPopover() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return <div>
    <NSEButton ref={setAnchor} title="Show details" onClick={() => setOpen(true)} />
    <NSEPopover id="atmo-lab-themed-details" anchor={anchor} open={open}
      presentation={{ mode: "anchored" }}
      parentWindowControllerId={null} onOpenChange={setOpen} title="Details" contentSize={{ width: 240, height: 120 }}>
      <p>Published editions and notes.</p>
    </NSEPopover>
  </div>;
}

export default function PartialAppTheme() {
  const [selection, setSelection] = useState<NSESegmentedSelection>(() => ({ mode: "select-one", selectedIds: new Set(["list"]), allowsEmpty: false }));
  return <NSEView appearance={appearance} className="lab-partial-theme">
    <h2>{theme.displayName}</h2>
    <div className="lab-group-body">
      <Spec wide label="Window bezel, red button bezelColour, and stock Cancel button"><ThemedWindow /></Spec>
      <Spec wide label="Staged app chrome">
        <WSStageWindowFrame zIndex={1} keyWindow className="lab-themed-stage">
          <WSStageWindowSurface material="cumulus" hasTitlebar={false}>
            <p>Library workspace</p>
          </WSStageWindowSurface>
        </WSStageWindowFrame>
      </Spec>
      <Spec wide label="Toolbar and toolbar item"><ThemedToolbar /></Spec>
      <Spec wide label="Tabs">
        <NSETabView aria-label="Library views" items={[
          { id: "recent", label: "Recent", render: () => <p>Recent books</p> },
          { id: "saved", label: "Saved", render: () => <p>Saved books</p> },
        ]} />
      </Spec>
      <Spec wide label="Segmented control">
        <NSESegmentedControl aria-label="Library layout" segmentStyle="rounded"
          selection={selection} onSelectionChange={setSelection}
          items={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }]} />
      </Spec>
      <Spec wide label="Split view divider">
        <NSESplitView sidebar={<p>Collections</p>} defaultSidebarWidth={112}
          minSidebarWidth={96} maxSidebarWidth={152} className="lab-themed-split">
          <p>Books</p>
        </NSESplitView>
      </Spec>
      <Spec label="Menu and menu items">
        <MenuView label="File menu" items={[{ value: "new", label: "New collection" }, { value: "open", label: "Open book" }]} />
      </Spec>
      <Spec label="Popover"><ThemedPopover /></Spec>
    </div>
  </NSEView>;
}

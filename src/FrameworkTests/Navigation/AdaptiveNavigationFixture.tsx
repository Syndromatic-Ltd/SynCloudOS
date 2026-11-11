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

import { useEffect, useState, useSyncExternalStore } from "react";
import { createSynWare, createSynWareBundle } from "../../SynCloudOS/AppSDK";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";
import { NSETabViewController, NSETabViewItem, NSEViewController, nseUnowned, useNSEDeferredDisposal } from "../../NSE/NSE";

const applicationId = "com.syncloudos.framework.navigation";
const windowId = "adaptive-navigation";

class DraftOptionsController extends NSEViewController {
  constructor() {
    super();
    this.title = "Draft options";
    this.preferredContentSize = { width: 260, height: 180 };
  }
  renderView() {
    return <><h2>Draft options</h2><input aria-label="Option draft" defaultValue="Retain options" />
      <button onClick={() => this.dismiss()}>Done</button></>;
  }
}

class DraftViewController extends NSEViewController {
  constructor(readonly id: string) { super({ title: id }); }
  renderView() {
    return <div data-nse-navigation-scroll-surface="true" data-testid={`scroll-${this.id}`} style={{ height: "100%", overflow: "auto", boxSizing: "border-box", padding: 16 }}>
      <h1>{this.id}</h1><label>Unsaved draft <input aria-label={`Draft ${this.id}`} defaultValue="Keep this document" /></label>
      <button onClick={event => this.presentAsPopover(DraftOptionsController, { of: event.currentTarget, preferredEdge: "maxY" })}>Open draft options</button>
      <div style={{ height: 600 }}>Scrollable retained content</div><button>Document end</button>
    </div>;
  }
}

class NavigationFixtureController extends NSETabViewController {
  constructor() {
    super({ owner: nseUnowned, title: "Workspace", tabStyle: "sidebarAdaptable" });
    for (const id of ["Editor", "Library", "Search", "Settings", "Activity", "Sharing", "History"]) {
      this.addTabViewItem(new NSETabViewItem({ identifier: id, label: id, image: { kind: "vector", path: "/src/NSE/Navigation/nse-tab-bar-more.svg" }, viewController: this.addChild(DraftViewController, id) }));
    }
  }
  override shouldSelect(item: NSETabViewItem) { return item.identifier !== "Search"; }
}

function NavigationApplicationContent() {
  const [controller] = useState(() => new NavigationFixtureController());
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const snapshot = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot(), () => controller.getSnapshot());
  const [renderer, setRenderer] = useState("tabs");
  useNSEDeferredDisposal(controller);
  useEffect(() => {
    if (!element) return;
    // Observe the actual theme projection instead of duplicating its policy.
    const read = () => setRenderer(element.querySelector("[data-navigation-renderer]")?.getAttribute("data-navigation-renderer") ?? "tabs");
    const projection = new MutationObserver(read);
    projection.observe(element, { subtree: true, attributes: true, attributeFilter: ["data-navigation-renderer"] });
    read();
    return () => projection.disconnect();
  }, [element]);
  return <div ref={setElement} data-testid="navigation-window" style={{ height: "100%" }}>
    <output hidden data-testid="navigation-state">{renderer}:{snapshot.selectedIdentifier}</output>
    <controller.view />
  </div>;
}

const application = createSynWareBundle(createSynWare({
  manifest: { schemaVersion: 1, bundleIdentifier: applicationId, displayName: "Adaptive navigation", version: "1.0.0" },
  root: NavigationApplicationContent,
}));

export function AdaptiveNavigationFixture() {
  const runtime = useKernelSynCloudOS();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState("");
  const [rtl, setRTL] = useState(false);
  useEffect(() => {
    if (!element) return;
    let active = true;
    if (!runtime.apps.getApp(applicationId)) runtime.apps.register(application);
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const bounds = { x: rect.x, y: rect.y, width: element.clientWidth, height: element.clientHeight };
      if (bounds.width <= 0 || bounds.height <= 0) return;
      if (runtime.windows.list().some(window => window.id === windowId)) runtime.windows.setBounds(windowId, bounds, "content-size");
    };
    void runtime.bundles.loadBundle(applicationId).then(async () => {
      if (!active) return;
      const rect = element.getBoundingClientRect();
      const controller = runtime.windows.list().find(window => window.id === windowId) ?? runtime.windows.create({
        id: windowId, workspaceId: "framework-tests", applicationId, applicationSessionId: applicationId,
        role: "standard", chromeMode: "frameless", style: [], title: "Adaptive navigation",
        documentId: null, documentAssociationRole: null, representedDocument: null, toolbar: null,
        maximumSize: null, level: "normal", parentWindowControllerId: null, anchor: null, pinned: false, restorationKey: null,
        content: { rendererId: "application", parameters: { appId: applicationId } },
        bounds: { x: rect.x, y: rect.y, width: element.clientWidth, height: element.clientHeight },
        minimumSize: { width: 1, height: 1 }, smoothSurface: "off", mobilePolicy: "fullscreen",
      });
      await runtime.windows.open(controller.id);
      if (active) measure();
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [element, runtime]);
  useEffect(() => {
    // Direction is a document presentation preference, independent of traits.
    const previous = document.documentElement.dir;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    return () => { document.documentElement.dir = previous; };
  }, [rtl]);
  return <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#e9edf2", color: "#20242a" }}>
    <div style={{ height: 40, flex: "none", display: "flex", gap: 12, position: "relative", zIndex: 200 }}>
      <label>Content width <input aria-label="Content width" value={width} onChange={event => setWidth(event.target.value)} style={{ width: 65 }} /></label>
      <label>RTL <input type="checkbox" aria-label="RTL" checked={rtl} onChange={event => setRTL(event.target.checked)} /></label>
    </div>
    <div ref={setElement} style={{ width: width ? `${width}px` : "100%", maxWidth: "100%", flex: 1, minHeight: 0 }} />
  </div>;
}

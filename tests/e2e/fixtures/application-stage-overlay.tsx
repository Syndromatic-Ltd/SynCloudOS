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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { NSEPresence } from "../../../src/NSE/Animation";
import { useNSEOverlayProvider } from "../../../src/NSE/Overlays";
import { createSynWare, createSynWareBundle } from "../../../src/SynCloudOS/AppSDK/createSynWare";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../../src/SynCloudOSReact";
import { ApplicationStageView } from "../../../src/Webspring/ApplicationStageView";
import { WindowContentRendererRegistry } from "../../../src/Webspring/WindowLayer";
import "../../../src/NSE/public/styles.css";
import "../../../src/Webspring/WebspringHost.css";

const params = new URLSearchParams(location.search);
const contentOwned = params.get("motion") === "content";
const runtime = createSynCloudOS({
  id: "stage-overlay-browser", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled",
});
let clicks = 0;
let exits = 0;
function Content() {
  const overlay = useNSEOverlayProvider();
  return overlay.portalHost ? createPortal(<div data-viewport-overlay="true" style={{ position: "fixed", inset: 0 }}>
    <button id="portal-action" onClick={() => { clicks++; }} style={{ position: "absolute", left: 0, top: 0, width: 100, height: 100, border: 0, padding: 0, background: "rgb(239, 45, 101)" }}>Overlay action</button>
  </div>, overlay.portalHost) : null;
}
const definition = createSynWare({
  manifest: { schemaVersion: 1, bundleIdentifier: "com.example.stage-overlay-app", version: "1.0.0", displayName: "Stage Overlay", permissions: ["app.open.public"],
      frame: { topBar: "none", presentationMotion: contentOwned ? "content" : "host" } },
  root: Content,
});
const app = runtime.apps.register(createSynWareBundle(definition))!;
await runtime.bundles.loadBundle(app.bundleIdentifier);
const registry = new WindowContentRendererRegistry();
function Fixture() {
  const [staged, setStaged] = useState(params.get("staged") === "true");
  const [role, setRole] = useState<"incoming" | "outgoing" | null>(null);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    Object.assign(window, { stageOverlayFixture: { setStaged, setRole, setShown, clicks: () => clicks, exits: () => exits } });
  }, []);
  return <SynCloudOSProvider runtime={runtime}>
    <HostSiteBrandingProvider value={{ name: "Stage", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Stage" }}>
      <div className="webspring-apps-container">
        <NSEPresence initial={false} onExitComplete={() => { exits++; }}>{shown ? <ApplicationStageView key={app.bundleIdentifier}
          app={app} lifecycle="active" staged={staged} multiSwitchRole={role} windowContentRegistry={registry}
          stage={{ id: "application-stage:overlay", appId: app.bundleIdentifier, title: app.window.title, isFocused: true, zIndex: 2 }} /> : null}</NSEPresence>
      </div>
    </HostSiteBrandingProvider>
  </SynCloudOSProvider>;
}
const style = document.createElement("style");
style.textContent = "body{margin:0;background:rgb(11,13,17)} .webspring-app-view-surface{clip-path:inset(80px)}";
document.head.append(style);
createRoot(document.getElementById("root")!).render(<Fixture />);
import.meta.hot?.dispose(() => { void runtime.dispose("stage overlay fixture reload"); });

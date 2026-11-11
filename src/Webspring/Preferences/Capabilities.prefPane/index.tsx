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

import { systemCapabilityReport, type SystemCapabilityRow } from "../../../SynCloudOS/SynCloudOS";
import { useEffect, useState, useSyncExternalStore } from "react";
import { NSEBox, NSEButton } from "../../../NSE/public/controls";
import { definePreferencePane } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";
import { installedApplicationForDocument } from "../../../SynCloudOS/SynCloudOS";
import { useSystemText } from "../useSystemText";
import "./capabilities.css";
const idleSubscribe = () => () => {};
const idleSnapshot = () => null;
export function CapabilitiesPane() {
  const runtime = useKernelSynCloudOS(), t = useSystemText();
  const [families, setFamilies] = useState<readonly SystemCapabilityRow[]>([]);
  useEffect(() => { let active = true; void systemCapabilityReport(runtime).then(rows => { if (active) setFamilies(rows); }); return () => { active = false; }; }, [runtime]);
  const document = runtime.environment.browser.getDocument();
  const adapter = installedApplicationForDocument(document);
  const snapshot = useSyncExternalStore(adapter?.subscribe ?? idleSubscribe, adapter?.getSnapshot ?? idleSnapshot, idleSnapshot);
  const browserWindow = document?.defaultView;
  const navigator = browserWindow?.navigator;
  const capabilities = [
    ["Service worker", !!navigator?.serviceWorker], ["Persistent storage", !!navigator?.storage?.persist],
    ["App badges", !!navigator && "setAppBadge" in navigator], ["Push notifications", !!browserWindow && "PushManager" in browserWindow],
    ["Window controls overlay", !!navigator && "windowControlsOverlay" in navigator], ["View Transitions", !!document && "startViewTransition" in document],
    ["Background sync", !!browserWindow && "SyncManager" in browserWindow], ["Background fetch", !!browserWindow && "BackgroundFetchManager" in browserWindow],
  ] as const;
  return <section className="nse-capabilities" aria-label={t("preferences.capabilities", "Capabilities")}><NSEBox><div className="nse-capabilities-content">
    <h2>{t("preferences.capabilities.heading", "Installed application")}</h2>
    <p role="status">{snapshot?.installed ? t("preferences.capabilities.installed", "Application installed") : t("preferences.capabilities.browser", "Running in a browser tab")}</p>
    <NSEButton title={t("preferences.capabilities.install", "Install application")} isEnabled={snapshot?.canInstall === true}
      onClick={() => { void runtime.commands.dispatch("webspring.install", undefined); }} />
    <p>{t("preferences.capabilities.scope", "Installation is offered when the site declares an install scope and this browser permits it.")}</p>
    <dl className="nse-capabilities-details"><dt>{t("preferences.capabilities.worker", "Offline worker")}</dt><dd>{snapshot?.worker ?? "Not configured"}</dd>
      <dt>{t("preferences.capabilities.persistence", "Persistent storage")}</dt><dd>{snapshot?.persistence ?? "Not requested"}</dd></dl>
    {snapshot?.error ? <p role="alert">{snapshot.error}</p> : null}
    <h2>{t("preferences.capabilities.browserSupport", "Browser support")}</h2>
    <dl className="nse-capabilities-support">{capabilities.map(([name, supported]) => <div key={name}><dt>{name}</dt><dd>{supported ? t("preferences.capabilities.available", "Available") : t("preferences.capabilities.unavailable", "Unavailable")}</dd></div>)}</dl>
    <h2>{t("preferences.capabilities.fx", "FX frameworks")}</h2>
    <dl className="nse-capabilities-families">{families.map(row => <div key={row.family}><dt>{row.family}</dt><dd>{row.value}</dd></div>)}</dl>
    <p>{t("preferences.capabilities.limit", "Support does not imply permission. Offline availability covers the application shell and bundled resources; server data still needs a connection.")}</p>
  </div></NSEBox></section>;
}
export default definePreferencePane({ id: "capabilities", title: { key: "preferences.capabilities", fallback: "Capabilities" }, order: 660, view: CapabilitiesPane });

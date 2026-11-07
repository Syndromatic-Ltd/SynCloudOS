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

import { useId, useSyncExternalStore } from "react";
import { NSEBox, NSEButton, NSEStackView, NSESwitch } from "../NSE/public/controls";
import type { PrivacyAuthorizationRecord, PrivacyAuthorizationStatus, PrivacyDecision, PrivacyStore } from "../SynCloudOS/Privacy";
import type { SystemText } from "./Preferences/useSystemText";

export interface PrivacySecurityPaneProps {
  readonly store: PrivacyStore;
  readonly userId: string;
  /** Application names keyed by canonical, lower-case bundle identifier. */
  readonly applicationNames?: Readonly<Record<string, string>>;
  readonly text?: SystemText;
}

const fallbackText: SystemText = (_key, fallback, params) => fallback.replace(/\{([^}]+)\}/gu, (match, key: string) => params?.[key] === undefined ? match : String(params[key]));
const services: Readonly<Record<string, string>> = Object.freeze({
  location: "Location",
  camera: "Camera",
  microphone: "Microphone",
  screenCapture: "Screen recording",
  motion: "Motion",
  midi: "MIDI devices",
  "midi.sysex": "MIDI system exclusive messages",
  bluetooth: "Bluetooth",
  nfc: "NFC",
  speech: "Speech recognition",
  contacts: "Contacts",
  payment: "Payments",
  xr: "Augmented and virtual reality",
  notifications: "Notifications",
});
const decisionLabels: Readonly<Record<PrivacyDecision, string>> = Object.freeze({
  granted: "Allowed", denied: "Denied", prompt: "Ask on next request",
});
const browserLabels: Readonly<Record<PrivacyAuthorizationStatus, string>> = Object.freeze({
  granted: "Allowed", denied: "Denied", prompt: "Requires a prompt", unknown: "Not reported", unavailable: "Unavailable",
});

function PrivacyServiceRow({ record, store, appName, text: t }: {
  readonly record: PrivacyAuthorizationRecord;
  readonly store: PrivacyStore;
  readonly appName: string;
  readonly text: SystemText;
}) {
  const descriptionId = useId();
  const service = t(`preferences.privacy.service.${record.service}`, services[record.service] ?? record.service);
  const decision = t(`preferences.privacy.decision.${record.decision}`, decisionLabels[record.decision]);
  const browser = record.browserStatus === null
    ? t("preferences.privacy.browser.notChecked", "Not checked")
    : t(`preferences.privacy.browser.${record.browserStatus}`, browserLabels[record.browserStatus]);
  const scope = { userId: record.userId, appId: record.appId, service: record.service };
  return <section aria-label={service}>
    <NSEStackView orientation="vertical" alignment="fill" spacing={8}>
      <NSEStackView orientation="horizontal" distribution="equal-spacing" alignment="centre" spacing={12}>
        <strong>{service}</strong>
        <NSESwitch
          state={record.decision === "granted" ? "on" : "off"}
          aria-label={t("preferences.privacy.allow", "Allow {app} to use {service}", { app: appName, service })}
          aria-describedby={descriptionId}
          onStateChange={state => store.setAuthorization(scope, state === "on" ? "granted" : "denied")}
        />
      </NSEStackView>
      <div id={descriptionId} role="status" aria-live="polite" aria-atomic="true">
        <p style={{ margin: 0 }}>{t("preferences.privacy.appAccess", "App access: {status}", { status: decision })}</p>
        <p style={{ margin: 0 }}>{t("preferences.privacy.browserPermission", "Browser permission: {status}", { status: browser })}</p>
      </div>
      <NSEButton
        title={t("preferences.privacy.askAgain", "Ask again")}
        aria-label={t("preferences.privacy.askAgainFor", "Ask again for {app}: {service}", { app: appName, service })}
        isEnabled={record.decision !== "prompt"}
        onClick={() => store.setAuthorization(scope, "prompt")}
      />
    </NSEStackView>
  </section>;
}

/** Host-owned privacy presentation; its controls change only local app consent. */
export function PrivacySecurityPane({ store, userId, applicationNames, text = fallbackText }: PrivacySecurityPaneProps) {
  const records = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const applications = new Map<string, PrivacyAuthorizationRecord[]>();
  for (const record of records) {
    if (record.userId !== userId) continue;
    const existing = applications.get(record.appId) ?? [];
    existing.push(record);
    applications.set(record.appId, existing);
  }
  return <section className="nse-prefs-section" aria-label={text("preferences.privacy", "Privacy & Security")}>
    <p className="nse-prefs-note nse-prefs-note-lead">
      {text("preferences.privacy.scope", "Choose which apps may request access. These controls cannot grant browser permission. Your browser may still ask or refuse access.")}
    </p>
    {applications.size === 0 ? <div className="nse-prefs-empty">
      <span className="nse-prefs-empty-title">{text("preferences.privacy.empty", "No privacy requests yet")}</span>
      <span className="nse-prefs-empty-detail">{text("preferences.privacy.emptyDetail", "Apps appear here after they check or request access to a device or personal information.")}</span>
    </div> : [...applications].map(([appId, entries]) => {
      const appName = applicationNames?.[appId] ?? appId;
      return <NSEBox key={appId} title={appName} contentViewMargins={{ width: 12, height: 12 }}>
        <NSEStackView orientation="vertical" alignment="fill" spacing={16}>
          {entries.map(record => <PrivacyServiceRow key={record.service} record={record} store={store} appName={appName} text={text} />)}
        </NSEStackView>
      </NSEBox>;
    })}
    {applications.size > 0 ? <p className="nse-prefs-note">
      {text("preferences.privacy.revoke", "Turning access off stops the app's active requests and sessions. Ask again clears your app choice; change a browser refusal in your browser's site settings.")}
    </p> : null}
  </section>;
}

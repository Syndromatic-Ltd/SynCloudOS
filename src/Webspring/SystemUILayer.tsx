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

import { useEffect, useId, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NSEAlert, NSEAlertBackdrop, NSEFocusPortProvider, NSEFocusScope } from "../NSE/NSE";
import { NSEPushButton } from "@syndromatic/syncloudos/nse/controls";
import { useNSEFeedback } from "../NSE/hostComposition";
import { NSEAboutDialog, NSEConfirmDialog, NSEPreferencesToast } from "../NSE/SystemUI";
import type { RuntimeSnapshot, SynCloudOSAppInfo } from "../SynCloudOS/SynCloudOS";
import { useAppearance, useResolvedMode, useRuntimeNSEFocusPort, useRuntimeSelector, useKernelSynCloudOS, useSettings } from "../SynCloudOSReact";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import { confirmReturnDecisionKeepWindows, confirmReturnDecisionQuit } from "./returnDecision";
import { SystemUIAccountContext, type SystemUIAccount } from "./Preferences/systemAccount";
import { useSystemPreferencePanes } from "./Preferences/useSystemPreferencePanes";
import type { WebspringPreferencesOptions } from "./webspringTypes";
import { useSystemText } from "./Preferences/useSystemText";

function selectAppInfo(snapshot: RuntimeSnapshot) {
  return snapshot.appInfo;
}

function ReturnDecisionDialog({
  runtime,
  appId,
  appIdentity,
  decisionIdentity,
  title,
  message,
  quitLabel,
  keepLabel,
}: {
  readonly runtime: SynCloudOSRuntime;
  readonly appId: string;
  readonly appIdentity: SynCloudOSAppInfo | null;
  readonly decisionIdentity: { readonly appId: string };
  readonly title: string;
  readonly message: string;
  readonly quitLabel: string;
  readonly keepLabel: string;
}) {
  const alertAppearance = useResolvedMode() === "dark" ? "dark" : "light";
  const titleId = useId();
  const messageId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismiss = () => {
    if (runtime.systemUI.getSnapshot().returnDecision === decisionIdentity) {
      runtime.systemUI.navigation.dismissReturnDecision();
    }
  };
  const currentGenerationIsLive = () => appIdentity !== null && runtime.apps.getApp(appId) === appIdentity &&
    runtime.store.getSnapshot().application.activeAppId === appId;

  if (typeof document === "undefined") return null;

  // Safe-dismiss is disabled while a decision is in flight: a backdrop
  // click or Escape must never abandon a half-committed Quit.
  const onSafeDismiss = busy ? undefined : dismiss;

  const runQuit = () => {
    if (busy) return;
    if (!currentGenerationIsLive()) {
      setError("This return decision belongs to an application generation that is no longer active.");
      return;
    }
    setBusy(true);
    setError(null);
    void confirmReturnDecisionQuit(runtime, appId).then((outcome) => {
      // A refused close (a document cancelled) leaves the app and its
      // windows intact with the decision still open — only a committed
      // close dismisses into the shell transition.
      if (outcome === "closed") dismiss();
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    }).finally(() => {
      setBusy(false);
    });
  };

  const runKeep = () => {
    if (busy) return;
    if (!currentGenerationIsLive()) {
      setError("This return decision belongs to an application generation that is no longer active.");
      return;
    }
    setBusy(true);
    setError(null);
    void confirmReturnDecisionKeepWindows(runtime).then(() => {
      dismiss();
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    }).finally(() => {
      setBusy(false);
    });
  };

  return createPortal(
    <NSEFocusScope options={{ scopeId: "system-ui:return-decision", kind: "modal", modal: true, trapFocus: true, asChild: true }}>
      <NSEAlertBackdrop onSafeDismiss={onSafeDismiss}>
        <NSEAlert
          appearance={alertAppearance}
          labelledBy={titleId}
          describedBy={messageId}
          initialFocusSelector=".nse-return-keep"
        >
          <div className="nse-system-alert-content nse-confirm-content-textonly">
            <div className="nse-system-alert-copy">
              <h2 id={titleId}>{title}</h2>
              <p id={messageId}>{message}</p>
              {error ? <p role="alert">{error}</p> : null}
            </div>
          </div>
          <div className="nse-alert-actions">
            <NSEPushButton
              className="nse-system-alert-action-button"
              tone="negative"
              disabled={busy}
              onClick={runQuit}
            >
              {quitLabel}
            </NSEPushButton>
            <NSEPushButton
              className="nse-system-alert-action-button nse-return-keep"
              tone={alertAppearance === "dark" ? "medium" : "light"}
              disabled={busy}
              onClick={runKeep}
            >
              {keepLabel}
            </NSEPushButton>
          </div>
        </NSEAlert>
      </NSEAlertBackdrop>
    </NSEFocusScope>,
    document.body,
  );
}

/**
 * Renders the system surfaces once, at the root. Mounted by every browser
 * host so each app gets Preferences, About and the log-out confirm without
 * wiring any of them. A host without authentication passes no `onLogOut`:
 * it never offers Log Out. A host with sign-in passes `account` for the
 * Account preference pane. `preferences` adds panes to System Preferences
 * and hides built-in ones.
 *
 * The dialogs portal to document.body, so where this sits in the tree only
 * decides WHEN it renders, not where it appears.
 */
export function SystemUILayer({ onLogOut, account, preferences, siteName = "this site" }: {
  onLogOut?: () => boolean | void | Promise<boolean | void>;
  account?: SystemUIAccount;
  preferences?: WebspringPreferencesOptions;
  siteName?: string;
}) {
  const feedback = useNSEFeedback();

  const runtime = useKernelSynCloudOS();
  const ui = useSyncExternalStore(
    runtime.systemUI.subscribe,
    runtime.systemUI.getSnapshot,
    runtime.systemUI.getSnapshot
  );
  const appearance = useAppearance();
  const resolvedMode = useResolvedMode();
  const settings = useSettings();
  const systemT = useSystemText();
  const nseFocusPort = useRuntimeNSEFocusPort("webspring");

  useEffect(() => {
    feedback?.setButtonSoundEnabled(settings.soundEnabled);
    feedback?.setVibrationEnabled(settings.vibrationEnabled);
  }, [settings.soundEnabled, settings.masterVolume, settings.vibrationEnabled]);

  // Read LIVE off the runtime rather than snapshotted once: this layer mounts
  // at the root during boot, before a single app has registered.
  const appInfo = useRuntimeSelector(selectAppInfo);

  // Without authentication there is no session to end: decline the request.
  useLayoutEffect(() => {
    if (!onLogOut && ui.logOutOpen) runtime.systemUI.session.dismissLogOut();
  }, [onLogOut, runtime, ui.logOutOpen]);
  const panes = useSystemPreferencePanes({ offersAccount: account !== undefined, preferences });

  const aboutApp = ui.aboutAppId ? appInfo[ui.aboutAppId] ?? null : null;
  const returnDecision = ui.returnDecision;
  const returnAppName = returnDecision ? appInfo[returnDecision.appId]?.displayName ?? returnDecision.appId : "";
  const returnTitle = returnDecision
    ? systemT("navigation.returnDecisionTitle", "Do you want to quit {AppName}?", { AppName: returnAppName })
    : "";
  const returnMessage = systemT("navigation.returnDecisionMessage", "Quitting the app closes all open windows.");
  const returnQuitLabel = systemT("navigation.returnDecisionQuit", "Quit");
  const returnKeepLabel = systemT("navigation.returnDecisionKeepWindows", "Keep Windows");
  return (
    <NSEFocusPortProvider port={nseFocusPort}>
      <SystemUIAccountContext.Provider value={account ?? null}>
        <NSEPreferencesToast
          open={ui.preferencesPane !== null}
          focusScopeId="system-ui:preferences"
          initialPane={ui.preferencesPane || undefined}
          title={systemT("system.preferences", "System Preferences")}
          panes={panes}
          backLabel={systemT("common.back", "Back")}
          appearance={appearance}
          resolvedMode={resolvedMode}
          runtimeOwner={runtime.runtimeId}
          onClose={() => runtime.systemUI.preferences.close()}
        />
      </SystemUIAccountContext.Provider>
      {aboutApp ? (
        <NSEAboutDialog
          open
          appearance={resolvedMode === "dark" ? "dark" : "light"}
          focusScopeId={`system-ui:about:${aboutApp.id}`}
          info={{
            name: aboutApp.displayName,
            iconSrc: aboutApp.icon.src,
            // The system renders the About box, so the system dictionary owns
            // its prose. Info.ts stays the English source and the fallback.
            tagline: aboutApp.about.tagline
              ? systemT(`about.tagline.${aboutApp.id}`, aboutApp.about.tagline)
              : undefined,
            version: aboutApp.about.version,
            build: aboutApp.about.build,
            copyright: aboutApp.about.copyright,
            trademark: aboutApp.about.trademark
          }}
          dismissLabel={systemT("common.ok", "OK")}
          versionLabel={(version, build) => (build
            ? systemT("about.versionBuild", "Version {version} ({build})", { version, build })
            : systemT("about.version", "Version {version}", { version }))}
          onDismiss={() => runtime.systemUI.about.close()}
        />
      ) : null}
      {onLogOut ? <NSEConfirmDialog
        open={ui.logOutOpen}
        appearance={resolvedMode === "dark" ? "dark" : "light"}
        focusScopeId="system-ui:log-out"
        title={systemT("session.logOutSiteTitle", "Are you sure you want to log out of {SiteName}?", { SiteName: siteName })}
        message={systemT("session.logOutMessage", "Any unsaved work in open apps will be lost.")}
        confirmLabel={systemT("session.logOut", "Log Out")}
        cancelLabel={systemT("common.cancel", "Cancel")}
        onConfirm={async () => {
          const completed = await onLogOut();
          // A logout commit moves the runtime into its locked login state
          // before the command's lifecycle promise settles. Clear the
          // confirmation surface as soon as that authoritative state is
          // visible, otherwise its alert backdrop keeps the newly mounted
          // login gate inert and inaccessible to assistive technology.
          if (completed !== false || runtime.statechart.getCurrentState() === "locked.loginWindow") {
            runtime.systemUI.session.dismissLogOut();
          }
        }}
        onCancel={() => runtime.systemUI.session.dismissLogOut()}
      /> : null}

      {returnDecision ? (
        <ReturnDecisionDialog
          runtime={runtime}
          appId={returnDecision.appId}
          appIdentity={appInfo[returnDecision.appId] ?? null}
          decisionIdentity={returnDecision}
          title={returnTitle}
          message={returnMessage}
          quitLabel={returnQuitLabel}
          keepLabel={returnKeepLabel}
        />
      ) : null}
    </NSEFocusPortProvider>
  );
}

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

import { AudioHapticsPane } from "./AudioHapticsPane";
import { Component, useEffect, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NSEAlert, NSEAlertBackdrop, NSEFocusPortProvider, NSEFocusScope } from "../NSE/NSE";
import {
  NSEGroupBox,
  NSEListItem,
  NSEPushButton,
  NSEToggleButton,
} from "@syndromatic/syncloudos/nse/controls";
import { useNSEFeedback } from "../NSE/hostComposition";
import { NSEAboutDialog, NSEConfirmDialog, NSEPreferencesToast, type NSEPreferencePane } from "../NSE/SystemUI";
import type { RuntimeSnapshot, SynCloudOSAppInfo } from "../SynCloudOS/SynCloudOS";
import { createLocaleServicesFacade } from "../SynCloudOS/SynCloudOS";
import { registerSystemPreferencePane } from "../SynCloudOS/Preferences/systemPreferencePaneIssuer";
import type { SynCloudOSTranslationParams } from "../SynCloudOS/LocaleServices";
import { useAppearance, useLocaleServicesSnapshot, useResolvedMode, useRuntimeNSEFocusPort, useRuntimeSelector, useKernelSynCloudOS } from "../SynCloudOSReact";
import { systemT as translateSystemText } from "./systemStrings";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import { confirmReturnDecisionKeepWindows, confirmReturnDecisionQuit } from "./returnDecision";
import { builtInPreferencePanes, type SystemPreferencePaneContext } from "./builtInPreferencePanes";

function selectAppInfo(snapshot: RuntimeSnapshot) {
  return snapshot.appInfo;
}

class PreferencePaneRenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p className="nse-prefs-note">{this.props.fallback}</p>
      : this.props.children;
  }
}

function PreferencePaneContent({ render }: { render: () => ReactNode }) {
  return render();
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
 * Renders the system surfaces once, at the root. Mounted by App so every app
 * gets Preferences, About and the log-out confirm without wiring any of them.
 *
 * The dialogs portal to document.body, so where this sits in the tree only
 * decides WHEN it renders, not where it appears.
 */
export function SystemUILayer({ onLogOut, siteName = "this site" }: { onLogOut: () => boolean | void | Promise<boolean | void>; siteName?: string }) {
  const feedback = useNSEFeedback();

  const runtime = useKernelSynCloudOS();
  const ui = useSyncExternalStore(
    runtime.systemUI.subscribe,
    runtime.systemUI.getSnapshot,
    runtime.systemUI.getSnapshot
  );
  const appearance = useAppearance();
  const resolvedMode = useResolvedMode();
  const settingsService = runtime.settings;
  const settings = useSyncExternalStore(settingsService.subscribe, settingsService.get, settingsService.get);
  const locale = useLocaleServicesSnapshot();
  const localeServices = useMemo(() => createLocaleServicesFacade(runtime), [runtime]);
  const systemT = useMemo(() => (
    key: string,
    fallback: string,
    params?: SynCloudOSTranslationParams,
  ) => translateSystemText(key, fallback, params, localeServices), [locale.activeLocale, locale.dictionaryVersion, localeServices]);
  const nseFocusPort = useRuntimeNSEFocusPort("webspring");

  const supportsVibration = feedback?.isSupported && settingsService.supportsVibration();
  const motion = settings.motion === "reduced" ? "reduced" : "standard";

  useEffect(() => {
    feedback?.setButtonSoundEnabled(settings.soundEnabled);
    feedback?.setVibrationEnabled(settings.vibrationEnabled);
  }, [settings.soundEnabled, settings.masterVolume, settings.vibrationEnabled]);

  const appearanceChoices = useMemo(() => ([
    { value: "light" as const, label: systemT("preferences.light", "Light") },
    { value: "dark" as const, label: systemT("preferences.dark", "Dark") },
    { value: "auto" as const, label: systemT("preferences.auto", "Auto") }
  ]), [locale.activeLocale, locale.dictionaryVersion]);

  // Read LIVE off the runtime rather than snapshotted once.
  //
  // This layer mounts at the root during boot, before a single app has
  // registered, so a useMemo with no deps captured an empty registry and kept it
  // — the pane then reported "0/0" and showed an empty group box for the rest of
  // the session. Selecting from the store re-renders when apps arrive.
  const appInfo = useRuntimeSelector(selectAppInfo);
  const notificationApps = useMemo(
    () => Object.values(appInfo).filter(
      (app) => app.webspring?.visible !== false && app.notifications?.showsNotifications !== false
    ),
    [appInfo]
  );

  const paneContext = useMemo<SystemPreferencePaneContext>(() => ({
    appearance: {
      id: "appearance",
      label: systemT("preferences.appearance", "Appearance"),
      meta: appearanceChoices.find((choice) => choice.value === appearance)?.label ?? appearance,
      render: () => (
        <div className="nse-prefs-section">
          <NSEGroupBox>
            {appearanceChoices.map((choice) => (
              <NSEListItem
                key={choice.value}
                selected={appearance === choice.value}
                onClick={() => runtime.appearance.set(choice.value)}
              >
                {choice.label}
              </NSEListItem>
            ))}
          </NSEGroupBox>
          <p className="nse-prefs-note">
            {systemT("preferences.autoNote", "Auto follows the system setting on this device.")}
          </p>
        </div>
      )
    },
    sounds: {
      id: "sounds",
      label: systemT("preferences.audioHaptics", "Audio & Haptics"),
      meta: settings.soundEnabled ? systemT("preferences.on", "On") : systemT("preferences.off", "Off"),
      // Same master switch as Notifications: the commonest thing anyone wants
      // from this pane is silence, and it should not need a trip inside.
      accessory: (
        <NSEToggleButton
          checked={settings.soundEnabled}
          onCheckedChange={(value) => settingsService.set("soundEnabled", value)}
          aria-label={systemT("preferences.audioEnabled", "Audio enabled")}
        />
      ),
      render: () => <AudioHapticsPane systemT={systemT} />
    },
    motion: {
      id: "motion",
      label: systemT("preferences.motion", "Motion"),
      meta: motion === "reduced"
        ? systemT("preferences.reduced", "Reduced")
        : systemT("preferences.standard", "Standard"),
      render: () => (
        <div className="nse-prefs-section">
          <NSEGroupBox>
            {([
              { value: "standard" as const, label: systemT("preferences.standard", "Standard") },
              { value: "reduced" as const, label: systemT("preferences.reduced", "Reduced") }
            ]).map((choice) => (
              <NSEListItem
                key={choice.value}
                selected={motion === choice.value}
                onClick={() => settingsService.set("motion", choice.value)}
              >
                {choice.label}
              </NSEListItem>
            ))}
          </NSEGroupBox>
          <p className="nse-prefs-note">
            {systemT("preferences.motionNote", "Reduced motion replaces slides and zooms with a simple fade.")}
          </p>
        </div>
      )
    },
    notifications: {
      id: "notifications",
      label: systemT("system.notifications", "Notifications"),
      meta: !settings.notificationsEnabled
        ? systemT("preferences.off", "Off")
        : notificationApps.length === 0
          ? systemT("preferences.none", "None")
          : systemT("preferences.countOfTotal", "{count} of {total}", {
            count: notificationApps.filter((app) => settingsService.notificationsAllowed(app.id)).length,
            total: notificationApps.length
          }),
      // The master switch rides the root row, so notifications can be silenced
      // without opening the pane at all.
      accessory: (
        <NSEToggleButton
          checked={settings.notificationsEnabled}
          onCheckedChange={(value) => settingsService.set("notificationsEnabled", value)}
          aria-label={systemT("preferences.allNotifications", "All notifications")}
        />
      ),
      render: () => (
        <div className="nse-prefs-section" data-muted={settings.notificationsEnabled ? undefined : "true"}>
          {notificationApps.length === 0 ? (
            // Nothing installed asks to notify. An empty group box would read as
            // a rendering fault rather than an answer.
            <div className="nse-prefs-empty">
              <span className="nse-prefs-empty-title">
                {systemT("preferences.noNotificationApps", "No Apps Yet")}
              </span>
              <span className="nse-prefs-empty-detail">
                {systemT(
                  "preferences.noNotificationAppsDetail",
                  "Apps that can send you notifications will appear here."
                )}
              </span>
            </div>
          ) : (
            <>
              <p className="nse-prefs-note nse-prefs-note-lead">
                {systemT("preferences.notificationsLead", "View notifications from:")}
              </p>
              <NSEGroupBox>
                {notificationApps.map((app) => (
                  <NSEListItem
                    key={app.id}
                    tapHighlight={false}
                    leading={<img className="nse-prefs-app-icon" src={app.icon.src} alt="" aria-hidden="true" />}
                    trailing={(
                      <NSEToggleButton
                        // Each app's OWN choice, not the resolved answer: with
                        // the master off these would all read false and turning
                        // it back on would look like it had wiped them.
                        checked={settingsService.appNotificationsAllowed(app.id)}
                        disabled={!settings.notificationsEnabled}
                        onCheckedChange={(value) => settingsService.setNotificationsAllowed(app.id, value)}
                        aria-label={app.displayName}
                      />
                    )}
                  >
                    {app.displayName}
                  </NSEListItem>
                ))}
              </NSEGroupBox>
              {settings.notificationsEnabled ? null : (
                <p className="nse-prefs-note">
                  {systemT(
                    "preferences.notificationsAllOffNote",
                    "All notifications are turned off. Turn them on to choose per app."
                  )}
                </p>
              )}
            </>
          )}
        </div>
      )
    },
    language: {
      id: "language",
      label: systemT("preferences.language", "Language"),
      meta: locale.supportedLocales.find((entry: { code: string; englishName: string; nativeName?: string }) => entry.code === locale.activeLocale)?.nativeName
        ?? locale.activeLocale,
      render: () => (
        <div className="nse-prefs-section">
          <NSEGroupBox>
            {locale.supportedLocales.map((entry: { code: string; englishName: string; nativeName?: string }) => (
              <NSEListItem
                key={entry.code}
                selected={entry.code === locale.activeLocale}
                meta={entry.code}
                onClick={() => runtime.locale.setLocale(entry.code)}
              >
                {entry.nativeName || entry.englishName}
              </NSEListItem>
            ))}
          </NSEGroupBox>
        </div>
      )
    }
  }), [
    appearance,
    appearanceChoices,
    locale.activeLocale,
    locale.dictionaryVersion,
    locale.supportedLocales,
    motion,
    notificationApps,
    settings,
    settingsService,
    supportsVibration
  ]);

  useLayoutEffect(() => {
    const registrations = builtInPreferencePanes.map((descriptor) => registerSystemPreferencePane(runtime.preferencePanes, descriptor));
    return () => {
      for (const registration of registrations.reverse()) registration.dispose();
    };
  }, [runtime]);
  const preferencePaneDescriptors = useSyncExternalStore(
    runtime.preferencePanes.subscribe,
    runtime.preferencePanes.getSnapshot,
    runtime.preferencePanes.getSnapshot,
  );
  const panes = useMemo(() => {
    return preferencePaneDescriptors.map((descriptor) => {
      try {
        const pane = descriptor.create(paneContext) as NSEPreferencePane;
        return {
          ...pane,
          render: () => (
            <PreferencePaneRenderBoundary fallback={systemT("preferences.paneUnavailable", "This preference pane could not be loaded.")}>
              <PreferencePaneContent render={pane.render} />
            </PreferencePaneRenderBoundary>
          ),
        };
      } catch {
        return {
          id: descriptor.id,
          label: descriptor.id,
          meta: systemT("preferences.unavailable", "Unavailable"),
          render: () => <p className="nse-prefs-note">{systemT("preferences.paneUnavailable", "This preference pane could not be loaded.")}</p>,
        } satisfies NSEPreferencePane;
      }
    });
  }, [paneContext, preferencePaneDescriptors, systemT]);

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
      <NSEPreferencesToast
        open={ui.preferencesPane !== null}
        focusScopeId="system-ui:preferences"
        initialPane={ui.preferencesPane || undefined}
        title={systemT("system.preferences", "Preferences")}
        panes={panes}
        backLabel={systemT("common.back", "Back")}
        appearance={appearance}
        resolvedMode={resolvedMode}
        runtimeOwner={runtime.runtimeId}
        onClose={() => runtime.systemUI.preferences.close()}
      />
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
      <NSEConfirmDialog
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
      />

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

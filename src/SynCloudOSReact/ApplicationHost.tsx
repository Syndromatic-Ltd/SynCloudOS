/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NSEAlertBackdrop } from "../NSE/SystemUI";
import { SCOSAlertPresenter } from "./SCOSAlertPresenter";
import { NSEMenuController, NSEOverlayProvider, NSEWindowSurfaceBridgeProvider, useNSEDeferredDisposal } from "../NSE/NSE";
import { NSEPushButton } from "@syndromatic/syncloudos/nse/controls";
import { SynWareEntryRenderer } from "../Webspring/SynWareEntryRenderer";
import { SystemUILayer } from "../Webspring/SystemUILayer";
import type { SystemUIAccount } from "../Webspring/Preferences/systemAccount";
import { SystemPanelsLayer } from "../Webspring/SystemPanelsLayer";
import { HostLoginGate } from "../Webspring/HostLoginGate";
import { useWebspringLocale } from "../Webspring/webspringLocale";
import { createTransientWindowSurfaceBridge, syncApplicationWindowContentRenderers, WindowContentRendererRegistry, WindowLayer, type ApplicationWindowRendererRegistrations } from "../Webspring/WindowLayer";
import { applicationDeclaresAbout, applicationMenuLabels, ApplicationMenuOverlayHost, ApplicationMenuTriggerBridge, createApplicationMenuStore } from "../Webspring/applicationMenuPresentation";
import { createWebspringAppMenuModel } from "../Webspring/webspringAppMenu";
import { SynCloudOSWatchdog } from "../SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import type { CapturedSynCloudOSError } from "../SynCloudOS/ErrorManager/errorTypes";
import type { CommandPayloadSchema, CommandRegistration } from "../SynCloudOS/Commands/commandTypes";
import type { AuthenticationInput } from "../SynCloudOS/Authentication/authenticationTypes";
import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import type { RuntimeSnapshot } from "../SynCloudOS/Runtime/runtimeTypes";
import type { ApplicationHostHome } from "./applicationHome";
import { FocusScope } from "./FocusScope";
import { ResponderScope } from "./ResponderScope";
import { useKernelSynCloudOS } from "./runtimeContext";
import { useRuntimeSelector } from "./runtimeHooks";
import { useResolvedMode } from "./serviceHooks";
import { useHostSiteBranding } from "./siteBrandingContext";
import { useRuntimeNSEOverlayPort } from "./nseFocusPort";
import { useRuntimeNSEMenuPort } from "./nseMenuPort";
import { activateResponderHierarchy, clearOwnedResponderAnchor } from "./responderHierarchy";
import { SystemAlert } from "./SystemAlert";

/** An application-only host has no Webspring to return to: every recovery
 * offer drops "Return to Webspring" and gains a page reload. */
export function applicationRecoveryError(error: CapturedSynCloudOSError): CapturedSynCloudOSError {
  return { ...error, suggestedActions: [...new Set([
    ...(error.suggestedActions ?? ["dismiss" as const]).filter(action => action !== "returnToWebspring"), "reload" as const,
  ])] };
}

const selectAppInfo = (snapshot: RuntimeSnapshot) => snapshot.appInfo;
const selectActiveAppId = (snapshot: RuntimeSnapshot) => snapshot.application.activeAppId;
const selectRoutePath = (snapshot: RuntimeSnapshot) => snapshot.application.routePath;
const selectStatechart = (snapshot: RuntimeSnapshot) => snapshot.statechart;
const selectLoginServices = (snapshot: RuntimeSnapshot) => snapshot.loginServices;
const selectLatestError = (snapshot: RuntimeSnapshot) => snapshot.errors.at(-1) ?? null;

/** Commands the application host adds for its primary's application menu. */
export const applicationHostCommands = Object.freeze({
  /** Presents the login window; registered only when the host has authentication. */
  signIn: "session.requestSignIn",
  /** Quits the primary application; the page then offers Reopen. */
  quit: "application.quit",
});

const noPayload: CommandPayloadSchema<undefined> = {
  description: "No payload.",
  parse: (value) => value === undefined
    ? { ok: true, value: undefined }
    : { ok: false, issues: ["This command does not accept a payload."] },
};

export interface ApplicationHostProps {
  readonly applicationId: string;
  readonly authentication: AuthenticationInput;
  readonly home: ApplicationHostHome;
}

/** Production presentation owner for an application-only browser mount.
 * Launch is owned by browser boot, routes and the host's home, never a render
 * effect: closing or suspending the application must not silently launch
 * another generation. The primary application fills the page; every other
 * registered application presents in windows over it. A page-filling primary
 * has no system top bar, so it opens its application menu (About, Preferences,
 * Sign In or Log Out, Quit) from its own content through
 * `useApplicationMenuTrigger()`, after declaring
 * `applicationMenu: { trigger: "content" }`. */
export function ApplicationHost({ applicationId, authentication, home }: ApplicationHostProps) {
  const runtime = useKernelSynCloudOS();
  const appInfo = useRuntimeSelector(selectAppInfo);
  const state = useRuntimeSelector(useCallback((snapshot: RuntimeSnapshot) => snapshot.lifecycle[normalizeBundleIdentifier(applicationId)], [applicationId]));
  const activeAppId = useRuntimeSelector(selectActiveAppId);
  const routePath = useRuntimeSelector(selectRoutePath);
  const statechart = useRuntimeSelector(selectStatechart);
  const loginServices = useRuntimeSelector(selectLoginServices);
  const latest = useRuntimeSelector(selectLatestError);
  const appearance = useResolvedMode();
  const branding = useHostSiteBranding();
  const locale = useWebspringLocale();
  const app = appInfo[normalizeBundleIdentifier(applicationId)];
  const appName = app ? locale.appName(app) : applicationId;
  // A primary declared as windowed (frame: "declared") presents in its window.
  const fillsPage = app?.presentation === "appView";
  const presented = normalizeBundleIdentifier(activeAppId) === normalizeBundleIdentifier(applicationId) && state === "active";
  const behindAnotherApplication = state === "suspended" && activeAppId !== null && normalizeBundleIdentifier(activeAppId) !== normalizeBundleIdentifier(applicationId);
  const mounted = fillsPage && (state === "active" || state === "suspended");
  const responderId = `application:${applicationId}`;
  const [renderers] = useState(() => new WindowContentRendererRegistry());
  const [applicationRenderers] = useState<ApplicationWindowRendererRegistrations>(() => new Map());
  useLayoutEffect(() => {
    syncApplicationWindowContentRenderers(renderers, runtime, appInfo, applicationRenderers);
  }, [appInfo, applicationRenderers, renderers, runtime]);
  useNSEDeferredDisposal(renderers);
  const overlayPort = useRuntimeNSEOverlayPort(responderId);
  const bridge = useMemo(() => createTransientWindowSurfaceBridge({
    runtime, renderers, physicalHostId: `application-host:${applicationId}`,
    owner: { workspaceId: "workspace:default", applicationId, applicationSessionId: applicationId },
    restoreFocus: anchor => overlayPort.restoreFocus(responderId, anchor),
  }), [applicationId, overlayPort, renderers, responderId, runtime]);
  useNSEDeferredDisposal(bridge);
  const root = useRef<HTMLElement>(null);
  const undoOwner = useMemo(() => ({ kind: "application" as const, id: applicationId }), [applicationId]);
  useLayoutEffect(() => {
    if (!presented) return;
    activateResponderHierarchy(runtime, { responderId, applicationResponderId: responderId });
    const element = root.current;
    const active = element?.ownerDocument.activeElement;
    if (element && (!active || active === element.ownerDocument.body)) element.focus({ preventScroll: true });
    return () => clearOwnedResponderAnchor(runtime, "application", responderId);
  }, [presented, responderId, runtime]);
  const authenticationPolicy = typeof authentication === "object" ? authentication.policy : authentication;
  const signedIn = loginServices.isAuthorised;
  const account = useMemo<SystemUIAccount | undefined>(() => authenticationPolicy === "disabled" ? undefined : {
    signedIn,
    name: loginServices.displayName ?? loginServices.synId,
    onSignIn: () => { void home.requestSignIn(); },
  }, [authenticationPolicy, home, loginServices.displayName, loginServices.synId, signedIn]);
  useEffect(() => {
    const registrations: CommandRegistration[] = [runtime.commands.register({
      id: applicationHostCommands.quit, responderId: "runtime", title: { key: "command.application.quit", fallback: "Quit" },
      payload: noPayload, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" },
      validate: () => ({ enabled: runtime.lifecycle.getState(applicationId) === "active", disabledReason: "The application is not running." }),
      execute: () => { void runtime.lifecycle.close(applicationId, { reason: "application-menu-quit" }).result.catch(() => undefined); },
    })];
    if (authenticationPolicy !== "disabled") registrations.push(runtime.commands.register({
      id: applicationHostCommands.signIn, responderId: "runtime", title: { key: "command.session.requestSignIn", fallback: "Sign In" },
      payload: noPayload, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" },
      validate: () => ({ enabled: !runtime.store.getSnapshot().loginServices.isAuthorised, disabledReason: "You are already signed in." }),
      execute: () => home.requestSignIn(),
    }));
    return () => { for (const registration of registrations.reverse()) registration.dispose(); };
  }, [applicationId, authenticationPolicy, home, runtime]);
  const contentMenu = fillsPage && app?.applicationMenu?.trigger === "content";
  const [menuStore] = useState(createApplicationMenuStore);
  useEffect(() => { if (!presented) menuStore.setOpen(false); }, [menuStore, presented]);
  const menuLabels = useMemo(() => applicationMenuLabels(appName, locale.t), [appName, locale]);
  const appPreferences = app?.applicationMenu?.preferences;
  const declaresAbout = applicationDeclaresAbout(app?.about);
  const menuModel = useMemo(() => createWebspringAppMenuModel({
    appId: applicationId,
    labels: menuLabels,
    appPreferences: appPreferences ? {
      commandId: appPreferences.commandId,
      label: appPreferences.label ?? locale.t("appMenu.appPreferences", "{app} Preferences…", { app: appName }),
    } : undefined,
    includeAbout: declaresAbout,
    includeLogOut: authenticationPolicy !== "disabled" && signedIn,
    extensions: [
      ...(authenticationPolicy !== "disabled" && !signedIn ? [{ id: "session", entries: [
        { kind: "separator" as const, id: "sign-in-divider" },
        { kind: "command" as const, id: "sign-in", commandId: applicationHostCommands.signIn, labelOverride: locale.t("appMenu.signIn", "Sign In") },
      ] }] : []),
      { id: "quit", weight: 1, entries: [
        { kind: "separator" as const, id: "quit-divider" },
        { kind: "command" as const, id: "quit", commandId: applicationHostCommands.quit, labelOverride: locale.t("appMenu.quit", "Quit {app}", { app: appName }) },
      ] },
    ],
  }), [appName, appPreferences, applicationId, authenticationPolicy, declaresAbout, locale, menuLabels, signedIn]);
  const menuPort = useRuntimeNSEMenuPort();
  const menuController = useMemo(() => new NSEMenuController({ model: menuModel, runtime: menuPort }), [menuModel, menuPort]);
  useNSEDeferredDisposal(menuController);
  const logOut = useCallback(async () => {
    const result = await runtime.commands.dispatch("session.logOut", undefined, { source: "system" });
    return result.status === "executed";
  }, [runtime]);
  const gateSnapshot = useMemo(() => ({ statechart, loginServices, application: { routePath } }), [loginServices, routePath, statechart]);
  const error = latest ? applicationRecoveryError(latest) : null;
  const browserWindow = runtime.environment.browser.getWindow();
  const entry = app ? <SynWareEntryRenderer runtime={runtime} app={app} responderId={responderId} isLoading={false}
    loadingClassName="syncloudos-application-loading"
    loadingLabel={locale.t("apps.loading", "Loading {app}", { app: appName })}
    loadingPackageLabel={locale.t("apps.loadingPackage", "Loading {packageName}", { packageName: app.packageName })}
    missingComponentLabel={locale.t("apps.missingComponent", "SynCloudOS could not find a component for {packageName}.", { packageName: app.packageName })} /> : null;
  return <>
    {mounted ? <ResponderScope asChild responderId={responderId} kind="application" parentResponderId="workspace"
      scopeId={responderId} undoOwner={undoOwner} diagnosticsLabel={app.displayName}>
      <section ref={root} data-syncloudos-application-host={applicationId} tabIndex={-1}
        // Behind another application's windows the primary stays in view, at rest.
        hidden={!presented && !behindAnotherApplication} inert={!presented ? true : undefined}
        aria-hidden={behindAnotherApplication ? true : undefined} aria-label={appName}
        style={{ position: "fixed", inset: 0, overflow: "hidden", margin: 0 }}>
        <SynCloudOSWatchdog runtime={runtime} watchdogName={`${app.packageName} application`} scope="app" app={app}
          resetKey={applicationId} fallback={() => null}>
          <NSEOverlayProvider runtimePort={overlayPort} defaultParentResponderId={responderId}>
          <NSEWindowSurfaceBridgeProvider bridge={bridge}>
          {contentMenu ? <ApplicationMenuOverlayHost menuStore={menuStore} model={menuModel} controller={menuController}
            overlay={{ id: `application-host:app-menu-overlay:${applicationId}`, parentResponderId: responderId, placement: "block-end-inline-end" }}
            anchorTitle={appName} /> : null}
          {contentMenu ? <ApplicationMenuTriggerBridge menuStore={menuStore} label={appName}>
            {entry}
          </ApplicationMenuTriggerBridge> : entry}
          </NSEWindowSurfaceBridgeProvider>
          </NSEOverlayProvider>
        </SynCloudOSWatchdog>
      </section>
    </ResponderScope> : null}
    {app && state === "closed" ? <ApplicationQuitSurface iconSrc={app.icon.src} name={appName}
      reopenLabel={locale.t("apps.reopen", "Reopen")} onReopen={() => { void home.open().result.catch(() => undefined); }} /> : null}
    <SystemPanelsLayer windowContentRegistry={renderers} />
    <WindowLayer contentRegistry={renderers} />
    <SystemUILayer siteName={appName} onLogOut={authenticationPolicy === "disabled" ? undefined : logOut} account={account} />
    <HostLoginGate
      runtime={runtime}
      snapshot={gateSnapshot}
      title={`Sign in to ${branding?.name ?? appName}`}
      branding={branding ?? undefined}
      authentication={authentication}
    />
    <SCOSAlertPresenter center={runtime.alerts} appearance={appearance} />
    {error ? <FocusScope asChild key={error.id} scopeId={`application-host-error:${error.id}`} kind="modal" parentResponderId="runtime" trapFocus>
      <NSEAlertBackdrop onSafeDismiss={error.recoverable === false ? undefined : () => runtime.errors.dismiss(error.id)}>
        <SystemAlert error={error} appearance={appearance} applicationIcon={app?.icon.src ?? null}
          onDismiss={() => runtime.errors.dismiss(error.id)} onReload={() => browserWindow?.location.reload()}
          onReturn={() => browserWindow?.location.reload()}
          onOpenMailClient={destination => browserWindow?.location.assign(destination)} />
      </NSEAlertBackdrop>
    </FocusScope> : null}
  </>;
}

/** What the page shows after the primary quits. The host never relaunches on
 * its own; the person chooses to reopen, which starts a new session. */
function ApplicationQuitSurface({ iconSrc, name, reopenLabel, onReopen }: {
  readonly iconSrc: string;
  readonly name: string;
  readonly reopenLabel: string;
  readonly onReopen: () => void;
}) {
  const titleId = useId();
  const surface = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const document = surface.current?.ownerDocument;
    const active = document?.activeElement;
    if (!active || active === document.body) surface.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, []);
  return <main ref={surface} className="syncloudos-application-quit" aria-labelledby={titleId}>
    <img className="syncloudos-application-quit-icon" src={iconSrc} alt="" aria-hidden="true" />
    <h1 id={titleId} className="syncloudos-application-quit-name">{name}</h1>
    <NSEPushButton onClick={onReopen}>{reopenLabel}</NSEPushButton>
  </main>;
}

/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertBackdrop } from "../NSE/SystemUI";
import { SCOSAlertPresenter } from "./SCOSAlertPresenter";
import { useNSEDeferredDisposal } from "../NSE/NSE";
import { NSEButton } from "@syndromatic/syncloudos/nse/controls";
import { SystemUILayer } from "../Webspring/SystemUILayer";
import type { SystemUIAccount } from "../Webspring/Preferences/systemAccount";
import { SystemPanelsLayer } from "../Webspring/SystemPanelsLayer";
import { HostLoginGate } from "../Webspring/HostLoginGate";
import { useWebspringLocale } from "../Webspring/webspringLocale";
import { syncApplicationWindowContentRenderers, WindowContentRendererRegistry, WindowLayer, type ApplicationWindowRendererRegistrations } from "../Webspring/WindowLayer";
import type { CapturedSynCloudOSError } from "../SynCloudOS/ErrorManager/errorTypes";
import type { CommandPayloadSchema, CommandRegistration } from "../SynCloudOS/Commands/commandTypes";
import type { AuthenticationInput } from "../SynCloudOS/Authentication/authenticationTypes";
import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import type { RuntimeSnapshot } from "../SynCloudOS/Runtime/runtimeTypes";
import type { ApplicationHostHome } from "./applicationHome";
import { FocusScope } from "./FocusScope";
import { useKernelSynCloudOS } from "./runtimeContext";
import { useRuntimeSelector } from "./runtimeHooks";
import { useResolvedMode } from "./serviceHooks";
import { useHostSiteBranding } from "./siteBrandingContext";
import { SystemAlert } from "./SystemAlert";
import { ApplicationStageHost } from "../Webspring/ApplicationStageHost";
import { WindowPresentationContent } from "../Webspring/WindowPresentationContent";

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

/** Application-only shell using the shared stage, without Webspring return. */
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
  const fillsPage = app?.presentation === "stage";
  const presented = normalizeBundleIdentifier(activeAppId) === normalizeBundleIdentifier(applicationId) && state === "active";
  const behindAnotherApplication = state === "suspended" && activeAppId !== null && normalizeBundleIdentifier(activeAppId) !== normalizeBundleIdentifier(applicationId);
  const mounted = fillsPage && (state === "active" || state === "suspended");
  const [renderers] = useState(() => new WindowContentRendererRegistry());
  const [applicationRenderers] = useState<ApplicationWindowRendererRegistrations>(() => new Map());
  useLayoutEffect(() => {
    syncApplicationWindowContentRenderers(renderers, runtime, appInfo, applicationRenderers);
  }, [appInfo, applicationRenderers, renderers, runtime]);
  useNSEDeferredDisposal(renderers);
  const authenticationPolicy = typeof authentication === "object" ? authentication.policy : authentication;
  const signedIn = loginServices.isAuthorised;
  const account = useMemo<SystemUIAccount | undefined>(() => authenticationPolicy === "disabled" ? undefined : {
    signedIn,
    name: loginServices.displayName ?? loginServices.synId,
    onSignIn: () => { void home.requestSignIn(); },
  }, [authenticationPolicy, home, loginServices.displayName, loginServices.synId, signedIn]);
  useEffect(() => {
    const registrations: CommandRegistration[] = [];
    if (authenticationPolicy !== "disabled") registrations.push(runtime.commands.register({
      id: applicationHostCommands.signIn, responderId: "runtime", title: { key: "command.session.requestSignIn", fallback: "Sign In" },
      payload: noPayload, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" },
      validate: () => ({ enabled: !runtime.store.getSnapshot().loginServices.isAuthorised, disabledReason: "You are already signed in." }),
      execute: () => home.requestSignIn(),
    }));
    return () => { for (const registration of registrations.reverse()) registration.dispose(); };
  }, [applicationId, authenticationPolicy, home, runtime]);
  const logOut = useCallback(async () => {
    const result = await runtime.commands.dispatch("session.logOut", undefined, { source: "system" });
    return result.status === "executed";
  }, [runtime]);
  const gateSnapshot = useMemo(() => ({ statechart, loginServices, application: { routePath } }), [loginServices, routePath, statechart]);
  const error = latest ? applicationRecoveryError(latest) : null;
  const browserWindow = runtime.environment.browser.getWindow();
  const windowSnapshot = useSyncExternalStore(runtime.windows.subscribe, runtime.windows.snapshot, runtime.windows.snapshot);
  const mainWindow = useMemo(() => runtime.windows.list({ applicationId }).find(({ record }) =>
    record.role === "standard" && record.documentId === null && record.state === "open"),
    [applicationId, runtime, windowSnapshot]);
  const inStage = mainWindow && (mainWindow.record.fullScreen === "on" || mainWindow.record.fullScreen === "exiting");
  return <>
    <WindowPresentationContent>
      {mounted && inStage && app ? <section data-syncloudos-application-host={applicationId}
        hidden={!presented && !behindAnotherApplication} inert={!presented ? true : undefined}
        aria-hidden={behindAnotherApplication ? true : undefined} aria-label={appName}
        className="webspring-apps-container" style={{ position: "fixed", inset: 0, margin: 0 }}>
        <ApplicationStageHost windowContentRegistry={renderers} app={app} lifecycle={state ?? "registered"} standalone
          stage={{ id: mainWindow.id, windowId: mainWindow.id, appId: applicationId,
            title: mainWindow.record.title, isFocused: presented, zIndex: 1 }} />
      </section> : null}
      <SystemPanelsLayer windowContentRegistry={renderers} />
      <WindowLayer contentRegistry={renderers} />
    </WindowPresentationContent>
    {app && state === "closed" ? <ApplicationQuitSurface iconSrc={app.icon.src} name={appName}
      reopenLabel={locale.t("apps.reopen", "Reopen")} onReopen={() => { void home.open().result.catch(() => undefined); }} /> : null}
    <SystemUILayer siteName={appName} onLogOut={authenticationPolicy === "disabled" ? undefined : logOut} account={account} />
    <HostLoginGate
      runtime={runtime}
      snapshot={gateSnapshot}
      title={`Sign in to ${branding?.name ?? appName}`}
      branding={branding ?? undefined}
      authentication={authentication}
    />
    <SCOSAlertPresenter center={runtime.alerts} presentation={runtime.presentationTraits} appearance={appearance} />
    {error ? <FocusScope asChild key={error.id} scopeId={`application-host-error:${error.id}`} kind="modal" parentResponderId="runtime" trapFocus>
      <AlertBackdrop presentation={runtime.presentationTraits} onSafeDismiss={error.recoverable === false ? undefined : () => runtime.errors.dismiss(error.id)}>
        <SystemAlert error={error} appearance={appearance} applicationIcon={app?.icon.src ?? null}
          onDismiss={() => runtime.errors.dismiss(error.id)} onReload={() => browserWindow?.location.reload()}
          onReturn={() => browserWindow?.location.reload()}
          onOpenMailClient={destination => browserWindow?.location.assign(destination)} />
      </AlertBackdrop>
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
    <NSEButton title={reopenLabel} onClick={onReopen} />
  </main>;
}

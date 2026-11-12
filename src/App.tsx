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

import { getSynWareNamespace } from "./SynCloudOS/AppSDK/useStrings";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ComponentType } from "react";
import { WebspringHost } from "./Webspring/WebspringHost";
import type { SynCloudOSShellResources } from "./Webspring/WebspringController";
import type { AuthenticationInput, WebspringDefinition } from "./Webspring/webspringTypes";
import { WindowContentRendererRegistry, WindowLayer, syncApplicationWindowContentRenderers, type ApplicationWindowRendererRegistrations } from "./Webspring/WindowLayer";
import { systemStartupPhaseMachine, type SystemStartupPhase } from "./SynCloudOS/RootRuntime/startupPhaseMachine";
import { nextState } from "./Foundation/internal/StateMachine";
import { useRuntimeSelector, useKernelSynCloudOS } from "./SynCloudOSReact";
import { SystemUILayer } from "./Webspring/SystemUILayer";

/** The development-only test host's props, declared structurally so the
 * test harness never becomes part of the published declarations. */
interface DevelopmentTestHostProps {
  readonly pathname: string;
  readonly windowRendererRegistration?: { readonly register: WindowContentRendererRegistry["register"] };
}

function selectRuntimePresentationReady(snapshot: import("./SynCloudOS/Runtime/runtimeTypes").RuntimeSnapshot) {
  return snapshot.booted || snapshot.statechart.currentState !== "booting";
}

export function App({ shell, shellResources, authentication }: {
  readonly shell: WebspringDefinition;
  readonly shellResources?: SynCloudOSShellResources;
  readonly authentication?: AuthenticationInput;
}) {
  const runtime = useKernelSynCloudOS();
  const frameworkWindowRenderers = useMemo(() => new WindowContentRendererRegistry(), []);
  const frameworkApplicationRenderers = useMemo<ApplicationWindowRendererRegistrations>(() => new Map(), []);
  const apps = useRuntimeSelector(snapshot => snapshot.appInfo);
  const frameworkWindowRendererRegistration = useMemo(() => ({
    register: frameworkWindowRenderers.register.bind(frameworkWindowRenderers),
  }), [frameworkWindowRenderers]);
  const frameworkTestPath = import.meta.env.DEV
    ? runtime.environment.browser.getLocation().pathname
    : null;
  const [FrameworkTestHost, setFrameworkTestHost] = useState<ComponentType<DevelopmentTestHostProps> | null>(null);
  useLayoutEffect(() => {
    if (!frameworkTestPath?.startsWith("/__framework-tests/")) return;
    syncApplicationWindowContentRenderers(frameworkWindowRenderers, runtime, apps, frameworkApplicationRenderers);
  }, [apps, frameworkApplicationRenderers, frameworkTestPath, frameworkWindowRenderers, runtime]);
  const presentationReady = useRuntimeSelector(selectRuntimePresentationReady);
  const localeVersion = useRuntimeSelector((snapshot) => snapshot.localeServices.dictionaryVersion);
  const siteNameKey = shell.manifest.webspringShell.branding.name.key;
  const siteName = useMemo(() => {
    const translated = runtime.locale.t(siteNameKey, undefined, getSynWareNamespace(shell.manifest.bundleIdentifier));
    return translated === siteNameKey ? shell.manifest.webspringShell.branding.name.fallback ?? siteNameKey : translated;
  }, [localeVersion, runtime, shell, siteNameKey]);
  const [startupPhase, setStartupPhase] = useState<SystemStartupPhase>("booting");

  useEffect(() => {
    setStartupPhase(phase => nextState(systemStartupPhaseMachine.definition, phase, presentationReady ? "presentationReady" : "presentationPending") ?? phase);
  }, [presentationReady]);

  useEffect(() => {
    if (!frameworkTestPath?.startsWith("/__framework-tests/")) return;
    let active = true;
    void import("./FrameworkTests/FrameworkTestHost").then(({ FrameworkTestHost }) => {
      if (active) setFrameworkTestHost(() => FrameworkTestHost);
    });
    return () => { active = false; };
  }, [frameworkTestPath]);

  const handleLogOut = useCallback(async () => {
    const result = await runtime.commands.dispatch("session.logOut", undefined, { source: "system" });
    if (result.status === "failed" || result.status === "cancelled") {
      return false;
    }
    return result.status === "executed";
  }, [runtime]);
  const authenticationPolicy = (typeof authentication === "object" ? authentication.policy : authentication) ?? "disabled";

  if (frameworkTestPath?.startsWith("/__framework-tests/") && FrameworkTestHost) {
    const windowManagement = frameworkTestPath.startsWith("/__framework-tests/windows/management");
    const usesWindows = windowManagement || frameworkTestPath.startsWith("/__framework-tests/navigation/adaptive");
    return (
      <>
        <FrameworkTestHost
          pathname={frameworkTestPath}
          windowRendererRegistration={windowManagement ? frameworkWindowRendererRegistration : undefined}
        />
        {usesWindows ? <WindowLayer contentRegistry={frameworkWindowRenderers} /> : null}
      </>
    );
  }

  return (
    <>
      <WebspringHost shell={shell} shellResources={shellResources} authentication={authentication} startupPhase={startupPhase} />
      <SystemUILayer onLogOut={authenticationPolicy === "disabled" ? undefined : handleLogOut} preferences={shell.preferences} siteName={siteName} />
    </>
  );
}

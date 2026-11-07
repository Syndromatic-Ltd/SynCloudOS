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

import { useEffect, useState, type ComponentType, type PropsWithChildren, type ReactNode } from "react";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeSnapshot } from "../Runtime/runtimeTypes";
import type { ResolvedSiteBranding } from "../Branding/siteBranding";
import type { AuthenticationInput, AuthenticationViewProps } from "../Authentication/authenticationTypes";

// The concrete LoginWindow, backdrop and presence are supplied by Webspring;
// the historical ownership seam was `from "../../NSE/SystemUI"`.

export type LoginWindowBoundaryProps = AuthenticationViewProps;

type LoginGateSnapshot = {
  statechart: Pick<RuntimeSnapshot["statechart"], "currentState">;
  loginServices: Pick<RuntimeSnapshot["loginServices"], "configuration">;
  application: Pick<RuntimeSnapshot["application"], "routePath">;
};

export interface LoginGatePresenterProps {
  runtime: Pick<SynCloudOSRuntime, "login" | "statechart">;
  snapshot: LoginGateSnapshot;
  LoginWindowComponent: ComponentType<LoginWindowBoundaryProps>;
  ModalFocusScopeComponent: ComponentType<PropsWithChildren>;
  /** Dims the shell behind the window. */
  BackdropComponent: ComponentType;
  /** Keeps the gate mounted while its views present their exits, then
   * reports `onExitComplete` (AnimatePresence semantics). */
  PresenceComponent: ComponentType<{ children: ReactNode; onExitComplete?: () => void }>;
  title?: string;
  branding?: ResolvedSiteBranding;
  cancelLabel?: string;
  authentication?: AuthenticationInput;
  ready?: boolean;
  onExitComplete?: () => void;
  restoring?: boolean;
  onSignInPendingChange?: (pending: boolean) => void;
}

export function LoginGatePresenter({ runtime, snapshot, LoginWindowComponent, ModalFocusScopeComponent, BackdropComponent, PresenceComponent, title, branding, cancelLabel, authentication, ready = true, onExitComplete, restoring = false, onSignInPendingChange }: LoginGatePresenterProps) {
  const [cancelPhase, setCancelPhase] = useState<"idle" | "exiting" | "exited">("idle");
  const visible = cancelPhase === "idle" && ready && (restoring || snapshot.statechart.currentState === "locked.loginWindow") && authentication !== "disabled";
  const authenticationService = typeof authentication === "object" ? authentication.service : null;
  const authenticationSnapshot = authenticationService?.getSnapshot();
  const policy = typeof authentication === "object" ? authentication.policy : authentication;
  useEffect(() => {
    if (cancelPhase !== "exited") return;
    if (snapshot.statechart.currentState === "locked.loginWindow" && policy === "optional") {
      // Presence reports completion before React unmounts the retained modal.
      // Release the runtime only after that commit has restored sibling inertness.
      runtime.statechart.gotoState("active.webspring", { source: "authentication-cancel", closeWindows: false, syncRoute: false });
      return;
    }
    setCancelPhase("idle");
    // Shell entrance follows the updated state, not the closing gate's snapshot.
    onExitComplete?.();
  }, [cancelPhase, onExitComplete, policy, runtime, snapshot.statechart.currentState]);

  return (
    <PresenceComponent onExitComplete={() => {
      if (cancelPhase === "exiting") setCancelPhase("exited");
      else onExitComplete?.();
    }}>
      {visible ? (
        <div
          key="login-gate"
          className="syncloudos-login-gate"
        >
          <ModalFocusScopeComponent>
            <BackdropComponent />
            <LoginWindowComponent
              title={title}
              branding={branding}
              methods={authenticationService ? authenticationSnapshot?.methods ?? [] : undefined}
              authenticationStatus={authenticationSnapshot?.status}
              onCancel={policy === "optional" ? () => setCancelPhase("exiting") : undefined}
              onMethodSignIn={async (methodId) => {
                if (!authenticationService) return;
                onSignInPendingChange?.(true);
                try { await authenticationService.signIn(methodId, snapshot.application.routePath); }
                catch (error) { onSignInPendingChange?.(false); throw error; }
              }}
              cancelLabel={cancelLabel}
              configurationError={authenticationService ? authenticationSnapshot?.error : "Authentication is not configured."}
            />
          </ModalFocusScopeComponent>
        </div>
      ) : null}
    </PresenceComponent>
  );
}

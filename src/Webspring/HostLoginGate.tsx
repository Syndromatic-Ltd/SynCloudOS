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

import { useRef, useSyncExternalStore, type PropsWithChildren } from "react";
import { NSEPresence, useNSEPresentation } from "../NSE/Animation";
import { LoginWindow } from "../NSE/SystemUI";
import { LoginGatePresenter, type LoginGatePresenterProps } from "../SynCloudOS/RootRuntime";
import { createLocaleServicesFacade } from "../SynCloudOS/SynCloudOS";
import { FocusScope, useKernelSynCloudOS, useLocaleServicesSnapshot } from "../SynCloudOSReact";
import { systemT } from "./systemStrings";
import { useWebspringMotion } from "./Webspring.transitions";

function LoginModalFocusScope({ children }: PropsWithChildren) {
  return <FocusScope scopeId="system-ui:login" kind="modal" parentResponderId="runtime" modal trapFocus>{children}</FocusScope>;
}

/** Dims the page behind the login window, presented through AnimationFX. */
function LoginBackdrop() {
  const backdropRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(backdropRef, useWebspringMotion().loginBackdropDim);
  return <div ref={backdropRef} className="syncloudos-login-backdrop" aria-hidden="true" />;
}

const subscribeNothing = () => () => undefined;
const readNothing = () => null;

export type HostLoginGateProps = Omit<LoginGatePresenterProps,
  "LoginWindowComponent" | "ModalFocusScopeComponent" | "BackdropComponent" | "PresenceComponent" | "cancelLabel">;

/** The system login window as every browser host presents it: the host's own
 * login component when its authentication service supplies one. */
export function HostLoginGate(props: HostLoginGateProps) {
  const { authentication } = props;
  const service = typeof authentication === "object" ? authentication.service : null;
  // The window lists the service's methods and status; follow its changes.
  useSyncExternalStore(service?.subscribe ?? subscribeNothing, service?.getSnapshot ?? readNothing, service?.getSnapshot ?? readNothing);
  useLocaleServicesSnapshot();
  const kernel = useKernelSynCloudOS();
  return <LoginGatePresenter
    {...props}
    cancelLabel={systemT("common.cancel", "Cancel", undefined, createLocaleServicesFacade(kernel))}
    LoginWindowComponent={typeof authentication === "object" && authentication.loginComponent ? authentication.loginComponent : LoginWindow}
    ModalFocusScopeComponent={LoginModalFocusScope}
    BackdropComponent={LoginBackdrop}
    PresenceComponent={NSEPresence}
  />;
}

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

// @vitest-environment jsdom
import React, { useRef, type PropsWithChildren } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  NSEAnimationEnvironmentProvider,
  NSEPresence,
  useNSEPresentation,
  type NSEAnimator,
} from "../../src/NSE/Animation";
import { LoginWindow } from "../../src/NSE/SystemUI/LoginWindow";
import { LoginGatePresenter, type LoginGatePresenterProps } from "../../src/SynCloudOS/RootRuntime";
import { resolveWebspringMotion } from "../../src/Webspring/Webspring.transitions";
import type { AFXAnimationDefinition, AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";

afterEach(cleanup);

function controlledAnimator() {
  const played: Array<{ target: Element; definition: AFXAnimationDefinition; settle(): Promise<void> }> = [];
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(target, definition) {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
        played.push({
          target: target as Element, definition: definition as AFXAnimationDefinition,
          async settle() { resolve({ state: "completed", reduced: false }); await act(async () => { await finished; }); },
        });
        return { id: "a", finished, progress: 0, state: "running", cancel: () => resolve({ state: "cancelled", reduced: false }),
          seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"],
  };
  return { animator, played };
}

function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, resolveWebspringMotion(false).loginBackdropDim);
  return <div ref={ref} className="syncloudos-login-backdrop" aria-hidden="true" />;
}

const PlainScope = ({ children }: PropsWithChildren) => <>{children}</>;

it("keeps the gate until the backdrop, window and placard exits settle, then reports the exit once", async () => {
  const { animator, played } = controlledAnimator();
  const onExitComplete = vi.fn();
  const gate = (locked: boolean) => {
    const props: LoginGatePresenterProps = {
      runtime: { login: {}, statechart: { gotoState: vi.fn() } } as unknown as LoginGatePresenterProps["runtime"],
      snapshot: {
        statechart: { currentState: locked ? "locked.loginWindow" : "active.webspring" },
        loginServices: { configuration: {} },
        application: { routePath: "/" },
      } as unknown as LoginGatePresenterProps["snapshot"],
      LoginWindowComponent: LoginWindow,
      ModalFocusScopeComponent: PlainScope,
      BackdropComponent: Backdrop,
      PresenceComponent: NSEPresence,
      authentication: "required" as LoginGatePresenterProps["authentication"],
      onExitComplete,
    };
    return <NSEAnimationEnvironmentProvider animator={animator}><LoginGatePresenter {...props} /></NSEAnimationEnvironmentProvider>;
  };
  const rendered = render(gate(true));
  const backdropEnter = played.find(({ target }) => target.classList.contains("syncloudos-login-backdrop"))!;
  expect(backdropEnter.definition).toMatchObject({ delay: 0.35, duration: 0.55, fill: "backwards" });

  rendered.rerender(gate(false));
  const exits = played.filter(({ definition }) => definition.fill === "forwards");
  expect(exits.map(({ target }) => target.className.split(" ")[0]).sort())
    .toEqual(["nse-login-window", "nse-login-window-swing-stage", "syncloudos-login-backdrop"]);
  for (const exit of exits.slice(0, -1)) await exit.settle();
  expect(rendered.container.querySelector(".syncloudos-login-gate")).not.toBeNull();
  expect(onExitComplete).not.toHaveBeenCalled();
  await exits.at(-1)!.settle();
  expect(rendered.container.querySelector(".syncloudos-login-gate")).toBeNull();
  expect(onExitComplete).toHaveBeenCalledTimes(1);
});

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

import { NSEThemeProvider } from "../../src/NSE/Appearance";
import { atmoTheme } from "../../src/NSE/Themes/Atmo/theme";


// @vitest-environment jsdom
import React from "react";
import { fireEvent, render as baseRender, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation";
import type { AFXAnimationDefinition } from "../../src/FX/AnimationFX/animationTypes";
import { LoginWindow } from "../../src/NSE/SystemUI/LoginWindow";
import { NSEFeedbackProvider } from "../../src/NSE/Feedback";
import { HFXHapticEngine } from "../../src/FX/HapticsFX/HFXHapticEngine";
import type { HFXFeedbackRequest } from "../../src/FX/HapticsFX/HFXHapticEvent";
function render(ui: React.ReactNode) { return baseRender(ui, { wrapper: ({ children }) => <NSEThemeProvider theme={atmoTheme}>{children}</NSEThemeProvider> }); }
/** Records each presentation by the class of the element it plays on. */
function recordingAnimator() {
  const played: Array<{ className: string; definition: AFXAnimationDefinition }> = [];
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(target, definition) {
        played.push({ className: (target as Element).className, definition: definition as AFXAnimationDefinition });
        return { id: "a", finished: new Promise(() => undefined), progress: 0, state: "running", cancel() {},
          seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"],
  };
  const of = (className: string) => played.filter((record) => record.className.split(" ").includes(className));
  return { animator, played, of };
}

describe("LoginWindow browser parity", () => {
  it("renders provider actions without browser credentials or artificial progression", () => {
    const signIn = vi.fn();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { container } = render(<LoginWindow title="Example Site" methods={[{ id: "google", label: "Continue with Google" }]} onMethodSignIn={signIn} />);
    expect(screen.getByRole("heading", { name: "Example Site" })).toBeTruthy();
    const button = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    expect(signIn).toHaveBeenCalledWith("google");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).not.toContain("Syn ID");
    focus.mockRestore();
  });

  it("prefers the compact placard mark over the full site lockup", () => {
    const branding = {
      name: "Example Site",
      logoUrl: "/site/full-lockup.png",
      logoAlt: "Example Site",
      lightLogoUrl: null,
      darkLogoUrl: null,
      compactLogoUrl: "/site/engraved-mark.png",
    };
    const { rerender } = render(<LoginWindow branding={branding} />);
    expect(screen.getByRole("img", { name: "Example Site" }).getAttribute("src")).toBe("/site/engraved-mark.png");
    rerender(<LoginWindow branding={{ ...branding, compactLogoUrl: null }} />);
    expect(screen.getByRole("img", { name: "Example Site" }).getAttribute("src")).toBe("/site/full-lockup.png");
  });
  it("plays the error pattern once per visible error, including a repeated failed attempt", () => {
    const played: HFXFeedbackRequest[] = [];
    const engine = new HFXHapticEngine({
      supported: true,
      trigger(request) { played.push(request); },
      cancel() {},
      dispose() {},
    });
    const present = (configurationError: string | null, error: string | null, title = "Sign in") => (
      <React.StrictMode><NSEFeedbackProvider value={engine}>
        <LoginWindow title={title} configurationError={configurationError} error={error} />
      </NSEFeedbackProvider></React.StrictMode>
    );
    const view = render(present("Authentication service unavailable.", null));
    expect(played).toEqual(["error"]);
    view.rerender(present("Authentication service unavailable.", "Invalid password.", "Updated title"));
    expect(played).toEqual(["error"]);
    view.rerender(present(null, "Invalid password."));
    expect(played).toEqual(["error", "error"]);
    view.rerender(present(null, null));
    view.rerender(present(null, "Invalid password."));
    expect(played).toEqual(["error", "error", "error"]);
    view.unmount();
    engine.dispose();
  });
  it("uses standard enter/error motion and switches both to reduced owner-local feedback", () => {
    const standard = recordingAnimator();
    const view = (reducedMotion: boolean, animator: NSEAnimator, error?: string) => (
      <NSEAnimationEnvironmentProvider reducedMotion={reducedMotion} animator={animator}>
        <LoginWindow error={error} methods={[{ id: "google", label: "Continue with Google" }]} />
      </NSEAnimationEnvironmentProvider>
    );
    const rendered = render(view(false, standard.animator));
    const [swing] = standard.of("nse-login-window-swing-stage");
    expect(swing!.definition).toMatchObject({ duration: 1.18, timing: "linear", fill: "backwards" });
    const transform = swing!.definition.animations.find(({ keyPath }) => keyPath === "transform")!;
    expect(transform.from).toBe("translate(0px, -10px) scale(0.992) rotate(-9deg)");
    expect(transform.to).toBe("none");
    // The damped swing: rotate reaches its first overshoot at a fifth of the way.
    expect(transform.keyframes![12]!.value).toMatch(/rotate\(6\.5deg\)$/);
    expect(standard.of("nse-login-window")[0]!.definition).toMatchObject({ duration: 0.16, timing: "ease-in-out" });
    expect(standard.of("nse-login-window-shake-stage")).toHaveLength(0);
    rendered.rerender(view(false, standard.animator, "Invalid password."));
    const [shake] = standard.of("nse-login-window-shake-stage");
    expect(shake!.definition).toMatchObject({ duration: 0.42, timing: "linear" });
    expect(shake!.definition.animations[0]!.keyframes!.map(({ value }) => value)).toContain("translate(-14px, 0px) scale(1)");
    // The same error does not shake again; a new one does.
    rendered.rerender(view(false, standard.animator, "Invalid password."));
    expect(standard.of("nse-login-window-shake-stage")).toHaveLength(1);
    rendered.rerender(view(false, standard.animator, "Account locked."));
    expect(standard.of("nse-login-window-shake-stage")).toHaveLength(2);
    rendered.unmount();

    const reduced = recordingAnimator();
    const reducedView = render(view(true, reduced.animator));
    const [reducedSwing] = reduced.of("nse-login-window-swing-stage");
    expect(reducedSwing!.definition).toMatchObject({ duration: 0.14, timing: "ease-in-out" });
    expect(reducedSwing!.definition.animations.map(({ keyPath }) => keyPath)).toEqual(["opacity"]);
    reducedView.rerender(view(true, reduced.animator, "Invalid password."));
    const [reducedShake] = reduced.of("nse-login-window-shake-stage");
    expect(reducedShake!.definition).toMatchObject({ duration: 0.16 });
    expect(reducedShake!.definition.animations.map(({ keyPath }) => keyPath)).toEqual(["opacity"]);
  });
});

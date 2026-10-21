// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineNSETheme, neutralNSETheme, NSEThemeProvider } from "../../src/NSE/Appearance";
import { LoginWindow } from "../../src/NSE/SystemUI/LoginWindow";
import { NSETopBar } from "../../src/NSE/Windows/Chrome/NSETopBar";
import { resolveLoginWindowTransitions } from "../../src/NSE/SystemUI/LoginWindow/LoginWindow.transitions";
import { resolveApplicationStageMotion } from "../../src/Webspring/ApplicationStage.transitions";
import { resolveNSEAlertMotion } from "../../src/NSE/Components/NSEAlert.transitions";
afterEach(cleanup);
const rail = defineNSETheme({ id: "test.arbitrary-rail", displayName: "Rail", presentation: { ...neutralNSETheme.presentation, chrome: "rail-aligned", login: "ornamented" } });
describe("theme-neutral shell semantics", () => {
  it("defaults to a functional plain login without theme artwork", () => {
    const signIn = vi.fn();
    const { container } = render(<LoginWindow methods={[{ id:"one",label:"Continue" }]} onMethodSignIn={signIn} />);
    expect(container.querySelector('[data-login-decoration]')).toBeNull();
    expect(screen.getByRole("dialog",{name:"Sign in"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(signIn).toHaveBeenCalledWith("one");
  });
  it("keeps login actions and pending state through arbitrary theme changes", () => {
    const methods = [{id:"one",label:"Continue"}];
    const ui = (theme:typeof rail,pending:boolean) => <NSEThemeProvider theme={theme}><LoginWindow methods={methods} loading={pending} error="Try again" /></NSEThemeProvider>;
    const view = render(ui(neutralNSETheme,false));
    const button = screen.getByRole("button",{name:"Continue"});
    view.rerender(ui(rail,true));
    expect(screen.getByRole("button",{name:"Continue"})).toBe(button);
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(view.container.querySelector('[data-login-decoration="logo"]')).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Try again");
  });
  it("uses distinct accessible IDs for simultaneous hosts", () => {
    render(<><LoginWindow title="First" /><LoginWindow title="Second" /></>);
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs[0].getAttribute("aria-labelledby")).not.toBe(dialogs[1].getAttribute("aria-labelledby"));
  });
  it("preserves a focused command when chrome anatomy changes", () => {
    const ui = (theme:typeof rail) => <NSEThemeProvider theme={theme}><NSETopBar title="Example" leadingItems={[{kind:"webspring",label:"Home"}]} /></NSEThemeProvider>;
    const view = render(ui(neutralNSETheme));
    screen.getByRole("button",{name:"Home"}).focus();
    view.rerender(ui(rail));
    expect(document.activeElement).toBe(screen.getByRole("button",{name:"Home"}));
  });
});
describe("intent-specific planar motion", () => {
  const slide = { kind:"slide" as const,durationMs:240,easing:"decelerate" as const };
  it("uses smooth planar login and alert entry, not swing or bounce", () => {
    for (const spec of [resolveLoginWindowTransitions(false,slide).enter.enter,resolveNSEAlertMotion(false,slide).enter]) {
      expect(spec.duration).toBe(.24);
      expect(JSON.stringify(spec)).not.toMatch(/rotate|scale/);
      expect(spec.timing).toMatchObject({kind:"cubic-bezier",x1:.1,y1:.9,x2:.2,y2:1});
    }
  });
  it("removes spatial motion under reduced motion", () => {
    expect(JSON.stringify(resolveLoginWindowTransitions(true,slide))).not.toContain("transform");
    expect(JSON.stringify(resolveNSEAlertMotion(true,slide))).not.toContain("transform");
  });
  it.each([null,"incoming","outgoing"] as const)("keeps %s stage motion planar and honors app-owned presentation", role => {
    const input = {reducedMotion:false,role,staged:false,launching:true,shellMotion:slide};
    const motion = resolveApplicationStageMotion(input);
    expect(JSON.stringify(motion)).not.toMatch(/rotate|scale\(0|"scale"|perspective/);
    const owned = resolveApplicationStageMotion({...input,presentationMotion:"content"});
    expect(owned.root.enter).toBeNull();
    expect(owned.surface.enter).toBeNull();
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createStandaloneNSEControlRuntime } from "../../../src/NSE/Overlays/createStandaloneNSEControlRuntime";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

const disposals: Array<() => void> = [];
afterEach(() => { cleanup(); disposals.splice(0).forEach(dispose => dispose()); });
function runtime() {
  const local = createStandaloneNSEControlRuntime({ document, window,
    presentation: createStaticPresentationPort({ width: 1024, height: 768 }) });
  local.start(); disposals.push(() => local.dispose()); return local;
}

describe("standalone focus scope lifetime", () => {
  it("skips a disabled opener and restores an available responder fallback", () => {
    const local = runtime();
    const fallback = document.createElement("button"); fallback.dataset.nseResponderId = "owner";
    const opener = document.createElement("button"); document.body.append(fallback, opener);
    fallback.focus(); opener.focus(); opener.disabled = true;
    local.runtime.restoreFocus("owner", opener);
    expect(document.activeElement).toBe(fallback);
    fallback.remove(); opener.remove();
  });
  it("retains its lease across equal inline options without stealing external focus", () => {
    const local = runtime();
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const fixture = (revision: number) => <>{local.focusPort.wrapFocusScope({ scopeId: "stable", kind: "popover", restoreFocus: true }, <button>Inside</button>)}<button>Outside {revision}</button></>;
    const view = render(fixture(1));
    const outside = screen.getByRole("button", { name: "Outside 1" }); outside.focus();
    view.rerender(fixture(2));
    expect(document.activeElement).toBe(outside);
    view.unmount(); expect(document.activeElement).not.toBe(trigger);
    trigger.remove();
  });
  it.each(["inert", "hidden", "aria-hidden"])("never restores focus into a closing %s ancestor", attribute => {
    const local = runtime();
    const holder = document.createElement("div"), previous = document.createElement("button");
    holder.append(previous); document.body.append(holder); previous.focus();
    const view = render(<>{local.focusPort.wrapFocusScope({ scopeId: "closing", kind: "popover" }, <button>Current</button>)}</>);
    screen.getByRole("button", { name: "Current" }).focus();
    holder.setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
    view.unmount(); expect(document.activeElement).not.toBe(previous);
    local.runtime.restoreFocus("missing", previous); expect(document.activeElement).not.toBe(previous);
    holder.remove();
  });
  it("restores stranded scope focus to a still-available trigger", () => {
    const local = runtime();
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const view = render(<>{local.focusPort.wrapFocusScope({ scopeId: "return", kind: "popover" }, <button>Current</button>)}</>);
    screen.getByRole("button", { name: "Current" }).focus();
    view.unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
  });
});

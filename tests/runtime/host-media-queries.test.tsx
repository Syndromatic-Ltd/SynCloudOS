// @vitest-environment jsdom
import React from "react";
import { act, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController, type NSETraitCollection } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import { createDeterministicRuntimeEnvironment } from "../../src/SynCloudOS/AppSDK/testing/fakeAdapters";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const hosts: SynWareTestHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

it("updates live and later media-query matches, notifying only changed queries and live listeners", () => {
  const host = createDeterministicRuntimeEnvironment();
  try {
    host.mediaQueries.setMatches(reducedMotionQuery, true);
    const first = host.environment.matchMedia(reducedMotionQuery);
    const second = host.environment.matchMedia(reducedMotionQuery);
    const other = host.environment.matchMedia("(prefers-contrast: more)");
    expect(first.matches).toBe(true);
    expect(second.matches).toBe(true);
    expect(other.matches).toBe(false);
    const firstChanged = vi.fn();
    const secondChanged = vi.fn();
    const otherChanged = vi.fn();
    const remove = first.subscribe(firstChanged);
    second.subscribe(secondChanged);
    other.subscribe(otherChanged);
    host.mediaQueries.setMatches(reducedMotionQuery, false);
    expect(first.matches).toBe(false);
    expect(second.matches).toBe(false);
    expect(firstChanged).toHaveBeenCalledExactlyOnceWith(false);
    expect(secondChanged).toHaveBeenCalledExactlyOnceWith(false);
    expect(otherChanged).not.toHaveBeenCalled();
    host.mediaQueries.setMatches(reducedMotionQuery, false);
    expect(firstChanged).toHaveBeenCalledOnce();
    remove();
    second.dispose();
    host.mediaQueries.setMatches(reducedMotionQuery, true);
    expect(firstChanged).toHaveBeenCalledOnce();
    expect(secondChanged).toHaveBeenCalledOnce();
    expect(host.environment.matchMedia(reducedMotionQuery).matches).toBe(true);
    first.dispose();
    other.dispose();
  } finally {
    host.dispose();
  }
  expect(() => host.mediaQueries.setMatches(reducedMotionQuery, false)).toThrow();
});

it("delivers reduced-motion changes through the real class presentation bridge without internal controller symbols", async () => {
  class Panel extends NSEViewController {
    static override view = ({ controller }: { readonly controller: Panel }) => <output>{controller.traitCollection.reducedMotion ? "Reduced motion" : "Full motion"}</output>;
    readonly changes: boolean[] = [];
    override traitCollectionDidChange(previous: NSETraitCollection) {
      if (previous.reducedMotion !== this.traitCollection.reducedMotion) this.changes.push(this.traitCollection.reducedMotion);
    }
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Panel(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createSynWareTestHost({
    application: Application,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.host-media-traits", displayName: "Media traits", version: "1.0.0" },
    document,
  });
  hosts.push(host);
  host.mediaQueries.setMatches(reducedMotionQuery, true);
  const view = await host.render();
  const panel = host.application!.windows[0]!.contentViewController as Panel;
  await waitFor(() => expect(view.container.textContent).toContain("Reduced motion"));
  expect(panel.traitCollection.reducedMotion).toBe(true);
  await act(async () => {
    host.mediaQueries.setMatches(reducedMotionQuery, false);
    host.clock.advance(16);
  });
  await waitFor(() => expect(view.container.textContent).toContain("Full motion"));
  expect(panel.traitCollection.reducedMotion).toBe(false);
  await act(async () => {
    host.mediaQueries.setMatches(reducedMotionQuery, true);
    host.clock.advance(16);
  });
  await waitFor(() => expect(view.container.textContent).toContain("Reduced motion"));
  expect(panel.changes).toEqual([true, false, true]);
});

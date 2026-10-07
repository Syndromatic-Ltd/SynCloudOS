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

import { describe, expect, it, vi } from "vitest";
import {
  NSEAdaptiveNavigationController,
  NSENavigationStackController,
  NSETabBarController,
  NSETabBarMoreDestinationId,
  type NSENavigationDestination,
} from "../../src/NSE/Navigation";
import type { SynCloudOSPresentationTraits } from "../../src/SynCloudOS/SynCloudOS";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";

function traits(horizontalSizeClass: SynCloudOSPresentationTraits["horizontalSizeClass"]): SynCloudOSPresentationTraits {
  const width = horizontalSizeClass === "compact" ? 640 : horizontalSizeClass === "regular" ? 1024 : 1440;
  return Object.freeze({
    revision: 1,
    contentBounds: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    hostViewportBounds: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    horizontalSizeClass,
    orientation: "landscape",
    workArea: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    visualViewportBounds: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    safeAreaInsets: Object.freeze({ blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }),
    virtualKeyboardInset: 0,
    devicePixelRatio: 1,
    primaryPointer: "fine",
    hover: true,
    touch: false,
    reducedMotion: false,
    reducedTransparency: false,
    forcedColours: false,
  });
}

function destinations(created: string[]): readonly NSENavigationDestination[] {
  return Object.freeze([
    "home", "library", "search", "settings", "sharing", "activity",
  ].map((id, index) => Object.freeze({
    id,
    restorationId: `fixture.${id}`,
    label: id,
    accessibleLabel: `${id} destination`,
    icon: { kind: "template", name: `fixture-${id}` },
    groupId: index < 4 ? "main" : "more",
    ...(id === "settings" ? { disabled: true } : {}),
    ...(id === "activity" ? { badge: 3 } : {}),
    createContent: () => {
      const content = { id, form: { draft: `${id}-draft` }, scroll: index * 10 };
      created.push(id);
      return content;
    },
  })));
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("semantic presentation-navigation controllers", () => {
  it("validates stable destinations, retains lazily constructed content, and puts six-plus destinations behind More", async () => {
    const created: string[] = [];
    const controller = new NSETabBarController({ id: "fixture-tabs", destinations: destinations(created) });

    expect(controller.getSnapshot()).toMatchObject({
      selectedDestinationId: "home",
      directDestinationIds: ["home", "library", "search", "settings"],
      overflowDestinationIds: ["sharing", "activity"],
      activeTabId: "home",
    });
    expect(controller.sections).toEqual([
      { id: "main", label: "main", destinationIds: ["home", "library", "search", "settings"] },
      { id: "more", label: "more", destinationIds: ["sharing", "activity"] },
    ]);
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true);
    expect(created).toEqual([]);
    const first = controller.getContent("home");
    expect(controller.getContent("home")).toBe(first);
    expect(created).toEqual(["home"]);

    await controller.select("activity", { source: "pointer" });
    expect(controller.getSnapshot()).toMatchObject({ selectedDestinationId: "activity", activeTabId: NSETabBarMoreDestinationId });
    expect(controller.moreStack?.getSnapshot().path).toEqual([]);
    expect(controller.getContent("activity")).toEqual(expect.objectContaining({ form: { draft: "activity-draft" } }));
    await expect(controller.select("settings")).rejects.toMatchObject({ name: "InvalidStateError" });

    controller.restore({ selectedDestinationId: "missing", more: { path: ["missing", "sharing"] } });
    expect(controller.getSnapshot()).toMatchObject({ selectedDestinationId: "sharing", activeTabId: NSETabBarMoreDestinationId });
    expect(controller.moreStack?.getSnapshot().path).toEqual([]);
    expect(() => new NSETabBarController({
      id: "duplicate-tabs",
      destinations: [destinations(created)[0]!, { ...destinations(created)[0]!, label: "Duplicate" }],
    })).toThrow(/unique/i);
    expect(() => new NSETabBarController({
      id: "invalid-icon-tabs",
      destinations: [{ id: "missing-icon", label: "Missing icon", icon: { kind: "template", name: "" } }],
    })).toThrow(/icon/i);
  });

  it("cancels unresolved selection and stack work without publishing after disposal", async () => {
    let resolveSelection: (() => void) | null = null;
    const controller = new NSETabBarController({
      id: "cancellation-tabs",
      destinations: destinations([]),
      onSelect: () => new Promise<void>((resolve) => { resolveSelection = resolve; }),
    });
    const publicationCount: number[] = [];
    controller.subscribe(() => publicationCount.push(controller.getSnapshot().revision));
    const pendingSelection = controller.select("library");
    controller.dispose();
    resolveSelection?.();
    await expect(pendingSelection).rejects.toMatchObject({ name: "AbortError" });
    expect(publicationCount).toEqual([]);

    let resolvePush: (() => void) | null = null;
    const stack = new NSENavigationStackController({
      id: "details-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "details", "advanced"],
      onPush: () => new Promise<void>((resolve) => { resolvePush = resolve; }),
    });
    const pendingPush = stack.push("details");
    stack.dispose();
    resolvePush?.();
    await expect(pendingPush).rejects.toMatchObject({ name: "AbortError" });
    expect(stack.getSnapshot().path).toEqual([]);
  });

  it("cancels a deferred selection for every later tab-navigation intent", async () => {
    const pendingFor = new Map<string, ReturnType<typeof deferred>>();
    const createController = (id: string) => new NSETabBarController({
      id,
      destinations: destinations([]),
      onSelect: (destination) => {
        const pending = deferred();
        pendingFor.set(`${id}:${destination.id}`, pending);
        return pending.promise;
      },
    });

    const opened = createController("intent-open");
    const staleBeforeOpen = opened.select("library");
    await opened.openOverflow({ source: "more" });
    pendingFor.get("intent-open:library")?.resolve();
    await expect(staleBeforeOpen).rejects.toMatchObject({ name: "AbortError" });
    expect(opened.getSnapshot()).toMatchObject({ selectedDestinationId: "home", activeTabId: NSETabBarMoreDestinationId });
    expect(opened.moreStack?.getSnapshot().path).toEqual([NSETabBarMoreDestinationId]);
    opened.dispose();

    const backed = createController("intent-back");
    await backed.openOverflow();
    const staleBeforeBack = backed.select("activity");
    backed.closeOverflow();
    pendingFor.get("intent-back:activity")?.resolve();
    await expect(staleBeforeBack).rejects.toMatchObject({ name: "AbortError" });
    expect(backed.getSnapshot()).toMatchObject({ selectedDestinationId: "home", activeTabId: "home" });
    expect(backed.moreStack?.getSnapshot().path).toEqual([]);
    backed.dispose();

    const restored = createController("intent-restore");
    const staleBeforeRestore = restored.select("library");
    restored.restore({ selectedDestinationId: "sharing", more: { path: [] } });
    pendingFor.get("intent-restore:library")?.resolve();
    await expect(staleBeforeRestore).rejects.toMatchObject({ name: "AbortError" });
    expect(restored.getSnapshot()).toMatchObject({ selectedDestinationId: "sharing", activeTabId: NSETabBarMoreDestinationId });
    restored.dispose();

    const superseded = createController("intent-newer-selection");
    const olderSelection = superseded.select("library");
    const newerSelection = superseded.select("search");
    pendingFor.get("intent-newer-selection:library")?.resolve();
    pendingFor.get("intent-newer-selection:search")?.resolve();
    await expect(olderSelection).rejects.toMatchObject({ name: "AbortError" });
    await expect(newerSelection).resolves.toBeUndefined();
    expect(superseded.getSnapshot()).toMatchObject({ selectedDestinationId: "search", activeTabId: "search" });
    superseded.dispose();
  });

  it("invalidates a pending stack push before root back and equal-path restoration intents", async () => {
    const createPendingStack = () => {
      let resolvePush: (() => void) | null = null;
      const stack = new NSENavigationStackController({
        id: `pending-stack-${Math.random()}`,
        rootDestinationId: "home",
        destinationIds: ["home", "details"],
        onPush: () => new Promise<void>((resolve) => { resolvePush = resolve; }),
      });
      return {
        stack,
        resolve: () => resolvePush?.(),
      };
    };

    const rootBack = createPendingStack();
    const pendingRootBack = rootBack.stack.push("details");
    rootBack.stack.pop();
    rootBack.resolve();
    await expect(pendingRootBack).rejects.toMatchObject({ name: "AbortError" });
    expect(rootBack.stack.getSnapshot().path).toEqual([]);

    const rootRestore = createPendingStack();
    const pendingRootRestore = rootRestore.stack.push("details");
    rootRestore.stack.restore({ path: [] });
    rootRestore.resolve();
    await expect(pendingRootRestore).rejects.toMatchObject({ name: "AbortError" });
    expect(rootRestore.stack.getSnapshot().path).toEqual([]);

    const rootPopToRoot = createPendingStack();
    const pendingRootPopToRoot = rootPopToRoot.stack.push("details");
    rootPopToRoot.stack.popToRoot();
    rootPopToRoot.resolve();
    await expect(pendingRootPopToRoot).rejects.toMatchObject({ name: "AbortError" });
    expect(rootPopToRoot.stack.getSnapshot().path).toEqual([]);

    rootBack.stack.dispose();
    rootRestore.stack.dispose();
    rootPopToRoot.stack.dispose();
  });

  it("makes a newer stack push supersede an older unresolved intent", async () => {
    const resolvers = new Map<string, () => void>();
    const stack = new NSENavigationStackController({
      id: "newer-stack-intent",
      rootDestinationId: "home",
      destinationIds: ["home", "details", "advanced"],
      onPush: (destinationId) => new Promise<void>((resolve) => { resolvers.set(destinationId, resolve); }),
    });

    const older = stack.push("details");
    const newer = stack.push("advanced");
    resolvers.get("details")?.();
    resolvers.get("advanced")?.();
    await expect(older).rejects.toMatchObject({ name: "AbortError" });
    await expect(newer).resolves.toBeUndefined();
    expect(stack.getSnapshot().path).toEqual(["advanced"]);
    stack.dispose();
  });

  it("retains undefined lazy content and pushes an overflow selection through the real More hierarchy", async () => {
    const emptyFactory = vi.fn<() => undefined>(() => undefined);
    const controller = new NSETabBarController<undefined>({
      id: "undefined-content-tabs",
      destinations: [
        { id: "empty", label: "Empty", icon: { kind: "template", name: "empty" }, createContent: emptyFactory },
      ],
    });
    expect(controller.getContent("empty")).toBeUndefined();
    expect(controller.getContent("empty")).toBeUndefined();
    expect(emptyFactory).toHaveBeenCalledTimes(1);
    controller.dispose();

    const retained = new NSETabBarController({ id: "retained-more-tabs", destinations: destinations([]) });
    await retained.openOverflow();
    expect(retained.moreStack?.getSnapshot().path).toEqual([NSETabBarMoreDestinationId]);
    await retained.select("activity");
    expect(retained.moreStack?.getSnapshot().path).toEqual([NSETabBarMoreDestinationId, "activity"]);
    // The shared hierarchy Back transition returns to the retained More list,
    // rather than closing the hierarchy or recreating a popup.
    retained.moreStack?.pop();
    expect(retained.moreStack?.getSnapshot().path).toEqual([NSETabBarMoreDestinationId]);
    retained.closeOverflow();
    expect(retained.moreStack?.getSnapshot().path).toEqual([]);
    await retained.select("library");
    expect(retained.moreStack?.getSnapshot().path).toEqual([]);
    retained.dispose();
  });

  it("models stack restoration and adaptive peer/hierarchy renderers without recreating retained destination state", async () => {
    const stack = new NSENavigationStackController({
      id: "restore-stack",
      rootDestinationId: "library",
      destinationIds: ["library", "detail", "nested"],
    });
    await stack.push("detail");
    await stack.push("nested");
    expect(stack.getSnapshot()).toMatchObject({ path: ["detail", "nested"], backDestinationId: "detail" });
    stack.pop();
    expect(stack.getSnapshot()).toMatchObject({ path: ["detail"], backDestinationId: "library" });
    stack.restore({ version: 1, path: ["missing", "nested"] });
    expect(stack.getSnapshot().path).toEqual(["nested"]);
    stack.popToRoot();
    expect(stack.getSnapshot().path).toEqual([]);

    const created: string[] = [];
    const tabs = new NSETabBarController({ id: "adaptive-tabs", destinations: destinations(created) });
    const homeContent = tabs.getContent("home") as { form: { draft: string }; scroll: number };
    const peer = new NSEAdaptiveNavigationController({
      id: "peer-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: tabs,
      traits: traits("wide"),
    });
    expect(peer.getSnapshot().renderer).toBe("source-list-content");
    peer.setTraits(traits("compact"));
    expect(peer.getSnapshot().renderer).toBe("tabs");
    homeContent.form.draft = "retained";
    homeContent.scroll = 88;
    peer.setTraits(traits("regular"));
    expect(peer.getSnapshot().renderer).toBe("source-list-content");
    expect(tabs.getContent("home")).toBe(homeContent);
    expect(homeContent).toMatchObject({ form: { draft: "retained" }, scroll: 88 });

    const hierarchy = new NSEAdaptiveNavigationController({
      id: "hierarchy-adaptive",
      model: "hierarchy",
      presentation: "adaptive",
      tabController: tabs,
      stackController: stack,
      traits: traits("regular"),
    });
    expect(hierarchy.getSnapshot().renderer).toBe("list-detail");
    hierarchy.setTraits(traits("compact"));
    expect(hierarchy.getSnapshot().renderer).toBe("stack");
    hierarchy.dispose();
    await tabs.select("library");
    expect(tabs.getSnapshot().selectedDestinationId).toBe("library");
  });

  it("separates peer navigation meaning from its adaptive or persistent-tab presentation", () => {
    const tabs = new NSETabBarController({ id: "model-presentation-tabs", destinations: destinations([]) });
    const stack = new NSENavigationStackController({
      id: "model-presentation-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const peerAdaptive = new NSEAdaptiveNavigationController({
      id: "peer-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 390, height: 844 }),
    });

    expect(peerAdaptive.getSnapshot()).toMatchObject({
      model: "peer",
      presentation: "adaptive",
      renderer: "tabs",
    });
    peerAdaptive.setTraits(createStaticPresentationTraits({ width: 1280, height: 800 }));
    expect(peerAdaptive.getSnapshot().renderer).toBe("source-list-content");

    const persistentTabs = new NSEAdaptiveNavigationController({
      id: "peer-bottom-tabs",
      model: "peer",
      presentation: "bottom-tabs",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 1440, height: 900 }),
    });
    expect(persistentTabs.getSnapshot()).toMatchObject({
      model: "peer",
      presentation: "bottom-tabs",
      renderer: "tabs",
    });
    expect(() => new NSEAdaptiveNavigationController({
      id: "invalid-hierarchy-tabs",
      model: "hierarchy",
      presentation: "bottom-tabs",
      tabController: tabs,
      stackController: stack,
      traits: createStaticPresentationTraits({ width: 390, height: 844 }),
    })).toThrowError("Hierarchy navigation cannot use the bottom-tabs presentation.");
    expect(() => new NSEAdaptiveNavigationController({
      id: "hierarchy-without-stack",
      model: "hierarchy",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 390, height: 844 }),
    })).toThrowError("Hierarchy adaptive navigation requires a stack controller.");
    expect(() => new NSEAdaptiveNavigationController({
      id: "peer-with-stack",
      model: "peer",
      tabController: tabs,
      stackController: stack,
      traits: createStaticPresentationTraits({ width: 390, height: 844 }),
    })).toThrowError("Peer adaptive navigation cannot use a stack controller.");

    peerAdaptive.dispose();
    persistentTabs.dispose();
    stack.dispose();
    tabs.dispose();
  });

  it("publishes a new snapshot when only bottom-tab geometry traits change", () => {
    const tabs = new NSETabBarController({ id: "bottom-geometry-tabs", destinations: destinations([]) });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "bottom-geometry-adaptive",
      model: "peer",
      presentation: "bottom-tabs",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 390, height: 844 }),
    });
    const publish = vi.fn();
    adaptive.subscribe(publish);

    adaptive.setTraits(createStaticPresentationTraits({
      width: 390,
      height: 844,
      safeArea: { top: 0, right: 0, bottom: 34, left: 0 },
    }));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(adaptive.getSnapshot().traits.safeAreaInsets.blockEnd).toBe(34);
    adaptive.dispose();
    tabs.dispose();
  });

  it("retitles destinations and sections in place for a locale change", async () => {
    const created: string[] = [];
    const tabs = new NSETabBarController({
      id: "fixture:retitle",
      destinations: destinations(created),
      sections: [{ id: "all", label: "All", destinationIds: ["home", "library", "search", "settings", "sharing", "activity"] }],
    });
    await tabs.select("library");
    const content = tabs.getContent("library");
    const listener = vi.fn();
    tabs.subscribe(listener);

    tabs.retitle({ destinations: { library: { label: "Bibliothek", accessibleLabel: "Bibliothek" } }, sections: { all: "Alle" } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(tabs.getDestination("library")).toMatchObject({ id: "library", label: "Bibliothek", accessibleLabel: "Bibliothek", restorationId: "fixture.library" });
    expect(tabs.destinations.find(({ id }) => id === "library")?.label).toBe("Bibliothek");
    expect(tabs.sections[0]?.label).toBe("Alle");
    // Identity, selection and cached content survive the new copy.
    expect(tabs.getSnapshot().selectedDestinationId).toBe("library");
    expect(tabs.getContent("library")).toBe(content);
    expect(created).toEqual(["library"]);

    // Unchanged copy publishes nothing, so callers may retitle every render.
    tabs.retitle({ destinations: { library: { label: "Bibliothek", accessibleLabel: "Bibliothek" } }, sections: { all: "Alle" } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => tabs.retitle({ destinations: { missing: { label: "x" } } })).toThrow(RangeError);
    expect(() => tabs.retitle({ sections: { missing: "x" } })).toThrow(RangeError);
    tabs.dispose();
  });
});

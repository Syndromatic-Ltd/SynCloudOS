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


import React, { useState } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { NSEMenu, NSEMenuController, NSEMenuOverlay, type NSEMenuModel, type NSEMenuRuntimePort } from "../../src/NSE/Menus";
import { NSEOverlayProvider, createNSEOverlayManager, type NSEOverlayRuntimePort } from "../../src/NSE/Overlays";
import budgets from "../fixtures/conformance-performance-budgets.json";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { runStructuralScenario } from "./structural-performance-scenario";

afterEach(cleanup);

const scenarioId = "overlays.menu-open-painted";
const menuModel: NSEMenuModel = Object.freeze({
  id: "performance-menu",
  label: "Performance menu",
  entries: Object.freeze([
    Object.freeze({ kind: "command" as const, id: "action", commandId: "performance.action", labelOverride: "Overlay action" }),
  ]),
});

function presentation(commandId: string) {
  return {
    commandId,
    responderId: "application:performance",
    title: "Overlay action",
    enabled: true,
    denied: false,
    hidden: false,
    state: "off" as const,
    stale: false,
  };
}

function createRuntimePort(validateMany: NSEMenuRuntimePort["commands"]["validateMany"]): NSEOverlayRuntimePort & NSEMenuRuntimePort {
  const signal = new AbortController().signal;
  const workArea = Object.freeze({
    width: 1280,
    height: 720,
    safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
  });
  const presentation = createStaticPresentationPort({ width: 1280, height: 720, reducedMotion: true });
  return {
    runtimeId: "runtime:overlay-performance",
    signal,
    commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validateMany,
      prepareDispatch: vi.fn(async (commandId: string) => ({ status: "accepted" as const, acceptance: { commandId, responderId: "application:performance" } as never })),
      dispatch: vi.fn(async (commandId: string) => ({
        status: "executed" as const,
        commandId,
        responderId: "application:performance",
        operationId: "performance-dispatch",
        correlationId: "performance-dispatch",
        value: undefined,
      })),
    },
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId, anchor) => anchor?.focus(),
    reportPlacementFailure: () => undefined,
    wrapFocusScope: (_options, children) => children,
  };
}

function CycleFixture({
  controller,
  manager,
  runtimePort,
  open,
}: {
  readonly controller: NSEMenuController;
  readonly manager: ReturnType<typeof createNSEOverlayManager>;
  readonly runtimePort: NSEOverlayRuntimePort;
  readonly open: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <NSEOverlayProvider manager={manager} runtimePort={runtimePort}>
      <button ref={setAnchor} type="button">Performance menu trigger</button>
      <NSEMenuOverlay
        overlay={{ id: "performance-menu-overlay", parentResponderId: "application:performance" }}
        controller={controller}
        open={open}
        anchor={anchor}
        onOpenChange={() => undefined}
      >
        <NSEMenu model={menuModel} controller={controller} open={open} onOpenChange={() => undefined} />
      </NSEMenuOverlay>
    </NSEOverlayProvider>
  );
}

interface ResizeObserverProbe {
  readonly active: () => number;
  restore(): void;
}

/** A test-only observer probe makes the lifecycle assertion portable to jsdom. */
function installResizeObserverProbe(): ResizeObserverProbe {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  let liveObservers = 0;
  class ProbeResizeObserver {
    #observing = false;
    constructor(_callback: ResizeObserverCallback) {}
    observe(_target: Element): void {
      if (this.#observing) return;
      this.#observing = true;
      liveObservers += 1;
    }
    unobserve(_target: Element): void {}
    disconnect(): void {
      if (!this.#observing) return;
      this.#observing = false;
      liveObservers -= 1;
    }
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: ProbeResizeObserver });
  return {
    active: () => liveObservers,
    restore: () => {
      if (descriptor) Object.defineProperty(globalThis, "ResizeObserver", descriptor);
      else Reflect.deleteProperty(globalThis, "ResizeObserver");
    },
  };
}

it("opens and paints 100 menu generations without retained portals, listener sets, or auto-update observers", async () => {
  const budget = Reflect.get(budgets.portableCases, scenarioId) as {
    readonly cycles: number;
    readonly maxProviderListenerSets: number;
    readonly maxValidateManyPerVisibleGeneration: number;
    readonly maxMenuPublications: number;
    readonly maxOverlayPublications: number;
    readonly maxLiveAutoUpdateObservers: number;
  } | undefined;
  expect(budget).toBeDefined();

  await runStructuralScenario({
    run: async () => {
      const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      ));
      const runtimePort = createRuntimePort(validateMany);
      const controller = new NSEMenuController({ model: menuModel, runtime: runtimePort });
      const manager = createNSEOverlayManager();
      let menuPublications = 0;
      let overlayPublications = 0;
      const unsubscribeMenu = controller.subscribe(() => { menuPublications += 1; });
      const unsubscribeOverlay = manager.subscribe(() => { overlayPublications += 1; });
      const observerProbe = installResizeObserverProbe();
      const documentAdds = new Map<string, number>();
      const originalAddEventListener = document.addEventListener;
      document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === "pointerdown" || type === "focusin" || type === "keydown") {
          documentAdds.set(type, (documentAdds.get(type) ?? 0) + 1);
        }
        originalAddEventListener.call(document, type, listener, options);
      }) as typeof document.addEventListener;
      let view: ReturnType<typeof render> | null = null;
      let maxLiveAutoUpdateObservers = 0;
      try {
        view = render(<CycleFixture controller={controller} manager={manager} runtimePort={runtimePort} open={false} />);
        for (let index = 0; index < budget!.cycles; index += 1) {
          await act(async () => {
            view!.rerender(<CycleFixture controller={controller} manager={manager} runtimePort={runtimePort} open />);
          });
          await waitFor(() => expect(view!.container.querySelector('[data-nse-overlay-kind="menu"]')).not.toBeNull());
          maxLiveAutoUpdateObservers = Math.max(maxLiveAutoUpdateObservers, observerProbe.active());

          await act(async () => {
            view!.rerender(<CycleFixture controller={controller} manager={manager} runtimePort={runtimePort} open={false} />);
          });
          await waitFor(() => expect(view!.container.querySelector('[data-nse-overlay-kind="menu"]')).toBeNull());
          expect(manager.getSnapshot().orderedIds).toEqual([]);
          expect(observerProbe.active()).toBe(0);
        }
        const result = {
          providerListenerSets: Math.max(...["pointerdown", "focusin", "keydown"].map((type) => documentAdds.get(type) ?? 0)),
          validateManyCalls: validateMany.mock.calls.length,
          menuPublications,
          overlayPublications,
          maxLiveAutoUpdateObservers,
          liveAutoUpdateObservers: observerProbe.active(),
          attachedPortals: view.container.querySelectorAll('[data-nse-overlay-kind]').length,
          registeredOverlays: manager.getSnapshot().orderedIds.length,
        };
        view.unmount();
        view = null;
        return result;
      } finally {
        view?.unmount();
        document.addEventListener = originalAddEventListener;
        observerProbe.restore();
        unsubscribeMenu();
        unsubscribeOverlay();
        controller.dispose();
      }
    },
    assertStructural: (result) => {
      expect(result.providerListenerSets).toBeLessThanOrEqual(budget!.maxProviderListenerSets);
      expect(result.validateManyCalls).toBeLessThanOrEqual(budget!.cycles * budget!.maxValidateManyPerVisibleGeneration);
      expect(result.validateManyCalls).toBe(budget!.cycles);
      expect(result.menuPublications).toBeLessThanOrEqual(budget!.maxMenuPublications);
      expect(result.overlayPublications).toBeLessThanOrEqual(budget!.maxOverlayPublications);
      expect(result.maxLiveAutoUpdateObservers).toBeLessThanOrEqual(budget!.maxLiveAutoUpdateObservers);
      expect(result.liveAutoUpdateObservers).toBe(0);
      expect(result.attachedPortals).toBe(0);
      expect(result.registeredOverlays).toBe(0);
    },
  });
});

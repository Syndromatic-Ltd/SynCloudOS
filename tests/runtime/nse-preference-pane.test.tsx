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

import { act, cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  NSEPreferencePane,
  capturePreferencePaneClass,
  resolvePreferencePanes,
} from "../../src/SynCloudOS/Preferences";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { SystemUILayer } from "../../src/Webspring/SystemUILayer";
import { createTestRuntime } from "./helpers";

afterEach(() => {
  cleanup();
});

describe("NSEPreferencePane", () => {
  it("captures static metadata", () => {
    class BillingPane extends NSEPreferencePane {
      static override id = "billing";
      static override title = { key: "billing.title", fallback: "Billing" };
      static override order = 700;

      override renderView() {
        return <p>Billing</p>;
      }
    }

    const descriptor = capturePreferencePaneClass(BillingPane);
    expect(descriptor).toEqual({
      id: "billing",
      title: { key: "billing.title", fallback: "Billing" },
      order: 700,
      PaneClass: BillingPane,
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(descriptor.PaneClass).toBe(BillingPane);
  });

  it("rejects non-subclasses and missing ids", () => {
    expect(() => capturePreferencePaneClass(function () {})).toThrow(/extending NSEPreferencePane/);
    expect(() => capturePreferencePaneClass(NSEPreferencePane)).toThrow(/extending NSEPreferencePane/);

    class MissingIdPane extends NSEPreferencePane {
      static override title = "Missing";
      static override order = 100;

      override renderView() {
        return null;
      }
    }

    expect(() => capturePreferencePaneClass(MissingIdPane)).toThrow(/static id/);
  });

  it("replaces, hides and rejects duplicates", () => {
    class BuiltInSounds extends NSEPreferencePane {
      static override id = "sounds";
      static override title = "Sounds";
      static override order = 200;
      override renderView() { return null; }
    }
    class CustomSounds extends NSEPreferencePane {
      static override id = "sounds";
      static override title = "Custom Sounds";
      static override order = 250;
      override renderView() { return null; }
    }
    class Billing extends NSEPreferencePane {
      static override id = "billing";
      static override title = "Billing";
      static override order = 700;
      override renderView() { return null; }
    }
    class DuplicateBilling extends NSEPreferencePane {
      static override id = "billing";
      static override title = "Billing Again";
      static override order = 710;
      override renderView() { return null; }
    }

    const resolvedFromClasses = resolvePreferencePanes({
      builtIn: [BuiltInSounds],
      developer: [CustomSounds, Billing],
      hide: ["sounds", "billing"],
    });
    expect(resolvedFromClasses.map((descriptor) => descriptor.PaneClass)).toEqual([CustomSounds, Billing]);

    const resolvedFromDescriptors = resolvePreferencePanes({
      builtIn: [capturePreferencePaneClass(BuiltInSounds)],
      developer: [capturePreferencePaneClass(CustomSounds), capturePreferencePaneClass(Billing)],
      hide: ["sounds", "billing"],
    });
    expect(resolvedFromDescriptors.map((descriptor) => descriptor.PaneClass)).toEqual([CustomSounds, Billing]);

    expect(() => resolvePreferencePanes({
      builtIn: [BuiltInSounds],
      developer: [Billing, DuplicateBilling],
    })).toThrow(/duplicate.*billing/i);
  });

  it("throws when host state is read before the host updates the pane", () => {
    class UninitialisedPane extends NSEPreferencePane {
      static override id = "uninitialised";
      static override title = "Uninitialised";
      static override order = 100;
      override renderView() { return null; }
    }

    const controller = new AbortController();
    const pane = new UninitialisedPane({ ownerSignal: controller.signal });
    expect(() => pane.settings).toThrow(new TypeError("NSEPreferencePane state is set by the host before it renders."));
    expect(() => pane.appearance).toThrow(new TypeError("NSEPreferencePane state is set by the host before it renders."));
    expect(() => pane.locale).toThrow(new TypeError("NSEPreferencePane state is set by the host before it renders."));
    controller.abort();
  });

  it("reads host state after the first update", () => {
    const runtime = createTestRuntime();
    runtime.settings.set("motion", "reduced");
    runtime.systemUI.preferences.open("");

    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <SystemUILayer onLogOut={() => {}} />
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const motionSummary = () => screen.getByText("Motion").closest(".nse-control-list-item")?.querySelector(".nse-control-list-meta")?.textContent;
    expect(motionSummary()).toBe("Reduced");

    act(() => {
      runtime.settings.set("motion", "standard");
    });

    expect(motionSummary()).toBe("Standard");
  });
});

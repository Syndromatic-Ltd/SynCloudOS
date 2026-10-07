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

import { useEffect, useRef, useState } from "react";
import type {
  CreateWindowRequest,
  SynCloudOSRuntime,
  WindowBounds,
  WindowRecord,
} from "../../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";
import type { FrameworkTestFixtureProps } from "../frameworkTestTypes";

const applicationId = "framework-windows";
const applicationSessionId = "framework-windows";
const rendererMountKey = `application:${applicationId}`;
const desktopBounds: WindowBounds = Object.freeze({ x: 80, y: 60, width: 720, height: 520 });

type WindowScenario = "desktop" | "relationships" | "geometry" | "compact-bounds";

function request(
  id: string,
  title: string,
  overrides: Partial<CreateWindowRequest> = {},
): CreateWindowRequest {
  return {
    id,
    workspaceId: "framework-tests",
    applicationId,
    applicationSessionId,
    documentId: null,
    documentAssociationRole: null,
    representedDocument: null,
    toolbar: null,
    role: "standard",
    style: ["titled", "closable", "minimisable", "resizable", "zoomable"],
    title,
    content: { rendererId: "application", parameters: { appId: applicationId } },
    bounds: desktopBounds,
    minimumSize: { width: 280, height: 180 },
    maximumSize: null,
    level: "normal",
    parentWindowControllerId: null,
    anchor: null,
    pinned: false,
    mobilePolicy: "fullscreen",
    restorationKey: null,
    ...overrides,
  };
}

function findWindow(runtime: SynCloudOSRuntime, id: string) {
  try {
    return runtime.windows.select(id);
  } catch {
    return null;
  }
}

async function openWindow(runtime: SynCloudOSRuntime, windowRequest: CreateWindowRequest) {
  const existing = findWindow(runtime, windowRequest.id!);
  const controller = existing ?? runtime.windows.create(windowRequest);
  if (controller.record.state === "minimised") {
    runtime.windows.restore(controller.id);
  } else if (controller.record.state === "closed") {
    await runtime.windows.open(controller.id);
  } else if (controller.record.state === "open") {
    runtime.windows.makeKey(controller.id);
  }
  return controller;
}

function closeWindow(runtime: SynCloudOSRuntime, id: string) {
  return runtime.windows.requestClose(id, { reason: "command" });
}

function WindowFixtureContent({ runtime, window }: {
  readonly runtime: SynCloudOSRuntime;
  readonly window: WindowRecord;
}) {
  const responderId = `window-content:${window.id}`;
  if (window.id === "memo") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button type="button">Parent focus target</button>
        <p>Memo content remains mounted while related windows are presented.</p>
      </div>
    );
  }
  if (window.id === "save-sheet") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button type="button">Sheet first</button>
        <button type="button" onClick={() => void runtime.windows.endSheet(window.id, "saved")}>Finish sheet</button>
      </div>
    );
  }
  if (window.id === "inspector-modal") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button
          type="button"
          onClick={() => void openWindow(runtime, request("nested-inspector", "Nested inspector", {
            role: "modal",
            style: ["titled", "closable"],
            level: "modal",
            parentWindowControllerId: "inspector-modal",
            bounds: { x: 250, y: 190, width: 360, height: 220 },
            mobilePolicy: "sheet",
          }))}
        >
          Open nested modal
        </button>
        <button type="button" onClick={() => void closeWindow(runtime, window.id)}>Close modal</button>
      </div>
    );
  }
  if (window.id === "nested-inspector") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button type="button" onClick={() => void closeWindow(runtime, window.id)}>Close nested modal</button>
      </div>
    );
  }
  if (window.id === "sharing-options") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button type="button">Copy link</button>
      </div>
    );
  }
  if (window.id === "required-decision") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button type="button">Choose an option</button>
      </div>
    );
  }
  if (window.id === "inspector-panel") {
    return (
      <div data-syncloudos-responder-id={responderId}>
        <button type="button">Inspector field</button>
      </div>
    );
  }
  return (
    <div data-syncloudos-responder-id={responderId}>
      <button type="button">{window.title} content</button>
    </div>
  );
}

function scenarioFromRuntime(runtime: SynCloudOSRuntime): WindowScenario {
  const scenario = new URLSearchParams(runtime.environment.browser.getLocation().search).get("scenario");
  return scenario === "relationships" || scenario === "geometry" || scenario === "compact-bounds"
    ? scenario
    : "desktop";
}

async function initialiseScenario(runtime: SynCloudOSRuntime, scenario: WindowScenario): Promise<void> {
  if (scenario === "desktop") {
    await openWindow(runtime, request("diagnostics-a", "Diagnostics A", {
      bounds: { x: 70, y: 70, width: 560, height: 400 },
    }));
    await openWindow(runtime, request("diagnostics-b", "Diagnostics B", {
      bounds: { x: 230, y: 140, width: 540, height: 380 },
    }));
    return;
  }
  if (scenario === "relationships") {
    await openWindow(runtime, request("memo", "Memo", {
      bounds: { x: 110, y: 80, width: 640, height: 460 },
    }));
    return;
  }
  runtime.environment.sessionStorage?.setItem(
    "framework-test:desktop-window-bounds",
    JSON.stringify(desktopBounds),
  );
  await openWindow(runtime, request("diagnostics", "Diagnostics"));
}

export function WindowManagementFixture({ windowRendererRegistration }: FrameworkTestFixtureProps) {
  const runtime = useKernelSynCloudOS();
  const scenario = scenarioFromRuntime(runtime);
  const initialisationRef = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState("Opening windows");

  useEffect(() => {
    if (!windowRendererRegistration) {
      setStatus("Window renderer registration is unavailable");
      return undefined;
    }
    const registration = windowRendererRegistration.register(rendererMountKey, ({ window }) => (
        <WindowFixtureContent runtime={runtime} window={window} />
      ));
    let active = true;
    initialisationRef.current ??= initialiseScenario(runtime, scenario);
    void initialisationRef.current.then(
      () => { if (active) setStatus("Ready"); },
      (error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "Unable to open windows");
      },
    );
    return () => {
      active = false;
      registration.dispose();
    };
  }, [runtime, scenario, windowRendererRegistration]);

  const attachSheet = async () => {
    const sheet = findWindow(runtime, "save-sheet") ?? runtime.windows.create(request("save-sheet", "Save changes?", {
      role: "sheet",
      style: ["titled", "closable"],
      level: "modal",
      parentWindowControllerId: "memo",
      bounds: { x: 180, y: 110, width: 500, height: 240 },
      mobilePolicy: "sheet",
    }));
    await runtime.windows.attachSheet("memo", sheet.id);
  };

  const openModal = () => openWindow(runtime, request("inspector-modal", "Inspector modal", {
    role: "modal",
    style: ["titled", "closable"],
    level: "modal",
    parentWindowControllerId: "memo",
    bounds: { x: 190, y: 130, width: 460, height: 300 },
    mobilePolicy: "sheet",
  }));

  const openPopover = () => openWindow(runtime, request("sharing-options", "Sharing options", {
    role: "popover",
    style: ["closable"],
    level: "floating",
    parentWindowControllerId: "memo",
    anchor: {
      id: "share-control",
      rect: { x: 630, y: 100, width: 36, height: 32 },
      edge: "block-end",
      alignment: "end",
      offset: 8,
    },
    bounds: { x: 500, y: 140, width: 260, height: 180 },
    mobilePolicy: "popover-to-sheet",
  }));

  const openRequiredDecision = () => openWindow(runtime, request("required-decision", "Required decision", {
    role: "modal",
    style: ["titled"],
    level: "modal",
    parentWindowControllerId: "memo",
    bounds: { x: 210, y: 150, width: 420, height: 260 },
    mobilePolicy: "sheet",
  }));

  const openInspector = () => openWindow(runtime, request("inspector-panel", "Inspector", {
    role: "panel",
    style: ["titled", "closable", "resizable"],
    level: "floating",
    parentWindowControllerId: "memo",
    bounds: { x: 620, y: 90, width: 300, height: 420 },
    mobilePolicy: "sheet",
  }));

  return (
    <main aria-label="Window management framework fixture" data-window-fixture-scenario={scenario}>
      <div
        aria-label="Window test controls"
        style={{ position: "fixed", insetBlockStart: 8, insetInlineEnd: 8, zIndex: 200, display: "flex", gap: 6 }}
      >
        <button type="button" onClick={() => void runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "toolbar" })}>
          Return to Webspring
        </button>
        {scenario === "desktop" ? (
          <button type="button" onClick={() => runtime.windows.restore("diagnostics-a")}>Restore Diagnostics A</button>
        ) : null}
        {scenario === "relationships" ? (
          <>
            <button type="button" onClick={() => void attachSheet()}>Attach sheet</button>
            <button type="button" onClick={() => void openModal()}>Open modal</button>
            <button id="share-control" type="button" onClick={() => void openPopover()}>Open popover</button>
            <button type="button" onClick={() => void openRequiredDecision()}>Open non-closable modal</button>
            <button type="button" onClick={() => void openInspector()}>Open inspector panel</button>
          </>
        ) : null}
      </div>
      <p role="status" style={{ position: "fixed", insetBlockEnd: 8, insetInlineStart: 8, zIndex: 200 }}>{status}</p>
    </main>
  );
}

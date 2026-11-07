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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GFXColour } from "../../src/FX/GraphicsFX/public";
import { NSEColourWell } from "../../src/NSE/Colour/Controls/NSEColourWell";
import { NSEObject, observable } from "../../src/NSE/Objects";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { action, bindActionResponder, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { SynWareColourPanelProvider } from "../../src/SynCloudOS/AppSDK/SynWareColourPanelProvider";
import { createSynWareNSEColourPanelDragPort, createSynWareNSEDataViewDragBinding } from "../../src/SynCloudOS/AppSDK/SynWareNSEDragAdapter";
import type { AppDragOperation } from "../../src/SynCloudOS/AppSDK/appClientTypes";
import type { SynWareContextValue } from "../../src/SynCloudOS/AppSDK/appContextTypes";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "../runtime/helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const mounts: ReturnType<typeof createMountedSynWareRuntime>[] = [];

afterEach(async () => {
  cleanup();
  for (const mount of mounts.splice(0)) mount.dispose("NSE drag integration cleanup");
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("NSE drag integration cleanup")));
  vi.restoreAllMocks();
});

function mountedDrag(authorise: NonNullable<NonNullable<Parameters<typeof createTestRuntime>[0]>["dragAuthorisation"]>["authorise"] = () => true) {
  const runtime = authoriseTestRuntime(createTestRuntime({
    initialBundles: [createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })],
    dragAuthorisation: { authorise },
  }));
  runtimes.push(runtime);
  const responderId = "application:com.example.studio";
  runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  for (const id of ["source", "target"]) {
    runtime.responders.register({ id: `studio:${id}`, kind: "control", parentId: responderId, scopeId: responderId });
  }
  const mount = createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp("com.example.studio")!, responderId });
  mounts.push(mount);
  const app = createSynWareContextValue(mount.runtime);
  return { runtime, mount, app, source: app.drag.endpoint({ responderId: "studio:source" }), target: app.drag.endpoint({ responderId: "studio:target" }) };
}

function dataView(fixture: ReturnType<typeof mountedDrag>, operations: readonly AppDragOperation[] = ["move", "copy", "link"], ownerSignal?: AbortSignal) {
  const accept = vi.fn();
  const restore = vi.fn();
  const binding = createSynWareNSEDataViewDragBinding<string>({
    drag: fixture.app.drag,
    operations,
    ownerSignal,
    representations: (ids) => [{ type: "text/plain", value: ids.join(",") }],
    captureSelection: () => ["selected"],
    restoreSelection: restore,
    onAcceptDrop: accept,
  });
  binding.begin(["selected"], fixture.source);
  return { binding, accept, restore };
}

const location = { targetId: "target", insertionIndex: 0 };

describe("mounted AppDragClient to NSE negotiation", () => {
  it("reports a policy-denied destination as not ready", async () => {
    const fixture = mountedDrag(() => false);
    const perform = vi.spyOn(fixture.runtime.drag, "performDrop");
    const { binding, accept, restore } = dataView(fixture);
    await expect(binding.update(location, fixture.target)).resolves.toBe(false);
    expect(fixture.runtime.drag.snapshot().active?.operation).toBe("none");
    await expect(binding.drop(location, fixture.target)).resolves.toBe(false);
    expect(perform).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledWith(["selected"]);
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it.each(["copy", "move", "link"] as const)("preserves the real %s receipt through the colour port", async (operation) => {
    const fixture = mountedDrag();
    const port = createSynWareNSEColourPanelDragPort(fixture.app.drag, fixture.app.colourPanel.authorityToken);
    const session = port.manager.begin({ source: fixture.source, operations: ["copy", "move", "link"], representations: [{ type: "text/plain", value: "payload" }] });
    const receipt = await port.manager.updateDestination(session.id, { endpoint: fixture.target, operations: [operation] });
    expect(receipt.operation).toBe(operation);
    expect(fixture.runtime.drag.snapshot().active?.operation).toBe(operation);
    port.manager.claimDrop(session.id);
    await expect(port.manager.performDrop(session.id)).resolves.toEqual({ accepted: true, operation });
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it("reports none when a previously accepted destination is denied", async () => {
    let allowed = true;
    const fixture = mountedDrag(() => allowed);
    const port = createSynWareNSEColourPanelDragPort(fixture.app.drag, fixture.app.colourPanel.authorityToken);
    const session = port.manager.begin({ source: fixture.source, operations: ["copy"], representations: [{ type: "text/plain", value: "payload" }] });
    await expect(port.manager.updateDestination(session.id, { endpoint: fixture.target, operations: ["copy"] })).resolves.toMatchObject({ operation: "copy" });
    allowed = false;
    await expect(port.manager.updateDestination(session.id, { endpoint: fixture.target, operations: ["copy"] })).resolves.toMatchObject({ operation: "none" });
    port.manager.cancel(session.id);
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it.each(["copy", "move", "link"] as const)("retains %s and the real commit signal in data-view acceptance", async (operation) => {
    const fixture = mountedDrag();
    const { binding, accept } = dataView(fixture, [operation]);
    accept.mockImplementation((proposal) => {
      expect(proposal.signal.aborted).toBe(false);
      expect(fixture.runtime.drag.snapshot().active).toMatchObject({ phase: "dropping", operation, source: fixture.source, destination: fixture.target });
    });
    await expect(binding.update(location, fixture.target)).resolves.toBe(true);
    await expect(binding.drop(location, fixture.target)).resolves.toBe(true);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it("preserves commit policy authority after successful negotiation", async () => {
    const fixture = mountedDrag((request) => request.phase === "negotiate");
    const { binding, accept, restore } = dataView(fixture, ["move"]);
    await expect(binding.update(location, fixture.target)).resolves.toBe(true);
    await expect(binding.drop(location, fixture.target)).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledWith(["selected"]);
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it("rejects a copied endpoint object through the underlying authority", async () => {
    const fixture = mountedDrag();
    const { binding, accept } = dataView(fixture);
    await expect(binding.update(location, { ...fixture.target })).rejects.toMatchObject({ name: "SecurityError" });
    expect(accept).not.toHaveBeenCalled();
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
    binding.dispose();
  });

  it("cancels pending negotiation and restores selection when the owner aborts", async () => {
    let release!: (allowed: boolean) => void;
    const entered = vi.fn();
    const fixture = mountedDrag((_request, signal) => {
      entered(signal);
      return new Promise<boolean>((resolve) => { release = resolve; }).then((allowed) => {
        signal.throwIfAborted();
        return allowed;
      });
    });
    const owner = new AbortController();
    const { binding, accept, restore } = dataView(fixture, ["copy"], owner.signal);
    const pending = binding.update(location, fixture.target);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => expect(entered).toHaveBeenCalledTimes(1));
    owner.abort();
    expect(entered.mock.calls[0]![0].aborted).toBe(true);
    release(true);
    await rejection;
    expect(accept).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it("keeps a claimed data-view drop alive through native source end", async () => {
    const fixture = mountedDrag();
    let release!: () => void;
    const accepted = vi.fn();
    const binding = createSynWareNSEDataViewDragBinding<string>({
      drag: fixture.app.drag,
      representations: () => [{ type: "text/plain", value: "payload" }],
      captureSelection: () => ["selected"],
      restoreSelection: vi.fn(),
      onValidateDrop: () => new Promise<boolean>((resolve) => { release = () => resolve(true); }),
      onAcceptDrop: accepted,
    });
    binding.begin(["selected"], fixture.source);
    const dropping = binding.drop(location, fixture.target);
    binding.end();
    expect(fixture.runtime.drag.snapshot().active).not.toBeNull();
    release();
    await expect(dropping).resolves.toBe(true);
    expect(accepted).toHaveBeenCalledTimes(1);
  });
});

describe("mounted AppDragClient colour drops", () => {
  function renderWells(fixture: ReturnType<typeof mountedDrag>) {
    const change = vi.fn();
    render(<SynWareColourPanelProvider service={fixture.app.colourPanel} drag={fixture.app.drag}>
      <NSEColourWell id="source" responderId="studio:source" aria-label="Source colour" defaultValue={GFXColour.parse("#224466")} />
      <NSEColourWell id="target" responderId="studio:target" aria-label="Target colour" defaultValue={GFXColour.parse("#000000")} onValueChange={change} />
    </SynWareColourPanelProvider>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Source colour" }), { key: "d", altKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Target colour" }), { key: "Enter", altKey: true });
    return change;
  }

  it("cancels a denied colour drop before performing it", async () => {
    const fixture = mountedDrag(() => false);
    const perform = vi.spyOn(fixture.runtime.drag, "performDrop");
    const change = renderWells(fixture);
    await waitFor(() => expect(screen.getAllByRole("status").some((node) => node.textContent === "Colour drop denied.")).toBe(true));
    expect(perform).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Target colour" }).textContent).toContain("#000000");
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });

  it("commits an allowed colour drop once using the manager-owned payload", async () => {
    const fixture = mountedDrag();
    const change = renderWells(fixture);
    await waitFor(() => expect(screen.getByRole("button", { name: "Target colour" }).textContent).toContain("#224466"));
    expect(change.mock.calls.filter(([, phase]) => phase === "commit")).toHaveLength(1);
    expect(change).toHaveBeenCalledWith(GFXColour.parse("#224466"), "commit");
    expect(fixture.runtime.colourPanel.getSnapshot().recents).toHaveLength(1);
    expect(fixture.runtime.drag.snapshot().active).toBeNull();
  });
});

interface ColourDragFixture {
  readonly runtime: SynCloudOSRuntime;
  readonly app: SynWareContextValue;
}

describe("mounted colour provider drag identity", () => {
  function dragRegistrations(fixture: ColourDragFixture) {
    return fixture.runtime.commands.inspect().registrations.filter(({ commandId, responderId }) =>
      commandId.startsWith("nse.drag.") && responderId === "studio:source");
  }

  it("keeps colour-well registrations stable across subscribed editor renders and observable edits", async () => {
    const fixture = mountedDrag();
    class EditorActions extends NSEObject {
      @observable accessor dirty = false;
      @action save() { this.dirty = false; }
      validateSave() { return this.dirty; }
    }
    const editor = new EditorActions();
    const binding = bindActionResponder(editor, {
      appId: "com.example.studio",
      commands: fixture.app.commands,
    }, "application:com.example.studio");
    fixture.runtime.focus.requestFocus("studio:source");
    const register = vi.spyOn(fixture.runtime.commands, "register");
    let renders = 0;
    function Editor({ revision }: { readonly revision: number }) {
      // Bound the regression: an identity-driven registry feedback loop must
      // fail here rather than leave the integration runner rendering forever.
      if (++renders > 40) throw new Error("Colour editor registry feedback loop.");
      const save = useAction("save");
      const [title, setTitle] = useState("");
      return <SynWareColourPanelProvider
        service={fixture.app.colourPanel}
        drag={fixture.app.drag}
        commands={fixture.app.commands}
        responderId="application:com.example.studio"
      >
        <input aria-label="Colour title" value={title} onChange={(event) => {
          setTitle(event.currentTarget.value);
          editor.dirty = true;
        }} />
        <button disabled={!save.enabled} onClick={() => { void save.perform(); }}>Save colour</button>
        <output>{revision}</output>
        <NSEColourWell id="source" responderId="studio:source" aria-label="Editor colour" defaultValue={GFXColour.parse("#224466")} />
      </SynWareColourPanelProvider>;
    }
    const tree = (revision: number) => <SynCloudOSProvider runtime={fixture.runtime}>
      <RuntimeInputBoundary><SynWareProvider value={fixture.app}><Editor revision={revision} /></SynWareProvider></RuntimeInputBoundary>
    </SynCloudOSProvider>;
    const view = render(tree(0));
    const save = screen.getByRole("button", { name: "Save colour" }) as HTMLButtonElement;
    await act(async () => { await Promise.resolve(); });
    expect(save.disabled).toBe(true);
    const initial = dragRegistrations(fixture);
    expect(initial.map(({ commandId }) => commandId).sort()).toEqual(["nse.drag.begin", "nse.drag.cancel", "nse.drag.drop"]);
    const registrationCount = register.mock.calls.length;
    const initialRenders = renders;

    for (let revision = 1; revision <= 3; revision += 1) {
      view.rerender(tree(revision));
      fireEvent.change(screen.getByRole("textbox", { name: "Colour title" }), { target: { value: `Colour ${revision}` } });
      await waitFor(() => expect(save.disabled).toBe(false));
      await act(async () => { fireEvent.click(save); });
      await waitFor(() => expect(save.disabled).toBe(true));
      expect(editor.dirty).toBe(false);
      expect(dragRegistrations(fixture)).toEqual(initial);
      expect(register).toHaveBeenCalledTimes(registrationCount);
    }
    expect(renders).toBeGreaterThan(initialRenders);
    view.unmount();
    expect(dragRegistrations(fixture)).toEqual([]);
    binding.dispose();
  });

  it("replaces and cleans target registrations when mounted drag authority changes or is removed", async () => {
    const first = mountedDrag();
    const second = mountedDrag();
    expect(second.app.colourPanel.authorityToken).not.toBe(first.app.colourPanel.authorityToken);
    const tree = (fixture: ColourDragFixture, withDrag = true) => <SynWareColourPanelProvider
      service={fixture.app.colourPanel}
      drag={withDrag ? fixture.app.drag : undefined}
      commands={fixture.app.commands}
      responderId="application:com.example.studio"
    >
      <NSEColourWell id="source" responderId="studio:source" aria-label="Replacement colour" defaultValue={GFXColour.parse("#224466")} />
    </SynWareColourPanelProvider>;
    const view = render(tree(first));
    expect(dragRegistrations(first)).toHaveLength(3);
    expect(dragRegistrations(second)).toEqual([]);

    view.rerender(tree(second));
    expect(dragRegistrations(first)).toEqual([]);
    const replacement = dragRegistrations(second);
    expect(replacement).toHaveLength(3);
    view.rerender(tree(second));
    expect(dragRegistrations(second)).toEqual(replacement);

    view.rerender(tree(second, false));
    expect(dragRegistrations(second)).toEqual([]);
    view.rerender(tree(second));
    expect(dragRegistrations(second)).toHaveLength(3);
    expect(dragRegistrations(second)).not.toEqual(replacement);
    view.unmount();
    expect(dragRegistrations(first)).toEqual([]);
    expect(dragRegistrations(second)).toEqual([]);
  });
});

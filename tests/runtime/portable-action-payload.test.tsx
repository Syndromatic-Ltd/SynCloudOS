// @vitest-environment jsdom
import * as React from "react";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEPushButton } from "../../src/NSE/Controls/Buttons/NSEButtons";
import { action, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";
import type { CommandDispatchResult } from "../../src/SynCloudOS/Commands/commandTypes";

const hosts: SynWareTestHost[] = [];
let nextApp = 0;
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

interface PayloadCase {
  readonly label: string;
  payload(): unknown;
}

function payloadItems(value: unknown): readonly unknown[] {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) {
    throw new Error("Expected a detached payload containing an items array.");
  }
  return value.items;
}

async function mountPayloadApp(cases: readonly PayloadCase[] = [], withControl = false) {
  const bundleIdentifier = `com.example.portable-payload-${++nextApp}`;
  const scos = createAppSCOS(bundleIdentifier);
  let pending: Promise<CommandDispatchResult<unknown> | null> | undefined;
  function View() {
    const receive = useAction("receive");
    const controlPayload = React.useMemo(() => scos.commands.createPayload("id", "control"), []);
    return <>
      <output aria-label="Bound action">{receive.enabled ? "enabled" : "disabled"}</output>
      {cases.map(entry => <button key={entry.label} onClick={() => {
        pending = receive.perform(entry.payload());
      }}>{entry.label}</button>)}
      {withControl && <NSEPushButton action="receive" actionPayload={controlPayload}>Receive control</NSEPushButton>}
    </>;
  }
  class MainWindow extends NSEWindowController { static override view = View; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    readonly validated: unknown[] = [];
    readonly executed: unknown[] = [];
    @action receive(payload: unknown) { this.executed.push(payload); }
    validateReceive(payload: unknown) {
      if (payload !== undefined) this.validated.push(payload);
      return payload !== undefined;
    }
  }
  const host = createSynWareTestHost({
    application: Application,
    manifest: { schemaVersion: 1, bundleIdentifier, displayName: "Portable payloads", version: "1.0.0" },
    document,
  });
  hosts.push(host);
  const view = await host.render();
  const query = within(view.container);
  await waitFor(() => expect(query.getByLabelText("Bound action").textContent).toBe("disabled"));
  const application = host.application as Application;
  return {
    host, scos, application, query,
    async click(label: string) {
      pending = undefined;
      let result: CommandDispatchResult<unknown> | null | undefined;
      const button = query.getByRole("button", { name: label });
      await act(async () => { button.focus(); });
      await act(async () => {
        fireEvent.click(button);
        expect(pending).toBeDefined();
        result = await pending;
      });
      return result;
    },
  };
}

it("routes primitive event payloads to real class validation and execution even when the bound payload is disabled", async () => {
  const app = await mountPayloadApp([
    { label: "Select note", payload: () => "note-1" },
    { label: "Choose count", payload: () => 3 },
  ]);
  expect(await app.click("Select note")).toMatchObject({ status: "executed" });
  expect(await app.click("Choose count")).toMatchObject({ status: "executed" });
  expect(app.application.validated).toContain("note-1");
  expect(app.application.validated).toContain(3);
  expect(app.application.executed).toEqual(["note-1", 3]);
});

it("delivers detached immutable runtime-built records and nested arrays to validate and execute", async () => {
  let record: unknown;
  let nested: unknown;
  const app = await mountPayloadApp([
    { label: "Open note", payload: () => record },
    { label: "Open notes", payload: () => nested },
  ]);
  record = app.scos.commands.createPayload("id", "note-1", "selected", true);
  const item = app.scos.commands.createPayload("id", "note-2");
  const items = app.scos.commands.createPayloadArray(item, "note-3", 4, null);
  nested = app.scos.commands.createPayload("items", items);
  const expected = [{ id: "note-1", selected: true }, { items: [{ id: "note-2" }, "note-3", 4, null] }];
  expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
  expect(Object.isFrozen(record)).toBe(true);
  expect(Object.isFrozen(nested)).toBe(true);
  expect(Object.isFrozen(items)).toBe(true);
  expect(Object.isFrozen(item)).toBe(true);
  expect(await app.click("Open note")).toMatchObject({ status: "executed" });
  expect(await app.click("Open notes")).toMatchObject({ status: "executed" });
  expect(app.application.executed).toEqual(expected);
  for (const [index, original] of [record, nested].entries()) {
    const received = app.application.executed[index];
    expect(received).not.toBe(original);
    expect(Object.isFrozen(received)).toBe(true);
    const validated = app.application.validated.filter(value => value !== null && typeof value === "object" &&
      (index === 0 ? "id" in value && value.id === "note-1" : "items" in value));
    expect(validated.length).toBeGreaterThan(0);
    for (const value of validated) {
      expect(value).toEqual(expected[index]);
      expect(value).not.toBe(original);
      expect(Object.isFrozen(value)).toBe(true);
      if (index === 1) {
        const receivedItems = payloadItems(value);
        expect(receivedItems).not.toBe(items);
        expect(receivedItems[0]).not.toBe(item);
        expect(Object.isFrozen(receivedItems)).toBe(true);
        expect(Object.isFrozen(receivedItems[0])).toBe(true);
      }
    }
  }
  const receivedItems = payloadItems(app.application.executed[1]);
  expect(receivedItems).not.toBe(items);
  expect(receivedItems[0]).not.toBe(item);
  expect(Object.isFrozen(receivedItems)).toBe(true);
  expect(Object.isFrozen(receivedItems[0])).toBe(true);
});

it("routes method buttons through the same mounted command payload boundary", async () => {
  const app = await mountPayloadApp([], true);
  const button = app.query.getByRole("button", { name: "Receive control" }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  await act(async () => { button.focus(); });
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(app.application.executed).toEqual([{ id: "control" }]));
  expect(app.application.validated).toContainEqual({ id: "control" });
  expect(Object.isFrozen(app.application.executed[0])).toBe(true);
});

it("rejects raw, proxy, accessor and malformed event payloads without invoking proxy or getter traps", async () => {
  const trap = vi.fn((): never => { throw new Error("Payload proxy trap must not run"); });
  const getter = vi.fn(() => "note-1");
  const raw = { id: "note-1" };
  const proxy = new Proxy(raw, {
    get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap,
    has: trap, set: trap, defineProperty: trap, isExtensible: trap, preventExtensions: trap,
  });
  const accessor = Object.defineProperty({}, "id", { enumerable: true, get: getter });
  const cases: PayloadCase[] = [
    { label: "Raw record", payload: () => raw },
    { label: "Frozen raw record", payload: () => Object.freeze({ id: "note-1" }) },
    { label: "Raw array", payload: () => ["note-1"] },
    { label: "Proxy", payload: () => proxy },
    { label: "Accessor", payload: () => accessor },
    { label: "Sparse array", payload: () => new Array(2) },
    { label: "Nonfinite number", payload: () => Number.NaN },
    { label: "Symbol", payload: () => Symbol("note") },
    { label: "Function", payload: () => () => "note-1" },
    { label: "DOM node", payload: () => document.createElement("input") },
    { label: "Files", payload: () => [new File(["note"], "note.txt")] },
  ];
  const app = await mountPayloadApp(cases);
  for (const entry of cases) expect(await app.click(entry.label)).toBeNull();
  expect(app.application.validated).toEqual([]);
  expect(app.application.executed).toEqual([]);
  expect(trap).not.toHaveBeenCalled();
  expect(getter).not.toHaveBeenCalled();
});

it("rejects malformed builder keys, raw nested values and values from another mounted scope without traversal", async () => {
  const app = await mountPayloadApp();
  const other = await mountPayloadApp();
  const commands = app.scos.commands;
  const trap = vi.fn((): never => { throw new Error("Builder proxy trap must not run"); });
  const getter = vi.fn(() => "note-1");
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
  const accessor = Object.defineProperty({}, "id", { enumerable: true, get: getter });
  const malformed: readonly (() => unknown)[] = [
    () => commands.createPayload("id", "one", "id", "two"),
    () => commands.createPayload(1, "one"),
    () => commands.createPayload(Symbol("id"), "one"),
    () => commands.createPayload(proxy, "one"),
    () => commands.createPayload("id"),
    () => commands.createPayload("invalid-key", "one"),
    () => commands.createPayload("nested", { id: "one" }),
    () => commands.createPayload("nested", ["one"]),
    () => commands.createPayload("nested", proxy),
    () => commands.createPayload("nested", accessor),
    () => commands.createPayloadArray({ id: "one" }),
    () => commands.createPayloadArray(["one"]),
    () => commands.createPayloadArray(proxy),
    () => commands.createPayloadArray(accessor),
    () => commands.createPayload("nested", other.scos.commands.createPayload("id", "other")),
    () => commands.createPayloadArray(other.scos.commands.createPayloadArray("other")),
  ];
  for (const build of malformed) expect(build).toThrow();
  expect(app.application.validated).toEqual([]);
  expect(app.application.executed).toEqual([]);
  expect(trap).not.toHaveBeenCalled();
  expect(getter).not.toHaveBeenCalled();
});

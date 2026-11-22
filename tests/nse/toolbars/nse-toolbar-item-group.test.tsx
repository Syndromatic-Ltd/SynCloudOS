// @vitest-environment jsdom
import React, { type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEToolbarItemGroup } from "../../../src/NSE/Toolbars/NSEToolbarItemGroup";
import { NSEToolbar } from "../../../src/NSE/Toolbars/NSEToolbar";
import { ControlRuntimeProvider } from "../../../src/NSE/Controls/Core/useNSEControlCommand";
import { ActionResponderContext, ActionScopeProvider } from "../../../src/NSE/Controls/Core/useNSEControlAction";
import { nseActionCommandId } from "../../../src/NSE/Controls/Core/actionCommandId";
import { OverlayProvider } from "../../../src/NSE/Overlays/OverlayProvider";
import { SynCloudOSProvider, useRuntimeNSEControlPort, useRuntimeNSEOverlayPort } from "../../../src/SynCloudOSReact";
import { createTestRuntime } from "../../runtime/helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { cleanup(); for (const runtime of runtimes.splice(0)) await runtime.dispose(); });
const subitems = [
  { kind: "command", id: "left", commandId: "group.left", label: "Left", paletteLabel: "Left", icon: "L", payload: "left-payload" },
  { kind: "command", id: "right", commandId: "group.right", label: "Right", paletteLabel: "Right", icon: "R", payload: "right-payload" },
] as const;
function Ports({ children }: PropsWithChildren) {
  const control = useRuntimeNSEControlPort(), overlay = useRuntimeNSEOverlayPort();
  return <ControlRuntimeProvider port={control}><ActionResponderContext value="runtime">
    <OverlayProvider runtimePort={overlay} defaultParentResponderId="runtime">{children}</OverlayProvider>
  </ActionResponderContext></ControlRuntimeProvider>;
}
function mount(group: NSEToolbarItemGroup, denied: boolean | (() => boolean) = false) {
  const runtime = createTestRuntime(); runtimes.push(runtime);
  const execute = vi.fn();
  for (const item of group.subitems) runtime.commands.register({
    id: "commandId" in item ? item.commandId! : nseActionCommandId("com.example.group", String(item.action)),
    responderId: "runtime", title: { key: item.id, fallback: item.label }, scope: "runtime", undo: { kind: "none" }, defaultKeyBindings: [],
    payload: { description: "Group payload", parse: value => ({ ok: true as const, value }) },
    validate: () => ({ enabled: !((typeof denied === "function" ? denied() : denied) && item.id === "right") }),
    execute: context => execute(item.id, context.payload),
  });
  runtime.focus.requestFocus("runtime");
  const view = render(<SynCloudOSProvider runtime={runtime}><Ports><ActionScopeProvider appId="com.example.group">{group.render()}</ActionScopeProvider></Ports></SynCloudOSProvider>);
  return { runtime, execute, view };
}

it("participates in the existing custom toolbar item contract", () => {
  const group = new NSEToolbarItemGroup({ identifier: "alignment", label: "Alignment", subitems });
  const toolbar = new NSEToolbar({ identifier: "editor", items: [group], defaultItemIdentifiers: [group.id] });
  expect(toolbar.items).toEqual([group]);
  expect(group.kind).toBe("custom");
  expect(group.minimumWidth).toBeGreaterThan(0);
  expect(group.idealWidth).toBeGreaterThanOrEqual(group.minimumWidth);
});

it("keeps the last selected index distinct from selectAny and momentary highlighting", () => {
  const group = new NSEToolbarItemGroup({ identifier: "selection", label: "Selection", subitems, selectionMode: "selectAny" });
  group.setSelected(true, 0); group.setSelected(true, 1);
  expect(group.isSelected(0)).toBe(true); expect(group.isSelected(1)).toBe(true); expect(group.selectedIndex).toBe(1);
  group.setSelected(false, 1);
  expect(group.isSelected(1)).toBe(false); expect(group.selectedIndex).toBe(1);
  group.selectionMode = "momentary";
  group.setSelected(true, 0);
  expect(group.selectedIndex).toBe(0); expect(group.isSelected(0)).toBe(false); expect(group.isSelected(1)).toBe(false);
  group.selectionMode = "selectOne"; group.selectedIndex = 1;
  expect(group.isSelected(1)).toBe(true); expect(group.isSelected(0)).toBe(false);
});

it("rejects invalid definitions and preserves selection by subitem identity through reordering", () => {
  expect(() => new NSEToolbarItemGroup({ identifier: "x", label: "X", subitems: [subitems[0], subitems[0]] })).toThrow(/identifier/);
  expect(() => new NSEToolbarItemGroup({ identifier: "x", label: "X", subitems, minimumWidth: -1 })).toThrow();
  const group = new NSEToolbarItemGroup({ identifier: "reorder", label: "Reorder", subitems });
  group.selectedIndex = 0;
  group.subitems = [subitems[1], subitems[0]];
  expect(group.selectedIndex).toBe(1); expect(group.isSelected(1)).toBe(true);
  group.subitems = [subitems[1]];
  expect(group.selectedIndex).toBe(-1);
  expect(() => group.setSelected(true, 1)).toThrow(RangeError);
  expect(() => { group.selectionMode = "unknown" as never; }).toThrow();
  expect(() => { group.controlRepresentation = "unknown" as never; }).toThrow();
});

it("validates and dispatches subitem commands with their exact payload and updates group selection", async () => {
  const group = new NSEToolbarItemGroup({ identifier: "commands", label: "Alignment", subitems });
  const { execute, runtime } = mount(group, true);
  expect(await runtime.commands.validate("group.left", "left-payload")).toMatchObject({ enabled: true });
  const left = screen.getByRole("button", { name: "Left" });
  await waitFor(() => expect((left as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByRole("button", { name: "Right" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(left);
  await waitFor(() => expect(execute).toHaveBeenCalledWith("left", "left-payload"));
  await waitFor(() => expect(group.selectedIndex).toBe(0));
  expect(left.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Right" }));
  expect(execute).toHaveBeenCalledTimes(1);
});

it("resolves authored actions and uses the same group after changing its representation", async () => {
  const group = new NSEToolbarItemGroup({ identifier: "actions", label: "View", subitems: subitems.map(({ commandId: _command, ...item }) => ({ ...item, action: item.id === "left" ? "chooseLeft" : "chooseRight" })), selectionMode: "momentary" });
  const { execute } = mount(group);
  const right = screen.getByRole("button", { name: "Right" });
  await waitFor(() => expect((right as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(right);
  await waitFor(() => expect(group.selectedIndex).toBe(1));
  expect(group.isSelected(1)).toBe(false);
  act(() => { group.controlRepresentation = "collapsed"; });
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  const left = await screen.findByRole("option", { name: "Left" });
  fireEvent.click(left);
  await waitFor(() => expect(execute).toHaveBeenCalledWith("left", "left-payload"));
  expect(group.selectedIndex).toBe(0);
  expect(group.isSelected(0)).toBe(false);
});

it("supports keyboard movement within expanded groups without dispatching on focus", async () => {
  const group = new NSEToolbarItemGroup({ identifier: "keyboard", label: "Alignment", subitems });
  const { execute } = mount(group);
  const left = screen.getByRole("button", { name: "Left" }), right = screen.getByRole("button", { name: "Right" });
  await waitFor(() => expect((right as HTMLButtonElement).disabled).toBe(false));
  left.focus(); fireEvent.keyDown(left, { key: "ArrowRight" });
  expect(document.activeElement).toBe(right);
  fireEvent.keyDown(right, { key: "Home" });
  expect(document.activeElement).toBe(left);
  expect(execute).not.toHaveBeenCalled();
});

it("does not change selection when command validation refuses a newly clicked subitem", async () => {
  let denied = false;
  const group = new NSEToolbarItemGroup({ identifier: "stale-validation", label: "Alignment", subitems });
  const { execute } = mount(group, () => denied);
  const right = screen.getByRole("button", { name: "Right" });
  await waitFor(() => expect((right as HTMLButtonElement).disabled).toBe(false));
  denied = true;
  await act(async () => { fireEvent.click(right); });
  expect(execute).not.toHaveBeenCalled();
  expect(group.selectedIndex).toBe(-1);
  expect(group.isSelected(1)).toBe(false);
});

it("does not commit a late selection after its toolbar renderer unmounts", async () => {
  const group = new NSEToolbarItemGroup({ identifier: "late-selection", label: "Alignment", subitems });
  const { execute, view } = mount(group);
  let finish!: () => void;
  execute.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const left = screen.getByRole("button", { name: "Left" });
  await waitFor(() => expect((left as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(left);
  await waitFor(() => expect(execute).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => { finish(); });
  expect(group.selectedIndex).toBe(-1);
});

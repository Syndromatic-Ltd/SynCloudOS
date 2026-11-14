import React from "react";
import { action, actionRef, useAction, type NSEActionReference, type NSEActionOptions } from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSEPopUpButton } from "../../src/NSE/Menus/NSEPopUpButton";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";
import type { MenuActionEntry } from "../../src/NSE/Menus/menuTypes";
import type { NSEToolbarActionItem } from "../../src/NSE/Toolbars/toolbarTypes";
import { NSEMenu } from "../../src/NSE/Menus/NSEMenu";
import { NSEToolbarController } from "../../src/NSE/Toolbars/NSEToolbarController";
import type { NSEMenuOptions } from "../../src/NSE/Menus/menuTypes";
import type { NSEToolbarControllerOptions } from "../../src/NSE/Toolbars/toolbarTypes";

class Controller {
  @action choose(id: string) { return id.length; }
  @action async count(n: number) { return `${n}`; }
  @action empty() { return true; }
  value = 1;
  two(a: string, b: number) { return a + b; }
  private secret() {}
}
const choose = actionRef(Controller, "choose");
const typed: NSEActionReference<string, number> = choose;
void typed;
// @ts-expect-error References require callable methods.
actionRef(Controller, "value");
// @ts-expect-error Methods take at most one payload argument.
actionRef(Controller, "two");
// @ts-expect-error Private methods cannot be references.
actionRef(Controller, "secret");
// @ts-expect-error Unknown methods cannot be references.
actionRef(Controller, "missing");

function View() {
  const state = useAction(choose, "note");
  const unbound = useAction(choose);
  void unbound.perform("note");
  void state.perform();
  void state.perform("other").then(result => { if (result?.status === "executed") { const n: number = result.value; void n; } });
  // @ts-expect-error Bound payload must match the method.
  useAction(choose, 1);
  // @ts-expect-error Event payload must match the method.
  state.perform(1);
  // @ts-expect-error No-argument methods accept no payload.
  useAction(actionRef(Controller, "empty"), "oops");
  const awaited = useAction(actionRef(Controller, "count"), 2);
  void awaited.perform().then(result => { if (result?.status === "executed") { const s: string = result.value; void s; } });
  return <>
    <NSEButton title="Choose" action={choose} actionPayload="note" />
    <NSEButton title="Choose" imagePosition="imageOnly" action={choose} actionPayload="note" />
    {/* @ts-expect-error Button payload must match reference. */}
    <NSEButton title="Bad" action={choose} actionPayload={2} />
    {/* @ts-expect-error Icon payload must match reference. */}
    <NSEButton title="Bad" imagePosition="imageOnly" action={choose} actionPayload={2} />
    <NSEPopUpButton items={[]} action={choose} actionPayload="note" />
    {/* @ts-expect-error Picker payload must match reference. */}
    <NSEPopUpButton items={[]} action={choose} actionPayload={2} />
    <NSESegmentedControl aria-label="Choose" items={[]} selection={{mode:"momentary",selectedIds:new Set()}} action={choose} actionPayload="note" />
    {/* @ts-expect-error Segmented payload must match reference. */}
    <NSESegmentedControl aria-label="Choose" items={[]} selection={{mode:"momentary",selectedIds:new Set()}} action={choose} actionPayload={2} />
  </>;
}
void View;
const menu: MenuActionEntry<string> = { kind: "command", id: "choose", action: choose, payload: "note" };
// @ts-expect-error Menu payload must match reference.
const badMenu: MenuActionEntry<string> = { kind: "command", id: "choose", action: choose, payload: 2 };
const toolbar: NSEToolbarActionItem<string> = { kind: "command", id: "choose", action: choose, payload: "note", label: "Choose", paletteLabel: "Choose", icon: null };
// @ts-expect-error Toolbar payload must match reference.
const badToolbar: NSEToolbarActionItem<string> = { kind: "command", id: "choose", action: choose, payload: 2, label: "Choose", paletteLabel: "Choose", icon: null };
void [menu, badMenu, toolbar, badToolbar];
const options: NSEActionOptions<string, number> = { undo: { kind: "register", createAction(_context, result) {
  // @ts-expect-error Undo receives the declared result type.
  const s: string = result;
  void s;
  throw new Error("type fixture");
} } };
void options;
declare const menuOptions: Omit<NSEMenuOptions, "items" | "title">;
new NSEMenu({ ...menuOptions, title: "Menu", items: [{ action: choose, actionPayload: "note" }] });
// @ts-expect-error Authored menu items infer the reference payload without explicit generics.
new NSEMenu({ ...menuOptions, title: "Menu", items: [{ action: choose, actionPayload: 2 }] });
// @ts-expect-error Nested submenu payloads also retain the reference contract.
new NSEMenu({ ...menuOptions, title: "Menu", items: [{ title: "Sub", submenu: [{ action: choose, actionPayload: 2 }] }] });
declare const toolbarOptions: Omit<NSEToolbarControllerOptions, "items">;
new NSEToolbarController({ ...toolbarOptions, items: [{ kind: "command", id: "choose", action: choose, payload: "note", label: "Choose", paletteLabel: "Choose", icon: null }] });
// @ts-expect-error Toolbar catalogues infer and check each action payload.
new NSEToolbarController({ ...toolbarOptions, items: [{ kind: "command", id: "choose", action: choose, payload: 2, label: "Choose", paletteLabel: "Choose", icon: null }] });

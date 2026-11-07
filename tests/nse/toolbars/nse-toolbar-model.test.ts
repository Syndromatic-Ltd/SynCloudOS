import { describe, expect, it } from "vitest";
import { NSEToolbar } from "../../../src/NSE/Toolbars/NSEToolbar";
import { NSETitlebarAccessoryViewController } from "../../../src/NSE/Application/NSETitlebarAccessoryViewController";
import { nseUnowned } from "../../../src/NSE/Controllers/ownership";
import type { NSEToolbarItem } from "../../../src/NSE/Toolbars/toolbarTypes";

const items: readonly NSEToolbarItem[] = [
  { kind: "command", id: "add", commandId: "app:add", label: "Add", paletteLabel: "Add", icon: "+" },
  { kind: "command", id: "remove", commandId: "app:remove", label: "Remove", paletteLabel: "Remove", icon: "-" },
  { kind: "flexible-space", id: "space" },
];

describe("NSEToolbar (NSToolbar)", () => {
  it("shows its default items and edits them before it is in a window", () => {
    const toolbar = new NSEToolbar({ identifier: "sample", items, defaultItemIdentifiers: ["add", "space"] });
    expect(toolbar.itemIdentifiers).toEqual(["add", "space"]);
    expect(toolbar.items.map((item) => item.id)).toEqual(["add", "space"]);
    expect(toolbar.displayMode).toBe("iconAndLabel");
    expect(toolbar.sizeMode).toBe("regular");
    toolbar.insertItem("remove", 1);
    expect(toolbar.itemIdentifiers).toEqual(["add", "remove", "space"]);
    toolbar.removeItem(0);
    expect(toolbar.itemIdentifiers).toEqual(["remove", "space"]);
    toolbar.displayMode = "iconOnly";
    toolbar.sizeMode = "small";
    expect(toolbar.displayMode).toBe("iconOnly");
    expect(toolbar.sizeMode).toBe("small");
    toolbar.isVisible = false;
    expect(toolbar.isVisible).toBe(false);
  });

  it("rejects unknown, duplicate and disallowed identifiers", () => {
    expect(() => new NSEToolbar({ identifier: "", items, defaultItemIdentifiers: [] })).toThrow(/identifier/);
    expect(() => new NSEToolbar({ identifier: "t", items: [...items, items[0]!], defaultItemIdentifiers: [] })).toThrow(/same identifier/);
    expect(() => new NSEToolbar({ identifier: "t", items, defaultItemIdentifiers: ["missing"] })).toThrow(/no item "missing"/);
    expect(() => new NSEToolbar({ identifier: "t", items, defaultItemIdentifiers: ["remove"], allowedItemIdentifiers: ["add"] })).toThrow(/does not allow/);
    const toolbar = new NSEToolbar({ identifier: "t", items, defaultItemIdentifiers: ["add"], allowedItemIdentifiers: ["add", "space"] });
    expect(() => toolbar.insertItem("remove", 0)).toThrow(/does not allow "remove"/);
    expect(() => toolbar.insertItem("space", 5)).toThrow(RangeError);
    expect(() => toolbar.removeItem(3)).toThrow(RangeError);
  });

  it("runs the customisation palette only when it allows customisation and is in a window", () => {
    expect(() => new NSEToolbar({ identifier: "t", items, defaultItemIdentifiers: [] }).runCustomizationPalette()).toThrow(/does not allow user customisation/);
    const toolbar = new NSEToolbar({ identifier: "t", items, defaultItemIdentifiers: [], allowsUserCustomization: true });
    expect(() => toolbar.runCustomizationPalette()).toThrow(/not in a window/);
    expect(toolbar.customizationPaletteIsRunning).toBe(false);
  });

  it("notifies observers when it changes", () => {
    const toolbar = new NSEToolbar({ identifier: "t", items, defaultItemIdentifiers: ["add"] });
    let changes = 0;
    const stop = toolbar.subscribe(() => { changes += 1; });
    toolbar.insertItem("space", 1);
    toolbar.isVisible = false;
    toolbar.isVisible = false;
    stop();
    expect(changes).toBe(2);
  });
});

describe("NSETitlebarAccessoryViewController", () => {
  it("defaults to the bottom of the title bar and validates its layout attribute", () => {
    const accessory = new NSETitlebarAccessoryViewController({ owner: nseUnowned });
    expect(accessory.layoutAttribute).toBe("bottom");
    accessory.layoutAttribute = "leading";
    expect(accessory.layoutAttribute).toBe("leading");
    expect(() => { accessory.layoutAttribute = "top" as never; }).toThrow(/leading, trailing or bottom/);
    accessory.isHidden = true;
    expect(accessory.isHidden).toBe(true);
  });
});

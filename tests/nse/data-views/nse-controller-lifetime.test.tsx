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

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { StrictMode, useEffect, useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NSEArrayController,
  NSETreeController,
  useNSEArrayController,
  useNSETreeController,
} from "../../../src/NSE/Controllers";
import type { NSEDataViewAdapter } from "../../../src/NSE/DataViews/Core";
import {
  NSECollectionView,
  createListCollectionLayout,
  type NSECollectionViewItemProps,
} from "../../../src/NSE/DataViews/Collection";
import { NSEOutline } from "../../../src/NSE/DataViews/Outline";
import { SynCloudOSLifecycleError } from "../../../src/SynCloudOS/ErrorManager/lifecycleError";

interface Account { readonly id: string; readonly name: string; readonly closed?: boolean }

const accounts: readonly Account[] = [
  { id: "current", name: "Current" },
  { id: "savings", name: "Savings" },
  { id: "isa", name: "ISA" },
];

const layout = createListCollectionLayout(40);
const renderItem = ({ item }: NSECollectionViewItemProps<Account, string>) => <span>{item.name}</span>;
const accountId = (account: Account) => account.id;
const accountName = (account: Account) => account.name;
const selection = { mode: "multiple", allowsEmpty: true } as const;

function AccountList({ controller }: { readonly controller: NSEArrayController<Account, string> }) {
  // An inline adapter: a new object on every render around the same controller.
  return (
    <NSECollectionView
      aria-label="Accounts"
      adapter={{ controller, idForItem: accountId, labelForItem: accountName }}
      layout={layout}
      renderItem={renderItem}
    />
  );
}

/** The pattern behind `Controller "open-account" is disposed.`: StrictMode
 * replays the cleanup, which disposes the memoised controller for good. */
function NaiveAccounts({ onController }: { readonly onController: (controller: NSEArrayController<Account, string>) => void }) {
  const controller = useMemo(() => new NSEArrayController<Account, string>({
    id: "open-account",
    content: accounts,
    getId: accountId,
    selection,
  }), []);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => onController(controller));
  return <AccountList controller={controller} />;
}

function ManagedAccounts({ id = "open-account", onController }: {
  readonly id?: string;
  readonly onController: (controller: NSEArrayController<Account, string>) => void;
}) {
  const controller = useNSEArrayController<Account, string>({ id, content: accounts, getId: accountId, selection });
  useEffect(() => onController(controller));
  return <AccountList controller={controller} />;
}

const settle = () => act(async () => { await Promise.resolve(); });

function cell(name: string): HTMLElement {
  return screen.getByRole("gridcell", { name });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("controller lifetimes under React StrictMode", () => {
  it("keeps a view over a StrictMode-disposed controller inert instead of throwing from a click", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let controller: NSEArrayController<Account, string> | undefined;
    render(<StrictMode><NaiveAccounts onController={(value) => { controller = value; }} /></StrictMode>);
    await settle();

    const grid = screen.getByRole("grid", { name: "Accounts" });
    expect(controller?.isDisposed).toBe(true);
    expect(grid.getAttribute("aria-disabled")).toBe("true");
    expect(grid.tabIndex).toBe(-1);
    expect(cell("Savings").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("This content is no longer available.")).not.toBeNull();

    const activeBefore = grid.getAttribute("aria-activedescendant");
    expect(() => fireEvent.click(cell("Savings"))).not.toThrow();
    expect(() => fireEvent.keyDown(grid, { key: "ArrowDown" })).not.toThrow();
    expect(cell("Savings").getAttribute("aria-selected")).toBe("false");
    expect(grid.getAttribute("aria-activedescendant")).toBe(activeBefore);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("NSE_CONTROLLER_DISPOSED");
    expect(String(warn.mock.calls[0]?.[0])).toContain("open-account");

    // Imperative calls still fail loudly, with the documented contract.
    let thrown: unknown;
    try { controller?.select(["savings"]); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(SynCloudOSLifecycleError);
    const lifecycleError = thrown as SynCloudOSLifecycleError;
    expect(lifecycleError.code).toBe("NSE_CONTROLLER_DISPOSED");
    expect(lifecycleError.operation).toBe("select");
    expect(lifecycleError.resource).toEqual({ kind: "NSEArrayController", id: "open-account" });
    expect(lifecycleError.disposal?.reason).toBe("explicit");
    expect(lifecycleError.message).toContain("StrictMode");
  });

  it("keeps a hook-owned controller live through StrictMode and disposes it when the owner unmounts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let controller: NSEArrayController<Account, string> | undefined;
    const mounted = render(<StrictMode><ManagedAccounts onController={(value) => { controller = value; }} /></StrictMode>);
    await settle();

    const grid = screen.getByRole("grid", { name: "Accounts" });
    expect(grid.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(cell("Savings"));
    expect(controller?.getSnapshot().selection.selectedIds).toEqual(new Set(["savings"]));
    expect(cell("Savings").getAttribute("aria-selected")).toBe("true");
    expect(warn).not.toHaveBeenCalled();

    const owned = controller!;
    mounted.unmount();
    await settle();
    expect(owned.isDisposed).toBe(true);
    expect(owned.disposalReason).toBe("owner-unmounted");
    let thrown: unknown;
    try { owned.select(["isa"]); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(SynCloudOSLifecycleError);
    expect((thrown as SynCloudOSLifecycleError).disposal?.reason).toBe("owner-unmounted");
    expect((thrown as SynCloudOSLifecycleError).message).toContain("unmounted");
  });

  it("replaces a hook-owned controller only when its id changes, disposing the previous one", async () => {
    const seen: NSEArrayController<Account, string>[] = [];
    const record = (value: NSEArrayController<Account, string>) => { if (seen.at(-1) !== value) seen.push(value); };
    const mounted = render(<StrictMode><ManagedAccounts onController={record} /></StrictMode>);
    await settle();
    mounted.rerender(<StrictMode><ManagedAccounts onController={record} /></StrictMode>);
    await settle();
    expect(seen).toHaveLength(1);

    mounted.rerender(<StrictMode><ManagedAccounts id="other-account" onController={record} /></StrictMode>);
    await settle();
    expect(seen).toHaveLength(2);
    expect(seen[0]?.disposalReason).toBe("owner-unmounted");
    expect(seen[1]?.isDisposed).toBe(false);
    expect(seen[1]?.id).toBe("other-account");
    fireEvent.click(cell("ISA"));
    expect(seen[1]?.getSnapshot().selection.selectedIds).toEqual(new Set(["isa"]));
  });

  it("keeps a hook-owned tree controller live through StrictMode", async () => {
    interface Folder { readonly id: string; readonly name: string; readonly children: readonly Folder[] }
    const folders: readonly Folder[] = [{ id: "inbox", name: "Inbox", children: [] }, { id: "sent", name: "Sent", children: [] }];
    let controller: NSETreeController<Folder, string> | undefined;
    function Folders() {
      const tree = useNSETreeController<Folder, string>({
        id: "folders",
        content: folders,
        getId: (folder) => folder.id,
        getChildren: (folder) => folder.children,
        withChildren: (folder, children) => ({ ...folder, children }),
        selection,
      });
      useEffect(() => { controller = tree; });
      return <NSEOutline aria-label="Folders" controller={tree} idForItem={(folder) => folder.id} childrenForItem={(folder) => folder.children} labelForItem={(folder) => folder.name} isExpandable={() => false} />;
    }
    const mounted = render(<StrictMode><Folders /></StrictMode>);
    await settle();
    fireEvent.click(screen.getByRole("treeitem", { name: /Sent/ }));
    expect(controller?.getSnapshot().selection.selectedIds).toEqual(new Set(["sent"]));

    const owned = controller!;
    mounted.unmount();
    await settle();
    expect(owned.disposalReason).toBe("owner-unmounted");
  });
});

describe("data views over a disposed controller", () => {
  it("turns an outline inert when its tree controller is disposed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = new NSETreeController<Account, string>({
      id: "accounts-tree",
      content: accounts,
      getId: accountId,
      getChildren: () => [],
      withChildren: (account) => account,
      selection,
    });
    render(<NSEOutline aria-label="Accounts" controller={controller} idForItem={accountId} childrenForItem={() => []} labelForItem={accountName} isExpandable={() => false} />);
    act(() => controller.dispose());

    const tree = screen.getByRole("tree", { name: "Accounts" });
    expect(tree.getAttribute("aria-disabled")).toBe("true");
    expect(tree.tabIndex).toBe(-1);
    expect(screen.getByRole("treeitem", { name: /Savings/ }).getAttribute("aria-disabled")).toBe("true");
    expect(() => fireEvent.click(screen.getByRole("treeitem", { name: /Savings/ }))).not.toThrow();
    expect(() => fireEvent.keyDown(tree, { key: " " })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("NSE_CONTROLLER_DISPOSED");
  });

  it("adopts a new adapter object for the same controller without resetting the view", () => {
    const controller = new NSEArrayController<Account, string>({ id: "accounts", content: accounts, getId: accountId, selection });
    const adapter = (closedIds: ReadonlySet<string>): NSEDataViewAdapter<Account, string> => ({
      controller,
      idForItem: accountId,
      labelForItem: accountName,
      isItemDisabled: (account) => closedIds.has(account.id),
    });
    const view = (closedIds: ReadonlySet<string>) => (
      <NSECollectionView aria-label="Accounts" adapter={adapter(closedIds)} layout={layout} renderItem={renderItem} />
    );
    const mounted = render(view(new Set()));
    const grid = screen.getByRole("grid", { name: "Accounts" });
    fireEvent.click(cell("Current"));
    // Keyboard focus moves without selecting, so only the view knows it.
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(cell("Savings").getAttribute("data-focused")).toBe("true");

    mounted.rerender(view(new Set()));
    expect(cell("Savings").getAttribute("data-focused")).toBe("true");

    mounted.rerender(view(new Set(["isa"])));
    expect(cell("Savings").getAttribute("data-focused")).toBe("true");
    expect(cell("ISA").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(cell("ISA"));
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["current"]));
  });
});

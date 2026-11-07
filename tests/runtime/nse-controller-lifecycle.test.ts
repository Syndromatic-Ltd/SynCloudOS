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
  NSEArrayController,
  NSEDictionaryController,
  NSEObjectController,
  NSETreeController,
} from "../../src/NSE/Controllers";
import { SynCloudOSLifecycleError } from "../../src/SynCloudOS/ErrorManager/lifecycleError";

function list(ownerSignal?: AbortSignal) {
  return new NSEArrayController<string, string>({ id: "list", content: ["a", "b"], getId: (value) => value, ownerSignal });
}

function lifecycleErrorOf(action: () => unknown): SynCloudOSLifecycleError {
  try {
    action();
  } catch (error) {
    if (error instanceof SynCloudOSLifecycleError) return error;
    throw error;
  }
  throw new Error("Expected a SynCloudOSLifecycleError.");
}

describe("NSE controller lifecycle", () => {
  it("reports disposal through isDisposed, disposalReason and onDispose listeners", () => {
    const controller = list();
    const listener = vi.fn();
    const removed = vi.fn();
    const unsubscribe = controller.onDispose(removed);
    controller.onDispose(listener);
    expect(unsubscribe()).toBe(true);
    expect(controller.isDisposed).toBe(false);
    expect(controller.disposalReason).toBeUndefined();

    controller.dispose();
    expect(controller.isDisposed).toBe(true);
    expect(controller.disposalReason).toBe("explicit");
    expect(listener).toHaveBeenCalledExactlyOnceWith("explicit");
    expect(removed).not.toHaveBeenCalled();

    controller.dispose();
    expect(listener).toHaveBeenCalledOnce();
    const late = vi.fn();
    expect(controller.onDispose(late)()).toBe(false);
    expect(late).not.toHaveBeenCalled();
  });

  it("disposes when its owner signal aborts and records the reason", () => {
    const owner = new AbortController();
    const controller = list(owner.signal);
    const listener = vi.fn();
    controller.onDispose(listener);
    owner.abort(new DOMException("Owner went away.", "AbortError"));
    expect(controller.isDisposed).toBe(true);
    expect(controller.disposalReason).toBe("owner-signal-aborted");
    expect(listener).toHaveBeenCalledExactlyOnceWith("owner-signal-aborted");

    const error = lifecycleErrorOf(() => controller.setContent(["c"]));
    expect(error.disposal?.reason).toBe("owner-signal-aborted");
    expect(error.operation).toBe("setContent");
  });

  it("refuses an owner signal that has already aborted", () => {
    const owner = new AbortController();
    owner.abort(new DOMException("Already gone.", "AbortError"));
    expect(() => list(owner.signal)).toThrow(expect.objectContaining({ name: "AbortError", message: "Already gone." }));
  });

  it("stops listening to its owner signal once disposed explicitly", () => {
    const owner = new AbortController();
    const controller = list(owner.signal);
    controller.dispose();
    owner.abort();
    expect(controller.disposalReason).toBe("explicit");
  });

  it("throws a lifecycle error naming the controller, operation and disposal", () => {
    const controller = list();
    controller.dispose();
    const error = lifecycleErrorOf(() => controller.select(["a"]));
    expect(error.name).toBe("SynCloudOSLifecycleError");
    expect(error.code).toBe("NSE_CONTROLLER_DISPOSED");
    expect(error.resource).toEqual({ kind: "NSEArrayController", id: "list" });
    expect(error.operation).toBe("select");
    expect(error.disposal?.reason).toBe("explicit");
    expect(error.message).toBe("Cannot call NSEArrayController.select() after disposal.");
    expect(Object.isFrozen(error.resource)).toBe(true);
  });

  it("gives every controller family the same lifecycle contract", () => {
    const owner = new AbortController();
    const tree = new NSETreeController<{ id: string; children: readonly never[] }, string>({
      id: "tree",
      content: [{ id: "root", children: [] }],
      getId: (node) => node.id,
      getChildren: (node) => node.children,
      withChildren: (node) => node,
      ownerSignal: owner.signal,
    });
    const object = new NSEObjectController({ id: "object", content: { total: 1 }, ownerSignal: owner.signal });
    const dictionary = new NSEDictionaryController({ id: "dictionary", content: { value: 1 }, ownerSignal: owner.signal });
    owner.abort();

    expect(lifecycleErrorOf(() => tree.select(["root"]))).toMatchObject({ resource: { kind: "NSETreeController", id: "tree" }, operation: "select" });
    expect(lifecycleErrorOf(() => object.setField("total", 2))).toMatchObject({ resource: { kind: "NSEObjectController", id: "object" }, operation: "setField" });
    expect(lifecycleErrorOf(() => dictionary.setContentDictionary({ value: 2 }))).toMatchObject({ resource: { kind: "NSEDictionaryController", id: "dictionary" }, operation: "setContentDictionary" });
    for (const controller of [tree, object, dictionary]) expect(controller.disposalReason).toBe("owner-signal-aborted");
  });
});

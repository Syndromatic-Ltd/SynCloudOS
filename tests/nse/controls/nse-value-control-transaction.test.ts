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
  NSEValueControlCompensationError,
  NSEValueControlUnknownStateError,
  commitUndoableValue,
} from "../../../src/NSE/Controls/Values/valueControlTransaction";
import type { NSEUndoManagerPort } from "../../../src/NSE/Controls/Values/valueControlTypes";

function manager(options: {
  readonly reserve?: NSEUndoManagerPort["reserve"];
} = {}) {
  const cancel = vi.fn();
  return {
    isExecuting: false,
    register: vi.fn(),
    reserve: options.reserve ?? (() => ({ commit: vi.fn(), cancel })),
    cancel,
  };
}

describe("commitUndoableValue", () => {
  it.each([false, true])("does not invoke an unproven inverse when a setter throws (mutated: %s)", (mutates) => {
    const calls: number[] = [];
    let value = 1;
    const undo = manager();
    expect(() => commitUndoableValue({
      manager: undo,
      name: "Set value",
      previous: 1,
      next: 2,
      publish: (next) => {
        calls.push(next);
        if (mutates) value = next;
        throw new Error("setter rejected without acknowledging publication");
      },
    })).toThrow(NSEValueControlUnknownStateError);
    expect(calls).toEqual([2]);
    expect(value).toBe(mutates ? 2 : 1);
    expect(undo.cancel).toHaveBeenCalledOnce();
  });

  it("reserves before publishing and leaves the value untouched when reservation fails", () => {
    const publish = vi.fn();
    const reserveFailure = new Error("undo reservation rejected");
    const undo = manager({ reserve: () => { throw reserveFailure; } });
    expect(() => commitUndoableValue({ manager: undo, name: "Set value", previous: 1, next: 2, publish }))
      .toThrow(reserveFailure);
    expect(publish).not.toHaveBeenCalled();
  });

  it("compensates a known publication when undo admission fails", () => {
    let value = 1;
    const cancel = vi.fn();
    const undo = manager({ reserve: () => ({ commit: () => { throw new Error("undo commit rejected"); }, cancel }) });
    expect(() => commitUndoableValue({
      manager: undo,
      name: "Set value",
      previous: 1,
      next: 2,
      publish: (next) => { value = next; },
    })).toThrow(/undo commit rejected/i);
    expect(value).toBe(1);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("surfaces every failed controlled rollback instead of claiming a clean transaction", () => {
    const cancel = vi.fn();
    const undo = manager({ reserve: () => ({ commit: () => { throw new Error("undo commit rejected"); }, cancel }) });
    expect(() => commitUndoableValue({
      manager: undo,
      name: "Set value",
      previous: 1,
      next: 2,
      publish: (value) => {
        if (value === 1) throw new Error("setter rollback rejected");
      },
    })).toThrow(NSEValueControlCompensationError);
    expect(cancel).toHaveBeenCalledOnce();
  });
});

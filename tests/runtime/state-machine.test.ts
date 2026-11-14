import { describe, expect, it, vi } from "vitest";
import { canEnterState, defineStateMachine, nextState } from "../../src/Foundation/internal/StateMachine";

type Door = "closed" | "open" | "locked";
type Action = "open" | "close" | "lock" | "unlock";

const door = defineStateMachine<Door, Action>({
  initial: "closed",
  states: {
    closed: { open: "open", lock: "locked" },
    open: { close: "closed" },
    locked: { unlock: "closed" },
  },
});

describe("defineStateMachine", () => {
  it("moves on a legal event and tells each listener once", () => {
    const machine = door.create();
    const listener = vi.fn();
    machine.subscribe(listener);

    expect(machine.canSend("open")).toBe(true);
    expect(machine.send("open")).toBe("open");

    expect(machine.state).toBe("open");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("open", "closed", "open");
  });

  it("refuses an illegal event: null, the state kept, nobody told", () => {
    const machine = door.create("locked");
    const listener = vi.fn();
    machine.subscribe(listener);

    expect(machine.canSend("open")).toBe(false);
    expect(machine.send("open")).toBeNull();

    expect(machine.state).toBe("locked");
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not mistake an inherited property name for an event", () => {
    const machine = door.create();
    expect(machine.send("toString" as Action)).toBeNull();
    expect(nextState(door.definition, "constructor" as Door, "open")).toBeNull();
  });

  it("answers canEnter from the table, whatever the current state", () => {
    const machine = door.create("open");
    expect(machine.canEnter("closed", "locked")).toBe(true);
    expect(machine.canEnter("open", "locked")).toBe(false);
    expect(canEnterState(door.definition, "locked", "closed")).toBe(true);
  });

  it("delivers a move sent from inside a listener after the move that caused it", () => {
    const machine = door.create();
    const heard: string[] = [];
    machine.subscribe((state, previous) => {
      heard.push(`first ${previous}>${state}`);
      if (state === "open") expect(machine.send("close")).toBe("closed");
    });
    machine.subscribe((state, previous) => { heard.push(`second ${previous}>${state}`); });

    machine.send("open");

    expect(machine.state).toBe("closed");
    expect(heard).toEqual(["first closed>open", "second closed>open", "first open>closed", "second open>closed"]);
  });

  it("keeps working after a listener throws", () => {
    const machine = door.create();
    const stop = machine.subscribe(() => { throw new Error("listener failed"); });
    expect(() => machine.send("open")).toThrow("listener failed");
    expect(machine.state).toBe("open");
    stop();
    expect(machine.send("close")).toBe("closed");
  });

  it("stops telling a listener that unsubscribed", () => {
    const machine = door.create();
    const listener = vi.fn();
    machine.subscribe(listener)();
    machine.send("open");
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects a table that names an unknown state", () => {
    expect(() => defineStateMachine<Door, Action>({
      initial: "closed",
      states: { closed: { open: "ajar" as Door }, open: {}, locked: {} },
    })).toThrow(/unknown state "ajar"/u);
    expect(() => defineStateMachine<Door, Action>({ initial: "ajar" as Door, states: { closed: {}, open: {}, locked: {} } })).toThrow(/unknown state "ajar"/u);
    expect(() => door.create("ajar" as Door)).toThrow(/unknown state "ajar"/u);
  });

  it("shares one frozen table with pure callers", () => {
    expect(nextState(door.definition, "closed", "lock")).toBe("locked");
    expect(nextState(door.definition, "open", "lock")).toBeNull();
    expect(Object.isFrozen(door.definition.states.closed)).toBe(true);
  });
});

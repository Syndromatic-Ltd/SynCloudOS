import { describe, expect, it } from "vitest";
import {
  appLifecycleMachine,
  appLifecycleOperationStartStates,
  appReadinessByLifecycleState,
  canBeginAppLifecycleOperation,
  createAppLifecycleRules,
} from "../../src/SynCloudOS/AppManager/AppLifecycle";
import type { SynCloudOSAppLifecycleState } from "../../src/SynCloudOS/AppManager/appManagerTypes";
import { canEnterState } from "../../src/Foundation/internal/StateMachine";

type State = SynCloudOSAppLifecycleState;
const states: State[] = ["registered", "idle", "loading", "ready", "launching", "active", "suspended", "failed", "closed", "disabled"];

// The moves the runtime allowed before the table became a machine. This copy is the specification.
const allowed: Record<State, State[]> = {
  registered: ["idle", "loading", "disabled", "failed"],
  idle: ["loading", "launching", "disabled", "closed"],
  loading: ["ready", "failed", "closed"],
  ready: ["launching", "active", "suspended", "closed"],
  launching: ["active", "failed", "closed"],
  active: ["suspended", "closed", "failed"],
  suspended: ["launching", "active", "closed"],
  failed: ["loading", "closed"],
  closed: ["idle", "loading"],
  disabled: ["idle", "failed"],
};

describe("application lifecycle machine", () => {
  it("allows exactly the moves it always did, for every pair of states", () => {
    const rules = createAppLifecycleRules();
    for (const from of states) for (const to of states) {
      const expected = from === to || allowed[from].includes(to);
      expect(Boolean(rules.canTransition(from, to)), `${from} -> ${to}`).toBe(expected);
      expect(canEnterState(appLifecycleMachine.definition, from, to), `table ${from} -> ${to}`).toBe(allowed[from].includes(to));
    }
  });

  it("names every move by what happens, one event per destination", () => {
    const destination = { prepare: "idle", enable: "idle", load: "loading", loaded: "ready", launch: "launching", activate: "active", suspend: "suspended", close: "closed", fail: "failed", disable: "disabled" };
    for (const from of states) {
      for (const [event, to] of Object.entries(appLifecycleMachine.definition.states[from])) {
        expect(to, `${from} --${event}-->`).toBe(destination[event as keyof typeof destination]);
      }
    }
    const machine = appLifecycleMachine.create();
    expect(machine.state).toBe("registered");
    expect(machine.send("launch")).toBeNull();
    expect(machine.send("load")).toBe("loading");
    expect(machine.send("loaded")).toBe("ready");
    expect(machine.send("launch")).toBe("launching");
    expect(machine.send("activate")).toBe("active");
  });

  it("lets each operation begin from the states it always could", () => {
    const begin = {
      launch: ["registered", "idle", "ready", "suspended"],
      activate: ["registered", "idle", "ready", "suspended"],
      suspend: ["active"],
      close: ["active", "suspended", "ready", "idle", "failed", "registered"],
    } as const;
    for (const operation of ["launch", "activate", "suspend", "close"] as const) {
      for (const state of states) {
        expect(canBeginAppLifecycleOperation(operation, state), `${operation} from ${state}`).toBe((begin[operation] as readonly State[]).includes(state));
      }
    }
  });

  it("only lets an operation begin where the table can reach its end state", () => {
    const end = { launch: "active", activate: "active", suspend: "suspended", close: "closed" } as const;
    const reachable = (from: State, to: State) => {
      const seen = new Set<State>([from]);
      for (const queue = [from]; queue.length;) {
        const at = queue.shift()!;
        for (const next of Object.values(appLifecycleMachine.definition.states[at])) {
          if (next === to) return true;
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      return false;
    };
    for (const [operation, starts] of Object.entries(appLifecycleOperationStartStates)) {
      for (const start of starts) expect(reachable(start, end[operation as keyof typeof end]), `${operation} from ${start}`).toBe(true);
    }
  });

  it("gives readiness per state, leaving the resting states to keep what they had", () => {
    expect(appReadinessByLifecycleState).toEqual({
      disabled: "cold", failed: "failed", loading: "loading", ready: "ready", launching: "ready", active: "ready", suspended: "ready",
    });
  });
});

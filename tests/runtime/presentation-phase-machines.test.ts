import { describe, expect, it, vi } from "vitest";
import { createRootRuntimeManager } from "../../src/SynCloudOS/RootRuntime/RootRuntimeManager";
import { systemStartupPhaseMachine } from "../../src/SynCloudOS/RootRuntime/startupPhaseMachine";
import { nextState, type StateMachineDefinition } from "../../src/Foundation/internal/StateMachine";
import { folderSplitPhaseMachine } from "../../src/Webspring/folderSplitPhaseMachine";

function expectTable<S extends string, E extends string>(definition: StateMachineDefinition<S, E>, table: Record<S, Record<E, S | null>>) {
  expect(Object.keys(definition.states).sort()).toEqual(Object.keys(table).sort());
  for (const [state, moves] of Object.entries(table) as Array<[S, Record<E, S | null>]>) {
    for (const [event, next] of Object.entries(moves) as Array<[E, S | null]>) {
      expect(nextState(definition, state, event), `${state} --${event}-->`).toBe(next);
    }
  }
}

describe("system startup phase machine", () => {
  it("has exactly these moves", () => {
    expect(systemStartupPhaseMachine.definition.initial).toBe("booting");
    expectTable(systemStartupPhaseMachine.definition, {
      booting: { presentationPending: "material", presentationReady: "complete" },
      material: { presentationPending: null, presentationReady: "complete" },
      complete: { presentationPending: "material", presentationReady: null },
    });
  });

  it("drives the root runtime's startup: material, then complete, each told once", async () => {
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const phases: string[] = [];
    const manager = createRootRuntimeManager({
      browser: { getLocation: () => ({ pathname: "/", search: "", hash: "" }), getDocument: () => null } as never,
      scheduler: { setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout: vi.fn() },
      startBrowserRouting: vi.fn(), stopBrowserRouting: vi.fn(), boot: vi.fn(), resolveAppearance: () => "light",
    });
    const stop = manager.start(phase => phases.push(phase));
    for (const timer of [...timers].sort((a, b) => a.delay - b.delay)) timer.callback();
    await Promise.resolve(); await Promise.resolve();
    expect(phases).toEqual(["material", "complete"]);
    stop();
  });
});

describe("folder split phase machine", () => {
  it("has exactly these moves, and never reopens", () => {
    expect(folderSplitPhaseMachine.definition.initial).toBe("closed");
    expectTable(folderSplitPhaseMachine.definition, {
      closed: { part: "open", beginClose: null },
      open: { part: null, beginClose: "closing" },
      closing: { part: null, beginClose: null },
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { beginMultiSwitchSettlement, multiSwitchSettlementMachine } from "../../src/SynCloudOS/LaunchServices/multiSwitchSettlement";
import { nextState } from "../../src/SynCloudOS/Statechart/StateMachine";

/** A clock whose frames and timers run only when the test says so. */
function manualClock() {
  let nextHandle = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  return {
    frames, timers,
    clock: {
      requestAnimationFrame: (callback: () => void) => { frames.set(nextHandle, callback); return nextHandle++; },
      cancelAnimationFrame: (handle: unknown) => { frames.delete(handle as number); },
      setTimeout: (callback: () => void, delay: number) => { timers.set(nextHandle, { callback, delay }); return nextHandle++; },
      clearTimeout: (handle: unknown) => { timers.delete(handle as number); },
    },
    frame() { const [[handle, callback]] = [...frames]; frames.delete(handle); callback(); },
    timeout() { const [[handle, timer]] = [...timers]; timers.delete(handle); timer.callback(); },
  };
}

describe("MultiSwitch settlement machine", () => {
  it("has exactly these moves", () => {
    const table = {
      awaitingFirstFrame: { framePainted: "awaitingPresentationFrame", timedOut: null, cancel: "finished" },
      awaitingPresentationFrame: { framePainted: "settling", timedOut: null, cancel: "finished" },
      settling: { framePainted: null, timedOut: "finished", cancel: "finished" },
      finished: { framePainted: null, timedOut: null, cancel: null },
    } as const;
    for (const [state, moves] of Object.entries(table)) for (const [event, next] of Object.entries(moves)) {
      expect(nextState(multiSwitchSettlementMachine.definition, state as keyof typeof table, event as "cancel"), `${state} --${event}-->`).toBe(next);
    }
  });

  it("waits two frames, then the settle time, holding one handle at a time", () => {
    const manual = manualClock();
    const onTimedOut = vi.fn();
    const settlement = beginMultiSwitchSettlement({ clock: manual.clock, settleAfterMs: 900, stillSwitching: () => true, onTimedOut });

    expect(settlement.state).toBe("awaitingFirstFrame");
    expect([manual.frames.size, manual.timers.size]).toEqual([1, 0]);
    manual.frame();
    expect(settlement.state).toBe("awaitingPresentationFrame");
    expect([manual.frames.size, manual.timers.size]).toEqual([1, 0]);
    manual.frame();
    expect(settlement.state).toBe("settling");
    expect([manual.frames.size, manual.timers.size]).toEqual([0, 1]);
    expect([...manual.timers.values()][0].delay).toBe(900);
    expect(onTimedOut).not.toHaveBeenCalled();
    manual.timeout();
    expect(settlement.state).toBe("finished");
    expect(onTimedOut).toHaveBeenCalledTimes(1);
  });

  it.each(["awaitingFirstFrame", "awaitingPresentationFrame", "settling"] as const)("releases the handle held in %s when cancelled", (state) => {
    const manual = manualClock();
    const onTimedOut = vi.fn();
    const settlement = beginMultiSwitchSettlement({ clock: manual.clock, settleAfterMs: 900, stillSwitching: () => true, onTimedOut });
    while (settlement.state !== state) manual.frame();

    settlement.cancel();
    settlement.cancel();

    expect(settlement.state).toBe("finished");
    expect([manual.frames.size, manual.timers.size]).toEqual([0, 0]);
    expect(onTimedOut).not.toHaveBeenCalled();
  });

  it.each([1, 2])("stops at frame %i when the switch is no longer current", (frame) => {
    const manual = manualClock();
    let current = true;
    const onTimedOut = vi.fn();
    const settlement = beginMultiSwitchSettlement({ clock: manual.clock, settleAfterMs: 900, stillSwitching: () => current, onTimedOut });
    for (let passed = 1; passed < frame; passed += 1) manual.frame();
    current = false;
    manual.frame();

    expect(settlement.state).toBe("finished");
    expect([manual.frames.size, manual.timers.size]).toEqual([0, 0]);
    expect(onTimedOut).not.toHaveBeenCalled();
  });

  it("lets the handler of the timeout cancel without effect", () => {
    const manual = manualClock();
    const settlement = beginMultiSwitchSettlement({ clock: manual.clock, settleAfterMs: 1, stillSwitching: () => true, onTimedOut: () => settlement.cancel() });
    manual.frame(); manual.frame();
    expect(() => manual.timeout()).not.toThrow();
    expect(settlement.state).toBe("finished");
  });
});

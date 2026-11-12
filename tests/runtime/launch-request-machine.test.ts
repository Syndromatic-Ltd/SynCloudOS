import { describe, expect, it } from "vitest";
import { advanceLaunchRequest, isLaunchRequestStep, launchRequestMachine, launchRequestPhase, type LaunchRequestPhase, type LaunchRequestStep } from "../../src/SynCloudOS/LaunchServices/launchRequestMachine";
import { nextState } from "../../src/Foundation/internal/StateMachine";
import { createRuntimeHarness, createTestBundle, createTestRuntime } from "./helpers";

const steps: LaunchRequestStep[] = ["requested", "queued", "deferred", "started", "authorised", "loading", "ready", "complete", "failed", "cancelled"];

// Each phase and the steps that may follow it. A step names the phase it leads to.
const follows: Record<LaunchRequestPhase, LaunchRequestStep[]> = {
  new: ["requested", "queued"],
  requested: ["queued", "deferred", "started", "failed", "cancelled"],
  queued: ["deferred", "started", "failed", "cancelled"],
  deferred: ["queued", "deferred", "started", "failed", "cancelled"],
  started: ["authorised", "failed", "cancelled"],
  authorised: ["loading", "failed", "cancelled"],
  loading: ["ready", "failed", "cancelled"],
  ready: ["complete", "failed", "cancelled"],
  complete: [],
  failed: [],
  // Two owners may each report the same cancellation.
  cancelled: ["cancelled"],
};

describe("launch request machine", () => {
  it("has exactly these moves, for every phase and step", () => {
    for (const phase of Object.keys(follows) as LaunchRequestPhase[]) for (const step of steps) {
      expect(nextState(launchRequestMachine.definition, phase, step), `${phase} --${step}-->`).toBe(follows[phase].includes(step) ? step : null);
    }
  });

  it("covers every sequence the launch suites produce", () => {
    const observed: Array<[LaunchRequestPhase, LaunchRequestStep]> = [
      ["new", "requested"], ["new", "queued"], ["requested", "started"], ["requested", "failed"], ["requested", "deferred"],
      ["queued", "started"], ["queued", "cancelled"], ["started", "authorised"], ["authorised", "loading"], ["loading", "ready"],
      ["loading", "cancelled"], ["ready", "complete"], ["ready", "failed"], ["ready", "cancelled"], ["cancelled", "cancelled"],
    ];
    for (const [phase, step] of observed) expect(nextState(launchRequestMachine.definition, phase, step), `${phase} --${step}-->`).toBe(step);
  });

  it("tracks a request and reports a step that is out of order without moving", () => {
    const request = {};
    expect(launchRequestPhase(request)).toBe("new");
    expect(advanceLaunchRequest(request, "requested")).toEqual({ legal: true, previous: "new", phase: "requested" });
    expect(advanceLaunchRequest(request, "started")).toEqual({ legal: true, previous: "requested", phase: "started" });
    expect(advanceLaunchRequest(request, "ready")).toEqual({ legal: false, previous: "started", phase: "started" });
    expect(launchRequestPhase(request)).toBe("started");
    expect(launchRequestPhase({})).toBe("new");
  });

  it("tells steps from annotations", () => {
    expect(steps.every(isLaunchRequestStep)).toBe(true);
    expect(["coalesced", "staged", "multiswitch.begin", "multiswitch.complete", "preload.requested", "retry.requested"].some(isLaunchRequestStep)).toBe(false);
  });

  it("records an ordinary launch in order, with no out-of-order note", async () => {
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const harness = createRuntimeHarness(runtime);
    harness.ConfigurationProfiles.setAccessMode("public");
    const appId = "com.example.request-machine";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }));
    harness.LaunchServices.openApp(appId, { source: "developer" });
    for (let attempt = 0; attempt < 200 && runtime.store.getSnapshot().lifecycle[appId] !== "active"; attempt += 1) await new Promise<void>(resolve => setTimeout(resolve, 5));
    await new Promise<void>(resolve => setTimeout(resolve, 20));

    const history = harness.LaunchServices.getHistory().filter((record: { appId: string }) => record.appId === appId);
    const actions = history.map((record: { action: string }) => record.action).filter(isLaunchRequestStep);
    const byTime = [...history].sort((a: { at: number }, b: { at: number }) => a.at - b.at).map((record: { action: string }) => record.action).filter(isLaunchRequestStep);
    expect(new Set(actions)).toEqual(new Set(["requested", "started", "authorised", "loading", "ready", "complete"]));
    expect(byTime.indexOf("requested")).toBeLessThan(byTime.indexOf("complete"));
    expect(history.flatMap((record: { notes: string[] }) => record.notes).filter((note: string) => note.startsWith("Out of order"))).toEqual([]);
    await runtime.dispose("test");
  });
});

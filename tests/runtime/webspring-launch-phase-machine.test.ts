import { describe, expect, it } from "vitest";
import { sendWebspringLaunchPhase, webspringLaunchPhaseMachine, type WebspringLaunchPhaseEvent } from "../../src/SynCloudOS/WebspringState/launchPhaseMachine";
import type { SynCloudOSWebspringState } from "../../src/SynCloudOS/WebspringState/webspringStateTypes";
import { nextState } from "../../src/SynCloudOS/Statechart/StateMachine";
import { createRuntimeHarness, createTestBundle, createTestRuntime } from "./helpers";

type Phase = SynCloudOSWebspringState["launchPhase"];
const phases: Phase[] = ["idle", "staging", "launching", "covered", "returning"];
const events: WebspringLaunchPhaseEvent[] = ["stage", "cancelStage", "launch", "cancelLaunch", "cover", "beginReturn", "finishReturn", "reset"];

// What each writer did before the table existed: most moved from any phase, two only from their own.
const expected = (phase: Phase, event: WebspringLaunchPhaseEvent): Phase | null => {
  switch (event) {
    case "stage": return "staging";
    case "launch": return "launching";
    case "cover": return "covered";
    case "beginReturn": return "returning";
    case "finishReturn": case "reset": return "idle";
    case "cancelStage": return phase === "staging" ? "idle" : null;
    case "cancelLaunch": return phase === "launching" ? "idle" : null;
  }
};

describe("Webspring launch phase machine", () => {
  it("has exactly the moves the writers made, for every phase and event", () => {
    for (const phase of phases) for (const event of events) {
      expect(nextState(webspringLaunchPhaseMachine.definition, phase, event), `${phase} --${event}-->`).toBe(expected(phase, event));
    }
    expect(Object.keys(webspringLaunchPhaseMachine.definition.states).sort()).toEqual([...phases].sort());
  });

  it("writes the draft only for a legal move", () => {
    const draft = { webspring: { launchPhase: "launching" as Phase } };
    expect(sendWebspringLaunchPhase(draft, "cancelStage")).toBe(false);
    expect(draft.webspring.launchPhase).toBe("launching");
    expect(sendWebspringLaunchPhase(draft, "cover")).toBe(true);
    expect(draft.webspring.launchPhase).toBe("covered");
  });

  it("drives the phase through WebspringState as before", () => {
    const runtime = createTestRuntime();
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.phase";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }));
    const phase = () => runtime.store.getSnapshot().webspring.launchPhase;
    const webspring = runtime.webspring;

    webspring.setLoadingApp(appId, "t1");
    expect(phase()).toBe("staging");
    webspring.setLaunching(null);
    expect(phase()).toBe("staging");
    webspring.setLaunching(appId, "t1");
    expect(phase()).toBe("launching");
    webspring.setLoadingApp(null);
    expect(phase()).toBe("launching");
    expect(runtime.store.getSnapshot().webspring.launchingAppId).toBe(appId);
    webspring.coverForApp(appId, "t1");
    expect(phase()).toBe("covered");
    const returnId = webspring.beginReturn(appId);
    expect(phase()).toBe("returning");
    webspring.finishReturn("some-other-return");
    expect(phase()).toBe("returning");
    webspring.finishReturn(returnId);
    expect(phase()).toBe("idle");
    webspring.setLoadingApp(appId, "t2");
    webspring.setLoadingApp(null);
    expect(phase()).toBe("idle");
    webspring.setLaunching(appId, "t3");
    webspring.setLaunching(null);
    expect(phase()).toBe("idle");
    webspring.coverForApp(appId, "t4");
    webspring.coverForApp(null);
    expect(phase()).toBe("idle");
  });
});

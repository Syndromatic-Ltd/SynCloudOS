import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextState } from "../../src/Foundation/internal/StateMachine";
import { pageTurnPhaseAfter, pageTurnPhaseMachine, type PageTurnEvent } from "../../src/NSE/Page/pageTurnPhaseMachine";
import { PageTurnController } from "../../src/NSE/Page/pageTurnController";
import type { NSEPagePhase } from "../../src/NSE/Page/nsePageTypes";
import { dragPhaseMachine, type DragPhaseEvent } from "../../src/SynCloudOS/Drag/dragPhaseMachine";
import type { DragPhase } from "../../src/SynCloudOS/Drag/dragTypes";

describe("page turn phase machine", () => {
  const lands: Record<PageTurnEvent, NSEPagePhase> = { startTurn: "turning", startDrag: "dragging", settle: "settling", complete: "idle", cancel: "canceling", tear: "torn", reset: "idle" };
  const phases: NSEPagePhase[] = ["idle", "dragging", "turning", "settling", "canceling", "torn", "reduced"];

  it("honours every call from every phase", () => {
    expect(Object.keys(pageTurnPhaseMachine.definition.states).sort()).toEqual([...phases].sort());
    for (const phase of phases) for (const event of Object.keys(lands) as PageTurnEvent[]) {
      expect(pageTurnPhaseAfter(phase, event), `${phase} --${event}-->`).toBe(lands[event]);
    }
  });

  it("drives the controller's phase", () => {
    const controller = new PageTurnController();
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(controller.startDrag().phase).toBe("dragging");
    expect(controller.settle({ progress: 1 }).phase).toBe("settling");
    expect(controller.complete().phase).toBe("idle");
    expect(controller.startTurn().phase).toBe("turning");
    expect(controller.cancel().phase).toBe("canceling");
    expect(controller.tear().phase).toBe("torn");
    expect(controller.reset().phase).toBe("idle");
    controller.dispose();
  });
});

describe("drag phase machine", () => {
  it("has exactly these moves", () => {
    const table: Record<DragPhase, Record<DragPhaseEvent, DragPhase | null>> = {
      dragging: { enterDestination: "over-destination", drop: null, accept: null, refuse: null },
      "over-destination": { enterDestination: "over-destination", drop: "dropping", accept: null, refuse: null },
      dropping: { enterDestination: null, drop: null, accept: "completed", refuse: "cancelled" },
      completed: { enterDestination: null, drop: null, accept: null, refuse: null },
      cancelled: { enterDestination: null, drop: null, accept: null, refuse: null },
    };
    expect(dragPhaseMachine.definition.initial).toBe("dragging");
    for (const [phase, moves] of Object.entries(table) as Array<[DragPhase, Record<DragPhaseEvent, DragPhase | null>]>) {
      for (const [event, next] of Object.entries(moves) as Array<[DragPhaseEvent, DragPhase | null]>) {
        expect(nextState(dragPhaseMachine.definition, phase, event), `${phase} --${event}-->`).toBe(next);
      }
    }
  });
});

// Each phase field has one file that may name its next value. Anywhere else, a literal write is a bypass.
describe("phase fields are written only through their machines", () => {
  const sources = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
  const guards: Array<{ name: string; roots: string[]; write: RegExp; owners: string[] }> = [
    { name: "Webspring launch phase", roots: ["src"], write: /\blaunchPhase\s*=(?!=)/, owners: ["src/SynCloudOS/WebspringState/launchPhaseMachine.ts"] },
    { name: "drag phase", roots: ["src/SynCloudOS/Drag"], write: /\bphase:\s*"(dragging|over-destination|dropping|completed|cancelled)"/, owners: ["src/SynCloudOS/Drag/dragPhaseMachine.ts"] },
    { name: "page turn phase", roots: ["src/NSE/Page/pageTurnController.ts"], write: /\bphase:\s*"/, owners: [] },
    { name: "folder split phase", roots: ["src/Webspring/WebspringFolderSplitPresentation.tsx"], write: /setPhase\(\s*"/, owners: [] },
    { name: "system startup phase", roots: ["src/App.tsx", "src/SynCloudOS/RootRuntime"], write: /(setStartupPhase|onStartupPhase)\(\s*"/, owners: [] },
    { name: "MultiSwitch settlement", roots: ["src/SynCloudOS/LaunchServices/LaunchServices.ts"], write: /\b(firstFrame|presentationFrame|settleTimer)\s*=(?!=)/, owners: [] },
  ];

  for (const guard of guards) {
    it(guard.name, () => {
      const files = guard.roots.flatMap((root) => /\.tsx?$/.test(root) ? [root] : sources(root)).filter((file) => !guard.owners.includes(file));
      expect(files.length).toBeGreaterThan(0);
      const bypasses = files.flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) => guard.write.test(line) ? [`${file}:${index + 1}`] : []));
      expect(bypasses).toEqual([]);
    });
  }
});

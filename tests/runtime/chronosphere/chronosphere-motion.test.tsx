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
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ animations: {} as Record<string, unknown> }));
vi.mock("../../../src/NSE/Chronosphere/chronosphereEnvironment", () => ({ useChronosphereEnvironment: () => ({ animations: host.animations, signal: new AbortController().signal }) }));
import { useChronosphereMotion } from "../../../src/NSE/Chronosphere/useChronosphereMotion";

type Stage = "entering" | "open" | "leaving";
function Presentation({ step = 0, stage = "entering", enabled = true, onExit }: { step?: number; stage?: Stage; enabled?: boolean; onExit?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useChronosphereMotion(root, enabled, stage, onExit);
  return <div ref={root}>
    {[0, 1].map(index => <div key={index} className="chronosphere-card" style={{ transform: `translateY(${step * -20 - index * 100}px)`, opacity: 1 - step * 0.2, filter: `blur(${step}px)` }} />)}
    <div className="chronosphere-curtain" style={{ transform: stage === "open" ? "translateY(106%)" : "translateY(0)" }} />
    <div className="chronosphere-controls" style={{ opacity: stage === "open" ? 1 : 0 }} />
  </div>;
}

let root: Root, container: HTMLDivElement;
let owner: { dispose: ReturnType<typeof vi.fn> };
let plays: { target: HTMLElement; definition: Record<string, any>; handle: { dispose: ReturnType<typeof vi.fn> }; settle(state: string): void }[];
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  owner = { dispose: vi.fn() }; plays = [];
  host.animations = {
    acquireOwner: vi.fn(() => owner),
    animate: vi.fn((target: HTMLElement, definition: Record<string, any>, animationOwner: unknown) => {
      expect(animationOwner).toBe(owner);
      let settle!: (result: { state: string }) => void;
      const handle = { dispose: vi.fn(), progress: 0.5, finished: new Promise(resolve => { settle = resolve; }) };
      plays.push({ target, definition, handle, settle: state => settle({ state }) });
      return handle;
    }),
  };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("Chronosphere app-owned choreography", () => {
  it.each(["failed", "cancelled"])("returns once if the current exit animation settles %s", async state => {
    const onExit = vi.fn();
    await act(async () => root.render(<Presentation onExit={onExit} />));
    await act(async () => root.render(<Presentation stage="open" onExit={onExit} />));
    const entry = plays.find(play => play.target.classList.contains("chronosphere-curtain"))!;
    await act(async () => root.render(<Presentation stage="leaving" onExit={onExit} />));
    const exit = plays.filter(play => play.target.classList.contains("chronosphere-curtain")).at(-1)!;
    await act(async () => entry.settle(state));
    expect(onExit).not.toHaveBeenCalled();
    await act(async () => exit.settle(state));
    expect(onExit).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Presentation stage="leaving" step={1} onExit={onExit} />));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("reverses a halfway entry from its sampled presentation before disposing the entry handle", async () => {
    const onExit = vi.fn();
    await act(async () => root.render(<Presentation onExit={onExit} />));
    await act(async () => root.render(<Presentation stage="open" onExit={onExit} />));
    const entry = plays.find(play => play.target.classList.contains("chronosphere-curtain"))!;
    const halfway = "matrix3d(0.7, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 1, 0, 0, 420, -600, 1)";
    let presentation = halfway;
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(element => element === entry.target ? { transform: presentation, opacity: "1", filter: "none" } as CSSStyleDeclaration : getComputedStyle(element));
    entry.handle.dispose.mockImplementation(() => { presentation = "none"; });
    await act(async () => root.render(<Presentation stage="leaving" onExit={onExit} />));
    const exit = plays.filter(play => play.target.classList.contains("chronosphere-curtain")).at(-1)!;
    expect(exit.definition.animations[0].from).toBe(halfway);
    expect(entry.handle.dispose).toHaveBeenCalled();
    await act(async () => entry.settle("completed")); expect(onExit).not.toHaveBeenCalled();
    await act(async () => exit.settle("completed")); expect(onExit).toHaveBeenCalledTimes(1);
  });
  it.each(["entering", "leaving"] as const)("returns once when exit occurs before any foreground recession from %s", async stage => {
    const onExit = vi.fn();
    await act(async () => root.render(<Presentation stage={stage} onExit={onExit} />));
    await act(async () => root.render(<Presentation stage="leaving" onExit={onExit} />));
    expect(onExit).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Presentation stage="leaving" step={1} onExit={onExit} />));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
  it("keeps every card's animation collision identity distinct and preserves original curves", async () => {
    await act(async () => root.render(<Presentation />));
    await act(async () => root.render(<Presentation step={1} stage="open" />));
    const cards = plays.filter(play => play.target.classList.contains("chronosphere-card"));
    expect(cards).toHaveLength(6);
    const ids = new Map(cards.map(play => [play.target, play.definition.animations[0].targetId]));
    expect(new Set(ids.values()).size).toBe(2);
    for (const play of cards) {
      expect(play.definition.duration).toBe(0.52);
      expect(play.definition.timing).toEqual(play.definition.animations[0].keyPath === "transform" ? { kind: "cubic-bezier", x1: 0.26, y1: 0.64, x2: 0.2, y2: 1 } : "ease");
      expect(play.definition.fill).toBe("none");
    }
    const curtain = plays.find(play => play.target.classList.contains("chronosphere-curtain"))!;
    expect(curtain.definition.duration).toBe(0.9);
    expect(curtain.definition.timing).toEqual({ kind: "cubic-bezier", x1: 0.32, y1: 0.72, x2: 0.16, y2: 1 });
  });
  it("finishes exit only when the current curtain animation completes", async () => {
    const onExit = vi.fn();
    await act(async () => root.render(<Presentation onExit={onExit} />));
    await act(async () => root.render(<Presentation stage="open" onExit={onExit} />));
    const entryCurtain = plays.find(play => play.target.classList.contains("chronosphere-curtain"))!;
    await act(async () => root.render(<Presentation stage="leaving" onExit={onExit} />));
    const exitCurtain = plays.filter(play => play.target.classList.contains("chronosphere-curtain")).at(-1)!;
    expect(exitCurtain.definition.duration).toBe(0.62);
    expect(exitCurtain.definition.timing).toEqual({ kind: "cubic-bezier", x1: 0.5, y1: 0, x2: 0.2, y2: 1 });
    expect(entryCurtain.handle.dispose).toHaveBeenCalled();
    await act(async () => entryCurtain.settle("completed"));
    expect(onExit).not.toHaveBeenCalled();
    await act(async () => exitCurtain.settle("completed"));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(exitCurtain.handle.dispose).toHaveBeenCalled();
  });
  it("drops all plays and owner leases when choreography is disabled, and exits once", async () => {
    const onExit = vi.fn();
    await act(async () => root.render(<Presentation onExit={onExit} />));
    await act(async () => root.render(<Presentation step={1} stage="open" onExit={onExit} />));
    await act(async () => root.render(<Presentation step={1} stage="leaving" enabled={false} onExit={onExit} />));
    for (const play of plays) expect(play.handle.dispose).toHaveBeenCalled();
    expect(owner.dispose).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Presentation step={2} stage="leaving" enabled={false} onExit={onExit} />));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

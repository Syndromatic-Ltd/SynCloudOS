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

import { describe, expect, it } from "vitest";
import { SynCloudOSRuntimeStore } from "../../src/SynCloudOS/Runtime/RuntimeStore";
import { subscribeLifecycleTransitions } from "../../src/SynCloudOS/Runtime/lifecycleTransitions";

type Transition = readonly [appId: string, state: string | undefined, previous: string | undefined];

function storeWith(lifecycle: Record<string, string>) {
  return new SynCloudOSRuntimeStore("runtime:lifecycle-transitions", { lifecycle: lifecycle as never });
}

describe("lifecycle transition subscription", () => {
  it("ignores publications that leave the lifecycle map untouched", () => {
    const store = storeWith({ a: "active", b: "suspended" });
    const transitions: Transition[] = [];
    subscribeLifecycleTransitions(store, (...transition) => transitions.push(transition));
    const lifecycle = store.getSnapshot().lifecycle;
    store.mutate((draft) => { draft.responsive.width = 1200; });
    expect(store.getSnapshot().lifecycle).toBe(lifecycle);
    expect(transitions).toEqual([]);
  });

  it("dispatches each changed, added and removed owner once, previous owners first", () => {
    const store = storeWith({ a: "active", b: "suspended", c: "active" });
    const transitions: Transition[] = [];
    subscribeLifecycleTransitions(store, (...transition) => transitions.push(transition));
    store.mutate((draft) => {
      draft.lifecycle.a = "suspended";
      delete draft.lifecycle.b;
      draft.lifecycle.d = "registered";
    });
    expect(transitions).toEqual([["a", "suspended", "active"], ["b", undefined, "suspended"], ["d", "registered", undefined]]);
  });

  it("treats a rewritten but identical lifecycle map as no transition", () => {
    const store = storeWith({ a: "active" });
    const transitions: Transition[] = [];
    subscribeLifecycleTransitions(store, (...transition) => transitions.push(transition));
    store.mutate((draft) => { draft.lifecycle = { ...draft.lifecycle }; });
    expect(transitions).toEqual([]);
  });

  it("does not replay a transition when a handler publishes re-entrantly", () => {
    const store = storeWith({ a: "active", b: "active" });
    const transitions: Transition[] = [];
    subscribeLifecycleTransitions(store, (appId, state, previous) => {
      transitions.push([appId, state, previous]);
      if (appId === "a" && state === "suspended") store.mutate((draft) => { draft.lifecycle.b = "suspended"; });
    });
    store.mutate((draft) => { draft.lifecycle.a = "suspended"; });
    store.mutate((draft) => { draft.responsive.width = 900; });
    expect(transitions).toEqual([["a", "suspended", "active"], ["b", "suspended", "active"]]);
  });

  it("stops dispatching after unsubscribe", () => {
    const store = storeWith({ a: "active" });
    const transitions: Transition[] = [];
    const unsubscribe = subscribeLifecycleTransitions(store, (...transition) => transitions.push(transition));
    unsubscribe();
    store.mutate((draft) => { draft.lifecycle.a = "closed"; });
    expect(transitions).toEqual([]);
  });
});

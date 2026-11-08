import { expect, it, vi } from "vitest";
import { createMountedNetworkPort } from "../../../src/SynCloudOS/AppSDK/mountedNetworkPort";
import type { NetworkPathSnapshot } from "../../../src/FX/NetworkFX/internal/networkPort";
import { NWFXError } from "../../../src/FX/NetworkFX/public";
it("terminally revokes native subscription across access restoration and suppresses the saved old callback", () => {
  let allowed = true; let notify = () => {}; let deliver = (_path: NetworkPathSnapshot) => {};
  const dispose = vi.fn(); const owner = new AbortController();
  const port = createMountedNetworkPort({ currentPath: () => ({ status: "satisfied" }), subscribe: listener => { deliver = listener; return { dispose }; } }, owner.signal, () => ["network.read"], () => allowed, listener => { notify = listener; return () => {}; });
  const listener = vi.fn(); port.subscribe(listener); const old = deliver; const generation = port.generation;
  allowed = false; notify(); allowed = true; notify(); port.subscribe(listener); old({ status: "satisfied" });
  expect(listener).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledOnce(); expect(() => port.assertAccess(generation)).toThrow(NWFXError);
  deliver({ status: "unsatisfied" }); expect(listener).toHaveBeenCalledOnce(); owner.abort();
});
it("denies before browser access and preserves the bounded native monitor budget", () => {
  const owner = new AbortController(); let permissions: string[] = []; const adapter = { currentPath: vi.fn(), subscribe: vi.fn(() => ({ dispose: vi.fn() })) };
  const port = createMountedNetworkPort(adapter, owner.signal, () => permissions, () => true, () => () => {});
  expect(() => port.subscribe(() => {})).toThrow(NWFXError); expect(adapter.subscribe).not.toHaveBeenCalled(); permissions = ["network.read"];
  const subscriptions = Array.from({ length: 8 }, () => port.subscribe(() => {})); expect(() => port.subscribe(() => {})).toThrow(/limit/);
  subscriptions[0].dispose(); expect(() => port.subscribe(() => {})).not.toThrow(); owner.abort();
});

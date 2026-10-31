// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { NSEViewController, nseAttachView } from "../../src/NSE/Application/NSEViewController";
import type { NSEViewControllerFXClients } from "../../src/NSE/Application/viewControllerFX";

function ports(lifetime: AbortSignal) {
  const createIndex = vi.fn(() => { lifetime.throwIfAborted(); return { dispose() {} }; });
  return { createIndex, clients: { lumina: { createIndex } } as unknown as NSEViewControllerFXClients };
}

it("uses fresh mounted FX ports after a retained controller returns, leaving old ports retired", async () => {
  const owner = new AbortController(), firstMount = new AbortController(), secondMount = new AbortController();
  const first = ports(firstMount.signal), second = ports(secondMount.signal);
  const controller = new NSEViewController({ ownerSignal: owner.signal });
  const detach = controller[nseAttachView]({ element: document.createElement("div"), fx: first.clients });
  const oldFX = controller.fx;
  oldFX.lumina.createIndex(); expect(first.createIndex).toHaveBeenCalledOnce();
  detach(); await Promise.resolve(); firstMount.abort(new DOMException("Application mount lifecycle ended.", "AbortError"));
  const returned = controller[nseAttachView]({ element: document.createElement("div"), fx: second.clients });
  expect(controller.fx === oldFX).toBe(false);
  expect(() => controller.fx.lumina.createIndex()).not.toThrow(); expect(second.createIndex).toHaveBeenCalledOnce();
  expect(() => oldFX.lumina.createIndex()).toThrow("Application mount lifecycle ended.");
  returned(); await Promise.resolve(); owner.abort();
});

it("keeps the same FX facade when StrictMode replays the same live binding", async () => {
  const owner = new AbortController(), source = ports(owner.signal), element = document.createElement("div");
  const controller = new NSEViewController({ ownerSignal: owner.signal });
  const detach = controller[nseAttachView]({ element, fx: source.clients }); const original = controller.fx;
  detach(); const returned = controller[nseAttachView]({ element, fx: source.clients }); await Promise.resolve();
  expect(controller.fx).toBe(original); expect(controller.isViewVisible).toBe(true);
  returned(); await Promise.resolve(); owner.abort();
});

it("rebinds replacement ports even during a replay without constructing a new controller", async () => {
  const owner = new AbortController(), oldMount = new AbortController(), first = ports(oldMount.signal), second = ports(owner.signal);
  const controller = new NSEViewController({ ownerSignal: owner.signal }), element = document.createElement("div");
  const detach = controller[nseAttachView]({ element, fx: first.clients }); const original = controller.fx;
  detach(); oldMount.abort(); const returned = controller[nseAttachView]({ element, fx: second.clients }); await Promise.resolve();
  expect(controller.fx === original).toBe(false); controller.fx.lumina.createIndex(); expect(second.createIndex).toHaveBeenCalledOnce();
  returned(); await Promise.resolve(); owner.abort();
});

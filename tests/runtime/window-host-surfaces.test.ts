import { describe, expect, it, vi } from "vitest";
import type { WindowHostEnvironment, WindowHostEvent, WindowSurfaceBinding } from "../../src/SynCloudOS/Windows/WindowHostEnvironment";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";

function fixture() {
  let listener: ((event: WindowHostEvent) => void) | undefined;
  let pending: ((binding: WindowSurfaceBinding) => void) | undefined;
  const bind = vi.fn<NonNullable<WindowHostEnvironment["bind"]>>(() => new Promise(resolve => { pending = resolve; }));
  const unbind = vi.fn<NonNullable<WindowHostEnvironment["unbind"]>>(async () => {});
  const host: WindowHostEnvironment = {
    capabilities: { nativeWindowControls: null, menuBar: "drawn", fullScreen: "stage", separateSurfaces: true },
    bind, unbind,
    requestFullScreen() {},
    subscribe(next) {
      listener = next;
      return () => { listener = undefined; };
    },
  };
  return {
    ...createWindowTestDependencies({ host }),
    bind, unbind,
    send(event: WindowHostEvent) { listener?.(event); },
    acknowledge(index = bind.mock.calls.length - 1) {
      const [windowId, { generation }] = bind.mock.calls[index]!;
      const binding = { windowId, generation, element: {} as HTMLElement };
      pending?.(binding);
      return binding;
    },
  };
}

describe("window host surface bindings", () => {
  it("commits only acknowledged bindings and ignores stale activation and loss", async () => {
    const f = fixture();
    try {
      const owner = f.manager.create(standardWindow("editor"));
      await f.manager.open(owner.id);
      const other = f.manager.create(standardWindow("other"));
      await f.manager.open(other.id);
      const detach = f.manager.detach(owner.id);
      expect(f.manager.detachedSurface(owner.id)).toBeNull();
      const first = f.acknowledge();
      await expect(detach).resolves.toBe(true);
      expect(f.manager.detachedSurface(owner.id)).toBe(first);
      await f.manager.reattach(owner.id);
      expect(f.unbind).toHaveBeenCalledWith(owner.id, first.generation);
      const detachAgain = f.manager.detach(owner.id);
      const second = f.acknowledge();
      await expect(detachAgain).resolves.toBe(true);
      f.manager.makeKey(other.id);
      f.send({ kind: "activated", windowId: owner.id, generation: first.generation });
      f.send({ kind: "surfaceLost", windowId: owner.id, generation: first.generation });
      expect(f.manager.snapshot().keyWindowControllerId).toBe(other.id);
      expect(f.manager.detachedSurface(owner.id)).toBe(second);
      f.send({ kind: "surfaceLost", windowId: owner.id, generation: second.generation });
      expect(f.manager.detachedSurface(owner.id)).toBeNull();
      expect(f.manager.select(owner.id)).toBe(owner);
    } finally {
      await f.cleanup();
    }
  });

  it("retires a pending binding when the window closes", async () => {
    const f = fixture();
    try {
      const owner = f.manager.create(standardWindow("editor"));
      await f.manager.open(owner.id);
      const detach = f.manager.detach(owner.id);
      await expect(f.manager.requestClose(owner.id, { reason: "control" })).resolves.toMatchObject({ outcome: "closed" });
      const binding = f.acknowledge();
      await expect(detach).resolves.toBe(false);
      expect(f.manager.detachedSurface(owner.id)).toBeNull();
      expect(f.unbind).toHaveBeenCalledWith(owner.id, binding.generation);
    } finally {
      await f.cleanup();
    }
  });
});

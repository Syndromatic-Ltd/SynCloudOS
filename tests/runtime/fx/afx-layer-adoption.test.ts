import { describe, expect, it, vi } from "vitest";
import {
  AFXLayer,
  type AFXFrameScheduler,
  type AFXLayerSnapshot,
  type AFXLayerSurface,
} from "../../../src/FX/AnimationFX/AFXLayer";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";

interface RecordingSurface extends AFXLayerSurface {
  readonly applied: AFXLayerSnapshot[];
  readonly children: RecordingSurface[];
  readonly attached: AFXLayerSurface[];
}

function createSurface(options: { readonly adoptsSublayers?: boolean } = {}): RecordingSurface {
  const applied: AFXLayerSnapshot[] = [];
  const children: RecordingSurface[] = [];
  const attached: AFXLayerSurface[] = [];
  const surface: RecordingSurface = {
    supportedProperties: [],
    supportsReplication: true,
    applied,
    children,
    attached,
    apply: (snapshot) => { applied.push(snapshot); },
    attach: (child) => { attached.push(child); },
    detach: vi.fn(),
    setMask: vi.fn(),
    dispose: vi.fn(),
  };
  if (options.adoptsSublayers !== false) {
    surface.createSublayerSurface = () => {
      const child = createSurface(options);
      children.push(child);
      return child;
    };
  }
  return surface;
}

const scheduler: AFXFrameScheduler = {
  now: () => 0,
  reducedMotion: false,
  suspended: false,
  requestFrame: () => () => {},
};

describe("argument-free layers", () => {
  it("start detached", () => {
    expect(new AFXLayer().isAttached).toBe(false);
  });

  it("attach when added to an attached layer, taking a surface from the parent", () => {
    const rootSurface = createSurface();
    const root = createAFXLayer(rootSurface, scheduler);
    const child = new AFXLayer();

    root.addSublayer(child);

    expect(child.isAttached).toBe(true);
    expect(rootSurface.children).toHaveLength(1);
    expect(rootSurface.attached).toEqual([rootSurface.children[0]]);
    expect(child.superlayer).toBe(root);
  });

  it("apply the property writes made before attaching once they attach", () => {
    const rootSurface = createSurface();
    const root = createAFXLayer(rootSurface, scheduler);
    const child = new AFXLayer();
    child.opacity = 0.4;
    child.clipsToBounds = true;

    root.addSublayer(child);

    const [childSurface] = rootSurface.children;
    const latest = childSurface.applied.at(-1);
    expect(latest?.opacity).toBe(0.4);
    expect(latest?.clipsToBounds).toBe(true);
  });

  it("stay detached inside a detached parent until that parent attaches", () => {
    const rootSurface = createSurface();
    const root = createAFXLayer(rootSurface, scheduler);
    const parent = new AFXLayer();
    const child = new AFXLayer();

    parent.addSublayer(child);

    expect(parent.isAttached).toBe(false);
    expect(child.isAttached).toBe(false);
    expect(rootSurface.children).toHaveLength(0);

    root.addSublayer(parent);

    expect(parent.isAttached).toBe(true);
    expect(child.isAttached).toBe(true);
    expect(rootSurface.children).toHaveLength(1);
    expect(rootSurface.children[0].children).toHaveLength(1);
    expect(rootSurface.children[0].attached).toEqual([rootSurface.children[0].children[0]]);
  });

  it("refuse work that needs a surface until they attach", async () => {
    const layer = new AFXLayer();

    expect(() => layer.addAnimation({ keyPath: "opacity" } as never)).toThrowError(expect.objectContaining({ name: "InvalidStateError" }));
    await expect(Promise.resolve().then(() => layer.render({ x: 0, y: 0, width: 4, height: 4 }))).rejects.toMatchObject({ name: "InvalidStateError" });
  });

  it("cannot be added to a detached layer after they attached elsewhere", () => {
    const root = createAFXLayer(createSurface(), scheduler);
    const attached = new AFXLayer();
    root.addSublayer(attached);

    expect(() => new AFXLayer().addSublayer(attached)).toThrow(/detached layer/);
  });

  it("report a surface that cannot adopt layers, pointing at createAFXLayer", () => {
    const root = createAFXLayer(createSurface({ adoptsSublayers: false }), scheduler);

    expect(() => root.addSublayer(new AFXLayer())).toThrow(/createAFXLayer/);
  });

  it("dispose with the tree they attached to", () => {
    const rootSurface = createSurface();
    const root = createAFXLayer(rootSurface, scheduler);
    const child = new AFXLayer();
    root.addSublayer(child);

    root.dispose();

    expect(rootSurface.dispose).toHaveBeenCalled();
    expect(rootSurface.children[0].dispose).toHaveBeenCalled();
    expect(() => child.addSublayer(new AFXLayer())).toThrowError(expect.objectContaining({ code: "AFX_LAYER_DISPOSED" }));
  });
});

describe("createAFXLayer", () => {
  it("builds the root of a host's surface tree, and a layer subclass when one is passed", () => {
    class MarkedLayer extends AFXLayer {}
    const surface = createSurface();

    const plain = createAFXLayer(surface, scheduler);
    const marked = createAFXLayer(MarkedLayer, createSurface(), scheduler);

    expect(plain.isAttached).toBe(true);
    expect(marked).toBeInstanceOf(MarkedLayer);
    expect(marked.isAttached).toBe(true);
  });

  it("releases the surface when the owner has already aborted", () => {
    const surface = createSurface();
    const owner = new AbortController();
    owner.abort();

    expect(() => createAFXLayer(surface, scheduler, { signal: owner.signal })).toThrow(/aborted/i);
    expect(surface.dispose).toHaveBeenCalledOnce();
  });
});

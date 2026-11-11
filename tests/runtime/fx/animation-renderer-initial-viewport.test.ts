import { expect, it } from "vitest";
import { AFXRenderer, type AFXRendererScene } from "../../../src/FX/AnimationFX/AFXRenderer";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { AFXTransaction } from "../../../src/FX/AnimationFX/AFXTransaction";

it.each([false, true])("submits the first viewport in CSS coordinates without a root anchor offset (reduced: %s)", reducedMotion => {
  const scenes: AFXRendererScene[] = [];
  const renderer = new AFXRenderer({ width: 2048, height: 1536,
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion, suspended: false },
    target: { render: scene => { scenes.push(scene); }, dispose() {} },
  });
  try {
    renderer.setViewport({ width: 1024, height: 768, pixelRatio: 2 });
    const layer = renderer.makeLayer();
    layer.frame = { x: 300, y: 400, width: 40, height: 30 };
    layer.contents = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255]) });
    renderer.render();
    const first = scenes.at(-1)!;
    expect(first).toMatchObject({ width: 1024, height: 768, pixelRatio: 2 });
    expect(first.quads[0].transform.values[12]).toBe(300);
    expect(first.quads[0].transform.values[13]).toBe(400);
    renderer.setViewport({ width: 1440, height: 1000, pixelRatio: 1 });
    const resized = scenes.at(-1)!;
    expect(resized.quads[0].transform.values[12]).toBe(300);
    expect(resized.quads[0].transform.values[13]).toBe(400);
  } finally { renderer.dispose(); }
});

it.each([false, true])("publishes a static root sublayer projection at the outer transaction boundary (reduced: %s)", reducedMotion => {
  const scenes: AFXRendererScene[] = [];
  const renderer = new AFXRenderer({ width: 1024, height: 768,
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion, suspended: false },
    target: { render: scene => { scenes.push(scene); }, dispose() {} },
  });
  try {
    renderer.setViewport({ width: 1024, height: 768, pixelRatio: 2 });
    const layer = renderer.makeLayer();
    layer.frame = { x: 300, y: 400, width: 40, height: 30 };
    layer.contents = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255]) });
    renderer.render();
    AFXTransaction.perform({ disableActions: true }, () => {
      AFXTransaction.perform({}, () => { renderer.layer.sublayerTransform = AFXTransform3D.translation(80, 90); });
      renderer.render();
      // A synchronous render inside an open transaction sees its last committed surfaces.
      expect(scenes.at(-1)!.quads[0].transform.values[12]).toBe(300);
    });
    renderer.render();
    expect(scenes.at(-1)!.quads[0].transform.values[12]).toBe(380);
    expect(scenes.at(-1)!.quads[0].transform.values[13]).toBe(490);
    renderer.setViewport({ width: 1440, height: 1000, pixelRatio: 1 });
    expect(scenes.at(-1)!.quads[0].transform.values[12]).toBe(380);
    expect(scenes.at(-1)!.quads[0].transform.values[13]).toBe(490);
  } finally { renderer.dispose(); }
});

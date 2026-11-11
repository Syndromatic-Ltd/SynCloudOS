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

import { expect, test } from "playwright/test";

test("AnimationFX spatial history and projective depth execute in real browsers", async ({ page }, testInfo) => {
  await page.goto("/tests/e2e/fixtures/fx-animation-spatial-browser.html");
  const result = await page.evaluate(async () => {
    const [animation, browser, graphics, host] = await Promise.all([
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter.ts"),
      import("/src/FX/GraphicsFX/public.ts"),
      import("/src/FX/AnimationFX/host.ts"),
    ]);
    let now = 0;
    const frames = new Set<(time: number) => void>();
    const state = new Set<() => void>();
    const scheduler = {
      now: () => now,
      reducedMotion: false,
      suspended: false,
      requestFrame(callback: (time: number) => void) {
        frames.add(callback);
        return () => frames.delete(callback);
      },
      subscribeState(callback: () => void) {
        state.add(callback);
        return () => state.delete(callback);
      },
    };
    const advance = (seconds: number) => {
      now += seconds;
      const callbacks = [...frames];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    };

    const replicatorElement = document.querySelector<HTMLElement>("#replicator")!;
    const replicator = host.createAFXLayer(
      animation.AFXReplicatorLayer,
      new browser.BrowserAnimationLayerSurface(replicatorElement),
      scheduler,
    );
    replicator.frame = { x: 0, y: 0, width: 432, height: 120 };
    replicator.instanceCount = 3;
    replicator.instanceDelay = 0.25;
    replicator.projectionMode = "projective";
    replicator.instanceTransform = animation.AFXTransform3D.perspective(360)
      .multiply(animation.AFXTransform3D.translation(64, 4, 18))
      .multiply(animation.AFXTransform3D.rotation(0.22, 0, 1, 0));

    const child = new animation.AFXShapeLayer();
    child.frame = { x: 16, y: 26, width: 52, height: 52 };
    child.path = graphics.GFXPath.rect({ x: 0, y: 0, width: 52, height: 52 });
    child.fillColour = graphics.GFXColour.rgba(0.95, 0.35, 0.22, 1);
    replicator.addSublayer(child);
    child.addAnimation(
      new animation.AFXBasicAnimation({
        targetId: "browser-spatial-opacity",
        keyPath: "opacity",
        from: 0,
        to: 1,
        animation: new animation.AFXAnimation({ duration: 1, timing: "linear", fill: "both" }),
      }),
      "opacity",
    );
    advance(0.25);
    advance(0.25);
    advance(0.25);

    const replicaNodes = [...replicatorElement.querySelectorAll<HTMLElement>("[data-afx-replica]")];
    const sourceNodes = [...replicatorElement.querySelectorAll<SVGGElement>("[data-afx-replica-source]")];
    const sourceOpacities = sourceNodes.map((node) => {
      const match = node.innerHTML.match(/opacity="([0-9.]+)"/u);
      return match ? Number(match[1]) : null;
    });

    const emitterElement = document.querySelector<HTMLElement>("#emitter")!;
    const emitter = host.createAFXLayer(
      animation.AFXEmitterLayer,
      new browser.BrowserAnimationLayerSurface(emitterElement),
      scheduler,
    );
    emitter.frame = { x: 0, y: 0, width: 432, height: 120 };
    emitter.seed = 91;
    emitter.maxParticles = 12;
    emitter.emitterMode = "points";
    emitter.emitterPosition = { x: 110, y: 58 };
    emitter.projectionMode = "projective";
    emitter.projectionTransform = animation.AFXTransform3D.perspective(240);
    emitter.renderMode = "backToFront";
    const image = new graphics.GFXImage({
      width: 4,
      height: 4,
      alpha: "straight",
      colourSpace: "srgb",
      data: new Uint8Array(64).fill(255),
    });
    const nested = new animation.AFXEmitterCell({
      contents: image,
      birthRate: 4,
      lifetime: 2,
      velocity: 36,
      emissionLatitude: -Math.PI / 4,
      scale: 2.5,
      renderOrder: 2,
    });
    emitter.emitterCells = [new animation.AFXEmitterCell({
      contents: image,
      birthRate: 2,
      lifetime: 2.5,
      velocity: 42,
      emissionLatitude: Math.PI / 4,
      scale: 3,
      childCells: [nested],
    })];
    emitter.startEmitting();
    advance(0.5);
    advance(0.5);
    const content = emitter.presentation.content;
    if (!content || content.kind !== "emitter") throw new Error("Emitter specimen did not project.");
    const particleNodes = [...emitterElement.querySelectorAll<SVGGElement>("[data-afx-particle]")];
    const output = {
      dpr: window.devicePixelRatio,
      preservesDepth: replicator.preservesDepth,
      transforms: replicaNodes.map((node) => node.style.transform),
      sourceOpacities,
      zPositions: content.particles.map((particle) => particle.zPosition),
      metadataDepths: particleNodes.map((node) => Number(node.dataset.afxZ)),
      renderOrders: particleNodes.map((node) => Number(node.dataset.afxRenderOrder)),
    };
    emitter.dispose();
    replicator.dispose();
    return output;
  });

  expect(result.preservesDepth).toBe(true);
  expect(result.transforms).toHaveLength(3);
  expect(result.transforms.every((value) => value.includes("matrix3d("))).toBe(true);
  expect(result.sourceOpacities).toEqual([0.75, 0.5, 0.25]);
  expect(result.zPositions.length).toBeGreaterThan(0);
  expect(result.zPositions).toEqual([...result.zPositions].sort((a, b) => a - b));
  expect(result.metadataDepths).toEqual(result.zPositions);
  expect(result.renderOrders.every(Number.isSafeInteger)).toBe(true);
  if (testInfo.project.name === "chromium-high-dpr") expect(result.dpr).toBe(2);
  await testInfo.attach(`afx-spatial-${testInfo.project.name}-dpr${result.dpr}`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

// @vitest-environment jsdom
import { expect, it } from "vitest";
import { NSEViewController, nseAttachView, nseUpdateTraits } from "../../src/NSE/Application/NSEViewController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { NSEAnimationContext } from "../../src/NSE/Animation/NSEAnimationContext";
import { createBrowserAnimationLayerHost } from "../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost";

it("animates the real backing layer under an animation group and settles its completion", async () => {
  const frames = new Set<(time: number) => void>(); let time = 0;
  const host = createBrowserAnimationLayerHost(document, { now: () => time, requestFrame(callback) { frames.add(callback); return () => { frames.delete(callback); }; }, reducedMotion: false, suspended: false });
  const element = document.createElement("div"); document.body.append(element);
  const controller = new NSEViewController({ owner: nseUnowned });
  controller[nseAttachView]({ element, bindLayer: (target, signal) => host.bind("layer", target, signal, { layout: "css" }) });
  let completed = false;
  NSEAnimationContext.runAnimationGroup(context => {
    context.duration = 0.4;
    controller.view.animator().alphaValue = 0.25;
  }, () => { completed = true; });
  expect(completed).toBe(false);
  expect(Number(element.style.opacity)).toBeGreaterThan(0.25);
  time = 0.5;
  for (const frame of [...frames]) frame(time);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(element.style.opacity).toBe("0.25");
  expect(completed).toBe(true);
  controller.dispose(); element.remove();
});

it("sets the view's final frame immediately under reduced motion", () => {
  const host = createBrowserAnimationLayerHost(document, { now: () => 0, requestFrame: () => () => {}, reducedMotion: true, suspended: false });
  const element = document.createElement("div"); document.body.append(element);
  const controller = new NSEViewController({ owner: nseUnowned });
  controller[nseAttachView]({ element, bindLayer: (target, signal) => host.bind("layer", target, signal, { layout: "css" }) });
  controller[nseUpdateTraits]({ reducedMotion: true, presentation: null });
  controller.view.animator().frame = { x: 30, y: 50, width: 80, height: 90 };
  expect(element.style.left).toBe("30px"); expect(element.style.top).toBe("50px");
  expect(element.style.width).toBe("80px"); expect(element.style.height).toBe("90px");
  controller.dispose(); element.remove();
});

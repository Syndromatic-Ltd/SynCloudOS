import { expect, it } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import * as crypto from "@syndromatic/syncloudos/fx/crypto";
import * as compression from "@syndromatic/syncloudos/fx/compression";
import { MFXAttitude as Base } from "@syndromatic/syncloudos/fx/motion";
import First, * as first from "./src/SynWare/First.app/Contents/index";
import Second, { Probe as SecondProbe } from "./src/SynWare/Second.app/Contents/index";
import firstInfo from "./src/SynWare/First.app/Contents/Info";
import secondInfo from "./src/SynWare/Second.app/Contents/Info";

it("runs plugin-bound classes with existing test hosts through application construction and async callbacks", async () => {
  expect(() => new Base()).toThrow("must be created by an application compiled");
  expect(first.Probe).not.toBe(SecondProbe);
  expect(first.Probe.identity()).toBe("com.example.first");
  expect(SecondProbe.identity()).toBe("com.example.second");
  expect(first.CRFXSHA256).toBe(crypto.CRFXSHA256);
  expect(first.CRFXP256).toBe(crypto.CRFXP256);
  expect(first.CPFXAlgorithm).toBe(compression.CPFXAlgorithm);
  const a = createSynWareTestHost({ application: First, manifest: { schemaVersion: 1, ...firstInfo }, document });
  const b = createSynWareTestHost({ application: Second, manifest: { schemaVersion: 1, ...secondInfo }, document });
  try {
    await a.render(); await b.render();
    const early = (a.application as First).early;
    expect(early).toBeInstanceOf(Base);
    expect(early.use()).toBe(a.appContext.runtimeInfo.id);
    expect((await first.afterAwait()).use()).toBe(a.appContext.runtimeInfo.id);
    expect((await first.afterTimer()).use()).toBe(a.appContext.runtimeInfo.id);
    await new Promise<void>(resolve => queueMicrotask(() => first.thirdParty(create => {
      expect(create().use()).toBe(a.appContext.runtimeInfo.id); resolve();
    })));
    expect((b.application as Second).early.use()).toBe(b.appContext.runtimeInfo.id);
    await a.dispose();
    expect(() => early.use()).toThrow(expect.objectContaining({ reason: "ended" }));
    expect(() => first.createProbe().use()).toThrow(expect.objectContaining({ reason: "notRunning" }));
  } finally { await a.dispose(); await b.dispose(); }
});

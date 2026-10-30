import { afterAll,beforeAll,expect,it } from "vitest";
import { act } from "react";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import SearchApplication from "./src/SynWare/Search.app/Contents/index";
import info from "./src/SynWare/Search.app/Contents/Info";
const reactEnvironment=globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean};
const previousActEnvironment=reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(()=>{reactEnvironment.IS_REACT_ACT_ENVIRONMENT=true;});
afterAll(()=>{if(previousActEnvironment===undefined)delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;else reactEnvironment.IS_REACT_ACT_ENVIRONMENT=previousActEnvironment;});

it("mounts the public class, action, binding, observer, task and outlet contracts", async () => {
  const host = createSynWareTestHost({ application: SearchApplication, manifest: { schemaVersion: 1, ...info }, document });
  host.adapters.credentials.allow();
  host.adapters.storage.local.allow();
  host.adapters.animation.allow();
  try {
    let view!:Awaited<ReturnType<typeof host.render>>;
    await act(async()=>{view=await host.render();});
    expect(view.container.querySelector('input[aria-label="Search"]')).not.toBeNull();
    expect(view.container.querySelector('output[aria-label="Search result"]')).not.toBeNull();
    const clear = Array.from(view.container.querySelectorAll("button")).find(button => button.textContent === "Clear search");
    expect(clear).toBeDefined();
    const input = view.container.querySelector<HTMLInputElement>('input[aria-label="Search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "hello");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("hello");
    expect(view.container.querySelector("output")?.textContent).toBe("HELLO");
    await act(async () => { clear!.click(); });
    expect(input.value).toBe("");
    expect(view.container.querySelector("output")?.textContent).toBe("");
  } finally { await act(async()=>{await host.dispose();}); }
});

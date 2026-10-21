// @vitest-environment jsdom
import React from "react";
import { createPortal } from "react-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineNSETheme, neutralNSETheme, NSEThemeProvider, useNSEAppearance, useNSETheme, useNSEThemeProjection, nseThemeSlot } from "../../src/NSE/Appearance";
import { resolveNSEHostTheme } from "../../src/SynCloudOSReact/themeSelection";
const base = { id: "com.test.theme", displayName: "Test" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Probe() { const theme = useNSETheme(); const appearance = useNSEAppearance(); return <output data-testid="probe">{JSON.stringify({theme:theme.id,...appearance})}</output>; }
function Portal() { const projection = useNSEThemeProjection(); return createPortal(<div data-testid="portal" {...projection}/>,document.body); }
describe("strict theme data and independent Appearance", () => {
  it.each(["URL(https://example.test/a)", "u\\72l(https://example.test/a)", 'image-set("https://example.test/a" 1x)', "url/**/(https://example.test/a)", "src(https://example.test/a)", "paint(untrusted)"])("rejects resource or executable token %s", value => {
    expect(() => defineNSETheme({ ...base, tokens: { light: { "--nse-image": value }, dark: {} } })).toThrow(/unsupported CSS/);
  });
  it("accepts scalar colours, gradients and safe variable arithmetic", () => {
    expect(() => defineNSETheme({ ...base, tokens: { light: { "--nse-size": "calc(var(--nse-base, 8px) * 2)", "--nse-paint": "linear-gradient(rgb(1 2 3 / .5), #fff)" }, dark: {} } })).not.toThrow();
  });

  it("rejects getters without invoking them, unknown fields, executable values, symbols and cycles", () => {
    const getter = vi.fn(); const accessor = {...base}; Object.defineProperty(accessor,"loader",{get:getter,enumerable:true});
    const cycle = {...base, extra: {} as unknown}; cycle.extra = cycle;
    for (const data of [accessor,{...base,unknown:true},{...base,loader:()=>null},{...base,[Symbol()]:1},cycle]) expect(()=>defineNSETheme(data as never)).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });
  it("captures deeply frozen token and motion data", () => {
    const data = {...base,tokens:{light:{"--nse-test":"red"},dark:{"--nse-test":"blue"}}}; const theme=defineNSETheme(data);
    data.tokens.light["--nse-test"]="green";
    expect(theme.tokens.light["--nse-test"]).toBe("red"); expect(Object.isFrozen(theme.tokens.light)).toBe(true);
    expect(theme.presentation.motion?.peerNavigation?.kind).toBe("none");
    expect(()=>defineNSETheme({...base,presentation:{...neutralNSETheme.presentation,motion:{peerNavigation:{kind:"slide",durationMs:501,easing:"linear"}}}})).toThrow();
  });
  it("keeps semantic slot geometry separate from artwork scale",()=>{
    expect(nseThemeSlot("button","bezel","normal")).toBe("button.bezel.normal");
    expect(()=>defineNSETheme({...base,recipes:[{slot:"button.bezel.normal.2x",recipeId:"private.2x"}]})).toThrow();
    expect(defineNSETheme({...base,recipes:[{slot:"button.bezel.normal",recipeId:"private.2x"}]}).recipes[0].recipeId).toBe("private.2x");
  });
  it("resolves an explicit catalogue identity and defaults to neutral rather than first theme",()=>{
    const theme=defineNSETheme(base); expect(resolveNSEHostTheme(undefined,[theme])).toBe(neutralNSETheme);
    expect(resolveNSEHostTheme(theme.id,[theme]).id).toBe(theme.id);
    expect(()=>resolveNSEHostTheme("com.test.missing",[theme])).toThrow();
    expect(()=>resolveNSEHostTheme(undefined,[theme,theme])).toThrow();
  });
  it("follows standalone auto system changes without replacing children or theme",()=>{
    let matches=false; const listeners=new Set<()=>void>();
    vi.stubGlobal("matchMedia",()=>({get matches(){return matches;},addEventListener:(_name:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_name:string,fn:()=>void)=>listeners.delete(fn)}));
    const theme=defineNSETheme(base); render(<NSEThemeProvider theme={theme}><Probe/><input data-testid="input" defaultValue="retained"/></NSEThemeProvider>);
    const input=screen.getByTestId("input"); expect(screen.getByTestId("probe").textContent).toContain('"resolved":"light"');
    act(()=>{matches=true;for(const fn of listeners)fn();});
    expect(screen.getByTestId("probe").textContent).toContain('"resolved":"dark"'); expect(screen.getByTestId("input")).toBe(input);
    expect(screen.getByTestId("probe").textContent).toContain(theme.id);
  });
  it("resets foreign CSS-only keys and font roles on nested hosts and portals without masking owned CSS",()=>{
    const outer=defineNSETheme({...base,styleTokenNames:["--nse-outer","--nse-shared","--nse-theme-font-body"],tokens:{light:{"--nse-outer":"red"},dark:{}}});
    const inner=defineNSETheme({id:"com.test.inner",displayName:"Inner",styleTokenNames:["--nse-shared"]});
    render(<NSEThemeProvider theme={outer} appearance="dark"><NSEThemeProvider theme={inner} appearance="light"><Portal/><Probe/></NSEThemeProvider></NSEThemeProvider>);
    const portal=screen.getByTestId("portal"); expect(portal.style.getPropertyValue("--nse-outer")).toBe("initial"); expect(portal.style.getPropertyValue("--nse-theme-font-body")).toBe("initial"); expect(portal.style.getPropertyValue("--nse-shared")).toBe("");
    expect(portal.dataset.nseTheme).toBe(inner.id); expect(portal.dataset.nseAppearance).toBe("light");
  });
});

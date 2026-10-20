import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEObject, observable, observe } from "../../src/NSE/Objects";
import {
  acceptApplicationHotUpdate,
  currentClass,
  registerApplicationHotModule,
  trackLiveApplicationObject,
  type ApplicationHotModuleRecord,
} from "../../src/SynCloudOS/AppSDK/applicationHotReload";

const hot = { invalidate: vi.fn() };
const stops: Array<() => void> = [];
let scope = 0;
/** Each test gets its own module identities, since the runtime remembers modules across evaluations. */
const scoped = (id: string) => `${id}#${scope}`;

beforeEach(() => { scope += 1; });

let refreshHost: Record<string, unknown> = {};

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  refreshHost = {};
});

function evaluate(id: string, classes: ApplicationHotModuleRecord["classes"], signatures: Record<string, string>, defaultClass = "App") {
  registerApplicationHotModule(hot, { id: scoped(id), defaultClass, classes, signatures, ignoredExports: ["default", "Window"], refreshHost });
}

function track(object: object, appName: string, relaunch: (notice: string) => void) {
  stops.push(trackLiveApplicationObject(object, { appName, relaunch }));
}

class NotesAppV1 extends NSEApplication {}
class NotesAppV2 extends NSEApplication {}

class NotesWindowV1 extends NSEObject {
  @observable accessor title = "Untitled";
}

class NotesWindowV2 extends NSEObject {
  @observable accessor title = "Untitled";
  shout() { return this.title.toUpperCase(); }
}

describe("application hot reload", () => {
  it("gives live instances the new class's methods and keeps their state when the field signature is unchanged", () => {
    const relaunch = vi.fn();
    evaluate("notes.tsx", { App: NotesAppV1, Window: NotesWindowV1 }, { App: "a", Window: "w" });
    const window = new NotesWindowV1();
    window.title = "Draft";
    track(window, "Notes", relaunch);
    const observed = vi.fn();
    stops.push(observe(window, observed));

    evaluate("notes.tsx", { App: NotesAppV2, Window: NotesWindowV2 }, { App: "a", Window: "w" });

    expect(window).toBeInstanceOf(NotesWindowV2);
    expect((window as unknown as NotesWindowV2).shout()).toBe("DRAFT");
    expect((window as unknown as NotesWindowV2).title).toBe("Draft");
    expect(observed).toHaveBeenCalledTimes(1);
    expect(relaunch).not.toHaveBeenCalled();
    expect(currentClass(NotesWindowV1)).toBe(NotesWindowV2);
    expect(currentClass(NotesWindowV2)).toBe(NotesWindowV2);
  });

  it("relaunches only the application whose field signature changed, once", () => {
    const relaunchNotes = vi.fn();
    const relaunchMail = vi.fn();
    evaluate("notes.tsx", { App: NotesAppV1, Window: NotesWindowV1 }, { App: "a", Window: "w1" });
    class MailAppV1 extends NSEApplication {}
    class MailWindowV1 extends NSEObject {}
    evaluate("mail.tsx", { App: MailAppV1, Window: MailWindowV1 }, { App: "m", Window: "x" });
    const notesWindow = new NotesWindowV1();
    const notesOther = new NotesWindowV1();
    const mailWindow = new MailWindowV1();
    track(notesWindow, "Notes", relaunchNotes);
    track(notesOther, "Notes", relaunchNotes);
    track(mailWindow, "Mail", relaunchMail);

    evaluate("notes.tsx", { App: NotesAppV2, Window: NotesWindowV2 }, { App: "a", Window: "w2" });

    expect(relaunchNotes).toHaveBeenCalledTimes(1);
    expect(relaunchNotes).toHaveBeenCalledWith("Reloaded Notes");
    expect(relaunchMail).not.toHaveBeenCalled();
    expect(notesWindow).toBeInstanceOf(NotesWindowV1);
    expect(mailWindow).toBeInstanceOf(MailWindowV1);
  });

  it("does nothing on the first evaluation, outside the dev server and for a module that is not an application", () => {
    const relaunch = vi.fn();
    const window = new NotesWindowV1();
    track(window, "Notes", relaunch);
    registerApplicationHotModule(undefined, { id: "prod.tsx", defaultClass: "App", classes: { App: NotesAppV1 }, signatures: { App: "a" }, ignoredExports: [], refreshHost });
    class NotAnApp {}
    evaluate("plain.tsx", { App: NotAnApp }, { App: "a" });
    evaluate("plain.tsx", { App: NotAnApp }, { App: "b" });
    expect(relaunch).not.toHaveBeenCalled();
    expect(refreshHost.__getReactRefreshIgnoredExports).toBeUndefined();
  });

  it("stops updating an object once it is no longer tracked", () => {
    evaluate("notes.tsx", { App: NotesAppV1, Window: NotesWindowV1 }, { App: "a", Window: "w" });
    const window = new NotesWindowV1();
    const untrack = trackLiveApplicationObject(window, { appName: "Notes", relaunch: vi.fn() });
    untrack();
    evaluate("notes.tsx", { App: NotesAppV2, Window: NotesWindowV2 }, { App: "a", Window: "w" });
    expect(window).toBeInstanceOf(NotesWindowV1);
  });

  it("keeps updating the other objects when one fails, then reports the failure", () => {
    evaluate("notes.tsx", { App: NotesAppV1, Window: NotesWindowV1 }, { App: "a", Window: "w" });
    const failing = new NotesWindowV1();
    const healthy = new NotesWindowV1();
    track(failing, "Notes", vi.fn());
    track(healthy, "Notes", vi.fn());
    stops.push(observe(failing, () => { throw new Error("observer failed"); }));

    expect(() => evaluate("notes.tsx", { App: NotesAppV2, Window: NotesWindowV2 }, { App: "a", Window: "w" })).toThrow("observer failed");
    expect(healthy).toBeInstanceOf(NotesWindowV2);
  });

  it("tells React Fast Refresh to ignore an application module's class exports, keeping an earlier hook", () => {
    const earlier = vi.fn(() => ["Earlier"]);
    refreshHost.__getReactRefreshIgnoredExports = earlier;
    evaluate("notes.tsx", { App: NotesAppV1, Window: NotesWindowV1 }, { App: "a", Window: "w" });
    const hook = refreshHost.__getReactRefreshIgnoredExports as (context: { id: string }) => string[];
    expect(hook({ id: scoped("notes.tsx") })).toEqual(["Earlier", "default", "Window"]);
    expect(hook({ id: "elsewhere.tsx" })).toEqual(["Earlier"]);
  });

  it("accepts its own update only while the default export is still an application", () => {
    hot.invalidate.mockClear();
    acceptApplicationHotUpdate(hot, { default: NotesAppV2 });
    acceptApplicationHotUpdate(hot, undefined);
    expect(hot.invalidate).not.toHaveBeenCalled();
    acceptApplicationHotUpdate(hot, { default: class Plain {} });
    expect(hot.invalidate).toHaveBeenCalledTimes(1);
  });
});

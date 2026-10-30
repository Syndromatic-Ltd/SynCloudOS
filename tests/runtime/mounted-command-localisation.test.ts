// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { SynWareCommandDeclaration, SynWareCommandQueryContext, SynWareCommandValidation } from "../../src/SynCloudOS/AppSDK/appRuntimeTypes";
import type { LocalisedCommandTitle } from "../../src/SynCloudOS/Commands/commandTypes";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

type Declaration = SynWareCommandDeclaration<unknown, void>;
function fixture(proxyBrandProbe: "host" | "omit" = "host") {
  const ids = ["com.example.command-locale", "com.example.other-command-locale"];
  const runtime = createTestRuntime({ environment: createTestRuntimeEnvironment({ proxyBrandProbe }), initialBundles: ids.map(bundleIdentifier => createTestBundle({ bundleIdentifier })) });
  cleanups.push(async () => { await runtime.dispose("locale test cleanup"); });
  runtime.locale.registerBundleLocaleResources(ids[0]!, {
    "Base.locale": { "Localisable.strings": '"command.static" = "Open"; "command.dynamic" = "Do {name} / {count}"; "command.override" = "Blocked {name}";' },
    "de-DE.locale": {
      "Localisable.strings": '"command.static" = "Öffnen"; "command.dynamic" = "Aktion {name} / {count}"; "command.override" = "Gesperrt {name}";',
      "MainMenu.strings": '"command.static" = "Wrong main-menu namespace";',
    },
    "ja-JP.locale": { "Localisable.strings": '"command.static" = "開く"; "command.dynamic" = "実行 {name} / {count}"; "command.override" = "拒否 {name}";' },
  });
  runtime.locale.registerBundleLocaleResources(ids[1]!, {
    "de-DE.locale": { "Localisable.strings": '"command.static" = "Andere Anwendung";' },
  });
  runtime.locale.setLocale("de-DE");
  const mounts = ids.map(id => {
    const responderId = `application:${id}`;
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId, undoOwner: { kind: "application", id } });
    const mount = createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(id)!, responderId });
    cleanups.push(() => mount.dispose());
    const register = (suffix: string, title: Declaration["title"], validate?: Declaration["validate"]) => {
      const commandId = `${id}.${suffix}`;
      mount.runtime.commands.register({
        id: commandId, responderId, title,
        payload: { description: "Optional string", parse: (value: unknown) => value === undefined || typeof value === "string" ? { ok: true, value } : { ok: false, issues: ["Expected a string."] } },
        scope: "application", defaultKeyBindings: [], undo: { kind: "none" }, execute() {},
        ...(validate ? { validate } : {}),
      });
      return commandId;
    };
    return { mount, register, focus: () => runtime.focus.requestFocus(responderId) };
  });
  const first = mounts[0]!;
  first.focus();
  return { runtime, first, second: mounts[1]! };
}

describe("mounted app command localisation", () => {
  it.each(["getPrototypeOf", "ownKeys"] as const)("refuses a pending registration after browser title reflection revokes its mount (%s)", trap => {
    const { first, runtime } = fixture("omit");
    expect("isNativeProxy" in runtime.environment).toBe(false);
    const responderId = "control:com.example.command-locale:late-file";
    const commandId = "com.example.command-locale.reentrant-register";
    expect(runtime.responders.get(responderId)).toBeNull();
    const reflected = vi.fn(() => first.mount.dispose(new DOMException("Aborted during title preflight", "AbortError")));
    const title = new Proxy({ key: "command.static", fallback: "Open" }, {
      getPrototypeOf(target) { if (trap === "getPrototypeOf") reflected(); return Reflect.getPrototypeOf(target); },
      ownKeys(target) { if (trap === "ownKeys") reflected(); return Reflect.ownKeys(target); },
    });
    const attached = vi.spyOn(runtime.commands, "register");
    let returned: ReturnType<typeof first.mount.runtime.commands.register> | undefined;
    let failure: unknown;
    try {
      try {
        returned = first.mount.runtime.commands.register({
          id: commandId, responderId, title, payload: { description: "None", parse: () => ({ ok: true, value: undefined }) },
          scope: "application", defaultKeyBindings: [], undo: { kind: "none" }, execute() {},
        });
      } catch (error) { failure = error; }
      expect(reflected).toHaveBeenCalledOnce();
      expect(first.mount.runtime.signal.aborted).toBe(true);
      expect(attached).not.toHaveBeenCalled();
      const late = runtime.responders.register({ id: responderId, kind: "control", parentId: "application:com.example.command-locale", scopeId: "application:com.example.command-locale" });
      expect(runtime.commands.getDeclarations().some(command => command.id === commandId)).toBe(false);
      expect(attached).not.toHaveBeenCalled();
      late.dispose();
      expect(returned).toBeUndefined();
      expect(failure).toMatchObject({ name: "AbortError" });
    } finally { returned?.dispose(); attached.mockRestore(); }
  });

  it.each(["key", "fallback", "nested value", "nonfinite value", "array values"])("rejects a malformed static title (%s) before capturing or coercing it", field => {
    const { first } = fixture();
    const coerced = vi.fn(() => "coerced");
    const object = { toString: coerced };
    const title: Record<string, unknown> = { key: "command.missing", fallback: "Missing {name}" };
    if (field === "key" || field === "fallback") title[field] = object;
    else title.values = field === "nested value" ? { name: object } : field === "nonfinite value" ? { name: Infinity } : ["name"];
    expect(() => first.register("bad-static", title as unknown as LocalisedCommandTitle)).toThrow(/title|value|key|fallback/i);
    expect(coerced).not.toHaveBeenCalled();
  });

  it("rejects static title accessors and native-detected proxies without evaluating app code", () => {
    const { first, runtime } = fixture();
    const reads = vi.fn();
    const title = { key: "command.missing", fallback: "Missing {name}", values: Object.defineProperty({}, "name", { enumerable: true, get() { reads(); return "hostile"; } }) };
    expect(() => first.register("static-accessor", title)).toThrow(/accessor|title/i);
    expect(reads).not.toHaveBeenCalled();
    expect(runtime.environment.isNativeProxy).toBeTypeOf("function");
    for (const atValues of [false, true]) {
      const proxy = new Proxy(atValues ? { name: "hostile" } : { key: "command.missing", fallback: "Missing" }, {
        getPrototypeOf(target) { reads(); return Reflect.getPrototypeOf(target); },
        ownKeys(target) { reads(); return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, key) { reads(); return Reflect.getOwnPropertyDescriptor(target, key); },
        get(target, key, receiver) { reads(); return Reflect.get(target, key, receiver); },
      });
      const source = atValues ? { key: "command.missing", fallback: "Missing {name}", values: proxy } : proxy;
      expect(() => first.register(`static-proxy-${atValues}`, source as LocalisedCommandTitle)).toThrow(/proxy|title/i);
      expect(reads).not.toHaveBeenCalled();
    }
  });

  it("retains only detached primitive static values, including the invalid-payload path", async () => {
    const { first } = fixture();
    const values = { name: "original" };
    const title = { key: "command.missing", fallback: "Missing {name}", values };
    const id = first.register("static-alias", title);
    values.name = "mutated"; title.fallback = "Changed {name}";
    await expect(first.mount.runtime.commands.validate(id, 12)).resolves.toMatchObject({ enabled: false, title: "Missing original" });
  });

  const malformedTitles: readonly unknown[] = [0, false, "", { key: 12, fallback: "Bad key" }, { key: "command.missing", fallback: 12 }, { key: "command.missing", fallback: "Bad {name}", values: { name: { mutable: true } } }, { key: "command.missing", fallback: "Bad {name}", values: { name: NaN } }];
  it.each(["dynamic", "sync override", "async override"] as const)("validates the runtime title schema after projection (%s)", async path => {
    const { first } = fixture();
    for (const [index, title] of malformedTitles.entries()) {
      const id = path === "dynamic"
        ? first.register(`bad-dynamic-${index}`, () => title as LocalisedCommandTitle)
        : first.register(`bad-override-${index}`, { key: "command.static", fallback: "Open" }, () => path === "async override"
          ? Promise.resolve({ enabled: true, title: title as LocalisedCommandTitle })
          : { enabled: true, title: title as LocalisedCommandTitle });
      await expect(first.mount.runtime.commands.validate(id)).rejects.toThrow(/title|key|fallback|value/i);
    }
  });

  it("keeps an undefined optional validator title absent", async () => {
    const { first } = fixture();
    const id = first.register("undefined-override", { key: "command.static", fallback: "Open" }, () => ({ enabled: true, title: undefined }));
    await expect(first.mount.runtime.commands.validate(id)).resolves.toMatchObject({ enabled: true, title: "Öffnen" });
  });

  it("resolves static titles from the mounted app catalogue rather than another namespace or application", async () => {
    const { first, second } = fixture();
    const a = first.register("open", { key: "command.static", fallback: "English fallback" });
    const b = second.register("open", { key: "command.static", fallback: "Other fallback" });
    await expect(first.mount.runtime.commands.validate(a)).resolves.toMatchObject({ enabled: true, title: "Öffnen" });
    second.focus();
    await expect(second.mount.runtime.commands.validate(b)).resolves.toMatchObject({ enabled: true, title: "Andere Anwendung" });
    await expect(first.mount.runtime.commands.validate(b)).resolves.toMatchObject({ enabled: false, denied: true });
  });

  it("projects payload-dependent values before translation and interpolates inserted braces only once", async () => {
    const { first } = fixture();
    const title = vi.fn(({ payload, runtime: app }: SynWareCommandQueryContext<unknown>) => {
      expect(app).toBe(first.mount.runtime);
      return { key: "command.dynamic", fallback: "English {name} / {count}", values: { name: String(payload), count: 2 } };
    });
    const id = first.register("dynamic", title);
    await expect(first.mount.runtime.commands.validate(id, "{count}")).resolves.toMatchObject({ title: "Aktion {count} / 2" });
    await expect(first.mount.runtime.commands.validate(id, "Zwei")).resolves.toMatchObject({ title: "Aktion Zwei / 2" });
    expect(title).toHaveBeenCalledTimes(2);
  });

  it("uses the authored missing-key fallback with exactly one interpolation", async () => {
    const { first } = fixture();
    const id = first.register("missing", { key: "command.missing", fallback: "Missing {name} / {count}", values: { name: "{count}", count: 3 } });
    await expect(first.mount.runtime.commands.validate(id)).resolves.toMatchObject({ title: "Missing {count} / 3" });
  });

  it("retains localised static titles for invalid payloads and does not invoke a dynamic title with invalid input", async () => {
    const { first } = fixture();
    const staticId = first.register("invalid-static", { key: "command.static", fallback: "English fallback" });
    const dynamicTitle = vi.fn(() => ({ key: "command.dynamic", fallback: "Dynamic fallback" }));
    const dynamicId = first.register("invalid-dynamic", dynamicTitle);
    await expect(first.mount.runtime.commands.validate(staticId, 12)).resolves.toMatchObject({ enabled: false, title: "Öffnen", disabledReason: "The command payload is invalid." });
    await expect(first.mount.runtime.commands.validate(dynamicId, 12)).resolves.toMatchObject({ enabled: false });
    expect(dynamicTitle).not.toHaveBeenCalled();
  });

  it("translates a synchronous validator title override after the existing callback projection", async () => {
    const { first } = fixture();
    const id = first.register("blocked", { key: "command.static", fallback: "Open" }, () => ({ enabled: false, title: { key: "command.override", fallback: "Denied {name}", values: { name: "Dokument" } } }));
    await expect(first.mount.runtime.commands.validate(id)).resolves.toMatchObject({ enabled: false, title: "Gesperrt Dokument" });
  });

  it("translates an async validator override at settlement using the live locale", async () => {
    const { first, runtime } = fixture();
    let release!: (value: SynWareCommandValidation) => void;
    const gate = new Promise<SynWareCommandValidation>(resolve => { release = resolve; });
    const id = first.register("async", { key: "command.static", fallback: "Open" }, () => gate);
    const pending = first.mount.runtime.commands.validate(id);
    runtime.locale.setLocale("ja-JP");
    release({ enabled: true, title: { key: "command.override", fallback: "Denied {name}", values: { name: "文書" } } });
    await expect(pending).resolves.toMatchObject({ enabled: true, title: "拒否 文書" });
  });

  it("refreshes the same registered static and dynamic declarations after locale and dictionary changes", async () => {
    const { first, runtime } = fixture();
    const staticId = first.register("live", { key: "command.static", fallback: "English fallback" });
    const dynamicId = first.register("live-dynamic", ({ payload }) => ({ key: "command.dynamic", fallback: "English {name} / {count}", values: { name: String(payload), count: 1 } }));
    const notified = vi.fn();
    const stop = first.mount.runtime.commands.subscribePresentation(notified);
    await expect(first.mount.runtime.commands.validate(staticId)).resolves.toMatchObject({ title: "Öffnen" });
    runtime.locale.setLocale("ja-JP");
    expect(notified).toHaveBeenCalled();
    await expect(first.mount.runtime.commands.validate(staticId)).resolves.toMatchObject({ title: "開く" });
    await expect(first.mount.runtime.commands.validate(dynamicId, "文書")).resolves.toMatchObject({ title: "実行 文書 / 1" });
    notified.mockClear();
    runtime.locale.registerTranslations("synapps.com.example.command-locale", "ja-JP", { "command.static": "再読込" });
    expect(notified).toHaveBeenCalled();
    await expect(first.mount.runtime.commands.validate(staticId)).resolves.toMatchObject({ title: "再読込" });
    stop();
  });

  it("retains Proxy/accessor rejection before any title property can reach translation", async () => {
    const { first } = fixture();
    const reads = vi.fn();
    const hostile = new Proxy({ key: "command.static", fallback: "Hostile" }, { get(target, key, receiver) { reads(); return Reflect.get(target, key, receiver); } });
    const id = first.register("proxy", () => hostile);
    await expect(first.mount.runtime.commands.validate(id)).rejects.toThrow(/proxy|callback/i);
    expect(reads).not.toHaveBeenCalled();
    const accessor = first.register("accessor", () => Object.defineProperty({ key: "command.static" }, "fallback", { enumerable: true, get() { reads(); return "Hostile"; } }) as { key: string; fallback: string });
    await expect(first.mount.runtime.commands.validate(accessor)).rejects.toThrow(/accessor|callback/i);
    expect(reads).not.toHaveBeenCalled();
  });

  it("does not publish an async validator title after its mount is revoked", async () => {
    const { first } = fixture();
    let release!: (value: SynWareCommandValidation) => void;
    const gate = new Promise<SynWareCommandValidation>(resolve => { release = resolve; });
    const id = first.register("revoked", { key: "command.static", fallback: "Open" }, () => gate);
    const pending = first.mount.runtime.commands.validate(id);
    first.mount.dispose("revoked during validation");
    release({ enabled: true, title: { key: "command.override", fallback: "Should not publish" } });
    await expect(pending).resolves.toMatchObject({ enabled: false });
    expect((await pending).title).not.toBe("Gesperrt {name}");
  });
});

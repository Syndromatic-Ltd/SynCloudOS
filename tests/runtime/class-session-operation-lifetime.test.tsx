// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { applicationSessionFor } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { authoriseTestRuntime } from "./helpers";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it.each([false, true])("disposes a launch cancelled by logout before its uncooperative hook settles (late rejection: %s)", async (rejectLate) => {
  const entered = deferred();
  const held = deferred();
  const applications: Application[] = [];
  class Application extends NSEApplication {
    constructor() { super(); applications.push(this); }
    override async applicationWillFinishLaunching() {
      if (applications[0] !== this) return;
      entered.resolve();
      await held.promise;
      if (rejectLate) throw new Error("The cancelled launch failed late");
    }
  }
  const host = createClassApplicationHost(Application, "com.example.cancelled-launch-lifetime");
  hosts.push(host);
  const launching = host.launch();
  await entered.promise;
  const first = applications[0]!;
  expect((await host.runtime.logOut().result).status).toBe("completed");
  expect((await launching).status).toBe("cancelled");
  expect(first.isDisposed).toBe(true);
  const identity = { runtime: host.runtime, appId: host.appId };
  expect(applicationSessionFor(identity.runtime, identity.appId)).toBeUndefined();

  authoriseTestRuntime(host.runtime);
  expect((await host.launch()).status).toBe("completed");
  const replacement = applicationSessionFor(identity.runtime, identity.appId)!;
  expect(applications).toHaveLength(2);
  held.resolve();
  await held.promise;
  await Promise.resolve();
  expect(applicationSessionFor(identity.runtime, identity.appId)).toBe(replacement);
  expect(replacement.app).toBe(applications[1]);
  expect(replacement.isDisposed).toBe(false);
});

it("cleans up a failed initial launch while preserving its original failure", async () => {
  const failure = new Error("Initialisation failed");
  let application!: Application;
  class Application extends NSEApplication {
    constructor() { super(); application = this; }
    override async applicationWillFinishLaunching() { throw failure; }
    override didDispose() { throw new Error("Cleanup failed too"); }
  }
  const host = createClassApplicationHost(Application, "com.example.failed-launch-lifetime");
  hosts.push(host);
  expect(await host.launch()).toMatchObject({ status: "failed", error: { message: failure.message, cause: failure } });
  expect(application.isDisposed).toBe(true);
  expect(applicationSessionFor(host.runtime, host.appId)).toBeUndefined();
});

it("keeps a structurally committed launch alive when cancellation skips launch did", async () => {
  class Application extends NSEApplication {}
  const host = createClassApplicationHost(Application, "com.example.committed-launch-lifetime");
  hosts.push(host);
  const launching = host.runtime.lifecycle.launch(host.appId);
  const unsubscribe = host.runtime.store.subscribe(() => {
    if (host.runtime.lifecycle.getState(host.appId) === "active") launching.cancel("cancel-after-launch-commit");
  });
  try {
    expect(await launching.result).toMatchObject({ status: "completed", postCommit: "cancelled" });
    const session = applicationSessionFor(host.runtime, host.appId);
    expect(session).toBeDefined();
    expect(session!.isDisposed).toBe(false);
    expect(host.runtime.lifecycle.getState(host.appId)).toBe("active");
  } finally { unsubscribe(); }
});

it.each(["launch", "close"] as const)("settles %s cleanup after cancellation from the committed operation notification", async stage => {
  class Application extends NSEApplication {}
  const host = createClassApplicationHost(Application, `com.example.${stage}-commit-notification`);
  hosts.push(host);
  const identity = { runtime: host.runtime, appId: host.appId };
  if (stage === "close") await host.launch();
  const previous = applicationSessionFor(identity.runtime, identity.appId);
  const operation = host.runtime.lifecycle[stage](host.appId);
  let cancelled = false;
  const unsubscribe = host.runtime.operations.subscribe(() => {
    if (!cancelled && host.runtime.operations.inspectPending().some(record => record.operationId === operation.operationId && record.committed)) {
      cancelled = true;
      operation.cancel("cancel-from-commit-notification");
    }
  });
  try {
    expect(await operation.result).toMatchObject({ status: "completed", postCommit: "cancelled" });
    expect(cancelled).toBe(true);
    if (stage === "launch") {
      expect(host.runtime.lifecycle.getState(host.appId)).toBe("active");
      expect(applicationSessionFor(identity.runtime, identity.appId)?.isDisposed).toBe(false);
    } else {
      expect(host.runtime.lifecycle.getState(host.appId)).toBe("closed");
      expect(previous?.isDisposed).toBe(true);
      expect(applicationSessionFor(identity.runtime, identity.appId)).toBeUndefined();
    }
  } finally { unsubscribe(); }
});

it("disposes a committed close when another logout supersedes its did hook", async () => {
  const willTerminate = vi.fn();
  class Application extends NSEApplication {
    override applicationWillTerminate() { willTerminate(); }
  }
  const host = createClassApplicationHost(Application, "com.example.superseded-logout-lifetime");
  hosts.push(host);
  await host.launch();
  const identity = { runtime: host.runtime, appId: host.appId };
  const first = applicationSessionFor(identity.runtime, identity.appId)!;
  let superseding: ReturnType<typeof host.runtime.logOut> | undefined;
  const unsubscribe = host.runtime.store.subscribe(() => {
    if (host.runtime.lifecycle.getState(host.appId) !== "closed" || superseding) return;
    unsubscribe();
    superseding = host.runtime.logOut({ reason: "supersede-at-close-commit" });
  });
  try {
    expect((await host.runtime.logOut().result).status).toBe("cancelled");
    expect(superseding).toBeDefined();
    expect((await superseding!.result).status).toBe("completed");
    expect(first.isDisposed).toBe(true);
    expect(applicationSessionFor(identity.runtime, identity.appId)).toBeUndefined();
    expect(willTerminate).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});

it("disposes a closed session on abort even while termination is stalled", async () => {
  const entered = deferred();
  const held = deferred();
  class Application extends NSEApplication {
    override async applicationWillTerminate() { entered.resolve(); await held.promise; }
  }
  const host = createClassApplicationHost(Application, "com.example.stalled-termination-lifetime");
  hosts.push(host);
  await host.launch();
  const identity = { runtime: host.runtime, appId: host.appId };
  const first = applicationSessionFor(identity.runtime, identity.appId)!;
  const closing = host.runtime.lifecycle.close(host.appId);
  await entered.promise;
  closing.cancel("cancel-stalled-termination");
  expect(await closing.result).toMatchObject({ status: "completed", postCommit: "cancelled" });
  expect(first.isDisposed).toBe(true);
  expect(applicationSessionFor(identity.runtime, identity.appId)).toBeUndefined();

  await host.runtime.appManager.getManagerForApp(host.appId).getReady();
  expect((await host.launch()).status).toBe("completed");
  const replacement = applicationSessionFor(identity.runtime, identity.appId)!;
  held.resolve();
  await held.promise;
  await Promise.resolve();
  expect(applicationSessionFor(identity.runtime, identity.appId)).toBe(replacement);
  expect(replacement.isDisposed).toBe(false);
});

it("preserves the active session when termination is aborted before commit", async () => {
  const entered = deferred();
  const held = deferred();
  let shouldHold = true;
  class Application extends NSEApplication {
    override async applicationShouldTerminate() {
      if (shouldHold) { entered.resolve(); await held.promise; }
      return true;
    }
  }
  const host = createClassApplicationHost(Application, "com.example.aborted-termination-lifetime");
  hosts.push(host);
  await host.launch();
  const identity = { runtime: host.runtime, appId: host.appId };
  const session = applicationSessionFor(identity.runtime, identity.appId)!;
  const closing = host.runtime.lifecycle.close(host.appId);
  await entered.promise;
  closing.cancel("cancel-before-close-commit");
  expect((await closing.result).status).toBe("cancelled");
  expect(session.isDisposed).toBe(false);
  expect(host.runtime.lifecycle.getState(host.appId)).toBe("active");
  held.resolve();
  await held.promise;
  await Promise.resolve();
  expect(applicationSessionFor(identity.runtime, identity.appId)).toBe(session);
  shouldHold = false;
  expect((await host.quit()).status).toBe("completed");
  expect(session.isDisposed).toBe(true);
});

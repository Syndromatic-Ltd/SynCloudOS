// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { action, bindActionResponder } from "../../src/SynCloudOS/AppSDK/actions";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function fixture() {
  const appId = "com.example.action-results";
  const runtime = createTestRuntime();
  cleanups.push(() => runtime.dispose());
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "Results" });
  runtime.responders.register({ id: `application:${appId}`, kind: "application", parentId: "runtime", scopeId: `application:${appId}`, undoOwner: { kind: "application", id: appId } });
  const mounted = mountTestSynWareRuntime(runtime, appId);
  cleanups.push(() => mounted.dispose());
  const context = createSynWareContextValue(mounted.runtime);
  const responderId = `application:${appId}`;
  runtime.focus.requestFocus(responderId);
  return { runtime, context, responderId, host: { appId, commands: context.commands } };
}

it("forwards synchronous and awaited primitive results through mounted result admission", async () => {
  const f = fixture();
  class Controller {
    @action count(value: number) { return value + 1; }
    @action async title(value: string) { await Promise.resolve(); return value.toUpperCase(); }
  }
  const binding = bindActionResponder(new Controller(), f.host, f.responderId);
  cleanups.push(() => binding.dispose());
  await expect(f.context.commands.dispatch(`${f.host.appId}.count`, 4)).resolves.toMatchObject({ status: "executed", value: 5 });
  await expect(f.context.commands.dispatch(`${f.host.appId}.title`, "hello")).resolves.toMatchObject({ status: "executed", value: "HELLO" });
});

it("forwards declared undo with the admitted awaited result and registers exactly once", async () => {
  const f = fixture();
  let count = 0;
  const createAction = vi.fn((_context: unknown, result: number) => defineSyncUndoAction({
    name: "Increment", asyncPolicy: "forbid", undo: () => { count -= result; }, redo: () => { count += result; },
  }));
  class Controller {
    @action<number, number>({ undo: { kind: "register", createAction } })
    async increment(value: number) { count += value; return value; }
  }
  const binding = bindActionResponder(new Controller(), f.host, f.responderId);
  cleanups.push(() => binding.dispose());
  const history = f.runtime.undo.create({ kind: "application", id: f.host.appId });
  await expect(f.context.commands.dispatch(`${f.host.appId}.increment`, 3)).resolves.toMatchObject({ status: "executed", value: 3 });
  expect(createAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payload: 3 }), 3);
  expect(history.inspect().entries).toHaveLength(1);
  await history.undo();
  expect(count).toBe(0);
  await history.redo();
  expect(count).toBe(3);
});

it("does not add command undo when the action already owns its canonical history", async () => {
  const f = fixture();
  const history = f.runtime.undo.create({ kind: "application", id: f.host.appId });
  class Controller {
    @action edit() {
      history.register(defineSyncUndoAction({ name: "Canonical edit", asyncPolicy: "forbid", undo: () => {}, redo: () => {} }));
      return "edited";
    }
  }
  const binding = bindActionResponder(new Controller(), f.host, f.responderId);
  cleanups.push(() => binding.dispose());
  await expect(f.context.commands.dispatch(`${f.host.appId}.edit`)).resolves.toMatchObject({ status: "executed", value: "edited" });
  expect(history.inspect().entries).toHaveLength(1);
});

it("rejects opaque action results at the existing mounted result boundary", async () => {
  const f = fixture();
  class Controller { @action element() { return document.createElement("div"); } }
  const binding = bindActionResponder(new Controller(), f.host, f.responderId);
  cleanups.push(() => binding.dispose());
  const result = await f.context.commands.dispatch(`${f.host.appId}.element`);
  expect(result).not.toMatchObject({ status: "executed" });
});

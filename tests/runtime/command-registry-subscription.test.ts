import { expect, it } from "vitest";
import { CommandRegistry } from "../../src/SynCloudOS/Commands/CommandRegistry";

it("coalesces registry changes, reports the latest generation and withdraws subscribers", async () => {
  const registry = new CommandRegistry();
  const seen: number[] = [];
  const remove = registry.subscribe(() => { seen.push(registry.generation); });
  const first = registry.register({ id: "notes.first", title: "First", responderId: "application:notes", execute() {} });
  const second = registry.register({ id: "notes.second", title: "Second", responderId: "application:notes", execute() {} });
  expect(seen).toEqual([]);
  await Promise.resolve();
  expect(seen).toEqual([2]);
  first.dispose();
  await Promise.resolve();
  expect(seen).toEqual([2, 3]);
  remove();
  second.dispose();
  await Promise.resolve();
  expect(seen).toEqual([2, 3]);
  registry.dispose();
});

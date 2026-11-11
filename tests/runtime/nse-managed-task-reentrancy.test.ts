import { describe, expect, it, vi } from 'vitest';
import { NSEViewController } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { attachNSEAuthoringContext } from '../../src/NSE/Application/authoringContext';
import { managedTask } from '../../src/NSE/Tasks/managedTask';
import type { NSETaskRun } from '../../src/NSE/Tasks/taskTypes';

const owner = () => new NSEViewController({ owner: nseUnowned });

describe('managed task reentrancy and acquisition failures', () => {
  it('reserves serial order before notifying observers that can admit more work', async () => {
    const view = owner();
    const started: number[] = [];
    const finish: Array<() => void> = [];
    const task = managedTask(view, { lifetime: 'owner', policy: 'serial', run: (n: number) => {
      started.push(n);
      return new Promise<void>(resolve => { finish.push(resolve); });
    } });
    let second: NSETaskRun<void> | undefined;
    let entered = false;
    const stop = task.subscribe(() => {
      if (!entered) { entered = true; second = task.run(2); }
    });
    const first = task.run(1);
    expect(started).toEqual([1]);
    finish[0](); await first.finished;
    expect(started).toEqual([1, 2]);
    finish[1](); await second!.finished;
    stop(); view.dispose();
  });

  it('keeps the newest run admitted from a superseded run abort listener', async () => {
    const view = owner();
    const started: number[] = [];
    const task = managedTask(view, { lifetime: 'owner', policy: 'latest', run: (n: number) => {
      started.push(n);
      return new Promise<number>(() => {});
    } });
    const first = task.run(1);
    let newest: NSETaskRun<number> | undefined;
    first.signal.addEventListener('abort', () => { newest = task.run(3); }, { once: true });
    const middle = task.run(2);
    expect(await middle.finished).toMatchObject({ status: 'cancelled', reason: 'superseded' });
    expect(started).toEqual([1, 3]);
    expect(task.getSnapshot().pending).toBe(true);
    view.dispose(); await newest!.finished;
  });

  it('does not publish an old failure after resource cleanup admits a new run', async () => {
    const view = owner();
    let next: NSETaskRun<number> | undefined;
    const failure = new Error('old operation');
    const task = managedTask(view, { lifetime: 'owner', policy: 'latest', run: (n: number, context) => {
      if (n === 1) {
        context.own(() => ({ dispose() { next = task.run(2); } }));
        return Promise.reject(failure);
      }
      return new Promise<number>(() => {});
    } });
    expect(await task.run(1).finished).toMatchObject({ status: 'failed', error: failure });
    expect(task.getSnapshot()).toMatchObject({ pending: true, error: null });
    view.dispose(); await next!.finished;
  });

  it('settles and cleans up when the injected timer acquisition throws', async () => {
    const view = owner();
    const failure = new Error('scheduler unavailable');
    const capture = vi.fn();
    attachNSEAuthoringContext(view, {
      scheduler: { setTimeout() { throw failure; } }, errors: { capture },
      persistence: { getPreference: (_, fallback) => fallback, setPreference: () => true }, subscribePreferences: () => () => {},
    });
    const task = managedTask(view, { lifetime: 'owner', policy: 'latest', debounceMs: 1, run: vi.fn() });
    const run = task.run(undefined);
    expect(await run.finished).toEqual({ status: 'failed', error: failure });
    expect(task.getSnapshot().pending).toBe(false);
    expect(capture).toHaveBeenCalledTimes(1);
    view.dispose();
  });

  it('rejects an async task-owned factory before executing its body', async () => {
    const view = owner();
    const acquire = vi.fn();
    const task = managedTask(view, { lifetime: 'owner', policy: 'latest', run: (_, context) =>
      context.own((async () => { acquire(); return { dispose() {} }; }) as any),
    });
    expect(await task.run(undefined).finished).toMatchObject({ status: 'failed' });
    expect(acquire).not.toHaveBeenCalled();
    view.dispose();
  });

  it('retains cancellation settlement and releases remaining work when a timer disposer fails', async () => {
    const view = owner(); const failure = new Error('timer release failed'); const capture = vi.fn();
    attachNSEAuthoringContext(view, {
      scheduler: { setTimeout: () => ({ dispose() { throw failure; } }) }, errors: { capture },
      persistence: { getPreference: (_, fallback) => fallback, setPreference: () => true }, subscribePreferences: () => () => {},
    });
    const task = managedTask(view, { lifetime: 'owner', policy: 'latest', debounceMs: 1, run: vi.fn() });
    const run = task.run(undefined); task.cancel();
    expect(await run.finished).toEqual({ status: 'cancelled', reason: 'explicit' });
    expect(task.getSnapshot().pending).toBe(false); expect(capture).toHaveBeenCalledOnce();
    view.dispose();
  });

  it('keeps the admission fence through a reentrant whole-task cancellation', async () => {
    const view = owner(); const started: number[] = [];
    const task = managedTask(view, { lifetime: 'owner', policy: 'serial', run: (n: number) => {
      started.push(n); return new Promise<void>(() => {});
    } });
    const first = task.run(1); const queued = task.run(2); let reentrant!: NSETaskRun<void>;
    first.signal.addEventListener('abort', () => { task.cancel(); reentrant = task.run(3); });
    task.cancel();
    expect(started).toEqual([1]);
    expect(await reentrant.finished).toEqual({ status: 'cancelled', reason: 'explicit' });
    await first.finished; await queued.finished; view.dispose();
  });
});

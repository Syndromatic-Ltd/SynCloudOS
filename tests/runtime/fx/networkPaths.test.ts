import { describe, expect, it, vi } from 'vitest';
import { BrowserNetworkPathAdapter } from '../../../src/SynCloudOS/PlatformAdapters/BrowserNetworkPathAdapter';
import { createMountedNetworkClient } from '../../../src/SynCloudOS/AppSDK/mountedNetworkClient';
function fixture(info = false) {
  const target = new EventTarget();
  const connection = Object.assign(new EventTarget(), { effectiveType: '2g', downlink: 0.2, rtt: 900, saveData: true });
  const navigator = { onLine: true, ...(info ? { connection } : {}) };
  const adapter = new BrowserNetworkPathAdapter({ navigator, eventTarget: target });
  return { target, connection, navigator, adapter };
}
describe('NetworkFX browser paths', () => {
  it('is unavailable without a browsing environment', () => {
    const adapter = new BrowserNetworkPathAdapter({});
    expect(adapter.capabilities().pathMonitoring).toBe(false);
    expect(adapter.currentPath()).toBeNull();
  });
  it('preserves unknown cost and interface with coarsened information', () => {
    const { adapter } = fixture(true);
    expect(adapter.currentPath()).toMatchObject({ status: 'satisfied', interfaceType: null, isExpensive: null, isConstrained: null, saveData: true, effectiveType: '2g' });
  });
  it('denies before touching browser data', () => {
    const adapter = { capabilities: vi.fn(), currentPath: vi.fn(), subscribe: vi.fn() };
    const client = createMountedNetworkClient(adapter, new AbortController().signal, () => [], () => true);
    expect(client.authorizationStatus()).toBe('denied');
    expect(() => client.createMonitor()).toThrow(/network.read/);
    expect(adapter.capabilities).not.toHaveBeenCalled();
  });
  it('constructs passively, delivers updates, cancels and tears down on abort', () => {
    const { adapter, target, navigator } = fixture();
    const owner = new AbortController();
    const client = createMountedNetworkClient(adapter, owner.signal, () => ['network.read'], () => true);
    const monitor = client.createMonitor();
    const listener = vi.fn();
    expect(listener).not.toHaveBeenCalled();
    monitor.start(listener);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'satisfied', saveData: null }));
    navigator.onLine = false;
    target.dispatchEvent(new Event('offline'));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'unsatisfied' }));
    owner.abort();
    target.dispatchEvent(new Event('online'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(() => monitor.start(listener)).toThrow();
  });
  it('reauthorises before delivery and removes listeners on revocation', () => {
    const { adapter, target } = fixture();
    let allowed = true;
    const client = createMountedNetworkClient(adapter, new AbortController().signal, () => ['network.read'], () => allowed);
    const monitor = client.createMonitor();
    const listener = vi.fn();
    monitor.start(listener);
    allowed = false;
    target.dispatchEvent(new Event('offline'));
    allowed = true;
    target.dispatchEvent(new Event('online'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(client.requestAuthorization()).toBe('granted');
  });
  it('observes Network Information changes and removes all browser listeners on cancel', () => {
    const { adapter, target, connection } = fixture(true);
    const removeWindow = vi.spyOn(target, 'removeEventListener');
    const removeInfo = vi.spyOn(connection, 'removeEventListener');
    const client = createMountedNetworkClient(adapter, new AbortController().signal, () => ['network.read'], () => true);
    const monitor = client.createMonitor();
    const listener = vi.fn();
    monitor.start(listener);
    connection.downlink = 3;
    connection.dispatchEvent(new Event('change'));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ downlinkMegabitsPerSecond: 3, isExpensive: null }));
    monitor.cancel();
    monitor.cancel();
    expect(removeWindow).toHaveBeenCalledTimes(2);
    expect(removeInfo).toHaveBeenCalledTimes(1);
    expect(() => monitor.start(listener)).toThrow();
  });
  it('links caller abort and manifest revocation to terminal monitoring', () => {
    const { adapter, target } = fixture();
    let permissions = ['network.read'];
    const client = createMountedNetworkClient(adapter, new AbortController().signal, () => permissions, () => true);
    const caller = new AbortController();
    const monitor = client.createMonitor(caller.signal);
    const listener = vi.fn();
    monitor.start(listener);
    caller.abort();
    target.dispatchEvent(new Event('online'));
    expect(listener).toHaveBeenCalledTimes(1);
    const second = client.createMonitor();
    second.start(listener);
    permissions = [];
    target.dispatchEvent(new Event('offline'));
    expect(client.requestAuthorization()).toBe('denied');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(() => second.start(listener)).toThrow();
  });

});

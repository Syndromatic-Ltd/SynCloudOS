import { describe, expect, it } from 'vitest';
import { observeUpdateReadiness, UPDATE_READINESS_PROTOCOL, type UpdateReadinessRequest, type UpdateReadinessSnapshot, type UpdateReadinessTransport } from '../../src/SynCloudOS/Updates';

function ready(instance = 'generated-instance-1', generation = 1): UpdateReadinessSnapshot {
  return { protocol: UPDATE_READINESS_PROTOCOL, clientInstance: instance, hostBuild: 'build-A', generation, readiness: 'ready', blockers: [] };
}
function fixture() {
  let enumerations = 0;
  const owner = new AbortController();
  const source: Record<string, UpdateReadinessSnapshot> = { a: ready(), b: ready('generated-instance-2'), c: ready('generated-instance-3') };
  const transport: UpdateReadinessTransport = {
    enumerate: async () => { enumerations++; return Object.keys(source); },
    request: async (id, request) => ({ ...request, snapshot: source[id] }),
  };
  const run = (timeoutMs = 100) => observeUpdateReadiness({ transport, observerInstance: 'generated-observer-1', hostBuild: 'build-A', signal: owner.signal, timeoutMs, environment: { setTimeout, clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>), randomUUID: () => crypto.randomUUID() } });
  return { owner, source, transport, run, get enumerations() { return enumerations; } };
}
describe('ephemeral multiclient readiness evidence', () => {
  it('observes all three clients twice without granting activation authority', async () => {
    const f = fixture(); const result = await f.run(); expect(result).toEqual({ status: 'ready-at-observation', activationAuthorized: false, reasons: [], participantCount: 3 });
    expect(f.enumerations).toBe(3); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.reasons)).toBe(true);
  });
  it.each(['dirty', 'saving', 'conflict', 'composition', 'transaction', 'recovery-write', 'native-operation'] as const)('defers when one of three clients reports %s', async blocker => {
    const f = fixture(); f.source.b = { ...f.source.b, readiness: 'blocked', blockers: [blocker] }; expect(await f.run()).toMatchObject({ status: 'defer', reasons: ['client-blocked'] });
  });
  it.each(['protocol', 'kind', 'nonce', 'observerInstance', 'extra', 'generation', 'private-content', 'invalid-ready', 'unknown-blocker'] as const)('rejects %s evidence', async fault => {
    const f = fixture(); f.transport.request = async (id, request) => {
      const value: any = { ...request, snapshot: { ...f.source[id] } };
      if (fault === 'generation') value.snapshot.generation = -1;
      else if (fault === 'private-content') value.snapshot.documentTitle = 'GENERATED PRIVATE CANARY';
      else if (fault === 'invalid-ready') value.snapshot.blockers = ['dirty'];
      else if (fault === 'unknown-blocker') { value.snapshot.readiness = 'blocked'; value.snapshot.blockers = ['arbitrary-private-detail']; }
      else value[fault] = 'mismatched';
      return value;
    };
    expect(await f.run()).toMatchObject({ status: 'defer', reasons: ['invalid-evidence'] });
  });
  it.each(['edit', 'replacement', 'changed-facts', 'restart'] as const)('defers for %s between observations', async change => {
    const f = fixture(); f.transport.request = async (id, request) => {
      if (request.kind === 'confirm' && id === 'b') {
        if (change === 'edit') f.source.b = ready('generated-instance-2', 2);
        if (change === 'replacement') f.source.b = ready('replacement-instance', 1);
        if (change === 'changed-facts') f.source.b = { ...f.source.b, readiness: 'blocked', blockers: ['dirty'] };
        if (change === 'restart') return { ...request, nonce: 'old-observer-restarted', snapshot: f.source.b };
      }
      return { ...request, snapshot: f.source[id] };
    };
    expect((await f.run()).status).toBe('defer');
  });
  it.each(['open', 'close', 'reopen'] as const)('defers when a client can %s between enumerations', async change => {
    const f = fixture(); let count = 0; f.transport.enumerate = async () => {
      if (count++ === 0) return ['a', 'b'];
      return change === 'open' ? ['a', 'b', 'c'] : change === 'close' ? ['a'] : ['a', 'replacement-browser-id'];
    };
    expect(await f.run()).toMatchObject({ status: 'defer', reasons: ['membership-changed'] });
  });
  it('rejects incompatible and duplicated host identities and empty/invalid inventories', async () => {
    const f = fixture(); f.source.b = { ...f.source.b, hostBuild: 'old-build' }; expect((await f.run()).reasons).toContain('incompatible-build');
    f.source.b = f.source.a; expect((await f.run()).reasons).toContain('invalid-evidence');
    f.transport.enumerate = async () => []; expect((await f.run()).reasons).toEqual(['no-clients']);
    f.transport.enumerate = async () => ['a', 'a']; expect((await f.run()).reasons).toEqual(['inspection-failed']);
  });
  it('bounds an unresponsive client even when its transport ignores cancellation', async () => {
    const f = fixture(); let released = 0;
    f.transport.request = (id, request, signal) => { signal.addEventListener('abort', () => released++, { once: true }); return new Promise(() => {}); };
    const result = await f.run(20); expect(result.status).toBe('defer'); expect(result.reasons).toContain('unresponsive-client'); expect(released).toBe(3);
  });
  it('aborts the old observer, ignores its late replies and isolates a replacement observer', async () => {
    const f = fixture(); const pending: (() => void)[] = [];
    f.transport.request = (id, request) => new Promise(resolve => pending.push(() => resolve({ ...request, snapshot: f.source[id] })));
    const old = f.run(); await Promise.resolve(); await Promise.resolve(); f.owner.abort();
    expect((await old).reasons).toContain('owner-ended'); for (const complete of pending) complete();
    expect((await fixture().run()).status).toBe('ready-at-observation');
  });
  it('copies initial evidence so mutation of a transport-owned object cannot rewrite history', async () => {
    const f = fixture(); f.transport.request = async (id, request: UpdateReadinessRequest) => {
      if (request.kind === 'confirm') (f.source[id] as { generation: number }).generation++;
      return { ...request, snapshot: f.source[id] };
    };
    expect((await f.run()).reasons).toContain('evidence-changed');
  });
  it('reports unknown rather than assuming that lost owner evidence is clean', async () => {
    const f = fixture(); f.source.b = { ...f.source.b, readiness: 'unknown', blockers: ['owner-ended'] }; expect((await f.run()).reasons).toContain('client-unknown');
  });
});

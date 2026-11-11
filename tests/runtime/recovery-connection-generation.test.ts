import { describe, expect, it, vi } from 'vitest';
import { IndexedDBDocumentRecoveryStore } from '../../src/SynCloudOS/Documents/IndexedDBDocumentRecoveryStore';

function fixture() {
  const requests: Array<{ result: unknown; error: DOMException; onsuccess?: () => void; onerror?: () => void }> = [];
  const indexedDB = { open: () => { const request = { result: null as unknown, error: new DOMException('Generated future version', 'VersionError') }; requests.push(request); return request; } };
  const owner = new IndexedDBDocumentRecoveryStore({ indexedDB: indexedDB as unknown as IDBFactory, databaseName: 'generated-only', persistenceNamespace: 'generated-only', environment: { now: Date.now } });
  return { owner, requests };
}
describe('recovery connection generation', () => {
  it('does not let an old open failure clear a replacement open', async () => {
    const { owner, requests } = fixture();
    const old = owner.read('generated').catch(error => error); owner.close();
    const replacement = owner.read('generated').catch(error => error);
    requests[0]!.onerror!(); await old;
    const observer = owner.read('generated').catch(error => error);
    try { expect(requests).toHaveLength(2); }
    finally { for (const request of requests.slice(1)) request.onerror!(); await Promise.all([replacement, observer]); owner.close(); }
  });
  it('does not let a delayed old success/versionchange clear a replacement open', async () => {
    const { owner, requests } = fixture();
    const old = owner.read('generated').catch(error => error); owner.close();
    const replacement = owner.read('generated').catch(error => error);
    const database = { close: vi.fn(), transaction: () => { throw new Error('Generated transaction boundary'); }, onversionchange: null as (() => void) | null };
    requests[0]!.result = database; requests[0]!.onsuccess!(); database.onversionchange!();
    const observer = owner.read('generated').catch(error => error);
    try { expect(requests).toHaveLength(2); }
    finally { for (const request of requests.slice(1)) request.onerror!(); await Promise.all([old, replacement, observer]); owner.close(); }
  });
});

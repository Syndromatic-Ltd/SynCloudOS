// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { NSEViewController, nseAttachView } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { outlet, type NSEViewOutlet } from '../../src/NSE/Application/viewOutlet';

class View extends NSEViewController { @outlet accessor art!: NSEViewOutlet<HTMLDivElement>; }

describe('outlet ref cleanup authority', () => {
  it('ignores a stale cleanup after the same node receives a newer ref lease', async () => {
    const view = new View({ owner: nseUnowned }); const node = document.createElement('div');
    const oldCleanup = view.art.ref(node) as unknown as () => void;
    view[nseAttachView]({ element: document.createElement('div') });
    oldCleanup(); view.art.ref(node); oldCleanup(); await Promise.resolve();
    expect(view.art.current).toBe(node);
    view.dispose();
  });

  it('does not clear a replacement attached during the old mount abort', async () => {
    const view = new View({ owner: nseUnowned }); const first = document.createElement('div'), next = document.createElement('div');
    view.art.ref(first); view[nseAttachView]({ element: document.createElement('div') });
    view.art.mountSignal.addEventListener('abort', () => { view.art.ref(next); }, { once: true });
    view.art.ref(null); await Promise.resolve();
    expect(view.art.current).toBe(next);
    view.dispose();
  });

  it('releases a layer returned after its outlet was synchronously disposed', () => {
    const view = new View({ owner: nseUnowned }); const dispose = vi.fn();
    view.art.ref(document.createElement('div'));
    view[nseAttachView]({ element: document.createElement('div'), bindLayer() { view.dispose(); return { dispose } as any; } });
    expect(() => view.art.layer).toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

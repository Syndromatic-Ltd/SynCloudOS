// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createBrowserAnimationLayerHost } from '../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationLayerHost';

const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };
const nodes: Element[] = [];
afterEach(() => { for (const node of nodes.splice(0)) node.remove(); });

function view(style: string) {
  const sheet = document.createElement('style'); sheet.textContent = `.authored { ${style} }`;
  const element = document.createElement('div'); element.className = 'authored';
  Object.defineProperty(element, 'offsetWidth', { value: 400 }); Object.defineProperty(element, 'offsetHeight', { value: 200 });
  document.head.append(sheet); document.body.append(element); nodes.push(sheet, element);
  return element;
}

describe('a CSS-laid-out backing layer adopts its view', () => {
  it('takes the authored transform-origin as its anchor point and keeps the box in place', () => {
    const owner = new AbortController();
    const layer = createBrowserAnimationLayerHost(document, scheduler).bind('layer', view('transform-origin: 50% 100%;'), owner.signal, { layout: 'css' });
    expect(layer.anchorPoint).toEqual({ x: 0.5, y: 1 });
    expect(layer.frame).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    owner.abort();
  });

  it('keeps authored clipping as clipsToBounds', () => {
    const owner = new AbortController();
    const element = view('overflow: hidden;');
    const layer = createBrowserAnimationLayerHost(document, scheduler).bind('layer', element, owner.signal, { layout: 'css' });
    expect(layer.clipsToBounds).toBe(true);
    expect(element.style.overflow).toBe('hidden');
    owner.abort();
  });

  it('leaves an unstyled view at Core Animation defaults', () => {
    const owner = new AbortController();
    const layer = createBrowserAnimationLayerHost(document, scheduler).bind('layer', view(''), owner.signal, { layout: 'css' });
    expect(layer.anchorPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(layer.clipsToBounds).toBe(false);
    owner.abort();
  });
});

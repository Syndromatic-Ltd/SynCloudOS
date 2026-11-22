/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import React, {useRef} from 'react';
import {createPortal} from 'react-dom';
import {render, cleanup} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {RubberBandProvider, useNSERubberBandScroll} from '../../../src/NSE/Scroll';
import {PresentingDocumentContext} from '../../../src/NSE/Overlays/presentingDocument';
afterEach(cleanup);
it('opts short content into both boundaries and reports cleanup without changing the default',()=>{
 const changed=vi.fn();
 function Harness({alwaysBounce=false}) {
  const host=useRef<HTMLDivElement>(null), content=useRef<HTMLDivElement>(null);
  useNSERubberBandScroll(host,content,{alwaysBounce,onOffsetChange:changed});
  return <div ref={host}><div ref={content}>Short content</div></div>;
 }
 for(const enabled of [false,true]) {
  const view=render(<Harness alwaysBounce={enabled}/>);
  const host=view.container.firstElementChild as HTMLElement;
  Object.defineProperties(host,{clientHeight:{value:400},scrollHeight:{value:400},clientWidth:{value:300},scrollWidth:{value:300}});
  const pull=new WheelEvent('wheel',{deltaY:-200,bubbles:true,cancelable:true});
  host.dispatchEvent(pull);
  expect(pull.defaultPrevented).toBe(enabled);
  if(enabled)expect(changed.mock.lastCall?.[0].y).toBeGreaterThan(0);
  view.unmount();
  expect(changed.mock.lastCall?.[0]).toEqual({x:0,y:0});
 }
 const view=render(<Harness alwaysBounce/>);
 const host=view.container.firstElementChild as HTMLElement;
 Object.defineProperties(host,{clientHeight:{value:400},scrollHeight:{value:400},clientWidth:{value:300},scrollWidth:{value:300}});
 host.dispatchEvent(new WheelEvent('wheel',{deltaY:200,bubbles:true,cancelable:true}));
 expect(changed.mock.lastCall?.[0].y).toBeLessThan(0);
});

it('rubber-bands wheel input inside a detached child document for both managed scroll views and RubberBandProvider', () => {
 const frame = document.createElement('iframe');
 document.body.append(frame);
 const childDoc = frame.contentDocument!;
 const childWin = frame.contentWindow!;
 const mount = childDoc.createElement('div');
 childDoc.body.append(mount);
 const changed = vi.fn();

 function ChildHarness() {
  const host = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  useNSERubberBandScroll(host, content, { alwaysBounce: true, onOffsetChange: changed });
  return createPortal(
   <PresentingDocumentContext.Provider value={childDoc}>
    <RubberBandProvider>
     <div ref={host} data-testid="managed"><div ref={content}>Managed</div></div>
     <div data-testid="provider" style={{ overflowY: 'auto' }}><div>Provider child</div></div>
    </RubberBandProvider>
   </PresentingDocumentContext.Provider>,
   mount,
  );
 }

 const view = render(<ChildHarness />);
 try {
  const managed = mount.querySelector('[data-testid="managed"]') as HTMLElement;
  const provider = mount.querySelector('[data-testid="provider"]') as HTMLElement;
  Object.defineProperties(managed, { clientHeight: { value: 400 }, scrollHeight: { value: 400 }, clientWidth: { value: 300 }, scrollWidth: { value: 300 } });
  Object.defineProperties(provider, { clientHeight: { value: 200 }, scrollHeight: { value: 600 }, scrollTop: { value: 0 } });

  const childWheel = new childWin.WheelEvent('wheel', { deltaY: -180, bubbles: true, cancelable: true });
  managed.firstElementChild!.dispatchEvent(childWheel);
  expect(childWheel.defaultPrevented).toBe(true);
  expect(changed.mock.lastCall?.[0].y).toBeGreaterThan(0);
  expect(managed.style.getPropertyValue('--nse-rubber-band-offset-y')).not.toBe('');

  const providerWheel = new childWin.WheelEvent('wheel', { deltaY: -180, bubbles: true, cancelable: true });
  provider.firstElementChild!.dispatchEvent(providerWheel);
  expect(providerWheel.defaultPrevented).toBe(true);
  expect(provider.style.getPropertyValue('--nse-rubber-band-offset-y')).not.toBe('');
 } finally {
  view.unmount();
  frame.remove();
 }
});

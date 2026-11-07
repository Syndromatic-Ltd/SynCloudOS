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
import React, { createRef, useLayoutEffect } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NSEScrollView, type NSEScrollViewHandle } from "../../../src/NSE/Scroll/NSEScrollView";
import { NSEImageView, type NSEImageViewHandle } from "../../../src/NSE/Controls/Images/NSEImage";
import { NSEAnimationEnvironmentProvider } from "../../../src/NSE/Animation/NSEAnimationEnvironment";
import { AFXLayer } from "../../../src/FX/AnimationFX/AFXLayer";

describe("AppKit view access", () => {
 it("retains the image backing through StrictMode's mount probe", async () => {
  const ref=createRef<NSEImageViewHandle>();
  const seen: AFXLayer[]=[];
  const bindLayer=vi.fn(()=>new AFXLayer());
  function Owner() {
   useLayoutEffect(()=>{seen.push(ref.current!.layer!);},[]);
   return <NSEImageView ref={ref} wantsLayer src="/art.svg" controls={false}/>;
  }
  const view=render(<React.StrictMode><NSEAnimationEnvironmentProvider layers={{bindLayer,createRenderer:vi.fn()}}><Owner/></NSEAnimationEnvironmentProvider></React.StrictMode>);
  await act(async()=>{});
  expect(seen).toHaveLength(2);
  expect(seen[1]).toBe(seen[0]);
  expect(bindLayer).toHaveBeenCalledTimes(1);
  view.unmount();
 });
 it("commits NSScrollView.contentView before the owning view's appearance", () => {
  const ref=createRef<NSEScrollViewHandle>();
  let clip: HTMLElement | undefined;
  function Owner() { useLayoutEffect(()=>{clip=ref.current?.contentView.element;},[]); return <NSEScrollView ref={ref} rubberBand={false}>Document</NSEScrollView>; }
  const view=render(<Owner/>);
  expect(clip).toBe(view.container.querySelector('.nse-scroll-view'));
  Object.defineProperties(clip!,{clientWidth:{value:120},clientHeight:{value:80},scrollWidth:{value:400},scrollHeight:{value:900}});
  clip!.scrollTop=31; clip!.scrollLeft=12;
  expect(ref.current?.documentVisibleRect).toEqual({x:12,y:31,width:120,height:80});
  expect(ref.current?.contentView.bounds).toEqual(ref.current?.documentVisibleRect);
 });
 it("observes changed clip bounds and disconnects on unmount", async () => {
  const ref=createRef<NSEScrollViewHandle>(); const listener=vi.fn();
  const view=render(<NSEScrollView ref={ref} rubberBand={false}/>);
  const handle=ref.current!; const clip=handle.contentView;
  clip.postsBoundsChangedNotifications=true;
  clip.observeBoundsChanges(listener);
  act(()=>{clip.element.scrollTop=40;fireEvent.scroll(clip.element);});
  expect(listener).toHaveBeenCalledWith({x:0,y:40,width:0,height:0});
  const count=listener.mock.calls.length;
  view.unmount();
  fireEvent.scroll(clip.element); await new Promise(r=>setTimeout(r,30));
  expect(listener).toHaveBeenCalledTimes(count);
  expect(()=>clip.observeBoundsChanges(listener)).toThrow();
 });
 it("exposes a layer only when the image view is layer backed and releases it", async () => {
  const ref=createRef<NSEImageViewHandle>(); const bindLayer=vi.fn(()=>new AFXLayer());
  const layers={bindLayer,createRenderer:vi.fn()};
  const view=render(<NSEAnimationEnvironmentProvider layers={layers}><NSEImageView ref={ref} src="/art.svg" controls={false}/></NSEAnimationEnvironmentProvider>);
  expect(ref.current?.element).toBe(view.container.querySelector('.nse-control-image-view'));
  expect(ref.current?.layer).toBeNull(); expect(bindLayer).not.toHaveBeenCalled();
  view.rerender(<NSEAnimationEnvironmentProvider layers={layers}><NSEImageView ref={ref} wantsLayer src="/art.svg" controls={false}/></NSEAnimationEnvironmentProvider>);
  const layer=ref.current!.layer;
  expect(layer).toBeInstanceOf(AFXLayer); expect(ref.current!.layer).toBe(layer);
  expect(bindLayer.mock.calls[0]?.[0]).toBe(ref.current!.element);
  const signal=bindLayer.mock.calls[0]?.[1] as AbortSignal;
  const handle=ref.current!;
  view.unmount(); expect(handle.layer).toBeNull(); expect(ref.current).toBeNull();
  await act(async()=>{}); expect(signal.aborted).toBe(true);
 });
});

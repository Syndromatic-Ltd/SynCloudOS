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

import { describe, expect, it, vi } from 'vitest';
import { BrowserVideoPresentationAdapter } from '../../../src/SynCloudOS/PlatformAdapters/BrowserVideoPresentationAdapter';
import { VideoCaptureService } from '../../../src/SynCloudOS/VideoFX/VideoCaptureService';
import { createMountedVideoClient } from '../../../src/SynCloudOS/AppSDK/mountedVideoClient';
import { BrowserVideoCaptureAdapter } from '../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter';
import { VFXContentFilter } from '../../../src/FX/VideoFX/VFXContentFilter';
describe('VideoFX element capture host helper', () => {
  it('guards authorization and track state before target construction', async () => {
    const fromElement = vi.fn(async () => ({}));
    const adapter = new BrowserVideoPresentationAdapter(null, { RestrictionTarget: { fromElement } });
    const track = { readyState: 'ended', restrictTo: vi.fn(async () => {}) };
    const filter = new VFXContentFilter({} as Element);
    await expect(adapter.applyContentFilter(track, filter, new AbortController().signal, () => false)).rejects.toMatchObject({ name: 'SecurityError' });
    await expect(adapter.applyContentFilter(track, filter, new AbortController().signal)).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(fromElement).not.toHaveBeenCalled();
  });
  it('checks cancellation again after target construction', async () => {
    const abort = new AbortController();
    const adapter = new BrowserVideoPresentationAdapter(null, { CropTarget: { fromElement: async () => { abort.abort(); return {}; } } });
    const track = { readyState: 'live', cropTo: vi.fn(async () => {}) };
    await expect(adapter.applyContentFilter(track, new VFXContentFilter({} as Element, 'crop'), abort.signal)).rejects.toThrow();
    expect(track.cropTo).not.toHaveBeenCalled();
  });
  it('rejects unsupported modes and clears filters on the owned track', async () => {
    const adapter = new BrowserVideoPresentationAdapter(null);
    const track = { readyState: 'live', restrictTo: vi.fn(async () => {}), cropTo: vi.fn(async () => {}) };
    await expect(adapter.applyContentFilter(track, new VFXContentFilter({} as Element), new AbortController().signal)).rejects.toMatchObject({ name: 'NotSupportedError' });
    await adapter.applyContentFilter(track, null, new AbortController().signal);
    expect(track.restrictTo).toHaveBeenCalledWith(null);
    expect(track.cropTo).toHaveBeenCalledWith(null);
  });
  it('filters only its private display track and rejects camera sessions', async () => {
    const track = Object.assign(new EventTarget(), { kind: 'video', readyState: 'live', enabled: true, muted: false,
      stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }), restrictTo: vi.fn(async () => {}) });
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    const helper = new BrowserVideoPresentationAdapter(null, { RestrictionTarget: { fromElement: async () => 'owned-token' } });
    const platform = { getUserMedia: async () => stream, getDisplayMedia: async () => stream, enumerateDevices: async () => [], subscribeDeviceChange: () => () => {} };
    const adapter = new BrowserVideoCaptureAdapter(platform, helper);
    const camera = adapter.createSession(undefined, undefined, () => true);
    await camera.requestCamera();
    await expect(camera.setContentFilter!(new VFXContentFilter({} as Element))).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(track.restrictTo).not.toHaveBeenCalled(); camera.dispose();
    const display = adapter.createSession(undefined, undefined, () => true);
    await display.requestDisplay();
    await display.setContentFilter!(new VFXContentFilter({} as Element));
    expect(track.restrictTo).toHaveBeenCalledWith('owned-token');
    await display.setContentFilter!(null);
    expect(track.restrictTo).toHaveBeenLastCalledWith(null);
    display.dispose();
  });

  it('requires display and element entitlement before mounted filter browser access', async () => {
    const filterCalls = vi.fn(async () => {});
    const raw = { state: 'active', kind: 'display', settings: null, capabilities: { camera: true, display: true, deviceEnumeration: true },
      enumerateDevices: async () => [], requestCamera: vi.fn(), requestDisplay: vi.fn(), setContentFilter: filterCalls,
      subscribe: () => () => {}, suspend() {}, async resume() {}, dispose: vi.fn() };
    const service = new VideoCaptureService({ createSession: () => raw as never });
    let permissions = ['video.capture.display'];
    const client = createMountedVideoClient(service, new AbortController().signal, () => permissions, () => true);
    const session = client.createCaptureSession();
    await expect(session.setContentFilter!(new VFXContentFilter({} as Element))).rejects.toMatchObject({ name: 'SecurityError' });
    expect(filterCalls).not.toHaveBeenCalled();
    permissions = ['video.capture.display', 'video.capture.element'];
    await session.setContentFilter!(new VFXContentFilter({} as Element));
    expect(filterCalls).toHaveBeenCalledTimes(1);
    session.dispose(); service.dispose();
  });

});

it('reports pregrant target factories and verifies actual display-track methods', async () => {
  const empty = new BrowserVideoPresentationAdapter(null);
  expect(empty.elementCaptureCapabilities()).toEqual({ restriction: false, crop: false });
  const helper = new BrowserVideoPresentationAdapter(null, { RestrictionTarget: { fromElement: async () => ({}) }, CropTarget: { fromElement: async () => ({}) } });
  expect(helper.elementCaptureCapabilities()).toEqual({ restriction: true, crop: true });
  expect(helper.elementCaptureCapabilities({ readyState: 'live' })).toEqual({ restriction: false, crop: false });
  const track = Object.assign(new EventTarget(), { kind: 'video', readyState: 'live', enabled: true, muted: false,
    stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }), cropTo: vi.fn(async () => {}) });
  expect(helper.elementCaptureCapabilities(track)).toEqual({ restriction: false, crop: true });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  const platform = { getUserMedia: async () => stream, getDisplayMedia: async () => stream, enumerateDevices: async () => [], subscribeDeviceChange: () => () => {} };
  const session = new BrowserVideoCaptureAdapter(platform, helper).createSession(undefined, undefined, () => true);
  expect(session.capabilities).toMatchObject({ elementRestriction: true, elementCrop: true });
  await session.requestDisplay();
  expect(session.capabilities).toMatchObject({ elementRestriction: false, elementCrop: true });
  session.dispose();
  expect(session.capabilities).toMatchObject({ elementRestriction: false, elementCrop: false });
  expect(new BrowserVideoCaptureAdapter(platform).createSession().capabilities).toMatchObject({ elementRestriction: false, elementCrop: false });
});

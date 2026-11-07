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

import { describe, it, expect, vi } from 'vitest';
import { BrowserVideoPresentationAdapter } from '../../../src/SynCloudOS/PlatformAdapters/BrowserVideoPresentationAdapter';
import { createMountedVideoPresentationClient } from '../../../src/SynCloudOS/AppSDK/mountedVideoPresentationClient';
function fixture() {
  const doc = { pictureInPictureEnabled: true, pictureInPictureElement: null as unknown, exitPictureInPicture: vi.fn(async () => { doc.pictureInPictureElement = null; }) };
  const remote = Object.assign(new EventTarget(), { state: 'disconnected', watchAvailability: vi.fn(async (listener: (v:boolean)=>void) => { listener(false); return 42; }), cancelWatchAvailability: vi.fn(async () => {}), prompt: vi.fn(async () => {}) });
  const video = Object.assign(new EventTarget(), { remote, disablePictureInPicture: false, requestPictureInPicture: vi.fn(async () => { doc.pictureInPictureElement = video; return {}; }) });
  const adapter = new BrowserVideoPresentationAdapter(doc as never);
  return { doc, remote, video: video as unknown as HTMLVideoElement, adapter };
}
describe('VideoFX presentation', () => {
  it('denies before reading presentation target', () => {
    const adapter = new BrowserVideoPresentationAdapter(null);
    const client = createMountedVideoPresentationClient(adapter, new AbortController().signal, () => [], () => false);
    const video = new Proxy({}, { get() { throw new Error('target read'); } }) as HTMLVideoElement;
    expect(() => client.createPictureInPictureController(video)).toThrow(/authoris/i);
  });
  it('is passive and only exits its own PiP', async () => {
    const { adapter, video, doc } = fixture();
    const owner = new AbortController();
    const client = createMountedVideoPresentationClient(adapter, owner.signal, () => ["video.pictureInPicture", "video.route"], () => true);
    const pip = client.createPictureInPictureController(video);
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
    await pip.startPictureInPicture();
    expect(pip.isPictureInPictureActive).toBe(true);
    doc.pictureInPictureElement = {};
    await pip.stopPictureInPicture();
    expect(doc.exitPictureInPicture).not.toHaveBeenCalled();
    pip.dispose();
  });
  it('cleans up late PiP completion after abort', async () => {
    const { adapter, video, doc } = fixture();
    let finish!: () => void;
    vi.mocked(video.requestPictureInPicture).mockImplementation(() => new Promise(resolve => { finish = () => { doc.pictureInPictureElement = video; resolve({} as PictureInPictureWindow); }; }));
    const owner = new AbortController();
    const pip = createMountedVideoPresentationClient(adapter, owner.signal, () => ["video.pictureInPicture", "video.route"], () => true).createPictureInPictureController(video);
    const pending = pip.startPictureInPicture();
    owner.abort(); finish();
    await expect(pending).rejects.toThrow();
    expect(doc.exitPictureInPicture).toHaveBeenCalledTimes(1);
  });
  it('reports unknown routes until discovery and tears down a late watch id', async () => {
    const { adapter, video, remote } = fixture();
    let finish!: (id:number)=>void;
    remote.watchAvailability.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const owner = new AbortController();
    const detector = createMountedVideoPresentationClient(adapter, owner.signal, () => ["video.pictureInPicture", "video.route"], () => true).createRouteDetector(video);
    expect(detector.areRoutesAvailable).toBeNull();
    expect(remote.watchAvailability).not.toHaveBeenCalled();
    const pending = detector.startDiscovery();
    owner.abort(); finish(77);
    await expect(pending).rejects.toThrow();
    expect(remote.cancelWatchAvailability).toHaveBeenCalledWith(77);
  });
  it('discovers route availability and delegates the real chooser', async () => {
    const { adapter, video, remote } = fixture();
    const detector = createMountedVideoPresentationClient(adapter, new AbortController().signal, () => ["video.pictureInPicture", "video.route"], () => true).createRouteDetector(video);
    await detector.startDiscovery();
    expect(detector.areRoutesAvailable).toBe(false);
    await detector.prompt();
    expect(remote.prompt).toHaveBeenCalledTimes(1);
    detector.dispose();
    expect(remote.cancelWatchAvailability).toHaveBeenCalledWith(42);
  });
  it('reports unsupported browser APIs without fabricating an AirPlay route', async () => {
    const { video } = fixture();
    const adapter = new BrowserVideoPresentationAdapter(null);
    const target = Object.assign(new EventTarget(), { remote: undefined }) as unknown as HTMLVideoElement;
    const client = createMountedVideoPresentationClient(adapter, new AbortController().signal, () => ['video.pictureInPicture', 'video.route']);
    expect(client.capabilities(target)).toEqual({ pictureInPicture: false, remotePlayback: false });
    const detector = client.createRouteDetector(target);
    expect(detector.authorizationStatus()).toBe('unavailable');
    await expect(detector.startDiscovery()).rejects.toMatchObject({ name: 'NotSupportedError' });
    const pip = client.createPictureInPictureController(video);
    await expect(pip.startPictureInPicture()).rejects.toMatchObject({ name: 'NotSupportedError' });
    detector.dispose(); pip.dispose();
  });
  it('revokes discovery before event delivery', async () => {
    const { adapter, video, remote } = fixture();
    let permissions = ['video.route'];
    const client = createMountedVideoPresentationClient(adapter, new AbortController().signal, () => permissions);
    const detector = client.createRouteDetector(video);
    const listener = vi.fn(); detector.subscribe(listener);
    await detector.startDiscovery(); listener.mockClear();
    permissions = [];
    remote.dispatchEvent(new Event('connect'));
    expect(listener).toHaveBeenCalledTimes(1); // terminal lifecycle notification, without route delivery
    expect(detector.connectionState).toBe("unknown");
    expect(detector.capabilities.remotePlayback).toBe(false);
    expect(remote.cancelWatchAvailability).toHaveBeenCalledWith(42);
    expect(detector.authorizationStatus()).toBe('denied');
    await expect(detector.prompt()).rejects.toThrow();
  });

  it('supports unavailable host without reading an app target', () => {
    const client = createMountedVideoPresentationClient(undefined, new AbortController().signal, () => ['video.route', 'video.pictureInPicture']);
    const target = new Proxy({}, { get() { throw new Error('target read'); } }) as HTMLVideoElement;
    expect(client.capabilities(target)).toEqual({ pictureInPicture: false, remotePlayback: false });
    expect(() => client.createRouteDetector(target)).toThrow(/unavailable/);
    expect(() => client.createPictureInPictureController(target)).toThrow(/unavailable/);
  });

});

it('publishes reset and final lifecycle state before clearing observers', async () => {
  const { adapter, video, remote } = fixture();
  const detector = createMountedVideoPresentationClient(adapter, new AbortController().signal, () => ['video.route']).createRouteDetector(video);
  await detector.startDiscovery();
  const snapshots: unknown[] = [];
  detector.subscribe(() => snapshots.push({ state: detector.connectionState, enabled: detector.capabilities.remotePlayback }));
  detector.stopDiscovery();
  expect(snapshots).toEqual([{ state: 'unknown', enabled: true }]);
  detector.dispose();
  expect(snapshots).toEqual([{ state: 'unknown', enabled: true }, { state: 'unknown', enabled: false }]);
  remote.dispatchEvent(new Event('connect'));
  expect(snapshots).toHaveLength(2);
});

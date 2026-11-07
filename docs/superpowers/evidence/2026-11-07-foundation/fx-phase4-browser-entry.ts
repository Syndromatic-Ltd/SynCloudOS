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

import { createBrowserSpeechSynthesisAdapter } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserSpeechSynthesisAdapter";
import { createMountedAudioSpeechClient } from "../../../../src/SynCloudOS/AppSDK/mountedAudioSpeechClient";
import { AUFXSpeechUtterance } from "../../../../src/FX/AudioFX/AUFXSpeechSynthesizer";
import { BrowserNetworkPathAdapter } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserNetworkPathAdapter";
import { createMountedNetworkClient } from "../../../../src/SynCloudOS/AppSDK/mountedNetworkClient";
import { BrowserVideoPresentationAdapter } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserVideoPresentationAdapter";
import { createMountedVideoPresentationClient } from "../../../../src/SynCloudOS/AppSDK/mountedVideoPresentationClient";
import { BrowserAudioCaptureAdapter, createBrowserAudioCapturePlatform } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter";
import { BrowserVideoCaptureAdapter, createBrowserVideoCapturePlatform } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter";
import { VFXContentFilter } from "../../../../src/FX/VideoFX/VFXContentFilter";
import { BrowserLocationAdapter } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserLocationAdapter";
import { LocationService } from "../../../../src/SynCloudOS/LocationFX/LocationService";
import { createMountedLocationClient } from "../../../../src/SynCloudOS/AppSDK/mountedLocationClient";

document.title = "SynCloudOS FX verification";
const owner = new AbortController();
const locations = new LocationService(new BrowserLocationAdapter(window, navigator));
const location = createMountedLocationClient(locations, owner.signal, () => ["location.read", "location.request"], () => true).createManager();
const speech = createMountedAudioSpeechClient(createBrowserSpeechSynthesisAdapter(window), owner.signal, () => ["audio.speech"]).createSynthesizer();
const network = createMountedNetworkClient(new BrowserNetworkPathAdapter({ navigator, eventTarget: window }), owner.signal, () => ["network.read"], () => true);
const paths: unknown[] = []; network.createMonitor().start(path => paths.push(path));
const media = document.createElement("video"); media.muted = true; media.autoplay = true; media.playsInline = true; media.width = 480; media.height = 270; document.body.append(media);
const nativePresentation = new BrowserVideoPresentationAdapter(document, window as any);
const presentation = createMountedVideoPresentationClient(nativePresentation, owner.signal, () => ["video.pictureInPicture", "video.route"]);
const pip = presentation.createPictureInPictureController(media), route = presentation.createRouteDetector(media);
const session = new BrowserAudioCaptureAdapter(createBrowserAudioCapturePlatform(navigator, window)).createSession(owner.signal);
const capturePlatform = createBrowserVideoCapturePlatform(navigator);
if (capturePlatform?.getDisplayMedia) capturePlatform.getDisplayMedia = options => navigator.mediaDevices.getDisplayMedia({ ...options, preferCurrentTab: true } as DisplayMediaStreamOptions);
const capture = new BrowserVideoCaptureAdapter(capturePlatform, nativePresentation).createSession(owner.signal, Object.freeze({}), () => true);
const failure = (error: any) => ({ name: error?.name, message: error?.message });
let preview: MediaStream | null = null;
(window as any).capabilityVerification = {
  paths,
  async location() { try { const value = await location.current({ timeoutSeconds: 5 }); return { speedMetresPerSecond: value.speedMetresPerSecond, horizontalAccuracyMetres: value.horizontalAccuracyMetres }; } catch (error) { return { error: failure(error) }; } },
  capabilities: () => ({ userAgent: navigator.userAgent, secure: isSecureContext, speech: speech.capabilities, voices: speech.capabilities.speechSynthesis ? speech.speechVoices().length : 0, network: network.capabilities(), video: presentation.capabilities(media), audio: session.capabilities, capture: capture.capabilities, activation: navigator.userActivation.isActive }),
  async prepare() { const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 270; const c = canvas.getContext("2d")!; c.fillStyle = "#335060"; c.fillRect(0, 0, 480, 270); c.fillStyle = "white"; c.font = "24px sans-serif"; c.fillText("VideoFX live browser verification", 30, 140); preview = canvas.captureStream(1); media.srcObject = preview; await media.play(); },
  async pipStart() { try { await pip.startPictureInPicture(); return { active: pip.isPictureInPictureActive, native: document.pictureInPictureElement === media }; } catch (error) { return { error: failure(error) }; } },
  async pipStop() { await pip.stopPictureInPicture(); return { active: pip.isPictureInPictureActive }; },
  async speech() { const started = performance.now(); const result = speech.speak(new AUFXSpeechUtterance("SynCloudOS audio verification.", { language: "en-GB" })).then(() => ({ completed: true }), error => ({ error: failure(error) })); const status = await Promise.race([result, new Promise(resolve => setTimeout(() => resolve({ timedOut: true, isSpeaking: speech.isSpeaking }), 5000))]); speech.stopSpeaking(); return { ...status as object, elapsedMilliseconds: performance.now() - started, voices: speech.speechVoices().length }; },
  async routes() { try { await route.startDiscovery(); return { availability: route.areRoutesAvailable, state: route.connectionState }; } catch (error) { return { error: failure(error) }; } finally { route.stopDiscovery(); } },
  async category() { try { await session.setCategory("playback"); return { category: session.category }; } catch (error) { return { error: failure(error) }; } },
  async element() { let stage = "display chooser"; try { await capture.requestDisplay(); stage = "restriction target"; await capture.setContentFilter!(new VFXContentFilter(media)); stage = "clear restriction"; await capture.setContentFilter!(null); stage = "crop target"; await capture.setContentFilter!(new VFXContentFilter(media, "crop")); stage = "clear crop"; await capture.setContentFilter!(null); return { restricted: true, cropped: true, cleared: true, capabilities: capture.capabilities }; } catch (error) { return { stage, error: failure(error) }; } finally { capture.dispose(); } },
  dispose() { owner.abort(); locations.dispose(); preview?.getTracks().forEach(track => track.stop()); },
};

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

import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import "@syndromatic/syncloudos/webspring/styles.css";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import { createSynWare } from "@syndromatic/syncloudos/sdk/testing";
import * as audio from "@syndromatic/syncloudos/fx/audio";
import { GFXColour, GFXPath } from "@syndromatic/syncloudos/fx/graphics";
import { IFXFilterRegistry } from "@syndromatic/syncloudos/fx/image";
import * as media from "@syndromatic/syncloudos/fx/media";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXTypesetter } from "@syndromatic/syncloudos/fx/text";
import { VFXFrame, VFXFrameProcessingGraph, VFXPixelBuffer, VFXVideoFormat } from "@syndromatic/syncloudos/fx/video";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";
import { runTimelineTransportProbe } from "./fx-media-timeline-probe";

declare global { interface Window { fxMediaTimeline: any; disposeFXMediaTimeline?: () => void; } }
window.fxMediaTimeline = { ready: false };

function makeFrame(pts: media.MEFXTime) {
  const format = new VFXVideoFormat({ codedWidth: 96, codedHeight: 54, pixelFormat: "rgba8", colourSpace: "srgb" });
  const bytes = new Uint8Array(format.byteLength);
  for (let offset = 0; offset < bytes.length; offset += 4) bytes.set([32, 64, 112, 255], offset);
  const pixels = new VFXPixelBuffer(format, bytes);
  try { return new VFXFrame({ pixels, timing: new media.MEFXSampleTimingInfo({ presentationTime: pts, duration: media.MEFXTime.finite(1n, 30) }) }); }
  finally { pixels.close(); }
}

function Probe() {
  const app = useSCOS();
  const run = async () => {
    window.fxMediaTimeline = { ready: false, stage: "capabilities" };
    if (typeof AudioContext !== "function" || typeof AudioWorkletNode !== "function") {
      window.fxMediaTimeline = { ready: true, supported: false, reason: "audio-worklet-unavailable" }; return;
    }
    // The mounted output creates a device-default AudioContext. Request its
    // observed rate so the fixture measures transport behavior rather than
    // assuming every host's default device runs at 48 kHz.
    const outputProbe = new AudioContext();
    const outputSampleRate = outputProbe.sampleRate;
    await outputProbe.close();
    const engine = app.audio.createEngine(new audio.AUFXAudioFormat(outputSampleRate, 1));
    const timebase = app.media.createTimebase();
    const processor = app.video.createFrameProcessor({ maximumRetainedBytes: 4 * 1024 * 1024 });
    const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 54; document.body.append(canvas);
    let font: TFXFont | undefined, titledPixels: VFXPixelBuffer | undefined;
    try {
      window.fxMediaTimeline.stage = "processing";
      const response = await fetch("/font.ttf");
      if (!response.ok) throw new Error("timeline font fetch failed: " + response.status);
      font = await TFXFont.create(new Uint8Array(await response.arrayBuffer()), new TFXFontDescriptor({ size: 12 }));
      const title = new TFXTypesetter(new TFXAttributedString("Timeline", [{ start: 0, end: 8, font }])).createLine(0, 8);
      const source = makeFrame(media.MEFXTime.finite(0n, 1));
      const graph = new VFXFrameProcessingGraph(input => new IFXFilterRegistry().create("invert", {}).apply(input));
      const filtered = await processor.process(source, graph, { interpolation: "nearest" });
      const processing = { backend: filtered.diagnostics.backend, copyCount: filtered.diagnostics.copyCount, peakRetainedBytes: filtered.diagnostics.peakRetainedBytes };
      source.close();
      const decorated = processor.draw(filtered.frame, context => {
        context.fillPath(GFXPath.rect({ x: 0, y: 35, width: 96, height: 19 }), GFXColour.rgba(0, 0, 0, 0.55));
      }); filtered.frame.close();
      const titled = processor.drawText(decorated.frame, title, { origin: { x: 6, y: 49 }, colour: GFXColour.rgba(1, 1, 1, 1) });
      decorated.frame.close(); titledPixels = titled.frame.copyPixelBuffer(); titled.frame.close();
      const drawing = canvas.getContext("2d")!;
      // Audio and video originate from the same mounted facade, which owns the
      // capability token; this independent fixture never manufactures a host token.
      const playback = await runTimelineTransportProbe({
        audio, media, engine, timebase, createCoordinator: app.video.createPresentationCoordinator,
        stage(name) { window.fxMediaTimeline.stage = name; },
        makeFrame(position) { return new VFXFrame({ pixels: titledPixels!, timing: new media.MEFXSampleTimingInfo({ presentationTime: position, duration: media.MEFXTime.finite(1n, 30) }) }); },
        draw(frame) {
          const pixels = frame.toGFXImage();
          drawing.putImageData(new ImageData(new Uint8ClampedArray(pixels.copyData()), pixels.width, pixels.height), 0, 0);
        },
      });
      const pixels = drawing.getImageData(0, 0, 96, 54).data;
      let titleInkPixels = 0;
      for (let offset = 35 * 96 * 4; offset < pixels.length; offset += 4)
        if (pixels[offset]! > 230 && pixels[offset + 1]! > 230 && pixels[offset + 2]! > 230) titleInkPixels++;
      window.fxMediaTimeline = {
        ready: true, supported: true, evidenceKind: "installed-mounted-worklet-pcm-and-canvas",
        acknowledgementKind: "awaited-mounted-transitions-and-observed-output",
        processing, playback, titleInkPixels, drawnPixel: Array.from(pixels.slice(0, 4)),
        titleOverlay: { backend: titled.diagnostics.backend, copyCount: titled.diagnostics.copyCount, peakRetainedBytes: titled.diagnostics.peakRetainedBytes },
      };
    } finally {
      titledPixels?.close(); font?.dispose(); processor.dispose(); timebase.dispose(); engine.dispose(); canvas.remove();
    }
  };
  return <button id="run" onClick={() => { void run().catch(error => {
    const previous = window.fxMediaTimeline ?? {};
    window.fxMediaTimeline = { ...previous, ready: false, error: error instanceof Error ? error.message || String(error) : String(error),
      errorName: error instanceof Error ? error.name : typeof error, stack: error instanceof Error ? error.stack ?? null : null };
  }); }}>Run VFX-06 timeline</button>;
}

function Website({ actions, applicationOutlet }: WebspringViewProps) {
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.vfx06"); }}>Open VFX-06 probe</button>{applicationOutlet}</main>;
}

const shell = defineWebspring({
  manifest: { schemaVersion: 1, id: "org.example.vfx06-shell", version: "1.0.0", title: "VFX-06 shell", webspringShell: { views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }], defaults: { desktop: "website", tablet: "website", mobile: "website" }, homeRoute: "/", branding: { name: { key: "brand", fallback: "VFX-06" } } } },
  components: { website: Website },
});
const app = createSynWare({
  manifest: { schemaVersion: 1, id: "org.example.vfx06", version: "1.0.0", title: "VFX-06 Probe", permissions: ["audio.play"], runtime: { policy: { public: true } }, presentations: ["desktop", "tablet", "mobile"], routes: [{ path: "/vfx06", primary: true }], webspring: { visible: true, order: 1 } },
  root: Probe,
});
mountSynCloudOS({ element: document.getElementById("root")!, bundles: [app], shell, authentication: "disabled" })
  .then(host => { window.disposeFXMediaTimeline = () => host.dispose("VFX-06 installed consumer verification"); })
  .catch(error => { window.fxMediaTimeline = { ready: false, error: String(error) }; });

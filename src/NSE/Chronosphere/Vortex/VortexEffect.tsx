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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNSEAnimationEnvironment } from "../../Animation/NSEAnimationEnvironment";
import { useChronosphereEnvironment } from "../chronosphereEnvironment";
import { AFXTransform3D } from "../../../FX/AnimationFX/AFXTransform3D";
import { IFXFilterRegistry } from "../../../FX/ImageFX/IFXFilterRegistry";
import { IFXShader } from "../../../FX/ImageFX/IFXShader";
import { observeEffectFrames } from "./effectFrames";
import { loadVortexImages, type VortexImages } from "./loadVortexImages";
import { vortexAssets } from "./vortexAssets";
import { VortexParticles, makeVortexPointSprite } from "./vortexParticles";
import { resolveVortexPreset, sampleVortexTrack } from "./vortexPresets";
import { VORTEX_PLATE_SHADER, VORTEX_SPIN_SHADER } from "./vortexShaders";
import type { VortexLayerProps } from "./vortexTypes";
import "./vortex.css";

const plateShader = new IFXShader(VORTEX_PLATE_SHADER, {
  uTint: { type: "vec3", value: [1, 1, 1] }, uUvScale: { type: "vec2", value: [1, 1] }, uUvOffset: { type: "vec2", value: [0, 0] }, uRadialFade: { type: "float", value: 0 }, uAlpha: { type: "float", value: 1 },
});
const addition = new IFXFilterRegistry().create("blend", { mode: "addition" });

/**
 * The Time Machine vortex: nebula, stars, a spinning cloud and the warm core, drawn with
 * AnimationFX layers. Any app may stage it; Chronosphere's Vortex view stands on it.
 */
export function VortexEffect({ active = true, eager = false, ariaLabel, decorative = true, className = "", style, maxDpr = 2, preset = "screensaver", presetOverrides, reducedMotion = "system", travelImpulse, preparedImages }: VortexLayerProps) {
  const app = useChronosphereEnvironment();
  const { layers, frames, reducedMotion: systemReducedMotion } = useNSEAnimationEnvironment();
  const recipe = useMemo(() => resolveVortexPreset(preset, presetOverrides), [preset, presetOverrides]);
  const wrapper = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const impulseRef = useRef(travelImpulse);
  activeRef.current = active; impulseRef.current = travelImpulse;
  const [started, setStarted] = useState(active || eager);
  const [loadedImages, setImages] = useState<VortexImages | null>(null);
  const images = preparedImages ?? loadedImages;
  const [status, setStatus] = useState("loading");
  const [failure, setFailure] = useState<string | undefined>();
  const wake = useRef<(() => void) | null>(null);
  const staticMotion = reducedMotion === "static" || (reducedMotion === "system" && systemReducedMotion);
  const off = reducedMotion === "off";

  useEffect(() => { if (active || eager) setStarted(true); wake.current?.(); }, [active, eager, travelImpulse]);
  useEffect(() => {
    if (!started || preparedImages) return;
    const controller = new AbortController();
    setImages(null); setFailure(undefined);
    void loadVortexImages(app.images, controller.signal).then(values => {
      if (!controller.signal.aborted) setImages(values);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setStatus("unavailable");
      setFailure(error instanceof Error ? error.message : String(error));
      if (import.meta.env.DEV) console.error("Vortex image loading failed", error);
    });
    return () => { controller.abort(); };
  }, [app.images, started, preparedImages]);

  useLayoutEffect(() => {
    const element = target.current;
    const viewportHost = wrapper.current;
    if (!element || !viewportHost || !images || !layers || !frames || off) return;
    const controller = new AbortController();
    let createdScene: ReturnType<typeof layers.createRenderer> | undefined;
    let playback: ReturnType<typeof observeEffectFrames> | undefined;
    let observer: { disconnect(): void } | null = null;
    const cleanup = () => { wake.current = null; playback?.dispose(); observer?.disconnect(); controller.abort(); createdScene?.dispose(); };
    try {
      // A frame the device cannot draw ends the scene; the static plate shows instead.
      const fail = (error: unknown) => {
        if (controller.signal.aborted) return;
        cleanup();
        setStatus("unavailable");
        setFailure(error instanceof Error ? error.message : String(error));
        if (import.meta.env.DEV) console.error("Vortex frame failed", error);
      };
      const scene = layers.createRenderer(element, { maximumQuads: 4096, onRenderError: fail }, controller.signal);
      createdScene = scene;
      const nebula = scene.makeLayer();
      const stars = scene.makeParticleLayer(); stars.compositingFilter = addition;
      const supernova = scene.makeLayer(); supernova.compositingFilter = addition;
      // The particles add inside the original square cloud space; the outer
      // group applies Spin Distortion to their sum before adding to the scene.
      const cloudComposite = scene.makeLayer(); cloudComposite.compositingFilter = addition;
      const clouds = scene.makeParticleLayer(cloudComposite); clouds.compositingFilter = addition;
      const glow = scene.makeLayer(); glow.compositingFilter = addition;
      nebula.contents = images.starNebula;
      supernova.contents = images.galaxySupernova;
      glow.contents = images.coreGlow;
      const cloudSprite = makeVortexPointSprite(images.cloudParticle), starSprite = makeVortexPointSprite();
      const simulation = new VortexParticles(recipe);
      const spin = new IFXShader(VORTEX_SPIN_SHADER, {
        uAngle: { type: "float", value: recipe.swirl.angle }, uRadius: { type: "float", value: recipe.swirl.radius }, uPower: { type: "float", value: recipe.swirl.power }, uAlpha: { type: "float", value: 1 },
      });
      supernova.filters = [plateShader.withUniforms({ uRadialFade: 1 })];
      glow.filters = [plateShader.withUniforms({ uRadialFade: 1, uTint: recipe.core.glowColour })];
      let width = 1, height = 1, opacity = 0;
      const draw = () => {
        const { core, plates, swirl, timeline } = recipe, min = Math.min(width, height), t = simulation.elapsed;
        const sun = sampleVortexTrack(timeline.sunAlpha, t), halo = sampleVortexTrack(timeline.haloAlpha, t);
        const fullFrame = { x: 0, y: 0, width, height };
        nebula.frame = fullFrame; stars.frame = fullFrame;
        const screenAspect = width / height, plateAspect = 1437 / 952;
        const sx = (screenAspect > plateAspect ? 1 : screenAspect / plateAspect) / plates.nebulaScale;
        const sy = (screenAspect > plateAspect ? plateAspect / screenAspect : 1) / plates.nebulaScale;
        // A crop of the plate, not a filter: a full-viewport filtered layer
        // costs two offscreen surfaces the size of the screen every frame.
        nebula.contentsRect = { x: (1 - sx) * 0.5 + Math.sin(t * 0.05) * plates.nebulaDrift, y: (1 - sy) * 0.5 + Math.cos(t * 0.037) * plates.nebulaDrift, width: sx, height: sy };
        nebula.opacity = plates.nebulaAlpha * opacity * Math.min(1, 0.2 + t / 0.6);
        stars.setParticles(simulation.starBatch(starSprite, width, height)); stars.opacity = opacity;
        const centeredFrame = (w: number, h: number) => ({ x: core.anchorX * width - w * 0.5, y: core.anchorY * height - h * 0.5, width: w, height: h });
        const superDiameter = plates.supernovaScale * min;
        supernova.frame = centeredFrame(superDiameter, superDiameter / plateAspect);
        supernova.opacity = plates.supernovaAlpha * sun * opacity;
        const diameter = swirl.screenScale * min;
        cloudComposite.frame = centeredFrame(recipe.fboSize, recipe.fboSize);
        cloudComposite.transform = AFXTransform3D.scale(diameter / recipe.fboSize);
        clouds.frame = { x: 0, y: 0, width: recipe.fboSize, height: recipe.fboSize };
        clouds.setParticles(simulation.cloudBatch(cloudSprite, recipe.fboSize));
        cloudComposite.filters = [spin.withUniforms({ uAlpha: Math.max(0, swirl.alpha * Math.min(1, sun + 0.15) * opacity) })];
        const pulse = 1 + Math.sin(t * core.glowPulseSpeed) * core.glowPulseAmplitude;
        // Filter targets follow bounds, so scaling the retained quad preserves
        // the pulse without reallocating both glow surfaces as its size changes.
        const glowDiameter = core.glowRadius * 2 * min;
        glow.frame = centeredFrame(glowDiameter, glowDiameter);
        glow.transform = AFXTransform3D.scale(pulse);
        // The source caps additive core ignition at 1.4; preserve it in the filter.
        glow.opacity = 1;
        glow.filters = [plateShader.withUniforms({ uRadialFade: 1, uTint: core.glowColour, uAlpha: Math.min(1.4, (core.glowAlpha * sun + core.haloAlpha * halo) * opacity) })];
      };
      const resize = () => {
        if (scene.disposed) return;
        // Presentation pins the canvas's inline size; its wrapper owns layout.
        width = Math.max(1, Math.round(viewportHost.clientWidth || viewportHost.getBoundingClientRect().width));
        height = Math.max(1, Math.round(viewportHost.clientHeight || viewportHost.getBoundingClientRect().height));
        draw();
        scene.setViewport({ width, height, pixelRatio: Math.max(1, Math.min(maxDpr, viewportHost.ownerDocument.defaultView?.devicePixelRatio || 1)) });
      };
      resize();
      const Observer = viewportHost.ownerDocument.defaultView?.ResizeObserver;
      if (Observer) { const observing = new Observer(resize); observing.observe(viewportHost); observer = observing; }
      playback = observeEffectFrames(frames, (_time, delta, staticFrame) => {
        if (scene.disposed) return false;
        const staticNow = staticMotion || (reducedMotion !== "animate" && staticFrame);
        if (staticNow) { simulation.elapsed = recipe.staticTimeSeconds; opacity = activeRef.current ? 1 : 0; }
        else {
          simulation.setTravelImpulse(impulseRef.current);
          simulation.advance(delta / 1000, width, height);
          opacity += ((activeRef.current ? 1 : 0) - opacity) * Math.min(1, delta / Math.max(1, activeRef.current ? recipe.fadeInMs : recipe.fadeOutMs));
          if (!activeRef.current && opacity < 0.01) opacity = 0;
        }
        draw();
        return !staticNow && (activeRef.current || opacity > 0);
      });
      wake.current = playback.wake;
      setFailure(undefined);
      setStatus("fx");
      return cleanup;
    } catch (error) {
      cleanup();
      setStatus("unavailable");
      setFailure(error instanceof Error ? error.message : String(error));
      if (import.meta.env.DEV) console.error("Vortex scoped renderer setup failed", error);
    }
  }, [images, layers, frames, recipe, maxDpr, staticMotion, reducedMotion, off]);

  return <div ref={wrapper} className={["vortex-effect", className].filter(Boolean).join(" ")} style={style} data-effect="vortex" data-preset={recipe.id} data-active={active ? "true" : "false"} data-renderer={off ? "off" : status} data-renderer-error={import.meta.env.DEV ? failure : undefined} aria-hidden={decorative ? true : undefined} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : ariaLabel}>{status === "unavailable" ? <div className="vortex-effect__plate" style={{ backgroundImage: `url("${vortexAssets.starNebula}")` }} /> : null}<canvas ref={target} className="vortex-effect__surface" /></div>;
}

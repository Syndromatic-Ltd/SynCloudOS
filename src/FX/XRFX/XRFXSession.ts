import { fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import type { DFXQueue } from "../DispatchFX/DFXQueue";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import { XRFXConfiguration } from "./XRFXConfiguration";
import { XRFXWorldTrackingConfiguration } from "./XRFXWorldTrackingConfiguration";
import { XRFXOrientationTrackingConfiguration } from "./XRFXOrientationTrackingConfiguration";
import type { XRFXFrame } from "./XRFXFrame";
import { XRFXAnchor } from "./XRFXAnchor";
import { XRFXRaycastQuery } from "./XRFXRaycastQuery";
import type { XRFXRaycastResult } from "./XRFXRaycastResult";
import type { XRFXSessionRunOptions } from "./XRFXSessionRunOptions";
import type { XRFXSessionDelegate } from "./XRFXSessionDelegate";
import { XRFXError } from "./XRFXError";
import { deferredXRTypes, xrBinding, xrSessions } from "./internal/xrBindings";
import { xrFailure, xrPortFor, type XRRun } from "./internal/xrPort";
/** ARSession. Native acquisition reports asynchronous failure through its delegate. */
export class XRFXSession {
  #binding; #session; #port; #accessGeneration; #main;
  #queue: DFXQueue | null = null; #delegate: XRFXSessionDelegate | null = null;
  #frame: XRFXFrame | null = null; #configuration: XRFXConfiguration | null = null;
  #anchors = new Map<string, XRFXAnchor>(); #run: XRRun | undefined; #controller: AbortController | undefined;
  #generation = 0; #ended = false; #watching = false; #hasTracking = false;
  #releaseAccess: (() => void) | undefined; #releaseSession: (() => void) | undefined;
  constructor() {
    this.#binding = xrBinding(new.target); this.#session = this.#binding.resolve(); this.#port = xrPortFor(this.#session.context);
    this.#accessGeneration = this.#port.generation; this.#main = dispatchQueueForSession(this.#session).main;
    xrSessions.set(this, { activate: () => this.#watch(), dispose: () => this.#end() });
    if (!deferredXRTypes.has(new.target)) this.#watch();
  }
  get delegate(): XRFXSessionDelegate | null { return this.#delegate; }
  set delegate(value: XRFXSessionDelegate | null) { this.#assertLifetime(); this.#delegate = value; }
  /** null selects this exact application's main Dispatch queue. */
  get delegateQueue(): DFXQueue | null { return this.#queue; }
  set delegateQueue(value: DFXQueue | null) { this.#assertLifetime(); this.#queue = value; }
  get currentFrame(): XRFXFrame | null { return this.#frame; }
  get configuration(): XRFXConfiguration | null { return this.#configuration; }
  run(configuration: XRFXConfiguration, options: XRFXSessionRunOptions = 0): void {
    this.#assert();
    const kind = configuration instanceof XRFXWorldTrackingConfiguration ? "world" : configuration instanceof XRFXOrientationTrackingConfiguration ? "orientation" : null;
    if (!kind || !Number.isInteger(options) || options < 0 || (options & ~15) || !["gravity", "gravityAndHeading", "camera"].includes(configuration.worldAlignment) || typeof configuration.isLightEstimationEnabled !== "boolean") throw new XRFXError("invalidConfiguration");
    if (options & 8) throw new XRFXError("unsupportedConfiguration", "Scene reconstruction is unavailable.");
    if (this.#configuration && (this.#hasTracking || this.#controller) && !(options & 1)) {
      const sameKind = (this.#configuration instanceof XRFXWorldTrackingConfiguration) === (kind === "world");
      if (!this.#controller || !sameKind || this.#configuration.worldAlignment !== configuration.worldAlignment || this.#configuration.isLightEstimationEnabled !== configuration.isLightEstimationEnabled) throw new XRFXError("unsupportedConfiguration", "Native tracking cannot be preserved across reacquisition; explicitly request resetTracking.");
      if (options & 2) for (const anchor of this.#anchors.values()) this.remove(anchor);
      return;
    }
    if (this.#anchors.size && !(options & 2)) throw new XRFXError("unsupportedConfiguration", "Native anchors cannot be preserved across tracking reset; explicitly request removeExistingAnchors.");
    this.#cancelRun();
    const generation = this.#generation, controller = new AbortController(); this.#controller = controller;
    const copy = kind === "world" ? new XRFXWorldTrackingConfiguration() : new XRFXOrientationTrackingConfiguration();
    copy.worldAlignment = configuration.worldAlignment; copy.isLightEstimationEnabled = configuration.isLightEstimationEnabled;
    this.#configuration = Object.freeze(copy);
    void this.#port.start({ kind, worldAlignment: copy.worldAlignment, isLightEstimationEnabled: copy.isLightEstimationEnabled, options }, controller.signal, {
      frame: frame => {
        if (!this.#live(generation)) return;
        const next = new Map(frame.anchors.map(anchor => [anchor.identifier.uuidString, anchor]));
        const added = frame.anchors.filter(anchor => !this.#anchors.has(anchor.identifier.uuidString));
        const updated = frame.anchors.filter(anchor => this.#anchors.has(anchor.identifier.uuidString));
        const removed = [...this.#anchors.values()].filter(anchor => !next.has(anchor.identifier.uuidString));
        this.#anchors = next; this.#frame = frame;
        this.#enqueue(generation, () => {
          if (added.length) this.#delegate?.sessionDidAddAnchors?.(this, Object.freeze(added));
          if (this.#live(generation) && updated.length) this.#delegate?.sessionDidUpdateAnchors?.(this, Object.freeze(updated));
          if (this.#live(generation) && removed.length) this.#delegate?.sessionDidRemoveAnchors?.(this, Object.freeze(removed));
          if (this.#live(generation)) this.#delegate?.sessionDidUpdateFrame?.(this, frame);
        });
      },
      failed: error => this.#fail(generation, error),
      interrupted: () => this.#enqueue(generation, () => this.#delegate?.sessionWasInterrupted?.(this)),
      interruptionEnded: () => this.#enqueue(generation, () => this.#delegate?.sessionInterruptionEnded?.(this)),
      ended: () => { if (this.#live(generation)) this.#cancelRun(); },
    }).then(run => {
      if (!this.#live(generation)) { void run.pause().catch(() => {}); return; }
      this.#run = run; this.#hasTracking = true;
    }, error => {
      if (generation === this.#generation) {
        this.#controller?.abort(); this.#controller = undefined;
        if (!this.#hasTracking) this.#configuration = null;
      }
      this.#fail(generation, error);
    });
  }
  /** Pauses native processing. A browser session must reacquire its native tracking space on the next run. */
  pause(): void {
    this.#assertLifetime(); const run = this.#run, controller = this.#controller;
    this.#generation++; this.#run = undefined; this.#controller = undefined; this.#frame = null; this.#anchors.clear();
    if (!run) { controller?.abort(); return; }
    const generation = this.#generation;
    void run.pause().catch(error => this.#fail(generation, error)).finally(() => controller?.abort());
  }
  add(anchor: XRFXAnchor): void { this.#anchorOperation("add", anchor); }
  remove(anchor: XRFXAnchor): void { this.#anchorOperation("remove", anchor); }
  /** Browser hit-test setup and the next native frame make this Apple member asynchronous. */
  async raycast(query: XRFXRaycastQuery): Promise<readonly XRFXRaycastResult[]> {
    this.#assert(); if (!(query instanceof XRFXRaycastQuery)) throw new XRFXError("invalidConfiguration");
    if (!this.#run) throw new XRFXError("requestFailed", "Run the session before raycasting.");
    const generation = this.#generation;
    try { const values = await this.#run.raycast(query); if (!this.#live(generation)) throw new XRFXError("requestFailed", "The raycast ended."); return Object.freeze([...values]); }
    catch (error) { throw xrFailure(error); }
  }
  #anchorOperation(operation: "add" | "remove", anchor: XRFXAnchor): void {
    this.#assert(); if (!(anchor instanceof XRFXAnchor)) throw new XRFXError("invalidConfiguration");
    if (!this.#run) throw new XRFXError("requestFailed", "Run the session before changing anchors.");
    const generation = this.#generation; void this.#run[operation](anchor).catch(error => this.#fail(generation, error));
  }
  #watch(): void {
    if (this.#watching || this.#ended) return; this.#watching = true;
    this.#port.bindAccessLifetime(); this.#releaseAccess = this.#port.observeAccessLoss(() => this.#end());
    this.#releaseSession = observeFXSessionEnd(this.#session, () => this.#end());
  }
  #assertLifetime(): void { if (this.#ended || this.#accessGeneration !== this.#port.generation) throw new XRFXError("requestFailed", "XR application lifetime ended."); this.#binding.resolve(); }
  #assert(): void { this.#assertLifetime(); this.#port.assertAccess(this.#accessGeneration); this.#watch(); }
  #live(generation: number): boolean { try { this.#assert(); return generation === this.#generation; } catch { return false; } }
  #enqueue(generation: number, work: () => void): void { if (this.#live(generation)) (this.#queue ?? this.#main).async(() => { if (this.#live(generation)) work(); }); }
  #fail(generation: number, error: unknown): void { const converted = xrFailure(error); this.#enqueue(generation, () => this.#delegate?.sessionDidFailWithError?.(this, converted)); }
  #cancelRun(): void { this.#generation++; this.#controller?.abort(); this.#controller = undefined; this.#run = undefined; this.#frame = null; this.#anchors.clear(); }
  #end(): void { if (this.#ended) return; this.#ended = true; this.#cancelRun(); this.#delegate = null; this.#releaseAccess?.(); this.#releaseAccess = undefined; this.#releaseSession?.(); this.#releaseSession = undefined; }
}
Object.defineProperty(XRFXSession, fxAttributedClass, { value: true });

import type { XRFXWorldAlignment } from "../XRFXWorldAlignment";
import type { XRFXFrame } from "../XRFXFrame";
import type { XRFXAnchor } from "../XRFXAnchor";
import type { XRFXRaycastQuery } from "../XRFXRaycastQuery";
import type { XRFXRaycastResult } from "../XRFXRaycastResult";
import { XRFXError } from "../XRFXError";
export interface XRConfiguration { readonly kind: "world" | "orientation"; readonly worldAlignment: XRFXWorldAlignment; readonly isLightEstimationEnabled: boolean; readonly options: number; }
export interface XRCallbacks { frame(frame: XRFXFrame): void; failed(error: unknown): void; interrupted(): void; interruptionEnded(): void; ended(): void; }
export interface XRRun { add(anchor: XRFXAnchor): Promise<void>; remove(anchor: XRFXAnchor): Promise<void>; raycast(query: XRFXRaycastQuery): Promise<readonly XRFXRaycastResult[]>; pause(): Promise<void>; }
export interface XRAdapter { isSupported(kind: XRConfiguration["kind"]): Promise<boolean>; start(configuration: XRConfiguration, signal: AbortSignal, callbacks: XRCallbacks): Promise<XRRun>; }
export interface XRPort extends XRAdapter { readonly generation: number; isSupported(kind: XRConfiguration["kind"], signal?: AbortSignal): Promise<boolean>; assertAccess(generation: number, granted?: boolean): void; bindAccessLifetime(): void; observeAccessLoss(listener: () => void): () => void; }
const ports = new WeakMap<object, XRPort>(), adapters = new WeakMap<object, XRAdapter>();
export function associateXRPort(context: object, port: XRPort): void { ports.set(context, port); }
export function xrPortFor(context: object): XRPort { const port = ports.get(context); if (!port) throw new XRFXError("sensorUnavailable", "XR is unavailable."); return port; }
export function associateXRAdapter(environment: object, adapter: XRAdapter): void { adapters.set(environment, adapter); }
export function xrAdapterFor(environment: object): XRAdapter | undefined { return adapters.get(environment); }
export function isXRDenial(error: unknown): boolean { return typeof error === "object" && error !== null && "name" in error && (error.name === "NotAllowedError" || error.name === "SecurityError"); }
export function xrFailure(error: unknown): XRFXError { if (error instanceof XRFXError) return error; const name = typeof error === "object" && error !== null && "name" in error ? error.name : ""; return new XRFXError(isXRDenial(error) ? "cameraUnauthorized" : name === "NotSupportedError" ? "unsupportedConfiguration" : name === "AbortError" ? "requestFailed" : "sensorFailed", error instanceof Error ? error.message : "XR operation failed."); }

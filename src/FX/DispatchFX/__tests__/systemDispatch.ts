// Existing semantic tests exercise the framework-internal system binding.
export * from "../public";
import { systemDispatch } from "../internal/systemBinding";
export const { DFXQueue, DFXGroup, DFXSemaphore, DFXSource, DFXWorkItem } = systemDispatch();
export type DFXQueue = import("../public").DFXQueue;
export type DFXGroup = import("../public").DFXGroup;
export type DFXSemaphore = import("../public").DFXSemaphore;
export type DFXSource = import("../public").DFXSource;
export type DFXWorkItem<R = unknown> = import("../public").DFXWorkItem<R>;

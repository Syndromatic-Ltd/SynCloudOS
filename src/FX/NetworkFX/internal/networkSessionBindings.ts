import type { FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
/** Exact-context hook construction. Per-class association, never ambient state or a public marker. */
export const networkSessionBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();

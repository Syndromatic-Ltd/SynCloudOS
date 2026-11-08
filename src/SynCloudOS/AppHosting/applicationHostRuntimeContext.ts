import { createContext } from "react";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

/** Host-private identity bridge. The public kernel context stays hidden from applications. */
export const ApplicationHostRuntimeContext = createContext<SynCloudOSRuntime | null>(null);

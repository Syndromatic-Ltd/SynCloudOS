import { createContext, useContext, type PropsWithChildren } from "react";

/** @internal Application visibility authority is independent of frame capability. */
interface NSEViewActivitySource {
  getSuspended(): boolean;
  subscribe(listener: () => void): () => void;
}
const ActivityContext = createContext<NSEViewActivitySource | null>(null);

/** @internal Supplied by the owning framework host; never a SynWare API. */
export function NSEViewActivityProvider({ source, children }: PropsWithChildren<{ source: NSEViewActivitySource }>) {
  return <ActivityContext.Provider value={source}>{children}</ActivityContext.Provider>;
}
/** @internal The controller host consumes lifecycle activity even without AFX timing. */
export function useNSEViewActivitySource(): NSEViewActivitySource | null { return useContext(ActivityContext); }

import { createContext, useContext, type PropsWithChildren } from "react";

/** @internal Application visibility authority is independent of frame capability. */
interface ViewActivitySource {
  getSuspended(): boolean;
  subscribe(listener: () => void): () => void;
}
const ActivityContext = createContext<ViewActivitySource | null>(null);

/** @internal Supplied by the owning framework host; never a SynWare API. */
export function ViewActivityProvider({ source, children }: PropsWithChildren<{ source: ViewActivitySource }>) {
  return <ActivityContext.Provider value={source}>{children}</ActivityContext.Provider>;
}
/** @internal The controller host consumes lifecycle activity even without AFX timing. */
export function useNSEViewActivitySource(): ViewActivitySource | null { return useContext(ActivityContext); }

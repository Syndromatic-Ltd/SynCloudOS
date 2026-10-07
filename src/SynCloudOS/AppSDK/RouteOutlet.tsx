/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, {
  Component,
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import type { AppRouteSession, AppRouteSessionSnapshot } from "../Routing/appSdkRoutePort";
import type {
  SynWareRouteErrorProps,
  SynWareRouteGraph,
} from "../Routing/appSdkRoutePort";

interface RoutePresentationContextValue {
  readonly graph: SynWareRouteGraph;
  readonly session: AppRouteSession;
  readonly preload?: (href: string, options: { readonly data?: boolean; readonly signal?: AbortSignal }) => Promise<unknown>;
  readonly authority?: () => Readonly<{ operationId: string | null; authorizationGeneration: number }>;
  readonly retry?: () => void;
  readonly absoluteUrl?: (href: string) => string;
  readonly onRenderError?: (revision: number, error: unknown) => void;
}

const RoutePresentationContext = createContext<RoutePresentationContextValue | null>(null);
const RouteDepthContext = createContext(0);

export interface SynWareRouteSessionProviderProps extends PropsWithChildren {
  readonly graph: SynWareRouteGraph;
  readonly session: AppRouteSession;
  readonly onRenderRevision?: (revision: number) => void;
  readonly preload?: RoutePresentationContextValue["preload"];
  readonly authority?: RoutePresentationContextValue["authority"];
  readonly retry?: RoutePresentationContextValue["retry"];
  readonly absoluteUrl?: RoutePresentationContextValue["absoluteUrl"];
  readonly onRenderError?: RoutePresentationContextValue["onRenderError"];
}

function useSessionSnapshot(session: AppRouteSession): AppRouteSessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

function RevisionAcknowledgement({
  session,
  onRenderRevision,
}: {
  readonly session: AppRouteSession;
  readonly onRenderRevision?: (revision: number) => void;
}) {
  const snapshot = useSessionSnapshot(session);
  const acknowledged = useRef({ session, revision: 0 });
  useLayoutEffect(() => {
    if (acknowledged.current.session !== session) acknowledged.current = { session, revision: 0 };
    if (!onRenderRevision || session.getSnapshot() !== snapshot || snapshot.revision <= acknowledged.current.revision || (snapshot.status !== "ready" && snapshot.status !== "error")) return;
    acknowledged.current.revision = snapshot.revision;
    onRenderRevision(snapshot.revision);
  }, [onRenderRevision, session, snapshot]);
  return null;
}

export function SynWareRouteSessionProvider({
  graph,
  session,
  onRenderRevision,
  children,
  preload,
  authority,
  retry,
  absoluteUrl,
  onRenderError,
}: SynWareRouteSessionProviderProps) {
  const value = React.useMemo(() => Object.freeze({ graph, session, preload, authority, retry, absoluteUrl, onRenderError }), [graph, session, preload, authority, retry, absoluteUrl, onRenderError]);
  return (
    <RoutePresentationContext.Provider value={value}>
      <RouteDepthContext.Provider value={0}>
        {children}
        <RevisionAcknowledgement session={session} onRenderRevision={onRenderRevision} />
      </RouteDepthContext.Provider>
    </RoutePresentationContext.Provider>
  );
}

export function useSynWareRoutePresentation() {
  const context = useContext(RoutePresentationContext);
  if (!context) throw new Error("RouteOutlet requires a mounted SynWare route session.");
  return context;
}

interface RouteRenderBoundaryProps extends PropsWithChildren {
  readonly boundaries: readonly RouteErrorBoundaryDefinition[];
  readonly depth: number;
  readonly route: NonNullable<AppRouteSessionSnapshot["route"]>;
  readonly retry: () => void;
  readonly revision: number;
  readonly onRenderError?: (revision: number, error: unknown) => void;
}

interface RouteRenderBoundaryState {
  readonly failure: { readonly error: unknown } | null;
  readonly revision: number;
}

interface RouteErrorBoundaryDefinition {
  readonly depth: number;
  readonly component: React.ComponentType<SynWareRouteErrorProps>;
}

/** An inherited presentation is rendered at the failing outlet. If that
 * presentation also fails, do not try its declaring boundary a second time. */
class RoutePresentationFailure extends Error {
  constructor(readonly error: unknown, readonly boundaryDepth: number) {
    super("Route boundary presentation failed.", { cause: error });
  }
}

class RouteFallbackGuard extends Component<PropsWithChildren<{ readonly depth: number; readonly revision: number }>, RouteRenderBoundaryState> {
  state: RouteRenderBoundaryState = { failure: null, revision: -1 };

  static getDerivedStateFromProps(props: { revision: number }, state: RouteRenderBoundaryState) {
    return props.revision !== state.revision ? { failure: null, revision: props.revision } : null;
  }

  static getDerivedStateFromError(error: unknown): Partial<RouteRenderBoundaryState> {
    return { failure: { error } };
  }

  render(): ReactNode {
    if (this.state.failure) throw new RoutePresentationFailure(this.state.failure.error, this.props.depth);
    return this.props.children;
  }
}

class RouteRenderBoundary extends Component<RouteRenderBoundaryProps, RouteRenderBoundaryState> {
  state: RouteRenderBoundaryState = { failure: null, revision: -1 };

  static getDerivedStateFromProps(props: RouteRenderBoundaryProps, state: RouteRenderBoundaryState) {
    return props.revision !== state.revision ? { failure: null, revision: props.revision } : null;
  }

  static getDerivedStateFromError(error: unknown): Partial<RouteRenderBoundaryState> {
    return { failure: { error } };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onRenderError?.(this.props.revision, error instanceof RoutePresentationFailure ? error.error : error);
    // Existing app error machinery remains the terminal owner when no local
    // route boundary exists; this boundary only decides where React bubbles.
  }

  render(): ReactNode {
    if (this.state.failure) {
      const error = this.state.failure.error;
      const beforeDepth = error instanceof RoutePresentationFailure ? error.boundaryDepth : Infinity;
      const boundary = this.props.boundaries.find(candidate => candidate.depth < beforeDepth);
      if (!boundary) throw this.props.depth === 0 && error instanceof RoutePresentationFailure ? error.error : error;
      return (
        <RouteFallbackGuard depth={boundary.depth} revision={this.props.revision}>
          {createElement(boundary.component, {
            route: this.props.route,
            error: error instanceof RoutePresentationFailure ? error.error : error,
            retry: this.props.retry,
          })}
        </RouteFallbackGuard>
      );
    }
    return this.props.children;
  }
}

export function RouteOutlet() {
  const { graph, session, retry: retryRoute, onRenderError } = useSynWareRoutePresentation();
  const depth = useContext(RouteDepthContext);
  const snapshot = useSessionSnapshot(session);
  const route = snapshot.route;
  if (!route) return null;
  const routeName = route.branch[depth];
  if (!routeName) return null;
  const definition = session.getDefinition(routeName) ?? graph.getRoute(routeName);
  if (!definition) throw new Error(`Route definition ${routeName} is unavailable.`);
  const node = snapshot.nodes[routeName];
  if (!node && snapshot.status !== "loading") return null;

  const branch = route.branch.slice(0, depth + 1).map((name, depth) => ({
    depth,
    definition: session.getDefinition(name) ?? graph.getRoute(name),
  })).reverse();
  const boundaries = branch.flatMap(({ depth, definition }) => definition?.errorComponent
    ? [{ depth, component: definition.errorComponent }] : []);
  const retry = () => { if (retryRoute) retryRoute(); else void session.retry(routeName); };
  let next: ReactNode;
  if (!node || node.state === "loading") {
    const boundary = branch.find(({ definition }) => definition?.loadingComponent);
    const Loading = boundary?.definition?.loadingComponent;
    next = (
      <div aria-busy="true" data-route-loading={routeName}>
        {boundary && Loading ? (
          <RouteFallbackGuard depth={boundary.depth} revision={snapshot.revision}><Loading route={route} /></RouteFallbackGuard>
        ) : null}
      </div>
    );
  } else if (node.state === "error") {
    const boundary = boundaries[0];
    next = boundary ? (
      <RouteFallbackGuard depth={boundary.depth} revision={snapshot.revision}>
        {createElement(boundary.component, { route, error: node.error, retry })}
      </RouteFallbackGuard>
    ) : (
      <div role="alert" data-route-error={routeName}>{node.error instanceof Error ? node.error.message : String(node.error)}</div>
    );
  } else {
    next = definition.component
      ? createElement(definition.component, { route, routeData: node.data })
      : <RouteOutlet />;
  }

  return (
    <RouteDepthContext.Provider value={depth + 1}>
      <RouteRenderBoundary boundaries={boundaries} depth={depth} route={route} retry={retry} revision={snapshot.revision} onRenderError={onRenderError}>
        {next}
      </RouteRenderBoundary>
    </RouteDepthContext.Provider>
  );
}

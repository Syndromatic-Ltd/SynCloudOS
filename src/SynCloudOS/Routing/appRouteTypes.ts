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

import type { ComponentType } from "react";
import type { AppServiceClient, SynWareServiceToken } from "../AppSDK/runtimeContracts";

export type SynWareRouteParamValue = string | readonly string[];
export type SynWareRouteParams = Readonly<Record<string, SynWareRouteParamValue>>;

export type SynWareRouteQueryRefresh = "none" | "route";

export interface SynWareRouteQueryCodec<TValue = unknown> {
  readonly kind: "scalar" | "array";
  readonly id: string;
  readonly alias?: string;
  readonly defaultValue: TValue;
  readonly refresh: SynWareRouteQueryRefresh;
  readonly maxValues: number;
  parse(values: readonly string[]): TValue;
  serialize(value: TValue): readonly string[];
  equals?(left: TValue, right: TValue): boolean;
}

export type SynWareRouteQuerySchema = Readonly<Record<string, SynWareRouteQueryCodec<unknown>>>;

export interface SynWareRouteQueryIssue {
  readonly key: string;
  readonly urlKey: string;
  readonly code:
    | "duplicate-scalar"
    | "too-many-values"
    | "unknown-key"
    | "invalid-value"
    | "invalid-encoding";
  readonly message: string;
}

export interface SynWareRouteComponentProps {
  readonly route: SynCloudOSRouteInfo;
  readonly routeData: unknown;
}

export interface SynWareRouteLoadingProps {
  readonly route: SynCloudOSRouteInfo;
}

export interface SynWareRouteErrorProps {
  readonly route: SynCloudOSRouteInfo;
  readonly error: unknown;
  retry(): void;
}

export interface SynWareRouteRedirectTarget {
  readonly name: string;
  readonly params?: SynWareRouteParams;
}

export interface SynWareRouteLazyModule {
  readonly component?: ComponentType<SynWareRouteComponentProps>;
  readonly loadingComponent?: ComponentType<SynWareRouteLoadingProps>;
  readonly errorComponent?: ComponentType<SynWareRouteErrorProps>;
  readonly notFoundComponent?: ComponentType<SynWareRouteLoadingProps>;
  readonly load?: SynWareRouteLoader;
  readonly afterLoad?: SynWareRouteAfterLoad;
  readonly activate?: SynWareRouteActivationHook;
  readonly deactivate?: SynWareRouteActivationHook;
  readonly beforeEnter?: SynWareRouteGuard;
  readonly beforeLeave?: SynWareRouteGuard;
}

export interface SynWareRouteLoadContext {
  readonly signal: AbortSignal;
  readonly params: SynWareRouteParams;
  readonly query: Readonly<Record<string, unknown>>;
  readonly parentData: unknown;
  readonly route: SynCloudOSRouteInfo;
  readonly services: Readonly<Pick<AppServiceClient, "require" | "optional">>;
}

export type SynWareRouteLoader = (context: SynWareRouteLoadContext) => unknown | Promise<unknown>;
export type SynWareRouteAfterLoad = (context: SynWareRouteLoadContext, data: unknown) => void | Promise<void>;
export type SynWareRouteActivationHook = (context: SynWareRouteLoadContext) => void | Promise<void>;
export type SynWareRouteGuardResult =
  | Readonly<{ outcome: "allow" }>
  | Readonly<{ outcome: "block"; reason?: string }>
  | Readonly<{ outcome: "redirect"; target: SynWareRouteRedirectTarget }>;
export type SynWareRouteGuard = (context: SynWareRouteLoadContext) => SynWareRouteGuardResult | Promise<SynWareRouteGuardResult>;

export interface SynWareRouteDataPreloadDeclaration {
  /** Exact read-service tokens a data prefetch loader may acquire. Host
   * providers must expose a route-preparation projection for each token. */
  readonly services: readonly SynWareServiceToken<unknown>[];
}

export interface SynWareRoutePreloadDeclaration {
  /** Explicit opt-in for side-effect-free route data prefetch. */
  readonly data?: SynWareRouteDataPreloadDeclaration;
}

export interface SynWareRouteDefinition {
  readonly name: string;
  readonly path?: string;
  readonly index?: boolean;
  readonly component?: ComponentType<SynWareRouteComponentProps>;
  readonly loadingComponent?: ComponentType<SynWareRouteLoadingProps>;
  readonly errorComponent?: ComponentType<SynWareRouteErrorProps>;
  readonly notFoundComponent?: ComponentType<SynWareRouteLoadingProps>;
  readonly lazy?: () => Promise<SynWareRouteLazyModule>;
  readonly redirect?: SynWareRouteRedirectTarget;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly preload?: SynWareRoutePreloadDeclaration;
  readonly query?: SynWareRouteQuerySchema;
  readonly load?: SynWareRouteLoader;
  readonly afterLoad?: SynWareRouteAfterLoad;
  readonly activate?: SynWareRouteActivationHook;
  readonly deactivate?: SynWareRouteActivationHook;
  readonly beforeEnter?: SynWareRouteGuard;
  readonly beforeLeave?: SynWareRouteGuard;
  readonly children?: readonly SynWareRouteDefinition[];
}

export interface SynWareRouteGraphDefinition<
  TRoutes extends readonly SynWareRouteDefinition[] = readonly SynWareRouteDefinition[],
> {
  readonly id: string;
  readonly routes: TRoutes;
}

type StripPathDecorators<TPath extends string> = TPath extends `/${infer Rest}` ? StripPathDecorators<Rest> : TPath;
type SegmentParams<TSegment extends string> =
  TSegment extends `:${infer Name}`
    ? { readonly [K in Name]: string }
    : TSegment extends `*${infer Name}`
      ? { readonly [K in Name]: readonly string[] }
      : {};

type PathParams<TPath extends string | undefined> =
  TPath extends string
    ? StripPathDecorators<TPath> extends `${infer Head}/${infer Tail}`
      ? SegmentParams<Head> & PathParams<Tail>
      : SegmentParams<StripPathDecorators<TPath>>
    : {};

type RouteChildren<TNode> = TNode extends { readonly children: infer TChildren extends readonly SynWareRouteDefinition[] }
  ? TChildren
  : readonly [];

export type SynWareRouteNames<
  TRoutes extends readonly SynWareRouteDefinition[],
  TDepth extends readonly unknown[] = readonly [],
> =
  TDepth["length"] extends 12
    ? never
    : TRoutes[number] extends infer TNode extends SynWareRouteDefinition
      ? TNode["name"] | SynWareRouteNames<RouteChildren<TNode>, readonly [...TDepth, unknown]>
      : never;

type ParamsForNameInNode<
  TNode extends SynWareRouteDefinition,
  TName extends string,
  TInherited,
  TDepth extends readonly unknown[],
> =
  // Distribute over sibling nodes before reading their path/name. Otherwise a
  // parameterless sibling contributes {} to every target in that level.
  TNode extends unknown
    ? string extends TNode["name"]
      ? SynWareRouteParams
      : TName extends TNode["name"]
        ? TInherited & PathParams<TNode["path"]>
        : ParamsForName<RouteChildren<TNode>, TName, TInherited & PathParams<TNode["path"]>, readonly [...TDepth, unknown]>
    : never;

type ParamsForName<
  TRoutes extends readonly SynWareRouteDefinition[],
  TName extends string,
  TInherited = {},
  TDepth extends readonly unknown[] = readonly [],
> =
  TDepth["length"] extends 12
    ? never
    : ParamsForNameInNode<TRoutes[number], TName, TInherited, TDepth>;

type Simplify<T> = { readonly [K in keyof T]: T[K] } & {};
type RequiredRouteParams<TRoutes extends readonly SynWareRouteDefinition[], TName extends string> =
  Simplify<ParamsForName<TRoutes, TName>>;

type QuerySchemaOf<TNode extends SynWareRouteDefinition> = string extends TNode["name"]
  ? SynWareRouteQuerySchema
  : TNode extends { readonly query: infer TQuery extends SynWareRouteQuerySchema }
    ? TQuery
    : {};

type MergeQuerySchemas<TLeft, TRight> = Simplify<Omit<TLeft, keyof TRight> & TRight>;

type QuerySchemaForNameInNode<
  TNode extends SynWareRouteDefinition,
  TName extends string,
  TInherited,
  TDepth extends readonly unknown[] = readonly [],
> = TNode extends unknown
  ? TName extends TNode["name"]
    ? MergeQuerySchemas<TInherited, QuerySchemaOf<TNode>>
    : QuerySchemaForName<
        RouteChildren<TNode>,
        TName,
        MergeQuerySchemas<TInherited, QuerySchemaOf<TNode>>,
        readonly [...TDepth, unknown]
      >
  : never;

type QuerySchemaForName<
  TRoutes extends readonly SynWareRouteDefinition[],
  TName extends string,
  TInherited = {},
  TDepth extends readonly unknown[] = readonly [],
> = TDepth["length"] extends 12
  ? never
  : QuerySchemaForNameInNode<TRoutes[number], TName, TInherited, TDepth>;

type QueryCodecValue<TCodec> = TCodec extends SynWareRouteQueryCodec<infer TValue> ? TValue : never;

export type SynWareRouteQueryForName<
  TRoutes extends readonly SynWareRouteDefinition[],
  TName extends string,
> = TName extends unknown
  ? Simplify<{
      readonly [K in keyof QuerySchemaForName<TRoutes, TName>]: QueryCodecValue<QuerySchemaForName<TRoutes, TName>[K]>;
    }>
  : never;

type RouteQueryInput<TRoutes extends readonly SynWareRouteDefinition[], TName extends string> =
  keyof SynWareRouteQueryForName<TRoutes, TName> extends never
    ? Readonly<Record<string, never>>
    : Partial<SynWareRouteQueryForName<TRoutes, TName>>;

type RouteTargetParams<TRoutes extends readonly SynWareRouteDefinition[], TName extends string> =
  keyof RequiredRouteParams<TRoutes, TName> extends never
    ? Readonly<{ params?: Readonly<Record<string, never>> }>
    : string extends keyof RequiredRouteParams<TRoutes, TName>
      ? Readonly<{ params?: RequiredRouteParams<TRoutes, TName> }>
      : Readonly<{ params: RequiredRouteParams<TRoutes, TName> }>;

export type SynWareNamedRouteTarget<
  TRoutes extends readonly SynWareRouteDefinition[],
  TName extends SynWareRouteNames<TRoutes>,
> =
  // An erased runtime graph still accepts dynamically recognized targets.
  // Concrete graphs distribute by name to retain name/params/query correlation
  // even when a caller explicitly supplies a union of route names.
  string extends TName
    ? Readonly<{ name: TName; params?: SynWareRouteParams; query?: Readonly<Record<string, unknown>>; hash?: string }>
    : TName extends unknown
      ? Readonly<{ name: TName; query?: RouteQueryInput<TRoutes, TName>; hash?: string }> & RouteTargetParams<TRoutes, TName>
      : never;

export interface SynCloudOSRouteInfo {
  readonly graphId: string;
  readonly appId: string | null;
  readonly name: string;
  readonly parentName: string | null;
  readonly branch: readonly string[];
  readonly params: SynWareRouteParams;
  readonly query: Readonly<Record<string, unknown>>;
  readonly queryStatus: "valid" | "invalid";
  readonly queryIssues?: readonly SynWareRouteQueryIssue[];
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type SynWareRouteRecognition =
  | (SynCloudOSRouteInfo & Readonly<{ kind: "match" }>)
  | Readonly<{
      kind: "not-found";
      graphId: string;
      appId: string | null;
      pathname: string;
      search: string;
      hash: string;
    }>;

export interface SynWareRouteGraph<
  TRoutes extends readonly SynWareRouteDefinition[] = readonly SynWareRouteDefinition[],
> {
  readonly id: string;
  readonly routes: TRoutes;
  readonly basePath: string;
  readonly appId: string | null;
  bind(basePath: string, appId?: string | null): SynWareRouteGraph<TRoutes>;
  recognize(pathname: string): SynWareRouteRecognition;
  urlFor<TName extends SynWareRouteNames<TRoutes>>(target: SynWareNamedRouteTarget<TRoutes, TName>): string;
  getRoute(name: SynWareRouteNames<TRoutes> | string): SynWareRouteDefinition | null;
}

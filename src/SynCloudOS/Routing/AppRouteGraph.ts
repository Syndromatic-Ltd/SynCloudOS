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

import type {
  SynCloudOSRouteInfo,
  SynWareNamedRouteTarget,
  SynWareRouteDefinition,
  SynWareRouteGraph,
  SynWareRouteGraphDefinition,
  SynWareRouteNames,
  SynWareRouteParamValue,
  SynWareRouteParams,
  SynWareRouteRecognition,
} from "./appRouteTypes";
import {
  collectBranchQuerySchema,
  parseRouteQuery,
  serializeRouteQuery,
} from "./routeQuery";

type Segment =
  | Readonly<{ kind: "static"; value: string }>
  | Readonly<{ kind: "dynamic"; name: string }>
  | Readonly<{ kind: "splat"; name: string }>;

interface CompiledRoute {
  readonly definition: SynWareRouteDefinition;
  readonly branch: readonly SynWareRouteDefinition[];
  readonly segments: readonly Segment[];
  readonly parameterNames: readonly string[];
  readonly specificity: readonly number[];
  readonly index: boolean;
}

const canonicalGraphs = new WeakSet<object>();
const routeNamePattern = /^[A-Za-z][A-Za-z0-9._-]*$/u;
const parameterNamePattern = /^[A-Za-z_][A-Za-z0-9_-]*$/u;

function plainMetadata(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  JSON.stringify(value);
  return deepFreeze({ ...(value as Record<string, unknown>) });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (typeof value === "function") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function normalizeBasePath(value: string): string {
  if (typeof value !== "string") throw new TypeError("Route graph base path must be a string.");
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  if (!trimmed.startsWith("/") || trimmed.includes("?") || trimmed.includes("#") || trimmed.includes("\\")) {
    throw new TypeError("Route graph base path must be an absolute pathname.");
  }
  const collapsed = trimmed.replace(/\/{2,}/gu, "/").replace(/\/+$/u, "");
  return collapsed === "/" ? "" : collapsed;
}

function routePathSegments(path: string | undefined, index: boolean): readonly string[] {
  if (index) return Object.freeze([]);
  const source = path ?? "";
  if (source.startsWith("/")) throw new TypeError("Executable route paths are relative to the app ownership base.");
  if (source.includes("?") || source.includes("#") || source.includes("\\")) {
    throw new TypeError(`Route path "${source}" contains an invalid separator.`);
  }
  if (!source) return Object.freeze([]);
  const raw = source.split("/");
  if (raw.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError(`Route path "${source}" contains an invalid segment.`);
  }
  return Object.freeze(raw);
}

function compileSegment(segment: string, isLast: boolean): Segment {
  if (segment.startsWith(":")) {
    const name = segment.slice(1);
    if (!parameterNamePattern.test(name)) throw new TypeError(`Route parameter "${name}" is invalid.`);
    return Object.freeze({ kind: "dynamic" as const, name });
  }
  if (segment.startsWith("*")) {
    const name = segment.slice(1);
    if (!parameterNamePattern.test(name)) throw new TypeError(`Route splat parameter "${name}" is invalid.`);
    if (!isLast) throw new TypeError("A route splat must be terminal.");
    return Object.freeze({ kind: "splat" as const, name });
  }
  if (segment.includes(":") || segment.includes("*")) {
    throw new TypeError(`Route segment "${segment}" has invalid parameter syntax.`);
  }
  return Object.freeze({ kind: "static" as const, value: segment });
}

function segmentsCanOverlap(left: readonly Segment[], right: readonly Segment[]): boolean {
  const limit = Math.max(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) {
      return Boolean((a?.kind === "splat") || (b?.kind === "splat"));
    }
    if (a.kind === "static" && b.kind === "static" && a.value !== b.value) return false;
    if (a.kind === "splat" || b.kind === "splat") return true;
  }
  return true;
}

function specificityOf(segments: readonly Segment[]): readonly number[] {
  return Object.freeze(segments.map((segment) => segment.kind === "static" ? 3 : segment.kind === "dynamic" ? 2 : 1));
}

function sameSpecificity(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function decodeSafeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function splitInput(value: string) {
  if (typeof value !== "string") return null;
  if (/^[a-z][a-z\d+\-.]*:/iu.test(value) || value.startsWith("//")) return null;
  if (!value.startsWith("/")) return null;
  let pathname = value;
  let hash = "";
  let search = "";
  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex);
  }
  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }
  pathname = pathname.replace(/\/{2,}/gu, "/").replace(/\/+$/u, "") || "/";
  const rawSegments = pathname === "/" ? [] : pathname.slice(1).split("/");
  for (const segment of rawSegments) {
    if (!segment) return null;
    const decoded = decodeSafeSegment(segment);
    if (decoded === null) return null;
  }
  return Object.freeze({ pathname, search, hash });
}

function compareCandidates(left: CompiledRoute, right: CompiledRoute): number {
  const length = Math.max(left.specificity.length, right.specificity.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (right.specificity[index] ?? 0) - (left.specificity[index] ?? 0);
    if (delta !== 0) return delta;
  }
  if (left.index !== right.index) return left.index ? -1 : 1;
  return right.branch.length - left.branch.length;
}

function matchCompiled(route: CompiledRoute, inputSegments: readonly string[]): SynWareRouteParams | null {
  const params: Record<string, SynWareRouteParamValue> = Object.create(null) as Record<string, SynWareRouteParamValue>;
  let cursor = 0;
  for (const segment of route.segments) {
    if (segment.kind === "splat") {
      const values: string[] = [];
      for (; cursor < inputSegments.length; cursor += 1) {
        const decoded = decodeSafeSegment(inputSegments[cursor]!);
        if (decoded === null) return null;
        values.push(decoded);
      }
      if (values.length === 0) return null;
      params[segment.name] = Object.freeze(values);
      continue;
    }
    const raw = inputSegments[cursor];
    if (raw === undefined) return null;
    if (segment.kind === "static") {
      if (raw !== segment.value) return null;
    } else {
      const decoded = decodeSafeSegment(raw);
      if (decoded === null) return null;
      params[segment.name] = decoded;
    }
    cursor += 1;
  }
  if (cursor !== inputSegments.length) return null;
  return Object.freeze(params);
}

function freezeRouteDefinition(node: SynWareRouteDefinition): SynWareRouteDefinition {
  const children = node.children?.map((child) => freezeRouteDefinition(child));
  return Object.freeze({
    ...node,
    ...(node.metadata === undefined ? {} : { metadata: plainMetadata(node.metadata, `Route metadata for ${node.name}`) }),
    ...(children === undefined ? {} : { children: Object.freeze(children) }),
  });
}

function compileRoutes(routes: readonly SynWareRouteDefinition[]): {
  readonly compiled: readonly CompiledRoute[];
  readonly byName: ReadonlyMap<string, CompiledRoute>;
} {
  const compiled: CompiledRoute[] = [];
  const byName = new Map<string, CompiledRoute>();
  const ancestors = new WeakSet<object>();

  const visit = (
    nodes: readonly SynWareRouteDefinition[],
    parentBranch: readonly SynWareRouteDefinition[],
    parentSegments: readonly Segment[],
    inheritedParams: readonly string[],
  ) => {
    const siblingCompiled: Array<{ node: SynWareRouteDefinition; segments: readonly Segment[]; specificity: readonly number[] }> = [];
    let indexCount = 0;
    for (const node of nodes) {
      if (!node || typeof node !== "object") throw new TypeError("Route definitions must be objects.");
      if (ancestors.has(node as object)) throw new TypeError("Route graph contains a cycle.");
      if (!routeNamePattern.test(node.name)) throw new TypeError(`Route name "${node.name}" is invalid.`);
      if (byName.has(node.name)) throw new TypeError(`Duplicate route name "${node.name}".`);
      const index = node.index === true;
      if (index) {
        indexCount += 1;
        if (node.path !== undefined || (node.children?.length ?? 0) > 0) {
          throw new TypeError(`Index route "${node.name}" cannot declare a path or children.`);
        }
      }
      const rawSegments = routePathSegments(node.path, index);
      const ownSegments = rawSegments.map((segment, segmentIndex) => compileSegment(segment, segmentIndex === rawSegments.length - 1));
      if (parentSegments.some((segment) => segment.kind === "splat") && ownSegments.length > 0) {
        throw new TypeError(`Route "${node.name}" cannot descend from a splat.`);
      }
      const parameterNames = ownSegments.filter((segment) => segment.kind !== "static").map((segment) => segment.name);
      for (const parameterName of parameterNames) {
        if (inheritedParams.includes(parameterName)) {
          throw new TypeError(`Route parameter "${parameterName}" is duplicated in branch "${node.name}".`);
        }
      }
      const segments = Object.freeze([...parentSegments, ...ownSegments]);
      const specificity = specificityOf(segments);
      siblingCompiled.push({ node, segments: Object.freeze(ownSegments), specificity: specificityOf(ownSegments) });
      const branch = Object.freeze([...parentBranch, node]);
      collectBranchQuerySchema(branch);
      const record = Object.freeze({
        definition: node,
        branch,
        segments,
        parameterNames: Object.freeze([...inheritedParams, ...parameterNames]),
        specificity,
        index,
      });
      compiled.push(record);
      byName.set(node.name, record);
      ancestors.add(node as object);
      try {
        if (node.children?.length) visit(node.children, branch, segments, record.parameterNames);
      } finally {
        ancestors.delete(node as object);
      }
    }
    if (indexCount > 1) throw new TypeError("Only one index route may exist under a parent.");
    for (let leftIndex = 0; leftIndex < siblingCompiled.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < siblingCompiled.length; rightIndex += 1) {
        const left = siblingCompiled[leftIndex]!;
        const right = siblingCompiled[rightIndex]!;
        if (
          sameSpecificity(left.specificity, right.specificity)
          && segmentsCanOverlap(left.segments, right.segments)
          && left.node.index !== true
          && right.node.index !== true
        ) {
          throw new TypeError(`Ambiguous equal-specificity routes "${left.node.name}" and "${right.node.name}".`);
        }
      }
    }
  };

  visit(routes, Object.freeze([]), Object.freeze([]), Object.freeze([]));
  return Object.freeze({ compiled: Object.freeze(compiled), byName });
}

function encodeParamSegment(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new TypeError(`${label} must be one safe path segment.`);
  }
  return encodeURIComponent(value);
}

export function createAppRouteGraph<
  const TRoutes extends readonly SynWareRouteDefinition[],
>(definition: SynWareRouteGraphDefinition<TRoutes>): SynWareRouteGraph<TRoutes> {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("Route graph definition must be a plain object.");
  }
  if (typeof definition.id !== "string" || !definition.id.trim()) throw new TypeError("Route graph id is required.");
  if (!Array.isArray(definition.routes) || definition.routes.length === 0) throw new TypeError("Route graph requires at least one route.");
  const frozenRoutes = Object.freeze(definition.routes.map((route) => freezeRouteDefinition(route))) as unknown as TRoutes;
  const compiledState = compileRoutes(frozenRoutes);

  const build = (basePath: string, appId: string | null): SynWareRouteGraph<TRoutes> => {
    const normalizedBase = normalizeBasePath(basePath);
    const graph: SynWareRouteGraph<TRoutes> = {
      id: definition.id.trim(),
      routes: frozenRoutes,
      basePath: normalizedBase,
      appId,
      bind(nextBasePath, nextAppId = appId) {
        return build(nextBasePath, nextAppId ?? null);
      },
      recognize(input) {
        const parsed = splitInput(input);
        if (!parsed) {
          return Object.freeze({ kind: "not-found" as const, graphId: graph.id, appId: graph.appId, pathname: "/", search: "", hash: "" });
        }
        if (normalizedBase) {
          if (parsed.pathname !== normalizedBase && !parsed.pathname.startsWith(`${normalizedBase}/`)) {
            return Object.freeze({ kind: "not-found" as const, graphId: graph.id, appId: graph.appId, ...parsed });
          }
        }
        const relativePath = normalizedBase ? parsed.pathname.slice(normalizedBase.length) || "/" : parsed.pathname;
        const rawSegments = relativePath === "/" ? [] : relativePath.replace(/^\//u, "").split("/");
        if (rawSegments.some((segment) => !segment || segment === "." || segment === "..")) {
          return Object.freeze({ kind: "not-found" as const, graphId: graph.id, appId: graph.appId, ...parsed });
        }
        const candidates = compiledState.compiled
          .map((route) => ({ route, params: matchCompiled(route, rawSegments) }))
          .filter((candidate): candidate is { route: CompiledRoute; params: SynWareRouteParams } => candidate.params !== null)
          .sort((left, right) => compareCandidates(left.route, right.route));
        const winner = candidates[0];
        if (!winner) {
          return Object.freeze({ kind: "not-found" as const, graphId: graph.id, appId: graph.appId, ...parsed });
        }
        const branchNames = Object.freeze(winner.route.branch.map((entry) => entry.name));
        const metadata = winner.route.definition.metadata ?? Object.freeze({});
        const usesTypedQuery = winner.route.branch.some((entry) => entry.query !== undefined);
        const typedQuery = usesTypedQuery
          ? parseRouteQuery(collectBranchQuerySchema(winner.route.branch), parsed.search)
          : null;
        const legacyQuery = usesTypedQuery
          ? Object.freeze({})
          : Object.freeze(Object.fromEntries(
              new URLSearchParams(parsed.search.startsWith("?") ? parsed.search.slice(1) : parsed.search),
            ));
        const info: SynCloudOSRouteInfo & { readonly kind: "match" } = {
          kind: "match",
          graphId: graph.id,
          appId: graph.appId,
          name: winner.route.definition.name,
          parentName: winner.route.branch.length > 1 ? winner.route.branch[winner.route.branch.length - 2]!.name : null,
          branch: branchNames,
          params: winner.params,
          query: typedQuery?.ok ? typedQuery.value : legacyQuery,
          queryStatus: typedQuery && !typedQuery.ok ? "invalid" : "valid",
          ...(typedQuery && !typedQuery.ok ? { queryIssues: typedQuery.issues } : {}),
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
          metadata,
        };
        return Object.freeze(info);
      },
      urlFor(target) {
        const record = compiledState.byName.get(target.name);
        if (!record) throw new TypeError(`Unknown route name "${String(target.name)}".`);
        const params = (target.params ?? {}) as Readonly<Record<string, unknown>>;
        const required = new Set(record.parameterNames);
        for (const key of Object.keys(params)) {
          if (!required.has(key)) throw new TypeError(`Unknown route parameter "${key}" for "${record.definition.name}".`);
        }
        const rendered: string[] = [];
        for (const segment of record.segments) {
          if (segment.kind === "static") {
            rendered.push(segment.value);
            continue;
          }
          const value = params[segment.name];
          if (segment.kind === "dynamic") {
            if (value === undefined) throw new TypeError(`Missing route parameter "${segment.name}".`);
            rendered.push(encodeParamSegment(value, `Route parameter "${segment.name}"`));
            continue;
          }
          if (!Array.isArray(value) || value.length === 0) throw new TypeError(`Route splat "${segment.name}" requires one or more segments.`);
          rendered.push(...value.map((entry) => encodeParamSegment(entry, `Route splat "${segment.name}"`)));
        }
        const suffix = rendered.length ? `/${rendered.join("/")}` : "";
        const pathname = normalizedBase ? `${normalizedBase}${suffix}` || "/" : suffix || "/";
        const rawTarget = target as Readonly<{
          query?: Readonly<Record<string, unknown>>;
          hash?: string;
        }>;
        const usesTypedQuery = record.branch.some((entry) => entry.query !== undefined);
        const search = usesTypedQuery
          ? serializeRouteQuery(collectBranchQuerySchema(record.branch), rawTarget.query ?? Object.freeze({}))
          : "";
        const hash = rawTarget.hash === undefined || rawTarget.hash === ""
          ? ""
          : rawTarget.hash.startsWith("#") ? rawTarget.hash : `#${rawTarget.hash}`;
        return `${pathname}${search}${hash}`;
      },
      getRoute(name) {
        return compiledState.byName.get(name)?.definition ?? null;
      },
    };
    deepFreeze(graph);
    canonicalGraphs.add(graph as object);
    return graph;
  };

  return build("", null);
}

export function isSynWareRouteGraph(value: unknown): value is SynWareRouteGraph {
  return Boolean(value && (typeof value === "object" || typeof value === "function") && canonicalGraphs.has(value as object));
}

export function bindSynWareRouteGraph<
  const TRoutes extends readonly SynWareRouteDefinition[],
>(graph: SynWareRouteGraph<TRoutes>, basePath: string, appId?: string | null): SynWareRouteGraph<TRoutes> {
  if (!isSynWareRouteGraph(graph)) throw new TypeError("SynWare routes must be created with defineSynWareRoutes().");
  return graph.bind(basePath, appId);
}

export type {
  SynCloudOSRouteInfo,
  SynWareNamedRouteTarget,
  SynWareRouteDefinition,
  SynWareRouteGraph,
  SynWareRouteGraphDefinition,
  SynWareRouteNames,
  SynWareRouteRecognition,
} from "./appRouteTypes";


declare const actionReferenceTypes: unique symbol;

/** Immutable declaration metadata. It carries no instance, method pointer or dispatch authority. */
export interface NSEActionReference<Payload = unknown, Result = unknown> {
  readonly methodName: string;
  readonly id?: string;
  readonly [actionReferenceTypes]: { readonly payload: Payload; readonly result: Result };
}

/** @internal Check an authored connection without inferring a wider payload from its value. */
export type NSEActionPayloadCheck<Entry, Key extends string> = Entry extends { readonly action: NSEActionReference<infer Payload> }
  ? { readonly [K in Key]?: Payload }
  : unknown;

type Callable = (...args: any[]) => unknown;
type ActionMethodKey<T, K extends keyof T> = T[K] extends Callable
  ? Parameters<T[K]> extends [] | [unknown?] ? unknown : never : never;
type PayloadOf<M extends Callable> = Parameters<M> extends [] ? undefined : Parameters<M>[0];

/** Internal decorator metadata shared with reference preparation, never inferred from method names. */
export const nseActionRecords = new WeakMap<object, Readonly<{ id?: string }>>();
const references = new WeakSet<object>();
const preparedReferences = new WeakMap<object, Map<string, NSEActionReference>>();

/** Resolve a public decorated method without constructing its class or retaining its implementation. */
export function actionRef<T, K extends keyof T & string>(
  controller: { readonly prototype: T }, methodName: K & ActionMethodKey<T, K>,
): NSEActionReference<PayloadOf<Extract<T[K], Callable>>, Awaited<ReturnType<Extract<T[K], Callable>>>> {
  if (typeof methodName !== "string") throw new TypeError("actionRef requires a public string-named @action method.");
  for (let prototype: object | null = controller.prototype as object; prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor) continue;
    const metadata = typeof descriptor.value === "function" ? nseActionRecords.get(descriptor.value) : undefined;
    if (!metadata) break;
    const prepared = preparedReferences.get(metadata) ?? new Map<string, NSEActionReference>();
    const existing = prepared.get(methodName);
    if (existing) return existing as NSEActionReference<PayloadOf<Extract<T[K], Callable>>, Awaited<ReturnType<Extract<T[K], Callable>>>>;
    const reference = Object.freeze({ methodName, ...(metadata.id === undefined ? {} : { id: metadata.id }) });
    references.add(reference);
    const typedReference = reference as unknown as NSEActionReference<PayloadOf<Extract<T[K], Callable>>, Awaited<ReturnType<Extract<T[K], Callable>>>>;
    prepared.set(methodName, typedReference);
    preparedReferences.set(metadata, prepared);
    return typedReference;
  }
  throw new TypeError(`actionRef: ${methodName} must be a public method decorated with @action.`);
}

/** Internal, authenticated conversion for the existing string-based command adapters. */
export function nseActionReferenceName(reference: NSEActionReference): string {
  if (!references.has(reference)) throw new TypeError("Invalid action reference; prepare it with actionRef.");
  return reference.id ?? reference.methodName;
}

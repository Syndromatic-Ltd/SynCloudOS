/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { errorCatalogue, type ErrorCatalogueEntry } from "./errorCatalogue";
import { describeSynCloudOSLifecycleDisposal, SynCloudOSLifecycleError } from "./lifecycleError";
import type { CapturedSynCloudOSError, SynCloudOSErrorPayload } from "./errorTypes";

const catalogueEntries: ReadonlyMap<string, ErrorCatalogueEntry> = new Map(errorCatalogue.map((entry) => [entry.code, entry]));

interface ThrownIdentity {
  readonly code: string | undefined;
  readonly exception: string;
  readonly message: string;
}

function isErrorLike(value: unknown): value is { readonly name: string; readonly message: string; readonly stack?: unknown; readonly cause?: unknown } {
  return value instanceof Error || (typeof value === "object" && value !== null
    && "name" in value && typeof value.name === "string" && "message" in value && typeof value.message === "string");
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") return json.slice(0, 600);
  } catch { /* Fall back to String below. */ }
  return String(value);
}

/** The class name, catalogue code and message of a thrown value. Only an
 * error carrying a catalogue code (every lifecycle error does) has a code. */
function identifyThrown(value: unknown): ThrownIdentity {
  if (!isErrorLike(value)) {
    return { code: undefined, exception: `Non-Error value (${value === null ? "null" : typeof value})`, message: describeValue(value) };
  }
  const code = value instanceof SynCloudOSLifecycleError
    ? value.code
    : "code" in value && typeof value.code === "string" && catalogueEntries.has(value.code) ? value.code : undefined;
  return { code, exception: value.name || "Error", message: value.message || "The error has no message." };
}

/** A stack without its leading `Name: message` header, which the summary already shows. */
function stackFrames(stack: unknown, header?: string): string {
  if (typeof stack !== "string") return "";
  let frames = stack;
  if (header && frames.startsWith(header)) frames = frames.slice(header.length);
  else if (/^\S[^\n]*\n\s+at /u.test(frames)) frames = frames.slice(frames.indexOf("\n"));
  return frames.replace(/^\n+/u, "").trimEnd();
}

function errorStack(value: { readonly name: string; readonly message: string; readonly stack?: unknown }): string {
  return stackFrames(value.stack, value.message ? `${value.name}: ${value.message}` : value.name);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sourceLocation(context: Readonly<Record<string, unknown>>): string | undefined {
  const filename = text(context.filename);
  const line = typeof context.lineno === "number" ? context.lineno : undefined;
  const column = typeof context.colno === "number" ? context.colno : undefined;
  if (!filename && line === undefined) return undefined;
  return `${filename ?? "unknown source"}:${line ?? "?"}:${column ?? "?"}`;
}

function facts(entries: readonly (readonly [string, string | undefined])[]): string {
  return entries.filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
    .map(([label, value]) => `${label}: ${value}`).join("\n");
}

function section(label: string, body: string | undefined): string | undefined {
  return body ? `${label}:\n${body}` : undefined;
}

/** The thrown value's `cause` chain, outermost first, bounded against cycles. */
function causeChain(thrown: unknown): string[] {
  const sections: string[] = [];
  const seen = new Set<unknown>([thrown]);
  let cause = isErrorLike(thrown) ? thrown.cause : undefined;
  while (cause !== undefined && !seen.has(cause) && sections.length < 8) {
    seen.add(cause);
    if (!isErrorLike(cause)) {
      sections.push(`Caused by: ${describeValue(cause)}`);
      break;
    }
    const frames = errorStack(cause);
    sections.push(`Caused by ${cause.name}: ${cause.message}${frames ? `\n${frames}` : ""}`);
    cause = cause.cause;
  }
  return sections;
}

function composeTechnicalDetails(
  payload: SynCloudOSErrorPayload,
  captured: Omit<CapturedSynCloudOSError, "technicalDetails">,
  appDisplayName: string | undefined,
): string {
  const context = captured.context ?? {};
  const thrown = payload.error;
  const lifecycle = thrown instanceof SynCloudOSLifecycleError ? thrown : null;
  const appName = appDisplayName ?? captured.packageName;
  const catalogue = catalogueEntries.get(captured.code);
  const head = facts([
    ["Detail", text(payload.technicalMessage)],
    ["Resource", lifecycle?.resource.id === undefined ? undefined : `${lifecycle.resource.kind} "${lifecycle.resource.id}"`],
    ["Disposal reason", lifecycle?.disposal ? describeSynCloudOSLifecycleDisposal(lifecycle.disposal.reason) : undefined],
    ["Problem", lifecycle?.problem],
    ["Source location", sourceLocation(context)],
    ["App", captured.appId ? appName && appName !== captured.appId ? `${appName} (${captured.appId})` : captured.appId : undefined],
    ["Window", text(context.windowId)],
    ["Route", text(captured.route) ?? text(context.pathname) ?? text(context.routePath)],
    ["Page", text(context.browserUrl)],
    ["User agent", text(context.userAgent)],
    ["Severity", `${captured.severity ?? "error"}, ${captured.recoverable === false ? "not recoverable" : "recoverable"}`],
    ["Hint", catalogue?.fix],
    ["Docs", catalogue?.docs],
  ]);
  return [
    head,
    text(payload.technicalDetails),
    section("Stack", isErrorLike(thrown) ? errorStack(thrown) : undefined),
    ...causeChain(thrown),
    section("Disposed at", stackFrames(lifecycle?.disposal?.stack)),
    section("React component stack", text(context.componentStack)),
  ].filter(Boolean).join("\n\n");
}

/**
 * Turns a capture request into the stored error. A thrown value's identity
 * wins: its catalogue code replaces the condition's generic code, its class
 * name is the exception and its message is the message. Everything else goes
 * into one technical-details text that omits unknown fields.
 */
export function createCapturedError(
  payload: SynCloudOSErrorPayload,
  record: Pick<CapturedSynCloudOSError, "id" | "at" | "timestamp" | "runtimeId"> & {
    readonly defaults?: Partial<CapturedSynCloudOSError>;
    readonly appDisplayName?: string;
  },
): CapturedSynCloudOSError {
  const { error: _thrown, code, message, technicalMessage: _technicalMessage, technicalDetails: _technicalDetails, ...rest } = payload;
  const identity = payload.error === undefined ? null : identifyThrown(payload.error);
  const captured: Omit<CapturedSynCloudOSError, "technicalDetails"> = {
    ...record.defaults,
    ...rest,
    code: identity?.code ?? code,
    message: identity?.message ?? message ?? payload.title,
    ...(identity ? { exception: identity.exception } : {}),
    ...(record.runtimeId === undefined ? {} : { runtimeId: record.runtimeId }),
    id: record.id,
    at: record.at,
    timestamp: record.timestamp,
  };
  return { ...captured, technicalDetails: composeTechnicalDetails(payload, captured, record.appDisplayName) };
}

/** The fields a summary needs; SystemAlert's view-shaped error satisfies it. */
export interface ErrorSummarySource {
  readonly code: string;
  readonly message: string;
  readonly exception?: string;
  readonly source?: string;
}

/** The labelled summary shown above the technical details: Exception (for a
 * thrown value), Code, Message, and Caught by (or Reported by when nothing was thrown). */
export function errorSummary(error: ErrorSummarySource): readonly (readonly [label: string, value: string])[] {
  const thrown = error.exception !== undefined;
  return [
    ...(thrown ? [["Exception", error.exception!] as const] : []),
    ["Code", error.code] as const,
    ["Message", error.message] as const,
    ...(error.source ? [[thrown ? "Caught by" : "Reported by", error.source] as const] : []),
  ];
}

/** Pure formatter for a copyable report: title, summary, then the technical details. */
export function toTechnicalReport(error: CapturedSynCloudOSError | null): string {
  if (!error) return "No SynCloudOS error has been captured.";
  return [
    error.title,
    errorSummary(error).map(([label, value]) => `${label}: ${value}`).join("\n"),
    error.technicalDetails,
    `Captured: ${error.timestamp}`,
  ].filter(Boolean).join("\n\n");
}

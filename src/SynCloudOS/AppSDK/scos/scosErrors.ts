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

/** Stable codes for the errors the `SCOS` facade raises. Each code is listed
 * in the error catalogue so developer tools can explain it offline. */
export type SCOSErrorCode = "SCOS_APP_NOT_RUNNING" | "SCOS_AMBIGUOUS_SESSION" | "SCOS_UNBOUND" | "SCOS_APP_NOT_FOUND";

export interface SCOSErrorOptions {
  readonly code: SCOSErrorCode;
  readonly message: string;
  /** Where the failing call was made, when a stack frame names it. */
  readonly file?: string;
}

export class SCOSError extends Error {
  readonly code: SCOSErrorCode;
  readonly file?: string;

  constructor(options: SCOSErrorOptions) {
    super(options.message);
    this.name = "SCOSError";
    this.code = options.code;
    if (options.file !== undefined) this.file = options.file;
  }
}

/** Frames owned by this module or the facade: never the caller. */
const internalFrame = /\/AppSDK\/(?:scos\/[A-Za-z]+|SynWareContext|useStrings)\.[cm]?[jt]sx?/u;
const frameLocation = /((?:file|https?):\/\/[^\s()]+|[A-Za-z]:[\\/][^\s()]+|\/[^\s()]+):\d+:\d+\)?$/u;

/** The first stack frame outside this facade: the file that called it.
 * Bundlers may collapse frames into one chunk, so the value is best effort and
 * only ever decorates a developer-facing message. */
export function scosCallerFile(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;
  for (const line of stack.split("\n").slice(1)) {
    const match = frameLocation.exec(line.trim());
    if (!match || internalFrame.test(match[1].replace(/\\/g, "/"))) continue;
    const location = match[1];
    if (location.startsWith("file://")) {
      try {
        return decodeURIComponent(new URL(location).pathname).replace(/^\/([A-Za-z]:)/u, "$1");
      } catch {
        return location;
      }
    }
    if (location.startsWith("http://") || location.startsWith("https://")) {
      try {
        return new URL(location).pathname;
      } catch {
        return location;
      }
    }
    return location;
  }
  return undefined;
}

function callerNote(file: string | undefined): string {
  return file ? ` Called from ${file}.` : "";
}

export function scosUnboundError(consumer: string): SCOSError {
  const file = scosCallerFile();
  return new SCOSError({
    code: "SCOS_UNBOUND",
    message: `${consumer} has no mounted app. Import SCOS inside a <Name>.app folder, or call useSCOS() from one of the app's components.${callerNote(file)}`,
    ...(file === undefined ? {} : { file }),
  });
}

export function scosAppNotRunningError(appId: string, title: string | undefined): SCOSError {
  const file = scosCallerFile();
  return new SCOSError({
    code: "SCOS_APP_NOT_RUNNING",
    message: `${title ?? appId} is not running. Start the app before calling SCOS, or call useSCOS() from one of its components.${callerNote(file)}`,
    ...(file === undefined ? {} : { file }),
  });
}

export function scosAmbiguousSessionError(appId: string, title: string | undefined, count: number): SCOSError {
  const file = scosCallerFile();
  return new SCOSError({
    code: "SCOS_AMBIGUOUS_SESSION",
    message: `${title ?? appId} is running ${count} times on this page, so a module-scope SCOS cannot choose a session. Use useSCOS() inside the app's components.${callerNote(file)}`,
    ...(file === undefined ? {} : { file }),
  });
}

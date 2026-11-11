/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** NWError. POSIX, DNS and TLS cases carry the native numeric error code.
 * Browser limitations use Darwin ENOTSUP (45); denied entitlement uses EACCES (13).
 */
export class NWFXError extends Error {
  private constructor(readonly code: "posix" | "dns" | "tls" | "wifiAware", readonly error: number, message: string) {
    super(message); this.name = "NWFXError";
  }
  static posix(error: number, message = `POSIX error ${error}`): NWFXError { return new NWFXError("posix", error, message); }
  static dns(error: number): NWFXError { return new NWFXError("dns", error, `DNS error ${error}`); }
  static wifiAware(error: number): NWFXError { return new NWFXError("wifiAware", error, `Wi-Fi Aware error ${error}`); }
  static tls(error: number): NWFXError { return new NWFXError("tls", error, `TLS error ${error}`); }
}

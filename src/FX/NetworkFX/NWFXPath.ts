/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NWFXPathStatus } from "./NWFXPathStatus";
import type { NWFXPathUnsatisfiedReason } from "./NWFXPathUnsatisfiedReason";
import type { NWFXInterfaceType } from "./NWFXInterfaceType";
import type { NWFXInterface } from "./NWFXInterface";
import { pathValues, pathInterfaces } from "./internal/pathValues";
import { unavailableObservation } from "./internal/networkPort";
/** NWPath. Immutable observation. Unobservable Apple properties throw NWFXError.posix(45).
 * Browser status is only the online hint; it does not prove endpoint reachability. */
export class NWFXPath {
  private constructor() {}
  get status(): NWFXPathStatus {
    return pathValues.get(this)!.status;
  }
  /** The browser supplies no specific routing/permission failure reason. */
  get unsatisfiedReason(): NWFXPathUnsatisfiedReason {
    return pathValues.get(this)!.unsatisfiedReason ?? unavailableObservation("unsatisfiedReason");
  }
  /** Throws if native interface enumeration (including names/indices) is unavailable. */
  get availableInterfaces(): readonly NWFXInterface[] {
    return pathInterfaces.get(this) ?? unavailableObservation("availableInterfaces");
  }
  /** Reliable cellular or metered observations only; unknown cost throws. */
  get isExpensive(): boolean {
    return pathValues.get(this)!.isExpensive ?? unavailableObservation("isExpensive");
  }
  /** Browser Save-Data maps to constrained; absent preference throws. */
  get isConstrained(): boolean {
    return pathValues.get(this)!.isConstrained ?? unavailableObservation("isConstrained");
  }
  /** Browser online state does not establish IPv4 routing. */
  get supportsIPv4(): boolean {
    return pathValues.get(this)!.supportsIPv4 ?? unavailableObservation("supportsIPv4");
  }
  /** Browser online state does not establish IPv6 routing. */
  get supportsIPv6(): boolean {
    return pathValues.get(this)!.supportsIPv6 ?? unavailableObservation("supportsIPv6");
  }
  /** Browser online state does not establish DNS configuration. */
  get supportsDNS(): boolean {
    return pathValues.get(this)!.supportsDNS ?? unavailableObservation("supportsDNS");
  }
  /** Throws unless actual transport types were observed; effective speed is never a transport. */
  usesInterfaceType(type: NWFXInterfaceType): boolean {
    return (pathValues.get(this)!.interfaceTypes ?? unavailableObservation("usesInterfaceType")).includes(type);
  }
}

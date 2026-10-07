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

export { MIFXEncoder } from "./MIFXEncoder";
export { MIFXParser } from "./MIFXParser";
export type { MIFXParserOptions } from "./MIFXParser";
export type {
  MIFXMessage,
  MIFXParseError,
  MIFXParserErrorCode,
  MIFXParserEvent,
  MIFXParserRecovery,
} from "./MIFXMessage";
export type {
  MIFXAccess,
  MIFXAuthorizationRequest,
  MIFXAuthorizationResult,
  MIFXAuthorizationState,
  MIFXCapabilities,
  MIFXClient,
  MIFXEndpointConnection,
  MIFXEndpointDirection,
  MIFXEndpointListener,
  MIFXEndpointSnapshot,
  MIFXEndpointState,
  MIFXInputListener,
  MIFXInputPacket,
  MIFXInputSubscription,
  MIFXOutputLease,
  MIFXSubscription,
} from "./MIFXAccess";
export { MIFXUniversalPacket, MIFX_UMP_PROTOCOL_VERSION } from "./MIFXUniversalPacket";
export type { MIFXMIDI2ChannelVoice, MIFXUniversalPacketKind } from "./MIFXUniversalPacket";
export { MIFXProtocolConversion, MIFXProtocolLossError } from "./MIFXProtocolConversion";
export type {
  MIFXPrecisionLossPolicy,
  MIFXProtocolConversionOptions,
  MIFXProtocolConversionResult,
} from "./MIFXProtocolConversion";
export { MIFXScheduler } from "./MIFXScheduler";
export type { MIFXScheduledSend, MIFXScheduledSendState, MIFXSchedulerOptions } from "./MIFXScheduler";

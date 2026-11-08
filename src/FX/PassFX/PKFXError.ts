/** PKPassKitError.Code cases used by PassFX; unsupported operations use unknownError. */
export class PKFXError extends Error {
  readonly domain = "PKPassKitErrorDomain";
  constructor(readonly code: "unknownError" | "invalidDataError" | "unsupportedVersionError" | "invalidSignature" | "notEntitledError", message: string) { super(message); this.name = "PKFXError"; }
}

/** NFCNDEFStatus. Capacity is supplied separately by queryNDEFStatus. */
export const NFXNDEFStatus = Object.freeze({ notSupported: "notSupported", readWrite: "readWrite", readOnly: "readOnly" } as const);
export type NFXNDEFStatus = typeof NFXNDEFStatus[keyof typeof NFXNDEFStatus];

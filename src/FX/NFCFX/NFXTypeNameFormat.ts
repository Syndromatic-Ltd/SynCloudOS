/** NFCTypeNameFormat: the three-bit NDEF type-name field. */
export const NFXTypeNameFormat = Object.freeze({ empty: 0, nfcWellKnown: 1, media: 2, absoluteURI: 3, nfcExternal: 4, unknown: 5, unchanged: 6 } as const);
export type NFXTypeNameFormat = typeof NFXTypeNameFormat[keyof typeof NFXTypeNameFormat];

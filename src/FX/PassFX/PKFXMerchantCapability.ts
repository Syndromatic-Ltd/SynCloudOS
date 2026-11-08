/** PKMerchantCapability option bits. Combine with bitwise OR. */
export const PKFXMerchantCapability = Object.freeze({ threeDSecure: 1, emv: 2, credit: 4, debit: 8, instantFundsOut: 128 } as const);
export type PKFXMerchantCapability = number;

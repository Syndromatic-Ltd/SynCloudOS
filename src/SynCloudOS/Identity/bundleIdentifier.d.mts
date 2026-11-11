/** Case-insensitive comparison/storage key; never replaces the authored value. */
export declare function normalizeBundleIdentifier<T extends string | null | undefined>(bundleIdentifier: T): T extends string ? string : T;

import type { Plugin } from "vite";

/** The mirroring module for a JSX runtime specifier, or null: the wrappers themselves import React's own. */
export declare function resolveHookMirrorJSX(id: string, importer?: string): string | null;
/** A Vite plugin for configurations that do not use the SynWare project plugin. */
export declare function hookMirrorJSX(): Plugin;

import type { ErrorObject } from "ajv/dist/2020";
import type { SynWareManifestV1 } from "./manifestTypes";

/** The SynApp manifest schema, precompiled by
 * scripts/synware/gen-manifest-validator.mjs. */
export interface SynAppManifestSchemaValidator {
  (data: unknown): data is SynWareManifestV1;
  errors?: ErrorObject[] | null;
}

export declare const validate: SynAppManifestSchemaValidator;
export default validate;

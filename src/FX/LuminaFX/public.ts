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

export { createLUFXActivation } from "./LUFXActivation";
export type { LUFXActivation } from "./LUFXActivation";
export { LUFXSearchableItem } from "./LUFXSearchableItem";
export type {
  LUFXSearchableItemDescriptor,
  LUFXSearchableItemJSON,
  LUFXVisibility,
} from "./LUFXSearchableItem";
export { LUFXQuery } from "./LUFXQuery";
export type { LUFXQueryDescriptor, LUFXQueryFilter } from "./LUFXQuery";
export { LUFXIndex } from "./LUFXIndex";
export type { LUFXIndexClient, LUFXIndexOperationOptions, LUFXIndexSession, LUFXIndexSnapshot } from "./LUFXIndex";
export type {
  LUFXIndexBackend,
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
  LUFXIndexCheckpoint,
  LUFXIndexState,
} from "./LUFXIndexBackend";
export { LUFX_TOKENIZER_VERSION, canonicalLUFXLocale, foldLUFXText, tokenizeLUFXText } from "./LUFXTokenizer";
export type { LUFXToken, LUFXTokenizerOptions } from "./LUFXTokenizer";
export { LUFX_RANKER_VERSION } from "./LUFXRanker";
export { LUFXQueryPlanner } from "./LUFXQueryPlanner";
export type { LUFXQueryExecutionOptions, LUFXQueryResultEntry, LUFXQueryResultPage } from "./LUFXQueryPlanner";
export type { LUFXMatchRange, LUFXSnippet, LUFXSuggestionOptions, LUFXSuggestionResult } from "./LUFXSuggestions";

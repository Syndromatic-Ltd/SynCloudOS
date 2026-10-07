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

import type { HTMLAttributes } from "react";

import type {
  Formatter,
  FormatterResult,
  PredicateComparisonOperator,
  PredicateExpression,
  PredicateLiteral,
  PredicateSchema,
} from "../../../SynCloudOS/Models";
import type { NSEDataViewState } from "../Core";

export interface NSEPredicateOperatorOption {
  readonly operator: PredicateComparisonOperator;
  readonly label: string;
  readonly arity: 0 | 1 | 2;
}

export interface NSEPredicateTemplate<T> {
  readonly id: string;
  readonly field: keyof T & string;
  readonly label: string;
  readonly operators: readonly NSEPredicateOperatorOption[];
  readonly acceptsTextOptions?: boolean;
  readonly formatter: Formatter<unknown>;
  validate(value: unknown): FormatterResult<unknown>;
}

export type NSERuleRow =
  | {
      readonly id: string;
      readonly kind: "constant";
      readonly value: boolean;
    }
  | {
      readonly id: string;
      readonly kind: "comparison";
      readonly field: string;
      readonly operator: PredicateComparisonOperator;
      readonly value?: PredicateLiteral;
      readonly options?: { readonly caseInsensitive?: boolean; readonly diacriticInsensitive?: boolean };
    }
  | {
      readonly id: string;
      readonly kind: "group";
      readonly operator: "all" | "any" | "none";
      readonly children: readonly NSERuleRow[];
    };

export interface NSERuleEditorValue { readonly root: NSERuleRow }

export interface NSERuleEditorValidation {
  readonly valid: boolean;
  readonly issues: readonly { readonly rowId: string; readonly message: string }[];
}

export interface NSEPredicateEditorProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  readonly schema: PredicateSchema<T>;
  readonly templates?: readonly NSEPredicateTemplate<T>[];
  readonly value?: PredicateExpression;
  readonly defaultValue?: PredicateExpression;
  readonly onChange?: (value: PredicateExpression) => void;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
  readonly locale?: string;
  readonly state?: NSEDataViewState;
}

export interface NSERuleEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  readonly value?: NSERuleEditorValue;
  readonly defaultValue?: NSERuleEditorValue;
  readonly onChange?: (value: NSERuleEditorValue) => void;
  readonly onValidationChange?: (validation: NSERuleEditorValidation) => void;
  readonly fields: readonly string[];
  readonly operators?: readonly NSEPredicateOperatorOption[];
  readonly templates?: readonly NSEPredicateTemplate<unknown>[];
  readonly locale?: string;
  readonly state?: NSEDataViewState;
  readonly readOnly?: boolean;
  readonly disabled?: boolean;
}

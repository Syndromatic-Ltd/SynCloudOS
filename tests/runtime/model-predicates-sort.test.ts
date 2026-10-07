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

import { expect, it } from "vitest";

import {
  Predicate,
  PredicateValidationError,
  SortDescriptor,
  sortWithDescriptors,
  type PredicateSchema,
} from "../../src/SynCloudOS/Models";

interface Person {
  id: string;
  name: string;
  age: number;
  team: string | null;
}

const schema: PredicateSchema<Person> = {
  id: "people.v1",
  fields: {
    name: { type: "string", read: (person) => person.name },
    age: { type: "number", read: (person) => person.age },
    team: {
      type: "string",
      nullable: true,
      read: (person) => person.team,
    },
  },
};

it("sorts stably with typed accessors and null policy", () => {
  const people: Person[] = [
    { id: "a", name: "Éva 10", age: 30, team: null },
    { id: "b", name: "Eva 2", age: 30, team: "Blue" },
    { id: "c", name: "Ana", age: 20, team: "Blue" },
  ];
  const age = new SortDescriptor<Person, number>({
    id: "age",
    select: (item) => item.age,
  });
  const name = new SortDescriptor<Person, string>({
    id: "name",
    select: (item) => item.name,
    collator: new Intl.Collator("en-GB", {
      numeric: true,
      sensitivity: "base",
    }),
  });

  expect(sortWithDescriptors(people, [age, name]).map(({ id }) => id)).toEqual([
    "c",
    "b",
    "a",
  ]);
  expect(sortWithDescriptors(people, [age]).map(({ id }) => id)).toEqual([
    "c",
    "a",
    "b",
  ]);
  expect(sortWithDescriptors(people, [])).toBe(people);
});

it("validates and evaluates serialisable predicates without source evaluation", () => {
  const expression = {
    kind: "compound",
    operator: "all",
    children: [
      {
        kind: "comparison",
        field: "age",
        operator: "greaterThanOrEqual",
        value: 21,
      },
      {
        kind: "comparison",
        field: "name",
        operator: "contains",
        value: "eva",
        options: { caseInsensitive: true, diacriticInsensitive: true },
      },
    ],
  } as const;
  const predicate = Predicate.compile(schema, expression);

  expect(
    predicate.test({ id: "a", name: "Éva 10", age: 30, team: null }),
  ).toBe(true);
  expect(predicate.toJSON()).toEqual(expression);
  expect(() =>
    Predicate.compile(schema, {
      kind: "comparison",
      field: "constructor.constructor",
      operator: "equals",
      value: "return globalThis",
    }),
  ).toThrow("Unknown predicate field");
});

it("validates operator values and nullable fields", () => {
  expect(() =>
    Predicate.compile(schema, {
      kind: "comparison",
      field: "age",
      operator: "contains",
      value: "3",
    }),
  ).toThrow(PredicateValidationError);
  expect(() =>
    Predicate.compile(schema, {
      kind: "comparison",
      field: "age",
      operator: "between",
      value: [20],
    }),
  ).toThrow(/two bounds/i);
  expect(() =>
    Predicate.compile(schema, {
      kind: "comparison",
      field: "name",
      operator: "equals",
      value: null,
    }),
  ).toThrow(/does not allow null/i);
  expect(
    Predicate.compile(schema, {
      kind: "comparison",
      field: "team",
      operator: "isNull",
    }).test({ id: "a", name: "Ana", age: 30, team: null }),
  ).toBe(true);
});

it("enforces depth and term limits before publishing a predicate", () => {
  const nested = {
    kind: "compound",
    operator: "all",
    children: [
      {
        kind: "compound",
        operator: "all",
        children: [{ kind: "constant", value: true }],
      },
    ],
  } as const;

  expect(() => Predicate.compile(schema, nested, { maxDepth: 2 })).toThrow(
    /depth exceeds 2/i,
  );
  expect(() => Predicate.compile(schema, nested, { maxTerms: 2 })).toThrow(
    /terms exceed 2/i,
  );
});

it("caps caller-supplied limits and rejects cyclic input before recursive overflow", () => {
  const cyclic = {
    kind: "compound",
    operator: "all",
    children: [] as unknown[],
  };
  cyclic.children.push(cyclic);

  expect(() =>
    Predicate.compile(schema, cyclic as never, {
      maxDepth: Number.MAX_SAFE_INTEGER,
      maxTerms: Number.MAX_SAFE_INTEGER,
    }),
  ).toThrow(PredicateValidationError);

  let deep: unknown = { kind: "constant", value: true };
  for (let index = 0; index < 200; index += 1) {
    deep = { kind: "compound", operator: "all", children: [deep] };
  }
  expect(() =>
    Predicate.compile(schema, deep as never, {
      maxDepth: Number.MAX_SAFE_INTEGER,
      maxTerms: Number.MAX_SAFE_INTEGER,
    }),
  ).toThrow(PredicateValidationError);
});

it("deeply owns and freezes predicate input", () => {
  const expression = {
    kind: "compound" as const,
    operator: "all" as const,
    children: [
      {
        kind: "comparison" as const,
        field: "age",
        operator: "in" as const,
        value: [20, 30],
      },
    ],
  };
  const predicate = Predicate.compile(schema, expression);

  expression.children[0].value.push(40);
  const json = predicate.toJSON();
  expect(json).toEqual({
    kind: "compound",
    operator: "all",
    children: [
      {
        kind: "comparison",
        field: "age",
        operator: "in",
        value: [20, 30],
      },
    ],
  });
});

it("fails closed for malformed or non-JSON predicate nodes", () => {
  expect(() =>
    Predicate.compile(schema, null as unknown as never),
  ).toThrow(PredicateValidationError);
  expect(() =>
    Predicate.compile(
      schema,
      {
        kind: "constant",
        value: true,
        payload: new Map([["source", "return globalThis"]]),
      } as unknown as never,
    ),
  ).toThrow(/JSON-serialisable/i);
});

it("rejects malformed predicate structure before freezing and never coerces text", () => {
  expect(() =>
    Predicate.compile(
      { ...schema, payload: new Map([["unexpected", true]]) } as unknown as PredicateSchema<Person>,
      { kind: "constant", value: true },
    ),
  ).toThrow(PredicateValidationError);
  expect(() =>
    Predicate.compile(
      schema,
      {
        kind: "comparison",
        field: "name",
        operator: "contains",
        value: "a",
        options: null,
      } as unknown as never,
    ),
  ).toThrow(PredicateValidationError);
  expect(() =>
    Predicate.compile(
      schema,
      { kind: "compound", operator: "all", children: null } as unknown as never,
    ),
  ).toThrow(PredicateValidationError);

  const hostile = {
    toString: () => {
      throw new Error("text coercion escaped the predicate boundary");
    },
    [Symbol.toPrimitive]: () => {
      throw new Error("text coercion escaped the predicate boundary");
    },
  };
  const predicate = Predicate.compile(schema, {
    kind: "comparison",
    field: "name",
    operator: "contains",
    value: "a",
  });
  expect(() =>
    predicate.test({ id: "hostile", name: hostile as unknown as string, age: 1, team: null }),
  ).not.toThrow();
  expect(
    predicate.test({ id: "hostile", name: hostile as unknown as string, age: 1, team: null }),
  ).toBe(false);
});

it("keeps native numeric comparisons reflexive and stable around NaN", () => {
  const numeric = new SortDescriptor<{ readonly id: string; readonly value: number }, number>({
    id: "value",
    select: (item) => item.value,
  });
  const nan = { id: "nan", value: Number.NaN };
  const laterNan = { id: "later-nan", value: Number.NaN };

  expect(numeric.compare(nan, nan)).toBe(0);
  expect(sortWithDescriptors([
    nan,
    { id: "two", value: 2 },
    laterNan,
    { id: "one", value: 1 },
  ], [numeric]).map(({ id }) => id)).toEqual(["one", "two", "nan", "later-nan"]);
});

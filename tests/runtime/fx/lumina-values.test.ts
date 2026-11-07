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

import { describe, expect, it } from "vitest";

import {
  createSynCloudOSNamedRouteIdentity,
} from "../../../src/SynCloudOS/Routing/namedRouteIdentity";
import {
  LUFXQuery,
  LUFXSearchableItem,
  createLUFXActivation,
} from "../../../src/FX/LuminaFX/public";

const activation = () => createLUFXActivation({
  version: 1,
  kind: "named-route",
  routeName: "journal.post",
  parameters: { postId: "post:stable-42" },
});

const item = () => new LUFXSearchableItem({
  id: "post:stable-42",
  domain: "journal.posts",
  contentType: "article",
  title: "A durable Journal post",
  subtitle: "Indexed without executable state",
  alternateNames: ["Stable post"],
  body: "Searchable body text.",
  keywords: ["journal", "durable"],
  createdAt: 1_700_000_000_000,
  modifiedAt: 1_700_000_010_000,
  rankingHint: 0.25,
  resourceReference: "document:post:stable-42",
  activation: activation(),
  revision: "rev:7",
});

describe("LuminaFX durable values", () => {
  it("uses the Routing II named-route identity as the only version-1 persisted activation", () => {
    const value = activation();
    expect(value).toEqual({
      version: 1,
      kind: "named-route",
      routeName: "journal.post",
      parameters: { postId: "post:stable-42" },
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.parameters)).toBe(true);
    expect(createSynCloudOSNamedRouteIdentity(value)).toEqual(value);

    expect(() => createLUFXActivation({
      version: 1,
      kind: "legacy-path",
      pathname: "/journal",
    })).toThrow(/named-route|shape|kind/i);
    expect(() => createLUFXActivation({
      version: 1,
      kind: "named-route",
      routeName: "journal.post",
      parameters: { postId: "post:stable-42" },
      applicationId: "com.example.foreign-app",
    })).toThrow(/shape|field|owner/i);
    expect(() => createLUFXActivation({
      version: 1,
      kind: "named-route",
      routeName: "journal.post",
      parameters: { postId: "post:stable-42" },
      query: { admin: "1" },
    })).toThrow(/shape|field|query/i);
  });

  it("preserves a valid reserved-looking parameter across persistence", () => {
    const parameters = Object.fromEntries([["__proto__", "stable-post"]]);
    const value = createLUFXActivation({ version: 1, kind: "named-route", routeName: "journal.post", parameters });
    expect(Object.hasOwn(value.parameters, "__proto__")).toBe(true);
    expect(value.parameters["__proto__"]).toBe("stable-post");

    const restored = createSynCloudOSNamedRouteIdentity(JSON.parse(JSON.stringify(value)));
    expect(Object.hasOwn(restored.parameters, "__proto__")).toBe(true);
    expect(restored.parameters["__proto__"]).toBe("stable-post");
  });

  it("roundtrips stable item identity/revision and defaults visibility to app-only", () => {
    const original = item();
    expect(original.visibility).toBe("app-only");
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(original.keywords)).toBe(true);
    const roundtrip = LUFXSearchableItem.fromJSON(JSON.parse(JSON.stringify(original)));
    expect(roundtrip).toEqual(original);
    expect(roundtrip.id).toBe("post:stable-42");
    expect(roundtrip.revision).toBe("rev:7");
  });

  it("snapshots plain data without invoking accessors or accepting prototype-bearing payloads", () => {
    const getter = Object.defineProperty({
      id: "x", domain: "d", contentType: "article", revision: "1", activation: activation(),
    }, "title", { enumerable: true, get: () => { throw new Error("must not execute"); } });
    expect(() => new LUFXSearchableItem(getter as never)).toThrow(/plain data|descriptor|shape/i);

    const inherited = Object.create({ title: "inherited" }) as Record<string, unknown>;
    Object.assign(inherited, {
      id: "x", domain: "d", contentType: "article", title: "own", revision: "1", activation: activation(),
    });
    expect(() => new LUFXSearchableItem(inherited as never)).toThrow(/plain data|prototype/i);

    expect(() => createLUFXActivation(Object.assign(Object.create({}), {
      version: 1, kind: "named-route", routeName: "journal.post", parameters: {},
    }))).toThrow(/plain data|prototype/i);
  });

  it("enforces bounded text, dates, hints, arrays and safe resource references", () => {
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), title: "x".repeat(2_000) })).toThrow(/title|bytes|length/i);
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), body: "x".repeat(300_000) })).toThrow(/body|bytes|length/i);
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), rankingHint: 1.01 })).toThrow(/ranking/i);
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), modifiedAt: Number.NaN })).toThrow(/modified/i);
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), keywords: Array.from({ length: 65 }, (_, index) => `k${index}`) })).toThrow(/keywords|count/i);
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), resourceReference: "https://example.com/private" })).toThrow(/resource/i);
    expect(() => new LUFXSearchableItem({ ...item().toJSON(), resourceReference: "resource:../secret" })).toThrow(/resource|segment/i);
  });

  it("bounds route names and parameters without allowing executable or ambient values", () => {
    expect(() => createLUFXActivation({
      version: 1,
      kind: "named-route",
      routeName: "x".repeat(200),
      parameters: {},
    })).toThrow(/route name|bytes|length/i);
    expect(() => createLUFXActivation({
      version: 1,
      kind: "named-route",
      routeName: "journal.post",
      parameters: { postId: () => "evil" },
    })).toThrow(/parameter|string/i);
    expect(() => createLUFXActivation({
      version: 1,
      kind: "named-route",
      routeName: "journal.post",
      parameters: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`p${index}`, `${index}`])),
    })).toThrow(/parameter|count/i);
  });

  it("creates a small immutable query value without backend syntax", () => {
    const query = new LUFXQuery({ text: "durable journal", domains: ["journal.posts"], contentTypes: ["article"], limit: 20, asOf: 42 });
    expect(query.text).toBe("durable journal");
    expect(query.limit).toBe(20);
    expect(Object.isFrozen(query.domains)).toBe(true);
    expect(() => new LUFXQuery({ text: "x", limit: 101 })).toThrow(/limit/i);
    expect(() => new LUFXQuery({ text: "x".repeat(5_000) })).toThrow(/text|bytes|length/i);
  });
});

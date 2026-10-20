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

import {
  defineSynWareServiceToken,
  useService,
  type AppServiceClient,
  type SynWareContextValue,
} from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
// @ts-expect-error Raw route state is not a public SDK type.
import type { AppRouteStateClient } from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
// @ts-expect-error Service requirements travel on tokens and the manifest.
import type { SynWareServiceRequirement } from "../../src/SynCloudOS/AppSDK/sdkPackageEntry";
import { createDeniedFakeServiceClient } from "../../src/SynCloudOS/AppSDK/testing/fakeClients";

interface SearchClient {
  search(query: string): readonly string[];
}

const token = defineSynWareServiceToken<SearchClient>({
  id: "com.syndromatic.search",
  minimumVersion: "1.0.0",
  contractVersion: "search.v1",
});

const deniedFake = createDeniedFakeServiceClient();
deniedFake.subscribe(token, () => undefined)();
// @ts-expect-error The standalone fake uses the canonical token subscription contract.
deniedFake.subscribe(token.id, () => undefined);

declare const services: AppServiceClient;

const required = services.require(token);
required.search("air");

const optional = services.optional(token);
if (optional.available && optional.client) optional.client.search("justice");

const hooked = useService(token);
if (hooked.available && hooked.client) hooked.client.search("daft punk");

// @ts-expect-error inferred SearchClient has no count method.
required.count();

// @ts-expect-error inferred token result is not a different client contract.
const wrongClient: { readonly count: number } = services.require(token);
void wrongClient;

// @ts-expect-error The public string lookup has been removed.
services.resolve("com.syndromatic.search");
// @ts-expect-error Required acquisition accepts a token, not its string ID.
services.require(token.id);
// @ts-expect-error Optional acquisition accepts a token, not its string ID.
services.optional(token.id);
// @ts-expect-error The hook accepts authentic typed tokens, never string IDs.
useService("com.syndromatic.search");
// @ts-expect-error Service subscriptions use the same token identity.
services.subscribe("com.syndromatic.search", () => undefined);
declare const app: SynWareContextValue;
// @ts-expect-error Query authority belongs to a mounted named graph, not a raw bag.
app.routeState.getQuery();

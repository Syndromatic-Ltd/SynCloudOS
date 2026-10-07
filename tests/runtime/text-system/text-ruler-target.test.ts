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

import { expect,it } from "vitest";
import { createInMemoryNSETextOwner,plainNSETextContent } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
const api=await import("../../../src/NSE/TextEditing/textTypographyAdapter").catch(()=>null);
it("edits paragraph markers using RTL direction, zoom and explicit point conversion",()=>{
  expect(api?.NSETextTypographyAdapter).toBeTypeOf("function");const owner=createInMemoryNSETextOwner({content:plainNSETextContent("paragraph\nnext")}),session=new TextEditingSession({id:"ruler",owner});const adapter=new api!.NSETextTypographyAdapter({session});
  adapter.ruler("headIndent",20,{zoom:2,direction:"rtl"});expect(owner.getSnapshot().attributedContent.blocks[0].attributes?.headIndent).toBe(-10);
  adapter.ruler("firstLineHeadIndent",9,{zoom:1,direction:"ltr",units:"pt"});expect(owner.getSnapshot().attributedContent.blocks[0].attributes?.firstLineHeadIndent).toBe(12);
  expect(owner.getSnapshot().attributedContent.blocks[1].attributes).toBeUndefined();
});

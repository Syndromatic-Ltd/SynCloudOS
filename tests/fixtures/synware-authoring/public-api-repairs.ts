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
  NSEObjectController, NSEDictionaryController, NSEArrayController, NSETreeController,
  NSEDataViewCellContent, IndexPath, IndexSet, Predicate, SortDescriptor, NumberFormatter,
  type ObjectControllerOptions, type DictionaryControllerOptions, type ControllerEditTransaction,
  type ChangeSet, type NSEDictionaryEntry, type Formatter, type FormatterContext,
  type FormatterResult, type NSEControlValidation,
} from "@syndromatic/syncloudos/nse";
import type { NSEControlValidation as ControlValidation, Formatter as ControlFormatter } from "@syndromatic/syncloudos/nse/controls";
import * as graphics from "@syndromatic/syncloudos/fx/graphics";
import { VFXEncoder, VFXEncoderCapabilities, type VFXEncoderConfig } from "@syndromatic/syncloudos/fx/video";
import type { SynWareContextValue } from "@syndromatic/syncloudos/sdk";

// Type-check the real app capability without acquiring a host undo manager.
function transactionForApp(app: SynWareContextValue): ControllerEditTransaction {
  return { id: "app-edit", actionName: "Edit", undoManager: app.undo.create({ kind: "application", id: app.appId }) };
}
void transactionForApp;

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const context: FormatterContext = { locale: "en-GB" };
const formatter: Formatter<number> & ControlFormatter<number> = new NumberFormatter();
const parsed: FormatterResult<number> = formatter.parse("12", context);
check(parsed.ok && parsed.value === 12, "Public formatter contract");
const validation: NSEControlValidation & ControlValidation = { kind: "valid" };
check(validation.kind === "valid", "Public validation contract");
const objectOptions: ObjectControllerOptions<{ total: number }> = {
  id: "invoice", content: { total: 1 },
  fields: { total: { read: value => value.total, write: (value, total: number) => ({ ...value, total }), formatter } },
};
const object = new NSEObjectController(objectOptions);
const actions: Array<{ undo(): void; redo(): void }> = [];
const transaction: ControllerEditTransaction = {
  id: "edit", actionName: "Edit total",
  undoManager: { register(action) { actions.push(action); return "undo:1"; } },
};
object.beginEditing(transaction);
check(object.setFieldText("total", "12", context).ok, "Object editing");
check(object.getSnapshot().content.total === 1, "Draft must not change committed content");
check(object.commitEditing().status === "committed", "Object commit");
check(object.getSnapshot().content.total === 12, "Committed object value");
actions[0]!.undo();
check(object.getSnapshot().content.total === 1, "Undo through registration-only capability");
actions[0]!.redo();
check(object.getSnapshot().content.total === 12, "Redo through registration-only capability");
object.dispose();

const dictionaryOptions: DictionaryControllerOptions<string> = { id: "metadata", content: { name: "Old" } };
const dictionary = new NSEDictionaryController(dictionaryOptions);
dictionary.beginEditing({ id: "rename", actionName: "Rename" });
check(dictionary.setValue("name", "New").status === "updated", "Dictionary editing");
check(dictionary.commitEditing().status === "committed", "Dictionary commit");
const changes: ChangeSet<string, NSEDictionaryEntry<string>> = dictionary.getSnapshot().changeSet;
check(changes !== undefined && dictionary.getSnapshot().content.name === "New", "Dictionary snapshot");
dictionary.dispose();

const predicate = Predicate.compile<{ id: string }>({ id: "ids", fields: { id: { type: "string", read: value => value.id } } }, { kind: "constant", value: true });
const array = new NSEArrayController({ id: "list", content: [{ id: "one" }], getId: value => value.id });
array.setPredicate(predicate);
const sort = new SortDescriptor<{ id: string }, string>({ id: "id", select: value => value.id });
check(sort.compare({ id: "a" }, { id: "b" }) < 0, "Sort descriptor");
array.dispose();
const tree = new NSETreeController({ id: "tree", content: [{ id: "one" }], getId: value => value.id, getChildren: () => [], withChildren: value => value });
check(tree.nodeAt(IndexPath.from(0))?.id === "one", "Public index paths work with public tree controllers");
tree.dispose();
check(IndexSet.fromIndexes([1, 2, 2]).count === 2, "Index set construction");
check(NSEDataViewCellContent({ primary: "Name", secondary: "Detail" }).props["data-nse-part"] === "cell-content", "Public cell rendering");

// @ts-expect-error Mutable image storage is not a public graphics capability.
void graphics.borrowGFXImageBytes;
check(!("borrowGFXImageBytes" in graphics), "Private pixel storage leaked");
const image = new graphics.GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([12, 34, 56, 255]) });
image.copyData()[0] = 99;
check(image.copyData()[0] === 12, "Public pixel access must copy");
const capability = await VFXEncoderCapabilities.queryEncoder({ codec: "vp8", codedWidth: 2, codedHeight: 2, bitrate: 100_000, framerate: 30 }, { async queryEncoder() { return { supported: true }; } });
const configured: VFXEncoderConfig[] = [];
const encoder = new VFXEncoder({ backend: { encodeQueueSize: 0, configure(config) { configured.push(config); }, encode() {}, async flush() {}, reset() {}, dispose() {} }, output() {} });
await encoder.configure(capability.config);
check(configured[0]?.scalabilityMode === null, "Capability result must configure directly");
encoder.dispose();
console.log("Public API repair consumer passed");

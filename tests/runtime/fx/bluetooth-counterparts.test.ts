import {readFileSync} from "node:fs";
import ts from "typescript";
import {expect,it} from "vitest";
import * as B from "../../../src/FX/BluetoothFX/public";
import {appkitCounterpartFor} from "../../../scripts/developer-mcp/lookup.mjs";
const names=["Manager", "ManagerState", "ManagerAuthorization", "CentralManager", "CentralManagerDelegate", "Peripheral", "PeripheralState", "PeripheralDelegate", "Attribute", "Service", "Characteristic", "CharacteristicProperties", "CharacteristicWriteType", "Descriptor", "UUID", "Error"];
it("maps every Bluetooth runtime/type export and its Foundation UUID dependency",()=>{const mapping=JSON.parse(readFileSync("docs/framework/appkit-counterparts.json","utf8"));expect(Object.keys(B).sort()).toEqual(names.filter(name=>!name.endsWith("Delegate")).map(name=>`BTFX${name}`).sort());for(const name of names)expect(appkitCounterpartFor(`BTFX${name}`,mapping)).toBe(`CB${name}`);expect(appkitCounterpartFor("NSEUUID",mapping)).toBe("NSUUID");const program=ts.createProgram(["src/FX/BluetoothFX/public.ts"],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,skipLibCheck:true});const checker=program.getTypeChecker();const file=program.getSourceFile("src/FX/BluetoothFX/public.ts")!;expect(checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).map(symbol=>symbol.name).sort()).toEqual(names.map(name=>`BTFX${name}`).sort());});

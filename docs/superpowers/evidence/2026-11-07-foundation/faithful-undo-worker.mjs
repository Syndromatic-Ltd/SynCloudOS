import { build } from "esbuild";
import { Worker } from "node:worker_threads";
const result = await build({entryPoints:["src/Foundation/NSEUndoManager.ts"], bundle:true, platform:"node", format:"cjs", write:false});
const source = result.outputFiles[0].text + `\nconst { parentPort } = require('node:worker_threads'); const manager = new NSEUndoManager(); const target = {value: 1}; manager.registerUndo(target, t => {t.value = 0}); manager.undo(); parentPort.postMessage({value: target.value, document: typeof document});`;
const resultValue = await new Promise((resolve,reject) => { const worker = new Worker(source, {eval:true}); worker.once('message',resolve); worker.once('error',reject); });
if (resultValue.value !== 0 || resultValue.document !== 'undefined') throw new Error(JSON.stringify(resultValue));
console.log(JSON.stringify(resultValue));

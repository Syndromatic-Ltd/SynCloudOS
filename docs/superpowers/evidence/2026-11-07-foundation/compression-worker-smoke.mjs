import { build } from "esbuild";
import { Worker } from "node:worker_threads";

const { outputFiles } = await build({
  stdin: {
    contents: `import { NSEData } from './src/Foundation/NSEData.ts';
import { CPFXCapabilities, CPFXCompress, CPFXDecompress } from './src/FX/CompressionFX/public.ts';
globalThis.smoke = async () => {
  if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('DOM unexpectedly present');
  const data = NSEData.from(new TextEncoder().encode('worker bytes'.repeat(1000)));
  const results = [];
  for (const algorithm of CPFXCapabilities.query().algorithms) {
    const result = await CPFXDecompress(await CPFXCompress(data, algorithm), algorithm);
    if (!result.isEqual(data)) throw new Error('round trip failed: ' + algorithm);
    results.push(algorithm);
  }
  if (!results.includes('zlib') || !results.includes('gzip')) throw new Error('baseline codecs missing');
  return { bytes: data.count, algorithms: results, window: typeof window, document: typeof document };
};`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, write: false, platform: "browser", format: "iife", target: "es2022",
});

const worker = new Worker(`const { parentPort } = require('node:worker_threads');\n${outputFiles[0].text}\nsmoke().then(result => parentPort.postMessage(result), error => { throw error; });`, { eval: true });
const result = await new Promise((resolve, reject) => {
  worker.once("message", resolve);
  worker.once("error", reject);
  worker.once("exit", (code) => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
});
console.log(JSON.stringify(result));
await worker.terminate();

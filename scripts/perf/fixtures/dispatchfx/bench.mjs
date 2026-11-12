/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

function imageBlur12MP() {
  const width = 4000;
  const height = 3000;
  const pixels = width * height;
  const src = new Uint8ClampedArray(pixels * 4);
  const dst = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < src.length; i += 4) src[i] = (i * 17) & 255;

  // 5-tap horizontal box blur across all 12 MP RGBA pixels.
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 2; x < width - 2; x++) {
      const idx = row + x * 4;
      dst[idx] = (src[idx - 8] + src[idx - 4] + src[idx] + src[idx + 4] + src[idx + 8]) * 0.2;
      dst[idx + 1] = (src[idx - 7] + src[idx - 3] + src[idx + 1] + src[idx + 5] + src[idx + 9]) * 0.2;
      dst[idx + 2] = (src[idx - 6] + src[idx - 2] + src[idx + 2] + src[idx + 6] + src[idx + 10]) * 0.2;
      dst[idx + 3] = 255;
    }
  }
  return dst[100];
}

function pdfOpen200Pages() {
  const pages = 200;
  const paragraph = "SynCloudOS AppKit responder chain layout graphics Metal worker pool benchmark payload ".repeat(12);
  const chunks = ["%PDF-1.7"];
  for (let page = 1; page <= pages; page++) {
    for (let line = 0; line < 20; line++) {
      const body = `BT /F1 12 Tf 72 ${720 - line * 14} Td (Page ${page} Line ${line}: ${paragraph}) Tj ET`;
      chunks.push(`${page * 32 + line} 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj`);
    }
  }
  const source = chunks.join("\n");
  let tokenCount = 0;
  const regex = /(\d+\s+0\s+obj)|stream\n([\s\S]*?)\nendstream|\(([^)]+)\)\s+Tj/gu;
  for (const match of source.matchAll(regex)) {
    tokenCount += (match[2]?.length ?? 0) + (match[3]?.length ?? 0) + 1;
  }
  return tokenCount;
}

function luminaIndex5000() {
  const docs = 5000;
  const vocabulary = ["syncloudos", "dispatch", "worker", "appkit", "window", "document", "search", "lumina", "metal", "cumulus", "theme", "responder", "command", "layout", "graphics", "audio", "kernel", "shader", "pipeline", "memory", "queue", "barrier", "source", "timer"];
  const index = new Map();
  for (let docId = 0; docId < docs; docId++) {
    const words = [];
    for (let w = 0; w < 64; w++) {
      words.push(vocabulary[(docId + w * 7) % vocabulary.length]);
    }
    const text = `${words.join(" ")} doc-${docId}`;
    const tokens = text.toLowerCase().split(/\s+/u);
    for (const token of tokens) {
      let postings = index.get(token);
      if (!postings) {
        postings = [];
        index.set(token, postings);
      }
      postings.push(docId);
    }
  }
  return index.size;
}

function videoFrames10s1080p() {
  const width = 1920;
  const height = 1080;
  const frames = 300;
  const frame = new Uint8Array(width * height);
  let checksum = 0;
  for (let f = 0; f < frames; f++) {
    // 1/8th luma pass per frame across 300 1080p frames.
    const offset = f & 7;
    for (let i = offset; i < frame.length; i += 8) {
      const next = (frame[i] + 3) & 255;
      frame[i] = next;
      checksum += next;
    }
  }
  return checksum;
}

let cached200MB = null;
async function sha256Control200MB() {
  if (!cached200MB) {
    cached200MB = new Uint8Array(200 * 1024 * 1024);
    cached200MB[0] = 42;
    cached200MB[cached200MB.length - 1] = 99;
  }
  const digest = await crypto.subtle.digest("SHA-256", cached200MB);
  return new Uint8Array(digest)[0];
}

function mandelbrot2048() {
  const size = 2048;
  const maxIter = 48;
  const out = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    const y0 = (py / size) * 2.4 - 1.2;
    const row = py * size;
    for (let px = 0; px < size; px++) {
      const x0 = (px / size) * 3.0 - 2.1;
      let x = 0;
      let y = 0;
      let iter = 0;
      while (x * x + y * y <= 4 && iter < maxIter) {
        const xt = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xt;
        iter++;
      }
      out[row + px] = iter;
    }
  }
  return out[size * 1024 + 1024];
}

const workloads = {
  "image-blur": imageBlur12MP,
  "pdf-open": pdfOpen200Pages,
  "lumina-index": luminaIndex5000,
  "video-frames": videoFrames10s1080p,
  "sha256-control": sha256Control200MB,
  "mandelbrot": mandelbrot2048,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measureRoundTrip(worker, mode, bytes, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    if (mode === "sab") {
      const sab = new SharedArrayBuffer(bytes);
      const start = performance.now();
      await new Promise(resolve => {
        worker.onmessage = () => resolve();
        worker.postMessage({ mode: "sab", view: sab });
      });
      samples.push(performance.now() - start);
    } else {
      const buffer = new ArrayBuffer(bytes);
      const transfer = mode === "transfer" ? [buffer] : [];
      const start = performance.now();
      await new Promise(resolve => {
        worker.onmessage = () => resolve();
        worker.postMessage({ mode, buffer }, transfer);
      });
      samples.push(performance.now() - start);
    }
  }
  return Math.round(median(samples) * 1000) / 1000;
}

window.__dfxBench = {
  workloadNames: Object.keys(workloads),
  isolated: Boolean(self.crossOriginIsolated),
  async runWorkload(name) {
    const fn = workloads[name];
    if (!fn) throw new Error(`Unknown workload: ${name}`);
    window.__delays = [];
    window.__longTasks = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: false });
    const onPointerDown = event => window.__delays.push(performance.now() - event.timeStamp);
    window.addEventListener("pointerdown", onPointerDown);

    await new Promise(resolve => setTimeout(resolve, 20));
    const start = performance.now();
    const result = await fn();
    const wallMs = performance.now() - start;
    await new Promise(resolve => setTimeout(resolve, 60));

    window.removeEventListener("pointerdown", onPointerDown);
    observer.disconnect();
    const sortedDelays = [...window.__delays].sort((a, b) => a - b);
    const p95Index = sortedDelays.length ? Math.min(sortedDelays.length - 1, Math.floor(sortedDelays.length * 0.95)) : 0;
    const longestTaskMs = window.__longTasks.reduce((best, value) => Math.max(best, value), 0);
    const p95InputDelayMs = sortedDelays.length ? sortedDelays[p95Index] : 0;
    return {
      result,
      wallMs: Math.round(wallMs * 10) / 10,
      longestTaskMs: Math.round(longestTaskMs * 10) / 10,
      p95InputDelayMs: Math.round(p95InputDelayMs * 10) / 10,
    };
  },
  async runCrossover() {
    const worker = new Worker(new URL("./crossover-worker.mjs", import.meta.url), { type: "module" });
    const sizes = [
      { label: "1 KB", bytes: 1024, iterations: 15 },
      { label: "64 KB", bytes: 64 * 1024, iterations: 15 },
      { label: "1 MB", bytes: 1024 * 1024, iterations: 7 },
      { label: "16 MB", bytes: 16 * 1024 * 1024, iterations: 3 },
      { label: "128 MB", bytes: 128 * 1024 * 1024, iterations: 3 },
    ];
    // Warm up the module worker once before timing.
    await measureRoundTrip(worker, "clone", 64, 1);
    const table = [];
    for (const entry of sizes) {
      const cloneMs = await measureRoundTrip(worker, "clone", entry.bytes, entry.iterations);
      const transferMs = await measureRoundTrip(worker, "transfer", entry.bytes, entry.iterations);
      const sabMs = self.crossOriginIsolated ? await measureRoundTrip(worker, "sab", entry.bytes, entry.iterations) : null;
      table.push({ size: entry.label, bytes: entry.bytes, cloneMs, transferMs, sabMs });
    }
    worker.terminate();
    return { isolated: Boolean(self.crossOriginIsolated), table };
  },
};

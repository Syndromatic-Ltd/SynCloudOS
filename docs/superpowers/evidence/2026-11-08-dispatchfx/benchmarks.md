# DispatchFX Benchmarks & Baselines (Task 7)

Recorded against `HEAD` before installing the `WorkerPool` runtime or SynWare closure-conversion transform, using Playwright Chromium via `scripts/perf/dispatchfx-bench.mjs`.

- Command (normal): `node scripts/perf/dispatchfx-bench.mjs --workload all --runs 3`
- Command (`crossOriginIsolated`): `node scripts/perf/dispatchfx-bench.mjs --workload mandelbrot --runs 3 --isolated`
- Methodology: three runs per workload, reporting the median. Input delay is measured from synthetic `pointerdown` events dispatched every 50 ms (`performance.now() - event.timeStamp`), and long tasks come from `PerformanceObserver({ type: "longtask" })`.

## Main-Thread Baselines (3-run median)

| Workload | Description | Longest Task (ms) | p95 Input Delay (ms) | Wall Time (ms) |
| --- | --- | ---: | ---: | ---: |
| `image-blur` | 12 MP RGBA 5-tap horizontal box blur | 111 | 82.7 | 111.9 |
| `pdf-open` | 200-page PDF stream tokenisation | 0 | 0.2 | 2.2 |
| `lumina-index` | 5,000-document inverted index build | 0 | 0.2 | 20.6 |
| `video-frames` | 300 x 1080p frames (1/8 stride luma pass) | 57 | 27.5 | 56.8 |
| `sha256-control` | 200 MB `crypto.subtle.digest("SHA-256")` control | 114 | 85.4 | 114.3 |
| `mandelbrot` | 2048x2048 Mandelbrot set (48 iterations) | 93 | 62.7 | 93.1 |

## Worker Transfer Crossover Table

Round-trip latency (`postMessage` + worker ack, median across iterations per size).

### Standard context (`crossOriginIsolated: false`)

| Payload Size | Bytes | Structured Clone (ms) | `ArrayBuffer` Transfer (ms) | `SharedArrayBuffer` (ms) |
| --- | ---: | ---: | ---: | ---: |
| 1 KB | 1,024 | 0 | 0 | n/a |
| 64 KB | 65,536 | 0.1 | 0 | n/a |
| 1 MB | 1,048,576 | 0.9 | 0 | n/a |
| 16 MB | 16,777,216 | 8.9 | 0.2 | n/a |
| 128 MB | 134,217,728 | 69.9 | 0.2 | n/a |

### Isolated context (`--isolated`, `crossOriginIsolated: true`)

| Payload Size | Bytes | Structured Clone (ms) | `ArrayBuffer` Transfer (ms) | `SharedArrayBuffer` (ms) |
| --- | ---: | ---: | ---: | ---: |
| 1 KB | 1,024 | 0.025 | 0.025 | 0.02 |
| 64 KB | 65,536 | 0.1 | 0.025 | 0.025 |
| 1 MB | 1,048,576 | 0.775 | 0.04 | 0.025 |
| 16 MB | 16,777,216 | 9.1 | 0.07 | 0.03 |
| 128 MB | 134,217,728 | 69.565 | 0.135 | 0.02 |

## Notes

- In Chromium 149, `performance.now()` coarsens to 0.1 ms unless `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` are served (`--isolated`), which enables high-resolution timers (~5 us) and `SharedArrayBuffer`.
- Above ~64 KB, structured cloning scales linearly with byte count (~70 ms at 128 MB), whereas zero-copy transfer (`< 0.25 ms`) and `SharedArrayBuffer` (`<= 0.03 ms`) stay constant-time.
- These baseline workloads run directly in the standalone benchmark fixture page (`scripts/perf/fixtures/dispatchfx/`); end-to-end Vite app benchmarks through `DFXQueue` + `WorkerPool` follow after Tasks 8–10.

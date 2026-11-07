import { defineConfig } from "vitest/config";
export default defineConfig({ esbuild: { supported: { decorators: false } }, test: { environment: "jsdom", include: ["consumer.test.tsx"] } });

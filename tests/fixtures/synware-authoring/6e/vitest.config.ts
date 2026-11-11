import { defineConfig } from "vitest/config";
import { synCloudOS } from "@syndromatic/syncloudos/vite";
export default defineConfig({ plugins: [synCloudOS({ webspringEntry: false })], esbuild: { supported: { decorators: false } }, test: { environment: "jsdom", include: ["consumer.test.tsx"] } });

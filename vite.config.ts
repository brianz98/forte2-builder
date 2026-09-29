import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import yaml from "@rollup/plugin-yaml";

// GitHub Pages serves a project repo under /<repo>/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/forte2-builder/" : "/",
  plugins: [react(), yaml()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
}));

import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await esbuild.build({
  absWorkingDir: __dirname,
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "@codemirror/language"],
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: "inline",
  outfile: path.join(__dirname, "main.js"),
  logLevel: "info",
});

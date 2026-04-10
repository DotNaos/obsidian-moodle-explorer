import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const suffix = process.env.RELEASE_SUFFIX?.trim();
const version = suffix ? `${manifest.version}-${suffix}` : manifest.version;
const releaseDir = path.join(root, ".release");

await fs.rm(releaseDir, { recursive: true, force: true });
await fs.mkdir(releaseDir, { recursive: true });

const releaseManifest = {
  ...manifest,
  version,
};

const versions = {
  [version]: manifest.minAppVersion,
};

await fs.writeFile(path.join(releaseDir, "manifest.json"), JSON.stringify(releaseManifest, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(releaseDir, "versions.json"), JSON.stringify(versions, null, 2) + "\n", "utf8");

process.stdout.write(JSON.stringify({ version, releaseDir }) + "\n");

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(projectRoot, "public");
const assets = ["index.html", "styles.css", "journey-data.js", "app.js"];

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  assets.map((asset) =>
    copyFile(path.join(projectRoot, asset), path.join(publicDirectory, asset)),
  ),
);

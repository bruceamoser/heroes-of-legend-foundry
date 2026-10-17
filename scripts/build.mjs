import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/heroes-of-legend/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("static/", root), output, { recursive: true });
await cp(new URL("src/", root), output, { recursive: true });
console.info(`Built ${fileURLToPath(output)}`);

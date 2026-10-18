import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Transport manifests are temporary. ZIP bytes and their embedded public URLs
// remain exactly those of the release artifact being accepted.
export async function serveReleaseCandidates(directories, { port = 0 } = {}) {
  const artifacts = new Map();
  for (const [label, directory] of Object.entries(directories)) {
    if (!/^[a-z][a-z0-9-]*$/.test(label)) throw new Error("Invalid artifact label.");
    const files = new Map();
    const checksums = await readFile(resolve(directory, "SHA256SUMS"), "utf8");
    for (const name of ["system.json", "heroes-of-legend.zip"]) {
      const bytes = await readFile(resolve(directory, name));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (!checksums.split(/\r?\n/).includes(`${hash}  ${name}`))
        throw new Error(`${label}/${name}: SHA256SUMS mismatch.`);
      files.set(name, { bytes, hash });
    }
    const manifest = JSON.parse(files.get("system.json").bytes);
    const embedded = JSON.parse(execFileSync("unzip", ["-p", resolve(directory, "heroes-of-legend.zip"), "system.json"], { maxBuffer: 1024 * 1024 }));
    if (JSON.stringify(manifest) !== JSON.stringify(embedded))
      throw new Error(`${label}: standalone and embedded manifests differ.`);
    if (manifest.id !== "heroes-of-legend") throw new Error("Unexpected system ID.");
    artifacts.set(label, { files, manifest });
  }
  if (!artifacts.size) throw new Error("At least one artifact is required.");
  let base;
  const server = createServer((request, response) => {
    const match = /^\/([a-z][a-z0-9-]*)\/(system\.json|heroes-of-legend\.zip)$/.exec(request.url);
    const artifact = match && artifacts.get(match[1]);
    if (!artifact || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    const name = match[2];
    const bytes = name === "system.json" ? Buffer.from(JSON.stringify({
      ...artifact.manifest,
      manifest: `${base}/${match[1]}/system.json`,
      download: `${base}/${match[1]}/heroes-of-legend.zip`,
    }, null, 2) + "\n") : artifact.files.get(name).bytes;
    response.writeHead(200, {
      "Content-Type": name.endsWith("json") ? "application/json" : "application/zip",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", done);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    evidence: [...artifacts].map(([label, { files, manifest }]) => ({
      label, version: manifest.version,
      manifest: `${base}/${label}/system.json`,
      originalManifestSha256: files.get("system.json").hash,
      zipSha256: files.get("heroes-of-legend.zip").hash,
      zipBytes: files.get("heroes-of-legend.zip").bytes.length,
      publicUrlsTested: false,
    })),
    close: () => new Promise((done, reject) => server.close(error => error ? reject(error) : done())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directories = { candidate: resolve(process.argv[2] ?? "release-artifacts") };
  if (process.argv[3]) directories.baseline = resolve(process.argv[3]);
  const service = await serveReleaseCandidates(directories);
  console.info(JSON.stringify({ purpose: "Local native Setup acceptance; ZIP bytes unchanged", artifacts: service.evidence }, null, 2));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => service.close().then(() => process.exit(0)));
}

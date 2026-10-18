import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SourceTextModule } from "node:vm";

const sourceRoot = new URL("../src/", import.meta.url);

function findCycle(dependencies, label) {
  const states = new Map(),
    path = [],
    positions = new Map();

  function visit(identifier) {
    states.set(identifier, "visiting");
    positions.set(identifier, path.length);
    path.push(identifier);
    for (const dependency of dependencies.get(identifier) ?? []) {
      const state = states.get(dependency);
      if (state === "visiting")
        return [
          ...path.slice(positions.get(dependency)),
          dependency,
        ].map(label);
      if (!state) {
        const cycle = visit(dependency);
        if (cycle) return cycle;
      }
    }
    path.pop();
    positions.delete(identifier);
    states.set(identifier, "visited");
    return null;
  }

  for (const identifier of dependencies.keys()) {
    if (states.has(identifier)) continue;
    const cycle = visit(identifier);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Parse and link source modules without evaluating Foundry-dependent bodies.
 * Native linking checks every named import against the target module's exports.
 */
export async function validateModuleLinks(root = sourceRoot) {
  if (typeof SourceTextModule !== "function")
    throw new Error(
      "Module-link validation requires --experimental-vm-modules.",
    );
  const rootPath = fileURLToPath(root),
    label = (identifier) =>
      relative(rootPath, fileURLToPath(identifier)) || ".",
    resolveLocalModule = (specifier, parentIdentifier) => {
      const resolved = new URL(specifier, parentIdentifier);
      if (resolved.protocol !== "file:")
        throw new Error(
          `${label(parentIdentifier)} imports non-file module ${specifier}.`,
        );
      if (!resolved.href.startsWith(root.href))
        throw new Error(
          `${label(parentIdentifier)} imports outside the source root: ${specifier}.`,
        );
      return resolved.href;
    },
    identifiers = (await readdir(rootPath, {
      recursive: true,
      withFileTypes: true,
    }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
      .map((entry) => pathToFileURL(join(entry.parentPath, entry.name)).href)
      .sort(),
    modules = new Map(),
    dependencies = new Map();

  async function load(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    let source;
    try {
      source = await readFile(fileURLToPath(identifier), "utf8");
      const module = new SourceTextModule(source, { identifier });
      modules.set(identifier, module);
      dependencies.set(identifier, []);
      for (const request of module.moduleRequests) {
        const dependency = resolveLocalModule(
          request.specifier,
          identifier,
        );
        dependencies.get(identifier).push(dependency);
        await load(dependency);
      }
      return module;
    } catch (error) {
      throw new Error(
        `Source module parse failed at ${label(identifier)}: ${error.message}`,
        { cause: error },
      );
    }
  }

  for (const identifier of identifiers) await load(identifier);

  const cycle = findCycle(dependencies, label);
  if (cycle)
    throw new Error(`Local module import cycle: ${cycle.join(" -> ")}`);

  for (const [identifier, module] of modules) {
    if (module.status !== "unlinked") continue;
    try {
      await module.link(async (specifier, parent) => {
        const dependency = resolveLocalModule(specifier, parent.identifier),
          linked = modules.get(dependency);
        if (!linked)
          throw new Error(`Module was not parsed before linking: ${dependency}`);
        return linked;
      });
    } catch (error) {
      throw new Error(
        `ESM linkage failed for ${label(identifier)}: ${error.message}`,
        { cause: error },
      );
    }
  }

  return {
    modules: modules.size,
    dependencies:
      [...dependencies.values()].reduce(
        (count, entries) => count + entries.length,
        0,
      ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await validateModuleLinks();
  console.info(
    `Linked ${result.modules} source modules (${result.dependencies} local imports) with no missing named exports or cycles.`,
  );
}

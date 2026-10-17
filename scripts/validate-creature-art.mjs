import { pathToFileURL } from "node:url";
import {
  formatCreatureArtReport,
  validateCreatureArt,
} from "./creature-art.mjs";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = await validateCreatureArt(
    new URL("../static/", import.meta.url),
  );
  console.info(`Validated creature art: ${formatCreatureArtReport(report)}`);
}

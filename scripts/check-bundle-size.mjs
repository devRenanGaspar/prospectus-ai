import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assetsDirectory = path.resolve("dist/assets");
// LocationPicker's exception is gone: it imported country-state-city (a
// GPL-3.0 dependency with data for four countries the product only ever used
// one of) and produced an 8.76 MB chunk on its own, which is why the old
// budgets here were an 8.6 MB carve-out plus a 10.25 MB total that existed
// mostly to accommodate that one chunk. Replaced with a static
// Brazil-only dataset (src/data/br-locations.json, ~83 KB); the chunk is now
// ~129 KB, under the standard budget like everything else.
//
// Measured total after the change: 1.75 MB. totalJavaScript below leaves
// meaningful room for real growth (~70%) without being the kind of
// ratchet-to-current-bloat budget that can't catch a regression.
const budgets = {
  totalJavaScript: 3 * 1024 * 1024,
  standardChunk: 750 * 1024,
};

const files = await readdir(assetsDirectory);
const javascriptFiles = files.filter((file) => file.endsWith(".js"));

if (javascriptFiles.length === 0) {
  throw new Error("No JavaScript bundles found. Run `npm run build` first.");
}

const chunks = await Promise.all(
  javascriptFiles.map(async (file) => ({
    file,
    bytes: (await stat(path.join(assetsDirectory, file))).size,
  })),
);

const failures = [];
const totalBytes = chunks.reduce((total, chunk) => total + chunk.bytes, 0);

if (totalBytes > budgets.totalJavaScript) {
  failures.push(
    `total JavaScript is ${totalBytes} bytes (budget ${budgets.totalJavaScript})`,
  );
}

for (const chunk of chunks) {
  if (chunk.bytes > budgets.standardChunk) {
    failures.push(`${chunk.file} is ${chunk.bytes} bytes (budget ${budgets.standardChunk})`);
  }
}

if (failures.length > 0) {
  throw new Error(`Bundle budget exceeded:\n- ${failures.join("\n- ")}`);
}

const largest = [...chunks].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
console.log(
  JSON.stringify(
    {
      status: "ok",
      totalJavaScriptBytes: totalBytes,
      budgets,
      largestChunks: largest,
    },
    null,
    2,
  ),
);

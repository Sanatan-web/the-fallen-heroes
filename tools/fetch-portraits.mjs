#!/usr/bin/env node
/**
 * Downloads the portraits named in data/soldiers.json into assets/soldiers/ and writes
 * data/portraits.json, the manifest the map reads. Re-run it whenever the dataset changes.
 *
 *   node tools/fetch-portraits.mjs
 *
 * It never renames across soldiers: each file is saved as <soldier id>.<ext>. Records with an
 * empty image_source.url are skipped, and a URL that fails is reported and left to the browser,
 * which falls back to the record's own URL and then to a monogram.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { extname } from "node:path";

const root = new URL("..", import.meta.url);
const dataFile = new URL("data/soldiers.json", root);
const outDir = new URL("assets/soldiers/", root);
const manifestFile = new URL("data/portraits.json", root);

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif" };

const { soldiers = [] } = JSON.parse(await readFile(dataFile, "utf8"));
await mkdir(outDir, { recursive: true });

const manifest = {};
let skipped = 0;
for (const s of soldiers) {
  const url = s.image_source?.url?.trim();
  if (!url) {
    skipped += 1;
    continue;
  }
  try {
    const res = await fetch(url, { headers: { "user-agent": "the-fallen-heroes/1.0 (portrait fetch)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EXT[type] ?? extname(new URL(url).pathname) ?? ".jpg";
    const file = `${s.id}${ext}`;
    await writeFile(new URL(file, outDir), Buffer.from(await res.arrayBuffer()));
    manifest[s.id] = `assets/soldiers/${file}`;
    console.log(`saved ${file}  <-  ${url}`);
  } catch (err) {
    console.warn(`could not fetch portrait for ${s.id}: ${err.message}`);
  }
}
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${Object.keys(manifest).length} portrait(s) local, ${skipped} record(s) without an image URL.`);

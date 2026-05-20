// Generates region-sharded "object pins" data for the map's objects layer.
//
// There is no aggregated object list (the per-id files in data_osrs/locations
// total ~515 MB), so the objects pin layer fetches small region shards on
// demand. This script builds those shards, keeping only *interactable* objects
// (named + at least one real right-click action) to keep pin density and file
// size manageable.
//
// Output: static/data_osrs/object_pins/{sx}_{sy}.json
//   sx = chunkX >> SHARD_SHIFT, sy = chunkY >> SHARD_SHIFT
//   each record: { p, i, j, x, y, id, t, r, n }
//     p = plane, i/j = 64-unit chunk indices, x/y = 0..63 within chunk,
//     id = object id, t = type, r = rotation, n = name
//
// Run: bun scripts/generate-object-pins.ts
// Rerun whenever the underlying data_osrs object data is updated.

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { join } from "node:path"

// 16x16 chunks (1024 game units) per shard. Drop to 3 (8x8 / 512u) if any
// shard gets too large. Must stay in sync with leaflet.objectIcons.js.
const SHARD_SHIFT = 4
const BATCH_SIZE = 256

const DATA = join(import.meta.dir, "..", "static", "data_osrs")
const LOCATIONS = join(DATA, "locations")
const CONFIGS = join(DATA, "location_configs")
const OUT = join(DATA, "object_pins")

function isInteractable(cfg: any): boolean {
	if (!cfg || !cfg.name || !Array.isArray(cfg.actions)) return false
	return cfg.actions.some(
		(a: any) => a != null && a !== "hidden" && a !== "None" && String(a).trim() !== ""
	)
}

async function readJson(path: string): Promise<any | null> {
	try {
		return JSON.parse(await readFile(path, "utf8"))
	} catch {
		return null
	}
}

const start = performance.now()

await mkdir(OUT, { recursive: true })

const files = (await readdir(LOCATIONS)).filter((f) => f.endsWith(".json"))
console.log(`Scanning ${files.length} object location files...`)

// shardKey -> array of pre-serialized record strings (keeps memory lower than
// holding millions of objects, and avoids a second serialization pass)
const shards = new Map<string, string[]>()
let kept = 0
let instances = 0

for (let b = 0; b < files.length; b += BATCH_SIZE) {
	const batch = files.slice(b, b + BATCH_SIZE)
	await Promise.all(
		batch.map(async (file) => {
			const id = Number(file.slice(0, -5))
			const cfg = await readJson(join(CONFIGS, file))
			if (!isInteractable(cfg)) return

			const locations = await readJson(join(LOCATIONS, file))
			if (!Array.isArray(locations)) return

			kept++
			const name = cfg.name
			for (const it of locations) {
				const shardKey = `${it.i >> SHARD_SHIFT}_${it.j >> SHARD_SHIFT}`
				let arr = shards.get(shardKey)
				if (!arr) shards.set(shardKey, (arr = []))
				arr.push(
					JSON.stringify({
						p: it.plane,
						i: it.i,
						j: it.j,
						x: it.x,
						y: it.y,
						id: id,
						t: it.type,
						r: it.rotation,
						n: name
					})
				)
				instances++
			}
		})
	)
	if ((b / BATCH_SIZE) % 20 === 0) {
		console.log(`  ${Math.min(b + BATCH_SIZE, files.length)}/${files.length} files...`)
	}
}

console.log(`Kept ${kept} interactable object ids, ${instances} instances.`)
console.log(`Writing ${shards.size} shards to ${OUT} ...`)

let largest = { key: "", bytes: 0 }
for (const [key, recs] of shards) {
	const path = join(OUT, `${key}.json`)
	await writeFile(path, "[" + recs.join(",") + "]")
	const bytes = (await stat(path)).size
	if (bytes > largest.bytes) largest = { key, bytes }
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(2) + " MB"
console.log(
	`Done in ${((performance.now() - start) / 1000).toFixed(1)}s. ` +
		`${shards.size} files. Largest: ${largest.key}.json (${mb(largest.bytes)}).`
)
if (largest.bytes > 6 * 1024 * 1024) {
	console.warn(
		`WARNING: largest shard exceeds 6 MB. Consider SHARD_SHIFT=3 ` +
			`(here and in leaflet.objectIcons.js).`
	)
}

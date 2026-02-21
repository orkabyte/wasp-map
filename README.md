# WaspScripts Web Map

An interactive Old School RuneScape (OSRS) map built on Leaflet.js. Hosted at **[map.orkabase.com](https://map.orkabase.com/)**.

## Features

- **Location search** — search bar (top-left) with autocomplete. Select a result and the map flies there automatically, switching planes when needed — great for finding dungeons.
- **NPC search** — open the "NPC" panel (top-left), type a name or ID, and hit "Show on map" to highlight every spawn location with a heatmap. NPCs on other planes appear greyscaled.
- **Object search** — same idea via the "OBJ" panel. Shows all instances of a game object with sprite previews. Auto-zooms to fit when there are fewer than 50 results.
- **Click-to-copy coordinates** — click anywhere on the map to copy its `[x, y]` V2 coordinates to the clipboard. A confirmation toast appears at the top.
- **Live coordinate display** — hover the map to see real-time chunk and tile coordinates (top-right). Click either readout to open a "Go to" panel for direct navigation.
- **Area selection tools** — open the "MAP" panel (top-left) and choose between **Box** or **Polygon** mode:
  - **Box** — click "New", then click two corners. Drag corners or edges to resize. Drag the fill to move the whole box. Editable width/height/coordinate fields with copy buttons.
  - **Polygon** — click "New", place vertices by clicking, and close the shape by clicking the first vertex. Add new vertices on the fly by clicking any edge. Drag vertices to reshape, drag the fill to reposition. Tiles inside the polygon are highlighted (blue = fully inside, orange = border).
  - Both modes output coordinates in **Simba 1.4**, **Simba 2.0**, **Box**, and **tile array** formats. Click the coords textarea to copy instantly.
- **Rich marker popups** — click any NPC or object marker to see its name, image, V2 coordinates (with copy button), a direct Wiki link, a Simba 1.4 code template, and raw JSON data.
- **Shareable URLs** — zoom, plane, position, and active searches are encoded in the URL. Share a link like `?location=Varrock` and the recipient sees exactly what you see.
- **Multi-plane support** — switch between planes 0–3 with the plane control. All markers, coordinates, and overlays update accordingly.
- **Fullscreen mode** — toggle via the fullscreen button.

## Development

Install [bun](https://bun.sh/docs/installation) if you don't have it yet.

Clone the repo and set up the submodule, dependencies, and map tiles:

```bash
git submodule update --init --recursive
bun install
cd static/layers-osrs/
bun install
bun start
cd ../..
```

Then start the dev server:

```bash
bun dev
```

Visit http://localhost:3000/ and the map should be running.

## Hosting

Same steps as above. For production you may want to use:

```bash
bun install --production
NODE_ENV=production bun start
```

### Coolify

Settings for hosting on Coolify:

- **Build pack:** Nixpacks
- **Install command:** `bun install --production & cd static/layers-osrs & bun install`
- **Build command:** `echo hello world` (workaround for a Coolify bug)
- **Start command:** `bun static/layers-osrs/main.ts & NODE_ENV=production bun src/main.ts`
- **Port:** 3000

## Credits

Originally created by [mejrs](https://github.com/mejrs/mejrs.github.io) as part of the [RuneScape Wiki](https://runescape.wiki/) maps project. Forked and extended by [Torwent](https://github.com/Torwent/wasp-map) for [WaspScripts](https://waspscripts.com/). This fork adds further features and customizations by [Orka](https://github.com/orkabyte/wasp-map).

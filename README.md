# WaspScripts Web Map

An interactive Old School RuneScape (OSRS) map built on Leaflet.js. Hosted at **[map.orkabase.com](https://map.orkabase.com/)**.

## Features

### Navigation & Coordinates
- Pan, zoom, and switch between all 4 game planes (vertical levels)
- Live tile and chunk coordinates displayed on mouse movement — click anywhere to copy
- "Go to" panel for jumping directly to specific coordinates
- Fullscreen mode

### Search
- Search for named locations with autocomplete and fly-to navigation
- Search and highlight NPCs on the map with automatic zoom-to-fit
- Search and highlight game objects with sprite previews

### Markers & Data Layers
- NPC markers with plane-aware rendering (greyscaled when on a different plane)
- Game object markers with sprite images
- Teleport markers with route visualization — hover to see travel lines between start and destination
- Chunk/tile grid overlay
- Collision data heatmap
- Varbit-based conditional layers (quest/achievement states)

### Information Popups
- Detailed popups with NPC/object information
- Direct links to the RuneScape Wiki
- Simba 1.4 code templates for bot scripting
- Raw JSON data viewer
- One-click copy for all popup data

### Rectangle Tool
- Draw rectangular regions on the map
- Copy coordinates in Map 1400 and Map 2000 formats

### Shareable URLs
- Map state (zoom, plane, position, active layers) is encoded in the URL
- Navigate directly to a location with `?location=LocationName`

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

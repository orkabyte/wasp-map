# Simba Area Scaffolding Findings and Plan

## Scope

Review date: 2026-06-12.

## Implementation Update

Implemented in this repo:

- `static/js/plugins/leaflet.rect.js`: multi-area MAP state, labels, enabled toggles, colors, box/polygon selection, area list, filter metadata, active-area compatibility, aggregate `map._areaSelections`, Simba 2.0 scaffold output, and copyable JSON manifest output.
- `static/js/plugins/leaflet.objectIcons.js`: aggregate area selection support plus object name/id/action filter preview. Action preview lazily reads visible object configs.
- `static/js/layers.js`: removed dynamic icon layers now ignore late async data, preventing preview teardown errors.
- `static/css/plugins/leaflet.displays.css`: MAP panel scrolls inside the viewport and includes area/filter styling.

Follow-up: object action preview currently reads visible object configs lazily. A generated compact action index would reduce network chatter for large action-filtered areas.

Goal: extend the MAP/chunks workflow so users can draw multiple labeled areas, attach object/NPC filters to each area, and generate useful Simba 2.0 / wasplib scaffold code for those areas. The current repository is a web map; the local Simba install at `C:\Users\adria\AppData\Local\com.wasp-launcher.app\Simba` provides the target wasplib patterns and WaspMCP scaffold references.

## Current Map Architecture

- Backend is intentionally thin: `src/main.ts` serves `static/` through Hono/Bun. The feature should live in frontend plugins.
- The active MAP panel is `static/js/plugins/leaflet.rect.js`, mounted from `static/js/main/main.js`.
- `leaflet.rect.js` already supports one box or one polygon and emits coordinate formats:
  - `mapToGame` / `gameToMap` coordinate conversion at `static/js/plugins/leaflet.rect.js:19`.
  - polygon tile computation at `static/js/plugins/leaflet.rect.js:44`.
  - Simba 1.4 and Simba 2.0 output fields at `static/js/plugins/leaflet.rect.js:748` and `static/js/plugins/leaflet.rect.js:757`.
  - box export update at `static/js/plugins/leaflet.rect.js:1072`.
  - polygon export update at `static/js/plugins/leaflet.rect.js:1139`.
- The current area state is singular:
  - one `this.rect` at `static/js/plugins/leaflet.rect.js:706`.
  - one `this.poly` at `static/js/plugins/leaflet.rect.js:722`.
  - one tile highlight layer at `static/js/plugins/leaflet.rect.js:724`.
  - one `map._areaSelection` published at `static/js/plugins/leaflet.rect.js:1218`.
- Object pins already consume area selection:
  - `static/js/plugins/leaflet.objectIcons.js:58` listens for `areaselection`.
  - `static/js/plugins/leaflet.objectIcons.js:114` reads `map._areaSelection`.
  - `static/js/plugins/leaflet.objectIcons.js:276` filters pins through `selection.contains(lat, lng)`.
- Object/NPC search controls already have autocomplete data hooks:
  - shared autocomplete helper at `static/js/plugins/leaflet.displays.js:20` and `:181`.
  - object names from `data_osrs/object_name_collection.json`.
  - NPC names from `data_osrs/npc_name_collection.json`.
- There is no general scaffold-code generator in this repo. The closest existing generator is the MAP panel's copy fields. WaspMCP template generation lives outside this repo at `Simba\Plugins\wasp-plugins\waspmcp\server\src\templates.js`.

## Simba 2.0 / WaspLib Target Patterns

Relevant wasplib contracts from the local Simba install:

- Map chunk setup:
  - `Includes\WaspLib\utils\rschunks.simba:13` defines `Chunk(b: TBox; planes: TIntegerArray): TRSMapChunk`.
  - `Includes\WaspLib\utils\rschunks.simba:19` defines `Chunk(b: TBox; plane: Integer): TRSMapChunk`.
  - `Includes\WaspLib\osrs\position\map\map.simba:137` defines `TRSMap.Setup(chunks: TRSMapChunkArray; downscale: UInt32 = 8)`.
  - Existing script pattern: `Map.Setup([Chunk(Box(43,54,44,53), 0)]);`.
- Box-based setup/filtering:
  - `map.simba:119` defines `TRSMap.SetupEx(boxes: TBoxArray; planes: TIntegerArray = [0])`.
  - `map.simba:61` defines `TRSMap.AddGlobalFilter(regionIdx: Int32; filter: TBox; inside: Boolean)`.
  - `Lumbridge-Multi-Skiller.simba:1403` clears `Map.Filters`, then calls `Map.AddGlobalFilter(...)` by loaded region.
- Area declarations:
  - `Map-Zone-Debugger.simba` is good prior art. It stores zone points as `TPointArray`, supports rectangle/circle/polygon, and emits Simba declarations such as `var name: TBox = [...]` and `var name: TPolygon = [...]`.
- Object/NPC scaffolds:
  - `objects.simba:36` defines `TRSObject.Create(var walker: TRSWalker; size: TVector3; coordinates: TPointArray; uptext: TStringArray = [])`.
  - `objects.simba:113` defines `TRSObjectArray.Create(var walker: TRSWalker; json: TJSONArray)`.
  - `entities.simba:37` defines `TRSEntity.Create(var walker: TRSWalker; size: TVector3; radius: Integer; coordinates: TPointArray; uptext: TStringArray = []; dots: ERSDots = [])`.
  - `entities.simba:134` defines `TRSEntityArray.Create(var walker: TRSWalker; json: TJSONArray)`.
  - `mapjson.simba:110`, `:145`, `:177`, `:214` expose `GetByName`, `GetByID`, `GetByAction`, and `GetByAllActions`.
  - Globals `ObjectsJSON, NPCsJSON` are declared at `mapjson.simba:271`.
- WaspMCP generated scripts include:
  - `{$I WaspLib/osrs.simba}`.
  - `{$I WaspMCP/waspmcp.simba}`.
  - `WaspMCP.Setup(); WaspLibSetup();`.
  - walking template placeholder says to fill `Map.Setup(...)`.

## Proposed User-Facing Behavior

The MAP panel should become an area workspace:

- Draw multiple areas without losing prior ones.
- Each area has:
  - stable id.
  - editable label.
  - shape type: box or polygon.
  - plane.
  - style color.
  - enabled/disabled flag.
  - optional object filters.
  - optional NPC filters.
- A list shows all areas. Selecting one makes it editable and updates the existing coordinate fields.
- Existing single-area behavior remains available for simple use.
- Generated output includes:
  - existing Simba 1.4 and Simba 2.0 chunk setup for active area.
  - Simba 2.0 scaffold for all enabled areas.
  - optional JSON manifest for copy/paste or later persistence.

Object/NPC filters should initially be metadata plus preview filters, not an overconfident full bot script. The web map can know names, IDs, actions, and coordinates, but object size/uptext/action intent may still need human confirmation. Generated code should mark those points clearly.

## Data Model

Add a normalized area model in `leaflet.rect.js` first. If the file grows too much, move pure helpers to `static/js/plugins/leaflet.areaScaffold.js`.

Suggested shape:

```js
{
	id: "area-1",
	label: "Lumbridge cows",
	mode: "box", // "box" | "poly"
	plane: 0,
	color: "#00d4ff",
	enabled: true,
	latlngs: [...], // polygon vertices or box corners in Leaflet map coords
	bounds: L.LatLngBounds,
	globalBox: { x1, y1, x2, y2 },
	chunkBox: { x1, y1, x2, y2 },
	vertices: [[x, y], ...],
	tiles: [[x, y], ...],
	filters: {
		objects: [
			{ by: "name", value: "Oak tree" },
			{ by: "action", value: "Bank" }
		],
		npcs: [
			{ by: "name", value: "Cow" }
		]
	}
}
```

Selection event compatibility:

- Keep `map._areaSelection` as the active area for old consumers.
- Add `map._areaSelections = { areas, activeId, bounds, contains(lat, lng) }`.
- Fire `areaselection` with both `{ selection, selections }`.
- Update `leaflet.objectIcons.js` to prefer `map._areaSelections` and fall back to `map._areaSelection`.

## Generator Strategy

Add pure generator helpers that take normalized areas and return strings. Keep generation separate from drawing code, even if the functions live in the same plugin initially.

Primary Simba 2.0 output:

```pascal
// Generated from WaspScripts Web Map.
// Review object sizes/uptext before relying on object interactions.

var
  LumbridgeCowsChunk: TBox = [49, 52, 51, 50];
  LumbridgeCowsArea: TBox = [12800, 37520, 13060, 37380];
  LumbridgeCowsTiles: TPointArray = [[12800, 37520], [12804, 37520]];

procedure SetupGeneratedMap();
begin
  Map.Setup([
    Chunk(LumbridgeCowsChunk, 0)
  ]);
end;
```

For polygons:

```pascal
var
  WillowPatchChunk: TBox = [48, 53, 50, 51];
  WillowPatchPoly: TPolygon = [[12270, 37600], [12450, 37600], [12420, 37380]];
  WillowPatchTiles: TPointArray = [[12272, 37596], [12276, 37596]];
```

For filters:

```pascal
function GeneratedObjectsByName(objectName: String; area: TBox): TRSObjectArray;
var
  objects: TRSObjectArray;
  i, j: Int32;
  coords, rotations: TPointArray;
begin
  objects := TRSObjectArray.Create(Map.Walker, ObjectsJSON.GetByName(objectName));
  // Filter coordinates to `area` here before interacting.
  Result := objects;
end;
```

MVP can emit simpler usage examples first:

```pascal
var
  BankObjects: TRSObjectArray;
  CowEntities: TRSEntityArray;

BankObjects := TRSObjectArray.Create(Map.Walker, ObjectsJSON.GetByAction('Bank'));
CowEntities := TRSEntityArray.Create(Map.Walker, NPCsJSON.GetByName('Cow'));
```

Important generator rules:

- Use `Map.Setup([Chunk(Box(...), plane), ...]);` for chunk loading.
- Use a polygon's bounding chunk box for `Map.Setup`, then export polygon vertices/tiles separately for logic filters.
- Emit labels as sanitized Pascal identifiers.
- Preserve original label in comments.
- Prefer Simba 2.0 / wasplib syntax. Keep Simba 1.4 output as legacy field only.
- Include comments where generated data is incomplete, especially object size/uptext assumptions.

## Implementation Plan

### Phase 1: Extract and Normalize Area State

- Add helper functions in `leaflet.rect.js`:
  - `normalizeBoxArea(bounds, plane, label)`.
  - `normalizePolyArea(latlngs, plane, label)`.
  - `computeChunkBoxFromGlobalBox(...)`.
  - `sanitizePascalIdentifier(label)`.
- Add `this._areas = []` and `this._activeAreaId = null` to `L.Control.Display.Rect.onAdd`.
- Convert current single `rect`/`poly` operations into active-area operations.
- Preserve the existing coordinate fields by binding them to active area.

### Phase 2: Add Area List and Labels

- In `createInterface`, add:
  - area label input.
  - area list container.
  - add box / add polygon buttons or reuse mode buttons plus "New".
  - duplicate/delete controls.
  - enabled checkbox.
  - color swatch selector.
- Render labels on the map with `L.tooltip` or a small noninteractive marker tied to each area.
- Keep only the active area's handles visible if clutter becomes a problem; inactive areas can render as plain polygons/rectangles.

### Phase 3: Multi-Selection Event and Object Pins

- Publish both active and aggregate selection:
  - `map._areaSelection`: active area.
  - `map._areaSelections`: enabled area collection with union `contains`.
- Update `leaflet.objectIcons.js`:
  - read aggregate selection when present.
  - use aggregate bounds for chunk skipping.
  - apply area-level object filters before creating icons.
  - retain `maxVisible` cap.
- Add filter-aware marker metadata so a popup can show which area/filter matched.

### Phase 4: Object/NPC Filter UI

- Reuse `L.Control.Display.attachAutocomplete` for object/NPC name fields.
- Add filter rows per active area:
  - target: object or NPC.
  - match by: name, id, action.
  - value.
  - include/exclude toggle, if needed later.
- For objects, preview can reuse `L.objectIcons` shard records.
- For NPCs, add a new area-aware NPC preview layer or adapt the existing dynamic NPC layer. Do not overload the global NPC search panel.

### Phase 5: Simba 2.0 Scaffold Output

- Add a new read-only textarea in the MAP panel: "Simba 2.0 scaffold".
- Generate:
  - area declarations.
  - `SetupGeneratedMap`.
  - optional filter snippets for selected object/NPC rows.
  - comments for unresolved object size/uptext/action assumptions.
- Add copy button behavior consistent with existing coordinate fields.
- Add a compact JSON manifest textarea or download/copy button for future persistence/import.

### Phase 6: Optional WaspMCP Template Integration

This is outside the current repo unless explicitly brought in. If desired, edit:

- `C:\Users\adria\AppData\Local\com.wasp-launcher.app\Simba\Plugins\wasp-plugins\waspmcp\server\src\templates.js`

Possible approach:

- Add a context field such as `context.mapAreas`.
- Let WaspMCP walking/basic templates inject the generated `Map.Setup` and area declarations.
- Keep the web-map generator independent so users without WaspMCP can still copy code.

## Verification Plan

- Manual browser checks:
  - draw two boxes and one polygon.
  - rename each area.
  - switch active area and verify fields update.
  - collapse/expand MAP panel without losing areas.
  - toggle object pins and confirm they render inside all enabled areas.
  - confirm legacy single-selection output still works.
- Generator checks:
  - generated identifiers are valid for labels with spaces/symbols.
  - generated `Map.Setup` includes every enabled area.
  - polygon output includes both bounding chunk setup and polygon/tile data.
  - object/NPC filters emit comments where data is incomplete.
- Add focused tests if helpers move into a pure JS module:
  - coordinate conversion snapshots.
  - chunk-box generation.
  - Pascal identifier sanitization.
  - scaffold output snapshots.

## Risks and Decisions

- Polygon areas cannot be loaded directly by `Map.Setup`; wasplib loads chunks/boxes. Use bounding chunks for map loading and emit polygon/tile arrays for precise logic.
- `Map.AddGlobalFilter` accepts `TBox`, so it is useful for rectangular map-localization filters but not exact polygon filters.
- Object size and uptext are not fully inferable from the web map. Generate `TRSObjectArray.Create(... ObjectsJSON.GetBy...)` or explicit coordinate scaffolds with review comments.
- Multiple areas can create many markers. Keep the existing cap and aggregate bounds pruning.
- URL persistence of many areas may exceed practical URL length. Prefer copyable JSON manifest first; add import/export later.
- `leaflet.rect.js` is already large. If implementation grows beyond a narrow patch, split model/generator helpers into a separate module.

## Recommended First Cut

Start with a small but useful slice:

1. Add multiple labeled box areas only.
2. Generate all-area Simba 2.0 `Map.Setup([Chunk(Box(...), plane), ...]);`.
3. Keep active-area legacy fields unchanged.
4. Update object pins to support aggregate selection without filters.
5. Add object/NPC filter metadata and scaffold output after multi-area state is stable.

This avoids mixing drawing-state refactor, filter semantics, and code generation into one risky change.

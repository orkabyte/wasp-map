"use strict"

import "../leaflet.js"
import "../layers.js"
import "./leaflet.objects.js"
import "./leaflet.popup-builder.js"

export default void (function (factory) {
	var L
	if (typeof define === "function" && define.amd) {
		define(["leaflet"], factory)
	} else if (typeof module !== "undefined") {
		L = require("leaflet")
		module.exports = factory(L)
	} else {
		if (typeof window.L === "undefined") {
			throw new Error("Leaflet must be loaded first")
		}
		factory(window.L)
	}
})(function (L) {
	// Number of chunk-index bits folded into one region shard. Must match
	// SHARD_SHIFT in scripts/generate-object-pins.ts (16x16 chunks = 1024 units).
	var SHARD_SHIFT = 4

	// On-demand object pin layer. Reuses L.DynamicIcons' visible-tile machinery,
	// but only renders pins that fall inside the active area selection (the rect
	// tool's box/poly). Region shards (data_osrs/object_pins/{sx}_{sy}.json) are
	// fetched on demand for the visible chunks that overlap the selection, and
	// each pin is the same teardrop the OBJ search uses. With no selection the
	// layer renders nothing (the painted tiles still show the whole area).
	L.ObjectIcons = L.DynamicIcons.extend({
		options: {
			folder: "data_osrs",
			shardPath: "data_osrs/object_pins",
			// Only render pins for the current plane (matches the per-plane painted
			// tiles and avoids stacking up to 4x the markers). Plane changes are
			// handled by _onPlaneChange below.
			show3d: false,
			// Don't recreate markers mid zoom-animation; redraw once it settles.
			updateWhenZooming: false,
			// Keep less off-screen margin so fewer markers linger while panning.
			keepBuffer: 1,
			// Safety cap: never render more than this many pins at once (a huge
			// selection zoomed out could otherwise flood the DOM).
			maxVisible: 4000
		},

		onAdd: function (map) {
			this._map = map
			this._icon_data = {}
			this._icons = {}
			this._shardCache = {}
			this._shardPromises = {}
			this._abortControllers = {}
			this._cappedWarned = false
			map.on("planechange", this._onPlaneChange, this)
			map.on("areaselection", this._onSelectionChange, this)
			this._resetView()
			this._update()
		},

		onRemove: function (map) {
			map.off("planechange", this._onPlaneChange, this)
			map.off("areaselection", this._onSelectionChange, this)
			for (var key in this._abortControllers) {
				try {
					this._abortControllers[key].abort()
				} catch (e) {
					// ignore
				}
			}
			this._abortControllers = {}
			this._shardPromises = {}
			this._shardCache = {}
			this._icon_data = {}
			L.DynamicIcons.prototype.onRemove.call(this, map)
		},

		// With show3d:false the tile cache key includes the plane, so switching
		// planes means a different set of keys. Drop the current markers and
		// redraw for the new plane (shard data for all planes is already cached).
		_onPlaneChange: function () {
			this._removeAllIcons()
			this._update()
		},

		// Re-render when the area selection changes (drawn, dragged, resized,
		// mode-switched) or is cleared (rect card collapsed).
		_onSelectionChange: function () {
			this._cappedWarned = false
			this._removeAllIcons()
			this._update()
		},

		// Mirrors L.DynamicIcons._update, but only loads/draws inside the active
		// area selection: tiles outside the selection bounds are skipped, and
		// _addIcons filters each pin against the selection shape. With no
		// selection the layer renders nothing.
		_update: function (center) {
			var map = this._map
			if (!map) {
				return
			}
			var zoom = this.options.nativeZoom

			if (center === undefined) {
				center = map.getCenter()
			}
			if (this._tileZoom === undefined) {
				return
			} // if out of minzoom/maxzoom

			var sel = map._areaSelection
			if (!sel) {
				this._removeAllIcons()
				return
			}

			var pixelBounds = this._getTiledPixelBounds(center),
				tileRange = this._pxBoundsToTileRange(pixelBounds),
				margin = this.options.keepBuffer,
				noPruneRange = new L.Bounds(
					tileRange.getBottomLeft().subtract([margin, -margin]),
					tileRange.getTopRight().add([margin, -margin])
				)

			// Sanity check: panic if the tile range contains Infinity somewhere.
			if (
				!(
					isFinite(tileRange.min.x) &&
					isFinite(tileRange.min.y) &&
					isFinite(tileRange.max.x) &&
					isFinite(tileRange.max.y)
				)
			) {
				throw new Error("Attempted to load an infinite number of tiles")
			}

			for (var key in this._icons) {
				var c = this._icons[key].coords
				if (c.z !== this._tileZoom || !noPruneRange.contains(new L.Point(c.x, c.y))) {
					this._icons[key].current = false
					this._removeIcons(key)
				}
			}

			// If the tile zoom level differs too much from the map's, let
			// _setView reset levels and prune old tiles.
			if (Math.abs(zoom - this._tileZoom) > 1) {
				this._setView(center, zoom)
				return
			}

			for (var j = tileRange.min.y; j <= tileRange.max.y; j++) {
				for (var i = tileRange.min.x; i <= tileRange.max.x; i++) {
					var coords = new L.Point(i, j)
					coords.z = this._tileZoom
					coords.plane = this._map.getPlane()

					if (!this._isValidTile(coords)) {
						continue
					}

					// Skip chunks that don't overlap the selection's bounding box.
					var chunkI = coords.x
					var chunkJ = -coords.y
					var chunkBounds = L.latLngBounds(
						[chunkJ << 6, chunkI << 6],
						[(chunkJ + 1) << 6, (chunkI + 1) << 6]
					)
					if (!sel.bounds.intersects(chunkBounds)) {
						continue
					}

					var dataKey = this._tileCoordsToKey(coords)

					if (this._icons[dataKey]) {
						// already drawn
						this._icons[dataKey].current = true
					} else if (dataKey in this._icon_data) {
						// shard already fetched & bucketed -> draw now
						this._addIcons(coords)
					} else {
						// not loaded yet -> fetch the region shard on demand
						this._ensureShardForCoords(coords)
					}
				}
			}
		},

		// Fetch (once) the region shard covering this tile's chunk, bucket its
		// records into _icon_data, then re-run _update to draw them.
		_ensureShardForCoords: function (coords) {
			var chunkI = coords.x
			var chunkJ = -coords.y
			var shardKey = (chunkI >> SHARD_SHIFT) + "_" + (chunkJ >> SHARD_SHIFT)

			if (this._shardCache[shardKey] || this._shardPromises[shardKey]) {
				return
			}

			var self = this
			var controller = new AbortController()
			this._abortControllers[shardKey] = controller

			this._shardPromises[shardKey] = fetch(this.options.shardPath + "/" + shardKey + ".json", {
				signal: controller.signal
			})
				.then(function (res) {
					return res.ok ? res.json() : []
				})
				.then(function (records) {
					self._bucketShard(records)
					self._shardCache[shardKey] = true
					delete self._shardPromises[shardKey]
					delete self._abortControllers[shardKey]
					if (self._map) {
						self._update()
					}
				})
				.catch(function (err) {
					delete self._shardPromises[shardKey]
					delete self._abortControllers[shardKey]
					if (err && err.name !== "AbortError") {
						console.error(err)
					}
				})
		},

		_bucketShard: function (records) {
			records.forEach((rec) => {
				var key = this._tileCoordsToKey({ plane: rec.p, x: rec.i, y: -rec.j })
				if (!(key in this._icon_data)) {
					this._icon_data[key] = []
				}
				this._icon_data[key].push(rec)
			})
		},

		_totalIcons: function () {
			var n = 0
			for (var key in this._icons) {
				n += this._icons[key].icons.length
			}
			return n
		},

		// Only create markers for pins inside the active selection shape, up to
		// the maxVisible cap.
		_addIcons: function (coords) {
			var key = this._tileCoordsToKey(coords)
			var data = this._icon_data[key]
			var sel = this._map._areaSelection
			var icons = []

			if (data && sel) {
				var total = this._totalIcons()
				for (var n = 0; n < data.length; n++) {
					if (total + icons.length >= this.options.maxVisible) {
						if (!this._cappedWarned) {
							this._cappedWarned = true
							if (this._map.addMessage) {
								this._map.addMessage(
									"Too many objects in view; showing the first " +
										this.options.maxVisible +
										". Zoom in or shrink the selection."
								)
							}
						}
						break
					}
					var rec = data[n]
					var lat = (rec.j << 6) + rec.y + 0.5
					var lng = (rec.i << 6) + rec.x + 0.5
					if (sel.contains(lat, lng)) {
						var icon = this.createIcon(rec)
						this._map.addLayer(icon)
						icons.push(icon)
					}
				}
			}

			this._icons[key] = { icons: icons, coords: coords, current: true }
		},

		// Builds the same teardrop marker + lazy object popup as the OBJ search
		// (leaflet.objects.js), from a compact shard record {p,i,j,x,y,id,t,r,n}.
		createIcon: function (rec) {
			let item = {
				plane: rec.p,
				i: rec.i,
				j: rec.j,
				x: rec.x,
				y: rec.y,
				id: rec.id,
				type: rec.t,
				rotation: rec.r,
				name: rec.n
			}

			let { icon } = L.MarkerIcon.createPair()

			let marker = L.marker([(item.j << 6) + item.y + 0.5, (item.i << 6) + item.x + 0.5], {
				icon: icon
			})

			L.MarkerIcon.bindSelection(marker)

			let placeholder = document.createElement("div")
			placeholder.textContent = "Loading..."
			marker.bindPopup(placeholder, {
				autoPan: true,
				autoPanPadding: L.point(40, 40)
			})

			marker.once("popupopen", async () => {
				let location_config = await fetch(
					`${this.options.folder}/location_configs/${item.id}.json`
				).then((res) => res.json())

				let globalX = (item.i << 6) + item.x
				let globalY = (item.j << 6) + item.y

				let rawData = {
					plane: item.plane,
					x: globalX,
					y: globalY,
					id: item.id,
					type: item.type,
					rotation: item.rotation
				}
				for (const [key, value] of Object.entries(location_config)) {
					if (key !== "name") rawData[key] = value
				}

				let imgContainer = document.createElement("div")
				imgContainer.setAttribute("class", "object-image-container")
				L.Objects.OSRS.prototype.createModelTab
					.call(this, item, location_config)
					.then((img) => imgContainer.appendChild(img))

				let popup = L.PopupBuilder.createPopup(
					"object",
					{
						name: location_config.name || item.name,
						globalX: globalX,
						globalY: globalY,
						plane: item.plane,
						imgContainer: imgContainer,
						rawData: rawData
					},
					this._map
				)

				marker.getPopup().setContent(popup)
				marker.getPopup().update()
			})

			return marker
		}
	})

	L.objectIcons = function (options) {
		return new L.ObjectIcons(options)
	}
})

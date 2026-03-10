import "../leaflet.js"

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
	// V1 walker coords (waspweb.graph) -> leaflet
	function walkerToLatLng(wx, wy) {
		return L.latLng((16448 - wy) / 4 + 0.5, (wx + 4608) / 4 + 0.5)
	}

	// V2 global coords (Chunk2Coordinate system) -> leaflet
	function v2GlobalToLatLng(gx, gy) {
		return L.latLng((50428 - gy) / 4, (gx + 4096) / 4)
	}

	var _graphCache = {}

	function fetchGraph(url) {
		if (_graphCache[url] === undefined) {
			_graphCache[url] = fetch(url).then(function (r) {
				if (!r.ok) return null
				return r.json()
			})
		}
		return _graphCache[url]
	}

	// Get the visible RS-chunk keys for the current map bounds
	function getVisibleChunks(bounds) {
		var sw = bounds.getSouthWest()
		var ne = bounds.getNorthEast()

		// leaflet lat = rsY, lng = rsX; chunk = rsCoord >> 6 (÷ 64)
		var minCX = Math.floor(sw.lng / 64)
		var maxCX = Math.floor(ne.lng / 64)
		var minCY = Math.floor(sw.lat / 64)
		var maxCY = Math.floor(ne.lat / 64)

		// Clamp to valid chunk range
		minCX = Math.max(minCX, 15)
		maxCX = Math.min(maxCX, 65)
		minCY = Math.max(minCY, 19)
		maxCY = Math.min(maxCY, 196)

		var chunks = []
		for (var cx = minCX; cx <= maxCX; cx++) {
			for (var cy = minCY; cy <= maxCY; cy++) {
				chunks.push(cx + "-" + cy)
			}
		}
		return chunks
	}

	L.WaspWebGraph = L.LayerGroup.extend({
		options: {
			dataPath: "data_osrs/waspweb-graph.json",
			v2GraphPath: "data_osrs/graphs",
			maxLoadedChunks: 30
		},

		initialize: function (options) {
			L.setOptions(this, options)
			L.LayerGroup.prototype.initialize.call(this)
			this._built = false
			this._renderer = L.canvas({ padding: 0.5 })
			this._edgeLayer = null
			this._nodeLayer = null
			this._namedLayer = null

			// V2 chunk state
			this._v2Index = null
			this._v2Chunks = {} // key -> { layer, data }
			this._v2LoadOrder = [] // LRU tracking
			this._v2Plane = 0
			this._v2Loading = {} // key -> promise
			this._v2Container = L.featureGroup()
		},

		onAdd: function (map) {
			L.LayerGroup.prototype.onAdd.call(this, map)
			this._map = map
			this._v2Plane = map._plane || 0

			if (!this._built) {
				fetchGraph(this.options.dataPath).then(
					function (data) {
						this._buildLayers(data)
						this._built = true
						this._updateVisibility()
					}.bind(this)
				)
			} else {
				this._updateVisibility()
			}

			// Load V2 index
			this._loadV2Index()

			map.on("zoomend", this._updateVisibility, this)
			map.on("moveend", this._updateV2Chunks, this)
			map.on("planechange", this._onPlaneChange, this)
		},

		onRemove: function (map) {
			map.off("zoomend", this._updateVisibility, this)
			map.off("moveend", this._updateV2Chunks, this)
			map.off("planechange", this._onPlaneChange, this)
			L.LayerGroup.prototype.onRemove.call(this, map)
		},

		_loadV2Index: function () {
			var self = this
			fetchGraph(this.options.v2GraphPath + "/index.json").then(function (data) {
				if (data) {
					self._v2Index = data
					self._updateV2Chunks()
				}
			})
		},

		_onPlaneChange: function (e) {
			this._v2Plane = e.plane
			// Clear all loaded V2 chunks and reload for new plane
			this._clearV2Chunks()
			this._updateV2Chunks()
		},

		_clearV2Chunks: function () {
			for (var key in this._v2Chunks) {
				if (this._v2Chunks[key].layer) {
					this._v2Container.removeLayer(this._v2Chunks[key].layer)
				}
			}
			this._v2Chunks = {}
			this._v2LoadOrder = []
			this._v2Loading = {}
		},

		_updateV2Chunks: function () {
			if (!this._v2Index || !this._map) return
			var zoom = this._map.getZoom()
			if (zoom < 2) {
				// Remove V2 container at low zoom
				if (this.hasLayer(this._v2Container)) {
					this.removeLayer(this._v2Container)
				}
				return
			}

			// Ensure V2 container is on map
			if (!this.hasLayer(this._v2Container)) {
				this.addLayer(this._v2Container)
			}

			var bounds = this._map.getBounds()
			var visibleKeys = getVisibleChunks(bounds)
			var planeStr = String(this._v2Plane)
			var available = this._v2Index.chunks[planeStr] || []
			var availableSet = {}
			for (var a = 0; a < available.length; a++) {
				availableSet[available[a]] = true
			}

			// Load visible chunks that exist in the index
			var self = this
			for (var i = 0; i < visibleKeys.length; i++) {
				var key = visibleKeys[i]
				if (!availableSet[key]) continue
				if (this._v2Chunks[key] || this._v2Loading[key]) continue
				this._loadV2Chunk(key, planeStr)
			}

			// Evict chunks that are far from the viewport
			this._evictDistantChunks(visibleKeys)
		},

		_loadV2Chunk: function (key, planeStr) {
			var url = this.options.v2GraphPath + "/" + planeStr + "/" + key + ".json"
			var self = this
			this._v2Loading[key] = fetchGraph(url).then(function (data) {
				delete self._v2Loading[key]
				if (!data || !data.nodes || data.nodes.length === 0) return
				if (!self._map) return

				var layer = self._buildV2ChunkLayer(data)
				self._v2Chunks[key] = { layer: layer, data: data }
				self._v2LoadOrder.push(key)
				self._v2Container.addLayer(layer)
			})
		},

		_buildV2ChunkLayer: function (data) {
			var group = L.featureGroup()
			var nodes = data.nodes
			var edges = data.edges

			// Draw edges
			if (edges && edges.length > 0) {
				var edgeSegments = new Array(edges.length)
				for (var j = 0; j < edges.length; j++) {
					var a = edges[j][0]
					var b = edges[j][1]
					edgeSegments[j] = [
						v2GlobalToLatLng(nodes[a][0], nodes[a][1]),
						v2GlobalToLatLng(nodes[b][0], nodes[b][1])
					]
				}
				L.polyline(edgeSegments, {
					color: "#22cc66",
					weight: 1,
					opacity: 0.4,
					interactive: false,
					renderer: this._renderer
				}).addTo(group)
			}

			// Draw nodes
			for (var k = 0; k < nodes.length; k++) {
				var latlng = v2GlobalToLatLng(nodes[k][0], nodes[k][1])
				L.circleMarker(latlng, {
					radius: 2,
					color: "#22cc66",
					fillColor: "#22cc66",
					fillOpacity: 0.7,
					opacity: 0.7,
					weight: 0,
					interactive: false,
					renderer: this._renderer
				}).addTo(group)
			}

			// Draw door markers
			if (data.doors) {
				for (var d = 0; d < data.doors.length; d++) {
					var dlatlng = v2GlobalToLatLng(data.doors[d][0], data.doors[d][1])
					L.circleMarker(dlatlng, {
						radius: 3,
						color: "#ff4444",
						fillColor: "#ff4444",
						fillOpacity: 0.8,
						opacity: 0.8,
						weight: 0,
						interactive: false,
						renderer: this._renderer
					}).addTo(group)
				}
			}

			return group
		},

		_evictDistantChunks: function (visibleKeys) {
			var visibleSet = {}
			for (var v = 0; v < visibleKeys.length; v++) {
				visibleSet[visibleKeys[v]] = true
			}

			// Keep chunks that are visible, evict the oldest non-visible ones
			var maxChunks = this.options.maxLoadedChunks
			var keepOrder = []
			var evictList = []

			for (var i = 0; i < this._v2LoadOrder.length; i++) {
				var key = this._v2LoadOrder[i]
				if (visibleSet[key]) {
					keepOrder.push(key)
				} else if (keepOrder.length + (this._v2LoadOrder.length - i) > maxChunks) {
					evictList.push(key)
				} else {
					keepOrder.push(key)
				}
			}

			for (var e = 0; e < evictList.length; e++) {
				var evictKey = evictList[e]
				if (this._v2Chunks[evictKey]) {
					if (this._v2Chunks[evictKey].layer) {
						this._v2Container.removeLayer(this._v2Chunks[evictKey].layer)
					}
					delete this._v2Chunks[evictKey]
				}
			}

			this._v2LoadOrder = keepOrder
		},

		_buildLayers: function (data) {
			var nodes = data.nodes
			var edges = data.edges
			var namedLocations = data.namedLocations

			// Pre-compute all node LatLngs
			var nodeLatLngs = new Array(nodes.length)
			for (var i = 0; i < nodes.length; i++) {
				nodeLatLngs[i] = walkerToLatLng(nodes[i][0], nodes[i][1])
			}

			// Edges: single multi-segment polyline
			var edgeSegments = new Array(edges.length)
			for (var j = 0; j < edges.length; j++) {
				edgeSegments[j] = [nodeLatLngs[edges[j][0]], nodeLatLngs[edges[j][1]]]
			}
			this._edgeLayer = L.polyline(edgeSegments, {
				color: "#4488ff",
				weight: 1.5,
				opacity: 0.5,
				interactive: false,
				renderer: this._renderer
			})

			// Nodes: circleMarkers in a featureGroup
			this._nodeLayer = L.featureGroup()
			for (var k = 0; k < nodeLatLngs.length; k++) {
				L.circleMarker(nodeLatLngs[k], {
					radius: 2,
					color: "#4488ff",
					fillColor: "#4488ff",
					fillOpacity: 0.7,
					opacity: 0.7,
					weight: 0,
					interactive: false,
					renderer: this._renderer
				}).addTo(this._nodeLayer)
			}

			// Named locations: circleMarkers with tooltips and click-to-copy
			this._namedLayer = L.featureGroup()
			var map = this._map
			var names = Object.keys(namedLocations)
			for (var n = 0; n < names.length; n++) {
				var name = names[n]
				var coords = namedLocations[name]
				var latlng = walkerToLatLng(coords[0], coords[1])
				var marker = L.circleMarker(latlng, {
					radius: 5,
					color: "#ffaa00",
					fillColor: "#ffaa00",
					fillOpacity: 0.9,
					opacity: 0.9,
					weight: 0,
					interactive: true,
					renderer: this._renderer
				})
				marker.bindTooltip(name)
				;(function (wx, wy) {
					marker.on("click", function () {
						var copystr = "[" + wx + ", " + wy + "]"
						navigator.clipboard.writeText(copystr).then(
							function () {
								map.addMessage("Copied to clipboard: " + copystr)
							},
							function () {
								console.error("Cannot copy text to clipboard")
							}
						)
					})
				})(coords[0], coords[1])
				marker.addTo(this._namedLayer)
			}
		},

		_updateVisibility: function () {
			if (!this._built || !this._map) return
			var zoom = this._map.getZoom()

			// Named locations: visible at zoom >= -2
			if (zoom >= -2) {
				if (!this.hasLayer(this._namedLayer)) this.addLayer(this._namedLayer)
			} else {
				if (this.hasLayer(this._namedLayer)) this.removeLayer(this._namedLayer)
			}

			// Edges: visible at zoom >= 0
			if (zoom >= 0) {
				if (!this.hasLayer(this._edgeLayer)) this.addLayer(this._edgeLayer)
			} else {
				if (this.hasLayer(this._edgeLayer)) this.removeLayer(this._edgeLayer)
			}

			// V1 Nodes: visible at zoom >= 2
			if (zoom >= 2) {
				if (!this.hasLayer(this._nodeLayer)) this.addLayer(this._nodeLayer)
			} else {
				if (this.hasLayer(this._nodeLayer)) this.removeLayer(this._nodeLayer)
			}

			// V2 chunks: managed by _updateV2Chunks
			this._updateV2Chunks()
		}
	})

	L.waspWebGraph = function (options) {
		return new L.WaspWebGraph(options)
	}
})

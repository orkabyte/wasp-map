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
	function walkerToLatLng(wx, wy) {
		return L.latLng((16448 - wy) / 4 + 0.5, (wx + 4608) / 4 + 0.5)
	}

	var _graphCache = {}

	function fetchGraph(url) {
		if (!_graphCache[url]) {
			_graphCache[url] = fetch(url).then(function (r) {
				return r.json()
			})
		}
		return _graphCache[url]
	}

	L.WaspWebGraph = L.LayerGroup.extend({
		options: {
			dataPath: "data_osrs/waspweb-graph.json"
		},

		initialize: function (options) {
			L.setOptions(this, options)
			L.LayerGroup.prototype.initialize.call(this)
			this._built = false
			this._renderer = L.canvas({ padding: 0.5 })
			this._edgeLayer = null
			this._nodeLayer = null
			this._namedLayer = null
		},

		onAdd: function (map) {
			L.LayerGroup.prototype.onAdd.call(this, map)
			this._map = map

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

			map.on("zoomend", this._updateVisibility, this)
		},

		onRemove: function (map) {
			map.off("zoomend", this._updateVisibility, this)
			L.LayerGroup.prototype.onRemove.call(this, map)
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

			// Nodes: visible at zoom >= 2
			if (zoom >= 2) {
				if (!this.hasLayer(this._nodeLayer)) this.addLayer(this._nodeLayer)
			} else {
				if (this.hasLayer(this._nodeLayer)) this.removeLayer(this._nodeLayer)
			}
		}
	})

	L.waspWebGraph = function (options) {
		return new L.WaspWebGraph(options)
	}
})

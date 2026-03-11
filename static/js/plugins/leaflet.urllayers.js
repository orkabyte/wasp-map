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
	L.Control.LayerToggles = L.Control.extend({
		options: {
			position: "bottomright"
		},

		initialize: function (overlays, options) {
			L.Util.setOptions(this, options)
			this._overlays = overlays
			this._buttons = []
		},

		onAdd: function (map) {
			var container = L.DomUtil.create("div", "leaflet-bar leaflet-control-layer-toggles")
			L.DomEvent.disableClickPropagation(container)
			L.DomEvent.disableScrollPropagation(container)

			var url = new URL(window.location.href)
			var initLayers = url.searchParams.getAll("layer")

			for (var i = 0; i < this._overlays.length; i++) {
				var overlay = this._overlays[i]
				var btn = this._createToggleButton(container, overlay, map)

				if (initLayers.includes(overlay.name)) {
					overlay.layer.addTo(map)
				}

				this._buttons.push({ btn: btn, overlay: overlay })
			}

			// decorative layers icon at bottom
			var deco = L.DomUtil.create("a", "layer-toggles-decoration", container)
			deco.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>'
			deco.title = "Layers"
			deco.href = "#"
			L.DomEvent.on(deco, "click", L.DomEvent.preventDefault)

			return container
		},

		_createToggleButton: function (container, overlay, map) {
			var btn = L.DomUtil.create("a", "", container)
			btn.innerHTML = overlay.icon
			btn.title = overlay.name
			btn.href = "#"

			var self = this

			L.DomEvent.on(btn, "click", function (e) {
				L.DomEvent.preventDefault(e)
				if (map.hasLayer(overlay.layer)) {
					map.removeLayer(overlay.layer)
				} else {
					overlay.layer.addTo(map)
				}
			})

			map.on("layeradd layerremove", function (e) {
				if (e.layer === overlay.layer) {
					if (map.hasLayer(overlay.layer)) {
						L.DomUtil.addClass(btn, "layer-active")
						self._addSearchParam(overlay.name)
					} else {
						L.DomUtil.removeClass(btn, "layer-active")
						self._removeSearchParam(overlay.name)
					}
				}
			})

			return btn
		},

		_addSearchParam: function (layerName) {
			var url = new URL(window.location.href)
			var params = url.searchParams
			params.append("layer", layerName)
			url.search = params
			history.replaceState(0, "Location", url)
		},

		_removeSearchParam: function (layerName) {
			var url = new URL(window.location.href)
			var params = url.searchParams
			var otherLayers = params.getAll("layer").filter(function (l) {
				return l !== layerName
			})

			params.delete("layer")
			for (var i = 0; i < otherLayers.length; i++) {
				params.append("layer", otherLayers[i])
			}
			url.search = params
			history.replaceState(0, "Location", url)
		}
	})

	L.control.layerToggles = function (overlays, options) {
		return new L.Control.LayerToggles(overlays, options)
	}
})

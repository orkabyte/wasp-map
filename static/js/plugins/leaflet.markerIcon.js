"use strict"

import "../leaflet.js"
;(function (factory) {
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
	L.MarkerIcon = {
		_svg:
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">' +
			'<path fill-rule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 7 10 18 10 18s10-11 10-18C20 4.477 15.523 0 10 0zM14 10a4 4 0 1 0-8 0 4 4 0 1 0 8 0z" fill="#00e5ff"/>' +
			"</svg>",

		createPair: function (extraClass) {
			var cls = "marker-location" + (extraClass ? " " + extraClass : "")
			var html =
				'<div class="marker-location-icon">' +
				this._svg +
				"</div>" +
				'<div class="marker-location-pulse"></div>'

			var icon = L.divIcon({
				className: cls,
				html: html,
				iconSize: [20, 28],
				iconAnchor: [10, 28],
				popupAnchor: [0, -30],
				tooltipAnchor: [12, -20]
			})

			var greyscaleIcon = L.divIcon({
				className: cls + " marker-location-greyscale",
				html: html,
				iconSize: [20, 28],
				iconAnchor: [10, 28],
				popupAnchor: [0, -30],
				tooltipAnchor: [12, -20]
			})

			return { icon: icon, greyscaleIcon: greyscaleIcon }
		},

		bindSelection: function (marker) {
			marker.on("popupopen", function () {
				var el = marker.getElement()
				if (el) L.DomUtil.addClass(el, "marker-selected")
			})
			marker.on("popupclose", function () {
				var el = marker.getElement()
				if (el) L.DomUtil.removeClass(el, "marker-selected")
			})
		}
	}
})

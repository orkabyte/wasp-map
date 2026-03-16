"use strict"

import "../leaflet.js"
import "../layers.js"
import "../plugins/leaflet.fullscreen.js"
import "../plugins/leaflet.mapSelector.js"
import "../plugins/leaflet.zoom.js"
import "../plugins/leaflet.plane.js"
import "../plugins/leaflet.position.js"
import "../plugins/leaflet.displays.js"
import "../plugins/leaflet.urllayers.js"
import "../plugins/leaflet.rect.js"
import "../plugins/leaflet.clickcopy.js"
import "../plugins/leaflet.graph.js"
import "../plugins/leaflet.maplabels.js"
import "../plugins/leaflet.locationSearch.js"

void (function (global) {
	let runescape_map = (global.runescape_map = L.gameMap("map", {
		maxBounds: [
			[-1000, -1000],
			[12800 + 1000, 12800 + 1000]
		],
		maxBoundsViscosity: 0.5,
		customZoomControl: true,
		fullscreenControl: false,
		planeControl: true,
		messageBox: true,
		initialMapId: -1,
		plane: 0,
		x: 3200,
		y: 3200,
		minPlane: 0,
		maxPlane: 3,
		minZoom: -4,
		maxZoom: 8,
		doubleClickZoom: false,
		showMapBorder: true,
		enableUrlLocation: true,
		attributionControl: false
	}))

	L.control.display
		.npcs({
			folder: "data_osrs",
			show3d: true
		})
		.addTo(runescape_map)

	L.control.display
		.objects({
			folder: "data_osrs",
			show3d: true,
			displayLayer: L.objects.osrs
		})
		.addTo(runescape_map)

	let rectControl = L.control.display.rect()
	rectControl.addTo(runescape_map)
	rectControl.map1400.addEventListener("click", () => {
		rectControl.map1400.select()
		navigator.clipboard.writeText(rectControl.map1400.value).then(
			() => runescape_map.addMessage(`Copied to clipboard: ${rectControl.map1400.value}`),
			() => console.error("Cannot copy text to clipboard")
		)
	})
	rectControl.map2000.addEventListener("click", () => {
		rectControl.map2000.select()
		navigator.clipboard.writeText(rectControl.map2000.value).then(
			() => runescape_map.addMessage(`Copied to clipboard: ${rectControl.map2000.value}`),
			() => console.error("Cannot copy text to clipboard")
		)
	})

	L.control.locationSearch().addTo(runescape_map)

	L.control.position().addTo(runescape_map)
	L.control.fullscreen().addTo(runescape_map)

	L.Control.Credits = L.Control.extend({
		options: { position: "bottomleft" },
		onAdd: function () {
			let container = L.DomUtil.create("div", "leaflet-control-credits")
			container.innerHTML = "Credits to Torwent"
			L.DomEvent.disableClickPropagation(container)
			return container
		}
	})
	L.control.credits = function (opts) {
		return new L.Control.Credits(opts)
	}
	L.control.credits().addTo(runescape_map)

	L.tileLayer
		.main("layers-osrs/map/{zoom}/{plane}/{x}-{y}.png", {
			minZoom: -4,
			maxNativeZoom: 4,
			maxZoom: 8
		})
		.addTo(runescape_map)
		.bringToBack()

	let objects = L.tileLayer.main("layers-osrs/locations/{zoom}/{plane}_{x}_{y}.png", {
		minZoom: -4,
		maxNativeZoom: 2,
		maxZoom: 8
	})

	let grid = L.grid({
		bounds: [
			[0, 0],
			[12800, 6400]
		]
	})

	let npcs = L.dynamicIcons({
		dataPath: "data_osrs/NPCList_OSRS.json",
		minZoom: -3
	})

	let graph = L.waspWebGraph({ dataPath: "data_osrs/waspweb-graph.json" })

	L.control
		.layerToggles([
			{
				name: "objects",
				layer: objects,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1L2 5v8l7 4 7-4V5z"/><path d="M2 5l7 4m0 0l7-4M9 9v8"/></svg>'
			},
			{
				name: "npcs",
				layer: npcs,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="3"/><path d="M3 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>'
			},
			{
				name: "grid",
				layer: grid,
				default: true,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="1" x2="6" y2="17"/><line x1="12" y1="1" x2="12" y2="17"/><line x1="1" y1="6" x2="17" y2="6"/><line x1="1" y1="12" x2="17" y2="12"/></svg>'
			},
			{
				name: "WaspWeb Graph",
				layer: graph,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="14" y2="4"/><line x1="14" y1="4" x2="9" y2="14"/><line x1="9" y1="14" x2="4" y2="4"/><circle cx="4" cy="4" r="2" fill="currentColor"/><circle cx="14" cy="4" r="2" fill="currentColor"/><circle cx="9" cy="14" r="2" fill="currentColor"/></svg>'
			}
		])
		.addTo(runescape_map)
})(this || window)

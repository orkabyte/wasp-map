"use strict"

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
	let copySvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
	let checkSvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

	function rawDataText(rawData) {
		let asText = (i) => (typeof i !== "string" ? JSON.stringify(i) : i)
		return Object.entries(rawData)
			.map(([key, value]) => key + " = " + asText(value))
			.join("\n")
	}

	function createCoordsInput(container, value, map) {
		let row = document.createElement("div")
		row.className = "popup-builder-coords-row"

		let input = document.createElement("input")
		input.className = "popup-builder-coords-input"
		input.type = "text"
		input.readOnly = true
		input.value = value

		let btn = document.createElement("button")
		btn.className = "popup-builder-coords-copy-btn"
		btn.setAttribute("type", "button")
		btn.innerHTML = copySvg

		L.DomEvent.on(btn, "click", function (e) {
			L.DomEvent.stopPropagation(e)
			navigator.clipboard.writeText(input.value).then(function () {
				btn.innerHTML = checkSvg
				if (map && map.addMessage) {
					map.addMessage("Coordinates copied to clipboard")
				}
				setTimeout(function () {
					btn.innerHTML = copySvg
				}, 1500)
			})
		})

		row.appendChild(input)
		row.appendChild(btn)
		container.appendChild(row)
	}

	L.PopupBuilder = {
		toV2: function (globalX, globalY, plane) {
			let v2x = globalX * 4 - 4096 + 13056 * plane
			let v2y = 50430 - globalY * 4
			return { v2x, v2y }
		},

		wikiUrl: function (name) {
			return "https://oldschool.runescape.wiki/w/" + encodeURIComponent(name)
		},

		objectSimbaTemplate: function (name, v2x, v2y) {
			return (
				"{$I WaspLib/osr.simba}\n" +
				"\n" +
				"var\n" +
				"  obj: TRSObjectV2;\n" +
				"\n" +
				"begin\n" +
				"  RSClient.RemoteInput.EnableRealInput;\n" +
				"  Map.SetupChunk(ERSChunk.VARROCK);\n" +
				"  Options.SetZoomLevel(30);\n" +
				"  obj.SetupEx([1.5, 1.5, 7], [[" +
				v2x +
				", " +
				v2y +
				"]]);\n" +
				"  obj.SetupUpText('" +
				name +
				"');\n" +
				"  obj.Find;\n" +
				"end;"
			)
		},

		npcSimbaTemplate: function (name, v2x, v2y) {
			let varName = name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "_")
				.replace(/^_|_$/g, "")
			return (
				"{$DEFINE SRL_USE_REMOTEINPUT}\n" +
				"{$I SRL-T/osr.simba}\n" +
				"\n" +
				"var\n" +
				"  " +
				varName +
				": TRSNPCV2;\n" +
				"\n" +
				"begin\n" +
				"  Map.SetupChunk(Chunk([48,49,48,49], 0));\n" +
				"  " +
				varName +
				".SetupEx([100], [1,1,7], [[" +
				v2x +
				", " +
				v2y +
				"]]);\n" +
				"  " +
				varName +
				".Find;\n" +
				"end;"
			)
		},

		createPopup: function (type, params, map) {
			let container = document.createElement("div")
			container.className = "popup-builder"

			// Header: bold name only
			let header = document.createElement("div")
			header.className = "popup-builder-header"
			let nameEl = document.createElement("strong")
			nameEl.textContent = params.name || "Unknown"
			header.appendChild(nameEl)
			container.appendChild(header)

			// Image container (objects only, caller passes element)
			if (params.imgContainer) {
				container.appendChild(params.imgContainer)
			}

			// V2 Coordinates input
			let v2x, v2y
			if (params.globalX !== undefined && params.globalY !== undefined) {
				let coords = this.toV2(params.globalX, params.globalY, params.plane || 0)
				v2x = coords.v2x
				v2y = coords.v2y
				createCoordsInput(container, "[" + v2x + ", " + v2y + "]", map)
			}

			// Side panel (shared by simba and raw)
			let sidePanel = document.createElement("div")
			sidePanel.className = "popup-builder-side-panel"

			let sidePanelContent = document.createElement("pre")
			sidePanelContent.className = "popup-builder-side-panel-content"
			sidePanel.appendChild(sidePanelContent)

			let sidePanelCopyBtn = document.createElement("button")
			sidePanelCopyBtn.className = "popup-builder-side-panel-copy-btn"
			sidePanelCopyBtn.setAttribute("type", "button")
			sidePanelCopyBtn.innerHTML = copySvg + " Copy"
			sidePanel.appendChild(sidePanelCopyBtn)

			let activePanel = null

			function togglePanel(panelName, text) {
				if (activePanel === panelName) {
					sidePanel.classList.remove("popup-builder-side-panel-visible")
					activePanel = null
					return null
				}
				sidePanelContent.textContent = text
				sidePanel.classList.add("popup-builder-side-panel-visible")
				activePanel = panelName
				return panelName
			}

			L.DomEvent.on(sidePanelCopyBtn, "click", function (e) {
				L.DomEvent.stopPropagation(e)
				navigator.clipboard.writeText(sidePanelContent.textContent).then(function () {
					sidePanelCopyBtn.innerHTML = checkSvg + " Copied!"
					if (map && map.addMessage) {
						map.addMessage("Copied to clipboard")
					}
					setTimeout(function () {
						sidePanelCopyBtn.innerHTML = copySvg + " Copy"
					}, 1500)
				})
			})

			// Toolbar
			let toolbar = document.createElement("div")
			toolbar.className = "popup-builder-toolbar"

			let hasSimba = type === "object" || type === "npc"
			let simbaText =
				hasSimba && v2x !== undefined
					? type === "object"
						? this.objectSimbaTemplate(params.name || "Unknown", v2x, v2y)
						: this.npcSimbaTemplate(params.name || "Unknown", v2x, v2y)
					: null
			let rawText = params.rawData ? rawDataText(params.rawData) : null

			// WIKI button
			if (params.name) {
				let wikiBtn = document.createElement("button")
				wikiBtn.className = "popup-builder-toolbar-btn"
				wikiBtn.setAttribute("type", "button")
				wikiBtn.textContent = "WIKI"
				wikiBtn.dataset.panel = "wiki"
				let wikiUrl = this.wikiUrl(params.name)
				L.DomEvent.on(wikiBtn, "click", function (e) {
					L.DomEvent.stopPropagation(e)
					window.open(wikiUrl, "_blank")
				})
				toolbar.appendChild(wikiBtn)
			}

			// SIMBA 1.4 button (npc/object only)
			let simbaBtn = null
			if (hasSimba && simbaText) {
				simbaBtn = document.createElement("button")
				simbaBtn.className = "popup-builder-toolbar-btn"
				simbaBtn.setAttribute("type", "button")
				simbaBtn.textContent = "SIMBA 1.4"
				simbaBtn.dataset.panel = "simba"
				toolbar.appendChild(simbaBtn)
			}

			// RAW button
			let rawBtn = null
			if (rawText) {
				rawBtn = document.createElement("button")
				rawBtn.className = "popup-builder-toolbar-btn"
				rawBtn.setAttribute("type", "button")
				rawBtn.textContent = "RAW"
				rawBtn.dataset.panel = "raw"
				toolbar.appendChild(rawBtn)
			}

			// Toggle behavior for simba/raw buttons
			function updateActiveStyles() {
				if (simbaBtn) {
					simbaBtn.classList.toggle("popup-builder-toolbar-btn-active", activePanel === "simba")
				}
				if (rawBtn) {
					rawBtn.classList.toggle("popup-builder-toolbar-btn-active", activePanel === "raw")
				}
			}

			if (simbaBtn) {
				L.DomEvent.on(simbaBtn, "click", function (e) {
					L.DomEvent.stopPropagation(e)
					togglePanel("simba", simbaText)
					updateActiveStyles()
				})
			}

			if (rawBtn) {
				L.DomEvent.on(rawBtn, "click", function (e) {
					L.DomEvent.stopPropagation(e)
					togglePanel("raw", rawText)
					updateActiveStyles()
				})
			}

			container.appendChild(toolbar)
			container.appendChild(sidePanel)

			return container
		}
	}
})

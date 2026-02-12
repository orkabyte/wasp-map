import "../leaflet.js"
import "./leaflet.objects.js"

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
	var _nameCollectionCache = {}

	function fetchNameCollection(url) {
		if (!_nameCollectionCache[url]) {
			_nameCollectionCache[url] = fetch(url)
				.then(function (r) {
					return r.json()
				})
				.then(function (data) {
					return Object.keys(data).sort(function (a, b) {
						return a.localeCompare(b, undefined, { sensitivity: "base" })
					})
				})
		}
		return _nameCollectionCache[url]
	}

	L.Control.Display = L.Control.extend({
		statics: {
			_instances: []
		},

		onAdd: function (map) {
			L.Control.Display._instances.push(this)
			this._map = map
			this._container = L.DomUtil.create("div", "leaflet-control-layers leaflet-control-display")

			this.collapsed = this.createIcon(this.options.label)
			L.DomEvent.on(
				this.collapsed,
				{
					click: this.toggle
				},
				this
			)
			this._container.appendChild(this.collapsed)
			this._container.title = this.options.title
			L.DomEvent.disableClickPropagation(this._container)
			L.DomEvent.disableScrollPropagation(this._container)

			let expandedContent = this.createInterface()
			let expandedContentContainer = L.DomUtil.create(
				"div",
				"leaflet-control-display-container-expanded"
			)
			expandedContentContainer.appendChild(expandedContent)

			let titleEl = L.DomUtil.create("div", "leaflet-control-display-title")
			titleEl.textContent = this.options.title

			this.expanded = L.DomUtil.create("div", "leaflet-control-display-panel")
			this.expanded.appendChild(titleEl)
			this.expanded.appendChild(expandedContentContainer)
			this.expanded.style.display = "none"
			this._container.appendChild(this.expanded)

			return this._container
		},

		_expanded: false,

		// @method toggle(): this
		// Toggle the control panel open/closed.
		toggle: function () {
			if (this._expanded) {
				this.collapse()
			} else {
				this.expand()
			}
			return this
		},

		// @method expand(): this
		// Expand the control container if collapsed.
		expand: function () {
			L.Control.Display._instances.forEach(function (ctrl) {
				if (ctrl !== this && ctrl._expanded) {
					ctrl.collapse()
				}
			}, this)
			this.expanded.style.display = ""
			L.DomUtil.addClass(this.collapsed, "leaflet-control-display-collapsed-active")
			this._expanded = true

			var firstInstance = L.Control.Display._instances[0]
			if (firstInstance && firstInstance._container && firstInstance !== this) {
				var offset =
					this._container.getBoundingClientRect().left -
					firstInstance._container.getBoundingClientRect().left
				this.expanded.style.left = -offset + "px"
			} else {
				this.expanded.style.left = "0"
			}

			return this
		},

		// @method collapse(): this
		// Collapse the control container.
		collapse: function () {
			this.expanded.style.display = "none"
			L.DomUtil.removeClass(this.collapsed, "leaflet-control-display-collapsed-active")
			this._expanded = false
			return this
		},

		expanded: undefined,

		// @method createInterface
		// Reimplement .createInterface to set content for the expanded interface;
		// return a HTML Element
		createInterface: function () {
			return L.DomUtil.create("div")
		},

		collapsed: undefined,

		createIcon: function (label) {
			let container = L.DomUtil.create("div", "leaflet-control-display-collapsed")
			let span = L.DomUtil.create("span", "leaflet-control-display-label-icon", container)
			if (this.options.icon) {
				span.innerHTML = this.options.icon
			} else {
				span.textContent = label
			}
			return container
		},

		onRemove: function (map) {
			var idx = L.Control.Display._instances.indexOf(this)
			if (idx !== -1) {
				L.Control.Display._instances.splice(idx, 1)
			}
		},

		setSearchParams: function (parameters) {
			let url = new URL(window.location.href)
			let params = url.searchParams

			for (let [key, value] of Object.entries(parameters)) {
				if (value || value === 0) {
					params.set(key, value)
				} else {
					params.delete(key)
				}
			}
			url.search = params
			history.replaceState(0, "Location", url)
		},

		attachAutocomplete: function (inputElement, dataUrl, onEnterSelect) {
			var wrapper = L.DomUtil.create("div", "leaflet-control-display-autocomplete-wrapper")
			inputElement.parentNode.insertBefore(wrapper, inputElement)
			wrapper.appendChild(inputElement)

			var dropdown = L.DomUtil.create(
				"div",
				"leaflet-control-display-autocomplete-dropdown",
				wrapper
			)
			var activeIndex = -1
			var currentItems = []
			var debounceTimer = null
			var namesPromise = fetchNameCollection(dataUrl)

			function setActive(index) {
				for (var i = 0; i < currentItems.length; i++) {
					L.DomUtil.removeClass(currentItems[i], "active")
				}
				activeIndex = index
				if (activeIndex >= 0 && activeIndex < currentItems.length) {
					L.DomUtil.addClass(currentItems[activeIndex], "active")
					currentItems[activeIndex].scrollIntoView({ block: "nearest" })
				}
			}

			function selectItem(name) {
				inputElement.value = name
				hideDropdown()
			}

			function hideDropdown() {
				L.DomUtil.removeClass(dropdown, "visible")
				activeIndex = -1
			}

			function showDropdown() {
				if (currentItems.length > 0) {
					L.DomUtil.addClass(dropdown, "visible")
				}
			}

			function updateResults(query) {
				namesPromise.then(function (names) {
					dropdown.innerHTML = ""
					currentItems = []
					activeIndex = -1

					if (!query) {
						hideDropdown()
						return
					}

					var lower = query.toLowerCase()
					var prefix = []
					var substring = []

					for (var i = 0; i < names.length; i++) {
						var nameLower = names[i].toLowerCase()
						if (nameLower.indexOf(lower) === 0) {
							prefix.push(names[i])
						} else if (nameLower.indexOf(lower) > 0) {
							substring.push(names[i])
						}
					}

					var results = prefix.concat(substring).slice(0, 50)

					if (results.length === 0) {
						hideDropdown()
						return
					}

					for (var j = 0; j < results.length; j++) {
						var item = L.DomUtil.create(
							"div",
							"leaflet-control-display-autocomplete-item",
							dropdown
						)
						item.textContent = results[j]
						item.setAttribute("data-name", results[j])
						;(function (name) {
							L.DomEvent.on(item, "mousedown", function (e) {
								e.preventDefault()
							})
							L.DomEvent.on(item, "click", function () {
								selectItem(name)
							})
						})(results[j])
						currentItems.push(item)
					}

					showDropdown()
				})
			}

			L.DomEvent.on(inputElement, "input", function () {
				if (debounceTimer) clearTimeout(debounceTimer)
				debounceTimer = setTimeout(function () {
					updateResults(inputElement.value.trim())
				}, 150)
			})

			L.DomEvent.on(inputElement, "keydown", function (e) {
				if (e.key === "ArrowDown") {
					if (!L.DomUtil.hasClass(dropdown, "visible")) return
					e.preventDefault()
					setActive(Math.min(activeIndex + 1, currentItems.length - 1))
				} else if (e.key === "ArrowUp") {
					if (!L.DomUtil.hasClass(dropdown, "visible")) return
					e.preventDefault()
					setActive(Math.max(activeIndex - 1, 0))
				} else if (e.key === "Escape") {
					hideDropdown()
				} else if (e.key === "Enter") {
					e.preventDefault()
					if (L.DomUtil.hasClass(dropdown, "visible") && currentItems.length > 0) {
						var pick = activeIndex >= 0 ? activeIndex : 0
						selectItem(currentItems[pick].getAttribute("data-name"))
						if (onEnterSelect) onEnterSelect()
					} else {
						if (debounceTimer) clearTimeout(debounceTimer)
						var query = inputElement.value.trim()
						if (!query) return
						updateResults(query)
						namesPromise.then(function () {
							if (currentItems.length > 0) {
								selectItem(currentItems[0].getAttribute("data-name"))
								if (onEnterSelect) onEnterSelect()
							}
						})
					}
				}
			})

			L.DomEvent.on(inputElement, "blur", function () {
				hideDropdown()
			})

			L.DomEvent.on(inputElement, "focus", function () {
				if (inputElement.value.trim()) {
					showDropdown()
				}
			})

			L.DomEvent.disableClickPropagation(dropdown)
			L.DomEvent.disableScrollPropagation(dropdown)
		}
	})

	L.control.display = function (options) {
		return new L.Control.Display(options)
	}

	L.Control.Display.Objects = L.Control.Display.extend({
		options: {
			expand: true,
			position: "topleft",
			title: "Display objects",
			label: "OBJ",
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1L2 5v8l7 4 7-4V5z"/><path d="M2 5l7 4m0 0l7-4M9 9v8"/></svg>'
		},

		onAdd: function (map) {
			return L.Control.Display.prototype.onAdd.call(this, map)
		},
		createInterface: function () {
			let parsedUrl = new URL(window.location.href)
			let objectName = parsedUrl.searchParams.get("object") || ""
			let objectId = parsedUrl.searchParams.get("objectid")

			let container = L.DomUtil.create("div", "leaflet-control-display-expanded")

			let objectForm = L.DomUtil.create(
				"form",
				"leaflet-control-display-form leaflet-control-display-form-search",
				container
			)

			let nameDescription = L.DomUtil.create("label", "leaflet-control-display-label", objectForm)
			nameDescription.innerHTML = "Name"
			let nameInput = L.DomUtil.create("input", "leaflet-control-display-input", objectForm)
			nameInput.setAttribute("name", "name")
			nameInput.setAttribute("value", objectName)
			nameInput.setAttribute("autocomplete", "off")

			this.attachAutocomplete(
				nameInput,
				this.options.folder + "/object_name_collection.json",
				function () {
					objectForm.requestSubmit()
				}
			)

			let idDescription = L.DomUtil.create("label", "leaflet-control-display-label", objectForm)
			idDescription.innerHTML = "Id"
			let idInput = L.DomUtil.create("input", "leaflet-control-display-input", objectForm)
			idInput.setAttribute("name", "id")
			idInput.setAttribute("type", "number")
			idInput.setAttribute("value", objectId)
			idInput.setAttribute("autocomplete", "off")

			let spacerLabel = L.DomUtil.create("label", "leaflet-control-display-label", objectForm)
			spacerLabel.innerHTML = "&nbsp;"
			spacerLabel.style.visibility = "hidden"
			let spacerInput = L.DomUtil.create("div", "leaflet-control-display-input", objectForm)
			spacerInput.style.visibility = "hidden"

			let submitButton = L.DomUtil.create("input", "leaflet-control-display-submit", objectForm)
			submitButton.setAttribute("type", "submit")
			submitButton.setAttribute("value", "Show on map")

			objectForm.addEventListener("submit", (e) => {
				// on form submission, prevent default
				e.preventDefault()

				let formData = new FormData(objectForm)
				this.submitData(formData)
			})

			//Instantiate lookup if urlparam data is present
			if (objectName || objectId) {
				let formData = new FormData(objectForm)
				this.submitData(formData)
			}

			return container
		},

		submitData: function (formData) {
			let name = formData.get("name").trim()
			let id = formData.get("id").trim()
				? Number.parseInt(formData.get("id").trim(), 10)
				: undefined
			let names = name && id === undefined ? [name] : []
			let ids = Number.isInteger(id) ? [id] : []

			this.invokeObjectmap(names, ids)
		},

		_objectmap: undefined,

		invokeObjectmap: function (names, ids) {
			if (this._objectmap) {
				this._objectmap.remove()
			}

			this.setSearchParams({
				object: names[0],
				objectid: ids[0]
			})

			if (names[0] || ids[0] || ids[0] === 0) {
				this._objectmap = this.options
					.displayLayer({
						names: names,
						ids: ids,
						folder: this.options.folder
					})
					.addTo(this._map)
			}
		}
	})

	L.control.display.objects = function (options) {
		return new L.Control.Display.Objects(options)
	}

	L.Control.Display.NPCs = L.Control.Display.extend({
		options: {
			expand: true,
			position: "topleft",
			title: "Display NPCs",
			label: "NPC",
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="3"/><path d="M3 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>'
		},
		onAdd: function (map) {
			return L.Control.Display.prototype.onAdd.call(this, map)
		},

		createInterface: function () {
			let parsedUrl = new URL(window.location.href)
			let npcName = parsedUrl.searchParams.get("npc") || ""
			let npcId = parsedUrl.searchParams.get("npcid")
			let range = Number(parsedUrl.searchParams.get("range")) || 0
			if (isNaN(range) || range < 0) {
				throw new Error(parsedUrl.searchParams.get("range") + " is invalid")
			}

			let container = L.DomUtil.create("div", "leaflet-control-display-expanded")

			let npcForm = L.DomUtil.create(
				"form",
				"leaflet-control-display-form leaflet-control-display-form-search",
				container
			)

			let nameDescription = L.DomUtil.create("label", "leaflet-control-display-label", npcForm)
			nameDescription.innerHTML = "Name"
			let nameInput = L.DomUtil.create("input", "leaflet-control-display-input", npcForm)
			nameInput.setAttribute("name", "name")
			nameInput.setAttribute("value", npcName)
			nameInput.setAttribute("autocomplete", "off")

			this.attachAutocomplete(
				nameInput,
				this.options.folder + "/npc_name_collection.json",
				function () {
					npcForm.requestSubmit()
				}
			)

			let idDescription = L.DomUtil.create("label", "leaflet-control-display-label", npcForm)
			idDescription.innerHTML = "Id"
			let idInput = L.DomUtil.create("input", "leaflet-control-display-input", npcForm)
			idInput.setAttribute("name", "id")
			idInput.setAttribute("type", "number")
			idInput.setAttribute("value", npcId)
			idInput.setAttribute("autocomplete", "off")

			let rangeDescription = L.DomUtil.create("label", "leaflet-control-display-label", npcForm)
			rangeDescription.innerHTML = "Wander range"
			let rangeInput = L.DomUtil.create("input", "leaflet-control-display-input", npcForm)
			rangeInput.setAttribute("name", "range")
			rangeInput.setAttribute("type", "number")
			rangeInput.setAttribute("value", range ?? "7")

			let submitButton = L.DomUtil.create("input", "leaflet-control-display-submit", npcForm)
			submitButton.setAttribute("type", "submit")
			submitButton.setAttribute("value", "Show on map")

			npcForm.addEventListener("submit", (e) => {
				// on form submission, prevent default
				e.preventDefault()

				let formData = new FormData(npcForm)
				this.submitData(formData)
			})

			//Instantiate lookup if urlparam data is present
			if (npcName || npcId) {
				let formData = new FormData(npcForm)
				this.submitData(formData)
			}

			return container
		},

		submitData: function (formData) {
			let name = formData.get("name").trim()

			let id = formData.get("id").trim()
				? Number.parseInt(formData.get("id").trim(), 10)
				: undefined
			let range = Number.parseInt(formData.get("range").trim()) || 0
			let showHeat = range || false
			let names = name && id === undefined ? [name] : []
			let ids = Number.isInteger(id) ? [id] : []

			this.invokeHeatmap(names, ids, showHeat, range)
		},

		_heatmap: undefined,

		invokeHeatmap: function (names, ids, showHeat, range) {
			if (this._heatmap) {
				this._heatmap.remove()
			}
			this.setSearchParams({
				npc: names[0],
				npcid: ids[0],
				range: range || undefined
			})

			if (names[0] || ids[0] || ids[0] === 0) {
				this._heatmap = L.heatmap({
					npcs: names,
					ids: ids,
					showHeat: showHeat,
					range: range,
					folder: this.options.folder
				}).addTo(this._map)
			}
		}
	})

	L.control.display.npcs = function (options) {
		return new L.Control.Display.NPCs(options)
	}

	L.Control.Display.Items = L.Control.Display.extend({
		options: {
			position: "bottomleft",
			title: "Display objects",
			label: "ITM"
		},

		onAdd: function (map) {
			return L.Control.Display.prototype.onAdd.call(this, map)
		}
	})

	L.control.display.items = function (options) {
		return new L.Control.Display.Items(options)
	}

	L.Control.Display.OSRSVarbits = L.Control.Display.extend({
		options: {
			position: "bottomleft",
			title: "Display varbits",
			label: "MAP"
		},

		onAdd: function (map) {
			return L.Control.Display.prototype.onAdd.call(this, map)
		},
		createInterface: function () {
			let parsedUrl = new URL(window.location.href)
			let varp = parsedUrl.searchParams.get("varp")
			let varbit = parsedUrl.searchParams.get("varbit")
			let varvalue = parsedUrl.searchParams.get("varvalue")

			let container = L.DomUtil.create("div", "leaflet-control-display-expanded")

			let varForm = L.DomUtil.create("form", "leaflet-control-display-form", container)

			let varpDescription = L.DomUtil.create("label", "leaflet-control-display-label", varForm)
			varpDescription.innerHTML = "varp"
			let varpInput = L.DomUtil.create("input", "leaflet-control-display-input", varForm)
			varpInput.setAttribute("name", "varp")
			varpInput.setAttribute("type", "number")
			varpInput.setAttribute("value", varp)
			varpInput.setAttribute("autocomplete", "off")

			let varbitDescription = L.DomUtil.create("label", "leaflet-control-display-label", varForm)
			varbitDescription.innerHTML = "varbit"
			let varbitInput = L.DomUtil.create("input", "leaflet-control-display-input", varForm)
			varbitInput.setAttribute("name", "varbit")
			varbitInput.setAttribute("type", "number")
			varbitInput.setAttribute("value", varbit)
			varbitInput.setAttribute("autocomplete", "off")

			let varvalueDescription = L.DomUtil.create("label", "leaflet-control-display-label", varForm)
			varvalueDescription.innerHTML = "value"
			let varvalueInput = L.DomUtil.create("input", "leaflet-control-display-input", varForm)
			varvalueInput.setAttribute("name", "varvalue")
			varvalueInput.setAttribute("type", "number")
			varvalueInput.setAttribute("value", varvalue)
			varvalueInput.setAttribute("autocomplete", "off")

			let submitButton = L.DomUtil.create("input", "leaflet-control-display-submit", varForm)
			submitButton.setAttribute("type", "submit")
			submitButton.setAttribute("value", "Show on map")

			varForm.addEventListener("submit", (e) => {
				// on form submission, prevent default
				e.preventDefault()

				let formData = new FormData(varForm)
				this.submitData(formData)
			})

			//Instantiate lookup if urlparam data is present
			if (varp || varbit) {
				let formData = new FormData(varForm)
				this.submitData(formData)
			}

			return container
		},

		submitData: function (formData) {
			let varp = formData.get("varp")
			let varbit = formData.get("varbit")
			let varvalue = formData.get("varvalue")
			this.invokeVarbitmap(varp, varbit, varvalue)
		},

		_varbitmap: undefined,

		invokeVarbitmap: function (varp, varbit, varvalue) {
			if (this._varbitmap) {
				this._varbitmap.remove()
			}

			this.setSearchParams({
				varp: varp,
				varbit: varbit,
				varvalue: varvalue
			})

			if (varp != undefined && varbit != undefined) {
				this._varbitmap = L.varbit({
					varp: varp,
					varbit: varbit,
					varvalue: varvalue
				}).addTo(this._map)
			}
		}
	})

	L.control.display.OSRSvarbits = function (options) {
		return new L.Control.Display.OSRSVarbits(options)
	}

	//Just a link for now, may update it to work without redirect
	L.Control.Display.Pathfinder = L.Control.Display.extend({
		options: {
			position: "bottomleft",
			title: "Visit Pathfinder",
			label: "PATH"
		},
		onAdd: function (map) {
			let container = L.Control.Display.prototype.onAdd.call(this, map)
			container.onclick = () => (window.location.href = "https://mejrs.github.io/Pathfinder")
			return container
		}
	})

	L.control.display.pathfinder = function (options) {
		return new L.Control.Display.Pathfinder(options)
	}
})

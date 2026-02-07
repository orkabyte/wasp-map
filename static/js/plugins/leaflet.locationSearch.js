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
	var _locationCache = null

	function fetchLocations(url) {
		if (!_locationCache) {
			_locationCache = fetch(url)
				.then(function (r) {
					return r.json()
				})
				.then(function (data) {
					return data.sort(function (a, b) {
						return a.name.localeCompare(b.name, undefined, {
							sensitivity: "base"
						})
					})
				})
		}
		return _locationCache
	}

	L.Control.LocationSearch = L.Control.extend({
		options: {
			position: "topleft",
			placeholder: "Search location...",
			dataUrl: "data_osrs/location_names.json",
			flyZoom: 3,
			flyDuration: 3,
			markerTimeout: 50000
		},

		initialize: function (options) {
			L.setOptions(this, options)
		},

		onAdd: function (map) {
			this._map = map
			this._marker = null

			var container = L.DomUtil.create("div", "leaflet-control-location-search leaflet-bar")
			L.DomEvent.disableClickPropagation(container)
			L.DomEvent.disableScrollPropagation(container)

			var input = L.DomUtil.create("input", "leaflet-control-location-search-input", container)
			input.type = "text"
			input.placeholder = this.options.placeholder
			input.setAttribute("autocomplete", "off")
			this._input = input

			this._attachAutocomplete(container, input)

			var parsedUrl = new URL(window.location.href)
			var locationParam = parsedUrl.searchParams.get("location")
			if (locationParam) {
				input.value = locationParam
				this._navigateToLocation(locationParam)
			}

			return container
		},

		onRemove: function () {
			if (this._marker) {
				this._marker.remove()
				this._marker = null
			}
		},

		_setSearchParams: function (parameters) {
			var url = new URL(window.location.href)
			var params = url.searchParams

			for (var key in parameters) {
				if (parameters[key] || parameters[key] === 0) {
					params.set(key, parameters[key])
				} else {
					params.delete(key)
				}
			}
			url.search = params
			history.replaceState(0, "Location", url)
		},

		_navigateToLocation: function (name) {
			var self = this
			fetchLocations(this.options.dataUrl).then(function (locations) {
				var lower = name.toLowerCase()
				var loc = null
				for (var i = 0; i < locations.length; i++) {
					if (locations[i].name.toLowerCase() === lower) {
						loc = locations[i]
						break
					}
				}
				if (loc) {
					self._goToLocation(loc)
				}
			})
		},

		_goToLocation: function (loc) {
			this._map.setPlane(loc.plane)
			this._map.flyTo([loc.y, loc.x], this.options.flyZoom, {
				duration: this.options.flyDuration,
				animate: false
			})

			this._setSearchParams({ location: loc.name })
			this._placeCrosshair(loc)
		},

		_placeCrosshair: function (loc) {
			if (this._marker) {
				this._marker.remove()
			}
			var icon = L.icon({
				iconUrl: "sprites/22449-0.png",
				iconAnchor: [25, 25]
			})
			this._marker = L.marker(L.latLng(loc.y + 0.5, loc.x + 0.5), {
				icon: icon
			})
			this._marker.addTo(this._map)

			var self = this
			setTimeout(function () {
				if (self._marker) {
					self._marker.remove()
					self._marker = null
				}
			}, this.options.markerTimeout)
		},

		_attachAutocomplete: function (container, inputElement) {
			var self = this
			var dropdown = L.DomUtil.create("div", "leaflet-control-location-search-dropdown", container)
			var activeIndex = -1
			var currentItems = []
			var debounceTimer = null
			var locationsPromise = fetchLocations(this.options.dataUrl)

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

			function selectItem(loc) {
				inputElement.value = loc.name
				hideDropdown()
				self._goToLocation(loc)
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
				locationsPromise.then(function (locations) {
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

					for (var i = 0; i < locations.length; i++) {
						var nameLower = locations[i].name.toLowerCase()
						if (nameLower.indexOf(lower) === 0) {
							prefix.push(locations[i])
						} else if (nameLower.indexOf(lower) > 0) {
							substring.push(locations[i])
						}
					}

					var results = prefix.concat(substring).slice(0, 50)

					if (results.length === 0) {
						hideDropdown()
						return
					}

					for (var j = 0; j < results.length; j++) {
						var item = L.DomUtil.create("div", "leaflet-control-location-search-item", dropdown)
						item.textContent = results[j].name
						item.setAttribute("data-index", j)
						;(function (loc) {
							L.DomEvent.on(item, "mousedown", function (e) {
								e.preventDefault()
							})
							L.DomEvent.on(item, "click", function () {
								selectItem(loc)
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
				if (!L.DomUtil.hasClass(dropdown, "visible")) return

				if (e.key === "ArrowDown") {
					e.preventDefault()
					setActive(Math.min(activeIndex + 1, currentItems.length - 1))
				} else if (e.key === "ArrowUp") {
					e.preventDefault()
					setActive(Math.max(activeIndex - 1, 0))
				} else if (e.key === "Enter" && activeIndex >= 0) {
					e.preventDefault()
					var idx = parseInt(currentItems[activeIndex].getAttribute("data-index"), 10)
					locationsPromise.then(function (locations) {
						var lower = inputElement.value.trim().toLowerCase()
						var prefix = []
						var substr = []
						for (var i = 0; i < locations.length; i++) {
							var nameLower = locations[i].name.toLowerCase()
							if (nameLower.indexOf(lower) === 0) {
								prefix.push(locations[i])
							} else if (nameLower.indexOf(lower) > 0) {
								substr.push(locations[i])
							}
						}
						var results = prefix.concat(substr)
						if (results[idx]) {
							selectItem(results[idx])
						}
					})
				} else if (e.key === "Escape") {
					hideDropdown()
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

	L.Map.addInitHook(function () {
		if (this.options.locationSearch) {
			this.locationSearchControl = new L.Control.LocationSearch(
				typeof this.options.locationSearch === "object" ? this.options.locationSearch : {}
			)
			this.addControl(this.locationSearchControl)
		}
	})

	L.control.locationSearch = function (options) {
		return new L.Control.LocationSearch(options)
	}
})

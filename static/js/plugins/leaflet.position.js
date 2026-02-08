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
	L.Control.Position = L.Control.extend({
		options: {
			position: "topright",
			separator: ", ",
			emptyString: "Unavailable",
			prefix: "",
			flyDuration: 3 //seconds
		},

		initialize: function (options) {
			L.setOptions(this, options)
			this._map = null
			this._panelOpen = false
		},

		onAdd: function (map) {
			this._map = map
			this._container = L.DomUtil.create("div", "leaflet-control-position")

			this._chunkBox = L.DomUtil.create(
				"div",
				"leaflet-control-position-box",
				this._container
			)
			this._tileBox = L.DomUtil.create(
				"div",
				"leaflet-control-position-box",
				this._container
			)

			this._panel = L.DomUtil.create(
				"div",
				"leaflet-control-position-panel",
				this._container
			)
			var form = L.DomUtil.create("div", "leaflet-control-position-form", this._panel)
			var label = L.DomUtil.create("span", "leaflet-control-position-label", form)
			label.textContent = "Go to:"
			this._input = L.DomUtil.create("input", "leaflet-control-position-input", form)
			this._input.type = "text"
			this._input.placeholder = "x, y"
			var goBtn = L.DomUtil.create("button", "leaflet-control-position-go", form)
			goBtn.textContent = "Go"

			this._rect = L.rectangle(
				[
					[0, 0],
					[1, 1]
				],
				{
					color: "#ff7800",
					weight: 1
				}
			)

			// gross hack because the Path renderer doesn't work properly if this is added right now
			// we delay this for after this event loop finishes
			setTimeout(() => {
				this._rect.addTo(map)
			}, 0)

			L.DomEvent.disableClickPropagation(this._container)
			L.DomEvent.on(this._chunkBox, "click", this._togglePanel, this)
			L.DomEvent.on(this._tileBox, "click", this._togglePanel, this)
			L.DomEvent.on(goBtn, "click", this._onGo, this)
			L.DomEvent.on(this._input, "keydown", function (e) {
				if (e.key === "Enter") {
					this._onGo()
				}
			}, this)
			L.DomUtil.disableTextSelection()

			this._map.on("mousemove", this._updateContainerPointCache, this)
			this._map.on("move moveend zoom zoomend resize", this.redrawRect, this)
			this._map.on("mouseout", this.clear.bind(this))

			this._chunkBox.style.display = "none"
			this._tileBox.style.display = "none"

			return this._container
		},

		_togglePanel: function () {
			this._panelOpen = !this._panelOpen
			if (this._panelOpen) {
				L.DomUtil.addClass(this._panel, "visible")
				this._input.focus()
			} else {
				L.DomUtil.removeClass(this._panel, "visible")
			}
		},

		_onGo: function () {
			var input = this._input.value
			if (input) {
				var destination = this.interpret(input)
				if (this.validateCoordinate(destination)) {
					this.panMap(destination)
					this.placeCrosshair(destination)
					this._input.value = ""
					this._panelOpen = false
					L.DomUtil.removeClass(this._panel, "visible")
				} else {
					console.error(
						input,
						"was parsed as",
						this.createString(destination),
						"which is not a valid coordinate."
					)
				}
			}
		},

		clear: function () {
			if (this._panelOpen) return
			this._chunkBox.style.display = "none"
			this._tileBox.style.display = "none"
			// hack to make it 'disappear'...not calling .remove()
			// because otherwise `redrawRect` would have to check
			//			every update that it's really on the map
			this._rect.setBounds([
				[-1000, -1000],
				[-1000, -1000]
			])
		},

		onRemove: function (map) {
			map.off("mousemove", this._update)
			this.rect.remove()
		},

		convert: function (_globalX, _globalY) {
			return { chunkX: _globalX >> 6, chunkY: _globalY >> 6 }
		},

		interpret: function (input) {
			let numbers = input.match(/\d+/g).map(Number)
			if (numbers.length == 1) {
				return {
					plane: numbers[0] >> 28,
					globalX: (numbers[0] >> 14) & 0x3fff,
					globalY: numbers[0] & 0x3fff
				}
			} else if (numbers.length >= 2) {
				numbers.push(0, 0, 0)
				if (!(numbers[0] in [0, 1, 2, 3])) {
					numbers.unshift(this._map.getPlane())
				}
				if (numbers[1] > 200 || numbers[2] > 200) {
					return {
						plane: numbers[0],
						globalX: numbers[1],
						globalY: numbers[2]
					}
				} else {
					console.log("hi")
					return {
						plane: numbers[0],
						globalX: (numbers[1] << 6) | numbers[3],
						globalY: (numbers[2] << 6) | numbers[4]
					}
				}
			}
			return undefined
		},

		panMap: function (destination) {
			this._map.setPlane(destination.plane)
			this._map.flyTo([destination.globalY, destination.globalX], 3, {
				duration: this.options.flyDuration,
				animate: false
			})
			this._map.once("moveend", function () {
				this.fire("panend")
			})
		},

		placeCrosshair: function (destination) {
			let icon = L.divIcon({
				className: "search-marker",
				iconSize: [40, 40],
				iconAnchor: [20, 20],
				html: '<div class="search-marker-ring"></div><div class="search-marker-pulse"></div><div class="search-marker-dot"></div>'
			})
			let marker = L.marker(L.latLng(destination.globalY + 0.5, destination.globalX + 0.5), {
				icon: icon,
				interactive: false
			})
			marker.addTo(this._map)
			setTimeout(() => {
				if (marker) {
					let el = marker.getElement()
					if (el) L.DomUtil.addClass(el, "search-marker-removing")
					setTimeout(() => {
						if (marker) marker.remove()
					}, 1000)
				}
			}, 49000)
		},

		validateCoordinate: function (destination) {
			return (
				destination &&
				destination.plane < 4 &&
				this._map.options.maxBounds.contains(L.latLng(destination.globalY, destination.globalX))
			)
		},

		createString: function (...args) {
			if (typeof args[0] === "number") {
				return args.join(this.options.separator)
			}
			if (typeof args[0] === "object") {
				let coord = args[0]
				return [coord.plane, coord.chunkX, coord.chunkY, coord.globalX, coord.globalY]
					.filter((item) => item !== undefined)
					.join(this.options.separator)
			}
		},
		_containerPointCache: {
			x: 0,
			y: 0
		},

		_updateContainerPointCache: function (e) {
			this._containerPointCache = e.containerPoint
			this.redrawRect()
		},
		redrawRect: function () {
			this._chunkBox.style.display = "flex"
			this._tileBox.style.display = "flex"
			let position = this._map.containerPointToLatLng(this._containerPointCache)
			this.globalX = parseInt(position.lng)
			this.globalY = parseInt(position.lat)
			let chunk = this.convert(this.globalX, this.globalY)

			this._chunkBox.textContent = "Chunk(" + chunk.chunkX + ", " + chunk.chunkY + ")"
			this._tileBox.textContent = "[" + this.globalX + ", " + this.globalY + "]"

			this._rect.setBounds([
				[this.globalY, this.globalX],
				[this.globalY + 1, this.globalX + 1]
			])
		}
	})

	L.control.position = function (options) {
		return new L.Control.Position(options)
	}
})

import "../leaflet.js"
import "./leaflet.displays.js"

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
	let VertexIcon = L.DivIcon.extend({
		options: {
			iconSize: new L.Point(8, 8)
		}
	})

	let Vertex = L.Marker.extend({
		initialize: function (latlng, owner) {
			L.Util.setOptions(this, {
				draggable: true,
				icon: new VertexIcon(),
				owner: owner
			})
			this._latlng = L.latLng(latlng)
			this.trunc()
		},

		onAdd: function (map) {
			this.on("drag", this.onDragEnd.bind(this))
			return L.Marker.prototype.onAdd.call(this, map)
		},

		onDragEnd: function () {
			this.trunc()
			this.options.owner.update(this)
		},

		trunc: function () {
			let latlng = this.getLatLng()
			let newLat = Math.trunc(latlng.lat)
			let newLng = Math.trunc(latlng.lng)
			let newLatLng = L.latLng(newLat, newLng)
			this.setLatLng(newLatLng)
			return this
		}
	})

	L.DraggableSquare = L.Rectangle.extend({
		initialize: function (latLngBounds, options) {
			let bounds = L.latLngBounds(latLngBounds)
			// do not change order, important
			this.vertices = [
				bounds.getSouthWest(),
				bounds.getNorthWest(),
				bounds.getNorthEast(),
				bounds.getSouthEast()
			].map(this.createVertex.bind(this))
			return L.Rectangle.prototype.initialize.call(this, bounds, options)
		},

		onAdd: function (map) {
			this.vertices.forEach((v) => v.trunc().addTo(map))

			L.Rectangle.prototype.onAdd.call(this, map)
			this.options.owner.update(this.getBounds())
		},

		createVertex: function (latlng) {
			return new Vertex(latlng, this)
		},

		update: function (changedVertex) {
			let i = (this.vertices.indexOf(changedVertex) + 2) & 0x3
			let oppositeVertex = this.vertices[i]
			let otherVertices = this.vertices.filter(
				(vertex) => vertex !== oppositeVertex && vertex !== changedVertex
			)

			let corner1 = oppositeVertex.getLatLng()
			let corner2 = changedVertex.getLatLng()
			let newBounds = L.latLngBounds([corner1, corner2])
			this.setRectBounds(newBounds)

			let newLatLng1 = L.latLng(corner1.lat, corner2.lng)
			otherVertices[0].setLatLng(newLatLng1)

			let newLatLng2 = L.latLng(corner2.lat, corner1.lng)
			otherVertices[1].setLatLng(newLatLng2)

			this.options.owner.update(newBounds)
		},

		setRectBounds: function (bounds) {
			return L.Rectangle.prototype.setBounds.call(this, bounds)
		},

		setBounds: function (bounds) {
			let positions = [
				bounds.getSouthWest(),
				bounds.getNorthWest(),
				bounds.getNorthEast(),
				bounds.getSouthEast()
			]
			this.vertices.forEach((v, i) => v.setLatLng(positions[i]).trunc())
			bounds = L.latLngBounds(this.vertices.map((v) => v.getLatLng()))
			this.setRectBounds(bounds)
		},

		remove: function () {
			this.vertices.forEach((v) => v.remove())
			return L.Rectangle.prototype.remove.call(this)
		}
	})

	L.draggableSquare = function (bounds, options) {
		return new L.DraggableSquare(bounds, options)
	}

	let copySvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
	let checkSvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

	function wrapWithCopyBtn(input, map) {
		let wrapper = L.DomUtil.create("div", "leaflet-control-display-input-copy-wrapper")
		input.parentNode.insertBefore(wrapper, input)
		wrapper.appendChild(input)
		input.style.paddingRight = "24px"
		input.style.width = "100%"
		input.style.boxSizing = "border-box"

		let btn = L.DomUtil.create("button", "leaflet-control-display-input-copy-btn", wrapper)
		btn.setAttribute("type", "button")
		btn.innerHTML = copySvg

		L.DomEvent.on(btn, "click", function (e) {
			L.DomEvent.stopPropagation(e)
			navigator.clipboard.writeText(input.value).then(function () {
				btn.innerHTML = checkSvg
				map.addMessage(`Copied to clipboard: ${input.value}`)
				setTimeout(function () {
					btn.innerHTML = copySvg
				}, 1500)
			})
		})

		return wrapper
	}

	L.Control.Display.Rect = L.Control.Display.extend({
		onAdd: function (map) {
			this.rect = L.draggableSquare(
				[
					[3232, 3200],
					[3200, 3232]
				],
				{
					owner: this
				}
			)

			return L.Control.Display.prototype.onAdd.call(this, map)
		},

		options: {
			position: "topleft",
			title: "Dimensions:",
			label: "MAP",
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4l5-2 6 2 5-2v12l-5 2-6-2-5 2z"/><path d="M6 2v12m6-10v12"/></svg>'
		},

		createInterface: function () {
			let container = L.DomUtil.create("div", "leaflet-control-display-expanded")
			let rectForm = L.DomUtil.create(
				"form",
				"leaflet-control-display-form leaflet-control-display-form-rect",
				container
			)

			let widthLabel = L.DomUtil.create("label", "leaflet-control-display-label", rectForm)
			widthLabel.innerHTML = "Width"
			this.width = L.DomUtil.create("input", "leaflet-control-display-input-number", rectForm)
			this.width.setAttribute("type", "number")
			this.width.setAttribute("name", "width")

			let heightLabel = L.DomUtil.create("label", "leaflet-control-display-label", rectForm)
			heightLabel.innerHTML = "Height"
			this.height = L.DomUtil.create("input", "leaflet-control-display-input-number", rectForm)
			this.height.setAttribute("type", "number")
			this.height.setAttribute("name", "height")

			let x1Label = L.DomUtil.create("label", "leaflet-control-display-label", rectForm)
			x1Label.innerHTML = "X1"
			this.x1 = L.DomUtil.create("input", "leaflet-control-display-input-number", rectForm)
			this.x1.setAttribute("type", "number")
			this.x1.setAttribute("name", "x1")

			let y1Label = L.DomUtil.create("label", "leaflet-control-display-label", rectForm)
			y1Label.innerHTML = "Y1"
			this.y1 = L.DomUtil.create("input", "leaflet-control-display-input-number", rectForm)
			this.y1.setAttribute("type", "number")
			this.y1.setAttribute("name", "y1")

			let x2Label = L.DomUtil.create("label", "leaflet-control-display-label", rectForm)
			x2Label.innerHTML = "X2"
			this.x2 = L.DomUtil.create("input", "leaflet-control-display-input-number", rectForm)
			this.x2.setAttribute("type", "number")
			this.x2.setAttribute("name", "x2")

			let y2Label = L.DomUtil.create("label", "leaflet-control-display-label", rectForm)
			y2Label.innerHTML = "Y2"
			this.y2 = L.DomUtil.create("input", "leaflet-control-display-input-number", rectForm)
			this.y2.setAttribute("type", "number")
			this.y2.setAttribute("name", "y2")
			let map = this._map
			;[this.width, this.height, this.x1, this.y1, this.x2, this.y2].forEach(function (input) {
				wrapWithCopyBtn(input, map)
			})

			let simba1400Row = L.DomUtil.create("div", "leaflet-control-map-row", rectForm)
			let simba1400 = L.DomUtil.create("label", "leaflet-control-display-label", simba1400Row)
			simba1400.innerHTML = "Simba1400"
			this.map1400 = L.DomUtil.create("input", "leaflet-control-map-input", simba1400Row)
			this.map1400.setAttribute("type", "text")
			this.map1400.setAttribute("name", "map1400")
			this.map1400.setAttribute("readOnly", true)

			let simba2000Row = L.DomUtil.create("div", "leaflet-control-map-row", rectForm)
			let simba2000 = L.DomUtil.create("label", "leaflet-control-display-label", simba2000Row)
			simba2000.innerHTML = "Simba2000"
			this.map2000 = L.DomUtil.create("input", "leaflet-control-map-input", simba2000Row)
			this.map2000.setAttribute("type", "text")
			this.map2000.setAttribute("name", "map2000")
			this.map2000.setAttribute("readOnly", true)

			rectForm.addEventListener("change", this.changeRect.bind(this))

			return container
		},

		changeRect: function () {
			let width = Number(this.width.value)
			let height = Number(this.height.value)
			let x1 = Number(this.x1.value)
			let x2 = Number(this.x2.value)
			let y1 = Number(this.y1.value)
			let y2 = Number(this.y2.value)

			if (["width", "height"].includes(document.activeElement.name)) {
				x2 = x1 + width
				y1 = y2 + height
			}

			let bounds = L.latLngBounds([
				[y2, x1],
				[y1, x2]
			])
			this.rect.setBounds(bounds)
			this.update(bounds)
		},

		update: function (bounds) {
			// update control content
			let chunk = {
				x1: bounds.getWest() >> 6,
				y1: bounds.getNorth() >> 6,
				x2: bounds.getEast() >> 6,
				y2: bounds.getSouth() >> 6
			}

			let global = {
				x1: bounds.getWest() * 4 - 4096,
				y1: 60 - (bounds.getNorth() * 4 - 50370),
				x2: bounds.getEast() * 4 - 4096,
				y2: 60 - (bounds.getSouth() * 4 - 50370)
			}

			let width = global.x2 - global.x1
			let height = global.y1 - global.y2

			this.width.value = width
			this.height.value = height
			this.x1.value = global.x1
			this.x2.value = global.x2
			this.y1.value = global.y1
			this.y2.value = global.y2
			this.map1400.value = `Map.SetupChunk(Chunk([${chunk.x1},${chunk.y1},${chunk.x2},${
				chunk.y2
			}], ${this._map.getPlane()}));`

			this.map2000.value = `Map.Setup([Chunk(Box(${chunk.x1},${chunk.y1},${chunk.x2},${
				chunk.y2
			}), ${this._map.getPlane()})]);`
		},

		expand: function () {
			let bounds = this._map.getBounds().pad(-0.3)
			this.rect.setBounds(bounds)
			this.rect.addTo(this._map)
			return L.Control.Display.prototype.expand.call(this)
		},

		collapse: function () {
			this.rect.remove()
			return L.Control.Display.prototype.collapse.call(this)
		}
	})

	L.control.display.rect = function (options) {
		return new L.Control.Display.Rect(options)
	}
})

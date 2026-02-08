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
			iconSize: new L.Point(14, 14),
			className: "leaflet-vertex-handle"
		}
	})

	let Vertex = L.Marker.extend({
		initialize: function (latlng, owner, cursor) {
			L.Util.setOptions(this, {
				draggable: true,
				icon: new VertexIcon(),
				owner: owner
			})
			this._cursor = cursor
			this._latlng = L.latLng(latlng)
			this.trunc()
		},

		onAdd: function (map) {
			this.on("drag", this.onDragEnd.bind(this))
			L.Marker.prototype.onAdd.call(this, map)
			if (this._cursor) {
				this._icon.style.cursor = this._cursor
			}
			return this
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

	// Edge cursors: S=ns, W=ew, N=ns, E=ew
	let edgeDefs = [
		{ name: "south", vertexIndices: [0, 3], axis: "lat", cursor: "ns-resize" },
		{ name: "west", vertexIndices: [0, 1], axis: "lng", cursor: "ew-resize" },
		{ name: "north", vertexIndices: [1, 2], axis: "lat", cursor: "ns-resize" },
		{ name: "east", vertexIndices: [2, 3], axis: "lng", cursor: "ew-resize" }
	]

	L.DraggableSquare = L.Rectangle.extend({
		initialize: function (latLngBounds, options) {
			let bounds = L.latLngBounds(latLngBounds)
			// do not change order, important: SW, NW, NE, SE
			let corners = [
				bounds.getSouthWest(),
				bounds.getNorthWest(),
				bounds.getNorthEast(),
				bounds.getSouthEast()
			]
			// Per-corner resize cursors
			let cursors = ["nesw-resize", "nwse-resize", "nesw-resize", "nwse-resize"]
			this.vertices = corners.map((c, i) => this.createVertex(c, cursors[i]))
			this.edges = []
			this._dragging = false
			this._edgeDragging = false
			return L.Rectangle.prototype.initialize.call(this, bounds, options)
		},

		onAdd: function (map) {
			this.vertices.forEach((v) => v.trunc().addTo(map))
			this._createEdges(map)

			L.Rectangle.prototype.onAdd.call(this, map)

			// Drag-to-move handlers
			this._onDragStart = this._onDragStart.bind(this)
			this._onDragMove = this._onDragMove.bind(this)
			this._onDragEnd = this._onDragEnd.bind(this)
			this._onEdgeDragMove = this._onEdgeDragMove.bind(this)
			this._onEdgeDragEnd = this._onEdgeDragEnd.bind(this)

			this.on("mousedown", this._onDragStart)

			this.options.owner.update(this.getBounds())
		},

		createVertex: function (latlng, cursor) {
			return new Vertex(latlng, this, cursor)
		},

		// --- Edge handles ---
		_createEdges: function (map) {
			this.edges = edgeDefs.map((def) => {
				let v1 = this.vertices[def.vertexIndices[0]]
				let v2 = this.vertices[def.vertexIndices[1]]
				let line = L.polyline([v1.getLatLng(), v2.getLatLng()], {
					weight: 12,
					opacity: 0,
					bubblingMouseEvents: false,
					className: "leaflet-edge-handle"
				})
				line._edgeDef = def
				line.addTo(map)

				// Set per-edge cursor on the DOM element
				line.getElement().style.cursor = def.cursor

				line.on("mousedown", this._onEdgeDragStart, this)
				return line
			})
		},

		_updateEdges: function () {
			if (!this.edges.length) return
			edgeDefs.forEach((def, i) => {
				let v1 = this.vertices[def.vertexIndices[0]]
				let v2 = this.vertices[def.vertexIndices[1]]
				this.edges[i].setLatLngs([v1.getLatLng(), v2.getLatLng()])
			})
		},

		_onEdgeDragStart: function (e) {
			L.DomEvent.stopPropagation(e.originalEvent)
			L.DomEvent.preventDefault(e.originalEvent)
			this._edgeDragging = true
			this._activeEdge = e.target._edgeDef
			this._dragStartLatLng = this._map.mouseEventToLatLng(e.originalEvent)
			this._map.dragging.disable()

			this._map.on("mousemove", this._onEdgeDragMove)
			this._map.on("mouseup", this._onEdgeDragEnd)
			L.DomEvent.on(document, "mouseup", this._onEdgeDragEnd)
		},

		_onEdgeDragMove: function (e) {
			if (!this._edgeDragging) return
			let def = this._activeEdge
			let current = e.latlng
			let delta =
				def.axis === "lat"
					? Math.trunc(current.lat) - Math.trunc(this._dragStartLatLng.lat)
					: Math.trunc(current.lng) - Math.trunc(this._dragStartLatLng.lng)
			if (delta === 0) return

			this._dragStartLatLng = current

			def.vertexIndices.forEach((vi) => {
				let v = this.vertices[vi]
				let pos = v.getLatLng()
				let newPos =
					def.axis === "lat"
						? L.latLng(Math.trunc(pos.lat + delta), pos.lng)
						: L.latLng(pos.lat, Math.trunc(pos.lng + delta))
				v.setLatLng(newPos)
			})

			let newBounds = L.latLngBounds(this.vertices.map((v) => v.getLatLng()))
			this.setRectBounds(newBounds)
			this._updateEdges()
			this.options.owner.update(newBounds)
		},

		_onEdgeDragEnd: function () {
			if (!this._edgeDragging) return
			this._edgeDragging = false
			this._activeEdge = null
			this._map.dragging.enable()

			this._map.off("mousemove", this._onEdgeDragMove)
			this._map.off("mouseup", this._onEdgeDragEnd)
			L.DomEvent.off(document, "mouseup", this._onEdgeDragEnd)
		},

		// --- Drag to move ---
		_onDragStart: function (e) {
			if (this._edgeDragging) return
			L.DomEvent.stopPropagation(e.originalEvent)
			L.DomEvent.preventDefault(e.originalEvent)
			this._dragging = true
			this._dragStartLatLng = this._map.mouseEventToLatLng(e.originalEvent)
			this._map.dragging.disable()

			this._map.on("mousemove", this._onDragMove)
			this._map.on("mouseup", this._onDragEnd)
			L.DomEvent.on(document, "mouseup", this._onDragEnd)
		},

		_onDragMove: function (e) {
			if (!this._dragging) return
			let current = e.latlng
			let dLat = Math.trunc(current.lat) - Math.trunc(this._dragStartLatLng.lat)
			let dLng = Math.trunc(current.lng) - Math.trunc(this._dragStartLatLng.lng)
			if (dLat === 0 && dLng === 0) return

			this._dragStartLatLng = current

			this.vertices.forEach((v) => {
				let pos = v.getLatLng()
				v.setLatLng(L.latLng(Math.trunc(pos.lat + dLat), Math.trunc(pos.lng + dLng)))
			})

			let newBounds = L.latLngBounds(this.vertices.map((v) => v.getLatLng()))
			this.setRectBounds(newBounds)
			this._updateEdges()
			this.options.owner.update(newBounds)
		},

		_onDragEnd: function () {
			if (!this._dragging) return
			this._dragging = false
			this._map.dragging.enable()

			this._map.off("mousemove", this._onDragMove)
			this._map.off("mouseup", this._onDragEnd)
			L.DomEvent.off(document, "mouseup", this._onDragEnd)
		},

		// --- Vertex corner resize ---
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

			this._updateEdges()
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
			this._updateEdges()
		},

		remove: function () {
			if (this._dragging) this._onDragEnd()
			if (this._edgeDragging) this._onEdgeDragEnd()
			this.edges.forEach((e) => e.remove())
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
					owner: this,
					color: "#4a4a6a",
					fillColor: "#3a3a5e",
					fillOpacity: 0.15,
					weight: 2,
					className: "leaflet-draggable-rect",
					bubblingMouseEvents: false
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

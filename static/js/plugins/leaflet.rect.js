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
	// --- Coordinate helpers ---
	function mapToGame(latlng) {
		return {
			x: latlng.lng * 4 - 4096,
			y: 60 - (latlng.lat * 4 - 50370)
		}
	}

	function gameToMap(x, y) {
		return L.latLng((50430 - y) / 4, (x + 4096) / 4)
	}

	function pointInPolygon(x, y, vertices) {
		let inside = false
		for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			let xi = vertices[i].x,
				yi = vertices[i].y
			let xj = vertices[j].x,
				yj = vertices[j].y
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
				inside = !inside
			}
		}
		return inside
	}

	function computeTilesInPolygon(gameVertices) {
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity
		for (let v of gameVertices) {
			if (v.x < minX) minX = v.x
			if (v.x > maxX) maxX = v.x
			if (v.y < minY) minY = v.y
			if (v.y > maxY) maxY = v.y
		}
		minX = Math.floor(minX / 4) * 4
		maxX = Math.ceil(maxX / 4) * 4
		minY = Math.floor((minY - 2) / 4) * 4 + 2
		maxY = Math.ceil((maxY - 2) / 4) * 4 + 2

		let tileCount = ((maxX - minX) / 4) * ((maxY - minY) / 4)
		if (tileCount > 50000) {
			return null
		}

		let selected = []
		let border = []
		for (let y = minY; y < maxY; y += 4) {
			for (let x = minX; x < maxX; x += 4) {
				let count = 0
				for (let sy = 0; sy < 4; sy++) {
					for (let sx = 0; sx < 4; sx++) {
						if (pointInPolygon(x + sx + 0.5, y + sy + 0.5, gameVertices)) {
							count++
						}
					}
				}
				if (count === 16) {
					selected.push([x, y])
				} else if (count > 0) {
					border.push([x, y])
				}
			}
		}
		return { selected, border }
	}

	function cloneLatLngs(latlngs) {
		return latlngs.map((ll) => L.latLng(ll.lat, ll.lng))
	}

	function pascalIdentifier(label, fallback) {
		let name = String(label || fallback || "GeneratedArea")
			.replace(/[^A-Za-z0-9_]+/g, " ")
			.trim()
			.replace(/(?:^|\s+)([A-Za-z0-9_])/g, function (_, ch) {
				return ch.toUpperCase()
			})
			.replace(/[^A-Za-z0-9_]/g, "")

		if (!name) name = "GeneratedArea"
		if (/^[0-9]/.test(name)) name = "Area" + name
		return name
	}

	function boxDataFromBounds(bounds, plane) {
		let planeOffset = 13056 * plane
		let global = {
			x1: Math.round(bounds.getWest() * 4 - 4096 + planeOffset),
			y1: Math.round(60 - (bounds.getNorth() * 4 - 50370)),
			x2: Math.round(bounds.getEast() * 4 - 4096 + planeOffset),
			y2: Math.round(60 - (bounds.getSouth() * 4 - 50370))
		}

		return {
			bounds: bounds,
			globalBox: global,
			chunkBox: {
				x1: (bounds.getWest() >> 6) - 1,
				y1: (bounds.getNorth() >> 6) + 1,
				x2: (bounds.getEast() >> 6) + 1,
				y2: (bounds.getSouth() >> 6) - 1
			},
			vertices: [
				[global.x1, global.y1],
				[global.x2, global.y1],
				[global.x2, global.y2],
				[global.x1, global.y2]
			]
		}
	}

	function polyDataFromLatLngs(latlngs, plane) {
		let planeOffset = 13056 * plane
		let gameCoords = latlngs.map((ll) => mapToGame(ll))
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity

		for (let c of gameCoords) {
			if (c.x < minX) minX = c.x
			if (c.x > maxX) maxX = c.x
			if (c.y < minY) minY = c.y
			if (c.y > maxY) maxY = c.y
		}

		let result = computeTilesInPolygon(gameCoords)
		let tiles = result ? result.selected.map((t) => [t[0] + planeOffset, t[1] + 4]) : []

		return {
			bounds: L.latLngBounds(latlngs),
			globalBox: {
				x1: Math.round(minX + planeOffset),
				y1: Math.round(maxY),
				x2: Math.round(maxX + planeOffset),
				y2: Math.round(minY)
			},
			chunkBox: {
				x1: (((minX + 4096) / 4) >> 6) - 1,
				y1: (((50430 - minY) / 4) >> 6) + 1,
				x2: (((maxX + 4096) / 4) >> 6) + 1,
				y2: (((50430 - maxY) / 4) >> 6) - 1
			},
			vertices: gameCoords.map((c) => [Math.round(c.x + planeOffset), Math.round(c.y)]),
			tiles: tiles,
			tilesCapped: result === null
		}
	}

	function pointArrayLiteral(points) {
		return "[" + points.map((p) => "[" + p[0] + ", " + p[1] + "]").join(", ") + "]"
	}

	function boxLiteral(box) {
		return "[" + [box.x1, box.y1, box.x2, box.y2].join(", ") + "]"
	}

	function chunkLiteral(chunk) {
		return "Box(" + [chunk.x1, chunk.y1, chunk.x2, chunk.y2].join(", ") + ")"
	}

	function simbaString(value) {
		return "'" + String(value).replace(/'/g, "''") + "'"
	}

	function uniqueIdentifier(base, used) {
		let root = pascalIdentifier(base, "GeneratedArea")
		let name = root
		let idx = 2
		while (used[name]) {
			name = root + idx
			idx++
		}
		used[name] = true
		return name
	}

	function areaContains(area, lat, lng) {
		if (area.mode === "box") {
			return area.bounds.contains([lat, lng])
		}
		let pts = area.latlngs.map((ll) => ({ x: ll.lng, y: ll.lat }))
		return pointInPolygon(lng, lat, pts)
	}

	// --- TileHighlight canvas overlay ---
	let TileHighlight = L.Layer.extend({
		initialize: function () {
			this._selected = []
			this._border = []
		},

		onAdd: function (map) {
			this._canvas = L.DomUtil.create("canvas", "")
			this._canvas.style.position = "absolute"
			this._canvas.style.pointerEvents = "none"
			map.getPanes().overlayPane.appendChild(this._canvas)

			this._redraw = this._redraw.bind(this)
			this._onAnimZoom = this._onAnimZoom.bind(this)

			map.on("moveend viewreset zoomend", this._redraw)
			map.on("zoomanim", this._onAnimZoom)
			this._redraw()
			return this
		},

		onRemove: function (map) {
			map.off("moveend viewreset zoomend", this._redraw)
			map.off("zoomanim", this._onAnimZoom)
			L.DomUtil.remove(this._canvas)
			this._canvas = null
			return this
		},

		setTiles: function (selected, border) {
			this._selected = selected
			this._border = border
			if (this._map) this._redraw()
		},

		_onAnimZoom: function (e) {
			let map = this._map
			let scale = map.getZoomScale(e.zoom)
			let offset = map._latLngBoundsToNewLayerBounds(map.getBounds(), e.zoom, e.center).min
			L.DomUtil.setTransform(this._canvas, offset, scale)
		},

		_redraw: function () {
			let map = this._map
			if (!map || !this._canvas) return

			let size = map.getSize()
			let dpr = window.devicePixelRatio || 1
			let canvas = this._canvas

			canvas.width = size.x * dpr
			canvas.height = size.y * dpr
			canvas.style.width = size.x + "px"
			canvas.style.height = size.y + "px"

			let topLeft = map.containerPointToLayerPoint([0, 0])
			L.DomUtil.setPosition(canvas, topLeft)

			let ctx = canvas.getContext("2d")
			ctx.scale(dpr, dpr)
			ctx.clearRect(0, 0, size.x, size.y)

			let viewBounds = map.getBounds()

			let sets = [
				{ tiles: this._border, color: "rgba(255, 120, 0, 0.15)" },
				{ tiles: this._selected, color: "rgba(0, 212, 255, 0.15)" }
			]

			for (let s = 0; s < sets.length; s++) {
				let tiles = sets[s].tiles
				ctx.fillStyle = sets[s].color
				for (let i = 0; i < tiles.length; i++) {
					let gx = tiles[i][0]
					let gy = tiles[i][1]

					let nw = gameToMap(gx, gy)
					let se = gameToMap(gx + 4, gy + 4)

					if (se.lng < viewBounds.getWest() || nw.lng > viewBounds.getEast()) continue
					if (se.lat > viewBounds.getNorth() || nw.lat < viewBounds.getSouth()) continue

					let pNW = map.latLngToLayerPoint(nw)
					let pSE = map.latLngToLayerPoint(se)
					ctx.fillRect(pNW.x - topLeft.x, pNW.y - topLeft.y, pSE.x - pNW.x, pSE.y - pNW.y)
				}
			}
		}
	})

	// --- Vertex and DraggableSquare (unchanged) ---
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
			L.Rectangle.prototype.onAdd.call(this, map)
			this._createEdges(map)

			// Drag-to-move handlers
			this._onDragStart = this._onDragStart.bind(this)
			this._onDragMove = this._onDragMove.bind(this)
			this._onDragEnd = this._onDragEnd.bind(this)
			this._onEdgeDragMove = this._onEdgeDragMove.bind(this)
			this._onEdgeDragEnd = this._onEdgeDragEnd.bind(this)

			this.on("mousedown", this._onDragStart)

			this.options.owner.updateBox(this.getBounds())
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
			this.options.owner.updateBox(newBounds)
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
			this.options.owner.updateBox(newBounds)
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
			let changedIdx = this.vertices.indexOf(changedVertex)
			let oppositeIdx = (changedIdx + 2) & 0x3
			let oppositeVertex = this.vertices[oppositeIdx]

			let corner1 = oppositeVertex.getLatLng()
			let corner2 = changedVertex.getLatLng()
			let newBounds = L.latLngBounds([corner1, corner2])
			this.setRectBounds(newBounds)

			let positions = [
				newBounds.getSouthWest(),
				newBounds.getNorthWest(),
				newBounds.getNorthEast(),
				newBounds.getSouthEast()
			]
			for (let i = 0; i < 4; i++) {
				if (i !== changedIdx && i !== oppositeIdx) {
					this.vertices[i].setLatLng(positions[i])
				}
			}

			this._updateEdges()
			this.options.owner.updateBox(newBounds)
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

	// --- L.DraggablePolygon ---
	L.DraggablePolygon = L.Polygon.extend({
		initialize: function (latlngs, options) {
			this.vertices = latlngs.map((ll) => new Vertex(ll, this, "move"))
			this.edges = []
			this._dragging = false
			this._hoverPreview = null
			return L.Polygon.prototype.initialize.call(this, latlngs, options)
		},

		onAdd: function (map) {
			this.vertices.forEach((v) => v.trunc().addTo(map))
			this._createEdges(map)
			L.Polygon.prototype.onAdd.call(this, map)

			this._onDragStart = this._onDragStart.bind(this)
			this._onDragMove = this._onDragMove.bind(this)
			this._onDragEnd = this._onDragEnd.bind(this)

			this.on("mousedown", this._onDragStart)

			this.options.owner.updatePoly()
			return this
		},

		update: function () {
			let latlngs = this.vertices.map((v) => v.getLatLng())
			this.setLatLngs(latlngs)
			this._updateEdges()
			this.options.owner.updatePoly()
		},

		getVertexLatLngs: function () {
			return this.vertices.map((v) => v.getLatLng())
		},

		setVertices: function (latlngs) {
			if (this._map) {
				this.vertices.forEach((v) => v.remove())
			}
			this.vertices = latlngs.map((ll) => new Vertex(ll, this, "move"))
			if (this._map) {
				this.vertices.forEach((v) => v.trunc().addTo(this._map))
				this._updateEdges()
			}
			this.setLatLngs(latlngs)
		},

		// --- Edge handles for vertex insertion ---
		_createEdges: function (map) {
			this.edges = []
			for (let i = 0; i < this.vertices.length; i++) {
				let j = (i + 1) % this.vertices.length
				let line = L.polyline([this.vertices[i].getLatLng(), this.vertices[j].getLatLng()], {
					weight: 36,
					opacity: 0,
					bubblingMouseEvents: false,
					className: "leaflet-edge-handle"
				})
				line._edgeIndex = i
				line.addTo(map)
				line.getElement().style.cursor = "none"
				line.on("mousedown", this._onEdgeClick, this)
				line.on("mousemove", this._onEdgeHover, this)
				line.on("mouseout", this._onEdgeHoverEnd, this)
				this.edges.push(line)
			}
		},

		_updateEdges: function () {
			if (!this.edges || !this.edges.length) return
			this._removeHoverPreview()
			this.edges.forEach((e) => e.remove())
			this._createEdges(this._map)
		},

		_projectOnSegment: function (p, a, b) {
			let dx = b.lng - a.lng
			let dy = b.lat - a.lat
			let len2 = dx * dx + dy * dy
			if (len2 === 0) return a
			let t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2
			t = Math.max(0, Math.min(1, t))
			return L.latLng(a.lat + t * dy, a.lng + t * dx)
		},

		_nearVertex: function (e) {
			let pt = this._map.latLngToContainerPoint(e.latlng)
			for (let v of this.vertices) {
				let vpt = this._map.latLngToContainerPoint(v.getLatLng())
				if (pt.distanceTo(vpt) < 16) return true
			}
			return false
		},

		_onEdgeHover: function (e) {
			if (this._nearVertex(e)) {
				this._removeHoverPreview()
				return
			}
			let pts = e.target.getLatLngs()
			let latlng = this._projectOnSegment(e.latlng, pts[0], pts[1])
			if (!this._hoverPreview) {
				this._hoverPreview = L.circleMarker(latlng, {
					radius: 6,
					color: "#00d4ff",
					fillColor: "#00d4ff",
					fillOpacity: 0.4,
					weight: 2,
					interactive: false
				}).addTo(this._map)
			} else {
				this._hoverPreview.setLatLng(latlng)
			}
			this._map._hidePositionRect = true
		},

		_onEdgeHoverEnd: function () {
			this._removeHoverPreview()
		},

		_removeHoverPreview: function () {
			if (this._hoverPreview) {
				this._hoverPreview.remove()
				this._hoverPreview = null
			}
			if (this._map) {
				this._map._hidePositionRect = false
			}
		},

		_onEdgeClick: function (e) {
			if (this._nearVertex(e)) return
			L.DomEvent.stopPropagation(e.originalEvent)
			L.DomEvent.preventDefault(e.originalEvent)
			let insertAfter = e.target._edgeIndex
			let latlng = this._map.mouseEventToLatLng(e.originalEvent)
			let newVertex = new Vertex(latlng, this, "move")
			newVertex.trunc().addTo(this._map)
			this.vertices.splice(insertAfter + 1, 0, newVertex)
			this.update()
		},

		_onDragStart: function (e) {
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

			this.setLatLngs(this.vertices.map((v) => v.getLatLng()))
			this._updateEdges()
			this.options.owner.updatePoly()
		},

		_onDragEnd: function () {
			if (!this._dragging) return
			this._dragging = false
			this._map.dragging.enable()

			this._map.off("mousemove", this._onDragMove)
			this._map.off("mouseup", this._onDragEnd)
			L.DomEvent.off(document, "mouseup", this._onDragEnd)
		},

		remove: function () {
			if (this._dragging) this._onDragEnd()
			this._removeHoverPreview()
			this.edges.forEach((e) => e.remove())
			this.vertices.forEach((v) => v.remove())
			return L.Polygon.prototype.remove.call(this)
		}
	})

	// --- Shared polygon options ---
	let polyOpts = {
		color: "#00d4ff",
		fillColor: "#00d4ff",
		fillOpacity: 0,
		weight: 3,
		className: "leaflet-draggable-poly",
		bubblingMouseEvents: false
	}

	// --- SVG icons ---
	let copySvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
	let checkSvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

	let boxIconSvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="12" height="12" rx="1"/></svg>'
	let polyIconSvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="9,2 15,6 14,13 4,13 3,6"/></svg>'
	let newIconSvg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/></svg>'

	function formatVertices(verts) {
		return "[" + verts.map((v) => `[${v[0]}, ${v[1]}]`).join(", ") + "]"
	}

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
			this._mode = "box"
			this._drawState = null
			this._drawCursor = null
			this._pendingPreviousAreaId = null
			this._suspendAreaSync = false
			this._areas = []
			this._activeAreaId = null
			this._nextAreaId = 1
			this._areaLayers = {}
			this._areaColors = ["#00d4ff", "#f9c74f", "#90be6d", "#f94144", "#c77dff", "#43aa8b"]

			this.rect = L.draggableSquare(
				[
					[3232, 3200],
					[3200, 3232]
				],
				{
					owner: this,
					color: "#00d4ff",
					fillColor: "#00d4ff",
					fillOpacity: 0.15,
					weight: 3,
					className: "leaflet-draggable-rect",
					bubblingMouseEvents: false
				}
			)

			this.poly = null
			this._polyLatlngs = null
			this._tileHighlight = new TileHighlight()

			map.on("gotobox", this._onGotoBox, this)

			return L.Control.Display.prototype.onAdd.call(this, map)
		},

		options: {
			position: "topleft",
			title: "Chunk",
			label: "MAP",
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4l5-2 6 2 5-2v12l-5 2-6-2-5 2z"/><path d="M6 2v12m6-10v12"/></svg>'
		},

		createInterface: function () {
			let container = L.DomUtil.create(
				"div",
				"leaflet-control-display-expanded leaflet-control-display-expanded-rect"
			)
			let map = this._map

			// --- Chunk section (Simba fields) ---
			let chunkSection = L.DomUtil.create("div", "leaflet-control-display-chunk-section", container)

			let simba14Row = L.DomUtil.create("div", "leaflet-control-map-row", chunkSection)
			let simba14Label = L.DomUtil.create("label", "leaflet-control-display-label", simba14Row)
			simba14Label.innerHTML = "Simba 1.4"
			this.map1400 = L.DomUtil.create("input", "leaflet-control-map-input", simba14Row)
			this.map1400.setAttribute("type", "text")
			this.map1400.setAttribute("name", "map1400")
			this.map1400.setAttribute("readOnly", true)
			wrapWithCopyBtn(this.map1400, map)

			let simba20Row = L.DomUtil.create("div", "leaflet-control-map-row", chunkSection)
			let simba20Label = L.DomUtil.create("label", "leaflet-control-display-label", simba20Row)
			simba20Label.innerHTML = "Simba 2.0"
			this.map2000 = L.DomUtil.create("input", "leaflet-control-map-input", simba20Row)
			this.map2000.setAttribute("type", "text")
			this.map2000.setAttribute("name", "map2000")
			this.map2000.setAttribute("readOnly", true)
			wrapWithCopyBtn(this.map2000, map)

			// --- Area Selection header + mode toggle ---
			let headerRow = L.DomUtil.create("div", "leaflet-control-display-section-header", container)
			let sectionTitle = L.DomUtil.create(
				"span",
				"leaflet-control-display-section-title-inline",
				headerRow
			)
			sectionTitle.textContent = "Area Selection"
			let toggle = L.DomUtil.create("div", "leaflet-control-display-mode-toggle-inline", headerRow)

			this._boxBtn = L.DomUtil.create(
				"button",
				"leaflet-control-display-mode-btn leaflet-control-display-mode-btn-active",
				toggle
			)
			this._boxBtn.setAttribute("type", "button")
			this._boxBtn.setAttribute("title", "Box mode")
			this._boxBtn.innerHTML = boxIconSvg

			this._polyBtn = L.DomUtil.create("button", "leaflet-control-display-mode-btn", toggle)
			this._polyBtn.setAttribute("type", "button")
			this._polyBtn.setAttribute("title", "Polygon mode")
			this._polyBtn.innerHTML = polyIconSvg

			L.DomEvent.on(
				this._boxBtn,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					this._switchMode("box")
				},
				this
			)

			L.DomEvent.on(
				this._polyBtn,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					this._switchMode("poly")
				},
				this
			)

			// --- Multi-area workspace ---
			let areaSection = L.DomUtil.create("div", "leaflet-control-display-area-section", container)

			let areaNameRow = L.DomUtil.create("div", "leaflet-control-map-row", areaSection)
			let areaNameLabel = L.DomUtil.create("label", "leaflet-control-display-label", areaNameRow)
			areaNameLabel.textContent = "Label"
			this._areaLabelInput = L.DomUtil.create("input", "leaflet-control-map-input", areaNameRow)
			this._areaLabelInput.setAttribute("type", "text")
			this._areaLabelInput.setAttribute("placeholder", "Area label")

			let areaMetaRow = L.DomUtil.create("div", "leaflet-control-display-area-meta", areaSection)
			this._areaEnabledInput = L.DomUtil.create("input", "", areaMetaRow)
			this._areaEnabledInput.setAttribute("type", "checkbox")
			this._areaEnabledInput.checked = true
			let enabledLabel = L.DomUtil.create(
				"label",
				"leaflet-control-display-area-check-label",
				areaMetaRow
			)
			enabledLabel.textContent = "Enabled"
			this._areaColorInput = L.DomUtil.create(
				"input",
				"leaflet-control-display-area-color",
				areaMetaRow
			)
			this._areaColorInput.setAttribute("type", "color")
			this._areaColorInput.value = "#00d4ff"
			this._deleteAreaBtn = L.DomUtil.create(
				"button",
				"leaflet-control-display-area-delete",
				areaMetaRow
			)
			this._deleteAreaBtn.setAttribute("type", "button")
			this._deleteAreaBtn.textContent = "Delete"

			this._areaList = L.DomUtil.create("div", "leaflet-control-display-area-list", areaSection)

			let filterHeader = L.DomUtil.create(
				"div",
				"leaflet-control-display-section-title-inline",
				areaSection
			)
			filterHeader.textContent = "Filters"
			let filterRow = L.DomUtil.create("div", "leaflet-control-display-filter-add", areaSection)
			this._filterTarget = L.DomUtil.create("select", "leaflet-control-display-input", filterRow)
			;["object", "npc"].forEach((value) => {
				let option = L.DomUtil.create("option", "", this._filterTarget)
				option.value = value
				option.textContent = value === "object" ? "Object" : "NPC"
			})
			this._filterBy = L.DomUtil.create("select", "leaflet-control-display-input", filterRow)
			;["name", "id", "action"].forEach((value) => {
				let option = L.DomUtil.create("option", "", this._filterBy)
				option.value = value
				option.textContent = value
			})
			this._filterValue = L.DomUtil.create("input", "leaflet-control-display-input", filterRow)
			this._filterValue.setAttribute("type", "text")
			this._filterValue.setAttribute("placeholder", "value")
			this._addFilterBtn = L.DomUtil.create(
				"button",
				"leaflet-control-display-area-delete",
				filterRow
			)
			this._addFilterBtn.setAttribute("type", "button")
			this._addFilterBtn.textContent = "Add"
			this._filterList = L.DomUtil.create("div", "leaflet-control-display-filter-list", areaSection)

			if (this.attachAutocomplete) {
				this.attachAutocomplete(this._filterValue, "data_osrs/object_name_collection.json")
			}

			let scaffoldRow = L.DomUtil.create("div", "leaflet-control-display-coords-row", areaSection)
			let scaffoldLabel = L.DomUtil.create("label", "leaflet-control-display-label", scaffoldRow)
			scaffoldLabel.textContent = "Scaffold"
			this._scaffoldOutput = L.DomUtil.create("textarea", "", scaffoldRow)
			this._scaffoldOutput.setAttribute("readOnly", true)
			this._scaffoldOutput.setAttribute("rows", "8")

			let manifestRow = L.DomUtil.create("div", "leaflet-control-display-coords-row", areaSection)
			let manifestLabel = L.DomUtil.create("label", "leaflet-control-display-label", manifestRow)
			manifestLabel.textContent = "JSON"
			this._manifestOutput = L.DomUtil.create("textarea", "", manifestRow)
			this._manifestOutput.setAttribute("readOnly", true)
			this._manifestOutput.setAttribute("rows", "5")

			L.DomEvent.on(this._areaLabelInput, "change", this._onAreaMetaChange, this)
			L.DomEvent.on(this._areaEnabledInput, "change", this._onAreaMetaChange, this)
			L.DomEvent.on(this._areaColorInput, "change", this._onAreaMetaChange, this)
			L.DomEvent.on(this._deleteAreaBtn, "click", this._deleteActiveArea, this)
			L.DomEvent.on(this._addFilterBtn, "click", this._addActiveFilter, this)
			L.DomEvent.on(this._filterTarget, "change", this._onFilterTargetChange, this)
			L.DomEvent.on(
				this._scaffoldOutput,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					if (this._scaffoldOutput.value) {
						navigator.clipboard.writeText(this._scaffoldOutput.value).then(() => {
							this._map.addMessage("Copied Simba scaffold to clipboard")
						})
					}
				},
				this
			)
			L.DomEvent.on(
				this._manifestOutput,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					if (this._manifestOutput.value) {
						navigator.clipboard.writeText(this._manifestOutput.value).then(() => {
							this._map.addMessage("Copied area JSON to clipboard")
						})
					}
				},
				this
			)

			// --- Box card ---
			this._boxCard = L.DomUtil.create(
				"form",
				"leaflet-control-display-form leaflet-control-display-form-rect",
				container
			)

			let boxRow = L.DomUtil.create("div", "leaflet-control-map-row", this._boxCard)
			let boxRowLabel = L.DomUtil.create("label", "leaflet-control-display-label", boxRow)
			boxRowLabel.innerHTML = "Box"
			this._boxField = L.DomUtil.create("input", "leaflet-control-map-input", boxRow)
			this._boxField.setAttribute("type", "text")
			this._boxField.setAttribute("readOnly", true)
			wrapWithCopyBtn(this._boxField, map)

			let arrayRow = L.DomUtil.create("div", "leaflet-control-map-row", this._boxCard)
			let arrayRowLabel = L.DomUtil.create("label", "leaflet-control-display-label", arrayRow)
			arrayRowLabel.innerHTML = "Array"
			this._arrayField = L.DomUtil.create("input", "leaflet-control-map-input", arrayRow)
			this._arrayField.setAttribute("type", "text")
			this._arrayField.setAttribute("readOnly", true)
			wrapWithCopyBtn(this._arrayField, map)

			let widthLabel = L.DomUtil.create("label", "leaflet-control-display-label", this._boxCard)
			widthLabel.innerHTML = "Width"
			this.width = L.DomUtil.create("input", "leaflet-control-display-input-number", this._boxCard)
			this.width.setAttribute("type", "number")
			this.width.setAttribute("name", "width")

			let heightLabel = L.DomUtil.create("label", "leaflet-control-display-label", this._boxCard)
			heightLabel.innerHTML = "Height"
			this.height = L.DomUtil.create("input", "leaflet-control-display-input-number", this._boxCard)
			this.height.setAttribute("type", "number")
			this.height.setAttribute("name", "height")

			let x1Label = L.DomUtil.create("label", "leaflet-control-display-label", this._boxCard)
			x1Label.innerHTML = "X1"
			this.x1 = L.DomUtil.create("input", "leaflet-control-display-input-number", this._boxCard)
			this.x1.setAttribute("type", "number")
			this.x1.setAttribute("name", "x1")

			let y1Label = L.DomUtil.create("label", "leaflet-control-display-label", this._boxCard)
			y1Label.innerHTML = "Y1"
			this.y1 = L.DomUtil.create("input", "leaflet-control-display-input-number", this._boxCard)
			this.y1.setAttribute("type", "number")
			this.y1.setAttribute("name", "y1")

			let x2Label = L.DomUtil.create("label", "leaflet-control-display-label", this._boxCard)
			x2Label.innerHTML = "X2"
			this.x2 = L.DomUtil.create("input", "leaflet-control-display-input-number", this._boxCard)
			this.x2.setAttribute("type", "number")
			this.x2.setAttribute("name", "x2")

			let y2Label = L.DomUtil.create("label", "leaflet-control-display-label", this._boxCard)
			y2Label.innerHTML = "Y2"
			this.y2 = L.DomUtil.create("input", "leaflet-control-display-input-number", this._boxCard)
			this.y2.setAttribute("type", "number")
			this.y2.setAttribute("name", "y2")
			;[this.width, this.height, this.x1, this.y1, this.x2, this.y2].forEach(function (input) {
				wrapWithCopyBtn(input, map)
			})

			let boxVertsRow = L.DomUtil.create("div", "leaflet-control-map-row", this._boxCard)
			let boxVertsLabel = L.DomUtil.create("label", "leaflet-control-display-label", boxVertsRow)
			boxVertsLabel.innerHTML = "Vertices"
			this._boxVertices = L.DomUtil.create("input", "leaflet-control-map-input", boxVertsRow)
			this._boxVertices.setAttribute("type", "text")
			this._boxVertices.setAttribute("readOnly", true)
			wrapWithCopyBtn(this._boxVertices, map)

			let boxCoordsRow = L.DomUtil.create(
				"div",
				"leaflet-control-display-coords-row",
				this._boxCard
			)
			let boxCoordsLabel = L.DomUtil.create("label", "leaflet-control-display-label", boxCoordsRow)
			boxCoordsLabel.innerHTML = "Coords"
			this._boxCoords = L.DomUtil.create("textarea", "", boxCoordsRow)
			this._boxCoords.setAttribute("readOnly", true)
			this._boxCoords.setAttribute("rows", "3")

			L.DomEvent.on(
				this._boxCoords,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					let text = this._boxCoords.value
					if (text) {
						navigator.clipboard.writeText(text).then(() => {
							this._map.addMessage("Copied box coordinates to clipboard")
						})
					}
				},
				this
			)

			// Box New button
			this._boxNewBtn = L.DomUtil.create(
				"button",
				"leaflet-control-display-submit leaflet-control-display-new-btn",
				this._boxCard
			)
			this._boxNewBtn.setAttribute("type", "button")
			this._boxNewBtn.innerHTML = newIconSvg + " New"

			L.DomEvent.on(
				this._boxNewBtn,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					this._handleNewBox()
				},
				this
			)

			this._boxCard.addEventListener("change", this.changeRect.bind(this))

			// --- Poly card ---
			this._polyCard = L.DomUtil.create(
				"div",
				"leaflet-control-display-form-poly leaflet-control-display-card-hidden",
				container
			)

			this._polyVertexList = L.DomUtil.create(
				"div",
				"leaflet-control-display-poly-vertices",
				this._polyCard
			)

			let polyVertsRow = L.DomUtil.create("div", "leaflet-control-map-row", this._polyCard)
			let polyVertsLabel = L.DomUtil.create("label", "leaflet-control-display-label", polyVertsRow)
			polyVertsLabel.innerHTML = "Vertices"
			this._polyVertices = L.DomUtil.create("input", "leaflet-control-map-input", polyVertsRow)
			this._polyVertices.setAttribute("type", "text")
			this._polyVertices.setAttribute("readOnly", true)
			wrapWithCopyBtn(this._polyVertices, map)

			let coordsRow = L.DomUtil.create("div", "leaflet-control-display-coords-row", this._polyCard)
			let coordsLabel = L.DomUtil.create("label", "leaflet-control-display-label", coordsRow)
			coordsLabel.innerHTML = "Coords"
			this._polyCoords = L.DomUtil.create("textarea", "", coordsRow)
			this._polyCoords.setAttribute("readOnly", true)
			this._polyCoords.setAttribute("rows", "3")

			L.DomEvent.on(
				this._polyCoords,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					let text = this._polyCoords.value
					if (text) {
						navigator.clipboard.writeText(text).then(() => {
							this._map.addMessage("Copied polygon coordinates to clipboard")
						})
					}
				},
				this
			)

			// Poly New button
			this._polyNewBtn = L.DomUtil.create(
				"button",
				"leaflet-control-display-submit leaflet-control-display-new-btn",
				this._polyCard
			)
			this._polyNewBtn.setAttribute("type", "button")
			this._polyNewBtn.innerHTML = newIconSvg + " New"

			L.DomEvent.on(
				this._polyNewBtn,
				"click",
				function (e) {
					L.DomEvent.stopPropagation(e)
					this._handleNewPoly()
				},
				this
			)

			return container
		},

		_getActiveArea: function () {
			return this._areas.find((area) => area.id === this._activeAreaId) || null
		},

		_createArea: function (mode, data) {
			let id = "area-" + this._nextAreaId++
			let color = this._areaColors[(this._nextAreaId - 2) % this._areaColors.length]
			let area = L.extend(
				{
					id: id,
					label: "Area " + (this._nextAreaId - 1),
					mode: mode,
					plane: this._map.getPlane(),
					color: color,
					enabled: true,
					filters: []
				},
				data
			)
			this._areas.push(area)
			this._activeAreaId = id
			return area
		},

		_syncActiveAreaFromBox: function (bounds) {
			if (!bounds) return null
			let plane = this._map.getPlane()
			let data = boxDataFromBounds(bounds, plane)
			let area = this._getActiveArea()
			if (!area || area.mode !== "box") {
				area = this._createArea("box", {})
			}
			L.extend(area, data, {
				mode: "box",
				plane: plane,
				latlngs: [
					L.latLng(bounds.getNorth(), bounds.getWest()),
					L.latLng(bounds.getSouth(), bounds.getEast())
				]
			})
			this._refreshAreaUi()
			return area
		},

		_syncActiveAreaFromPoly: function (latlngs) {
			if (!latlngs || latlngs.length < 3) return null
			let plane = this._map.getPlane()
			let data = polyDataFromLatLngs(latlngs, plane)
			let area = this._getActiveArea()
			if (!area || area.mode !== "poly") {
				area = this._createArea("poly", {})
			}
			L.extend(area, data, {
				mode: "poly",
				plane: plane,
				latlngs: cloneLatLngs(latlngs)
			})
			this._refreshAreaUi()
			return area
		},

		_refreshAreaUi: function () {
			this._renderAreaList()
			this._renderFilterList()
			this._renderAreaLayers()
			this._updateAreaMetaInputs()
			this._updateScaffold()
			this._emitSelection()
			this._syncFilterPreview()
		},

		_updateAreaMetaInputs: function () {
			if (!this._areaLabelInput) return
			let area = this._getActiveArea()
			let disabled = !area
			this._areaLabelInput.disabled = disabled
			this._areaEnabledInput.disabled = disabled
			this._areaColorInput.disabled = disabled
			this._deleteAreaBtn.disabled = disabled
			this._addFilterBtn.disabled = disabled
			if (!area) {
				this._areaLabelInput.value = ""
				this._areaEnabledInput.checked = false
				this._areaColorInput.value = "#00d4ff"
				return
			}
			if (document.activeElement !== this._areaLabelInput) {
				this._areaLabelInput.value = area.label
			}
			this._areaEnabledInput.checked = area.enabled
			this._areaColorInput.value = area.color
		},

		_onAreaMetaChange: function () {
			let area = this._getActiveArea()
			if (!area) return
			area.label = this._areaLabelInput.value.trim() || area.label
			area.enabled = this._areaEnabledInput.checked
			area.color = this._areaColorInput.value
			if (this._mode === "box" && this.rect) {
				this.rect.setStyle({ color: area.color, fillColor: area.color })
			} else if (this.poly) {
				this.poly.setStyle({ color: area.color, fillColor: area.color })
			}
			this._refreshAreaUi()
		},

		_renderAreaList: function () {
			if (!this._areaList) return
			this._areaList.innerHTML = ""
			if (!this._areas.length) {
				let empty = L.DomUtil.create("div", "leaflet-control-display-area-empty", this._areaList)
				empty.textContent = "Draw an area to add it here."
				return
			}
			this._areas.forEach((area) => {
				let row = L.DomUtil.create("button", "leaflet-control-display-area-row", this._areaList)
				row.setAttribute("type", "button")
				if (area.id === this._activeAreaId) {
					L.DomUtil.addClass(row, "leaflet-control-display-area-row-active")
				}
				let swatch = L.DomUtil.create("span", "leaflet-control-display-area-swatch", row)
				swatch.style.background = area.color
				let name = L.DomUtil.create("span", "leaflet-control-display-area-name", row)
				name.textContent = area.label
				let meta = L.DomUtil.create("span", "leaflet-control-display-area-kind", row)
				meta.textContent = (area.enabled ? "" : "off ") + area.mode + " p" + area.plane
				L.DomEvent.on(
					row,
					"click",
					function (e) {
						L.DomEvent.stopPropagation(e)
						this._selectArea(area.id)
					},
					this
				)
			})
		},

		_renderAreaLayers: function () {
			if (!this._map) return
			for (let id in this._areaLayers) {
				this._areaLayers[id].remove()
			}
			this._areaLayers = {}
			this._areas.forEach((area) => {
				if (area.id === this._activeAreaId || !area.latlngs || !area.enabled) return
				let layer =
					area.mode === "box"
						? L.rectangle(L.latLngBounds(area.latlngs), {
								color: area.color,
								fillColor: area.color,
								fillOpacity: 0.08,
								weight: 2,
								dashArray: "4,4",
								bubblingMouseEvents: false
							})
						: L.polygon(area.latlngs, {
								color: area.color,
								fillColor: area.color,
								fillOpacity: 0.08,
								weight: 2,
								dashArray: "4,4",
								bubblingMouseEvents: false
							})
				layer.bindTooltip(area.label, {
					permanent: true,
					direction: "center",
					className: "leaflet-control-display-area-tooltip"
				})
				layer.addTo(this._map)
				this._areaLayers[area.id] = layer
			})
		},

		_selectArea: function (id) {
			let area = this._areas.find((item) => item.id === id)
			if (!area) return
			this._cancelDrawing()
			this._activeAreaId = id
			this._switchMode(area.mode)

			if (area.mode === "box") {
				let bounds = L.latLngBounds(area.latlngs)
				this.rect.setBounds(bounds)
				if (!this.rect._map) this.rect.addTo(this._map)
				this.updateBox(bounds)
			} else {
				if (this.poly) {
					this.poly.remove()
				}
				this.poly = new L.DraggablePolygon(area.latlngs, L.extend({ owner: this }, polyOpts))
				this.poly.addTo(this._map)
				this._tileHighlight.addTo(this._map)
				this._polyLatlngs = cloneLatLngs(area.latlngs)
				this.updatePoly()
			}
			this._refreshAreaUi()
		},

		_deleteActiveArea: function (e) {
			if (e) L.DomEvent.stopPropagation(e)
			let activeId = this._activeAreaId
			if (!activeId) return
			let idx = this._areas.findIndex((area) => area.id === activeId)
			if (idx === -1) return
			this._areas.splice(idx, 1)
			this._activeAreaId = this._areas[idx] ? this._areas[idx].id : this._areas[idx - 1]?.id || null
			if (this._activeAreaId) {
				this._selectArea(this._activeAreaId)
			} else {
				if (this.rect && this.rect._map) this.rect.remove()
				if (this.poly) {
					this.poly.remove()
					this.poly = null
				}
				if (this._tileHighlight._map) this._tileHighlight.remove()
				this._refreshAreaUi()
			}
		},

		_onFilterTargetChange: function () {
			if (!this._filterValue || !this.attachAutocomplete) return
			let url =
				this._filterTarget.value === "npc"
					? "data_osrs/npc_name_collection.json"
					: "data_osrs/object_name_collection.json"
			this.attachAutocomplete(this._filterValue, url)
		},

		_addActiveFilter: function (e) {
			if (e) L.DomEvent.stopPropagation(e)
			let area = this._getActiveArea()
			if (!area) return
			let value = this._filterValue.value.trim()
			if (!value) return
			area.filters.push({
				target: this._filterTarget.value,
				by: this._filterBy.value,
				value: value
			})
			this._filterValue.value = ""
			this._refreshAreaUi()
		},

		_renderFilterList: function () {
			if (!this._filterList) return
			this._filterList.innerHTML = ""
			let area = this._getActiveArea()
			if (!area || !area.filters.length) {
				let empty = L.DomUtil.create("div", "leaflet-control-display-area-empty", this._filterList)
				empty.textContent = "No filters on active area."
				return
			}
			area.filters.forEach((filter, idx) => {
				let row = L.DomUtil.create("div", "leaflet-control-display-filter-row", this._filterList)
				let text = L.DomUtil.create("span", "", row)
				text.textContent = filter.target + " " + filter.by + ": " + filter.value
				let del = L.DomUtil.create("button", "leaflet-control-display-area-delete", row)
				del.setAttribute("type", "button")
				del.textContent = "x"
				L.DomEvent.on(
					del,
					"click",
					function (e) {
						L.DomEvent.stopPropagation(e)
						area.filters.splice(idx, 1)
						this._refreshAreaUi()
					},
					this
				)
			})
		},

		_hasPreviewableObjectFilters: function () {
			return this._areas.some((area) =>
				(area.filters || []).some((filter) => area.enabled && filter.target === "object")
			)
		},

		_hasNpcFilters: function () {
			return this._areas.some((area) =>
				(area.filters || []).some((filter) => area.enabled && filter.target === "npc")
			)
		},

		_npcFilterMatches: function (filter, item) {
			if (filter.by === "id") {
				return String(item.id) === String(filter.value)
			}
			if (filter.by === "action") {
				return (item.actions || []).some(
					(action) => String(action).toLowerCase() === String(filter.value).toLowerCase()
				)
			}
			return String(item.name || "").toLowerCase() === String(filter.value).toLowerCase()
		},

		_npcMatchesAreaFilters: function (item) {
			let lat = item.y + 0.5
			let lng = item.x + 0.5
			return this._areas.some((area) => {
				if (!area.enabled || !areaContains(area, lat, lng)) return false
				let filters = (area.filters || []).filter((filter) => filter.target === "npc")
				return filters.length && filters.some((filter) => this._npcFilterMatches(filter, item))
			})
		},

		_syncFilterPreview: function () {
			if (
				!this._map ||
				typeof L.objectIcons !== "function" ||
				typeof L.dynamicIcons !== "function"
			) {
				return
			}
			let previewSignature = JSON.stringify(
				this._areas.map((area) => ({
					id: area.id,
					enabled: area.enabled,
					mode: area.mode,
					plane: area.plane,
					bounds: area.globalBox,
					vertices: area.vertices,
					filters: area.filters
				}))
			)

			if (this._hasPreviewableObjectFilters()) {
				if (!this._objectFilterPreview) {
					this._objectFilterPreview = L.objectIcons({
						folder: "data_osrs",
						shardPath: "data_osrs/object_pins"
					})
				}
				if (!this._objectFilterPreview._map) {
					this._objectFilterPreview.addTo(this._map)
				} else {
					this._objectFilterPreview._onSelectionChange()
				}
			} else if (this._objectFilterPreview) {
				this._objectFilterPreview.remove()
				this._objectFilterPreview = null
			}

			if (this._hasNpcFilters()) {
				if (this._npcFilterPreview && this._npcPreviewSignature !== previewSignature) {
					this._npcFilterPreview.remove()
					this._npcFilterPreview = null
				}
				if (!this._npcFilterPreview) {
					this._npcPreviewSignature = previewSignature
					this._npcFilterPreview = L.dynamicIcons({
						dataPath: "data_osrs/NPCList_OSRS.json",
						minZoom: 2,
						show3d: false,
						markerClass: "huechange",
						filterFn: (item) => this._npcMatchesAreaFilters(item)
					}).addTo(this._map)
				}
			} else if (this._npcFilterPreview) {
				this._npcFilterPreview.remove()
				this._npcFilterPreview = null
				this._npcPreviewSignature = null
			}
		},

		_clearFilterPreviews: function () {
			if (this._objectFilterPreview) {
				this._objectFilterPreview.remove()
				this._objectFilterPreview = null
			}
			if (this._npcFilterPreview) {
				this._npcFilterPreview.remove()
				this._npcFilterPreview = null
				this._npcPreviewSignature = null
			}
		},

		_updateScaffold: function () {
			if (!this._scaffoldOutput) return
			this._scaffoldOutput.value = this._generateScaffold()
			if (this._manifestOutput) {
				this._manifestOutput.value = this._generateManifest()
			}
		},

		_generateManifest: function () {
			return JSON.stringify(
				{
					version: 1,
					generatedBy: "WaspScripts Web Map",
					areas: this._areas.map((area) => ({
						id: area.id,
						label: area.label,
						mode: area.mode,
						plane: area.plane,
						color: area.color,
						enabled: area.enabled,
						globalBox: area.globalBox,
						chunkBox: area.chunkBox,
						vertices: area.vertices,
						tiles: area.tiles,
						tilesCapped: !!area.tilesCapped,
						latlngs: (area.latlngs || []).map((ll) => [ll.lat, ll.lng]),
						filters: area.filters || []
					}))
				},
				null,
				2
			)
		},

		_generateScaffold: function () {
			let areas = this._areas.filter((area) => area.enabled && area.chunkBox)
			if (!areas.length) {
				return "// Draw and enable one or more areas to generate Simba 2.0 scaffold."
			}

			let usedNames = {}
			let areaNames = new Map()
			areas.forEach((area) => {
				areaNames.set(area.id, uniqueIdentifier(area.label, usedNames))
			})

			let filterEntries = []
			areas.forEach((area) => {
				;(area.filters || []).forEach((filter, idx) => {
					filterEntries.push({
						area: area,
						filter: filter,
						name: uniqueIdentifier(
							areaNames.get(area.id) + " " + filter.target + " " + filter.by + " " + (idx + 1),
							usedNames
						)
					})
				})
			})

			let lines = [
				"// Generated from WaspScripts Web Map.",
				"// Review object sizes/uptext/actions before using interactions.",
				"",
				"{$I WaspLib/osrs.simba}",
				"",
				"var"
			]

			areas.forEach((area, idx) => {
				let name = areaNames.get(area.id)
				lines.push("  " + name + "Chunk: TBox = " + boxLiteral(area.chunkBox) + ";")
				lines.push("  " + name + "Area: TBox = " + boxLiteral(area.globalBox) + ";")
				if (area.mode === "poly") {
					lines.push("  " + name + "Poly: TPolygon = " + pointArrayLiteral(area.vertices) + ";")
					if (area.tilesCapped) {
						lines.push("  // " + name + "Tiles omitted: area exceeds 50,000 tiles.")
					} else {
						lines.push(
							"  " + name + "Tiles: TPointArray = " + pointArrayLiteral(area.tiles || []) + ";"
						)
					}
				} else {
					lines.push(
						"  " + name + "Vertices: TPointArray = " + pointArrayLiteral(area.vertices) + ";"
					)
				}
				if (idx < areas.length - 1) lines.push("")
			})

			if (filterEntries.length) {
				lines.push("")
				filterEntries.forEach((entry) => {
					let typeName = entry.filter.target === "object" ? "TRSObjectArray" : "TRSEntityArray"
					lines.push("  " + entry.name + ": " + typeName + ";")
				})
			}

			lines.push("")
			lines.push("procedure SetupGeneratedMap();")
			lines.push("begin")
			lines.push("  Map.Setup([")
			areas.forEach((area, idx) => {
				let suffix = idx === areas.length - 1 ? "" : ","
				lines.push("    Chunk(" + chunkLiteral(area.chunkBox) + ", " + area.plane + ")" + suffix)
			})
			lines.push("  ]);")
			lines.push("end;")

			if (filterEntries.length) {
				lines.push("")
				lines.push("procedure SetupGeneratedFilters();")
				lines.push("begin")
				filterEntries.forEach((entry) => {
					let filter = entry.filter
					let areaName = areaNames.get(entry.area.id)
					if (filter.target === "object") {
						let source =
							filter.by === "id"
								? "ObjectsJSON.GetByID(" + filter.value + ")"
								: filter.by === "action"
									? "ObjectsJSON.GetByAction(" + simbaString(filter.value) + ")"
									: "ObjectsJSON.GetByName(" + simbaString(filter.value) + ")"
						lines.push("  " + entry.name + " := TRSObjectArray.Create(Map.Walker, " + source + ");")
					} else {
						let source =
							filter.by === "id"
								? "NPCsJSON.GetByID(" + filter.value + ")"
								: filter.by === "action"
									? "NPCsJSON.GetByAction(" + simbaString(filter.value) + ")"
									: "NPCsJSON.GetByName(" + simbaString(filter.value) + ")"
						lines.push("  " + entry.name + " := TRSEntityArray.Create(Map.Walker, " + source + ");")
					}
					lines.push("  // " + entry.name + " belongs to " + areaName + "Area.")
				})
				lines.push(
					"  // Filter resulting coordinates against each exported Area/Poly before interacting."
				)
				lines.push("end;")
				lines.push("")
				lines.push("procedure SetupGeneratedScaffold();")
				lines.push("begin")
				lines.push("  SetupGeneratedMap();")
				lines.push("  SetupGeneratedFilters();")
				lines.push("end;")
			} else {
				lines.push("")
				lines.push("procedure SetupGeneratedScaffold();")
				lines.push("begin")
				lines.push("  SetupGeneratedMap();")
				lines.push("end;")
			}

			return lines.join("\n")
		},

		_switchMode: function (mode) {
			if (mode === this._mode) return
			this._cancelDrawing()

			this._mode = mode

			if (mode === "box") {
				L.DomUtil.addClass(this._boxBtn, "leaflet-control-display-mode-btn-active")
				L.DomUtil.removeClass(this._polyBtn, "leaflet-control-display-mode-btn-active")
				L.DomUtil.removeClass(this._boxCard, "leaflet-control-display-card-hidden")
				L.DomUtil.addClass(this._polyCard, "leaflet-control-display-card-hidden")

				if (this.poly && this._map) {
					this._polyLatlngs = this.poly.getVertexLatLngs()
					this.poly.remove()
				}
				if (this._tileHighlight._map) this._tileHighlight.remove()

				if (this._expanded) {
					let bounds = this._map.getBounds().pad(-0.3)
					this._suspendAreaSync = !this._activeAreaId
					this.rect.setBounds(bounds)
					this.rect.addTo(this._map)
					this._suspendAreaSync = false
				}
			} else {
				L.DomUtil.removeClass(this._boxBtn, "leaflet-control-display-mode-btn-active")
				L.DomUtil.addClass(this._polyBtn, "leaflet-control-display-mode-btn-active")
				L.DomUtil.addClass(this._boxCard, "leaflet-control-display-card-hidden")
				L.DomUtil.removeClass(this._polyCard, "leaflet-control-display-card-hidden")

				if (this.rect._map) {
					this.rect.remove()
				}

				if (this._expanded) {
					let latlngs = this._polyLatlngs || this._defaultPentagon()
					this._suspendAreaSync = !this._activeAreaId
					this.poly = new L.DraggablePolygon(latlngs, L.extend({ owner: this }, polyOpts))
					this.poly.addTo(this._map)
					this._tileHighlight.addTo(this._map)
					this._suspendAreaSync = false
				}
			}
		},

		_defaultPentagon: function () {
			let center = this._map.getCenter()
			let zoom = this._map.getZoom()
			let r = Math.max(8, 80 / Math.pow(2, zoom - 2)) * (2 / 3)
			let pts = []
			for (let i = 0; i < 5; i++) {
				let angle = Math.PI / 2 + (2 * Math.PI * i) / 5
				pts.push(
					L.latLng(
						Math.trunc(center.lat + r * Math.sin(angle)),
						Math.trunc(center.lng + r * Math.cos(angle))
					)
				)
			}
			return pts
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

			let planeOffset = 13056 * this._map.getPlane()
			let nw = gameToMap(x1 - planeOffset, y1)
			let se = gameToMap(x2 - planeOffset, y2)
			let bounds = L.latLngBounds([nw, se])
			this.rect.setBounds(bounds)
			this.updateBox(bounds)
		},

		updateBox: function (bounds) {
			let chunk = {
				x1: (bounds.getWest() >> 6) - 1,
				y1: (bounds.getNorth() >> 6) + 1,
				x2: (bounds.getEast() >> 6) + 1,
				y2: (bounds.getSouth() >> 6) - 1
			}

			let planeOffset = 13056 * this._map.getPlane()
			let global = {
				x1: bounds.getWest() * 4 - 4096 + planeOffset,
				y1: 60 - (bounds.getNorth() * 4 - 50370),
				x2: bounds.getEast() * 4 - 4096 + planeOffset,
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
			this._boxField.value = `Box(${global.x1}, ${global.y1}, ${global.x2}, ${global.y2})`
			this._arrayField.value = `[${global.x1}, ${global.y1}, ${global.x2}, ${global.y2}]`
			this._boxVertices.value = formatVertices([
				[global.x1, global.y1],
				[global.x2, global.y1],
				[global.x2, global.y2],
				[global.x1, global.y2]
			])
			this.map1400.value = `Map.SetupChunk(Chunk([${chunk.x1}, ${chunk.y1}, ${chunk.x2}, ${
				chunk.y2
			}], ${this._map.getPlane()}));`

			this.map2000.value = `Map.Setup([Chunk(Box(${chunk.x1}, ${chunk.y1}, ${chunk.x2}, ${
				chunk.y2
			}), ${this._map.getPlane()})]);`

			let tMinX = Math.floor(global.x1 / 4) * 4
			let tMaxX = Math.ceil(global.x2 / 4) * 4
			let tMinY = Math.floor((global.y1 - 2) / 4) * 4 + 2
			let tMaxY = Math.ceil((global.y2 - 2) / 4) * 4 + 2
			let tileCount = ((tMaxX - tMinX) / 4) * ((tMaxY - tMinY) / 4)
			if (tileCount > 50000) {
				this._boxCoords.value = "Area too large (>50,000 tiles)"
			} else {
				let tiles = []
				for (let y = tMinY; y < tMaxY; y += 4) {
					for (let x = tMinX; x < tMaxX; x += 4) {
						tiles.push([x, y + 4])
					}
				}
				this._boxCoords.value = formatVertices(tiles)
			}

			if (!this._suspendAreaSync) this._syncActiveAreaFromBox(bounds)
		},

		update: function (boundsOrVertex) {
			if (this._mode === "box") {
				this.updateBox(boundsOrVertex)
			}
		},

		updatePoly: function () {
			if (!this.poly) return

			let latlngs = this.poly.getVertexLatLngs()
			let gameCoords = latlngs.map((ll) => mapToGame(ll))
			let planeOffset = 13056 * this._map.getPlane()

			this._polyVertices.value = formatVertices(
				gameCoords.map((c) => [Math.round(c.x + planeOffset), Math.round(c.y)])
			)

			this._updateVertexList(gameCoords, planeOffset)

			let result = computeTilesInPolygon(gameCoords)
			if (result === null) {
				this._polyCoords.value = "Area too large (>50,000 tiles)"
				this._tileHighlight.setTiles([], [])
			} else {
				let { selected, border } = result
				let outputTiles = selected.map((t) => [t[0] + planeOffset, t[1] + 4])
				this._polyCoords.value = formatVertices(outputTiles)
				this._tileHighlight.setTiles(selected, border)
			}

			// Compute bounding box chunk for Simba fields
			let minX = Infinity,
				maxX = -Infinity,
				minY = Infinity,
				maxY = -Infinity
			for (let c of gameCoords) {
				if (c.x < minX) minX = c.x
				if (c.x > maxX) maxX = c.x
				if (c.y < minY) minY = c.y
				if (c.y > maxY) maxY = c.y
			}
			let chunk = {
				x1: (((minX + 4096) / 4) >> 6) - 1,
				y1: (((50430 - minY) / 4) >> 6) + 1,
				x2: (((maxX + 4096) / 4) >> 6) + 1,
				y2: (((50430 - maxY) / 4) >> 6) - 1
			}
			let plane = this._map.getPlane()
			this.map1400.value = `Map.SetupChunk(Chunk([${chunk.x1}, ${chunk.y1}, ${chunk.x2}, ${chunk.y2}], ${plane}));`
			this.map2000.value = `Map.Setup([Chunk(Box(${chunk.x1}, ${chunk.y1}, ${chunk.x2}, ${chunk.y2}), ${plane})]);`

			if (!this._suspendAreaSync) this._syncActiveAreaFromPoly(latlngs)
		},

		// Publishes active and aggregate selections. Legacy consumers read
		// map._areaSelection; newer layers can use map._areaSelections.
		_emitSelection: function () {
			let map = this._map
			if (!map) return
			let sel = null

			let activeArea = this._getActiveArea()
			if (activeArea && activeArea.mode === "box" && activeArea.bounds) {
				let b = activeArea.bounds
				sel = {
					mode: "box",
					area: activeArea,
					bounds: b,
					contains: function (lat, lng) {
						return b.contains([lat, lng])
					}
				}
			} else if (activeArea && activeArea.mode === "poly" && activeArea.latlngs) {
				let verts = activeArea.latlngs
				let pts = verts.map((ll) => ({ x: ll.lng, y: ll.lat }))
				sel = {
					mode: "poly",
					area: activeArea,
					bounds: L.latLngBounds(verts),
					contains: function (lat, lng) {
						return pointInPolygon(lng, lat, pts)
					}
				}
			}

			let enabledAreas = this._areas.filter((area) => area.enabled && area.bounds)
			let aggregate = null
			if (enabledAreas.length) {
				let bounds = L.latLngBounds(
					enabledAreas[0].bounds.getSouthWest(),
					enabledAreas[0].bounds.getNorthEast()
				)
				enabledAreas.slice(1).forEach((area) => bounds.extend(area.bounds))
				aggregate = {
					areas: enabledAreas,
					activeId: this._activeAreaId,
					bounds: bounds,
					contains: function (lat, lng) {
						return enabledAreas.some((area) => areaContains(area, lat, lng))
					},
					matches: function (lat, lng) {
						return enabledAreas.filter((area) => areaContains(area, lat, lng))
					}
				}
			}

			map._areaSelection = sel
			map._areaSelections = aggregate
			map.fire("areaselection", { selection: sel, selections: aggregate })
		},

		_clearSelection: function () {
			if (!this._map) return
			this._map._areaSelection = null
			this._map._areaSelections = null
			this._map.fire("areaselection", { selection: null, selections: null })
		},

		_updateVertexList: function (gameCoords, planeOffset) {
			this._polyVertexList.innerHTML = ""

			gameCoords.forEach((coord, i) => {
				let row = L.DomUtil.create(
					"div",
					"leaflet-control-display-poly-vertex-row",
					this._polyVertexList
				)

				let xLabel = L.DomUtil.create("label", "leaflet-control-display-label", row)
				xLabel.textContent = "V" + (i + 1) + " X"
				xLabel.title = "Vertex " + (i + 1)

				let xInput = L.DomUtil.create("input", "leaflet-control-display-input-number", row)
				xInput.setAttribute("type", "number")
				xInput.value = Math.round(coord.x + planeOffset)
				xInput.dataset.index = i
				xInput.dataset.axis = "x"
				wrapWithCopyBtn(xInput, this._map)

				let yLabel = L.DomUtil.create("label", "leaflet-control-display-label", row)
				yLabel.textContent = "Y"
				yLabel.title = "Vertex " + (i + 1)

				let yInput = L.DomUtil.create("input", "leaflet-control-display-input-number", row)
				yInput.setAttribute("type", "number")
				yInput.value = Math.round(coord.y)
				yInput.dataset.index = i
				yInput.dataset.axis = "y"
				wrapWithCopyBtn(yInput, this._map)

				L.DomEvent.on(xInput, "change", this._onVertexInputChange, this)
				L.DomEvent.on(yInput, "change", this._onVertexInputChange, this)
			})
		},

		_onVertexInputChange: function (e) {
			let input = e.target
			let idx = Number(input.dataset.index)
			if (!this.poly || idx >= this.poly.vertices.length) return

			let latlngs = this.poly.getVertexLatLngs()
			let game = mapToGame(latlngs[idx])
			let planeOffset = 13056 * this._map.getPlane()

			if (input.dataset.axis === "x") {
				game.x = Number(input.value) - planeOffset
			} else {
				game.y = Number(input.value)
			}

			let newLatLng = gameToMap(game.x, game.y)
			this.poly.vertices[idx].setLatLng(newLatLng).trunc()
			this.poly.setLatLngs(this.poly.vertices.map((v) => v.getLatLng()))
			this.updatePoly()
		},

		// --- Draw cursor ---
		_createDrawCursor: function (latlng) {
			if (!this._drawCursor) {
				this._drawCursor = L.circleMarker(latlng, {
					radius: 5,
					color: "#00d4ff",
					fillColor: "#00d4ff",
					fillOpacity: 0.4,
					weight: 2,
					interactive: false
				}).addTo(this._map)
			} else {
				this._drawCursor.setLatLng(latlng)
			}
		},

		_removeDrawCursor: function () {
			if (this._drawCursor) {
				this._drawCursor.remove()
				this._drawCursor = null
			}
			if (this._map) {
				this._map._hidePositionRect = false
			}
		},

		// --- Drawing state machine ---
		_handleNewBox: function () {
			if (this._drawState === "box_first" || this._drawState === "box_second") {
				this._cancelDrawing()
				return
			}
			this._cancelDrawing()

			if (this.rect._map) this.rect.remove()
			this._clearSelection()
			this._pendingPreviousAreaId = this._activeAreaId
			this._activeAreaId = null
			this._refreshAreaUi()
			this._drawState = "box_first"
			this._map._hidePositionRect = true
			this._map.getContainer().style.cursor = "crosshair"
			this._boxNewBtn.innerHTML = newIconSvg + " Cancel"

			this._drawMapClick = this._onDrawMapClick.bind(this)
			this._drawMapMove = this._onDrawMapMove.bind(this)
			this._map.on("click", this._drawMapClick)
			this._map.on("mousemove", this._drawMapMove)
		},

		_handleNewPoly: function () {
			if (this._drawState === "poly_first" || this._drawState === "poly_drawing") {
				this._cancelDrawing()
				return
			}
			this._cancelDrawing()

			if (this.poly) {
				this._polyLatlngs = this.poly.getVertexLatLngs()
				this.poly.remove()
				this.poly = null
			}
			if (this._tileHighlight._map) this._tileHighlight.remove()
			this._clearSelection()
			this._pendingPreviousAreaId = this._activeAreaId
			this._activeAreaId = null
			this._refreshAreaUi()
			this._drawState = "poly_first"
			this._map._hidePositionRect = true
			this._drawPoints = []
			this._map.getContainer().style.cursor = "crosshair"
			this._polyNewBtn.innerHTML = newIconSvg + " Cancel"

			this._previewLine = L.polyline([], {
				color: "#00d4ff",
				weight: 2,
				dashArray: "6,4",
				bubblingMouseEvents: false
			}).addTo(this._map)

			this._closeIndicator = null

			this._drawMapClick = this._onDrawMapClick.bind(this)
			this._drawMapMove = this._onDrawMapMove.bind(this)
			this._map.on("click", this._drawMapClick)
			this._map.on("mousemove", this._drawMapMove)
		},

		_onDrawMapClick: function (e) {
			let latlng = L.latLng(Math.round(e.latlng.lat), Math.round(e.latlng.lng))

			if (this._drawState === "box_first") {
				this._drawCorner1 = latlng
				this._drawRect = L.rectangle([latlng, latlng], {
					color: "#00d4ff",
					fillColor: "#00d4ff",
					fillOpacity: 0.15,
					weight: 3,
					dashArray: "6,4"
				}).addTo(this._map)
				this._drawState = "box_second"
			} else if (this._drawState === "box_second") {
				this._map.off("mousemove", this._drawMapMove)
				this._map.off("click", this._drawMapClick)
				if (this._drawRect) {
					this._drawRect.remove()
					this._drawRect = null
				}
				this._removeDrawCursor()
				this._map.getContainer().style.cursor = ""
				this._boxNewBtn.innerHTML = newIconSvg + " New"

				let bounds = L.latLngBounds([this._drawCorner1, latlng])
				this.rect.setBounds(bounds)
				this.rect.addTo(this._map)
				this._drawState = null
				this._pendingPreviousAreaId = null
				this.updateBox(bounds)
			} else if (this._drawState === "poly_first") {
				this._drawPoints.push(latlng)
				this._drawState = "poly_drawing"
			} else if (this._drawState === "poly_drawing") {
				// Check if closing
				if (this._drawPoints.length >= 3) {
					let startPt = this._map.latLngToLayerPoint(this._drawPoints[0])
					let clickPt = this._map.latLngToLayerPoint(latlng)
					let dist = startPt.distanceTo(clickPt)
					if (dist <= 10) {
						this._finishPolyDrawing()
						return
					}
				}
				this._drawPoints.push(latlng)
				this._updateCloseIndicator()
			}
		},

		_onDrawMapMove: function (e) {
			let latlng = L.latLng(Math.round(e.latlng.lat), Math.round(e.latlng.lng))
			this._createDrawCursor(latlng)

			if (this._drawState === "box_second" && this._drawRect) {
				this._drawRect.setBounds(L.latLngBounds([this._drawCorner1, latlng]))
			} else if (this._drawState === "poly_first" || this._drawState === "poly_drawing") {
				let pts = this._drawPoints.concat([latlng])
				if (this._previewLine) {
					this._previewLine.setLatLngs(pts)
				}
			}
		},

		_updateCloseIndicator: function () {
			if (this._closeIndicator) {
				this._closeIndicator.remove()
				this._closeIndicator = null
			}
			if (this._drawPoints.length >= 3) {
				this._closeIndicator = L.circleMarker(this._drawPoints[0], {
					radius: 8,
					color: "#00d4ff",
					fillColor: "#00d4ff",
					fillOpacity: 0.3,
					weight: 2,
					bubblingMouseEvents: false
				}).addTo(this._map)
			}
		},

		_finishPolyDrawing: function () {
			this._map.off("click", this._drawMapClick)
			this._map.off("mousemove", this._drawMapMove)
			if (this._previewLine) {
				this._previewLine.remove()
				this._previewLine = null
			}
			if (this._closeIndicator) {
				this._closeIndicator.remove()
				this._closeIndicator = null
			}
			this._removeDrawCursor()
			this._map.getContainer().style.cursor = ""
			this._polyNewBtn.innerHTML = newIconSvg + " New"

			this.poly = new L.DraggablePolygon(this._drawPoints, L.extend({ owner: this }, polyOpts))
			this.poly.addTo(this._map)
			this._tileHighlight.addTo(this._map)
			this._polyLatlngs = this._drawPoints.slice()
			this._drawPoints = []
			this._drawState = null
			this._pendingPreviousAreaId = null
			this.updatePoly()
		},

		_cancelDrawing: function () {
			if (!this._drawState) return

			this._map.off("click", this._drawMapClick)
			this._map.off("mousemove", this._drawMapMove)
			this._removeDrawCursor()
			this._map.getContainer().style.cursor = ""

			if (this._drawRect) {
				this._drawRect.remove()
				this._drawRect = null
			}
			if (this._previewLine) {
				this._previewLine.remove()
				this._previewLine = null
			}
			if (this._closeIndicator) {
				this._closeIndicator.remove()
				this._closeIndicator = null
			}

			if (this._pendingPreviousAreaId) {
				let previousId = this._pendingPreviousAreaId
				this._pendingPreviousAreaId = null
				this._drawPoints = []
				this._drawState = null
				this._selectArea(previousId)
				return
			}

			if (this._drawState === "box_first" || this._drawState === "box_second") {
				this._boxNewBtn.innerHTML = newIconSvg + " New"
			} else if (this._drawState === "poly_first" || this._drawState === "poly_drawing") {
				this._polyNewBtn.innerHTML = newIconSvg + " New"
			}

			this._drawPoints = []
			this._drawState = null
			this._refreshAreaUi()
		},

		expand: function () {
			this._map._clickCopyDisabled = true

			if (this._mode === "box") {
				let bounds = this._map.getBounds().pad(-0.3)
				this._suspendAreaSync = true
				this.rect.setBounds(bounds)
				this.rect.addTo(this._map)
				this._suspendAreaSync = false
			} else {
				let latlngs = this._polyLatlngs || this._defaultPentagon()
				this._suspendAreaSync = true
				this.poly = new L.DraggablePolygon(latlngs, L.extend({ owner: this }, polyOpts))
				this.poly.addTo(this._map)
				this._tileHighlight.addTo(this._map)
				this._suspendAreaSync = false
			}

			return L.Control.Display.prototype.expand.call(this)
		},

		_onGotoBox: function (e) {
			let gc = e.gameCoords
			let planeOffset = 13056 * this._map.getPlane()
			let nw = gameToMap(gc.x1 - planeOffset, gc.y1)
			let se = gameToMap(gc.x2 - planeOffset, gc.y2)
			let bounds = L.latLngBounds([nw, se])

			if (this._mode !== "box") this._switchMode("box")
			this._cancelDrawing()
			if (!this._expanded) this.expand()

			this.rect.setBounds(bounds)
			if (!this.rect._map) this.rect.addTo(this._map)
			this.updateBox(bounds)
		},

		collapse: function () {
			this._map._clickCopyDisabled = false
			this._cancelDrawing()

			if (this.rect._map) {
				this.rect.remove()
			}
			if (this.poly) {
				this._polyLatlngs = this.poly.getVertexLatLngs()
				this.poly.remove()
				this.poly = null
			}
			if (this._tileHighlight._map) this._tileHighlight.remove()

			this._clearSelection()
			this._clearFilterPreviews()

			return L.Control.Display.prototype.collapse.call(this)
		}
	})

	L.control.display.rect = function (options) {
		return new L.Control.Display.Rect(options)
	}
})

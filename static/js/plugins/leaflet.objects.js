"use strict"

import "../leaflet.js"
import "../layers.js"
import "./leaflet.popup-builder.js"

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
	L.Objects = L.DynamicIcons.extend({
		onAdd: function (map) {
			this._map = map
			if (this.options.names || this.options.ids) {
				this.getData(this.options.names, this.options.ids)
					.then((locations) => {
						if (locations.length > 0) {
							let bounds = L.latLngBounds(
								locations.map((item) =>
									"location" in item
										? [item.location.y + 0.5, item.location.x + 0.5]
										: [(item.j << 6) + item.y + 0.5, (item.i << 6) + item.x + 0.5]
								)
							)
							let planes = {}
							locations.forEach((item) => {
								let p = "location" in item ? item.location.plane : item.plane
								planes[p] = (planes[p] || 0) + 1
							})
							let mostCommonPlane = +Object.entries(planes).sort((a, b) => b[1] - a[1])[0][0]
							this._map.setPlane(mostCommonPlane)
							if (locations.length <= 50) {
								this._map.fitBounds(bounds, { maxZoom: 6, animate: false })
							}
						}

						this._icon_data = this.parseData(locations)
						this._icons = {}
						this._resetView()
						this._update()
					})
					.catch(console.error)
			} else {
				throw new Error("No objects specified")
			}
		},

		getData: async function (names, ids) {
			if (names && names.length !== 0) {
				let name_mapping_promise = fetch(`${this.options.folder}/object_name_collection.json`).then(
					(res) => res.json(),
					(_) => {
						throw new Error(`Unable to fetch ${this.options.folder}/object_name_collection.json`)
					}
				)
				let morph_mapping_promise = fetch(
					`${this.options.folder}/object_morph_collection.json`
				).then(
					(res) => res.json(),
					(_) => {
						throw new Error(`Unable to fetch ${this.options.folder}/object_morph_collection.json`)
					}
				)
				let [name_mapping, morph_mapping] = await Promise.all([
					name_mapping_promise,
					morph_mapping_promise
				])

				let ids = names.flatMap((name) => name_mapping[name] ?? [])

				let all_ids = Array.from(new Set(ids.flatMap((id) => [...(morph_mapping[id] ?? []), id])))

				let all_locations = await Promise.allSettled(
					all_ids.map((id) => fetch(`${this.options.folder}/locations/${id}.json`))
				).then((responses) =>
					Promise.all(
						responses
							.filter((res) => res.status === "fulfilled" && res.value.ok)
							.map((res) => res.value.json())
					)
				)

				return all_locations.flat()
			} else if (ids && ids.length !== 0) {
				let morph_mapping = await fetch(`${this.options.folder}/object_morph_collection.json`).then(
					(res) => res.json()
				)
				let all_ids = Array.from(new Set(ids.flatMap((id) => [...(morph_mapping[id] ?? []), id])))
				let all_locations = await Promise.allSettled(
					all_ids.map((id) => fetch(`${this.options.folder}/locations/${id}.json`))
				).then((responses) =>
					Promise.all(
						responses
							.filter((res) => res.status === "fulfilled" && res.value.ok)
							.map((res) => res.value.json())
					)
				)

				return all_locations.flat()
			} else {
				throw new Error("")
			}
		},

		parseData: function (data) {
			let icon_data = {}

			data.forEach((item) => {
				let key = this._tileCoordsToKey({
					plane: item.plane,
					x: item.i,
					y: -item.j
				})

				if (!(key in icon_data)) {
					icon_data[key] = []
				}
				icon_data[key].push(item)
			})

			let reallyLoadEverything =
				data.length < 10000 ? true : confirm(`Really load ${data.length} markers?`)
			if (reallyLoadEverything) {
				this._map.addMessage(`Found ${data.length} locations of this object.`)
				return icon_data
			} else {
				return []
			}
		},

		createIcon: function (item) {
			let { icon, greyscaleIcon } = L.MarkerIcon.createPair()

			let marker = L.marker([(item.j << 6) + item.y + 0.5, (item.i << 6) + item.x + 0.5], {
				icon: item.plane === this._map.getPlane() ? icon : greyscaleIcon
			})

			L.MarkerIcon.bindSelection(marker)

			this._map.on("planechange", function (e) {
				marker.setIcon(item.plane === e.newPlane ? icon : greyscaleIcon)
				if (marker.isPopupOpen()) {
					let el = marker.getElement()
					if (el) L.DomUtil.addClass(el, "marker-selected")
				}
			})

			let placeholder = document.createElement("div")
			placeholder.textContent = "Loading..."
			marker.bindPopup(placeholder, {
				autoPan: true,
				autoPanPadding: L.point(40, 40)
			})

			marker.once("popupopen", async () => {
				let data = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(
					(res) => res.json()
				)
				let globalX = (item.i << 6) + item.x
				let globalY = (item.j << 6) + item.y

				let rawData = {
					plane: item.plane,
					x: globalX,
					y: globalY,
					id: item.id,
					type: item.type,
					rotation: item.rotation
				}
				for (const [key, value] of Object.entries(data)) {
					if (key !== "name") rawData[key] = value
				}

				let imgContainer = document.createElement("div")
				imgContainer.setAttribute("class", "object-image-container")

				let popup = L.PopupBuilder.createPopup(
					"object",
					{
						name: data.name,
						globalX: globalX,
						globalY: globalY,
						plane: item.plane,
						imgContainer: imgContainer,
						rawData: rawData
					},
					this._map
				)

				marker.getPopup().setContent(popup)
				marker.getPopup().update()
			})

			return marker
		}
	})

	L.objects = function (options) {
		return new L.Objects(options)
	}

	L.Objects.OSRS = L.Objects.extend({
		createChiselIcon: function (item) {
			let { icon, greyscaleIcon } = L.MarkerIcon.createPair()

			let marker = L.marker([item.location.y + 0.5, item.location.x + 0.5], {
				icon: item.location.plane === this._map.getPlane() ? icon : greyscaleIcon
			})

			L.MarkerIcon.bindSelection(marker)

			this._map.on("planechange", function (e) {
				marker.setIcon(item.location.plane === e.newPlane ? icon : greyscaleIcon)
				if (marker.isPopupOpen()) {
					let el = marker.getElement()
					if (el) L.DomUtil.addClass(el, "marker-selected")
				}
			})

			let placeholder = document.createElement("div")
			placeholder.textContent = "Loading..."
			marker.bindPopup(placeholder, {
				autoPan: true,
				autoPanPadding: L.point(40, 40)
			})

			marker.once("popupopen", async () => {
				let location_config = await fetch(
					`${this.options.folder}/location_configs/${item.id}.json`
				).then((res) => res.json())

				let globalX = item.location.x
				let globalY = item.location.y

				let rawData = { plane: item.location.plane, x: globalX, y: globalY, label: item.label }
				for (const [key, value] of Object.entries(location_config)) {
					if (key !== "name") rawData[key] = value
				}

				let imgContainer = document.createElement("div")
				imgContainer.setAttribute("class", "object-image-container")
				this.createModelTab(item, location_config).then((img) => imgContainer.appendChild(img))

				let popup = L.PopupBuilder.createPopup(
					"object",
					{
						name: location_config.name,
						globalX: globalX,
						globalY: globalY,
						plane: item.location.plane,
						imgContainer: imgContainer,
						rawData: rawData
					},
					this._map
				)

				marker.getPopup().setContent(popup)
				marker.getPopup().update()
			})

			return marker
		},

		createIcon: function (item) {
			if ("location" in item) {
				return this.createChiselIcon(item)
			}
			let { icon, greyscaleIcon } = L.MarkerIcon.createPair()

			let marker = L.marker([(item.j << 6) + item.y + 0.5, (item.i << 6) + item.x + 0.5], {
				icon: item.plane === this._map.getPlane() ? icon : greyscaleIcon
			})

			L.MarkerIcon.bindSelection(marker)

			this._map.on("planechange", function (e) {
				marker.setIcon(item.plane === e.newPlane ? icon : greyscaleIcon)
				if (marker.isPopupOpen()) {
					let el = marker.getElement()
					if (el) L.DomUtil.addClass(el, "marker-selected")
				}
			})

			let placeholder = document.createElement("div")
			placeholder.textContent = "Loading..."
			marker.bindPopup(placeholder, {
				autoPan: true,
				autoPanPadding: L.point(40, 40)
			})

			marker.once("popupopen", async () => {
				let location_config = await fetch(
					`${this.options.folder}/location_configs/${item.id}.json`
				).then((res) => res.json())

				let globalX = (item.i << 6) + item.x
				let globalY = (item.j << 6) + item.y

				let rawData = {
					plane: item.plane,
					x: globalX,
					y: globalY,
					id: item.id,
					type: item.type,
					rotation: item.rotation
				}
				for (const [key, value] of Object.entries(location_config)) {
					if (key !== "name") rawData[key] = value
				}

				let imgContainer = document.createElement("div")
				imgContainer.setAttribute("class", "object-image-container")
				this.createModelTab(item, location_config).then((img) => imgContainer.appendChild(img))

				let popup = L.PopupBuilder.createPopup(
					"object",
					{
						name: location_config.name,
						globalX: globalX,
						globalY: globalY,
						plane: item.plane,
						imgContainer: imgContainer,
						rawData: rawData
					},
					this._map
				)

				marker.getPopup().setContent(popup)
				marker.getPopup().update()
			})

			return marker
		},

		getData: async function (names, ids) {
			if (names && names.length !== 0) {
				let name_mapping_promise = fetch(`${this.options.folder}/object_name_collection.json`).then(
					(res) => res.json()
				)
				let morph_mapping_promise = fetch(
					`${this.options.folder}/object_morph_collection.json`
				).then((res) => res.json())
				let [name_mapping, morph_mapping] = await Promise.all([
					name_mapping_promise,
					morph_mapping_promise
				])

				let ids = names.flatMap((name) => name_mapping[name] ?? [])

				let all_ids = Array.from(new Set(ids.flatMap((id) => [...(morph_mapping[id] ?? []), id])))

				let all_locations = await Promise.allSettled([
					...all_ids.map((id) => fetch(`${this.options.folder}/locations/${id}.json`)),
					...all_ids.map((id) =>
						fetch(`https://chisel.weirdgloop.org/scenery/server_mapdata?id=${id}`)
					)
				]).then((responses) =>
					Promise.all(
						responses
							.filter((res) => res.status === "fulfilled" && res.value.ok)
							.map((res) => res.value.json())
					)
				)

				return all_locations.flat()
			} else if (ids && ids.length !== 0) {
				let morph_mapping = await fetch(`${this.options.folder}/object_morph_collection.json`).then(
					(res) => res.json()
				)
				let all_ids = Array.from(new Set(ids.flatMap((id) => [...(morph_mapping[id] ?? []), id])))

				let all_locations = await Promise.allSettled([
					...all_ids.map((id) => fetch(`${this.options.folder}/locations/${id}.json`)),
					...all_ids.map((id) =>
						fetch(`https://chisel.weirdgloop.org/scenery/server_mapdata?id=${id}`)
					)
				]).then((responses) =>
					Promise.all(
						responses
							.filter((res) => res.status === "fulfilled" && res.value.ok)
							.map((res) => res.value.json())
					)
				)

				return all_locations.flat()
			} else {
				throw new Error("")
			}
		},

		parseData: function (data) {
			let icon_data = {}

			data.forEach((item) => {
				let key = this._tileCoordsToKey({
					plane: item.plane ?? item.location.plane,
					x: item.i ?? item.location.x >> 6,
					y: -(item.j ?? item.location.y >> 6)
				})

				if (!(key in icon_data)) {
					icon_data[key] = []
				}
				icon_data[key].push(item)
			})

			let reallyLoadEverything =
				data.length < 10000 ? true : confirm(`Really load ${data.length} markers?`)
			if (reallyLoadEverything) {
				this._map.addMessage(`Found ${data.length} locations of this object.`)
				return icon_data
			} else {
				return []
			}
		},

		createModelTab: async function (loc, location_config) {
			function getImage(id) {
				return new Promise((resolve, reject) => {
					// eslint-disable-line no-unused-vars
					if (id === -1) {
						reject()
					}
					let img = new Image()
					img.onload = () => resolve(img)
					img.onerror = () => {
						console.warn(
							`Unable to load https://chisel.weirdgloop.org/static/img/osrs-object/${id}_orient${rotation}.png`
						)
						reject()
					}
					let rotation = loc.rotation ?? 0
					img.src = `https://chisel.weirdgloop.org/static/img/osrs-object/${id}_orient${rotation}.png`
				})
			}
			let ids = Array.from(
				new Set([
					location_config.id,
					...(location_config.morphs ?? []),
					...(location_config.morphs_2 ?? [])
				])
			)
			ids.sort()

			let imgs = await Promise.allSettled(ids.map(getImage))

			if (imgs.length === 1 && imgs[0].status === "fulfilled") {
				let img = imgs[0].value
				img.setAttribute("class", "object-image")
				return img
			} else if (imgs.some((img) => img.status === "fulfilled")) {
				let tabs = document.createElement("div")
				tabs.setAttribute("class", "tabs")

				let content = document.createElement("div")
				content.setAttribute("class", "content")

				imgs.forEach((img_promise, i) => {
					if (
						img_promise.status === "fulfilled" &&
						(img_promise.value.width > 1 || img_promise.value.height > 1)
					) {
						if (!content.innerHTML) {
							let img = img_promise.value
							img.setAttribute("class", "object-image")
							content.appendChild(img)
						}

						let button = document.createElement("div")
						button.innerHTML = ids[i]
						button.addEventListener("click", () => {
							content.innerHTML = ""
							let img = img_promise.value
							img.setAttribute("class", "object-image")
							content.appendChild(img)
						})
						button.setAttribute("class", "tabbutton")
						tabs.appendChild(button)
					}
				})
				let combined = document.createElement("div")
				combined.appendChild(tabs)
				combined.appendChild(content)
				return combined
			} else {
				return document.createElement("div")
			}
		}
	})

	L.objects.osrs = function (options) {
		return new L.Objects.OSRS(options)
	}
})

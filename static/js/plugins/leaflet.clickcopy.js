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
	L.Map.addInitHook(function () {
		this.on("click", (e) => {
			let x = Math.floor(e.latlng.lng)
			let y = Math.floor(e.latlng.lat)
			let copystr = `[${x}, ${y}]`
			navigator.clipboard.writeText(copystr).then(
				() => this.addMessage(`Copied to clipboard: ${copystr}`),
				() => console.error("Cannot copy text to clipboard")
			)
		})
	})
})

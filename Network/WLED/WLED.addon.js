/**
 * SPDX-FileCopyrightText: © 2026 José A Miranda Velez <admin@rgbjunkie.com>
 * SPDX-License-Identifier: LicenseRef-RGBJunkie-Proprietary
 * https://www.rgbjunkie.com
 *
 * WLED matrix add-on (loads after stock WLED.js). Keep WLED_Text.js / WLED_Text_ZH.min.js next to this file.
 */

// @rgbj-include "./WLED_Text.js"
// @rgbj-include "./WLED_Text_ZH.min.js"

/* global controller service udp device rgbjunkie exports */
/* global LightingMode forcedColor shutdownColor wledTimeoutSec */

/** Soft-power hook expected by extracted matrix code; RGBJunkie has no DeviceState API — no-op. */
var DeviceState = {
	Change: function (_ip, _defOn, _defBri, _forceOff, _forceOn, _fullBright, _last) {},
};

/** Small GET helper on top of the sandbox XMLHttpRequest (e.g. Libre Hardware Monitor polling). */
var XmlHttp = {
	Get: function (url, callback) {
		try {
			var xhr = new XMLHttpRequest();
			xhr.onreadystatechange = function () {
				if (typeof callback === "function") callback(xhr);
			};
			xhr.open("GET", String(url || ""), true);
			xhr.send(null);
		} catch (_e) {}
	},
};

/** Whether LHM sensor text keeps fractional digits (synced from lhm_use_decimals). */
function __wledLhmShowDecimals() {
	try {
		if (typeof lhm_use_decimals === "undefined") return true;
		var v = lhm_use_decimals;
		if (v === false || v === 0) return false;
		if (v === true || v === 1) return true;
		if (typeof v === "string") {
			var s = v.trim().toLowerCase();
			if (s === "false" || s === "0" || s === "off" || s === "no") return false;
			if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
		}
		return !!v;
	} catch (_e) {
		return true;
	}
}

/** Normalize Libre Hardware Monitor value strings when whole numbers are preferred (global from controllable sync). */
function __wledFormatLhmSensorDisplay(raw) {
	try {
		if (raw == null || raw === "") return "N/A";
		var s = String(raw);
		if (__wledLhmShowDecimals()) return s;
		return s.replace(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g, function (numStr) {
			var n = parseFloat(numStr);
			if (!Number.isFinite(n)) return numStr;
			return String(Math.round(n));
		});
	} catch (_e) {
		return raw == null ? "N/A" : String(raw);
	}
}

/** Shown in RGBJunkie plugin settings above add-on controls (group: "matrix"). Host reads exports.__rgbjWledAddonDisplayName. */
export const __rgbjWledAddonDisplayName = "WLED matrix & clock";

var __WLED_CLOCK_SETTINGS = [
	{ id: "turnOffOnShutdown", group: "lighting", label: "Turn WLED OFF on shutdown", description: "Soft-off WLED when RGBJunkie exits (requires device support).", type: "boolean", default: false },
	{ id: "rgbcw_mode", group: "lighting", label: "RGBCW mode", description: "Enable if you use an RGBCW bulb (inserts WW/CW channels).", type: "boolean", default: false },
	{
		id: "display_mode",
		group: "matrix",
		label: "Matrix display mode",
		description: "Requires WLED 2D mapping for text/time/LHM/pixel art.",
		type: "combobox",
		default: "Components",
		values: ["Components", "Time", "Custom Text", "Pixel Art", "Libre Hardware Monitor"],
	},
	{
		id: "fontSize",
		group: "matrix",
		label: "Font size",
		type: "combobox",
		default: "Medium",
		values: ["Small", "Medium", "Large", "Chinese"],
		visibleWhen: { property: "display_mode", oneOf: ["Time", "Custom Text", "Libre Hardware Monitor"] },
	},
	{
		id: "custom_text",
		group: "matrix",
		label: "Custom text",
		type: "string",
		default: "WLED",
		description: "Multiple lines: use Enter, or literal \n / \r\n in the field if the UI strips real line breaks.",
		visibleWhen: { property: "display_mode", equals: "Custom Text" },
	},
	{
		id: "time_format",
		group: "matrix",
		label: "Date/time format",
		type: "string",
		default: "hh:mm tt",
		description: "Supports multiple lines (newline between rows). Literal \n works if you cannot insert a real line break.",
		visibleWhen: { property: "display_mode", equals: "Time" },
	},
	{
		id: "invert_color",
		group: "matrix",
		label: "Invert text",
		type: "boolean",
		default: false,
		visibleWhen: { property: "display_mode", oneOf: ["Time", "Custom Text", "Libre Hardware Monitor"] },
	},
	{
		id: "invert_text_color",
		group: "matrix",
		label: "Text color when inverted",
		type: "color",
		default: "#000000",
		visibleWhen: {
			allOf: [
				{ property: "display_mode", oneOf: ["Time", "Custom Text", "Libre Hardware Monitor"] },
				{ property: "invert_color", equals: true },
			],
		},
	},
	{
		id: "lhmjson",
		group: "matrix",
		label: "Libre Hardware Monitor URL",
		type: "string",
		default: "http://127.0.0.1:8085/",
		visibleWhen: { property: "display_mode", equals: "Libre Hardware Monitor" },
	},
	{
		id: "lhm_format",
		group: "matrix",
		label: "LHM format string",
		type: "string",
		default: "cpu_load cpu_temp",
		description: "Placeholders as before; add line breaks (or \n) for multi-row sensor readouts.",
		visibleWhen: { property: "display_mode", equals: "Libre Hardware Monitor" },
	},
	{
		id: "lhm_tag_insert",
		group: "matrix",
		label: "LHM format tags",
		type: "combobox",
		default: "",
		description: "Pick a tag to append to the LHM format string.",
		appendTokenToProperty: "lhm_format",
		values: [
			"",
			"cpu_load",
			"cpu_temp",
			"mb_fan1",
			"mb_fan2",
			"mb_fan3",
			"mb_fan4",
			"mb_fan5",
			"mb_fan6",
			"mb_fan7",
			"mb_fan8",
			"mb_fan9",
			"mb_fan10",
			"ram_load",
			"ram_used",
			"gpu_load",
			"gpu_temp",
			"gpu_fan1",
			"gpu_fan2",
			"gpu_mem_load",
			"gpu_mem_used",
		],
		valuesDisplay: [
			"Pick a tag to insert…",
			"CPU total load",
			"CPU package temperature",
			"Motherboard fan 1",
			"Motherboard fan 2",
			"Motherboard fan 3",
			"Motherboard fan 4",
			"Motherboard fan 5",
			"Motherboard fan 6",
			"Motherboard fan 7",
			"Motherboard fan 8",
			"Motherboard fan 9",
			"Motherboard fan 10",
			"Memory load",
			"Memory used",
			"GPU core load",
			"GPU core temperature",
			"GPU fan 1",
			"GPU fan 2",
			"GPU memory load",
			"GPU memory used",
		],
		visibleWhen: { property: "display_mode", equals: "Libre Hardware Monitor" },
	},
	{
		id: "lhm_use_decimals",
		group: "matrix",
		label: "LHM values show decimals",
		type: "boolean",
		default: true,
		description: "When off, numeric parts of sensor text are rounded to whole numbers (e.g. 37 % instead of 37.4 %).",
		visibleWhen: { property: "display_mode", equals: "Libre Hardware Monitor" },
	},
	{
		id: "lhm_update",
		group: "matrix",
		label: "LHM refresh (ms)",
		type: "number",
		default: 3000,
		min: 500,
		max: 10000,
		step: 1,
		visibleWhen: { property: "display_mode", equals: "Libre Hardware Monitor" },
	},
	{
		id: "scroll_direction",
		group: "matrix",
		label: "Scroll direction",
		type: "combobox",
		default: "Off",
		values: ["Off", "Left", "Right", "Ping-Pong"],
		visibleWhen: { property: "display_mode", oneOf: ["Time", "Custom Text", "Pixel Art", "Libre Hardware Monitor"] },
	},
	{
		id: "scroll_speed",
		group: "matrix",
		label: "Scroll speed",
		type: "number",
		default: 50,
		min: 1,
		max: 100,
		step: 1,
		visibleWhen: { property: "display_mode", oneOf: ["Time", "Custom Text", "Pixel Art", "Libre Hardware Monitor"] },
	},
	{
		id: "pixel_art",
		group: "matrix",
		label: "Pixel art JSON (Get it from https://pixelart.nolliergb.com/)",
		type: "string",
		default: "[]",
		visibleWhen: { property: "display_mode", equals: "Pixel Art" },
	},
	{
		id: "pixel_art_fps",
		group: "matrix",
		label: "Pixel art FPS",
		type: "number",
		default: 10,
		min: 1,
		max: 60,
		step: 1,
		visibleWhen: { property: "display_mode", equals: "Pixel Art" },
	},
	{
		id: "translucent1",
		group: "matrix",
		label: "Translucent 1 (%)",
		type: "number",
		default: 30,
		min: 1,
		max: 100,
		step: 1,
		visibleWhen: { property: "display_mode", equals: "Pixel Art" },
	},
	{
		id: "translucent2",
		group: "matrix",
		label: "Translucent 2 (%)",
		type: "number",
		default: 80,
		min: 1,
		max: 100,
		step: 1,
		visibleWhen: { property: "display_mode", equals: "Pixel Art" },
	},
	{
		id: "paddingX",
		group: "matrix",
		label: "Padding X",
		type: "string",
		default: "0",
		visibleWhen: { property: "display_mode", equals: "Pixel Art" },
	},
	{
		id: "paddingY",
		group: "matrix",
		label: "Padding Y",
		type: "string",
		default: "1",
		visibleWhen: { property: "display_mode", equals: "Pixel Art" },
	},
];

(function __mergeWledClockRgbjunkieSettings() {
	try {
		var d = typeof rgbjunkie !== "undefined" ? rgbjunkie : null;
		if (!d || !Array.isArray(d.settings)) return;
		for (var i = 0; i < __WLED_CLOCK_SETTINGS.length; i++) {
			var s = __WLED_CLOCK_SETTINGS[i];
			if (!s || !s.id) continue;
			var idx = -1;
			for (var j = 0; j < d.settings.length; j++) {
				if (d.settings[j] && d.settings[j].id === s.id) {
					idx = j;
					break;
				}
			}
			if (idx < 0) {
				d.settings.push(s);
			} else {
				var cur = d.settings[idx];
				for (var k in s) {
					if (Object.prototype.hasOwnProperty.call(s, k)) cur[k] = s[k];
				}
			}
		}
	} catch (_e) {}
})();

let WLED;
let display;
let displaySize = { width: 0, height: 0 };
const MaxLedsInPacket = 485;
const BIG_ENDIAN = 1;
const WLEDicon = "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";
const colorBlack = "#000000";
let lastForcedUpdate = 0;
let jobRunning = false;
let scrollOffset = 0;
let pingPongDirection = -1;
let lastLHMFetch = { time: 0, result: 'Loading...' };
const ZH_FONT_DIGITS = Object.assign({}, ZH_FONT, LARGE_DIGITS);
const ZH_FONT_LETTERS = Object.assign({}, ZH_FONT, LARGE_LETTERS);

var PIXELART = [];
var COMPONENT_MAPPING = [];

export function onPixel_artChanged() {
	if (display_mode == 'Pixel Art') {
		try {
			PIXELART = JSON.parse(pixel_art)
			device.log('Pixel Art Updated!');
		}
		catch (ex) {
			device.log(ex.message);
		}
	}
}

export function onDisplay_modeChanged() {
	switch (display_mode) {
		case 'Pixel Art':
			try {
				PIXELART = JSON.parse(pixel_art)
				device.log('Pixel Art Updated!');
			}
			catch (ex) {
				device.log(ex.message);
			}
			break;
		default:
			break;
	}
}

function rearrangeDisplayForSnakeLayout(display) {
	const snakeDisplay = new Array(display.length);

	for (let i = 0; i < display.length; i++) {
		if (COMPONENT_MAPPING.length == 0) { if (!jobRunning) { detect2DMapping(); } } else { snakeDisplay[COMPONENT_MAPPING[i]] = display[i]; }
	}

	return snakeDisplay;
}

function insertZeroes(rgb_array) {
	const result = [];
	for (let i = 0; i < rgb_array.length; i += 3) {
		result.push(rgb_array[i], rgb_array[i + 1], rgb_array[i + 2]);
		result.push(0, 0);
	}
	return result.filter(x => x !== undefined);
}

function hexToRgb(hex) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null;
}

function detect2DMapping() {
	let instance = typeof controller === "object" && controller ? controller : WLED;
	jobRunning = true;

	device.log(`Requesting 2D Mapping from http://${instance.ip}:${instance.port}/json/state/`);
	XmlHttp.Get(`http://${instance.ip}:${instance.port}/json/state/`, (xhr) => {
		if (xhr.readyState === 4) {
			if (xhr.status === 200) {
				let devicedata;

				try {
					devicedata = JSON.parse(xhr.response);

					if (devicedata.seg[0].hasOwnProperty("stopY")) {
						displaySize.width = devicedata.seg[0].stop;
						displaySize.height = devicedata.seg[0].stopY;
						let length = displaySize.width * displaySize.height;
						for (let i = 0; i <= length; i++) {
							COMPONENT_MAPPING.push(i);
						}
						device.log('2D mapping found, automatic mapping completed.');
						jobRunning = false;
						display = new Array(displaySize.height * displaySize.width).fill(0);
					}
					else {
						device.log(`2D mapping not found, unable to auto mapping. Create your 2D mapping in http://${instance.ip}:${instance.port}/settings/2D`);
					}
				} catch (e) {
					device.log("ERROR for IP " + instance.ip + ", JSON info could not be parsed!" + e);

					return;
				}
			} else {
				device.log("ERROR for IP " + instance.ip + ", device is OFFLINE or does not respond!");
			}
		}
	});
}

function replaceEx(str, obj) {
	for (const x in obj) { str = str.replace(new RegExp(x, 'g'), obj[x]); }
	return str
}

function formatDateTime(format) {
	const now = new Date();
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const year = now.getFullYear();

	const hour12 = now.getHours() % 12 || 12;
	const hour24 = now.getHours();
	const minute = now.getMinutes();
	const second = now.getSeconds();
	const ampm = now.getHours() >= 12 ? 'pm' : 'am';

	let _format = replaceEx(format, {
		'dd': String(day).padStart(2, '0'), 'd': day,
		'hh': String(hour12).padStart(2, '0'), 'h': hour12,
		'HH': String(hour24).padStart(2, '0'), 'H': hour24,
		'mm': String(minute).padStart(2, '0'), 'm': minute,
		'MM': String(month).padStart(2, '0'), 'M': month,
		'ss': String(second).padStart(2, '0'), 's': second,
		'tt': ampm, 't': ampm == 'am' ? 'a' : 'p',
		'yyyy': year, 'yyy': year, 'yy': year.toString().substring(2), 'y': year.toString().substring(2),
	});
	return _format;
}

function formatLHM(format) {
	const now = Date.now();

	// If cache is fresh, return it
	if (now - lastLHMFetch.time < lhm_update && lastLHMFetch.result !== null) {
		return lastLHMFetch.result;
	}

	// Trigger a refresh, but don't expect immediate result
	XmlHttp.Get(`${lhmjson}/data.json`, (xhr) => {
		if (xhr.readyState === 4) {
			if (xhr.status === 200) {
				const datajson = JSON.parse(xhr.response);

				// CPU
				const cpu_load = findNodeWithParent(datajson, 'CPU Total', 'Load');
				const cpu_temp = findNodeWithParent(datajson, 'CPU Package', 'Temperatures');

				// Fans
				const mb_fan1 = findNodeWithParent(datajson, 'Fan #1', 'Fans');
				const mb_fan2 = findNodeWithParent(datajson, 'Fan #2', 'Fans');
				const mb_fan3 = findNodeWithParent(datajson, 'Fan #3', 'Fans');
				const mb_fan4 = findNodeWithParent(datajson, 'Fan #4', 'Fans');
				const mb_fan5 = findNodeWithParent(datajson, 'Fan #5', 'Fans');
				const mb_fan6 = findNodeWithParent(datajson, 'Fan #6', 'Fans');
				const mb_fan7 = findNodeWithParent(datajson, 'Fan #7', 'Fans');
				const mb_fan8 = findNodeWithParent(datajson, 'Fan #8', 'Fans');
				const mb_fan9 = findNodeWithParent(datajson, 'Fan #9', 'Fans');
				const mb_fan10 = findNodeWithParent(datajson, 'Fan #10', 'Fans');

				// RAM
				const ram_load = findNodeWithParent(datajson, 'Memory', 'Load');
				const ram_used = findNodeWithParent(datajson, 'Memory Used', 'Data');

				// GPU
				const gpu_load = findNodeWithParent(datajson, 'GPU Core', 'Load');
				const gpu_temp = findNodeWithParent(datajson, 'GPU Core', 'Temperatures');
				const gpu_fan1 = findNodeWithParent(datajson, 'GPU Fan 1', 'Fans');
				const gpu_fan2 = findNodeWithParent(datajson, 'GPU Fan 2', 'Fans');
				const gpu_mem_load = findNodeWithParent(datajson, 'GPU Memory', 'Load');
				const gpu_mem_used = findNodeWithParent(datajson, 'GPU Memory Used', 'Data');

				let _format = replaceEx(format, {
					'cpu_load': __wledFormatLhmSensorDisplay(cpu_load ? cpu_load.Value : 'N/A'),
					'cpu_temp': __wledFormatLhmSensorDisplay(cpu_temp ? cpu_temp.Value : 'N/A'),
					'mb_fan1': __wledFormatLhmSensorDisplay(mb_fan1 ? mb_fan1.Value : 'N/A'),
					'mb_fan2': __wledFormatLhmSensorDisplay(mb_fan2 ? mb_fan2.Value : 'N/A'),
					'mb_fan3': __wledFormatLhmSensorDisplay(mb_fan3 ? mb_fan3.Value : 'N/A'),
					'mb_fan4': __wledFormatLhmSensorDisplay(mb_fan4 ? mb_fan4.Value : 'N/A'),
					'mb_fan5': __wledFormatLhmSensorDisplay(mb_fan5 ? mb_fan5.Value : 'N/A'),
					'mb_fan6': __wledFormatLhmSensorDisplay(mb_fan6 ? mb_fan6.Value : 'N/A'),
					'mb_fan7': __wledFormatLhmSensorDisplay(mb_fan7 ? mb_fan7.Value : 'N/A'),
					'mb_fan8': __wledFormatLhmSensorDisplay(mb_fan8 ? mb_fan8.Value : 'N/A'),
					'mb_fan9': __wledFormatLhmSensorDisplay(mb_fan9 ? mb_fan9.Value : 'N/A'),
					'mb_fan10': __wledFormatLhmSensorDisplay(mb_fan10 ? mb_fan10.Value : 'N/A'),
					'ram_load': __wledFormatLhmSensorDisplay(ram_load ? ram_load.Value : 'N/A'),
					'ram_used': __wledFormatLhmSensorDisplay(ram_used ? ram_used.Value : 'N/A'),
					'gpu_load': __wledFormatLhmSensorDisplay(gpu_load ? gpu_load.Value : 'N/A'),
					'gpu_temp': __wledFormatLhmSensorDisplay(gpu_temp ? gpu_temp.Value : 'N/A'),
					'gpu_fan1': __wledFormatLhmSensorDisplay(gpu_fan1 ? gpu_fan1.Value : 'N/A'),
					'gpu_fan2': __wledFormatLhmSensorDisplay(gpu_fan2 ? gpu_fan2.Value : 'N/A'),
					'gpu_mem_load': __wledFormatLhmSensorDisplay(gpu_mem_load ? gpu_mem_load.Value : 'N/A'),
					'gpu_mem_used': __wledFormatLhmSensorDisplay(gpu_mem_used ? gpu_mem_used.Value : 'N/A')
				});

				lastLHMFetch.result = _format;
				lastLHMFetch.time = now;
			} else {
				device.log("HTTP error:", xhr.status);
			}
		}
	});

	// Always return the cached result (default "Loading..." on first call)
	return lastLHMFetch.result;
}

function findNodeWithParent(node, textToFind, parentToFind, currentParentName = "") {
	// Check if THIS node matches and its parent matches
	if (node.Text === textToFind && currentParentName === parentToFind) {
		return node;
	}

	// Recursively check children, passing the current node's text as the next parent name
	if (node.Children && node.Children.length > 0) {
		for (let child of node.Children) {
			let found = findNodeWithParent(child, textToFind, parentToFind, node.Text);
			if (found) return found;
		}
	}
	return null;
}

function lowerBrightnessRGB(R, G, B, factor) {
	const newR = Math.max(0, Math.floor(R * factor));
	const newG = Math.max(0, Math.floor(G * factor));
	const newB = Math.max(0, Math.floor(B * factor));

	return [newR, newG, newB];
}

/** Real newlines + literal \\n / \\r from settings fields that cannot store line breaks. */
function normalizeMatrixDisplayNewlines(s) {
	var t = String(s ?? "");
	t = t.replace(/\\r\\n/gi, "\n");
	t = t.replace(/\\n/g, "\n");
	t = t.replace(/\\r/g, "\n");
	t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	return t;
}

function displayClock() {
	// Fill background based on invert_color
	display.fill(invert_color ? 1 : 0);
	const now = new Date();

	let text;
	switch (display_mode) {
		case 'Pixel Art':
			text = 'Pixel Art';
			insertPixelArtIntoDisplay(display, PIXELART);
			return;
		case 'Custom Text':
			text = custom_text;
			break;
		case 'Libre Hardware Monitor':
			text = formatLHM(lhm_format);
			break;
		default:
			if (now.getSeconds() % 2 !== 0) {
				text = replaceEx(formatDateTime(time_format), { ':': ';' });
			} else {
				text = formatDateTime(time_format);
			}
	}

	text = normalizeMatrixDisplayNewlines(text);

	let baseRow = parseInt(paddingY);
	// Don't add a trailing gap if we are ping-ponging!
	let textWithGap = scroll_direction === "Ping-Pong" ? text : text + " ".repeat(Math.floor(displaySize.width / 2));
	let { buffer, bufferWidth } = renderTextBuffer(textWithGap, fontSize, baseRow, display_mode == 'Time');

	// --- Scroll offset update ---
	if (scroll_direction === "Left") {
		scrollOffset -= (scroll_speed / 100);
	} else if (scroll_direction === "Right") {
		scrollOffset += (scroll_speed / 100);
	} else if (scroll_direction === "Ping-Pong") {
		scrollOffset += (scroll_speed / 100) * pingPongDirection;
	}

	// --- Wrap or Bounce offset ---
	if (scroll_direction === "Ping-Pong") {
		// Calculate the furthest left the text can go before the right edge is exposed
		let minOffset = displaySize.width - bufferWidth;
		if (minOffset > 0) minOffset = 0; // Don't bounce if text is shorter than the matrix

		if (scrollOffset <= minOffset) {
			scrollOffset = minOffset;
			pingPongDirection = 1; // Hit left bound, bounce right
		} else if (scrollOffset >= 0) {
			scrollOffset = 0;
			pingPongDirection = -1; // Hit right bound, bounce left
		}
	} else {
		// Standard seamless wrap
		const totalSpan = bufferWidth + displaySize.width;
		if (scrollOffset <= -bufferWidth) scrollOffset += bufferWidth; 
		if (scrollOffset >= bufferWidth) scrollOffset -= bufferWidth; 
	}

	// --- Copy visible slice (tile buffer) ---
	for (let row = 0; row < displaySize.height; row++) {
		for (let col = 0; col < displaySize.width; col++) {
			// repeat buffer by using modulo
			let srcX = Math.floor((col - scrollOffset) % bufferWidth);
			if (srcX < 0) srcX += bufferWidth; // ensure positive index
			display[row * displaySize.width + col] = buffer[row * bufferWidth + srcX];
		}
	}
}

function insertPixelArtIntoDisplay(display, art) {
	if (!art) return;
	if (typeof art === "string") {
		try {
			art = JSON.parse(art);
		} catch (e) {
			return;
		}
	}
	if (art && typeof art === "object" && !Array.isArray(art)) {
		if (art.data) art = art.data;
		else if (art.frames) art = art.frames;
	}
	let currentFrameGrid = art;
	if (Array.isArray(art) && Array.isArray(art[0]) && Array.isArray(art[0][0])) {
		let fps = (typeof pixel_art_fps !== 'undefined') ? parseFloat(pixel_art_fps) : 5;
		let frameIndex = Math.floor((new Date().getTime() / (1000 / fps)) % art.length);
		currentFrameGrid = art[frameIndex];
	}
	let offsetX = 0;
	if (typeof scroll_direction !== 'undefined' && scroll_direction !== "Off") {
		const speed = (typeof scroll_speed !== 'undefined') ? parseInt(scroll_speed) : 10;
		const time = new Date().getTime() / 1000;
		let move = Math.floor(time * speed * 0.4);
		
		if (scroll_direction === "Left") {
			offsetX = -move;
		} else if (scroll_direction === "Right") {
			offsetX = move;
		} else if (scroll_direction === "Ping-Pong") {
			// Find image width based on the first row
			let sampleRow = currentFrameGrid[0] || [];
			let isFlat = Array.isArray(sampleRow) && (sampleRow.length % 3 === 0) && sampleRow.some(val => typeof val === 'number' && val > 1);
			let imgW = isFlat ? sampleRow.length / 3 : sampleRow.length;
			
			let maxScroll = Math.max(0, imgW - displaySize.width);
			if (maxScroll > 0) {
				// Triangle wave math to bounce between 0 and -maxScroll
				offsetX = -(maxScroll - Math.abs((move % (maxScroll * 2)) - maxScroll));
			} else {
				offsetX = 0; // Don't move if image fits on screen
			}
		}
	}

	for (let row = 0; row < currentFrameGrid.length; row++) {
		let rowData = currentFrameGrid[row];
		let isFlatRGB = Array.isArray(rowData) && (rowData.length % 3 === 0) && rowData.some(val => typeof val === 'number' && val > 1);
		let gridW = isFlatRGB ? rowData.length / 3 : rowData.length;

		if (isFlatRGB) {
			for (let i = 0; i < rowData.length; i += 3) {
				let r = rowData[i];
				let g = rowData[i + 1];
				let b = rowData[i + 2];
				if (r === 0 && g === 0 && b === 0) continue;

				let col = i / 3;
				let scrolledCol = ((col + offsetX) % gridW + gridW) % gridW;
				let targetC = scrolledCol + parseInt(paddingX || 0);
				let targetR = row + parseInt(paddingY || 0);
				let index = targetR * displaySize.width + targetC;
				if (targetR >= 0 && targetR < displaySize.height && targetC >= 0 && targetC < displaySize.width) display[index] = [r, g, b];
			}
		} else {
			for (let col = 0; col < rowData.length; col++) {
				let pixel = rowData[col];
				let scrolledCol = ((col + offsetX) % rowData.length + rowData.length) % rowData.length;
				let targetC = scrolledCol + parseInt(paddingX || 0);
				let targetR = row + parseInt(paddingY || 0);
				let index = targetR * displaySize.width + targetC;

				if (targetR >= 0 && targetR < displaySize.height && targetC >= 0 && targetC < displaySize.width) {
					display[index] = (typeof pixel === "string" && pixel[0] === "#") ? [parseInt(pixel.substr(1, 2), 16), parseInt(pixel.substr(3, 2), 16), parseInt(pixel.substr(5, 2), 16)] : pixel;
				}
			}
		}
	}
}

function getSpacing(digit, fontSize, time) {
	if (time) {
		if (fontSize === 'Chinese') {
			if (isChineseChar(digit)) {
				return 9;
			} else {
				switch (digit) {
					case '|': return 2;
					case 'i': case 'l': case '`': case "(": case ')': case ';': case ':': case "'": case ',': case '.': case ' ': return 3;
					case 'I': case '!': case '[': case ']': case '1': case '°': return 4;
					case 'f': case 'h': case 'j': case 'k': case 'n': case 't': case 'u': case 'x':
					case 'y': case 'Z': case 'z': case '~': case '$': case '{': case '}': case '<': case '>': return 5;
					default: return 6;
				}
			}
		} else if (fontSize === 'Medium') {
			switch (digit) {
				case ':': case ';': case '.': return 2;
				case ' ': return 1;
				default: return 5;
			}
		} else if (fontSize === 'Large') {
			switch (digit) {
				case ':': case ';': case '.': return 3;
				case ' ': return 2;
				default: return 6;
			}
		} else {
			switch (digit) {
				case ':': case ';': case '.': return 2;
				case ' ': return 1;
				default: return 4;
			}
		}
	} else {
		if (fontSize === 'Chinese') {
			if (isChineseChar(digit)) {
				return 9;
			} else {
				switch (digit) {
					case '|': return 2;
					case 'i': case 'l': case '`': case "(": case ')': case ';': case ':': case "'": case ',': case '.': case ' ': return 3;
					case 'I': case '!': case '[': case ']': case '1': case '°': return 4;
					case 'f': case 'h': case 'j': case 'k': case 'n': case 't': case 'u': case 'x':
					case 'y': case 'Z': case 'z': case '~': case '$': case '{': case '}': case '<': case '>': return 5;
					default: return 6;
				}
			}
		} else if (fontSize === 'Medium') {
			switch (digit) {
				case ' ': return 1;
				case '!': case '|': case ':': case "'": case '.': return 2;
				case '`': case '(': case ')': case '[': case ']': case ';': case ',': case '1': return 3;
				case 'a': case 'c': case 'I': case 'i': case 'j': case 'L': case 'l': case 'r':
				case 'Y': case '$': case '^': case '*': case '-': case '=': case '+': case '{':
				case '}': case '\\': case '"': case '<': case '>': case '/': case '?': case '°': return 4;
				case 'T': case 'W': case '@': case '#': case '%': case '&': return 6;
				default: return 5;
			}
		} else if (fontSize === 'Large') {
			switch (digit) {
				case '|': return 2;
				case 'i': case 'l': case '`': case "(": case ')': case ';': case ':': case "'": case ',': case '.': case ' ': return 3;
				case 'I': case '!': case '[': case ']': case '1': case '°': return 4;
				case 'f': case 'h': case 'j': case 'k': case 'n': case 't': case 'u': case 'x':
				case 'y': case 'Z': case 'z': case '~': case '$': case '{': case '}': case '<': case '>': return 5;
				default: return 6;
			}
		} else {
			switch (digit) {
				case ' ': return 1;
				case 'i': case 'l': case '!': case '|': case ':': case '.': return 2;
				case 'j': case 'r': case '1': case '`': case '(': case ')': case '[': case ']':
				case ';': case "'": case ',': return 3;
				case '~': return 5;
				default: return 4;
			}
		}
	}
}

function resolveGlyphForChar(ch, fontSize, time) {
	switch (fontSize) {
		case 'Chinese':
			return time ? ZH_FONT_DIGITS[ch] : ZH_FONT_LETTERS[ch];
		case 'Large':
			return time ? LARGE_DIGITS[ch] : LARGE_LETTERS[ch];
		case 'Small':
			return time ? SMALL_DIGITS[ch] : SMALL_LETTERS[ch];
		default:
			return time ? DIGITS[ch] : LETTERS[ch];
	}
}

function measureDefaultLinePixelHeight(fontSize, time) {
	var g = resolveGlyphForChar(time ? '0' : 'M', fontSize, time);
	if (g && g.length) return g.length;
	g = resolveGlyphForChar(' ', fontSize, time);
	if (g && g.length) return g.length;
	return 7;
}

function layoutGlyphsForTextLine(line, fontSize, time) {
	let glyphs = [];
	let totalWidth = 0;

	for (const ch of line) {
		const glyph = resolveGlyphForChar(ch, fontSize, time);
		const spacing = getSpacing(ch, fontSize, time);
		if (glyph) glyphs.push({ glyph, offset: totalWidth });
		totalWidth += spacing;
	}

	let linePixelHeight = 1;
	for (const g of glyphs) {
		if (g.glyph && g.glyph.length > linePixelHeight) linePixelHeight = g.glyph.length;
	}
	if (glyphs.length === 0) linePixelHeight = measureDefaultLinePixelHeight(fontSize, time);

	return { glyphs, totalWidth, linePixelHeight };
}

function renderTextBuffer(text, fontSize, baseRow, time) {
	const lines = String(text ?? '').split(/\n/);
	const layouts = [];
	let bufferWidth = 0;
	for (let i = 0; i < lines.length; i++) {
		const layout = layoutGlyphsForTextLine(lines[i], fontSize, time);
		if (layout.totalWidth > bufferWidth) bufferWidth = layout.totalWidth;
		layouts.push(layout);
	}
	if (bufferWidth < 1) bufferWidth = 1;

	const bufferHeight = displaySize.height;
	const buffer = new Array(bufferWidth * bufferHeight).fill(invert_color ? 1 : 0);

	let yCursor = baseRow;
	const lineGap = 1;
	for (let li = 0; li < layouts.length; li++) {
		const { glyphs, linePixelHeight } = layouts[li];
		for (const { glyph, offset } of glyphs) {
			for (let row = 0; row < glyph.length; row++) {
				for (let col = 0; col < glyph[row].length; col++) {
					const x = offset + col;
					const y = yCursor + row;
					if (y >= 0 && y < bufferHeight && x >= 0 && x < bufferWidth) {
						buffer[y * bufferWidth + x] = invert_color ? (glyph[row][col] ? 0 : 1) : (glyph[row][col] ? 1 : 0);
					}
				}
			}
		}
		yCursor += linePixelHeight + lineGap;
	}

	return { buffer, bufferWidth };
}

class WLEDDevice {
	constructor(controller) {
		this.mac = controller.mac;
		this.hostname = controller.hostname;
		this.name = controller.name;
		this.ip = controller.ip;
		this.port = controller.port;
		this.streamingPort = controller.streamingPort;
		this.deviceledcount = controller.deviceledcount;
		this.defaultOn = controller.defaultOn;
		this.defaultBri = controller.defaultBri;
	}

	changeDeviceState(forceOff = false, forceOn = false, fullBright = false) {
		DeviceState.Change(this.ip, this.defaultOn, this.defaultBri, forceOff, forceOn, fullBright, false);
	}

	SetupChannel() {
		device.SetLedLimit(this.deviceledcount);
		device.addChannel(this.name, this.deviceledcount);
	}

	SendColorPackets(shutdown = false) {
		const componentChannel = device.channel("Strip");
		let ChannelLedCount = componentChannel.ledCount > this.deviceledcount ? this.deviceledcount : componentChannel.ledCount;

		let RGBData = [];

		if (shutdown) {
			if (rgbcw_mode == true) {
				RGBData = insertZeroes(device.createColorArray(colorBlack, ChannelLedCount, "Inline"));
			} else {
				RGBData = device.createColorArray(colorBlack, ChannelLedCount, "Inline");
			}
		} else if (LightingMode === "Forced") {
			if (rgbcw_mode == true) {
				RGBData = insertZeroes(device.createColorArray(forcedColor, ChannelLedCount, "Inline"));
			} else {
				RGBData = device.createColorArray(forcedColor, ChannelLedCount, "Inline");
			}
		} else if (componentChannel.shouldPulseColors()) {
			ChannelLedCount = this.deviceledcount;
			const pulseColor = device.getChannelPulseColor("Strip");

			if (rgbcw_mode == true) {
				RGBData = insertZeroes(device.createColorArray(pulseColor, ChannelLedCount, "Inline"));
			} else {
				RGBData = device.createColorArray(pulseColor, ChannelLedCount, "Inline");
			}
		} else {
			if (rgbcw_mode == true) {
				RGBData = insertZeroes(componentChannel.getColors("Inline"));
			} else {
				RGBData = componentChannel.getColors("Inline");
			}
		}

		const NumPackets = Math.ceil(ChannelLedCount / MaxLedsInPacket);

		if (display_mode != 'Components') {
			if (display != undefined) {
				displayClock();
				let Snake_display = rearrangeDisplayForSnakeLayout(display);
				const isPixelArt = display_mode === 'Pixel Art';
				let invertedTextRGB = hexToRgb(invert_text_color || "#FFFFFF");

				for (let led_index = 0; led_index < Snake_display.length; led_index++) {
					let pixelValue = Snake_display[led_index];
					if (isPixelArt && invert_color) {
						if (pixelValue === 1) pixelValue = 0;
						else if (pixelValue === 0) pixelValue = 1;
					}

					switch (pixelValue) {
						case 0:
							if (invert_color) {
								RGBData[led_index * 3] = invertedTextRGB.r;
								RGBData[led_index * 3 + 1] = invertedTextRGB.g;
								RGBData[led_index * 3 + 2] = invertedTextRGB.b;
							} else {
								RGBData[led_index * 3] = 0;
								RGBData[led_index * 3 + 1] = 0;
								RGBData[led_index * 3 + 2] = 0;
							}
							break;
						case 0.3:
							let fcRGB = hexToRgb(forcedColor);
							RGBData[led_index * 3] = fcRGB.r;
							RGBData[led_index * 3 + 1] = fcRGB.g;
							RGBData[led_index * 3 + 2] = fcRGB.b;
							break;
						case 0.5:
							let scaleFactor = translucent1 / 100;
							let darken = lowerBrightnessRGB(RGBData[led_index * 3], RGBData[led_index * 3 + 1], RGBData[led_index * 3 + 2], scaleFactor);
							RGBData[led_index * 3] = darken[0];
							RGBData[led_index * 3 + 1] = darken[1];
							RGBData[led_index * 3 + 2] = darken[2];
							break;
						case 0.7:
							let scaleFactor2 = translucent2 / 100;
							let darken2 = lowerBrightnessRGB(RGBData[led_index * 3], RGBData[led_index * 3 + 1], RGBData[led_index * 3 + 2], scaleFactor2);
							RGBData[led_index * 3] = darken2[0];
							RGBData[led_index * 3 + 1] = darken2[1];
							RGBData[led_index * 3 + 2] = darken2[2];
							break;
						default:
							if (typeof pixelValue === "string" && pixelValue[0] === "#") {
								let c = hexToRgb(pixelValue);
								RGBData[led_index * 3] = c.r;
								RGBData[led_index * 3 + 1] = c.g;
								RGBData[led_index * 3 + 2] = c.b;
							} else if (Array.isArray(pixelValue)) {
								RGBData[led_index * 3] = pixelValue[0];
								RGBData[led_index * 3 + 1] = pixelValue[1];
								RGBData[led_index * 3 + 2] = pixelValue[2];
							}
					}
				}
			}
		}

		let times = rgbcw_mode == true ? 5 : 3;

		for (let CurrPacket = 0; CurrPacket < NumPackets; CurrPacket++) {
			const startIdx = CurrPacket * MaxLedsInPacket;
			const highByte = ((startIdx >> 8) & 0xFF);
			const lowByte = (startIdx & 0xFF);
			let packet = [0x04, 0x02, highByte, lowByte];
			packet = packet.concat(RGBData.splice(0, MaxLedsInPacket * times));
			udp.send(this.ip, this.streamingPort, packet, BIG_ENDIAN);
		}
	}
}

function isChineseChar(char) {
	return /[\u4E00-\u9FFF]/.test(char);
}


function __wledClockAfterInit() {
	try {
		WLED = new WLEDDevice(controller);
		WLED.changeDeviceState(false, true, true);
		detect2DMapping();
		if (typeof display_mode !== "undefined" && display_mode === "Pixel Art") {
			try {
				PIXELART = JSON.parse(typeof pixel_art !== "undefined" ? pixel_art : "[]");
				if (typeof device !== "undefined" && device && device.log) device.log("Pixel art updated");
			} catch (ex) {
				if (typeof device !== "undefined" && device && device.log) device.log(String(ex && ex.message ? ex.message : ex));
			}
		}
	} catch (_e) {}
}

function __wledClockUseStockUdpCanvas() {
	try {
		var dm = typeof display_mode === "undefined" || display_mode === null ? "" : String(display_mode).trim();
		if (!dm) return true;
		var s = dm.toLowerCase();
		if (s === "time") return false;
		if (s === "custom text") return false;
		if (s === "pixel art") return false;
		if (s === "libre hardware monitor") return false;
		return true;
	} catch (_e) {
		return true;
	}
}

/** Invalidate LHM text cache so format/URL/interval changes show on the next frame (host calls after controllable sync). */
function __wledClockResetLhmFetchCache() {
	try {
		if (typeof lastLHMFetch !== "undefined" && lastLHMFetch) {
			lastLHMFetch.result = "Loading...";
			lastLHMFetch.time = 0;
		}
	} catch (_e) {}
}

export function onLhm_formatChanged() {
	__wledClockResetLhmFetchCache();
}

export function onLhmjsonChanged() {
	__wledClockResetLhmFetchCache();
}

export function onLhm_updateChanged() {
	__wledClockResetLhmFetchCache();
}

export function onLhm_use_decimalsChanged() {
	__wledClockResetLhmFetchCache();
}

/** When scroll is disabled, snap matrix text/pixel-art offsets back to the start (host calls on parameter change). */
export function onScroll_directionChanged() {
	try {
		var v = String(typeof scroll_direction !== "undefined" ? scroll_direction : "").trim();
		if (v.toLowerCase() !== "off") return;
		try {
			scrollOffset = 0;
		} catch (_e0) {}
		try {
			pingPongDirection = -1;
		} catch (_e1) {}
		if (typeof WLED !== "undefined" && WLED) {
			if (typeof WLED.resetScrollPosition === "function") WLED.resetScrollPosition();
			if (typeof WLED.ResetScrollPosition === "function") WLED.ResetScrollPosition();
			try {
				if (typeof WLED.scrollOffset === "number") WLED.scrollOffset = 0;
			} catch (_e2) {}
			try {
				if (typeof WLED.textScrollOffset === "number") WLED.textScrollOffset = 0;
			} catch (_e3) {}
			try {
				if (typeof WLED.pixelScrollOffset === "number") WLED.pixelScrollOffset = 0;
			} catch (_e4) {}
		}
	} catch (_e) {}
}

/** Host calls this after plugin eval; PluginSandbox runs it *before* wrapping `render`. */
export function __rgbjPostWirePluginExports() {
	try {
		if (!exports || typeof exports.render !== "function" || exports.render.__wledClockWrapped) return;
		var baseRender = exports.render;
		var baseInit = exports.initialize;
		var baseShutdown = exports.shutdown;
		function wrappedRender() {
			if (typeof __rgbjSyncControllableParams === "function") __rgbjSyncControllableParams();
			if (__wledClockUseStockUdpCanvas()) {
				return baseRender();
			}
			if (typeof WLED === "undefined" || !WLED || typeof WLED.SendColorPackets !== "function") {
				return baseRender();
			}
			return WLED.SendColorPackets(false);
		}
		wrappedRender.__wledClockWrapped = true;
		exports.render = wrappedRender;
		exports.Render = wrappedRender;
		function wrappedInit() {
			var r = typeof baseInit === "function" ? baseInit() : undefined;
			__wledClockAfterInit();
			return r;
		}
		exports.initialize = wrappedInit;
		exports.Initialize = wrappedInit;
		function wrappedShutdown(a) {
			try {
				if (typeof WLED !== "undefined" && WLED && typeof WLED.SendColorPackets === "function") {
					WLED.SendColorPackets(true);
				}
				if (typeof WLED !== "undefined" && WLED && typeof WLED.changeDeviceState === "function") {
					WLED.changeDeviceState(typeof turnOffOnShutdown !== "undefined" ? turnOffOnShutdown : false);
				}
			} catch (_e) {}
			return typeof baseShutdown === "function" ? baseShutdown(a) : undefined;
		}
		exports.shutdown = wrappedShutdown;
		exports.Shutdown = wrappedShutdown;
	} catch (_e) {}
}

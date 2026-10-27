window.__ModuleLoader__.load({
	id: "dsh-codex-subscription",
	chunk: "client.sketch.js",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		//#region src/workspace-icons.jsx
		function WorkspaceIcon({ name, size = 24 }) {
			const paths = {
				select: "M5 3l14 9-7 2-3 7-4-18z",
				text: "M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3",
				arrow: "M4 20L20 4M10 4h10v10",
				line: "M4 20L20 4",
				layers: "M12 3L2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5",
				eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 11-6 0 3 3 0 016 0",
				eyeOff: "M3 3l18 18M9 5a10 10 0 013 0c6 0 10 7 10 7l-3 4M6 6C3 8 2 12 2 12s4 7 10 7c2 0 4-1 5-2",
				duplicate: "M8 8h13v13H8zM16 8V3H3v13h5",
				up: "M12 20V4M5 11l7-7 7 7",
				down: "M12 4v16M5 13l7 7 7-7",
				pencil: "M4 20l2-6L17 3l4 4L10 18l-6 2zM14 6l4 4",
				marker: "M5 16l9-12 7 5-9 12-7-5zM5 16l-3 4 6 1M12 7l7 5",
				image: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01",
				close: "M6 6l12 12M18 6L6 18",
				stop: "M6 6h12v12H6z",
				pen: "M4 17c3-7 12-15 12-11S4 19 8 19s10-10 10-6-6 8-2 7l4-3",
				eraser: "M4 14l9-10 7 7-9 10H9l-5-5zM8 10l7 7M11 21h10",
				undo: "M9 5L4 10l5 5M5 10h9a6 6 0 010 12",
				redo: "M15 5l5 5-5 5M19 10h-9a6 6 0 000 12",
				check: "M5 12l5 5 9-11",
				clear: "M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13",
				rectangle: "M5 5h14v14H5z",
				circle: "M20 12a8 8 0 11-16 0 8 8 0 0116 0"
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: paths[name] ?? paths.pen })
			});
		}
		//#endregion
		//#region src/sketch-curves.js
		const cached = /* @__PURE__ */ new WeakMap();
		const midpoint = (a, b) => ({
			x: (a.x + b.x) / 2,
			y: (a.y + b.y) / 2
		});
		function flattenSketchCurve(stroke, width, height) {
			const previous = cached.get(stroke);
			if (previous?.width === width && previous.height === height) return previous.points;
			const controls = stroke.points.map((p) => ({
				x: p.x * width,
				y: p.y * height
			})), points = [controls[0]];
			const distance = (p, a, b) => {
				const dx = b.x - a.x, dy = b.y - a.y, d = dx * dx + dy * dy;
				const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d)) : 0;
				return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
			};
			const split = (a, b, c, d, depth) => {
				if (depth === 10 || Math.max(distance(b, a, d), distance(c, a, d)) <= .5) {
					points.push(d);
					return;
				}
				const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d), abc = midpoint(ab, bc), bcd = midpoint(bc, cd), m = midpoint(abc, bcd);
				split(a, ab, abc, m, depth + 1);
				split(m, bcd, cd, d, depth + 1);
			};
			for (let i = 1; i < controls.length; i += 3) split(controls[i - 1], controls[i], controls[i + 1], controls[i + 2], 0);
			const normalized = points.map((p) => ({
				x: p.x / width,
				y: p.y / height
			}));
			cached.set(stroke, {
				width,
				height,
				points: normalized
			});
			return normalized;
		}
		//#endregion
		//#region src/sketch-brushes.js
		const grains = /* @__PURE__ */ new Map();
		function pencilGrain(context, color) {
			if (!context.createPattern || typeof document === "undefined") return color;
			if (!grains.has(color)) {
				const canvas = document.createElement("canvas");
				canvas.width = 64;
				canvas.height = 64;
				const ctx = canvas.getContext("2d");
				ctx.fillStyle = color;
				let seed = 173;
				for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
					seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
					const value = seed / 4294967296;
					if (value < .28) continue;
					ctx.globalAlpha = .2 + value * .8;
					ctx.fillRect(x, y, 1, 1);
				}
				if (grains.size >= 16) grains.delete(grains.keys().next().value);
				grains.set(color, canvas);
			}
			return context.createPattern(grains.get(color), "repeat") ?? color;
		}
		function configureSketchBrush(context, stroke) {
			const modern = stroke.brushVersion === 2 && stroke.shape === "pen";
			const brush = stroke.brush ?? "pen";
			context.lineCap = modern && brush === "marker" ? "butt" : "round";
			context.lineJoin = "round";
			context.globalAlpha = (stroke.opacity ?? 1) * (brush === "marker" ? .28 : brush === "pencil" ? modern ? .85 : .65 : 1);
			context.lineWidth = stroke.width * (brush === "pencil" && !modern ? .55 : 1) * (stroke.pressure ?? 1);
			context.strokeStyle = modern && brush === "pencil" ? pencilGrain(context, stroke.color) : stroke.color;
			context.fillStyle = context.strokeStyle;
		}
		//#endregion
		//#region src/sketch-text.js
		const cache = /* @__PURE__ */ new WeakMap();
		function layoutSketchText(stroke, context, width, height) {
			const saved = cache.get(stroke);
			if (saved?.width === width && saved?.height === height) return saved.layout;
			const [a, b] = stroke.points;
			const x = Math.min(a.x, b.x) * width, y = Math.min(a.y, b.y) * height;
			const w = Math.abs(b.x - a.x) * width, h = Math.abs(b.y - a.y) * height;
			const wrap = (size) => {
				context.font = `${size}px system-ui, sans-serif`;
				const lines = [];
				for (const paragraph of stroke.text.split("\n")) {
					let line = "";
					for (const char of paragraph) {
						if (line && context.measureText(line + char).width > w) {
							lines.push(line);
							line = "";
						}
						line += char;
					}
					lines.push(line);
				}
				return lines;
			};
			let size = stroke.width, lines = wrap(size);
			if (lines.length * size * 1.2 > h || lines.some((line) => context.measureText(line).width > w)) {
				let low = 0, high = size;
				for (let i = 0; i < 14; i++) {
					const mid = (low + high) / 2, candidate = wrap(mid);
					if (candidate.length * mid * 1.2 <= h && candidate.every((line) => context.measureText(line).width <= w)) low = mid;
					else high = mid;
				}
				size = low;
				lines = wrap(size);
			}
			const layout = {
				x,
				y,
				size,
				lines
			};
			cache.set(stroke, {
				width,
				height,
				layout
			});
			return layout;
		}
		function newTextBounds(point) {
			const a = {
				x: Math.min(point.x, .65),
				y: Math.min(point.y, .85)
			};
			return [a, {
				x: a.x + .35,
				y: a.y + .15
			}];
		}
		const finite$1 = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
		const FILLABLE = [
			"rectangle",
			"circle",
			"polygon",
			"bezier"
		];
		function normalizeBlur(value) {
			if (value === void 0 || value === null) return void 0;
			if (!finite$1(value, 0, 64)) throw Error(`blur must be 0–64 canvas pixels`);
			return value >= .5 ? Math.round(value * 10) / 10 : void 0;
		}
		function normalizeGradient(gradient) {
			if (gradient === void 0 || gradient === null) return void 0;
			if (!gradient || typeof gradient !== "object") throw Error("Invalid gradient");
			if (gradient.type === "none") return void 0;
			if (gradient.type !== "linear" && gradient.type !== "radial") throw Error("gradient.type must be linear or radial");
			const stops = gradient.stops;
			if (!Array.isArray(stops) || stops.length < 2 || stops.length > 8) throw Error("gradient needs 2–8 stops");
			const clean = stops.map((stop) => {
				if (!stop || !finite$1(stop.offset, 0, 1) || !/^#[0-9a-f]{6}$/i.test(stop.color ?? "") || stop.opacity !== void 0 && !finite$1(stop.opacity, 0, 1)) throw Error("Each gradient stop needs offset 0–1 and color #rrggbb (optional opacity 0–1)");
				return {
					offset: stop.offset,
					color: stop.color.toLowerCase(),
					...stop.opacity !== void 0 && stop.opacity < 1 ? { opacity: stop.opacity } : {}
				};
			}).sort((a, b) => a.offset - b.offset);
			const number = (name, fallback, min = -8, max = 8) => {
				const value = gradient[name] ?? fallback;
				if (!finite$1(value, min, max)) throw Error(`gradient.${name} must be a number`);
				return Math.round(value * 1e4) / 1e4;
			};
			if (gradient.type === "linear") return {
				type: "linear",
				x1: number("x1", 0),
				y1: number("y1", 0),
				x2: number("x2", 0),
				y2: number("y2", 1),
				stops: clean
			};
			const cx = number("cx", .5), cy = number("cy", .5), r = number("r", .5, 1e-4), ry = gradient.ry === void 0 ? r : number("ry", .5, 1e-4);
			return {
				type: "radial",
				cx,
				cy,
				r,
				...ry !== r ? { ry } : {},
				fx: number("fx", cx),
				fy: number("fy", cy),
				stops: clean
			};
		}
		function gradientFits(shape, fill) {
			return fill === true && FILLABLE.includes(shape);
		}
		const rgba = (color, opacity = 1) => {
			const value = Number.parseInt(color.slice(1), 16);
			return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${opacity})`;
		};
		function fillSketchShape(context, stroke, size, height) {
			const gradient = stroke.gradient;
			const xs = stroke.points.map((point) => point.x), ys = stroke.points.map((point) => point.y);
			const x = Math.min(...xs) * size, y = Math.min(...ys) * height;
			const w = (Math.max(...xs) - Math.min(...xs)) * size, h = (Math.max(...ys) - Math.min(...ys)) * height;
			if (!gradient || !(w > 0 && h > 0) || !context.createLinearGradient) {
				context.fill();
				return;
			}
			let paint;
			if (gradient.type === "linear") {
				paint = context.createLinearGradient(x + gradient.x1 * w, y + gradient.y1 * h, x + gradient.x2 * w, y + gradient.y2 * h);
				for (const stop of gradient.stops) paint.addColorStop(stop.offset, rgba(stop.color, stop.opacity));
				context.fillStyle = paint;
				context.fill();
				return;
			}
			const rx = gradient.r * w, ry = (gradient.ry ?? gradient.r) * h;
			paint = context.createRadialGradient((gradient.fx - gradient.cx) / gradient.r, (gradient.fy - gradient.cy) / (gradient.ry ?? gradient.r), 0, 0, 0, 1);
			for (const stop of gradient.stops) paint.addColorStop(stop.offset, rgba(stop.color, stop.opacity));
			context.save();
			context.translate(x + gradient.cx * w, y + gradient.cy * h);
			context.scale(rx, ry);
			context.fillStyle = paint;
			context.fill();
			context.restore();
		}
		const BLEND_MODES = [
			"multiply",
			"screen",
			"overlay",
			"soft-light",
			"hard-light",
			"color-dodge",
			"color-burn",
			"darken",
			"lighten",
			"lighter"
		];
		function normalizeBlend(value) {
			if (value === void 0 || value === null || value === "normal") return void 0;
			if (!BLEND_MODES.includes(value)) throw Error("blend must be one of normal, " + BLEND_MODES.join(", "));
			return value;
		}
		function normalizeClip(clip) {
			if (clip === void 0 || clip === null) return void 0;
			if (!clip || typeof clip !== "object") throw Error("Invalid clip");
			if (clip.shape === "none") return void 0;
			const { shape, points } = clip;
			if (![
				"polygon",
				"bezier",
				"rectangle",
				"circle"
			].includes(shape)) throw Error("clip.shape must be polygon, bezier, rectangle or circle");
			if (!Array.isArray(points) || points.some((point) => !point || !finite$1(point.x, 0, 1) || !finite$1(point.y, 0, 1))) throw Error("clip.points must be {x,y} pairs inside 0..1");
			if ((shape === "rectangle" || shape === "circle") && points.length !== 2) throw Error("clip rectangle and circle need exactly two opposite corners");
			if (shape === "polygon" && (points.length < 3 || points.length > 2e3)) throw Error("clip polygon needs 3–2000 points");
			if (shape === "bezier" && (points.length < 4 || points.length > 193 || (points.length - 1) % 3 !== 0)) throw Error("clip bezier needs 4, 7, ... 193 points (start + control1/control2/end per segment)");
			return {
				shape,
				points: points.map((point) => ({
					x: Math.round(point.x * 1e5) / 1e5,
					y: Math.round(point.y * 1e5) / 1e5
				}))
			};
		}
		function applySketchClip(context, clip, size, height) {
			const { shape, points } = clip;
			const first = points[0], last = points.at(-1);
			context.beginPath();
			if (shape === "bezier") {
				context.moveTo(first.x * size, first.y * height);
				for (let i = 1; i < points.length; i += 3) context.bezierCurveTo(points[i].x * size, points[i].y * height, points[i + 1].x * size, points[i + 1].y * height, points[i + 2].x * size, points[i + 2].y * height);
			} else if (shape === "polygon") {
				context.moveTo(first.x * size, first.y * height);
				for (const point of points.slice(1)) context.lineTo(point.x * size, point.y * height);
			} else if (shape === "rectangle") context.rect(first.x * size, first.y * height, (last.x - first.x) * size, (last.y - first.y) * height);
			else context.ellipse((first.x + last.x) * size / 2, (first.y + last.y) * height / 2, Math.abs(last.x - first.x) * size / 2, Math.abs(last.y - first.y) * height / 2, 0, 0, Math.PI * 2);
			context.closePath();
			context.clip();
		}
		//#endregion
		//#region src/sketch-document.js
		const SKETCH_SIZE = 1024;
		const MAX_SKETCH_STROKES = 2e3;
		const MAX_STROKE_POINTS = 2e3;
		function sketchPoint(clientX, clientY, rect) {
			if (!(rect.width > 0 && rect.height > 0)) return void 0;
			return {
				x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
				y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
			};
		}
		function paintSketch(context, strokes, size = SKETCH_SIZE, transparent = false, height = size, start = 0, end = strokes.length) {
			context.globalCompositeOperation = "source-over";
			context.globalAlpha = 1;
			if (!transparent) {
				context.fillStyle = "#ffffff";
				context.fillRect(0, 0, size, height);
			}
			context.lineCap = "round";
			context.lineJoin = "round";
			for (let index = start; index < end; index++) {
				const stroke = strokes[index];
				const first = stroke.points[0];
				if (!first) continue;
				context.globalCompositeOperation = stroke.shape === "eraser" ? "destination-out" : stroke.blend ?? "source-over";
				configureSketchBrush(context, stroke);
				if (stroke.blur > 0) context.filter = `blur(${stroke.blur}px)`;
				if (stroke.clip) {
					context.save();
					applySketchClip(context, stroke.clip, size, height);
				}
				context.beginPath();
				const last = stroke.points.at(-1);
				if (stroke.shape === "text") {
					const { x, y, lines, size: fontSize } = layoutSketchText(stroke, context, size, height);
					context.font = `${fontSize}px system-ui, sans-serif`;
					context.textBaseline = "top";
					lines.forEach((line, i) => context.fillText(line, x, y + i * fontSize * 1.2));
				} else if (stroke.shape === "arrow") {
					const x = last.x * size, y = last.y * height, a = Math.atan2(y - first.y * height, x - first.x * size), head = Math.min(Math.hypot(x - first.x * size, y - first.y * height) * .4, Math.max(12, stroke.width * 3));
					context.moveTo(first.x * size, first.y * height);
					context.lineTo(x, y);
					context.stroke();
					context.beginPath();
					context.moveTo(x, y);
					context.lineTo(x - head * Math.cos(a - .5), y - head * Math.sin(a - .5));
					context.lineTo(x - head * Math.cos(a + .5), y - head * Math.sin(a + .5));
					context.closePath();
					context.fill();
				} else if (stroke.shape === "bezier") {
					context.moveTo(first.x * size, first.y * height);
					for (let i = 1; i < stroke.points.length; i += 3) {
						const [a, b, c] = stroke.points.slice(i, i + 3);
						context.bezierCurveTo(a.x * size, a.y * height, b.x * size, b.y * height, c.x * size, c.y * height);
					}
					if (stroke.fill) {
						context.closePath();
						fillSketchShape(context, stroke, size, height);
					} else context.stroke();
				} else if (stroke.shape === "line") {
					context.moveTo(first.x * size, first.y * height);
					context.lineTo(last.x * size, last.y * height);
					context.stroke();
				} else if (stroke.shape === "rectangle") {
					context.rect(first.x * size, first.y * height, (last.x - first.x) * size, (last.y - first.y) * height);
					if (stroke.fill) fillSketchShape(context, stroke, size, height);
					else context.stroke();
				} else if (stroke.shape === "circle") {
					context.ellipse((first.x + last.x) * size / 2, (first.y + last.y) * height / 2, Math.abs(last.x - first.x) * size / 2, Math.abs(last.y - first.y) * height / 2, 0, 0, Math.PI * 2);
					if (stroke.fill) fillSketchShape(context, stroke, size, height);
					else context.stroke();
				} else if (stroke.shape === "polygon") {
					context.moveTo(first.x * size, first.y * height);
					for (const point of stroke.points.slice(1)) context.lineTo(point.x * size, point.y * height);
					context.closePath();
					if (stroke.fill) fillSketchShape(context, stroke, size, height);
					else context.stroke();
				} else if (stroke.points.length === 1) {
					if (stroke.brushVersion === 2 && stroke.brush === "marker") context.rect(first.x * size - context.lineWidth / 2, first.y * height - context.lineWidth / 4, context.lineWidth, context.lineWidth / 2);
					else context.arc(first.x * size, first.y * height, context.lineWidth / 2, 0, Math.PI * 2);
					context.fill();
				} else {
					context.moveTo(first.x * size, first.y * height);
					for (let i = 1; i < stroke.points.length - 1; i++) {
						const point = stroke.points[i], next = stroke.points[i + 1];
						if (context.quadraticCurveTo) context.quadraticCurveTo(point.x * size, point.y * height, (point.x + next.x) * size / 2, (point.y + next.y) * height / 2);
						else context.lineTo(point.x * size, point.y * height);
					}
					context.lineTo(last.x * size, last.y * height);
					context.stroke();
				}
				if (stroke.clip) context.restore();
				if (stroke.blur > 0) context.filter = "none";
			}
			context.globalCompositeOperation = "source-over";
			context.globalAlpha = 1;
		}
		const createSketchLayers = () => ({
			active: 1,
			nextId: 2,
			layers: [{
				id: 1,
				name: "",
				visible: true,
				strokes: []
			}]
		});
		const strokeCount = (doc) => doc.layers.reduce((n, layer) => n + layer.strokes.length, 0);
		function changeSketchLayer(doc, action, id = doc.active, value) {
			const index = doc.layers.findIndex((layer) => layer.id === id);
			if (index < 0) return doc;
			const layers = doc.layers.slice(), layer = layers[index];
			if (action === "select") return {
				...doc,
				active: id
			};
			if (action === "add" || action === "duplicate") {
				if (layers.length >= 8 || action === "duplicate" && strokeCount(doc) + layer.strokes.length > 2e3) return doc;
				const next = action === "add" ? {
					id: doc.nextId,
					name: "",
					visible: true,
					strokes: []
				} : {
					...layer,
					id: doc.nextId,
					strokes: layer.strokes.slice()
				};
				layers.splice(index + 1, 0, next);
				return {
					...doc,
					layers,
					active: next.id,
					nextId: doc.nextId + 1
				};
			}
			if (action === "delete") {
				if (layers.length === 1) return doc;
				layers.splice(index, 1);
				return {
					...doc,
					layers,
					active: doc.active === id ? layers[Math.min(index, layers.length - 1)].id : doc.active
				};
			}
			if (action === "up" || action === "down") {
				const target = index + (action === "up" ? 1 : -1);
				if (!layers[target]) return doc;
				[layers[index], layers[target]] = [layers[target], layer];
			} else if (action === "visible") layers[index] = {
				...layer,
				visible: !layer.visible
			};
			else if (action === "rename") layers[index] = {
				...layer,
				name: String(value).trim().slice(0, 40)
			};
			else if (action === "blend") {
				const blend = normalizeBlend(value);
				const { blend: _old, ...rest } = layer;
				layers[index] = blend ? {
					...rest,
					blend
				} : rest;
			} else if (action === "clear") layers[index] = {
				...layer,
				strokes: [],
				image: void 0
			};
			else return doc;
			return {
				...doc,
				layers
			};
		}
		const distanceToSegment = (p, a, b) => {
			const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
			const k = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
			return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
		};
		function strokeHit(stroke, point, radius, width = SKETCH_SIZE, height = width) {
			let points = stroke.shape === "bezier" ? flattenSketchCurve(stroke, width, height) : stroke.points;
			if (!points.length) return false;
			const a = points[0], b = points.at(-1);
			if ((stroke.shape === "text" || stroke.fill && stroke.shape === "rectangle") && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)) return true;
			if (stroke.fill && stroke.shape === "circle") {
				const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
				if (rx && ry && ((point.x - (a.x + b.x) / 2) / rx) ** 2 + ((point.y - (a.y + b.y) / 2) / ry) ** 2 <= 1) return true;
			}
			if (stroke.shape === "polygon" || stroke.shape === "bezier" && stroke.fill) {
				if (stroke.fill) {
					let inside = false;
					for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
						const p = points[i], q = points[j];
						if (p.y > point.y !== q.y > point.y && point.x < (q.x - p.x) * (point.y - p.y) / (q.y - p.y) + p.x) inside = !inside;
					}
					if (inside) return true;
				}
				points = [...points, points[0]];
			}
			if (stroke.shape === "rectangle") points = [
				a,
				{
					x: b.x,
					y: a.y
				},
				b,
				{
					x: a.x,
					y: b.y
				},
				a
			];
			if (stroke.shape === "circle") points = Array.from({ length: 65 }, (_, i) => ({
				x: (a.x + b.x) / 2 + Math.abs(b.x - a.x) / 2 * Math.cos(i * Math.PI / 32),
				y: (a.y + b.y) / 2 + Math.abs(b.y - a.y) / 2 * Math.sin(i * Math.PI / 32)
			}));
			points = points.map((p) => ({
				x: p.x * width,
				y: p.y * height
			}));
			point = {
				x: point.x * width,
				y: point.y * height
			};
			const tolerance = radius + stroke.width / 2;
			return points.some((p, i) => distanceToSegment(point, i ? points[i - 1] : p, p) <= tolerance);
		}
		const SKETCH_RATIOS = Object.freeze({
			"1:1": [1024, 1024],
			"4:3": [1024, 768],
			"3:4": [768, 1024],
			"16:9": [1024, 576],
			"9:16": [576, 1024]
		});
		function resizeSketch(doc, ratio) {
			if (!Object.hasOwn(SKETCH_RATIOS, ratio)) throw new Error("Invalid sketch ratio");
			const [width, height] = SKETCH_RATIOS[ratio];
			const oldWidth = doc.width ?? 1024, oldHeight = doc.height ?? 1024;
			if (width === oldWidth && height === oldHeight) return doc;
			const scale = Math.min(width / oldWidth, height / oldHeight);
			const dx = (width - oldWidth * scale) / 2, dy = (height - oldHeight * scale) / 2;
			return {
				...doc,
				width,
				height,
				ratio,
				layers: doc.layers.map((layer) => ({
					...layer,
					...layer.image ? { image: {
						...layer.image,
						x: (layer.image.x * oldWidth * scale + dx) / width,
						y: (layer.image.y * oldHeight * scale + dy) / height,
						width: layer.image.width * oldWidth * scale / width,
						height: layer.image.height * oldHeight * scale / height
					} } : {},
					strokes: layer.strokes.map((stroke) => ({
						...stroke,
						width: stroke.width * scale,
						points: stroke.points.map((p) => ({
							x: (p.x * oldWidth * scale + dx) / width,
							y: (p.y * oldHeight * scale + dy) / height
						}))
					}))
				}))
			};
		}
		//#endregion
		//#region src/sketch-layer-panel.jsx
		function SketchLayerPanel({ document, disabled, change, t }) {
			const current = document.layers.find((layer) => layer.id === document.active);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: "codexSketchLayers",
				"aria-label": t("sketchLayers"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchLayers") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						title: t("sketchLayerAdd"),
						"aria-label": t("sketchLayerAdd"),
						disabled: disabled || document.layers.length >= 8,
						onClick: () => change("add"),
						children: "＋"
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexLayerList",
						children: document.layers.slice().reverse().map((layer) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexLayerRow",
							"data-active": layer.id === document.active,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled,
								"aria-label": `${t("sketchLayerVisible")} ${layer.id}`,
								"aria-pressed": layer.visible,
								onClick: () => change("visible", layer.id),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
									name: layer.visible ? "eye" : "eyeOff",
									size: 18
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled,
								"aria-pressed": layer.id === document.active,
								onClick: () => change("select", layer.id),
								children: layer.name || `${t("sketchLayer")} ${layer.id}`
							})]
						}, layer.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: "codexSketchLayerLabel",
						children: t("sketchLayerName")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						disabled,
						"aria-label": t("sketchLayerName"),
						defaultValue: current.name,
						placeholder: `${t("sketchLayer")} ${current.id}`,
						maxLength: 40,
						onBlur: (e) => {
							if (e.target.value !== current.name) change("rename", current.id, e.target.value);
						},
						onKeyDown: (e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}
					}, current.id + "-" + current.name),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexLayerActions",
						children: [
							"duplicate",
							"up",
							"down",
							"delete"
						].map((action) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							title: t(`sketchLayer_${action}`),
							"aria-label": t(`sketchLayer_${action}`),
							disabled: disabled || action === "delete" && document.layers.length === 1 || action === "duplicate" && (document.layers.length >= 8 || strokeCount(document) + current.strokes.length > 2e3) || action === "up" && current === document.layers.at(-1) || action === "down" && current === document.layers[0],
							onClick: () => change(action),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
								name: action === "delete" ? "clear" : action,
								size: 17
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`sketchLayer_${action}`) })]
						}, action))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "codexSketchClearLayer",
						disabled: disabled || !current.strokes.length && !current.image,
						onClick: () => change("clear"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
							name: "clear",
							size: 16
						}), t("sketchClearLayer")]
					})
				]
			});
		}
		//#endregion
		//#region src/sketch-picture-panel.jsx
		function SketchPicturePanel({ document, disabled, pictureInput, importImage, runFile, change, t }) {
			const pictures = document.layers.filter((layer) => layer.image);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: "codexSketchPictures",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchPictures") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled,
						onClick: () => pictureInput.current.click(),
						children: t("sketchPictureAdd")
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: pictureInput,
						hidden: true,
						type: "file",
						accept: "image/png,image/jpeg,image/webp",
						onChange: (event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file) runFile(() => importImage(file));
						}
					}),
					pictures.map((layer) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"data-active": layer.id === document.active,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled,
							"aria-label": `${t("sketchPictureSelect")} ${layer.name}`,
							onClick: () => change("select", layer.id),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
								src: layer.image.src,
								alt: layer.name
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled,
							"aria-label": `${t("sketchDeleteDraft")} ${layer.name}`,
							onClick: () => change(document.layers.length === 1 ? "clear" : "delete", layer.id),
							children: "×"
						})]
					}, layer.id)),
					pictures.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchPicturesEmpty") }) : null
				]
			});
		}
		//#endregion
		//#region src/sketch-tool-picker.jsx
		function SketchToolPicker({ t, disabled, tool, brush, chooseBrush, chooseTool, shapesOpen, setShapesOpen }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSketchPill",
				role: "toolbar",
				"aria-label": t("sketchTitle"),
				title: t("sketchShortcuts"),
				children: [
					[
						"select",
						"pen",
						"pencil",
						"marker",
						"text",
						"eraser"
					].map((name) => {
						const drawing = [
							"pen",
							"pencil",
							"marker"
						].includes(name);
						const label = t(drawing ? `sketchBrush_${name}` : `sketchTool_${name}`);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-label": label,
							title: drawing ? `${label} · ${t(`sketchBrushHint_${name}`)}` : label,
							"aria-pressed": drawing ? tool === "pen" && brush === name : tool === name,
							disabled,
							onClick: () => {
								if (drawing) chooseBrush(name);
								else chooseTool(name);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
								name,
								size: 23
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
						}, name);
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "codexSketchShapeToggle",
						type: "button",
						"aria-label": t("sketchShapes"),
						"aria-expanded": shapesOpen,
						"aria-pressed": [
							"line",
							"arrow",
							"rectangle",
							"circle"
						].includes(tool),
						disabled,
						onClick: () => setShapesOpen((v) => !v),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
							name: [
								"line",
								"arrow",
								"rectangle",
								"circle"
							].includes(tool) ? tool : "rectangle",
							size: 23
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t([
							"line",
							"arrow",
							"rectangle",
							"circle"
						].includes(tool) ? `sketchTool_${tool}` : "sketchShapes") })]
					}),
					shapesOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSketchShapeMenu",
						children: [
							"line",
							"arrow",
							"rectangle",
							"circle"
						].map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled,
							type: "button",
							"aria-pressed": tool === name,
							onClick: () => {
								chooseTool(name);
								setShapesOpen(false);
							},
							children: t(`sketchTool_${name}`)
						}, name))
					}) : null
				]
			});
		}
		//#endregion
		//#region src/sketch-interactions.js
		function useSketchDismiss(open, close, host, selectors) {
			const latest = (0, react.useRef)(close);
			latest.current = close;
			(0, react.useEffect)(() => {
				if (!open) return;
				const dialog = host.current?.closest("dialog") ?? host.current;
				if (!dialog) return;
				const pointer = (event) => {
					if (selectors.some((selector) => event.target.closest?.(selector))) return;
					latest.current(false);
					if (event.target.matches?.("canvas")) {
						event.preventDefault();
						event.stopPropagation();
						event.target.focus({ preventScroll: true });
					}
				};
				const key = (event) => {
					if (event.key !== "Escape" || event.target.closest?.("dialog") !== dialog) return;
					event.preventDefault();
					event.stopPropagation();
					latest.current(false);
					dialog.querySelector("canvas")?.focus({ preventScroll: true });
				};
				const hidden = () => latest.current(false);
				document.addEventListener("pointerdown", pointer, true);
				document.addEventListener("keydown", key, true);
				dialog.addEventListener("close", hidden);
				return () => {
					document.removeEventListener("pointerdown", pointer, true);
					document.removeEventListener("keydown", key, true);
					dialog.removeEventListener("close", hidden);
				};
			}, [
				open,
				host,
				selectors.join("|")
			]);
		}
		function useSketchCursor(canvas, ring, width, brush, zoom, hidden) {
			const last = (0, react.useRef)(null), heldPressure = (0, react.useRef)(1);
			const update = (event, bounds) => {
				if (event) last.current = event;
				const pointer = last.current, node = canvas.current, cursor = ring.current;
				if (!pointer || !node || !cursor) return;
				const rect = bounds ?? node.getBoundingClientRect();
				if (hidden || pointer.pointerType === "touch" || pointer.clientX < rect.left || pointer.clientX > rect.right || pointer.clientY < rect.top || pointer.clientY > rect.bottom) {
					cursor.hidden = true;
					return;
				}
				const diameter = width * (node.hasPointerCapture(pointer.pointerId) && pointer.pointerType === "pen" ? heldPressure.current : 1) * rect.width / node.width;
				cursor.hidden = false;
				cursor.style.width = `${diameter}px`;
				cursor.style.height = `${diameter}px`;
				cursor.style.transform = `translate(${pointer.clientX - diameter / 2}px,${pointer.clientY - diameter / 2}px)`;
			};
			(0, react.useEffect)(() => {
				update();
				const observer = new ResizeObserver(() => update());
				if (canvas.current) observer.observe(canvas.current);
				return () => observer.disconnect();
			}, [
				width,
				brush,
				zoom,
				hidden
			]);
			return {
				down: (event) => {
					heldPressure.current = event.pointerType === "pen" ? Math.max(.2, event.pressure) : 1;
				},
				move: (event, bounds) => update({
					clientX: event.clientX,
					clientY: event.clientY,
					pointerId: event.pointerId,
					pointerType: event.pointerType,
					pressure: event.pressure
				}, bounds),
				leave: () => {
					last.current = null;
					if (ring.current) ring.current.hidden = true;
				}
			};
		}
		//#endregion
		//#region src/sketch-shortcuts.js
		function sketchShortcutAction(keys, key) {
			key = key.toLowerCase();
			return Object.entries(keys).find(([, value]) => value === key)?.[0] ?? {
				v: "select",
				t: "text",
				"+": "zoomIn"
			}[key];
		}
		//#endregion
		//#region src/sketch-view.jsx
		const DEFAULT_KEYS = {
			pen: "b",
			eraser: "e",
			line: "l",
			rectangle: "r",
			circle: "o",
			pan: " ",
			zoomIn: "=",
			zoomOut: "-",
			fit: "0"
		};
		function useSketchView(canvas, open) {
			const [view, setView] = (0, react.useState)({
				scale: 1,
				x: 0,
				y: 0
			}), [keys, setKeys] = (0, react.useState)(() => {
				try {
					return {
						...DEFAULT_KEYS,
						...JSON.parse(localStorage.getItem("codex-sketch-keys"))
					};
				} catch {
					return DEFAULT_KEYS;
				}
			});
			const [shortcuts, setShortcuts] = (0, react.useState)(() => {
				try {
					return localStorage.getItem("codex-sketch-shortcuts") !== "off";
				} catch {
					return true;
				}
			}), [space, setSpace] = (0, react.useState)(false);
			const drag = (0, react.useRef)(null), viewRef = (0, react.useRef)(view);
			viewRef.current = view;
			const zoom = (factor) => setView((v) => ({
				...v,
				scale: Math.max(.25, Math.min(8, v.scale * factor))
			}));
			const reset = () => setView({
				scale: 1,
				x: 0,
				y: 0
			});
			(0, react.useEffect)(() => {
				const node = canvas.current;
				if (!node || !open) return;
				const wheel = (e) => {
					if (!shortcuts || !e.altKey) return;
					e.preventDefault();
					zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
				};
				node.addEventListener("wheel", wheel, { passive: false });
				return () => node.removeEventListener("wheel", wheel);
			}, [open, shortcuts]);
			(0, react.useEffect)(() => {
				const stop = () => {
					drag.current = null;
					setSpace(false);
				};
				window.addEventListener("blur", stop);
				return () => window.removeEventListener("blur", stop);
			}, []);
			(0, react.useEffect)(() => {
				if (!open || !shortcuts) {
					setSpace(false);
					drag.current = null;
				}
			}, [open, shortcuts]);
			const setKey = (action, key) => {
				key = key.toLowerCase();
				if (!key || Object.entries(keys).some(([a, k]) => a !== action && k === key) || ["[", "]"].includes(key)) return;
				const next = {
					...keys,
					[action]: key
				};
				setKeys(next);
				try {
					localStorage.setItem("codex-sketch-keys", JSON.stringify(next));
				} catch {}
			};
			return {
				view,
				keys,
				shortcuts,
				space,
				zoom,
				reset,
				setKey,
				toggle: () => setShortcuts((v) => {
					try {
						localStorage.setItem("codex-sketch-shortcuts", v ? "off" : "on");
					} catch {}
					return !v;
				}),
				keyDown: (e) => {
					if (!shortcuts || e.ctrlKey || e.metaKey || e.altKey) return false;
					const action = sketchShortcutAction(keys, e.key);
					if (action === "pan") {
						e.preventDefault();
						setSpace(true);
						return true;
					}
					if ([
						"zoomIn",
						"zoomOut",
						"fit"
					].includes(action)) {
						e.preventDefault();
						if (action === "fit") reset();
						else zoom(action === "zoomOut" ? 1 / 1.2 : 1.2);
						return true;
					}
					return false;
				},
				keyUp: (e) => {
					if (e.key.toLowerCase() === keys.pan) setSpace(false);
				},
				down: (e) => {
					if (e.button !== 1 && !space) return false;
					e.preventDefault();
					drag.current = {
						id: e.pointerId,
						x: e.clientX,
						y: e.clientY,
						view: viewRef.current
					};
					canvas.current.setPointerCapture(e.pointerId);
					return true;
				},
				move: (e) => {
					const d = drag.current;
					if (!d || d.id !== e.pointerId) return false;
					setView({
						...d.view,
						x: d.view.x + e.clientX - d.x,
						y: d.view.y + e.clientY - d.y
					});
					return true;
				},
				end: (e) => {
					if (drag.current?.id !== e.pointerId) return false;
					drag.current = null;
					if (canvas.current.hasPointerCapture(e.pointerId)) canvas.current.releasePointerCapture(e.pointerId);
					return true;
				}
			};
		}
		function SketchViewControls({ navigation, t }) {
			const [open, setOpen] = (0, react.useState)(false), [placement, setPlacement] = (0, react.useState)(null);
			const host = (0, react.useRef)(null), trigger = (0, react.useRef)(null);
			const close = () => {
				setOpen(false);
				trigger.current?.focus({ preventScroll: true });
			};
			useSketchDismiss(open, setOpen, host, [".codexSketchViewControls", ".codexSketchKeyPanel"]);
			(0, react.useLayoutEffect)(() => {
				if (!open) return;
				const dialog = host.current.closest("dialog");
				const place = () => {
					const box = dialog.getBoundingClientRect(), anchor = trigger.current.getBoundingClientRect();
					const width = Math.min(360, box.width - 24);
					setPlacement({
						dialog,
						style: {
							width,
							left: Math.max(12, Math.min(anchor.left - box.left, box.width - width - 12)),
							bottom: box.bottom - anchor.top + 8,
							maxHeight: Math.max(80, anchor.top - box.top - 24)
						}
					});
				};
				place();
				const observer = new ResizeObserver(place);
				observer.observe(dialog);
				observer.observe(host.current);
				window.addEventListener("resize", place);
				return () => {
					observer.disconnect();
					window.removeEventListener("resize", place);
				};
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: host,
				className: "codexSketchViewControls",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": t("sketchZoomOut"),
						onClick: () => navigation.zoom(1 / 1.2),
						children: "−"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						title: t("sketchFit"),
						onClick: navigation.reset,
						children: [Math.round(navigation.view.scale * 100), "%"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": t("sketchZoomIn"),
						onClick: () => navigation.zoom(1.2),
						children: "＋"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						ref: trigger,
						type: "button",
						"aria-expanded": open,
						onClick: () => setOpen(!open),
						children: t("sketchKeys")
					}),
					open && placement ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "codexSketchKeyPanel",
						"aria-label": t("sketchKeys"),
						style: placement.style,
						onKeyDown: (e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								e.stopPropagation();
								close();
							}
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchKeys") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": t("sketchFileClose"),
								onClick: close,
								children: "×"
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "codexSketchKeysEnabled",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sketchKeysEnabled") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: navigation.shortcuts,
									onChange: navigation.toggle
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sketchNavigationHint") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchKeyGrid",
								children: Object.entries(navigation.keys).map(([action, key]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t(`sketchKey_${action}`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t(`sketchKey_${action}`),
									value: key === " " ? "Space" : key,
									readOnly: true,
									onKeyDown: (e) => {
										if (e.key === "Tab" || e.key === "Escape") return;
										e.preventDefault();
										e.stopPropagation();
										if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) navigation.setKey(action, e.key);
									}
								})] }, action))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchKeyHint") })
						]
					}), placement.dialog) : null
				]
			});
		}
		//#endregion
		//#region src/sketch-controls.jsx
		const PALETTE = [
			"#18181b",
			"#929398",
			"#ff3936",
			"#ff9500",
			"#ffcc00",
			"#34c759",
			"#0088ff"
		];
		function SketchControls({ t, navigation, picturesOpen, setPicturesOpen, disabled, tool, brush, chooseBrush, chooseTool, shapesOpen, setShapesOpen, fillShape, setFillShape, selected, editObject, selection, setTextEdit, stability, setStability, eraser, setEraser, color, pickColor }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSketchControls",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "codexSketchPicturesToggle",
						"aria-expanded": picturesOpen,
						onClick: () => setPicturesOpen((value) => !value),
						children: t("sketchPictures")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchViewControls, {
						navigation,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchToolPicker, {
						t,
						disabled,
						tool,
						brush,
						chooseBrush,
						chooseTool,
						shapesOpen,
						setShapesOpen
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexLayerBrush",
						children: [
							["rectangle", "circle"].includes(tool) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								disabled,
								checked: fillShape,
								onChange: (event) => setFillShape(event.target.checked)
							}), t("sketchFill")] }) : null,
							selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSketchObjectActions",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										disabled,
										onClick: () => editObject({}, "duplicate"),
										children: t("sketchObjectDuplicate")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										disabled,
										onClick: () => editObject({}, "delete"),
										children: t("sketchObjectDelete")
									}),
									selected.shape === "text" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										disabled,
										onClick: () => setTextEdit({
											selection,
											value: selected.text
										}),
										children: t("sketchText")
									}) : null
								]
							}) : null,
							tool === "pen" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "codexSketchStability",
								children: [t("sketchStability"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									"aria-label": t("sketchStability"),
									value: stability,
									disabled,
									onChange: (event) => setStability(Number(event.target.value)),
									children: [
										0,
										25,
										50,
										75
									].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value,
										children: t(`sketchStability${value}`)
									}, value))
								})]
							}) : null,
							tool === "eraser" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchSegment",
								role: "group",
								"aria-label": t("sketchEraserMode"),
								children: ["pixel", "stroke"].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": eraser === value,
									disabled,
									onClick: () => setEraser(value),
									children: t(`sketchErase_${value}`)
								}, value))
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSketchPalette",
						role: "group",
						"aria-label": t("sketchColor"),
						children: [PALETTE.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "codexSketchSwatch",
							style: { "--swatch": value },
							"aria-label": `${t("sketchColor")} ${value}`,
							"aria-pressed": (selected?.color ?? color) === value,
							disabled,
							onClick: () => pickColor(value)
						}, value)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "codexSketchCustom",
							title: t("sketchColor"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { background: color } }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "color",
								"aria-label": t("sketchColor"),
								value: color,
								disabled,
								onChange: (event) => pickColor(event.target.value)
							})]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/sketch-objects.js
		const objectId = (stroke, index) => stroke.id ?? `legacy-${index}`;
		const identifyObjects = (doc) => ({
			...doc,
			layers: doc.layers.map((layer) => ({
				...layer,
				strokes: layer.strokes.map((s, i) => s.id ? s : {
					...s,
					id: objectId(s, i)
				})
			}))
		});
		function objectBounds(stroke) {
			const xs = stroke.points.map((p) => p.x), ys = stroke.points.map((p) => p.y);
			return {
				x: Math.min(...xs),
				y: Math.min(...ys),
				width: Math.max(...xs) - Math.min(...xs),
				height: Math.max(...ys) - Math.min(...ys)
			};
		}
		function transformObject(stroke, { dx = 0, dy = 0, scaleX = 1, scaleY = 1 }) {
			if (![
				dx,
				dy,
				scaleX,
				scaleY
			].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) throw Error("Invalid object transform");
			const box = objectBounds(stroke);
			const points = stroke.points.map((p) => ({
				x: box.x + (p.x - box.x) * scaleX + dx,
				y: box.y + (p.y - box.y) * scaleY + dy
			}));
			if (points.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw Error("Object would leave the canvas");
			const clip = stroke.clip && {
				...stroke.clip,
				points: stroke.clip.points.map((p) => ({
					x: box.x + (p.x - box.x) * scaleX + dx,
					y: box.y + (p.y - box.y) * scaleY + dy
				}))
			};
			if (clip && clip.points.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw Error("Object clip would leave the canvas");
			return {
				...stroke,
				points,
				...clip ? { clip } : {}
			};
		}
		function sketchObjectSummary(doc) {
			return doc.layers.flatMap((layer) => layer.strokes.map((stroke, i) => ({
				layer: layer.id,
				id: objectId(stroke, i),
				shape: stroke.shape,
				color: stroke.color,
				bounds: objectBounds(stroke),
				...stroke.text ? { text: stroke.text } : {}
			})));
		}
		//#endregion
		//#region src/sketch-input.js
		function snapLine(start, end) {
			const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / (Math.PI / 4)) * Math.PI / 4;
			const length = Math.hypot(end.x - start.x, end.y - start.y);
			return {
				x: start.x + Math.cos(angle) * length,
				y: start.y + Math.sin(angle) * length
			};
		}
		function smoothStrokePoints(points, strength = 0) {
			if (!strength || points.length < 3) return points;
			const radius = Math.max(1, Math.round(strength / 25)), amount = Math.min(1, strength / 75);
			return points.map((point, i) => {
				if (i === 0 || i === points.length - 1) return point;
				let x = 0, y = 0, weight = 0;
				for (let j = Math.max(0, i - radius); j <= Math.min(points.length - 1, i + radius); j++) {
					const w = radius + 1 - Math.abs(j - i);
					x += points[j].x * w;
					y += points[j].y * w;
					weight += w;
				}
				return {
					...point,
					x: point.x + (x / weight - point.x) * amount,
					y: point.y + (y / weight - point.y) * amount
				};
			});
		}
		//#endregion
		//#region src/sketch-gesture.js
		function updateSketchGesture(doc, gesture, samples, rect, width, shiftKey = false) {
			if (!samples.length) return doc;
			if (gesture.object) {
				const point = sketchPoint(samples.at(-1).clientX, samples.at(-1).clientY, rect);
				if (!point) return doc;
				const box = objectBounds(gesture.object);
				const stroke = gesture.handle === "end" ? {
					...gesture.object,
					points: [gesture.object.points[0], point]
				} : gesture.handle === "size" ? transformObject(gesture.object, {
					scaleX: Math.max(.001, point.x - box.x) / Math.max(.001, box.width),
					scaleY: Math.max(.001, point.y - box.y) / Math.max(.001, box.height)
				}) : transformObject(gesture.object, {
					dx: Math.max(-box.x, Math.min(1 - box.x - box.width, point.x - gesture.start.x)),
					dy: Math.max(-box.y, Math.min(1 - box.y - box.height, point.y - gesture.start.y))
				});
				doc = {
					...doc,
					layers: doc.layers.map((l) => l.id === gesture.layer ? {
						...l,
						strokes: l.strokes.map((s) => s.id === gesture.object.id ? stroke : s)
					} : l)
				};
				return doc;
			}
			for (const sample of samples) {
				let point = sketchPoint(sample.clientX, sample.clientY, rect);
				if (!point) continue;
				const layer = doc.layers.find((layer) => layer.id === gesture.layer);
				if (!layer) return doc;
				if (gesture.eraseStroke) {
					const previous = gesture.last ?? point;
					const steps = Math.min(256, Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) * SKETCH_SIZE / Math.max(2, width / 2))));
					layer.strokes = layer.strokes.filter((stroke) => {
						for (let i = 1; i <= steps; i++) if (strokeHit(stroke, {
							x: previous.x + (point.x - previous.x) * i / steps,
							y: previous.y + (point.y - previous.y) * i / steps
						}, width / 2, doc.width, doc.height)) return false;
						return true;
					});
				} else {
					const stroke = layer.strokes.at(-1);
					if (!stroke) return doc;
					if ([
						"line",
						"arrow",
						"rectangle",
						"circle"
					].includes(stroke.shape)) {
						if (stroke.shape === "line" && shiftKey) {
							const w = doc.width ?? 1024, h = doc.height ?? 1024, a = stroke.points[0];
							const snapped = snapLine({
								x: a.x * w,
								y: a.y * h
							}, {
								x: point.x * w,
								y: point.y * h
							});
							point = {
								x: snapped.x / w,
								y: snapped.y / h
							};
						}
						stroke.points = [stroke.points[0], point];
					} else {
						const last = stroke.points.at(-1);
						if (Math.hypot(last.x - point.x, last.y - point.y) < 1e-4) continue;
						if (stroke.points.length >= 2e3) stroke.points = stroke.points.filter((_, i) => i % 2 === 0);
						stroke.points.push(point);
					}
				}
				gesture.last = point;
			}
			return doc;
		}
		//#endregion
		//#region src/sketch-drafts.js
		const DATABASE = "dsh-codex-sketches-v1";
		const MAX_STORAGE = 32 * 1024 * 1024;
		const metadata = (kind, row) => ({
			key: `${kind}:${row.id}`,
			kind,
			id: row.id,
			name: row.name,
			updated: row.updated,
			size: JSON.stringify(row).length
		});
		async function sketchDrafts(action, value, recoverySession) {
			const db = await new Promise((resolve, reject) => {
				let blocked = false;
				const request = indexedDB.open(DATABASE, 2);
				request.onblocked = () => {
					blocked = true;
					reject(Object.assign(Error("Close other sketch windows and retry"), { code: "SKETCH_STORAGE_BLOCKED" }));
				};
				request.onupgradeneeded = () => {
					if (blocked) {
						request.transaction.abort();
						return;
					}
					const db = request.result, tx = request.transaction;
					if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
					const meta = db.createObjectStore("metadata", { keyPath: "key" });
					db.createObjectStore("recovery", { keyPath: "id" });
					const cursor = tx.objectStore("drafts").openCursor();
					cursor.onsuccess = () => {
						const row = cursor.result;
						if (row) {
							meta.put(metadata("drafts", row.value));
							row.continue();
						}
					};
				};
				request.onsuccess = () => {
					if (blocked) {
						request.result.close();
						return;
					}
					request.result.onversionchange = () => request.result.close();
					resolve(request.result);
				};
				request.onerror = () => reject(request.error);
			});
			try {
				return await new Promise((resolve, reject) => {
					const write = [
						"save",
						"delete",
						"checkpoint",
						"clearRecovery"
					].includes(action);
					const tx = db.transaction([
						"drafts",
						"metadata",
						"recovery"
					], write ? "readwrite" : "readonly");
					const meta = tx.objectStore("metadata"), kind = [
						"checkpoint",
						"recover",
						"clearRecovery"
					].includes(action) ? "recovery" : "drafts", store = tx.objectStore(kind);
					let result, failure;
					tx.oncomplete = () => resolve(result);
					tx.onerror = () => reject(tx.error);
					tx.onabort = () => reject(failure ?? tx.error ?? Error("Draft transaction aborted"));
					if (action === "get" || action === "recover") {
						const req = store.get(value);
						req.onsuccess = () => {
							result = req.result;
						};
						return;
					}
					if (action === "delete" || action === "clearRecovery") {
						store.delete(value);
						meta.delete(`${kind}:${value}`);
						return;
					}
					if (![
						"list",
						"save",
						"checkpoint"
					].includes(action)) {
						tx.abort();
						return;
					}
					const request = meta.getAll();
					request.onsuccess = () => {
						const rows = request.result;
						if (action === "list") {
							result = rows.filter((row) => row.kind === "drafts").sort((a, b) => b.updated - a.updated);
							return;
						}
						const next = metadata(kind, value), others = rows.filter((row) => row.key !== next.key && !(action === "save" && recoverySession && row.key === `recovery:${recoverySession}`));
						const code = others.filter((row) => row.kind === kind).length >= 20 ? "SKETCH_DRAFT_LIMIT" : others.reduce((n, row) => n + row.size, 0) + next.size > MAX_STORAGE ? "SKETCH_STORAGE_LIMIT" : null;
						if (code) {
							failure = Object.assign(Error("Draft storage limit reached"), { code });
							tx.abort();
							return;
						}
						store.put(value);
						meta.put(next);
						if (action === "save" && recoverySession) {
							tx.objectStore("recovery").delete(recoverySession);
							meta.delete(`recovery:${recoverySession}`);
						}
						result = value;
					};
				});
			} finally {
				db.close();
			}
		}
		async function decodeSketchImages(doc, images) {
			for (const layer of doc.layers) {
				const src = layer.image?.src;
				if (!src || images.has(src)) continue;
				if (!src.startsWith("data:image/png;base64,") || src.length > 8 * 1024 * 1024) throw Error("Invalid image");
				const image = new Image();
				image.src = src;
				await image.decode();
				images.set(src, image);
			}
		}
		async function importSketchImage(file) {
			if (![
				"image/png",
				"image/jpeg",
				"image/webp"
			].includes(file.type) || file.size > 20 * 1024 * 1024) throw Error("Image must be PNG, JPEG or WebP under 20 MB");
			const bitmap = await createImageBitmap(file);
			try {
				if (bitmap.width * bitmap.height > 32 * 1024 * 1024) throw Error("Image too large");
				const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
				const canvas = document.createElement("canvas");
				canvas.width = Math.max(1, Math.round(bitmap.width * scale));
				canvas.height = Math.max(1, Math.round(bitmap.height * scale));
				canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
				return {
					src: canvas.toDataURL("image/png"),
					width: canvas.width,
					height: canvas.height
				};
			} finally {
				bitmap.close();
			}
		}
		//#endregion
		//#region src/sketch-presets.js
		const SKETCH_PRESETS = [
			"triangle",
			"diamond",
			"star"
		];
		function expandSketchPreset(command) {
			if (!SKETCH_PRESETS.includes(command.shape)) return command;
			const points = command.points;
			if (!Array.isArray(points) || points.length !== 2 || points.some((p) => !p || ![p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) throw Error("Shape preset requires two normalized bounding-box corners");
			const [a, b] = points, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
			const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
			if (!w || !h) throw Error("Shape preset requires a non-empty box");
			const vertices = command.shape === "triangle" ? [
				[.5, 0],
				[1, 1],
				[0, 1]
			] : command.shape === "diamond" ? [
				[.5, 0],
				[1, .5],
				[.5, 1],
				[0, .5]
			] : Array.from({ length: 10 }, (_, i) => {
				const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? .22 : .5;
				return [.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius];
			});
			return {
				...command,
				shape: "polygon",
				points: vertices.map(([u, v]) => ({
					x: x + u * w,
					y: y + v * h
				}))
			};
		}
		//#endregion
		//#region src/sketch-svg.js
		const MAX_SVG_CHARACTERS = 2e5;
		const MAX_BEZIER_SEGMENTS = 64;
		const FLATTEN_STEPS = 10;
		const NAMED_COLORS = {
			black: "#000000",
			white: "#ffffff",
			red: "#ff0000",
			green: "#008000",
			blue: "#0000ff",
			yellow: "#ffff00",
			orange: "#ffa500",
			purple: "#800080",
			pink: "#ffc0cb",
			brown: "#a52a2a",
			gray: "#808080",
			grey: "#808080",
			silver: "#c0c0c0",
			gold: "#ffd700",
			navy: "#000080",
			teal: "#008080",
			maroon: "#800000",
			olive: "#808000",
			lime: "#00ff00",
			aqua: "#00ffff",
			cyan: "#00ffff",
			magenta: "#ff00ff",
			fuchsia: "#ff00ff",
			ivory: "#fffff0",
			beige: "#f5f5dc",
			tan: "#d2b48c",
			khaki: "#f0e68c",
			coral: "#ff7f50",
			salmon: "#fa8072",
			crimson: "#dc143c",
			indigo: "#4b0082",
			violet: "#ee82ee",
			turquoise: "#40e0d0",
			skyblue: "#87ceeb",
			darkgray: "#a9a9a9",
			darkgrey: "#a9a9a9",
			lightgray: "#d3d3d3",
			lightgrey: "#d3d3d3",
			darkred: "#8b0000",
			darkgreen: "#006400",
			darkblue: "#00008b",
			transparent: "none"
		};
		const UNSUPPORTED = /* @__PURE__ */ new Set([
			"text",
			"tspan",
			"image",
			"foreignObject",
			"mask",
			"pattern",
			"style",
			"script",
			"switch",
			"marker",
			"symbol"
		]);
		const IGNORED = /* @__PURE__ */ new Set([
			"title",
			"desc",
			"metadata",
			"defs",
			"clipPath",
			"linearGradient",
			"radialGradient",
			"stop",
			"filter",
			"feGaussianBlur",
			"feDropShadow",
			"feOffset",
			"feColorMatrix",
			"feFlood",
			"feComposite",
			"feMerge",
			"feMergeNode",
			"feBlend",
			"feMorphology",
			"feTurbulence",
			"feComponentTransfer",
			"namedview",
			"sodipodi:namedview"
		]);
		const decode = (value) => value.split("&quot;").join("\"").split("&apos;").join("'").split("&lt;").join("<").split("&gt;").join(">").split("&amp;").join("&");
		function parseXml(text) {
			const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
			const attribute = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
			const root = {
				name: "#root",
				attrs: {},
				children: []
			};
			const stack = [root];
			for (let match = tag.exec(text); match; match = tag.exec(text)) {
				if (match[2] === void 0) continue;
				if (match[1] === "/") {
					if (stack.length > 1 && stack.at(-1).name === match[2]) stack.pop();
					else throw Error(`SVG is malformed: unexpected </${match[2]}>`);
					continue;
				}
				const attrs = {};
				for (let item = attribute.exec(match[3]); item; item = attribute.exec(match[3])) attrs[item[1]] = decode(item[2] ?? item[3]);
				const node = {
					name: match[2],
					attrs,
					children: []
				};
				stack.at(-1).children.push(node);
				if (match[4] !== "/") stack.push(node);
			}
			if (stack.length !== 1) throw Error(`SVG is malformed: <${stack.at(-1).name}> is not closed`);
			return root;
		}
		const IDENTITY = [
			1,
			0,
			0,
			1,
			0,
			0
		];
		const multiply = (m, n) => [
			m[0] * n[0] + m[2] * n[1],
			m[1] * n[0] + m[3] * n[1],
			m[0] * n[2] + m[2] * n[3],
			m[1] * n[2] + m[3] * n[3],
			m[0] * n[4] + m[2] * n[5] + m[4],
			m[1] * n[4] + m[3] * n[5] + m[5]
		];
		const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
		const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
		const numbers = (text) => (String(text ?? "").match(NUMBER) ?? []).map(Number);
		function parseTransform(text) {
			let matrix = IDENTITY;
			const source = String(text ?? "");
			const item = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
			if (source.replace(item, "").replace(/[\s,]/g, "")) throw Error(`Unsupported SVG transform: ${source}`);
			for (let match = item.exec(source); match; match = item.exec(source)) {
				const v = numbers(match[2]);
				let next;
				if (match[1] === "matrix" && v.length === 6) next = v;
				else if (match[1] === "translate" && v.length >= 1) next = [
					1,
					0,
					0,
					1,
					v[0],
					v[1] ?? 0
				];
				else if (match[1] === "scale" && v.length >= 1) next = [
					v[0],
					0,
					0,
					v[1] ?? v[0],
					0,
					0
				];
				else if (match[1] === "rotate" && v.length >= 1) {
					const a = v[0] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
					const turn = [
						c,
						s,
						-s,
						c,
						0,
						0
					];
					next = v.length >= 3 ? multiply(multiply([
						1,
						0,
						0,
						1,
						v[1],
						v[2]
					], turn), [
						1,
						0,
						0,
						1,
						-v[1],
						-v[2]
					]) : turn;
				} else if (match[1] === "skewX" && v.length === 1) next = [
					1,
					0,
					Math.tan(v[0] * Math.PI / 180),
					1,
					0,
					0
				];
				else if (match[1] === "skewY" && v.length === 1) next = [
					1,
					Math.tan(v[0] * Math.PI / 180),
					0,
					1,
					0,
					0
				];
				else throw Error(`Unsupported SVG transform: ${match[0]}`);
				matrix = multiply(matrix, next);
			}
			return matrix;
		}
		function parseColor(value) {
			const text = String(value ?? "").trim().toLowerCase();
			if (!text || text === "none") return "none";
			if (text === "currentcolor") return "#000000";
			if (Object.hasOwn(NAMED_COLORS, text)) return NAMED_COLORS[text];
			const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
			if (hex) return hex[1].length === 3 ? `#${[...hex[1]].map((ch) => ch + ch).join("")}` : text;
			const rgb = /^rgba?\(([^)]*)\)$/.exec(text);
			if (rgb) {
				const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
				const channel = (part) => Math.max(0, Math.min(255, Math.round(part.endsWith("%") ? parseFloat(part) * 2.55 : parseFloat(part))));
				if (parts.length >= 3) return `#${parts.slice(0, 3).map((part) => channel(part).toString(16).padStart(2, "0")).join("")}`;
			}
			throw Error(`Unsupported SVG color: ${value}. Use #rrggbb, #rgb, rgb(), a basic color name, none, or a gradient id.`);
		}
		function styleOf(node, parent) {
			const own = { ...node.attrs };
			if (own.style) for (const rule of own.style.split(";")) {
				const at = rule.indexOf(":");
				if (at > 0) own[rule.slice(0, at).trim()] = rule.slice(at + 1).trim();
			}
			const pick = (name, fallback) => own[name] === void 0 || own[name] === "inherit" ? fallback : own[name];
			const number = (name, fallback) => {
				const value = pick(name, void 0);
				return value === void 0 ? fallback : Number.parseFloat(value);
			};
			return {
				fill: pick("fill", parent.fill),
				stroke: pick("stroke", parent.stroke),
				strokeWidth: number("stroke-width", parent.strokeWidth),
				fillOpacity: number("fill-opacity", parent.fillOpacity),
				strokeOpacity: number("stroke-opacity", parent.strokeOpacity),
				opacity: parent.opacity * number("opacity", 1),
				display: own.display === "none" || own.visibility === "hidden" ? "none" : "inline",
				blur: parent.blur ?? 0,
				blend: own["mix-blend-mode"] === void 0 ? parent.blend : own["mix-blend-mode"] === "normal" ? void 0 : own["mix-blend-mode"],
				clip: parent.clip
			};
		}
		function arcToCubics(x1, y1, rx, ry, rotation, large, sweep, x2, y2) {
			if (x1 === x2 && y1 === y2) return [];
			rx = Math.abs(rx);
			ry = Math.abs(ry);
			if (!rx || !ry) return [[
				x1,
				y1,
				x2,
				y2,
				x2,
				y2
			]];
			const phi = rotation * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
			const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
			const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
			const lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
			if (lambda > 1) {
				rx *= Math.sqrt(lambda);
				ry *= Math.sqrt(lambda);
			}
			const sign = large === sweep ? -1 : 1;
			const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
			const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
			const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
			const cxp = factor * rx * y1p / ry, cyp = -factor * ry * x1p / rx;
			const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
			const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
			const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
			let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
			if (!sweep && delta > 0) delta -= 2 * Math.PI;
			if (sweep && delta < 0) delta += 2 * Math.PI;
			const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
			const step = delta / count, k = 4 / 3 * Math.tan(step / 4);
			const out = [];
			for (let index = 0; index < count; index++) {
				const a1 = theta + index * step, a2 = a1 + step;
				const point = (a, scale) => {
					const px = rx * Math.cos(a), py = ry * Math.sin(a);
					const tx = -rx * Math.sin(a) * scale, ty = ry * Math.cos(a) * scale;
					return [
						cos * px - sin * py + cx,
						sin * px + cos * py + cy,
						cos * tx - sin * ty,
						sin * tx + cos * ty
					];
				};
				const p1 = point(a1, k), p2 = point(a2, k);
				out.push([
					p1[0] + p1[2],
					p1[1] + p1[3],
					p2[0] - p2[2],
					p2[1] - p2[3],
					p2[0],
					p2[1]
				]);
			}
			return out;
		}
		function parsePathData(data) {
			const source = String(data ?? "");
			const subpaths = [];
			let index = 0, command = "", current, x = 0, y = 0, startX = 0, startY = 0, lastControl, lastCommand = "";
			const skip = () => {
				while (index < source.length && /[\s,]/.test(source[index])) index++;
			};
			const readNumber = () => {
				skip();
				NUMBER.lastIndex = index;
				const match = NUMBER.exec(source);
				if (!match || match.index !== index) throw Error(`Malformed SVG path data near "${source.slice(index, index + 12)}"`);
				index = NUMBER.lastIndex;
				return Number(match[0]);
			};
			const readFlag = () => {
				skip();
				const ch = source[index];
				if (ch !== "0" && ch !== "1") throw Error("Malformed SVG arc flag in path data");
				index++;
				return ch === "1";
			};
			const begin = (px, py) => {
				current = {
					start: [px, py],
					curves: [],
					closed: false,
					straight: true
				};
				subpaths.push(current);
			};
			const line = (px, py) => {
				current.curves.push([
					x,
					y,
					px,
					py,
					px,
					py
				]);
				x = px;
				y = py;
			};
			const cubic = (c1x, c1y, c2x, c2y, px, py) => {
				current.curves.push([
					c1x,
					c1y,
					c2x,
					c2y,
					px,
					py
				]);
				current.straight = false;
				lastControl = [c2x, c2y];
				x = px;
				y = py;
			};
			for (;;) {
				skip();
				if (index >= source.length) break;
				if (/[MmLlHhVvCcSsQqTtAaZz]/.test(source[index])) command = source[index++];
				else if (!command) throw Error("SVG path data must start with a command");
				else if (command === "M") command = "L";
				else if (command === "m") command = "l";
				else if (command === "Z" || command === "z") throw Error("Unexpected number after Z in SVG path data");
				const relative = command === command.toLowerCase();
				const upper = command.toUpperCase();
				const ox = relative ? x : 0, oy = relative ? y : 0;
				if (upper === "M") {
					const px = readNumber() + ox, py = readNumber() + oy;
					x = startX = px;
					y = startY = py;
					begin(px, py);
					lastControl = void 0;
				} else if (upper === "Z") {
					if (current && !current.closed) {
						if (x !== startX || y !== startY) line(startX, startY);
						current.closed = true;
					}
					x = startX;
					y = startY;
					lastControl = void 0;
					current = void 0;
				} else {
					if (!current) {
						begin(x, y);
						startX = x;
						startY = y;
					}
					if (upper === "L") line(readNumber() + ox, readNumber() + oy);
					else if (upper === "H") line(readNumber() + ox, y);
					else if (upper === "V") line(x, readNumber() + oy);
					else if (upper === "C") cubic(readNumber() + ox, readNumber() + oy, readNumber() + ox, readNumber() + oy, readNumber() + ox, readNumber() + oy);
					else if (upper === "S") {
						const [rx, ry] = lastControl && lastCommand && "CScs".includes(lastCommand) ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
						cubic(rx, ry, readNumber() + ox, readNumber() + oy, readNumber() + ox, readNumber() + oy);
					} else if (upper === "Q" || upper === "T") {
						let qx, qy;
						if (upper === "Q") {
							qx = readNumber() + ox;
							qy = readNumber() + oy;
						} else [qx, qy] = lastControl && lastCommand && "QTqt".includes(lastCommand) ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
						const px = readNumber() + ox, py = readNumber() + oy;
						const from = [x, y];
						cubic(from[0] + 2 / 3 * (qx - from[0]), from[1] + 2 / 3 * (qy - from[1]), px + 2 / 3 * (qx - px), py + 2 / 3 * (qy - py), px, py);
						lastControl = [qx, qy];
					} else if (upper === "A") {
						const rx = readNumber(), ry = readNumber(), rotation = readNumber(), large = readFlag(), sweep = readFlag();
						const px = readNumber() + ox, py = readNumber() + oy;
						const pieces = arcToCubics(x, y, rx, ry, rotation, large, sweep, px, py);
						for (const piece of pieces) cubic(...piece);
						if (!pieces.length) {
							x = px;
							y = py;
						}
						lastControl = void 0;
					} else throw Error(`Unsupported SVG path command: ${command}`);
				}
				lastCommand = command;
			}
			return subpaths.filter((subpath) => subpath.curves.length > 0);
		}
		const ellipsePath = (cx, cy, rx, ry) => {
			const k = .5522847498;
			return {
				start: [cx + rx, cy],
				closed: true,
				straight: false,
				curves: [
					[
						cx + rx,
						cy + ry * k,
						cx + rx * k,
						cy + ry,
						cx,
						cy + ry
					],
					[
						cx - rx * k,
						cy + ry,
						cx - rx,
						cy + ry * k,
						cx - rx,
						cy
					],
					[
						cx - rx,
						cy - ry * k,
						cx - rx * k,
						cy - ry,
						cx,
						cy - ry
					],
					[
						cx + rx * k,
						cy - ry,
						cx + rx,
						cy - ry * k,
						cx + rx,
						cy
					]
				]
			};
		};
		const polylinePath = (points, closed) => {
			const path = {
				start: points[0],
				curves: [],
				closed,
				straight: true
			};
			let [x, y] = points[0];
			for (const [px, py] of points.slice(1)) {
				path.curves.push([
					x,
					y,
					px,
					py,
					px,
					py
				]);
				x = px;
				y = py;
			}
			if (closed && (x !== points[0][0] || y !== points[0][1])) path.curves.push([
				x,
				y,
				points[0][0],
				points[0][1],
				points[0][0],
				points[0][1]
			]);
			return path;
		};
		const roundedRectPath = (x, y, w, h, rx, ry) => {
			rx = Math.min(rx, w / 2);
			ry = Math.min(ry, h / 2);
			const k = .5522847498;
			const curves = [];
			let cx = x + rx, cy = y;
			const go = (...piece) => {
				curves.push(piece);
				cx = piece[4];
				cy = piece[5];
			};
			go(cx, cy, x + w - rx, y, x + w - rx, y);
			go(x + w - rx + rx * k, y, x + w, y + ry - ry * k, x + w, y + ry);
			go(x + w, y + ry, x + w, y + h - ry, x + w, y + h - ry);
			go(x + w, y + h - ry + ry * k, x + w - rx + rx * k, y + h, x + w - rx, y + h);
			go(x + w - rx, y + h, x + rx, y + h, x + rx, y + h);
			go(x + rx - rx * k, y + h, x, y + h - ry + ry * k, x, y + h - ry);
			go(x, y + h - ry, x, y + ry, x, y + ry);
			go(x, y + ry - ry * k, x + rx - rx * k, y, x + rx, y);
			return {
				start: [x + rx, y],
				curves,
				closed: true,
				straight: false
			};
		};
		function svgToSketchCommands(text, { width, height, layer, existingIds = [] }) {
			if (typeof text !== "string" || !text.trim()) throw Error("svg must be a non-empty SVG document");
			if (text.length > 2e5) throw Error(`svg is too large: ${text.length} characters, limit ${MAX_SVG_CHARACTERS}. Split it across several svg commands.`);
			const root = parseXml(text).children.find((node) => node.name === "svg");
			if (!root) throw Error("svg must contain an <svg> element");
			const box = numbers(root.attrs.viewBox);
			const viewWidth = box.length === 4 ? box[2] : Number.parseFloat(root.attrs.width);
			const viewHeight = box.length === 4 ? box[3] : Number.parseFloat(root.attrs.height);
			const originX = box.length === 4 ? box[0] : 0, originY = box.length === 4 ? box[1] : 0;
			if (!(viewWidth > 0 && viewHeight > 0)) throw Error("<svg> needs a viewBox=\"0 0 W H\" (or width and height)");
			if (Math.abs(viewWidth / viewHeight - width / height) > .01 * (width / height)) throw Error(`SVG viewBox ${viewWidth}x${viewHeight} does not match the ${width}x${height} sketch ratio. Use viewBox="0 0 ${width} ${height}".`);
			const byId = /* @__PURE__ */ new Map();
			const index = (node) => {
				if (node.attrs.id) byId.set(node.attrs.id, node);
				node.children.forEach(index);
			};
			index(root);
			const warnings = /* @__PURE__ */ new Set();
			const used = new Set(existingIds);
			let counter = 0, clamped = 0;
			const nextId = (suffix) => {
				for (;;) {
					counter++;
					const id = `svg-${counter}${suffix}`;
					if (!used.has(id)) {
						used.add(id);
						return id;
					}
				}
			};
			const scale = width / viewWidth;
			const commands = [];
			const clamp = (value) => {
				if (value < 0 || value > 1) clamped++;
				return Math.max(0, Math.min(1, value));
			};
			const norm = (matrix, px, py) => {
				const [tx, ty] = apply(matrix, px, py);
				return {
					x: clamp((tx - originX) / viewWidth),
					y: clamp((ty - originY) / viewHeight)
				};
			};
			const gradientNode = (reference) => {
				const target = byId.get(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(reference)?.[1] ?? "");
				if (!target || !/Gradient$/.test(target.name)) throw Error(`SVG paint ${reference} does not reference a gradient defined in the same SVG`);
				return target;
			};
			const gradientChain = (target) => {
				const chain = [target];
				for (let node = target; chain.length < 5;) {
					const href = node.attrs.href ?? node.attrs["xlink:href"];
					node = href?.startsWith("#") ? byId.get(href.slice(1)) : void 0;
					if (!node || !/Gradient$/.test(node.name)) break;
					chain.push(node);
				}
				return chain;
			};
			const gradientStops = (target) => {
				const holder = gradientChain(target).find((node) => node.children.some((child) => child.name === "stop"));
				if (!holder) throw Error(`Gradient ${target.attrs.id} has no stops`);
				let last = 0;
				return holder.children.filter((child) => child.name === "stop").map((stop) => {
					const css = (name) => stop.attrs[name] ?? new RegExp(name + "\\s*:\\s*([^;]+)").exec(stop.attrs.style ?? "")?.[1];
					const raw = String(stop.attrs.offset ?? "0").trim();
					const offset = Math.max(last, Math.min(1, raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw) || 0));
					last = offset;
					const opacity = Number.parseFloat(css("stop-opacity") ?? "1");
					return {
						offset,
						color: parseColor(css("stop-color") ?? "#000000"),
						opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1
					};
				}).filter((stop) => stop.color !== "none");
			};
			const averageColor = (reference, warn) => {
				const target = gradientNode(reference);
				const colors = gradientStops(target).map((stop) => stop.color);
				if (!colors.length) throw Error(`Gradient ${target.attrs.id} has no usable stops`);
				const channels = colors.map((color) => [
					1,
					3,
					5
				].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)));
				const mean = [
					0,
					1,
					2
				].map((channel) => Math.round(channels.reduce((sum, item) => sum + item[channel], 0) / channels.length));
				if (warn) warnings.add(`Gradient ${target.attrs.id} was flattened to its average color (a gradient on a stroke line, or on a path that had to be split).`);
				return `#${mean.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
			};
			const determinant = (m) => Math.abs(m[0] * m[3] - m[1] * m[2]);
			const nativeGradient = (reference, matrix, command) => {
				const target = gradientNode(reference);
				const chain = gradientChain(target);
				const attr = (name) => chain.find((node) => node.attrs[name] !== void 0)?.attrs[name];
				const stops = gradientStops(target);
				if (stops.length < 2) return void 0;
				const radial = target.name === "radialGradient";
				const objectBox = (attr("gradientUnits") ?? "objectBoundingBox") === "objectBoundingBox";
				const xs = command.points.map((point) => point.x), ys = command.points.map((point) => point.y);
				const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
				if (!(bw > 1e-4 && bh > 1e-4)) return void 0;
				const gt = parseTransform(attr("gradientTransform"));
				const length = (name, fraction, axis) => {
					const raw = String(attr(name) ?? `${fraction * 100}%`).trim();
					if (!raw.endsWith("%")) return Number.parseFloat(raw) || 0;
					const part = Number.parseFloat(raw) / 100;
					return objectBox ? part : part * (axis === "x" ? viewWidth : axis === "y" ? viewHeight : Math.hypot(viewWidth, viewHeight) / Math.SQRT2);
				};
				const full = objectBox ? gt : multiply(matrix, gt);
				const place = (x, y) => {
					const [px, py] = apply(full, x, y);
					return objectBox ? [px, py] : [((px - originX) / viewWidth - bx) / bw, ((py - originY) / viewHeight - by) / bh];
				};
				const colors = stops.map((stop) => ({
					offset: stop.offset,
					color: stop.color,
					opacity: stop.opacity
				}));
				if (!radial) {
					const [x1, y1] = place(length("x1", 0, "x"), length("y1", 0, "y"));
					const [x2, y2] = place(length("x2", 1, "x"), length("y2", 0, "y"));
					return normalizeGradient({
						type: "linear",
						x1,
						y1,
						x2,
						y2,
						stops: colors
					});
				}
				const cx0 = length("cx", .5, "x"), cy0 = length("cy", .5, "y"), r0 = length("r", .5, "r");
				const [cx, cy] = place(cx0, cy0);
				const [fx, fy] = place(attr("fx") === void 0 ? cx0 : length("fx", .5, "x"), attr("fy") === void 0 ? cy0 : length("fy", .5, "y"));
				const k = Math.sqrt(determinant(full));
				return normalizeGradient({
					type: "radial",
					cx,
					cy,
					r: objectBox ? r0 * k : r0 * k / viewWidth / bw,
					ry: objectBox ? r0 * k : r0 * k / viewHeight / bh,
					fx,
					fy,
					stops: colors
				});
			};
			const paint = (value) => String(value).startsWith("url(") ? averageColor(value, false) : parseColor(value);
			const emit = (subpath, matrix, style, id) => {
				[subpath.start, ...subpath.curves.flatMap((curve) => [
					[curve[0], curve[1]],
					[curve[2], curve[3]],
					[curve[4], curve[5]]
				])];
				const fillGradient = String(style.fill).startsWith("url(");
				const fill = style.fill === "none" ? "none" : paint(style.fill);
				const stroke = style.stroke === "none" ? "none" : String(style.stroke).startsWith("url(") ? averageColor(style.stroke, true) : paint(style.stroke);
				const blur = Math.min(64, Math.round(style.blur * scale * Math.sqrt(determinant(matrix)) * 10) / 10);
				const add = (list) => commands.push(...list.map((item) => ({
					...item,
					...blur >= .5 ? { blur } : {},
					...style.clip ? { clip: style.clip } : {},
					...style.blend ? { blend: style.blend } : {}
				})));
				const common = layer === void 0 ? {} : { layer };
				const strokeWidth = Math.max(1, Math.min(256, (style.strokeWidth || 1) * scale * Math.hypot(matrix[0], matrix[1])));
				const segments = subpath.curves.length;
				const closed = subpath.closed;
				const straightPoints = [subpath.start, ...subpath.curves.map((curve) => [curve[4], curve[5]])];
				const build = (color, opacity, filled, suffix) => {
					if (subpath.straight && straightPoints.length >= 2) {
						const vertices = closed ? straightPoints.slice(0, -1) : straightPoints;
						if (filled || closed) {
							if (vertices.length >= 3) return [{
								op: "stroke",
								...common,
								id: nextId(suffix),
								shape: "polygon",
								color,
								opacity,
								fill: filled,
								width: strokeWidth,
								points: vertices.map(([px, py]) => norm(matrix, px, py))
							}];
						}
						if (vertices.length === 2 && !filled) return [{
							op: "stroke",
							...common,
							id: nextId(suffix),
							shape: "line",
							color,
							opacity,
							fill: false,
							width: strokeWidth,
							points: vertices.map(([px, py]) => norm(matrix, px, py))
						}];
						if (!filled) {
							const pieces = [];
							for (let from = 0; from < vertices.length - 1; from += 1900) pieces.push({
								op: "stroke",
								...common,
								id: nextId(suffix),
								shape: "pen",
								color,
								opacity,
								fill: false,
								width: strokeWidth,
								points: vertices.slice(from, from + 1901).map(([px, py]) => norm(matrix, px, py))
							});
							return pieces;
						}
						return [];
					}
					if (filled && segments > MAX_BEZIER_SEGMENTS) {
						warnings.add(`A filled path with ${segments} curve segments was flattened to a polygon (more than ${MAX_BEZIER_SEGMENTS} segments cannot stay a Bezier).`);
						const flat = [subpath.start];
						let [cx, cy] = subpath.start;
						for (const [a, b, c1, d, e, f] of subpath.curves) {
							for (let step = 1; step <= FLATTEN_STEPS; step++) {
								const t = step / FLATTEN_STEPS, u = 1 - t;
								flat.push([u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c1 + t * t * t * e, u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * f]);
							}
							cx = e;
							cy = f;
						}
						if (flat.length > 2e3) throw Error("A filled path is too complex to import; simplify it or split it into several paths.");
						return [{
							op: "stroke",
							...common,
							id: nextId(suffix),
							shape: "polygon",
							color,
							opacity,
							fill: true,
							width: strokeWidth,
							points: flat.map(([px, py]) => norm(matrix, px, py))
						}];
					}
					const pieces = [];
					for (let from = 0; from < segments; from += MAX_BEZIER_SEGMENTS) {
						const chunk = subpath.curves.slice(from, from + MAX_BEZIER_SEGMENTS);
						const chunkPoints = [from === 0 ? subpath.start : [subpath.curves[from - 1][4], subpath.curves[from - 1][5]], ...chunk.flatMap((curve) => [
							[curve[0], curve[1]],
							[curve[2], curve[3]],
							[curve[4], curve[5]]
						])];
						pieces.push({
							op: "stroke",
							...common,
							id: nextId(suffix),
							shape: "bezier",
							color,
							opacity,
							fill: filled,
							width: strokeWidth,
							points: chunkPoints.map(([px, py]) => norm(matrix, px, py))
						});
					}
					return pieces;
				};
				if (fill !== "none" && style.fillOpacity * style.opacity > 0) {
					let pieces = build(fill, style.fillOpacity * style.opacity, true, "");
					if (fillGradient) {
						const gradient = pieces.length === 1 && [
							"rectangle",
							"circle",
							"polygon",
							"bezier"
						].includes(pieces[0].shape) ? nativeGradient(style.fill, matrix, pieces[0]) : void 0;
						if (gradient) pieces = [{
							...pieces[0],
							gradient
						}];
						else warnings.add("A gradient fill was flattened to its average color (the path was split into several pieces, or its box is empty).");
					}
					add(pieces);
				}
				if (stroke !== "none" && style.strokeOpacity * style.opacity > 0 && style.strokeWidth > 0) add(build(stroke, style.strokeOpacity * style.opacity, false, "-line"));
			};
			const filterBlur = (reference, group) => {
				const target = byId.get(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(reference)?.[1] ?? "");
				if (!target || target.name !== "filter") {
					warnings.add(`Filter ${reference} was ignored (it must be a <filter> defined in the same SVG).`);
					return 0;
				}
				const blurs = target.children.filter((child) => child.name === "feGaussianBlur").map((child) => Math.max(...numbers(child.attrs.stdDeviation ?? "0"), 0));
				if (target.children.some((child) => child.name !== "feGaussianBlur")) warnings.add(`Filter ${target.attrs.id ?? ""}: only feGaussianBlur is applied; other effects were ignored.`);
				if (blurs.length && group) warnings.add("A blur filter on a group softens each shape inside it separately.");
				return Math.max(0, ...blurs);
			};
			const clipSubpaths = (child) => {
				const m = (name) => Number.parseFloat(child.attrs[name] ?? 0);
				switch (child.name) {
					case "path": return parsePathData(child.attrs.d);
					case "rect": {
						const w = m("width"), h = m("height");
						if (!(w > 0 && h > 0)) return [];
						const rx = child.attrs.rx !== void 0 ? m("rx") : child.attrs.ry !== void 0 ? m("ry") : 0, ry = child.attrs.ry !== void 0 ? m("ry") : rx;
						return [rx > 0 || ry > 0 ? roundedRectPath(m("x"), m("y"), w, h, rx, ry) : polylinePath([
							[m("x"), m("y")],
							[m("x") + w, m("y")],
							[m("x") + w, m("y") + h],
							[m("x"), m("y") + h]
						], true)];
					}
					case "circle": return m("r") > 0 ? [ellipsePath(m("cx"), m("cy"), m("r"), m("r"))] : [];
					case "ellipse": return m("rx") > 0 && m("ry") > 0 ? [ellipsePath(m("cx"), m("cy"), m("rx"), m("ry"))] : [];
					case "polygon": {
						const values = numbers(child.attrs.points), pts = [];
						for (let at = 0; at + 1 < values.length; at += 2) pts.push([values[at], values[at + 1]]);
						return pts.length >= 3 ? [polylinePath(pts, true)] : [];
					}
					default: return [];
				}
			};
			const clipFor = (reference, matrix) => {
				const target = byId.get(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(reference)?.[1] ?? "");
				if (!target || target.name !== "clipPath") {
					warnings.add(`clip-path ${reference} was ignored (it must be a <clipPath> defined in the same SVG).`);
					return;
				}
				const shapes = target.children.filter((child) => [
					"path",
					"rect",
					"circle",
					"ellipse",
					"polygon"
				].includes(child.name));
				if (!shapes.length) {
					warnings.add(`clipPath ${target.attrs.id ?? ""} has no path, rect, circle, ellipse or polygon and was ignored.`);
					return;
				}
				if (shapes.length > 1) warnings.add(`clipPath ${target.attrs.id ?? ""} has several shapes; only the first is used (merge them into one path).`);
				const placed = multiply(multiply(matrix, parseTransform(target.attrs.transform)), parseTransform(shapes[0].attrs.transform));
				const subpath = clipSubpaths(shapes[0])[0];
				if (!subpath) return void 0;
				const toPoint = ([px, py]) => norm(placed, px, py);
				const straightPoints = [subpath.start, ...subpath.curves.map((curve) => [curve[4], curve[5]])];
				if (subpath.straight && straightPoints.length >= 3) {
					const vertices = subpath.closed ? straightPoints.slice(0, -1) : straightPoints;
					return vertices.length >= 3 ? {
						shape: "polygon",
						points: vertices.slice(0, 2e3).map(toPoint)
					} : void 0;
				}
				if (subpath.curves.length <= MAX_BEZIER_SEGMENTS) return {
					shape: "bezier",
					points: [subpath.start, ...subpath.curves.flatMap((curve) => [
						[curve[0], curve[1]],
						[curve[2], curve[3]],
						[curve[4], curve[5]]
					])].map(toPoint)
				};
				const flat = [subpath.start];
				let [cx, cy] = subpath.start;
				for (const [a, b, c1, d, e, g] of subpath.curves) {
					for (let step = 1; step <= FLATTEN_STEPS; step++) {
						const t = step / FLATTEN_STEPS, u = 1 - t;
						flat.push([u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c1 + t * t * t * e, u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * g]);
					}
					cx = e;
					cy = g;
				}
				return flat.length >= 3 && flat.length <= 2e3 ? {
					shape: "polygon",
					points: flat.map(toPoint)
				} : void 0;
			};
			const walk = (node, matrix, parentStyle, depth) => {
				if (depth > 24) throw Error("SVG is nested too deeply");
				if (UNSUPPORTED.has(node.name)) throw Error(`Unsupported SVG element <${node.name}>. Draw with path, rect, circle, ellipse, line, polyline, polygon, g and use; add text with a native text command.`);
				if (IGNORED.has(node.name)) return;
				if (node.attrs.mask && node.attrs.mask !== "none") throw Error("Unsupported SVG attribute mask. Bake it into the shapes instead.");
				const style = styleOf(node, parentStyle);
				if (style.display === "none") return;
				const filterValue = (node.attrs.filter ?? /(?:^|;)\s*filter\s*:\s*([^;]+)/.exec(node.attrs.style ?? "")?.[1] ?? "none").trim();
				if (filterValue !== "none") style.blur = Math.max(style.blur, filterBlur(filterValue, [
					"g",
					"svg",
					"a",
					"use"
				].includes(node.name)));
				const local = multiply(matrix, parseTransform(node.attrs.transform));
				const clipValue = (node.attrs["clip-path"] ?? /(?:^|;)\s*clip-path\s*:\s*([^;]+)/.exec(node.attrs.style ?? "")?.[1] ?? "none").trim();
				if (clipValue !== "none") style.clip = clipFor(clipValue, local);
				const n = (name) => Number.parseFloat(node.attrs[name] ?? 0);
				const finish = (subpaths) => subpaths.forEach((subpath) => emit(subpath, local, style, node.attrs.id));
				switch (node.name) {
					case "svg":
					case "g":
					case "a":
						for (const child of node.children) walk(child, local, style, depth + 1);
						return;
					case "use": {
						const href = node.attrs.href ?? node.attrs["xlink:href"];
						const target = href?.startsWith("#") ? byId.get(href.slice(1)) : void 0;
						if (!target) throw Error(`<use> must reference an element in the same SVG (${href ?? "missing href"})`);
						walk(target, multiply(local, [
							1,
							0,
							0,
							1,
							n("x"),
							n("y")
						]), { ...style }, depth + 1);
						return;
					}
					case "path":
						finish(parsePathData(node.attrs.d));
						return;
					case "rect": {
						const w = n("width"), h = n("height");
						if (!(w > 0 && h > 0)) return;
						const rx = node.attrs.rx !== void 0 ? n("rx") : node.attrs.ry !== void 0 ? n("ry") : 0;
						const ry = node.attrs.ry !== void 0 ? n("ry") : rx;
						finish([rx > 0 || ry > 0 ? roundedRectPath(n("x"), n("y"), w, h, rx, ry) : polylinePath([
							[n("x"), n("y")],
							[n("x") + w, n("y")],
							[n("x") + w, n("y") + h],
							[n("x"), n("y") + h]
						], true)]);
						return;
					}
					case "circle":
						if (n("r") > 0) finish([ellipsePath(n("cx"), n("cy"), n("r"), n("r"))]);
						return;
					case "ellipse":
						if (n("rx") > 0 && n("ry") > 0) finish([ellipsePath(n("cx"), n("cy"), n("rx"), n("ry"))]);
						return;
					case "line":
						finish([polylinePath([[n("x1"), n("y1")], [n("x2"), n("y2")]], false)]);
						return;
					case "polyline":
					case "polygon": {
						const values = numbers(node.attrs.points);
						if (values.length < 4 || values.length % 2) throw Error(`<${node.name}> needs an even number of coordinates, at least two points`);
						const pts = [];
						for (let at = 0; at < values.length; at += 2) pts.push([values[at], values[at + 1]]);
						finish([polylinePath(pts, node.name === "polygon")]);
						return;
					}
					default: throw Error(`Unsupported SVG element <${node.name}>`);
				}
			};
			walk(root, IDENTITY, {
				fill: "#000000",
				stroke: "none",
				strokeWidth: 1,
				fillOpacity: 1,
				strokeOpacity: 1,
				opacity: 1,
				blur: 0
			}, 0);
			if (!commands.length) throw Error("The SVG contained no drawable shapes");
			return {
				commands,
				warnings: [...warnings],
				clamped
			};
		}
		function expandSvgCommands(commands, doc, report) {
			if (!commands.some((command) => command?.op === "svg")) return commands;
			const width = doc.width ?? 1024, height = doc.height ?? 1024;
			const ids = new Set(doc.layers.flatMap((item) => item.strokes.map((stroke) => stroke.id).filter(Boolean)));
			const out = [];
			let clamped = 0;
			for (const command of commands) {
				if (command?.op !== "svg") {
					out.push(command);
					if (command?.id) ids.add(command.id);
					continue;
				}
				const result = svgToSketchCommands(command.svg, {
					width,
					height,
					layer: command.layer,
					existingIds: ids
				});
				result.commands.forEach((item) => ids.add(item.id));
				out.push(...result.commands);
				clamped += result.clamped;
				if (report) report.warnings = [.../* @__PURE__ */ new Set([...report.warnings ?? [], ...result.warnings])];
			}
			if (report && clamped) report.clampedPoints = (report.clampedPoints ?? 0) + clamped;
			return out;
		}
		//#endregion
		//#region src/sketch-commands.js
		const MAX_SKETCH_POINTS = 2e5;
		const stale = (message) => Object.assign(Error(message), { code: "SKETCH_STALE" });
		const SKETCH_COMMAND_HELP = {
			coordinates: "Assign short meaningful stroke id values for later edits. Text uses two opposite box corners and text content; width is font size in pixels, automatic fitting within the box. Arrow uses two endpoints. Normalized x/y in [0,1]; width is canvas pixels. Read documentId and revision before editing.",
			shapes: "line: exactly two endpoints; rectangle/circle (ellipse alias accepted): exactly two opposite bounding-box corners (circle draws an ellipse within that box); polygon: three or more vertices, closed automatically; pen: ordered path points. bezier: start point, then groups of control1/control2/end; use 4 points for one cubic curve, max 64 segments. Prefer bezier for smooth designed curves instead of many pen samples. fill:true closes and fills the curve. fill:true fills rectangle/circle/polygon. Layers and strokes paint in list order, later ones on top. All commands needed for drawing are described here; no source-code search is required.",
			guide: "How to draw well here. 1) Plan first: list the parts, the drawing order (back to front) and the rough position and size as fractions of the canvas; keep the plan short. 2) Work big to small and verify after every stage (apply returns progress; look:true or preview shows the result): silhouette and big colour areas, then form and shading, then outlines and small details. 3) Place by measuring, not by eye: with a reference use measure (palette, regions, points, scan) to get exact colours, sizes and edge positions; without one use preview grid and keep proportions (an 8-head figure for realistic bodies, 5–6 heads for anime, a larger head for cute). 4) Depth: every form gets five tones, a highlight, light, half-tone, form shadow and a reflected-light edge; shadows are tinted (blue, purple, teal), never pure black; use 4–8 stop gradients with hue shifts, blur for glow, haze and soft shadows. 5) Build limbs and hair as long tapered shapes (a few overlapping bezier or path shapes), cover joints with rounded shapes, draw the face last on top of the head: eyes (iris, pupil, highlight, lashes), brows, nose and mouth with the right size and spacing, check them with preview box zoomed in. 6) Group related shapes on one layer (hair, face, clothes, background) so they can be adjusted or hidden. 7) Undo a stage that made things worse instead of painting over it. 8) Repeated details (strands, pleats, stars) can be generated by a short script and sent as one svg command. 9) Refine region by region (see below). 10) Stop when the error of every region stops falling or the zoomed previews look right; do not add detail that the picture does not have. When the whole picture is roughly right, do refinement passes region by region instead of stopping: split the picture into its parts (for a figure: head and face, each mass of hair, torso, each arm, each leg, shoes and small accessories). For every part, call preview mode side with box set to that part and grid on (zoomed up to 3x) and look at reference and drawing next to each other, then measure with box on the same part and use scan along an edge to read exact positions; list the three biggest differences (edge position, size, colour, missing detail), fix them with targeted object updates or a replacement shape, and check progress. A part is done when its error stops falling or the zoomed pair looks the same; then go to the next part. Make at least one pass over every part before you finish, and never end with the first full draft.",
			commands: {
				preset: "triangle/diamond/star: {op:\"stroke\",id:\"badge\",shape:\"star\",points:[{x:0.1,y:0.1},{x:0.3,y:0.3}],color:\"#ffcc00\",fill:true}. Two opposite box corners; stored as editable polygon. Inspect objectId for one object without repeating full help.",
				stroke: "{op:\"stroke\",layer:1,shape:\"pen|line|arrow|text|rectangle|circle|polygon|bezier\",color:\"#rrggbb\",width:2,opacity:1,fill:false,points:[{x:0.1,y:0.1},...]}. Optional on any stroke: blend:\"multiply|screen|overlay|soft-light|hard-light|color-dodge|color-burn|darken|lighten|lighter\" (shadows multiply, glows screen or lighter; blends with what is already painted on the same layer; a whole layer can blend with the layers under it: {op:\"layer\",action:\"blend\",id:2,value:\"multiply\"}, value normal to clear) and clip:{shape:\"polygon|bezier|rectangle|circle\",points:[...]} keeps the stroke inside that shape, so shading and highlights stay inside the form they shade (clip.shape none removes it). Optional on filled shapes: gradient:{type:\"linear\",x1:0,y1:0,x2:0,y2:1,stops:[{offset:0,color:\"#ffcc66\"},{offset:1,color:\"#ff6644\",opacity:0.8}]} or {type:\"radial\",cx:0.5,cy:0.5,r:0.5,stops:[...]} (coordinates relative to the shape's own box, so moving or scaling the object keeps it); blur:12 softens any stroke by that many canvas pixels (glow, shadow, haze). Patch gradient:{type:\"none\"} or blur:0 to remove.",
				layer: "Add: {op:\"layer\",action:\"add\",value:\"name\"}; optional id is the NEW unique integer ID, otherwise allocated automatically. after is the existing insertion anchor, defaults to active layer. Other actions: {op:\"layer\",action:\"select|rename|visible|duplicate|up|down|delete|clear\",id:1,value:\"name\"}; id targets an existing layer.",
				curve: "Prefer {op:\"stroke\",shape:\"bezier\",start:{x:0,y:0},segments:[{control1:{x:0.2,y:0},control2:{x:0.8,y:1},end:{x:1,y:1}}],color:\"#123456\"}. Each segment has exactly two controls and an endpoint; no point counting required. Legacy points arrays still accepted. Do not provide both forms.",
				object: "{op:\"object\",layer:1,id:\"title\",action:\"update|duplicate|delete\",patch:{color:\"#0088ff\",text:\"Title\"},transform:{dx:0.05,dy:0,scaleX:1,scaleY:1}}. All patch and transform fields optional. Inspect returns object IDs and bounds. Prefer targeted edits over redrawing layers.",
				resize: "{op:\"resize\",ratio:\"1:1|4:3|3:4|16:9|9:16\"}",
				svg: "{op:\"svg\",svg:\"<svg viewBox=\\\"0 0 1024 768\\\">...</svg>\",layer:1}. Fastest way to draw: send a whole scene as SVG (path with M L H V C S Q T A Z, rect, circle, ellipse, line, polyline, polygon, g, use, transform, fill/stroke/opacity, style=\"...\"); it becomes native editable strokes. The viewBox must match the canvas size (use the width and height from inspect; 4:3 is 1024x768). mix-blend-mode on an element becomes blend, and clip-path=\"url(#id)\" with a clipPath holding one path, rect, circle, ellipse or polygon becomes clip (use the same clipPath for all the shading of a form). Linear and radial gradients on filled shapes are kept as real gradients (fill=\"url(#id)\", objectBoundingBox or userSpaceOnUse, gradientTransform, stop-opacity); a gradient on a stroke line is flattened to its average color. A filter with feGaussianBlur becomes a soft edge on each shape it covers (glows, shadows, haze, depth of field); other filter effects are ignored with a warning. Text, image, mask, pattern and CSS classes are refused. Coordinates outside the canvas are clamped. One svg command may hold up to 200000 characters."
			},
			measure: "Action measure (not a command): {action:\"measure\",runId,documentId,columns:6,rows:8,box:{x:0,y:0,width:1,height:1},points:[{x:0.5,y:0.3}],palette:8,regions:8,scan:{x1:0,y1:0.5,x2:1,y2:0.5}} compares the drawing with the reference picture and returns error (0 = identical, percent of the colour range), the worst cells (box in 0..1, error, reference and drawing colour as #rrggbb, tone = how much lighter (+) or darker (-) the drawing is than the reference, 0..255; cells:true returns every cell instead of the worst ten, a full colour-error map you can work through), for points the reference and drawing colour there, with palette the main colours of the reference (share of the area), with regions where each main colour sits (share, centre, box that holds most of it), and with scan a ruler laid along a line: the colour runs of the reference and of your drawing along it, with their start and end positions, so you can place edges exactly (scan a row across the hair, a column through the body). box limits it to one part. Every apply also returns progress (error now, error before, three worst cells), so you can see whether a stage helped. Fix the worst cell first, read exact colours from the reference instead of guessing.",
			undo: "Action undo: {action:\"undo\",runId,documentId,revision (optional),steps:1} takes back the last batches you applied (one per apply) and returns the new revision. Use it when a stage made things worse instead of painting over it.",
			preview: "Action preview: {action:\"preview\",mode:\"side|diff\",compare:true,grid:true,box:{x:0.3,y:0.1,width:0.4,height:0.3}}. mode side puts the reference and your drawing next to each other; mode diff adds a difference heat map (dark = matches, blue to red = increasingly different in brightness, colour or edges); compare blends both 50/50; grid labels canvas pixels; box zooms into one part (normalised x,y,width,height) so you can check eyes, hands, edges. Apply with look:true returns the side-by-side picture with the result.",
			limits: {
				strokes: MAX_SKETCH_STROKES,
				pointsPerStroke: MAX_STROKE_POINTS,
				pointsTotal: MAX_SKETCH_POINTS,
				commandsPerBatch: 256,
				svgCharacters: MAX_SVG_CHARACTERS
			}
		};
		const finite = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
		function applySketchCommands(source, commands, report) {
			if (!Array.isArray(commands) || !commands.length || commands.length > 256) throw Error("Expected 1–256 commands");
			let doc = identifyObjects(source);
			commands = expandSvgCommands(commands, doc, report);
			for (let command of commands) {
				if (!command || typeof command !== "object") throw Error("Invalid command");
				if (command.op === "stroke") command = expandSketchPreset(command);
				if (command.op === "resize") {
					doc = resizeSketch(doc, command.ratio);
					continue;
				}
				if (command.op === "layer") {
					if (![
						"add",
						"select",
						"rename",
						"visible",
						"duplicate",
						"up",
						"down",
						"delete",
						"clear",
						"blend"
					].includes(command.action)) throw Error("Unknown layer action");
					if (command.action === "add") {
						const id = command.id ?? doc.nextId, after = command.after ?? doc.active;
						if (!Number.isSafeInteger(id) || id < 1 || id === Number.MAX_SAFE_INTEGER || doc.layers.some((l) => l.id === id)) throw Error("New layer id must be a unique positive integer; omit id to allocate automatically");
						const next = changeSketchLayer(doc, "add", after);
						if (next === doc) throw Error(doc.layers.length >= 8 ? "Cannot add layer: the board already has 8 layers, the most it holds. Draw on an existing layer, or delete or merge one first." : "Cannot add layer: after must be the id of an existing layer");
						doc = {
							...next,
							active: id,
							nextId: Math.max(next.nextId, id + 1),
							layers: next.layers.map((l) => l.id === next.active ? {
								...l,
								id,
								name: String(command.value ?? "").trim().slice(0, 40)
							} : l)
						};
						continue;
					}
					const next = changeSketchLayer(doc, command.action, command.id ?? doc.active, command.value);
					if (next === doc) throw Error("Layer action unavailable; inspect the document first");
					doc = next;
					continue;
				}
				if (command.op === "object") {
					const layer = doc.layers.find((l) => l.id === (command.layer ?? doc.active)), index = layer?.strokes.findIndex((s) => s.id === command.id);
					if (!layer?.visible || index < 0 || index === void 0) throw Error("Object missing or hidden; inspect again");
					const strokes = layer.strokes.slice(), original = strokes[index];
					if (command.action === "delete") strokes.splice(index, 1);
					else if (command.action === "duplicate") strokes.splice(index + 1, 0, {
						...original,
						id: crypto.randomUUID(),
						points: original.points.map((p) => ({ ...p }))
					});
					else if (command.action === "update") {
						const patch = command.patch ?? {};
						if (Object.keys(patch).some((k) => ![
							"color",
							"width",
							"opacity",
							"fill",
							"text",
							"points",
							"gradient",
							"blur",
							"blend",
							"clip"
						].includes(k))) throw Error("Unsupported object property");
						const changed = command.transform ? transformObject({
							...original,
							...patch
						}, command.transform) : {
							...original,
							...patch
						};
						strokes[index] = {
							...applySketchCommands({
								...doc,
								layers: [{
									...layer,
									strokes: []
								}]
							}, [{
								...changed,
								op: "stroke",
								layer: layer.id
							}]).layers[0].strokes[0],
							brush: original.brush ?? "pen",
							...original.pressure !== void 0 ? { pressure: original.pressure } : {},
							...original.brushVersion === 2 ? { brushVersion: 2 } : {}
						};
						if (patch.gradient === void 0 && original.gradient && !strokes[index].gradient && original.fill) strokes[index].gradient = original.gradient;
					} else throw Error("Unknown object action");
					doc = {
						...doc,
						layers: doc.layers.map((l) => l === layer ? {
							...l,
							strokes
						} : l)
					};
					continue;
				}
				if (command.op !== "stroke") throw Error("Unknown command");
				const shape = command.shape === "ellipse" ? "circle" : command.shape ?? "pen";
				const { color, width = shape === "text" ? 24 : 2, opacity = 1, fill = false } = command;
				let points = command.points;
				if (command.start !== void 0 || command.segments !== void 0) {
					if (shape !== "bezier" || points !== void 0 || !command.start || !Array.isArray(command.segments) || !command.segments.length || command.segments.length > 64) throw Error("Bezier requires start and 1–64 segments, without points");
					points = [command.start, ...command.segments.flatMap((s) => [
						s?.control1,
						s?.control2,
						s?.end
					])];
				}
				if (![
					"pen",
					"line",
					"rectangle",
					"circle",
					"polygon",
					"bezier",
					"arrow",
					"text",
					"eraser"
				].includes(shape) || !/^#[0-9a-f]{6}$/i.test(color ?? "") || !finite(width, 1, 256) || !finite(opacity, 0, 1) || typeof fill !== "boolean" || !Array.isArray(points) || !points.length || points.length > 2e3 || points.some((p) => !p || !finite(p.x, 0, 1) || !finite(p.y, 0, 1))) throw Error("Invalid stroke");
				if ([
					"line",
					"arrow",
					"text",
					"rectangle",
					"circle"
				].includes(shape) && points.length !== 2 || shape === "polygon" && points.length < 3) throw Error("Invalid shape points");
				if (shape === "bezier" && (points.length < 4 || points.length > 193 || (points.length - 1) % 3 !== 0)) throw Error(`commands[${commands.indexOf(command)}]: Bezier has ${points.length} points; expected 4, 7, 10, ... 193 (start + control1/control2/end per segment). No commands in this batch were applied.`);
				if (fill && ![
					"rectangle",
					"circle",
					"polygon",
					"bezier"
				].includes(shape)) throw Error("Fill requires a closed shape");
				const layer = doc.layers.find((layer) => layer.id === (command.layer ?? doc.active));
				if (!layer?.visible) throw Error("Target layer is missing or hidden");
				if (shape === "text" && (typeof command.text !== "string" || !command.text.trim() || command.text.length > 500 || points[0].x === points[1].x || points[0].y === points[1].y)) throw Error("Text requires 1–500 characters and a non-empty bounding box");
				const id = command.id ?? crypto.randomUUID();
				if (typeof id !== "string" || !id.length || id.length > 100 || layer.strokes.some((s) => s.id === id)) throw Error("Invalid or duplicate object id");
				const gradient = normalizeGradient(command.gradient), blur = normalizeBlur(command.blur), blend = normalizeBlend(command.blend), clip = normalizeClip(command.clip);
				if (gradient && !gradientFits(shape, fill)) throw Error("A gradient needs fill:true on a rectangle, circle, polygon or bezier shape");
				const stroke = {
					id,
					...shape === "text" ? { text: command.text } : {},
					shape,
					color,
					width,
					opacity,
					fill,
					...gradient ? { gradient } : {},
					...blur ? { blur } : {},
					...blend ? { blend } : {},
					...clip ? { clip } : {},
					brush: "pen",
					points: points.map((p) => ({
						x: p.x,
						y: p.y
					}))
				};
				doc = {
					...doc,
					layers: doc.layers.map((item) => item === layer ? {
						...item,
						strokes: [...item.strokes, stroke]
					} : item)
				};
			}
			const strokes = strokeCount(doc), points = doc.layers.reduce((n, l) => n + l.strokes.reduce((m, s) => m + s.points.length, 0), 0);
			if (strokes > 2e3) throw Error(`Sketch would hold ${strokes} strokes; the limit is ${MAX_SKETCH_STROKES}. Merge shapes or drop small details, then send this batch again`);
			if (points > 2e5) throw Error(`Sketch would hold ${points} points; the limit is ${MAX_SKETCH_POINTS}. Use fewer or simpler paths, then send this batch again`);
			return doc;
		}
		function createSketchCommandSession(adapter) {
			const completed = /* @__PURE__ */ new Map();
			let pending = false, cachedCharacters = 0;
			return async (request) => {
				if (!request || typeof request !== "object") throw Error("Invalid sketch request");
				if (!adapter.available()) throw Error("Open the sketch board for this session first");
				const current = adapter.snapshot();
				if (request.action === "inspect") {
					const offset = request.offset ?? 0, objects = adapter.objects?.() ?? [];
					if (!Number.isInteger(offset) || offset < 0) throw Error("offset must be a non-negative integer");
					return {
						...current,
						protocolVersion: 2,
						objects: request.objectId ? [] : objects.slice(offset, offset + 50),
						objectCount: objects.length,
						...!request.objectId && offset + 50 < objects.length ? { nextOffset: offset + 50 } : {},
						...request.objectId ? { object: adapter.object?.(request.objectId, request.layer) } : {},
						recentRequests: [...completed.values()].slice(-8).map((entry) => entry.receipt),
						...!request.objectId && offset === 0 ? { help: SKETCH_COMMAND_HELP } : {}
					};
				}
				if (request.documentId !== current.documentId) throw Error("Document changed; inspect again");
				if (pending || adapter.busy()) throw Error("Sketch is being edited; retry after it settles");
				const boxOf = (value) => {
					if (value === void 0) return void 0;
					if (!value || typeof value !== "object" || ![
						"x",
						"y",
						"width",
						"height"
					].every((key) => typeof value[key] === "number" && Number.isFinite(value[key])) || value.x < 0 || value.y < 0 || value.width < .02 || value.height < .02 || value.x + value.width > 1.0001 || value.y + value.height > 1.0001) throw Error("box must be {x,y,width,height} inside 0..1, at least 0.02 wide and high");
					return {
						x: value.x,
						y: value.y,
						width: value.width,
						height: value.height
					};
				};
				if (request.action === "preview") {
					for (const key of ["compare", "grid"]) if (request[key] !== void 0 && typeof request[key] !== "boolean") throw Error(`${key} must be true or false`);
					if (request.mode !== void 0 && !["side", "diff"].includes(request.mode)) throw Error("mode must be side or diff");
					return {
						...current,
						png: await adapter.preview({
							compare: request.compare === true,
							grid: request.grid === true,
							...request.mode ? { mode: request.mode } : {},
							...request.box ? { box: boxOf(request.box) } : {}
						}),
						...request.grid ? { gridStep: 100 } : {}
					};
				}
				if (request.action === "measure") {
					const grid = (name, fallback) => {
						const value = request[name] ?? fallback;
						if (!Number.isInteger(value) || value < 1 || value > 16) throw Error(`${name} must be an integer from 1 to 16`);
						return value;
					};
					const points = request.points ?? [];
					if (!Array.isArray(points) || points.length > 40 || points.some((point) => !point || !finite(point.x, 0, 1) || !finite(point.y, 0, 1))) throw Error("points must be at most 40 {x,y} pairs inside 0..1");
					if (typeof adapter.measure !== "function") throw Error("measure is not available");
					const palette = request.palette ?? 0;
					if (!Number.isInteger(palette) || palette < 0 || palette > 12) throw Error("palette must be an integer from 0 to 12");
					const regions = request.regions ?? 0;
					if (!Number.isInteger(regions) || regions < 0 || regions > 12) throw Error("regions must be an integer from 0 to 12");
					const scan = request.scan;
					if (scan !== void 0 && (!scan || ![
						"x1",
						"y1",
						"x2",
						"y2"
					].every((key) => finite(scan[key], 0, 1)))) throw Error("scan must be {x1,y1,x2,y2} inside 0..1");
					const box = boxOf(request.box);
					try {
						return {
							...current,
							measure: await adapter.measure({
								columns: grid("columns", 6),
								rows: grid("rows", 8),
								cells: request.cells === true,
								points,
								palette,
								regions,
								...scan ? { scan: {
									x1: scan.x1,
									y1: scan.y1,
									x2: scan.x2,
									y2: scan.y2
								} } : {},
								box
							})
						};
					} catch (cause) {
						const error = new Error(`${cause.message} Correct the request and retry with the same runId.`, { cause });
						error.code = "SKETCH_INVALID_BATCH";
						throw error;
					}
				}
				if (request.action === "undo") {
					const steps = request.steps ?? 1;
					if (!Number.isInteger(steps) || steps < 1 || steps > 20) throw Error("steps must be an integer from 1 to 20");
					if (request.revision !== void 0 && request.revision !== current.revision) throw stale("Sketch changed or is being edited; inspect again");
					if (typeof adapter.undo !== "function") throw Error("undo is not available");
					const taken = adapter.undo(steps);
					return {
						...adapter.snapshot(),
						undone: taken
					};
				}
				if (![
					"apply",
					"save",
					"reference"
				].includes(request.action)) throw Error("Unknown sketch action");
				if (typeof request.requestId !== "string" || !request.requestId.length || request.requestId.length > 100) throw Error("A unique requestId is required");
				const key = `${current.documentId}:${request.requestId}`, fingerprint = JSON.stringify({
					...request,
					runId: void 0
				});
				const cached = completed.get(key);
				if (cached) {
					if (cached.fingerprint !== fingerprint) throw Error("requestId reused with different content");
					return cached.result;
				}
				if (request.revision === void 0) throw stale("revision is required: copy it from the last result");
				if (request.revision !== current.revision || adapter.busy()) throw stale("Sketch changed or is being edited; inspect again");
				let changedObjects, progress, previousError, png, delivery;
				const report = {};
				const measureNow = async () => {
					try {
						return typeof adapter.measure === "function" ? await adapter.measure({
							columns: 6,
							rows: 8,
							points: []
						}) : void 0;
					} catch {
						return;
					}
				};
				if (request.action === "apply") {
					const before = adapter.document();
					previousError = before.layers.some((layer) => layer.image) ? (await measureNow())?.error : void 0;
					let next;
					try {
						next = applySketchCommands(before, request.commands, report);
					} catch (cause) {
						const error = new Error(`${cause.message} Correct the batch and retry with the same runId and revision; nothing was applied.`, { cause });
						error.code = "SKETCH_INVALID_BATCH";
						throw error;
					}
					adapter.commit(next);
					const previous = new Map(before.layers.flatMap((l) => l.strokes.map((s) => [`${l.id}:${s.id}`, s])));
					changedObjects = next.layers.flatMap((l) => l.strokes.filter((s) => previous.get(`${l.id}:${s.id}`) !== s).map((s) => ({
						layer: l.id,
						id: s.id
					})));
					if (previousError !== void 0) {
						const after = await measureNow();
						if (after) progress = {
							error: after.error,
							previous: previousError,
							worst: after.worst.slice(0, 3)
						};
					}
				} else if (request.action === "reference") {
					if (typeof request.image !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(request.image) || request.image.length > 19e5) throw Error("A PNG, JPEG or WebP reference image is required");
					pending = true;
					try {
						await adapter.addReference(request.image, typeof request.name === "string" ? request.name.slice(0, 40) : "reference");
					} finally {
						pending = false;
					}
				} else {
					if (request.name !== void 0 && (typeof request.name !== "string" || request.name.length > 60)) throw Error("Invalid draft name");
					pending = true;
					try {
						if (request.finalPreview) png = await adapter.preview({ drawingOnly: true });
						await adapter.save(request.name);
						if (request.finalPreview) delivery = {
							status: "saved",
							documentId: current.documentId,
							revision: current.revision
						};
					} finally {
						pending = false;
					}
				}
				if (request.action === "save") {
					const last = adapter.document?.().layers.some((layer) => layer.image) ? await measureNow() : void 0;
					if (last) progress = {
						error: last.error,
						worst: last.worst.slice(0, 3)
					};
				}
				const result = {
					...adapter.snapshot(),
					...changedObjects ? {
						changedObjects: changedObjects.slice(0, 100),
						changedObjectCount: changedObjects.length
					} : {},
					...report?.warnings?.length ? { warnings: report.warnings } : {},
					...report?.clampedPoints ? { clampedPoints: report.clampedPoints } : {},
					...progress ? { progress } : {},
					...png ? {
						png,
						delivery
					} : {}
				};
				completed.set(key, {
					fingerprint,
					result,
					receipt: {
						requestId: request.requestId,
						action: request.action,
						revision: result.revision
					}
				});
				cachedCharacters += fingerprint.length + (png?.length ?? 0);
				while (completed.size > 1 && (completed.size > 128 || cachedCharacters > 4e6)) {
					const oldest = completed.keys().next().value;
					cachedCharacters -= completed.get(oldest).fingerprint.length + (completed.get(oldest).result.png?.length ?? 0);
					completed.delete(oldest);
				}
				if (request.action === "apply" && request.look === true && typeof adapter.preview === "function") {
					const png = await adapter.preview({
						compare: false,
						grid: false,
						mode: adapter.document().layers.some((layer) => layer.image) ? "side" : void 0
					});
					return {
						...result,
						png
					};
				}
				return result;
			};
		}
		//#endregion
		//#region src/sketch-formats.js
		const SKETCH_FILE_ACCEPT = ".dsh-sketch.json,image/png,image/jpeg,image/webp";
		function encodeSketchDocument(doc) {
			return JSON.stringify({
				format: "dsh-sketch",
				version: 1,
				doc
			});
		}
		function decodeSketchDocument(text) {
			if (text.length > 32 * 1024 * 1024) throw Error("Draft exceeds 32 MB");
			const file = JSON.parse(text), source = file.doc;
			if (file.format !== "dsh-sketch" || file.version !== 1 || !source || !Array.isArray(source.layers) || !source.layers.length || source.layers.length > 8) throw Error("Invalid sketch file");
			const w = source.width ?? 1024, h = source.height ?? 1024;
			if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 2048 || h > 2048) throw Error("Invalid canvas size");
			let doc = {
				...createSketchLayers(),
				width: w,
				height: h,
				ratio: Object.keys(SKETCH_RATIOS).find((k) => SKETCH_RATIOS[k][0] === w && SKETCH_RATIOS[k][1] === h) ?? "custom"
			};
			for (let i = 0; i < source.layers.length; i++) {
				const layer = source.layers[i];
				if (i) doc = applySketchCommands(doc, [{
					op: "layer",
					action: "add"
				}]);
				if (!Array.isArray(layer.strokes)) throw Error("Invalid strokes");
				for (let j = 0; j < layer.strokes.length; j += 256) {
					const strokes = layer.strokes.slice(j, j + 256);
					doc = applySketchCommands(doc, strokes.map((s) => ({
						...s,
						op: "stroke",
						layer: doc.active,
						fill: s.fill ?? false
					})));
					const added = doc.layers.at(-1).strokes;
					for (let k = 0; k < strokes.length; k++) {
						const s = strokes[k];
						if (s.brush !== void 0 && ![
							"pen",
							"pencil",
							"marker"
						].includes(s.brush)) throw Error("Invalid brush");
						if (s.pressure !== void 0 && (!Number.isFinite(s.pressure) || s.pressure < .2 || s.pressure > 1)) throw Error("Invalid pressure");
						if (s.brushVersion !== void 0 && s.brushVersion !== 2) throw Error("Unsupported brush version");
						Object.assign(added[added.length - strokes.length + k], {
							brush: s.brush ?? "pen",
							pressure: s.pressure ?? 1,
							...s.brushVersion === 2 ? { brushVersion: 2 } : {}
						});
					}
				}
				const target = doc.layers.at(-1);
				target.name = String(layer.name ?? "").slice(0, 40);
				target.visible = layer.visible !== false;
				const blend = normalizeBlend(layer.blend);
				if (blend) target.blend = blend;
				if (layer.image) {
					const image = layer.image;
					if (typeof image.src !== "string" || !/^data:image\/png;base64,/.test(image.src) || image.src.length > 8 * 1024 * 1024 || [
						"x",
						"y",
						"width",
						"height"
					].some((k) => !Number.isFinite(image[k]) || image[k] < 0 || image[k] > 1)) throw Error("Invalid draft image");
					const bytes = Uint8Array.from(atob(image.src.slice(image.src.indexOf(",") + 1)), (c) => c.charCodeAt(0));
					if (bytes.length < 24) throw Error("Invalid draft image");
					const header = new DataView(bytes.buffer);
					if (header.getUint32(0) !== 2303741511 || header.getUint32(4) !== 218765834 || header.getUint32(16) < 1 || header.getUint32(20) < 1 || header.getUint32(16) > 4096 || header.getUint32(20) > 4096) throw Error("Invalid draft image size");
					target.image = {
						src: image.src,
						x: image.x,
						y: image.y,
						width: image.width,
						height: image.height
					};
				}
			}
			const activeIndex = source.layers.findIndex((layer) => layer.id === source.active);
			doc.active = doc.layers[Math.max(0, activeIndex)].id;
			return doc;
		}
		//#endregion
		//#region src/sketch-document-lifecycle.js
		function createSketchDocumentLifecycle(state, { sessionId, t, schedule, checkpoint, cache, setSelection, setTextEdit, setRecovered, store = sketchDrafts, decodeImages = decodeSketchImages, readImage = importSketchImage }) {
			const { doc, undo, redo, images, saved, dirty, documentId, documentRevision } = state;
			const hasContent = () => doc.current.layers.some((layer) => layer.image || layer.strokes.length);
			const save = async (name) => {
				const savingDocument = documentId.current, savingRevision = documentRevision.current;
				const row = {
					id: saved.current?.id ?? crypto.randomUUID(),
					name: name?.trim() || saved.current?.name || `${t("sketchTitle")} ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
					updated: Date.now(),
					doc: structuredClone(doc.current)
				};
				try {
					await store("save", row, sessionId);
				} catch (error) {
					if (error.code === "SKETCH_DRAFT_LIMIT") error.message = t("sketchDraftLimit");
					if (error.code === "SKETCH_STORAGE_LIMIT") error.message = t("sketchStorageLimit");
					throw error;
				}
				if (documentId.current === savingDocument) {
					saved.current = {
						id: row.id,
						name: row.name
					};
					if (documentRevision.current === savingRevision) {
						dirty.current = false;
						setRecovered(false);
					}
				}
			};
			const saveChanges = async () => {
				if (!dirty.current) return;
				if (hasContent() || saved.current) return save();
				const id = documentId.current, revision = documentRevision.current;
				await store("clearRecovery", sessionId);
				if (documentId.current === id && documentRevision.current === revision) {
					dirty.current = false;
					setRecovered(false);
				}
			};
			const replace = (next, decoded, identity) => {
				documentId.current = crypto.randomUUID();
				documentRevision.current++;
				doc.current = identifyObjects(structuredClone(next));
				setSelection(null);
				setTextEdit(null);
				images.current = decoded;
				cache.current.clear();
				undo.current = [];
				redo.current = [];
				if (state.timeline) state.timeline.current = [];
				saved.current = identity;
				dirty.current = false;
				schedule();
			};
			const fresh = async () => {
				await saveChanges();
				replace(createSketchLayers(), /* @__PURE__ */ new Map(), null);
			};
			const load = async (row) => {
				if (row.id === saved.current?.id) return;
				row = await store("get", row.id);
				if (!row) throw Error("Draft no longer exists");
				await saveChanges();
				const decoded = /* @__PURE__ */ new Map();
				await decodeImages(row.doc, decoded);
				replace(row.doc, decoded, {
					id: row.id,
					name: row.name
				});
			};
			const importImage = async (file, { visible = true } = {}) => {
				if (file.name?.toLowerCase().endsWith(".dsh-sketch.json")) {
					if (file.size > 32 * 1024 * 1024) throw Error("File exceeds 32 MB");
					const next = decodeSketchDocument(await file.text());
					const decoded = /* @__PURE__ */ new Map();
					await decodeImages(next, decoded);
					await saveChanges();
					replace(next, decoded, null);
					dirty.current = true;
					return;
				}
				if (doc.current.layers.length >= 8) throw Error("Layer limit");
				const image = await readImage(file), w = doc.current.width ?? 1024, h = doc.current.height ?? 1024;
				const scale = Math.min(w / image.width, h / image.height), width = image.width * scale / w, height = image.height * scale / h;
				const layer = {
					id: doc.current.nextId,
					name: file.name?.slice(0, 40) || t("sketchImport"),
					visible,
					strokes: [],
					image: {
						src: image.src,
						x: (1 - width) / 2,
						y: (1 - height) / 2,
						width,
						height
					}
				};
				await decodeImages({ layers: [layer] }, images.current);
				checkpoint();
				doc.current = {
					...doc.current,
					nextId: layer.id + 1,
					active: visible ? layer.id : doc.current.active,
					layers: [...doc.current.layers, layer]
				};
				schedule();
			};
			const restore = async (isCurrent = () => true) => {
				if (dirty.current || hasContent()) return;
				const id = documentId.current, revision = documentRevision.current;
				const recovery = await store("recover", sessionId);
				const archived = state.restoreId.current;
				const row = recovery ?? (archived ? await store("get", archived) : null);
				const decoded = /* @__PURE__ */ new Map();
				if (row) await decodeImages(row.doc, decoded);
				if (!isCurrent() || documentId.current !== id || documentRevision.current !== revision || dirty.current) return;
				if (row) {
					replace(row.doc, decoded, recovery ? null : {
						id: row.id,
						name: row.name
					});
					dirty.current = Boolean(recovery);
					setRecovered(Boolean(recovery));
				}
				state.restoreId.current = null;
			};
			return {
				hasContent,
				save,
				saveChanges,
				replace,
				fresh,
				load,
				importImage,
				restore
			};
		}
		//#endregion
		//#region src/sketch-operation-gate.js
		function createSketchOperationGate() {
			let running = false;
			return {
				get running() {
					return running;
				},
				async run(operation, { blocked = false, working, report, rethrow = false }) {
					if (blocked || running) return false;
					running = true;
					try {
						working(true);
						report(null);
						await operation();
						return true;
					} catch (error) {
						report(error);
						if (rethrow) throw error;
						return false;
					} finally {
						running = false;
						working(false);
					}
				}
			};
		}
		//#endregion
		//#region src/sketch-agent-export.js
		async function exportSketchAgentFile(format, { gate, blocked, working, report, exportFile }) {
			let result;
			if (!await gate.run(async () => {
				const { blob, extension } = await exportFile(format);
				const data = new Uint8Array(await blob.arrayBuffer());
				let raw = "";
				for (let i = 0; i < data.length; i += 8192) raw += String.fromCharCode(...data.subarray(i, i + 8192));
				result = {
					extension,
					mediaType: blob.type,
					base64: btoa(raw)
				};
			}, {
				blocked,
				working,
				report,
				rethrow: true
			})) throw Error("Sketch is being edited; retry after it settles");
			return result;
		}
		//#endregion
		//#region src/sketch-run-status.jsx
		function SketchRunStatus({ state, t, floating = false, onOpen, onStop, onResume, onDismiss }) {
			if (state === "idle") return null;
			const drawing = state === "drawing", recover = state === "stopped" || state === "failed";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: floating ? "codexSketchBackgroundStatus" : "codexSketchAgentStatus",
				role: "status",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
						name: drawing ? "pen" : state === "finished" ? "check" : "rectangle",
						size: 15
					}),
					floating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onOpen,
						children: t(`sketchRun_${state}`)
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`sketchRun_${state}`) }),
					drawing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "codexSketchStop",
						onClick: onStop,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
							name: "stop",
							size: 12
						}), t("sketchRunStop")]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [recover ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						title: t("sketchRunResumeHint"),
						onClick: onResume,
						children: t("sketchRunResume")
					}) : null, !recover ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": t("sketchDismissStatus"),
						title: t("sketchDismissStatus"),
						onClick: onDismiss,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
							name: "close",
							size: 14
						})
					}) : null] })
				]
			});
		}
		//#endregion
		//#region src/sketch-tool-widths.js
		const defaults = {
			pen: 12,
			pencil: 6,
			marker: 28,
			eraser: 24,
			text: 32,
			line: 12,
			arrow: 12,
			rectangle: 12,
			circle: 12
		};
		const keyFor = ({ tool, brush }) => tool === "pen" ? brush : tool;
		function switchSketchToolWidth(memory, current, next) {
			if (current.tool !== "select") memory[keyFor(current)] = current.width;
			if (next.tool === "select") return current.width;
			const key = keyFor(next);
			return memory[key] ?? defaults[key] ?? 12;
		}
		function stepSketchWidth(width, direction) {
			return Math.max(1, Math.min(256, width + direction * 2));
		}
		//#endregion
		//#region src/sketch-session-state.js
		function createSketchSessionState() {
			const ref = (current) => ({ current });
			return {
				doc: ref(createSketchLayers()),
				undo: ref([]),
				redo: ref([]),
				images: ref(/* @__PURE__ */ new Map()),
				timeline: ref([]),
				saved: ref(null),
				dirty: ref(false),
				documentId: ref(crypto.randomUUID()),
				documentRevision: ref(0),
				restoreId: ref(null),
				mounts: 0,
				agentAdapter: ref({}),
				agentSession: ref(null),
				agentRun: ref(null)
			};
		}
		//#endregion
		//#region src/sketch-layer-renderer.js
		const NO_IMAGES = /* @__PURE__ */ new Map();
		const surface = (width, height) => {
			const c = document.createElement("canvas");
			c.width = width;
			c.height = height;
			return c;
		};
		function paintSketchLayers(context, doc, cache, size = doc.width ?? 1024, height = doc.height ?? size, activeLayer, images = NO_IMAGES) {
			context.globalCompositeOperation = "source-over";
			context.globalAlpha = 1;
			context.fillStyle = "#fff";
			context.fillRect(0, 0, size, height);
			for (const id of cache.keys()) if (!doc.layers.some((layer) => layer.id === id)) cache.delete(id);
			for (const layer of doc.layers) {
				if (!layer.visible) continue;
				let entry = cache.get(layer.id);
				if (!entry || entry.surface.width !== size || entry.surface.height !== height) {
					entry = {
						surface: surface(size, height),
						base: surface(size, height)
					};
					cache.set(layer.id, entry);
				}
				const moving = layer.id === activeLayer;
				const count = Math.max(0, layer.strokes.length - (moving ? 1 : 0));
				const prefix = layer.strokes[count - 1];
				if (entry.count !== count || entry.prefix !== prefix || entry.image !== layer.image || entry.strokes !== layer.strokes) {
					const ctx = entry.base.getContext("2d");
					const append = entry.count !== void 0 && count >= entry.count && entry.image === layer.image && (entry.strokes === layer.strokes || entry.strokes.slice(0, entry.count).every((stroke, index) => stroke === layer.strokes[index]));
					if (!append) {
						ctx.clearRect(0, 0, size, height);
						const ref = layer.image, image = ref && images.get(ref.src);
						if (image) ctx.drawImage(image, ref.x * size, ref.y * height, ref.width * size, ref.height * height);
					}
					paintSketch(ctx, layer.strokes, size, true, height, append ? entry.count : 0, count);
					entry.count = count;
					entry.prefix = prefix;
					entry.image = layer.image;
					entry.strokes = layer.strokes;
				}
				context.globalCompositeOperation = layer.blend ?? "source-over";
				if (moving) {
					const ctx = entry.surface.getContext("2d");
					ctx.clearRect(0, 0, size, height);
					ctx.drawImage(entry.base, 0, 0);
					paintSketch(ctx, layer.strokes, size, true, height, layer.strokes.length - 1);
					context.drawImage(entry.surface, 0, 0);
				} else context.drawImage(entry.base, 0, 0);
				context.globalCompositeOperation = "source-over";
			}
		}
		//#endregion
		//#region src/sketch-diff.js
		const luma = (data, at) => data[at] * .299 + data[at + 1] * .587 + data[at + 2] * .114;
		function lumaPlane(picture) {
			const { data, width, height } = picture, plane = new Float32Array(width * height);
			for (let i = 0; i < plane.length; i++) plane[i] = luma(data, i * 4);
			return plane;
		}
		function gradient(plane, width, height) {
			const out = new Float32Array(width * height);
			for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
				const at = y * width + x;
				const gx = plane[at - width + 1] + 2 * plane[at + 1] + plane[at + width + 1] - plane[at - width - 1] - 2 * plane[at - 1] - plane[at + width - 1];
				const gy = plane[at + width - 1] + 2 * plane[at + width] + plane[at + width + 1] - plane[at - width - 1] - 2 * plane[at - width] - plane[at - width + 1];
				out[at] = Math.hypot(gx, gy) / 4;
			}
			return out;
		}
		const percentile = (values, share) => {
			const sample = [];
			const stride = Math.max(1, Math.floor(values.length / 2e4));
			for (let i = 0; i < values.length; i += stride) sample.push(values[i]);
			sample.sort((a, b) => a - b);
			return sample[Math.min(sample.length - 1, Math.floor(sample.length * share))] || 1e-6;
		};
		const STOPS = [
			[0, [
				24,
				24,
				28
			]],
			[.12, [
				24,
				24,
				28
			]],
			[.3, [
				40,
				80,
				230
			]],
			[.5, [
				30,
				200,
				220
			]],
			[.72, [
				250,
				220,
				40
			]],
			[1, [
				235,
				30,
				30
			]]
		];
		const heat = (value) => {
			for (let i = 1; i < STOPS.length; i++) if (value <= STOPS[i][0]) {
				const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], part = (value - a) / (b - a || 1);
				return ca.map((channel, k) => channel + (cb[k] - channel) * part);
			}
			return STOPS.at(-1)[1];
		};
		function diffHeatmap(reference, drawing) {
			const { width, height } = reference, count = width * height;
			const lumaR = lumaPlane(reference), lumaD = lumaPlane(drawing);
			const gradR = gradient(lumaR, width, height), gradD = gradient(lumaD, width, height);
			const bright = new Float32Array(count), color = new Float32Array(count), edge = new Float32Array(count);
			for (let i = 0; i < count; i++) {
				const at = i * 4;
				const cbR = reference.data[at + 2] - lumaR[i], crR = reference.data[at] - lumaR[i], cbD = drawing.data[at + 2] - lumaD[i], crD = drawing.data[at] - lumaD[i];
				bright[i] = Math.abs(lumaR[i] - lumaD[i]);
				color[i] = Math.hypot(cbR - cbD, crR - crD);
				edge[i] = Math.abs(gradR[i] - gradD[i]);
			}
			const [pb, pc, pe] = [
				bright,
				color,
				edge
			].map((values) => percentile(values, .97));
			const out = new Uint8ClampedArray(count * 4);
			for (let i = 0; i < count; i++) {
				const mix = .3 * bright[i] / pb + .45 * color[i] / pc + .25 * edge[i] / pe;
				const [r, g, b] = heat(Math.min(1, Math.pow(Math.min(1, mix / 1.3), .7)));
				out[i * 4] = r;
				out[i * 4 + 1] = g;
				out[i * 4 + 2] = b;
				out[i * 4 + 3] = 255;
			}
			return {
				data: out,
				width,
				height
			};
		}
		//#endregion
		//#region src/sketch-preview.js
		const GRID_STEP = 100;
		const PANE_WIDTH = 560;
		const PANE_HEIGHT = 760;
		const LABEL = 22;
		const GAP = 10;
		const MAX_SURFACE = 4096;
		const referenceOf = (doc) => ({
			...doc,
			layers: doc.layers.map((layer) => ({
				...layer,
				strokes: [],
				visible: Boolean(layer.image)
			}))
		});
		const drawingOf = (doc) => ({
			...doc,
			layers: doc.layers.map((layer) => ({
				...layer,
				image: void 0
			}))
		});
		function composeSketchPreview({ doc, images, width, height, options = {}, makeSurface, paintLayers, readPixels = (surface) => surface.getContext("2d").getImageData(0, 0, surface.width, surface.height) }) {
			const hasReference = doc.layers.some((layer) => layer.image);
			const mode = options.mode === "side" || options.mode === "diff" ? options.mode : void 0;
			if ((options.compare || mode) && !hasReference) throw Error("compare needs a reference picture layer on the board; ask the user to add the reference with the pictures button");
			const box = options.box;
			const region = box ? {
				x: box.x * width,
				y: box.y * height,
				w: box.width * width,
				h: box.height * height
			} : {
				x: 0,
				y: 0,
				w: width,
				h: height
			};
			const zoom = box ? Math.max(1, Math.min(3, 900 / Math.max(region.w, region.h), MAX_SURFACE / width, MAX_SURFACE / height)) : 1;
			const render = (variant) => {
				const bigWidth = Math.round(width * zoom), bigHeight = Math.round(height * zoom);
				const big = makeSurface(bigWidth, bigHeight);
				paintLayers(big.getContext("2d"), variant, /* @__PURE__ */ new Map(), bigWidth, bigHeight, void 0, images);
				if (!box) return big;
				const out = makeSurface(Math.max(1, Math.round(region.w * zoom)), Math.max(1, Math.round(region.h * zoom)));
				out.getContext("2d").drawImage(big, Math.round(region.x * zoom), Math.round(region.y * zoom), out.width, out.height, 0, 0, out.width, out.height);
				return out;
			};
			const grid = (context, w, h) => {
				if (options.grid) paintGrid(context, w, h, region, zoom);
			};
			if (mode) {
				const reference = render(referenceOf(doc)), drawing = render(drawingOf(doc));
				const scale = Math.min(1, PANE_WIDTH / reference.width, PANE_HEIGHT / reference.height);
				const paneWidth = Math.max(1, Math.round(reference.width * scale)), paneHeight = Math.max(1, Math.round(reference.height * scale));
				const panes = mode === "diff" ? 3 : 2;
				const surface = makeSurface(panes * paneWidth + (panes - 1) * GAP, paneHeight + LABEL), context = surface.getContext("2d");
				context.fillStyle = "#ffffff";
				context.fillRect(0, 0, surface.width, surface.height);
				const labels = [
					"reference",
					"drawing",
					"difference"
				];
				const place = (source, index) => {
					context.drawImage(source, index * (paneWidth + GAP), LABEL, paneWidth, paneHeight);
					context.save();
					context.beginPath();
					context.rect(index * (paneWidth + GAP), LABEL, paneWidth, paneHeight);
					context.clip();
					context.translate(index * (paneWidth + GAP), LABEL);
					context.scale(scale, scale);
					grid(context, reference.width, reference.height);
					context.restore();
					context.fillStyle = "#222222";
					context.font = "14px sans-serif";
					context.textBaseline = "top";
					context.fillText(labels[index], index * (paneWidth + GAP) + 4, 3);
				};
				place(reference, 0);
				place(drawing, 1);
				if (mode === "diff") {
					const heat = makeSurface(reference.width, reference.height);
					const pixels = diffHeatmap(readPixels(reference), readPixels(drawing));
					heat.getContext("2d").putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
					place(heat, 2);
				}
				return surface.toDataURL("image/png");
			}
			if (options.compare) {
				const reference = render(referenceOf(doc)), drawing = render(drawingOf(doc));
				const surface = makeSurface(reference.width, reference.height), context = surface.getContext("2d");
				context.drawImage(reference, 0, 0);
				context.globalAlpha = .5;
				context.drawImage(drawing, 0, 0);
				context.globalAlpha = 1;
				grid(context, surface.width, surface.height);
				return surface.toDataURL("image/png");
			}
			const surface = render(options.drawingOnly ? drawingOf(doc) : doc);
			grid(surface.getContext("2d"), surface.width, surface.height);
			return surface.toDataURL("image/png");
		}
		function paintGrid(context, width, height, region, zoom) {
			const step = zoom > 1.6 ? GRID_STEP / 2 : GRID_STEP;
			context.save();
			context.lineWidth = 1;
			context.strokeStyle = "rgba(214,0,120,0.45)";
			context.fillStyle = "rgba(214,0,120,0.9)";
			context.font = "12px sans-serif";
			context.textBaseline = "top";
			for (let canvasX = Math.ceil(region.x / step) * step; canvasX < region.x + region.w; canvasX += step) {
				if (canvasX <= 0) continue;
				const x = Math.round((canvasX - region.x) * zoom);
				context.beginPath();
				context.moveTo(x + .5, 0);
				context.lineTo(x + .5, height);
				context.stroke();
				context.fillText(String(canvasX), x + 3, 2);
			}
			for (let canvasY = Math.ceil(region.y / step) * step; canvasY < region.y + region.h; canvasY += step) {
				if (canvasY <= 0) continue;
				const y = Math.round((canvasY - region.y) * zoom);
				context.beginPath();
				context.moveTo(0, y + .5);
				context.lineTo(width, y + .5);
				context.stroke();
				context.fillText(String(canvasY), 3, y + 2);
			}
			context.restore();
		}
		//#endregion
		//#region src/sketch-files.jsx
		function SketchFiles({ save, load, fresh, importImage, download, hasContent, disabled, t, runOperation, extra }) {
			const [open, setOpen] = (0, react.useState)(false), [rows, setRows] = (0, react.useState)([]), [name, setName] = (0, react.useState)(""), [remove, setRemove] = (0, react.useState)(null), [working, setWorking] = (0, react.useState)(false);
			const [format, setFormat] = (0, react.useState)("png");
			const input = (0, react.useRef)(null), host = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (open && !working) host.current?.querySelector("input:not([type=file])")?.focus({ preventScroll: true });
				else if (!open && document.activeElement === document.body) {
					const dialog = host.current?.closest("dialog");
					if (dialog?.open) dialog.querySelector("canvas")?.focus({ preventScroll: true });
				}
			}, [open, working]);
			useSketchDismiss(open, setOpen, host, [".codexSketchFiles"]);
			const run = (operation) => runOperation(async () => {
				setWorking(true);
				try {
					await operation();
				} finally {
					setWorking(false);
				}
			});
			const refresh = async () => setRows(await sketchDrafts("list"));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: host,
				className: "codexSketchFiles",
				onKeyDown: (e) => {
					if (e.key === "Escape" && open) {
						e.preventDefault();
						e.stopPropagation();
						setOpen(false);
					}
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: disabled || working,
						"aria-expanded": open,
						onClick: () => {
							setOpen(!open);
							if (!open) run(refresh);
						},
						children: t("sketchFiles")
					}),
					extra,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: input,
						type: "file",
						accept: SKETCH_FILE_ACCEPT,
						hidden: true,
						onChange: (e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file) run(async () => {
								await importImage(file);
								setOpen(false);
							});
						}
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "codexSketchFilePanel",
						"aria-label": t("sketchFiles"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSketchFileActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: disabled || working,
									onClick: () => void run(async () => {
										await fresh();
										setName("");
										setOpen(false);
									}),
									children: t("sketchNew")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: disabled || working,
									onClick: () => input.current.click(),
									children: t("sketchImport")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t("sketchDraftName"),
								placeholder: t("sketchDraftName"),
								value: name,
								maxLength: 60,
								onChange: (e) => setName(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: disabled || working,
								onClick: () => void run(async () => {
									await save(name);
									await refresh();
								}),
								children: t("sketchSave")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchExportFormats codexSketchSegment",
								role: "group",
								"aria-label": t("sketchExportFormat"),
								children: [["png", "PNG"], ["draft", t("sketchEditableFile")]].map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": format === value,
									disabled: disabled || working,
									onClick: () => setFormat(value),
									children: label
								}, value))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: disabled || working || !hasContent,
								onClick: () => void run(async () => {
									await download(format);
									setOpen(false);
								}),
								children: t("sketchDownload")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchFormatHint") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchLocalDrafts") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchDraftList",
								children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: disabled || working,
									onClick: () => void run(async () => {
										await load(row);
										setName(row.name);
										setOpen(false);
									}),
									children: row.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: disabled || working,
									"aria-label": `${t("sketchDeleteDraft")} ${row.name}`,
									onClick: () => {
										if (remove !== row.id) {
											setRemove(row.id);
											return;
										}
										run(async () => {
											await sketchDrafts("delete", row.id);
											setRemove(null);
											await refresh();
										});
									},
									children: remove === row.id ? t("sketchDeleteConfirm") : t("sketchDeleteDraft")
								})] }, row.id))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setOpen(false),
								children: t("sketchFileClose")
							})
						]
					}) : null
				]
			});
		}
		//#endregion
		//#region src/sketch-replay.js
		const MAX_REPLAY_STATES = 2e3;
		function recordReplayState(states, doc) {
			if (states.at(-1) === doc) return;
			states.push(doc);
			if (states.length > 2e3) states.splice(0, states.length - MAX_REPLAY_STATES);
		}
		function appendedStrokes(before, after) {
			for (const layer of before.layers) {
				const next = after.layers.find((item) => item.id === layer.id);
				if (!next || next.image !== layer.image || layer.strokes.length > next.strokes.length || layer.strokes.some((stroke, i) => stroke !== next.strokes[i])) return void 0;
			}
			const added = [];
			for (const layer of after.layers) {
				const old = before.layers.find((item) => item.id === layer.id)?.strokes.length ?? 0;
				for (let i = old; i < layer.strokes.length; i++) added.push({
					layer: layer.id,
					stroke: layer.strokes[i]
				});
			}
			return added;
		}
		function replaySteps(states) {
			const steps = [];
			for (let index = 1; index < states.length; index++) {
				const before = states[index - 1], after = states[index];
				if (before === after) continue;
				const added = appendedStrokes(before, after);
				steps.push(added?.length ? {
					type: "draw",
					before,
					after,
					added
				} : {
					type: "jump",
					before,
					after,
					added: []
				});
			}
			return steps;
		}
		const lengthOf = (stroke, width, height) => {
			const points = stroke.points;
			let total = 0;
			for (let i = 1; i < points.length; i++) total += Math.hypot((points[i].x - points[i - 1].x) * width, (points[i].y - points[i - 1].y) * height);
			return total;
		};
		const OUTLINE_SHARE = .3;
		function strokePath(stroke) {
			const [first, last] = [stroke.points[0], stroke.points.at(-1)];
			if (!first || stroke.shape === "text" || stroke.shape === "eraser") return void 0;
			switch (stroke.shape) {
				case "line":
				case "arrow": return [first, last];
				case "bezier": return flattenSketchCurve(stroke, 1024, 1024);
				case "polygon": return [...stroke.points, first];
				case "rectangle": return [
					first,
					{
						x: last.x,
						y: first.y
					},
					last,
					{
						x: first.x,
						y: last.y
					},
					first
				];
				case "circle": {
					const cx = (first.x + last.x) / 2, cy = (first.y + last.y) / 2, rx = Math.abs(last.x - first.x) / 2, ry = Math.abs(last.y - first.y) / 2;
					return Array.from({ length: 49 }, (_, i) => ({
						x: cx + rx * Math.cos(i / 48 * Math.PI * 2),
						y: cy + ry * Math.sin(i / 48 * Math.PI * 2)
					}));
				}
				default: return stroke.points;
			}
		}
		function partialStroke(stroke, fraction) {
			if (fraction >= 1) return stroke;
			if (!(fraction > 0)) return {
				...stroke,
				opacity: 0
			};
			const filled = stroke.fill && stroke.shape !== "pen";
			if (filled && !stroke.gradient && fraction >= OUTLINE_SHARE && stroke.shape !== "text") {
				const reveal = (fraction - OUTLINE_SHARE) / (1 - OUTLINE_SHARE);
				const stops = [
					{
						offset: 0,
						color: stroke.color
					},
					{
						offset: reveal,
						color: stroke.color
					},
					{
						offset: Math.min(1, reveal + .002),
						color: stroke.color,
						opacity: 0
					},
					{
						offset: 1,
						color: stroke.color,
						opacity: 0
					}
				];
				return {
					...stroke,
					gradient: {
						type: "linear",
						x1: 0,
						y1: 0,
						x2: 0,
						y2: 1,
						stops
					}
				};
			}
			const path = strokePath(stroke);
			if (!path || path.length < 2) return {
				...stroke,
				opacity: (stroke.opacity ?? 1) * Math.max(0, fraction)
			};
			const share = filled ? fraction / OUTLINE_SHARE : fraction;
			const lengths = path.slice(1).map((point, i) => Math.hypot(point.x - path[i].x, point.y - path[i].y));
			let remaining = lengths.reduce((sum, value) => sum + value, 0) * Math.max(0, share);
			const points = [path[0]];
			for (let i = 0; i < lengths.length; i++) {
				if (remaining >= lengths[i]) {
					points.push(path[i + 1]);
					remaining -= lengths[i];
					continue;
				}
				const part = lengths[i] ? remaining / lengths[i] : 0;
				points.push({
					x: path[i].x + (path[i + 1].x - path[i].x) * part,
					y: path[i].y + (path[i + 1].y - path[i].y) * part
				});
				break;
			}
			if (points.length < 2) return {
				...stroke,
				opacity: 0
			};
			const { gradient, blur, ...rest } = stroke;
			return filled ? {
				...rest,
				shape: "pen",
				fill: false,
				width: Math.max(2, Math.min(3, stroke.width ?? 2)),
				opacity: .85,
				points
			} : {
				...rest,
				shape: "pen",
				fill: false,
				points,
				...blur ? { blur } : {}
			};
		}
		function strokeWeight(stroke, width = 1024, height = 1024) {
			if (stroke.fill && stroke.shape !== "pen") return 2.2;
			return .6 + Math.min(4, Math.sqrt(lengthOf(stroke, width, height)) / 8);
		}
		function planReplay(steps, duration, width = 1024, height = 1024) {
			const items = steps.map((step) => ({
				step,
				weight: step.type === "jump" ? 6 : step.added.reduce((sum, item) => sum + strokeWeight(item.stroke, width, height), 0) + 6
			}));
			const total = items.reduce((sum, item) => sum + item.weight, 0) || 1;
			let at = 0;
			return items.map(({ step, weight }) => {
				const span = duration * weight / total;
				const drawing = span - Math.min(span * .12, 500);
				const drawWeight = step.added.reduce((sum, item) => sum + strokeWeight(item.stroke, width, height), 0) || 1;
				let cursor = at;
				const strokes = step.added.map((item) => {
					const own = drawing * strokeWeight(item.stroke, width, height) / drawWeight;
					const entry = {
						...item,
						start: cursor,
						end: cursor + own
					};
					cursor += own;
					return entry;
				});
				const planned = {
					step,
					start: at,
					end: at + span,
					strokes
				};
				at += span;
				return planned;
			});
		}
		function replayFrame(plan, time) {
			if (!plan.length) return void 0;
			const last = plan.at(-1);
			if (time >= last.end) return { doc: last.step.after };
			const item = plan.find((entry) => time < entry.end) ?? last;
			if (item.step.type === "jump" || !item.strokes.length) return { doc: time < item.start + (item.end - item.start) / 2 ? item.step.before : item.step.after };
			const done = item.strokes.filter((entry) => time >= entry.end);
			const current = item.strokes.find((entry) => time >= entry.start && time < entry.end);
			const layers = item.step.after.layers.map((layer) => {
				const base = item.step.before.layers.find((old) => old.id === layer.id)?.strokes ?? [];
				const extra = [...done.filter((entry) => entry.layer === layer.id).map((entry) => entry.stroke)];
				if (current?.layer === layer.id) extra.push(partialStroke(current.stroke, (time - current.start) / (current.end - current.start)));
				return {
					...layer,
					strokes: extra.length ? [...base, ...extra] : base
				};
			});
			return {
				doc: {
					...item.step.after,
					layers
				},
				moving: current?.layer
			};
		}
		//#endregion
		//#region src/sketch-replay.jsx
		const SPEEDS = [
			[
				"fast",
				12e3,
				"sketchReplayFast"
			],
			[
				"normal",
				3e4,
				"sketchReplayNormal"
			],
			[
				"slow",
				6e4,
				"sketchReplaySlow"
			]
		];
		const VIDEO_TYPES = [
			"video/webm;codecs=vp9",
			"video/webm;codecs=vp8",
			"video/webm"
		];
		function SketchReplay({ states, current, images, name, onClose, t }) {
			const canvas = (0, react.useRef)(null);
			const cache = (0, react.useRef)(/* @__PURE__ */ new Map());
			const clock = (0, react.useRef)({
				time: 0,
				last: 0,
				playing: true,
				recorder: null
			});
			const [speed, setSpeed] = (0, react.useState)("normal");
			const [playing, setPlaying] = (0, react.useState)(true);
			const [recording, setRecording] = (0, react.useState)(false);
			const [progress, setProgress] = (0, react.useState)(0);
			const [note, setNote] = (0, react.useState)("");
			const [video, setVideo] = (0, react.useState)(null);
			const width = current.width ?? 1024, height = current.height ?? 1024;
			const duration = SPEEDS.find((item) => item[0] === speed)[1];
			const steps = (0, react.useMemo)(() => replaySteps([...states, current]), [states, current]);
			const plan = (0, react.useMemo)(() => planReplay(steps, duration, width, height), [
				steps,
				duration,
				width,
				height
			]);
			const total = plan.at(-1)?.end ?? 0;
			const paint = (time) => {
				const target = canvas.current;
				if (!target) return;
				const frame = replayFrame(plan, time);
				paintSketchLayers(target.getContext("2d"), frame?.doc ?? current, cache.current, width, height, frame?.moving, images);
			};
			(0, react.useEffect)(() => {
				clock.current.time = 0;
				clock.current.last = 0;
				cache.current.clear();
				let frame = 0;
				const tick = (now) => {
					const state = clock.current;
					if (state.playing) {
						state.time = Math.min(total, state.time + (state.last ? now - state.last : 0));
						if (state.time >= total) {
							state.playing = false;
							setPlaying(false);
							if (state.recorder) window.setTimeout(() => state.recorder?.stop(), 600);
						}
					}
					state.last = now;
					paint(state.time);
					setProgress(total ? state.time / total : 1);
					frame = requestAnimationFrame(tick);
				};
				frame = requestAnimationFrame(tick);
				return () => cancelAnimationFrame(frame);
			}, [plan]);
			(0, react.useEffect)(() => () => {
				if (video) URL.revokeObjectURL(video.url);
			}, [video]);
			(0, react.useEffect)(() => () => {
				if (clock.current.recorder?.state === "recording") {
					clock.current.recorder.onstop = null;
					clock.current.recorder.stop();
				}
			}, []);
			const toggle = () => {
				const state = clock.current;
				if (state.time >= total) {
					state.time = 0;
					cache.current.clear();
				}
				state.playing = !state.playing;
				setPlaying(state.playing);
			};
			const seek = (value) => {
				clock.current.time = value * total;
				clock.current.playing = false;
				setPlaying(false);
				cache.current.clear();
			};
			const record = () => {
				if (recording) {
					clock.current.recorder?.stop();
					return;
				}
				const type = VIDEO_TYPES.find((item) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(item));
				if (!type || !canvas.current?.captureStream) {
					setNote(t("sketchReplayUnsupported"));
					return;
				}
				setNote("");
				const chunks = [];
				const recorder = new MediaRecorder(canvas.current.captureStream(30), {
					mimeType: type,
					videoBitsPerSecond: 8e6
				});
				recorder.ondataavailable = (event) => {
					if (event.data.size) chunks.push(event.data);
				};
				recorder.onstop = () => {
					clock.current.recorder = null;
					setRecording(false);
					setVideo({
						url: URL.createObjectURL(new Blob(chunks, { type: "video/webm" })),
						file: `${(name || "sketch").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 80)}-${t("sketchReplayFileSuffix")}.webm`
					});
				};
				clock.current.time = 0;
				clock.current.playing = true;
				cache.current.clear();
				clock.current.recorder = recorder;
				setPlaying(true);
				setRecording(true);
				recorder.start(250);
			};
			const stop = () => {
				if (clock.current.recorder?.state === "recording") {
					clock.current.recorder.onstop = null;
					clock.current.recorder.stop();
					clock.current.recorder = null;
					setRecording(false);
				}
				onClose();
			};
			const clock0 = Math.round(progress * total / 1e3), clock1 = Math.round(total / 1e3);
			const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
			const icon = (path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				viewBox: "0 0 24 24",
				width: "18",
				height: "18",
				"aria-hidden": "true",
				fill: "currentColor",
				children: path
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSketchReplay",
				role: "dialog",
				"aria-label": t("sketchReplayTitle"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchReplayTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "codexSketchReplayClose",
					onClick: stop,
					"aria-label": t("sketchReplayClose"),
					children: [icon(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z" })), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sketchReplayClose") })]
				})] }), video ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSketchReplayStage",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("video", {
							src: video.url,
							controls: true,
							autoPlay: true,
							loop: true
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSketchReplayBar",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							className: "codexSketchReplaySave",
							href: video.url,
							download: video.file,
							children: t("sketchReplaySave")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setVideo(null),
							children: t("sketchReplayAgain")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchReplaySaveHint") })
				] }) : steps.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sketchReplayEmpty") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSketchReplayStage",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
							ref: canvas,
							width,
							height,
							style: {
								aspectRatio: `${width} / ${height}`,
								width: `min(100cqw, calc(100cqh * ${width / height}))`
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSketchReplayBar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "codexSketchReplayPlay",
								disabled: recording,
								onClick: toggle,
								"aria-label": playing ? t("sketchReplayPause") : t("sketchReplayPlay"),
								children: playing ? icon(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" })) : icon(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 5.2v13.6L19 12z" }))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "codexSketchReplayTime",
								children: [
									mmss(clock0),
									" / ",
									mmss(clock1)
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "range",
								min: "0",
								max: "1",
								step: "0.001",
								value: progress,
								disabled: recording,
								"aria-label": t("sketchReplayTitle"),
								onChange: (event) => seek(Number(event.target.value))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchSegment",
								role: "group",
								"aria-label": t("sketchReplaySpeed"),
								children: SPEEDS.map(([value, , label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": speed === value,
									disabled: recording,
									onClick: () => setSpeed(value),
									children: t(label)
								}, value))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "codexSketchReplayRecord",
								"data-recording": recording || void 0,
								onClick: record,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { "aria-hidden": "true" }), recording ? t("sketchReplayStopRecording") : t("sketchReplayRecord")]
							})
						]
					}),
					note ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
						role: "alert",
						children: note
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchReplayHint") })
				] })]
			});
		}
		//#endregion
		//#region src/sketch-size-control.jsx
		function SketchSizeControl({ value, onChange, onStart, onEnd, label, disabled, min = 2, max = 128, mode, modes, onModeChange, suffix = "" }) {
			const active = (0, react.useRef)(false);
			const start = () => {
				if (!active.current) {
					active.current = true;
					onStart?.();
				}
			};
			const end = () => {
				if (active.current) {
					active.current = false;
					onEnd?.();
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSketchSizeControl",
				title: label,
				children: [
					modes ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSketchSizeModes",
						children: modes.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": mode === item.value,
							disabled,
							onClick: () => {
								end();
								onModeChange(item.value);
							},
							children: item.label
						}, item.value))
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "range",
						"aria-label": label,
						"aria-orientation": "vertical",
						min,
						max,
						value,
						disabled,
						onPointerDown: start,
						onPointerUp: end,
						onPointerCancel: end,
						onBlur: end,
						onKeyDown: start,
						onKeyUp: end,
						onChange: (event) => {
							start();
							onChange(Number(event.target.value));
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("output", { children: [Math.round(value), suffix] })
				]
			});
		}
		//#endregion
		//#region src/sketch-agent-run.js
		function createSketchAgentRun({ execute, open, changed, busy = () => false, idleMs = 9e5 }) {
			let state = "idle", generation = 0, runNumber = 0, pending = false, runId, timer, completed;
			const update = (next) => {
				state = next;
				changed(next);
			};
			const clear = () => {
				clearTimeout(timer);
				timer = void 0;
			};
			const expire = () => {
				clear();
				generation++;
				if (state === "drawing") update("failed");
			};
			return {
				get state() {
					return state;
				},
				get locked() {
					return state === "drawing";
				},
				stop() {
					clear();
					generation++;
					update("stopped");
				},
				resume() {
					clear();
					generation++;
					update("idle");
				},
				fail: expire,
				dispose() {
					clear();
					generation++;
					state = "idle";
				},
				async execute(request) {
					if (!request || typeof request !== "object") throw Error("Invalid sketch request");
					if (state === "stopped") throw Error("Drawing stopped by the user. Do not retry until they enable drawing again.");
					if (pending || busy()) throw Error("Sketch is being edited; retry after it settles");
					if (request.action !== "inspect" && request.runId !== runId) throw Error("Drawing run changed; inspect again");
					if (state === "finished" && completed?.key === JSON.stringify(request)) return completed.value;
					if (state !== "drawing" && request.action !== "inspect") throw Error("Start drawing with inspect");
					clear();
					const version = generation;
					pending = true;
					try {
						if (state !== "drawing") {
							runId = `run-${++runNumber}`;
							completed = void 0;
							update("drawing");
							open();
						}
						const value = await execute(request.action === "finish" ? {
							...request,
							action: "save",
							finalPreview: true
						} : request);
						if (version !== generation) throw Error("Drawing interrupted");
						if (request.action !== "finish") return {
							...value,
							runId
						};
						completed = {
							key: JSON.stringify(request),
							value: {
								...value,
								runId
							}
						};
						update("finished");
						return completed.value;
					} catch (error) {
						if (version === generation && (error.code === "SKETCH_INVALID_BATCH" || error.code === "SKETCH_STALE")) throw error;
						if (version === generation) {
							update("failed");
							throw new Error(`${error.message} Call inspect to obtain the current runId and revision before retrying.`, { cause: error });
						}
						throw error;
					} finally {
						pending = false;
						if (state === "drawing") {
							timer = setTimeout(expire, idleMs);
							timer.unref?.();
						}
					}
				}
			};
		}
		//#endregion
		//#region src/rpc-contract.js
		const CHANNEL = "/codex-subscription";
		Object.freeze([
			"status",
			"login/start",
			"login/status",
			"login/submit",
			"login/cancel",
			"logout",
			"account/select",
			"account/remove",
			"usage",
			"usage/accounts",
			"usage/history",
			"usage/profile",
			"diagnostics",
			"preferences/status",
			"preferences/models",
			"preferences/update",
			"default-model/status",
			"default-model/select",
			"runtime/status",
			"runtime/install",
			"runtime/remove",
			"runtime/cancel",
			"storage/status",
			"storage/clear-forecast",
			"voice/start",
			"voice/stop",
			"voice/status",
			"voice/interrupt",
			"voice/preview",
			"voice/catalog",
			"voice/native/probe",
			"voice/native/start",
			"voice/native/status",
			"voice/native/control",
			"voice/native/stop",
			"remote/status",
			"remote/enable",
			"remote/disable",
			"remote/pair",
			"remote/clients",
			"remote/revoke",
			"reset-credit/inspect",
			"reset-credit/prepare",
			"reset-credit/consume",
			"image/original/chunk",
			"sketch/connect",
			"sketch/poll",
			"sketch/claim",
			"sketch/result",
			"sketch/disconnect"
		]);
		function unwrap(response) {
			if (!response?.ok) throw new Error(response?.error?.message ?? "Codex RPC failed");
			return response.value;
		}
		//#endregion
		//#region src/sketch-agent-client.js
		function connectSketchAgent(rpc, sessionId, execute, report, pollDelay = () => 350) {
			let stopped = false, token, timer, attempts = 0, failures = 0, pending = false;
			const call = (endpoint, payload) => rpc.call(CHANNEL, `sketch/${endpoint}`, {
				sessionId,
				token,
				...payload
			}).then(unwrap);
			const poll = async () => {
				if (stopped || pending) return;
				pending = true;
				try {
					const tasks = await call("poll");
					for (const task of tasks) {
						if (stopped) break;
						if (task.cancelled) {
							report("Sketch operation interrupted; completed strokes are preserved.");
							continue;
						}
						let value, error;
						try {
							if (task.expiresAt < Date.now() || !await call("claim", { id: task.id })) throw Error("Sketch command expired or cancelled; inspect before retrying");
							if (stopped) break;
							value = await execute(task.request);
						} catch (cause) {
							error = cause.message;
						}
						await call("result", {
							id: task.id,
							value,
							error
						});
					}
				} catch (error) {
					if (!stopped) {
						if (++failures > 5) {
							report(`${error.message}; reconnect failed. Reopen this session to retry.`);
							return;
						}
						report(`${error.message}; reconnecting. Inspect recentRequests before retrying a write.`);
						if (token) call("disconnect").catch(() => {});
						token = void 0;
						timer = setTimeout(connect, Math.min(1e4, 1e3 * 2 ** (failures - 1)));
					}
					return;
				} finally {
					pending = false;
				}
				failures = 0;
				if (!stopped) timer = setTimeout(poll, pollDelay());
			};
			const connect = () => {
				if (stopped || pending) return;
				pending = true;
				call("connect").then((value) => {
					pending = false;
					token = value.token;
					attempts = 0;
					if (stopped) call("disconnect").catch(() => {});
					else poll();
				}, (error) => {
					pending = false;
					if (stopped) return;
					const leaseConflict = /Another board is connected/.test(error.message);
					if (++attempts < (leaseConflict ? 8 : 3)) timer = setTimeout(connect, Math.min(3e3, 500 * attempts));
					else report(error.message);
				});
			};
			const wake = () => {
				if (stopped || pending) return;
				clearTimeout(timer);
				attempts = 0;
				failures = 0;
				token ? poll() : connect();
			};
			const visible = () => {
				if (document.visibilityState === "visible") wake();
			};
			if (typeof window !== "undefined") {
				window.addEventListener("online", wake);
				window.addEventListener("focus", wake);
				document.addEventListener("visibilitychange", visible);
			}
			connect();
			return () => {
				stopped = true;
				clearTimeout(timer);
				if (typeof window !== "undefined") {
					window.removeEventListener("online", wake);
					window.removeEventListener("focus", wake);
					document.removeEventListener("visibilitychange", visible);
				}
				if (token) call("disconnect").catch(() => {});
			};
		}
		//#endregion
		//#region src/sketch-measure.js
		const hex = (r, g, b) => "#" + [
			r,
			g,
			b
		].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
		function average(picture, x0, y0, x1, y1) {
			const { data, width, height } = picture;
			const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0)), right = Math.min(width, Math.max(left + 1, Math.ceil(x1))), bottom = Math.min(height, Math.max(top + 1, Math.ceil(y1)));
			let r = 0, g = 0, b = 0, n = 0;
			for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
				const at = (y * width + x) * 4;
				r += data[at];
				g += data[at + 1];
				b += data[at + 2];
				n++;
			}
			return n ? [
				r / n,
				g / n,
				b / n
			] : [
				255,
				255,
				255
			];
		}
		function measureDifference(reference, drawing, { columns = 6, rows = 8, worst = 10 } = {}) {
			const { width, height } = reference;
			const cells = [];
			let total = 0;
			for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
				const x0 = column * width / columns, x1 = (column + 1) * width / columns, y0 = row * height / rows, y1 = (row + 1) * height / rows;
				let sum = 0, n = 0;
				const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24));
				for (let y = Math.floor(y0); y < y1; y += step) for (let x = Math.floor(x0); x < x1; x += step) {
					const at = (y * width + x) * 4;
					sum += Math.abs(reference.data[at] - drawing.data[at]) + Math.abs(reference.data[at + 1] - drawing.data[at + 1]) + Math.abs(reference.data[at + 2] - drawing.data[at + 2]);
					n++;
				}
				const error = n ? sum / n / 3 / 255 * 100 : 0;
				total += error;
				const ref = average(reference, x0, y0, x1, y1), art = average(drawing, x0, y0, x1, y1);
				cells.push({
					column,
					row,
					x: x0 / width,
					y: y0 / height,
					w: (x1 - x0) / width,
					h: (y1 - y0) / height,
					error: Math.round(error * 10) / 10,
					reference: hex(...ref),
					drawing: hex(...art),
					tone: Math.round((art[0] + art[1] + art[2] - ref[0] - ref[1] - ref[2]) / 3)
				});
			}
			cells.sort((a, b) => b.error - a.error);
			return {
				error: Math.round(total / cells.length * 10) / 10,
				worst: cells.slice(0, worst)
			};
		}
		function sampleColors(reference, drawing, points, radius = .004) {
			return points.map((point) => {
				const { width, height } = reference;
				const box = [
					(point.x - radius) * width,
					(point.y - radius) * height,
					(point.x + radius) * width,
					(point.y + radius) * height
				];
				return {
					x: point.x,
					y: point.y,
					reference: hex(...average(reference, ...box)),
					drawing: hex(...average(drawing, ...box))
				};
			});
		}
		function dominantColors(picture, count) {
			const { data, width, height } = picture;
			const pixels = width * height, stride = Math.max(1, Math.floor(pixels / 2e4)), sample = [];
			for (let i = 0; i < pixels; i += stride) sample.push([
				data[i * 4],
				data[i * 4 + 1],
				data[i * 4 + 2]
			]);
			const total = Math.min(count, sample.length);
			if (!total) return [];
			const mean = sample.reduce((sum, color) => [
				sum[0] + color[0],
				sum[1] + color[1],
				sum[2] + color[2]
			], [
				0,
				0,
				0
			]).map((value) => value / sample.length);
			const centers = [mean];
			const nearest = sample.map((color) => (color[0] - mean[0]) ** 2 + (color[1] - mean[1]) ** 2 + (color[2] - mean[2]) ** 2);
			while (centers.length < total) {
				let at = 0;
				for (let i = 1; i < sample.length; i++) if (nearest[i] > nearest[at]) at = i;
				if (nearest[at] === 0) break;
				const center = sample[at].slice();
				centers.push(center);
				for (let i = 0; i < sample.length; i++) nearest[i] = Math.min(nearest[i], (sample[i][0] - center[0]) ** 2 + (sample[i][1] - center[1]) ** 2 + (sample[i][2] - center[2]) ** 2);
			}
			let sums = centers.map(() => [
				0,
				0,
				0,
				0
			]);
			for (let round = 0; round < 8; round++) {
				sums = centers.map(() => [
					0,
					0,
					0,
					0
				]);
				for (const color of sample) {
					let best = 0, bestDistance = Infinity;
					for (let c = 0; c < centers.length; c++) {
						const d = (color[0] - centers[c][0]) ** 2 + (color[1] - centers[c][1]) ** 2 + (color[2] - centers[c][2]) ** 2;
						if (d < bestDistance) {
							bestDistance = d;
							best = c;
						}
					}
					const sum = sums[best];
					sum[0] += color[0];
					sum[1] += color[1];
					sum[2] += color[2];
					sum[3]++;
				}
				sums.forEach((sum, c) => {
					if (sum[3]) centers[c] = [
						sum[0] / sum[3],
						sum[1] / sum[3],
						sum[2] / sum[3]
					];
				});
			}
			return centers.map((center, c) => ({
				color: hex(...center),
				share: Math.round(sums[c][3] / sample.length * 1e3) / 10
			})).filter((item) => item.share > 0).sort((a, b) => b.share - a.share);
		}
		const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
		function scanLine(picture, line, { tolerance = 36, maxRuns = 40 } = {}) {
			const { data, width, height } = picture;
			const length = Math.max(2, Math.round(Math.hypot((line.x2 - line.x1) * width, (line.y2 - line.y1) * height)));
			const runs = [];
			let current;
			for (let i = 0; i <= length; i++) {
				const t = i / length, x = Math.min(width - 1, Math.max(0, Math.round((line.x1 + (line.x2 - line.x1) * t) * (width - 1))));
				const at = (Math.min(height - 1, Math.max(0, Math.round((line.y1 + (line.y2 - line.y1) * t) * (height - 1)))) * width + x) * 4, color = [
					data[at],
					data[at + 1],
					data[at + 2]
				];
				if (current && distance(color, current.mean) <= tolerance) {
					current.to = t;
					current.n++;
					for (let k = 0; k < 3; k++) current.sum[k] += color[k];
					current.mean = current.sum.map((value) => value / current.n);
				} else {
					current = {
						from: t,
						to: t,
						n: 1,
						sum: [...color],
						mean: color
					};
					runs.push(current);
				}
			}
			const point = (t) => ({
				x: Math.round((line.x1 + (line.x2 - line.x1) * t) * 1e3) / 1e3,
				y: Math.round((line.y1 + (line.y2 - line.y1) * t) * 1e3) / 1e3
			});
			const merged = [];
			for (const run of runs) {
				if (merged.length && run.n < 3) {
					merged.at(-1).to = run.to;
					continue;
				}
				merged.push({ ...run });
			}
			return merged.slice(0, maxRuns).map((run) => ({
				from: point(run.from),
				to: point(run.to),
				color: hex(...run.mean)
			}));
		}
		function colorRegions(picture, count) {
			const colors = dominantColors(picture, count);
			if (!colors.length) return [];
			const { data, width, height } = picture;
			const centers = colors.map((item) => [
				1,
				3,
				5
			].map((at) => Number.parseInt(item.color.slice(at, at + 2), 16)));
			const xs = colors.map(() => []), ys = colors.map(() => []);
			const stride = Math.max(1, Math.floor(Math.sqrt(width * height / 4e4)));
			for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
				const at = (y * width + x) * 4, pixel = [
					data[at],
					data[at + 1],
					data[at + 2]
				];
				let best = 0, bestDistance = Infinity;
				for (let c = 0; c < centers.length; c++) {
					const d = distance(pixel, centers[c]);
					if (d < bestDistance) {
						bestDistance = d;
						best = c;
					}
				}
				xs[best].push(x / width);
				ys[best].push(y / height);
			}
			const cut = (values, share) => {
				values.sort((a, b) => a - b);
				return values[Math.min(values.length - 1, Math.floor(values.length * share))];
			};
			const round = (value) => Math.round(value * 1e3) / 1e3;
			return colors.map((item, c) => {
				if (!xs[c].length) return { ...item };
				const x0 = cut(xs[c], .02), x1 = cut(xs[c], .98), y0 = cut(ys[c], .02), y1 = cut(ys[c], .98);
				const cx = xs[c].reduce((sum, value) => sum + value, 0) / xs[c].length, cy = ys[c].reduce((sum, value) => sum + value, 0) / ys[c].length;
				return {
					...item,
					center: {
						x: round(cx),
						y: round(cy)
					},
					box: {
						x: round(x0),
						y: round(y0),
						width: round(x1 - x0),
						height: round(y1 - y0)
					}
				};
			});
		}
		//#endregion
		//#region src/sketch-studio.jsx
		function SketchStudio({ open, agentEnabled, onOpen, onClose, attachSketch, enabled, t, incoming, sessionId, rpc, sessionState, bridgeManaged = false, onAgentReady, onAgentError }) {
			const localSession = (0, react.useRef)(null);
			localSession.current ??= sessionState ?? createSketchSessionState();
			const { doc, undo, redo, images, timeline, saved, dirty, documentId, documentRevision, agentAdapter, agentSession, agentRun } = localSession.current;
			const dialog = (0, react.useRef)(null), canvas = (0, react.useRef)(null), cache = (0, react.useRef)(/* @__PURE__ */ new Map());
			const active = (0, react.useRef)(null), frame = (0, react.useRef)(null), updateUi = (0, react.useRef)(false);
			const [agentState, setAgentState] = (0, react.useState)(agentRun.current?.state ?? "idle");
			const agentLocked = agentState === "drawing";
			const [noticeHidden, setNoticeHidden] = (0, react.useState)(false);
			const [stability, setStability] = (0, react.useState)(0), [flow, setFlow] = (0, react.useState)(100), [picturesOpen, setPicturesOpen] = (0, react.useState)(false);
			const pictureInput = (0, react.useRef)(null), received = (0, react.useRef)(null);
			const navigation = useSketchView(canvas, open);
			const toolWidths = (0, react.useRef)({});
			const [revision, redraw] = (0, react.useState)(0), [tool, setTool] = (0, react.useState)("pen"), [brush, setBrush] = (0, react.useState)("pen");
			const [eraser, setEraser] = (0, react.useState)("pixel"), [color, setColor] = (0, react.useState)("#0088ff"), [width, setWidth] = (0, react.useState)(12);
			const [selection, setSelection] = (0, react.useState)(null), [textEdit, setTextEdit] = (0, react.useState)(null), [shapesOpen, setShapesOpen] = (0, react.useState)(false);
			const sizeGesture = (0, react.useRef)(false);
			const [sizeMode, setSizeMode] = (0, react.useState)("size");
			const showOpacity = tool !== "eraser";
			const opacityMode = showOpacity && sizeMode === "opacity";
			const selected = doc.current.layers.find((l) => l.id === selection?.layer)?.strokes.find((s, i) => objectId(s, i) === selection?.id);
			const editObject = (patch, action = "update") => {
				if (agentRun.current?.locked || busy || !selected) return;
				try {
					const next = applySketchCommands(doc.current, [{
						op: "object",
						...selection,
						action,
						patch
					}]);
					if (!sizeGesture.current) checkpoint();
					doc.current = next;
					schedule();
					if (action === "delete") setSelection(null);
				} catch (e) {
					setError(e.message);
				}
			};
			const pickColor = (value) => {
				setColor(value);
				if (selected) editObject({ color: value });
			};
			const chooseTool = (name, nextBrush = brush) => {
				setWidth(switchSketchToolWidth(toolWidths.current, {
					tool,
					brush,
					width
				}, {
					tool: name,
					brush: nextBrush
				}));
				setBrush(nextBrush);
				setTool(name);
				if (name !== "select") setSelection(null);
			};
			const chooseBrush = (name) => chooseTool("pen", name);
			const [fillShape, setFillShape] = (0, react.useState)(false);
			const [hydrated, setHydrated] = (0, react.useState)(false), [recovered, setRecovered] = (0, react.useState)(false);
			const [restoreAttempt, retryRestore] = (0, react.useState)(0);
			const [replayOpen, setReplayOpen] = (0, react.useState)(false);
			const [layersOpen, setLayersOpen] = (0, react.useState)(false), [busy, setBusy] = (0, react.useState)(true), [error, setError] = (0, react.useState)("");
			const cursorRing = (0, react.useRef)(null);
			const cursor = useSketchCursor(canvas, cursorRing, width, tool === "pen" ? brush : "pen", navigation.view.scale, !open || navigation.space || busy || agentLocked || tool === "select" || tool === "text");
			useSketchDismiss(shapesOpen, setShapesOpen, dialog, [".codexSketchShapeMenu", ".codexSketchShapeToggle"]);
			useSketchDismiss(layersOpen, setLayersOpen, dialog, [".codexSketchLayers", ".codexSketchLayersToggle"]);
			useSketchDismiss(picturesOpen, setPicturesOpen, dialog, [".codexSketchPictures", ".codexSketchPicturesToggle"]);
			const paint = () => {
				if (!canvas.current) return;
				const w = doc.current.width ?? 1024, h = doc.current.height ?? 1024;
				if (canvas.current.width !== w) canvas.current.width = w;
				if (canvas.current.height !== h) canvas.current.height = h;
				paintSketchLayers(canvas.current.getContext("2d"), doc.current, cache.current, w, h, active.current?.eraseStroke ? void 0 : active.current?.layer, images.current);
			};
			const schedule = (ui = true) => {
				updateUi.current ||= ui;
				if (frame.current !== null) return;
				frame.current = requestAnimationFrame(() => {
					frame.current = null;
					paint();
					if (updateUi.current) {
						updateUi.current = false;
						redraw((value) => value + 1);
					}
				});
			};
			const checkpoint = () => {
				documentRevision.current++;
				dirty.current = true;
				recordReplayState(timeline.current, doc.current);
				undo.current.push(doc.current);
				if (undo.current.length > 30) undo.current.shift();
				redo.current = [];
			};
			const change = (action, id, value) => {
				if (busy || agentRun.current?.locked || active.current) return;
				const next = changeSketchLayer(doc.current, action, id, value);
				if (next === doc.current) return;
				if (action !== "select") checkpoint();
				else documentRevision.current++;
				doc.current = next;
				setError("");
				schedule();
			};
			(0, react.useEffect)(() => {
				if (open) {
					dialog.current.showModal();
					canvas.current.width = doc.current.width ?? 1024;
					paint();
				} else dialog.current?.close();
			}, [open]);
			(0, react.useEffect)(() => () => {
				cancelAnimationFrame(frame.current);
				cache.current.clear();
			}, []);
			const { save, saveChanges, fresh, load, importImage, restore } = createSketchDocumentLifecycle(localSession.current, {
				sessionId,
				t,
				schedule,
				checkpoint,
				cache,
				setSelection,
				setTextEdit,
				setRecovered
			});
			(0, react.useEffect)(() => localSession.current.retain?.(), []);
			(0, react.useEffect)(() => {
				let live = true;
				setHydrated(false);
				setBusy(true);
				setError("");
				(enabled ? restore(() => live) : Promise.resolve()).then(() => {
					if (live) {
						setHydrated(true);
						setBusy(false);
					}
				}).catch((error) => {
					if (live) onAgentError?.(error);
					if (live) setError(t(error.code === "SKETCH_STORAGE_BLOCKED" ? "sketchStorageBlocked" : "sketchStorageFailed"));
				});
				return () => {
					live = false;
				};
			}, [
				enabled,
				sessionId,
				restoreAttempt,
				onAgentError
			]);
			(0, react.useEffect)(() => {
				if (!hydrated || !enabled || !dirty.current || busy || agentLocked) return;
				const timer = setTimeout(() => {
					if (active.current || sizeGesture.current || !dirty.current) return;
					sketchDrafts("checkpoint", {
						id: sessionId,
						updated: Date.now(),
						doc: structuredClone(doc.current)
					}).catch(() => setError(t("sketchRecoveryFailed")));
				}, 1500);
				return () => clearTimeout(timer);
			}, [
				revision,
				hydrated,
				enabled,
				busy,
				agentLocked,
				sessionId
			]);
			const close = () => {
				if (!hydrated || agentRun.current?.locked) {
					onClose();
					return;
				}
				return runFile(async () => {
					await saveChanges();
					onClose();
				});
			};
			const operationGate = (0, react.useRef)(null);
			operationGate.current ??= createSketchOperationGate();
			const runFile = (operation) => operationGate.current.run(operation, {
				blocked: busy || agentRun.current?.locked || Boolean(active.current),
				working: setBusy,
				report: (error) => setError(error ? error?.message || t("sketchStorageFailed") : "")
			});
			(0, react.useEffect)(() => {
				if (open && hydrated && !busy && !agentLocked && incoming && incoming !== received.current) {
					received.current = incoming;
					runFile(() => importImage(incoming.file));
				}
			}, [
				open,
				incoming,
				agentLocked,
				hydrated,
				busy
			]);
			const keyDown = (event) => {
				if (event.target.closest("input,textarea,select,[contenteditable=true]") || event.isComposing || busy || active.current) return;
				if (!navigation.shortcuts) return;
				if (navigation.keyDown(event)) return;
				if (agentRun.current?.locked) return;
				if (selection && ["Delete", "Backspace"].includes(event.key)) {
					event.preventDefault();
					editObject({}, "delete");
					return;
				}
				const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
				if (command && [
					"z",
					"y",
					"s"
				].includes(key)) {
					event.preventDefault();
					event.stopPropagation();
					if (key === "s") runFile(() => save());
					else history(key === "y" || event.shiftKey ? "redo" : "undo");
					return;
				}
				if (command || event.altKey) return;
				const action = sketchShortcutAction(navigation.keys, key);
				if ([
					"pen",
					"eraser",
					"line",
					"rectangle",
					"circle",
					"select",
					"text"
				].includes(action)) {
					event.preventDefault();
					chooseTool(action);
				}
				if (key === "[" || key === "]") {
					event.preventDefault();
					const value = stepSketchWidth(selected?.width ?? width, key === "]" ? 1 : -1);
					if (selected) editObject({ width: value });
					else setWidth(value);
				}
			};
			const current = doc.current.layers.find((layer) => layer.id === doc.current.active);
			const move = (event, bounds) => {
				if (navigation.move(event)) return;
				const gesture = active.current;
				if (!gesture || gesture.id !== event.pointerId || busy) return;
				const rect = bounds ?? canvas.current.getBoundingClientRect();
				const native = event.nativeEvent ?? event;
				const samples = native.getCoalescedEvents?.() ?? [];
				try {
					doc.current = updateSketchGesture(doc.current, gesture, samples.length ? [...samples, native] : [native], rect, width, event.shiftKey);
					schedule(Boolean(gesture.object));
				} catch (error) {
					setError(error?.message || t("sketchFailed"));
				}
			};
			const end = (event, cancel = false) => {
				if (navigation.end(event)) return;
				if (active.current?.id !== event.pointerId) return;
				if (!cancel) {
					move(event);
					const gesture = active.current, stroke = doc.current.layers.find((layer) => layer.id === gesture.layer)?.strokes.at(-1);
					if (gesture.smoothing && stroke) stroke.points = smoothStrokePoints(stroke.points, gesture.smoothing);
				}
				const drawn = active.current;
				if (!cancel && !drawn.object && [
					"line",
					"arrow",
					"rectangle",
					"circle"
				].includes(tool)) {
					const stroke = doc.current.layers.find((l) => l.id === drawn.layer)?.strokes.at(-1);
					if (stroke) {
						setSelection({
							layer: drawn.layer,
							id: stroke.id
						});
						chooseTool("select");
					}
				}
				active.current = null;
				if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
				if (cancel) doc.current = undo.current.pop() ?? doc.current;
				schedule();
			};
			const history = (direction) => {
				if (busy || agentRun.current?.locked || active.current) return;
				const source = direction === "undo" ? undo : redo, target = direction === "undo" ? redo : undo;
				if (!source.current.length) return;
				documentRevision.current++;
				dirty.current = true;
				target.current.push(doc.current);
				doc.current = source.current.pop();
				schedule();
			};
			Object.assign(agentAdapter.current, {
				changed: (state) => {
					setAgentState(state);
					setNoticeHidden(false);
				},
				available: () => enabled && agentEnabled,
				open: () => onOpen(),
				busy: () => operationGate.current.running || busy || Boolean(active.current) || Boolean(textEdit) || sizeGesture.current,
				document: () => doc.current,
				snapshot: () => ({
					documentId: documentId.current,
					revision: documentRevision.current,
					width: doc.current.width ?? 1024,
					height: doc.current.height ?? 1024,
					active: doc.current.active,
					layers: doc.current.layers.map((layer) => ({
						id: layer.id,
						name: layer.name,
						visible: layer.visible,
						...layer.blend ? { blend: layer.blend } : {},
						strokes: layer.strokes.length,
						image: Boolean(layer.image)
					})),
					strokeCount: strokeCount(doc.current)
				}),
				objects: () => sketchObjectSummary(doc.current),
				object: (id, layer = doc.current.active) => {
					const target = doc.current.layers.find((l) => l.id === layer)?.strokes.find((s, i) => objectId(s, i) === id);
					if (!target) throw Error("Object not found");
					return {
						...target,
						id
					};
				},
				commit: (next) => {
					checkpoint();
					doc.current = next;
					setError("");
					schedule();
				},
				preview: async (options) => {
					const w = doc.current.width ?? 1024, h = doc.current.height ?? 1024;
					return composeSketchPreview({
						doc: doc.current,
						images: images.current,
						width: w,
						height: h,
						options,
						paintLayers: paintSketchLayers,
						makeSurface: (width, height) => Object.assign(document.createElement("canvas"), {
							width,
							height
						})
					});
				},
				pixels: ({ source, box = {
					x: 0,
					y: 0,
					width: 1,
					height: 1
				}, maxSide = 768 }) => {
					const layer = doc.current.layers.find((item) => source === void 0 ? item.image : item.id === source);
					const picture = layer?.image && images.current.get(layer.image.src);
					if (!picture) throw Error("There is no reference picture on the board; add one with the reference action first");
					const w = doc.current.width ?? 1024, h = doc.current.height ?? 1024;
					const scale = Math.min(1, maxSide / Math.max(box.width * w, box.height * h));
					const target = Object.assign(document.createElement("canvas"), {
						width: Math.max(1, Math.round(box.width * w * scale)),
						height: Math.max(1, Math.round(box.height * h * scale))
					});
					const context = target.getContext("2d", { willReadFrequently: true });
					context.fillStyle = "#ffffff";
					context.fillRect(0, 0, target.width, target.height);
					const at = layer.image;
					context.drawImage(picture, (at.x - box.x) * w * scale, (at.y - box.y) * h * scale, at.width * w * scale, at.height * h * scale);
					return context.getImageData(0, 0, target.width, target.height);
				},
				measure: async ({ columns, rows, cells = false, points, palette = 0, regions = 0, scan, box = {
					x: 0,
					y: 0,
					width: 1,
					height: 1
				} }) => {
					const reference = agentAdapter.current.pixels({
						box,
						maxSide: 480
					});
					const w = doc.current.width ?? 1024, h = doc.current.height ?? 1024;
					const scale = reference.width / (box.width * w);
					const whole = Object.assign(document.createElement("canvas"), {
						width: Math.max(1, Math.round(w * scale)),
						height: Math.max(1, Math.round(h * scale))
					});
					const drawn = {
						...doc.current,
						layers: doc.current.layers.map((layer) => layer.image ? {
							...layer,
							visible: false
						} : layer)
					};
					paintSketchLayers(whole.getContext("2d"), drawn, /* @__PURE__ */ new Map(), whole.width, whole.height, void 0, images.current);
					const target = Object.assign(document.createElement("canvas"), {
						width: reference.width,
						height: reference.height
					});
					const context = target.getContext("2d", { willReadFrequently: true });
					context.drawImage(whole, Math.round(box.x * whole.width), Math.round(box.y * whole.height), target.width, target.height, 0, 0, target.width, target.height);
					const drawing = context.getImageData(0, 0, target.width, target.height);
					return {
						...measureDifference(reference, drawing, {
							columns,
							rows,
							...cells ? { worst: columns * rows } : {}
						}),
						...points.length ? { points: sampleColors(reference, drawing, points) } : {},
						...palette ? { palette: dominantColors(reference, palette) } : {},
						...regions ? { regions: colorRegions(reference, regions) } : {},
						...scan ? { scan: {
							reference: scanLine(reference, scan),
							drawing: scanLine(drawing, scan)
						} } : {}
					};
				},
				undo: (steps = 1) => {
					let taken = 0;
					while (taken < steps && undo.current.length) {
						redo.current.push(doc.current);
						doc.current = undo.current.pop();
						taken++;
					}
					if (taken) {
						documentRevision.current++;
						dirty.current = true;
						schedule();
					}
					return taken;
				},
				addReference: async (dataUrl, name) => {
					const blob = await (await fetch(dataUrl)).blob();
					await importImage(new File([blob], name, { type: blob.type }), { visible: false });
				},
				save
			});
			agentSession.current ??= createSketchCommandSession(agentAdapter.current);
			agentRun.current ??= createSketchAgentRun({
				execute: (request) => agentSession.current(request),
				open: () => agentAdapter.current.open(),
				changed: (state) => agentAdapter.current.changed?.(state),
				busy: () => agentAdapter.current.busy()
			});
			(0, react.useEffect)(() => {
				if (!enabled || !agentEnabled || !hydrated) return;
				const api = Object.freeze({
					version: 2,
					sessionId,
					execute: (request) => agentRun.current.execute(request),
					export: (format) => exportSketchAgentFile(format, {
						gate: operationGate.current,
						blocked: agentAdapter.current.busy() || agentRun.current.locked,
						working: setBusy,
						report: (error) => setError(error ? error.message || t("sketchFailed") : ""),
						exportFile: (value) => agentAdapter.current.export(value)
					})
				});
				if (bridgeManaged) {
					onAgentReady?.(api);
					return () => onAgentReady?.(void 0);
				}
				window.dshSketchAgent = api;
				return () => {
					if (window.dshSketchAgent === api) delete window.dshSketchAgent;
				};
			}, [
				enabled,
				agentEnabled,
				rpc,
				sessionId,
				hydrated,
				bridgeManaged,
				onAgentReady
			]);
			(0, react.useEffect)(() => {
				if (!enabled || !agentEnabled) {
					if (agentRun.current.locked) agentRun.current.stop();
					return;
				}
				if (bridgeManaged || !rpc || !sessionId || !hydrated) return;
				let live = true;
				const disconnect = connectSketchAgent(rpc, sessionId, (request) => {
					if (!live) throw Error("Sketch session disconnected");
					return agentRun.current.execute(request);
				}, (message) => {
					agentRun.current.fail();
					setError(message);
				}, () => agentRun.current.locked ? 350 : 2e3);
				return () => {
					live = false;
					disconnect();
				};
			}, [
				enabled,
				agentEnabled,
				rpc,
				sessionId,
				hydrated,
				bridgeManaged
			]);
			const attach = () => {
				if (!enabled) return;
				return runFile(async () => {
					paint();
					const blob = await new Promise((resolve, reject) => canvas.current.toBlob((blob) => blob ? resolve(blob) : reject(Error(t("sketchFailed"))), "image/png"));
					await saveChanges();
					await attachSketch(blob);
					onClose();
				});
			};
			const exportFile = async (format = "png") => {
				paint();
				if (format === "draft") return {
					blob: new Blob([encodeSketchDocument(doc.current)], { type: "application/json" }),
					extension: "dsh-sketch.json"
				};
				if (format !== "png") throw Error("Unsupported format");
				return {
					blob: await new Promise((resolve, reject) => canvas.current.toBlob((blob) => blob ? resolve(blob) : reject(Error("PNG")), "image/png")),
					extension: "png"
				};
			};
			agentAdapter.current.export = exportFile;
			const download = async (format) => {
				setError("");
				const { blob, extension } = await exportFile(format);
				const url = URL.createObjectURL(blob), link = document.createElement("a");
				link.href = url;
				link.download = `${(saved.current?.name || "sketch").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 80)}.${extension}`;
				document.body.append(link);
				link.click();
				link.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1e4);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [enabled && agentEnabled && !open && !noticeHidden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchRunStatus, {
				state: agentState,
				floating: true,
				t,
				onOpen,
				onStop: () => agentRun.current.stop(),
				onResume: () => {
					setError("");
					agentRun.current.resume();
				},
				onDismiss: () => setNoticeHidden(true)
			}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: "codexSketchDialog codexSketchStudio codexLayerStudio",
				"aria-label": t("sketchTitle"),
				onKeyDown: keyDown,
				onKeyUp: navigation.keyUp,
				onPaste: (event) => {
					if (agentRun.current?.locked) {
						event.preventDefault();
						event.stopPropagation();
						return;
					}
					if (event.target.closest("input,textarea")) return;
					const file = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
					if (file) {
						event.preventDefault();
						event.stopPropagation();
						runFile(() => importImage(file));
					}
				},
				onDragOver: (event) => event.preventDefault(),
				onDrop: (event) => {
					event.preventDefault();
					event.stopPropagation();
					const file = event.dataTransfer.files[0];
					if (file) runFile(() => importImage(file));
				},
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: cursorRing,
						hidden: true,
						className: "codexSketchCursor",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "codexSketchTop",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "codexSketchRound",
								type: "button",
								"aria-label": t("sketchCancel"),
								title: t("sketchCancel"),
								disabled: busy && hydrated && !agentLocked,
								onClick: close,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, { name: "close" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchFiles, {
								save,
								load,
								fresh,
								importImage,
								download,
								hasContent: doc.current.layers.some((l) => l.visible && (l.image || l.strokes.length)),
								disabled: agentLocked || busy,
								t,
								runOperation: runFile,
								extra: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: agentLocked || busy || !timeline.current.length,
									title: t("sketchReplayTitle"),
									onClick: () => setReplayOpen(true),
									children: t("sketchReplay")
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSketchHeading",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Beta" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSketchUtility",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "codexSketchHistory",
										children: ["undo", "redo"].map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "codexSketchRound",
											"aria-label": t(name === "undo" ? "sketchUndo" : "sketchRedo"),
											title: t(name === "undo" ? "sketchUndo" : "sketchRedo"),
											disabled: agentLocked || busy || !(name === "undo" ? undo : redo).current.length,
											onClick: () => history(name),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
												name,
												size: 20
											})
										}, name))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "codexSketchRatio",
										"aria-label": t("sketchRatio"),
										title: t("sketchRatioHint"),
										value: doc.current.ratio ?? "1:1",
										disabled: agentLocked || busy,
										onChange: (event) => {
											if (active.current || agentRun.current?.locked) return;
											const next = resizeSketch(doc.current, event.target.value);
											if (next === doc.current) return;
											checkpoint();
											doc.current = next;
											schedule();
										},
										children: [doc.current.ratio === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
											value: "custom",
											disabled: true,
											children: [
												doc.current.width,
												"×",
												doc.current.height
											]
										}) : null, Object.keys(SKETCH_RATIOS).map((ratio) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: ratio,
											children: ratio
										}, ratio))]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "codexSketchLayersToggle",
										"aria-label": t("sketchLayers"),
										"aria-expanded": layersOpen,
										onClick: () => setLayersOpen((v) => !v),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
												name: "layers",
												size: 18
											}),
											t("sketchLayers"),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: doc.current.layers.length })
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "codexSketchConfirm",
								"aria-label": t("sketchAttach"),
								disabled: agentLocked || busy || !enabled || !doc.current.layers.some((l) => l.visible && (l.strokes.length || l.image)),
								onClick: () => void attach(),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
									name: "check",
									size: 18
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sketchAttachShort") })]
							})
						]
					}),
					enabled && agentEnabled && !noticeHidden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchRunStatus, {
						state: agentState,
						t,
						onStop: () => agentRun.current.stop(),
						onResume: () => {
							setError("");
							agentRun.current.resume();
						},
						onDismiss: () => setNoticeHidden(true)
					}) : null,
					recovered ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSketchAgentStatus",
						role: "status",
						children: [t("sketchRecovered"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setRecovered(false),
							"aria-label": t("sketchDismissStatus"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
								name: "close",
								size: 14
							})
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `codexLayerBody ${layersOpen ? "withLayers" : ""}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
								tabIndex: 0,
								style: {
									transform: `translate(${navigation.view.x}px,${navigation.view.y}px) scale(${navigation.view.scale})`,
									cursor: navigation.space ? "grab" : agentLocked ? "default" : tool === "select" ? "default" : tool === "text" ? "text" : "none",
									"--sketch-ratio": (doc.current.width ?? 1024) / (doc.current.height ?? 1024)
								},
								ref: canvas,
								width: SKETCH_SIZE,
								height: SKETCH_SIZE,
								"aria-label": t("sketchTitle"),
								onDoubleClick: () => {
									if (!busy && !agentRun.current?.locked && tool === "select" && selected?.shape === "text") setTextEdit({
										selection,
										value: selected.text
									});
								},
								onPointerDown: (event) => {
									if (busy || !enabled || active.current) return;
									if (navigation.down(event)) return;
									if (agentRun.current?.locked) return;
									if (event.button !== 0) return;
									const point = sketchPoint(event.clientX, event.clientY, canvas.current.getBoundingClientRect());
									if (!point) return;
									if (tool === "text") {
										setTextEdit({
											point,
											value: ""
										});
										return;
									}
									if (tool === "select") {
										doc.current = identifyObjects(doc.current);
										if (selected) {
											const b = objectBounds(selected), end = ["line", "arrow"].includes(selected.shape) ? selected.points.at(-1) : {
												x: b.x + b.width,
												y: b.y + b.height
											}, rect = canvas.current.getBoundingClientRect();
											if (Math.hypot((end.x - point.x) * rect.width, (end.y - point.y) * rect.height) < 12) {
												checkpoint();
												active.current = {
													id: event.pointerId,
													layer: selection.layer,
													object: {
														...selected,
														id: selection.id
													},
													start: point,
													handle: ["line", "arrow"].includes(selected.shape) ? "end" : "size"
												};
												canvas.current.setPointerCapture(event.pointerId);
												return;
											}
										}
										let hit;
										for (const l of doc.current.layers.slice().reverse()) {
											if (!l.visible) continue;
											const stroke = l.strokes.slice().reverse().find((s) => s.shape !== "eraser" && strokeHit(s, point, 6, doc.current.width, doc.current.height));
											if (stroke) {
												hit = {
													layer: l.id,
													stroke
												};
												break;
											}
										}
										setSelection(hit ? {
											layer: hit.layer,
											id: hit.stroke.id
										} : null);
										if (hit) {
											checkpoint();
											active.current = {
												id: event.pointerId,
												layer: hit.layer,
												object: hit.stroke,
												start: point
											};
											canvas.current.setPointerCapture(event.pointerId);
										}
										return;
									}
									setSelection(null);
									cursor.down(event);
									if (!current.visible) {
										setError(t("sketchHiddenLayer"));
										return;
									}
									if (!(tool === "eraser" && eraser === "stroke") && strokeCount(doc.current) >= 2e3) {
										setError(t("sketchLimit"));
										return;
									}
									if (tool !== "eraser" && doc.current.layers.reduce((n, l) => n + l.strokes.reduce((m, s) => m + s.points.length, 0), 0) >= 2e5) {
										setError(t("sketchLimit"));
										return;
									}
									const start = sketchPoint(event.clientX, event.clientY, canvas.current.getBoundingClientRect());
									if (!start) return;
									checkpoint();
									const layers = doc.current.layers.map((layer) => layer.id === doc.current.active ? {
										...layer,
										strokes: layer.strokes.slice()
									} : layer);
									doc.current = {
										...doc.current,
										layers
									};
									const layer = layers.find((layer) => layer.id === doc.current.active);
									const eraseStroke = tool === "eraser" && eraser === "stroke";
									if (!eraseStroke) layer.strokes.push({
										id: crypto.randomUUID(),
										color,
										opacity: flow / 100,
										shape: tool,
										width,
										fill: fillShape && ["rectangle", "circle"].includes(tool),
										brush: tool === "pen" ? brush : "pen",
										...tool === "pen" ? { brushVersion: 2 } : {},
										pressure: event.pointerType === "pen" ? Math.max(.2, event.pressure) : 1,
										points: [start]
									});
									active.current = {
										id: event.pointerId,
										layer: layer.id,
										eraseStroke,
										last: start,
										smoothing: tool === "pen" ? stability : 0
									};
									canvas.current.setPointerCapture(event.pointerId);
									setError("");
									move(event);
									schedule();
								},
								onPointerMove: (event) => {
									const rect = canvas.current.getBoundingClientRect();
									move(event, rect);
									cursor.move(event, rect);
								},
								onPointerEnter: cursor.move,
								onPointerLeave: cursor.leave,
								onPointerUp: (event) => end(event),
								onPointerCancel: (event) => end(event, true)
							}),
							selected && tool === "select" && !agentLocked ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
								className: "codexSketchSelection",
								viewBox: "0 0 1 1",
								preserveAspectRatio: "none",
								style: {
									"--sketch-ratio": (doc.current.width ?? 1024) / (doc.current.height ?? 1024),
									transform: `translate(${navigation.view.x}px,${navigation.view.y}px) scale(${navigation.view.scale})`
								},
								"aria-hidden": "true",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
									...objectBounds(selected),
									fill: "none",
									stroke: "#0088ff",
									strokeWidth: ".002",
									strokeDasharray: ".008 .005"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
									cx: ["line", "arrow"].includes(selected.shape) ? selected.points.at(-1).x : objectBounds(selected).x + objectBounds(selected).width,
									cy: ["line", "arrow"].includes(selected.shape) ? selected.points.at(-1).y : objectBounds(selected).y + objectBounds(selected).height,
									r: ".007",
									fill: "white",
									stroke: "#0088ff",
									strokeWidth: ".002"
								})]
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchSizeControl, {
								label: t(opacityMode ? "sketchFlow" : selected?.shape === "text" || tool === "text" ? "sketchTextSize" : "sketchWidth"),
								mode: opacityMode ? "opacity" : "size",
								modes: showOpacity ? [{
									value: "size",
									label: t(selected?.shape === "text" || tool === "text" ? "sketchTextSize" : "sketchSizeShort")
								}, {
									value: "opacity",
									label: t("sketchFlow")
								}] : void 0,
								onModeChange: setSizeMode,
								min: opacityMode ? 5 : 1,
								max: opacityMode ? 100 : 256,
								suffix: opacityMode ? "%" : "",
								value: opacityMode ? (selected?.opacity ?? flow / 100) * 100 : selected?.width ?? width,
								disabled: agentLocked || busy,
								onStart: () => {
									if (selected) {
										checkpoint();
										sizeGesture.current = true;
									}
								},
								onEnd: () => {
									sizeGesture.current = false;
								},
								onChange: (value) => {
									if (opacityMode) if (selected) editObject({ opacity: value / 100 });
									else setFlow(value);
									else if (selected) editObject({ width: value });
									else setWidth(value);
								}
							}),
							textEdit ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								className: "codexSketchTextEditor",
								onSubmit: (event) => {
									event.preventDefault();
									if (!textEdit.value.trim()) {
										setTextEdit(null);
										return;
									}
									try {
										if (textEdit.selection) editObject({ text: textEdit.value });
										else {
											const [a, b] = newTextBounds(textEdit.point), id = crypto.randomUUID();
											const next = applySketchCommands(doc.current, [{
												op: "stroke",
												id,
												shape: "text",
												text: textEdit.value,
												color,
												width: Math.max(24, width),
												points: [a, b]
											}]);
											checkpoint();
											doc.current = next;
											setSelection({
												layer: doc.current.active,
												id
											});
											schedule();
										}
										setTextEdit(null);
										chooseTool("select");
									} catch (e) {
										setError(e.message);
									}
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										autoFocus: true,
										"aria-label": t("sketchText"),
										maxLength: 500,
										onKeyDown: (event) => {
											if (event.nativeEvent.isComposing) return;
											if (event.key === "Escape") {
												event.preventDefault();
												event.stopPropagation();
												setTextEdit(null);
											}
											if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
												event.preventDefault();
												event.currentTarget.form.requestSubmit();
											}
										},
										value: textEdit.value,
										onChange: (e) => setTextEdit({
											...textEdit,
											value: e.target.value
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										children: t("sketchTextDone")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setTextEdit(null),
										children: t("sketchCancel")
									})
								]
							}) : null,
							picturesOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchPicturePanel, {
								document: doc.current,
								disabled: agentLocked || busy,
								pictureInput,
								importImage,
								runFile,
								change,
								t
							}) : null,
							replayOpen && dialog.current ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchReplay, {
								states: timeline.current,
								current: doc.current,
								images: images.current,
								name: saved.current?.name,
								onClose: () => setReplayOpen(false),
								t
							}), dialog.current) : null,
							layersOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchLayerPanel, {
								document: doc.current,
								disabled: agentLocked || busy,
								change,
								t
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchControls, {
						t,
						navigation,
						picturesOpen,
						setPicturesOpen,
						disabled: agentLocked || busy,
						tool,
						brush,
						chooseBrush,
						chooseTool,
						shapesOpen,
						setShapesOpen,
						fillShape,
						setFillShape,
						selected,
						editObject,
						selection,
						setTextEdit,
						stability,
						setStability,
						eraser,
						setEraser,
						color,
						pickColor
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "codexSketchHint",
						role: "alert",
						children: [error, !hydrated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => retryRestore((value) => value + 1),
							children: t("accountRetry")
						}) : null]
					}) : null
				]
			})] });
		}
		//#endregion
		exports.SKETCH_CSS = `

.codexSketchSizeModes{display:flex;flex-direction:column;gap:3px}.codexSketchSizeModes button{font-size:11px;padding:4px 6px;border-radius:10px;color:var(--sketch-muted)}.codexSketchSizeModes button[aria-pressed=true]{background:var(--sketch-line);color:var(--sketch-fg)}

.codexSketchSizeControl{position:absolute;left:10px;top:50%;transform:translateY(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 6px;border:1px solid var(--sketch-line);border-radius:24px;background:var(--sketch-glass);backdrop-filter:blur(18px);box-shadow:0 3px 14px #0001}
.codexSketchSizeControl>span{font-size:10px;color:var(--sketch-muted);max-width:42px;text-align:center}.codexSketchSizeControl output{font-size:11px;font-variant-numeric:tabular-nums;color:var(--sketch-muted)}
.codexSketchSizeControl input{writing-mode:vertical-lr;direction:rtl;width:28px;height:150px;appearance:none;background:transparent;cursor:ns-resize;touch-action:none}
.codexSketchSizeControl input::-webkit-slider-runnable-track{width:4px;border-radius:4px;background:var(--sketch-line)}
.codexSketchSizeControl input::-webkit-slider-thumb{appearance:none;width:20px;height:20px;margin-left:-8px;border-radius:50%;background:var(--sketch-fg);border:2px solid var(--sketch-bg);box-shadow:0 1px 5px #0004}
.codexSketchSelection{position:absolute;width:min(100cqw,calc(100cqh * var(--sketch-ratio,1)));height:auto;aspect-ratio:var(--sketch-ratio);pointer-events:none;overflow:visible}
.codexSketchShapeMenu{position:absolute;bottom:65px;display:grid;grid-template-columns:1fr 1fr;padding:8px;border:1px solid var(--sketch-line);border-radius:14px;background:var(--sketch-bg);box-shadow:0 8px 24px #0003;z-index:5}.codexSketchShapeMenu button{min-height:40px;padding:8px 14px}
.codexSketchTextEditor{position:absolute;z-index:4;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-wrap:wrap;gap:8px;width:min(320px,80%);padding:12px;background:var(--sketch-bg);border:1px solid var(--sketch-line);border-radius:12px;box-shadow:0 6px 24px #0003}.codexSketchTextEditor textarea{width:100%;min-height:72px;resize:vertical;background:transparent;color:inherit;border:1px solid var(--sketch-line);border-radius:8px;padding:8px;font:inherit}.codexSketchTextEditor button{padding:6px 10px;border-radius:8px;background:var(--sketch-line)}
.codexSketchObjectActions{display:flex;gap:8px}.codexSketchObjectActions button{padding:6px 8px;border-radius:8px;background:var(--sketch-line)}
.codexLayerBrush>select{background:var(--sketch-bg);color:inherit;border:1px solid var(--sketch-line);border-radius:8px;padding:6px}

.codexSketchBackgroundStatus{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#f5f5f7);color:var(--dsw-alias-label-primary,#202124);border:1px solid #8883;box-shadow:0 4px 16px #0002;font:12px system-ui}.codexSketchBackgroundStatus button{color:inherit;background:none;border:0;cursor:pointer}
.codexSketchAgentStatus{display:flex;align-items:center;justify-content:center;gap:8px;min-height:24px;color:var(--sketch-muted);font-size:12px}.codexSketchAgentStatus button{min-height:30px;padding:4px 10px;border-radius:16px;background:var(--sketch-line)}.codexSketchAgentStatus{align-self:center;max-width:100%;min-height:34px;padding:0 6px;flex-wrap:wrap}.codexSketchBackgroundStatus button{min-height:30px;display:inline-flex;align-items:center;gap:5px}.codexSketchAgentStatus .codexSketchStop,.codexSketchBackgroundStatus .codexSketchStop{font-weight:500;background:var(--sketch-line,#8882);border-radius:16px;padding:4px 10px}
.codexSketchDialog{--sketch-bg:var(--dsw-alias-bg-layer-1,#f5f5f7);--sketch-fg:var(--dsw-alias-label-primary,#202124);--sketch-muted:var(--dsw-alias-label-secondary,#727279);--sketch-line:var(--dsw-alias-border-l2,#8883);--sketch-glass:color-mix(in srgb,var(--sketch-bg) 90%,transparent);box-sizing:border-box;width:min(1280px,calc(100vw - 24px));height:94dvh;max-height:94dvh;margin:auto;padding:10px;border:1px solid var(--sketch-line);border-radius:18px;background:var(--sketch-bg);color:var(--sketch-fg);box-shadow:0 24px 90px #0004;overflow:hidden;font:13px/1.4 system-ui}
.codexSketchDialog[open]{display:flex;flex-direction:column;gap:8px}
.codexSketchDialog::backdrop{background:#0005;backdrop-filter:blur(12px)}
.codexSketchDialog *{box-sizing:border-box}
.codexSketchDialog button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0}
.codexSketchDialog button:disabled{opacity:.35;cursor:default}
.codexSketchDialog .codexSketchConfirm:disabled{background:color-mix(in srgb,var(--sketch-fg) 12%,transparent);color:var(--sketch-muted);opacity:1}
.codexSketchDialog .codexSketchSwatch::before{box-shadow:0 0 0 1px color-mix(in srgb,var(--sketch-fg) 28%,transparent)}
.codexSketchDialog button:focus-visible,.codexSketchCustom:focus-within,.codexSketchDialog input:focus-visible{outline:2px solid #0a84ff;outline-offset:3px}
.codexSketchTop{display:flex;align-items:center;justify-content:space-between;gap:8px}
.codexSketchHeading{display:flex;align-items:center;gap:8px;flex:1}.codexSketchHeading strong{font-size:16px;font-weight:600}.codexSketchHeading>span{font-size:10px;color:var(--sketch-muted);border:1px solid var(--sketch-line);border-radius:6px;padding:1px 5px}
.codexSketchRound{width:44px;height:44px;border-radius:50%}
.codexSketchTop>.codexSketchRound,.codexSketchLayersToggle,.codexSketchHistory{background:var(--sketch-glass)!important;border:1px solid var(--sketch-line)!important;box-shadow:0 2px 8px #0001;backdrop-filter:blur(16px)}
.codexSketchDialog .codexSketchConfirm{min-height:44px;padding:0 16px;border-radius:24px;background:#0a84ff;color:#fff;font-weight:600}
.codexSketchUtility{display:flex;justify-content:space-between;align-items:center;margin:0;gap:8px}
.codexSketchHistory{display:flex;border-radius:24px;padding:0 2px}.codexSketchLayersToggle{height:44px;border-radius:24px;padding:0 10px}.codexSketchLayersToggle>span{font-variant-numeric:tabular-nums;color:var(--sketch-muted)}
.codexSketchDialog button:hover:not(:disabled){filter:brightness(.94)}
.codexLayerBody{position:relative;display:grid;place-items:center;min-width:0;min-height:0;flex:1;container-type:size}
.codexLayerStudio canvas{display:block;width:min(100cqw,calc(100cqh * var(--sketch-ratio,1)));height:auto;aspect-ratio:var(--sketch-ratio,1);background:white;border-radius:4px;outline:1px solid #0001;box-shadow:0 2px 12px #0002;touch-action:none;cursor:crosshair}
.codexSketchControls{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;width:100%;max-width:100%;margin:0;padding:4px 8px;border:1px solid var(--sketch-line);border-radius:14px;background:var(--sketch-glass);box-shadow:0 5px 20px #0001;backdrop-filter:blur(18px)}
.codexSketchPill{display:flex;gap:4px;justify-content:center}.codexSketchPill button{min-width:46px;min-height:48px;flex-direction:column;gap:3px;padding:3px 5px;border-radius:10px}.codexSketchPill button>span{font-size:11px}
.codexSketchPill button[aria-pressed=true],.codexSketchSegment button[aria-pressed=true]{background:color-mix(in srgb,var(--sketch-fg) 9%,transparent);box-shadow:inset 0 0 0 1px var(--sketch-line)}
.codexLayerBrush{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;margin:0}
.codexSketchWidth{display:flex;align-items:center;gap:10px;color:var(--sketch-muted);font-size:11px}.codexSketchWidth input{width:80px;min-height:32px;accent-color:#0a84ff}.codexSketchWidth output{width:20px;font-variant-numeric:tabular-nums}
.codexSketchSegment{display:flex;padding:2px;border-radius:12px;background:color-mix(in srgb,var(--sketch-fg) 5%,transparent)}.codexSketchSegment button{min-height:40px;padding:0 10px;border-radius:10px;font-size:11px}
.codexSketchPalette{display:flex;align-items:center;justify-content:center;gap:4px}
.codexSketchDialog .codexSketchSwatch{position:relative;width:32px;height:40px;border-radius:50%;background:transparent}
.codexSketchSwatch::before{content:'';width:20px;height:20px;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px #8884}
.codexSketchSwatch[aria-pressed=true]::after{content:'';position:absolute;inset:3px;border:2px solid #0a84ff;border-radius:50%}
.codexSketchCustom{position:relative;display:grid;place-items:center;width:36px;height:36px;margin:2px;border-radius:50%;background:conic-gradient(#ff3936,#ffcc00,#34c759,#0088ff,#a855f7,#ff3936);cursor:pointer}.codexSketchCustom span{width:24px;height:24px;border:3px solid var(--sketch-bg);border-radius:50%}.codexSketchCustom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.codexSketchHint{max-width:460px;margin:10px auto 0;text-align:center;color:var(--sketch-muted);font-size:11px;line-height:1.5}.codexSketchHint[role=alert]{color:var(--dsw-alias-state-error-primary,#e44)}
.codexSketchLayers{position:absolute;top:0;right:0;width:216px;max-height:100%;overflow:auto;padding:12px;border:1px solid var(--sketch-line);border-radius:20px;background:var(--sketch-glass);backdrop-filter:blur(24px);box-shadow:0 10px 40px #0003;z-index:2}
.codexSketchLayers header{display:flex;align-items:center;justify-content:space-between}.codexSketchLayers header button{height:40px;width:40px;border-radius:50%;font-size:22px}
.codexLayerList{max-height:180px;overflow:auto}.codexLayerRow{display:flex;align-items:center;border-radius:12px;margin:3px 0}.codexLayerRow[data-active=true]{background:color-mix(in srgb,#0a84ff 14%,transparent)}.codexLayerRow button{min-height:40px;padding:0 8px}.codexLayerRow button:last-child{flex:1;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexSketchLayerLabel{display:block;color:var(--sketch-muted);font-size:11px;margin:10px 0 4px}.codexSketchLayers input{width:100%;padding:8px 10px;min-height:38px;font:inherit;color:inherit;background:color-mix(in srgb,var(--sketch-fg) 5%,transparent);border:1px solid var(--sketch-line);border-radius:10px}
.codexLayerActions{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px}.codexLayerActions button{min-height:40px;border-radius:10px;font-size:11px;justify-content:flex-start}.codexSketchClearLayer{width:100%;min-height:40px;margin-top:8px;border-top:1px solid var(--sketch-line)!important;color:var(--dsw-alias-state-error-primary,#e44)!important;font-size:11px!important}
.codexSketchRatio{height:40px;max-width:80px;padding:0 6px;border:1px solid var(--sketch-line);border-radius:10px;background:var(--sketch-bg);color:var(--sketch-fg);font:inherit;color-scheme:light dark}
@media(max-width:760px){.codexSketchDialog{width:calc(100vw - 12px);height:97dvh;max-height:97dvh;padding:6px;border-radius:14px}.codexSketchHeading{display:none}.codexSketchTop{gap:4px}.codexSketchUtility{flex:1;justify-content:center;gap:4px}.codexSketchRound{width:36px;height:40px}.codexSketchHistory{padding:0}.codexSketchLayersToggle{padding:0 8px;height:40px}.codexSketchLayersToggle svg,.codexSketchConfirm svg{display:none}.codexSketchDialog .codexSketchConfirm{padding:0 10px;min-height:40px}.codexSketchControls{gap:2px 8px;padding:3px}.codexSketchPill{gap:0}.codexSketchPill button{min-width:44px}.codexSketchPalette{gap:0}.codexSketchWidth>span{display:none}.codexSketchWidth input{width:74px}.codexSketchLayers{width:min(216px,90%);max-height:100%;padding:8px}.codexLayerList{max-height:100px}}
@media(prefers-reduced-transparency:reduce){.codexSketchControls,.codexSketchLayers{background:var(--sketch-bg);backdrop-filter:none}.codexSketchDialog::backdrop{backdrop-filter:none;background:#0009}}
@media(prefers-contrast:more){.codexSketchDialog{--sketch-line:currentColor}.codexSketchControls,.codexSketchLayers{background:var(--sketch-bg)}}
.codexSketchFiles>button{height:40px;padding:0 10px;border:1px solid var(--sketch-line);border-radius:12px;background:var(--sketch-glass)}
.codexSketchFilePanel{position:absolute;z-index:5;top:64px;left:12px;width:min(330px,calc(100% - 24px));max-height:calc(100% - 100px);overflow:auto;padding:14px;border:1px solid var(--sketch-line);border-radius:16px;background:var(--sketch-bg);box-shadow:0 12px 40px #0004;display:flex;flex-direction:column;gap:10px}
.codexSketchFilePanel button{min-height:36px;border-radius:8px;padding:4px 10px;background:color-mix(in srgb,var(--sketch-fg) 6%,transparent)}
.codexSketchFilePanel input{min-width:0;min-height:36px;border:1px solid var(--sketch-line);border-radius:8px;padding:6px 10px;background:var(--sketch-bg);color:inherit;font:inherit}
.codexSketchFilePanel small{color:var(--sketch-muted);line-height:1.5}.codexSketchFileActions{display:flex;gap:8px}.codexSketchFileActions>button{flex:1}
.codexSketchFilePanel .codexSketchExportFormats{gap:2px;border-radius:10px}.codexSketchFilePanel .codexSketchExportFormats button{flex:1;min-width:0;min-height:34px;padding:4px 8px;background:transparent;font-size:12px}.codexSketchFilePanel .codexSketchExportFormats button[aria-pressed=true]{background:var(--sketch-bg);box-shadow:0 1px 4px #0002,inset 0 0 0 1px var(--sketch-line)}
.codexSketchDraftList{max-height:220px;overflow:auto}.codexSketchDraftList>div{display:flex;gap:6px;margin-bottom:6px}.codexSketchDraftList button:first-child{flex:1;min-width:0;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexSketchStability{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--sketch-muted)}.codexSketchStability select{height:32px;border:1px solid var(--sketch-line);border-radius:8px;background:var(--sketch-bg);color:var(--sketch-fg);font:inherit}
@media(max-width:760px){.codexSketchTop{gap:2px}.codexSketchUtility{gap:2px}.codexSketchRound{width:32px}.codexSketchLayersToggle{padding:0 6px}.codexSketchFiles>button{padding:0 6px}.codexSketchRatio{max-width:65px}.codexSketchPill button{min-width:42px}.codexSketchDialog .codexSketchConfirm{padding:0 8px}.codexSketchTop{flex-shrink:0}}

.codexLayerBody{overflow:hidden}.codexLayerStudio canvas{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='white' stroke-width='3'/%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='%23333' stroke-width='1'/%3E%3C/svg%3E") 12 12,crosshair}
.codexSketchDialog .codexSketchSwatch{width:32px;height:32px;padding:0;border-radius:50%;corner-shape:round}.codexSketchSwatch::before{width:22px;height:22px;flex-shrink:0;border-radius:50%;corner-shape:round;clip-path:circle(50%)}.codexSketchSwatch[aria-pressed=true]::after{inset:1px;border:1.5px solid var(--sketch-fg);border-radius:50%;corner-shape:round}.codexSketchCustom{width:30px;height:30px;margin:1px 4px;corner-shape:round;clip-path:circle(50%)}.codexSketchCustom span{width:22px;height:22px;border-width:2px;corner-shape:round}
.codexSketchPictures{position:absolute;left:0;top:0;z-index:3;background:var(--sketch-bg);border:1px solid var(--sketch-line);border-radius:12px;padding:10px;width:160px;max-height:100%;overflow:auto}.codexSketchPictures header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.codexSketchPictures>div{display:flex;gap:5px;align-items:center;padding:4px;border:1px solid transparent;border-radius:8px}.codexSketchPictures>div[data-active=true]{border-color:#0a84ff}.codexSketchPictures img{width:90px;height:65px;object-fit:contain}.codexSketchPictures small{color:var(--sketch-muted)}
.codexSketchViewControls{display:flex;gap:2px;align-items:center}.codexSketchViewControls button{min-height:32px;padding:0 7px;border-radius:8px}.codexSketchKeyPanel{position:absolute;overflow:auto;overscroll-behavior:contain;padding:12px;border:1px solid var(--sketch-line);border-radius:14px;background:var(--sketch-bg);z-index:5;box-shadow:0 8px 30px #0003;scrollbar-width:thin}.codexSketchKeyPanel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.codexSketchKeyPanel header button{width:28px;height:28px;border-radius:8px;font-size:20px}.codexSketchKeyPanel label{display:flex;align-items:center;justify-content:space-between;min-height:32px;gap:8px}.codexSketchKeysEnabled{padding-bottom:8px;border-bottom:1px solid var(--sketch-line)}.codexSketchKeysEnabled input{margin:0;accent-color:#0a84ff}.codexSketchKeyGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;margin:10px 0}.codexSketchKeyPanel input:not([type=checkbox]){width:52px;min-width:0;border:1px solid var(--sketch-line);border-radius:6px;color:inherit;background:color-mix(in srgb,var(--sketch-fg) 4%,transparent);padding:4px;text-align:center;font:inherit}.codexSketchKeyPanel p,.codexSketchKeyPanel small{display:block;color:var(--sketch-muted);font-size:11px;line-height:1.5;margin:0}.codexSketchKeyPanel small{border-top:1px solid var(--sketch-line);padding-top:8px}@media(max-width:380px){.codexSketchKeyGrid{grid-template-columns:1fr}}.codexSketchControls{position:static}

.codexSketchCursor{position:fixed;left:0;top:0;z-index:100;pointer-events:none;border:1px solid #222;border-radius:50%;corner-shape:round;box-shadow:0 0 0 1px #fff;box-sizing:border-box}.codexSketchCursor[hidden]{display:none}

.codexSketchFiles{display:flex;gap:6px;align-items:center}.codexSketchFiles>button:disabled{opacity:.45}
.codexSketchReplay{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 18px 16px;background:var(--sketch-bg);border-radius:inherit;overflow:hidden}
.codexSketchReplay>header{display:flex;width:100%;align-items:center;justify-content:space-between;font-size:15px}
.codexSketchDialog .codexSketchReplayClose{min-height:36px;padding:0 14px 0 10px;border-radius:18px;background:color-mix(in srgb,var(--sketch-fg) 7%,transparent);font-size:13px}
.codexSketchReplayStage{flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;container-type:size}
.codexSketchReplayStage canvas,.codexSketchReplayStage video{max-width:100%;max-height:100%;border-radius:10px;background:#fff;box-shadow:0 0 0 1px var(--sketch-line),0 10px 36px #0002}
.codexSketchReplayBar{display:flex;flex-wrap:wrap;width:100%;max-width:820px;align-items:center;justify-content:center;gap:10px;padding:8px 12px;border-radius:26px;background:color-mix(in srgb,var(--sketch-fg) 5%,transparent)}
.codexSketchReplayBar input[type=range]{flex:1;min-width:140px;height:22px;accent-color:#0a84ff}
.codexSketchDialog .codexSketchReplayBar>button{min-height:36px;padding:0 14px;border-radius:18px;background:color-mix(in srgb,var(--sketch-fg) 8%,transparent);font-size:13px}
.codexSketchDialog .codexSketchReplayBar .codexSketchReplayPlay{width:40px;height:40px;min-height:40px;padding:0;border-radius:50%;background:#0a84ff;color:#fff}
.codexSketchReplayTime{min-width:78px;font-variant-numeric:tabular-nums;color:var(--sketch-muted);font-size:12px}
.codexSketchReplayRecord i{width:10px;height:10px;border-radius:50%;background:#ff3b30}
.codexSketchDialog .codexSketchReplayRecord[data-recording]{background:#ff3b30;color:#fff}.codexSketchReplayRecord[data-recording] i{background:#fff;border-radius:2px}
.codexSketchReplay small{color:var(--sketch-muted);text-align:center}
.codexSketchReplaySave{display:inline-flex;align-items:center;min-height:36px;padding:0 18px;border-radius:18px;background:#0a84ff;color:#fff;font-size:13px;font-weight:600;text-decoration:none}
`;
		exports.SketchStudio = SketchStudio;
		return module.exports;
	}
});

//# sourceMappingURL=client.sketch.js.map
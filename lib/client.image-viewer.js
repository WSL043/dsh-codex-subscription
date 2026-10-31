window.__ModuleLoader__.load({
	id: "dsh-codex-subscription",
	chunk: "client.image-viewer.js",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region /0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		_deepseek_ai_dsh_client_ui_primitives = __toESM(_deepseek_ai_dsh_client_ui_primitives, 1);
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client-primitives.js
		const IconChevronRightOutline14 = _deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular;
		const IconChevronLeftOutline14 = _deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutlineRegular;
		const IconCloseOutline16 = _deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular;
		const IconCopyOutline16 = _deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular;
		const IconDownloadOutline16 = _deepseek_ai_dsh_client_ui_primitives.IconDownloadOutlineRegular;
		const IconEditOutline16 = _deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular;
		//#endregion
		//#region src/subscription-image-viewer-styles.js
		const SUBSCRIPTION_IMAGE_VIEWER_CSS = String.raw`
.dcsiv-root{position:fixed;inset:0;z-index:1000;pointer-events:auto;overflow:hidden;background:rgba(7,8,10,.68);color:var(--dsw-alias-label-primary-inverted,#fff);outline:0;backdrop-filter:blur(13px) saturate(.72);-webkit-backdrop-filter:blur(13px) saturate(.72)}
.dcsiv-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.dcsiv-topbar{position:absolute;right:50%;bottom:22px;z-index:6;max-width:calc(100vw - 36px);padding:5px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(38,39,43,.86);box-shadow:0 10px 34px rgba(0,0,0,.3);transform:translateX(50%);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.dcsiv-actions{display:flex;align-items:center;gap:2px;overflow-x:auto;scrollbar-width:none}.dcsiv-actions::-webkit-scrollbar{display:none}.dcsiv-button,.dcsiv-download{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.9);font:inherit;font-size:12px;text-decoration:none;white-space:nowrap;cursor:pointer}.dcsiv-button:hover,.dcsiv-download:hover,.dcsiv-button[data-active=true]{background:rgba(255,255,255,.12)}.dcsiv-button:focus-visible,.dcsiv-download:focus-visible,.dcsiv-close-floating:focus-visible{outline:2px solid rgba(255,255,255,.9);outline-offset:2px}.dcsiv-button:disabled,.dcsiv-download:disabled{opacity:.38;cursor:default}.dcsiv-icon-only{width:32px;padding:0}.dcsiv-zoom{min-width:44px;color:rgba(255,255,255,.68);font-size:12px;font-variant-numeric:tabular-nums;text-align:center}
.dcsiv-close-floating{position:absolute;top:20px;right:20px;z-index:8;display:grid;place-items:center;width:42px;height:42px;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(48,49,53,.82);box-shadow:0 8px 24px rgba(0,0,0,.28);color:#fff;cursor:pointer;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}.dcsiv-close-floating:hover{background:rgba(66,67,72,.92)}
.dcsiv-workspace{position:absolute;inset:0;display:grid;min-width:0;min-height:0;padding:68px 24px 72px;box-sizing:border-box}
.dcsiv-stage{position:relative;display:grid;place-items:center;min-width:0;min-height:0;overflow:hidden;padding:0;touch-action:none;user-select:none}.dcsiv-stage[data-dragging=true]{cursor:grabbing}.dcsiv-stage[data-annotating=true]{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='8' fill='none' stroke='%23333'/%3E%3C/svg%3E") 12 12,pointer}
.dcsiv-surface{position:relative;display:inline-flex;max-width:100%;max-height:100%;transform-origin:center;will-change:transform}.dcsiv-image{display:block;max-width:calc(100vw - 72px);max-height:calc(100vh - 154px);border-radius:12px;object-fit:contain;box-shadow:0 22px 60px rgba(0,0,0,.46);user-select:none;-webkit-user-drag:none}
.dcsiv-annotation{position:absolute;z-index:5;width:24px;height:24px;transform-origin:center;pointer-events:none}.dcsiv-pin{position:absolute;inset:0;display:grid;place-items:center;width:24px;height:24px;padding:0;border:2px solid #fff;border-radius:50%;background:rgba(23,24,27,.94);box-shadow:0 4px 16px rgba(0,0,0,.35);color:#fff;font:inherit;font-size:11px;font-weight:700;cursor:pointer;pointer-events:auto}.dcsiv-pin[data-active=true]{background:var(--dsw-alias-state-business-primary,#3964fe)}
.dcsiv-inline-note{position:absolute;bottom:34px;box-sizing:border-box;display:grid;width:min(300px,calc(100vw - 40px));grid-template-columns:24px minmax(0,1fr) 24px;align-items:center;gap:7px;padding:7px 8px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(32,33,37,.94);box-shadow:0 14px 38px rgba(0,0,0,.38);color:#fff;pointer-events:auto;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.dcsiv-annotation[data-x=right] .dcsiv-inline-note{left:-8px}.dcsiv-annotation[data-x=left] .dcsiv-inline-note{right:-8px}.dcsiv-annotation[data-x=center] .dcsiv-inline-note{left:50%;transform:translateX(-50%)}.dcsiv-annotation[data-y=down] .dcsiv-inline-note{top:34px;bottom:auto}.dcsiv-inline-note::after{position:absolute;width:9px;height:9px;background:rgba(32,33,37,.94);content:'';transform:rotate(45deg)}.dcsiv-annotation[data-y=up] .dcsiv-inline-note::after{bottom:-5px}.dcsiv-annotation[data-y=down] .dcsiv-inline-note::after{top:-5px}.dcsiv-annotation[data-x=right] .dcsiv-inline-note::after{left:13px}.dcsiv-annotation[data-x=left] .dcsiv-inline-note::after{right:13px}.dcsiv-annotation[data-x=center] .dcsiv-inline-note::after{left:calc(50% - 4px)}.dcsiv-inline-index{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3964fe);color:#fff;font-size:10px;font-weight:700}.dcsiv-inline-note textarea{box-sizing:border-box;width:100%;min-height:24px;max-height:92px;resize:none;overflow:auto;border:0;outline:0;background:transparent;color:#fff;font:inherit;font-size:12px;line-height:18px}.dcsiv-inline-note textarea::placeholder{color:rgba(255,255,255,.44)}.dcsiv-note-remove{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:rgba(255,255,255,.68);cursor:pointer}.dcsiv-note-remove:hover{background:rgba(255,255,255,.1);color:#fff}
.dcsiv-nav{position:absolute;top:50%;z-index:4;width:42px;height:42px;padding:0;transform:translateY(-50%);background:rgba(48,49,53,.82);box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}.dcsiv-prev{left:6px}.dcsiv-next{right:6px}.dcsiv-counter{position:absolute;bottom:8px;left:50%;padding:5px 10px;border-radius:999px;background:rgba(38,39,43,.86);color:rgba(255,255,255,.72);font-size:11px;transform:translateX(-50%);backdrop-filter:blur(16px)}
.dcsiv-hint{display:none}
.dcsiv-mask{position:absolute;inset:0;width:100%;height:100%;border-radius:12px;cursor:crosshair;touch-action:none}
.dcsiv-tool-icon{width:16px;height:16px;flex:none}.dcsiv-icon-button,.dcsiv-download[data-compact="true"]{width:34px;padding:0!important;justify-content:center}.dcsiv-zoom{min-width:52px;font-variant-numeric:tabular-nums}.dcsiv-divider{width:1px;height:18px;margin:0 4px;background:rgba(255,255,255,.14)}.dcsiv-menu{position:fixed;z-index:12;display:flex;flex-direction:column;min-width:150px;padding:6px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(32,33,37,.97);box-shadow:0 12px 32px rgba(0,0,0,.4)}.dcsiv-menu button{height:32px;padding:0 10px;border:0;border-radius:8px;background:none;color:rgba(255,255,255,.9);font:inherit;font-size:13px;text-align:left;cursor:pointer}.dcsiv-menu button:hover,.dcsiv-menu button:focus-visible{outline:none;background:rgba(255,255,255,.1)}
.dcsiv-erase-bar{position:absolute;left:50%;top:22px;z-index:7;display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(38,39,43,.92);color:rgba(255,255,255,.86);font-size:12px;white-space:nowrap}.dcsiv-erase-bar label{display:inline-flex;align-items:center;gap:6px}.dcsiv-erase-bar input{width:90px}.dcsiv-primary{background:#fff!important;color:#111!important}.dcsiv-primary[data-state="failed"]{color:#c62828!important}.dcsiv-brush-cursor{position:fixed;z-index:9;pointer-events:none;border:1.5px solid #fff;border-radius:50%;corner-shape:round;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.25);transform:translate(-50%,-50%)}@media(pointer:fine){.dcsiv-mask{cursor:none}}.dcsiv-button[data-state="pending"] .dcsiv-tool-icon{animation:dcsiv-pulse 1s ease-in-out infinite}.dcsiv-button[data-state="failed"]{color:#ff8a80!important}@keyframes dcsiv-pulse{50%{opacity:.3}}
.dcsiv-copy-notes{position:absolute;right:20px;bottom:22px;z-index:6;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(38,39,43,.86);color:rgba(255,255,255,.82);font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(16px)}
.dcsiv-edit-short{display:none}
@media(max-width:760px){.dcsiv-actions{flex-wrap:wrap;justify-content:center}.dcsiv-edit-short{display:inline;white-space:normal;max-width:min(280px,calc(100vw - 80px))}.dcsiv-edit-action{height:auto;min-height:32px}.dcsiv-close-floating{top:12px;right:12px;width:40px;height:40px}.dcsiv-workspace{padding:60px 12px 68px}.dcsiv-image{max-width:calc(100vw - 24px);max-height:calc(100vh - 136px)}.dcsiv-topbar{bottom:12px;max-width:calc(100vw - 24px)}.dcsiv-button{padding:0 8px}.dcsiv-button span.dcsiv-label{display:none}.dcsiv-inline-note{width:min(260px,calc(100vw - 40px))}.dcsiv-copy-notes{display:none}}
@media(prefers-reduced-motion:reduce){.dcsiv-surface{transition:none}.dcsiv-tool-icon{animation:none!important}}
`;
		//#endregion
		//#region src/subscription-image-transform.js
		const clamp$1 = (value, min, max) => Math.min(max, Math.max(min, value));
		const fitted = () => ({
			zoom: 1,
			x: 0,
			y: 0
		});
		function useImageTransform(identity) {
			const [transform, setTransform] = (0, react.useState)(fitted);
			const [dragging, setDragging] = (0, react.useState)(false);
			const [pixelScale, setPixelScale] = (0, react.useState)(1);
			const [geometry, setGeometry] = (0, react.useState)({
				width: 0,
				height: 0,
				stageWidth: 0,
				stageHeight: 0
			});
			const stageRef = (0, react.useRef)(null), surfaceRef = (0, react.useRef)(null), imageRef = (0, react.useRef)(null);
			const transformRef = (0, react.useRef)(transform);
			const pointers = (0, react.useRef)(/* @__PURE__ */ new Map()), gesture = (0, react.useRef)();
			transformRef.current = transform;
			const resetGesture = (0, react.useCallback)(() => {
				pointers.current.clear();
				gesture.current = void 0;
				setDragging(false);
			}, []);
			const fit = (0, react.useCallback)(() => {
				resetGesture();
				setTransform(fitted());
			}, [resetGesture]);
			(0, react.useEffect)(() => {
				fit();
			}, [identity, fit]);
			const actualScale = () => imageRef.current?.naturalWidth / Math.max(1, surfaceRef.current?.offsetWidth || 1) || 1;
			const boundedPan = (0, react.useCallback)((zoom, x, y) => {
				const stage = stageRef.current, surface = surfaceRef.current;
				if (!stage || !surface || zoom <= 1) return {
					x: 0,
					y: 0
				};
				const limitX = Math.max(0, (surface.offsetWidth * zoom - stage.clientWidth) / 2);
				const limitY = Math.max(0, (surface.offsetHeight * zoom - stage.clientHeight) / 2);
				return {
					x: clamp$1(x, -limitX, limitX),
					y: clamp$1(y, -limitY, limitY)
				};
			}, []);
			const setZoomAt = (0, react.useCallback)((zoom, clientX, clientY) => {
				const stage = stageRef.current;
				if (!stage) return;
				setTransform((current) => {
					const next = clamp$1(zoom, .5, Math.max(8, actualScale()));
					const box = stage.getBoundingClientRect();
					const px = clientX - box.left - box.width / 2, py = clientY - box.top - box.height / 2;
					const ratio = next / current.zoom;
					return {
						zoom: next,
						...boundedPan(next, px - (px - current.x) * ratio, py - (py - current.y) * ratio)
					};
				});
			}, [boundedPan]);
			const actual = (0, react.useCallback)(() => {
				if (!imageRef.current?.naturalWidth) return;
				resetGesture();
				setTransform({
					zoom: actualScale(),
					x: 0,
					y: 0
				});
			}, [resetGesture]);
			const measure = (0, react.useCallback)(() => {
				const next = {
					width: surfaceRef.current?.offsetWidth ?? 0,
					height: surfaceRef.current?.offsetHeight ?? 0,
					stageWidth: stageRef.current?.clientWidth ?? 0,
					stageHeight: stageRef.current?.clientHeight ?? 0
				};
				setGeometry((current) => Object.keys(next).every((key) => current[key] === next[key]) ? current : next);
				setPixelScale(1 / actualScale());
				setTransform((current) => ({
					...current,
					...boundedPan(current.zoom, current.x, current.y)
				}));
			}, [boundedPan]);
			(0, react.useEffect)(() => {
				if (!stageRef.current || !surfaceRef.current) return;
				const observer = new ResizeObserver(measure);
				observer.observe(stageRef.current);
				observer.observe(surfaceRef.current);
				measure();
				return () => observer.disconnect();
			}, [identity, measure]);
			(0, react.useEffect)(() => {
				const stage = stageRef.current;
				if (!stage) return;
				const wheel = (event) => {
					event.preventDefault();
					const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
					setZoomAt(transformRef.current.zoom * Math.exp(-delta * .0015), event.clientX, event.clientY);
				};
				stage.addEventListener("wheel", wheel, { passive: false });
				return () => stage.removeEventListener("wheel", wheel);
			}, [identity, setZoomAt]);
			const onPointerDown = (event) => {
				if (event.button !== 0 || event.target.closest("button,a,input,textarea,select")) return;
				const current = transformRef.current;
				if (event.pointerType === "mouse" && current.zoom <= 1) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				pointers.current.set(event.pointerId, {
					x: event.clientX,
					y: event.clientY
				});
				if (pointers.current.size === 2) {
					const [a, b] = [...pointers.current.values()];
					gesture.current = {
						kind: "pinch",
						distance: Math.hypot(a.x - b.x, a.y - b.y),
						transform: current
					};
				} else gesture.current = {
					kind: "pan",
					x: event.clientX,
					y: event.clientY,
					transform: current
				};
				setDragging(true);
			};
			const onPointerMove = (event) => {
				if (!pointers.current.has(event.pointerId)) return;
				pointers.current.set(event.pointerId, {
					x: event.clientX,
					y: event.clientY
				});
				const start = gesture.current;
				if (start?.kind === "pinch" && pointers.current.size >= 2) {
					const [a, b] = [...pointers.current.values()];
					setZoomAt(start.transform.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, start.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
				} else if (start?.kind === "pan") setTransform({
					zoom: start.transform.zoom,
					...boundedPan(start.transform.zoom, start.transform.x + event.clientX - start.x, start.transform.y + event.clientY - start.y)
				});
			};
			const endPointer = (event) => {
				pointers.current.delete(event.pointerId);
				const remaining = [...pointers.current.values()][0];
				if (remaining) gesture.current = {
					kind: "pan",
					...remaining,
					transform: transformRef.current
				};
				else resetGesture();
			};
			return {
				transform,
				transformRef,
				dragging,
				pixelScale,
				geometry,
				stageRef,
				surfaceRef,
				imageRef,
				fit,
				actual,
				measure,
				setZoomAt,
				resetGesture,
				pointerHandlers: {
					onPointerDown,
					onPointerMove,
					onPointerUp: endPointer,
					onPointerCancel: endPointer,
					onLostPointerCapture: endPointer
				}
			};
		}
		Object.freeze([
			["square", "1:1"],
			["portrait", "3:4"],
			["story", "9:16"],
			["landscape", "4:3"],
			["widescreen", "16:9"]
		]);
		/** Draw relative erase strokes in one color onto a canvas of the given size. */
		function paintEraseStrokes(context, strokes, width, height, color) {
			context.strokeStyle = color;
			context.fillStyle = color;
			context.lineCap = "round";
			context.lineJoin = "round";
			const scale = Math.min(width, height);
			for (const stroke of strokes) {
				const points = stroke.points;
				if (points.length === 0) continue;
				context.lineWidth = stroke.size * scale;
				context.beginPath();
				if (points.length === 1) {
					context.arc(points[0].x * width, points[0].y * height, stroke.size * scale / 2, 0, Math.PI * 2);
					context.fill();
					continue;
				}
				context.moveTo(points[0].x * width, points[0].y * height);
				for (const point of points.slice(1)) context.lineTo(point.x * width, point.y * height);
				context.stroke();
			}
		}
		/** Codex's erase mask: the marked area white on black, at the image's own resolution. */
		function paintEraseMask(context, strokes, width, height) {
			context.fillStyle = "#000";
			context.fillRect(0, 0, width, height);
			paintEraseStrokes(context, strokes, width, height, "#fff");
		}
		//#endregion
		//#region src/use-image-source.js
		function useImageSource(load, identity, preview) {
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [state, setState] = (0, react.useState)({
				identity,
				src: preview,
				failed: false,
				usable: false
			});
			(0, react.useEffect)(() => {
				let live = true;
				setState((previous) => ({
					identity,
					src: previous.identity === identity ? previous.src : preview,
					failed: false,
					usable: previous.identity === identity && previous.usable
				}));
				Promise.resolve().then(() => attempt === 0 && preview ? preview : load()).then((src) => {
					if (live) setState((previous) => ({
						identity,
						src,
						failed: !src,
						usable: previous.identity === identity && previous.src === src && previous.usable
					}));
				}, () => {
					if (live) setState((previous) => ({
						...previous,
						failed: true
					}));
				});
				return () => {
					live = false;
				};
			}, [
				identity,
				load,
				preview,
				attempt
			]);
			return {
				src: state.identity === identity ? state.src : preview,
				failed: state.identity === identity && state.failed,
				usable: state.identity === identity && state.usable,
				loaded: () => setState((previous) => previous.identity === identity ? {
					...previous,
					usable: true
				} : previous),
				fail: () => setState((previous) => previous.identity === identity ? {
					...previous,
					failed: true,
					usable: false
				} : previous),
				retry: () => setAttempt((value) => value + 1),
				attempt
			};
		}
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/ArrowsPointingOutIcon.js
		function ArrowsPointingOutIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				fill: "none",
				viewBox: "0 0 24 24",
				strokeWidth: 1.5,
				stroke: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				strokeLinecap: "round",
				strokeLinejoin: "round",
				d: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
			}));
		}
		const ForwardRef$4 = /*#__PURE__*/ react.forwardRef(ArrowsPointingOutIcon);
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/ChatBubbleLeftEllipsisIcon.js
		function ChatBubbleLeftEllipsisIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				fill: "none",
				viewBox: "0 0 24 24",
				strokeWidth: 1.5,
				stroke: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				strokeLinecap: "round",
				strokeLinejoin: "round",
				d: "M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
			}));
		}
		const ForwardRef$3 = /*#__PURE__*/ react.forwardRef(ChatBubbleLeftEllipsisIcon);
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/PaintBrushIcon.js
		function PaintBrushIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				fill: "none",
				viewBox: "0 0 24 24",
				strokeWidth: 1.5,
				stroke: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				strokeLinecap: "round",
				strokeLinejoin: "round",
				d: "M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
			}));
		}
		const ForwardRef$2 = /*#__PURE__*/ react.forwardRef(PaintBrushIcon);
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/PencilIcon.js
		function PencilIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				fill: "none",
				viewBox: "0 0 24 24",
				strokeWidth: 1.5,
				stroke: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				strokeLinecap: "round",
				strokeLinejoin: "round",
				d: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
			}));
		}
		const ForwardRef$1 = /*#__PURE__*/ react.forwardRef(PencilIcon);
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/ScissorsIcon.js
		function ScissorsIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				fill: "none",
				viewBox: "0 0 24 24",
				strokeWidth: 1.5,
				stroke: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				strokeLinecap: "round",
				strokeLinejoin: "round",
				d: "m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664"
			}));
		}
		//#endregion
		//#region src/subscription-image-viewer.jsx
		const TOOL_ICONS = {
			"remove-background": /* @__PURE__ */ react.forwardRef(ScissorsIcon),
			erase: ForwardRef$2,
			resize: ForwardRef$4,
			sketch: ForwardRef$1,
			annotate: ForwardRef$3
		};
		const ToolIcon = ({ id }) => {
			const Icon = TOOL_ICONS[id];
			return Icon ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
				className: "dcsiv-tool-icon",
				"aria-hidden": "true"
			}) : null;
		};
		const fill = (value, variables) => Object.entries(variables).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)), value);
		const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
		const bytesLabel = (bytes) => bytes === void 0 ? void 0 : bytes < 1024 * 1024 ? `${Math.max(.1, bytes / 1024).toLocaleString(void 0, { maximumFractionDigits: 1 })} KB` : `${(bytes / 1024 / 1024).toLocaleString(void 0, { maximumFractionDigits: 1 })} MB`;
		const downloadName = (name) => {
			const cleaned = String(name || "image.png").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/[. ]+$/u, "").trim();
			return cleaned === "" ? "image.png" : cleaned;
		};
		const noteText = (annotations, t) => annotations.map((annotation, index) => {
			return `${fill(t("imageAnnotation"), { value: index + 1 })} (${Math.round(annotation.x * 100)}%, ${Math.round(annotation.y * 100)}%): ${annotation.note.trim()}`;
		}).filter((line) => !line.endsWith(": ")).join("\n");
		function ViewerAction({ action, annotations, item, service, revision, t, onStartMask }) {
			const [state, setState] = (0, react.useState)("idle");
			const [menu, setMenu] = (0, react.useState)();
			const active = (0, react.useRef)(true);
			const menuRef = (0, react.useRef)(null);
			const menuButtonRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				active.current = true;
				return () => {
					active.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (menu === void 0) return void 0;
				menuRef.current?.querySelector("[role=\"menuitem\"]")?.focus();
				const onKeyDown = (event) => {
					const items = [...menuRef.current?.querySelectorAll("[role=\"menuitem\"]") ?? []];
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						setMenu(void 0);
						menuButtonRef.current?.focus();
					} else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length > 0) {
						event.preventDefault();
						event.stopPropagation();
						const step = event.key === "ArrowDown" ? 1 : -1;
						items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
					} else if (event.key === "Tab") setMenu(void 0);
				};
				const onPointerDown = (event) => {
					if (!menuRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target)) setMenu(void 0);
				};
				window.addEventListener("keydown", onKeyDown, true);
				window.addEventListener("pointerdown", onPointerDown, true);
				return () => {
					window.removeEventListener("keydown", onKeyDown, true);
					window.removeEventListener("pointerdown", onPointerDown, true);
				};
			}, [menu]);
			const invoke = async (extra = {}) => {
				if (state === "pending") return;
				setState("pending");
				try {
					await service.invoke(action, {
						annotations,
						item,
						src: item.src,
						...extra
					}, revision);
					if (!active.current || service.getSnapshot()?.revision !== revision) return;
					setState("idle");
					if (action.closeOnSuccess) service.close();
				} catch (error) {
					if (active.current) setState(error?.name === "AbortError" ? "idle" : "failed");
				}
			};
			const label = state === "pending" ? action.pendingLabel : state === "failed" ? action.errorLabel : action.label;
			if (action.kind === "mask") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dcsiv-button dcsiv-icon-button",
				title: action.label,
				"aria-label": action.label,
				onClick: () => onStartMask(action),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIcon, { id: action.id })
			});
			if (action.kind === "tool") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dcsiv-button dcsiv-icon-button",
				title: label,
				"aria-label": label,
				"data-state": state,
				disabled: state === "pending",
				onClick: () => {
					invoke();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIcon, { id: action.id })
			});
			if (action.id === "sketch" && state === "idle") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dcsiv-button dcsiv-icon-button",
				title: action.label,
				"aria-label": action.label,
				onClick: () => {
					invoke();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIcon, { id: "sketch" })
			});
			if (action.kind === "choice") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				ref: menuButtonRef,
				type: "button",
				"aria-haspopup": "menu",
				"aria-expanded": menu !== void 0,
				"data-state": state,
				disabled: state === "pending",
				onClick: (event) => {
					const box = event.currentTarget.getBoundingClientRect();
					const host = event.currentTarget.closest(".dcsiv-root");
					setMenu((value) => value === void 0 && host ? {
						host,
						style: {
							left: box.left,
							bottom: window.innerHeight - box.top + 8
						}
					} : void 0);
				},
				className: "dcsiv-button dcsiv-icon-button",
				title: label,
				"aria-label": label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIcon, { id: action.id })
			}), menu ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: menuRef,
				className: "dcsiv-menu",
				role: "menu",
				"aria-label": action.label,
				style: menu.style,
				children: action.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setMenu(void 0);
						invoke({ option: option.value });
					},
					children: option.label
				}, option.value))
			}), menu.host) : null] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dcsiv-button dcsiv-edit-action",
				"aria-label": label ?? t("imageEdit"),
				disabled: state === "pending",
				onClick: () => {
					invoke();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEditOutline16, {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dcsiv-label",
						children: label ?? t("imageEdit")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dcsiv-edit-short",
						children: state === "idle" ? action.id === "sketch" ? t("imageToSketch") : t("imageEditShort") : label
					})
				]
			});
		}
		function ViewerDownload({ download, item, t }) {
			const [state, setState] = (0, react.useState)("idle");
			const [progress, setProgress] = (0, react.useState)(0);
			const active = (0, react.useRef)();
			(0, react.useEffect)(() => () => {
				active.current?.abort();
				active.current = void 0;
			}, [item.id, download]);
			const invoke = async () => {
				if (active.current) {
					active.current.abort();
					active.current = void 0;
					setState("idle");
					return;
				}
				const controller = new AbortController();
				active.current = controller;
				setProgress(0);
				setState("pending");
				try {
					await download.onInvoke({
						item,
						src: item.src,
						signal: controller.signal,
						onProgress: ({ loaded, total }) => {
							if (active.current === controller) setProgress(Math.floor(loaded / total * 100));
						}
					});
					if (active.current === controller) setState("idle");
				} catch {
					if (active.current === controller) setState(controller.signal.aborted ? "idle" : "failed");
				} finally {
					if (active.current === controller) active.current = void 0;
				}
			};
			const label = state === "pending" ? download.pendingLabel ?? t("imageDownloadPreparing") : state === "failed" ? download.errorLabel ?? t("imageDownloadFailed") : t("imageDownload");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dcsiv-download",
				"data-compact": state === "idle",
				title: label,
				"aria-label": label,
				onClick: () => {
					invoke();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconDownloadOutline16, {}), state === "idle" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dcsiv-label",
					children: state === "pending" ? `${label} ${progress}% · ${t("cancel")}` : label
				})]
			});
		}
		function SubscriptionImageViewerOverlay({ service, t }) {
			const request = (0, react.useSyncExternalStore)(service.subscribe, service.getSnapshot);
			const [cursor, setCursor] = (0, react.useState)({
				revision: 0,
				index: 0
			});
			const index = cursor.revision === request?.revision ? cursor.index : request?.index ?? 0;
			const setIndex = (update) => setCursor((current) => ({
				revision: request.revision,
				index: typeof update === "function" ? update(current.revision === request.revision ? current.index : request.index) : update
			}));
			const [annotating, setAnnotating] = (0, react.useState)(false);
			const [annotationsByImage, setAnnotationsByImage] = (0, react.useState)(service.getAnnotationsSnapshot);
			const annotationsByImageRef = (0, react.useRef)(annotationsByImage);
			const [selected, setSelected] = (0, react.useState)();
			const [focusNote, setFocusNote] = (0, react.useState)();
			const [copied, setCopied] = (0, react.useState)(false);
			const [erasing, setErasing] = (0, react.useState)();
			const [strokes, setStrokes] = (0, react.useState)([]);
			const [brush, setBrush] = (0, react.useState)(.05);
			const [sending, setSending] = (0, react.useState)(false);
			const [sendFailed, setSendFailed] = (0, react.useState)(false);
			const maskOperation = (0, react.useRef)(0);
			const [brushCursor, setBrushCursor] = (0, react.useState)();
			const eraseRef = (0, react.useRef)({
				erasing: void 0,
				sending: false
			});
			eraseRef.current = {
				erasing,
				sending
			};
			const drawingRef = (0, react.useRef)(false);
			const maskRef = (0, react.useRef)(null);
			const rootRef = (0, react.useRef)(null);
			annotationsByImageRef.current = annotationsByImage;
			(0, react.useEffect)(() => {
				if (request === void 0) return;
				setAnnotating(false);
				setSelected(void 0);
				setCopied(false);
				const saved = service.getAnnotationsSnapshot();
				annotationsByImageRef.current = saved;
				setAnnotationsByImage(saved);
			}, [request?.revision]);
			const item = request?.items[index];
			const imageSource = useImageSource((0, react.useCallback)(() => item?.reload ? item.reload() : item?.src, [item]), `${request?.revision}:${item?.id}`, item?.src);
			(0, react.useEffect)(() => () => service.cancelPending(), [
				service,
				request?.revision,
				item?.id
			]);
			const { transform, transformRef, dragging, pixelScale, geometry, stageRef, surfaceRef, imageRef, fit, actual, measure, setZoomAt, resetGesture, pointerHandlers } = useImageTransform(`${request?.revision}:${item?.id}:${item?.src}`);
			const annotations = item === void 0 ? [] : annotationsByImage[item.id] ?? [];
			const setAnnotations = (0, react.useCallback)((update) => {
				if (item === void 0) return;
				const previous = annotationsByImageRef.current[item.id] ?? [];
				const next = typeof update === "function" ? update(previous) : update;
				const snapshot = {
					...annotationsByImageRef.current,
					[item.id]: next
				};
				annotationsByImageRef.current = snapshot;
				service.setAnnotations(item.id, next);
				setAnnotationsByImage(snapshot);
			}, [item?.id, service]);
			(0, react.useEffect)(() => {
				if (request === void 0) return void 0;
				const previousOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				rootRef.current?.focus();
				const onKeyDown = (event) => {
					if (eraseRef.current.erasing !== void 0) {
						const key = event.key.toLowerCase();
						if (event.key === "Escape") {
							event.preventDefault();
							if (!eraseRef.current.sending) {
								setErasing(void 0);
								setStrokes([]);
							}
							return;
						}
						if ((event.ctrlKey || event.metaKey) && key === "z") {
							event.preventDefault();
							if (!eraseRef.current.sending) setStrokes((current) => current.slice(0, -1));
							return;
						}
						if (event.key === "[" || event.key === "]") {
							event.preventDefault();
							setBrush((value) => Math.round(clamp(value + (event.key === "]" ? .01 : -.01), .01, .15) * 100) / 100);
							return;
						}
						if (event.key === "ArrowLeft" || event.key === "ArrowRight") return;
					}
					if (event.key === "Escape") {
						event.preventDefault();
						if (event.target instanceof Element && event.target.closest(".dcsiv-inline-note") !== null) {
							setSelected(void 0);
							return;
						}
						service.close();
						return;
					}
					const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
					if (!editing && event.key === "ArrowLeft" && request.items.length > 1) {
						event.preventDefault();
						setIndex((value) => (value - 1 + request.items.length) % request.items.length);
					} else if (!editing && event.key === "ArrowRight" && request.items.length > 1) {
						event.preventDefault();
						setIndex((value) => (value + 1) % request.items.length);
					} else if (!editing && (event.key === "+" || event.key === "=")) {
						event.preventDefault();
						const box = stageRef.current?.getBoundingClientRect();
						if (box) setZoomAt(transformRef.current.zoom * 1.2, box.left + box.width / 2, box.top + box.height / 2);
					} else if (!editing && event.key === "-") {
						event.preventDefault();
						const box = stageRef.current?.getBoundingClientRect();
						if (box) setZoomAt(transformRef.current.zoom / 1.2, box.left + box.width / 2, box.top + box.height / 2);
					} else if (!editing && event.key.toLowerCase() === "f") {
						event.preventDefault();
						fit();
					} else if (event.key === "Tab") {
						const controls = [...rootRef.current.querySelectorAll("button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex=\"-1\"])")];
						const first = controls[0];
						const last = controls.at(-1);
						if (event.shiftKey && document.activeElement === first) {
							event.preventDefault();
							last?.focus();
						} else if (!event.shiftKey && document.activeElement === last) {
							event.preventDefault();
							first?.focus();
						}
					}
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.body.style.overflow = previousOverflow;
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [
				request,
				service,
				fit,
				setZoomAt
			]);
			(0, react.useEffect)(() => {
				if (focusNote === void 0) return;
				(rootRef.current?.querySelector(`[data-note-id="${CSS.escape(focusNote)}"] textarea`))?.focus();
				setFocusNote(void 0);
			}, [
				focusNote,
				selected,
				annotations.length
			]);
			(0, react.useEffect)(() => {
				setAnnotating(false);
				setSelected(void 0);
				setErasing(void 0);
				setStrokes([]);
				maskOperation.current++;
				setSending(false);
				setSendFailed(false);
				return () => {
					maskOperation.current++;
				};
			}, [
				item?.id,
				item?.src,
				request?.revision
			]);
			(0, react.useEffect)(() => {
				const canvas = maskRef.current;
				if (!erasing || canvas === null) return;
				const context = canvas.getContext("2d");
				context.clearRect(0, 0, canvas.width, canvas.height);
				paintEraseStrokes(context, strokes, canvas.width, canvas.height, "rgba(255,59,48,.5)");
			}, [erasing, strokes]);
			const strokePoint = (event) => {
				const bounds = maskRef.current?.getBoundingClientRect();
				if (bounds === void 0) return void 0;
				return {
					x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
					y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
				};
			};
			const maskHandlers = {
				onPointerDown: (event) => {
					const point = strokePoint(event);
					if (point === void 0) return;
					event.stopPropagation();
					event.currentTarget.setPointerCapture?.(event.pointerId);
					drawingRef.current = true;
					setStrokes((current) => [...current, {
						size: brush / transformRef.current.zoom,
						points: [point]
					}]);
				},
				onPointerMove: (event) => {
					const bounds = maskRef.current?.getBoundingClientRect();
					if (bounds !== void 0) setBrushCursor({
						left: event.clientX,
						top: event.clientY,
						span: Math.min(bounds.width, bounds.height) / transformRef.current.zoom
					});
					if (!drawingRef.current) return;
					const point = strokePoint(event);
					if (point === void 0) return;
					setStrokes((current) => current.length === 0 ? current : [...current.slice(0, -1), {
						...current.at(-1),
						points: [...current.at(-1).points, point]
					}]);
				},
				onPointerUp: () => {
					drawingRef.current = false;
				},
				onPointerCancel: () => {
					drawingRef.current = false;
				},
				onPointerLeave: () => {
					setBrushCursor(void 0);
				}
			};
			const startMask = (action) => {
				resetGesture();
				setAnnotating(false);
				setStrokes([]);
				setSendFailed(false);
				setBrushCursor(void 0);
				setErasing(action);
			};
			const sendMask = async () => {
				const image = imageRef.current;
				if (!erasing || strokes.length === 0 || image === null || sending) return;
				setSending(true);
				const operation = ++maskOperation.current;
				setSendFailed(false);
				try {
					const canvas = document.createElement("canvas");
					canvas.width = item.width ?? image.naturalWidth;
					canvas.height = item.height ?? image.naturalHeight;
					paintEraseMask(canvas.getContext("2d"), strokes, canvas.width, canvas.height);
					const mask = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(/* @__PURE__ */ new Error("Mask")), "image/png"));
					await service.invoke(erasing, {
						mask,
						item,
						src: item.src,
						annotations: []
					}, request.revision);
					if (operation !== maskOperation.current) return;
					setErasing(void 0);
					setStrokes([]);
					if (erasing.closeOnSuccess) service.close();
				} catch {
					if (operation === maskOperation.current) setSendFailed(true);
				} finally {
					if (operation === maskOperation.current) setSending(false);
				}
			};
			const addAnnotation = (event) => {
				if (!annotating || event.target.closest(".dcsiv-annotation")) return;
				const bounds = surfaceRef.current?.getBoundingClientRect();
				if (bounds === void 0) return;
				const annotation = {
					id: crypto.randomUUID(),
					x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
					y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
					note: ""
				};
				setAnnotations((current) => [...current, annotation]);
				setAnnotating(false);
				setSelected(annotation.id);
				setFocusNote(annotation.id);
			};
			const copyNotes = async () => {
				const text = noteText(annotations, t);
				if (text === "" || typeof navigator?.clipboard?.writeText !== "function") return;
				try {
					await navigator.clipboard.writeText(text);
					setCopied(true);
					window.setTimeout(() => {
						setCopied(false);
					}, 1200);
				} catch {
					setCopied(false);
				}
			};
			if (request === void 0 || item === void 0) return null;
			const meta = [item.width && item.height ? `${item.width} × ${item.height}` : void 0, bytesLabel(item.bytes)].filter(Boolean).join(" · ");
			const showCounter = request.items.length > 1;
			const annotationPosition = (annotation) => {
				const ratio = globalThis.devicePixelRatio || 1;
				const align = (value) => Math.round(value * ratio) / ratio;
				return {
					left: align(geometry.stageWidth / 2 + transform.x + (annotation.x - .5) * geometry.width * transform.zoom - 12),
					top: align(geometry.stageHeight / 2 + transform.y + (annotation.y - .5) * geometry.height * transform.zoom - 12),
					visibility: geometry.width > 0 ? "visible" : "hidden"
				};
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "dcsiv-root",
				role: "dialog",
				"aria-modal": "true",
				"aria-label": t("imagePreview"),
				tabIndex: -1,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcsiv-title dcsiv-sr-only",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.name }), meta !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: meta }) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
						className: "dcsiv-topbar",
						role: "toolbar",
						"aria-label": t("imagePreview"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcsiv-actions",
							children: [
								request.annotations ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: annotating ? "dcsiv-button" : "dcsiv-button dcsiv-icon-button",
									"data-active": annotating,
									title: annotating ? t("imageAnnotateCancel") : t("imageAnnotate"),
									"aria-label": annotating ? t("imageAnnotateCancel") : t("imageAnnotate"),
									"aria-pressed": annotating,
									onClick: () => {
										resetGesture();
										setAnnotating((value) => !value);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolIcon, { id: "annotate" }), annotating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dcsiv-label",
										children: t("imageAnnotateCancel")
									}) : null]
								}) : null,
								annotations.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dcsiv-button",
									"data-active": selected !== void 0,
									onClick: () => {
										const first = annotations[0];
										setSelected((current) => current === void 0 ? first.id : void 0);
										if (selected === void 0) setFocusNote(first.id);
									},
									children: [
										annotations.length,
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dcsiv-label",
											children: t("imageRegions")
										})
									]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dcsiv-button dcsiv-zoom",
									title: transform.zoom === 1 ? t("imageActual") : t("imageFit"),
									"aria-label": transform.zoom === 1 ? t("imageActual") : t("imageFit"),
									onClick: () => {
										if (transform.zoom === 1) actual();
										else fit();
									},
									children: [Math.round(transform.zoom * pixelScale * 100), "%"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dcsiv-divider",
									"aria-hidden": "true"
								}),
								item.download === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: "dcsiv-download",
									"data-compact": "true",
									href: item.src,
									download: downloadName(item.name),
									title: t("imageDownload"),
									"aria-label": t("imageDownload"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconDownloadOutline16, {})
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewerDownload, {
									download: item.download,
									item,
									t
								}, item.id),
								item.actions.map((action) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewerAction, {
									action,
									annotations,
									item,
									service,
									revision: request.revision,
									t,
									onStartMask: startMask
								}, `${request.revision}:${index}:${action.id}`))
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dcsiv-close-floating",
						"aria-label": t("imageClosePreview"),
						onClick: () => service.close(),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCloseOutline16, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcsiv-workspace",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
								ref: stageRef,
								className: "dcsiv-stage",
								"data-dragging": dragging,
								"data-annotating": annotating || erasing !== void 0,
								onClick: (event) => {
									if (event.target === event.currentTarget && !annotating && !erasing && transform.zoom === 1) service.close();
								},
								...!annotating && !erasing ? pointerHandlers : {},
								onDoubleClick: () => {
									if (transform.zoom === 1) actual();
									else fit();
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										ref: surfaceRef,
										className: "dcsiv-surface",
										onClick: addAnnotation,
										style: { transform: `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.zoom})` },
										children: [
											imageSource.failed && !imageSource.usable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
												ref: imageRef,
												className: "dcsiv-image",
												src: imageSource.src,
												alt: item.name,
												draggable: "false",
												onError: imageSource.fail,
												onLoad: () => {
													imageSource.loaded();
													measure();
												}
											}, `${request.revision}:${item.id}:${imageSource.attempt}`),
											imageSource.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "dcsiv-button",
												onClick: imageSource.retry,
												children: t("imageLoadFailed")
											}) : null,
											erasing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
												ref: maskRef,
												className: "dcsiv-mask",
												width: imageRef.current?.naturalWidth || 1,
												height: imageRef.current?.naturalHeight || 1,
												"aria-label": t("imageEraseHint"),
												...maskHandlers
											}) : null
										]
									}),
									annotations.map((annotation, position) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dcsiv-annotation",
										"data-x": annotation.x < .38 ? "right" : annotation.x > .62 ? "left" : "center",
										"data-y": annotation.y < .28 ? "down" : "up",
										style: annotationPosition(annotation),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcsiv-pin",
											"data-active": selected === annotation.id,
											"aria-label": fill(t("imageAnnotation"), { value: position + 1 }),
											onClick: (event) => {
												event.stopPropagation();
												const opening = selected !== annotation.id;
												setSelected(opening ? annotation.id : void 0);
												if (opening) setFocusNote(annotation.id);
											},
											children: position + 1
										}), selected === annotation.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dcsiv-inline-note",
											"data-note-id": annotation.id,
											onClick: (event) => event.stopPropagation(),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dcsiv-inline-index",
													children: position + 1
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
													value: annotation.note,
													rows: 1,
													"aria-label": fill(t("imageAnnotation"), { value: position + 1 }),
													placeholder: t("imageAnnotationPlaceholder"),
													onChange: (event) => {
														const note = event.target.value;
														setAnnotations((current) => current.map((entry) => entry.id === annotation.id ? {
															...entry,
															note
														} : entry));
													},
													onKeyDown: (event) => {
														if (event.key === "Enter" && !event.shiftKey || event.key === "Escape") {
															event.preventDefault();
															event.stopPropagation();
															event.nativeEvent?.stopImmediatePropagation?.();
															setSelected(void 0);
														}
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "dcsiv-note-remove",
													"aria-label": t("imageRemoveAnnotation"),
													onClick: (event) => {
														event.stopPropagation();
														setAnnotations((current) => current.filter((entry) => entry.id !== annotation.id));
														setSelected(void 0);
													},
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCloseOutline16, {})
												})
											]
										}) : null]
									}, annotation.id)),
									showCounter ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcsiv-button dcsiv-icon-only dcsiv-nav dcsiv-prev",
											"aria-label": t("imagePrevious"),
											onClick: (event) => {
												event.stopPropagation();
												setIndex((value) => (value - 1 + request.items.length) % request.items.length);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronLeftOutline14, {})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcsiv-button dcsiv-icon-only dcsiv-nav dcsiv-next",
											"aria-label": t("imageNext"),
											onClick: (event) => {
												event.stopPropagation();
												setIndex((value) => (value + 1) % request.items.length);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronRightOutline14, {})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dcsiv-counter",
											children: [
												index + 1,
												" / ",
												request.items.length
											]
										})
									] }) : annotating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dcsiv-hint",
										children: t("imageAnnotateHint")
									}) : transform.zoom === 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dcsiv-hint",
										children: t("imageZoomHint")
									}) : null
								]
							}),
							erasing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dcsiv-erase-bar",
								role: "toolbar",
								"aria-label": t("imageErase"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageEraseHint") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("imageBrushSize"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "range",
										min: "0.01",
										max: "0.15",
										step: "0.01",
										value: brush,
										onChange: (event) => setBrush(Number(event.target.value))
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dcsiv-button",
										disabled: strokes.length === 0 || sending,
										onClick: () => setStrokes((current) => current.slice(0, -1)),
										children: t("imageUndo")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dcsiv-button",
										disabled: sending,
										onClick: () => {
											setErasing(void 0);
											setStrokes([]);
										},
										children: t("cancel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dcsiv-button dcsiv-primary",
										"data-state": sendFailed ? "failed" : void 0,
										disabled: strokes.length === 0 || sending,
										onClick: () => {
											sendMask();
										},
										children: sending ? t("imageEditPreparing") : sendFailed ? t("imageEditFailed") : t("imageSend")
									})
								]
							}) : null,
							erasing && brushCursor ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcsiv-brush-cursor",
								"aria-hidden": "true",
								style: {
									left: brushCursor.left,
									top: brushCursor.top,
									width: brush * brushCursor.span,
									height: brush * brushCursor.span
								}
							}) : null,
							annotations.some((annotation) => annotation.note.trim() !== "") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dcsiv-copy-notes",
								onClick: () => {
									copyNotes();
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCopyOutline16, {}), copied ? t("imageCopied") : t("imageCopyNotes")]
							}) : null
						]
					})
				]
			});
		}
		//#endregion
		exports.SUBSCRIPTION_IMAGE_VIEWER_CSS = SUBSCRIPTION_IMAGE_VIEWER_CSS;
		exports.SubscriptionImageViewerOverlay = SubscriptionImageViewerOverlay;
		return module.exports;
	}
});

//# sourceMappingURL=client.image-viewer.js.map
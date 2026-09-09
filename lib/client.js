window.__ModuleLoader__.load({
	id: "dsh-codex-subscription",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
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
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/image-edit.js
		const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
		const validCoordinate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
		const cleanNote = (value) => typeof value === "string" ? value.trim() : "";
		const coordinateError = (number) => {
			const error = /* @__PURE__ */ new Error(`Annotation ${number} must have finite x and y coordinates between 0 and 1`);
			error.code = "ANNOTATION_INVALID";
			return error;
		};
		/**
		* Validate the annotation contract shared by the draft builder and the
		* reference-image renderer. Annotation numbers are their array positions so
		* that they stay aligned with the pins shown to the user.
		*/
		function normalizeImageEditAnnotations(annotations, { requireNotes = false } = {}) {
			if (!Array.isArray(annotations)) throw new TypeError("annotations must be an array");
			return annotations.map((annotation, index) => {
				const number = index + 1;
				const note = cleanNote(annotation?.note);
				if (requireNotes && note === "") {
					const error = /* @__PURE__ */ new Error(`Annotation ${number} is missing a note; describe what should change`);
					error.code = "ANNOTATION_INVALID";
					throw error;
				}
				if (!isRecord(annotation) || !validCoordinate(annotation.x) || !validCoordinate(annotation.y)) throw coordinateError(number);
				return {
					number,
					x: annotation.x,
					y: annotation.y,
					note
				};
			});
		}
		const formatPercent = (value) => {
			return `${Number((value * 100).toFixed(2))}%`;
		};
		const formatPixel = (value) => {
			const rounded = Number(value.toFixed(2));
			return String(rounded);
		};
		const withNames = (value, sourceName, referenceName) => String(value).replaceAll("{sourceName}", sourceName).replaceAll("{referenceName}", referenceName);
		const positiveImageDimension = (value) => Number.isSafeInteger(value) && value > 0;
		function buildImageEditDraft({ prompt = "", annotations = [], translate, width, height, sourceName = "source.png", referenceName = "annotated-reference.png" }) {
			if (typeof translate !== "function") throw new TypeError("translate must be a function");
			const base = typeof prompt === "string" && prompt.trim() !== "" ? prompt.trim() : translate("imageEditDefault");
			if (!Array.isArray(annotations)) throw new TypeError("annotations must be an array");
			if (annotations.length === 0) return base;
			const hasWidth = width !== void 0;
			if (hasWidth !== (height !== void 0) || hasWidth && (!positiveImageDimension(width) || !positiveImageDimension(height))) throw new Error("width and height must be positive integers when provided");
			const normalized = normalizeImageEditAnnotations(annotations, { requireNotes: true });
			const source = typeof sourceName === "string" && sourceName.trim() !== "" ? sourceName.trim() : "source.png";
			const reference = typeof referenceName === "string" && referenceName.trim() !== "" ? referenceName.trim() : "annotated-reference.png";
			const guide = withNames(translate("imageEditReferenceGuide"), source, reference);
			const location = translate("imageEditLocation");
			const notes = normalized.map(({ number, x, y, note }) => {
				const pixels = hasWidth ? ` (pixel x=${formatPixel(x * Math.max(0, width - 1))} of ${width}, y=${formatPixel(y * Math.max(0, height - 1))} of ${height})` : "";
				return `${number}. ${location}: x=${formatPercent(x)} (normalized ${x}), y=${formatPercent(y)} (normalized ${y})${pixels}; ${note}`;
			});
			return [
				base,
				"",
				guide,
				"",
				translate("imageRegionNotes"),
				...notes
			].join("\n");
		}
		const ORIGINAL_IMAGE_ID_PATTERN = /^img_[0-9a-f]{32}$/u;
		const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
		function decodeOriginalImageRef(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.assetId !== "string" || !ORIGINAL_IMAGE_ID_PATTERN.test(value.assetId) || value.mediaType !== "image/png" || !positiveInteger(value.bytes) || value.bytes > 48 * 1024 * 1024 || !positiveInteger(value.width) || !positiveInteger(value.height) || typeof value.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.name) || typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.sha256)) return void 0;
			return {
				assetId: value.assetId,
				mediaType: value.mediaType,
				bytes: value.bytes,
				width: value.width,
				height: value.height,
				name: value.name,
				sha256: value.sha256
			};
		}
		function decodeImagePresentation(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value) || value.kind !== "codex-subscription-image" || value.schemaVersion !== 1) return void 0;
			const original = decodeOriginalImageRef(value.original);
			return original === void 0 ? void 0 : { original };
		}
		function originalImageRefsEqual(left, right) {
			const a = decodeOriginalImageRef(left);
			const b = decodeOriginalImageRef(right);
			return a !== void 0 && b !== void 0 && a.assetId === b.assetId && a.mediaType === b.mediaType && a.bytes === b.bytes && a.width === b.width && a.height === b.height && a.name === b.name && a.sha256 === b.sha256;
		}
		//#endregion
		//#region src/rpc-contract.js
		const CHANNEL = "/codex-subscription";
		const RPC_ENDPOINTS = Object.freeze([
			"status",
			"login/start",
			"login/status",
			"login/submit",
			"login/cancel",
			"logout",
			"account/select",
			"account/remove",
			"usage",
			"diagnostics",
			"preferences/status",
			"preferences/models",
			"preferences/update",
			"reset-credit/inspect",
			"reset-credit/prepare",
			"reset-credit/consume",
			"image/gallery",
			"image/original/chunk"
		]);
		function createSubscriptionRpcClient(transport) {
			return Object.freeze({ call(channel, endpoint, payload, signal) {
				if (channel !== "/codex-subscription" || !RPC_ENDPOINTS.includes(endpoint)) throw new Error("Invalid subscription RPC target");
				return transport.call("/api", `codex-subscription/${endpoint}`, payload, signal);
			} });
		}
		function unwrap(response) {
			if (!response?.ok) throw new Error(response?.error?.message ?? "Codex RPC failed");
			return response.value;
		}
		//#endregion
		//#region src/original-image-download.js
		function decodeBase64Chunk(value) {
			if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(4194304 / 3) * 4 + 8) throw new Error("Invalid original image chunk");
			let decoded;
			try {
				decoded = atob(value);
			} catch {
				throw new Error("Invalid original image chunk");
			}
			const bytes = new Uint8Array(decoded.length);
			for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
			return bytes;
		}
		/** Keep only the destination and current chunk, while verifying every reply. */
		async function readOriginalImage(rpc, sessionId, original, { signal, onProgress } = {}) {
			signal?.throwIfAborted();
			original = decodeOriginalImageRef(original);
			if (original === void 0) throw new Error("Invalid original image reference");
			const data = new Uint8Array(original.bytes);
			let total = 0;
			let done = false;
			while (!done) {
				signal?.throwIfAborted();
				const response = await rpc.call(CHANNEL, "image/original/chunk", {
					sessionId,
					assetId: original.assetId,
					offset: total
				}, signal);
				signal?.throwIfAborted();
				if (!response?.ok) throw new Error(response?.error?.message ?? "Codex RPC failed");
				const chunk = response.value;
				if (!originalImageRefsEqual(chunk?.ref, original) || chunk.offset !== total || typeof chunk.done !== "boolean") throw new Error("Original image metadata changed");
				const bytes = decodeBase64Chunk(chunk.encoded);
				if (bytes.byteLength === 0 || total + bytes.byteLength > original.bytes) throw new Error("Original image download is incomplete");
				data.set(bytes, total);
				total += bytes.byteLength;
				done = chunk.done;
				onProgress?.({
					loaded: total,
					total: original.bytes
				});
			}
			if (total !== original.bytes) throw new Error("Original image download is incomplete");
			const digest = await crypto.subtle.digest("SHA-256", data);
			signal?.throwIfAborted();
			if ([...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") !== original.sha256) throw new Error("Original image integrity check failed");
			return data;
		}
		//#endregion
		//#region src/client-images.jsx
		const imageDownloadName = (attachment) => {
			const fallback = "codex-generated-image.png";
			if (typeof attachment?.name !== "string") return fallback;
			const cleaned = attachment.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/[. ]+$/u, "").trim();
			if (cleaned === "") return fallback;
			return cleaned.toLowerCase().endsWith(".png") ? cleaned : `${cleaned}.png`;
		};
		function triggerBlobDownload(data, mediaType, filename) {
			const url = URL.createObjectURL(new Blob([data], { type: mediaType }));
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.rel = "noopener";
			document.body.append(anchor);
			try {
				anchor.click();
			} finally {
				anchor.remove();
				URL.revokeObjectURL(url);
			}
		}
		function CodexGeneratedImage({ attachment, original, rpc, sessionId, loadImage, attachForEdit, getImageViewer, getInternalImageViewer, t, features }) {
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [error, setError] = (0, react.useState)(false);
			const [src, setSrc] = (0, react.useState)();
			const triggerRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				let live = true;
				setError(false);
				setSrc(void 0);
				Promise.resolve().then(() => loadImage(attachment)).then((value) => {
					if (live) setSrc(value);
				}).catch(() => {
					if (live) setError(true);
				});
				return () => {
					live = false;
				};
			}, [
				attachment,
				loadImage,
				attempt
			]);
			const label = attachment.name ?? t("imageLabel");
			const downloadName = imageDownloadName(attachment);
			const downloadOriginal = async ({ signal, onProgress } = {}) => {
				if (original === void 0) return;
				triggerBlobDownload(await readOriginalImage(rpc, sessionId, original, {
					signal,
					onProgress
				}), original.mediaType, original.name);
			};
			const openImage = () => {
				if (src === void 0) return;
				const request = {
					items: [{
						id: attachment.attachmentId ?? downloadName,
						src,
						name: label,
						width: attachment.width,
						height: attachment.height,
						bytes: attachment.bytes,
						download: original === void 0 ? void 0 : {
							pendingLabel: t("imageDownloadPreparing"),
							errorLabel: t("imageDownloadFailed"),
							onInvoke: downloadOriginal
						},
						actions: !features.imageEditing ? [] : [{
							id: "continue-editing",
							label: t("imageEdit"),
							pendingLabel: t("imageEditPreparing"),
							errorLabel: t("imageEditFailed"),
							closeOnSuccess: true,
							onInvoke: ({ annotations = [] }) => {
								const imageKey = String(attachment.attachmentId ?? "image").replace(/[^a-zA-Z0-9_-]/g, "_");
								const sourceName = annotations.length === 0 ? downloadName : `codex-edit-${imageKey}-source.png`;
								const referenceName = `codex-edit-${imageKey}-annotations.png`;
								return attachForEdit(src, sourceName, buildImageEditDraft({
									annotations,
									translate: t,
									width: attachment.width,
									height: attachment.height,
									sourceName,
									referenceName
								}), annotations, referenceName);
							}
						}]
					}],
					opener: triggerRef.current,
					source: "codex-generated",
					annotations: features.imageViewer && features.imageAnnotations
				};
				if (features.imageViewer && getInternalImageViewer?.()?.open?.(request) === true) return;
				if ((getImageViewer?.())?.open?.(request) === true) return;
				getInternalImageViewer?.()?.open?.({
					...request,
					annotations: false
				});
			};
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "codexGeneratedImageRetry",
				onClick: () => setAttempt((value) => value + 1),
				children: t("imageLoadFailed")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				ref: triggerRef,
				type: "button",
				className: "codexGeneratedImageFrame",
				title: t("imageOpen"),
				"aria-label": t("imageOpenNamed").replace("{value}", String(label)),
				onClick: openImage,
				children: src === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageLoading") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: label
				})
			});
		}
		function CodexImageToolRow({ block, sessionId, rpc, loadImage, attachForEdit, getImageViewer, getInternalImageViewer, t, preference }) {
			const features = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const settled = block?.kind === "tool-result";
			const image = settled ? block.content.find((item) => item?.type === "image" && item.attachment !== void 0) : void 0;
			const failed = settled && block.isError === true;
			const state = !settled ? "running" : failed ? "error" : "done";
			const status = !settled ? t("imageGenerating") : failed ? t("imageFailed") : t("imageGenerated");
			const error = failed ? block.content.find((item) => item?.type === "text" && typeof item.text === "string")?.text : void 0;
			const original = decodeImagePresentation(block?.meta)?.original;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexImageTool",
				"data-state": state,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexImageToolRow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolIcon",
								"aria-hidden": "true"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolTitle",
								children: t("imageGenerate")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageBeta",
								children: t("imageBeta")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolState",
								children: status
							})
						]
					}),
					image === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexImageToolGallery",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexGeneratedImage, {
							features,
							attachment: image.attachment,
							original,
							rpc,
							sessionId,
							loadImage,
							attachForEdit,
							getImageViewer,
							getInternalImageViewer,
							t
						})
					}),
					typeof block?.meta?.requestedModel === "string" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "codexImageDetails",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("imageDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							t("imageRequestedModel"),
							": ",
							block.meta.requestedModel.slice(0, 100),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							t("imageReportedModel"),
							": ",
							typeof block.meta.reportedModel === "string" ? block.meta.reportedModel.slice(0, 100) : t("imageModelUnreported"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							t("imageRequestedSize"),
							": ",
							String(block.meta.requestedSize ?? "auto").slice(0, 40),
							" · ",
							t("imageActualSize"),
							": ",
							original?.width,
							" × ",
							original?.height
						] })]
					}) : null,
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexImageToolError",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region src/sketch-document.js
		const SKETCH_SIZE = 1024;
		function sketchPoint(clientX, clientY, rect) {
			if (!(rect.width > 0 && rect.height > 0)) return void 0;
			return {
				x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
				y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
			};
		}
		function paintSketch(context, strokes, size = SKETCH_SIZE) {
			context.fillStyle = "#ffffff";
			context.fillRect(0, 0, size, size);
			context.lineCap = "round";
			context.lineJoin = "round";
			for (const stroke of strokes) {
				const first = stroke.points[0];
				if (!first) continue;
				context.strokeStyle = stroke.color;
				context.fillStyle = stroke.color;
				context.lineWidth = stroke.width;
				context.beginPath();
				const last = stroke.points.at(-1);
				if (stroke.shape === "rectangle") {
					context.rect(first.x * size, first.y * size, (last.x - first.x) * size, (last.y - first.y) * size);
					context.stroke();
				} else if (stroke.shape === "circle") {
					context.ellipse((first.x + last.x) * size / 2, (first.y + last.y) * size / 2, Math.abs(last.x - first.x) * size / 2, Math.abs(last.y - first.y) * size / 2, 0, 0, Math.PI * 2);
					context.stroke();
				} else if (stroke.points.length === 1) {
					context.arc(first.x * size, first.y * size, stroke.width / 2, 0, Math.PI * 2);
					context.fill();
				} else {
					context.moveTo(first.x * size, first.y * size);
					for (const point of stroke.points.slice(1)) context.lineTo(point.x * size, point.y * size);
					context.stroke();
				}
			}
		}
		//#endregion
		//#region src/workspace-icons.jsx
		function WorkspaceIcon({ name, size = 24 }) {
			const paths = {
				close: "M6 6l12 12M18 6L6 18",
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
		//#region src/sketch-styles.js
		const SKETCH_CSS = `
.codexWorkspaceLaunch{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:5px 9px;border-radius:9px;transition:background .15s}
.codexWorkspaceLaunch:hover{background:#8882}
.codexSketchDialog{box-sizing:border-box;width:min(760px,94vw);max-height:92dvh;overflow:auto;border:1px solid #8882;border-radius:28px;padding:24px;background:var(--dsw-alias-background-surface,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 24px 100px #0002}
.codexSketchDialog::backdrop{background:#e8e9ecb8;backdrop-filter:blur(7px)}
.codexSketchDialog h2{font-size:20px;font-weight:600;margin:0 0 14px}
.codexSketchDialog button,.codexSketchDialog select{font:inherit;padding:8px 12px;border:1px solid #8883;border-radius:12px;color:inherit;background:transparent;cursor:pointer}
.codexSketchDialog button:disabled{opacity:.35;cursor:default}
.codexSketchDialog button:focus-visible,.codexSketchCustom:focus-within{outline:3px solid #007aff;outline-offset:4px}
.codexSketchDialog footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
.codexSketchDialog p{font-size:13px;line-height:1.6}
.codexTemplateForm{display:grid;gap:16px}
.codexTemplateForm textarea{min-height:180px;padding:16px;font:inherit;color:inherit;background:transparent;border:1px solid #8884;border-radius:16px;resize:vertical}
.codexTemplateForm textarea:focus{outline:2px solid #007aff;outline-offset:2px;border-color:transparent}
.codexImageDefaults{width:fit-content;margin:0;padding:5px 10px;border:1px solid #8882;border-radius:999px;color:var(--dsw-alias-label-secondary,#73737b)}
.codexSketchDialog footer button:last-child{background:#007aff;color:white;border-color:transparent}
.codexSketchStudio{width:min(720px,94vw,calc(92dvh - 190px));padding:24px 28px 12px;border:0;border-radius:40px;background:#fff;color:#171719;overflow:hidden}
.codexSketchTop{display:flex;align-items:center;justify-content:space-between;gap:10px}
.codexSketchStudio button{display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;color:#171719;flex-shrink:0}
.codexSketchStudio .codexSketchRound{width:48px;height:48px;border:1px solid #ededee;border-radius:50%;background:#fff;box-shadow:0 2px 7px #00000008}
.codexSketchPill{display:flex;align-items:center;padding:5px;gap:2px;border-radius:34px;border:1px solid #ededee;box-shadow:0 3px 12px #0000000c;background:white}
.codexSketchPill button{height:44px;width:44px;border-radius:50%}
.codexSketchPill button[aria-pressed=true]{background:#f0f0f2}
.codexSketchPill button:hover,.codexSketchRound:not(:disabled):hover{background:#f5f5f7}
.codexSketchHistory{display:flex;gap:7px}
.codexSketchHistory .codexSketchRound{width:38px;height:38px;box-shadow:none;border:0}
.codexSketchBrush{height:28px;margin:12px 0 0;display:flex;justify-content:center;align-items:center;gap:12px;color:#8b8b90}
.codexSketchBrush>span{border-radius:50%;max-width:24px;max-height:24px;min-width:4px;flex-shrink:0}
.codexSketchBrush input{width:96px;height:3px;accent-color:#171719}
.codexSketchBrush button{width:28px;height:28px;margin-left:8px;color:#8b8b90}
.codexSketchStudio canvas{display:block;width:100%;height:auto;aspect-ratio:1;background:#fff;touch-action:none;cursor:crosshair}
.codexSketchBottom{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:8px 0}
.codexSketchPalette{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:1;max-width:470px}
.codexSketchStudio .codexSketchSwatch{width:28px;height:28px;border-radius:50%;background:var(--swatch);outline-offset:3px}
.codexSketchSwatch[aria-pressed=true]{outline:3px solid #0088ff}
.codexSketchCustom{position:relative;display:grid;place-items:center;flex-shrink:0;width:34px;height:34px;border-radius:50%;background:conic-gradient(#ff3936,#ffcc00,#34c759,#0088ff,#a855f7,#ff3936);cursor:pointer}
.codexSketchCustom span{width:22px;height:22px;border:3px solid white;border-radius:50%}
.codexSketchCustom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.codexSketchRound,.codexSketchSwatch,.codexSketchConfirm,.codexSketchCustom,.codexSketchCustom span,.codexSketchPill button{corner-shape:round}
.codexSketchStudio .codexSketchConfirm{width:56px;height:56px;border-radius:50%;background:#007aff;color:white;box-shadow:0 3px 9px #007aff20}
.codexSketchStudio .codexSketchConfirm:not(:disabled):hover{background:#0065d5}
.codexSketchStudio .codexSketchHint{font-size:11px;color:#929398;text-align:center;margin:6px 0 0}
@media(max-width:520px){.codexSketchStudio{width:calc(100vw - 24px);padding:18px 18px 12px;border-radius:30px}.codexSketchPalette{gap:9px}.codexSketchStudio .codexSketchSwatch{width:23px;height:23px}.codexSketchStudio .codexSketchConfirm{width:46px;height:46px}.codexSketchPill button{width:35px;height:35px}.codexSketchHistory{gap:0}.codexSketchHistory .codexSketchRound{width:30px;height:32px}.codexSketchTop>.codexSketchRound{width:40px;height:40px}.codexSketchBottom{gap:12px}}
`;
		//#endregion
		//#region src/sketch-workspace.jsx
		const PALETTE = [
			"#18181b",
			"#929398",
			"#ff3936",
			"#ff9500",
			"#ffcc00",
			"#34c759",
			"#0088ff"
		];
		function SketchWorkspace({ preference, attachSketch, appendPrompt, registerOpen, t }) {
			const settings = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const [mode, setMode] = (0, react.useState)(null);
			const dialog = (0, react.useRef)(null);
			const canvas = (0, react.useRef)(null);
			const strokes = (0, react.useRef)([]);
			const redo = (0, react.useRef)([]);
			const active = (0, react.useRef)(null);
			const [revision, redraw] = (0, react.useState)(0);
			const [color, setColor] = (0, react.useState)("#2563eb");
			const [width, setWidth] = (0, react.useState)(12);
			const [tool, setTool] = (0, react.useState)("pen");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [brief, setBrief] = (0, react.useState)("");
			const [template, setTemplate] = (0, react.useState)("templatePoster");
			const opener = (0, react.useRef)(null);
			(0, react.useEffect)(() => registerOpen((nextMode = "sketch") => {
				opener.current = document.activeElement;
				setError("");
				setMode(nextMode);
			}), [registerOpen]);
			const allowed = mode === "sketch" ? settings.imageSketch && settings.imageEditing : mode === "image" ? settings.imageShortcut && (settings.imageGeneration || settings.imageEditing) : settings.imageTemplates && settings.imageGeneration;
			const title = t(mode === "sketch" ? "sketchTitle" : mode === "image" ? "imageCreateTitle" : "imageTemplate");
			(0, react.useEffect)(() => {
				if (mode && dialog.current && !dialog.current.open) dialog.current.showModal();
			}, [mode]);
			(0, react.useEffect)(() => {
				if (mode === "sketch" && canvas.current) paintSketch(canvas.current.getContext("2d"), strokes.current);
			}, [mode, revision]);
			const close = () => {
				if (busy) return;
				active.current = null;
				dialog.current?.close();
				setMode(null);
				opener.current?.focus();
			};
			const open = (event, value) => {
				opener.current = event.currentTarget;
				setError("");
				setMode(value);
			};
			const point = (event) => sketchPoint(event.clientX, event.clientY, canvas.current.getBoundingClientRect());
			const end = (event) => {
				if (active.current !== event.pointerId) return;
				active.current = null;
				if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
			};
			const confirm = async () => {
				if (busy || !allowed) return;
				setBusy(true);
				setError("");
				try {
					if (mode === "sketch") await attachSketch(await new Promise((resolve, reject) => canvas.current.toBlob((value) => value ? resolve(value) : reject(/* @__PURE__ */ new Error("PNG export failed")), "image/png")));
					else await appendPrompt(`${t(mode === "image" ? "imageCreatePrompt" : `${template}Prompt`)}\n\n${brief.trim()}`, mode);
					dialog.current.close();
					setMode(null);
					opener.current?.focus();
				} catch {
					setError(t(mode === "sketch" ? "sketchFailed" : "imageDraftFailed"));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				settings.imageSketch && settings.imageEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "codexWorkspaceLaunch",
					onClick: (event) => open(event, "sketch"),
					children: t("sketch")
				}) : null,
				settings.imageTemplates && settings.imageGeneration ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "codexWorkspaceLaunch",
					onClick: (event) => open(event, "template"),
					children: t("imageTemplate")
				}) : null,
				mode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
					ref: dialog,
					className: `codexSketchDialog ${mode === "sketch" ? "codexSketchStudio" : ""}`,
					"aria-label": title,
					onCancel: (event) => {
						event.preventDefault();
						close();
					},
					children: [
						mode !== "sketch" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: title }) : null,
						mode === "sketch" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: "codexSketchTop",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "codexSketchRound",
										"aria-label": t("sketchCancel"),
										title: t("sketchCancel"),
										disabled: busy,
										onClick: close,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, { name: "close" })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "codexSketchPill",
										role: "toolbar",
										"aria-label": t("sketchTitle"),
										children: [
											"pen",
											"rectangle",
											"circle",
											"eraser"
										].map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											title: t(`sketchTool_${name}`),
											"aria-label": t(`sketchTool_${name}`),
											"aria-pressed": tool === name,
											disabled: busy,
											onClick: () => setTool(name),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, { name })
										}, name))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "codexSketchHistory",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "codexSketchRound",
											title: t("sketchUndo"),
											"aria-label": t("sketchUndo"),
											disabled: busy || !strokes.current.length,
											onClick: () => {
												redo.current.push(strokes.current.pop());
												redraw(revision + 1);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, { name: "undo" })
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "codexSketchRound",
											title: t("sketchRedo"),
											"aria-label": t("sketchRedo"),
											disabled: busy || !redo.current.length,
											onClick: () => {
												strokes.current.push(redo.current.pop());
												redraw(revision + 1);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, { name: "redo" })
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSketchBrush",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
										width: Math.max(4, width / 2),
										height: Math.max(4, width / 2),
										background: tool === "eraser" ? "#929398" : color
									} }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										"aria-label": t("sketchWidth"),
										type: "range",
										min: "2",
										max: "64",
										value: width,
										disabled: busy,
										onChange: (event) => setWidth(Number(event.target.value))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										"aria-label": t("sketchClear"),
										title: t("sketchClear"),
										disabled: busy || !strokes.current.length,
										onClick: () => {
											strokes.current = [];
											redo.current = [];
											redraw(revision + 1);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
											name: "clear",
											size: 19
										})
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
								ref: canvas,
								width: SKETCH_SIZE,
								height: SKETCH_SIZE,
								"aria-label": t("sketchTitle"),
								onPointerDown: (event) => {
									if (busy || event.button !== 0 || active.current !== null || strokes.current.length >= 200) return;
									const start = point(event);
									if (!start) return;
									active.current = event.pointerId;
									canvas.current.setPointerCapture(event.pointerId);
									redo.current = [];
									strokes.current.push({
										color: tool === "eraser" ? "#ffffff" : color,
										shape: tool,
										width,
										points: [start]
									});
									redraw((value) => value + 1);
								},
								onPointerMove: (event) => {
									if (active.current !== event.pointerId || busy) return;
									const stroke = strokes.current.at(-1);
									if (stroke.points.length >= 2e3) return;
									const next = point(event);
									if (next) {
										if (["rectangle", "circle"].includes(stroke.shape)) stroke.points = [stroke.points[0], next];
										else stroke.points.push(next);
										redraw((value) => value + 1);
									}
								},
								onPointerUp: end,
								onPointerCancel: end
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSketchBottom",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSketchPalette",
									role: "group",
									"aria-label": t("sketchColor"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "codexSketchCustom",
										title: t("sketchColor"),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { background: color } }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											"aria-label": t("sketchColor"),
											type: "color",
											value: color,
											disabled: busy,
											onChange: (event) => setColor(event.target.value)
										})]
									}), PALETTE.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "codexSketchSwatch",
										style: { "--swatch": value },
										"aria-label": `${t("sketchColor")} ${value}`,
										"aria-pressed": color === value,
										disabled: busy,
										onClick: () => setColor(value)
									}, value))]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "codexSketchConfirm",
									title: t("sketchAttach"),
									"aria-label": t("sketchAttach"),
									disabled: busy || !allowed || !strokes.current.length,
									onClick: () => {
										confirm();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
										name: "check",
										size: 30
									})
								})]
							})
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexTemplateForm",
							children: [mode === "template" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								"aria-label": t("imageTemplate"),
								value: template,
								onChange: (event) => setTemplate(event.target.value),
								children: [
									"templatePoster",
									"templateProduct",
									"templateIcon"
								].map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: key,
									children: t(key)
								}, key))
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "codexImageDefaults",
								children: [
									settings.imageModel,
									" · ",
									settings.imageQuality
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": t("templatePrompt"),
								value: brief,
								onChange: (event) => setBrief(event.target.value),
								placeholder: t("templatePrompt")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSketchHint",
							children: error || t(mode === "sketch" ? "sketchHint" : "imageDraftHint")
						}),
						mode !== "sketch" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy,
							onClick: close,
							children: t("sketchCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy || !allowed || !brief.trim(),
							onClick: () => {
								confirm();
							},
							children: t("templateAdd")
						})] }) : null
					]
				}) : null
			] });
		}
		//#endregion
		//#region src/image-composer.js
		function attachImageFiles(conversation, input, files) {
			const created = conversation.createDraftImages(files);
			try {
				if (!input.addImages(created.map((item) => item.id))) throw new Error("The composer is busy");
			} catch (error) {
				conversation.releaseDraftImages(created);
				throw error;
			}
			return created;
		}
		function appendImagePrompt(input, text) {
			const current = input.state.getSnapshot();
			if (current.phase !== "plain") throw new Error("The composer is busy");
			if (current.occurrences?.length) throw new Error("Keep existing references; add image instructions in the composer");
			input.setDraft([current.draft, text].filter(Boolean).join("\n\n"));
		}
		//#endregion
		//#region src/sketch-trigger.js
		function createWorkspaceTrigger({ enabled, open, consume, name, aliases, description }) {
			return {
				trigger: "@",
				name,
				showGroupTitle: false,
				order: -10,
				candidates: async (session, request) => enabled() && !request.quoted && aliases.some((alias) => alias.startsWith(request.query.toLowerCase())) ? [{
					name,
					description,
					value: aliases[0]
				}] : [],
				onPick: ({ session, span }) => {
					if (!enabled() || !consume(session.sessionId, span)) return void 0;
					open(session.sessionId);
					return "handled";
				}
			};
		}
		const createSketchTrigger = (options) => createWorkspaceTrigger({
			...options,
			name: "Sketch",
			aliases: ["sketch", "草图"],
			description: "Draw a reference image"
		});
		const createImageTrigger = (options) => createWorkspaceTrigger({
			...options,
			name: "Image · 生图",
			aliases: ["image", "生图"],
			description: "Describe an image to generate or edit"
		});
		//#endregion
		//#region src/image-library.jsx
		function LibraryImage({ item, loadImage, selected, onSelect }) {
			const node = (0, react.useRef)(null);
			const [src, setSrc] = (0, react.useState)();
			const [failed, setFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let live = true;
				const observer = new IntersectionObserver((entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					observer.disconnect();
					loadImage(item.attachment).then((value) => {
						if (live) setSrc(value);
					}, () => {
						if (live) setFailed(true);
					});
				});
				observer.observe(node.current);
				return () => {
					live = false;
					observer.disconnect();
				};
			}, [item, loadImage]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: node,
				type: "button",
				className: "codexLibraryItem",
				"aria-pressed": selected,
				onClick: onSelect,
				"aria-label": item.attachment.name,
				children: [src ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: item.attachment.name
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: failed ? "⚠" : "…" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
					item.original.width,
					" × ",
					item.original.height,
					selected ? " ✓" : ""
				] })]
			});
		}
		function ImageLibrary({ preference, loadGallery, loadImage, attachSelected, t }) {
			const features = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [items, setItems] = (0, react.useState)([]);
			const [selected, setSelected] = (0, react.useState)([]);
			const [compare, setCompare] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(false);
			const [attempt, setAttempt] = (0, react.useState)(0);
			const dialog = (0, react.useRef)(null);
			const opener = (0, react.useRef)(null);
			const operation = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => operation.current?.abort(), []);
			(0, react.useEffect)(() => {
				if (!open) return;
				if (!dialog.current.open) dialog.current.showModal();
				let live = true;
				setBusy(true);
				setError(false);
				loadGallery().then((value) => {
					if (live) {
						setItems(value);
						setSelected([]);
						setCompare(false);
					}
				}, () => {
					if (live) setError(true);
				}).finally(() => {
					if (live) setBusy(false);
				});
				return () => {
					live = false;
				};
			}, [
				open,
				loadGallery,
				attempt
			]);
			const close = () => {
				operation.current?.abort();
				dialog.current?.close();
				setOpen(false);
				opener.current?.focus();
			};
			const attach = async () => {
				setBusy(true);
				setError(false);
				const controller = new AbortController();
				operation.current = controller;
				try {
					await attachSelected(selected.map((id) => items.find((item) => item.attachment.attachmentId === id)), controller.signal);
					if (!controller.signal.aborted) {
						dialog.current.close();
						setOpen(false);
						opener.current?.focus();
					}
				} catch {
					if (!controller.signal.aborted) setError(true);
				} finally {
					if (operation.current === controller) {
						operation.current = null;
						setBusy(false);
					}
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [features.imageGallery ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "codexWorkspaceLaunch",
				onClick: (event) => {
					opener.current = event.currentTarget;
					setOpen(true);
				},
				children: t("imageGallery")
			}) : null, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: "codexSketchDialog",
				"aria-label": t("imageGallery"),
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("imageGallery") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("imageGalleryHint") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: compare && features.imageCompare ? "codexLibraryGrid codexLibraryCompare" : "codexLibraryGrid",
						children: items.filter((item) => !compare || !features.imageCompare || selected.includes(item.attachment.attachmentId)).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LibraryImage, {
							item,
							loadImage,
							selected: selected.includes(item.attachment.attachmentId),
							onSelect: () => {
								if (busy || compare) return;
								const id = item.attachment.attachmentId;
								setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 5 ? [...current, id] : current);
							}
						}, item.attachment.attachmentId))
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: [
							t("imageGalleryFailed"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy,
								onClick: () => setAttempt((value) => value + 1),
								children: t("preferenceRetry")
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: close,
							children: t("sketchCancel")
						}),
						features.imageCompare ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: selected.length !== 2 || busy,
							"aria-pressed": compare,
							onClick: () => setCompare(!compare),
							children: t("imageCompareAction")
						}) : null,
						features.imageEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							disabled: busy || !selected.length || !features.imageGallery,
							onClick: () => {
								attach();
							},
							children: [
								t("imageSelectedEdit"),
								" (",
								selected.length,
								")"
							]
						}) : null
					] })
				]
			}) : null] });
		}
		const LIBRARY_CSS = `.codexLibraryGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-height:55vh;overflow:auto;margin:12px 0}.codexLibraryItem{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100px;overflow:hidden}.codexLibraryItem[aria-pressed=true]{outline:2px solid #2563eb}.codexLibraryItem img{width:100%;height:150px;object-fit:contain}.codexLibraryCompare{grid-template-columns:repeat(2,minmax(0,1fr))}.codexLibraryCompare img{height:auto;max-height:50vh}.codexLibraryItem small{padding:4px}@media(max-width:500px){.codexLibraryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
		//#endregion
		//#region src/client-locales.js
		const zh = {
			imageShortcut: "@生图快捷入口",
			imageCreateTitle: "描述你想要的图片",
			imageDraftHint: "填入草稿后由你发送。参考图可先附在输入框，不会自动生成或改写已有说明。",
			imageDraftFailed: "无法填入草稿。请保留说明，检查输入框是否正在发送或含有引用。",
			imageCreatePrompt: "请使用订阅图片工具按以下要求制作图片；如附有参考图，请基于所附图片编辑：",
			templatePosterPrompt: "请按以下要求设计海报。建立清晰的主标题、主体和辅助信息层级；只使用我提供的文字，不编造日期、价格或联系方式。",
			templateProductPrompt: "请按以下要求制作商品展示图。有参考图时保留商品的外形、材质、标识和比例；突出商品，不添加未经提供的卖点或认证。",
			templateIconPrompt: "请按以下要求设计图标。构图简洁，轮廓清晰，缩小后仍易辨认；保持留白，不添加未要求的文字。",
			imageDetails: "图片信息",
			imageRequestedModel: "请求模型",
			imageReportedModel: "服务端报告模型",
			imageModelUnreported: "未报告",
			imageRequestedSize: "请求尺寸",
			imageActualSize: "实际尺寸",
			imageModel: "生图模型",
			imageQuality: "默认质量",
			imageExperimental: "实验",
			imageModelHint: "2.5 型号为实验选项，可用性以你的订阅账号为准。失败会直接提示，不会自动切换型号。",
			sketchTool_pen: "画笔",
			sketchTool_rectangle: "矩形",
			sketchTool_circle: "椭圆",
			sketchTool_eraser: "橡皮",
			imageGallery: "会话图片库",
			imageCompare: "图片对比",
			imageGalleryHint: "当前会话最近 100 张生成图片。选择最多 5 张作为一次编辑的参考；对比请选择两张。",
			imageCompareAction: "并排对比",
			imageSelectedEdit: "附加所选图片",
			imageGalleryFailed: "无法加载或附加图片，请重试。",
			imageSettings: "图片工作台",
			imageGeneration: "生成新图片",
			imageEditing: "参考图编辑",
			imageViewer: "增强图片查看器",
			imageAnnotations: "图片标注",
			imageSketch: "草图画板",
			imageTemplates: "创作模板",
			imageSettingsHint: "关闭功能保留历史图片。草图作为参考图发送，需要开启参考图编辑；标注需要增强查看器。",
			sketch: "草图",
			sketchTitle: "画出你的想法",
			sketchAttach: "附加草图",
			sketchCancel: "取消",
			sketchUndo: "撤销",
			sketchRedo: "重做",
			sketchClear: "清空",
			sketchEraser: "橡皮",
			sketchPen: "画笔",
			sketchColor: "颜色",
			sketchWidth: "笔刷粗细",
			sketchFailed: "无法附加草图，请保留画板后重试。",
			sketchHint: "确认只会附加图片，不会自动生成。发送时说明你想要的风格与细节。",
			imageTemplate: "创作模板",
			templatePoster: "海报",
			templateProduct: "商品图",
			templateIcon: "图标",
			templatePrompt: "创作说明",
			templateAdd: "填入草稿",
			searchOptions: "搜索选项",
			searchDomainCount: "个域名",
			catalogRefresh: "刷新模型",
			catalogOnline: "已加载账户在线模型目录",
			catalogFallback: "当前使用内置模型目录；登录后可刷新账户可用模型",
			searchMode: "订阅搜索模式",
			searchMode_live: "实时",
			searchMode_cached: "缓存（实验）",
			searchMode_disabled: "停用",
			searchModeHint: "仅影响 Codex 订阅搜索。缓存模式请求已有索引，需实机确认账户支持；失败时不会自动切换来源。",
			searchDomains: "结果域名筛选",
			searchDomainsHint: "留空显示全部结果；最多 20 个域名，逗号分隔，包含其子域名。只筛选返回结果，不限制搜索服务访问范围。",
			searchDomainsInvalid: "请输入域名，不含网址协议、路径或通配符。最多 20 个。",
			quotaAlerts: "额度提醒",
			quotaAlerts_off: "关闭",
			quotaAlerts_important: "剩余 20%",
			quotaAlerts_early: "提前提醒",
			quotaAlertsHint: "提前提醒：短周期剩余不超过 50%，其他周期不超过 20%。仅展示新鲜数据，不弹窗打断。",
			quotaWarning: "{window}额度剩余 {value}%，请留意用量与重置时间。",
			speedFastAstraHint: "Astra 约 2 倍速度，消耗更多 Credits",
			imageEditLocation: "位置",
			imageEditReferenceGuide: "本次编辑的干净源图为「{sourceName}」，编号定位参考图为「{referenceName}」。坐标以图片左上角为原点，x 向右、y 向下，百分比相对于整张图片。请查看这两张图片，将它们同时作为编辑工具的参考图，并在工具提示词中完整保留下方编号、位置和修改要求。只修改源图中对应位置的内容；定位参考图上的编号、圆点和引线仅用于定位，不得绘入最终结果。若无法读取两张图片或确定位置，请说明问题，不要猜测或忽略标注。",
			nav: "Codex 订阅",
			title: "Codex 订阅",
			connected: "已登录",
			disconnected: "未登录",
			accountLoading: "正在读取账户状态…",
			browserLogin: "浏览器登录",
			deviceLogin: "设备代码登录",
			logout: "退出登录",
			addAccount: "添加账号",
			switchAccount: "切换",
			removeAccount: "移除",
			removeConfirm: "确认移除",
			removeCancel: "保留",
			signOutAll: "退出全部账号",
			cancel: "取消",
			submit: "提交授权码",
			openLogin: "打开登录页",
			manualCode: "若浏览器回调没有自动完成，请粘贴授权码或完整重定向地址。",
			deviceHint: "在登录页输入此设备代码：",
			waiting: "正在等待登录完成…",
			failed: "登录失败，请重试。",
			accountRetry: "重试",
			accountRetrying: "正在重试账户状态…",
			accountCredentialUnavailable: "登录凭据暂时不可用。请重试；不会删除已保存的登录信息。",
			accountCredentialMalformed: "登录凭据格式异常，无法读取账户状态。重试不会删除已保存的登录信息。",
			accountStatusTimeout: "读取账户状态超时，请重试。",
			accountStatusTransport: "无法连接账户服务，请检查连接后重试。",
			accountStatusUnknown: "无法读取账户状态，请重试。",
			diagnostics: "支持诊断",
			diagnosticsLoad: "生成诊断",
			diagnosticsLoading: "生成中…",
			diagnosticsCopy: "复制诊断",
			diagnosticsCopied: "已复制",
			diagnosticsFailed: "无法生成诊断信息。",
			feedbackOpen: "反馈问题",
			showEmail: "显示完整邮箱",
			hideEmail: "隐藏邮箱",
			emailUnavailable: "邮箱不可用",
			searchTitle: "搜索来源",
			searchScope: "自动按当前会话模型分流；手动选择会覆盖所有模型和会话。",
			searchAuto: "自动",
			searchAutoHint: "Codex 模型用订阅搜索，其他模型用 DSH",
			searchDsh: "DSH 默认",
			searchDshHint: "所有模型使用 DSH 当前搜索服务",
			searchCodex: "Codex 订阅",
			searchCodexHint: "所有模型通过已登录的 ChatGPT 订阅搜索",
			preferenceFailed: "设置未保存。",
			preferenceRetry: "重试",
			usage: "订阅额度",
			refresh: "刷新",
			refreshing: "刷新中…",
			noUsage: "登录后可读取 ChatGPT 返回的额度窗口。",
			usageLoading: "正在读取额度…",
			usageEmpty: "当前账户没有返回可显示的额度窗口。请稍后刷新；这不代表额度为零。",
			usageUpdated: "更新于 {value}",
			remaining: "剩余 {value}%",
			windowFiveHours: "5 小时额度",
			windowDaily: "每日额度",
			windowWeekly: "每周额度",
			windowMonthly: "每月额度",
			windowAnnual: "年度额度",
			windowHours: "{value} 小时额度",
			windowDays: "{value} 天额度",
			resets: "重置于 {value}",
			resetUnknown: "重置时间未提供",
			creditsBalance: "额外 Credits 余额",
			creditsUnit: "credits",
			unlimited: "不限额",
			monthlyCreditLimit: "Credits 月度消费上限",
			resetCredits: "额度重置",
			resetCreditDefaultName: "额度重置",
			resetUse: "使用",
			resetPreparing: "准备中…",
			resetConfirmTitle: "确认使用额度重置",
			resetWarning: "执行后会消耗 1 次，且无法撤销。",
			resetEarlyWarning: "当前额度未用尽，服务可能不执行重置。",
			resetAcknowledge: "我知道这次操作可能立即消耗 1 次重置",
			resetCreditExpires: "到期：{value}",
			resetCreditExpiryUnknown: "到期时间未提供",
			resetCreditExpiryLoading: "正在读取到期时间…",
			resetCreditExpiryFailed: "无法读取到期时间",
			resetWait: "请等待 {count} 秒",
			resetFinal: "确认使用",
			resetUsing: "使用中…",
			resetSuccess: "额度重置已完成。",
			resetNothing: "当前没有可重置的额度，未消耗新的重置次数。",
			resetNoCredit: "没有可用的额度重置。",
			resetAlready: "这次重置请求已处理。",
			resetFailed: "无法使用额度重置。",
			resetRenewLogin: "登录状态已失效，请重新登录。",
			resetExpired: "本次确认已失效，请重新开始。",
			resetInProgress: "额度重置正在处理中。",
			resetTooEarly: "请等待冷静期结束后再确认。",
			resetAcknowledgeRequired: "请先确认已了解这次操作可能消耗重置次数。",
			resetAccountChanged: "登录账号已变更，请重新开始。",
			resetUncertain: "服务端返回结果不确定。请再次确认，插件会复用同一个请求，不会另外发起一次重置。",
			creditsNote: "额外 Credits、消费上限、重置次数分别显示。",
			creditsUsed: "已用 {used} / {limit} credits",
			spendReached: "Credits 月度消费上限已用尽。",
			unavailable: "暂无数据",
			quickQuotaSetting: "输入框额度",
			quickQuotaOff: "关闭",
			quickQuotaPercent: "百分比",
			quickQuotaBar: "进度条",
			quickQuotaForecast: "续航预测",
			quickQuotaBeta: "Beta",
			quickQuotaForecastHint: "按消耗速度自适应校准；高消耗通常 5–10 分钟可估算，低消耗会显示用量稳定。进度会在本机保留。",
			contextTitle: "上下文窗口",
			contextStandard: "标准",
			contextStandardHint: "使用模型目录默认值；官方 Agent 预设会自动管理上下文。",
			contextExtended: "扩展",
			contextExtendedHint: "按模型使用已审核的扩展预算（Astra：872K）；实际可用性由服务端决定。",
			contextCustom: "自定义",
			contextCustomHint: "输入完整 Token 数值；较低数值会让官方 Agent 预设更早压缩上下文。",
			contextTokens: "Token 上限",
			contextFixed: "固定 {value}",
			contextMaximum: "范围 {minimum}–{value}",
			quickQuotaStatus: "Codex 剩余额度 {value}%",
			quickQuotaForecastStatus: "Codex 剩余额度 {value}%，按当前速度预计可用 {duration}",
			quickQuotaForecastCalibrating: "校准中",
			quickQuotaForecastCalibratingStatus: "Codex 剩余额度 {value}%，续航预测正在校准",
			quickQuotaForecastIdle: "用量稳定",
			quickQuotaForecastIdleStatus: "Codex 剩余额度 {value}%，当前没有可测量的消耗速度",
			quickQuotaForecastUntilReset: "够用到重置",
			quickQuotaForecastUntilResetStatus: "Codex 剩余额度 {value}%，按当前速度足够用到重置",
			quotaForecast: "按当前速度 {symbol}{duration}",
			quotaForecastCalibrating: "续航正在校准",
			quotaForecastIdle: "当前用量稳定",
			quotaForecastUntilReset: "按当前速度足够用到重置",
			runwayDaysHours: "{days} 天 {hours} 小时",
			runwayDays: "{days} 天",
			runwayHours: "{hours} 小时",
			runwayMinutes: "{minutes} 分钟",
			speedTitle: "速度",
			speedStandard: "标准",
			speedStandardHint: "标准速度",
			speedFast: "高速",
			speedFastHint: "优先处理，速度取决于模型，消耗更多 Credits",
			verbosityTitle: "输出详略",
			verbosityDefault: "模型默认",
			verbosityDefaultHint: "使用官方模型目录推荐值",
			verbosityLow: "简洁",
			verbosityLowHint: "更短、更直接",
			verbosityMedium: "均衡",
			verbosityMediumHint: "兼顾完整性与长度",
			verbosityHigh: "详细",
			verbosityHighHint: "更充分的说明与结构",
			modelMenuAria: "模型、推理等级、速度与输出详略",
			modelLabel: "模型",
			effortLabel: "推理等级",
			providerDefault: "Default",
			selectModel: "选择模型",
			modelsLoading: "正在读取模型…",
			modelsEmpty: "没有可用模型。",
			effortsEmpty: "当前模型未提供推理等级。",
			modelRetry: "重试",
			modelDirectoryFailed: "模型目录加载失败，请重试。",
			modelFailed: "模型目录加载失败：{value}",
			groupFailed: "{name}：{value}",
			imageGenerate: "生成图片",
			imageBeta: "Beta",
			imageGenerating: "正在生成…",
			imageGenerated: "已生成",
			imageFailed: "生成失败",
			imageLabel: "生成的图片",
			imageOpen: "查看图片",
			imageOpenNamed: "查看 {value}",
			imageLoading: "正在加载图片…",
			imageLoadFailed: "图片加载失败，点击重试",
			imagePreview: "图片预览",
			imageClosePreview: "关闭预览",
			imageDownload: "下载",
			imageDownloadPreparing: "正在准备原图…",
			imageDownloadFailed: "下载失败，重试",
			imageFit: "适合窗口",
			imageAnnotate: "标注部位",
			imageAnnotateCancel: "取消标注",
			imageAnnotateHint: "点击图片添加编号标注",
			imageAnnotation: "标注 {value}",
			imageAnnotationPlaceholder: "描述这个部位要修改什么",
			imageRegions: "区域备注",
			imageCopyNotes: "复制备注",
			imageCopied: "已复制",
			imagePrevious: "上一张图片",
			imageNext: "下一张图片",
			imageZoomHint: "滚轮缩放 · 拖动查看 · 双击切换原始大小",
			imageActual: "原始大小",
			imageEditDefault: "编辑这张图片。",
			imageRegionNotes: "部位修改：",
			imageEdit: "在输入框中继续编辑",
			imageEditPreparing: "正在添加到输入框…",
			imageEditFailed: "回填失败：请填写每个标记的备注，并确认输入框可接收图片后重试。",
			imageRemoveAnnotation: "删除标注"
		};
		const en = {
			imageShortcut: "@Image shortcut",
			imageCreateTitle: "Describe your image",
			imageDraftHint: "Add to your draft, then send when ready. Attach references in the composer. Nothing is generated or existing text replaced automatically.",
			imageDraftFailed: "Could not update the draft. Keep your brief and check whether the composer is busy or contains references.",
			imageCreatePrompt: "Use the subscription image tool for the following request. If reference images are attached, edit those images:",
			templatePosterPrompt: "Design a poster using the brief below. Create a clear hierarchy of headline, subject, and supporting information. Use only supplied text; do not invent dates, prices, or contact details.",
			templateProductPrompt: "Create a product image using the brief below. Preserve the shape, materials, marks, and proportions of any reference product. Do not invent claims or certifications.",
			templateIconPrompt: "Design an icon using the brief below. Keep the composition simple, the silhouette recognizable at small sizes, and sufficient negative space. Do not add unrequested text.",
			imageDetails: "Image details",
			imageRequestedModel: "Requested model",
			imageReportedModel: "Server-reported model",
			imageModelUnreported: "Not reported",
			imageRequestedSize: "Requested size",
			imageActualSize: "Actual size",
			imageModel: "Image model",
			imageQuality: "Default quality",
			imageExperimental: "Experimental",
			imageModelHint: "Image 2.5 models are experimental and availability depends on your subscription. Errors are shown without automatically switching models.",
			sketchTool_pen: "Pen",
			sketchTool_rectangle: "Rectangle",
			sketchTool_circle: "Ellipse",
			sketchTool_eraser: "Eraser",
			imageGallery: "Session image library",
			imageCompare: "Image comparison",
			imageGalleryHint: "Latest 100 generated images in this session. Select up to 5 references for one edit, or two for comparison.",
			imageCompareAction: "Compare side by side",
			imageSelectedEdit: "Attach selected images",
			imageGalleryFailed: "Could not load or attach images. Please try again.",
			imageSettings: "Image workspace",
			imageGeneration: "Generate new images",
			imageEditing: "Reference image editing",
			imageViewer: "Enhanced image viewer",
			imageAnnotations: "Image annotations",
			imageSketch: "Sketch canvas",
			imageTemplates: "Creative templates",
			imageSettingsHint: "Disabling features preserves existing images. Sketches need reference editing; annotations need the enhanced viewer.",
			sketch: "Sketch",
			sketchTitle: "Draw your idea",
			sketchAttach: "Attach sketch",
			sketchCancel: "Cancel",
			sketchUndo: "Undo",
			sketchRedo: "Redo",
			sketchClear: "Clear",
			sketchEraser: "Eraser",
			sketchPen: "Pen",
			sketchColor: "Color",
			sketchWidth: "Brush width",
			sketchFailed: "Could not attach the sketch. Keep the canvas and try again.",
			sketchHint: "Confirming only attaches an image. Describe the style and details before sending.",
			imageTemplate: "Creative template",
			templatePoster: "Poster",
			templateProduct: "Product image",
			templateIcon: "Icon",
			templatePrompt: "Creative brief",
			templateAdd: "Add to draft",
			searchOptions: "Search options",
			searchDomainCount: "domains",
			catalogRefresh: "Refresh models",
			catalogOnline: "Account model catalog loaded",
			catalogFallback: "Using the built-in catalog. Sign in to refresh account models.",
			searchMode: "Subscription search mode",
			searchMode_live: "Live",
			searchMode_cached: "Cached (experimental)",
			searchMode_disabled: "Disabled",
			searchModeHint: "Applies only to Codex subscription search. Cached mode requests indexed results; account support needs live acceptance. Failures do not switch providers.",
			searchDomains: "Filter result domains",
			searchDomainsHint: "Empty allows all results. Up to 20 comma-separated domains, including subdomains. Filters returned results, not the search service network access.",
			searchDomainsInvalid: "Enter up to 20 domains without URL schemes, paths, or wildcards.",
			quotaAlerts: "Usage alerts",
			quotaAlerts_off: "Off",
			quotaAlerts_important: "20% remaining",
			quotaAlerts_early: "Early warning",
			quotaAlertsHint: "Early warning: 50% remaining for short windows, 20% for other windows. Fresh data only, without interrupting popups.",
			quotaWarning: "{window}: {value}% remaining. Check usage and reset time.",
			speedFastAstraHint: "About 2x speed on Astra; higher Credits use",
			imageEditLocation: "Location",
			imageEditReferenceGuide: "The clean source for this edit is \"{sourceName}\"; \"{referenceName}\" is the numbered location reference. Coordinates start at the top-left, x increases rightward and y downward; percentages refer to the whole image. Inspect both images and pass both as references to the image-editing tool. Preserve every number, position and requested change below in the tool prompt. Edit the corresponding content in the clean source; numbers, dots and leader lines on the location reference are guidance only and must not appear in the final result. If either image cannot be read or a location is unclear, explain the problem instead of guessing or ignoring annotations.",
			nav: "Codex",
			title: "Codex subscription",
			connected: "Signed in",
			disconnected: "Not signed in",
			accountLoading: "Reading account status…",
			browserLogin: "Browser sign-in",
			deviceLogin: "Device-code sign-in",
			logout: "Sign out",
			addAccount: "Add account",
			switchAccount: "Switch",
			removeAccount: "Remove",
			removeConfirm: "Confirm remove",
			removeCancel: "Keep",
			signOutAll: "Sign out all",
			cancel: "Cancel",
			submit: "Submit authorization code",
			openLogin: "Open sign-in page",
			manualCode: "If the browser callback did not finish automatically, paste the code or full redirect URL.",
			deviceHint: "Enter this device code on the sign-in page:",
			waiting: "Waiting for sign-in to finish…",
			failed: "Sign-in failed. Try again.",
			accountRetry: "Retry",
			accountRetrying: "Retrying account status…",
			accountCredentialUnavailable: "The saved sign-in credentials are temporarily unavailable. Retry; saved sign-in information will not be deleted.",
			accountCredentialMalformed: "The saved sign-in credentials are malformed, so account status cannot be read. Retrying will not delete saved sign-in information.",
			accountStatusTimeout: "Reading account status timed out. Retry.",
			accountStatusTransport: "The account service is unavailable. Check the connection and retry.",
			accountStatusUnknown: "Could not read account status. Retry.",
			diagnostics: "Support diagnostics",
			diagnosticsLoad: "Create report",
			diagnosticsLoading: "Creating…",
			diagnosticsCopy: "Copy report",
			diagnosticsCopied: "Copied",
			diagnosticsFailed: "Could not create diagnostics.",
			feedbackOpen: "Report a problem",
			showEmail: "Show full email",
			hideEmail: "Hide email",
			emailUnavailable: "Email unavailable",
			searchTitle: "Search source",
			searchScope: "Auto follows the current session model; an explicit choice overrides every model and session.",
			searchAuto: "Auto",
			searchAutoHint: "Codex models use subscription search; other models use DSH",
			searchDsh: "DSH default",
			searchDshHint: "Use DSH's current search service for every model",
			searchCodex: "Codex subscription",
			searchCodexHint: "Search through the signed-in ChatGPT subscription for every model",
			preferenceFailed: "The setting was not saved.",
			preferenceRetry: "Retry",
			usage: "Subscription quota",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			noUsage: "Sign in to read quota windows reported by ChatGPT.",
			usageLoading: "Reading quota…",
			usageEmpty: "This account returned no displayable quota windows. Refresh later; this does not mean zero quota.",
			usageUpdated: "Updated {value}",
			remaining: "{value}% remaining",
			windowFiveHours: "5-hour quota",
			windowDaily: "Daily quota",
			windowWeekly: "Weekly quota",
			windowMonthly: "Monthly quota",
			windowAnnual: "Annual quota",
			windowHours: "{value}-hour quota",
			windowDays: "{value}-day quota",
			resets: "Resets {value}",
			resetUnknown: "Reset time not provided",
			creditsBalance: "Extra Credits balance",
			creditsUnit: "credits",
			unlimited: "Unlimited",
			monthlyCreditLimit: "Monthly Credits spending cap",
			resetCredits: "Quota resets",
			resetCreditDefaultName: "Quota reset",
			resetUse: "Use",
			resetPreparing: "Preparing…",
			resetConfirmTitle: "Confirm quota reset",
			resetWarning: "This consumes one reset and cannot be undone.",
			resetEarlyWarning: "Quota remains. The service may decline the reset.",
			resetAcknowledge: "I understand this may consume one reset now",
			resetCreditExpires: "Expires {value}",
			resetCreditExpiryUnknown: "Expiration time not provided",
			resetCreditExpiryLoading: "Reading expiration…",
			resetCreditExpiryFailed: "Could not read expiration",
			resetWait: "Wait {count} seconds",
			resetFinal: "Confirm use",
			resetUsing: "Using…",
			resetSuccess: "Quota reset completed.",
			resetNothing: "There is currently nothing to reset; no new reset was consumed.",
			resetNoCredit: "No quota reset is available.",
			resetAlready: "This reset request was already processed.",
			resetFailed: "Could not use the quota reset.",
			resetRenewLogin: "Your sign-in expired. Sign in again.",
			resetExpired: "This confirmation expired. Start again.",
			resetInProgress: "A quota reset is already in progress.",
			resetTooEarly: "Wait for the cooldown before confirming.",
			resetAcknowledgeRequired: "Confirm that you understand this may consume a reset.",
			resetAccountChanged: "The signed-in account changed. Start again.",
			resetUncertain: "The server result is uncertain. Confirm again to check the same request; the plugin will not start a separate reset.",
			creditsNote: "Extra Credits, spending caps, and resets are separate items.",
			creditsUsed: "{used} / {limit} credits used",
			spendReached: "The monthly Credits spending cap has been reached.",
			unavailable: "No data yet",
			quickQuotaSetting: "Composer quota",
			quickQuotaOff: "Off",
			quickQuotaPercent: "Percent",
			quickQuotaBar: "Progress bar",
			quickQuotaForecast: "Runway",
			quickQuotaBeta: "Beta",
			quickQuotaForecastHint: "Calibrates to actual consumption: high use is usually estimated in 5–10 minutes, while low use is shown as stable. Progress is kept locally.",
			contextTitle: "Context window",
			contextStandard: "Standard",
			contextStandardHint: "Use the model catalog default; official agent presets manage context automatically.",
			contextExtended: "Extended",
			contextExtendedHint: "Uses each model's audited extended budget (Astra: 872K); availability depends on the service.",
			contextCustom: "Custom",
			contextCustomHint: "Enter the full token count; lower values make official agent presets compact sooner.",
			contextTokens: "Token limit",
			contextFixed: "Fixed {value}",
			contextMaximum: "{minimum}–{value}",
			quickQuotaStatus: "Codex quota: {value}% remaining",
			quickQuotaForecastStatus: "Codex quota: {value}% remaining; about {duration} at the current pace",
			quickQuotaForecastCalibrating: "Calibrating",
			quickQuotaForecastCalibratingStatus: "Codex quota: {value}% remaining; runway is calibrating",
			quickQuotaForecastIdle: "Usage stable",
			quickQuotaForecastIdleStatus: "Codex quota: {value}% remaining; no measurable consumption pace",
			quickQuotaForecastUntilReset: "Enough until reset",
			quickQuotaForecastUntilResetStatus: "Codex quota: {value}% remaining; enough until reset at the current pace",
			quotaForecast: "At current pace {symbol}{duration}",
			quotaForecastCalibrating: "Runway calibrating",
			quotaForecastIdle: "Usage currently stable",
			quotaForecastUntilReset: "Enough until reset at current pace",
			runwayDaysHours: "{days}d {hours}h",
			runwayDays: "{days}d",
			runwayHours: "{hours}h",
			runwayMinutes: "{minutes}m",
			speedTitle: "Speed",
			speedStandard: "Standard",
			speedStandardHint: "Standard speed",
			speedFast: "Fast",
			speedFastHint: "Priority processing; speed varies by model; higher Credits use",
			verbosityTitle: "Output detail",
			verbosityDefault: "Model default",
			verbosityDefaultHint: "Use the official model catalog recommendation",
			verbosityLow: "Concise",
			verbosityLowHint: "Shorter and more direct",
			verbosityMedium: "Balanced",
			verbosityMediumHint: "Balance completeness and length",
			verbosityHigh: "Detailed",
			verbosityHighHint: "More explanation and structure",
			modelMenuAria: "Model, effort, speed, and output detail",
			modelLabel: "Model",
			effortLabel: "Effort",
			providerDefault: "Default",
			selectModel: "Select model",
			modelsLoading: "Loading models…",
			modelsEmpty: "No models available.",
			effortsEmpty: "This model provides no reasoning effort levels.",
			modelRetry: "Retry",
			modelDirectoryFailed: "Could not load the model directory. Try again.",
			modelFailed: "Could not load models: {value}",
			groupFailed: "{name}: {value}",
			imageGenerate: "Generate image",
			imageBeta: "Beta",
			imageGenerating: "Generating…",
			imageGenerated: "Generated",
			imageFailed: "Generation failed",
			imageLabel: "Generated image",
			imageOpen: "View image",
			imageOpenNamed: "View {value}",
			imageLoading: "Loading image…",
			imageLoadFailed: "Image failed to load. Click to retry",
			imagePreview: "Image preview",
			imageClosePreview: "Close preview",
			imageDownload: "Download",
			imageDownloadPreparing: "Preparing original…",
			imageDownloadFailed: "Download failed. Retry",
			imageFit: "Fit to window",
			imageAnnotate: "Annotate",
			imageAnnotateCancel: "Cancel marking",
			imageAnnotateHint: "Click the image to add a numbered note",
			imageAnnotation: "Note {value}",
			imageAnnotationPlaceholder: "Describe what should change in this area",
			imageRegions: "Region notes",
			imageCopyNotes: "Copy notes",
			imageCopied: "Copied",
			imagePrevious: "Previous image",
			imageNext: "Next image",
			imageZoomHint: "Wheel to zoom · drag to pan · double-click for 100%",
			imageActual: "100%",
			imageEditDefault: "Edit this image.",
			imageRegionNotes: "Region changes:",
			imageEdit: "Continue editing in composer",
			imageEditPreparing: "Adding to composer…",
			imageEditFailed: "Handoff failed. Add a note to every marker and ensure the composer accepts images, then retry.",
			imageRemoveAnnotation: "Remove note"
		};
		//#endregion
		//#region src/client-styles.js
		const STYLE = `
.codexImageSettings{border-top:1px solid var(--dsw-alias-stroke-tertiary,#8882);padding-top:6px}
.codexImageSettings>summary{font-weight:600}
.codexImageSettings select{font:inherit;color:inherit;background:var(--dsw-alias-background-surface,#fff);border:1px solid #8883;border-radius:9px;padding:6px 9px;max-width:65%;min-height:32px}
.codexImageSettings>.codexSubscriptionPreference{margin-bottom:8px}
.codexImageSettings>.codexSubscriptionPreferenceHint{max-width:none;margin:10px 0;color:var(--dsw-alias-label-secondary,#73737b)}
.codexImageSwitches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;margin:14px 0;border-top:1px solid #8882}
.codexImageSwitches label{min-height:43px;border-bottom:1px solid #8882}
.codexImageSwitches input{appearance:none;width:34px;height:20px;flex:none;margin:0;border:none;border-radius:999px;corner-shape:round;background:#929398;cursor:pointer;position:relative;transition:background .15s}
.codexImageSwitches input:before{content:'';position:absolute;width:16px;height:16px;left:2px;top:2px;border-radius:50%;corner-shape:round;background:white;box-shadow:0 1px 3px #0002;transition:transform .15s}
.codexImageSwitches input:checked{background:#007aff}.codexImageSwitches input:checked:before{transform:translateX(14px)}
.codexImageSwitches input:focus-visible{outline:2px solid #007aff;outline-offset:3px}.codexImageSwitches input:disabled{opacity:.4;cursor:default}
@container(max-width:430px){.codexImageSwitches{grid-template-columns:1fr}}
.codexSubscriptionSearchHead{display:flex;flex-direction:column;gap:1px}
.codexSubscriptionSearchScope{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscription{display:flex;flex-direction:column;gap:10px;max-width:720px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.codexSubscription h2,.codexSubscription h3,.codexSubscription p{margin:0}
.codexSubscriptionHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.codexSubscription h2{font-size:16px;line-height:24px;font-weight:500}
.codexSubscription h3{font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.codexSubscriptionUsageCard{padding:12px 14px;gap:9px}
.codexSubscriptionPreferencesCard{padding:12px 14px;gap:10px}
.codexSubscriptionPreference{min-height:32px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.codexSubscriptionPreferenceCopy{display:flex;min-width:0;flex-direction:column;gap:2px}
.codexSubscriptionPreferenceLabel{display:flex;align-items:center;gap:6px}
.codexSubscriptionPreferenceHint{max-width:300px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionQuotaModes{display:flex;align-items:center;gap:3px;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionQuotaMode{position:relative;display:flex;align-items:center;justify-content:center;min-height:26px;padding:0 9px;border-radius:7px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.codexSubscriptionQuotaMode small{margin-left:3px;font-size:9px;line-height:1;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionQuotaMode:has(input:checked){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px var(--dsw-alias-border-l3)}
.codexSubscriptionQuotaMode:has(input:focus-visible){outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.codexSubscriptionQuotaMode:has(input:disabled){cursor:not-allowed;opacity:.5}
.codexSubscriptionQuotaMode input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.codexSubscriptionContext{display:flex;flex-direction:column;gap:8px}
.codexSubscriptionContextHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.codexSubscriptionContextCopy{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}
.codexSubscriptionContextHint{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionContextTrigger{height:32px;min-width:108px;display:inline-flex;align-items:center;justify-content:space-between;gap:10px;padding:0 10px 0 12px;border:0;border-radius:999px;outline:0;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.codexSubscriptionContextTrigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.codexSubscriptionContextTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.codexSubscriptionContextTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:not-allowed}
.codexSubscriptionContextTrigger svg{color:var(--dsw-alias-label-tertiary);transition:transform 120ms var(--ds-ease-in-out)}
.codexSubscriptionContextTrigger[aria-expanded=true] svg{transform:rotate(180deg)}
.codexSubscriptionContextModels{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionContextModel{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionContextModel:last-child{border-bottom:0}
.codexSubscriptionContextModelCopy{display:flex;min-width:0;flex-direction:column}
.codexSubscriptionContextModelCopy strong{font-size:12px;line-height:18px;font-weight:500}
.codexSubscriptionContextModelCopy span{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionContextInput{width:116px}
.codexSubscriptionSearch{display:flex;flex-direction:column;gap:7px}
.codexSubscriptionSearchChoices{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}
.codexSubscriptionSearchChoice{display:grid;grid-template-columns:14px minmax(0,1fr);align-items:center;column-gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);padding:9px 10px;text-align:left;cursor:pointer}
.codexSubscriptionSearchChoice:has(input:disabled){cursor:not-allowed;opacity:.5}
.codexSubscriptionSearchChoice:has(input:checked){border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.codexSubscriptionSearchChoice:has(input:focus-visible){outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}
.codexSubscriptionSearchInput{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-label-primary);cursor:inherit}
.codexSubscriptionSearchCopy{display:block;min-width:0;pointer-events:none}
.codexSubscriptionSearchCopy strong,.codexSubscriptionSearchCopy span{display:block}
.codexSubscriptionSearchCopy strong{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionSearchChoice:has(input:checked) strong{color:var(--dsw-alias-label-primary)}
.codexSubscriptionSearchCopy span{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionDivider{height:1px;background:var(--dsw-alias-border-l2)}
.codexSubscriptionQuotaModes[data-saving=true] .codexSubscriptionQuotaMode:has(input:disabled){cursor:wait;opacity:1}
.codexSubscriptionSearchChoices[data-saving=true] .codexSubscriptionSearchChoice:has(input:disabled){cursor:wait;opacity:1}
.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.codexSubscriptionStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionAccounts{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionAccount{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}
.codexSubscriptionAccount:last-child{border-bottom:0}
.codexSubscriptionAccount[data-active=true] .codexSubscriptionEmail,.codexSubscriptionAccount[data-active=true]>span{font-weight:600}
.codexSubscriptionEmail{max-width:100%;overflow:hidden;padding:2px 4px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.codexSubscriptionEmail:hover{background:var(--dsw-alias-interactive-bg-hover)}
.codexSubscriptionEmail:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.codexSubscriptionFlow label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}
.codexSubscriptionDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}
.codexSubscriptionDot[data-state=disconnected]{background:var(--dsw-alias-state-error-primary)}
.codexSubscriptionActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.codexSubscriptionFlow{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.codexSubscriptionError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}
.codexSubscriptionInput{width:100%;box-sizing:border-box}
.codexSubscriptionRecover{display:flex;align-items:center;justify-content:space-between;gap:12px}
.codexSubscriptionRecover .codexSubscriptionError{flex:1}
.codexSubscriptionRecover button{flex:0 0 auto}
.codexSubscriptionDiagnostics{padding:8px 12px;gap:8px;background:transparent;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionDiagnostics pre{max-height:240px;margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/17px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionLink{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-decoration:none;white-space:nowrap}
.codexSubscriptionLink:hover{background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionLink:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}
.codexSubscriptionSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.codexSubscriptionFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}
.codexSubscriptionRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.codexSubscriptionEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionLimits{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px}
.codexSubscriptionLimit{min-width:0;border-radius:10px;padding:9px 12px;background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column;gap:6px}
.codexSubscriptionLimitTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.codexSubscriptionLimitLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionLimit strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.codexSubscriptionLimit progress{width:100%;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.codexSubscriptionLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}
.codexSubscriptionLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexSubscriptionLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexSubscriptionLimitMeta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionLimitPeriod{display:flex;gap:8px;flex-wrap:wrap}
.codexSubscriptionSearchOptions{margin-top:10px;font-size:12px}
.codexSubscriptionSearchOptions>summary{cursor:pointer;color:var(--dsw-alias-label-primary);padding:6px 0}
.codexSubscriptionSearchOptions>summary>span{float:right;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionSearchOptions[open]>summary{margin-bottom:8px}
.codexSubscriptionCreditSection{display:flex;flex-direction:column;gap:7px}
.codexSubscriptionCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCreditRows{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.codexSubscriptionCreditBalance,.codexSubscriptionSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionCreditBalance{display:flex;flex-direction:column;gap:6px}
.codexSubscriptionCreditBalance span,.codexSubscriptionCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.codexSubscriptionCreditRows{display:flex;flex-direction:column;gap:6px}
.codexSubscriptionResetMeta{display:flex;min-width:0;flex-direction:column;gap:1px}
.codexSubscriptionResetBalance{display:flex;flex-direction:column;gap:8px}
.codexSubscriptionResetCard{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionResetCard .codexSubscriptionResetMeta{flex:1}
.codexSubscriptionResetCard strong{overflow:hidden;font-size:12px;line-height:18px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.codexSubscriptionResetCard .codexSubscriptionActions{flex:0 0 auto}
.codexSubscriptionResetCard .codexSubscriptionResetUse{min-height:28px;padding:0 10px}
.codexSubscriptionResetBalance .codexSubscriptionActions{justify-content:flex-start}
.codexSubscriptionResetFlow{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}
.codexSubscriptionResetFlow h4{margin:0;font-size:13px;line-height:20px;font-weight:500}
.codexSubscriptionResetWarning{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionResetExpiry{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionResetCheck{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);cursor:pointer}
.codexSubscriptionResetCheck input{margin:3px 0 0;accent-color:var(--dsw-alias-label-primary)}
.codexSubscriptionResetFinal{border-color:var(--dsw-alias-state-error-primary)!important;color:var(--dsw-alias-state-error-primary)!important}
.codexSubscriptionResetResult{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}
.codexSubscriptionResetUse:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.codexSubscriptionResetUse:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.codexSubscriptionSpendLimit{display:flex;flex-direction:column;gap:8px}
.codexSubscriptionSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.codexSubscriptionSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.codexSubscriptionSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.codexSubscriptionSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}
.codexSubscriptionSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexSubscriptionSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexComposerQuotaWindows{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
.codexComposerQuota{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}
.codexComposerQuotaBar{display:block;width:40px;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-label-secondary);-webkit-appearance:none;appearance:none}
.codexComposerQuotaBar::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}
.codexComposerQuotaBar::-webkit-progress-value{background:var(--dsw-alias-label-secondary);border-radius:999px}
.codexComposerQuotaBar::-moz-progress-bar{background:var(--dsw-alias-label-secondary);border-radius:999px}
.codexModelSelect{position:relative;min-width:0}
.codexModelSelectTrigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}
.codexModelSelectTrigger:hover:not(:disabled),.codexModelSelectTrigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}
.codexModelSelectTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.codexModelSelectTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.codexModelSelectBolt{display:block;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary)}
.codexModelSelectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectEffort{flex:none;color:var(--dsw-alias-label-caption)}
.codexModelSelectChevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms}
.codexModelSelectTrigger[aria-expanded=true] .codexModelSelectChevron{transform:rotate(180deg)}
.codexModelSelectMenu,.codexModelSelectSubmenu{position:absolute;z-index:30;box-sizing:border-box;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden}
.codexModelSelectMenu{right:0;bottom:calc(100% + 8px)}
.codexModelSelectSubmenu{right:calc(100% + 8px);bottom:0;min-width:min(230px,calc(100vw - 32px))}
.codexModelSelectCell{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;height:40px;box-sizing:border-box;padding:0 10px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer}
.codexModelSelectCell:hover,.codexModelSelectCell:focus-visible,.codexModelSelectCell[data-open=true]{background:var(--dsw-alias-interactive-bg-hover);outline:0}
.codexModelSelectCell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.codexModelSelectCellLabel{flex:none;white-space:nowrap}
.codexModelSelectCellValue{flex:auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectCellChevron{flex:none;color:var(--dsw-alias-label-tertiary)}
.codexModelSelectGroups{min-height:0;max-height:352px;overflow-y:auto}
.codexModelSelectGroup+.codexModelSelectGroup{margin-top:4px}
.codexModelSelectGroupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}
.codexModelSelectOption{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;min-height:38px;box-sizing:border-box;padding:6px 8px;border:0;border-radius:10px;outline:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.codexModelSelectOption:hover:not(:disabled),.codexModelSelectOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.codexModelSelectOption:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.codexModelSelectOptionCopy{display:flex;flex:1;min-width:0;flex-direction:column}
.codexModelSelectOptionName{overflow:hidden;color:inherit;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectOptionDescription{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectCheck{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}
.codexModelSelectStatus,.codexModelSelectEmpty{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.codexModelSelectError,.codexModelSelectWarning{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.codexModelSelectWarning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.codexModelSelectRetry{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.codexModelSelectMenu{overflow:visible}
.codexImageTool{display:flex;flex-direction:column;gap:8px;margin:4px 0;color:var(--dsw-alias-label-primary)}
.codexImageToolRow{display:flex;align-items:center;min-height:24px;gap:8px;font-size:13px;line-height:20px}
.codexImageToolIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary)}
.codexImageToolIcon::before{content:'';width:8px;height:8px;border:1.5px solid currentColor;border-radius:3px}
.codexImageTool[data-state=running] .codexImageToolIcon::before{border-radius:50%;border-right-color:transparent;animation:codexImageSpin 800ms linear infinite}
.codexImageTool[data-state=error] .codexImageToolIcon::before{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary)}
.codexImageToolTitle{font-weight:500}
.codexImageToolState{color:var(--dsw-alias-label-tertiary)}
.codexImageToolError{margin:0 0 0 24px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.codexImageToolGallery{margin-left:24px}
.codexGeneratedImageFrame{display:flex;align-items:center;justify-content:center;width:min(240px,100%);height:240px;padding:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);cursor:pointer}
.codexGeneratedImageFrame img{display:block;width:100%;height:100%;object-fit:cover}
.codexGeneratedImageRetry{min-height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);cursor:pointer}
@keyframes codexImageSpin{to{transform:rotate(360deg)}}
.codexImageBeta{padding:0 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}
.codexImageToolGallery{display:flex;align-items:flex-start;flex-direction:column;gap:8px}
@container (max-width:560px){.codexSubscriptionCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column}
.codexSubscriptionActions{width:100%}
.codexSubscriptionSearchChoices{grid-template-columns:1fr}}
@media(max-width:640px){.codexSubscriptionCard{padding:14px}}
`;
		//#endregion
		//#region src/image-edit-reference.js
		const TWO_PI = Math.PI * 2;
		const PIN_FILL = "#e11d48";
		const PIN_OUTER_STROKE = "#111827";
		const PIN_INNER_STROKE = "#ffffff";
		const finiteDimension = (value) => Number.isSafeInteger(value) && value > 0;
		const clamp$1 = (value, min, max) => Math.min(max, Math.max(min, value));
		const clampCenter = (value, size, edge) => {
			const margin = Math.min(edge, size / 2);
			return clamp$1(value, margin, size - margin);
		};
		function getBitmapFactory(options) {
			const factory = options?.createImageBitmap ?? options?.bitmapFactory ?? globalThis.createImageBitmap;
			if (typeof factory !== "function") throw new Error("createImageBitmap is not available");
			return factory;
		}
		function getCanvasFactory(options) {
			const injected = options?.createCanvas ?? options?.canvasFactory;
			if (typeof injected === "function") return injected;
			const document = globalThis.document;
			if (document !== void 0 && typeof document.createElement === "function") return (width, height) => {
				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				return canvas;
			};
			throw new Error("A canvas factory is not available");
		}
		function drawPin(context, number, x, y, width, height) {
			const label = String(number);
			const fontSize = Math.max(12, Math.min(40, Math.round(Math.min(width, height) * .03)));
			const radius = Math.max(12, fontSize * .8, fontSize * (.3 * label.length + .35));
			const outerStroke = Math.max(2, Math.min(4, radius * .25));
			const innerStroke = Math.max(1, Math.min(2, radius * .13));
			const edge = radius + outerStroke + 2;
			const targetX = x * Math.max(0, width - 1);
			const targetY = y * Math.max(0, height - 1);
			const centerX = clampCenter(targetX, width, edge);
			const centerY = clampCenter(targetY, height, edge);
			context.save?.();
			if ((centerX !== targetX || centerY !== targetY) && typeof context.moveTo === "function" && typeof context.lineTo === "function") {
				context.beginPath();
				context.moveTo(targetX, targetY);
				context.lineTo(centerX, centerY);
				context.lineWidth = outerStroke * 2;
				context.strokeStyle = PIN_OUTER_STROKE;
				context.stroke();
				context.beginPath();
				context.moveTo(targetX, targetY);
				context.lineTo(centerX, centerY);
				context.lineWidth = innerStroke;
				context.strokeStyle = PIN_INNER_STROKE;
				context.stroke();
			}
			context.beginPath();
			context.arc(centerX, centerY, radius, 0, TWO_PI);
			context.fillStyle = PIN_FILL;
			context.fill();
			context.lineWidth = outerStroke;
			context.strokeStyle = PIN_OUTER_STROKE;
			context.stroke();
			context.lineWidth = innerStroke;
			context.strokeStyle = PIN_INNER_STROKE;
			context.stroke();
			context.font = `700 ${fontSize}px sans-serif`;
			context.fillStyle = PIN_INNER_STROKE;
			context.textAlign = "center";
			context.textBaseline = "middle";
			context.fillText(label, centerX, centerY);
			context.restore?.();
		}
		function encodePng(canvas) {
			if (typeof canvas?.toBlob !== "function") throw new Error("Canvas PNG encoding is not available");
			return new Promise((resolve, reject) => {
				let settled = false;
				const finish = (callback, value) => {
					if (settled) return;
					settled = true;
					callback(value);
				};
				try {
					canvas.toBlob((value) => {
						if (value === null || value === void 0) finish(reject, /* @__PURE__ */ new Error("Canvas failed to encode the annotation reference as PNG"));
						else finish(resolve, value);
					}, "image/png");
				} catch (error) {
					finish(reject, error);
				}
			});
		}
		/**
		* Create the second image sent with an annotated edit. It contains the clean
		* source plus numbered pins, with no note text. `options` is intentionally
		* injectable so the rendering path can be exercised without a browser:
		* `{ createImageBitmap, createCanvas }`.
		*/
		async function createAnnotatedImageReference(blob, annotations, options = {}) {
			const normalized = normalizeImageEditAnnotations(annotations);
			const createImageBitmap = getBitmapFactory(options);
			const createCanvas = getCanvasFactory(options);
			const bitmap = await createImageBitmap(blob);
			try {
				const width = bitmap?.width;
				const height = bitmap?.height;
				if (!finiteDimension(width) || !finiteDimension(height)) throw new Error("The source image has invalid dimensions");
				if (Math.min(width, height) < 64) throw new Error("The source image is too small for readable annotation pins");
				const canvas = await createCanvas(width, height);
				if (canvas === null || canvas === void 0) throw new Error("Canvas factory returned no canvas");
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext?.("2d");
				if (context === null || context === void 0) throw new Error("Canvas 2D context is not available");
				context.clearRect?.(0, 0, width, height);
				context.drawImage?.(bitmap, 0, 0, width, height);
				if (typeof context.drawImage !== "function") throw new Error("Canvas 2D context cannot draw the source image");
				for (const annotation of normalized) drawPin(context, annotation.number, annotation.x, annotation.y, width, height);
				return await encodePng(canvas);
			} finally {
				if (typeof bitmap?.close === "function") bitmap.close();
			}
		}
		//#endregion
		//#region src/subscription-image-viewer-styles.js
		const SUBSCRIPTION_IMAGE_VIEWER_CSS = String.raw`
.dcsiv-root{position:fixed;inset:0;z-index:1000;pointer-events:auto;overflow:hidden;background:rgba(7,8,10,.68);color:var(--dsw-alias-label-primary-inverted,#fff);outline:0;backdrop-filter:blur(13px) saturate(.72);-webkit-backdrop-filter:blur(13px) saturate(.72)}
.dcsiv-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.dcsiv-topbar{position:absolute;right:50%;bottom:22px;z-index:6;max-width:calc(100vw - 36px);padding:5px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(38,39,43,.86);box-shadow:0 10px 34px rgba(0,0,0,.3);transform:translateX(50%);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.dcsiv-actions{display:flex;align-items:center;gap:2px;overflow-x:auto;scrollbar-width:none}.dcsiv-actions::-webkit-scrollbar{display:none}.dcsiv-button,.dcsiv-download{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.9);font:inherit;font-size:12px;text-decoration:none;white-space:nowrap;cursor:pointer}.dcsiv-button:hover,.dcsiv-download:hover,.dcsiv-button[data-active=true]{background:rgba(255,255,255,.12)}.dcsiv-button:focus-visible,.dcsiv-download:focus-visible,.dcsiv-close-floating:focus-visible{outline:2px solid rgba(255,255,255,.9);outline-offset:2px}.dcsiv-button:disabled,.dcsiv-download:disabled{opacity:.38;cursor:default}.dcsiv-icon-only{width:32px;padding:0}.dcsiv-zoom{min-width:44px;color:rgba(255,255,255,.68);font-size:12px;font-variant-numeric:tabular-nums;text-align:center}
.dcsiv-close-floating{position:absolute;top:20px;right:20px;z-index:8;display:grid;place-items:center;width:42px;height:42px;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(48,49,53,.82);box-shadow:0 8px 24px rgba(0,0,0,.28);color:#fff;cursor:pointer;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}.dcsiv-close-floating:hover{background:rgba(66,67,72,.92)}
.dcsiv-workspace{position:absolute;inset:0;display:grid;min-width:0;min-height:0;padding:68px 24px 72px;box-sizing:border-box}
.dcsiv-stage{position:relative;display:grid;place-items:center;min-width:0;min-height:0;overflow:hidden;padding:0;touch-action:none;user-select:none}.dcsiv-stage[data-dragging=true]{cursor:grabbing}.dcsiv-stage[data-annotating=true]{cursor:crosshair}
.dcsiv-surface{position:relative;display:inline-flex;max-width:100%;max-height:100%;transform-origin:center;will-change:transform}.dcsiv-image{display:block;max-width:calc(100vw - 72px);max-height:calc(100vh - 154px);border-radius:12px;object-fit:contain;box-shadow:0 22px 60px rgba(0,0,0,.46);user-select:none;-webkit-user-drag:none}
.dcsiv-annotation{position:absolute;z-index:5;width:24px;height:24px;transform-origin:center;pointer-events:none}.dcsiv-pin{position:absolute;inset:0;display:grid;place-items:center;width:24px;height:24px;padding:0;border:2px solid #fff;border-radius:50%;background:rgba(23,24,27,.94);box-shadow:0 4px 16px rgba(0,0,0,.35);color:#fff;font:inherit;font-size:11px;font-weight:700;cursor:pointer;pointer-events:auto}.dcsiv-pin[data-active=true]{background:var(--dsw-alias-state-business-primary,#3964fe)}
.dcsiv-inline-note{position:absolute;bottom:34px;box-sizing:border-box;display:grid;width:min(300px,calc(100vw - 40px));grid-template-columns:24px minmax(0,1fr) 24px;align-items:center;gap:7px;padding:7px 8px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(32,33,37,.94);box-shadow:0 14px 38px rgba(0,0,0,.38);color:#fff;pointer-events:auto;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.dcsiv-annotation[data-x=right] .dcsiv-inline-note{left:-8px}.dcsiv-annotation[data-x=left] .dcsiv-inline-note{right:-8px}.dcsiv-annotation[data-x=center] .dcsiv-inline-note{left:50%;transform:translateX(-50%)}.dcsiv-annotation[data-y=down] .dcsiv-inline-note{top:34px;bottom:auto}.dcsiv-inline-note::after{position:absolute;width:9px;height:9px;background:rgba(32,33,37,.94);content:'';transform:rotate(45deg)}.dcsiv-annotation[data-y=up] .dcsiv-inline-note::after{bottom:-5px}.dcsiv-annotation[data-y=down] .dcsiv-inline-note::after{top:-5px}.dcsiv-annotation[data-x=right] .dcsiv-inline-note::after{left:13px}.dcsiv-annotation[data-x=left] .dcsiv-inline-note::after{right:13px}.dcsiv-annotation[data-x=center] .dcsiv-inline-note::after{left:calc(50% - 4px)}.dcsiv-inline-index{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3964fe);color:#fff;font-size:10px;font-weight:700}.dcsiv-inline-note textarea{box-sizing:border-box;width:100%;min-height:24px;max-height:92px;resize:none;overflow:auto;border:0;outline:0;background:transparent;color:#fff;font:inherit;font-size:12px;line-height:18px}.dcsiv-inline-note textarea::placeholder{color:rgba(255,255,255,.44)}.dcsiv-note-remove{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:rgba(255,255,255,.68);cursor:pointer}.dcsiv-note-remove:hover{background:rgba(255,255,255,.1);color:#fff}
.dcsiv-nav{position:absolute;top:50%;z-index:4;width:42px;height:42px;padding:0;transform:translateY(-50%);background:rgba(48,49,53,.82);box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}.dcsiv-prev{left:6px}.dcsiv-next{right:6px}.dcsiv-counter{position:absolute;bottom:8px;left:50%;padding:5px 10px;border-radius:999px;background:rgba(38,39,43,.86);color:rgba(255,255,255,.72);font-size:11px;transform:translateX(-50%);backdrop-filter:blur(16px)}
.dcsiv-hint{display:none}
.dcsiv-copy-notes{position:absolute;right:20px;bottom:22px;z-index:6;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(38,39,43,.86);color:rgba(255,255,255,.82);font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(16px)}
@media(max-width:760px){.dcsiv-close-floating{top:12px;right:12px;width:40px;height:40px}.dcsiv-workspace{padding:60px 12px 68px}.dcsiv-image{max-width:calc(100vw - 24px);max-height:calc(100vh - 136px)}.dcsiv-topbar{bottom:12px;max-width:calc(100vw - 24px)}.dcsiv-button{padding:0 8px}.dcsiv-button span.dcsiv-label{display:none}.dcsiv-inline-note{width:min(260px,calc(100vw - 40px))}.dcsiv-copy-notes{display:none}}
@media(prefers-reduced-motion:reduce){.dcsiv-surface{transition:none}}
`;
		//#endregion
		//#region src/subscription-image-viewer.jsx
		const fill$1 = (value, variables) => Object.entries(variables).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)), value);
		const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
		const bytesLabel = (bytes) => bytes === void 0 ? void 0 : bytes < 1024 * 1024 ? `${Math.max(.1, bytes / 1024).toLocaleString(void 0, { maximumFractionDigits: 1 })} KB` : `${(bytes / 1024 / 1024).toLocaleString(void 0, { maximumFractionDigits: 1 })} MB`;
		const downloadName = (name) => {
			const cleaned = String(name || "image.png").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").replace(/[. ]+$/u, "").trim();
			return cleaned === "" ? "image.png" : cleaned;
		};
		const noteText = (annotations, t) => annotations.map((annotation, index) => {
			return `${fill$1(t("imageAnnotation"), { value: index + 1 })} (${Math.round(annotation.x * 100)}%, ${Math.round(annotation.y * 100)}%): ${annotation.note.trim()}`;
		}).filter((line) => !line.endsWith(": ")).join("\n");
		function ViewerAction({ action, annotations, item, service, t }) {
			const [state, setState] = (0, react.useState)("idle");
			const invoke = async () => {
				if (state === "pending") return;
				setState("pending");
				try {
					await action.onInvoke({
						annotations,
						item,
						src: item.src
					});
					setState("idle");
					if (action.closeOnSuccess) service.close();
				} catch {
					setState("failed");
				}
			};
			const label = state === "pending" ? action.pendingLabel : state === "failed" ? action.errorLabel : action.label;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dcsiv-button",
				disabled: state === "pending",
				onClick: () => {
					invoke();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dcsiv-label",
					children: label ?? t("imageEdit")
				})
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
				onClick: () => {
					invoke();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dcsiv-label",
					children: state === "pending" ? `${label} ${progress}% · ${t("cancel")}` : label
				})]
			});
		}
		function SubscriptionImageViewerOverlay({ service, t }) {
			const request = (0, react.useSyncExternalStore)(service.subscribe, service.getSnapshot);
			const [index, setIndex] = (0, react.useState)(0);
			const [transform, setTransform] = (0, react.useState)({
				zoom: 1,
				x: 0,
				y: 0
			});
			const [dragging, setDragging] = (0, react.useState)(false);
			const [annotating, setAnnotating] = (0, react.useState)(false);
			const [annotationsByImage, setAnnotationsByImage] = (0, react.useState)(service.getAnnotationsSnapshot);
			const annotationsByImageRef = (0, react.useRef)(annotationsByImage);
			const [selected, setSelected] = (0, react.useState)();
			const [focusNote, setFocusNote] = (0, react.useState)();
			const [copied, setCopied] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			const stageRef = (0, react.useRef)(null);
			const surfaceRef = (0, react.useRef)(null);
			const imageRef = (0, react.useRef)(null);
			const pointersRef = (0, react.useRef)(/* @__PURE__ */ new Map());
			const gestureRef = (0, react.useRef)();
			const transformRef = (0, react.useRef)(transform);
			transformRef.current = transform;
			annotationsByImageRef.current = annotationsByImage;
			(0, react.useEffect)(() => {
				if (request === void 0) return;
				setIndex(request.index);
				setTransform({
					zoom: 1,
					x: 0,
					y: 0
				});
				setDragging(false);
				setAnnotating(false);
				setSelected(void 0);
				setCopied(false);
			}, [request?.revision]);
			const item = request?.items[index];
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
			const boundedPan = (0, react.useCallback)((zoom, x, y) => {
				const stage = stageRef.current;
				const surface = surfaceRef.current;
				if (stage === null || surface === null || zoom <= 1) return {
					x: 0,
					y: 0
				};
				const limitX = Math.max(0, (surface.offsetWidth * zoom - stage.clientWidth) / 2) + 28;
				const limitY = Math.max(0, (surface.offsetHeight * zoom - stage.clientHeight) / 2) + 28;
				return {
					x: clamp(x, -limitX, limitX),
					y: clamp(y, -limitY, limitY)
				};
			}, []);
			const setZoomAt = (0, react.useCallback)((nextZoom, clientX, clientY) => {
				const stage = stageRef.current;
				if (stage === null) return;
				setTransform((current) => {
					const next = clamp(nextZoom, .5, 8);
					const box = stage.getBoundingClientRect();
					const px = clientX - box.left - box.width / 2;
					const py = clientY - box.top - box.height / 2;
					const ratio = next / current.zoom;
					return {
						zoom: next,
						...boundedPan(next, px - (px - current.x) * ratio, py - (py - current.y) * ratio)
					};
				});
			}, [boundedPan]);
			const fit = (0, react.useCallback)(() => {
				setTransform({
					zoom: 1,
					x: 0,
					y: 0
				});
			}, []);
			const actual = (0, react.useCallback)(() => {
				const image = imageRef.current;
				const surface = surfaceRef.current;
				if (image === null || surface === null || image.naturalWidth === 0) return;
				const zoom = clamp(image.naturalWidth / Math.max(1, surface.offsetWidth), 1, 8);
				setTransform({
					zoom,
					x: 0,
					y: 0
				});
			}, []);
			(0, react.useEffect)(() => {
				if (request === void 0) return void 0;
				const previousOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				rootRef.current?.focus();
				const onKeyDown = (event) => {
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
				setTransform({
					zoom: 1,
					x: 0,
					y: 0
				});
				setDragging(false);
				setAnnotating(false);
				setSelected(void 0);
			}, [item?.id]);
			const onWheel = (0, react.useCallback)((event) => {
				event.preventDefault();
				setZoomAt(transformRef.current.zoom * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY);
			}, [setZoomAt]);
			(0, react.useEffect)(() => {
				const stage = stageRef.current;
				if (stage === null || request === void 0) return void 0;
				stage.addEventListener("wheel", onWheel, { passive: false });
				return () => stage.removeEventListener("wheel", onWheel);
			}, [onWheel, request]);
			const onPointerDown = (event) => {
				const target = event.target;
				if (event.button !== 0 || annotating || target instanceof Element && target.closest("button,textarea,input,a,select,[contenteditable=true]") !== null) return;
				pointersRef.current.set(event.pointerId, {
					x: event.clientX,
					y: event.clientY
				});
				if (pointersRef.current.size === 2) {
					event.currentTarget.setPointerCapture(event.pointerId);
					const [a, b] = [...pointersRef.current.values()];
					gestureRef.current = {
						kind: "pinch",
						distance: Math.hypot(a.x - b.x, a.y - b.y),
						transform
					};
				} else if (!annotating && transform.zoom > 1) {
					event.currentTarget.setPointerCapture(event.pointerId);
					gestureRef.current = {
						kind: "pan",
						x: event.clientX,
						y: event.clientY,
						transform
					};
					setDragging(true);
				}
			};
			const onPointerMove = (event) => {
				if (!pointersRef.current.has(event.pointerId)) return;
				pointersRef.current.set(event.pointerId, {
					x: event.clientX,
					y: event.clientY
				});
				const gesture = gestureRef.current;
				if (gesture?.kind === "pinch" && pointersRef.current.size >= 2) {
					const [a, b] = [...pointersRef.current.values()];
					const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
					setZoomAt(gesture.transform.zoom * distance / Math.max(1, gesture.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
				} else if (gesture?.kind === "pan") {
					const pan = boundedPan(gesture.transform.zoom, gesture.transform.x + event.clientX - gesture.x, gesture.transform.y + event.clientY - gesture.y);
					setTransform({
						zoom: gesture.transform.zoom,
						...pan
					});
				}
			};
			const endPointer = (event) => {
				pointersRef.current.delete(event.pointerId);
				if (pointersRef.current.size === 0) {
					gestureRef.current = void 0;
					setDragging(false);
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
									className: "dcsiv-button",
									"data-active": annotating,
									"aria-label": annotating ? t("imageAnnotateCancel") : t("imageAnnotate"),
									"aria-pressed": annotating,
									onClick: () => setAnnotating((value) => !value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dcsiv-label",
										children: annotating ? t("imageAnnotateCancel") : t("imageAnnotate")
									})]
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
									className: "dcsiv-button",
									"aria-label": t("imageFit"),
									onClick: fit,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dcsiv-label",
										children: t("imageFit")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dcsiv-button",
									onClick: actual,
									children: t("imageActual")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dcsiv-zoom",
									children: [Math.round(transform.zoom * 100), "%"]
								}),
								item.download === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
									className: "dcsiv-download",
									href: item.src,
									download: downloadName(item.name),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dcsiv-label",
										children: t("imageDownload")
									})]
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
									t
								}, action.id))
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dcsiv-close-floating",
						"aria-label": t("imageClosePreview"),
						onClick: () => service.close(),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcsiv-workspace",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
							ref: stageRef,
							className: "dcsiv-stage",
							"data-dragging": dragging,
							"data-annotating": annotating,
							onClick: (event) => {
								if (event.target === event.currentTarget && !annotating && transform.zoom === 1) service.close();
							},
							onPointerDown,
							onPointerMove,
							onPointerUp: endPointer,
							onPointerCancel: endPointer,
							onDoubleClick: () => {
								if (transform.zoom === 1) actual();
								else fit();
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								ref: surfaceRef,
								className: "dcsiv-surface",
								onClick: addAnnotation,
								style: { transform: `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.zoom})` },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									ref: imageRef,
									className: "dcsiv-image",
									src: item.src,
									alt: item.name,
									draggable: "false"
								}), annotations.map((annotation, position) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dcsiv-annotation",
									"data-x": annotation.x < .38 ? "right" : annotation.x > .62 ? "left" : "center",
									"data-y": annotation.y < .28 ? "down" : "up",
									style: {
										left: `${annotation.x * 100}%`,
										top: `${annotation.y * 100}%`,
										transform: `translate(-50%,-50%) scale(${1 / transform.zoom})`
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dcsiv-pin",
										"data-active": selected === annotation.id,
										"aria-label": fill$1(t("imageAnnotation"), { value: position + 1 }),
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
												"aria-label": fill$1(t("imageAnnotation"), { value: position + 1 }),
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
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {})
											})
										]
									}) : null]
								}, annotation.id))]
							}), showCounter ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dcsiv-button dcsiv-icon-only dcsiv-nav dcsiv-prev",
									"aria-label": t("imagePrevious"),
									onClick: (event) => {
										event.stopPropagation();
										setIndex((value) => (value - 1 + request.items.length) % request.items.length);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dcsiv-button dcsiv-icon-only dcsiv-nav dcsiv-next",
									"aria-label": t("imageNext"),
									onClick: (event) => {
										event.stopPropagation();
										setIndex((value) => (value + 1) % request.items.length);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
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
							}) : null]
						}), annotations.some((annotation) => annotation.note.trim() !== "") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dcsiv-copy-notes",
							onClick: () => {
								copyNotes();
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}), copied ? t("imageCopied") : t("imageCopyNotes")]
						}) : null]
					})
				]
			});
		}
		//#endregion
		//#region src/subscription-image-viewer.js
		const boundedNumber = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
		const downloadOf = (value) => typeof value?.onInvoke === "function" ? {
			pendingLabel: typeof value.pendingLabel === "string" && value.pendingLabel !== "" ? value.pendingLabel : void 0,
			errorLabel: typeof value.errorLabel === "string" && value.errorLabel !== "" ? value.errorLabel : void 0,
			onInvoke: value.onInvoke
		} : void 0;
		const actionsOf = (value) => Array.isArray(value) ? value.flatMap((action, position) => {
			if (typeof action?.onInvoke !== "function" || typeof action?.label !== "string" || action.label.trim() === "") return [];
			return [{
				id: typeof action.id === "string" && action.id !== "" ? action.id : `action-${position + 1}`,
				label: action.label,
				pendingLabel: typeof action.pendingLabel === "string" && action.pendingLabel !== "" ? action.pendingLabel : action.label,
				errorLabel: typeof action.errorLabel === "string" && action.errorLabel !== "" ? action.errorLabel : action.label,
				closeOnSuccess: action.closeOnSuccess === true,
				onInvoke: action.onInvoke
			}];
		}) : [];
		function normalizeSubscriptionViewerRequest(request) {
			const items = (Array.isArray(request?.items) ? request.items : []).flatMap((item, position) => {
				if (typeof item?.src !== "string" || item.src === "") return [];
				return [{
					id: typeof item.id === "string" && item.id !== "" ? item.id : `image-${position + 1}`,
					src: item.src,
					name: typeof item.name === "string" && item.name !== "" ? item.name : `Image ${position + 1}`,
					width: boundedNumber(item.width, void 0),
					height: boundedNumber(item.height, void 0),
					bytes: boundedNumber(item.bytes, void 0),
					download: downloadOf(item.download),
					actions: actionsOf(item.actions)
				}];
			});
			if (items.length === 0) return void 0;
			const requestedIndex = Number.isInteger(request?.index) ? request.index : 0;
			return {
				items,
				index: Math.max(0, Math.min(items.length - 1, requestedIndex)),
				opener: typeof HTMLElement !== "undefined" && request?.opener instanceof HTMLElement ? request.opener : void 0,
				source: typeof request?.source === "string" ? request.source : "dsh-codex-subscription",
				annotations: request?.annotations !== false
			};
		}
		const copyAnnotations = (annotations) => annotations.map((annotation) => ({ ...annotation }));
		/**
		* Local image viewer state for subscription-generated images.
		*
		* This stays private to subscription image cards, which need annotation and
		* edit actions that a host's generic native viewer may not implement.
		*/
		var SubscriptionImageViewerService = class {
			#listeners = /* @__PURE__ */ new Set();
			#revision = 0;
			#snapshot;
			#annotationsByImage = /* @__PURE__ */ new Map();
			constructor() {
				this.subscribe = (listener) => {
					this.#listeners.add(listener);
					return () => {
						this.#listeners.delete(listener);
					};
				};
				this.getSnapshot = () => this.#snapshot;
				this.getAnnotationsSnapshot = () => Object.fromEntries([...this.#annotationsByImage].map(([id, annotations]) => [id, copyAnnotations(annotations)]));
			}
			setAnnotations(imageId, annotations) {
				if (typeof imageId !== "string" || imageId === "" || !Array.isArray(annotations)) return;
				if (annotations.length === 0) this.#annotationsByImage.delete(imageId);
				else this.#annotationsByImage.set(imageId, copyAnnotations(annotations));
			}
			open(request) {
				const normalized = normalizeSubscriptionViewerRequest(request);
				if (normalized === void 0) return false;
				this.#revision += 1;
				this.#snapshot = {
					...normalized,
					revision: this.#revision
				};
				this.#emit();
				return true;
			}
			close() {
				if (this.#snapshot === void 0) return;
				const opener = this.#snapshot.opener;
				this.#snapshot = void 0;
				this.#emit();
				if (typeof window === "undefined") opener?.focus();
				else {
					const focus = () => {
						opener?.focus();
					};
					if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focus);
					else focus();
				}
			}
			#emit() {
				for (const listener of this.#listeners) listener();
			}
		};
		//#endregion
		//#region src/image-models.js
		const DEFAULT_IMAGE_MODEL = "gpt-image-2";
		const IMAGE_MODELS = Object.freeze({
			"gpt-image-2": Object.freeze([
				"auto",
				"low",
				"medium",
				"high"
			]),
			"gpt-image-2.5-flare": Object.freeze([
				"auto",
				"low",
				"medium",
				"high",
				"xhigh",
				"max"
			]),
			"gpt-image-2.5-sunburst": Object.freeze([
				"auto",
				"low",
				"medium",
				"high",
				"xhigh",
				"max"
			])
		});
		//#endregion
		//#region src/image-features.js
		const IMAGE_FEATURE_DEFAULTS = Object.freeze({
			imageGeneration: true,
			imageShortcut: true,
			imageEditing: true,
			imageViewer: true,
			imageAnnotations: true,
			imageSketch: true,
			imageTemplates: true,
			imageGallery: true,
			imageCompare: true
		});
		function readImageFeatures(value = {}) {
			return Object.fromEntries(Object.entries(IMAGE_FEATURE_DEFAULTS).map(([key, fallback]) => [key, typeof value?.[key] === "boolean" ? value[key] : fallback]));
		}
		function readImageDefaults(value = {}) {
			const imageModel = Object.hasOwn(IMAGE_MODELS, value?.imageModel) ? value.imageModel : DEFAULT_IMAGE_MODEL;
			return {
				imageModel,
				imageQuality: IMAGE_MODELS[imageModel].includes(value?.imageQuality) ? value.imageQuality : "auto"
			};
		}
		//#endregion
		//#region src/capability-settings.js
		const CUSTOM_CONTEXT_OVERRIDES_FIELD = "customContextModels";
		const SEARCH_MODE_FIELD = "searchMode";
		const SEARCH_DOMAINS_FIELD = "searchDomains";
		const QUOTA_ALERTS_FIELD = "quotaAlerts";
		const SEARCH_MODES = [
			"live",
			"cached",
			"disabled"
		];
		const QUOTA_ALERT_MODES = [
			"off",
			"important",
			"early"
		];
		const validModelKey = (key) => typeof key === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,95}$/u.test(key) && ![
			"constructor",
			"prototype",
			"__proto__"
		].includes(key);
		function normalizeContextOverrides(value) {
			if (!value || typeof value !== "object" || Array.isArray(value)) return {};
			return Object.fromEntries(Object.entries(value).filter(([key, size]) => validModelKey(key) && Number.isSafeInteger(size) && size > 0 && size <= 16e6).slice(0, 64));
		}
		function normalizeSearchDomains(value) {
			if (!Array.isArray(value) || value.length > 20) throw new Error("Invalid search domains");
			return [...new Set(value.map((item) => {
				if (typeof item !== "string" || item.length > 253 || !/^[\p{L}\p{N}.-]+$/u.test(item)) throw new Error("Invalid search domain");
				const hostname = new URL(`https://${item}`).hostname.toLowerCase();
				if (!hostname.includes(".") || hostname.split(".").some((part) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(part))) throw new Error("Invalid search domain");
				return hostname;
			}))];
		}
		function readCapabilitySettings(value = {}) {
			return {
				...readImageFeatures(value),
				...readImageDefaults(value),
				[CUSTOM_CONTEXT_OVERRIDES_FIELD]: normalizeContextOverrides(value[CUSTOM_CONTEXT_OVERRIDES_FIELD]),
				[SEARCH_MODE_FIELD]: SEARCH_MODES.includes(value["searchMode"]) ? value[SEARCH_MODE_FIELD] : "live",
				[SEARCH_DOMAINS_FIELD]: normalizeSearchDomains(value["searchDomains"] ?? []),
				[QUOTA_ALERTS_FIELD]: QUOTA_ALERT_MODES.includes(value["quotaAlerts"]) ? value[QUOTA_ALERTS_FIELD] : "important"
			};
		}
		function quotaWarning(usage, mode = "important", now = Date.now()) {
			if (mode === "off" || !Number.isFinite(usage?.fetchedAt) || usage.fetchedAt > now || now - usage.fetchedAt > 5 * 6e4) return void 0;
			return (usage.rateLimits ?? []).filter((limit) => limit.id !== "code_review").flatMap((limit) => (limit.windows ?? []).map((window) => ({
				...window,
				limitId: limit.id
			}))).filter((window) => Number.isFinite(window.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= (mode === "early" && window.windowSeconds > 0 && window.windowSeconds <= 6 * 3600 ? 50 : 20) && (!Number.isFinite(window.resetsAt) || window.resetsAt * 1e3 > now)).sort((a, b) => a.remainingPercent - b.remainingPercent)[0];
		}
		//#endregion
		//#region src/settings-contract.js
		const SETTINGS_NAMESPACE = "codex-subscription";
		const QUICK_QUOTA_MODE_FIELD = "quickQuotaMode";
		const LEGACY_QUICK_QUOTA_FIELD = "quickQuotaVisible";
		const QUICK_QUOTA_MODE_PERCENT = "percent";
		const QUICK_QUOTA_MODE_FORECAST = "forecast";
		const SEARCH_PROVIDER_FIELD = "searchProvider";
		const SEARCH_PROVIDER_AUTO = "auto";
		const SEARCH_PROVIDER_CODEX = "codex";
		const DEFAULT_SEARCH_PROVIDER = SEARCH_PROVIDER_AUTO;
		const SPEED_MODE_FIELD = "speedMode";
		const SPEED_MODE_STANDARD = "standard";
		const SPEED_MODE_FAST = "fast";
		const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD;
		const OUTPUT_VERBOSITY_FIELD = "outputVerbosity";
		const OUTPUT_VERBOSITY_DEFAULT = "default";
		const OUTPUT_VERBOSITY_MEDIUM = "medium";
		const OUTPUT_VERBOSITY_HIGH = "high";
		const DEFAULT_OUTPUT_VERBOSITY = OUTPUT_VERBOSITY_DEFAULT;
		const CONTEXT_MODE_FIELD = "contextMode";
		const CONTEXT_MODE_STANDARD = "standard";
		const CONTEXT_MODE_EXTENDED = "extended";
		const CONTEXT_MODE_CUSTOM = "custom";
		const DEFAULT_CONTEXT_MODE = CONTEXT_MODE_STANDARD;
		const CUSTOM_CONTEXT_WINDOW_FIELD = "customContextWindow";
		const DEFAULT_CUSTOM_CONTEXT_WINDOW = 272e3;
		const MIN_CUSTOM_CONTEXT_WINDOW = 128e3;
		const MAX_CUSTOM_CONTEXT_WINDOW = 1e6;
		const CUSTOM_CONTEXT_MODEL_FIELDS = Object.freeze({
			"gpt-5.4": "customContextGpt54",
			"gpt-5.4-mini": "customContextGpt54Mini",
			"gpt-5.5": "customContextGpt55",
			"gpt-5.6": "customContextGpt56",
			"gpt-6-astra": "customContextGpt6Astra"
		});
		const CUSTOM_CONTEXT_MODEL_CAPS = Object.freeze({
			"gpt-5.4": 1e6,
			"gpt-5.4-mini": 4e5,
			"gpt-5.5": 1e6,
			"gpt-5.6": 1e6,
			"gpt-6-astra": 872e3
		});
		const CUSTOM_CONTEXT_MODEL_DEFAULTS = Object.freeze({
			"gpt-5.4": 272e3,
			"gpt-5.4-mini": 272e3,
			"gpt-5.5": 272e3,
			"gpt-5.6": 272e3,
			"gpt-6-astra": 272e3
		});
		const normalizeSearchProvider = (value) => [
			"auto",
			"dsh",
			"codex"
		].includes(value) ? value : DEFAULT_SEARCH_PROVIDER;
		const normalizeOutputVerbosity = (value) => [
			"default",
			"low",
			"medium",
			"high"
		].includes(value) ? value : DEFAULT_OUTPUT_VERBOSITY;
		const normalizeSpeedMode = (value) => ["standard", "fast"].includes(value) ? value : DEFAULT_SPEED_MODE;
		const normalizeContextMode = (value) => [
			"standard",
			"extended",
			"custom"
		].includes(value) ? value : DEFAULT_CONTEXT_MODE;
		const normalizeCustomContextWindow = (value, maximum = MAX_CUSTOM_CONTEXT_WINDOW) => {
			if (!Number.isInteger(value)) return DEFAULT_CUSTOM_CONTEXT_WINDOW;
			return Math.min(Math.max(value, MIN_CUSTOM_CONTEXT_WINDOW), maximum);
		};
		const formatContextWindow = (value) => value === 1e6 ? "1M" : `${Math.round(value / 1e3)}K`;
		const parseContextWindow = (value) => {
			const match = /^\s*(\d+)\s*$/u.exec(String(value));
			if (match === null) return NaN;
			return Number(match[1]);
		};
		function clampModelContext(value, maximum, fallback = DEFAULT_CUSTOM_CONTEXT_WINDOW) {
			return Math.max(Math.min(MIN_CUSTOM_CONTEXT_WINDOW, maximum), Math.min(Number.isSafeInteger(value) ? value : fallback, maximum));
		}
		const normalizeQuickQuotaMode = (value, legacyVisible = false) => [
			"off",
			"percent",
			"bar",
			"forecast"
		].includes(value) ? value : legacyVisible === true ? QUICK_QUOTA_MODE_PERCENT : "off";
		const supportsCodexFastMode = (modelId) => typeof modelId === "string" && (/^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === "gpt-5.4" || modelId === "gpt-6-astra");
		//#endregion
		//#region src/preference-controller.js
		function createPreferenceController(scope, rpc) {
			let updating = false;
			let error = false;
			let fallbackStatus = "loading";
			let fallback;
			let pendingPatch;
			let failedPatch;
			let generation = 0;
			let contextModels = [];
			let verbosityModels = [];
			let fastModels;
			let catalogStatus;
			let modelsLoading = false;
			let modelError = false;
			let modelRefreshGeneration = 0;
			let modelRefreshStarted = false;
			let disposed = false;
			const sameModels = (left, right) => left.length === right.length && left.every((model, index) => JSON.stringify(model) === JSON.stringify(right[index]));
			const nativeSnapshot = () => scope.getSnapshot();
			const read = () => {
				const native = nativeSnapshot();
				const current = native.status === "ready" ? native : fallbackStatus === "ready" ? fallback : native;
				const value = pendingPatch === void 0 ? current.value : {
					...current.value,
					...pendingPatch
				};
				const capabilities = readCapabilitySettings(value);
				return Object.freeze({
					status: current.status,
					...capabilities,
					quickQuotaMode: normalizeQuickQuotaMode(value?.[QUICK_QUOTA_MODE_FIELD], value?.[LEGACY_QUICK_QUOTA_FIELD]),
					searchProvider: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
					speedMode: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
					outputVerbosity: normalizeOutputVerbosity(value?.[OUTPUT_VERBOSITY_FIELD]),
					contextMode: normalizeContextMode(value?.[CONTEXT_MODE_FIELD]),
					customContextWindow: normalizeCustomContextWindow(value?.[CUSTOM_CONTEXT_WINDOW_FIELD]),
					customContextWindows: {
						...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [modelKey, normalizeCustomContextWindow(value?.[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
						...Object.fromEntries(contextModels.map((model) => [model.key, clampModelContext(capabilities["customContextModels"][model.key] ?? value?.[CUSTOM_CONTEXT_MODEL_FIELDS[model.key]], model.maximum, model.default ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[model.key])]))
					},
					contextModels,
					verbosityModels,
					fastModels,
					catalogStatus,
					modelsLoading,
					modelError,
					writable: !updating && current.status === "ready" && current.writable === true,
					saving: updating,
					error
				});
			};
			let snapshot = read();
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				snapshot = read();
				for (const listener of listeners) listener();
			};
			const disposeScope = scope.subscribe(() => {
				error = false;
				if (!updating) failedPatch = void 0;
				publish();
			});
			const acceptFallback = (value) => {
				if (!modelRefreshStarted) {
					contextModels = Array.isArray(value?.contextModels) ? value.contextModels : [];
					verbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : [];
					fastModels = Array.isArray(value?.fastModels) ? value.fastModels : void 0;
					catalogStatus = value?.catalogStatus;
				}
				fallbackStatus = "ready";
				fallback = {
					status: "ready",
					value: {
						...readCapabilitySettings(value),
						[QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(value?.[QUICK_QUOTA_MODE_FIELD], value?.[LEGACY_QUICK_QUOTA_FIELD]),
						[SEARCH_PROVIDER_FIELD]: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
						[SPEED_MODE_FIELD]: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
						[OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(value?.[OUTPUT_VERBOSITY_FIELD]),
						[CONTEXT_MODE_FIELD]: normalizeContextMode(value?.[CONTEXT_MODE_FIELD]),
						[CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(value?.[CUSTOM_CONTEXT_WINDOW_FIELD]),
						...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(value?.[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])]))
					},
					writable: value?.writable === true
				};
			};
			const load = async () => {
				const current = ++generation;
				updating = false;
				pendingPatch = void 0;
				fallbackStatus = "loading";
				fallback = void 0;
				error = false;
				publish();
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/status", {}));
					if (current !== generation || disposed) return;
					if (nativeSnapshot().status === "ready") {
						if (!modelRefreshStarted) {
							contextModels = Array.isArray(value?.contextModels) ? value.contextModels : [];
							verbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : [];
							fastModels = Array.isArray(value?.fastModels) ? value.fastModels : void 0;
							catalogStatus = value?.catalogStatus;
						}
					} else acceptFallback(value);
					publish();
				} catch {
					if (current !== generation || disposed || nativeSnapshot().status === "ready") return;
					fallbackStatus = "unavailable";
					publish();
				}
			};
			const refreshModels = async () => {
				const current = ++modelRefreshGeneration;
				modelRefreshStarted = true;
				modelError = false;
				modelsLoading = true;
				publish();
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/models", {}));
					if (disposed || current !== modelRefreshGeneration) return false;
					const nextContextModels = Array.isArray(value?.contextModels) ? value.contextModels : [];
					const nextVerbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : [];
					const nextFastModels = Array.isArray(value?.fastModels) ? value.fastModels : void 0;
					catalogStatus = value?.catalogStatus;
					const changed = !sameModels(contextModels, nextContextModels) || !sameModels(verbosityModels, nextVerbosityModels) || JSON.stringify(fastModels) !== JSON.stringify(nextFastModels);
					if (changed) {
						contextModels = nextContextModels;
						verbosityModels = nextVerbosityModels;
						fastModels = nextFastModels;
						publish();
					}
					return changed;
				} catch {
					if (disposed || current !== modelRefreshGeneration) return false;
					if (!modelError) {
						modelError = true;
						publish();
					}
					return false;
				} finally {
					if (!disposed && current === modelRefreshGeneration) {
						modelsLoading = false;
						publish();
					}
				}
			};
			const set = async (patch) => {
				if (disposed || snapshot.status !== "ready" || snapshot.writable !== true) return;
				const current = ++generation;
				const entries = Object.entries(patch);
				updating = true;
				pendingPatch = patch;
				error = false;
				failedPatch = void 0;
				publish();
				try {
					if (nativeSnapshot().status === "ready") {
						for (const [field, value] of entries) {
							if (current !== generation) return;
							await scope.set(field, value);
						}
						if (current !== generation) return;
						const accepted = nativeSnapshot().value;
						error = entries.some(([field, value]) => JSON.stringify(accepted?.[field]) !== JSON.stringify(value));
						if (error) failedPatch = patch;
						pendingPatch = void 0;
					} else {
						const value = unwrap(await rpc.call(CHANNEL, "preferences/update", patch));
						if (current !== generation) return;
						acceptFallback(value);
						pendingPatch = void 0;
					}
				} catch {
					if (current === generation) {
						pendingPatch = void 0;
						error = true;
						failedPatch = patch;
					}
				} finally {
					if (current === generation) {
						updating = false;
						publish();
					}
				}
			};
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load,
				set,
				retry: () => failedPatch === void 0 ? load() : set(failedPatch),
				refreshModels,
				dispose: () => {
					disposed = true;
					generation += 1;
					modelRefreshGeneration += 1;
					disposeScope();
				}
			};
		}
		//#endregion
		//#region src/account-status-controller.js
		const DEFAULT_TIMEOUT_MS = 1e4;
		const STATUS_ERROR_CODES = /* @__PURE__ */ new Set([
			"credential-unavailable",
			"credential-malformed",
			"transport",
			"timeout",
			"unknown"
		]);
		const STATUS_ERROR_MESSAGES = /* @__PURE__ */ new Map([
			["Codex account credentials are unavailable", "credential-unavailable"],
			["Codex account credentials are malformed", "credential-malformed"],
			["Codex account status service is unavailable", "transport"],
			["Could not read Codex account status", "unknown"]
		]);
		const TIMEOUT_CODES = /* @__PURE__ */ new Set([
			"TIMEOUT",
			"ETIMEDOUT",
			"ERR_TIMEOUT",
			"UND_ERR_CONNECT_TIMEOUT"
		]);
		const TRANSPORT_CODES = /* @__PURE__ */ new Set([
			"ECONNRESET",
			"ECONNREFUSED",
			"ENOTFOUND",
			"EAI_AGAIN",
			"NETWORK",
			"NETWORK_ERROR",
			"TRANSPORT",
			"CONNECTION_CLOSED",
			"DISCONNECTED"
		]);
		const asCode = (value) => typeof value === "string" ? value.trim().toLowerCase() : void 0;
		function rpcError(response) {
			const code = asCode(response?.error?.code);
			const message = typeof response?.error?.message === "string" ? response.error.message : "";
			const error = /* @__PURE__ */ new Error("Codex account status request failed");
			error.code = code === "internal" && STATUS_ERROR_MESSAGES.has(message) ? STATUS_ERROR_MESSAGES.get(message) : "unknown";
			return error;
		}
		function timeoutError() {
			const error = /* @__PURE__ */ new Error("Codex account status request timed out");
			error.code = "timeout";
			error.name = "TimeoutError";
			return error;
		}
		function classifyAccountStatusError(error) {
			const code = typeof error?.code === "string" ? error.code.trim().toUpperCase() : "";
			if (code === "TIMEOUT" || TIMEOUT_CODES.has(code) || error?.name === "TimeoutError") return "timeout";
			if (STATUS_ERROR_CODES.has(asCode(error?.code))) return asCode(error.code);
			if (TRANSPORT_CODES.has(code) || error?.name === "NetworkError") return "transport";
			return "unknown";
		}
		function publicAccountStatusError(error) {
			return Object.freeze({ code: classifyAccountStatusError(error) });
		}
		/** Own the account-status request lifecycle independently from account actions. */
		function createAccountStatusController(rpc, options = {}) {
			const request = options.request ?? (() => rpc.call("/codex-subscription", "status", {}));
			const scheduleTimeout = options.setTimeout ?? setTimeout;
			const cancelTimeout = options.clearTimeout ?? clearTimeout;
			const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Account status timeout must be positive");
			let snapshot = Object.freeze({
				status: "loading",
				account: void 0,
				error: void 0,
				retrying: false
			});
			let generation = 0;
			let active;
			let disposed = false;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				snapshot = Object.freeze(next);
				for (const listener of [...listeners]) listener();
			};
			const load = () => {
				if (disposed) return Promise.resolve(void 0);
				if (active !== void 0) return active.promise;
				const id = ++generation;
				const retrying = snapshot.error !== void 0;
				publish({
					status: retrying ? "error" : "loading",
					account: retrying ? snapshot.account : void 0,
					error: retrying ? snapshot.error : void 0,
					retrying: true
				});
				const controller = new AbortController();
				let timer;
				let onAbort;
				const cancelled = new Promise((resolve, reject) => {
					onAbort = () => reject(controller.signal.reason);
					controller.signal.addEventListener("abort", onAbort, { once: true });
					if (controller.signal.aborted) onAbort();
				});
				const timeout = new Promise((resolve, reject) => {
					timer = scheduleTimeout(() => {
						const error = timeoutError();
						controller.abort(error);
						reject(error);
					}, timeoutMs);
				});
				const work = Promise.resolve().then(() => request(controller.signal)).then((response) => {
					if (!response?.ok) throw rpcError(response);
					return response.value;
				});
				const promise = Promise.race([
					work,
					timeout,
					cancelled
				]).then((account) => {
					if (disposed || id !== generation || controller.signal.aborted) return void 0;
					if (account === null || typeof account !== "object" || Array.isArray(account) || typeof account.authenticated !== "boolean") throw new Error("Invalid account status");
					publish({
						status: "ready",
						account,
						error: void 0,
						retrying: false
					});
					return account;
				}).catch((error) => {
					if (disposed || id !== generation || controller.signal.aborted && error?.code !== "timeout") return void 0;
					publish({
						status: "error",
						account: void 0,
						error: publicAccountStatusError(error),
						retrying: false
					});
				}).finally(() => {
					cancelTimeout(timer);
					controller.signal.removeEventListener("abort", onAbort);
					if (active?.id === id) active = void 0;
				});
				active = {
					id,
					controller,
					promise
				};
				return promise;
			};
			const acceptAccount = (account) => {
				if (disposed) return false;
				generation += 1;
				active?.controller.abort(/* @__PURE__ */ new Error("Account status superseded by an account action"));
				active = void 0;
				publish({
					status: "ready",
					account,
					error: void 0,
					retrying: false
				});
				return true;
			};
			const reload = () => {
				if (disposed) return Promise.resolve(void 0);
				if (active !== void 0) {
					generation += 1;
					active.controller.abort(/* @__PURE__ */ new Error("Account status reload superseded the previous request"));
					active = void 0;
				}
				return load();
			};
			const dispose = () => {
				if (disposed) return;
				disposed = true;
				generation += 1;
				active?.controller.abort(/* @__PURE__ */ new Error("Account status controller disposed"));
				active = void 0;
				listeners.clear();
			};
			return Object.freeze({
				getSnapshot: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load,
				retry: load,
				reload,
				acceptAccount,
				dispose
			});
		}
		//#endregion
		//#region src/client-shared.js
		const NS = "settings.codexSubscription";
		const SUPPORT_ISSUE_URL = "https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml";
		const QUICK_QUOTA_REFRESH_EVENT = "dsh-codex-subscription:refresh-quick-quota";
		const QUICK_QUOTA_REFRESH_MS = 6e4;
		const accountStatusErrorText = (error, t) => {
			const key = {
				"credential-unavailable": "accountCredentialUnavailable",
				"credential-malformed": "accountCredentialMalformed",
				timeout: "accountStatusTimeout",
				transport: "accountStatusTransport",
				unknown: "accountStatusUnknown"
			}[error?.code];
			return t(key ?? "accountStatusUnknown");
		};
		const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text);
		const maskEmail = (value) => {
			if (typeof value !== "string" || !value.includes("@")) return "••••";
			const [local, domain] = value.split("@", 2);
			if (local.length <= 2) return `${local.slice(0, 1)}••@${domain}`;
			return `${local[0]}•••${local.at(-1)}@${domain}`;
		};
		const hours = (seconds) => Math.round(seconds / 3600 * 10) / 10;
		const percent = (value) => Number(value).toLocaleString(void 0, { maximumFractionDigits: 1 });
		const isApproximateWindow = (seconds, expected) => seconds >= expected * .95 && seconds <= expected * 1.05;
		const windowLabel = (seconds, t) => {
			if (isApproximateWindow(seconds, 18e3)) return t("windowFiveHours");
			if (isApproximateWindow(seconds, 86400)) return t("windowDaily");
			if (isApproximateWindow(seconds, 604800)) return t("windowWeekly");
			if (isApproximateWindow(seconds, 2592e3)) return t("windowMonthly");
			if (isApproximateWindow(seconds, 31536e3)) return t("windowAnnual");
			return seconds >= 86400 && seconds % 86400 === 0 ? fill(t("windowDays"), { value: seconds / 86400 }) : fill(t("windowHours"), { value: hours(seconds) });
		};
		const validDate = (value) => {
			const date = new Date(value);
			return Number.isFinite(date.getTime()) ? date : void 0;
		};
		const usePreferenceSnapshot = (preference) => (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
		const useAccountStatusSnapshot = (accountStatus) => (0, react.useSyncExternalStore)(accountStatus.subscribe, accountStatus.getSnapshot);
		const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT));
		const formatRunway = (seconds, t) => {
			if (!Number.isFinite(seconds) || seconds <= 0) return void 0;
			const minutes = Math.max(1, Math.round(seconds / 60));
			const days = Math.floor(minutes / 1440);
			const hours = Math.floor(minutes % 1440 / 60);
			if (days > 0) return hours > 0 ? fill(t("runwayDaysHours"), {
				days,
				hours
			}) : fill(t("runwayDays"), { days });
			if (hours > 0) return fill(t("runwayHours"), { hours });
			return fill(t("runwayMinutes"), { minutes });
		};
		const formatQuotaForecast = (forecast, t) => {
			if (forecast?.status === "calibrating") return t("quotaForecastCalibrating");
			if (forecast?.status === "idle") return t("quotaForecastIdle");
			if (forecast?.status !== "ready") return void 0;
			if (forecast.survivesReset) return t("quotaForecastUntilReset");
			const duration = formatRunway(forecast.runwaySeconds, t);
			return duration === void 0 ? void 0 : fill(t("quotaForecast"), {
				symbol: "≈",
				duration
			});
		};
		//#endregion
		//#region src/sidebar-quota.js
		const isDisplayableWindow = (window) => Number.isFinite(window?.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100 && Number.isFinite(window?.windowSeconds) && window.windowSeconds > 0;
		const normalized = (value) => String(value ?? "").toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/gu, "-");
		const limitMatchesModel = (limit, model) => {
			if (/\bspark\b/u.test(normalized(model))) return /\bspark\b/u.test(normalized(`${limit?.id ?? ""} ${limit?.name ?? ""}`));
			return limit?.id === "codex";
		};
		function selectModelQuotaWindows(usage, model) {
			return (Array.isArray(usage?.rateLimits) ? usage.rateLimits.filter((limit) => limitMatchesModel(limit, model) && Array.isArray(limit.windows)).flatMap((limit) => limit.windows).filter(isDisplayableWindow) : []).map((selected) => ({
				remainingPercent: selected.remainingPercent,
				windowSeconds: selected.windowSeconds,
				...Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {},
				...selected.forecast === void 0 ? {} : { forecast: selected.forecast }
			})).sort((a, b) => a.windowSeconds - b.windowSeconds);
		}
		//#endregion
		//#region src/client-quota.jsx
		function useQuickQuota(rpc, enabled, model) {
			const [quota, setQuota] = (0, react.useState)();
			(0, react.useEffect)(() => {
				if (!enabled) {
					setQuota(void 0);
					return;
				}
				let live = true;
				let loading = false;
				const load = async () => {
					if (loading) return;
					loading = true;
					try {
						const account = unwrap(await rpc.call(CHANNEL, "status", {}));
						if (!live) return;
						if (account?.authenticated !== true) {
							setQuota(void 0);
							return;
						}
						const usage = unwrap(await rpc.call(CHANNEL, "usage", { force: false }));
						if (live) setQuota(selectModelQuotaWindows(usage, model));
					} catch {
						if (live) setQuota(void 0);
					} finally {
						loading = false;
					}
				};
				const refresh = () => {
					load();
				};
				load();
				const timer = window.setInterval(refresh, QUICK_QUOTA_REFRESH_MS);
				window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh);
				return () => {
					live = false;
					window.clearInterval(timer);
					window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh);
				};
			}, [
				rpc,
				enabled,
				model
			]);
			return quota;
		}
		//#endregion
		//#region src/client-composer-quota.jsx
		function CodexComposerQuota({ preference, rpc, t, directory }) {
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const current = (0, react.useSyncExternalStore)((listener) => directory.subscribe(listener), () => directory.getSnapshot()).current;
			const codex = current?.provider === "openai-codex";
			const quotaEnabled = preferenceSnapshot.status === "ready" && preferenceSnapshot.quickQuotaMode !== "off" && codex;
			const forecastMode = preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST;
			const quotas = useQuickQuota(rpc, quotaEnabled, current?.model);
			if (!quotaEnabled || quotas === void 0 || quotas.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "codexComposerQuotaWindows",
				children: quotas.map((quota, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexComposerQuotaWindow, {
					quota,
					mode: preferenceSnapshot.quickQuotaMode,
					forecastMode,
					t
				}, `${quota.windowSeconds}-${index}`))
			});
		}
		function CodexComposerQuotaWindow({ quota, mode, forecastMode, t }) {
			const value = Math.round(Number(quota.remainingPercent) * 10) / 10;
			const display = percent(value);
			const forecast = forecastMode ? quota.forecast : void 0;
			const duration = forecast?.status === "ready" && !forecast.survivesReset ? formatRunway(forecast.runwaySeconds, t) : void 0;
			const label = forecast?.status === "calibrating" ? fill(t("quickQuotaForecastCalibratingStatus"), { value: display }) : forecast?.status === "idle" ? fill(t("quickQuotaForecastIdleStatus"), { value: display }) : forecast?.status === "ready" && forecast.survivesReset ? fill(t("quickQuotaForecastUntilResetStatus"), { value: display }) : duration === void 0 ? fill(t("quickQuotaStatus"), { value: display }) : fill(t("quickQuotaForecastStatus"), {
				value: display,
				duration
			});
			const content = mode === "bar" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
				className: "codexComposerQuotaBar",
				max: 100,
				value,
				"aria-hidden": "true"
			}) : forecast?.status === "calibrating" ? `${display}% · ${t("quickQuotaForecastCalibrating")}` : forecast?.status === "idle" ? `${display}% · ${t("quickQuotaForecastIdle")}` : forecast?.status === "ready" && forecast.survivesReset ? `${display}% · ${t("quickQuotaForecastUntilReset")}` : forecastMode && duration !== void 0 ? `${display}% · ≈${duration}` : `${display}%`;
			const durationLabel = windowLabel(quota.windowSeconds, t);
			const accessibleLabel = `${durationLabel}: ${label}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "codexComposerQuota",
				role: "status",
				"aria-label": accessibleLabel,
				title: accessibleLabel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: durationLabel }), content]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/16/solid/esm/BoltIcon.js
		function BoltIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				viewBox: "0 0 16 16",
				fill: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				fillRule: "evenodd",
				d: "M9.58 1.077a.75.75 0 0 1 .405.82L9.165 6h4.085a.75.75 0 0 1 .567 1.241l-6.5 7.5a.75.75 0 0 1-1.302-.638L6.835 10H2.75a.75.75 0 0 1-.567-1.241l6.5-7.5a.75.75 0 0 1 .897-.182Z",
				clipRule: "evenodd"
			}));
		}
		const ForwardRef = /*#__PURE__*/ react.forwardRef(BoltIcon);
		//#endregion
		//#region src/client-model-select.jsx
		function CodexModelSelect({ locked, available, directory, load, select, preference, t }) {
			const state = (0, react.useSyncExternalStore)(directory.subscribe, directory.getSnapshot);
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: {
					provider: group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [state.groups]);
			const currentChoice = choices.find((choice) => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model);
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const modelLabel = currentChoice?.model.name ?? t("selectModel");
			const speedSupported = state.current?.provider === "openai-codex" && (preferenceSnapshot.fastModels?.includes(state.current?.model) ?? supportsCodexFastMode(state.current?.model));
			const speedWritable = preferenceSnapshot.status === "ready" && preferenceSnapshot.writable === true;
			const fast = speedSupported && preferenceSnapshot.speedMode === "fast";
			const verbositySupported = state.current?.provider === "openai-codex" && preferenceSnapshot.verbosityModels.includes(state.current?.model);
			const verbosityWritable = preferenceSnapshot.status === "ready" && preferenceSnapshot.writable === true;
			const verbosityItems = [
				{
					id: OUTPUT_VERBOSITY_DEFAULT,
					label: t("verbosityDefault"),
					description: t("verbosityDefaultHint")
				},
				{
					id: "low",
					label: t("verbosityLow"),
					description: t("verbosityLowHint")
				},
				{
					id: OUTPUT_VERBOSITY_MEDIUM,
					label: t("verbosityMedium"),
					description: t("verbosityMediumHint")
				},
				{
					id: OUTPUT_VERBOSITY_HIGH,
					label: t("verbosityHigh"),
					description: t("verbosityHighHint")
				}
			];
			const verbosityLabel = verbosityItems.find((item) => item.id === preferenceSnapshot.outputVerbosity)?.label ?? t("verbosityDefault");
			const busy = state.status === "selecting";
			(0, react.useEffect)(() => {
				if (available) load();
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) {
						setOpen(false);
						setPane("root");
					}
				};
				document.addEventListener("mousedown", closeOutside);
				return () => document.removeEventListener("mousedown", closeOutside);
			}, [open]);
			(0, react.useEffect)(() => {
				if (!speedSupported && pane === "speed") setPane("root");
				if (!verbositySupported && pane === "verbosity") setPane("root");
			}, [
				pane,
				speedSupported,
				verbositySupported
			]);
			if (!available) return null;
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
			};
			const settleSelection = (accepted) => {
				if (accepted) close(true);
			};
			const chooseModel = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				select(selection).then(settleSelection);
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					close(true);
					return;
				}
				select({
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				}).then(settleSelection);
			};
			const chooseSpeed = (speedMode) => {
				close(true);
				preference.set({ [SPEED_MODE_FIELD]: speedMode });
			};
			const chooseVerbosity = (outputVerbosity) => {
				close(true);
				preference.set({ [OUTPUT_VERBOSITY_FIELD]: outputVerbosity });
			};
			const option = ({ key, label, description, selected, disabled, onClick }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitemradio",
				"aria-checked": selected,
				className: "codexModelSelectOption",
				disabled,
				onClick,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexModelSelectOptionCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectOptionName",
						children: label
					}), description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectOptionDescription",
						children: description
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "codexModelSelectCheck",
					children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null
				})]
			}, key);
			const cell = (target, label, value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitem",
				className: "codexModelSelectCell",
				"data-open": pane === target,
				"aria-haspopup": "menu",
				"aria-expanded": pane === target,
				onClick: () => setPane((current) => current === target ? "root" : target),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectCellLabel",
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectCellValue",
						children: value
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { className: "codexModelSelectCellChevron" })
				]
			});
			let submenu = null;
			if (pane === "model") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("modelLabel"),
				children: [
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectStatus",
						children: t("modelsLoading")
					}) : null,
					state.error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexModelSelectError",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("modelFailed"), { value: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "codexModelSelectRetry",
							type: "button",
							onClick: load,
							children: t("modelRetry")
						})]
					}),
					state.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectWarning",
						children: fill(t("groupFailed"), {
							name: failure.name,
							value: failure.message
						})
					}, failure.id)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectGroups scrollable",
						children: state.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "codexModelSelectGroup",
							role: "group",
							"aria-labelledby": `${id}-${group.id}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexModelSelectGroupTitle",
								id: `${id}-${group.id}`,
								children: group.name
							}), group.models.map((model) => option({
								key: model.id,
								label: model.name,
								description: model.description,
								selected: state.current?.provider === group.id && state.current.model === model.id,
								disabled: busy,
								onClick: () => chooseModel({
									provider: group.id,
									model: model.id
								})
							}))]
						}, group.id))
					}),
					state.status === "ready" && choices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectEmpty",
						children: t("modelsEmpty")
					}) : null
				]
			});
			else if (pane === "effort") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("effortLabel"),
				children: effortChoices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexModelSelectEmpty",
					children: t("effortsEmpty")
				}) : effortChoices.map((level) => option({
					key: level.key,
					label: level.label,
					description: level.description,
					selected: effectiveEffort === level.effort,
					disabled: busy,
					onClick: () => chooseEffort(level.effort)
				}))
			});
			else if (pane === "speed") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("speedTitle"),
				children: [option({
					key: SPEED_MODE_STANDARD,
					label: t("speedStandard"),
					description: t("speedStandardHint"),
					selected: !fast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed(SPEED_MODE_STANDARD)
				}), option({
					key: SPEED_MODE_FAST,
					label: t("speedFast"),
					description: t(state.current?.model === "gpt-6-astra" ? "speedFastAstraHint" : "speedFastHint"),
					selected: fast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed(SPEED_MODE_FAST)
				})]
			});
			else if (pane === "verbosity") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("verbosityTitle"),
				children: verbosityItems.map((item) => option({
					key: item.id,
					label: item.label,
					description: item.description,
					selected: preferenceSnapshot.outputVerbosity === item.id,
					disabled: !verbosityWritable,
					onClick: () => chooseVerbosity(item.id)
				}))
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelSelect",
				ref: rootRef,
				onKeyDown: (event) => {
					if (event.key !== "Escape" || !open) return;
					event.preventDefault();
					if (pane === "root") close(true);
					else setPane("root");
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: "codexModelSelectTrigger",
					"aria-label": modelLabel,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					"aria-controls": open ? `${id}-menu` : void 0,
					title: modelLabel,
					disabled: locked,
					onClick: () => open ? close() : (setPane("root"), setOpen(true), load()),
					children: [
						fast && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForwardRef, {
							className: "codexModelSelectBolt",
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexModelSelectLabel",
							children: modelLabel
						}),
						effortLabel === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexModelSelectEffort",
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: "codexModelSelectChevron" })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexModelSelectMenu",
					id: `${id}-menu`,
					role: "menu",
					"aria-label": t("modelMenuAria"),
					"aria-busy": state.status === "loading" || busy,
					children: [
						cell("model", t("modelLabel"), modelLabel),
						reasoning === void 0 ? null : cell("effort", t("effortLabel"), effortLabel),
						speedSupported && cell("speed", t("speedTitle"), t(fast ? "speedFast" : "speedStandard")),
						verbositySupported && cell("verbosity", t("verbosityTitle"), verbosityLabel),
						submenu
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/capability-preferences.jsx
		function CapabilityPreferences({ preference, t, section }) {
			const snapshot = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const [domains, setDomains] = (0, react.useState)("");
			const [invalid, setInvalid] = (0, react.useState)(false);
			const saved = snapshot.searchDomains.join(", ");
			(0, react.useEffect)(() => {
				setDomains(saved);
				setInvalid(false);
			}, [saved]);
			const choices = (field, values) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexSubscriptionQuotaModes",
				role: "radiogroup",
				"aria-label": t(field),
				children: values.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "codexSubscriptionQuotaMode",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "radio",
						name: `codex-${field}`,
						checked: snapshot[field] === value,
						disabled: !snapshot.writable,
						onChange: () => {
							preference.set({ [field]: value });
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`${field}_${value}`) })]
				}, value))
			});
			if (section === "quota") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceLabel",
						children: t("quotaAlerts")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceHint",
						children: t("quotaAlertsHint")
					})]
				}), choices("quotaAlerts", QUOTA_ALERT_MODES)]
			});
			const save = () => {
				try {
					const next = normalizeSearchDomains(domains.trim() === "" ? [] : domains.split(/[,，\s]+/u).filter(Boolean));
					setInvalid(false);
					if (JSON.stringify(next) !== JSON.stringify(snapshot.searchDomains)) preference.set({ searchDomains: next });
				} catch {
					setInvalid(true);
				}
			};
			if (snapshot.searchProvider === "dsh") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "codexSubscriptionSearchOptions",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t("searchOptions"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [t(`searchMode_${snapshot.searchMode}`), snapshot.searchDomains.length > 0 ? ` · ${snapshot.searchDomains.length} ${t("searchDomainCount")}` : ""] })] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionPreferenceLabel",
							children: t("searchMode")
						}), choices("searchMode", SEARCH_MODES)]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionPreferenceHint",
						children: t("searchModeHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionPreferenceCopy",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searchDomains") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								"aria-label": t("searchDomains"),
								"aria-invalid": invalid,
								value: domains,
								disabled: !snapshot.writable,
								placeholder: "example.com, example.org",
								onChange: (event) => setDomains(event.currentTarget.value),
								onBlur: save,
								onKeyDown: (event) => {
									if (event.key === "Enter") event.currentTarget.blur();
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexSubscriptionPreferenceHint",
								children: t("searchDomainsHint")
							})
						]
					}),
					invalid ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "codexSubscriptionError",
						children: t("searchDomainsInvalid")
					}) : null
				]
			});
		}
		//#endregion
		//#region src/image-preferences.jsx
		function ImagePreferences({ preference, t }) {
			const snapshot = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "codexSubscriptionSearchOptions codexImageSettings",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("imageSettings") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							"aria-label": t("imageModel"),
							value: snapshot.imageModel,
							disabled: !snapshot.writable,
							onChange: (event) => {
								preference.set({
									imageModel: event.target.value,
									imageQuality: "auto"
								});
							},
							children: Object.keys(IMAGE_MODELS).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
								value: model,
								children: [model, model.includes("2.5") ? ` · ${t("imageExperimental")}` : ""]
							}, model))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageQuality") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							"aria-label": t("imageQuality"),
							value: snapshot.imageQuality,
							disabled: !snapshot.writable,
							onChange: (event) => {
								preference.set({ imageQuality: event.target.value });
							},
							children: IMAGE_MODELS[snapshot.imageModel].map((quality) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: quality }, quality))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionPreferenceHint",
						children: t("imageModelHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexImageSwitches",
						children: Object.keys(IMAGE_FEATURE_DEFAULTS).map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "codexSubscriptionPreference",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(key) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								role: "switch",
								checked: snapshot[key],
								disabled: !snapshot.writable,
								onChange: (event) => {
									preference.set({ [key]: event.target.checked });
								}
							})]
						}, key))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionPreferenceHint",
						children: t("imageSettingsHint")
					})
				]
			});
		}
		//#endregion
		//#region src/context-draft-state.js
		const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
		/**
		* Reconcile saved context values with the inputs currently shown in Settings.
		* A draft survives a catalog refresh while its saved value is unchanged. New
		* rows and rows whose saved value changed start from the new saved value.
		*/
		function reconcileContextDrafts({ modelRows, drafts, previousSavedValues, savedValues }) {
			const next = {};
			for (const model of modelRows) {
				const key = model.key;
				const saved = String(savedValues?.[key] ?? "");
				next[key] = hasOwn(previousSavedValues, key) && previousSavedValues[key] === saved && hasOwn(drafts, key) ? drafts[key] : saved;
			}
			return next;
		}
		//#endregion
		//#region src/client-preferences.jsx
		function QuickQuotaPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const choice = (value, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "codexSubscriptionQuotaMode",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "radio",
					name: "codex-subscription-quota-mode",
					checked: snapshot.quickQuotaMode === value,
					disabled: !writable,
					onChange: () => {
						preference.set({ [QUICK_QUOTA_MODE_FIELD]: value });
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceLabel",
						children: t("quickQuotaSetting")
					}), snapshot.quickQuotaMode === "forecast" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceHint",
						children: t("quickQuotaForecastHint")
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionQuotaModes",
					"data-saving": snapshot.saving || void 0,
					"aria-busy": snapshot.saving || void 0,
					role: "radiogroup",
					"aria-label": t("quickQuotaSetting"),
					children: [
						choice("off", t("quickQuotaOff")),
						choice(QUICK_QUOTA_MODE_PERCENT, t("quickQuotaPercent")),
						choice("bar", t("quickQuotaBar")),
						choice(QUICK_QUOTA_MODE_FORECAST, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							t("quickQuotaForecast"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("quickQuotaBeta") })
						] }))
					]
				})]
			});
		}
		function SearchProviderPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const choice = (value, label, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "codexSubscriptionSearchChoice",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: "codexSubscriptionSearchInput",
					type: "radio",
					name: "codex-subscription-search-provider",
					checked: snapshot.searchProvider === value,
					disabled: !writable,
					onChange: () => {
						preference.set({ [SEARCH_PROVIDER_FIELD]: value });
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexSubscriptionSearchCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: hint })]
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionSearch",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSearchHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("searchTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionSearchScope",
							children: t("searchScope")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSearchChoices",
						"data-saving": snapshot.saving || void 0,
						"aria-busy": snapshot.saving || void 0,
						role: "radiogroup",
						"aria-label": t("searchTitle"),
						children: [
							choice(SEARCH_PROVIDER_AUTO, t("searchAuto"), t("searchAutoHint")),
							choice("dsh", t("searchDsh"), t("searchDshHint")),
							choice(SEARCH_PROVIDER_CODEX, t("searchCodex"), t("searchCodexHint"))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityPreferences, {
						preference,
						t,
						section: "search"
					})
				]
			});
		}
		function ContextWindowPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const modelRows = snapshot.contextModels.filter((model) => model.fixed !== true);
			const fixedRows = snapshot.contextModels.filter((model) => model.fixed === true);
			const [drafts, setDrafts] = (0, react.useState)({});
			const previousSavedValues = (0, react.useRef)();
			(0, react.useEffect)(() => {
				const savedValues = Object.fromEntries(modelRows.map((model) => [model.key, String(snapshot.customContextWindows[model.key])]));
				const previous = previousSavedValues.current;
				setDrafts((current) => reconcileContextDrafts({
					modelRows,
					drafts: current,
					previousSavedValues: previous,
					savedValues
				}));
				previousSavedValues.current = savedValues;
			}, [modelRows.map((model) => `${model.key}\u0000${snapshot.customContextWindows[model.key]}`).join("")]);
			const hint = snapshot.contextMode === "extended" ? t("contextExtendedHint") : snapshot.contextMode === "custom" ? t("contextCustomHint") : t("contextStandardHint");
			const commit = (modelKey) => {
				const parsed = parseContextWindow(drafts[modelKey]);
				if (!Number.isInteger(parsed)) {
					setDrafts((current) => ({
						...current,
						[modelKey]: String(snapshot.customContextWindows[modelKey])
					}));
					return;
				}
				const value = clampModelContext(parsed, modelRows.find((model) => model.key === modelKey).maximum);
				setDrafts((current) => ({
					...current,
					[modelKey]: String(value)
				}));
				if (value !== snapshot.customContextWindows[modelKey]) preference.set({ customContextModels: {
					...snapshot.customContextModels,
					[modelKey]: value
				} });
			};
			const contextModeItems = [
				{
					id: CONTEXT_MODE_STANDARD,
					label: t("contextStandard")
				},
				{
					id: CONTEXT_MODE_EXTENDED,
					label: t("contextExtended")
				},
				{
					id: CONTEXT_MODE_CUSTOM,
					label: t("contextCustom")
				}
			];
			const selectedMode = contextModeItems.find((item) => item.id === snapshot.contextMode)?.label ?? t("contextStandard");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionContext",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionContextHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionContextCopy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexSubscriptionPreferenceLabel",
								children: t("contextTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexSubscriptionContextHint",
								children: hint
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuOpen,
							items: contextModeItems,
							selectedId: snapshot.contextMode,
							onSelect: (value) => {
								setMenuOpen(false);
								preference.set({ [CONTEXT_MODE_FIELD]: value });
							},
							onClose: () => setMenuOpen(false),
							align: "end",
							side: "bottom",
							portal: true,
							compact: true,
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "codexSubscriptionContextTrigger",
								type: "button",
								"aria-label": t("contextTitle"),
								"aria-haspopup": "menu",
								"aria-expanded": menuOpen,
								disabled: !writable,
								onClick: () => setMenuOpen((value) => !value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selectedMode }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})]
							})
						})]
					}),
					snapshot.contextMode === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionContextModels",
						children: [modelRows.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionContextModel",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "codexSubscriptionContextModelCopy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: model.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("contextMaximum"), {
									minimum: String(Math.min(MIN_CUSTOM_CONTEXT_WINDOW, model.maximum)),
									value: String(model.maximum)
								}) })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								"aria-label": `${model.label} ${t("contextTokens")}`,
								className: "codexSubscriptionContextInput",
								type: "number",
								inputMode: "numeric",
								min: Math.min(MIN_CUSTOM_CONTEXT_WINDOW, model.maximum),
								max: model.maximum,
								step: 1,
								value: drafts[model.key] ?? "",
								disabled: !writable,
								onChange: (event) => {
									const nextValue = event.currentTarget.value;
									setDrafts((current) => ({
										...current,
										[model.key]: nextValue
									}));
								},
								onBlur: () => commit(model.key),
								onKeyDown: (event) => {
									if (event.key === "Enter") event.currentTarget.blur();
								}
							})]
						}, model.key)), fixedRows.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionContextModel",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "codexSubscriptionContextModelCopy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: model.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("contextFixed"), { value: formatContextWindow(model.maximum) }) })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexSubscriptionContextHint",
								children: formatContextWindow(model.maximum)
							})]
						}, model.key))]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionPreferenceHint",
							children: t(snapshot.catalogStatus?.source === "online" ? "catalogOnline" : "catalogFallback")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							disabled: snapshot.modelsLoading,
							"aria-busy": snapshot.modelsLoading,
							onClick: () => {
								preference.refreshModels();
							},
							children: t(snapshot.modelsLoading ? "refreshing" : "catalogRefresh")
						})]
					}),
					snapshot.modelError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("modelDirectoryFailed")
					}) : null
				]
			});
		}
		function PreferencesCard({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchProviderPreference, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextWindowPreference, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickQuotaPreference, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityPreferences, {
						preference,
						t,
						section: "quota"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagePreferences, {
						preference,
						t
					}),
					snapshot.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionRecover",
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionError",
							children: t("preferenceFailed")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							onClick: () => {
								preference.retry();
							},
							children: t("preferenceRetry")
						})]
					}) : null
				]
			});
		}
		//#endregion
		//#region src/login-progress.js
		/** Reconcile a login flow with the credential store without exposing credentials. */
		async function readLoginProgress({ flow, readFlow, readAccount }) {
			try {
				const nextFlow = await readFlow();
				if (nextFlow.phase === "failed") try {
					const account = await readAccount();
					if (account?.authenticated === true) return {
						flow: {
							id: flow.id,
							method: flow.method,
							phase: "authenticated",
							authenticated: true
						},
						account,
						recovered: true
					};
				} catch {}
				if (nextFlow.phase !== "authenticated") return { flow: nextFlow };
				return {
					flow: nextFlow,
					account: await readAccount()
				};
			} catch (flowError) {
				try {
					const account = await readAccount();
					if (account?.authenticated === true) return {
						flow: {
							id: flow.id,
							method: flow.method,
							phase: "authenticated",
							authenticated: true
						},
						account,
						recovered: true
					};
				} catch {}
				throw flowError;
			}
		}
		//#endregion
		//#region src/client-account.jsx
		function AccountEmail({ candidate, fallback, t, emailVisible, onClick }) {
			if (typeof candidate?.email !== "string" || candidate.email.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				title: t("emailUnavailable"),
				children: fallback ?? candidate?.label ?? t("emailUnavailable")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "codexSubscriptionEmail",
				"aria-label": t(emailVisible ? "hideEmail" : "showEmail"),
				"aria-pressed": emailVisible,
				onClick,
				children: emailVisible ? candidate.email : maskEmail(candidate.email)
			});
		}
		function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
			const [flow, setFlow] = (0, react.useState)();
			const [manualCode, setManualCode] = (0, react.useState)("");
			const [adding, setAdding] = (0, react.useState)(false);
			const [removeId, setRemoveId] = (0, react.useState)();
			const [emailVisible, setEmailVisible] = (0, react.useState)(false);
			const accounts = account?.accounts ?? [];
			const accountVisibilityKey = `${account?.authenticated === true ? "signed-in" : "signed-out"}:${accounts.map((candidate) => `${candidate.id ?? ""}:${candidate.active === true}:${candidate.email ?? ""}`).join("|")}`;
			const [emailVisibilityKey, setEmailVisibilityKey] = (0, react.useState)(accountVisibilityKey);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const call = (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(unwrap);
			(0, react.useEffect)(() => {
				if (emailVisibilityKey === accountVisibilityKey) return;
				setEmailVisible(false);
				setEmailVisibilityKey(accountVisibilityKey);
			}, [accountVisibilityKey, emailVisibilityKey]);
			(0, react.useEffect)(() => {
				if (flow?.id === void 0 || [
					"authenticated",
					"failed",
					"cancelled"
				].includes(flow.phase)) return void 0;
				const timer = window.setInterval(() => {
					(adding ? call("login/status", { id: flow.id }).then(async (nextFlow) => ({
						flow: nextFlow,
						account: nextFlow.phase === "authenticated" ? await call("status") : void 0
					})) : readLoginProgress({
						flow,
						readFlow: () => call("login/status", { id: flow.id }),
						readAccount: () => call("status")
					})).then((next) => {
						setFlow(next.flow);
						setError(void 0);
						if (next.account !== void 0) {
							setAccount(next.account);
							onSignedOut();
							setAdding(false);
							setFlow(void 0);
							notifyQuickQuota();
						}
					}).catch(() => setError(t("failed")));
				}, 800);
				return () => window.clearInterval(timer);
			}, [
				flow?.id,
				flow?.phase,
				adding
			]);
			const begin = (method, label) => {
				setFlow(void 0);
				setBusy(true);
				setError(void 0);
				const loginLabel = adding && label === void 0 ? `Account ${accounts.length + 1}` : label;
				call("login/start", {
					method,
					openExternal: true,
					...loginLabel === void 0 ? {} : { label: loginLabel }
				}).then(setFlow).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const cancel = () => {
				if (flow?.id === void 0) return;
				setBusy(true);
				call("login/cancel", { id: flow.id }).then((next) => {
					setFlow(adding ? void 0 : next);
					if (adding) setAdding(false);
					if (adding) return void 0;
					return call("status").then((account) => {
						if (account.authenticated === true) {
							setAccount(account);
							setFlow({
								...next,
								phase: "authenticated",
								authenticated: true
							});
							setError(void 0);
							notifyQuickQuota();
						}
					});
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const submit = (event) => {
				event.preventDefault();
				if (flow?.id === void 0 || manualCode.trim() === "") return;
				setBusy(true);
				call("login/submit", {
					id: flow.id,
					value: manualCode.trim()
				}).then((next) => {
					setManualCode("");
					setFlow(next);
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const logout = () => {
				setBusy(true);
				setError(void 0);
				call("logout").then((next) => {
					setAccount(next);
					setFlow(void 0);
					onSignedOut();
					notifyQuickQuota();
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const selectAccount = (id) => {
				setBusy(true);
				setError(void 0);
				call("account/select", { id }).then((next) => {
					setAccount(next);
					onSignedOut();
					notifyQuickQuota();
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const removeAccount = (id) => {
				if (removeId !== id) {
					setRemoveId(id);
					return;
				}
				setBusy(true);
				setError(void 0);
				call("account/remove", { id }).then((next) => {
					setAccount(next);
					setRemoveId(void 0);
					onSignedOut();
					notifyQuickQuota();
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const signedIn = account?.authenticated === true;
			const accountReady = account !== void 0;
			const loginVisible = flow !== void 0 && ![
				"authenticated",
				"failed",
				"cancelled"
			].includes(flow.phase);
			const toggleEmail = () => {
				setEmailVisibilityKey(accountVisibilityKey);
				setEmailVisible((value) => emailVisibilityKey === accountVisibilityKey ? !value : true);
			};
			const emailVisibleForAccount = emailVisible && emailVisibilityKey === accountVisibilityKey;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionAccountRow",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionStatus",
							role: "status",
							"aria-live": "polite",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexSubscriptionDot",
								"data-state": accountReady ? signedIn ? "connected" : "disconnected" : "loading",
								"aria-hidden": "true"
							}), accountReady ? signedIn ? t("connected") : t("disconnected") : t("accountLoading")]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexSubscriptionActions",
							children: signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy || loginVisible,
								onClick: () => {
									setFlow(void 0);
									setAdding(true);
								},
								children: t("addAccount")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy || loginVisible,
								onClick: logout,
								children: t("signOutAll")
							})] }) : accountReady && (flow === void 0 || ["failed", "cancelled"].includes(flow.phase)) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "primary",
								disabled: busy,
								onClick: () => begin("browser"),
								children: t("browserLogin")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => begin("device_code"),
								children: t("deviceLogin")
							})] }) : null
						})]
					}),
					signedIn && accounts.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionAccounts",
						children: accounts.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionAccount",
							"data-active": candidate.active,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountEmail, {
								candidate,
								fallback: candidate.label,
								t,
								emailVisible: emailVisibleForAccount,
								onClick: toggleEmail
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionActions",
								children: [
									candidate.active ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "button",
										variant: "outline",
										disabled: busy || loginVisible,
										onClick: () => selectAccount(candidate.id),
										children: t("switchAccount")
									}),
									accounts.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "button",
										variant: "outline",
										disabled: busy || loginVisible,
										onClick: () => removeAccount(candidate.id),
										children: removeId === candidate.id ? t("removeConfirm") : t("removeAccount")
									}) : null,
									removeId === candidate.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										type: "button",
										variant: "outline",
										disabled: busy,
										onClick: () => setRemoveId(void 0),
										children: t("removeCancel")
									}) : null
								]
							})]
						}, candidate.id))
					}) : null,
					signedIn && adding && flow === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionFlow",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionActions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "primary",
									disabled: busy,
									onClick: () => begin("browser"),
									children: t("browserLogin")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: () => begin("device_code"),
									children: t("deviceLogin")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: () => setAdding(false),
									children: t("cancel")
								})
							]
						})
					}) : null,
					flow?.phase === "waiting_device" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionFlow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("deviceHint") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: "codexSubscriptionCode",
								children: flow.deviceCode?.userCode
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: flow.deviceCode?.verificationUri,
								target: "_blank",
								rel: "noreferrer",
								children: t("openLogin")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("waiting") })
						]
					}) : null,
					flow?.phase === "waiting_input" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: "codexSubscriptionFlow",
						onSubmit: submit,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("manualCode") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: "codexSubscriptionInput",
								value: manualCode,
								onChange: (event) => setManualCode(event.currentTarget.value),
								autoComplete: "off",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "submit",
									variant: "primary",
									disabled: busy || manualCode.trim() === "",
									children: t("submit")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: cancel,
									children: t("cancel")
								})]
							})
						]
					}) : null,
					flow !== void 0 && ["starting", "waiting_browser"].includes(flow.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionFlow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("waiting") }),
							flow.authUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: flow.authUrl,
								target: "_blank",
								rel: "noreferrer",
								children: t("openLogin")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: cancel,
								children: t("cancel")
							})
						]
					}) : null,
					flow?.phase === "failed" || error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: error ?? t("failed")
					}) : null
				]
			});
		}
		function AccountFailureCard({ accountStatus, snapshot, t }) {
			const retrying = snapshot.retrying === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionRecover",
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "codexSubscriptionError",
					children: retrying ? t("accountRetrying") : accountStatusErrorText(snapshot.error, t)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					type: "button",
					variant: "outline",
					disabled: retrying,
					"aria-busy": retrying,
					onClick: () => {
						accountStatus.retry();
					},
					children: retrying ? t("accountRetrying") : t("accountRetry")
				})]
			});
		}
		//#endregion
		//#region src/client-diagnostics.jsx
		function DiagnosticsCard({ rpc, t }) {
			const [report, setReport] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [copied, setCopied] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(false);
			const load = () => {
				setBusy(true);
				setError(false);
				setCopied(false);
				rpc.call(CHANNEL, "diagnostics", {}).then(unwrap).then(setReport).catch(() => setError(true)).finally(() => setBusy(false));
			};
			const copy = () => {
				if (report === void 0) return;
				navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => setCopied(true)).catch(() => setError(true));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionDiagnostics",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexSubscriptionSectionTitle",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("diagnostics") })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionActions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: load,
									children: busy ? t("diagnosticsLoading") : t("diagnosticsLoad")
								}),
								report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									onClick: copy,
									children: copied ? t("diagnosticsCopied") : t("diagnosticsCopy")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: "codexSubscriptionLink",
									href: SUPPORT_ISSUE_URL,
									target: "_blank",
									rel: "noreferrer",
									children: t("feedbackOpen")
								})
							]
						})]
					}),
					report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(report, null, 2) }),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("diagnosticsFailed")
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client-usage.jsx
		function ResetTime({ resetsAt, t }) {
			const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1e3) : void 0;
			if (date === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetUnknown") });
			const value = date.toLocaleString(void 0, {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
				dateTime: date.toISOString(),
				title: date.toLocaleString(),
				children: fill(t("resets"), { value })
			});
		}
		function ResetCreditExpiry({ expiresAt, t }) {
			const date = validDate(expiresAt);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "codexSubscriptionResetExpiry",
				children: date === void 0 ? t("resetCreditExpiryUnknown") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
					dateTime: date.toISOString(),
					title: date.toLocaleString(),
					children: fill(t("resetCreditExpires"), { value: date.toLocaleString() })
				})
			});
		}
		function ResetCreditList({ rpc, t, count, nextExpiresAt, initialCredits, refreshKey, hasExhaustedQuota, onConsumed }) {
			const [credits, setCredits] = (0, react.useState)(initialCredits ?? (nextExpiresAt === void 0 ? [] : [{ expiresAt: nextExpiresAt }]));
			const [state, setState] = (0, react.useState)("loading");
			(0, react.useEffect)(() => {
				let live = true;
				setState("loading");
				setCredits([]);
				rpc.call(CHANNEL, "reset-credit/inspect", {}).then(unwrap).then((value) => {
					if (!live) return;
					setCredits(Array.isArray(value.credits) ? value.credits : []);
					setState("ready");
				}).catch(() => {
					if (live) setState("error");
				});
				return () => {
					live = false;
				};
			}, [
				rpc,
				count,
				refreshKey
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionResetBalance",
				"aria-label": t("resetCredits"),
				children: [credits.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "codexSubscriptionCreditNote",
					role: "status",
					children: state === "loading" ? t("resetCreditExpiryLoading") : t("resetCreditExpiryFailed")
				}) : credits.map((credit, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCreditControl, {
					rpc,
					t,
					credit,
					hasExhaustedQuota,
					onConsumed
				}, credit.ref ?? `pending-${index}`)), state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "codexSubscriptionCreditNote",
					role: "status",
					children: t("resetCreditExpiryFailed")
				}) : null]
			});
		}
		function ResetCreditControl({ rpc, t, credit, hasExhaustedQuota, onConsumed }) {
			const [challenge, setChallenge] = (0, react.useState)();
			const [resetBusy, setResetBusy] = (0, react.useState)(false);
			const [resetAcknowledged, setResetAcknowledged] = (0, react.useState)(false);
			const [resetCountdown, setResetCountdown] = (0, react.useState)(0);
			const [resetError, setResetError] = (0, react.useState)();
			const [resetResult, setResetResult] = (0, react.useState)();
			(0, react.useEffect)(() => {
				if (challenge === void 0) {
					setResetCountdown(0);
					return;
				}
				const update = () => setResetCountdown(Math.max(0, Math.ceil((challenge.readyAt - Date.now()) / 1e3)));
				update();
				const timer = window.setInterval(update, 250);
				return () => window.clearInterval(timer);
			}, [challenge]);
			const prepareReset = () => {
				if (resetBusy || typeof credit.ref !== "string") return;
				setResetBusy(true);
				setResetError(void 0);
				setResetResult(void 0);
				rpc.call(CHANNEL, "reset-credit/prepare", { creditRef: credit.ref }).then(unwrap).then((next) => {
					setChallenge(next);
					setResetAcknowledged(false);
				}).catch((error) => setResetError(resetCreditErrorText(error, t))).finally(() => setResetBusy(false));
			};
			const cancelReset = () => {
				if (resetBusy) return;
				setChallenge(void 0);
				setResetAcknowledged(false);
				setResetError(void 0);
			};
			const resetReady = challenge !== void 0 && resetAcknowledged && resetCountdown === 0;
			const consumeReset = () => {
				if (resetBusy) return;
				if (!resetReady) return;
				setResetBusy(true);
				setResetError(void 0);
				setResetResult(void 0);
				rpc.call(CHANNEL, "reset-credit/consume", {
					challengeId: challenge.challengeId,
					acknowledged: resetAcknowledged
				}).then(unwrap).then((result) => {
					setChallenge(void 0);
					setResetAcknowledged(false);
					const message = result.code === "reset" ? t("resetSuccess") : result.code === "nothing_to_reset" ? t("resetNothing") : result.code === "no_credit" ? t("resetNoCredit") : t("resetAlready");
					setResetResult(message);
					onConsumed();
				}).catch((error) => setResetError(resetCreditErrorText(error, t))).finally(() => setResetBusy(false));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionResetCard",
				children: [
					challenge === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionResetMeta",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: credit.name ?? t("resetCreditDefaultName") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCreditExpiry, {
							expiresAt: credit.expiresAt,
							t
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionActions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "codexSubscriptionResetUse",
							type: "button",
							variant: "outline",
							disabled: resetBusy || typeof credit.ref !== "string",
							"aria-busy": resetBusy,
							onClick: prepareReset,
							children: resetBusy ? t("resetPreparing") : t("resetUse")
						})
					})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionResetFlow",
						role: "group",
						"aria-labelledby": "codex-reset-confirm-title",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
								id: "codex-reset-confirm-title",
								children: challenge.title ?? t("resetConfirmTitle")
							}),
							challenge.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionResetWarning",
								children: challenge.description
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCreditExpiry, {
								expiresAt: challenge.creditExpiresAt,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionResetWarning",
								children: t(hasExhaustedQuota ? "resetWarning" : "resetEarlyWarning")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "codexSubscriptionResetCheck",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: resetAcknowledged,
									disabled: resetBusy,
									onChange: (event) => setResetAcknowledged(event.target.checked)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetAcknowledge") })]
							}),
							resetCountdown > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionCreditNote",
								role: "status",
								children: fill(t("resetWait"), { count: resetCountdown })
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: resetBusy,
									onClick: cancelReset,
									children: t("cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									className: "codexSubscriptionResetFinal",
									type: "button",
									variant: "outline",
									disabled: !resetReady || resetBusy,
									"aria-busy": resetBusy,
									onClick: consumeReset,
									children: resetBusy ? t("resetUsing") : t("resetFinal")
								})]
							})
						]
					}),
					resetResult ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionResetResult",
						role: "status",
						children: resetResult
					}) : null,
					resetError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: resetError || t("resetFailed")
					}) : null
				]
			});
		}
		function resetCreditErrorText(error, t) {
			return t((/* @__PURE__ */ new Map([
				["ChatGPT subscription is not signed in", "resetRenewLogin"],
				["ChatGPT sign-in needs to be renewed", "resetRenewLogin"],
				["No quota reset is available", "resetNoCredit"],
				["No usable quota reset is available", "resetNoCredit"],
				["The available quota reset expires too soon", "resetExpired"],
				["This quota reset confirmation is no longer valid", "resetExpired"],
				["This quota reset is already in progress", "resetInProgress"],
				["Wait before confirming this quota reset", "resetTooEarly"],
				["You must acknowledge that this may consume one quota reset", "resetAcknowledgeRequired"],
				["The signed-in ChatGPT account changed", "resetAccountChanged"],
				["Quota reset result is uncertain; retry this confirmation to check the same request", "resetUncertain"]
			])).get(error instanceof Error ? error.message : "") ?? "resetFailed");
		}
		function UsageCard({ rpc, t, signedIn, resetKey, preference }) {
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const [now, setNow] = (0, react.useState)(Date.now);
			(0, react.useEffect)(() => {
				if (!signedIn) return;
				const timer = window.setInterval(() => setNow(Date.now()), 3e4);
				return () => window.clearInterval(timer);
			}, [signedIn]);
			const [usage, setUsage] = (0, react.useState)();
			const [usageRefreshGeneration, setUsageRefreshGeneration] = (0, react.useState)(0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const request = (0, react.useRef)(0);
			const load = (force) => {
				if (!signedIn) return;
				const id = ++request.current;
				setBusy(true);
				setError(void 0);
				rpc.call(CHANNEL, "usage", { force }).then(unwrap).then((next) => {
					if (request.current === id) {
						setUsage(next);
						setNow(Date.now());
						setUsageRefreshGeneration((value) => value + 1);
						if (force) notifyQuickQuota();
					}
				}).catch((error) => {
					if (request.current === id) setError(error.message);
				}).finally(() => {
					if (request.current === id) setBusy(false);
				});
			};
			(0, react.useEffect)(() => {
				setUsage(void 0);
				if (signedIn) load(false);
				else {
					request.current += 1;
					setUsage(void 0);
					setError(void 0);
					setBusy(false);
				}
				return () => {
					request.current += 1;
				};
			}, [signedIn, resetKey]);
			const visibleUsage = signedIn ? usage : void 0;
			const limits = visibleUsage?.rateLimits ?? [];
			const warning = error === void 0 ? quotaWarning(visibleUsage, preferenceSnapshot.quotaAlerts, now) : void 0;
			const exhausted = limits.some((limit) => limit.id !== "code_review" && limit.windows.some((window) => window.usedPercent >= 100));
			const hasUsageDetails = limits.length > 0 || visibleUsage?.credits !== void 0 || visibleUsage?.individualLimit !== void 0 || visibleUsage?.resetCredits?.availableCount > 0;
			const fetchedAt = typeof visibleUsage?.fetchedAt === "number" ? validDate(visibleUsage.fetchedAt) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionUsageCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionSectionTitle",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }), fetchedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
								className: "codexSubscriptionFreshness",
								dateTime: fetchedAt.toISOString(),
								children: fill(t("usageUpdated"), { value: fetchedAt.toLocaleString() })
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "codexSubscriptionRefresh",
							type: "button",
							variant: "outline",
							disabled: !signedIn || busy,
							"aria-busy": busy,
							onClick: () => load(true),
							children: busy ? t("refreshing") : t("refresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"aria-live": "polite",
						children: [
							!signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								children: t("noUsage")
							}) : null,
							signedIn && busy && usage === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								role: "status",
								children: t("usageLoading")
							}) : null,
							signedIn && !busy && error === void 0 && usage !== void 0 && !hasUsageDetails ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								role: "status",
								children: t("usageEmpty")
							}) : null
						]
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: error
					}),
					warning === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "status",
						children: fill(t("quotaWarning"), {
							window: windowLabel(warning.windowSeconds, t),
							value: percent(warning.remainingPercent)
						})
					}),
					visibleUsage?.spendControlReached === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("spendReached")
					}) : null,
					limits.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionLimits",
						children: limits.flatMap((limit) => limit.windows.map((window, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionLimit",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimitTop",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "codexSubscriptionLimitLabel",
										children: limit.name ?? limit.id
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [percent(window.remainingPercent), "%"] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
									max: "100",
									value: window.remainingPercent,
									"aria-label": `${limit.name ?? limit.id} ${fill(t("remaining"), { value: percent(window.remainingPercent) })}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimitMeta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "codexSubscriptionLimitPeriod",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: windowLabel(window.windowSeconds, t) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatQuotaForecast(window.forecast, t) })]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
										resetsAt: window.resetsAt,
										t
									})]
								})
							]
						}, `${limit.id}-${window.windowSeconds}-${index}`)))
					}),
					visibleUsage?.credits === void 0 && visibleUsage?.individualLimit === void 0 && !(visibleUsage?.resetCredits?.availableCount > 0) ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionCreditSection",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionCreditNote",
							children: t("creditsNote")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionCreditRows",
							children: [
								visibleUsage?.credits ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionCreditBalance",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("creditsBalance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: visibleUsage.credits.unlimited ? t("unlimited") : `${visibleUsage.credits.balance ?? t("unavailable")} ${t("creditsUnit")}` })]
								}) : null,
								visibleUsage?.resetCredits?.availableCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionCreditBalance",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetCredits") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCreditList, {
										rpc,
										t,
										count: visibleUsage.resetCredits.availableCount,
										nextExpiresAt: visibleUsage.resetCredits.nextExpiresAt,
										initialCredits: visibleUsage.resetCredits.credits,
										refreshKey: `${resetKey}:${usageRefreshGeneration}`,
										hasExhaustedQuota: exhausted,
										onConsumed: () => load(true)
									})]
								}) : null,
								visibleUsage?.individualLimit ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionSpendLimit",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionSpendTop",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "codexSubscriptionCreditLabel",
												children: t("monthlyCreditLimit")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fill(t("remaining"), { value: percent(visibleUsage.individualLimit.remainingPercent) }) })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
											max: "100",
											value: visibleUsage.individualLimit.remainingPercent,
											"aria-label": `${t("monthlyCreditLimit")} ${fill(t("remaining"), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionLimitMeta",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("creditsUsed"), {
												used: visibleUsage.individualLimit.used,
												limit: visibleUsage.individualLimit.limit
											}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
												resetsAt: visibleUsage.individualLimit.resetsAt,
												t
											})]
										})
									]
								}) : null
							]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client-section.jsx
		function CodexSection({ preference, rpc, accountStatus, t }) {
			const accountSnapshot = useAccountStatusSnapshot(accountStatus);
			const account = accountSnapshot.account;
			const [resetKey, setResetKey] = (0, react.useState)(0);
			const setAccount = accountStatus.acceptAccount;
			const accountChanged = () => {
				setResetKey((value) => value + 1);
				preference.refreshModels();
			};
			(0, react.useEffect)(() => {
				accountStatus.load();
				preference.refreshModels();
			}, [accountStatus, preference]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscription",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionHead",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") })
					}),
					accountSnapshot.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFailureCard, {
						accountStatus,
						snapshot: accountSnapshot,
						t
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
						rpc,
						t,
						account,
						setAccount,
						onSignedOut: accountChanged
					}),
					account === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageCard, {
						rpc,
						t,
						signedIn: account.authenticated === true,
						resetKey,
						preference
					}, resetKey),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferencesCard, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsCard, {
						rpc,
						t
					})
				]
			});
		}
		//#endregion
		//#region src/client.jsx
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope",
			"modelDirectories",
			"conversation",
			"uiConversation",
			"sessions"
		];
		function apply(ctx) {
			const imageViewer = new SubscriptionImageViewerService();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "codex-subscription: copy");
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-codex-subscription";
				tag.textContent = STYLE + SUBSCRIPTION_IMAGE_VIEWER_CSS + SKETCH_CSS + LIBRARY_CSS;
				document.head.append(tag);
				return () => tag.remove();
			}, "codex-subscription: style");
			const rpc = createSubscriptionRpcClient(ctx.get("connection").rpc);
			const preference = createPreferenceController(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }), rpc);
			ctx.effect(() => {
				let previous = JSON.stringify(preference.getSnapshot(), (key, value) => key.startsWith("image") || key === "" ? value : void 0);
				return preference.subscribe(() => {
					const next = JSON.stringify(preference.getSnapshot(), (key, value) => key.startsWith("image") || key === "" ? value : void 0);
					if (next !== previous) imageViewer.close();
					previous = next;
				});
			}, "codex-subscription: image controls");
			const accountStatus = createAccountStatusController(rpc);
			ctx.effect(() => {
				preference.load();
				accountStatus.load();
				const disposeReset = ctx.on("connection/reset", () => {
					preference.load();
					preference.refreshModels();
					accountStatus.reload();
				});
				return () => {
					disposeReset?.();
					preference.dispose();
					accountStatus.dispose();
				};
			}, "codex-subscription: preferences and account status");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "codex-subscription-image-viewer",
				order: 20,
				inject: () => ({
					service: imageViewer,
					t
				})
			}, SubscriptionImageViewerOverlay));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "codex-subscription",
				order: 15,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					preference,
					rpc,
					accountStatus,
					t
				})
			}, CodexSection));
			const sessions = ctx.get("sessions");
			const installDirectorySlots = (scope) => {
				const modelDirectories = scope.get("modelDirectories");
				scope.slots.inject("conversation.input.right", () => scope.slots.register({
					name: "conversation.input.right",
					id: "codex-subscription-quota",
					order: 15,
					locale: NS,
					inject: (sessionId) => ({
						preference,
						rpc,
						t,
						directory: modelDirectories.directoryFor(sessionId).store
					})
				}, CodexComposerQuota));
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					priority: -10,
					locale: NS,
					inject: (sessionId) => {
						const directory = modelDirectories.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load();
							},
							select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
							preference
						};
					}
				}, CodexModelSelect));
			};
			if (ctx.get("remote.session") === void 0) installDirectorySlots(ctx);
			else ctx.inject(["remote.session"], installDirectorySlots);
			const conversation = ctx.get("conversation");
			const uiConversation = ctx.get("uiConversation");
			const sketchOpeners = /* @__PURE__ */ new Map();
			ctx.inject(["inputTriggers"], (triggerContext) => triggerContext.effect(() => triggerContext.get("inputTriggers").registerSource(createSketchTrigger({
				enabled: () => {
					const value = preference.getSnapshot();
					return value.imageSketch && value.imageEditing;
				},
				open: (sessionId) => sketchOpeners.get(sessionId)?.(),
				consume: (sessionId, span) => {
					const actx = sessions.scope(sessionId);
					return sketchOpeners.has(sessionId) && actx?.bail(actx, "slash/input-consume-token", { guard: {
						kind: "span",
						span
					} }) === true;
				}
			})), "codex-subscription: Sketch trigger"));
			ctx.inject(["inputTriggers"], (triggerContext) => triggerContext.effect(() => triggerContext.get("inputTriggers").registerSource(createImageTrigger({
				enabled: () => {
					const value = preference.getSnapshot();
					return value.imageShortcut && (value.imageGeneration || value.imageEditing);
				},
				open: (sessionId) => sketchOpeners.get(sessionId)?.("image"),
				consume: (sessionId, span) => {
					const actx = sessions.scope(sessionId);
					return sketchOpeners.has(sessionId) && actx?.bail(actx, "slash/input-consume-token", { guard: {
						kind: "span",
						span
					} }) === true;
				}
			})), "codex-subscription: Image trigger"));
			const sessionInput = (sessionId) => {
				const actx = sessions.scope(sessionId);
				if (!actx || typeof conversation.createDraftImages !== "function" || !conversation.input?.for) throw new Error("Image composer is unavailable");
				return conversation.input.for(actx);
			};
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "codex-image-workspace",
				order: 30,
				inject: (sessionId) => ({
					preference,
					t,
					registerOpen: (callback) => {
						sketchOpeners.set(sessionId, callback);
						return () => {
							if (sketchOpeners.get(sessionId) === callback) sketchOpeners.delete(sessionId);
						};
					},
					attachSketch: (blob) => {
						const current = preference.getSnapshot();
						if (!current.imageSketch || !current.imageEditing) throw new Error("Sketch editing is disabled");
						attachImageFiles(conversation, sessionInput(sessionId), [new File([blob], "sketch-reference.png", { type: "image/png" })]);
					},
					appendPrompt: (text, mode) => {
						const current = preference.getSnapshot();
						if (!(mode === "image" ? current.imageShortcut && (current.imageGeneration || current.imageEditing) : current.imageTemplates && current.imageGeneration)) throw new Error("Image input is disabled");
						appendImagePrompt(sessionInput(sessionId), text);
					}
				})
			}, SketchWorkspace));
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "codex-image-library",
				order: 31,
				inject: (sessionId) => ({
					preference,
					t,
					loadGallery: async () => {
						const result = await rpc.call(CHANNEL, "image/gallery", { sessionId });
						if (result?.error?.code !== "not-ready") return unwrap(result);
						await new Promise((resolve) => setTimeout(resolve, 350));
						return unwrap(await rpc.call(CHANNEL, "image/gallery", { sessionId }));
					},
					loadImage: (attachment) => uiConversation.imageUrl(sessionId, attachment),
					attachSelected: async (items, signal) => {
						const enabled = () => {
							const value = preference.getSnapshot();
							return value.imageGallery && value.imageEditing;
						};
						if (!enabled() || !items.length || items.length > 5) throw new Error("Image selection is unavailable");
						const files = [];
						for (const [index, item] of items.entries()) {
							const bytes = await readOriginalImage(rpc, sessionId, item.original, { signal });
							files.push(new File([bytes], `reference-${index + 1}.png`, { type: "image/png" }));
						}
						if (!enabled()) throw new Error("Image editing is disabled");
						signal?.throwIfAborted();
						attachImageFiles(conversation, sessionInput(sessionId), files);
					}
				})
			}, ImageLibrary));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "codex_image_generate",
				locale: NS,
				inject: (sessionId) => ({
					sessionId,
					rpc,
					t,
					preference,
					loadImage: (attachment) => uiConversation.imageUrl(sessionId, attachment),
					getImageViewer: () => {
						try {
							return ctx.get("nativeImageViewer");
						} catch {
							return;
						}
					},
					getInternalImageViewer: () => imageViewer,
					attachForEdit: async (src, filename, draft, annotations = [], referenceName) => {
						if (!preference.getSnapshot().imageEditing) throw new Error("Image editing is disabled");
						const actx = sessions.scope(sessionId);
						if (actx === void 0 || typeof conversation.createDraftImages !== "function" || conversation.input?.for === void 0) throw new Error("This DSH version does not provide the image composer bridge");
						const response = await fetch(src);
						if (!response.ok) throw new Error("Could not read generated image");
						const blob = await response.blob();
						const files = [new File([blob], filename, { type: blob.type || "image/png" })];
						if (annotations.length > 0) {
							const reference = await createAnnotatedImageReference(blob, annotations);
							files.push(new File([reference], referenceName, { type: "image/png" }));
						}
						const input = conversation.input.for(actx);
						if (!preference.getSnapshot().imageEditing) throw new Error("Image editing is disabled");
						attachImageFiles(conversation, input, files);
						sessions.open(sessionId);
						if (!input.state.getSnapshot().draft.trim()) input.setDraft(draft);
						else if (annotations.length) if (!input.state.getSnapshot().occurrences?.length) appendImagePrompt(input, draft);
						else input.notify("info", draft);
					}
				})
			}, CodexImageToolRow));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
window.__ModuleLoader__.load({
	id: "dsh-codex-subscription",
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
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
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
		_deepseek_ai_dsh_client_ui_primitives = __toESM(_deepseek_ai_dsh_client_ui_primitives, 1);
		let react_dom = require("react-dom");
		//#region src/sketch-layers.js
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
		Object.freeze({
			"1:1": [1024, 1024],
			"4:3": [1024, 768],
			"3:4": [768, 1024],
			"16:9": [1024, 576],
			"9:16": [576, 1024]
		});
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
		function createSketchSessionRegistry({ maxIdle = 8 } = {}) {
			const sessions = /* @__PURE__ */ new Map(), archived = /* @__PURE__ */ new Map();
			const prune = () => {
				const idle = [...sessions].filter(([, s]) => !s.mounts && !s.dirty.current && !s.agentRun.current?.locked && s.agentRun.current?.state !== "stopped");
				for (const [id, state] of idle.slice(0, Math.max(0, idle.length - maxIdle))) {
					if (!state.saved.current && state.doc.current.layers.some((l) => l.image || l.strokes.length)) continue;
					const restoreId = state.saved.current?.id ?? state.restoreId.current;
					if (restoreId) archived.set(id, restoreId);
					state.agentRun.current?.dispose();
					state.images.current.clear();
					sessions.delete(id);
				}
			};
			return {
				get(id) {
					let state = sessions.get(id);
					if (!state) {
						state = createSketchSessionState();
						state.restoreId.current = archived.get(id) ?? null;
						archived.delete(id);
						sessions.set(id, state);
					}
					state.retain = () => {
						state.mounts++;
						return () => {
							state.mounts--;
							prune();
						};
					};
					sessions.delete(id);
					sessions.set(id, state);
					return state;
				},
				prune,
				stats: () => ({
					resident: sessions.size,
					archived: archived.size
				}),
				dispose() {
					for (const value of sessions.values()) value.agentRun.current?.dispose();
					sessions.clear();
					archived.clear();
				}
			};
		}
		//#endregion
		//#region src/client-session-compat.js
		async function withComposerSession(sessions, id, operation) {
			if (typeof sessions?.retain !== "function") throw new Error("Image composer is unavailable");
			const reference = sessions.retain(id, { source: "controllerOperation" });
			try {
				await reference.ready;
				const context = reference.binding.ctx;
				if (!context) throw new Error("Image composer is unavailable");
				return await operation(context);
			} finally {
				reference.release();
			}
		}
		function openComposerSession(_sessions, workspace, id) {
			if (typeof workspace?.openSession !== "function") throw new Error("Session navigation is unavailable");
			workspace.openSession(id);
		}
		function createSessionOpeners() {
			const entries = /* @__PURE__ */ new Map();
			return {
				register(id, callback) {
					const callbacks = entries.get(id) ?? /* @__PURE__ */ new Set();
					entries.set(id, callbacks);
					callbacks.add(callback);
					return () => {
						callbacks.delete(callback);
						if (!callbacks.size) entries.delete(id);
					};
				},
				has: (id) => entries.has(id),
				get: (id) => [...entries.get(id) ?? []].at(-1),
				clear: () => entries.clear()
			};
		}
		//#endregion
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
		//#endregion
		//#region src/image-official-tools.js
		const IMAGE_ASPECT_RATIOS = Object.freeze([
			["square", "1:1"],
			["portrait", "3:4"],
			["story", "9:16"],
			["landscape", "4:3"],
			["widescreen", "16:9"]
		]);
		/**
		* Build viewer actions for one image.
		* @param {{ src: string, name: string, t: (key: string) => string,
		*   attachForEdit: (src: string, name: string, draft: string, annotations?: unknown[], referenceName?: string, sourceInDraft?: boolean, extraFiles?: File[]) => Promise<unknown>,
		*   sourceInDraft?: boolean }} options
		*/
		function officialImageTools({ src, name, t, attachForEdit, sourceInDraft = false }) {
			const send = (draft, extraFiles = []) => attachForEdit(src, name, draft, [], void 0, sourceInDraft, extraFiles);
			const base = {
				pendingLabel: t("imageEditPreparing"),
				errorLabel: t("imageEditFailed"),
				closeOnSuccess: true
			};
			return [
				{
					...base,
					id: "remove-background",
					kind: "tool",
					label: t("imageRemoveBackground"),
					onInvoke: () => send(t("imageRemoveBackgroundPrompt"))
				},
				{
					...base,
					id: "erase",
					kind: "mask",
					label: t("imageErase"),
					onInvoke: async ({ mask }) => {
						if (!(mask instanceof Blob)) throw new Error("Mark the area to erase first");
						const maskName = `${String(name).replace(/\.[a-z0-9]+$/iu, "")}-erase-mask.png`;
						return send(t("imageErasePrompt"), [new File([mask], maskName, { type: "image/png" })]);
					}
				},
				{
					...base,
					id: "resize",
					kind: "choice",
					label: t("imageResize"),
					options: IMAGE_ASPECT_RATIOS.map(([id, ratio]) => ({
						value: ratio,
						label: `${t(`imageRatio_${id}`)} ${ratio}`
					})),
					onInvoke: ({ option }) => send(t("imageResizePrompt").replaceAll("{aspectRatio}", option))
				}
			];
		}
		//#endregion
		//#region src/client-image-previews.jsx
		function openPreview(props, item, opener, sourceInDraft = false) {
			const { service, preference, t, attachForEdit } = props;
			const settings = preference.getSnapshot();
			const referenceName = `annotated-${item.name}.png`;
			service.open({
				items: [{
					...item,
					actions: settings.imageEditing ? [
						{
							id: "edit",
							label: t("imageEdit"),
							pendingLabel: t("imageEditPreparing"),
							errorLabel: t("imageEditFailed"),
							closeOnSuccess: true,
							onInvoke: ({ annotations }) => attachForEdit(item.src, item.name, buildImageEditDraft({
								annotations,
								translate: t,
								sourceName: item.name,
								referenceName
							}), annotations, referenceName, sourceInDraft)
						},
						...officialImageTools({
							src: item.src,
							name: item.name,
							t,
							attachForEdit,
							sourceInDraft
						}),
						...settings.imageSketch && props.openSketchImage ? [{
							id: "sketch",
							label: t("imageToSketch"),
							pendingLabel: t("imageEditPreparing"),
							errorLabel: t("imageEditFailed"),
							onInvoke: () => props.openSketchImage(item.src, item.name)
						}] : []
					] : []
				}],
				opener,
				source: sourceInDraft ? "codex-draft" : "codex-message",
				annotations: settings.imageAnnotations
			});
		}
		function ComposerImagePreviews(props) {
			const { attachments, service, nativeAttachments, watchNativeAttachments, nativeTranslate } = props;
			const entry = (0, react.useSyncExternalStore)(watchNativeAttachments, nativeAttachments);
			(0, react.useEffect)(() => {
				const current = service.getSnapshot();
				if (current?.source === "codex-draft" && !attachments.some((item) => item.id === current.items[0]?.id)) service.close();
			}, [attachments, service]);
			(0, react.useEffect)(() => () => {
				if (service.getSnapshot()?.source === "codex-draft") service.close();
			}, [service]);
			const latest = (0, react.useRef)(props);
			latest.current = props;
			(0, react.useEffect)(() => {
				const onWindowClick = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					const button = target.closest("button"), image = button?.querySelector(":scope > img");
					const item = image && latest.current.attachments.find((candidate) => candidate.previewUrl === image.src);
					if (!item || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
					event.preventDefault();
					event.stopPropagation();
					event.stopImmediatePropagation();
					openPreview(latest.current, {
						id: item.id,
						src: item.previewUrl,
						name: item.file.name,
						width: item.width,
						height: item.height,
						bytes: item.file.size
					}, button, true);
				};
				window.addEventListener("click", onWindowClick, true);
				return () => window.removeEventListener("click", onWindowClick, true);
			}, []);
			if (!entry) return null;
			const NativeAttachments = entry.component;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: { display: "contents" },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NativeAttachments, {
					...props,
					t: nativeTranslate
				})
			});
		}
		function MessageImagePreview({ image, ...props }) {
			const { loadImage, t } = props;
			const [src, setSrc] = (0, react.useState)(image.preview?.url);
			const [failed, setFailed] = (0, react.useState)(false);
			const [attempt, setAttempt] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (image.preview) {
					setSrc(image.preview.url);
					return;
				}
				let live = true;
				setSrc(void 0);
				setFailed(false);
				Promise.resolve().then(() => loadImage(image.attachment)).then((value) => {
					if (live) setSrc(value);
				}, () => {
					if (live) setFailed(true);
				});
				return () => {
					live = false;
				};
			}, [
				image,
				loadImage,
				attempt
			]);
			const item = {
				...image.attachment ?? image.preview,
				...image.label ? { name: image.label } : {}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "codexImageThumb",
				"aria-label": `${t("imagePreview")} ${item.name ?? ""}`,
				disabled: !src && !failed,
				onClick: (event) => {
					if (failed) {
						setAttempt((value) => value + 1);
						return;
					}
					openPreview(props, {
						id: item.attachmentId ?? src,
						src,
						name: item.name ?? "image.png",
						width: item.width,
						height: item.height
					}, event.currentTarget);
				},
				children: src ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: item.name ?? "image"
				}) : failed ? t("accountRetry") : "…"
			});
		}
		function MessageImagePreviews({ images, align, compact, thumbnail, ...props }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexMessageImages",
				"data-align": align,
				"data-single": images.length === 1 && !compact && !thumbnail,
				"data-thumbnail": thumbnail || void 0,
				children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageImagePreview, {
					image,
					...props
				}, image.attachment?.attachmentId ?? image.preview?.url ?? index))
			});
		}
		const IMAGE_PREVIEWS_CSS = `
.codexMessageImages{display:flex;gap:10px;max-width:100%;padding:8px 0;overflow-x:auto}
.codexImageThumb{display:grid;place-items:center;width:64px;height:64px;padding:0;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:14px;background:var(--dsw-alias-interactive-bg-hover);color:inherit;overflow:hidden;cursor:zoom-in;flex:none}
.codexImageThumb img{width:100%;height:100%;object-fit:cover}
.codexImageThumb:focus-visible{outline:2px solid #4598ed;outline-offset:2px}
.codexMessageImages{flex-wrap:wrap}.codexMessageImages[data-align=end]{justify-content:flex-end}
.codexMessageImages[data-single=true] .codexImageThumb{width:240px;height:auto;max-width:100%}
.codexMessageImages[data-single=true] img{height:auto;max-height:320px;object-fit:contain}
.codexMessageImages[data-thumbnail=true]{padding:0}.codexMessageImages[data-thumbnail=true] img{object-fit:contain}
`;
		//#endregion
		//#region src/image-conversation-node.js
		const KIND = "codex-image-output";
		const hasImage = (block) => block?.content?.some((part) => part.type === "image" && part.attachment);
		const isImage = (part) => part?.type === "image" && part.attachment;
		const resultsOf = (event) => {
			if (event?.type !== "tool/result" || !["codex-subscription-image", "codex-subscription-sketch-finish"].includes(event.data.meta?.kind) || event.data.message?.isError) return [];
			const content = event.data.message?.content ?? [];
			const wrapped = content.filter((block) => block.type === "tool-result" && !block.isError && hasImage(block));
			if (wrapped.length > 0) return wrapped;
			return content.some(isImage) ? [{
				type: "tool-result",
				toolCallId: `${event.data.turn}:${event.data.step ?? event.seq}`,
				isError: false,
				content
			}] : [];
		};
		const imageConversationNode = {
			kind: KIND,
			target: "chat",
			match(event) {
				if (event.type !== "turn/end" && resultsOf(event).length === 0) return null;
				return {
					id: String(event.data.turn),
					role: "update"
				};
			},
			start: () => void 0,
			update: (context) => context.state,
			buildViewNode(context) {
				const end = context.matches.find((match) => match.event.type === "turn/end");
				if (!end) return null;
				const blocks = context.matches.flatMap(({ event }) => resultsOf(event).map((block) => ({
					...block,
					kind: "tool-result",
					meta: event.data.meta
				})));
				if (!blocks.length) return null;
				const answer = end.location.turn?.steps?.at(-1)?.data.get("assistant-step");
				const lastResultSeq = Math.max(...context.matches.filter((match) => resultsOf(match.event).length).map((match) => match.event.seq));
				const answerSeq = answer?.finalNode?.seq;
				const anchorSeq = answerSeq > lastResultSeq ? answerSeq + .025 : end.event.seq - .025;
				return {
					key: context.key,
					id: context.id,
					kind: KIND,
					target: "chat",
					location: { kind: "session" },
					anchorSeq,
					visibility: "visible",
					data: { blocks }
				};
			}
		};
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/ArrowPathIcon.js
		function ArrowPathIcon({ title, titleId, ...props }, svgRef) {
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
				d: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
			}));
		}
		const ForwardRef$3 = /*#__PURE__*/ react.forwardRef(ArrowPathIcon);
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/ExclamationCircleIcon.js
		function ExclamationCircleIcon({ title, titleId, ...props }, svgRef) {
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
				d: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
			}));
		}
		const ForwardRef$2 = /*#__PURE__*/ react.forwardRef(ExclamationCircleIcon);
		//#endregion
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/24/outline/esm/PhotoIcon.js
		function PhotoIcon({ title, titleId, ...props }, svgRef) {
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
				d: "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
			}));
		}
		const ForwardRef$1 = /*#__PURE__*/ react.forwardRef(PhotoIcon);
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
			"usage/accounts",
			"usage/history",
			"usage/profile",
			"diagnostics",
			"preferences/status",
			"preferences/models",
			"preferences/update",
			"default-model/status",
			"default-model/select",
			"default-model/reset",
			"predictions/generate",
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
		function CodexGeneratedImage({ attachment, original, rpc, sessionId, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, features }) {
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
						actions: !features.imageEditing ? [] : [
							{
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
							},
							...officialImageTools({
								src,
								name: downloadName,
								t,
								attachForEdit
							}),
							...features.imageSketch && openSketchImage ? [{
								id: "sketch",
								label: t("imageToSketch"),
								pendingLabel: t("imageEditPreparing"),
								errorLabel: t("imageEditFailed"),
								onInvoke: () => openSketchImage(src, downloadName)
							}] : []
						]
					}],
					opener: triggerRef.current,
					source: "codex-generated",
					annotations: features.imageViewer && features.imageAnnotations
				};
				if (features.imageViewer && getInternalImageViewer?.()?.open?.(request) === true) return;
				if ((getImageViewer?.())?.open?.(request) === true) return;
				if (features.imageViewer) getInternalImageViewer?.()?.open?.({
					...request,
					annotations: false
				});
				else window.open(src, "_blank", "noopener,noreferrer");
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
		function CodexImageToolRow({ presentation = "tool", block, sessionId, rpc, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, preference }) {
			const features = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const settled = block?.kind === "tool-result";
			const image = settled ? block.content.find((item) => item?.type === "image" && item.attachment !== void 0) : void 0;
			const failed = settled && block.isError === true;
			const state = !settled ? "running" : failed ? "error" : "done";
			const status = !settled ? t("imageGenerating") : failed ? t("imageFailed") : t("imageGenerated");
			const error = failed ? block.content.find((item) => item?.type === "text" && typeof item.text === "string")?.text : void 0;
			const original = decodeImagePresentation(block?.meta)?.original;
			const showOutput = presentation === "output";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexImageTool",
				"data-state": state,
				children: [
					showOutput ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexImageToolRow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(!settled ? ForwardRef$3 : failed ? ForwardRef$2 : ForwardRef$1, {
								className: "codexImageToolIcon",
								"aria-hidden": "true"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolTitle",
								children: t("imageGenerate")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolState",
								children: status
							})
						]
					}),
					!showOutput && !settled || image === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexImageToolGallery",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexGeneratedImage, {
							features,
							attachment: image.attachment,
							original,
							rpc,
							sessionId,
							loadImage,
							openSketchImage,
							attachForEdit,
							getImageViewer,
							getInternalImageViewer,
							t
						})
					}),
					!showOutput && typeof block?.meta?.requestedModel === "string" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
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
		function CodexImageOutput({ node, ...props }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexImageOutput",
				children: node.data.blocks.map((block) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageToolRow, {
					block,
					...props,
					presentation: "output"
				}, block.toolCallId))
			});
		}
		//#endregion
		//#region src/client-primitives.js
		const Input = _deepseek_ai_dsh_client_ui_primitives.Input;
		const Button = _deepseek_ai_dsh_client_ui_primitives.Button;
		const Switch = _deepseek_ai_dsh_client_ui_primitives.Switch;
		const useAnchoredPosition = _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition;
		const useDismissOnOutsidePointer = _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer;
		const IconCheckOutline16 = _deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular;
		const IconChevronDownOutline14 = _deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular;
		const IconChevronRightOutline14 = _deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular;
		const Menu = _deepseek_ai_dsh_client_ui_primitives.Menu;
		const MenuSurface = _deepseek_ai_dsh_client_ui_primitives.MenuSurface;
		const MenuGroup = _deepseek_ai_dsh_client_ui_primitives.MenuGroup;
		const Tooltip = _deepseek_ai_dsh_client_ui_primitives.Tooltip;
		//#endregion
		//#region src/client-feature.js
		function createClientFeature(importFeature) {
			let value, flight;
			let snapshot = Object.freeze({ status: "idle" });
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				snapshot = Object.freeze(next);
				for (const listener of [...listeners]) listener();
			};
			return {
				getSnapshot: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load() {
					if (value) return Promise.resolve(value);
					if (flight) return flight;
					const operation = Promise.resolve().then(importFeature).then((module) => {
						value = module;
						publish({
							status: "ready",
							module
						});
						return module;
					}, (error) => {
						publish({
							status: "error",
							error
						});
						throw error;
					}).finally(() => {
						if (flight === operation) flight = void 0;
					});
					flight = operation;
					publish({ status: "loading" });
					return operation;
				}
			};
		}
		function createFeatureReadiness() {
			let value, failure;
			const waiting = /* @__PURE__ */ new Set();
			return {
				set(next) {
					value = next;
					failure = void 0;
					if (value) for (const waiter of [...waiting]) waiter.resolve(value);
				},
				wait(timeoutMs = 15e3) {
					if (value) return Promise.resolve(value);
					if (failure) return Promise.reject(failure);
					return new Promise((resolve, reject) => {
						const finish = (callback, result) => {
							clearTimeout(timer);
							waiting.delete(waiter);
							callback(result);
						};
						const waiter = {
							resolve: (result) => finish(resolve, result),
							reject: (error) => finish(reject, error)
						};
						const timer = setTimeout(() => waiter.reject(Error("Sketch editor is not ready; reopen the board and retry")), timeoutMs);
						waiting.add(waiter);
					});
				},
				cancel(error) {
					value = void 0;
					for (const waiter of [...waiting]) waiter.reject(error);
				},
				fail(error) {
					failure = error;
					value = void 0;
					for (const waiter of [...waiting]) waiter.reject(error);
				}
			};
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
		//#region src/client-feature-status.jsx
		function FeatureLoadStatus({ failed, onRetry, t, compact = false }) {
			const label = t(failed ? "featureLoadFailed" : "featureLoading");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "codexFeatureLoadStatus",
				role: "status",
				"aria-busy": !failed,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tooltip, {
					label,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						"aria-label": label,
						disabled: !failed,
						onClick: onRetry,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForwardRef$3, {
							className: failed ? "codexFeatureRetryIcon" : "codexFeatureLoadingIcon",
							"aria-hidden": "true"
						}),
						children: compact ? null : t(failed ? "featureRetry" : "featureLoading")
					})
				})
			});
		}
		//#endregion
		//#region src/sketch-workspace.jsx
		const feature$1 = createClientFeature(() => require.async("./client.sketch.js"));
		function SketchWorkspace({ preference, attachSketch, registerOpen, t, sessionId, rpc, sessionState }) {
			const settings = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const snapshot = (0, react.useSyncExternalStore)(feature$1.subscribe, feature$1.getSnapshot);
			const [requested, setRequested] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [incoming, setIncoming] = (0, react.useState)(null);
			const opener = (0, react.useRef)(null);
			const alive = (0, react.useRef)(true);
			const bridgeGeneration = (0, react.useRef)(0);
			const activated = (0, react.useRef)(false);
			const ready = (0, react.useRef)(null);
			ready.current ??= createFeatureReadiness();
			const enabled = settings.imageSketch && settings.imageEditing;
			const agentEnabled = enabled && settings.imageSketchAgent;
			const activate = (0, react.useCallback)(() => {
				if (!alive.current) return Promise.reject(Error("Sketch session disconnected"));
				activated.current = true;
				setRequested(true);
				return feature$1.load();
			}, []);
			const agent = (0, react.useCallback)(async (generation) => {
				if (!activated.current) {
					opener.current = document.activeElement;
					setOpen(true);
				}
				await activate();
				if (!alive.current || bridgeGeneration.current !== generation) throw Error("Sketch session disconnected");
				const api = await ready.current.wait();
				if (!alive.current || bridgeGeneration.current !== generation) throw Error("Sketch session disconnected");
				return api;
			}, [activate]);
			const onAgentReady = (0, react.useCallback)((api) => ready.current.set(api), []);
			const onAgentError = (0, react.useCallback)((error) => ready.current.fail(error), []);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
					ready.current.cancel(Error("Sketch session disconnected"));
				};
			}, []);
			(0, react.useEffect)(() => registerOpen((mode = "sketch", source = document.activeElement, file) => {
				opener.current = source;
				if (mode === "sketch") {
					if (file) setIncoming({ file });
					setOpen(true);
					activate().catch(() => {});
				}
			}), [registerOpen, activate]);
			(0, react.useEffect)(() => {
				if (!agentEnabled || !rpc || !sessionId) return;
				const generation = ++bridgeGeneration.current;
				const api = Object.freeze({
					version: 2,
					sessionId,
					execute: (request) => agent(generation).then((value) => value.execute(request)),
					export: (format) => agent(generation).then((value) => value.export(format))
				});
				window.dshSketchAgent = api;
				const disconnect = connectSketchAgent(rpc, sessionId, api.execute, () => sessionState?.agentRun.current?.fail(), () => sessionState?.agentRun.current?.locked ? 350 : 2e3);
				return () => {
					bridgeGeneration.current++;
					disconnect();
					ready.current.cancel(Error("Sketch connection ended"));
					if (window.dshSketchAgent === api) delete window.dshSketchAgent;
				};
			}, [
				agentEnabled,
				rpc,
				sessionId,
				sessionState,
				agent
			]);
			const Studio = requested && snapshot.module?.SketchStudio;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [requested && !Studio ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureLoadStatus, {
				compact: true,
				failed: snapshot.status === "error",
				t,
				onRetry: () => {
					activate().catch(() => {});
				}
			}) : null, Studio ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", {
				"data-plugin": "dsh-codex-subscription-sketch",
				children: snapshot.module.SKETCH_CSS
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Studio, {
				sessionState,
				bridgeManaged: true,
				onAgentReady,
				onAgentError,
				agentEnabled: settings.imageSketchAgent,
				onOpen: () => {
					opener.current = document.activeElement;
					setOpen(true);
				},
				sessionId,
				rpc,
				incoming,
				open,
				onClose: () => {
					setOpen(false);
					opener.current?.focus();
				},
				attachSketch,
				enabled,
				t
			})] }) : null] });
		}
		//#endregion
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
		//#region src/image-workspace.jsx
		function ImageWorkspace(props) {
			const { preference, t, registerOpen } = props;
			const settings = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const workspace = (0, react.useRef)(null);
			const registerWorkspace = (0, react.useCallback)((callback) => {
				workspace.current = callback;
				const dispose = registerOpen(callback);
				return () => {
					workspace.current = null;
					dispose();
				};
			}, [registerOpen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [settings.imageSketch && settings.imageEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tooltip, {
				label: t("sketch"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "sm",
					"aria-label": t("sketch"),
					onClick: (event) => workspace.current?.("sketch", event.currentTarget),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
						name: "pen",
						size: 16
					})
				})
			}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchWorkspace, {
				...props,
				registerOpen: registerWorkspace
			}, props.sessionId)] });
		}
		//#endregion
		//#region src/image-composer.js
		function attachImageFiles(conversation, input, files, sessionId) {
			if (typeof conversation.createDrafts !== "function" || typeof input.addAttachments !== "function" || !sessionId) throw new Error("Image composer is unavailable");
			const created = conversation.createDrafts(sessionId, files);
			try {
				if (!input.addAttachments(created.map((item) => item.id))) throw new Error("The composer is busy");
			} catch (error) {
				conversation.releaseDraftAttachments(created);
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
		const resolve = (value) => typeof value === "function" ? value() : value;
		function createWorkspaceTrigger({ enabled, open, consume, name, aliases, description }) {
			return {
				trigger: "@",
				get name() {
					return resolve(name);
				},
				showGroupTitle: false,
				order: -10,
				candidates: async (session, request) => enabled() && !request.quoted && aliases.some((alias) => alias.startsWith(request.query.toLowerCase())) ? [{
					name: resolve(name),
					description: resolve(description),
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
			open: () => {},
			aliases: ["sketch", "草图"],
			name: options.name ?? "Sketch · Beta",
			description: options.description ?? "Ask the Agent to draw or edit a sketch"
		});
		const createImageTrigger = (options) => createWorkspaceTrigger({
			...options,
			aliases: ["image", "生图"],
			name: options.name ?? "Image · 生图",
			description: options.description ?? "Describe an image to generate or edit"
		});
		//#endregion
		//#region src/client-locales.js
		const zh = {
			voiceNativeCaptureConfirm: "允许本次通话使用此电脑的麦克风和扬声器？挂断或离开会话后会停止收音。",
			voiceMediaHint: "窗口不支持 WebRTC 时，可在浏览器中继续同一会话。音色试听不受影响，仍使用当前订阅，无需 API Key。",
			voiceBrowserContinue: "在浏览器继续此会话",
			voiceBrowserCall: "在浏览器继续语音通话",
			voiceBrowserCopy: "复制会话链接",
			voiceBrowserCopied: "已复制",
			voiceBrowserCopyFailed: "复制失败，请手动复制链接",
			voicePreviewSignIn: "试听需要重新登录 ChatGPT，请登录后再试。",
			voiceCatalogFailed: "语音目录加载失败，请检查网络后重试；这不表示该音色没有样本。",
			voiceDownloadFailed: "试听音频下载失败，请重试。",
			voicePlaybackFailed: "音频已取得，但播放失败。请检查浏览器的声音权限后重试。",
			voicePreviewFailed: "试听加载失败，请检查连接后重试。",
			voiceWebRTCUnavailable: "此窗口不支持语音通话所需的 WebRTC。请在支持 WebRTC 的浏览器中打开同一 DSH 会话；音色试听仍可使用。",
			voiceInsecure: "语音需要安全连接。请通过 HTTPS 或本机 localhost 打开 DSH。",
			voiceMicUnavailable: "此窗口无法使用麦克风。请在支持麦克风的浏览器中打开 DSH。",
			voiceMicMissing: "未找到可用麦克风，请检查设备连接。",
			"diagnosticsSnapshotTime": "报告快照时间：",
			"diagnosticsUnresolved": "仍有其他未恢复的失败记录，见上方摘要。",
			"diagnosticSeverity_warning": "需关注",
			"diagnosticSeverity_info": "信息",
			"diagnosticNext_restart": "重启后重新生成报告；若版本仍不一致，检查插件更新是否生效。",
			"diagnosticNext_regenerate": "复现问题后立即重新生成报告；若仍不完整，连同操作步骤反馈。",
			"diagnosticNext_supported-options": "继续使用当前可选档位即可；新增能力需要适配验证，不建议手动填入未知参数。",
			"diagnosticNext_reproduce": "核对下列操作与时间是否对应你的问题；若持续失败，反馈操作步骤和本报告。",
			"diagnosticFinding_evidence-truncated": "部分旧记录或宿主作用域未包含在快照中，报告不能覆盖全部历史。",
			"diagnosticsNoRecordedFailure": "当前记录未发现失败；未执行的功能仍未验证。",
			"diagnosticFinding_version-mismatch": "前后端版本不一致，请重启 DSH 后重新生成报告。",
			"diagnosticFinding_collection-incomplete": "部分检查未能完成，请查看详情中的失败或超时项。",
			"diagnosticFinding_catalog-gap": "在线模型目录包含当前适配层尚未支持的档位或能力；不代表模型不可用。",
			"diagnosticFinding_recent-failure": "最近 15 分钟有操作或请求失败，且同一操作尚无后续成功记录。请结合发生时间查看详情。",
			"diagnosticReason_no-readiness-check": "无独立前置检查",
			"diagnosticReason_inspection-failed": "检查未完成",
			"diagnosticReason_inspection-timeout": "检查超时",
			"diagnosticSource_network": "网络请求（非完整回复）",
			"diagnosticReason_catalog-online": "在线目录已载入",
			"diagnosticReason_catalog-unavailable": "尚未读取账户目录",
			"diagnosticReason_storage-readable": "预测缓存可读",
			"diagnosticReason_tool-registered": "全局工具已注册",
			"diagnosticReason_tool-missing": "未找到全局工具",
			"diagnosticsCoverageHint": "分别展示前置条件与最近 15 分钟的进程级证据；不限定当前账号或会话。接口响应、网络请求和工具结果不能替代完整功能验收。",
			"diagnosticsVersionMismatch": "前后端插件版本不同，请重载后重试。",
			"diagnosticsPartial": "部分信息未能采集，其余检查结果已保留。请在详情中查看失败或超时项。",
			"diagnosticsCapability": "功能",
			"diagnosticsReadiness": "前置条件",
			"diagnosticsEvidence": "近期操作证据",
			"diagnosticsUnverified": "尚未验证",
			"diagnosticsHostCollected": "已采集宿主注册与选中结果。registrant 是宿主标签，可能被压缩，不能据此识别插件或判断干扰。",
			"diagnosticsHostUnknown": "宿主界面检查不可用或未挂载，不能据此判断插件干扰。",
			"diagnosticsDetails": "展开脱敏详情",
			"diagnosticsCopyFailed": "复制失败，可展开详情手动复制。",
			"diagnosticSource_rpc": "接口响应",
			"diagnosticSource_tool": "工具",
			"diagnosticOutcome_completed": "完成",
			"diagnosticOutcome_failed": "失败",
			"diagnosticOutcome_cancelled": "取消",
			"diagnosticCapability_account": "登录",
			"diagnosticCapability_accounts": "多账号",
			"diagnosticCapability_settings": "设置",
			"diagnosticCapability_models": "模型",
			"diagnosticCapability_quota": "额度",
			"diagnosticCapability_search": "搜索",
			"diagnosticCapability_images": "生图与编辑",
			"diagnosticCapability_sketch": "草图",
			"diagnosticCapability_subagents": "子任务",
			"diagnosticCapability_compaction": "压缩",
			"diagnosticCapability_transport": "连接",
			"diagnosticCapability_storage": "存储",
			"diagnosticCapability_host-ui": "宿主界面",
			"diagnosticReason_not-instrumented": "证据不足",
			"diagnosticReason_disabled-or-host-owned": "未启用或由宿主管理",
			"diagnosticReason_sign-in-required": "依赖登录",
			"diagnosticReason_local-sign-in-present": "本地登录存在",
			"diagnosticReason_sign-in-unverified": "登录未确认",
			"diagnosticReason_settings-writable": "可写",
			"diagnosticReason_settings-readonly": "不可写",
			"diagnosticReason_restart-required": "需要重启",
			"diagnosticReason_runtime-present": "组件已安装",
			"diagnosticReason_runtime-missing": "组件未安装",
			storageLoading: "正在读取缓存占用…",
			storageTitle: "存储与缓存",
			storageForecast: "额度预测缓存",
			storageClear: "清除预测历史",
			storageHint: "仅清除本地预测历史，不影响订阅额度。",
			storageConfirm: "清除所有已登录账号的本地预测历史？预测需重新积累采样；订阅额度、图片、草稿和登录信息不受影响。",
			storageFailed: "未能读取或清除预测缓存，请重试。",
			runtimeIncompatible: "检测到不兼容的 Codex 子任务组件，请卸载后重启，再安装受支持版本。",
			runtimeManagedElsewhere: "此组件由宿主或其他依赖管理，请在 DSH 插件管理中查看；这里不能直接卸载。",
			runtimeLoading: "正在检查组件…",
			runtimeRestart: "组件已更新，请重启 DSH 后使用。",
			runtime_installing: "正在通过 DSH 安装组件…",
			runtime_removing: "正在通过 DSH 卸载组件…",
			runtime_applying: "正在应用安装结果…",
			runtimeInstall: "安装组件",
			runtimeRemove: "卸载组件",
			runtimeCancel: "取消安装",
			runtimeKeep: "保留",
			runtimeConfirmRemove: "确认卸载",
			runtimeRefresh: "刷新状态",
			runtimeActive: "有 Codex 子任务正在运行，结束后才能安装或卸载。",
			runtimeConfirm: "卸载后将切回 DSH 子任务。普通订阅聊天、生图、登录和草稿保留。确定卸载可选组件？",
			runtimeFailed: "操作未完成。请刷新状态后重试；详细原因可在 DSH 插件管理中查看。",
			runtimeBuildBlocked: "DSH 拦截了依赖安装脚本。请在官方插件管理中审核后再安装。",
			runtimeCancelled: "安装已取消，可重新安装。",
			runtimeUnavailable: "当前宿主未提供组件管理接口，请更新 DSH 或按说明手动管理。",
			runtimeHostUnsupported: "当前 DSH 版本暂无已验证的 Codex 子任务组件。",
			runtimeInstallHint: "此处只管理官方 Codex 子任务组件，由 DSH 负责安装与卸载。安装后不会自动开启子任务；仅切回 DSH 不会卸载组件。",
			compactionTitle: "云端压缩",
			compaction_dsh: "关闭",
			compaction_cloud: "开启",
			compactionHint: "长上下文由 Codex 压缩后继续请求，保留 DSH 历史与原生压缩。开启时该请求使用 SSE；历史改变后重新建立压缩状态。",
			otherModelsTitle: "在 DeepSeek 等其他模型的对话里使用订阅功能",
			otherModels_on: "开",
			otherModels_off: "关",
			otherModelsHint: "关闭后，用 DeepSeek 等非 Codex 模型对话时不再使用订阅的联网搜索（改用 DSH 搜索）、图片生成和 ChatGPT 连接器；Codex 订阅模型不受影响。手机远程控制和语音对话由你主动开启或发起，不受这个开关影响，可在“手机与更多”页单独设置。",
			advancedModelSearch: "模型与搜索",
			modelsSectionTitle: "模型",
			searchSectionTitle: "搜索",
			defaultModelTitle: "默认模型",
			defaultModelHint: "新建会话时默认使用的模型，与在对话里切换模型写的是同一处 DSH 默认模型设置。",
			defaultModelReset: "恢复 DSH 默认",
			defaultModelResetHint: "选择“恢复 DSH 默认”可清除保存的模型选择，恢复上层配置中的默认值，不影响已有会话。",
			defaultModelFollow: "跟随 DSH 默认",
			defaultModelFollowHint: "当前跟随 DSH 默认模型：{value}。选择一个 Codex 模型，之后每次新建会话都用它。",
			defaultModelUnknown: "未知",
			defaultModelUnavailable: "当前 DSH 版本没有提供默认模型服务，无法在这里设置。",
			defaultModelNoCatalog: "登录并加载模型后即可选择默认模型。",
			defaultModelFailed: "默认模型读取或保存失败，请重试，或改在对话中切换模型。",
			inputImageDetail: "输入图片精度",
			inputImageDetailHint: "控制发送给模型的图片精度，精度越高输入 token 用量越大。",
			inputImageDetail_auto: "自动",
			inputImageDetail_low: "低",
			inputImageDetail_high: "高",
			inputImageDetail_original: "原图",
			connectors: "ChatGPT 连接器",
			connectorsHint: "让 DSH 里的任何模型使用你在 ChatGPT 里已连接的应用（GitHub、Gmail、云端硬盘、日历等）。需先在 ChatGPT 里连接应用；应用返回的内容来自第三方，模型不会照其中的指令行事。",
			connectorsMode_off: "连接器关闭，模型看不到这些应用。",
			connectorsMode_read: "模型只能读取（搜邮件、读文件、查 PR），不会修改任何数据。",
			connectorsMode_ask: "发邮件、改文件等写操作每次都会弹出确认，你批准后才执行。",
			connectorsMode_write: "写操作直接执行，不再弹出确认，误操作无法撤回，请谨慎使用。",
			connectors_off: "关闭",
			connectors_read: "只读",
			connectors_ask: "询问后写入",
			connectors_write: "直接写入",
			defaultReasoningEffort: "默认推理等级",
			defaultReasoningEffortHint: "未手动选档时使用；模型不支持时跟随该模型默认值。",
			composerPredictions: "输入预测",
			composerPredictionAccept: "接受建议",
			composerPredictionsShortHint: "Tab 填入草稿",
			composerPredictionsHint: "支持的 Codex 模型在一轮对话完成、草稿为空时，基于当前会话建议下一条消息。Tab 填入草稿，不会自动发送。会产生额外预测请求。官方 Codex 生成预测不计额度或 Credits；DSH 第三方接入是否享有相同豁免尚未确认。接受后发送消息仍正常计量。",
			featureLoading: "正在加载…",
			featureLoadFailed: "加载失败，点击重试",
			featureRetry: "重试",
			defaultUltraHint: "Ultra 是 DSH 主动分工预设，使用模型目录指定的实际推理档，不扩大权限；仅支持的模型显示。",
			defaultReasoningEffort_ultra: "Ultra（主动分工）",
			defaultReasoningEffort_auto: "模型默认",
			defaultReasoningEffort_off: "关闭推理",
			defaultReasoningEffort_minimal: "极低",
			defaultReasoningEffort_low: "低",
			defaultReasoningEffort_medium: "中",
			defaultReasoningEffort_high: "高",
			defaultReasoningEffort_xhigh: "超高",
			defaultReasoningEffort_max: "最高",
			reasoningSummary: "推理摘要",
			reasoningSummaryHint: "让模型在会话的“思考”部分给出推理摘要。自动由模型决定；简洁更短；详细更完整；关闭则不要摘要。",
			reasoningCache: "切换推理强度时复用缓存",
			reasoningCache_off: "关闭",
			reasoningCache_on: "开启",
			reasoningCacheHint: "默认开启，仅对支持的模型生效，切换推理强度时尽量复用此前缓存。关闭后仍有普通缓存；不保证每次命中或提速。",
			reasoningCacheCloud: "当前使用云端自动压缩，此优化暂不生效。切回 DSH 压缩后按此开关的选择生效；不会自动更改压缩设置。",
			reasoningCacheRetry: "当前使用无限重试，此优化暂不生效。切回普通重试策略后按此开关的选择生效；不会自动更改重试设置。",
			retryPolicy: "请求重试",
			retryPolicyHint: "请求因网络或服务端错误失败时的自动重试次数。默认沿用 DSH 的标准重试；无限会一直重试直到成功或手动停止。",
			retryPolicy_default: "默认",
			retryPolicy_off: "不重试",
			retryPolicy_10: "10 次",
			retryPolicy_20: "20 次",
			retryPolicy_unlimited: "无限",
			reasoningSummary_auto: "自动",
			reasoningSummary_concise: "简洁",
			reasoningSummary_detailed: "详细",
			reasoningSummary_none: "关闭",
			subagentBackendTitle: "独立子任务",
			subagentBackend_dsh: "DSH",
			subagentBackend_codex: "Codex",
			connectionTitle: "连接方式",
			diagnosticsLog: "运行日志",
			diagnosticsLogHint: "按时间记录运行中发生的事，错误和警告在最上面的筛选里。内容已去掉令牌、邮箱和路径。",
			logLevel_all: "全部",
			logLevel_warn: "警告和错误",
			logLevel_error: "仅错误",
			logEmpty: "这个级别暂时没有记录。",
			logCopy: "复制日志",
			logCopied: "已复制日志",
			logEarlier: "上次运行",
			remoteTitle: "手机远程控制",
			remote_off: "关闭",
			remote_on: "开启",
			voiceStart: "语音对话",
			voiceEnd: "结束语音",
			voiceConnecting: "正在连接语音…",
			voiceListening: "在听",
			voiceSpeaking: "在说",
			voiceWorking: "DSH 正在处理…",
			voiceMute: "关闭麦克风",
			voiceUnmute: "打开麦克风",
			voiceMuteSpeaker: "关闭声音",
			voiceUnmuteSpeaker: "打开声音",
			voiceMicBlocked: "没有麦克风权限，请在浏览器或系统里允许后再试。",
			voiceFailed: "语音没有接通，请稍后再试。",
			voiceTitle: "语音对话",
			voiceHint: "输入框里没有内容时，发送键变成语音键：点一下就能和 DSH 说话，让它做事，它的回答会念出来。语音通话由 ChatGPT 订阅提供，通话内容会经过 OpenAI。",
			voiceVoice: "音色",
			voiceLanguage: "回答语言",
			voiceAuto: "跟你说的语言一致",
			voicePlay: "试听",
			voiceLoading: "加载中…",
			voiceNoSample: "这个音色暂时没有试听样本。",
			voiceUnavailable: "暂无试听",
			voiceMore: "更多音色（暂无试听）",
			voiceLang_zh: "中文",
			voiceLang_en: "English",
			voiceLang_ja: "日本語",
			voiceLang_ko: "한국어",
			voiceLang_es: "Español",
			voiceLang_fr: "Français",
			voiceLang_de: "Deutsch",
			voiceLang_pt: "Português",
			voiceLang_ru: "Русский",
			voicePreviewHint: "切换回答语言会播放该语言的试听；选择自动跟随时，试听使用英语。",
			remoteHint: "开启后，这台电脑上的 DSH 会出现在 ChatGPT 手机 App 的 Codex 主机列表里，可用手机查看对话、发消息、切换模型和审批。需要订阅账号登录；电脑要保持开机和联网。",
			remoteConnected: "电脑已连上 ChatGPT，还没有手机连接",
			remoteConnecting: "正在连接",
			remoteWaiting: "正在等待上一次连接释放，通常几分钟内自动连上",
			remoteUnauthorizedHelp: "服务器拒绝了手机远程（401/403）。请先确认 ChatGPT 登录没有过期；如果登录正常，可能是账号还没开启两步验证（这只是推测），请到 ChatGPT 安全设置里开启后再试。",
			remoteConflictLong: "长时间连不上，通常是另一台电脑、另一份 DSH（或另一个窗口）也在用同一个 ChatGPT 账号开着手机远程，彼此在抢连接。请关闭其他地方的手机远程，再回到这里点“关闭”后重新“开启”。",
			remoteError: "连接失败，会自动重试",
			remoteStopped: "已停止",
			remotePaired: "已配对的手机",
			remoteNoPhones: "还没有手机配对。",
			remoteRevoke: "移除",
			remoteLastSeen: "最近 {date}",
			remotePhoneUnknown: "未命名手机",
			remotePhones: "手机已连接 {count} 部",
			remotePair: "显示配对码",
			remotePairAgain: "重新生成配对码",
			remotePairFailed: "无法生成配对码，请确认已登录订阅账号。",
			remotePairSteps: "在手机 ChatGPT App 的 Codex 里扫码，或输入下面的手动码。",
			remoteManualCode: "手动配对码",
			remoteQrLabel: "配对二维码",
			remoteExpires: "约 {minutes} 分钟内有效",
			remoteExpired: "配对码已过期，请重新生成。",
			remoteLimits: "手机上可以查看和继续 DSH 里的对话、新建对话、发图片、切换模型、选择权限并审批，也能查看改动。手机不能在电脑上执行其他命令。",
			reviewModelTitle: "Auto review 审查模型",
			reviewModel_session: "当前模型",
			reviewModel_official: "Codex 官方审查模型",
			reviewModelHint: "默认使用当前模型。选择官方后，DSH Auto review 用 Codex 自带的审查模型判断工具调用（账号目录提供时），审查规则与放行、拒绝流程仍由 DSH 负责；不可用时沿用当前模型。",
			connectionHint: "默认 SSE。WebSocket 实验性复用连接与上下文传输；连接失败可回退 SSE。下次请求生效，不扩大上下文容量。",
			streamIdleTimeoutTitle: "流无响应超时",
			streamIdleTimeoutHint: "连续多久没有收到任何流式数据时中断本次请求，不是整体回答时限。调低可能中断较慢但仍在推理的回答，并交由 DSH 重试处理。默认 10 分钟。",
			streamIdleTimeout_2: "2 分钟",
			streamIdleTimeout_5: "5 分钟",
			streamIdleTimeout_10: "10 分钟",
			streamIdleTimeout_20: "20 分钟",
			streamIdleTimeout_30: "30 分钟",
			subagentBackendHint: "Codex 复用订阅登录和工作区权限；默认继承当前订阅模型。在“插件 → 子智能体”开启模型选择并勾选允许的模型后新建会话，可在聊天中指定允许的订阅模型与推理档位；非订阅会话需指定。共享上下文子任务仍用 DSH。",
			subagentBackendUnavailable: "当前宿主缺少子代理服务，请更新 DSH。",
			subagentRuntimeMissing: "尚未准备 Codex 子任务运行时，仅影响此选项。普通订阅对话无需安装。",
			subagentRuntimePrepare: "准备方法（含离线说明）",
			subagentRuntimeInstalled: "已检测到 Codex 子任务组件；启动时会检查可执行文件。",
			subagentRuntimeManage: "安装、卸载与存储",
			subagentRuntimeCacheHint: "卸载后安装缓存可能仍保留，由 DSH 或 Portable 统一管理。此处不会删除登录、草稿或生成图片。",
			sketchRecovered: "已恢复未保存草稿",
			sketchRecoveryFailed: "恢复检查点保存失败，请手动保存或导出草稿。",
			sketchStorageBlocked: "草稿正被其他窗口占用，请关闭其他草图窗口后重试。",
			sketchDraftLimit: "已达 20 份草稿上限。请先导出，或删除不需要的草稿后保存。",
			sketchStorageLimit: "草稿存储空间已满。请先导出，或删除不需要的草稿后保存。",
			sketchSizeShort: "粗细",
			sketchObjectDuplicate: "复制对象",
			sketchObjectDelete: "删除对象",
			sketchBrushHint_pen: "实色圆头墨线",
			sketchBrushHint_pencil: "细腻颗粒，叠画加深",
			sketchBrushHint_marker: "半透明平头，适合高亮",
			sketchDismissStatus: "收起提示",
			sketchRunResumeHint: "允许 Agent 接收后续绘图请求，不会自动重发消息",
			sketchTool_select: "选择",
			sketchTool_text: "文字",
			sketchTool_arrow: "箭头",
			sketchShapes: "图形",
			sketchText: "编辑文字",
			sketchTextDone: "完成",
			sketchTextSize: "字号",
			sketchBrush: "笔型",
			sketchFill: "填色",
			sketchDownload: "下载",
			sketchExportFormat: "导出格式",
			sketchEditableFile: "可编辑草稿",
			sketchFormatHint: "PNG 为合并图片；可编辑草稿保留原生笔画，可重新导入（32 MB 内）。",
			imageToSketch: "进入草图",
			imageRemoveBackground: "移除背景",
			imageRemoveBackgroundPrompt: "移除此图像的背景。保持所有前景主体不变且完整，边缘干净平滑。将背景设为透明。",
			imageErase: "擦除",
			imageEraseHint: "在要移除的内容上涂抹",
			imageErasePrompt: "从第一张图像中移除第二张图像中标记的区域",
			imageBrushSize: "画笔大小",
			imageUndo: "撤销",
			imageSend: "发送",
			imageResize: "调整大小",
			imageResizePrompt: "将宽高比设为 {aspectRatio}",
			imageRatio_square: "正方形",
			imageRatio_portrait: "竖向",
			imageRatio_story: "故事版式",
			imageRatio_landscape: "横向",
			imageRatio_widescreen: "宽屏",
			sketchPictures: "图片",
			sketchPictureAdd: "添加",
			sketchPictureSelect: "选择图片",
			sketchPicturesEmpty: "导入或粘贴图片，作为当前草图的图层。",
			sketchFlow: "浓度",
			sketchZoomOut: "缩小画布",
			sketchZoomIn: "放大画布",
			sketchFit: "重置视图",
			sketchKeys: "快捷键",
			sketchKeysEnabled: "启用快捷键",
			sketchNavigationHint: "空格拖动画布 · Alt 滚轮缩放 · 中键拖动",
			sketchKeyHint: "点击右侧输入框后按键修改，重复按键不接受。Ctrl Z / Shift Z 撤销重做，Ctrl S 保存；[ ] 调笔宽。",
			sketchKey_pen: "画笔",
			sketchKey_eraser: "橡皮",
			sketchKey_line: "直线",
			sketchKey_rectangle: "矩形",
			sketchKey_circle: "椭圆",
			sketchKey_pan: "拖动画布",
			sketchKey_zoomIn: "放大",
			sketchKey_zoomOut: "缩小",
			sketchKey_fit: "重置视图",
			sketchReplay: "回放",
			sketchReplayTitle: "绘制过程",
			sketchReplayClose: "返回",
			sketchReplayPlay: "播放",
			sketchReplayPause: "暂停",
			sketchReplaySpeed: "回放时长",
			sketchReplayFast: "12 秒",
			sketchReplayNormal: "30 秒",
			sketchReplaySlow: "60 秒",
			sketchReplayRecord: "录制过程视频",
			sketchReplaySave: "保存视频",
			sketchReplayAgain: "回到回放",
			sketchReplaySaveHint: "点「保存视频」时，系统会让你选择保存位置。",
			sketchReplayStopRecording: "停止录制",
			sketchReplayEmpty: "还没有可回放的绘制。",
			sketchReplayUnsupported: "当前环境不支持录制视频。",
			sketchReplayFileSuffix: "过程",
			sketchReplayHint: "按落笔顺序重放整幅画；录制会把回放生成 WebM 视频（按所选时长实时录制），录完先在这里预览，再决定是否保存。",
			sketchFiles: "草稿",
			sketchNew: "新建草图",
			sketchImport: "导入文件",
			sketchDraftName: "草稿名称",
			sketchSave: "保存草稿",
			sketchDeleteDraft: "删除",
			sketchDeleteConfirm: "确认删除",
			sketchFileClose: "收起",
			sketchLocalDrafts: "本浏览器保存，最多 20 份。关闭时自动保存；图片可粘贴或拖入（PNG / JPEG / WebP，20 MB 内）。",
			sketchStorageFailed: "未能完成操作。请检查本地存储空间、草稿和图层数量，或图片格式与大小；当前画布仍保留。",
			sketchAttachShort: "附加",
			sketchTool_line: "直线",
			sketchStability: "抬笔平滑",
			sketchStability0: "关闭",
			sketchStability25: "弱",
			sketchStability50: "中",
			sketchStability75: "强",
			sketchShortcuts: "B 画笔 · E 橡皮 · L 直线 · R 矩形 · O 椭圆 · [ ] 粗细 · Ctrl Z 撤销 · Ctrl Shift Z 重做 · Ctrl S 保存 · Shift 直线吸附",
			sketchRatio: "画布比例",
			sketchRatioHint: "画布比例；切换时等比保留笔画，可撤销",
			forecastCompactPending: "待估",
			forecastCompactChanging: "重估",
			forecastCompactStale: "待更新",
			imageEditShort: "继续编辑",
			forecastResolution: "暂时估不准：读数变化不足以确定速度",
			forecastChanging: "使用强度变化，正在重新估计",
			forecastStale: "额度数据已过期，等待更新",
			imageDropHere: "松开以添加参考图片",
			imageDropUnavailable: "当前无法添加图片",
			imageRemoveDraft: "移除图片",
			recoveryClear: "清除登录信息",
			recoveryClearConfirm: "确认清除并重新登录",
			recoveryClearHint: "将移除本插件保存的所有订阅账号登录信息，保留会话和设置。完成后可重新登录。",
			recoveryHint: "重试仍失败时可清除登录信息。连接中断时请先恢复 DSH 服务；高级与诊断可生成本地诊断。",
			recoveryFailed: "清除未确认成功，请先恢复 DSH 服务，再重试。",
			quotaThresholdReached: "已达到额度提醒阈值",
			imageCapability: "图片生成与编辑",
			imageCapabilityHint: "允许模型按你的要求制作或修改图片。",
			imageCapability_on: "启用",
			imageCapability_off: "关闭",
			imageEntryPoints: "创作入口",
			imageEntryPointsHint: "@生图入口；隐藏后仍可用自然语言生图。",
			imageEntryPoints_on: "显示",
			imageEntryPoints_off: "隐藏",
			imageBrowsing: "图片浏览",
			imageBrowsingHint: "预览粘贴图片与会话图片，可标注、移除背景、擦除、调整大小。",
			imageBrowsing_on: "增强",
			imageBrowsing_off: "DSH 默认",
			imageGroupMixed: "保留原设置",
			imageQuality_auto: "自动",
			imageQuality_low: "低",
			imageQuality_medium: "中",
			imageQuality_high: "高",
			imageQuality_xhigh: "超高",
			imageQuality_max: "最高",
			imageWorkspaceMenu: "图片工具",
			imageCreateAction: "生成或编辑图片",
			imageCreateGroup: "创作",
			imageShortcut: "@生图快捷入口",
			imageCreateTitle: "描述你想要的图片",
			imageDraftHint: "填入草稿后由你发送。参考图可先附在输入框，不会自动生成或改写已有说明。",
			imageDraftFailed: "无法填入草稿。请保留说明，检查输入框是否正在发送或含有引用。",
			imageCreatePrompt: "请使用订阅图片工具按以下要求制作图片；如附有参考图，请基于所附图片编辑：",
			imageDetails: "图片信息",
			imageRequestedModel: "请求模型",
			imageReportedModel: "服务端报告模型",
			imageModelUnreported: "未报告",
			imageRequestedSize: "请求尺寸",
			imageActualSize: "实际尺寸",
			imageModel: "请求型号",
			imageQuality: "请求质量",
			imageExperimental: "实验",
			imageModelHint: "2.5 为实验选项：请求已成功出图，但尚无法确认指定型号或质量是否生效。",
			sketchTool_pen: "画笔",
			sketchTool_rectangle: "矩形",
			sketchTool_circle: "椭圆",
			sketchTool_eraser: "橡皮",
			sketchCanvas: "草图画板 · Beta",
			sketchCanvasHint: "默认关闭；开启后显示手动画板入口。",
			sketchCanvas_on: "开启",
			sketchCanvas_off: "关闭",
			sketchAgent: "Agent 绘图 · Beta",
			sketchAgentHint: "默认关闭；开启后可用 @sketch 请求 Agent 绘图，需要同时开启草图画板。",
			sketchRun_drawing: "Agent 正在绘制…",
			sketchRun_finished: "绘制完成",
			sketchRun_stopped: "绘制已停止",
			sketchRun_failed: "绘制失败",
			sketchRunStop: "停止绘制",
			sketchRunResume: "允许继续绘制",
			sketchAgent_on: "开启",
			sketchAgent_off: "关闭",
			imageSettings: "图片",
			imageGeneration: "生成新图片",
			imageEditing: "参考图编辑",
			imageViewer: "增强图片查看器",
			imageAnnotations: "图片标注",
			imageSketch: "草图画板 · Beta",
			imageSettingsHint: "关闭功能保留历史图片。草图作为参考图发送，需要开启参考图编辑；标注需要增强查看器。",
			sketch: "草图 · Beta",
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
			searchOptions: "搜索选项",
			searchDomainCount: "个域名",
			catalogRefresh: "刷新模型",
			catalogOnline: "已加载账户在线模型目录",
			catalogCached: "正在使用本地保存的账户模型目录",
			catalogCachedFailed: "正在使用本地模型目录，在线更新失败。",
			catalogSignedOut: "登录后显示账户可用的模型。",
			catalogLoading: "正在读取账户模型目录…",
			catalogFailed: "无法读取账户模型目录，请检查网络后重试。",
			pickerModelsTitle: "输入框模型列表",
			pickerModelsHint: "只控制输入框中的模型列表；不会影响已选模型或模型请求。新模型默认显示。",
			searchMode: "订阅搜索模式",
			searchMode_live: "实时",
			searchMode_cached: "缓存（实验）",
			searchMode_disabled: "停用",
			searchModeHint: "仅影响 Codex 订阅搜索。缓存模式请求已有索引，需实机确认账户支持；失败时不会自动切换来源。",
			searchDomains: "结果域名筛选",
			searchDomainsHint: "留空显示全部结果；最多 20 个域名，逗号分隔，包含其子域名。只筛选返回结果，不限制搜索服务访问范围。",
			searchDomainsInvalid: "请输入域名，不含网址协议、路径或通配符。最多 20 个。",
			sketchBrushType: "笔刷",
			sketchBrush_pen: "钢笔",
			sketchBrush_pencil: "铅笔",
			sketchBrush_marker: "荧光笔",
			sketchEraserMode: "橡皮模式",
			sketchErase_pixel: "局部擦除",
			sketchErase_stroke: "整笔擦除",
			sketchLayers: "图层",
			sketchLayer: "图层",
			sketchLayerAdd: "新建图层",
			sketchLayerVisible: "显示图层",
			sketchLayerName: "图层名称",
			sketchLayer_duplicate: "复制图层",
			sketchLayer_up: "上移图层",
			sketchLayer_down: "下移图层",
			sketchLayer_delete: "删除图层",
			sketchClearLayer: "清空当前图层",
			sketchHiddenLayer: "当前图层已隐藏，请先显示或选择其他图层。",
			sketchLimit: "已达到笔画上限，请清理不需要的笔画后继续。",
			sketchLayerHint: "只编辑当前图层；导出可见图层。撤销支持笔画与图层操作。",
			imageInlinePrompt: "请生成或编辑图片：",
			quotaAlerts_custom: "自定义",
			quotaShortThreshold: "5h 剩余",
			quotaLongThreshold: "周／长周期剩余",
			quotaThresholdInvalid: "请输入 1–100 的整数",
			quotaAlerts: "额度提醒",
			quotaAlerts_off: "关闭",
			quotaAlerts_important: "剩余 20%",
			quotaAlerts_early: "提前提醒",
			quotaAlertsHint: "低于所选剩余阈值时提醒；自定义可分别设置短周期与长周期。仅使用新鲜数据，不弹窗打断。",
			quotaWarning: "{window}额度剩余 {value}%，请留意用量与重置时间。",
			speedFastAstraHint: "Astra 约 2 倍速度，消耗更多 Credits",
			speedUltrafast: "极速 Beta",
			speedUltrafastHint: "Ultrafast 档，仅账号目录提供时显示（目前为 Pro 500）；速度最快，额度和 Credits 消耗更快",
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
			removeCancel: "取消",
			signOutAll: "退出全部账号",
			signOutConfirm: "确认退出（需重新登录）",
			cancel: "取消",
			submit: "提交授权码",
			openLogin: "打开登录页",
			manualCode: "若浏览器回调没有自动完成，请粘贴授权码或完整重定向地址。",
			deviceHint: "在登录页输入此设备代码：",
			waiting: "正在等待登录完成…",
			failed: "登录失败，请重试。",
			failed_account_claim: "登录已授权，但这个账号的令牌里没有 ChatGPT 账号 ID（常见于只用手机号注册的账号）。请改用邮箱账号登录，或先在 ChatGPT 里为账号绑定邮箱后重试。",
			failed_network: "登录时网络连接失败。请检查网络或代理后重试。",
			failed_token_exchange: "授权已完成，但换取令牌失败。请重试；反复出现时请检查网络或代理。",
			failed_callback: "没有收到浏览器的授权回调。请重试，或改用设备码登录。",
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
			diagnosticsCopy: "复制诊断（精简）",
			diagnosticsCopyFull: "复制完整诊断",
			diagnosticsCopied: "已复制",
			diagnosticsFailed: "服务端诊断不可用，已生成可复制的本地脱敏诊断。请检查 DSH 服务连接与插件版本。",
			feedbackOpen: "反馈问题",
			showEmail: "显示完整邮箱",
			hideEmail: "隐藏邮箱",
			emailUnavailable: "邮箱不可用",
			searchTitle: "搜索来源",
			searchScope: "自动按当前会话模型分流；手动选择固定来源。关闭“其他模型”后，非 Codex 会话只用 DSH 原生搜索。",
			searchAuto: "自动",
			searchAutoHint: "Codex 模型优先订阅搜索，其他模型优先 DSH；仅缺少登录、Key 或服务不可用时尝试另一方。关闭“其他模型”后，非 Codex 会话只用 DSH 原生搜索。",
			searchDsh: "DSH 默认",
			searchDshHint: "只使用 DSH 当前配置的搜索服务，失败直接报错；插件不再额外使用 DeepSeek 账号回退。费用由 DSH 所选服务决定。",
			searchCodex: "Codex 订阅",
			searchCodexHint: "固定使用 ChatGPT 订阅搜索，失败直接报错。关闭“其他模型”后，非 Codex 会话只用 DSH 原生搜索。",
			preferenceFailed: "设置未保存。",
			preferenceRetry: "重试",
			usage: "订阅额度",
			refresh: "刷新",
			refreshing: "刷新中…",
			noUsage: "登录后可读取 ChatGPT 返回的额度窗口。",
			overviewTitle: "使用概览",
			overviewLoading: "正在读取使用统计…",
			overviewUnavailable: "当前账户没有提供使用统计。",
			overviewHeatmap: "最近半年每天的 token 用量",
			overviewNoUse: "没有使用",
			overviewTokens: "{value} token",
			overviewDays: "{value} 天",
			overviewHours: "{value} 小时",
			overviewMinutes: "{value} 分钟",
			overviewLifetime: "累计 token",
			overviewPeak: "单日最高",
			overviewStreak: "连续使用",
			overviewLongestStreak: "最长连续",
			overviewThreads: "会话总数",
			overviewEffort: "最常用推理档",
			overviewFast: "快速模式占比",
			overviewLongestTurn: "最长单轮",
			settingsRestartRequired: "设置已保存，重启 DSH 后生效。",
			historyTitle: "额度去向",
			historyLoading: "正在读取用量历史…",
			historyPeriods: "额度周期",
			historyUsed: "这个周期已用 {value}% 的额度",
			historyPartial: "（统计尚未完成）",
			historyApproximate: "数据来自官方用量报告，可能不完整或延迟更新。",
			historyBy_model: "按模型",
			historyBy_surface: "按入口",
			historyBy_thread_source: "按来源",
			historyBy_turn_trigger: "按触发方式",
			historyDesktopApp: "桌面应用",
			historyCli: "命令行",
			historyIde: "IDE 扩展",
			historyWeb: "网页",
			historyMobile: "手机",
			historyUser: "你的对话",
			historySubagent: "子任务",
			historyMemory: "记忆整理",
			historyReview: "审查",
			historyComposer: "输入框发送",
			historyAutomation: "自动任务",
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
			resetCreditsHint: "使用重置可恢复短周期额度、每周额度，或两者同时恢复。",
			resetAvailableTab: "可用",
			resetFull: "完全重置",
			resetCreditsAvailable: "额度重置（可用 {count} 次）",
			resetCreditDefaultName: "额度重置",
			resetUse: "使用重置",
			resetPreparing: "准备中…",
			resetConfirmTitle: "确认使用额度重置",
			resetWarning: "执行后会消耗 1 次，且无法撤销。",
			resetEarlyWarning: "当前额度未用尽，服务可能不执行重置。",
			resetAcknowledge: "我知道这次操作可能立即消耗 1 次重置",
			resetCreditExpires: "有效期至：{value}",
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
			accountQuotaLeft: "{label}剩余 {value}%",
			accountQuotaResets: "{value} 重置",
			accountQuotaLoading: "正在读取额度…",
			accountQuotaError: "暂时读不到这个账号的额度",
			accountQuotaNone: "没有额度窗口信息",
			resetRenewLogin: "登录状态已失效，请重新登录。",
			resetBlocked: "ChatGPT 的网络防护拦截了这次请求（HTTP 403），登录状态没有问题。请稍后再试，或检查网络、代理或 VPN。",
			resetExpired: "本次确认已失效，请重新开始。",
			resetInProgress: "额度重置正在处理中。",
			resetTooEarly: "请等待冷静期结束后再确认。",
			resetAcknowledgeRequired: "请先确认已了解这次操作可能消耗重置次数。",
			resetAccountChanged: "登录账号已变更，请重新开始。",
			resetUncertain: "服务端返回结果不确定。请再次确认，插件会复用同一个请求，不会另外发起一次重置。",
			creditsNote: "下方的额外 Credits 和额度重置与套餐额度分开计算。",
			creditsExpires: "预计 {date} 到期，还剩 {days} 天",
			creditsExpiredToday: "今天 {date} 到期",
			creditsExpiryEstimate: "（估计：官方公布的 Pro 200 补偿 Credits 到期日，接口未返回，以 ChatGPT 使用情况页为准）",
			creditsAfterAllowance: "Credits 要等套餐额度用完后才会开始消耗，官方没有“先用 Credits”的开关。",
			creditsMessages: "约可发 {local} 条本地消息 / {cloud} 条云端消息",
			chatPass: "ChatPass 每周额度",
			creditsUsed: "已用 {used} / {limit} credits",
			spendReached: "Credits 月度消费上限已用尽。",
			unavailable: "暂无数据",
			quickQuotaSetting: "输入框额度",
			quickQuotaOff: "关闭",
			quickQuotaPercent: "百分比",
			quickQuotaBar: "进度条",
			quickQuotaForecast: "续航预测",
			quickQuotaBeta: "Beta",
			autoQuotaRetry: "额度重置后自动重试",
			autoQuotaRetryHint: "开启后，等待已确认的短时额度重置；对话会显示等待原因且可停止，等待期间切换账号会立即重试。",
			quickQuotaForecastHint: "输入框仅显示剩余额度，悬浮或点击查看预测。按最近两小时用量估算何时用完；未来用量变化会影响结果，仅供参考。历史保存在本机。",
			contextTitle: "上下文窗口",
			contextStandard: "标准",
			contextStandardHint: "使用当前账号模型目录的默认窗口。实际对话预算会按官方系数预留安全空间（未提供时为 5%），再由 DSH 管理输出预留和压缩。",
			contextExtended: "扩展",
			contextExtendedHint: "使用当前账号模型目录允许的最大窗口，实际可用性由服务端决定。设置值为原始容量；对话预算会预留与标准档相同的安全空间。",
			contextCustom: "自定义",
			contextCustomHint: "输入完整 Token 数值，不超过当前模型上限；安全空间会自动预留，无需手动扣除。较低数值会更早触发压缩。",
			contextTokens: "Token 上限",
			contextFixed: "固定 {value}",
			contextMaximum: "范围 {minimum}–{value}",
			settingsTab_start: "开始",
			settingsTab_models: "模型",
			settingsTab_tools: "联网与工具",
			settingsTab_create: "创作",
			settingsTab_more: "手机与更多",
			subtasksTitle: "子任务",
			subagentBackendNeedsRuntime: "先点下面的「安装组件」，才能让官方 Codex 执行子任务。",
			imageShortcutNeedsImages: "先开启图片生成或编辑。",
			sketchSectionTitle: "草图画板",
			settingsReadonly: "当前无法修改设置（DSH 没有开放写入）。",
			needSignIn: "还没有登录，大部分功能要先登录 ChatGPT。",
			needSignInGo: "去登录",
			creditsFoldTitle: "额外 Credits 与额度重置",
			paceWarning: "按现在的速度，{runOut}就会用完，早于{reset}。",
			paceWhen: "{day}{part}",
			paceResetOf: "{day}的重置",
			paceDay_today: "今天",
			paceDay_tomorrow: "明天",
			pacePart_morning: "早上",
			pacePart_afternoon: "下午",
			pacePart_evening: "晚上",
			pacePart_night: "夜里",
			state_predictions_on: "已开启，建议可用时按 Tab 填入草稿。",
			state_predictions_off: "已关闭，不会发起输入预测请求。",
			state_autoQuotaRetry_on: "额度耗尽后可自动等待短时额度恢复并重试。",
			state_autoQuotaRetry_off: "额度耗尽后不自动等待恢复并重试。",
			state_compaction_on: "已开启，长上下文由 Codex 自动压缩。",
			state_compaction_off: "已关闭云端压缩，继续使用 DSH 压缩。",
			state_reasoningCache_on: "已开启，支持的模型尽量复用推理缓存。",
			state_reasoningCache_off: "已关闭此优化，普通缓存仍可使用。",
			searchState_auto: "按当前模型自动选择搜索来源。",
			searchState_dsh: "当前选择 DSH；失败时不切换 Codex。",
			searchState_codex: "当前选择 Codex；失败时不切换 DSH。",
			fetchState_dsh: "使用 DSH 读取网页正文。",
			fetchState_codex: "使用 Codex 读取网页正文。",
			contextState_standard: "跟随各模型的默认上下文预算。",
			contextState_extended: "使用各模型支持的扩展上下文预算。",
			contextState_custom: "使用下方为各模型设置的自定义预算。",
			defaultModelCurrent: "当前默认模型：{value}",
			state_otherModels_on: "已允许 DeepSeek 等模型使用订阅工具。",
			state_otherModels_off: "订阅工具仅供 GPT / Codex 模型使用。",
			state_imageGeneration_on: "已开启，可在对话中生成新图片。",
			state_imageGeneration_off: "已关闭，不提供新图片生成。",
			state_imageEditing_on: "已开启，可按参考图或标注区域编辑图片。",
			state_imageEditing_off: "已关闭，不提供参考图编辑。",
			state_imageShortcut_on: "已开启，@ 菜单显示“生成图片”入口。",
			state_imageShortcut_off: "已关闭，@ 菜单不显示生图入口。",
			state_imageViewer_on: "已开启增强图片查看与标注。",
			state_imageViewer_off: "增强图片查看与标注未同时开启。",
			state_sketchBoard_on: "已开启，输入框旁显示画笔入口。",
			state_sketchBoard_off: "已关闭，输入框旁不显示画笔入口。",
			state_sketchAgent_on: "已开启，可用 @sketch 发起绘制。",
			state_sketchAgent_off: "已关闭，@sketch 绘图不可用。",
			state_voice_on: "语音入口已开启，空草稿时可发起通话。",
			state_voice_off: "语音入口已关闭，使用普通发送键。",
			state_remote_on: "已开启，手机可连接这台 DSH。",
			state_remote_off: "已关闭，手机无法连接这台 DSH。",
			diagnosticsAttention: "有 {count} 项需要注意",
			diagnosticsNotes: "{count} 条提示信息",
			diagnosticsAdvanced: "完整诊断（高级）",
			historyAsOf: "数据截至 {date}",
			triggerSketchName: "草图 · Beta",
			triggerSketchHint: "让 Agent 画图或改图",
			triggerImageName: "生图",
			triggerImageHint: "描述一张要生成或编辑的图",
			featureOverviewTitle: "功能一览",
			featureSettings: "设置",
			featureDetails: "详细设置",
			featurePair: "配对手机",
			featureSearchTitle: "联网搜索",
			featureSearchSummary: "模型回答时可以上网查资料。",
			searchSource_auto: "自动",
			searchSource_dsh: "DSH",
			searchSource_codex: "Codex",
			featureImageTitle: "图片生成与编辑",
			featureImageSummary: "让模型用你的订阅画图、改图。",
			featureConnectorsTitle: "ChatGPT 连接器",
			featureConnectorsSummary: "让模型用你在 ChatGPT 里连接的 GitHub、Gmail 等应用。",
			featureSketchTitle: "草图画板",
			featureSketchSummary: "自己画图，或让 Agent 画。",
			featureSketchNeedsImages: "先开启图片生成或编辑，输入框里才会出现画笔按钮。",
			sketchAgentRow: "Agent 绘图",
			sketchAgentRowHint: "在对话里发「@sketch」加要求，Agent 会在画板上一笔一笔画出来，你能看着它画。关闭后「@sketch」不可用。",
			sketchAgentNeedsBoard: "需要先开启草图画板。",
			sketchBoardRowHint: "输入框旁多一个画笔按钮，点开是画板，可以自己画，也可以画给模型当参考。关闭后没有画笔按钮。",
			featureVoiceTitle: "语音对话",
			featureVoiceSummary: "在输入框里直接说话聊天。你的声音会发送给 OpenAI 处理。",
			featureRemoteTitle: "手机远程控制",
			featureRemoteSummary: "用手机上的 ChatGPT App 指挥这台电脑上的 DSH。",
			imageGenerationRow: "生成新图片",
			imageGenerationRowHint: "模型可以用你的订阅画新图。关闭后，对话里不能让模型画图。",
			imageEditingRow: "编辑图片",
			imageEditingRowHint: "模型可以按参考图修改图片，也能在图上圈出区域接着改。关闭后只能画新图，不能改图。",
			imageShortcutRow: "输入框 @生图",
			imageShortcutRowHint: "在输入框打「@」，列表里会出现「生成图片」，选中即可，不用写提示词。关闭后没有这个入口。",
			imageViewerRow: "图片查看器",
			imageViewerRowHint: "点对话里的图片可以放大、拖动、标注、下载。关闭后用 DSH 自带的图片查看。",
			imageAdvancedTitle: "高级：图片型号与质量",
			quotaSettingsTitle: "额度显示与提醒",
			quotaAlertsNeedDisplay: "先选一种显示方式，才能在输入框里看到提醒。",
			answerStyleTitle: "回答风格",
			verbosityPageHint: "选「简洁」回答更短，选「详细」会多解释。",
			advancedTitle: "高级",
			advancedSummary: "一般不用改，默认值适合大多数人",
			connection_sse: "SSE",
			connection_websocket: "WebSocket",
			toolsScopeOn: "现在：DeepSeek 等模型的对话也能用这些功能。",
			toolsScopeOff: "现在：只有 GPT / Codex 模型的对话会用这些功能。",
			toolsScopeChange: "更改",
			creativeSketch: "草图画板 · Beta",
			diagnosticsHint: "遇到问题时生成报告，可复制后用于反馈。不含登录凭据和账号标识。",
			sketchCanvasSetting: "画板入口",
			sketchAgentSetting: "Agent 绘图",
			quotaShowIndicator: "显示额度",
			quotaIndicatorHint: "输入框只显示图标，点击查看详情。关闭时暂停续航采样。",
			quotaForecastOptional: "续航预测 · 实验",
			quickQuotaCompact: "额度",
			quotaShortWeek: "周",
			quotaShortDay: "日",
			quotaDetails: "剩余额度",
			quotaSeparateWindows: "各周期分别计算，任一周期用尽都会影响使用。",
			quickQuotaStatus: "Codex 剩余额度 {value}%",
			quickQuotaForecastStatus: "Codex 剩余额度 {value}%，按当前速度预计可用 {duration}",
			quickQuotaForecastCalibrating: "校准中",
			quickQuotaForecastCalibratingStatus: "Codex 剩余额度 {value}%，续航预测正在校准",
			quickQuotaForecastIdle: "用量稳定",
			quickQuotaForecastIdleStatus: "Codex 剩余额度 {value}%，当前没有可测量的消耗速度",
			quickQuotaForecastUntilReset: "够用到重置",
			quickQuotaForecastUntilResetStatus: "Codex 剩余额度 {value}%，按最近用量，预计可用到重置",
			quotaForecast: "按当前速度 {symbol}{duration}",
			quotaForecastAt: "按最近用量，预计{when}用完",
			quotaForecastRoughAt: "按最近用量，粗估{when}左右用完",
			quotaExhausted: "额度已用尽",
			pacePart_early: "凌晨",
			quotaWhenToday: "{day}{part}",
			quotaWhenTonight: "{day}{part}",
			quotaWhenEarlyToday: "{day}{part}",
			quotaWhenEarly: "{day}{part}",
			quotaWhenRangeEnd: "{part}",
			quotaWhenRange: "{from}至{to}",
			quotaWhenEarlyMorningRange: "{from}至{to}",
			historyRefresh: "刷新",
			historyTotalUnavailable: "官方未提供此周期的总用量",
			historyNoBreakdown: "官方尚未提供此周期的明细",
			fetchTitle: "网页读取来源",
			fetchDshHint: "使用 DSH 当前配置的网页读取服务；与上面的搜索来源分别设置。",
			fetchCodexHint: "通过 Codex 订阅读取可访问的网页文本。失败会直接提示，不会转到 DeepSeek API。",
			fetchUnavailableHint: "当前 DSH 不支持切换到 Codex 网页读取，请先升级宿主。",
			quotaForecastCalibrating: "续航正在校准",
			quotaForecastIdle: "当前用量稳定",
			quotaForecastUntilReset: "按最近用量，预计可用到重置",
			runwayDaysHours: "{days} 天 {hours}h",
			runwayDays: "{days} 天",
			runwayHours: "{hours}h",
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
			providerDefault: "默认",
			selectModel: "选择模型",
			modelSearch: "搜索模型",
			modelNoMatch: "没有匹配的模型。",
			modelsLoading: "正在读取模型…",
			modelsEmpty: "没有可用模型；请先登录，并确认网络可用。",
			modelsHidden: "所有模型都已从列表中隐藏；可在设置中重新显示。",
			effortsEmpty: "当前模型未提供推理等级。",
			modelRetry: "重试",
			modelDirectoryFailed: "模型目录加载失败，请重试。",
			modelFailed: "模型目录加载失败：{value}",
			groupFailed: "{name}：{value}",
			imageGenerate: "生成图片",
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
			voiceNativeCaptureConfirm: "Use this computer’s microphone and speakers for this call? Capture stops when you hang up or leave the conversation.",
			voiceMediaHint: "If this window does not support WebRTC, continue the same conversation in a browser. Voice samples remain available. Your existing subscription is used; no API key is needed.",
			voiceBrowserContinue: "Continue this conversation in a browser",
			voiceBrowserCall: "Continue voice in a browser",
			voiceBrowserCopy: "Copy conversation link",
			voiceBrowserCopied: "Copied",
			voiceBrowserCopyFailed: "Copy failed; copy the link manually",
			voicePreviewSignIn: "Sign in to ChatGPT again to load voice samples.",
			voiceCatalogFailed: "The voice catalog could not load. Check the connection and retry; this does not mean the voice has no sample.",
			voiceDownloadFailed: "The voice sample could not download. Please retry.",
			voicePlaybackFailed: "The audio loaded but could not play. Check browser sound permissions and retry.",
			voicePreviewFailed: "The voice sample could not load. Check the connection and retry.",
			voiceWebRTCUnavailable: "This window does not support WebRTC voice calls. Open the same DSH conversation in a WebRTC-capable browser. Voice samples remain available.",
			voiceInsecure: "Voice requires a secure connection. Open DSH over HTTPS or local localhost.",
			voiceMicUnavailable: "Microphone access is unavailable in this window. Open DSH in a browser with microphone support.",
			voiceMicMissing: "No microphone was found. Check the device connection.",
			"diagnosticsSnapshotTime": "Report captured at:",
			"diagnosticsUnresolved": "Other failures remain without a later success; see the summary.",
			"diagnosticSeverity_warning": "Attention",
			"diagnosticSeverity_info": "Information",
			"diagnosticNext_restart": "Restart and regenerate. If versions still differ, check that the plugin update took effect.",
			"diagnosticNext_regenerate": "Regenerate immediately after reproducing. If collection remains incomplete, include the steps with your report.",
			"diagnosticNext_supported-options": "Keep using supported choices. New capabilities need adapter validation; do not insert unknown parameters manually.",
			"diagnosticNext_reproduce": "Match the operations and timestamps below to your problem. If failures persist, provide reproduction steps and this report.",
			"diagnosticFinding_evidence-truncated": "Older records or additional host scopes are omitted. This snapshot does not cover the entire history.",
			"diagnosticsNoRecordedFailure": "No failure in the current records; unused features remain unverified.",
			"diagnosticFinding_version-mismatch": "Client and server versions differ. Restart DSH and regenerate the report.",
			"diagnosticFinding_collection-incomplete": "Some checks could not finish. Inspect failed or timed-out collectors in the details.",
			"diagnosticFinding_catalog-gap": "The online catalog contains capabilities not supported by this adapter. This does not mean the model is unavailable.",
			"diagnosticFinding_recent-failure": "An operation or request failed within 15 minutes without a later success for the same operation. Inspect its timestamp and details.",
			"diagnosticReason_no-readiness-check": "No independent prerequisite check",
			"diagnosticReason_inspection-failed": "Check incomplete",
			"diagnosticReason_inspection-timeout": "Check timed out",
			"diagnosticSource_network": "Network request (not full reply)",
			"diagnosticReason_catalog-online": "Online catalog loaded",
			"diagnosticReason_catalog-unavailable": "Account catalog not loaded",
			"diagnosticReason_storage-readable": "Forecast cache readable",
			"diagnosticReason_tool-registered": "Global tool registered",
			"diagnosticReason_tool-missing": "Global tool not found",
			"diagnosticsCoverageHint": "Shows prerequisites and process-wide evidence from the last 15 minutes, not limited to this account or session. RPC, network and tool outcomes are not end-to-end validation.",
			"diagnosticsVersionMismatch": "Client and server versions differ. Reload and retry.",
			"diagnosticsPartial": "Some inspections failed or timed out. Other results are preserved; see details.",
			"diagnosticsCapability": "Capability",
			"diagnosticsReadiness": "Prerequisites",
			"diagnosticsEvidence": "Recent evidence",
			"diagnosticsUnverified": "Unverified",
			"diagnosticsHostCollected": "Host registrations and selection are included. Registrant labels may be minified; they do not identify packages or prove interference.",
			"diagnosticsHostUnknown": "Host inspection unavailable or unmounted; interference cannot be determined.",
			"diagnosticsDetails": "Redacted details",
			"diagnosticsCopyFailed": "Copy failed. Expand the details to copy manually.",
			"diagnosticSource_rpc": "RPC response",
			"diagnosticSource_tool": "Tool",
			"diagnosticOutcome_completed": "Completed",
			"diagnosticOutcome_failed": "Failed",
			"diagnosticOutcome_cancelled": "Cancelled",
			"diagnosticCapability_account": "Sign-in",
			"diagnosticCapability_accounts": "Accounts",
			"diagnosticCapability_settings": "Settings",
			"diagnosticCapability_models": "Models",
			"diagnosticCapability_quota": "Quota",
			"diagnosticCapability_search": "Search",
			"diagnosticCapability_images": "Images",
			"diagnosticCapability_sketch": "Sketch",
			"diagnosticCapability_subagents": "Subtasks",
			"diagnosticCapability_compaction": "Compaction",
			"diagnosticCapability_transport": "Connection",
			"diagnosticCapability_storage": "Storage",
			"diagnosticCapability_host-ui": "Host UI",
			"diagnosticReason_not-instrumented": "Insufficient evidence",
			"diagnosticReason_disabled-or-host-owned": "Disabled or host-managed",
			"diagnosticReason_sign-in-required": "Sign-in required",
			"diagnosticReason_local-sign-in-present": "Local sign-in present",
			"diagnosticReason_sign-in-unverified": "Sign-in unverified",
			"diagnosticReason_settings-writable": "Writable",
			"diagnosticReason_settings-readonly": "Read-only",
			"diagnosticReason_restart-required": "Restart required",
			"diagnosticReason_runtime-present": "Runtime installed",
			"diagnosticReason_runtime-missing": "Runtime missing",
			storageLoading: "Reading cache size…",
			storageTitle: "Storage and cache",
			storageForecast: "Quota forecast cache",
			storageClear: "Clear forecast history",
			storageHint: "Clears local forecast history only. Subscription quota is unchanged.",
			storageConfirm: "Clear local forecast history for all signed-in accounts? Forecasts will need new samples. Subscription quota, images, drafts and sign-in data are unaffected.",
			storageFailed: "Could not read or clear the forecast cache. Try again.",
			runtimeIncompatible: "An incompatible Codex subtask component was found. Uninstall it, restart DSH, then install the supported version.",
			runtimeManagedElsewhere: "This component is managed by the host or another dependency. Check DSH plugin management; it cannot be removed here.",
			runtimeLoading: "Checking component…",
			runtimeRestart: "Component changed. Restart DSH before using it.",
			runtime_installing: "Installing through DSH…",
			runtime_removing: "Uninstalling through DSH…",
			runtime_applying: "Applying installation…",
			runtimeInstall: "Install component",
			runtimeRemove: "Uninstall component",
			runtimeCancel: "Cancel installation",
			runtimeKeep: "Keep",
			runtimeConfirmRemove: "Confirm uninstall",
			runtimeRefresh: "Refresh status",
			runtimeActive: "Codex subtasks are running. Wait for them to finish before installing or uninstalling.",
			runtimeConfirm: "Uninstalling switches subtasks back to DSH. Subscription chat, images, sign-in and sketches stay available. Uninstall this optional component?",
			runtimeFailed: "The operation did not complete. Refresh and retry; see DSH plugin management for details.",
			runtimeBuildBlocked: "DSH blocked dependency build scripts. Review them in the official plugin manager before installing.",
			runtimeCancelled: "Installation cancelled. You can try again.",
			runtimeUnavailable: "This host has no component management interface. Update DSH or use the manual instructions.",
			runtimeHostUnsupported: "No Codex subtask component has been verified for this DSH version.",
			runtimeInstallHint: "DSH installs and removes the official Codex subtask component here. Installation does not enable subtasks automatically. Switching to DSH alone does not uninstall it.",
			compactionTitle: "Cloud compaction",
			compaction_dsh: "Off",
			compaction_cloud: "On",
			compactionHint: "Codex compacts long requests while DSH history and native compaction remain available. These requests use SSE; changed history invalidates previous checkpoints.",
			otherModelsTitle: "Use subscription features in conversations on other models (DeepSeek, …)",
			otherModels_on: "On",
			otherModels_off: "Off",
			otherModelsHint: "When off, conversations on DeepSeek and other non-Codex models no longer use subscription web search (DSH search is used instead), image generation or ChatGPT connectors; Codex subscription models are not affected. Phone remote control and voice calls are started by you and are not affected by this switch; set them separately under Phone & more.",
			advancedModelSearch: "Models and search",
			modelsSectionTitle: "Models",
			searchSectionTitle: "Search",
			defaultModelTitle: "Default model",
			defaultModelHint: "The model a new conversation opens with. This writes the same DSH default model setting as switching the model inside a chat.",
			defaultModelReset: "Restore DSH default",
			defaultModelResetHint: "Choose “Restore DSH default” to clear the saved selection and use the inherited DSH configuration. Existing conversations are unchanged.",
			defaultModelFollow: "Follow DSH default",
			defaultModelFollowHint: "Following the DSH default: {value}. Pick a Codex model to make every new conversation start with it.",
			defaultModelUnknown: "unknown",
			defaultModelUnavailable: "This DSH version provides no default-model service, so it cannot be set here.",
			defaultModelNoCatalog: "Sign in and load models to choose a default model.",
			defaultModelFailed: "Reading or saving the default model failed. Retry, or switch the model inside a chat.",
			inputImageDetail: "Input image detail",
			inputImageDetailHint: "Controls the detail level of images sent to the model. Higher detail uses more input tokens.",
			inputImageDetail_auto: "Auto",
			inputImageDetail_low: "Low",
			inputImageDetail_high: "High",
			inputImageDetail_original: "Original",
			connectors: "ChatGPT connectors",
			connectorsHint: "Lets any model in DSH use the apps you have connected in ChatGPT (GitHub, Gmail, Drive, Calendar and more). Connect the apps in ChatGPT first; what apps return is third-party content and models do not follow instructions inside it.",
			connectorsMode_off: "Connectors are off; models cannot see these apps.",
			connectorsMode_read: "Models can only read (search mail, read files, look up pull requests) and never change data.",
			connectorsMode_ask: "Anything that changes data, such as sending mail or editing files, asks for your approval every time.",
			connectorsMode_write: "Changing actions run immediately without a prompt and cannot be undone, so use this carefully.",
			connectors_off: "Off",
			connectors_read: "Read-only",
			connectors_ask: "Write after asking",
			connectors_write: "Write directly",
			defaultReasoningEffort: "Default reasoning effort",
			defaultReasoningEffortHint: "Used when no effort is selected manually. Unsupported levels fall back to the model default.",
			composerPredictions: "Input predictions",
			composerPredictionAccept: "Accept suggestion",
			composerPredictionsShortHint: "Tab fills draft",
			composerPredictionsHint: "Supported Codex models suggest your next message from the current conversation after a completed turn, when the draft is empty. Tab fills the draft without sending. Makes additional prediction requests. Official Codex predictions do not count toward usage limits or credits; the same exemption for this third-party integration is unconfirmed. Sending an accepted draft still counts normally.",
			featureLoading: "Loading…",
			featureLoadFailed: "Could not load. Click to retry",
			featureRetry: "Retry",
			defaultUltraHint: "Ultra is a DSH proactive delegation preset using the catalog-resolved model effort. It grants no additional permissions and appears only for supported models.",
			defaultReasoningEffort_ultra: "Ultra (proactive delegation)",
			defaultReasoningEffort_auto: "Model default",
			defaultReasoningEffort_off: "Off",
			defaultReasoningEffort_minimal: "Minimal",
			defaultReasoningEffort_low: "Low",
			defaultReasoningEffort_medium: "Medium",
			defaultReasoningEffort_high: "High",
			defaultReasoningEffort_xhigh: "Extra high",
			defaultReasoningEffort_max: "Maximum",
			reasoningSummary: "Reasoning summary",
			reasoningSummaryHint: "Shows a summary of the reasoning in the Thinking section of the conversation. Auto lets the model decide; concise is shorter; detailed is fuller; off asks for none.",
			reasoningCache: "Reuse cache when changing effort",
			reasoningCache_off: "Off",
			reasoningCache_on: "On",
			reasoningCacheHint: "On by default for supported models. Tries to reuse earlier cache when you change reasoning effort. Ordinary caching still works when off; cache hits and faster replies are not guaranteed.",
			reasoningCacheCloud: "Paused while cloud auto-compaction is selected. With DSH compaction, this switch applies again. Your compaction setting is never changed automatically.",
			reasoningCacheRetry: "Paused while Unlimited retries is selected. With a normal retry policy, this switch applies again. Your retry setting is never changed automatically.",
			retryPolicy: "Request retries",
			retryPolicyHint: "How many times a request is retried after a network or server error. Default keeps the standard DSH retries; Unlimited keeps retrying until it succeeds or you stop it.",
			retryPolicy_default: "Default",
			retryPolicy_off: "No retries",
			retryPolicy_10: "10",
			retryPolicy_20: "20",
			retryPolicy_unlimited: "Unlimited",
			reasoningSummary_auto: "Auto",
			reasoningSummary_concise: "Concise",
			reasoningSummary_detailed: "Detailed",
			reasoningSummary_none: "Off",
			subagentBackendTitle: "Independent subtasks",
			subagentBackend_dsh: "DSH",
			subagentBackend_codex: "Codex",
			connectionTitle: "Connection",
			diagnosticsLog: "Log",
			diagnosticsLogHint: "What happened while running, in order. Filter to warnings and errors above. Tokens, emails and paths are removed.",
			logLevel_all: "All",
			logLevel_warn: "Warnings and errors",
			logLevel_error: "Errors only",
			logEmpty: "Nothing recorded at this level yet.",
			logCopy: "Copy log",
			logCopied: "Log copied",
			logEarlier: "previous run",
			remoteTitle: "Phone remote control",
			remote_off: "Off",
			remote_on: "On",
			voiceStart: "Voice conversation",
			voiceEnd: "End voice",
			voiceConnecting: "Connecting voice…",
			voiceListening: "Listening",
			voiceSpeaking: "Speaking",
			voiceWorking: "DSH is working on it…",
			voiceMute: "Turn the microphone off",
			voiceUnmute: "Turn the microphone on",
			voiceMuteSpeaker: "Turn the sound off",
			voiceUnmuteSpeaker: "Turn the sound on",
			voiceMicBlocked: "No microphone permission: allow it in the browser or system and try again.",
			voiceFailed: "The voice call did not connect. Try again in a moment.",
			voiceTitle: "Voice conversation",
			voiceHint: "When the message box is empty, the send button becomes a voice button: tap it to talk to DSH, ask it to do things, and hear the answer. Calls use your ChatGPT subscription and go through OpenAI.",
			voiceVoice: "Voice",
			voiceLanguage: "Answer language",
			voiceAuto: "Same as you speak",
			voicePlay: "Listen",
			voiceLoading: "Loading…",
			voiceNoSample: "No sample is available for this voice.",
			voiceUnavailable: "no sample yet",
			voiceMore: "More voices (no sample yet)",
			voiceLang_zh: "中文",
			voiceLang_en: "English",
			voiceLang_ja: "日本語",
			voiceLang_ko: "한국어",
			voiceLang_es: "Español",
			voiceLang_fr: "Français",
			voiceLang_de: "Deutsch",
			voiceLang_pt: "Português",
			voiceLang_ru: "Русский",
			voicePreviewHint: "Changing the answer language plays a sample in that language. Auto uses an English sample.",
			remoteHint: "When on, this computer's DSH appears as a host in the ChatGPT mobile app's Codex list, so you can follow conversations, send messages, switch models and approve actions from your phone. Needs a signed-in subscription account; the computer must stay on and online.",
			remoteConnected: "This computer is online with ChatGPT; no phone connected yet",
			remoteConnecting: "Connecting",
			remoteWaiting: "Waiting for the previous connection to be released; usually reconnects within a few minutes",
			remoteUnauthorizedHelp: "The server refused Remote Control (401/403). Check that your ChatGPT sign-in has not expired; if it is fine, the account may need two-step verification turned on (a guess) in ChatGPT security settings.",
			remoteConflictLong: "Still not connecting? Usually another computer, another DSH copy or another window is using phone remote control with the same ChatGPT account and they keep taking the connection from each other. Turn phone remote control off elsewhere, then switch it Off and On again here.",
			remoteError: "Connection failed, retrying",
			remoteStopped: "Stopped",
			remotePaired: "Paired phones",
			remoteNoPhones: "No phone is paired yet.",
			remoteRevoke: "Remove",
			remoteLastSeen: "last seen {date}",
			remotePhoneUnknown: "Unnamed phone",
			remotePhones: "{count} phone(s) connected",
			remotePair: "Show pairing code",
			remotePairAgain: "New pairing code",
			remotePairFailed: "Could not create a pairing code. Check that the subscription account is signed in.",
			remotePairSteps: "Scan this in the ChatGPT app's Codex section, or type the manual code.",
			remoteManualCode: "Manual pairing code",
			remoteQrLabel: "Pairing QR code",
			remoteExpires: "Expires in about {minutes} min",
			remoteExpired: "The pairing code expired. Create a new one.",
			remoteLimits: "From the phone you can follow and continue DSH conversations, start new ones, send photos, switch models, choose permissions, approve actions and view changes. The phone cannot run other commands on the computer.",
			reviewModelTitle: "Auto review model",
			reviewModel_session: "Current model",
			reviewModel_official: "Codex reviewer",
			reviewModelHint: "Uses the current model by default. With Codex reviewer, DSH Auto review judges tool calls with Codex's own review model when your account catalog offers it. DSH keeps its review policy and allow/deny flow; otherwise the current model is used.",
			connectionHint: "SSE by default. Experimental WebSocket reuses connections and context transfers and can fall back to SSE on connection failure. Applies to the next request; context limits stay the same.",
			streamIdleTimeoutTitle: "Stream inactivity timeout",
			streamIdleTimeoutHint: "How long a request may receive no streamed data before it is aborted. This is not an overall response deadline. Lower values can abort slow but valid reasoning and hand the request to DSH retry handling. Default: 10 minutes.",
			streamIdleTimeout_2: "2 min",
			streamIdleTimeout_5: "5 min",
			streamIdleTimeout_10: "10 min",
			streamIdleTimeout_20: "20 min",
			streamIdleTimeout_30: "30 min",
			subagentBackendHint: "Codex reuses subscription login and workspace permissions, inheriting the current subscription model by default. Turn on model selection under Plugins → Subagent, tick the allowed models and start a new session to request an allowed subscription model and reasoning effort in chat; other model sessions require an explicit selection. Shared-context subtasks stay in DSH.",
			subagentBackendUnavailable: "Subagent services are unavailable. Update DSH to use this option.",
			subagentRuntimeMissing: "Codex subtask runtime is not prepared. Subscription chat does not require it.",
			subagentRuntimePrepare: "Setup and offline instructions",
			subagentRuntimeInstalled: "Codex subtask component detected; its executable is checked on startup.",
			subagentRuntimeManage: "Install, uninstall and storage",
			subagentRuntimeCacheHint: "Package caches may remain after uninstalling. DSH or Portable manages them centrally. Sign-in, sketches and generated images are not deleted here.",
			sketchRecovered: "Unsaved sketch recovered",
			sketchRecoveryFailed: "Recovery checkpoint failed. Save or export your draft.",
			sketchStorageBlocked: "Draft storage is in use. Close other sketch windows and retry.",
			sketchDraftLimit: "The 20-draft limit is reached. Export first, or remove an unwanted draft before saving.",
			sketchStorageLimit: "Draft storage is full. Export first, or remove an unwanted draft before saving.",
			sketchSizeShort: "Size",
			sketchObjectDuplicate: "Duplicate object",
			sketchObjectDelete: "Delete object",
			sketchBrushHint_pen: "Solid round ink",
			sketchBrushHint_pencil: "Grain builds with repeated strokes",
			sketchBrushHint_marker: "Translucent flat tip for highlights",
			sketchDismissStatus: "Dismiss status",
			sketchRunResumeHint: "Allow subsequent drawing requests; does not resend a message",
			sketchTool_select: "Select",
			sketchTool_text: "Text",
			sketchTool_arrow: "Arrow",
			sketchShapes: "Shapes",
			sketchText: "Edit text",
			sketchTextDone: "Done",
			sketchTextSize: "Text size",
			sketchBrush: "Brush",
			sketchFill: "Fill",
			sketchDownload: "Download",
			sketchExportFormat: "Export format",
			sketchEditableFile: "Editable draft",
			sketchFormatHint: "PNG is flattened; editable drafts retain native strokes and can be imported again (up to 32 MB).",
			imageToSketch: "Open in sketch",
			imageRemoveBackground: "Remove background",
			imageRemoveBackgroundPrompt: "Remove the background from this image. Keep all foreground subjects unchanged and fully intact, with clean, smooth edges. Make the background transparent.",
			imageErase: "Erase",
			imageEraseHint: "Brush over what you want to remove",
			imageErasePrompt: "Remove the area marked in the second image from the first image",
			imageBrushSize: "Brush size",
			imageUndo: "Undo",
			imageSend: "Send",
			imageResize: "Resize",
			imageResizePrompt: "Make the aspect ratio {aspectRatio}",
			imageRatio_square: "Square",
			imageRatio_portrait: "Portrait",
			imageRatio_story: "Story",
			imageRatio_landscape: "Landscape",
			imageRatio_widescreen: "Widescreen",
			sketchPictures: "Images",
			sketchPictureAdd: "Add",
			sketchPictureSelect: "Select image",
			sketchPicturesEmpty: "Import or paste images as layers in this sketch.",
			sketchFlow: "Opacity",
			sketchZoomOut: "Zoom out",
			sketchZoomIn: "Zoom in",
			sketchFit: "Reset view",
			sketchKeys: "Keys",
			sketchKeysEnabled: "Enable shortcuts",
			sketchNavigationHint: "Space drag to pan · Alt wheel to zoom · Middle button to pan",
			sketchKeyHint: "Focus a field and press a key. Duplicate keys are rejected. Ctrl Z / Shift Z undo / redo, Ctrl S save, [ ] brush size.",
			sketchKey_pen: "Brush",
			sketchKey_eraser: "Eraser",
			sketchKey_line: "Line",
			sketchKey_rectangle: "Rectangle",
			sketchKey_circle: "Ellipse",
			sketchKey_pan: "Pan",
			sketchKey_zoomIn: "Zoom in",
			sketchKey_zoomOut: "Zoom out",
			sketchKey_fit: "Reset view",
			sketchReplay: "Replay",
			sketchReplayTitle: "How it was drawn",
			sketchReplayClose: "Back",
			sketchReplayPlay: "Play",
			sketchReplayPause: "Pause",
			sketchReplaySpeed: "Replay length",
			sketchReplayFast: "12 s",
			sketchReplayNormal: "30 s",
			sketchReplaySlow: "60 s",
			sketchReplayRecord: "Record process video",
			sketchReplaySave: "Save video",
			sketchReplayAgain: "Back to replay",
			sketchReplaySaveHint: "Choosing Save video asks where to put the file.",
			sketchReplayStopRecording: "Stop recording",
			sketchReplayEmpty: "Nothing to replay yet.",
			sketchReplayUnsupported: "Video recording is not available here.",
			sketchReplayFileSuffix: "process",
			sketchReplayHint: "Replays the drawing stroke by stroke; recording turns the replay into a WebM video (in real time, at the chosen length) that you can preview here before saving it.",
			sketchFiles: "Drafts",
			sketchNew: "New sketch",
			sketchImport: "Import file",
			sketchDraftName: "Draft name",
			sketchSave: "Save draft",
			sketchDeleteDraft: "Delete",
			sketchDeleteConfirm: "Confirm",
			sketchFileClose: "Close",
			sketchLocalDrafts: "Saved in this browser, up to 20 drafts. Autosaved on close. Paste or drop PNG / JPEG / WebP images under 20 MB.",
			sketchStorageFailed: "Could not complete the action. Check local storage, draft and layer limits, or image type and size. The canvas is preserved.",
			sketchAttachShort: "Attach",
			sketchTool_line: "Line",
			sketchStability: "Smooth on release",
			sketchStability0: "Off",
			sketchStability25: "Low",
			sketchStability50: "Medium",
			sketchStability75: "High",
			sketchShortcuts: "B brush · E eraser · L line · R rectangle · O ellipse · [ ] size · Ctrl Z undo · Ctrl Shift Z redo · Ctrl S save · Shift snap line",
			sketchRatio: "Canvas ratio",
			sketchRatioHint: "Canvas ratio; artwork fits without distortion, undo available",
			forecastCompactPending: "Estimating",
			forecastCompactChanging: "Re-estimating",
			forecastCompactStale: "Stale",
			imageEditShort: "Edit",
			forecastResolution: "Not enough change to estimate the rate yet",
			forecastChanging: "Usage intensity changed; estimating again",
			forecastStale: "Quota data is stale; waiting for an update",
			imageDropHere: "Drop reference images here",
			imageDropUnavailable: "Images cannot be added right now",
			imageRemoveDraft: "Remove image",
			recoveryClear: "Clear sign-in data",
			recoveryClearConfirm: "Confirm clear and sign in again",
			recoveryClearHint: "Removes all subscription sign-ins saved by this plugin. Conversations and settings remain. You can then sign in again.",
			recoveryHint: "If retry fails, clear sign-in data. Restore the DSH service first if disconnected. Local diagnostics are available under Advanced.",
			recoveryFailed: "Clearing was not confirmed. Restore the DSH service before retrying.",
			quotaThresholdReached: "Quota alert threshold reached",
			imageCapability: "Image generation and editing",
			imageCapabilityHint: "Let the model create or edit images when you ask.",
			imageCapability_on: "Enabled",
			imageCapability_off: "Off",
			imageEntryPoints: "Creative shortcuts",
			imageEntryPointsHint: "@Image shortcut. Natural-language image requests still work when hidden.",
			imageEntryPoints_on: "Show",
			imageEntryPoints_off: "Hide",
			imageBrowsing: "Image browsing",
			imageBrowsingHint: "Preview pasted and conversation images; annotate, remove the background, erase or resize.",
			imageBrowsing_on: "Enhanced",
			imageBrowsing_off: "DSH default",
			imageGroupMixed: "Keep existing",
			imageQuality_auto: "Auto",
			imageQuality_low: "Low",
			imageQuality_medium: "Medium",
			imageQuality_high: "High",
			imageQuality_xhigh: "Extra high",
			imageQuality_max: "Maximum",
			imageWorkspaceMenu: "Image tools",
			imageCreateAction: "Generate or edit an image",
			imageCreateGroup: "Create",
			imageShortcut: "@Image shortcut",
			imageCreateTitle: "Describe your image",
			imageDraftHint: "Add to your draft, then send when ready. Attach references in the composer. Nothing is generated or existing text replaced automatically.",
			imageDraftFailed: "Could not update the draft. Keep your brief and check whether the composer is busy or contains references.",
			imageCreatePrompt: "Use the subscription image tool for the following request. If reference images are attached, edit those images:",
			imageDetails: "Image details",
			imageRequestedModel: "Requested model",
			imageReportedModel: "Server-reported model",
			imageModelUnreported: "Not reported",
			imageRequestedSize: "Requested size",
			imageActualSize: "Actual size",
			imageModel: "Requested model",
			imageQuality: "Requested quality",
			imageExperimental: "Experimental",
			imageModelHint: "Image 2.5 options are experimental: requests generated images successfully, but the requested model and quality are not confirmed.",
			sketchTool_pen: "Pen",
			sketchTool_rectangle: "Rectangle",
			sketchTool_circle: "Ellipse",
			sketchTool_eraser: "Eraser",
			sketchCanvas: "Sketch canvas · Beta",
			sketchCanvasHint: "Off by default. Enables the manual sketch board.",
			sketchCanvas_on: "On",
			sketchCanvas_off: "Off",
			sketchAgent: "Agent drawing · Beta",
			sketchAgentHint: "Off by default. Use @sketch to ask the Agent to draw; requires the sketch canvas.",
			sketchRun_drawing: "Agent is drawing…",
			sketchRun_finished: "Drawing complete",
			sketchRun_stopped: "Drawing stopped",
			sketchRun_failed: "Drawing failed",
			sketchRunStop: "Stop drawing",
			sketchRunResume: "Allow drawing again",
			sketchAgent_on: "On",
			sketchAgent_off: "Off",
			imageSettings: "Images",
			imageGeneration: "Generate new images",
			imageEditing: "Reference image editing",
			imageViewer: "Enhanced image viewer",
			imageAnnotations: "Image annotations",
			imageSketch: "Sketch canvas · Beta",
			imageSettingsHint: "Disabling features preserves existing images. Sketches need reference editing; annotations need the enhanced viewer.",
			sketch: "Sketch · Beta",
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
			searchOptions: "Search options",
			searchDomainCount: "domains",
			catalogRefresh: "Refresh models",
			catalogOnline: "Account model catalog loaded",
			catalogCached: "Using the locally saved account model catalog",
			catalogCachedFailed: "Using the local model catalog; the online update failed.",
			catalogSignedOut: "Sign in to show the models your account can use.",
			catalogLoading: "Reading the account model catalog…",
			catalogFailed: "Could not read the account model catalog. Check the network and try again.",
			pickerModelsTitle: "Models in picker",
			pickerModelsHint: "Only controls the composer model list. Selected models and requests still work. New models appear by default.",
			searchMode: "Subscription search mode",
			searchMode_live: "Live",
			searchMode_cached: "Cached (experimental)",
			searchMode_disabled: "Disabled",
			searchModeHint: "Applies only to Codex subscription search. Cached mode requests indexed results; account support needs live acceptance. Failures do not switch providers.",
			searchDomains: "Filter result domains",
			searchDomainsHint: "Empty allows all results. Up to 20 comma-separated domains, including subdomains. Filters returned results, not the search service network access.",
			searchDomainsInvalid: "Enter up to 20 domains without URL schemes, paths, or wildcards.",
			sketchBrushType: "Brush",
			sketchBrush_pen: "Pen",
			sketchBrush_pencil: "Pencil",
			sketchBrush_marker: "Highlighter",
			sketchEraserMode: "Eraser mode",
			sketchErase_pixel: "Pixel eraser",
			sketchErase_stroke: "Stroke eraser",
			sketchLayers: "Layers",
			sketchLayer: "Layer",
			sketchLayerAdd: "New layer",
			sketchLayerVisible: "Show layer",
			sketchLayerName: "Layer name",
			sketchLayer_duplicate: "Duplicate layer",
			sketchLayer_up: "Move layer up",
			sketchLayer_down: "Move layer down",
			sketchLayer_delete: "Delete layer",
			sketchClearLayer: "Clear current layer",
			sketchHiddenLayer: "This layer is hidden. Show it or select another layer.",
			sketchLimit: "Stroke limit reached. Remove unused strokes to continue.",
			sketchLayerHint: "Edit the current layer; export visible layers. Undo includes strokes and layer operations.",
			imageInlinePrompt: "Generate or edit an image: ",
			quotaAlerts_custom: "Custom",
			quotaShortThreshold: "5h remaining",
			quotaLongThreshold: "Weekly / longer remaining",
			quotaThresholdInvalid: "Enter an integer from 1 to 100",
			quotaAlerts: "Usage alerts",
			quotaAlerts_off: "Off",
			quotaAlerts_important: "20% remaining",
			quotaAlerts_early: "Early warning",
			quotaAlertsHint: "Warn at the selected remaining threshold. Custom sets short and long windows separately. Fresh data only; no interrupting popups.",
			quotaWarning: "{window}: {value}% remaining. Check usage and reset time.",
			speedFastAstraHint: "About 2x speed on Astra; higher Credits use",
			speedUltrafast: "Ultrafast Beta",
			speedUltrafastHint: "Ultrafast tier, shown only when your account catalog offers it (Pro 500 today); fastest, uses allowance and Credits faster",
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
			removeCancel: "Cancel",
			signOutAll: "Sign out all",
			signOutConfirm: "Confirm (you will need to sign in again)",
			cancel: "Cancel",
			submit: "Submit authorization code",
			openLogin: "Open sign-in page",
			manualCode: "If the browser callback did not finish automatically, paste the code or full redirect URL.",
			deviceHint: "Enter this device code on the sign-in page:",
			waiting: "Waiting for sign-in to finish…",
			failed: "Sign-in failed. Try again.",
			failed_account_claim: "Sign-in was authorized, but the token of this account has no ChatGPT account ID (common for accounts created with only a phone number). Sign in with an email account, or add an email to the account in ChatGPT first, then try again.",
			failed_network: "The network connection failed during sign-in. Check the network or proxy and try again.",
			failed_token_exchange: "Authorization finished, but exchanging it for a token failed. Try again; if it keeps happening, check the network or proxy.",
			failed_callback: "The browser did not send the authorization back. Try again, or use device code sign-in.",
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
			diagnosticsCopy: "Copy report (short)",
			diagnosticsCopyFull: "Copy full report",
			diagnosticsCopied: "Copied",
			diagnosticsFailed: "Server diagnostics unavailable. A local, redacted report is available to copy. Check the DSH service and plugin version.",
			feedbackOpen: "Report a problem",
			showEmail: "Show full email",
			hideEmail: "Hide email",
			emailUnavailable: "Email unavailable",
			searchTitle: "Search source",
			searchScope: "Auto follows the current session model; explicit choices fix the source. With Other models off, non-Codex chats use native DSH search only.",
			searchAuto: "Auto",
			searchAutoHint: "Codex models prefer subscription search; other models prefer DSH. Only missing sign-in, keys or an unavailable service trigger the other source. With Other models off, non-Codex chats use native DSH search only.",
			searchDsh: "DSH default",
			searchDshHint: "Use only DSH's configured search service and report failures directly. The plugin adds no DeepSeek account fallback. Charges depend on the service selected in DSH.",
			searchCodex: "Codex subscription",
			searchCodexHint: "Use ChatGPT subscription search and report failures directly. With Other models off, non-Codex chats use native DSH search only.",
			preferenceFailed: "The setting was not saved.",
			preferenceRetry: "Retry",
			usage: "Subscription quota",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			noUsage: "Sign in to read quota windows reported by ChatGPT.",
			overviewTitle: "Usage overview",
			overviewLoading: "Reading usage statistics…",
			overviewUnavailable: "This account does not provide usage statistics.",
			overviewHeatmap: "Daily token use over the last half year",
			overviewNoUse: "no use",
			overviewTokens: "{value} tokens",
			overviewDays: "{value} days",
			overviewHours: "{value} h",
			overviewMinutes: "{value} min",
			overviewLifetime: "Lifetime tokens",
			overviewPeak: "Busiest day",
			overviewStreak: "Current streak",
			overviewLongestStreak: "Longest streak",
			overviewThreads: "Conversations",
			overviewEffort: "Most used reasoning",
			overviewFast: "Fast mode share",
			overviewLongestTurn: "Longest turn",
			settingsRestartRequired: "Saved. Restart DSH to apply it.",
			historyTitle: "Where the allowance went",
			historyLoading: "Reading usage history…",
			historyPeriods: "Allowance periods",
			historyUsed: "{value}% of this period's allowance used",
			historyPartial: "(still being counted)",
			historyApproximate: "From the official usage report; data may be incomplete or delayed.",
			historyBy_model: "By model",
			historyBy_surface: "By surface",
			historyBy_thread_source: "By source",
			historyBy_turn_trigger: "By trigger",
			historyDesktopApp: "Desktop app",
			historyCli: "CLI",
			historyIde: "IDE extension",
			historyWeb: "Web",
			historyMobile: "Mobile",
			historyUser: "Your chats",
			historySubagent: "Subtasks",
			historyMemory: "Memory upkeep",
			historyReview: "Review",
			historyComposer: "Composer",
			historyAutomation: "Automations",
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
			resetCreditsHint: "A reset restores your short-window limit, weekly limit, or both.",
			resetAvailableTab: "Available",
			resetFull: "Full reset",
			resetCreditsAvailable: "Quota resets ({count} available)",
			resetCreditDefaultName: "Quota reset",
			resetUse: "Use reset",
			resetPreparing: "Preparing…",
			resetConfirmTitle: "Confirm quota reset",
			resetWarning: "This consumes one reset and cannot be undone.",
			resetEarlyWarning: "Quota remains. The service may decline the reset.",
			resetAcknowledge: "I understand this may consume one reset now",
			resetCreditExpires: "Valid until {value}",
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
			accountQuotaLeft: "{label} {value}% left",
			accountQuotaResets: "resets {value}",
			accountQuotaLoading: "Reading quota…",
			accountQuotaError: "The quota of this account could not be read right now",
			accountQuotaNone: "No quota window reported",
			resetRenewLogin: "Your sign-in expired. Sign in again.",
			resetBlocked: "ChatGPT network protection blocked this request (HTTP 403). Your sign-in is fine; try again later or check your network, proxy or VPN.",
			resetExpired: "This confirmation expired. Start again.",
			resetInProgress: "A quota reset is already in progress.",
			resetTooEarly: "Wait for the cooldown before confirming.",
			resetAcknowledgeRequired: "Confirm that you understand this may consume a reset.",
			resetAccountChanged: "The signed-in account changed. Start again.",
			resetUncertain: "The server result is uncertain. Confirm again to check the same request; the plugin will not start a separate reset.",
			creditsNote: "Extra Credits and quota resets below are counted separately from the plan quota.",
			creditsExpires: "Expires {date} ({days} days left)",
			creditsExpiredToday: "Expires today ({date})",
			creditsExpiryEstimate: "(Estimate: the published expiry of the Pro 200 compensation Credits; the API does not report it, so check ChatGPT usage settings)",
			creditsAfterAllowance: "Credits are only drawn once the plan allowance runs out; there is no official switch to spend them first.",
			creditsMessages: "Roughly {local} local / {cloud} cloud messages",
			chatPass: "ChatPass weekly",
			creditsUsed: "{used} / {limit} credits used",
			spendReached: "The monthly Credits spending cap has been reached.",
			unavailable: "No data yet",
			quickQuotaSetting: "Composer quota",
			quickQuotaOff: "Off",
			quickQuotaPercent: "Percent",
			quickQuotaBar: "Progress bar",
			quickQuotaForecast: "Runway",
			quickQuotaBeta: "Beta",
			autoQuotaRetry: "Retry after quota reset",
			autoQuotaRetryHint: "Wait for confirmed short quota resets. The turn shows why it is waiting and can be stopped; switching accounts retries immediately.",
			quickQuotaForecastHint: "Shows remaining quota in the composer; hover or click for the forecast. Estimates run-out time from recent two-hour usage. Future usage affects the result. History stays local.",
			contextTitle: "Context window",
			contextStandard: "Standard",
			contextStandardHint: "Use the current account catalog default. The conversation budget reserves headroom using the official percentage (5% when omitted); DSH then manages output reservations and compaction.",
			contextExtended: "Extended",
			contextExtendedHint: "Use the maximum window allowed by the current account catalog; availability depends on the service. Settings show raw capacity; conversations reserve the same headroom as Standard.",
			contextCustom: "Custom",
			contextCustomHint: "Enter the full token count within the model limit. Headroom is reserved automatically; do not subtract it manually. Lower values trigger compaction sooner.",
			contextTokens: "Token limit",
			contextFixed: "Fixed {value}",
			contextMaximum: "{minimum}–{value}",
			settingsTab_start: "Start",
			settingsTab_models: "Models",
			settingsTab_tools: "Web & tools",
			settingsTab_create: "Create",
			settingsTab_more: "Phone & more",
			subtasksTitle: "Subtasks",
			subagentBackendNeedsRuntime: "Press \"Install\" below first; then the official Codex can run subtasks.",
			imageShortcutNeedsImages: "Turn on image generation or editing first.",
			sketchSectionTitle: "Sketch board",
			settingsReadonly: "Settings cannot be changed right now (DSH does not allow writes).",
			needSignIn: "You are not signed in; most features need a ChatGPT sign-in first.",
			needSignInGo: "Sign in",
			creditsFoldTitle: "Extra credits and quota resets",
			paceWarning: "At this pace you will run out {runOut}, before {reset}.",
			paceWhen: "{day} {part}",
			paceResetOf: "{day}'s reset",
			paceDay_today: "today",
			paceDay_tomorrow: "tomorrow",
			pacePart_morning: "morning",
			pacePart_afternoon: "afternoon",
			pacePart_evening: "evening",
			pacePart_night: "night",
			state_predictions_on: "On: press Tab when a suggestion is available.",
			state_predictions_off: "Off: no input-prediction requests are made.",
			state_autoQuotaRetry_on: "Waits for confirmed short-window quota recovery and retries.",
			state_autoQuotaRetry_off: "Does not wait and retry automatically after quota exhaustion.",
			state_compaction_on: "On: Codex handles long-context compaction.",
			state_compaction_off: "Cloud compaction is off; DSH compaction is used.",
			state_reasoningCache_on: "On: supported models may reuse reasoning context.",
			state_reasoningCache_off: "This optimization is off; normal caching remains available.",
			searchState_auto: "Search routing follows the current model.",
			searchState_dsh: "Uses DSH search without falling back to Codex.",
			searchState_codex: "Uses Codex search without falling back to DSH.",
			fetchState_dsh: "Reads webpage content through DSH.",
			fetchState_codex: "Reads webpage content through Codex.",
			contextState_standard: "Uses each model’s default context budget.",
			contextState_extended: "Uses the extended context budget supported by each model.",
			contextState_custom: "Uses the per-model budgets configured below.",
			defaultModelCurrent: "Current default: {value}",
			state_otherModels_on: "Non-Codex models may use subscription tools.",
			state_otherModels_off: "Subscription tools are limited to GPT / Codex models.",
			state_imageGeneration_on: "On: new images can be generated in conversations.",
			state_imageGeneration_off: "Off: new-image generation is unavailable.",
			state_imageEditing_on: "On: edit pictures from references or annotated regions.",
			state_imageEditing_off: "Off: reference-image editing is unavailable.",
			state_imageShortcut_on: "On: “Generate image” appears in the @ menu.",
			state_imageShortcut_off: "Off: image generation is hidden from the @ menu.",
			state_imageViewer_on: "Enhanced image viewing and annotation are on.",
			state_imageViewer_off: "Enhanced viewing and annotation are not both enabled.",
			state_sketchBoard_on: "On: the pen button appears beside the composer.",
			state_sketchBoard_off: "Off: the pen button is hidden from the composer.",
			state_sketchAgent_on: "On: use @sketch to ask the agent to draw.",
			state_sketchAgent_off: "Off: @sketch drawing is unavailable.",
			state_voice_on: "Voice is on; start a call when the draft is empty.",
			state_voice_off: "Voice is off; the normal send button is used.",
			state_remote_on: "On: this DSH is available to your phone.",
			state_remote_off: "Off: this DSH is unavailable to your phone.",
			diagnosticsAttention: "{count} item(s) need attention",
			diagnosticsNotes: "{count} note(s)",
			diagnosticsAdvanced: "Full report (advanced)",
			historyAsOf: "Data as of {date}",
			triggerSketchName: "Sketch · Beta",
			triggerSketchHint: "Ask the Agent to draw or edit a sketch",
			triggerImageName: "Image",
			triggerImageHint: "Describe an image to generate or edit",
			featureOverviewTitle: "Features",
			featureSettings: "Settings",
			featureDetails: "Details",
			featurePair: "Pair phone",
			featureSearchTitle: "Web search",
			featureSearchSummary: "Lets the model look things up online.",
			searchSource_auto: "Auto",
			searchSource_dsh: "DSH",
			searchSource_codex: "Codex",
			featureImageTitle: "Image generation and editing",
			featureImageSummary: "Lets the model draw and edit pictures with your subscription.",
			featureConnectorsTitle: "ChatGPT connectors",
			featureConnectorsSummary: "Lets the model use the apps you connected in ChatGPT, such as GitHub and Gmail.",
			featureSketchTitle: "Sketch board",
			featureSketchSummary: "Draw yourself, or let the agent draw.",
			featureSketchNeedsImages: "Turn on image generation or editing first; the pen button then appears in the composer.",
			sketchAgentRow: "Agent drawing",
			sketchAgentRowHint: "Send \"@sketch\" with a request in the conversation and the agent draws on the board while you watch. When off, \"@sketch\" is unavailable.",
			sketchAgentNeedsBoard: "Turn on the sketch board first.",
			sketchBoardRowHint: "Adds a pen button next to the composer that opens a board: draw yourself, or draw for the model as a reference. When off, there is no pen button.",
			featureVoiceTitle: "Voice calls",
			featureVoiceSummary: "Talk to the model from the composer. Your voice is sent to OpenAI.",
			featureRemoteTitle: "Phone remote control",
			featureRemoteSummary: "Control the DSH on this computer from the ChatGPT app on your phone.",
			imageGenerationRow: "Generate new images",
			imageGenerationRowHint: "Lets the model draw new pictures with your subscription. When off, the model cannot draw in conversations.",
			imageEditingRow: "Edit images",
			imageEditingRowHint: "Lets the model change a picture from a reference, or circle a region and keep editing. When off, it can only draw new pictures.",
			imageShortcutRow: "@image in the composer",
			imageShortcutRowHint: "Type \"@\" in the composer and pick \"Generate image\" from the list; no prompt to write. When off, that entry is gone.",
			imageViewerRow: "Image viewer",
			imageViewerRowHint: "Click a picture in the conversation to zoom, pan, annotate and download. When off, the built-in DSH viewer is used.",
			imageAdvancedTitle: "Advanced: image model and quality",
			quotaSettingsTitle: "Quota display and alerts",
			quotaAlertsNeedDisplay: "Choose a way to show quota first; the alert is shown in the composer.",
			answerStyleTitle: "Answer style",
			verbosityPageHint: "Pick Concise for shorter answers, Detailed for more explanation.",
			advancedTitle: "Advanced",
			advancedSummary: "Rarely needed; the defaults suit most people",
			connection_sse: "SSE",
			connection_websocket: "WebSocket",
			toolsScopeOn: "Now: conversations on DeepSeek and other models can use these features too.",
			toolsScopeOff: "Now: only GPT / Codex conversations use these features.",
			toolsScopeChange: "Change",
			creativeSketch: "Sketch board · Beta",
			diagnosticsHint: "Generate a report to copy into a support request. Sign-in credentials and account identifiers are excluded.",
			sketchCanvasSetting: "Board entry",
			sketchAgentSetting: "Agent drawing",
			quotaShowIndicator: "Show quota",
			quotaIndicatorHint: "Show an icon in the composer; click for details. Hiding it pauses forecast sampling.",
			quotaForecastOptional: "Runway forecast · Experimental",
			quickQuotaCompact: "Quota",
			quotaShortWeek: "wk",
			quotaShortDay: "day",
			quotaDetails: "Remaining quota",
			quotaSeparateWindows: "Each window is independent. Exhausting either window can limit usage.",
			quickQuotaStatus: "Codex quota: {value}% remaining",
			quickQuotaForecastStatus: "Codex quota: {value}% remaining; about {duration} at the current pace",
			quickQuotaForecastCalibrating: "Calibrating",
			quickQuotaForecastCalibratingStatus: "Codex quota: {value}% remaining; runway is calibrating",
			quickQuotaForecastIdle: "Usage stable",
			quickQuotaForecastIdleStatus: "Codex quota: {value}% remaining; no measurable consumption pace",
			quickQuotaForecastUntilReset: "Enough until reset",
			quickQuotaForecastUntilResetStatus: "Codex quota: {value}% remaining; enough until reset at the current pace",
			quotaForecast: "At current pace {symbol}{duration}",
			quotaForecastAt: "At recent usage, estimated to run out {when}",
			quotaForecastRoughAt: "Rough estimate at recent usage: around {when}",
			quotaExhausted: "Quota exhausted",
			pacePart_early: "early morning",
			quotaWhenToday: "this {part}",
			quotaWhenTonight: "tonight",
			quotaWhenEarlyToday: "early this morning",
			quotaWhenEarly: "early {day} morning",
			quotaWhenRangeEnd: "{label}",
			quotaWhenRange: "{from}–{to}",
			quotaWhenEarlyMorningRange: "{latest}",
			historyRefresh: "Refresh",
			historyTotalUnavailable: "Official total usage is unavailable for this period",
			historyNoBreakdown: "Official breakdown not yet available for this period",
			fetchTitle: "Webpage reading source",
			fetchDshHint: "Use the webpage reader configured in DSH, independently of the search source above.",
			fetchCodexHint: "Read accessible webpage text with your Codex subscription. Failures are reported directly, without falling back to the DeepSeek API.",
			fetchUnavailableHint: "This DSH version cannot switch to the Codex webpage reader. Update DSH first.",
			quotaForecastCalibrating: "Runway calibrating",
			quotaForecastIdle: "Usage currently stable",
			quotaForecastUntilReset: "Estimated to last until reset at recent usage",
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
			modelSearch: "Search models",
			modelNoMatch: "No matching models.",
			modelsLoading: "Loading models…",
			modelsEmpty: "No models available. Sign in and make sure the network is reachable.",
			modelsHidden: "All models are hidden from this list. Show one in settings.",
			effortsEmpty: "This model provides no reasoning effort levels.",
			modelRetry: "Retry",
			modelDirectoryFailed: "Could not load the model directory. Try again.",
			modelFailed: "Could not load models: {value}",
			groupFailed: "{name}: {value}",
			imageGenerate: "Generate image",
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
.codexSubscriptionAdvancedPreferences{display:flex;flex-direction:column;gap:10px}
.codexSubscriptionAdvancedPreferences[data-others-off=true]>[data-governed=true]{opacity:.55;transition:opacity .15s}
.codexSubscriptionSearchChoices.codexSubscriptionQuotaModes{display:flex;flex:0 0 auto;gap:0;grid-template-columns:none}
.codexSubscriptionSettingsDisclosure>summary{display:flex;align-items:center;gap:10px;min-height:28px;cursor:pointer;list-style:none;font-size:14px;font-weight:500}
.codexSubscriptionSettingsDisclosure>summary::-webkit-details-marker{display:none}
.codexSubscriptionSettingsDisclosure>summary>.codexSubscriptionPreferenceHint{margin-left:auto;font-weight:400}
.codexSubscriptionSettingsDisclosure>summary>svg{flex:none;transition:transform .15s}
.codexSubscriptionSettingsDisclosure[open]>summary>svg{transform:rotate(180deg)}
.codexSubscriptionSettingsDisclosure>summary:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:4px;border-radius:4px}
.codexSubscriptionSettingsDisclosureBody{padding-top:8px;margin-top:8px;border-top:1px solid var(--dsw-alias-border-l2)}
.codexComposerQuota[data-warning=true]{color:var(--dsw-alias-state-error-primary)}
.codexComposerQuota[data-warning=true] progress{accent-color:var(--dsw-alias-state-error-primary)}
.codexComposerQuota[data-warning=true] progress::-webkit-progress-value{background:var(--dsw-alias-state-error-primary)}
.codexQuotaWarning{margin:0 0 5px;color:var(--dsw-alias-state-error-primary);font-size:12px}
.codexQuotaThresholds{display:flex;gap:14px;flex-wrap:wrap;font-size:12px}.codexQuotaThresholds label{display:flex;align-items:center;gap:5px}.codexQuotaThresholds input{width:64px}.codexQuotaThresholds [role=alert]{color:var(--dsw-alias-label-error)}
.codexImageSettings{border-top:1px solid var(--dsw-alias-border-l2);padding-top:6px}
.codexImageSettings>summary{font-weight:500}
.codexImagePreference{align-items:flex-start;padding:10px 0}
.codexImagePreference>.codexSubscriptionPreferenceCopy{flex:1;min-width:0}
.codexImagePreference .codexSubscriptionPreferenceHint{max-width:none}
.codexImagePreference>.codexSubscriptionContextTrigger{flex:none;max-width:55%}
.codexImageDefaultsGroup{border-top:1px solid var(--dsw-alias-border-l2);margin-top:6px;padding-top:6px}
.codexImageSettings>p{margin-top:8px;max-width:none}
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
.codexSubscriptionPreference{min-height:32px;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.codexSubscriptionPreferenceCopy{display:flex;min-width:0;flex-direction:column;gap:2px}
.codexSubscriptionPreferenceLabel{display:flex;align-items:center;gap:6px}
.codexSubscriptionPreference>.codexSubscriptionPreferenceCopy{flex:1 1 240px}
.codexSubscriptionPreferenceHint{max-width:none;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionPreferenceStack{margin-top:6px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionPreferenceStack>.codexSubscriptionQuotaModes{flex:1 1 100%;margin-left:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}
.codexSubscriptionPreferenceStack .codexSubscriptionQuotaMode{min-height:30px;padding:4px 8px;text-align:center;white-space:normal;line-height:16px}
.codexSubscriptionPreferenceLabel small{padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:500;line-height:16px}
@container (max-width:560px){.codexSubscriptionPreferenceStack>.codexSubscriptionQuotaModes{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr))}}
.codexSubscriptionModeNote{flex:1 1 100%;padding:7px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionModeNote[data-danger=true]{background:color-mix(in srgb,var(--dsw-alias-label-danger,#d92d20) 12%,transparent);color:var(--dsw-alias-label-danger,#d92d20)}
.codexSubscriptionQuotaModes{display:flex;flex-wrap:wrap;max-width:100%;align-items:center;gap:3px;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionQuotaMode{position:relative;display:flex;align-items:center;justify-content:center;min-height:26px;padding:0 9px;border-radius:7px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.codexSubscriptionQuotaMode small{margin-left:3px;font-size:9px;line-height:1;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionQuotaMode:has(input:checked){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px var(--dsw-alias-border-l3)}
.codexSubscriptionQuotaMode:has(input:focus-visible){outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.codexSubscriptionQuotaMode:has(input:disabled){cursor:not-allowed;opacity:.5}
.codexSubscriptionQuotaMode input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.codexSubscriptionContext{display:flex;flex-direction:column;gap:8px}
.codexSubscriptionPickerSetting{display:flex;flex-direction:column;gap:8px}
.codexSubscriptionContextHead{font-size:13px;line-height:20px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
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
.codexSubscriptionSearch{display:flex;flex-direction:column;gap:2px}
.codexSubscriptionDivider{height:1px;background:var(--dsw-alias-border-l2)}
.codexSubscriptionQuotaModes[data-saving=true] .codexSubscriptionQuotaMode:has(input:disabled){cursor:wait;opacity:1}
.codexSubscriptionSearchChoices[data-saving=true] .codexSubscriptionQuotaMode:has(input:disabled){cursor:wait;opacity:1}
.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.codexSubscriptionStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionAccounts{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionAccount{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}
.codexSubscriptionAccount:last-child{border-bottom:0}
.codexSubscriptionAccountMain{display:flex;flex-direction:column;gap:2px;padding:6px 0;min-width:0}
.codexSubscriptionAccountQuota{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12px;color:var(--dsw-alias-text-l2)}
.codexSubscriptionAccountQuota[data-state=error]{color:var(--dsw-alias-text-danger,#c0392b)}
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
.codexSubscriptionDiagnostics{color:var(--dsw-alias-label-secondary)}.codexSubscriptionDiagnostics h3{color:var(--dsw-alias-label-primary)}
.codexSubscriptionDiagnostics ul{margin:0;padding-left:18px;font-size:13px;line-height:20px}
.codexSubscriptionDiagnostics li+li{margin-top:6px}
.codexSubscriptionDiagnostics li strong{font-weight:600;color:var(--dsw-alias-label-primary)}
.codexSubscriptionDiagnostics [role=status]>p{margin:0;font-size:13px}
.codexSubscriptionDiagnostics pre{max-height:240px;margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/17px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionLink{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-decoration:none;white-space:nowrap}
.codexSubscriptionLink:hover{background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionLink:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}
.codexSubscriptionSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.codexSubscriptionFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}
.codexSubscriptionRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.codexSubscriptionEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionHistory{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l3);padding-top:8px}
.codexSubscriptionHistoryRefresh{margin:6px 0;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.codexSubscriptionHistoryRefresh:disabled{opacity:.5;cursor:default}
.codexSubscriptionHistory>summary{cursor:pointer;font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionHistoryPeriods{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.codexSubscriptionHistoryPeriods button{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:13px;background:transparent;color:inherit;font-size:12px;cursor:pointer}
.codexSubscriptionHistoryPeriods button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-inverted)}
.codexSubscriptionHistorySummary{margin:4px 0 8px;font-size:13px}
.codexSubscriptionHistoryGroup{margin:8px 0}
.codexSubscriptionHistoryGroup h4{margin:0 0 4px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionOverviewStats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
.codexSubscriptionOverviewStats div{padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.08))}
.codexSubscriptionOverviewStats dt{margin:0;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionOverviewStats dd{margin:2px 0 0;font-size:15px;font-weight:600}
.codexSubscriptionHeatmap{display:block;width:100%;max-width:520px;margin:6px 0 4px}
.codexSubscriptionHeatmap rect{fill:var(--dsw-alias-border-l3,rgba(127,127,127,.25))}
.codexSubscriptionHeatmap rect[data-level="1"]{fill:#0a84ff;fill-opacity:.3}
.codexSubscriptionHeatmap rect[data-level="2"]{fill:#0a84ff;fill-opacity:.5}
.codexSubscriptionHeatmap rect[data-level="3"]{fill:#0a84ff;fill-opacity:.75}
.codexSubscriptionHeatmap rect[data-level="4"]{fill:#0a84ff}
.codexSubscriptionHistoryRow{display:grid;grid-template-columns:minmax(80px,32%) 1fr 52px;align-items:center;gap:8px;font-size:12px;line-height:20px}
.codexSubscriptionHistoryKey{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexSubscriptionHistoryRow progress{width:100%;height:6px}
.codexSubscriptionHistoryRow strong{text-align:right;font-weight:500}
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
.codexSubscriptionSearch>.codexSubscriptionSearchOptions{margin-top:0;padding-top:2px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px}
.codexSubscriptionDivider+.codexSubscriptionDivider{display:none}
.codexSubscriptionPickerModels{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionPickerModel{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}
.codexSubscriptionPickerModel:last-child{border-bottom:0}
.codexSubscriptionSearchOptions>summary{cursor:pointer;color:var(--dsw-alias-label-primary);padding:6px 0}
.codexSubscriptionSearchOptions>summary>span{float:right;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionSearchOptions[open]>summary{margin-bottom:8px}
.codexSubscriptionCreditSection{display:flex;flex-direction:column;gap:7px}
.codexSubscriptionCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCreditExpiry{display:grid;gap:2px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionCreditExpiry p{margin:0}.codexSubscriptionCreditExpiry[data-soon=true]{color:var(--dsw-alias-label-secondary);font-weight:600}
.codexSubscriptionCreditRows{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.codexSubscriptionCreditBalance,.codexSubscriptionSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionCreditBalance{display:flex;flex-direction:column;gap:6px}
.codexSubscriptionCreditBalance span,.codexSubscriptionCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.codexSubscriptionCreditRows{display:flex;flex-direction:column;gap:6px}
.codexSubscriptionResetMeta{display:flex;min-width:0;flex-direction:column;gap:1px}
.codexSubscriptionResetPanel{display:flex;flex-direction:column;gap:10px;margin-top:6px}
.codexSubscriptionResetHead{display:flex;flex-direction:column;gap:2px}
.codexSubscriptionResetHead strong{font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}
.codexSubscriptionResetHead span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionResetBox{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:6px 14px 2px}
.codexSubscriptionResetTabs{display:flex;gap:8px;padding:6px 0 10px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionResetTabs span{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary)}
.codexSubscriptionResetTabs b{font-weight:400;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionResetBox .codexSubscriptionResetBalance{gap:0}
.codexSubscriptionResetBox .codexSubscriptionResetCard{padding:12px 0;border:0;border-radius:0;background:none}
.codexSubscriptionResetBox .codexSubscriptionResetCard+.codexSubscriptionResetCard{border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionResetBox .codexSubscriptionResetCard strong{font-size:13px;line-height:20px;font-weight:600}
.codexSubscriptionResetBox .codexSubscriptionResetExpiry{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionResetBox .codexSubscriptionResetUse{min-height:28px;padding:0 12px;border:0!important;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font-size:12px;font-weight:600}
.codexSubscriptionResetBox>.codexSubscriptionResetBalance>.codexSubscriptionCreditNote{padding:12px 0}
.codexSubscriptionResetBalance{display:flex;flex-direction:column;gap:8px}
.codexSubscriptionResetCard{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionResetCard{flex-wrap:wrap}
.codexSubscriptionResetCard .codexSubscriptionResetMeta{flex:1 1 180px}
.codexSubscriptionResetCard .codexSubscriptionActions{width:auto;flex:0 0 auto}
.codexSubscriptionResetCard strong{overflow:hidden;font-size:12px;line-height:18px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
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
.codexSettingsTabs{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:4px;background:var(--dsw-alias-bg-module-platform);border-radius:12px}
.codexSettingsTabs button{min-width:0;min-height:36px;border:0;border-radius:9px;padding:7px 6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.codexSettingsTabs button:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.codexSettingsTabs button[aria-selected=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px #0001}
.codexSubscription>[role=tabpanel]:not([hidden]){display:flex;flex-direction:column;gap:10px}
.codexComposerQuota:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:2px}
.codexComposerQuota{display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0 5px;border:0;border-radius:6px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.codexComposerQuota:hover,.codexComposerQuota[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}
.codexQuotaCompactWindow{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:min(380px,55vw)}
.codexQuotaCompactWindow>span:last-child{overflow:hidden;text-overflow:ellipsis}
.codexQuotaPopover{position:fixed;z-index:1000;width:max-content;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 4px 16px #0002;font-size:12px;line-height:20px;outline:none}
.codexQuotaDetail+ .codexQuotaDetail{margin-top:5px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l2)}
.codexQuotaDetail>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.codexQuotaDetail strong{font-weight:500}
.codexQuotaReset,.codexQuotaDetail p{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px}
.codexComposerQuotaBar{width:100%;margin-top:8px}
.codexComposerQuotaBar{display:block;width:40px;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-label-secondary);-webkit-appearance:none;appearance:none}
.codexComposerQuotaBar::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}
.codexComposerQuotaBar::-webkit-progress-value{background:var(--dsw-alias-label-secondary);border-radius:999px}
.codexComposerQuotaBar::-moz-progress-bar{background:var(--dsw-alias-label-secondary);border-radius:999px}
.codexModelSelect{position:relative;min-width:0}
.codexModelSelectTrigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:var(--dsw-radius-sm);outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}
.codexModelSelectTrigger:hover:not(:disabled),.codexModelSelectTrigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}
.codexModelSelectTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.codexModelSelectTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.codexModelSelectBolt{display:block;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary)}
.codexModelSelectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectEffort{flex:none;color:var(--dsw-alias-label-caption)}
.codexModelSelectChevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms}
.codexModelSelectTrigger[aria-expanded=true] .codexModelSelectChevron{transform:rotate(180deg)}
/* The menu follows DSH's own model picker: one floating surface above the trigger, rows drill into the same surface. */
.codexModelSelectMenu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-sizing:border-box;position:fixed;display:flex;flex-direction:column;width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);padding:4px;border:0;box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);overflow:hidden}
.codexModelSelectCell{box-sizing:border-box;display:flex;align-items:center;gap:6px;width:auto;min-width:100%;height:34px;padding:0 8px;border:none;border-radius:var(--dsw-radius-md);outline:none;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.codexModelSelectCell:hover,.codexModelSelectCell:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.codexModelSelectCellLabel{flex:none;white-space:nowrap}
.codexModelSelectCellValue{flex:auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectCellChevron{flex:none;width:12px;height:12px;color:var(--dsw-alias-menu-icon)}
.codexModelSelectSearchRow{flex-shrink:0;position:relative;margin:2px 0 3px}
.codexModelSelectSearchRow .codexModelSelectSearch{display:flex;height:auto;padding:5px 7px;border:0 solid transparent;border-radius:var(--dsw-radius-md);background:transparent}
.codexModelSelectSearchRow .codexModelSelectSearch:focus-within{border-color:transparent}
.codexModelSelectSearchRow .codexModelSelectSearch input{padding:0;font-size:12px;line-height:normal}
.codexModelSelectSearchRow .codexModelSelectSearch input::placeholder{color:var(--dsw-alias-label-caption)}
.codexModelSelectGroups{flex:1 1 auto;min-height:0;overflow-y:auto}
.codexModelSelectGroupTitle{padding:5px 8px 3px;color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}
.codexModelSelectOption{box-sizing:border-box;display:flex;align-items:center;gap:6px;width:auto;min-width:100%;min-height:34px;padding:5px 7px;border:none;border-radius:var(--dsw-radius-md);outline:none;background:transparent;color:inherit;text-align:left;cursor:pointer}
.codexModelSelectOption:hover:not(:disabled),.codexModelSelectOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.codexModelSelectOption:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.codexModelSelectOptionCopy{display:flex;flex:1;flex-direction:column;min-width:0}
.codexModelSelectOptionName{overflow:hidden;color:inherit;font-size:13px;font-weight:400;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectOptionDescription{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}
.codexModelSelectCheck{display:grid;place-items:center;flex:0 0 14px;color:var(--dsw-alias-label-primary)}
.codexModelSelectCheck svg{width:14px;height:14px}
.codexModelSelectStatus,.codexModelSelectEmpty{padding:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.codexModelSelectError,.codexModelSelectWarning{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:3px;padding:6px 7px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}
.codexModelSelectWarning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.codexModelSelectRetry{flex:none;padding:0;border:none;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.codexImageTool{display:flex;flex-direction:column;gap:8px;margin:4px 0;color:var(--dsw-alias-label-primary)}
.codexImageToolRow{display:flex;align-items:center;min-height:24px;gap:8px;font-size:13px;line-height:20px}
.codexImageToolIcon{display:block;flex-shrink:0;width:16px;height:16px;color:var(--dsw-alias-label-secondary)}
.codexImageTool[data-state=running] .codexImageToolIcon{animation:codexImageSpin 800ms linear infinite}
.codexImageTool[data-state=error] .codexImageToolIcon{color:var(--dsw-alias-state-error-primary)}
.codexImageToolTitle{font-weight:500}
.codexImageToolState{color:var(--dsw-alias-label-tertiary)}
.codexImageToolError{margin:0 0 0 24px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.codexImageToolGallery{margin-left:0}
.codexImageDetails{margin-left:24px;font-size:12px;color:var(--dsw-alias-label-secondary)}.codexImageDetails summary{cursor:pointer}.codexImageDetails p{margin:6px 0;line-height:1.6;overflow-wrap:anywhere}
.codexGeneratedImageFrame{display:flex;align-items:center;justify-content:center;width:min(240px,100%);height:240px;padding:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);cursor:pointer}
.codexGeneratedImageFrame img{display:block;width:100%;height:100%;object-fit:cover}
.codexGeneratedImageRetry{min-height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);cursor:pointer}
@keyframes codexImageSpin{to{transform:rotate(360deg)}}
.codexImageToolGallery{display:flex;align-items:flex-start;flex-direction:column;gap:8px}
@container (max-width:560px){.codexSubscriptionCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column}
.codexSubscriptionActions{width:100%}
.codexSubscriptionSearchChoices{grid-template-columns:1fr}}
.codexSubscriptionRuntime{font-size:12px;line-height:1.6;margin-top:12px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionRuntime summary{cursor:pointer;width:fit-content;color:var(--dsw-alias-label-primary);border-radius:6px}
.codexSubscriptionRuntime summary:focus-visible{outline:2px solid currentColor;outline-offset:4px}
.codexSubscriptionRuntime p{margin:8px 0}
.codexSubscriptionRuntime .codexSubscriptionPreference{flex-wrap:wrap;align-items:flex-start}
.codexSubscriptionRuntime .codexSubscriptionPreference>span{flex:1;min-width:180px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionRuntime button{flex-shrink:0;white-space:nowrap}
.codexSubscriptionRuntime code{display:block;overflow-wrap:anywhere;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;user-select:text}
@media(max-width:640px){.codexSubscriptionCard{padding:14px}}
.codexSubscriptionHelp{font-size:12px;line-height:1.65;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionBadge{flex:none;padding:3px 8px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.codexImageSettings>.codexSubscriptionSectionHead{flex-direction:row;align-items:center}
.codexSubscriptionSettingRows>.codexImagePreference+.codexImagePreference{border-top:1px solid var(--dsw-alias-border-l2)}
.codexSubscriptionDiagnostics .codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column;gap:12px}
.codexSubscriptionDiagnostics .codexSubscriptionSectionTitle{display:flex;flex-direction:column;gap:5px}
.codexSubscriptionRemotePair{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:8px}.codexSubscriptionRemotePair>div:not(.codexSubscriptionRemoteQr){flex:1 1 220px;min-width:0}.codexSubscriptionRemoteQr{width:168px;height:168px;flex:none;border-radius:12px;overflow:hidden;background:#fff}.codexSubscriptionRemoteQr svg{display:block;width:100%;height:100%}.codexSubscriptionRemoteCode{margin:6px 0;font:600 20px/28px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;user-select:all}
.codexSubscriptionStorageMeter{display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionStorageHead{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
.codexSubscriptionStorageTitle{display:flex;align-items:baseline;gap:6px 12px;flex-wrap:wrap;min-width:0}
.codexSubscriptionStorageTitle output{font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionStorageMeter progress{width:100%;height:4px;border:0;border-radius:4px;overflow:hidden;accent-color:var(--dsw-alias-label-secondary)}
.codexSubscriptionStorageMeter progress::-webkit-progress-bar{background:var(--dsw-alias-border-l2)}
.codexSubscriptionStorageMeter progress::-webkit-progress-value{background:var(--dsw-alias-label-secondary)}
.codexSubscriptionConfirm{padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;font-size:12px;line-height:1.65}
.codexSubscriptionConfirm p{margin-bottom:12px}
.codexSubscriptionRuntime{padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:2px}
.codexSubscriptionRuntime details{margin-top:8px}.codexSubscriptionRuntime details[open]>summary{margin-bottom:10px}
@container (max-width:480px){.codexSubscriptionPreference,.codexSubscriptionContextHead{flex-wrap:wrap}.codexSubscriptionPreferenceHint{max-width:none}.codexSubscriptionPreference>.codexSubscriptionPreferenceCopy{flex:1 1 220px}.codexSubscriptionQuotaModes{max-width:100%;flex-wrap:wrap}.codexSubscriptionQuotaMode{min-height:30px}.codexSubscriptionActions{flex-wrap:wrap}}
@container (max-width:420px){.codexSettingsTabs{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(max-content,1fr);overflow-x:auto;scrollbar-width:none}.codexSettingsTabs button{padding:7px 10px;white-space:nowrap}}
@media(prefers-reduced-motion:reduce){.codexSubscription *{transition:none!important}}
.codexSubscriptionLogHead{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:12px}.codexSubscriptionLogHead h4{margin:0;font-size:13px}.codexSubscriptionLog{max-height:320px;overflow:auto;margin:6px 0 0;padding:8px 10px;border:1px solid var(--border,#0002);border-radius:8px;font:11.5px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word}.codexSubscriptionLog_error{color:#c0392b}.codexSubscriptionLog_warn{color:#b9770e}.codexSubscriptionLog_info{opacity:.8}
.codexSubscriptionConnectors>.codexSubscriptionQuotaModes{flex:0 0 auto;display:flex;flex-wrap:nowrap;margin-left:auto}
.codexSubscriptionConnectors .codexSubscriptionQuotaMode{min-height:28px;padding:0 10px;white-space:nowrap}
.codexSubscriptionConnectors>.codexSubscriptionModeNote{padding:0;background:none;font-size:12px;line-height:18px}
.codexSubscriptionConnectors>.codexSubscriptionModeNote[data-danger=true]{background:none}
@container (max-width:520px){.codexSubscriptionConnectors>.codexSubscriptionQuotaModes{flex:1 1 100%;margin-left:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}.codexSubscriptionConnectors .codexSubscriptionQuotaMode{padding:0 4px;white-space:normal;text-align:center}}
.codexVoiceChoice{display:flex;align-items:center;gap:8px}
.codexVoiceChoice .codexSubscriptionContextTrigger{min-width:150px;justify-content:space-between}
.codexVoiceChoice .codexSubscriptionContextTrigger:first-child:not(:last-child){min-width:0;justify-content:center}
/* The voice button wears the send button's own classes, so its colours, shape and theme are always the send button's. */
.codexVoiceCall{position:absolute;z-index:2;margin:0}
a.codexVoiceCall{display:flex;align-items:center;justify-content:center;box-sizing:border-box;text-decoration:none}
/* DSH's send button is the light info colour at rest and darkens on hover. The voice button is an action in its own right, so it keeps the stronger colour all the time and only deepens a little on hover. */
.codexVoiceCall:not(:disabled){background:var(--dsw-alias-button-info-hover,#4176e6)!important;filter:none}
.codexVoiceCall:not(:disabled):hover{filter:brightness(.92)}
.codexVoiceCall:disabled{cursor:progress}
.codexVoiceCall[data-state=connecting]{animation:codexVoicePulse 1.1s ease-in-out infinite}
.codexVoiceCallNote{position:absolute;bottom:calc(100% + 8px);z-index:3;width:max-content;max-width:320px;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-surface-elevated,#2a2a2e);color:var(--dsw-alias-label-primary,#fff);font-size:12px;line-height:16px;box-shadow:0 4px 16px rgba(0,0,0,.3);white-space:normal}
.codexVoiceBrowserActions{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}.codexVoiceBrowserActions a,.codexVoiceBrowserActions button{color:inherit;text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;font:inherit}
@keyframes codexVoicePulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.codexVoiceCall{animation:none!important}}

@keyframes codexVoiceStageIn{from{opacity:0;margin-top:8px}to{opacity:1;margin-top:0}}
@media (prefers-reduced-motion:reduce){.codexVoiceOrb,.codexVoiceDot,.codexVoiceStage,.codexVoiceLines p{animation:none!important;transition:none!important}}
.codexVoiceStage{position:fixed;z-index:60;display:flex;flex-direction:column;align-items:center;gap:6px;width:min(560px,92vw);pointer-events:none;animation:codexVoiceStageIn .28s cubic-bezier(.33,1,.68,1)}
.codexVoiceStage[data-side=above]{transform:translate(-50%,calc(-100% - 16px))}
.codexVoiceStage[data-side=below]{transform:translate(-50%,22px);flex-direction:column-reverse}
.codexVoiceOrbBox{position:relative;width:120px;height:120px;flex:none;margin:-14px 0}
.codexVoiceOrb{position:absolute;inset:0;transition:opacity .5s ease}
.codexVoiceOrb[data-ready=false]{opacity:0}
.codexVoiceOrb canvas{display:block;width:100%;height:100%}
.codexVoiceDot{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:var(--dsw-alias-label-primary,#fff);animation:codexVoicePulse 1.1s ease-in-out infinite;transition:opacity .35s ease,transform .5s cubic-bezier(.33,1,.68,1)}
.codexVoiceDot[data-gone=true]{opacity:0;transform:scale(1.8);animation:none}
.codexVoiceLines{display:flex;flex-direction:column;align-items:center;gap:2px;max-width:100%;min-height:0;text-align:center}
.codexVoiceLines p{margin:0;max-width:100%;font-size:13px;line-height:19px;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;animation:codexVoiceStageIn .28s cubic-bezier(.33,1,.68,1)}
.codexVoiceLines p[data-role=user]{color:var(--dsw-alias-label-secondary)}
.codexVoiceLines p[data-old]{opacity:.45}
.codexVoiceStatus{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.codexVoiceTools{display:inline-flex;align-items:center;gap:2px}
[data-voice-live]>[data-slot="conversation.input.activity"]{display:none!important}
.codexVoiceTool{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.codexVoiceTool:hover{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}
.codexVoiceTool[aria-pressed=true]{color:var(--dsw-alias-label-tertiary)}

/* Every fold-out in the settings reads as pressable: a full-width row, a chevron on the right that turns when it opens, a hover state. */
.codexSubscriptionHistory>summary,.codexSubscriptionSearchOptions>summary,.codexSubscriptionRuntime summary,.codexSubscriptionDiagnostics details>summary,.codexImageDetails summary{display:flex;align-items:center;gap:8px;width:auto;box-sizing:border-box;min-height:32px;margin:0 -10px;padding:4px 10px;border-radius:8px;list-style:none;cursor:pointer;user-select:none;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);transition:background .12s}
.codexSubscriptionHistory>summary::-webkit-details-marker,.codexSubscriptionSearchOptions>summary::-webkit-details-marker,.codexSubscriptionRuntime summary::-webkit-details-marker,.codexSubscriptionDiagnostics details>summary::-webkit-details-marker,.codexImageDetails summary::-webkit-details-marker{display:none}
.codexSubscriptionHistory>summary::after,.codexSubscriptionSearchOptions>summary::after,.codexSubscriptionRuntime summary::after,.codexSubscriptionDiagnostics details>summary::after,.codexImageDetails summary::after{content:"";flex:none;margin-left:auto;width:7px;height:7px;border:solid var(--dsw-alias-label-tertiary);border-width:0 1.6px 1.6px 0;transform:translateY(-2px) rotate(45deg);transition:transform .15s,border-color .12s}
.codexSubscriptionHistory[open]>summary::after,.codexSubscriptionSearchOptions[open]>summary::after,.codexSubscriptionRuntime details[open]>summary::after,.codexSubscriptionDiagnostics details[open]>summary::after,.codexImageDetails[open]>summary::after{transform:translateY(2px) rotate(-135deg)}
.codexSubscriptionHistory>summary:hover,.codexSubscriptionSearchOptions>summary:hover,.codexSubscriptionRuntime summary:hover,.codexSubscriptionDiagnostics details>summary:hover,.codexImageDetails summary:hover{background:var(--dsw-alias-interactive-bg-hover)}
.codexSubscriptionHistory>summary:hover::after,.codexSubscriptionSearchOptions>summary:hover::after,.codexSubscriptionRuntime summary:hover::after,.codexSubscriptionDiagnostics details>summary:hover::after,.codexImageDetails summary:hover::after{border-color:var(--dsw-alias-label-primary)}
.codexSubscriptionHistory>summary:focus-visible,.codexSubscriptionSearchOptions>summary:focus-visible,.codexSubscriptionRuntime summary:focus-visible,.codexSubscriptionDiagnostics details>summary:focus-visible,.codexImageDetails summary:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:0}
.codexSubscriptionSearchOptions>summary>span{float:none;margin-left:auto;font-weight:400}
.codexSubscriptionSearchOptions>summary::after{margin-left:6px}
.codexSubscriptionRuntime summary{font-size:12px}

/* Feature overview: one row per feature, a sentence, a switch and optional options */
.codexFeatureOverview{display:flex;flex-direction:column;gap:0}
.codexFeatureOverview>h3{margin:0 0 4px}
.codexFeatureRow{border-top:1px solid var(--dsw-alias-border-l2)}.codexFeatureOverview>h3+.codexFeatureRow{border-top:0}
.codexFeatureMain{display:flex;align-items:center;gap:12px;padding:10px 0;min-height:52px}
.codexFeatureCopy{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.codexFeatureTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.codexFeatureTitle small{margin-left:6px;font-size:10px;font-weight:500;padding:0 5px;border-radius:5px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary)}
.codexFeatureSummary{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.codexFeatureRow[data-blocked=true] .codexFeatureSummary{color:var(--dsw-alias-label-tertiary)}
.codexFeatureStatus{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
.codexFeatureMore{flex:none;display:inline-flex;align-items:center;gap:4px;min-width:68px;justify-content:flex-end;border:0;background:transparent;padding:4px 0 4px 6px;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.codexFeatureMore:hover{color:var(--dsw-alias-label-primary)}.codexFeatureMore[aria-expanded=true] svg{transform:rotate(180deg)}
.codexFeatureMoreSpace{flex:none;min-width:68px}
.codexFeatureOptions{display:flex;flex-direction:column;gap:8px;margin:0 0 10px;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexFeatureScope{margin-top:6px;padding:6px 12px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px}
.codexQuotaAlerts[data-disabled=true]>.codexSubscriptionPreference{opacity:.5}
.codexScopeNote{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);font-size:12px;color:var(--dsw-alias-label-secondary)}
.codexScopeNote[data-others-off=true]{background:color-mix(in srgb,var(--dsw-alias-bg-module-platform) 70%,#f5a30022)}
.codexScopeNote button{border:0;background:transparent;font:inherit;color:var(--dsw-alias-label-primary);text-decoration:underline;cursor:pointer;flex:none}
.codexAdvancedFold{padding:0}.codexAdvancedFold>summary{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;list-style:none;font-size:13px;font-weight:600}
.codexAdvancedFold>summary::-webkit-details-marker{display:none}
.codexAdvancedFold>summary>span{font-weight:400;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-left:auto}
.codexAdvancedFold>summary::after{content:"";flex:none;width:7px;height:7px;border:solid var(--dsw-alias-label-tertiary);border-width:0 1.5px 1.5px 0;transform:translateY(-2px) rotate(45deg)}
.codexAdvancedFold[open]>summary::after{transform:translateY(2px) rotate(-135deg)}
.codexAdvancedBody{display:flex;flex-direction:column;gap:10px;padding:2px 16px 14px}
.codexAdvancedInline{margin-top:6px;border:0;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0;background:transparent}.codexAdvancedInline>summary{padding:10px 0}.codexAdvancedInline>.codexSubscriptionPreference{margin-bottom:8px}
/* Settings pages in DSH's own look. One set of sizes for every page:
   frame 1px / radius 12 / side padding 16 / gap between frames 8; row min-height 52, padding 8 0; title 13/20, hint 12/18;
   every in-row control 32px high, radius 10, 13px; a hairline only under a row, never above one. */
.codexFlat{display:flex;flex-direction:column;gap:0}.codexFlat[hidden]{display:none}
.codexFlat .codexSubscriptionAdvancedPreferences{gap:0}
.codexFlat .codexSubscriptionCard,.codexFlat .codexSubscriptionPreferencesCard,.codexFlat .codexImageSettings{border:1px solid var(--dsw-alias-border-l2);background:transparent;box-shadow:none;border-radius:12px;padding:2px 16px;margin:0 0 8px}
.codexFlat .codexSubscriptionPreferencesCard,.codexFlat .codexFeatureOverview{gap:0}
.codexFlat h3,.codexFlat .codexSubscriptionSectionHead h3{margin:10px 0 2px;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.codexFlat .codexSubscriptionPreference,.codexFlat .codexFeatureRow>.codexFeatureMain{box-sizing:border-box;padding:8px 0;min-height:52px;gap:6px 16px;align-items:center}
.codexFlat .codexSubscriptionPreference,.codexFlat .codexFeatureRow{border-bottom:1px solid var(--dsw-alias-border-l2)}
.codexFlat .codexFeatureRow,.codexFlat .codexSubscriptionPreference{border-top:0}
.codexFlat section>.codexSubscriptionPreference:last-child,.codexFlat .codexSubscriptionCard>.codexSubscriptionPreference:last-child,.codexFlat section>.codexFeatureRow:last-of-type,.codexFlat section>div:last-child>.codexSubscriptionPreference:last-child,.codexFlat .codexAdvancedBody>.codexSubscriptionPreference:last-child{border-bottom:0}
.codexFlat .codexSubscriptionPreferenceLabel,.codexFlat .codexFeatureTitle{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400;line-height:20px;min-height:20px;color:var(--dsw-alias-label-primary)}
.codexFlat .codexSubscriptionPreferenceLabel small,.codexFlat .codexFeatureTitle small{line-height:16px;height:16px;display:inline-flex;align-items:center}
.codexFlat .codexSubscriptionPreferenceHint,.codexFlat .codexFeatureSummary{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.codexFlat .codexSubscriptionPreferenceCopy{gap:0}
.codexFlat .codexSubscriptionDivider{display:none}
.codexFlat .codexSubscriptionQuotaModes{background:var(--dsw-alias-bg-module-platform);border-radius:10px;padding:2px;gap:2px;min-height:32px;box-sizing:border-box}
.codexFlat .codexSubscriptionQuotaMode{min-height:28px;border-radius:8px;padding:0 10px;font-size:13px;white-space:nowrap}
.codexFlat .codexSubscriptionContextTrigger{background:var(--dsw-alias-bg-module-platform);border-radius:10px;padding:0 12px;min-height:32px;height:32px;color:var(--dsw-alias-label-primary);font-size:13px}
.codexFlat .codexSubscriptionPreference button[class*=_md_],.codexFlat .codexSubscriptionActions button[class*=_md_]{border-radius:10px;padding:0 12px;min-height:32px;height:32px;font-size:13px}
.codexFlat .codexSubscriptionActions .codexSubscriptionContextTrigger{min-height:32px}
.codexFlat .codexFeatureMore{box-sizing:border-box;width:28px;min-width:28px;height:28px;padding:0;gap:0;justify-content:center;background:transparent;border-radius:8px;color:var(--dsw-alias-label-secondary)}.codexFlat .codexFeatureMore:hover{background:var(--dsw-alias-bg-module-platform)}
.codexFlat .codexFeatureMoreSpace{display:block;width:28px;min-width:28px;height:28px}
.codexFlat .codexFeatureStatus{font-size:12px;color:var(--dsw-alias-label-secondary)}
.codexFlat .codexFeatureOverview>h3{margin-top:10px}
.codexFlat .codexAdvancedFold{margin-top:0;padding:0 16px}
.codexFlat .codexAdvancedFold>summary{padding:10px 0;font-weight:500;font-size:13px;line-height:20px}
.codexFlat .codexAdvancedBody{padding:0 0 4px}
.codexFlat .codexAdvancedInline{margin-top:0;border-top:0;padding:0}.codexFlat .codexAdvancedInline>summary{padding:10px 0;font-weight:400}
.codexFlat .codexSubscriptionSearch>.codexSubscriptionSearchOptions,.codexFlat .codexSubscriptionRuntime,.codexFlat .codexSubscriptionHistory{border-top:0;margin-top:0;padding-top:0}
.codexFlat .codexSubscriptionSearchOptions{margin:0;padding:0}.codexFlat .codexSubscriptionSearchOptions>summary{padding:10px 0;margin:0}
.codexFlat .codexSubscriptionCard:has(>.codexSubscriptionAccounts),.codexFlat .codexSubscriptionCard:has(>.codexSubscriptionActions),.codexFlat .codexSubscriptionStorage{padding-block:10px}
.codexFlat .codexSubscriptionCreditSection{display:block}.codexFlat .codexSubscriptionCreditSection[open]>summary{border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:8px}
.codexFlat .codexSubscriptionStorage{gap:6px}
.codexFlat .codexSubscriptionStorageTitle h3{margin:0}
.codexFlat .codexSubscriptionStorageMeter{background:transparent;padding:0}
.codexFlat .codexSubscriptionResetBox{border:0;border-radius:0;padding:0}
.codexFlat :is(button,summary,a):focus-visible,.codexFlat label:has(:focus-visible){outline:2px solid var(--dsw-alias-border-inverted);outline-offset:2px;box-shadow:none}
.codexSettingsTabs{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-layer-1);border-radius:0;padding:6px 0 0;margin-top:-6px;gap:18px;display:flex;overflow-x:auto;scrollbar-width:none;grid-template-columns:none;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:8px}
.codexSettingsTabs button{flex:none;min-height:34px;padding:0 2px;border-radius:0;border-bottom:2px solid transparent;margin-bottom:-1px;font-size:14px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.codexSettingsTabs button[aria-selected=true]{background:transparent;box-shadow:none;color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-label-primary)}
.codexSubscriptionNotices{display:flex;flex-direction:column;gap:6px;margin:0 0 8px}
.codexSubscriptionNotices p{margin:0;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionNotice{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionNotices button{margin-left:6px;border:0;background:transparent;padding:0;font:inherit;color:var(--dsw-alias-label-primary);text-decoration:underline;cursor:pointer}
.codexSubscriptionPace{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warning-primary,#b45309)}
.codexSubscriptionForecast{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionLimit[data-pace=true] progress{accent-color:var(--dsw-alias-state-warning-primary,#f5a300)}
.codexSubscriptionLimit[data-pace=true] progress::-webkit-progress-value{background:var(--dsw-alias-state-warning-primary,#f5a300)}
.codexSubscriptionLimit[data-pace=true] progress::-moz-progress-bar{background:var(--dsw-alias-state-warning-primary,#f5a300)}
.codexDiagResult{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--dsw-alias-border-l2)}
.codexDiagBadge{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.codexDiagResult[data-state=ok] .codexDiagBadge::before,.codexDiagResult[data-state=attention] .codexDiagBadge::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;background:var(--dsw-alias-state-success-primary,#1a9d58)}
.codexDiagResult[data-state=attention] .codexDiagBadge::before{background:var(--dsw-alias-state-warning-primary,#f5a300)}
.codexDiagTime{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.codexDiagFindings{list-style:none;margin:0;padding:0 0 6px;display:flex;flex-direction:column;gap:8px}
.codexDiagFindings>li{display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:20px}
.codexDiagNext{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.codexDiagTable{width:100%;font-size:12px;text-align:left;border-spacing:0 6px}
.codexFlat .codexSubscriptionDiagnostics details.codexAdvancedFold{margin:0;padding:0;border-top:1px solid var(--dsw-alias-border-l2)}.codexFlat .codexSubscriptionDiagnostics details>summary{margin:0}
.codexDiagFindings>li{padding:0;margin:0}.codexDiagFindings{padding-left:0!important}
/* The model search row stays put while the list scrolls under it: a hairline marks the edge so a partly scrolled group title reads as scrolled, not broken. */
.codexModelSelectSearchRow{margin:2px 0 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.codexModelSelectGroups{scroll-padding-block:30px;padding-top:2px}
.codexModelsHead{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;padding:8px 0 2px}.codexModelsHead h3{margin:0!important;flex:0 0 auto}
.codexModelsHead>span{flex:1 1 auto;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.codexModelsHead>button{flex:0 0 auto;margin-left:auto;height:28px;min-height:28px;padding:0 10px;font-size:12px}
.codexFlat details.codexAdvancedFold.codexSubscriptionCard{padding-block:0}
.codexFlat .codexAdvancedFold>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:0;box-sizing:border-box}
.codexFlat .codexAdvancedInline>summary{min-height:44px}
.codexFlat details.codexAdvancedFold{display:block}
.codexModelSelectGroups [class*=_heading_]{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-module-platform))}
.codexFlat :is(button,summary,a):focus-visible,.codexFlat label:has(:focus-visible){outline-color:var(--dsw-alias-brand-primary,#3964fe)}
.codexSubscriptionPace{color:var(--dsw-alias-state-warn-label,#b45309)}
.codexSubscriptionAccountQuota{color:var(--dsw-alias-label-secondary)}
.codexFeatureLoadStatus{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary);flex:none}
.codexFeatureLoadStatus svg{width:16px;height:16px}
.codexFeatureRetryIcon{color:var(--dsw-alias-label-secondary)}
.codexFeatureLoadingIcon{animation:codexFeatureLoading 1s linear infinite}
.codexFeatureLoadNotice{position:fixed;z-index:1000;bottom:32px;left:50%;transform:translateX(-50%);padding:4px 8px;border:1px solid var(--dsw-alias-line-base,rgba(128,128,128,.2));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 4px 16px rgba(0,0,0,.08)}
@keyframes codexFeatureLoading{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.codexFeatureLoadingIcon{animation:none}}
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
		//#region src/client-deferred-image-viewer.jsx
		const feature = createClientFeature(() => require.async("./client.image-viewer.js"));
		function DeferredImageViewer(props) {
			return (0, react.useSyncExternalStore)(props.service.subscribe, props.service.getSnapshot) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Viewer, { ...props }) : null;
		}
		function Viewer(props) {
			const snapshot = (0, react.useSyncExternalStore)(feature.subscribe, feature.getSnapshot);
			const [attempt, retry] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				feature.load().catch(() => {});
			}, [attempt]);
			if (snapshot.status !== "ready") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexFeatureLoadNotice",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureLoadStatus, {
					failed: snapshot.status === "error",
					onRetry: () => retry((value) => value + 1),
					t: props.t
				})
			});
			const Overlay = snapshot.module.SubscriptionImageViewerOverlay;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", {
				"data-plugin": "dsh-codex-subscription-viewer",
				children: snapshot.module.SUBSCRIPTION_IMAGE_VIEWER_CSS
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Overlay, { ...props })] });
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
				kind: [
					"tool",
					"mask",
					"choice"
				].includes(action.kind) ? action.kind : "edit",
				options: Array.isArray(action.options) ? action.options.filter((option) => typeof option?.value === "string" && typeof option?.label === "string") : [],
				onInvoke: action.onInvoke
			}];
		}) : [];
		function normalizeSubscriptionViewerRequest(request) {
			const items = (Array.isArray(request?.items) ? request.items : []).flatMap((item, position) => {
				if (typeof item?.src !== "string" || item.src === "") return [];
				return [{
					id: typeof item.id === "string" && item.id !== "" ? item.id : item.src,
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
			imageSketch: false,
			imageSketchAgent: false
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
			"early",
			"custom"
		];
		const QUOTA_THRESHOLD_FIELDS = ["quotaShortThreshold", "quotaLongThreshold"];
		const validQuotaThreshold = (value) => Number.isInteger(value) && value >= 1 && value <= 100;
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
				...Object.fromEntries(QUOTA_THRESHOLD_FIELDS.map((key) => [key, validQuotaThreshold(value[key]) ? value[key] : 20])),
				...readImageFeatures(value),
				...readImageDefaults(value),
				[CUSTOM_CONTEXT_OVERRIDES_FIELD]: normalizeContextOverrides(value[CUSTOM_CONTEXT_OVERRIDES_FIELD]),
				[SEARCH_MODE_FIELD]: SEARCH_MODES.includes(value["searchMode"]) ? value[SEARCH_MODE_FIELD] : "live",
				[SEARCH_DOMAINS_FIELD]: normalizeSearchDomains(value["searchDomains"] ?? []),
				[QUOTA_ALERTS_FIELD]: QUOTA_ALERT_MODES.includes(value["quotaAlerts"]) ? value[QUOTA_ALERTS_FIELD] : "important"
			};
		}
		function quotaWarning(usage, mode = "important", now = Date.now(), thresholds = {}) {
			if (mode === "off" || !Number.isFinite(usage?.fetchedAt) || usage.fetchedAt > now || now - usage.fetchedAt > 5 * 6e4) return void 0;
			return (usage.rateLimits ?? []).filter((limit) => limit.id !== "code_review").flatMap((limit) => (limit.windows ?? []).map((window) => ({
				...window,
				limitId: limit.id
			}))).filter((window) => Number.isFinite(window.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= (mode === "custom" ? readCapabilitySettings(thresholds)[window.windowSeconds > 0 && window.windowSeconds <= 6 * 3600 ? "quotaShortThreshold" : "quotaLongThreshold"] : mode === "early" && window.windowSeconds > 0 && window.windowSeconds <= 6 * 3600 ? 50 : 20) && (!Number.isFinite(window.resetsAt) || window.resetsAt * 1e3 > now)).sort((a, b) => a.remainingPercent - b.remainingPercent)[0];
		}
		//#endregion
		//#region src/settings-contract.js
		const DISABLED_MODELS_FIELD = "disabledModels";
		const AUTO_QUOTA_RETRY_FIELD = "autoQuotaRetry";
		const QUICK_QUOTA_MODE_FIELD = "quickQuotaMode";
		const LEGACY_QUICK_QUOTA_FIELD = "quickQuotaVisible";
		const QUICK_QUOTA_MODE_PERCENT = "percent";
		const QUICK_QUOTA_MODE_FORECAST = "forecast";
		const SEARCH_PROVIDER_FIELD = "searchProvider";
		const SEARCH_PROVIDER_AUTO = "auto";
		const SEARCH_PROVIDER_CODEX = "codex";
		const DEFAULT_SEARCH_PROVIDER = SEARCH_PROVIDER_AUTO;
		const FETCH_PROVIDER_FIELD = "fetchProvider";
		const FETCH_PROVIDER_CODEX = "codex";
		const normalizeFetchProvider = (value) => value === "codex" ? FETCH_PROVIDER_CODEX : "dsh";
		const SPEED_MODE_FIELD = "speedMode";
		const SPEED_MODE_STANDARD = "standard";
		const SPEED_MODE_FAST = "fast";
		const SPEED_MODE_ULTRAFAST = "ultrafast";
		const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD;
		const OUTPUT_VERBOSITY_FIELD = "outputVerbosity";
		const OUTPUT_VERBOSITY_DEFAULT = "default";
		const OUTPUT_VERBOSITY_MEDIUM = "medium";
		const OUTPUT_VERBOSITY_HIGH = "high";
		const DEFAULT_OUTPUT_VERBOSITY = OUTPUT_VERBOSITY_DEFAULT;
		const VOICE_CALL_FIELD = "voiceCall";
		const VOICE_VOICE_FIELD = "voiceVoice";
		const VOICE_VOICES = Object.freeze([
			"cove",
			"juniper",
			"maple",
			"spruce",
			"ember",
			"vale",
			"breeze",
			"arbor",
			"sol",
			"aube",
			"bubbie",
			"haetsal",
			"hanul",
			"himari",
			"leher",
			"miko",
			"neer",
			"porto",
			"rindo",
			"rio",
			"rivage",
			"selva",
			"sonna",
			"tinta",
			"viola"
		]);
		const VOICE_LANGUAGE_FIELD = "voiceLanguage";
		const VOICE_LANGUAGES = Object.freeze([
			"auto",
			"zh",
			"en",
			"ja",
			"ko",
			"es",
			"fr",
			"de",
			"pt",
			"ru"
		]);
		const normalizeVoiceCall = (value) => value === "on" ? "on" : "off";
		const normalizeVoiceVoice = (value) => VOICE_VOICES.includes(value) ? value : "cove";
		const normalizeVoiceLanguage = (value) => VOICE_LANGUAGES.includes(value) ? value : "auto";
		const DEFAULT_REASONING_EFFORT_FIELD = "defaultReasoningEffort";
		const DEFAULT_REASONING_EFFORTS = Object.freeze([
			"auto",
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
			"ultra"
		]);
		const DEFAULT_REASONING_EFFORT = "auto";
		const normalizeDefaultReasoningEffort = (value) => DEFAULT_REASONING_EFFORTS.includes(value) ? value : DEFAULT_REASONING_EFFORT;
		const normalizeDefaultReasoningEffortChoice = normalizeDefaultReasoningEffort;
		const REASONING_SUMMARY_FIELD = "reasoningSummary";
		const REASONING_SUMMARIES = Object.freeze([
			"auto",
			"concise",
			"detailed",
			"none"
		]);
		const DEFAULT_REASONING_SUMMARY = "auto";
		const RETRY_POLICY_FIELD = "retryPolicy";
		const RETRY_POLICIES = Object.freeze([
			"default",
			"off",
			"10",
			"20",
			"unlimited"
		]);
		const DEFAULT_RETRY_POLICY = "default";
		const CONNECTORS_FIELD = "connectors";
		const CONNECTOR_MODES = Object.freeze([
			"off",
			"read",
			"ask",
			"write"
		]);
		const INPUT_IMAGE_DETAIL_FIELD = "inputImageDetail";
		const INPUT_IMAGE_DETAILS = Object.freeze([
			"low",
			"high",
			"original",
			"auto"
		]);
		const DEFAULT_INPUT_IMAGE_DETAIL = "auto";
		const STREAM_IDLE_TIMEOUT_MINUTES_FIELD = "streamIdleTimeoutMinutes";
		const STREAM_IDLE_TIMEOUT_MINUTES = Object.freeze([
			2,
			5,
			10,
			20,
			30
		]);
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
			"gpt-5.5": 272e3,
			"gpt-5.6": 872e3,
			"gpt-6-astra": 872e3
		});
		const CUSTOM_CONTEXT_MODEL_DEFAULTS = Object.freeze({
			"gpt-5.4": 272e3,
			"gpt-5.4-mini": 272e3,
			"gpt-5.5": 272e3,
			"gpt-5.6": 272e3,
			"gpt-6-astra": 272e3
		});
		const normalizeAutoQuotaRetry = (value) => typeof value === "boolean" ? value : false;
		const normalizeDisabledModels = (value) => Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && /^[a-z][a-z0-9._-]{0,79}$/u.test(id)))].slice(0, 100) : [];
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
		const normalizeReasoningSummary = (value) => REASONING_SUMMARIES.includes(value) ? value : DEFAULT_REASONING_SUMMARY;
		const normalizeRetryPolicy = (value) => RETRY_POLICIES.includes(value) ? value : DEFAULT_RETRY_POLICY;
		const normalizeConnectorMode = (value) => CONNECTOR_MODES.includes(value) ? value : "off";
		const normalizeInputImageDetail = (value) => INPUT_IMAGE_DETAILS.includes(value) ? value : DEFAULT_INPUT_IMAGE_DETAIL;
		const normalizeStreamIdleTimeoutMinutes = (value) => STREAM_IDLE_TIMEOUT_MINUTES.includes(value) ? value : 10;
		const normalizeSpeedMode = (value) => [
			"standard",
			"fast",
			"ultrafast"
		].includes(value) ? value : DEFAULT_SPEED_MODE;
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
		Object.freeze({
			compactionMode: {
				choices: ["dsh", "cloud"],
				default: "dsh",
				error: "Invalid compaction mode"
			},
			reasoningCache: {
				choices: [
					"off",
					"on",
					"sol"
				],
				default: "on",
				error: "Invalid reasoning cache preference"
			},
			[DEFAULT_REASONING_EFFORT_FIELD]: {
				choices: DEFAULT_REASONING_EFFORTS,
				default: DEFAULT_REASONING_EFFORT,
				error: "Invalid default reasoning effort"
			},
			composerPredictions: {
				choices: ["off", "on"],
				default: "off",
				error: "Invalid input prediction setting"
			},
			connectionMode: {
				choices: ["sse", "websocket"],
				default: "sse",
				error: "Invalid connection mode"
			},
			reviewModel: {
				choices: ["session", "official"],
				default: "session",
				error: "Invalid review model"
			},
			remoteControl: {
				choices: ["off", "on"],
				default: "off",
				error: "Invalid Remote Control setting"
			},
			otherModels: {
				choices: ["on", "off"],
				default: "on",
				error: "Invalid other-models setting"
			},
			subagentBackend: {
				choices: ["dsh", "codex"],
				default: "dsh",
				error: "Invalid subagent backend"
			},
			[QUICK_QUOTA_MODE_FIELD]: {
				choices: [
					"off",
					QUICK_QUOTA_MODE_PERCENT,
					"bar",
					QUICK_QUOTA_MODE_FORECAST
				],
				error: "Invalid quick quota preference"
			},
			[SEARCH_PROVIDER_FIELD]: {
				choices: [
					SEARCH_PROVIDER_AUTO,
					"dsh",
					SEARCH_PROVIDER_CODEX
				],
				default: DEFAULT_SEARCH_PROVIDER,
				error: "Invalid search provider preference"
			},
			[FETCH_PROVIDER_FIELD]: {
				choices: ["dsh", FETCH_PROVIDER_CODEX],
				default: "dsh",
				error: "Invalid fetch provider preference"
			},
			[SPEED_MODE_FIELD]: {
				choices: [
					SPEED_MODE_STANDARD,
					SPEED_MODE_FAST,
					SPEED_MODE_ULTRAFAST
				],
				default: DEFAULT_SPEED_MODE,
				error: "Invalid speed mode preference"
			},
			[OUTPUT_VERBOSITY_FIELD]: {
				choices: [
					OUTPUT_VERBOSITY_DEFAULT,
					"low",
					OUTPUT_VERBOSITY_MEDIUM,
					OUTPUT_VERBOSITY_HIGH
				],
				default: DEFAULT_OUTPUT_VERBOSITY,
				error: "Invalid output verbosity preference"
			},
			[REASONING_SUMMARY_FIELD]: {
				choices: REASONING_SUMMARIES,
				default: DEFAULT_REASONING_SUMMARY,
				error: "Invalid reasoning summary preference"
			},
			[RETRY_POLICY_FIELD]: {
				choices: RETRY_POLICIES,
				default: DEFAULT_RETRY_POLICY,
				error: "Invalid retry policy preference"
			},
			[CONNECTORS_FIELD]: {
				choices: CONNECTOR_MODES,
				default: "off",
				error: "Invalid connectors preference"
			},
			[INPUT_IMAGE_DETAIL_FIELD]: {
				choices: INPUT_IMAGE_DETAILS,
				default: DEFAULT_INPUT_IMAGE_DETAIL,
				error: "Invalid input image detail preference"
			},
			[STREAM_IDLE_TIMEOUT_MINUTES_FIELD]: {
				choices: STREAM_IDLE_TIMEOUT_MINUTES,
				default: 10,
				error: "Invalid stream idle timeout preference"
			},
			[VOICE_CALL_FIELD]: {
				choices: ["off", "on"],
				default: "off",
				error: "Invalid voice call setting"
			},
			[VOICE_VOICE_FIELD]: {
				choices: VOICE_VOICES,
				default: "cove",
				error: "Invalid voice preference"
			},
			[VOICE_LANGUAGE_FIELD]: {
				choices: VOICE_LANGUAGES,
				default: "auto",
				error: "Invalid voice language preference"
			},
			[CONTEXT_MODE_FIELD]: {
				choices: [
					CONTEXT_MODE_STANDARD,
					CONTEXT_MODE_EXTENDED,
					CONTEXT_MODE_CUSTOM
				],
				default: DEFAULT_CONTEXT_MODE,
				error: "Invalid context mode preference"
			}
		});
		const normalizeReasoningCache = (value) => value === void 0 || value === "on" || value === "sol" ? "on" : "off";
		//#endregion
		//#region src/preference-controller.js
		function createPreferenceController(rpc) {
			let updating = false;
			let error = false;
			let fallback;
			let pendingPatch;
			let failedPatch;
			let generation = 0;
			let contextModels = [];
			let availableModels = [];
			let verbosityModels = [];
			let fastModels;
			let ultrafastModels = [];
			let ultraModels = [];
			let catalogStatus;
			let modelsLoading = false;
			let modelError = false;
			let modelRefreshGeneration = 0;
			let modelRefreshStarted = false;
			let disposed = false;
			let subagentBackendAvailable = false;
			let subagentRuntimeInstalled = false;
			let fetchRoutingAvailable = false;
			let restartRequired = false;
			const sameModels = (left, right) => left.length === right.length && left.every((model, index) => JSON.stringify(model) === JSON.stringify(right[index]));
			const read = () => {
				const current = fallback ?? { status: "unavailable" };
				const value = pendingPatch === void 0 ? current.value : {
					...current.value,
					...pendingPatch
				};
				const capabilities = readCapabilitySettings(value);
				return Object.freeze({
					status: current.status,
					...capabilities,
					autoQuotaRetry: normalizeAutoQuotaRetry(value?.[AUTO_QUOTA_RETRY_FIELD]),
					connectionMode: value?.connectionMode === "websocket" ? "websocket" : "sse",
					reviewModel: value?.reviewModel === "official" ? "official" : "session",
					remoteControl: value?.remoteControl === "on" ? "on" : "off",
					composerPredictions: value?.composerPredictions === "on" ? "on" : "off",
					otherModels: value?.otherModels === "off" ? "off" : "on",
					compactionMode: value?.compactionMode === "cloud" ? "cloud" : "dsh",
					reasoningCache: normalizeReasoningCache(value?.reasoningCache),
					defaultReasoningEffort: normalizeDefaultReasoningEffort(value?.[DEFAULT_REASONING_EFFORT_FIELD]),
					subagentBackend: value?.subagentBackend === "codex" ? "codex" : "dsh",
					subagentBackendAvailable,
					subagentRuntimeInstalled,
					quickQuotaMode: normalizeQuickQuotaMode(value?.[QUICK_QUOTA_MODE_FIELD], value?.[LEGACY_QUICK_QUOTA_FIELD]),
					searchProvider: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
					fetchProvider: normalizeFetchProvider(value?.[FETCH_PROVIDER_FIELD]),
					fetchRoutingAvailable,
					speedMode: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
					outputVerbosity: normalizeOutputVerbosity(value?.[OUTPUT_VERBOSITY_FIELD]),
					inputImageDetail: normalizeInputImageDetail(value?.[INPUT_IMAGE_DETAIL_FIELD]),
					reasoningSummary: normalizeReasoningSummary(value?.[REASONING_SUMMARY_FIELD]),
					voiceCall: normalizeVoiceCall(value?.[VOICE_CALL_FIELD]),
					voiceVoice: normalizeVoiceVoice(value?.[VOICE_VOICE_FIELD]),
					voiceLanguage: normalizeVoiceLanguage(value?.[VOICE_LANGUAGE_FIELD]),
					retryPolicy: normalizeRetryPolicy(value?.[RETRY_POLICY_FIELD]),
					connectors: normalizeConnectorMode(value?.[CONNECTORS_FIELD]),
					streamIdleTimeoutMinutes: normalizeStreamIdleTimeoutMinutes(value?.[STREAM_IDLE_TIMEOUT_MINUTES_FIELD]),
					contextMode: normalizeContextMode(value?.[CONTEXT_MODE_FIELD]),
					customContextWindow: normalizeCustomContextWindow(value?.[CUSTOM_CONTEXT_WINDOW_FIELD]),
					customContextWindows: {
						...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [modelKey, normalizeCustomContextWindow(value?.[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
						...Object.fromEntries(contextModels.map((model) => [model.key, clampModelContext(capabilities["customContextModels"][model.key] ?? value?.[CUSTOM_CONTEXT_MODEL_FIELDS[model.key]], model.maximum, model.default ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[model.key])]))
					},
					contextModels,
					availableModels,
					disabledModels: normalizeDisabledModels(value?.[DISABLED_MODELS_FIELD]),
					verbosityModels,
					fastModels,
					ultrafastModels,
					ultraModels,
					catalogStatus,
					modelsLoading,
					modelError,
					writable: !updating && current.status === "ready" && current.writable === true,
					hostReadOnly: current.status === "ready" && current.writable === false,
					saving: updating,
					restartRequired,
					error
				});
			};
			let snapshot = read();
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				if (disposed) return;
				snapshot = read();
				for (const listener of [...listeners]) {
					if (disposed) break;
					listener();
				}
			};
			const acceptFallback = (value) => {
				if (value?.liveSynced === false) restartRequired = true;
				subagentBackendAvailable = value?.subagentBackendAvailable === true;
				subagentRuntimeInstalled = value?.subagentRuntimeInstalled === true;
				fetchRoutingAvailable = value?.fetchRoutingAvailable === true;
				if (!modelRefreshStarted) {
					contextModels = Array.isArray(value?.contextModels) ? value.contextModels : [];
					availableModels = Array.isArray(value?.availableModels) ? value.availableModels : [];
					verbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : [];
					fastModels = Array.isArray(value?.fastModels) ? value.fastModels : void 0;
					ultrafastModels = Array.isArray(value?.ultrafastModels) ? value.ultrafastModels : [];
					ultraModels = Array.isArray(value?.ultraModels) ? value.ultraModels : [];
					catalogStatus = value?.catalogStatus;
				}
				fallback = {
					status: "ready",
					value: {
						[DISABLED_MODELS_FIELD]: normalizeDisabledModels(value?.[DISABLED_MODELS_FIELD]),
						[AUTO_QUOTA_RETRY_FIELD]: normalizeAutoQuotaRetry(value?.[AUTO_QUOTA_RETRY_FIELD]),
						connectionMode: value?.connectionMode === "websocket" ? "websocket" : "sse",
						reviewModel: value?.reviewModel === "official" ? "official" : "session",
						remoteControl: value?.remoteControl === "on" ? "on" : "off",
						composerPredictions: value?.composerPredictions === "on" ? "on" : "off",
						otherModels: value?.otherModels === "off" ? "off" : "on",
						otherModels: value?.otherModels === "off" ? "off" : "on",
						compactionMode: value?.compactionMode === "cloud" ? "cloud" : "dsh",
						reasoningCache: normalizeReasoningCache(value?.reasoningCache),
						[DEFAULT_REASONING_EFFORT_FIELD]: normalizeDefaultReasoningEffort(value?.[DEFAULT_REASONING_EFFORT_FIELD]),
						subagentBackend: value?.subagentBackend === "codex" ? "codex" : "dsh",
						...readCapabilitySettings(value),
						[QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(value?.[QUICK_QUOTA_MODE_FIELD], value?.[LEGACY_QUICK_QUOTA_FIELD]),
						[SEARCH_PROVIDER_FIELD]: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
						[FETCH_PROVIDER_FIELD]: normalizeFetchProvider(value?.[FETCH_PROVIDER_FIELD]),
						[SPEED_MODE_FIELD]: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
						[OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(value?.[OUTPUT_VERBOSITY_FIELD]),
						[INPUT_IMAGE_DETAIL_FIELD]: normalizeInputImageDetail(value?.[INPUT_IMAGE_DETAIL_FIELD]),
						[REASONING_SUMMARY_FIELD]: normalizeReasoningSummary(value?.[REASONING_SUMMARY_FIELD]),
						[VOICE_CALL_FIELD]: normalizeVoiceCall(value?.[VOICE_CALL_FIELD]),
						[VOICE_VOICE_FIELD]: normalizeVoiceVoice(value?.[VOICE_VOICE_FIELD]),
						[VOICE_LANGUAGE_FIELD]: normalizeVoiceLanguage(value?.[VOICE_LANGUAGE_FIELD]),
						[RETRY_POLICY_FIELD]: normalizeRetryPolicy(value?.[RETRY_POLICY_FIELD]),
						[CONNECTORS_FIELD]: normalizeConnectorMode(value?.[CONNECTORS_FIELD]),
						[STREAM_IDLE_TIMEOUT_MINUTES_FIELD]: normalizeStreamIdleTimeoutMinutes(value?.[STREAM_IDLE_TIMEOUT_MINUTES_FIELD]),
						[CONTEXT_MODE_FIELD]: normalizeContextMode(value?.[CONTEXT_MODE_FIELD]),
						[CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(value?.[CUSTOM_CONTEXT_WINDOW_FIELD]),
						...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(value?.[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])]))
					},
					writable: value?.writable === true
				};
			};
			const load = async () => {
				if (disposed) return;
				const current = ++generation;
				updating = false;
				pendingPatch = void 0;
				fallback = void 0;
				error = false;
				publish();
				if (disposed || current !== generation) return;
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/status", {}));
					if (current !== generation || disposed) return;
					acceptFallback(value);
					publish();
				} catch {
					if (current !== generation || disposed) return;
					publish();
				}
			};
			const refreshModels = async () => {
				if (disposed) return false;
				const current = ++modelRefreshGeneration;
				modelRefreshStarted = true;
				modelError = false;
				modelsLoading = true;
				publish();
				if (disposed || current !== modelRefreshGeneration) return false;
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/models", {}));
					if (disposed || current !== modelRefreshGeneration) return false;
					const nextContextModels = Array.isArray(value?.contextModels) ? value.contextModels : [];
					const nextAvailableModels = Array.isArray(value?.availableModels) ? value.availableModels : [];
					const nextVerbosityModels = Array.isArray(value?.verbosityModels) ? value.verbosityModels : [];
					const nextFastModels = Array.isArray(value?.fastModels) ? value.fastModels : void 0;
					const nextUltrafastModels = Array.isArray(value?.ultrafastModels) ? value.ultrafastModels : [];
					const nextUltraModels = Array.isArray(value?.ultraModels) ? value.ultraModels : [];
					catalogStatus = value?.catalogStatus;
					const changed = !sameModels(contextModels, nextContextModels) || !sameModels(availableModels, nextAvailableModels) || !sameModels(verbosityModels, nextVerbosityModels) || JSON.stringify(fastModels) !== JSON.stringify(nextFastModels) || JSON.stringify(ultrafastModels) !== JSON.stringify(nextUltrafastModels) || JSON.stringify(ultraModels) !== JSON.stringify(nextUltraModels);
					if (changed) {
						contextModels = nextContextModels;
						availableModels = nextAvailableModels;
						verbosityModels = nextVerbosityModels;
						fastModels = nextFastModels;
						ultrafastModels = nextUltrafastModels;
						ultraModels = nextUltraModels;
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
				updating = true;
				pendingPatch = patch;
				error = false;
				failedPatch = void 0;
				publish();
				if (disposed || current !== generation) return;
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/update", patch));
					if (current !== generation) return;
					acceptFallback(value);
					pendingPatch = void 0;
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
					if (disposed) return () => {};
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load,
				set,
				retry: () => failedPatch === void 0 ? load() : set(failedPatch),
				refreshModels,
				dispose: () => {
					if (disposed) return;
					disposed = true;
					generation += 1;
					modelRefreshGeneration += 1;
					listeners.clear();
				}
			};
		}
		//#endregion
		//#region src/default-model-controller.js
		const INITIAL = Object.freeze({
			status: "loading",
			available: false,
			resetAvailable: false,
			managed: false,
			provider: void 0,
			model: void 0,
			reasoningEffort: void 0,
			saving: false,
			error: false
		});
		const adopt = (value) => ({
			status: "ready",
			error: false,
			available: value?.available === true,
			resetAvailable: value?.resetAvailable === true,
			managed: value?.managed === true,
			provider: value?.provider,
			model: value?.model,
			reasoningEffort: value?.reasoningEffort
		});
		/**
		* Read and update the DSH default model behind one settings control. The Host
		* owns the value, so a load always replaces the local projection; a rejected
		* write keeps the last known value and only raises the error flag.
		*/
		function createDefaultModelController(rpc) {
			let snapshot = INITIAL;
			let disposed = false;
			let generation = 0;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				if (disposed) return;
				snapshot = Object.freeze({
					...snapshot,
					...next
				});
				for (const listener of [...listeners]) {
					if (disposed) break;
					listener();
				}
			};
			const load = async () => {
				if (disposed) return;
				const current = ++generation;
				try {
					const value = unwrap(await rpc.call(CHANNEL, "default-model/status", {}));
					if (disposed || current !== generation) return;
					publish(adopt(value));
				} catch {
					if (disposed || current !== generation) return;
					publish({
						status: "error",
						error: true
					});
				}
			};
			const save = async (endpoint, payload) => {
				if (disposed) return false;
				const current = ++generation;
				publish({
					saving: true,
					error: false
				});
				if (disposed || current !== generation) return false;
				try {
					const value = unwrap(await rpc.call(CHANNEL, endpoint, payload));
					if (disposed || current !== generation) return false;
					publish({
						...adopt(value),
						saving: false
					});
					return true;
				} catch {
					if (disposed || current !== generation) return false;
					publish({
						saving: false,
						error: true
					});
					return false;
				}
			};
			return Object.freeze({
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					if (disposed) return () => {};
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load,
				select: (model) => save("default-model/select", { model }),
				reset: () => save("default-model/reset", {}),
				dispose: () => {
					if (disposed) return;
					disposed = true;
					generation += 1;
					listeners.clear();
				}
			});
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
			const request = options.request ?? ((signal) => rpc.call("/codex-subscription", "status", {}, signal));
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
		//#region src/quota-pace.js
		/**
		* One reading of a runway forecast for every place that shows it (settings card, composer chip, composer details), so the
		* same snapshot always reads the same hours. Raw seconds are rounded to a grid coarser than the percentage quantisation
		* noise: 5 minutes under an hour, whole hours under 48 h, 6 hours above.
		*/
		function roundRunwaySeconds(seconds) {
			if (!Number.isFinite(seconds) || seconds <= 0) return seconds;
			const hours = seconds / 3600;
			if (hours < 1) return Math.max(300, Math.round(seconds / 300) * 300);
			if (hours < 48) return Math.max(1, Math.round(hours)) * 3600;
			return Math.round(hours / 6) * 6 * 3600;
		}
		/** @returns {{kind:'reset'}|{kind:'range',min:number,max:number}|{kind:'point',seconds:number}|undefined} rounded seconds. */
		function forecastRunway(forecast) {
			if (forecast?.status !== "ready") return void 0;
			if (forecast.survivesReset && !forecast.provisional) return { kind: "reset" };
			if (!forecast.provisional && Number.isFinite(forecast.runwayMinSeconds) && Number.isFinite(forecast.runwayMaxSeconds)) {
				const min = roundRunwaySeconds(forecast.runwayMinSeconds), max = roundRunwaySeconds(forecast.runwayMaxSeconds);
				if (min > 0 && max > min) return {
					kind: "range",
					min,
					max
				};
			}
			const seconds = roundRunwaySeconds(forecast.runwaySeconds);
			return Number.isFinite(seconds) && seconds > 0 ? {
				kind: "point",
				seconds
			} : void 0;
		}
		//#endregion
		//#region src/quota-forecast-view.js
		/** A time estimate is anchored to the reading, never advanced by opening another view later. */
		function quotaForecastView(forecast, { fetchedAt, now = Date.now(), resetsAt, remainingPercent, refreshError = false } = {}) {
			if (refreshError || Number.isFinite(fetchedAt) && (fetchedAt > now || now - fetchedAt > 5 * 6e4) || Number.isFinite(resetsAt) && resetsAt * 1e3 <= now) return { kind: "stale" };
			if (remainingPercent === 0) return { kind: "exhausted" };
			if (forecast?.status === "calibrating") return { kind: forecast.reason ?? "calibrating" };
			if (forecast?.status === "idle") return { kind: "idle" };
			if (!Number.isFinite(fetchedAt)) return { kind: "calibrating" };
			if (forecast?.status === "ready" && !forecast.provisional && Number.isFinite(forecast.runwayMinSeconds) && forecast.runwayMinSeconds > 0 && Number.isFinite(resetsAt) && fetchedAt + forecast.runwayMinSeconds * 1e3 >= resetsAt * 1e3) return { kind: "reset" };
			const rawMin = !forecast?.provisional && Number.isFinite(forecast?.runwayMinSeconds) ? forecast.runwayMinSeconds : forecast?.runwaySeconds;
			if (Number.isFinite(rawMin) && fetchedAt + rawMin * 1e3 <= now) return { kind: "stale" };
			const runway = forecastRunway({
				...forecast,
				survivesReset: false
			});
			if (!runway) return { kind: "calibrating" };
			const anchor = fetchedAt;
			const min = runway.kind === "range" ? runway.min : runway.seconds;
			const max = runway.kind === "range" ? runway.max : runway.seconds;
			if (anchor + min * 1e3 <= now) return { kind: "stale" };
			const grid = min < 3600 ? 5 * 6e4 : 36e5;
			const round = (value) => Math.round(value / grid) * grid;
			return {
				kind: "time",
				earliest: round(anchor + min * 1e3),
				latest: round(anchor + max * 1e3),
				provisional: forecast.provisional === true
			};
		}
		function formatQuotaRunout(view, { t, locale, now = Date.now(), timeZone }) {
			const clock = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
				timeZone,
				year: "numeric",
				month: "numeric",
				day: "numeric",
				hour: "numeric",
				hourCycle: "h23"
			});
			const local = (time) => {
				const fields = Object.fromEntries(clock.formatToParts(time).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
				return {
					day: Date.UTC(fields.year, fields.month - 1, fields.day),
					hour: fields.hour
				};
			};
			const today = local(now).day;
			const render = (key, values) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
			const when = (time) => {
				const date = local(time), gap = (date.day - today) / 864e5;
				const day = gap === 0 ? t("paceDay_today") : gap === 1 ? t("paceDay_tomorrow") : new Intl.DateTimeFormat(locale, gap > 1 && gap < 7 ? {
					timeZone,
					weekday: locale?.startsWith("zh") ? "short" : "long"
				} : {
					timeZone,
					month: "numeric",
					day: "numeric"
				}).format(time);
				const part = date.hour < 5 ? "early" : date.hour < 12 ? "morning" : date.hour < 18 ? "afternoon" : date.hour < 23 ? "evening" : "night";
				const partText = t(`pacePart_${part}`);
				const key = gap === 0 ? part === "early" ? "quotaWhenEarlyToday" : part === "night" ? "quotaWhenTonight" : "quotaWhenToday" : part === "early" ? "quotaWhenEarly" : "paceWhen";
				return {
					day: date.day,
					period: part,
					part: partText,
					label: render(key, {
						day,
						part: partText
					})
				};
			};
			if (view.kind !== "time") return void 0;
			const from = when(view.earliest), to = when(view.latest);
			if (from.label === to.label) return from.label;
			const end = from.day === to.day ? render("quotaWhenRangeEnd", {
				part: to.part,
				label: to.label
			}) : to.label;
			return render(from.day === to.day && from.period === "early" && to.period === "morning" ? "quotaWhenEarlyMorningRange" : "quotaWhenRange", {
				from: from.label,
				to: end,
				latest: to.label
			});
		}
		//#endregion
		//#region src/client-shared.js
		const NS = "settings.codexSubscription";
		const SUPPORT_ISSUE_URL = "https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml";
		const QUICK_QUOTA_REFRESH_EVENT = "dsh-codex-subscription:refresh-quick-quota";
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
		/** The language DSH shows its interface in, so dates and numbers match the text around them rather than the OS. */
		const uiLocale = () => typeof document === "undefined" ? void 0 : document.documentElement.lang || void 0;
		const percent = (value) => Number(value).toLocaleString(uiLocale(), { maximumFractionDigits: 1 });
		const creditAmount = (value) => Number.isFinite(Number(value)) && String(value).trim() !== "" ? Number(value).toLocaleString(uiLocale(), { maximumFractionDigits: 2 }) : value;
		const isApproximateWindow = (seconds, expected) => seconds >= expected * .95 && seconds <= expected * 1.05;
		const windowLabel = (seconds, t) => {
			if (isApproximateWindow(seconds, 18e3)) return t("windowFiveHours");
			if (isApproximateWindow(seconds, 86400)) return t("windowDaily");
			if (isApproximateWindow(seconds, 604800)) return t("windowWeekly");
			if (isApproximateWindow(seconds, 2592e3)) return t("windowMonthly");
			if (isApproximateWindow(seconds, 31536e3)) return t("windowAnnual");
			return seconds >= 86400 && seconds % 86400 === 0 ? fill(t("windowDays"), { value: seconds / 86400 }) : seconds >= 172800 ? fill(t("windowDays"), { value: Math.round(seconds / 8640) / 10 }) : fill(t("windowHours"), { value: hours(seconds) });
		};
		const validDate = (value) => {
			const date = new Date(value);
			return Number.isFinite(date.getTime()) ? date : void 0;
		};
		const usePreferenceSnapshot = (preference) => (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
		const useAccountStatusSnapshot = (accountStatus) => (0, react.useSyncExternalStore)(accountStatus.subscribe, accountStatus.getSnapshot);
		const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT));
		const formatQuotaForecast = (forecast, t, options = {}) => {
			const view = quotaForecastView(forecast, options);
			if (view.kind !== "time") return t({
				resolution: "forecastResolution",
				"changing-pace": "forecastChanging",
				stale: "forecastStale",
				idle: "quotaForecastIdle",
				reset: "quotaForecastUntilReset",
				exhausted: "quotaExhausted"
			}[view.kind] ?? "quotaForecastCalibrating");
			const when = formatQuotaRunout(view, {
				t,
				locale: options.locale ?? uiLocale(),
				now: options.now,
				timeZone: options.timeZone
			});
			return fill(t(view.provisional ? "quotaForecastRoughAt" : "quotaForecastAt"), { when });
		};
		//#endregion
		//#region src/sidebar-quota.js
		const isDisplayableWindow = (window) => Number.isFinite(window?.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100 && Number.isFinite(window?.windowSeconds) && window.windowSeconds > 0;
		const normalized = (value) => String(value ?? "").toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/gu, "-");
		const exactModelLimit = (limit, model) => {
			const id = normalized(model);
			return id.length > 0 && [limit?.id, limit?.name].some((value) => typeof value === "string" && normalized(value) === id);
		};
		const limitMatchesModel = (limit, model, hasExactLimit) => {
			if (hasExactLimit) return exactModelLimit(limit, model);
			if (normalized(model) === "gpt-reserve") return false;
			if (/\bspark\b/u.test(normalized(model))) return /\bspark\b/u.test(normalized(`${limit?.id ?? ""} ${limit?.name ?? ""}`));
			return limit?.id === "codex";
		};
		function selectModelQuotaWindows(usage, model) {
			const hasExactLimit = Array.isArray(usage?.rateLimits) && usage.rateLimits.some((limit) => exactModelLimit(limit, model));
			return (Array.isArray(usage?.rateLimits) ? usage.rateLimits.filter((limit) => limitMatchesModel(limit, model, hasExactLimit) && Array.isArray(limit.windows)).flatMap((limit) => limit.windows).filter(isDisplayableWindow) : []).map((selected) => ({
				remainingPercent: selected.remainingPercent,
				windowSeconds: selected.windowSeconds,
				...Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {},
				...selected.forecast === void 0 ? {} : { forecast: selected.forecast }
			})).sort((a, b) => a.windowSeconds - b.windowSeconds);
		}
		//#endregion
		//#region src/version.js
		const PACKAGE_VERSION = "3.2.1";
		//#endregion
		//#region src/client-recovery.js
		async function recoveryCall(rpc, endpoint, payload = {}, timeoutMs = 1e4) {
			let timer;
			const controller = new AbortController();
			try {
				return await Promise.race([Promise.resolve().then(() => rpc.call(CHANNEL, endpoint, payload, controller.signal)).then(unwrap), new Promise((_, reject) => {
					timer = setTimeout(() => {
						const error = Object.assign(/* @__PURE__ */ new Error("Request timed out"), { code: "timeout" });
						reject(error);
						controller.abort(error);
					}, timeoutMs);
				})]);
			} finally {
				clearTimeout(timer);
			}
		}
		function clientDiagnostic(error, now = Date.now()) {
			return {
				source: "client-fallback",
				pluginVersion: PACKAGE_VERSION,
				generatedAt: new Date(now).toISOString(),
				serverDiagnostics: "unavailable",
				error: classifyAccountStatusError(error)
			};
		}
		//#endregion
		//#region src/quota-cadence.js
		/** Milliseconds until the next quota read, from the highest used percentage of the windows that matter. */
		function quotaRefreshMs(percent) {
			if (!Number.isFinite(percent)) return 6e4;
			if (percent >= 99) return 5e3;
			if (percent >= 90) return 15e3;
			if (percent >= 75) return 3e4;
			return 6e4;
		}
		/** Highest used percentage among windows (objects with usedPercent), or undefined when there are none. */
		function highestUsed(windows) {
			const values = (Array.isArray(windows) ? windows : []).map((window) => window?.usedPercent).filter(Number.isFinite);
			return values.length === 0 ? void 0 : Math.max(...values);
		}
		//#endregion
		//#region src/usage-controller.js
		/** One live quota snapshot and polling loop for every mounted view. */
		function createUsageController({ request, now = Date.now, schedule = setTimeout, cancel = clearTimeout, listen, visible = () => true, onUpdate }) {
			let snapshot = Object.freeze({
				usage: void 0,
				busy: false,
				error: void 0,
				now: now()
			});
			let generation = 0, consumers = 0, flight, timer, unlisten;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				snapshot = Object.freeze(next);
				for (const listener of [...listeners]) listener();
			};
			const stopTimer = () => {
				if (timer !== void 0) cancel(timer);
				timer = void 0;
			};
			const queue = () => {
				stopTimer();
				if (consumers === 0 || !visible()) return;
				timer = schedule(() => {
					timer = void 0;
					refresh().catch(() => {});
				}, quotaRefreshMs(highestUsed(snapshot.usage?.rateLimits?.flatMap((limit) => limit.windows) ?? [])));
			};
			const refresh = (force = false) => {
				if (flight) {
					if (force && !flight.force) {
						const current = generation;
						return flight.promise.catch(() => {}).then(() => current === generation ? refresh(true) : void 0);
					}
					return flight.promise;
				}
				stopTimer();
				const current = generation;
				const operation = { force };
				operation.promise = Promise.resolve().then(() => current === generation ? request(force) : void 0).then((usage) => {
					if (current === generation) {
						publish({
							usage,
							busy: false,
							error: void 0,
							now: now()
						});
						onUpdate?.({ force });
					}
					return usage;
				}).catch((error) => {
					if (current === generation) publish({
						...snapshot,
						busy: false,
						error: error?.message ?? "Could not read quota",
						now: now()
					});
					throw error;
				}).finally(() => {
					if (flight === operation) {
						flight = void 0;
						queue();
					}
				});
				flight = operation;
				publish({
					...snapshot,
					busy: true,
					now: now()
				});
				return operation.promise;
			};
			const invalidate = ({ preserveUsage = false } = {}) => {
				generation += 1;
				flight = void 0;
				stopTimer();
				const usage = preserveUsage && snapshot.usage ? {
					...snapshot.usage,
					rateLimits: snapshot.usage.rateLimits.map((limit) => ({
						...limit,
						windows: limit.windows.map(({ forecast, ...window }) => window)
					}))
				} : void 0;
				publish({
					usage,
					busy: false,
					error: void 0,
					now: now()
				});
				if (consumers > 0 && visible()) refresh().catch(() => {});
			};
			return Object.freeze({
				getSnapshot: () => snapshot,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				refresh,
				invalidate,
				retain() {
					consumers += 1;
					if (consumers === 1) {
						unlisten = listen?.({
							invalidate,
							wake: () => {
								if (visible()) refresh().catch(() => {});
								else stopTimer();
							}
						});
						invalidate();
					}
					let released = false;
					return () => {
						if (released) return;
						released = true;
						consumers -= 1;
						if (consumers === 0) {
							generation += 1;
							flight = void 0;
							stopTimer();
							unlisten?.();
							unlisten = void 0;
							publish({
								usage: void 0,
								busy: false,
								error: void 0,
								now: now()
							});
						}
					};
				}
			});
		}
		//#endregion
		//#region src/client-quota.jsx
		const controllers = /* @__PURE__ */ new WeakMap();
		function quotaUsageController(rpc) {
			if (!controllers.has(rpc)) controllers.set(rpc, createUsageController({
				request: async (force) => {
					return (await recoveryCall(rpc, "status"))?.authenticated === true ? recoveryCall(rpc, "usage", { force }) : void 0;
				},
				visible: () => document.visibilityState !== "hidden",
				onUpdate: ({ force }) => {
					if (force) window.dispatchEvent(new Event("codex-subscription:usage-loaded"));
				},
				listen: ({ invalidate, wake }) => {
					window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, invalidate);
					document.addEventListener("visibilitychange", wake);
					return () => {
						window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, invalidate);
						document.removeEventListener("visibilitychange", wake);
					};
				}
			}));
			return controllers.get(rpc);
		}
		function useQuotaUsage(rpc, enabled) {
			const controller = quotaUsageController(rpc);
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
			(0, react.useEffect)(() => enabled ? controller.retain() : void 0, [controller, enabled]);
			return {
				...snapshot,
				refresh: controller.refresh
			};
		}
		function useQuickQuota(rpc, enabled, model) {
			const snapshot = useQuotaUsage(rpc, enabled);
			return enabled ? selectModelQuotaWindows(snapshot.usage, model).map((window) => ({
				...window,
				fetchedAt: snapshot.usage.fetchedAt,
				now: snapshot.now,
				refreshError: snapshot.error !== void 0
			})) : void 0;
		}
		//#endregion
		//#region src/client-composer-quota.jsx
		function CodexComposerQuota({ preference, rpc, t, directory }) {
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const current = (0, react.useSyncExternalStore)((listener) => directory.subscribe(listener), () => directory.getSnapshot()).current;
			const quotaEnabled = preferenceSnapshot.status === "ready" && preferenceSnapshot.quickQuotaMode !== "off" && current?.provider === "openai-codex";
			const quotas = useQuickQuota(rpc, quotaEnabled, current?.model);
			const [open, setOpen] = (0, react.useState)(false);
			const trigger = (0, react.useRef)(null);
			const panel = (0, react.useRef)(null);
			const pinned = (0, react.useRef)(false);
			const dismissTimer = (0, react.useRef)(null);
			const enter = () => {
				clearTimeout(dismissTimer.current);
				setOpen(true);
			};
			const leave = () => {
				clearTimeout(dismissTimer.current);
				if (!pinned.current) dismissTimer.current = setTimeout(() => setOpen(false), 150);
			};
			const dismiss = () => {
				clearTimeout(dismissTimer.current);
				pinned.current = false;
				setOpen(false);
			};
			(0, react.useEffect)(() => () => clearTimeout(dismissTimer.current), []);
			const id = (0, react.useId)();
			const visible = open && quotaEnabled && !!quotas?.length;
			const position = useAnchoredPosition({
				open: visible,
				anchorRef: trigger,
				panelRef: panel,
				side: "top",
				gap: 8,
				margin: 12
			});
			useDismissOnOutsidePointer(trigger, visible, dismiss, panel);
			(0, react.useEffect)(() => {
				dismiss();
			}, [current?.model, quotaEnabled]);
			(0, react.useEffect)(() => {
				if (!visible) return;
				const escape = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					dismiss();
					trigger.current?.focus();
				};
				document.addEventListener("keydown", escape);
				return () => document.removeEventListener("keydown", escape);
			}, [visible]);
			if (!quotaEnabled || !quotas?.length) return null;
			const shortQuota = quotas.find((quota) => Math.abs(quota.windowSeconds - 18e3) < 60);
			const compactQuotas = shortQuota ? [shortQuota] : quotas;
			const forecastMode = preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST;
			const warning = quotaWarning({
				fetchedAt: quotas[0]?.fetchedAt,
				rateLimits: [{
					id: "current",
					windows: quotas
				}]
			}, preferenceSnapshot.quotaAlerts, Date.now(), preferenceSnapshot);
			const label = quotas.map((quota) => `${windowLabel(quota.windowSeconds, t)}: ${fill(t("remaining"), { value: percent(quota.remainingPercent) })}`).join("; ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				ref: trigger,
				type: "button",
				className: "codexComposerQuota",
				"data-mode": preferenceSnapshot.quickQuotaMode,
				"data-warning": warning ? true : void 0,
				"aria-label": `${t("quotaDetails")}: ${label}${warning ? `; ${t("quotaThresholdReached")}` : ""}`,
				"aria-haspopup": "dialog",
				"aria-expanded": visible,
				"aria-controls": visible ? id : void 0,
				onMouseEnter: enter,
				onMouseLeave: leave,
				onClick: () => {
					clearTimeout(dismissTimer.current);
					if (pinned.current) dismiss();
					else {
						pinned.current = true;
						setOpen(true);
						requestAnimationFrame(() => panel.current?.focus());
					}
				},
				children: compactQuotas.map((quota, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexQuotaCompactWindow",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: shortWindow(quota.windowSeconds, t) }),
						preferenceSnapshot.quickQuotaMode === "bar" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							className: "codexComposerQuotaBar",
							max: 100,
							value: quota.remainingPercent,
							"aria-hidden": "true"
						}) : null,
						preferenceSnapshot.quickQuotaMode !== "bar" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: `${percent(quota.remainingPercent)}%` }) : null
					]
				}, `${quota.windowSeconds}-${index}`))
			}), visible ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				ref: panel,
				id,
				role: "dialog",
				"aria-label": t("quotaDetails"),
				className: "codexQuotaPopover",
				tabIndex: -1,
				onMouseEnter: enter,
				onMouseLeave: leave,
				style: {
					...position,
					visibility: position ? "visible" : "hidden"
				},
				children: quotas.map((quota, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexQuotaDetail",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: windowLabel(quota.windowSeconds, t) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fill(t("remaining"), { value: percent(quota.remainingPercent) }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexQuotaReset",
							children: shortReset(quota, t)
						})
					] }), forecastMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: formatQuotaForecast(quota.forecast, t, quota) }) : null]
				}, `${quota.windowSeconds}-${index}`))
			}), document.body) : null] });
		}
		function shortWindow(seconds, t) {
			if (Math.abs(seconds - 604800) < 60) return t("quotaShortWeek");
			if (Math.abs(seconds - 86400) < 60) return t("quotaShortDay");
			return seconds < 86400 ? `${Math.round(seconds / 360) / 10}h` : `${Math.round(seconds / 8640) / 10}d`;
		}
		function shortReset(quota, t) {
			if (!Number.isSafeInteger(quota.resetsAt)) return t("resetUnknown");
			const value = (/* @__PURE__ */ new Date(quota.resetsAt * 1e3)).toLocaleString(uiLocale(), {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
			return fill(t("resets"), { value });
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
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		function CodexModelSelect({ locked, available, directory, load, select, preference, t, renderSlot }) {
			const state = (0, react.useSyncExternalStore)(directory.subscribe, directory.getSnapshot);
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const [query, setQuery] = (0, react.useState)("");
			const rootRef = (0, react.useRef)(null);
			const menuRef = (0, react.useRef)(null);
			const [menuPos, setMenuPos] = (0, react.useState)(null);
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
			const visibleGroups = (0, react.useMemo)(() => {
				const hidden = new Set(preferenceSnapshot.disabledModels);
				return state.groups.map((group) => group.id === "openai-codex" ? {
					...group,
					models: group.models.filter((model) => !hidden.has(model.id)),
					allHidden: group.models.length > 0 && group.models.every((model) => hidden.has(model.id))
				} : group).filter((group) => group.models.length > 0 || group.allHidden === true);
			}, [state.groups, preferenceSnapshot.disabledModels]);
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
			const labelOf = (group, model, placement, selected) => {
				if (typeof renderSlot !== "function") return model.name;
				try {
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-provider-id": group.id,
						"data-model-id": model.id,
						children: renderSlot("conversation.input.model.label", {
							provider: {
								id: group.id,
								name: group.name
							},
							model,
							placement,
							selected
						}, { fallback: model.name })
					});
				} catch {
					return model.name;
				}
			};
			const searchable = visibleGroups.reduce((total, group) => total + group.models.length, 0) > 4;
			const needle = searchable ? query.trim().toLocaleLowerCase() : "";
			const shownGroups = needle === "" ? visibleGroups : visibleGroups.map((group) => ({
				...group,
				models: group.models.filter((model) => [
					model.name,
					model.id,
					model.description,
					group.name
				].some((text) => typeof text === "string" && text.toLocaleLowerCase().includes(needle)))
			})).filter((group) => group.models.length > 0);
			const speedSupported = state.current?.provider === "openai-codex" && (preferenceSnapshot.fastModels?.includes(state.current?.model) ?? supportsCodexFastMode(state.current?.model));
			const speedWritable = preferenceSnapshot.status === "ready" && preferenceSnapshot.writable === true;
			const ultrafastSupported = state.current?.provider === "openai-codex" && (preferenceSnapshot.ultrafastModels ?? []).includes(state.current?.model);
			const ultrafast = ultrafastSupported && preferenceSnapshot.speedMode === "ultrafast";
			const fast = ultrafast || speedSupported && preferenceSnapshot.speedMode === "fast";
			const speedKey = ultrafast ? "speedUltrafast" : fast ? "speedFast" : "speedStandard";
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
					if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
						setOpen(false);
						setPane("root");
						setQuery("");
					}
				};
				document.addEventListener("mousedown", closeOutside);
				return () => document.removeEventListener("mousedown", closeOutside);
			}, [open]);
			(0, react.useLayoutEffect)(() => {
				if (!open) {
					setMenuPos(null);
					return;
				}
				const place = () => {
					const rect = triggerRef.current?.getBoundingClientRect();
					if (rect === void 0) return;
					const margin = 12;
					const width = menuRef.current?.offsetWidth ?? 0;
					const height = menuRef.current?.offsetHeight ?? 0;
					let left = rect.right - width;
					let top = rect.top - 8 - height;
					if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
					if (height > 0) top = Math.min(Math.max(top, margin), window.innerHeight - height - margin);
					setMenuPos({
						left,
						top
					});
				};
				place();
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				return () => {
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
				};
			}, [
				open,
				pane,
				state,
				query
			]);
			(0, react.useEffect)(() => {
				if (pane !== "model") setQuery("");
			}, [pane]);
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
				setQuery("");
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
					children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCheckOutline16, {}) : null
				})]
			}, key);
			const cell = (target, label, value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitem",
				className: "codexModelSelectCell",
				onClick: () => {
					setQuery("");
					setPane(target);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectCellLabel",
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectCellValue",
						children: value
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronRightOutline14, { className: "codexModelSelectCellChevron" })
				]
			});
			const group = (key, label, children) => MenuGroup === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				role: "group",
				"aria-label": label,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexModelSelectGroupTitle",
					children: label
				}), children]
			}, key) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuGroup, {
				label,
				children
			}, key);
			let content = null;
			if (pane === "root") content = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				cell("model", t("modelLabel"), currentChoice === void 0 ? modelLabel : labelOf(currentChoice.group, currentChoice.model, "menu", true)),
				reasoning === void 0 ? null : cell("effort", t("effortLabel"), effortLabel),
				(speedSupported || ultrafastSupported) && cell("speed", t("speedTitle"), t(speedKey)),
				verbositySupported && cell("verbosity", t("verbosityTitle"), verbosityLabel)
			] });
			else if (pane === "model") content = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				searchable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexModelSelectSearchRow",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
						className: "codexModelSelectSearch",
						type: "text",
						role: "searchbox",
						value: query,
						autoFocus: true,
						placeholder: t("modelSearch"),
						"aria-label": t("modelSearch"),
						onChange: (event) => setQuery(event.target.value)
					})
				}) : null,
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
					role: "menu",
					"aria-label": t("modelLabel"),
					children: shownGroups.map((entry) => group(entry.id, entry.name, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [entry.allHidden === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectEmpty",
						children: t("modelsHidden")
					}) : null, entry.models.map((model) => option({
						key: model.id,
						label: labelOf(entry, model, "option", state.current?.provider === entry.id && state.current.model === model.id),
						selected: state.current?.provider === entry.id && state.current.model === model.id,
						disabled: busy,
						onClick: () => chooseModel({
							provider: entry.id,
							model: model.id
						})
					}))] })))
				}),
				state.status === "ready" && visibleGroups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexModelSelectEmpty",
					children: t(choices.length === 0 ? "modelsEmpty" : "modelsHidden")
				}) : null,
				state.status === "ready" && visibleGroups.length > 0 && shownGroups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexModelSelectEmpty",
					children: t("modelNoMatch")
				}) : null
			] });
			else if (pane === "effort") content = effortChoices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexModelSelectEmpty",
				children: t("effortsEmpty")
			}) : effortChoices.map((level) => option({
				key: level.key,
				label: level.label,
				description: level.description,
				selected: effectiveEffort === level.effort,
				disabled: busy,
				onClick: () => chooseEffort(level.effort)
			}));
			else if (pane === "speed") content = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				option({
					key: SPEED_MODE_STANDARD,
					label: t("speedStandard"),
					description: t("speedStandardHint"),
					selected: !fast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed(SPEED_MODE_STANDARD)
				}),
				speedSupported && option({
					key: "fast",
					label: t("speedFast"),
					description: t(state.current?.model === "gpt-6-astra" ? "speedFastAstraHint" : "speedFastHint"),
					selected: fast && !ultrafast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed("fast")
				}),
				ultrafastSupported && option({
					key: "ultrafast",
					label: t("speedUltrafast"),
					description: t("speedUltrafastHint"),
					selected: ultrafast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed("ultrafast")
				})
			] });
			else if (pane === "verbosity") content = verbosityItems.map((item) => option({
				key: item.id,
				label: item.label,
				description: item.description,
				selected: preferenceSnapshot.outputVerbosity === item.id,
				disabled: !verbosityWritable,
				onClick: () => chooseVerbosity(item.id)
			}));
			const menu = open ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuSurface ?? "div", {
				ref: menuRef,
				id: `${id}-menu`,
				className: "codexModelSelectMenu",
				style: menuPos ?? MEASURE_STYLE,
				role: pane === "model" ? "group" : "menu",
				"aria-label": t("modelMenuAria"),
				"aria-busy": state.status === "loading" || busy,
				onKeyDown: (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					if (pane === "root") close(true);
					else setPane("root");
				},
				children: content
			}), document.body) : null;
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
							children: currentChoice === void 0 ? modelLabel : labelOf(currentChoice.group, currentChoice.model, "trigger", true)
						}),
						effortLabel === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexModelSelectEffort",
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, { className: "codexModelSelectChevron" })
					]
				}), menu]
			});
		}
		//#endregion
		//#region src/client-hint.jsx
		/** Keep the setting's own label as the help target; reuse host hover, focus and touch behaviour. */
		function SettingsLabel({ children, description, as: Tag = "span", className = "codexSubscriptionPreferenceLabel", openOnClick = true, ...props }) {
			const hasHelp = typeof description === "string" && description.trim() !== "";
			const label = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
				...props,
				className: className || void 0,
				tabIndex: hasHelp ? 0 : void 0,
				title: hasHelp && !Tooltip ? description : void 0,
				"aria-description": hasHelp && !Tooltip ? description : void 0,
				children
			});
			return hasHelp && Tooltip ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tooltip, {
				label: description,
				side: "bottom",
				portal: true,
				maxWidth: 360,
				openOnClick,
				children: label
			}) : label;
		}
		/** Live status, blocked reasons and confirmations remain readable without opening help. */
		function Hint({ children, as: Tag = "span" }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tag, {
				className: "codexSubscriptionPreferenceHint",
				children
			});
		}
		//#endregion
		//#region src/voice-barge-in.js
		/** Mute playback promptly, and restore it only after interrupted audio has drained. */
		function createBargeInGate({ interrupt, changed, speechMs = 120, silenceMs = 400, outputTailMs = 0 }) {
			let speakingAt, quietAt, outputQuietAt, suppressed = false, drained = false;
			let outputActiveAt;
			return { sample({ mic, output, now }) {
				if (mic > .12) {
					speakingAt ??= now;
					quietAt = void 0;
				} else {
					speakingAt = void 0;
					quietAt ??= now;
				}
				if (output < .025) outputQuietAt ??= now;
				else outputQuietAt = void 0;
				if (output > .025) outputActiveAt = now;
				const recentOutput = outputTailMs > 0 && outputActiveAt !== void 0 && now - outputActiveAt <= outputTailMs;
				if (!suppressed && speakingAt !== void 0 && now - speakingAt >= speechMs && (output > .025 || recentOutput)) {
					suppressed = true;
					drained = false;
					changed(true);
					interrupt();
				}
				if (suppressed && outputQuietAt !== void 0 && now - outputQuietAt >= 250) drained = true;
				if (suppressed && drained && quietAt !== void 0 && now - quietAt >= silenceMs) {
					suppressed = false;
					speakingAt = void 0;
					changed(false);
				}
			} };
		}
		//#endregion
		//#region src/voice-problems.js
		/** Stable user-facing categories; never render private server error strings. */
		function voicePreviewProblem(code) {
			return {
				"not-found": "voiceNoSample",
				"voice-auth": "voicePreviewSignIn",
				"voice-catalog": "voiceCatalogFailed",
				"voice-download": "voiceDownloadFailed",
				playback: "voicePlaybackFailed"
			}[code] ?? "voicePreviewFailed";
		}
		function voiceCallProblem(error) {
			if (error?.name === "NotAllowedError") return "voiceMicBlocked";
			if (error?.name === "NotFoundError") return "voiceMicMissing";
			return {
				"voice-insecure": "voiceInsecure",
				"voice-no-microphone": "voiceMicUnavailable",
				"voice-no-webrtc": "voiceWebRTCUnavailable",
				"voice-native-unavailable": "voiceWebRTCUnavailable"
			}[error?.code] ?? "voiceFailed";
		}
		function voiceCallCapability(surface = globalThis) {
			if (surface.isSecureContext === false) return "voice-insecure";
			if (typeof surface.navigator?.mediaDevices?.getUserMedia !== "function") return "voice-no-microphone";
			if (surface.__dshWebRtcFallback && Object.getOwnPropertyDescriptor(surface, "RTCPeerConnection")?.get) return "voice-no-webrtc";
			if (typeof surface.RTCPeerConnection !== "function") return "voice-no-webrtc";
		}
		//#endregion
		//#region src/voice-call.js
		const ICE_WAIT_MS = 3e3;
		const waitForCandidates = (connection) => new Promise((resolve) => {
			if (connection.iceGatheringState === "complete") {
				resolve();
				return;
			}
			const done = () => {
				clearTimeout(timer);
				connection.removeEventListener("icegatheringstatechange", check);
				resolve();
			};
			const check = () => {
				if (connection.iceGatheringState === "complete") done();
			};
			const timer = setTimeout(done, ICE_WAIT_MS);
			connection.addEventListener("icegatheringstatechange", check);
		});
		/** Two short soft tones: rising when a call starts, falling when it ends. */
		const chime = (context, frequencies) => {
			try {
				const now = context.currentTime;
				frequencies.forEach((frequency, index) => {
					const tone = context.createOscillator();
					const gain = context.createGain();
					const start = now + index * .11;
					tone.type = "sine";
					tone.frequency.value = frequency;
					gain.gain.setValueAtTime(0, start);
					gain.gain.linearRampToValueAtTime(.07, start + .02);
					gain.gain.exponentialRampToValueAtTime(1e-4, start + .16);
					tone.connect(gain).connect(context.destination);
					tone.start(start);
					tone.stop(start + .18);
				});
			} catch {}
		};
		/** Loudness of an analyser as 0..1 (the root mean square of the waveform, lifted so quiet speech still moves the orb). */
		const loudness = (analyser, buffer) => {
			if (!analyser) return 0;
			analyser.getByteTimeDomainData(buffer);
			let sum = 0;
			for (const value of buffer) {
				const centred = (value - 128) / 128;
				sum += centred * centred;
			}
			return Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
		};
		/**
		* A voice call from this window: the microphone and the model's voice travel over WebRTC straight to OpenAI; the
		* plugin's host turns the offer into a call, joins it, and runs what is asked as turns of this conversation.
		* Resolves with a handle once the call is connected; rejects with the reason when it could not start.
		*/
		async function openVoiceCall({ rpc, sessionId, onEnd, signal }) {
			signal?.throwIfAborted();
			const unsupported = voiceCallCapability();
			if (unsupported) throw Object.assign(/* @__PURE__ */ new Error("Voice is not supported in this environment"), { code: unsupported });
			let connection;
			try {
				connection = new RTCPeerConnection();
			} catch {
				throw Object.assign(/* @__PURE__ */ new Error("WebRTC could not initialize"), { code: "voice-no-webrtc" });
			}
			let stream, sound, context;
			try {
				stream = await navigator.mediaDevices.getUserMedia({ audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				} });
				signal?.throwIfAborted();
				sound = new Audio();
				sound.autoplay = true;
				const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
				context = AudioContextClass ? new AudioContextClass() : void 0;
			} catch (error) {
				stream?.getTracks().forEach((track) => track.stop());
				connection.close();
				throw error;
			}
			const analysers = {
				mic: void 0,
				assistant: void 0
			};
			const watch = (name, source) => {
				if (!context) return;
				try {
					const analyser = context.createAnalyser();
					analyser.fftSize = 512;
					context.createMediaStreamSource(source).connect(analyser);
					analysers[name] = analyser;
				} catch {}
			};
			watch("mic", stream);
			connection.ontrack = (event) => {
				sound.srcObject = event.streams[0];
				watch("assistant", event.streams[0]);
			};
			for (const track of stream.getTracks()) connection.addTrack(track, stream);
			connection.createDataChannel("oai-events");
			let ended = false;
			let monitor;
			const end = async () => {
				if (ended) return;
				ended = true;
				signal?.removeEventListener("abort", aborted);
				clearInterval(monitor);
				if (context) chime(context, [740, 520]);
				for (const track of stream.getTracks()) track.stop();
				sound.srcObject = null;
				try {
					connection.close();
				} catch {}
				try {
					await rpc.call(CHANNEL, "voice/stop", { sessionId });
				} catch {}
				setTimeout(() => {
					context?.close().catch(() => {});
				}, 600);
				onEnd?.();
			};
			const aborted = () => {
				end();
			};
			signal?.addEventListener("abort", aborted, { once: true });
			connection.addEventListener("connectionstatechange", () => {
				if ([
					"failed",
					"disconnected",
					"closed"
				].includes(connection.connectionState)) end();
			});
			try {
				await context?.resume();
				await connection.setLocalDescription(await connection.createOffer());
				await waitForCandidates(connection);
				const result = await rpc.call(CHANNEL, "voice/start", {
					sessionId,
					sdp: connection.localDescription.sdp
				}, signal);
				signal?.throwIfAborted();
				if (!result.ok) throw new Error(result.error?.message ?? "start failed");
				await connection.setRemoteDescription({
					type: "answer",
					sdp: result.value.answer
				});
			} catch (error) {
				ended = true;
				signal?.removeEventListener("abort", aborted);
				for (const track of stream.getTracks()) track.stop();
				try {
					connection.close();
				} catch {}
				context?.close().catch(() => {});
				throw error;
			}
			if (context) chime(context, [520, 740]);
			const buffers = {
				mic: /* @__PURE__ */ new Uint8Array(512),
				assistant: /* @__PURE__ */ new Uint8Array(512)
			};
			let muted = false;
			let outputMuted = false;
			let interrupted = false;
			const gate = createBargeInGate({
				changed: (value) => {
					interrupted = value;
					sound.muted = outputMuted || interrupted;
				},
				interrupt: () => {
					rpc.call(CHANNEL, "voice/interrupt", { sessionId }).catch(() => {});
				}
			});
			if (context) monitor = setInterval(() => gate.sample({
				mic: muted ? 0 : loudness(analysers.mic, buffers.mic),
				output: loudness(analysers.assistant, buffers.assistant),
				now: performance.now()
			}), 30);
			return {
				stop: end,
				isMuted: () => muted,
				setMuted: (value) => {
					muted = value;
					for (const track of stream.getAudioTracks()) track.enabled = !value;
				},
				isOutputMuted: () => outputMuted,
				setOutputMuted: (value) => {
					outputMuted = value;
					sound.muted = outputMuted || interrupted;
				},
				/** How loud the person (mic) and the model (voice) are right now, 0..1 each. */
				levels: () => ({
					mic: muted ? 0 : loudness(analysers.mic, buffers.mic),
					assistant: loudness(analysers.assistant, buffers.assistant)
				})
			};
		}
		//#endregion
		//#region src/voice-native-call.js
		/** Native devices belong to this computer, never to a remote browser client. */
		function nativeVoiceEligible(surface = globalThis) {
			const agent = surface.navigator?.userAgent ?? "";
			const linuxWebKit = /Linux/u.test(agent) && /AppleWebKit/u.test(agent) && !/Chrome|Chromium|Edg\//u.test(agent);
			return surface.isSecureContext !== false && Boolean(surface.dshDesktop?.protocolVersion === 1 || surface.__TAURI_INTERNALS__ || surface.__dshWebRtcFallback || linuxWebKit) && [
				"localhost",
				"127.0.0.1",
				"[::1]"
			].includes(surface.location?.hostname);
		}
		/** The native backend owns media; this handle carries only controls and levels. */
		async function openNativeVoiceCall({ rpc, sessionId, onEnd, signal, captureAllowed }) {
			signal?.throwIfAborted();
			if (captureAllowed !== true) throw Object.assign(/* @__PURE__ */ new Error("Microphone permission is required"), { name: "NotAllowedError" });
			const result = await rpc.call(CHANNEL, "voice/native/start", {
				sessionId,
				captureAllowed: true
			}, signal);
			if (!result?.ok) throw Object.assign(/* @__PURE__ */ new Error("Native voice could not start"), { code: result?.error?.code });
			const leaseToken = result.value?.leaseToken;
			if (typeof leaseToken !== "string" || leaseToken.length < 16) throw new Error("Invalid native voice response");
			const owner = {
				sessionId,
				leaseToken
			};
			let ended = false, timer, micMuted = false, outputMuted = false;
			let levels = {
				mic: 0,
				assistant: 0
			};
			const end = async () => {
				if (ended) return;
				ended = true;
				clearTimeout(timer);
				signal?.removeEventListener("abort", aborted);
				levels = {
					mic: 0,
					assistant: 0
				};
				try {
					await rpc.call(CHANNEL, "voice/native/stop", owner);
				} catch {}
				onEnd?.();
			};
			const aborted = () => {
				end();
			};
			signal?.addEventListener("abort", aborted, { once: true });
			if (signal?.aborted) {
				await end();
				signal.throwIfAborted();
			}
			const poll = async () => {
				if (ended) return;
				try {
					const reply = await rpc.call(CHANNEL, "voice/native/status", owner);
					if (ended) return;
					if (!reply?.ok || reply.value?.active !== true) {
						await end();
						return;
					}
					const value = reply.value.levels ?? {};
					levels = {
						mic: Number.isFinite(value.mic) ? Math.max(0, Math.min(1, value.mic)) : 0,
						assistant: Number.isFinite(value.assistant) ? Math.max(0, Math.min(1, value.assistant)) : 0
					};
				} catch {
					await end();
					return;
				}
				if (!ended) timer = setTimeout(poll, 300);
			};
			poll();
			const control = (action, muted) => {
				if (ended) return;
				rpc.call(CHANNEL, "voice/native/control", {
					...owner,
					action,
					muted
				}).then((reply) => {
					if (!reply?.ok) end();
				}).catch(() => {
					end();
				});
			};
			return {
				stop: end,
				levels: () => ({
					mic: micMuted ? 0 : levels.mic,
					assistant: outputMuted ? 0 : levels.assistant
				}),
				isMuted: () => micMuted,
				setMuted: (value) => {
					micMuted = Boolean(value);
					control("mute", micMuted);
				},
				isOutputMuted: () => outputMuted,
				setOutputMuted: (value) => {
					outputMuted = Boolean(value);
					control("outputMute", outputMuted);
				}
			};
		}
		//#endregion
		//#region src/voice-browser.js
		const PARAM = "codexVoiceSession";
		const validSession = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u.test(value);
		/** A permalink, never an authentication URL or a native-shell URL. */
		function voiceBrowserUrl(href, sessionId) {
			if (!validSession(sessionId)) return void 0;
			try {
				const url = new URL(href);
				if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return void 0;
				url.search = "";
				url.hash = "";
				url.searchParams.set(PARAM, sessionId);
				return url.href;
			} catch {
				return;
			}
		}
		/** Let the host open its own session; consume only after that operation succeeds. */
		async function restoreVoiceConversation({ href, workspace, history, sessions, signal }) {
			const url = new URL(href);
			const sessionId = url.searchParams.get(PARAM);
			if (!validSession(sessionId) || typeof workspace?.openSession !== "function") return false;
			const reference = sessions?.retain(sessionId, { source: "controllerOperation" });
			try {
				if (reference) await reference.ready;
				signal?.throwIfAborted();
				await workspace.openSession(sessionId);
				url.searchParams.delete(PARAM);
				history.replaceState(history.state, "", url.href);
				return true;
			} finally {
				reference?.release();
			}
		}
		//#endregion
		//#region src/voice-orb.js
		const VERTEX = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
		const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uWaveFrame;
uniform float uBaseFrame;
uniform float uAmp;
uniform float uFlowFrame;
uniform float uEdge;
uniform float uNoiseScale;
uniform float uSurface;
uniform float uMic;
uniform float uUser;
uniform float uFlat;
uniform vec2 uOff0;
uniform vec2 uOff1;
uniform vec2 uOff2;
uniform vec3 uAccent;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 hash2(vec2 p){return vec2(hash(p),hash(p+vec2(19.19,73.73)));}
float vnoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p,float rough,float lac){
  float a=vnoise(p);
  float b=vnoise(p*lac+vec2(17.17,31.31));
  float c=vnoise(p*lac*lac+vec2(47.47,11.11));
  return (a+b*rough+c*rough*rough)/(1.+rough+rough*rough);
}
vec3 noise3(vec3 coord,float w,float scale,float rough,float lac,float unit){
  vec2 p=coord.xy*scale;
  float t=w*scale;
  vec2 d1=vec2(.17,.11),d2=vec2(-.13,.19),d3=vec2(.07,-.23);
  if(unit>.5){d1=normalize(d1);d2=normalize(d2);d3=normalize(d3);}
  return vec3(fbm(p+d1*t,rough,lac),fbm(p+vec2(41.41,17.17)+d2*t,rough,lac),fbm(p+vec2(23.23,59.59)+d3*t,rough,lac));
}

// the painted-paper texture: soft pale ground, darker stains with ragged edges, a fine fibre. Reads like grey watercolour.
float paint(vec2 uv){
  vec2 w=vec2(vnoise(uv*3.+vec2(4.2,1.7)),vnoise(uv*3.+vec2(9.1,6.3)))-.5;
  vec2 q=uv+w*.3;
  float body=vnoise(q*2.+vec2(3.1,8.3))*.5+vnoise(q*4.3+vec2(9.7,1.9))*.3+vnoise(q*9.+vec2(2.3,5.5))*.2;
  float stain=smoothstep(.5,.64,body);
  float wash=smoothstep(.28,.6,vnoise(q*2.6+vec2(14.2,4.4)));
  float mott=vnoise(q*vec2(18.,16.)+vec2(5.,5.))*.55+vnoise(q*vec2(42.,36.))*.45;
  float ragged=stain*(1.-stain)*4.;
  float v=.92-.2*wash-.5*stain+(mott-.5)*(.1+.2*ragged);
  return clamp(v,.16,1.);
}

vec3 warp3(vec3 c,float frame){
  vec2 pt=c.xy*8.;
  vec2 cell=floor(pt),local=fract(pt);
  vec2 nearest=vec2(0.);
  float best=3.4e38;
  float phase=frame*6.2831853/240.;
  for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){
    vec2 off=vec2(float(x),float(y));
    vec2 r=hash2(cell+off);
    vec2 pos=off+r*.7185189723968506+sin(vec2(phase)+r*6.2831853)*.04;
    vec2 d=pos-local;
    float dd=dot(d,d);
    if(dd<best){best=dd;nearest=pos;}
  }}
  vec3 vor=vec3((nearest+cell)/8.,c.z);
  return (c-vec3(.5))*.26+(vor-c)*.06;
}

vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
float fac(vec3 v,float lift){vec3 r=rotY(v,.7853981852531433)+vec3(0.,lift,0.);return (r.x+r.y+r.z)/3.;}
// 1 below a, easing to 0 at b
float ramp(float f,float a,float b){float t=clamp((f-a)/max(b-a,1e-6),0.,1.);t=t*t*(3.-2.*t);return 1.-t;}

vec3 interior(vec3 gen){
  vec3 a=uAccent;
  vec3 soft=mix(((16.*a-12.)*a+4.)*a,sqrt(a),step(.25,a));
  vec3 cShadow=max(vec3(0.),a+.9465623-1.);
  vec3 cMidLow=a+(2.*.89882153-1.)*(soft-a);
  vec3 cMidHigh=vec3(1.);
  vec3 cHigh=1.-(1.-a)*(1.-.63704175);

  vec3 m=gen+vec3(0.,-.14,0.);
  vec2 cen=gen.xy-.5;
  float rad=length(cen);
  m.xy+=(rad>1e-6?cen/rad:vec2(0.))*smoothstep(.015,.44,rad)*uEdge;
  vec3 wave=noise3(m,uWaveFrame/100.,1.,.4,2.,1.);
  vec3 m2=m+(wave-.5)*(.8*uAmp);
  vec3 grain=noise3(m2,uFlowFrame/10.,4000.,.5,2.,0.);
  vec3 g2=(grain-.5)*uNoiseScale*.06;
  vec3 base=m2*.8+g2;
  float blend=clamp(.5-.5*cos(uBaseFrame*6.2831853/120.),0.,1.);
  vec3 cw=warp3(m2,uBaseFrame);

  // tone 3: highlight
  vec2 p0=base.xy+uOff0;
  vec2 f0=vec2(base.x,1.-base.y)+uOff0;
  float s0=mix(paint(p0)-.5,paint(f0)-.5,blend)*(.2-.06*cos((uBaseFrame-1.)*6.2831853/120.));
  vec3 v6=m2+vec3(s0,s0,0.)+cw;
  float rHigh=ramp(fac(v6,.56),.3431819975376129,.6200000047683716);

  // tone 2: white
  vec3 b1=m2*.8+vec3(.04,.02,0.)+g2;
  vec3 b2=m2*.8+vec3(-.04,-.02,0.)+g2;
  float s1=mix(paint(b1.xy+uOff1)-.5,paint(vec2(b2.x,1.-b2.y)+uOff1)-.5,blend)*(.2-.06*cos((uBaseFrame-1.)*6.2831853/80.));
  vec3 v5=m2+vec3(s1,s1,0.)+cw;
  float rMidHigh=ramp(fac(v5,.26),.4113636016845703,.5586364269256592);

  // tone 1: mid-low, with the left-to-right fade the original uses
  float gx=clamp(gen.y-.32,0.,1.);
  float gradient=gx*gx*(3.-2.*gx);
  vec3 c1=m2*.8+vec3(-.08,-.04,0.)+g2;
  vec3 c2=m2*.8+vec3(-.96,.06,0.)+g2;
  float t1=mix(paint(c1.xy+uOff2),1.,gradient)-.5;
  float t2=mix(paint(vec2(c2.x,1.-c2.y)+uOff2),1.,gradient)-.5;
  float s2=mix(t1,t2,blend)*(.14-.06*cos((uBaseFrame-1.)*6.2831853/100.));
  vec3 v9=m2+vec3(s2,s2,0.)+cw;
  float rMidLow=ramp(fac(v9,.12),.3522728383541107,.7400000095367432);

  vec3 col=cShadow;
  col=mix(col,cMidLow,rMidLow);
  col=mix(col,cMidHigh,rMidHigh);
  col=mix(col,cHigh,rHigh);
  return col;
}

void main(){
  if(uFlat>.5){gl_FragColor=vec4(interior(vec3(gl_FragCoord.xy/uRes,.5)),1.);return;}
  vec2 frame=(gl_FragCoord.xy/uRes)*2.-1.;
  float user=clamp(uUser,0.,1.);
  float voice=max(1.-user*.14+user*clamp(uMic,0.,1.)*.08,.75);
  float scale=voice*uSurface;
  vec2 sdf=frame/scale;
  float dist=length(sdf)-1.;
  float px=2./uRes.x/scale;
  float shape=1.-smoothstep(-px,px,dist+px*.5);
  if(shape<=0.){gl_FragColor=vec4(0.);return;}
  vec3 col=interior(vec3(sdf*.5+.5,.5));
  gl_FragColor=vec4(col*shape,shape);
}`;
		const parseColor = (text) => {
			const match = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/u.exec(String(text));
			return match ? [
				Number(match[1]) / 255,
				Number(match[2]) / 255,
				Number(match[3]) / 255
			] : [
				.25,
				.46,
				.9
			];
		};
		const clamp = (value, low = 0, high = 1) => Math.min(Math.max(value, low), high);
		const smooth = (low, high, value) => {
			const t = clamp((value - low) / (high - low));
			return t * t * (3 - 2 * t);
		};
		const ease = (current, target, dt, attack, release) => current + (target - current) * (1 - Math.exp(-dt / (target > current ? attack : release)));
		const spring = (value, velocity, target, dt, frequency, damping) => {
			const omega = 2 * Math.PI * frequency;
			const steps = Math.max(1, Math.ceil(dt * 120));
			const h = dt / steps;
			let v = value;
			let w = velocity;
			for (let i = 0; i < steps; i += 1) {
				w += ((target - v) * omega * omega - w * 2 * damping * omega) * h;
				v += w * h;
			}
			return {
				value: v,
				velocity: w
			};
		};
		const TUNE = {
			fps: 24,
			startFrame: 350,
			surface: .34,
			fit: 1.4,
			speakSpeedScale: .56,
			speakSpeedBase: 1.8,
			speakSlowEnergy: 4.6,
			speakAmp: 1.5,
			minWaveSpeed: .72,
			edgeDistance: .102,
			edgeFrequency: 7,
			edgeDamping: .36,
			listenNoise: 2.2,
			flowScale: .96,
			driftScale: .1,
			windScale: .3,
			windSpeed: .65
		};
		const WIND = [
			.72,
			1,
			1.28
		];
		/** Returns a renderer for the canvas, or undefined when this browser cannot draw it. */
		function createOrb(canvas, accent, options = {}) {
			const gl = canvas.getContext("webgl", {
				alpha: true,
				premultipliedAlpha: true,
				antialias: false
			});
			if (!gl) return void 0;
			const compile = (type, source) => {
				const shader = gl.createShader(type);
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "shader");
				return shader;
			};
			let program;
			try {
				program = gl.createProgram();
				gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
				gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
				gl.linkProgram(program);
				if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
			} catch (error) {
				options.onError?.(error);
				return;
			}
			gl.useProgram(program);
			const buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
				-1,
				-1,
				1,
				-1,
				-1,
				1,
				1,
				1
			]), gl.STATIC_DRAW);
			const position = gl.getAttribLocation(program, "a");
			gl.enableVertexAttribArray(position);
			gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
			const at = (name) => gl.getUniformLocation(program, name);
			const u = {};
			for (const name of [
				"uRes",
				"uWaveFrame",
				"uBaseFrame",
				"uAmp",
				"uFlowFrame",
				"uEdge",
				"uNoiseScale",
				"uSurface",
				"uMic",
				"uUser",
				"uFlat",
				"uOff0",
				"uOff1",
				"uOff2",
				"uAccent"
			]) u[name] = at(name);
			const color = parseColor(accent);
			const flat = options.flat ? Number(options.flat) : 0;
			const s = {
				last: void 0,
				base: TUNE.startFrame,
				wave: TUNE.startFrame,
				flow: TUNE.startFrame,
				listen: 1,
				speak: 0,
				think: 0,
				level: 0,
				motion: 0,
				prevOverall: 0,
				accent: 0,
				cumulative: [
					0,
					0,
					0
				],
				drive: 0,
				boost: 0,
				boostV: 0,
				amp: 1,
				edge: 0,
				edgeV: 0,
				flowBoost: 0,
				colour: [
					0,
					0,
					0
				],
				phase: [
					0,
					2.1,
					4.2
				],
				user: 0,
				userOn: false,
				userFrom: 0,
				userAt: 0
			};
			return {
				/** Draw one frame. `now` in seconds; `input` = { mic, assistant, working, reduce } with levels 0..1. */
				draw(now, input) {
					const dt = s.last === void 0 ? .016 : clamp(now - s.last, 0, .1);
					s.last = now;
					const assistant = clamp(input.assistant ?? 0);
					const mic = clamp((input.mic ?? 0) * 1.75);
					const speaking = assistant > .05;
					const thinking = !speaking && !!input.working;
					const pace = input.reduce ? .5 : 1;
					const target = speaking ? {
						listen: .2,
						speak: 1,
						think: 0
					} : thinking ? {
						listen: .65,
						speak: 0,
						think: 1
					} : {
						listen: 1,
						speak: 0,
						think: 0
					};
					const k = 1 - Math.exp(-dt / .28);
					s.listen += (target.listen - s.listen) * k;
					s.speak += (target.speak - s.speak) * k;
					s.think += (target.think - s.think) * k;
					const overall = speaking ? assistant : 0;
					s.motion += (overall - s.motion) * (1 - Math.exp(-dt / .2));
					s.accent = Math.max(overall - s.prevOverall, 0) * 3.6;
					s.prevOverall = overall;
					for (let i = 0; i < 3; i += 1) s.cumulative[i] += overall * (i === 0 ? .82 : i === 1 ? .76 : .68) * dt * 60 * 40 * (1 - Math.exp(-dt / 2));
					const energy = clamp(Math.max(...s.cumulative) / 12);
					const waveLevel = overall > .024 ? (1 - Math.exp(-overall * 4)) ** 1.15 : 0;
					s.drive = ease(s.drive, waveLevel, dt, .045, .14);
					const speedTarget = s.drive * TUNE.speakSpeedScale * (TUNE.speakSpeedBase + Math.max(s.motion, energy) * TUNE.speakSlowEnergy + s.accent * .5);
					const boost = spring(s.boost, s.boostV, speedTarget, dt, 6, .76);
					s.boost = boost.value;
					s.boostV = boost.velocity;
					const waveSpeed = Math.max(TUNE.minWaveSpeed, 1 + s.boost);
					s.amp = ease(s.amp, 1 - waveLevel * (1 - TUNE.speakAmp), dt, .1, .28);
					const userDrive = clamp(s.user) * clamp(input.mic ?? 0);
					const edge = spring(s.edge, s.edgeV, userDrive * TUNE.edgeDistance, dt, TUNE.edgeFrequency, TUNE.edgeDamping);
					s.edge = edge.value;
					s.edgeV = edge.velocity;
					const noiseScale = 1 + userDrive * (TUNE.listenNoise - 1);
					s.flowBoost = ease(s.flowBoost, Math.max(s.motion, energy) * TUNE.flowScale, dt, .055, .16);
					const talking = !speaking && !thinking && (s.userOn ? mic > .32 : mic >= .48);
					if (talking !== s.userOn) {
						s.userFrom = s.user;
						s.userOn = talking;
						s.userAt = now;
					}
					s.user = s.userFrom + ((s.userOn ? 1 : 0) - s.userFrom) * clamp((now - s.userAt) / .14);
					const offsets = [
						[0, 0],
						[0, 0],
						[0, 0]
					];
					const audio = s.cumulative.map((value) => clamp(value / 12));
					for (let i = 0; i < 3; i += 1) s.colour[i] = ease(s.colour[i], audio[i] * (speaking ? 1 : 0) * 1, dt, .07, .22);
					if (speaking) for (let i = 0; i < 3; i += 1) s.phase[i] += dt * TUNE.windSpeed * WIND[i] * (1 + s.colour[i] * 1.5);
					const [r, g, b] = s.colour;
					const [p0, p1, p2] = s.phase;
					const d = TUNE.driftScale;
					const w = TUNE.windScale;
					offsets[0] = [r * d + Math.sin(p0) * r * w, -g * d * .55 + Math.cos(p0 * .82) * g * w * .65];
					offsets[1] = [-g * d * .75 + Math.cos(p1 * .91) * g * w * .8, b * d + Math.sin(p1) * b * w];
					offsets[2] = [b * d * 1.1 + Math.sin(p2 * 1.07) * b * w * 1.1, r * d * .7 + Math.cos(p2) * r * w * .75];
					s.base += dt * pace * TUNE.fps;
					s.wave += dt * pace * TUNE.fps * waveSpeed;
					s.flow += dt * pace * TUNE.fps * (1 + s.flowBoost);
					s.level = ease(s.level, speaking ? assistant : 0, dt, .09, .3);
					const out = smooth(.04, .46, s.level);
					const breath = Math.sin(now * Math.PI * .34) * .5 + .5;
					const state = Math.max(s.listen, s.think, s.speak);
					let size = TUNE.surface * (.88 + .06 * s.think) * (.82 + .18 * smooth(0, .9, state));
					size += out * TUNE.surface * .12;
					size += (1 - s.think) * (1 - out) * breath * TUNE.surface * .01;
					const surface = Math.min(TUNE.surface, size) * 2 * TUNE.fit;
					gl.viewport(0, 0, canvas.width, canvas.height);
					gl.clearColor(0, 0, 0, 0);
					gl.clear(gl.COLOR_BUFFER_BIT);
					gl.uniform2f(u.uRes, canvas.width, canvas.height);
					gl.uniform1f(u.uWaveFrame, s.wave);
					gl.uniform1f(u.uBaseFrame, s.base);
					gl.uniform1f(u.uAmp, s.amp);
					gl.uniform1f(u.uFlowFrame, s.flow);
					gl.uniform1f(u.uEdge, s.edge);
					gl.uniform1f(u.uNoiseScale, noiseScale);
					gl.uniform1f(u.uSurface, surface);
					gl.uniform1f(u.uMic, mic);
					gl.uniform1f(u.uUser, s.user);
					gl.uniform1f(u.uFlat, flat);
					gl.uniform2f(u.uOff0, offsets[0][0], offsets[0][1]);
					gl.uniform2f(u.uOff1, offsets[1][0], offsets[1][1]);
					gl.uniform2f(u.uOff2, offsets[2][0], offsets[2][1]);
					gl.uniform3f(u.uAccent, color[0], color[1], color[2]);
					gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				},
				dispose() {
					try {
						gl.getExtension("WEBGL_lose_context")?.loseContext();
					} catch {}
				}
			};
		}
		//#endregion
		//#region src/client-voice-call.jsx
		const Bars = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "20",
			height: "20",
			viewBox: "0 0 20 20",
			fill: "none",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M4 8.5v3M7 5.5v9M10 3v14M13 6v8M16 8.5v3",
				stroke: "currentColor",
				strokeWidth: "2.2",
				strokeLinecap: "round"
			})
		});
		const Cross = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			fill: "none",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M3 3l8 8M11 3l-8 8",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round"
			})
		});
		const Mic = ({ off }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "18",
			height: "18",
			viewBox: "0 0 18 18",
			fill: "none",
			"aria-hidden": "true",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "6.2",
					y: "1.8",
					width: "5.6",
					height: "9",
					rx: "2.8",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 8.4a5.5 5.5 0 0 0 11 0M9 13.9v2.3",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				}),
				off ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.8 15.2 15.2 2.8",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round"
				}) : null
			]
		});
		const Speaker = ({ off }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "18",
			height: "18",
			viewBox: "0 0 18 18",
			fill: "none",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M3 7h2.6L9.5 3.8v10.4L5.6 11H3z",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinejoin: "round"
			}), off ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M12.6 6.6l3.2 4.8M15.8 6.6l-3.2 4.8",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round"
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M12.3 6.5a3.6 3.6 0 0 1 0 5M14.4 4.6a6.4 6.4 0 0 1 0 8.8",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round"
			})]
		});
		/**
		* What a call looks like while it runs, drawn like Codex's own voice chat: above a composer that sits at the bottom of the
		* conversation (below it on the empty start page) there is a small stage with the last spoken lines, what DSH is doing
		* and the orb, which swells with the person's voice and with the model's. While the call connects, the orb is a pulsing dot.
		*/
		function VoiceStage({ call, connecting, rpc, sessionId, anchor, accent, t }) {
			const orb = (0, react.useRef)(null);
			const canvas = (0, react.useRef)(null);
			const working = (0, react.useRef)(false);
			const closing = (0, react.useRef)(false);
			const frame = (0, react.useRef)(null);
			const [status, setStatus] = (0, react.useState)({
				working: false,
				lines: []
			});
			working.current = status.working;
			closing.current = status.closing === true;
			const [mode, setMode] = (0, react.useState)("idle");
			const [box, setBox] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let raf;
				const follow = () => {
					const rect = anchor.getBoundingClientRect();
					setBox((current) => current && Math.abs(current.left - rect.left) < .5 && Math.abs(current.top - rect.top) < .5 && Math.abs(current.width - rect.width) < .5 ? current : {
						left: rect.left,
						top: rect.top,
						bottom: rect.bottom,
						width: rect.width,
						docked: rect.bottom > window.innerHeight - 180
					});
					raf = requestAnimationFrame(follow);
				};
				follow();
				return () => cancelAnimationFrame(raf);
			}, [anchor]);
			(0, react.useEffect)(() => {
				if (!call) return void 0;
				const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
				const painter = canvas.current ? createOrb(canvas.current, accent) : void 0;
				const started = performance.now();
				let level = 0;
				let last = "";
				let closeSince = 0;
				let quietSince = 0;
				const tick = () => {
					const { mic, assistant } = call.levels();
					if (closing.current) {
						const now = performance.now();
						closeSince ||= now;
						if (assistant > .03) quietSince = 0;
						else quietSince ||= now;
						if (now - closeSince > 15e3 || now - closeSince > 1800 && now - quietSince > 1300) {
							closing.current = false;
							call.stop();
							return;
						}
					}
					const target = Math.max(mic, assistant);
					level += (target - level) * (target > level ? .35 : .12);
					orb.current?.style.setProperty("--level", reduce ? "0" : level.toFixed(3));
					painter?.draw((performance.now() - started) / 1e3, {
						mic,
						assistant,
						working: working.current,
						reduce
					});
					const next = assistant > .05 ? "speaking" : mic > .05 ? "listening" : "idle";
					if (next !== last) {
						last = next;
						setMode(next);
					}
					frame.current = requestAnimationFrame(tick);
				};
				tick();
				return () => {
					cancelAnimationFrame(frame.current);
					painter?.dispose();
				};
			}, [call]);
			(0, react.useEffect)(() => {
				if (!call) return void 0;
				let stopped = false;
				let seen = false;
				const poll = async () => {
					try {
						const result = await rpc.call(CHANNEL, "voice/status", { sessionId });
						if (!stopped && result.ok) {
							setStatus(result.value);
							if (result.value.active) seen = true;
							else if (seen) {
								stopped = true;
								call.stop();
							}
						}
					} catch {}
				};
				poll();
				const timer = setInterval(poll, 900);
				return () => {
					stopped = true;
					clearInterval(timer);
				};
			}, [
				call,
				rpc,
				sessionId
			]);
			if (!box) return null;
			const label = connecting ? t("voiceConnecting") : status.working ? t("voiceWorking") : mode === "speaking" ? t("voiceSpeaking") : t("voiceListening");
			const lines = status.lines.slice(-2);
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexVoiceStage",
				role: "status",
				"aria-live": "polite",
				"data-side": box.docked ? "above" : "below",
				style: {
					left: box.left + box.width / 2,
					top: box.docked ? box.top : box.bottom,
					"--voice-accent": accent
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexVoiceLines",
						children: lines.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							"data-role": line.role,
							"data-old": index < lines.length - 1 || void 0,
							children: line.text
						}, `${index}-${line.text.slice(0, 12)}`))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexVoiceStatus",
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexVoiceOrbBox",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexVoiceDot",
							"data-gone": !connecting || void 0
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexVoiceOrb",
							ref: orb,
							"data-ready": !connecting,
							"data-mode": status.working ? "working" : mode,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
								ref: canvas,
								width: 240,
								height: 240,
								"aria-hidden": "true"
							})
						})]
					})
				]
			}), document.body);
		}
		/**
		* The composer's voice button. It sits exactly on the send button while there is nothing to send (the send button is
		* disabled) and gives it back as soon as there is text, so the one place always does the likely thing. During a call
		* it becomes the end button and, where DSH's dictation button is, a speaker and a microphone switch appear.
		*/
		function VoiceCallButton({ sessionId, rpc, preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const marker = (0, react.useRef)(null);
			const call = (0, react.useRef)(null);
			const pendingCall = (0, react.useRef)(null);
			const alive = (0, react.useRef)(false);
			const [liveCall, setLiveCall] = (0, react.useState)(null);
			const accent = (0, react.useRef)("");
			const button = (0, react.useRef)(null);
			const [place, setPlace] = (0, react.useState)();
			const [state, setState] = (0, react.useState)("idle");
			const [problem, setProblem] = (0, react.useState)("");
			const [unsupported, setUnsupported] = (0, react.useState)(false);
			const [browserCopied, setBrowserCopied] = (0, react.useState)(false);
			const [micOff, setMicOff] = (0, react.useState)(false);
			const [speakerOff, setSpeakerOff] = (0, react.useState)(false);
			const [nativeAvailable, setNativeAvailable] = (0, react.useState)(false);
			const enabled = snapshot.status === "ready" && snapshot.voiceCall === "on";
			const capability = enabled ? voiceCallCapability() : void 0;
			(0, react.useEffect)(() => {
				setProblem("");
				setUnsupported(false);
				setBrowserCopied(false);
			}, [sessionId, capability]);
			(0, react.useEffect)(() => {
				setNativeAvailable(false);
				if (!enabled || !["voice-no-webrtc", "voice-no-microphone"].includes(capability) || !nativeVoiceEligible()) return void 0;
				const controller = new AbortController();
				let retry;
				const probe = async (attempt = 0) => {
					try {
						const result = await rpc.call(CHANNEL, "voice/native/probe", {}, controller.signal);
						if (controller.signal.aborted) return;
						if (result.value?.code === "native-voice-busy" && attempt < 3) retry = setTimeout(() => {
							probe(attempt + 1);
						}, 400);
						else setNativeAvailable(result.ok && result.value?.available === true);
					} catch {}
				};
				probe();
				return () => {
					controller.abort();
					clearTimeout(retry);
				};
			}, [
				enabled,
				capability,
				rpc
			]);
			(0, react.useLayoutEffect)(() => {
				if (!enabled) {
					setPlace(void 0);
					return;
				}
				const trailing = marker.current?.closest("[data-slot]")?.parentElement?.parentElement;
				if (!trailing) return void 0;
				const wasStatic = getComputedStyle(trailing).position === "static";
				if (wasStatic) trailing.style.position = "relative";
				const watcher = new MutationObserver(() => measure());
				const measure = () => {
					const send = [...trailing.children].filter((child) => child.tagName === "BUTTON" && !child.classList.contains("codexVoiceCall")).at(-1);
					if (!send) {
						setPlace(void 0);
						return;
					}
					const host = trailing.getBoundingClientRect();
					const box = send.getBoundingClientRect();
					window.devicePixelRatio;
					const moved = new DOMMatrixReadOnly(getComputedStyle(send).transform);
					setPlace({
						host: trailing,
						send,
						activity: trailing.querySelector("[data-slot=\"conversation.input.activity\"]")?.parentElement ?? null,
						left: box.left - host.left - trailing.clientLeft - moved.m41,
						top: box.top - host.top - trailing.clientTop - moved.m42,
						width: box.width,
						height: box.width,
						idle: send.disabled,
						className: send.className
					});
				};
				measure();
				watcher.observe(trailing, {
					subtree: true,
					childList: true,
					attributes: true,
					attributeFilter: [
						"disabled",
						"aria-label",
						"class"
					]
				});
				const resizer = new ResizeObserver(measure);
				resizer.observe(trailing);
				return () => {
					watcher.disconnect();
					resizer.disconnect();
					if (wasStatic) trailing.style.position = "";
				};
			}, [enabled]);
			const live = state === "live";
			(0, react.useEffect)(() => {
				const activity = place?.activity;
				if (!activity || !live) return void 0;
				activity.setAttribute("data-voice-live", "");
				return () => activity.removeAttribute("data-voice-live");
			}, [place?.activity, live]);
			(0, react.useEffect)(() => {
				alive.current = true;
				call.current = null;
				setLiveCall(null);
				setState("idle");
				return () => {
					alive.current = false;
					pendingCall.current?.abort();
					call.current?.stop();
				};
			}, [sessionId]);
			(0, react.useEffect)(() => {
				if (!problem || unsupported) return void 0;
				const timer = setTimeout(() => setProblem(""), 6e3);
				return () => clearTimeout(timer);
			}, [problem, unsupported]);
			const start = async () => {
				if (nativeAvailable && !window.confirm(t("voiceNativeCaptureConfirm"))) return;
				const controller = new AbortController();
				pendingCall.current?.abort();
				pendingCall.current = controller;
				setProblem("");
				setUnsupported(false);
				setBrowserCopied(false);
				accent.current = button.current ? getComputedStyle(button.current).backgroundColor : "";
				setMicOff(false);
				setSpeakerOff(false);
				setState("connecting");
				let attemptEnded = false;
				try {
					const opened = await (nativeAvailable ? openNativeVoiceCall : openVoiceCall)({
						rpc,
						sessionId,
						captureAllowed: nativeAvailable,
						signal: controller.signal,
						onEnd: () => {
							attemptEnded = true;
							if (!alive.current || controller.signal.aborted || pendingCall.current !== controller) return;
							call.current = null;
							setLiveCall(null);
							setState("idle");
						}
					});
					if (!alive.current || controller.signal.aborted || attemptEnded || pendingCall.current !== controller) {
						await opened.stop();
						return;
					}
					call.current = opened;
					setLiveCall(call.current);
					setState("live");
				} catch (error) {
					if (!alive.current || controller.signal.aborted || pendingCall.current !== controller) return;
					call.current = null;
					setLiveCall(null);
					setState("idle");
					setUnsupported([
						"voice-no-webrtc",
						"voice-no-microphone",
						"voice-insecure",
						"voice-native-unavailable"
					].includes(error?.code) ? error.code : false);
					setProblem(voiceCallProblem(error));
				}
			};
			const click = () => {
				if (state === "live") call.current?.stop();
				else if (state === "idle") start();
			};
			const covering = Boolean(place) && (state !== "idle" || place.idle);
			(0, react.useLayoutEffect)(() => {
				const send = place?.send;
				if (!enabled || !covering || !send) return void 0;
				const before = send.style.visibility;
				send.style.visibility = "hidden";
				return () => {
					send.style.visibility = before;
				};
			}, [
				enabled,
				covering,
				place?.send
			]);
			const anchor = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: marker,
				hidden: true
			});
			if (!enabled || !place) return anchor;
			const visible = state !== "idle" || place.idle;
			const browserUrl = capability === "voice-no-webrtc" || unsupported && unsupported !== "voice-insecure" ? voiceBrowserUrl(window.location.href, sessionId) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				anchor,
				visible ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [state === "idle" && !nativeAvailable && capability === "voice-no-webrtc" && browserUrl ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					ref: button,
					href: browserUrl,
					target: "_blank",
					rel: "noopener noreferrer",
					className: `${place.className} codexVoiceCall`,
					"data-state": "browser",
					"aria-label": t("voiceBrowserCall"),
					title: t("voiceBrowserCall"),
					style: {
						left: place.left,
						top: place.top,
						width: place.width,
						height: place.height
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Bars, {})
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: button,
					type: "button",
					className: `${place.className} codexVoiceCall`,
					"data-state": state,
					onClick: click,
					disabled: state === "connecting",
					"aria-label": t(live ? "voiceEnd" : "voiceStart"),
					title: t(live ? "voiceEnd" : "voiceStart"),
					style: {
						left: place.left,
						top: place.top,
						width: place.width,
						height: place.height
					},
					children: live ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cross, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Bars, {})
				}), problem ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexVoiceCallNote",
					role: "alert",
					style: { right: 0 },
					children: [t(problem), browserUrl ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "codexVoiceBrowserActions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: browserUrl,
							target: "_blank",
							rel: "noopener noreferrer",
							children: t("voiceBrowserContinue")
						}), typeof navigator.clipboard?.writeText === "function" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								navigator.clipboard.writeText(browserUrl).then(() => setBrowserCopied(true)).catch(() => setBrowserCopied("error"));
							},
							children: t(browserCopied === "error" ? "voiceBrowserCopyFailed" : browserCopied ? "voiceBrowserCopied" : "voiceBrowserCopy")
						}) : null]
					}) : null]
				}) : null] }), place.host) : null,
				live && place.activity && liveCall ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexVoiceTools",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "codexVoiceTool",
						"aria-pressed": speakerOff,
						"aria-label": t(speakerOff ? "voiceUnmuteSpeaker" : "voiceMuteSpeaker"),
						title: t(speakerOff ? "voiceUnmuteSpeaker" : "voiceMuteSpeaker"),
						onClick: () => {
							liveCall.setOutputMuted(!speakerOff);
							setSpeakerOff(!speakerOff);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Speaker, { off: speakerOff })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "codexVoiceTool",
						"aria-pressed": micOff,
						"aria-label": t(micOff ? "voiceUnmute" : "voiceMute"),
						title: t(micOff ? "voiceUnmute" : "voiceMute"),
						onClick: () => {
							liveCall.setMuted(!micOff);
							setMicOff(!micOff);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Mic, { off: micOff })
					})]
				}), place.activity) : null,
				state !== "idle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VoiceStage, {
					call: liveCall,
					connecting: state === "connecting",
					rpc,
					sessionId,
					anchor: place.host.parentElement?.parentElement ?? place.host,
					accent: accent.current,
					t
				}) : null
			] });
		}
		/** One settings row: the label on the left, a menu in the same style as the context selector on the right. */
		function ChoiceRow({ label, items, selectedId, disabled, onSelect, trailing = null }) {
			const [open, setOpen] = (0, react.useState)(false);
			const selected = items.flatMap((item) => [item, ...item.submenu ?? []]).find((item) => item.id === selectedId)?.label ?? items[0].label;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceLabel",
						children: label
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexVoiceChoice",
					children: [trailing, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
						open,
						items,
						selectedId,
						onSelect: (value) => {
							setOpen(false);
							onSelect(value);
						},
						onClose: () => setOpen(false),
						align: "end",
						side: "bottom",
						portal: true,
						compact: true,
						anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "codexSubscriptionContextTrigger",
							type: "button",
							"aria-label": label,
							"aria-haspopup": "menu",
							"aria-expanded": open,
							disabled,
							onClick: () => setOpen((value) => !value),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selected }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, {})]
						})
					})]
				})]
			});
		}
		/** Settings for the composer's voice button: on or off, the voice (with a short sample to listen to) and the answer language. */
		function VoiceCallCard({ rpc, preference, snapshot, t }) {
			const audio = (0, react.useRef)();
			const previewSequence = (0, react.useRef)(0);
			const previewAbort = (0, react.useRef)();
			const alive = (0, react.useRef)(false);
			const [offered, setOffered] = (0, react.useState)();
			const [sample, setSample] = (0, react.useState)({
				state: "idle",
				note: ""
			});
			const on = snapshot.voiceCall === "on";
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
					previewAbort.current?.abort();
					audio.current?.pause();
				};
			}, []);
			(0, react.useEffect)(() => {
				if (!on) {
					previewSequence.current++;
					previewAbort.current?.abort();
					audio.current?.pause();
					setSample({
						state: "idle",
						note: ""
					});
					setOffered(void 0);
					return;
				}
				const controller = new AbortController();
				setOffered(void 0);
				(async () => {
					try {
						const result = await rpc.call(CHANNEL, "voice/catalog", { language: snapshot.voiceLanguage }, controller.signal);
						if (alive.current && !controller.signal.aborted && result.ok) setOffered(result.value.voices);
					} catch {}
				})();
				return () => controller.abort();
			}, [
				on,
				snapshot.voiceLanguage,
				rpc
			]);
			/** Play a short clip of a voice; picking a voice plays it too, so it can be heard before it is used. */
			const playVoice = async (voice, language = snapshot.voiceLanguage) => {
				const sequence = ++previewSequence.current;
				previewAbort.current?.abort();
				const controller = new AbortController();
				previewAbort.current = controller;
				audio.current?.pause();
				setSample({
					state: "loading",
					note: ""
				});
				let phase = "request";
				try {
					const result = await rpc.call(CHANNEL, "voice/preview", {
						voice,
						language
					}, controller.signal);
					if (!alive.current || sequence !== previewSequence.current) return;
					if (!result.ok) {
						setSample({
							state: "error",
							code: voicePreviewProblem(result.error?.code)
						});
						return;
					}
					phase = "playback";
					const clip = new Audio(result.value.audio);
					audio.current = clip;
					clip.onended = () => {
						if (alive.current && sequence === previewSequence.current) setSample((current) => ({
							...current,
							state: "idle"
						}));
					};
					clip.onerror = () => {
						if (alive.current && sequence === previewSequence.current) setSample({
							state: "error",
							code: "voicePlaybackFailed"
						});
					};
					setSample({
						state: "playing",
						note: [result.value.description, result.value.accent].filter(Boolean).join(" · ")
					});
					await clip.play();
				} catch {
					if (alive.current && sequence === previewSequence.current && !controller.signal.aborted) setSample({
						state: "error",
						code: voicePreviewProblem(phase === "playback" ? "playback" : void 0)
					});
				}
			};
			const listed = VOICE_VOICES.filter((value) => offered ? offered.includes(value) : VOICE_VOICES.indexOf(value) < 9);
			const others = VOICE_VOICES.filter((value) => !listed.includes(value));
			const voices = [...listed.map((value) => ({
				id: value,
				label: value
			})), ...others.length === 0 ? [] : [{
				type: "separator",
				id: "more-line"
			}, {
				id: "more",
				label: t("voiceMore"),
				submenu: others.map((value) => ({
					id: value,
					label: value
				}))
			}]];
			const languages = VOICE_LANGUAGES.map((value) => ({
				id: value,
				label: value === "auto" ? t("voiceAuto") : t(`voiceLang_${value}`)
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
				"aria-label": t("voiceTitle"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreference",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreferenceCopy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
							description: [
								t("voiceHint"),
								t("voicePreviewHint"),
								t("voiceMediaHint")
							].join(" "),
							children: [
								t("voiceTitle"),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
							]
						}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(on ? "state_voice_on" : "state_voice_off") }) : null]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
						checked: on,
						label: t("voiceTitle"),
						disabled: !snapshot.writable,
						onChange: (next) => {
							preference.set({ [VOICE_CALL_FIELD]: next ? "on" : "off" });
						}
					})]
				}), on ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceRow, {
						label: t("voiceVoice"),
						disabled: !snapshot.writable,
						selectedId: snapshot.voiceVoice,
						items: voices,
						onSelect: (value) => {
							if (value === "more") return;
							preference.set({ [VOICE_VOICE_FIELD]: value });
							playVoice(value);
						},
						trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "codexSubscriptionContextTrigger",
							type: "button",
							disabled: sample.state === "loading",
							onClick: () => {
								playVoice(snapshot.voiceVoice);
							},
							children: sample.state === "loading" ? t("voiceLoading") : t("voicePlay")
						})
					}),
					sample.state === "playing" && sample.note ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionHelp",
						role: "status",
						children: sample.note
					}) : null,
					sample.state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionHelp",
						role: "status",
						children: t(sample.code)
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoiceRow, {
						label: t("voiceLanguage"),
						disabled: !snapshot.writable,
						selectedId: snapshot.voiceLanguage,
						items: languages,
						onSelect: (value) => {
							preference.set({ [VOICE_LANGUAGE_FIELD]: value });
							playVoice(snapshot.voiceVoice, value);
						}
					})
				] }) : null]
			});
		}
		//#endregion
		//#region src/capability-preferences.jsx
		function CapabilityPreferences({ preference, t, section, disabled = false }) {
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
						disabled: !snapshot.writable || disabled,
						onChange: () => {
							preference.set({ [field]: value });
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`${field}_${value}`) })]
				}, value))
			});
			if (section === "quota") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("quotaAlertsHint"),
						children: t("quotaAlerts")
					})
				}), choices("quotaAlerts", QUOTA_ALERT_MODES)]
			}), snapshot.quotaAlerts === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexQuotaThresholds",
				children: QUOTA_THRESHOLD_FIELDS.map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaThreshold, {
					field,
					snapshot,
					preference,
					t
				}, field))
			}) : null] });
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
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							description: t("searchModeHint"),
							children: t("searchMode")
						}), choices("searchMode", SEARCH_MODES)]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreferenceCopy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							description: t("searchDomainsHint"),
							children: t("searchDomains")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
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
						})]
					}),
					invalid ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "codexSubscriptionError",
						children: t("searchDomainsInvalid")
					}) : null
				]
			});
		}
		function QuotaThreshold({ field, snapshot, preference, t }) {
			const [draft, setDraft] = (0, react.useState)(String(snapshot[field]));
			const [error, setError] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				setDraft(String(snapshot[field]));
				setError(false);
			}, [snapshot[field]]);
			const save = () => {
				const value = Number(draft);
				if (!draft.trim() || !validQuotaThreshold(value)) {
					setError(true);
					return;
				}
				setError(false);
				if (value !== snapshot[field]) preference.set({ [field]: value });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [
				t(field),
				" ",
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
					type: "number",
					min: 1,
					max: 100,
					step: 1,
					"aria-label": t(field),
					"aria-invalid": error,
					value: draft,
					disabled: !snapshot.writable || snapshot.saving,
					onChange: (event) => setDraft(event.target.value),
					onBlur: save,
					onKeyDown: (event) => {
						if (event.key === "Enter") save();
					}
				}),
				" %",
				error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					role: "alert",
					children: t("quotaThresholdInvalid")
				}) : null
			] });
		}
		//#endregion
		//#region src/default-model-preferences.jsx
		/**
		* Choose the model a new conversation opens with. DSH owns that selection, so
		* the control always shows the live value, including a model chosen in a chat
		* and any non-subscription default the user set elsewhere.
		*/
		function DefaultModelPreference({ preference, defaultModel, t }) {
			const snapshot = (0, react.useSyncExternalStore)(defaultModel.subscribe, defaultModel.getSnapshot);
			const models = usePreferenceSnapshot(preference).availableModels;
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				defaultModel.load();
			}, [defaultModel]);
			const selected = models.find((model) => model.id === snapshot.model);
			const label = snapshot.managed ? selected?.name ?? snapshot.model : t("defaultModelFollow");
			const current = snapshot.provider === void 0 ? t("defaultModelUnknown") : `${snapshot.provider} / ${snapshot.model ?? t("defaultModelUnknown")}`;
			const hint = snapshot.status === "error" ? t("defaultModelFailed") : snapshot.available !== true ? t("defaultModelUnavailable") : models.length === 0 ? t("defaultModelNoCatalog") : snapshot.managed ? t("defaultModelHint") : fill(t("defaultModelFollowHint"), { value: current });
			const resetId = "__dsh_default__";
			const items = [{
				id: resetId,
				label: t("defaultModelReset"),
				disabled: !snapshot.resetAvailable
			}, ...models.length ? [{
				type: "separator",
				id: "default-model-separator"
			}, ...models.map((model) => ({
				id: model.id,
				label: model.name
			}))] : []];
			const disabled = snapshot.saving || snapshot.available !== true || models.length === 0 && !snapshot.resetAvailable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							description: snapshot.status === "loading" ? void 0 : [hint, snapshot.resetAvailable ? t("defaultModelResetHint") : void 0].filter(Boolean).join(" "),
							children: t("defaultModelTitle")
						}),
						snapshot.status === "ready" && snapshot.available && !snapshot.managed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: fill(t("defaultModelCurrent"), { value: snapshot.model ?? t("defaultModelUnknown") }) }) : null,
						snapshot.status === "ready" && !snapshot.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: hint }) : null,
						snapshot.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionError",
							role: "alert",
							children: t("defaultModelFailed")
						}) : null
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
					open,
					items,
					selectedId: snapshot.managed ? snapshot.model : void 0,
					onSelect: (value) => {
						setOpen(false);
						if (value === resetId) {
							if (snapshot.resetAvailable) defaultModel.reset();
						} else defaultModel.select(value);
					},
					onClose: () => setOpen(false),
					align: "end",
					side: "bottom",
					portal: true,
					compact: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "codexSubscriptionContextTrigger",
						type: "button",
						"aria-label": t("defaultModelTitle"),
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-busy": snapshot.saving || void 0,
						title: label,
						disabled,
						onClick: () => setOpen((value) => !value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, {})]
					})
				})]
			});
		}
		Object.freeze({
			imageCapability: ["imageGeneration", "imageEditing"],
			imageEntryPoints: ["imageShortcut"],
			sketchCanvas: ["imageSketch"],
			sketchAgent: ["imageSketchAgent"],
			imageBrowsing: ["imageViewer", "imageAnnotations"]
		});
		//#endregion
		//#region src/image-preferences.jsx
		function ImageChoice({ t, label, hint, title, value, text, items, disabled, onSelect }) {
			const [open, setOpen] = (0, react.useState)(false);
			const anchor = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!open || disabled) return;
				const escape = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
					anchor.current?.focus();
				};
				window.addEventListener("keydown", escape, true);
				return () => window.removeEventListener("keydown", escape, true);
			}, [open, disabled]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference codexImagePreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						className: "",
						description: [hint, title].filter(Boolean).join(" "),
						children: label
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
					open: open && !disabled,
					items,
					selectedId: value,
					onSelect: (id) => {
						setOpen(false);
						onSelect(id);
					},
					onClose: () => setOpen(false),
					align: "end",
					side: "bottom",
					portal: true,
					compact: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						ref: anchor,
						type: "button",
						className: "codexSubscriptionContextTrigger",
						"aria-label": label,
						"aria-haspopup": "menu",
						"aria-expanded": open && !disabled,
						disabled,
						onClick: () => setOpen((current) => !current),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: text }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, {})]
					})
				})]
			});
		}
		//#endregion
		//#region src/default-reasoning-preferences.jsx
		function DefaultReasoningEffortPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const value = normalizeDefaultReasoningEffortChoice(snapshot[DEFAULT_REASONING_EFFORT_FIELD]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageChoice, {
				t,
				label: t("defaultReasoningEffort"),
				hint: t("defaultReasoningEffortHint"),
				title: t("defaultUltraHint"),
				value,
				text: t(`defaultReasoningEffort_${value}`),
				items: DEFAULT_REASONING_EFFORTS.filter((id) => id !== "ultra" || snapshot.ultraModels?.length > 0).map((id) => ({
					id,
					label: t(`defaultReasoningEffort_${id}`)
				})),
				disabled: snapshot.status !== "ready" || !snapshot.writable || snapshot.saving,
				onSelect: (effort) => {
					preference.set({ [DEFAULT_REASONING_EFFORT_FIELD]: effort });
				}
			});
		}
		//#endregion
		//#region src/composer-prediction-preferences.jsx
		function ComposerPredictionPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
						description: t("composerPredictionsHint"),
						children: [
							t("composerPredictions"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
						]
					}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceHint",
						children: t(`state_predictions_${snapshot.composerPredictions === "on" ? "on" : "off"}`)
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked: snapshot.composerPredictions === "on",
					label: t("composerPredictions"),
					disabled: snapshot.status !== "ready" || !snapshot.writable || snapshot.saving,
					onChange: (on) => {
						preference.set({ composerPredictions: on ? "on" : "off" });
					}
				})]
			});
		}
		//#endregion
		//#region src/client-runtime-management.jsx
		function RuntimeManagement({ rpc, preference, t, active = true }) {
			const [state, setState] = (0, react.useState)();
			const [error, setError] = (0, react.useState)(false);
			const [sending, setSending] = (0, react.useState)(false);
			const [confirm, setConfirm] = (0, react.useState)(false);
			const alive = (0, react.useRef)(false);
			const busy = [
				"installing",
				"removing",
				"applying"
			].includes(state?.phase);
			const read = async () => {
				try {
					const result = await rpc.call(CHANNEL, "runtime/status", {});
					if (!alive.current) return;
					if (!result.ok) {
						setError(true);
						return;
					}
					setState(result.value);
					setError(false);
				} catch {
					if (alive.current) setError(true);
				}
			};
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, [rpc]);
			(0, react.useEffect)(() => {
				if (active) read();
			}, [active, rpc]);
			(0, react.useEffect)(() => {
				if (!busy) return;
				let stopped = false, timer;
				const poll = async () => {
					await read();
					if (!stopped) timer = setTimeout(poll, 1500);
				};
				timer = setTimeout(poll, 1500);
				return () => {
					stopped = true;
					clearTimeout(timer);
				};
			}, [busy, rpc]);
			const act = async (action) => {
				if (sending) return;
				setSending(true);
				setError(false);
				setConfirm(false);
				try {
					const result = await rpc.call(CHANNEL, `runtime/${action}`, {});
					if (!alive.current) return;
					if (!result.ok) {
						await read();
						if (alive.current) setError(true);
						return;
					}
					setState(result.value);
					if (action === "remove") preference.load();
				} catch {
					if (alive.current) setError(true);
				} finally {
					if (alive.current) setSending(false);
				}
			};
			(0, react.useEffect)(() => {
				if (state?.phase === "done") preference.load();
			}, [state?.phase]);
			const locked = sending || busy || state?.restartRequired || state?.active > 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionRuntime",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							role: "status",
							children: t(!state ? "runtimeLoading" : state.restartRequired ? "runtimeRestart" : busy ? `runtime_${state.phase}` : state.installed ? "subagentRuntimeInstalled" : !state.componentVersion ? "runtimeHostUnsupported" : state.present ? state.removable ? "runtimeIncompatible" : "runtimeManagedElsewhere" : "subagentRuntimeMissing")
						}), state?.available && (state.present ? state.removable : state.installable) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							disabled: locked,
							onClick: () => state.present ? setConfirm(true) : void act("install"),
							children: t(state.present ? "runtimeRemove" : "runtimeInstall")
						}) : null]
					}),
					state?.active > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtimeActive") }) : null,
					busy && state.phase === "installing" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						disabled: sending,
						onClick: () => {
							act("cancel");
						},
						children: t("runtimeCancel")
					}) : null,
					confirm ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "group",
						"aria-label": t("runtimeRemove"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtimeConfirm") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								onClick: () => setConfirm(false),
								children: t("runtimeKeep")
							}),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: locked,
								onClick: () => {
									act("remove");
								},
								children: t("runtimeConfirmRemove")
							})
						]
					}) : null,
					error || state?.phase === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t(state?.error === "build-blocked" ? "runtimeBuildBlocked" : "runtimeFailed")
					}) : null,
					state?.phase === "cancelled" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("runtimeCancelled")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							as: "summary",
							className: "",
							openOnClick: false,
							description: [state?.installable ? t("runtimeInstallHint") : void 0, t("subagentRuntimeCacheHint")].filter(Boolean).join(" "),
							children: t("subagentRuntimeManage")
						}),
						state?.present && state.available && !state.removable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtimeManagedElsewhere") }) : null,
						!busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							disabled: sending,
							onClick: () => {
								read();
								preference.load();
							},
							children: t("runtimeRefresh")
						}) : null,
						state && !state.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtimeUnavailable") }) : null,
						state?.available && !state.installable && !state.present ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtimeHostUnsupported") }) : null,
						state?.componentVersion ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("code", { children: ["@deepseek-ai/dsh-subagent-codex@", state.componentVersion] }) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: "https://github.com/WSL043/dsh-codex-subscription/blob/main/README.md#codex-subtask-runtime",
							target: "_blank",
							rel: "noreferrer",
							children: t("subagentRuntimePrepare")
						})
					] })
				]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/utils.js
		var require_utils = /* @__PURE__ */ __commonJSMin(((exports) => {
			let toSJISFunction;
			const CODEWORDS_COUNT = [
				0,
				26,
				44,
				70,
				100,
				134,
				172,
				196,
				242,
				292,
				346,
				404,
				466,
				532,
				581,
				655,
				733,
				815,
				901,
				991,
				1085,
				1156,
				1258,
				1364,
				1474,
				1588,
				1706,
				1828,
				1921,
				2051,
				2185,
				2323,
				2465,
				2611,
				2761,
				2876,
				3034,
				3196,
				3362,
				3532,
				3706
			];
			/**
			* Returns the QR Code size for the specified version
			*
			* @param  {Number} version QR Code version
			* @return {Number}         size of QR code
			*/
			exports.getSymbolSize = function getSymbolSize(version) {
				if (!version) throw new Error("\"version\" cannot be null or undefined");
				if (version < 1 || version > 40) throw new Error("\"version\" should be in range from 1 to 40");
				return version * 4 + 17;
			};
			/**
			* Returns the total number of codewords used to store data and EC information.
			*
			* @param  {Number} version QR Code version
			* @return {Number}         Data length in bits
			*/
			exports.getSymbolTotalCodewords = function getSymbolTotalCodewords(version) {
				return CODEWORDS_COUNT[version];
			};
			/**
			* Encode data with Bose-Chaudhuri-Hocquenghem
			*
			* @param  {Number} data Value to encode
			* @return {Number}      Encoded value
			*/
			exports.getBCHDigit = function(data) {
				let digit = 0;
				while (data !== 0) {
					digit++;
					data >>>= 1;
				}
				return digit;
			};
			exports.setToSJISFunction = function setToSJISFunction(f) {
				if (typeof f !== "function") throw new Error("\"toSJISFunc\" is not a valid function.");
				toSJISFunction = f;
			};
			exports.isKanjiModeEnabled = function() {
				return typeof toSJISFunction !== "undefined";
			};
			exports.toSJIS = function toSJIS(kanji) {
				return toSJISFunction(kanji);
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/error-correction-level.js
		var require_error_correction_level = /* @__PURE__ */ __commonJSMin(((exports) => {
			exports.L = { bit: 1 };
			exports.M = { bit: 0 };
			exports.Q = { bit: 3 };
			exports.H = { bit: 2 };
			function fromString(string) {
				if (typeof string !== "string") throw new Error("Param is not a string");
				switch (string.toLowerCase()) {
					case "l":
					case "low": return exports.L;
					case "m":
					case "medium": return exports.M;
					case "q":
					case "quartile": return exports.Q;
					case "h":
					case "high": return exports.H;
					default: throw new Error("Unknown EC Level: " + string);
				}
			}
			exports.isValid = function isValid(level) {
				return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
			};
			exports.from = function from(value, defaultValue) {
				if (exports.isValid(value)) return value;
				try {
					return fromString(value);
				} catch (e) {
					return defaultValue;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/bit-buffer.js
		var require_bit_buffer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			function BitBuffer() {
				this.buffer = [];
				this.length = 0;
			}
			BitBuffer.prototype = {
				get: function(index) {
					const bufIndex = Math.floor(index / 8);
					return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
				},
				put: function(num, length) {
					for (let i = 0; i < length; i++) this.putBit((num >>> length - i - 1 & 1) === 1);
				},
				getLengthInBits: function() {
					return this.length;
				},
				putBit: function(bit) {
					const bufIndex = Math.floor(this.length / 8);
					if (this.buffer.length <= bufIndex) this.buffer.push(0);
					if (bit) this.buffer[bufIndex] |= 128 >>> this.length % 8;
					this.length++;
				}
			};
			module.exports = BitBuffer;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/bit-matrix.js
		var require_bit_matrix = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			/**
			* Helper class to handle QR Code symbol modules
			*
			* @param {Number} size Symbol size
			*/
			function BitMatrix(size) {
				if (!size || size < 1) throw new Error("BitMatrix size must be defined and greater than 0");
				this.size = size;
				this.data = new Uint8Array(size * size);
				this.reservedBit = new Uint8Array(size * size);
			}
			/**
			* Set bit value at specified location
			* If reserved flag is set, this bit will be ignored during masking process
			*
			* @param {Number}  row
			* @param {Number}  col
			* @param {Boolean} value
			* @param {Boolean} reserved
			*/
			BitMatrix.prototype.set = function(row, col, value, reserved) {
				const index = row * this.size + col;
				this.data[index] = value;
				if (reserved) this.reservedBit[index] = true;
			};
			/**
			* Returns bit value at specified location
			*
			* @param  {Number}  row
			* @param  {Number}  col
			* @return {Boolean}
			*/
			BitMatrix.prototype.get = function(row, col) {
				return this.data[row * this.size + col];
			};
			/**
			* Applies xor operator at specified location
			* (used during masking process)
			*
			* @param {Number}  row
			* @param {Number}  col
			* @param {Boolean} value
			*/
			BitMatrix.prototype.xor = function(row, col, value) {
				this.data[row * this.size + col] ^= value;
			};
			/**
			* Check if bit at specified location is reserved
			*
			* @param {Number}   row
			* @param {Number}   col
			* @return {Boolean}
			*/
			BitMatrix.prototype.isReserved = function(row, col) {
				return this.reservedBit[row * this.size + col];
			};
			module.exports = BitMatrix;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/alignment-pattern.js
		var require_alignment_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
			/**
			* Alignment pattern are fixed reference pattern in defined positions
			* in a matrix symbology, which enables the decode software to re-synchronise
			* the coordinate mapping of the image modules in the event of moderate amounts
			* of distortion of the image.
			*
			* Alignment patterns are present only in QR Code symbols of version 2 or larger
			* and their number depends on the symbol version.
			*/
			const getSymbolSize = require_utils().getSymbolSize;
			/**
			* Calculate the row/column coordinates of the center module of each alignment pattern
			* for the specified QR Code version.
			*
			* The alignment patterns are positioned symmetrically on either side of the diagonal
			* running from the top left corner of the symbol to the bottom right corner.
			*
			* Since positions are simmetrical only half of the coordinates are returned.
			* Each item of the array will represent in turn the x and y coordinate.
			* @see {@link getPositions}
			*
			* @param  {Number} version QR Code version
			* @return {Array}          Array of coordinate
			*/
			exports.getRowColCoords = function getRowColCoords(version) {
				if (version === 1) return [];
				const posCount = Math.floor(version / 7) + 2;
				const size = getSymbolSize(version);
				const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
				const positions = [size - 7];
				for (let i = 1; i < posCount - 1; i++) positions[i] = positions[i - 1] - intervals;
				positions.push(6);
				return positions.reverse();
			};
			/**
			* Returns an array containing the positions of each alignment pattern.
			* Each array's element represent the center point of the pattern as (x, y) coordinates
			*
			* Coordinates are calculated expanding the row/column coordinates returned by {@link getRowColCoords}
			* and filtering out the items that overlaps with finder pattern
			*
			* @example
			* For a Version 7 symbol {@link getRowColCoords} returns values 6, 22 and 38.
			* The alignment patterns, therefore, are to be centered on (row, column)
			* positions (6,22), (22,6), (22,22), (22,38), (38,22), (38,38).
			* Note that the coordinates (6,6), (6,38), (38,6) are occupied by finder patterns
			* and are not therefore used for alignment patterns.
			*
			* let pos = getPositions(7)
			* // [[6,22], [22,6], [22,22], [22,38], [38,22], [38,38]]
			*
			* @param  {Number} version QR Code version
			* @return {Array}          Array of coordinates
			*/
			exports.getPositions = function getPositions(version) {
				const coords = [];
				const pos = exports.getRowColCoords(version);
				const posLength = pos.length;
				for (let i = 0; i < posLength; i++) for (let j = 0; j < posLength; j++) {
					if (i === 0 && j === 0 || i === 0 && j === posLength - 1 || i === posLength - 1 && j === 0) continue;
					coords.push([pos[i], pos[j]]);
				}
				return coords;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/finder-pattern.js
		var require_finder_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
			const getSymbolSize = require_utils().getSymbolSize;
			const FINDER_PATTERN_SIZE = 7;
			/**
			* Returns an array containing the positions of each finder pattern.
			* Each array's element represent the top-left point of the pattern as (x, y) coordinates
			*
			* @param  {Number} version QR Code version
			* @return {Array}          Array of coordinates
			*/
			exports.getPositions = function getPositions(version) {
				const size = getSymbolSize(version);
				return [
					[0, 0],
					[size - FINDER_PATTERN_SIZE, 0],
					[0, size - FINDER_PATTERN_SIZE]
				];
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/mask-pattern.js
		var require_mask_pattern = /* @__PURE__ */ __commonJSMin(((exports) => {
			/**
			* Data mask pattern reference
			* @type {Object}
			*/
			exports.Patterns = {
				PATTERN000: 0,
				PATTERN001: 1,
				PATTERN010: 2,
				PATTERN011: 3,
				PATTERN100: 4,
				PATTERN101: 5,
				PATTERN110: 6,
				PATTERN111: 7
			};
			/**
			* Weighted penalty scores for the undesirable features
			* @type {Object}
			*/
			const PenaltyScores = {
				N1: 3,
				N2: 3,
				N3: 40,
				N4: 10
			};
			/**
			* Check if mask pattern value is valid
			*
			* @param  {Number}  mask    Mask pattern
			* @return {Boolean}         true if valid, false otherwise
			*/
			exports.isValid = function isValid(mask) {
				return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
			};
			/**
			* Returns mask pattern from a value.
			* If value is not valid, returns undefined
			*
			* @param  {Number|String} value        Mask pattern value
			* @return {Number}                     Valid mask pattern or undefined
			*/
			exports.from = function from(value) {
				return exports.isValid(value) ? parseInt(value, 10) : void 0;
			};
			/**
			* Find adjacent modules in row/column with the same color
			* and assign a penalty value.
			*
			* Points: N1 + i
			* i is the amount by which the number of adjacent modules of the same color exceeds 5
			*/
			exports.getPenaltyN1 = function getPenaltyN1(data) {
				const size = data.size;
				let points = 0;
				let sameCountCol = 0;
				let sameCountRow = 0;
				let lastCol = null;
				let lastRow = null;
				for (let row = 0; row < size; row++) {
					sameCountCol = sameCountRow = 0;
					lastCol = lastRow = null;
					for (let col = 0; col < size; col++) {
						let module$1 = data.get(row, col);
						if (module$1 === lastCol) sameCountCol++;
						else {
							if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
							lastCol = module$1;
							sameCountCol = 1;
						}
						module$1 = data.get(col, row);
						if (module$1 === lastRow) sameCountRow++;
						else {
							if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
							lastRow = module$1;
							sameCountRow = 1;
						}
					}
					if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
					if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
				}
				return points;
			};
			/**
			* Find 2x2 blocks with the same color and assign a penalty value
			*
			* Points: N2 * (m - 1) * (n - 1)
			*/
			exports.getPenaltyN2 = function getPenaltyN2(data) {
				const size = data.size;
				let points = 0;
				for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
					const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
					if (last === 4 || last === 0) points++;
				}
				return points * PenaltyScores.N2;
			};
			/**
			* Find 1:1:3:1:1 ratio (dark:light:dark:light:dark) pattern in row/column,
			* preceded or followed by light area 4 modules wide
			*
			* Points: N3 * number of pattern found
			*/
			exports.getPenaltyN3 = function getPenaltyN3(data) {
				const size = data.size;
				let points = 0;
				let bitsCol = 0;
				let bitsRow = 0;
				for (let row = 0; row < size; row++) {
					bitsCol = bitsRow = 0;
					for (let col = 0; col < size; col++) {
						bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
						if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
						bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
						if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
					}
				}
				return points * PenaltyScores.N3;
			};
			/**
			* Calculate proportion of dark modules in entire symbol
			*
			* Points: N4 * k
			*
			* k is the rating of the deviation of the proportion of dark modules
			* in the symbol from 50% in steps of 5%
			*/
			exports.getPenaltyN4 = function getPenaltyN4(data) {
				let darkCount = 0;
				const modulesCount = data.data.length;
				for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];
				return Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10) * PenaltyScores.N4;
			};
			/**
			* Return mask value at given position
			*
			* @param  {Number} maskPattern Pattern reference value
			* @param  {Number} i           Row
			* @param  {Number} j           Column
			* @return {Boolean}            Mask value
			*/
			function getMaskAt(maskPattern, i, j) {
				switch (maskPattern) {
					case exports.Patterns.PATTERN000: return (i + j) % 2 === 0;
					case exports.Patterns.PATTERN001: return i % 2 === 0;
					case exports.Patterns.PATTERN010: return j % 3 === 0;
					case exports.Patterns.PATTERN011: return (i + j) % 3 === 0;
					case exports.Patterns.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
					case exports.Patterns.PATTERN101: return i * j % 2 + i * j % 3 === 0;
					case exports.Patterns.PATTERN110: return (i * j % 2 + i * j % 3) % 2 === 0;
					case exports.Patterns.PATTERN111: return (i * j % 3 + (i + j) % 2) % 2 === 0;
					default: throw new Error("bad maskPattern:" + maskPattern);
				}
			}
			/**
			* Apply a mask pattern to a BitMatrix
			*
			* @param  {Number}    pattern Pattern reference number
			* @param  {BitMatrix} data    BitMatrix data
			*/
			exports.applyMask = function applyMask(pattern, data) {
				const size = data.size;
				for (let col = 0; col < size; col++) for (let row = 0; row < size; row++) {
					if (data.isReserved(row, col)) continue;
					data.xor(row, col, getMaskAt(pattern, row, col));
				}
			};
			/**
			* Returns the best mask pattern for data
			*
			* @param  {BitMatrix} data
			* @return {Number} Mask pattern reference number
			*/
			exports.getBestMask = function getBestMask(data, setupFormatFunc) {
				const numPatterns = Object.keys(exports.Patterns).length;
				let bestPattern = 0;
				let lowerPenalty = Infinity;
				for (let p = 0; p < numPatterns; p++) {
					setupFormatFunc(p);
					exports.applyMask(p, data);
					const penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
					exports.applyMask(p, data);
					if (penalty < lowerPenalty) {
						lowerPenalty = penalty;
						bestPattern = p;
					}
				}
				return bestPattern;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/error-correction-code.js
		var require_error_correction_code = /* @__PURE__ */ __commonJSMin(((exports) => {
			const ECLevel = require_error_correction_level();
			const EC_BLOCKS_TABLE = [
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				1,
				2,
				2,
				1,
				2,
				2,
				4,
				1,
				2,
				4,
				4,
				2,
				4,
				4,
				4,
				2,
				4,
				6,
				5,
				2,
				4,
				6,
				6,
				2,
				5,
				8,
				8,
				4,
				5,
				8,
				8,
				4,
				5,
				8,
				11,
				4,
				8,
				10,
				11,
				4,
				9,
				12,
				16,
				4,
				9,
				16,
				16,
				6,
				10,
				12,
				18,
				6,
				10,
				17,
				16,
				6,
				11,
				16,
				19,
				6,
				13,
				18,
				21,
				7,
				14,
				21,
				25,
				8,
				16,
				20,
				25,
				8,
				17,
				23,
				25,
				9,
				17,
				23,
				34,
				9,
				18,
				25,
				30,
				10,
				20,
				27,
				32,
				12,
				21,
				29,
				35,
				12,
				23,
				34,
				37,
				12,
				25,
				34,
				40,
				13,
				26,
				35,
				42,
				14,
				28,
				38,
				45,
				15,
				29,
				40,
				48,
				16,
				31,
				43,
				51,
				17,
				33,
				45,
				54,
				18,
				35,
				48,
				57,
				19,
				37,
				51,
				60,
				19,
				38,
				53,
				63,
				20,
				40,
				56,
				66,
				21,
				43,
				59,
				70,
				22,
				45,
				62,
				74,
				24,
				47,
				65,
				77,
				25,
				49,
				68,
				81
			];
			const EC_CODEWORDS_TABLE = [
				7,
				10,
				13,
				17,
				10,
				16,
				22,
				28,
				15,
				26,
				36,
				44,
				20,
				36,
				52,
				64,
				26,
				48,
				72,
				88,
				36,
				64,
				96,
				112,
				40,
				72,
				108,
				130,
				48,
				88,
				132,
				156,
				60,
				110,
				160,
				192,
				72,
				130,
				192,
				224,
				80,
				150,
				224,
				264,
				96,
				176,
				260,
				308,
				104,
				198,
				288,
				352,
				120,
				216,
				320,
				384,
				132,
				240,
				360,
				432,
				144,
				280,
				408,
				480,
				168,
				308,
				448,
				532,
				180,
				338,
				504,
				588,
				196,
				364,
				546,
				650,
				224,
				416,
				600,
				700,
				224,
				442,
				644,
				750,
				252,
				476,
				690,
				816,
				270,
				504,
				750,
				900,
				300,
				560,
				810,
				960,
				312,
				588,
				870,
				1050,
				336,
				644,
				952,
				1110,
				360,
				700,
				1020,
				1200,
				390,
				728,
				1050,
				1260,
				420,
				784,
				1140,
				1350,
				450,
				812,
				1200,
				1440,
				480,
				868,
				1290,
				1530,
				510,
				924,
				1350,
				1620,
				540,
				980,
				1440,
				1710,
				570,
				1036,
				1530,
				1800,
				570,
				1064,
				1590,
				1890,
				600,
				1120,
				1680,
				1980,
				630,
				1204,
				1770,
				2100,
				660,
				1260,
				1860,
				2220,
				720,
				1316,
				1950,
				2310,
				750,
				1372,
				2040,
				2430
			];
			/**
			* Returns the number of error correction block that the QR Code should contain
			* for the specified version and error correction level.
			*
			* @param  {Number} version              QR Code version
			* @param  {Number} errorCorrectionLevel Error correction level
			* @return {Number}                      Number of error correction blocks
			*/
			exports.getBlocksCount = function getBlocksCount(version, errorCorrectionLevel) {
				switch (errorCorrectionLevel) {
					case ECLevel.L: return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
					case ECLevel.M: return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
					case ECLevel.Q: return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
					case ECLevel.H: return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
					default: return;
				}
			};
			/**
			* Returns the number of error correction codewords to use for the specified
			* version and error correction level.
			*
			* @param  {Number} version              QR Code version
			* @param  {Number} errorCorrectionLevel Error correction level
			* @return {Number}                      Number of error correction codewords
			*/
			exports.getTotalCodewordsCount = function getTotalCodewordsCount(version, errorCorrectionLevel) {
				switch (errorCorrectionLevel) {
					case ECLevel.L: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
					case ECLevel.M: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
					case ECLevel.Q: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
					case ECLevel.H: return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
					default: return;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/galois-field.js
		var require_galois_field = /* @__PURE__ */ __commonJSMin(((exports) => {
			const EXP_TABLE = /* @__PURE__ */ new Uint8Array(512);
			const LOG_TABLE = /* @__PURE__ */ new Uint8Array(256);
			(function initTables() {
				let x = 1;
				for (let i = 0; i < 255; i++) {
					EXP_TABLE[i] = x;
					LOG_TABLE[x] = i;
					x <<= 1;
					if (x & 256) x ^= 285;
				}
				for (let i = 255; i < 512; i++) EXP_TABLE[i] = EXP_TABLE[i - 255];
			})();
			/**
			* Returns log value of n inside Galois Field
			*
			* @param  {Number} n
			* @return {Number}
			*/
			exports.log = function log(n) {
				if (n < 1) throw new Error("log(" + n + ")");
				return LOG_TABLE[n];
			};
			/**
			* Returns anti-log value of n inside Galois Field
			*
			* @param  {Number} n
			* @return {Number}
			*/
			exports.exp = function exp(n) {
				return EXP_TABLE[n];
			};
			/**
			* Multiplies two number inside Galois Field
			*
			* @param  {Number} x
			* @param  {Number} y
			* @return {Number}
			*/
			exports.mul = function mul(x, y) {
				if (x === 0 || y === 0) return 0;
				return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/polynomial.js
		var require_polynomial = /* @__PURE__ */ __commonJSMin(((exports) => {
			const GF = require_galois_field();
			/**
			* Multiplies two polynomials inside Galois Field
			*
			* @param  {Uint8Array} p1 Polynomial
			* @param  {Uint8Array} p2 Polynomial
			* @return {Uint8Array}    Product of p1 and p2
			*/
			exports.mul = function mul(p1, p2) {
				const coeff = new Uint8Array(p1.length + p2.length - 1);
				for (let i = 0; i < p1.length; i++) for (let j = 0; j < p2.length; j++) coeff[i + j] ^= GF.mul(p1[i], p2[j]);
				return coeff;
			};
			/**
			* Calculate the remainder of polynomials division
			*
			* @param  {Uint8Array} divident Polynomial
			* @param  {Uint8Array} divisor  Polynomial
			* @return {Uint8Array}          Remainder
			*/
			exports.mod = function mod(divident, divisor) {
				let result = new Uint8Array(divident);
				while (result.length - divisor.length >= 0) {
					const coeff = result[0];
					for (let i = 0; i < divisor.length; i++) result[i] ^= GF.mul(divisor[i], coeff);
					let offset = 0;
					while (offset < result.length && result[offset] === 0) offset++;
					result = result.slice(offset);
				}
				return result;
			};
			/**
			* Generate an irreducible generator polynomial of specified degree
			* (used by Reed-Solomon encoder)
			*
			* @param  {Number} degree Degree of the generator polynomial
			* @return {Uint8Array}    Buffer containing polynomial coefficients
			*/
			exports.generateECPolynomial = function generateECPolynomial(degree) {
				let poly = new Uint8Array([1]);
				for (let i = 0; i < degree; i++) poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
				return poly;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/reed-solomon-encoder.js
		var require_reed_solomon_encoder = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Polynomial = require_polynomial();
			function ReedSolomonEncoder(degree) {
				this.genPoly = void 0;
				this.degree = degree;
				if (this.degree) this.initialize(this.degree);
			}
			/**
			* Initialize the encoder.
			* The input param should correspond to the number of error correction codewords.
			*
			* @param  {Number} degree
			*/
			ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
				this.degree = degree;
				this.genPoly = Polynomial.generateECPolynomial(this.degree);
			};
			/**
			* Encodes a chunk of data
			*
			* @param  {Uint8Array} data Buffer containing input data
			* @return {Uint8Array}      Buffer containing encoded data
			*/
			ReedSolomonEncoder.prototype.encode = function encode(data) {
				if (!this.genPoly) throw new Error("Encoder not initialized");
				const paddedData = new Uint8Array(data.length + this.degree);
				paddedData.set(data);
				const remainder = Polynomial.mod(paddedData, this.genPoly);
				const start = this.degree - remainder.length;
				if (start > 0) {
					const buff = new Uint8Array(this.degree);
					buff.set(remainder, start);
					return buff;
				}
				return remainder;
			};
			module.exports = ReedSolomonEncoder;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/version-check.js
		var require_version_check = /* @__PURE__ */ __commonJSMin(((exports) => {
			/**
			* Check if QR Code version is valid
			*
			* @param  {Number}  version QR Code version
			* @return {Boolean}         true if valid version, false otherwise
			*/
			exports.isValid = function isValid(version) {
				return !isNaN(version) && version >= 1 && version <= 40;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/regex.js
		var require_regex = /* @__PURE__ */ __commonJSMin(((exports) => {
			const numeric = "[0-9]+";
			const alphanumeric = "[A-Z $%*+\\-./:]+";
			let kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
			kanji = kanji.replace(/u/g, "\\u");
			const byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
			exports.KANJI = new RegExp(kanji, "g");
			exports.BYTE_KANJI = /* @__PURE__ */ new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
			exports.BYTE = new RegExp(byte, "g");
			exports.NUMERIC = new RegExp(numeric, "g");
			exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
			const TEST_KANJI = new RegExp("^" + kanji + "$");
			const TEST_NUMERIC = /* @__PURE__ */ new RegExp("^[0-9]+$");
			const TEST_ALPHANUMERIC = /* @__PURE__ */ new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
			exports.testKanji = function testKanji(str) {
				return TEST_KANJI.test(str);
			};
			exports.testNumeric = function testNumeric(str) {
				return TEST_NUMERIC.test(str);
			};
			exports.testAlphanumeric = function testAlphanumeric(str) {
				return TEST_ALPHANUMERIC.test(str);
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/mode.js
		var require_mode = /* @__PURE__ */ __commonJSMin(((exports) => {
			const VersionCheck = require_version_check();
			const Regex = require_regex();
			/**
			* Numeric mode encodes data from the decimal digit set (0 - 9)
			* (byte values 30HEX to 39HEX).
			* Normally, 3 data characters are represented by 10 bits.
			*
			* @type {Object}
			*/
			exports.NUMERIC = {
				id: "Numeric",
				bit: 1,
				ccBits: [
					10,
					12,
					14
				]
			};
			/**
			* Alphanumeric mode encodes data from a set of 45 characters,
			* i.e. 10 numeric digits (0 - 9),
			*      26 alphabetic characters (A - Z),
			*   and 9 symbols (SP, $, %, *, +, -, ., /, :).
			* Normally, two input characters are represented by 11 bits.
			*
			* @type {Object}
			*/
			exports.ALPHANUMERIC = {
				id: "Alphanumeric",
				bit: 2,
				ccBits: [
					9,
					11,
					13
				]
			};
			/**
			* In byte mode, data is encoded at 8 bits per character.
			*
			* @type {Object}
			*/
			exports.BYTE = {
				id: "Byte",
				bit: 4,
				ccBits: [
					8,
					16,
					16
				]
			};
			/**
			* The Kanji mode efficiently encodes Kanji characters in accordance with
			* the Shift JIS system based on JIS X 0208.
			* The Shift JIS values are shifted from the JIS X 0208 values.
			* JIS X 0208 gives details of the shift coded representation.
			* Each two-byte character value is compacted to a 13-bit binary codeword.
			*
			* @type {Object}
			*/
			exports.KANJI = {
				id: "Kanji",
				bit: 8,
				ccBits: [
					8,
					10,
					12
				]
			};
			/**
			* Mixed mode will contain a sequences of data in a combination of any of
			* the modes described above
			*
			* @type {Object}
			*/
			exports.MIXED = { bit: -1 };
			/**
			* Returns the number of bits needed to store the data length
			* according to QR Code specifications.
			*
			* @param  {Mode}   mode    Data mode
			* @param  {Number} version QR Code version
			* @return {Number}         Number of bits
			*/
			exports.getCharCountIndicator = function getCharCountIndicator(mode, version) {
				if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
				if (!VersionCheck.isValid(version)) throw new Error("Invalid version: " + version);
				if (version >= 1 && version < 10) return mode.ccBits[0];
				else if (version < 27) return mode.ccBits[1];
				return mode.ccBits[2];
			};
			/**
			* Returns the most efficient mode to store the specified data
			*
			* @param  {String} dataStr Input data string
			* @return {Mode}           Best mode
			*/
			exports.getBestModeForData = function getBestModeForData(dataStr) {
				if (Regex.testNumeric(dataStr)) return exports.NUMERIC;
				else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC;
				else if (Regex.testKanji(dataStr)) return exports.KANJI;
				else return exports.BYTE;
			};
			/**
			* Return mode name as string
			*
			* @param {Mode} mode Mode object
			* @returns {String}  Mode name
			*/
			exports.toString = function toString(mode) {
				if (mode && mode.id) return mode.id;
				throw new Error("Invalid mode");
			};
			/**
			* Check if input param is a valid mode object
			*
			* @param   {Mode}    mode Mode object
			* @returns {Boolean} True if valid mode, false otherwise
			*/
			exports.isValid = function isValid(mode) {
				return mode && mode.bit && mode.ccBits;
			};
			/**
			* Get mode object from its name
			*
			* @param   {String} string Mode name
			* @returns {Mode}          Mode object
			*/
			function fromString(string) {
				if (typeof string !== "string") throw new Error("Param is not a string");
				switch (string.toLowerCase()) {
					case "numeric": return exports.NUMERIC;
					case "alphanumeric": return exports.ALPHANUMERIC;
					case "kanji": return exports.KANJI;
					case "byte": return exports.BYTE;
					default: throw new Error("Unknown mode: " + string);
				}
			}
			/**
			* Returns mode from a value.
			* If value is not a valid mode, returns defaultValue
			*
			* @param  {Mode|String} value        Encoding mode
			* @param  {Mode}        defaultValue Fallback value
			* @return {Mode}                     Encoding mode
			*/
			exports.from = function from(value, defaultValue) {
				if (exports.isValid(value)) return value;
				try {
					return fromString(value);
				} catch (e) {
					return defaultValue;
				}
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/version.js
		var require_version = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils();
			const ECCode = require_error_correction_code();
			const ECLevel = require_error_correction_level();
			const Mode = require_mode();
			const VersionCheck = require_version_check();
			const G18 = 7973;
			const G18_BCH = Utils.getBCHDigit(G18);
			function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
				for (let currentVersion = 1; currentVersion <= 40; currentVersion++) if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode)) return currentVersion;
			}
			function getReservedBitsCount(mode, version) {
				return Mode.getCharCountIndicator(mode, version) + 4;
			}
			function getTotalBitsFromDataArray(segments, version) {
				let totalBits = 0;
				segments.forEach(function(data) {
					const reservedBits = getReservedBitsCount(data.mode, version);
					totalBits += reservedBits + data.getBitsLength();
				});
				return totalBits;
			}
			function getBestVersionForMixedData(segments, errorCorrectionLevel) {
				for (let currentVersion = 1; currentVersion <= 40; currentVersion++) if (getTotalBitsFromDataArray(segments, currentVersion) <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) return currentVersion;
			}
			/**
			* Returns version number from a value.
			* If value is not a valid version, returns defaultValue
			*
			* @param  {Number|String} value        QR Code version
			* @param  {Number}        defaultValue Fallback value
			* @return {Number}                     QR Code version number
			*/
			exports.from = function from(value, defaultValue) {
				if (VersionCheck.isValid(value)) return parseInt(value, 10);
				return defaultValue;
			};
			/**
			* Returns how much data can be stored with the specified QR code version
			* and error correction level
			*
			* @param  {Number} version              QR Code version (1-40)
			* @param  {Number} errorCorrectionLevel Error correction level
			* @param  {Mode}   mode                 Data mode
			* @return {Number}                      Quantity of storable data
			*/
			exports.getCapacity = function getCapacity(version, errorCorrectionLevel, mode) {
				if (!VersionCheck.isValid(version)) throw new Error("Invalid QR Code version");
				if (typeof mode === "undefined") mode = Mode.BYTE;
				const dataTotalCodewordsBits = (Utils.getSymbolTotalCodewords(version) - ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)) * 8;
				if (mode === Mode.MIXED) return dataTotalCodewordsBits;
				const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
				switch (mode) {
					case Mode.NUMERIC: return Math.floor(usableBits / 10 * 3);
					case Mode.ALPHANUMERIC: return Math.floor(usableBits / 11 * 2);
					case Mode.KANJI: return Math.floor(usableBits / 13);
					case Mode.BYTE:
					default: return Math.floor(usableBits / 8);
				}
			};
			/**
			* Returns the minimum version needed to contain the amount of data
			*
			* @param  {Segment} data                    Segment of data
			* @param  {Number} [errorCorrectionLevel=H] Error correction level
			* @param  {Mode} mode                       Data mode
			* @return {Number}                          QR Code version
			*/
			exports.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel) {
				let seg;
				const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
				if (Array.isArray(data)) {
					if (data.length > 1) return getBestVersionForMixedData(data, ecl);
					if (data.length === 0) return 1;
					seg = data[0];
				} else seg = data;
				return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
			};
			/**
			* Returns version information with relative error correction bits
			*
			* The version information is included in QR Code symbols of version 7 or larger.
			* It consists of an 18-bit sequence containing 6 data bits,
			* with 12 error correction bits calculated using the (18, 6) Golay code.
			*
			* @param  {Number} version QR Code version
			* @return {Number}         Encoded version info bits
			*/
			exports.getEncodedBits = function getEncodedBits(version) {
				if (!VersionCheck.isValid(version) || version < 7) throw new Error("Invalid QR Code version");
				let d = version << 12;
				while (Utils.getBCHDigit(d) - G18_BCH >= 0) d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
				return version << 12 | d;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/format-info.js
		var require_format_info = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils();
			const G15 = 1335;
			const G15_MASK = 21522;
			const G15_BCH = Utils.getBCHDigit(G15);
			/**
			* Returns format information with relative error correction bits
			*
			* The format information is a 15-bit sequence containing 5 data bits,
			* with 10 error correction bits calculated using the (15, 5) BCH code.
			*
			* @param  {Number} errorCorrectionLevel Error correction level
			* @param  {Number} mask                 Mask pattern
			* @return {Number}                      Encoded format information bits
			*/
			exports.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
				const data = errorCorrectionLevel.bit << 3 | mask;
				let d = data << 10;
				while (Utils.getBCHDigit(d) - G15_BCH >= 0) d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
				return (data << 10 | d) ^ G15_MASK;
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/numeric-data.js
		var require_numeric_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			function NumericData(data) {
				this.mode = Mode.NUMERIC;
				this.data = data.toString();
			}
			NumericData.getBitsLength = function getBitsLength(length) {
				return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
			};
			NumericData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			NumericData.prototype.getBitsLength = function getBitsLength() {
				return NumericData.getBitsLength(this.data.length);
			};
			NumericData.prototype.write = function write(bitBuffer) {
				let i, group, value;
				for (i = 0; i + 3 <= this.data.length; i += 3) {
					group = this.data.substr(i, 3);
					value = parseInt(group, 10);
					bitBuffer.put(value, 10);
				}
				const remainingNum = this.data.length - i;
				if (remainingNum > 0) {
					group = this.data.substr(i);
					value = parseInt(group, 10);
					bitBuffer.put(value, remainingNum * 3 + 1);
				}
			};
			module.exports = NumericData;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/alphanumeric-data.js
		var require_alphanumeric_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			/**
			* Array of characters available in alphanumeric mode
			*
			* As per QR Code specification, to each character
			* is assigned a value from 0 to 44 which in this case coincides
			* with the array index
			*
			* @type {Array}
			*/
			const ALPHA_NUM_CHARS = [
				"0",
				"1",
				"2",
				"3",
				"4",
				"5",
				"6",
				"7",
				"8",
				"9",
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"G",
				"H",
				"I",
				"J",
				"K",
				"L",
				"M",
				"N",
				"O",
				"P",
				"Q",
				"R",
				"S",
				"T",
				"U",
				"V",
				"W",
				"X",
				"Y",
				"Z",
				" ",
				"$",
				"%",
				"*",
				"+",
				"-",
				".",
				"/",
				":"
			];
			function AlphanumericData(data) {
				this.mode = Mode.ALPHANUMERIC;
				this.data = data;
			}
			AlphanumericData.getBitsLength = function getBitsLength(length) {
				return 11 * Math.floor(length / 2) + 6 * (length % 2);
			};
			AlphanumericData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			AlphanumericData.prototype.getBitsLength = function getBitsLength() {
				return AlphanumericData.getBitsLength(this.data.length);
			};
			AlphanumericData.prototype.write = function write(bitBuffer) {
				let i;
				for (i = 0; i + 2 <= this.data.length; i += 2) {
					let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
					value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
					bitBuffer.put(value, 11);
				}
				if (this.data.length % 2) bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
			};
			module.exports = AlphanumericData;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/byte-data.js
		var require_byte_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			function ByteData(data) {
				this.mode = Mode.BYTE;
				if (typeof data === "string") this.data = new TextEncoder().encode(data);
				else this.data = new Uint8Array(data);
			}
			ByteData.getBitsLength = function getBitsLength(length) {
				return length * 8;
			};
			ByteData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			ByteData.prototype.getBitsLength = function getBitsLength() {
				return ByteData.getBitsLength(this.data.length);
			};
			ByteData.prototype.write = function(bitBuffer) {
				for (let i = 0, l = this.data.length; i < l; i++) bitBuffer.put(this.data[i], 8);
			};
			module.exports = ByteData;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/kanji-data.js
		var require_kanji_data = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Mode = require_mode();
			const Utils = require_utils();
			function KanjiData(data) {
				this.mode = Mode.KANJI;
				this.data = data;
			}
			KanjiData.getBitsLength = function getBitsLength(length) {
				return length * 13;
			};
			KanjiData.prototype.getLength = function getLength() {
				return this.data.length;
			};
			KanjiData.prototype.getBitsLength = function getBitsLength() {
				return KanjiData.getBitsLength(this.data.length);
			};
			KanjiData.prototype.write = function(bitBuffer) {
				let i;
				for (i = 0; i < this.data.length; i++) {
					let value = Utils.toSJIS(this.data[i]);
					if (value >= 33088 && value <= 40956) value -= 33088;
					else if (value >= 57408 && value <= 60351) value -= 49472;
					else throw new Error("Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8");
					value = (value >>> 8 & 255) * 192 + (value & 255);
					bitBuffer.put(value, 13);
				}
			};
			module.exports = KanjiData;
		}));
		//#endregion
		//#region node_modules/.pnpm/dijkstrajs@1.0.3/node_modules/dijkstrajs/dijkstra.js
		var require_dijkstra = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			/******************************************************************************
			* Created 2008-08-19.
			*
			* Dijkstra path-finding functions. Adapted from the Dijkstar Python project.
			*
			* Copyright (C) 2008
			*   Wyatt Baldwin <self@wyattbaldwin.com>
			*   All rights reserved
			*
			* Licensed under the MIT license.
			*
			*   http://www.opensource.org/licenses/mit-license.php
			*
			* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
			* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
			* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
			* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
			* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
			* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
			* THE SOFTWARE.
			*****************************************************************************/
			var dijkstra = {
				single_source_shortest_paths: function(graph, s, d) {
					var predecessors = {};
					var costs = {};
					costs[s] = 0;
					var open = dijkstra.PriorityQueue.make();
					open.push(s, 0);
					var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
					while (!open.empty()) {
						closest = open.pop();
						u = closest.value;
						cost_of_s_to_u = closest.cost;
						adjacent_nodes = graph[u] || {};
						for (v in adjacent_nodes) if (adjacent_nodes.hasOwnProperty(v)) {
							cost_of_e = adjacent_nodes[v];
							cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
							cost_of_s_to_v = costs[v];
							first_visit = typeof costs[v] === "undefined";
							if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
								costs[v] = cost_of_s_to_u_plus_cost_of_e;
								open.push(v, cost_of_s_to_u_plus_cost_of_e);
								predecessors[v] = u;
							}
						}
					}
					if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
						var msg = [
							"Could not find a path from ",
							s,
							" to ",
							d,
							"."
						].join("");
						throw new Error(msg);
					}
					return predecessors;
				},
				extract_shortest_path_from_predecessor_list: function(predecessors, d) {
					var nodes = [];
					var u = d;
					while (u) {
						nodes.push(u);
						predecessors[u];
						u = predecessors[u];
					}
					nodes.reverse();
					return nodes;
				},
				find_path: function(graph, s, d) {
					var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
					return dijkstra.extract_shortest_path_from_predecessor_list(predecessors, d);
				},
				/**
				* A very naive priority queue implementation.
				*/
				PriorityQueue: {
					make: function(opts) {
						var T = dijkstra.PriorityQueue, t = {}, key;
						opts = opts || {};
						for (key in T) if (T.hasOwnProperty(key)) t[key] = T[key];
						t.queue = [];
						t.sorter = opts.sorter || T.default_sorter;
						return t;
					},
					default_sorter: function(a, b) {
						return a.cost - b.cost;
					},
					/**
					* Add a new item to the queue and ensure the highest priority element
					* is at the front of the queue.
					*/
					push: function(value, cost) {
						var item = {
							value,
							cost
						};
						this.queue.push(item);
						this.queue.sort(this.sorter);
					},
					/**
					* Return the highest priority element in the queue.
					*/
					pop: function() {
						return this.queue.shift();
					},
					empty: function() {
						return this.queue.length === 0;
					}
				}
			};
			if (typeof module !== "undefined") module.exports = dijkstra;
		}));
		//#endregion
		//#region node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/core/segments.js
		var require_segments = /* @__PURE__ */ __commonJSMin(((exports) => {
			const Mode = require_mode();
			const NumericData = require_numeric_data();
			const AlphanumericData = require_alphanumeric_data();
			const ByteData = require_byte_data();
			const KanjiData = require_kanji_data();
			const Regex = require_regex();
			const Utils = require_utils();
			const dijkstra = require_dijkstra();
			/**
			* Returns UTF8 byte length
			*
			* @param  {String} str Input string
			* @return {Number}     Number of byte
			*/
			function getStringByteLength(str) {
				return unescape(encodeURIComponent(str)).length;
			}
			/**
			* Get a list of segments of the specified mode
			* from a string
			*
			* @param  {Mode}   mode Segment mode
			* @param  {String} str  String to process
			* @return {Array}       Array of object with segments data
			*/
			function getSegments(regex, mode, str) {
				const segments = [];
				let result;
				while ((result = regex.exec(str)) !== null) segments.push({
					data: result[0],
					index: result.index,
					mode,
					length: result[0].length
				});
				return segments;
			}
			/**
			* Extracts a series of segments with the appropriate
			* modes from a string
			*
			* @param  {String} dataStr Input string
			* @return {Array}          Array of object with segments data
			*/
			function getSegmentsFromString(dataStr) {
				const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
				const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
				let byteSegs;
				let kanjiSegs;
				if (Utils.isKanjiModeEnabled()) {
					byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
					kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
				} else {
					byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
					kanjiSegs = [];
				}
				return numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs).sort(function(s1, s2) {
					return s1.index - s2.index;
				}).map(function(obj) {
					return {
						data: obj.data,
						mode: obj.mode,
						length: obj.length
					};
				});
			}
			/**
			* Returns how many bits are needed to encode a string of
			* specified length with the specified mode
			*
			* @param  {Number} length String length
			* @param  {Mode} mode     Segment mode
			* @return {Number}        Bit length
			*/
			function getSegmentBitsLength(length, mode) {
				switch (mode) {
					case Mode.NUMERIC: return NumericData.getBitsLength(length);
					case Mode.ALPHANUMERIC: return AlphanumericData.getBitsLength(length);
					case Mode.KANJI: return KanjiData.getBitsLength(length);
					case Mode.BYTE: return ByteData.getBitsLength(length);
				}
			}
			/**
			* Merges adjacent segments which have the same mode
			*
			* @param  {Array} segs Array of object with segments data
			* @return {Array}      Array of object with segments data
			*/
			function mergeSegments(segs) {
				return segs.reduce(function(acc, curr) {
					const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
					if (prevSeg && prevSeg.mode === curr.mode) {
						acc[acc.length - 1].data += curr.data;
						return acc;
					}
					acc.push(curr);
					return acc;
				}, []);
			}
			/**
			* Generates a list of all possible nodes combination which
			* will be used to build a segments graph.
			*
			* Nodes are divided by groups. Each group will contain a list of all the modes
			* in which is possible to encode the given text.
			*
			* For example the text '12345' can be encoded as Numeric, Alphanumeric or Byte.
			* The group for '12345' will contain then 3 objects, one for each
			* possible encoding mode.
			*
			* Each node represents a possible segment.
			*
			* @param  {Array} segs Array of object with segments data
			* @return {Array}      Array of object with segments data
			*/
			function buildNodes(segs) {
				const nodes = [];
				for (let i = 0; i < segs.length; i++) {
					const seg = segs[i];
					switch (seg.mode) {
						case Mode.NUMERIC:
							nodes.push([
								seg,
								{
									data: seg.data,
									mode: Mode.ALPHANUMERIC,
									length: seg.length
								},
								{
									data: seg.data,
									mode: Mode.BYTE,
									length: seg.length
								}
							]);
							break;
						case Mode.ALPHANUMERIC:
							nodes.push([seg, {
								data: seg.data,
								mode: Mode.BYTE,
								length: seg.length
							}]);
							break;
						case Mode.KANJI:
							nodes.push([seg, {
								data: seg.data,
								mode: Mode.BYTE,
								length: getStringByteLength(seg.data)
							}]);
							break;
						case Mode.BYTE: nodes.push([{
							data: seg.data,
							mode: Mode.BYTE,
							length: getStringByteLength(seg.data)
						}]);
					}
				}
				return nodes;
			}
			/**
			* Builds a graph from a list of nodes.
			* All segments in each node group will be connected with all the segments of
			* the next group and so on.
			*
			* At each connection will be assigned a weight depending on the
			* segment's byte length.
			*
			* @param  {Array} nodes    Array of object with segments data
			* @param  {Number} version QR Code version
			* @return {Object}         Graph of all possible segments
			*/
			function buildGraph(nodes, version) {
				const table = {};
				const graph = { start: {} };
				let prevNodeIds = ["start"];
				for (let i = 0; i < nodes.length; i++) {
					const nodeGroup = nodes[i];
					const currentNodeIds = [];
					for (let j = 0; j < nodeGroup.length; j++) {
						const node = nodeGroup[j];
						const key = "" + i + j;
						currentNodeIds.push(key);
						table[key] = {
							node,
							lastCount: 0
						};
						graph[key] = {};
						for (let n = 0; n < prevNodeIds.length; n++) {
							const prevNodeId = prevNodeIds[n];
							if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
								graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
								table[prevNodeId].lastCount += node.length;
							} else {
								if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
								graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version);
							}
						}
					}
					prevNodeIds = currentNodeIds;
				}
				for (let n = 0; n < prevNodeIds.length; n++) graph[prevNodeIds[n]].end = 0;
				return {
					map: graph,
					table
				};
			}
			/**
			* Builds a segment from a specified data and mode.
			* If a mode is not specified, the more suitable will be used.
			*
			* @param  {String} data             Input data
			* @param  {Mode | String} modesHint Data mode
			* @return {Segment}                 Segment
			*/
			function buildSingleSegment(data, modesHint) {
				let mode;
				const bestMode = Mode.getBestModeForData(data);
				mode = Mode.from(modesHint, bestMode);
				if (mode !== Mode.BYTE && mode.bit < bestMode.bit) throw new Error("\"" + data + "\" cannot be encoded with mode " + Mode.toString(mode) + ".\n Suggested mode is: " + Mode.toString(bestMode));
				if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) mode = Mode.BYTE;
				switch (mode) {
					case Mode.NUMERIC: return new NumericData(data);
					case Mode.ALPHANUMERIC: return new AlphanumericData(data);
					case Mode.KANJI: return new KanjiData(data);
					case Mode.BYTE: return new ByteData(data);
				}
			}
			/**
			* Builds a list of segments from an array.
			* Array can contain Strings or Objects with segment's info.
			*
			* For each item which is a string, will be generated a segment with the given
			* string and the more appropriate encoding mode.
			*
			* For each item which is an object, will be generated a segment with the given
			* data and mode.
			* Objects must contain at least the property "data".
			* If property "mode" is not present, the more suitable mode will be used.
			*
			* @param  {Array} array Array of objects with segments data
			* @return {Array}       Array of Segments
			*/
			exports.fromArray = function fromArray(array) {
				return array.reduce(function(acc, seg) {
					if (typeof seg === "string") acc.push(buildSingleSegment(seg, null));
					else if (seg.data) acc.push(buildSingleSegment(seg.data, seg.mode));
					return acc;
				}, []);
			};
			/**
			* Builds an optimized sequence of segments from a string,
			* which will produce the shortest possible bitstream.
			*
			* @param  {String} data    Input string
			* @param  {Number} version QR Code version
			* @return {Array}          Array of segments
			*/
			exports.fromString = function fromString(data, version) {
				const graph = buildGraph(buildNodes(getSegmentsFromString(data, Utils.isKanjiModeEnabled())), version);
				const path = dijkstra.find_path(graph.map, "start", "end");
				const optimizedSegs = [];
				for (let i = 1; i < path.length - 1; i++) optimizedSegs.push(graph.table[path[i]].node);
				return exports.fromArray(mergeSegments(optimizedSegs));
			};
			/**
			* Splits a string in various segments with the modes which
			* best represent their content.
			* The produced segments are far from being optimized.
			* The output of this function is only used to estimate a QR Code version
			* which may contain the data.
			*
			* @param  {string} data Input string
			* @return {Array}       Array of segments
			*/
			exports.rawSplit = function rawSplit(data) {
				return exports.fromArray(getSegmentsFromString(data, Utils.isKanjiModeEnabled()));
			};
		}));
		//#endregion
		//#region src/client-remote-control.jsx
		var import_qrcode = (/* @__PURE__ */ __commonJSMin(((exports) => {
			const Utils = require_utils();
			const ECLevel = require_error_correction_level();
			const BitBuffer = require_bit_buffer();
			const BitMatrix = require_bit_matrix();
			const AlignmentPattern = require_alignment_pattern();
			const FinderPattern = require_finder_pattern();
			const MaskPattern = require_mask_pattern();
			const ECCode = require_error_correction_code();
			const ReedSolomonEncoder = require_reed_solomon_encoder();
			const Version = require_version();
			const FormatInfo = require_format_info();
			const Mode = require_mode();
			const Segments = require_segments();
			/**
			* QRCode for JavaScript
			*
			* modified by Ryan Day for nodejs support
			* Copyright (c) 2011 Ryan Day
			*
			* Licensed under the MIT license:
			*   http://www.opensource.org/licenses/mit-license.php
			*
			//---------------------------------------------------------------------
			// QRCode for JavaScript
			//
			// Copyright (c) 2009 Kazuhiko Arase
			//
			// URL: http://www.d-project.com/
			//
			// Licensed under the MIT license:
			//   http://www.opensource.org/licenses/mit-license.php
			//
			// The word "QR Code" is registered trademark of
			// DENSO WAVE INCORPORATED
			//   http://www.denso-wave.com/qrcode/faqpatent-e.html
			//
			//---------------------------------------------------------------------
			*/
			/**
			* Add finder patterns bits to matrix
			*
			* @param  {BitMatrix} matrix  Modules matrix
			* @param  {Number}    version QR Code version
			*/
			function setupFinderPattern(matrix, version) {
				const size = matrix.size;
				const pos = FinderPattern.getPositions(version);
				for (let i = 0; i < pos.length; i++) {
					const row = pos[i][0];
					const col = pos[i][1];
					for (let r = -1; r <= 7; r++) {
						if (row + r <= -1 || size <= row + r) continue;
						for (let c = -1; c <= 7; c++) {
							if (col + c <= -1 || size <= col + c) continue;
							if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) matrix.set(row + r, col + c, true, true);
							else matrix.set(row + r, col + c, false, true);
						}
					}
				}
			}
			/**
			* Add timing pattern bits to matrix
			*
			* Note: this function must be called before {@link setupAlignmentPattern}
			*
			* @param  {BitMatrix} matrix Modules matrix
			*/
			function setupTimingPattern(matrix) {
				const size = matrix.size;
				for (let r = 8; r < size - 8; r++) {
					const value = r % 2 === 0;
					matrix.set(r, 6, value, true);
					matrix.set(6, r, value, true);
				}
			}
			/**
			* Add alignment patterns bits to matrix
			*
			* Note: this function must be called after {@link setupTimingPattern}
			*
			* @param  {BitMatrix} matrix  Modules matrix
			* @param  {Number}    version QR Code version
			*/
			function setupAlignmentPattern(matrix, version) {
				const pos = AlignmentPattern.getPositions(version);
				for (let i = 0; i < pos.length; i++) {
					const row = pos[i][0];
					const col = pos[i][1];
					for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) matrix.set(row + r, col + c, true, true);
					else matrix.set(row + r, col + c, false, true);
				}
			}
			/**
			* Add version info bits to matrix
			*
			* @param  {BitMatrix} matrix  Modules matrix
			* @param  {Number}    version QR Code version
			*/
			function setupVersionInfo(matrix, version) {
				const size = matrix.size;
				const bits = Version.getEncodedBits(version);
				let row, col, mod;
				for (let i = 0; i < 18; i++) {
					row = Math.floor(i / 3);
					col = i % 3 + size - 8 - 3;
					mod = (bits >> i & 1) === 1;
					matrix.set(row, col, mod, true);
					matrix.set(col, row, mod, true);
				}
			}
			/**
			* Add format info bits to matrix
			*
			* @param  {BitMatrix} matrix               Modules matrix
			* @param  {ErrorCorrectionLevel}    errorCorrectionLevel Error correction level
			* @param  {Number}    maskPattern          Mask pattern reference value
			*/
			function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
				const size = matrix.size;
				const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
				let i, mod;
				for (i = 0; i < 15; i++) {
					mod = (bits >> i & 1) === 1;
					if (i < 6) matrix.set(i, 8, mod, true);
					else if (i < 8) matrix.set(i + 1, 8, mod, true);
					else matrix.set(size - 15 + i, 8, mod, true);
					if (i < 8) matrix.set(8, size - i - 1, mod, true);
					else if (i < 9) matrix.set(8, 15 - i - 1 + 1, mod, true);
					else matrix.set(8, 15 - i - 1, mod, true);
				}
				matrix.set(size - 8, 8, 1, true);
			}
			/**
			* Add encoded data bits to matrix
			*
			* @param  {BitMatrix}  matrix Modules matrix
			* @param  {Uint8Array} data   Data codewords
			*/
			function setupData(matrix, data) {
				const size = matrix.size;
				let inc = -1;
				let row = size - 1;
				let bitIndex = 7;
				let byteIndex = 0;
				for (let col = size - 1; col > 0; col -= 2) {
					if (col === 6) col--;
					while (true) {
						for (let c = 0; c < 2; c++) if (!matrix.isReserved(row, col - c)) {
							let dark = false;
							if (byteIndex < data.length) dark = (data[byteIndex] >>> bitIndex & 1) === 1;
							matrix.set(row, col - c, dark);
							bitIndex--;
							if (bitIndex === -1) {
								byteIndex++;
								bitIndex = 7;
							}
						}
						row += inc;
						if (row < 0 || size <= row) {
							row -= inc;
							inc = -inc;
							break;
						}
					}
				}
			}
			/**
			* Create encoded codewords from data input
			*
			* @param  {Number}   version              QR Code version
			* @param  {ErrorCorrectionLevel}   errorCorrectionLevel Error correction level
			* @param  {ByteData} data                 Data input
			* @return {Uint8Array}                    Buffer containing encoded codewords
			*/
			function createData(version, errorCorrectionLevel, segments) {
				const buffer = new BitBuffer();
				segments.forEach(function(data) {
					buffer.put(data.mode.bit, 4);
					buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));
					data.write(buffer);
				});
				const dataTotalCodewordsBits = (Utils.getSymbolTotalCodewords(version) - ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)) * 8;
				if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) buffer.put(0, 4);
				while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(0);
				const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
				for (let i = 0; i < remainingByte; i++) buffer.put(i % 2 ? 17 : 236, 8);
				return createCodewords(buffer, version, errorCorrectionLevel);
			}
			/**
			* Encode input data with Reed-Solomon and return codewords with
			* relative error correction bits
			*
			* @param  {BitBuffer} bitBuffer            Data to encode
			* @param  {Number}    version              QR Code version
			* @param  {ErrorCorrectionLevel} errorCorrectionLevel Error correction level
			* @return {Uint8Array}                     Buffer containing encoded codewords
			*/
			function createCodewords(bitBuffer, version, errorCorrectionLevel) {
				const totalCodewords = Utils.getSymbolTotalCodewords(version);
				const dataTotalCodewords = totalCodewords - ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
				const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);
				const blocksInGroup1 = ecTotalBlocks - totalCodewords % ecTotalBlocks;
				const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
				const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
				const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
				const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
				const rs = new ReedSolomonEncoder(ecCount);
				let offset = 0;
				const dcData = new Array(ecTotalBlocks);
				const ecData = new Array(ecTotalBlocks);
				let maxDataSize = 0;
				const buffer = new Uint8Array(bitBuffer.buffer);
				for (let b = 0; b < ecTotalBlocks; b++) {
					const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
					dcData[b] = buffer.slice(offset, offset + dataSize);
					ecData[b] = rs.encode(dcData[b]);
					offset += dataSize;
					maxDataSize = Math.max(maxDataSize, dataSize);
				}
				const data = new Uint8Array(totalCodewords);
				let index = 0;
				let i, r;
				for (i = 0; i < maxDataSize; i++) for (r = 0; r < ecTotalBlocks; r++) if (i < dcData[r].length) data[index++] = dcData[r][i];
				for (i = 0; i < ecCount; i++) for (r = 0; r < ecTotalBlocks; r++) data[index++] = ecData[r][i];
				return data;
			}
			/**
			* Build QR Code symbol
			*
			* @param  {String} data                 Input string
			* @param  {Number} version              QR Code version
			* @param  {ErrorCorretionLevel} errorCorrectionLevel Error level
			* @param  {MaskPattern} maskPattern     Mask pattern
			* @return {Object}                      Object containing symbol data
			*/
			function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
				let segments;
				if (Array.isArray(data)) segments = Segments.fromArray(data);
				else if (typeof data === "string") {
					let estimatedVersion = version;
					if (!estimatedVersion) {
						const rawSegments = Segments.rawSplit(data);
						estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
					}
					segments = Segments.fromString(data, estimatedVersion || 40);
				} else throw new Error("Invalid data");
				const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
				if (!bestVersion) throw new Error("The amount of data is too big to be stored in a QR Code");
				if (!version) version = bestVersion;
				else if (version < bestVersion) throw new Error("\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n");
				const dataBits = createData(version, errorCorrectionLevel, segments);
				const moduleCount = Utils.getSymbolSize(version);
				const modules = new BitMatrix(moduleCount);
				setupFinderPattern(modules, version);
				setupTimingPattern(modules);
				setupAlignmentPattern(modules, version);
				setupFormatInfo(modules, errorCorrectionLevel, 0);
				if (version >= 7) setupVersionInfo(modules, version);
				setupData(modules, dataBits);
				if (isNaN(maskPattern)) maskPattern = MaskPattern.getBestMask(modules, setupFormatInfo.bind(null, modules, errorCorrectionLevel));
				MaskPattern.applyMask(maskPattern, modules);
				setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
				return {
					modules,
					version,
					errorCorrectionLevel,
					maskPattern,
					segments
				};
			}
			/**
			* QR Code
			*
			* @param {String | Array} data                 Input data
			* @param {Object} options                      Optional configurations
			* @param {Number} options.version              QR Code version
			* @param {String} options.errorCorrectionLevel Error correction level
			* @param {Function} options.toSJISFunc         Helper func to convert utf8 to sjis
			*/
			exports.create = function create(data, options) {
				if (typeof data === "undefined" || data === "") throw new Error("No input text");
				let errorCorrectionLevel = ECLevel.M;
				let version;
				let mask;
				if (typeof options !== "undefined") {
					errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
					version = Version.from(options.version);
					mask = MaskPattern.from(options.maskPattern);
					if (options.toSJISFunc) Utils.setToSJISFunction(options.toSJISFunc);
				}
				return createSymbol(data, version, errorCorrectionLevel, mask);
			};
		})))();
		const PAIR_URL = "https://chatgpt.com/codex/pair?pairing_code=";
		const STATUS_KEYS = {
			connected: "remoteConnected",
			connecting: "remoteConnecting",
			waiting: "remoteWaiting",
			error: "remoteError",
			stopped: "remoteStopped"
		};
		const MARGIN = 2;
		function Qr({ value, label }) {
			let modules;
			try {
				modules = (0, import_qrcode.create)(value, { errorCorrectionLevel: "M" }).modules;
			} catch {
				return null;
			}
			const size = modules.size;
			let path = "";
			for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) if (modules.get(row, column)) path += `M${column + MARGIN} ${row + MARGIN}h1v1h-1z`;
			const span = size + MARGIN * 2;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexSubscriptionRemoteQr",
				role: "img",
				"aria-label": label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					viewBox: `0 0 ${span} ${span}`,
					shapeRendering: "crispEdges",
					"aria-hidden": "true",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						width: span,
						height: span,
						fill: "#fff"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: path,
						fill: "#000"
					})]
				})
			});
		}
		/** Beta: show this DSH in the ChatGPT mobile app's Codex list (Remote Control). */
		function RemoteControlCard({ rpc, preference, snapshot, t, active = true }) {
			const [state, setState] = (0, react.useState)();
			const [pairing, setPairing] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const [now, setNow] = (0, react.useState)(Date.now());
			const [clients, setClients] = (0, react.useState)();
			const [removing, setRemoving] = (0, react.useState)();
			const alive = (0, react.useRef)(false);
			const on = snapshot.remoteControl === "on";
			const read = async () => {
				try {
					const result = await rpc.call(CHANNEL, "remote/status", {});
					if (alive.current && result.ok) setState(result.value);
				} catch {}
			};
			const readClients = async () => {
				try {
					const result = await rpc.call(CHANNEL, "remote/clients", {});
					if (alive.current && result.ok) setClients(result.value);
				} catch {}
			};
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (!on) {
					setClients(void 0);
					return;
				}
				if (!active) return void 0;
				let stopped = false, timer;
				const poll = async () => {
					await readClients();
					if (!stopped) timer = setTimeout(poll, 2e4);
				};
				poll();
				return () => {
					stopped = true;
					clearTimeout(timer);
				};
			}, [
				on,
				rpc,
				active
			]);
			const remove = async (client) => {
				if (removing) return;
				setRemoving(client.clientId);
				setFailed(false);
				try {
					const result = await rpc.call(CHANNEL, "remote/revoke", { clientId: client.clientId });
					if (!alive.current) return;
					if (result.ok) setClients(result.value);
					else setFailed(true);
				} catch {
					if (alive.current) setFailed(true);
				} finally {
					if (alive.current) setRemoving(void 0);
				}
			};
			(0, react.useEffect)(() => {
				if (!on) {
					setState(void 0);
					setPairing(void 0);
					return;
				}
				if (!active) return void 0;
				let stopped = false, timer;
				const poll = async () => {
					await read();
					if (!stopped) timer = setTimeout(poll, 4e3);
				};
				poll();
				return () => {
					stopped = true;
					clearTimeout(timer);
				};
			}, [
				on,
				rpc,
				active
			]);
			(0, react.useEffect)(() => {
				if (!pairing || !active) return void 0;
				setNow(Date.now());
				const timer = setInterval(() => setNow(Date.now()), 5e3);
				return () => clearInterval(timer);
			}, [pairing, active]);
			const pair = async () => {
				if (busy) return;
				setBusy(true);
				setFailed(false);
				try {
					const result = await rpc.call(CHANNEL, "remote/pair", {});
					if (!alive.current) return;
					if (!result.ok) {
						setFailed(true);
						return;
					}
					setPairing(result.value);
					setNow(Date.now());
					read();
				} catch {
					if (alive.current) setFailed(true);
				} finally {
					if (alive.current) setBusy(false);
				}
			};
			const expired = pairing && pairing.expiresAt <= now;
			const minutes = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - now) / 6e4)) : 0;
			const status = state?.status ?? "connecting";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
				"aria-label": t("remoteTitle"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreference",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreferenceCopy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
							description: [t("remoteHint"), t("remoteLimits")].join(" "),
							children: [
								t("remoteTitle"),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
							]
						}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(on ? "state_remote_on" : "state_remote_off") }) : null]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
						checked: on,
						label: t("remoteTitle"),
						disabled: !snapshot.writable,
						onChange: (next) => {
							preference.set({ remoteControl: next ? "on" : "off" });
						}
					})]
				}), on ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							role: "status",
							children: [
								status === "connected" && state?.phones > 0 ? t("remotePhones").replace("{count}", String(state.phones)) : t(STATUS_KEYS[status] ?? "remoteConnecting"),
								status === "error" && state?.lastError ? ` · ${state.lastError}` : "",
								status !== "connected" && state?.phones > 0 ? ` · ${t("remotePhones").replace("{count}", String(state.phones))}` : ""
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							disabled: busy || status === "stopped",
							onClick: () => {
								pair();
							},
							children: t(pairing ? "remotePairAgain" : "remotePair")
						})]
					}),
					status === "waiting" && state?.lastError === "conflict" && state?.reconnects >= 6 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						className: "codexSubscriptionHelp",
						children: t("remoteConflictLong")
					}) : null,
					status === "error" && state?.lastError === "unauthorized" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						className: "codexSubscriptionHelp",
						children: t("remoteUnauthorizedHelp")
					}) : null,
					failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: "codexSubscriptionHelp",
						children: t("remotePairFailed")
					}) : null,
					pairing && !expired ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionRemotePair",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Qr, {
							value: `${PAIR_URL}${pairing.pairingCode}`,
							label: t("remoteQrLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionHelp",
								children: t("remotePairSteps")
							}),
							pairing.manualCode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionRemoteCode",
								"aria-label": t("remoteManualCode"),
								children: pairing.manualCode
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionHelp",
								children: t("remoteExpires").replace("{minutes}", String(minutes))
							})
						] })]
					}) : pairing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionHelp",
						children: t("remoteExpired")
					}) : null,
					clients && clients.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionRemoteClients",
						role: "list",
						"aria-label": t("remotePaired"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionPreferenceLabel",
							children: t("remotePaired")
						}), clients.map((client) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							role: "listitem",
							className: "codexSubscriptionPreference",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: [
								client.name ?? t("remotePhoneUnknown"),
								client.platform,
								client.lastSeenAt ? t("remoteLastSeen").replace("{date}", new Date(client.lastSeenAt).toLocaleString(uiLocale())) : null
							].filter(Boolean).join(" · ") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: Boolean(removing),
								onClick: () => {
									remove(client);
								},
								children: t("remoteRevoke")
							})]
						}, client.clientId))]
					}) : null
				] }) : null]
			});
		}
		const areas = {
			catalog: "models",
			quota: "quota",
			search: "search",
			image: "images",
			model: "transport",
			voice: "transport",
			login: "account",
			"quota-reset": "quota"
		};
		function diagnosticEvidence({ operations, history }, now) {
			return [...(operations?.events ?? []).map((e) => ({
				capability: e.capability,
				action: e.action,
				source: e.source,
				status: e.status,
				observedAt: e.observedAt
			})), ...(history?.events ?? []).map((e) => ({
				capability: areas[e.area],
				action: e.area,
				source: "network",
				status: e.status === "ok" ? "completed" : "failed",
				observedAt: e.observedAt
			}))].filter((e) => Number.isSafeInteger(e.observedAt) && now >= e.observedAt && now - e.observedAt <= 9e5).sort((a, b) => a.observedAt - b.observedAt);
		}
		function unresolvedFailures(events) {
			const failed = /* @__PURE__ */ new Map();
			for (const event of events) {
				const key = `${event.source}:${event.action}`;
				if (event.status === "failed") failed.set(key, event);
				else if (event.status === "completed") failed.delete(key);
			}
			return [...failed.values()];
		}
		//#endregion
		//#region src/diagnostic-summary.js
		function diagnosticSummary(report, now = Date.now()) {
			const findings = [];
			const checks = [...report.inspection?.checks ?? [], ...report.client?.checks ?? []];
			if (report.version && report.client?.version && report.version !== report.client.version) findings.push({
				code: "version-mismatch",
				severity: "warning",
				next: "restart",
				evidence: ["version", "client.version"]
			});
			if (!report.inspection || report.client?.status === "unknown" || checks.some((check) => ["inspection-failed", "inspection-timeout"].includes(check.reason))) findings.push({
				code: "collection-incomplete",
				severity: "warning",
				next: "regenerate",
				evidence: checks.filter((c) => c.status === "unknown").map((c) => c.id)
			});
			if (report.catalog?.unsupported?.length) findings.push({
				code: "catalog-gap",
				severity: "info",
				next: "supported-options",
				evidence: ["catalog.unsupported"]
			});
			const capturedAt = Date.parse(report.generatedAt);
			const failures = unresolvedFailures(diagnosticEvidence({
				operations: report.operations,
				history: report.requestHistory
			}, Number.isFinite(capturedAt) ? capturedAt : now));
			if (failures.length) findings.push({
				code: "recent-failure",
				severity: "warning",
				next: "reproduce",
				evidence: failures
			});
			if ((report.requestHistory?.dropped ?? 0) + (report.operations?.dropped ?? 0) > 0 || report.client?.truncated) findings.push({
				code: "evidence-truncated",
				severity: "info",
				next: "regenerate",
				evidence: [
					"requestHistory.dropped",
					"operations.dropped",
					"client.truncated"
				]
			});
			return {
				scope: "recorded-evidence-only",
				findings,
				unverified: (report.inspection?.capabilities ?? []).filter((c) => c.execution === "not-verified" && c.readiness !== "not-applicable").length
			};
		}
		//#endregion
		//#region src/diagnostic-log-format.js
		function formatLogLine(entry) {
			const stamp = new Date(entry.time).toISOString().replace("T", " ").slice(0, 19);
			const repeat = entry.count > 1 ? ` (x${entry.count})` : "";
			return `${stamp} ${entry.level.toUpperCase().padEnd(5)} [${entry.area}] ${entry.message}${entry.detail ? ` — ${entry.detail}` : ""}${repeat}`;
		}
		//#endregion
		//#region src/diagnostic-compact.js
		function compactDiagnostic(report) {
			const summary = report.summary ?? { findings: [] };
			return {
				format: "compact-1",
				plugin: report.version,
				dsh: report.runtime?.dsh,
				...report.client?.version && report.client.version !== report.version ? { pluginClient: report.client.version } : {},
				platform: report.runtime ? `${report.runtime.platform}-${report.runtime.arch}` : void 0,
				generatedAt: report.generatedAt,
				account: report.account?.status,
				catalog: report.catalog ? {
					source: report.catalog.source,
					refresh: report.catalog.refresh
				} : void 0,
				configuration: report.configuration,
				findings: summary.findings.map((item) => ({
					code: item.code,
					severity: item.severity,
					...item.code === "recent-failure" ? { failures: item.evidence.map((event) => ({
						action: event.action,
						source: event.source,
						at: new Date(event.observedAt).toISOString()
					})) } : {}
				})),
				capabilities: (report.inspection?.capabilities ?? []).filter((item) => item.readiness !== "not-applicable").map((item) => ({
					id: item.id,
					reason: item.reason,
					...item.latest ? { latest: `${item.latest.action} ${item.latest.status}` } : { latest: "not-verified" }
				})),
				log: (report.log?.entries ?? []).slice(-150).map(formatLogLine),
				...report.client?.status === "unknown" ? { hostCollected: false } : {}
			};
		}
		//#endregion
		//#region src/client-diagnostics.jsx
		const LEVELS = {
			all: [
				"info",
				"warn",
				"error"
			],
			warn: ["warn", "error"],
			error: ["error"]
		};
		function DiagnosticsCard({ rpc, t, diagnostics }) {
			const [report, setReport] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [copied, setCopied] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(false);
			const [copyError, setCopyError] = (0, react.useState)(false);
			const [level, setLevel] = (0, react.useState)("all");
			const [logCopied, setLogCopied] = (0, react.useState)(false);
			const load = () => {
				setBusy(true);
				setError(false);
				setCopied(false);
				setCopyError(false);
				Promise.allSettled([recoveryCall(rpc, "diagnostics"), Promise.resolve().then(() => diagnostics?.collect())]).then(([server, client]) => {
					setError(server.status === "rejected");
					const combined = {
						...server.status === "fulfilled" ? server.value : clientDiagnostic(server.reason),
						client: client.status === "fulfilled" && client.value ? client.value : { status: "unknown" }
					};
					setReport({
						...combined,
						summary: diagnosticSummary(combined)
					});
				}).finally(() => setBusy(false));
			};
			const copy = (full = false) => {
				if (report === void 0) return;
				setCopyError(false);
				Promise.resolve().then(() => navigator.clipboard.writeText(JSON.stringify(full ? report : compactDiagnostic(report), null, 2))).then(() => setCopied(true)).catch(() => setCopyError(true));
			};
			const lines = (report?.log?.entries ?? []).filter((entry) => LEVELS[level].includes(entry.level));
			const copyLog = () => {
				Promise.resolve().then(() => navigator.clipboard.writeText(lines.map(formatLogLine).join(String.fromCharCode(10)))).then(() => setLogCopied(true)).catch(() => setCopyError(true));
			};
			const findings = report?.summary?.findings ?? [];
			const attention = findings.filter((item) => item.severity !== "info");
			const notes = findings.filter((item) => item.severity === "info");
			const finding = (item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "codexDiagTitle",
					children: t(`diagnosticFinding_${item.code}`)
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "codexDiagNext",
					children: t(`diagnosticNext_${item.next}`)
				}),
				item.code === "recent-failure" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: item.evidence.map((event) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
					event.action,
					" · ",
					t(`diagnosticSource_${event.source}`),
					" · ",
					new Date(event.observedAt).toLocaleTimeString(uiLocale())
				] }, `${event.source}:${event.action}`)) }) : null
			] }, item.code);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionDiagnostics",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexSubscriptionPreferenceCopy",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
								description: t("diagnosticsHint"),
								children: t("diagnostics")
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionActions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: load,
									children: busy ? t("diagnosticsLoading") : t("diagnosticsLoad")
								}),
								report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									onClick: () => copy(),
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
					report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexDiagResult",
							role: "status",
							"data-state": attention.length ? "attention" : "ok",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexDiagBadge",
								children: attention.length ? t("diagnosticsAttention").replace("{count}", String(attention.length)) : t("diagnosticsNoRecordedFailure")
							}), report.generatedAt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexDiagTime",
								children: new Date(report.generatedAt).toLocaleString(uiLocale())
							}) : null]
						}),
						attention.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: "codexDiagFindings",
							children: attention.map(finding)
						}) : null,
						notes.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "codexAdvancedFold codexAdvancedInline",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("diagnosticsNotes").replace("{count}", String(notes.length)) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: "codexDiagFindings",
								children: notes.map(finding)
							})]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "codexAdvancedFold codexAdvancedInline",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
									as: "summary",
									className: "",
									openOnClick: false,
									description: t("diagnosticsLogHint"),
									children: [t("diagnosticsLog"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: lines.length })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLogHead",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "codexSubscriptionQuotaModes",
										role: "radiogroup",
										"aria-label": t("diagnosticsLog"),
										children: Object.keys(LEVELS).map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "codexSubscriptionQuotaMode",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: "codex-log-level",
												checked: level === value,
												onChange: () => {
													setLevel(value);
													setLogCopied(false);
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`logLevel_${value}`) })]
										}, value))
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "outline",
										disabled: lines.length === 0,
										onClick: copyLog,
										children: logCopied ? t("logCopied") : t("logCopy")
									})]
								}),
								lines.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "codexSubscriptionHelp",
									children: t("logEmpty")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
									className: "codexSubscriptionLog",
									tabIndex: 0,
									children: lines.slice().reverse().map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: `codexSubscriptionLogLine codexSubscriptionLog_${entry.level}`,
										children: [
											formatLogLine(entry),
											entry.earlier ? ` (${t("logEarlier")})` : "",
											String.fromCharCode(10)
										]
									}, entry.sequence))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "codexAdvancedFold codexAdvancedInline",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
									as: "summary",
									className: "",
									openOnClick: false,
									description: t("diagnosticsCoverageHint"),
									children: t("diagnosticsAdvanced")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "codexSubscriptionHelp",
									children: report.client?.topology?.length ? t("diagnosticsHostCollected") : t("diagnosticsHostUnknown")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
									className: "codexDiagTable",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("diagnosticsCapability") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("diagnosticsReadiness") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("diagnosticsEvidence") })
									] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: (report.inspection?.capabilities ?? []).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: t(`diagnosticCapability_${item.id}`) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [t(`diagnosticReason_${item.reason}`), item.blockedBy ? ` · ${t(`diagnosticCapability_${item.blockedBy}`)}` : ""] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [item.latest ? `${item.latest.action} · ${t(`diagnosticSource_${item.latest.source}`)} · ${t(`diagnosticOutcome_${item.latest.status}`)} · ${new Date(item.latest.observedAt).toLocaleTimeString(uiLocale())}` : t("diagnosticsUnverified"), item.unresolved?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("diagnosticsUnresolved") }) : null] })
									] }, item.id)) })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "codexSubscriptionActions",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "outline",
										onClick: () => copy(true),
										children: t("diagnosticsCopyFull")
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
									className: "codexSubscriptionLog",
									tabIndex: 0,
									children: JSON.stringify(report, null, 2)
								})
							]
						})
					] }),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("diagnosticsFailed")
					}) : null,
					copyError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("diagnosticsCopyFailed")
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client-storage.jsx
		function StorageCard({ rpc, t }) {
			const [usage, setUsage] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [confirm, setConfirm] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(false);
			const mounted = (0, react.useRef)(false);
			const pending = (0, react.useRef)(false);
			const read = async (clear) => {
				if (pending.current) return;
				pending.current = true;
				setBusy(true);
				setError(false);
				try {
					const result = unwrap(await rpc.call(CHANNEL, clear ? "storage/clear-forecast" : "storage/status", {}));
					if (mounted.current) {
						setUsage(result);
						setConfirm(false);
					}
				} catch {
					if (mounted.current) setError(true);
				} finally {
					pending.current = false;
					if (mounted.current) setBusy(false);
				}
			};
			(0, react.useEffect)(() => {
				mounted.current = true;
				read(false);
				return () => {
					mounted.current = false;
				};
			}, [rpc]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscriptionCard codexSubscriptionStorage",
				"aria-label": t("storageForecast"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionStorageHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionStorageTitle",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
								as: "h3",
								className: "",
								description: t("storageHint"),
								children: t("storageForecast")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", {
								role: "status",
								children: usage ? `${(usage.bytes / 1024).toFixed(1)} / ${(usage.limit / 1024).toFixed(0)} KiB` : t("storageLoading")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionActions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => void read(false),
								children: t("runtimeRefresh")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy || !usage?.bytes,
								onClick: () => setConfirm(true),
								children: t("storageClear")
							})]
						})]
					}),
					usage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionStorageMeter",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							"aria-label": t("storageForecast"),
							value: usage.bytes,
							max: usage.limit
						})
					}) : null,
					confirm ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionConfirm",
						role: "group",
						"aria-label": t("storageClear"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("storageConfirm") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => setConfirm(false),
								children: t("sketchCancel")
							}),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => void read(true),
								children: t("storageClear")
							})
						]
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t("storageFailed")
					}) : null
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
		//#region src/picker-draft.js
		const toggleModelId = (draft, modelId) => draft.includes(modelId) ? draft.filter((id) => id !== modelId) : [...draft, modelId];
		/**
		* What to do with the draft after a render.
		* - adopt: nothing pending, follow the saved value
		* - wait: a change is pending but a write is still in flight
		* - save: send the draft
		* - settled: the pending change already equals the saved value
		*/
		function draftStep({ dirty, writable, draft, saved }) {
			if (!dirty) return "adopt";
			if (!writable) return "wait";
			return JSON.stringify(draft) === JSON.stringify(saved) ? "settled" : "save";
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
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: snapshot.quickQuotaMode === "forecast" ? t("quickQuotaForecastHint") : void 0,
						children: t("quickQuotaSetting")
					})
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
		function AutoQuotaRetryPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("autoQuotaRetryHint"),
						children: t("autoQuotaRetry")
					}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(`state_autoQuotaRetry_${snapshot.autoQuotaRetry ? "on" : "off"}`) }) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked: snapshot.autoQuotaRetry,
					label: t("autoQuotaRetry"),
					disabled: !writable,
					onChange: (next) => {
						preference.set({ [AUTO_QUOTA_RETRY_FIELD]: next });
					}
				})]
			});
		}
		function SearchProviderPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const choice = (value, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "codexSubscriptionQuotaMode",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "radio",
					name: "codex-subscription-search-provider",
					checked: snapshot.searchProvider === value,
					disabled: !writable,
					onChange: () => {
						preference.set({ [SEARCH_PROVIDER_FIELD]: value });
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionSearch",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionPreferenceCopy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
								description: t(snapshot.searchProvider === "dsh" ? "searchDshHint" : snapshot.searchProvider === "codex" ? "searchCodexHint" : "searchAutoHint"),
								children: t("searchTitle")
							}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(`searchState_${snapshot.searchProvider}`) }) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionSearchChoices codexSubscriptionQuotaModes",
							"data-saving": snapshot.saving || void 0,
							"aria-busy": snapshot.saving || void 0,
							role: "radiogroup",
							"aria-label": t("searchTitle"),
							children: [
								choice(SEARCH_PROVIDER_AUTO, t("searchAuto")),
								choice("dsh", "DSH"),
								choice(SEARCH_PROVIDER_CODEX, "Codex")
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPreference",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionPreferenceCopy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
								description: t(snapshot.fetchProvider === "codex" ? "fetchCodexHint" : "fetchDshHint"),
								children: t("fetchTitle")
							}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(!snapshot.fetchRoutingAvailable ? "fetchUnavailableHint" : `fetchState_${snapshot.fetchProvider}`) }) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexSubscriptionSearchChoices codexSubscriptionQuotaModes",
							"data-saving": snapshot.saving || void 0,
							"aria-busy": snapshot.saving || void 0,
							role: "radiogroup",
							"aria-label": t("fetchTitle"),
							children: ["dsh", FETCH_PROVIDER_CODEX].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "codexSubscriptionQuotaMode",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "radio",
									name: "codex-subscription-fetch-provider",
									checked: snapshot.fetchProvider === value,
									disabled: !writable || value === "codex" && !snapshot.fetchRoutingAvailable,
									onChange: () => {
										preference.set({ [FETCH_PROVIDER_FIELD]: value });
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value === "codex" ? "Codex" : "DSH" })]
							}, value))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityPreferences, {
						preference,
						t,
						section: "search"
					})
				]
			});
		}
		function InputImageDetailPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("inputImageDetailHint"),
						children: t("inputImageDetail")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionQuotaModes",
					"data-saving": snapshot.saving || void 0,
					"aria-busy": snapshot.saving || void 0,
					role: "radiogroup",
					"aria-label": t("inputImageDetail"),
					children: INPUT_IMAGE_DETAILS.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionQuotaMode",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "codex-input-image-detail",
							checked: snapshot.inputImageDetail === value,
							disabled: !writable,
							onChange: () => {
								preference.set({ [INPUT_IMAGE_DETAIL_FIELD]: value });
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`inputImageDetail_${value}`) })]
					}, value))
				})]
			});
		}
		function ReasoningSummaryPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("reasoningSummaryHint"),
						children: t("reasoningSummary")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionQuotaModes",
					"data-saving": snapshot.saving || void 0,
					"aria-busy": snapshot.saving || void 0,
					role: "radiogroup",
					"aria-label": t("reasoningSummary"),
					children: REASONING_SUMMARIES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionQuotaMode",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "codex-reasoning-summary",
							checked: snapshot.reasoningSummary === value,
							disabled: !writable,
							onChange: () => {
								preference.set({ [REASONING_SUMMARY_FIELD]: value });
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`reasoningSummary_${value}`) })]
					}, value))
				})]
			});
		}
		function ReasoningCachePreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const blocked = snapshot.compactionMode === "cloud" || snapshot.retryPolicy === "unlimited";
			const hint = snapshot.compactionMode === "cloud" ? "reasoningCacheCloud" : snapshot.retryPolicy === "unlimited" ? "reasoningCacheRetry" : "reasoningCacheHint";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("reasoningCacheHint"),
						children: t("reasoningCache")
					}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(blocked ? hint : `state_reasoningCache_${snapshot.reasoningCache}`) }) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked: snapshot.reasoningCache === "on",
					label: t("reasoningCache"),
					disabled: !writable || snapshot.saving || blocked && snapshot.reasoningCache !== "on",
					onChange: (next) => {
						preference.set({ reasoningCache: next ? "on" : "off" });
					}
				})]
			});
		}
		function CompactionPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const enabled = snapshot.compactionMode === "cloud";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
						description: t("compactionHint"),
						children: [
							t("compactionTitle"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
						]
					}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(`state_compaction_${enabled ? "on" : "off"}`) }) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked: enabled,
					label: t("compactionTitle"),
					disabled: snapshot.status !== "ready" || !snapshot.writable || snapshot.saving,
					onChange: (next) => {
						preference.set({ compactionMode: next ? "cloud" : "dsh" });
					}
				})]
			});
		}
		function RetryPolicyPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("retryPolicyHint"),
						children: t("retryPolicy")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionQuotaModes",
					"data-saving": snapshot.saving || void 0,
					"aria-busy": snapshot.saving || void 0,
					role: "radiogroup",
					"aria-label": t("retryPolicy"),
					children: RETRY_POLICIES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionQuotaMode",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "codex-retry-policy",
							checked: snapshot.retryPolicy === value,
							disabled: !writable,
							onChange: () => {
								preference.set({ [RETRY_POLICY_FIELD]: value });
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`retryPolicy_${value}`) })]
					}, value))
				})]
			});
		}
		function ConnectorsPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference codexSubscriptionConnectors",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionPreferenceCopy",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							description: t("connectorsHint"),
							children: t("connectors")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionQuotaModes",
						"data-saving": snapshot.saving || void 0,
						"aria-busy": snapshot.saving || void 0,
						role: "radiogroup",
						"aria-label": t("connectors"),
						children: CONNECTOR_MODES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "codexSubscriptionQuotaMode",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "codex-connectors",
								checked: snapshot.connectors === value,
								disabled: !writable,
								onChange: () => {
									preference.set({ [CONNECTORS_FIELD]: value });
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`connectors_${value}`) })]
						}, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionModeNote",
						"data-danger": snapshot.connectors === "write" || void 0,
						role: "status",
						children: t(`connectorsMode_${snapshot.connectors}`)
					})
				]
			});
		}
		function StreamIdleTimeoutPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("streamIdleTimeoutHint"),
						children: t("streamIdleTimeoutTitle")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionQuotaModes",
					"data-saving": snapshot.saving || void 0,
					"aria-busy": snapshot.saving || void 0,
					role: "radiogroup",
					"aria-label": t("streamIdleTimeoutTitle"),
					children: STREAM_IDLE_TIMEOUT_MINUTES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionQuotaMode",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "codex-stream-idle-timeout",
							checked: snapshot.streamIdleTimeoutMinutes === value,
							disabled: !writable,
							onChange: () => {
								preference.set({ [STREAM_IDLE_TIMEOUT_MINUTES_FIELD]: value });
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`streamIdleTimeout_${value}`) })]
					}, value))
				})]
			});
		}
		/**
		* Show every account model while saving which entries the composer picker hides.
		* The controller ignores a write while another is saving, so quick toggles are kept
		* in a local draft and sent as one write once the previous one has settled.
		*/
		function PickerModelsPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const ready = snapshot.status === "ready" && (snapshot.writable === true || snapshot.saving === true);
			const saved = snapshot.disabledModels;
			const [draft, setDraft] = (0, react.useState)(saved);
			const [open, setOpen] = (0, react.useState)(false);
			const dirty = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				const step = draftStep({
					dirty: dirty.current,
					writable: snapshot.writable === true,
					draft,
					saved
				});
				if (step === "adopt") setDraft(saved);
				else if (step === "save" || step === "settled") dirty.current = false;
				if (step === "save") preference.set({ [DISABLED_MODELS_FIELD]: draft });
			}, [
				draft,
				saved.join(" "),
				snapshot.writable
			]);
			const toggle = (modelId) => {
				dirty.current = true;
				setDraft((current) => toggleModelId(current, modelId));
			};
			const shown = snapshot.availableModels.filter((model) => !draft.includes(model.id)).length;
			if (snapshot.availableModels.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPickerSetting",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreference",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionPreferenceCopy",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							description: t("pickerModelsHint"),
							children: t("pickerModelsTitle")
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "codexSubscriptionContextTrigger",
						type: "button",
						"aria-expanded": open,
						onClick: () => setOpen((value) => !value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							shown,
							" / ",
							snapshot.availableModels.length
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, {})]
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPickerModels",
					role: "group",
					"aria-label": t("pickerModelsTitle"),
					children: snapshot.availableModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionPickerModel",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
							checked: !draft.includes(model.id),
							label: model.name,
							disabled: !ready,
							onChange: () => toggle(model.id)
						})]
					}, model.id))
				}) : null]
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
			if (snapshot.contextModels.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionContext",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionContextHead",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionContextCopy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
							description: hint,
							children: t("contextTitle")
						}), snapshot.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(`contextState_${snapshot.contextMode}`) }) : null]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, {
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
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selectedMode }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, {})]
						})
					})]
				}), snapshot.contextMode === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionContextModels",
					children: [modelRows.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionContextModel",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "codexSubscriptionContextModelCopy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: model.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("contextMaximum"), {
								minimum: String(Math.min(MIN_CUSTOM_CONTEXT_WINDOW, model.maximum)),
								value: String(model.maximum)
							}) })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
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
				}) : null]
			});
		}
		/** The account catalog is the only model list: say why it is empty, and offer one refresh. */
		/** The card heading with the model catalog's state and its refresh button on the same line, instead of a row of their own. */
		function ModelCatalogStatus({ preference, t, title }) {
			const snapshot = usePreferenceSnapshot(preference);
			const online = snapshot.catalogStatus?.source === "online";
			const cached = snapshot.catalogStatus?.source === "cached";
			const { refresh: catalogRefresh } = snapshot.catalogStatus ?? {};
			const failed = snapshot.modelError || catalogRefresh === "failed";
			const message = snapshot.modelsLoading || catalogRefresh === "refreshing" ? "catalogLoading" : failed && cached ? "catalogCachedFailed" : failed && !online ? "catalogFailed" : online ? "catalogOnline" : cached ? "catalogCached" : "catalogSignedOut";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelsHead",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: title }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: failed && !online ? "codexSubscriptionError" : "codexSubscriptionPreferenceHint",
						role: failed && !online ? "alert" : void 0,
						children: t(message)
					}),
					online || cached || catalogRefresh !== "idle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						disabled: snapshot.modelsLoading,
						"aria-busy": snapshot.modelsLoading,
						onClick: () => {
							preference.refreshModels();
						},
						children: t(snapshot.modelsLoading ? "refreshing" : "catalogRefresh")
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client-pages.jsx
		const ready = (snapshot) => snapshot.status === "ready" && snapshot.writable === true;
		const modelLabel = (model) => model.replace("gpt-image-", "GPT Image ").replace("-flare", " Flare").replace("-sunburst", " Sunburst");
		/** One feature in the overview: what it does, its on/off switch (or current state) and an arrow to the page that owns its options. */
		function FeatureRow({ t, title, summary, beta, checked, onChange, disabled, reason, status, onMore }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexFeatureRow",
				"data-off": checked === false || void 0,
				"data-blocked": reason ? "true" : void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexFeatureMain",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexFeatureCopy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "codexFeatureTitle",
								children: [title, beta ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" }) : null]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexFeatureSummary",
								children: reason ?? summary
							})]
						}),
						status !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexFeatureStatus",
							children: status
						}) : null,
						checked !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
							checked,
							label: title,
							disabled: disabled || Boolean(reason),
							onChange
						}) : null,
						onMore ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "codexFeatureMore",
							"aria-label": `${title} · ${t("featureDetails")}`,
							onClick: onMore,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronRightOutline14, {})
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "codexFeatureMoreSpace" })
					]
				})
			});
		}
		function SwitchRow({ t, title, hint, state, loaded, beta, checked, disabled, reason, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
						description: state ? t(state === "otherModels" ? "otherModelsHint" : `${state}RowHint`) : hint,
						children: [title, beta ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })] }) : null]
					}), loaded && (state || reason || hint) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: reason ?? (state ? t(`state_${state}_${checked ? "on" : "off"}`) : hint) }) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked,
					label: title,
					disabled: disabled || Boolean(reason),
					onChange
				})]
			});
		}
		/** The first thing a new user sees: every feature, what it does, and whether it is on. Options live on the page the arrow leads to. */
		function FeatureOverview({ preference, t, go }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = ready(snapshot);
			const set = (patch) => {
				preference.set(patch);
			};
			const imagesOn = snapshot.imageGeneration || snapshot.imageEditing;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscriptionCard codexFeatureOverview",
				"aria-label": t("featureOverviewTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("featureOverviewTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureRow, {
						t,
						title: t("featureSearchTitle"),
						summary: t("featureSearchSummary"),
						status: `${t(`searchSource_${snapshot.searchProvider}`)} · ${t(`searchMode_${snapshot.searchMode}`)}`,
						onMore: () => go("tools")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureRow, {
						t,
						title: t("featureImageTitle"),
						summary: t("featureImageSummary"),
						checked: imagesOn,
						disabled: !writable,
						onChange: (next) => set({
							imageGeneration: next,
							imageEditing: next
						}),
						onMore: () => go("create")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureRow, {
						t,
						title: t("featureConnectorsTitle"),
						summary: t("featureConnectorsSummary"),
						checked: snapshot.connectors !== "off",
						disabled: !writable,
						onChange: (next) => set({ connectors: next ? "read" : "off" }),
						onMore: () => go("tools")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureRow, {
						t,
						title: t("featureSketchTitle"),
						summary: t("featureSketchSummary"),
						beta: true,
						checked: snapshot.imageSketch,
						disabled: !writable,
						reason: !imagesOn && !snapshot.imageSketch ? t("featureSketchNeedsImages") : void 0,
						onChange: (next) => set({ imageSketch: next }),
						onMore: () => go("create")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureRow, {
						t,
						title: t("featureVoiceTitle"),
						summary: t("featureVoiceSummary"),
						checked: snapshot.voiceCall === "on",
						disabled: !writable,
						onChange: (next) => set({ voiceCall: next ? "on" : "off" }),
						onMore: () => go("more")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureRow, {
						t,
						title: t("featureRemoteTitle"),
						summary: t("featureRemoteSummary"),
						beta: true,
						checked: snapshot.remoteControl === "on",
						disabled: !writable,
						onChange: (next) => set({ remoteControl: next ? "on" : "off" }),
						onMore: () => go("more")
					})
				]
			});
		}
		/** Showing quota in the composer comes first; the alert only does something once there is something to look at. */
		function QuotaSettingsCard({ preference, t }) {
			const hidden = usePreferenceSnapshot(preference).quickQuotaMode === "off";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
				"aria-label": t("quotaSettingsTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("quotaSettingsTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickQuotaPreference, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexQuotaAlerts",
						"data-disabled": hidden || void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityPreferences, {
							preference,
							t,
							section: "quota",
							disabled: hidden
						}), hidden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionPreferenceHint",
							children: t("quotaAlertsNeedDisplay")
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoQuotaRetryPreference, {
						preference,
						t
					})
				]
			});
		}
		function OutputVerbosityPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = ready(snapshot);
			const values = [
				OUTPUT_VERBOSITY_DEFAULT,
				"low",
				OUTPUT_VERBOSITY_MEDIUM,
				OUTPUT_VERBOSITY_HIGH
			];
			const label = {
				[OUTPUT_VERBOSITY_DEFAULT]: "verbosityDefault",
				["low"]: "verbosityLow",
				[OUTPUT_VERBOSITY_MEDIUM]: "verbosityMedium",
				[OUTPUT_VERBOSITY_HIGH]: "verbosityHigh"
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsLabel, {
						description: t("verbosityPageHint"),
						children: t("verbosityTitle")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionQuotaModes",
					role: "radiogroup",
					"aria-label": t("verbosityTitle"),
					"aria-busy": snapshot.saving || void 0,
					children: values.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "codexSubscriptionQuotaMode",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "radio",
							name: "codex-output-verbosity",
							checked: snapshot.outputVerbosity === value,
							disabled: !writable,
							onChange: () => {
								preference.set({ [OUTPUT_VERBOSITY_FIELD]: value });
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(label[value]) })]
					}, value))
				})]
			});
		}
		function Radios({ snapshot, preference, field, values, label, name, text, disabled, disabledValues = [] }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexSubscriptionQuotaModes",
				role: "radiogroup",
				"aria-label": label,
				"aria-busy": snapshot.saving || void 0,
				children: values.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "codexSubscriptionQuotaMode",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "radio",
						name,
						checked: snapshot[field] === value,
						disabled: disabled || !snapshot.writable || disabledValues.includes(value),
						onChange: () => {
							preference.set({ [field]: value });
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: text(value) })]
				}, value))
			});
		}
		function ModelsPage({ preference, t, defaultModel }) {
			const snapshot = usePreferenceSnapshot(preference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionAdvancedPreferences",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
						"aria-label": t("modelsSectionTitle"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelCatalogStatus, {
								preference,
								t,
								title: t("modelsSectionTitle")
							}),
							defaultModel === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DefaultModelPreference, {
								preference,
								defaultModel,
								t
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DefaultReasoningEffortPreference, {
								preference,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComposerPredictionPreference, {
								preference,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PickerModelsPreference, {
								preference,
								t
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
						"aria-label": t("answerStyleTitle"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("answerStyleTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningSummaryPreference, {
								preference,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OutputVerbosityPreference, {
								preference,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InputImageDetailPreference, {
								preference,
								t
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "codexSubscriptionCard codexAdvancedFold",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t("advancedTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("advancedSummary") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexAdvancedBody",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextWindowPreference, {
									preference,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningCachePreference, {
									preference,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RetryPolicyPreference, {
									preference,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StreamIdleTimeoutPreference, {
									preference,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionPreference",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "codexSubscriptionPreferenceCopy",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
											description: t("connectionHint"),
											children: [
												t("connectionTitle"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
											]
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Radios, {
										snapshot,
										preference,
										field: "connectionMode",
										values: ["sse", "websocket"],
										name: "codex-connection-mode",
										label: t("connectionTitle"),
										text: (value) => t(`connection_${value}`)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactionPreference, {
									preference,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionPreference",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "codexSubscriptionPreferenceCopy",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
											description: t("reviewModelHint"),
											children: [
												t("reviewModelTitle"),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
											]
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Radios, {
										snapshot,
										preference,
										field: "reviewModel",
										values: ["session", "official"],
										name: "codex-review-model",
										label: t("reviewModelTitle"),
										text: (value) => t(`reviewModel_${value}`)
									})]
								})
							]
						})]
					})
				]
			});
		}
		function ToolsPage({ preference, rpc, t, active = true }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = ready(snapshot);
			const others = snapshot.otherModels !== "off";
			const codexReady = snapshot.subagentRuntimeInstalled;
			const subagentsOn = snapshot.subagentBackend === "codex";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionAdvancedPreferences",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
						"aria-label": t("otherModelsTitle"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							loaded: snapshot.status === "ready",
							t,
							title: t("otherModelsTitle"),
							state: "otherModels",
							checked: others,
							disabled: !writable,
							onChange: (next) => {
								preference.set({ otherModels: next ? "on" : "off" });
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
						"aria-label": t("searchSectionTitle"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchProviderPreference, {
							preference,
							t
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
						"aria-label": t("connectors"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnectorsPreference, {
							preference,
							t
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
						"aria-label": t("subagentBackendTitle"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionPreference",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionPreferenceCopy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsLabel, {
									description: t("subagentBackendHint"),
									children: [
										t("subagentBackendTitle"),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "Beta" })
									]
								}), !snapshot.subagentBackendAvailable || !(codexReady || subagentsOn) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, { children: t(snapshot.subagentBackendAvailable ? "subagentBackendNeedsRuntime" : "subagentBackendUnavailable") }) : null]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Radios, {
								snapshot,
								preference,
								field: "subagentBackend",
								values: ["dsh", "codex"],
								name: "codex-subagent-backend",
								label: t("subagentBackendTitle"),
								text: (value) => t(`subagentBackend_${value}`),
								disabled: !snapshot.subagentBackendAvailable,
								disabledValues: codexReady || subagentsOn ? [] : ["codex"]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RuntimeManagement, {
							rpc,
							preference,
							t,
							active
						})]
					})
				]
			});
		}
		function CreatePage({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = ready(snapshot);
			const set = (patch) => {
				preference.set(patch);
			};
			const imagesOn = snapshot.imageGeneration || snapshot.imageEditing;
			const disabled = !writable || snapshot.saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionAdvancedPreferences",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
					"aria-label": t("imageSettings"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("imageSettings") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							loaded: snapshot.status === "ready",
							t,
							title: t("imageGenerationRow"),
							state: "imageGeneration",
							checked: snapshot.imageGeneration,
							disabled,
							onChange: (next) => set({ imageGeneration: next })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							loaded: snapshot.status === "ready",
							t,
							title: t("imageEditingRow"),
							state: "imageEditing",
							checked: snapshot.imageEditing,
							disabled,
							onChange: (next) => set({ imageEditing: next })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							loaded: snapshot.status === "ready",
							t,
							title: t("imageShortcutRow"),
							state: "imageShortcut",
							checked: snapshot.imageShortcut,
							disabled,
							reason: !imagesOn && !snapshot.imageShortcut ? t("imageShortcutNeedsImages") : void 0,
							onChange: (next) => set({ imageShortcut: next })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
							loaded: snapshot.status === "ready",
							t,
							title: t("imageViewerRow"),
							state: "imageViewer",
							checked: snapshot.imageViewer && snapshot.imageAnnotations,
							disabled,
							onChange: (next) => set({
								imageViewer: next,
								imageAnnotations: next
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "codexAdvancedFold codexAdvancedInline",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t("imageAdvancedTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: imagesOn ? `${modelLabel(snapshot.imageModel)} · ${t(`imageQuality_${snapshot.imageQuality}`)}` : t("imageCapability_off") })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageChoice, {
									t,
									label: t("imageModel"),
									hint: snapshot.imageModel.includes("2.5") ? t("imageModelHint") : void 0,
									value: snapshot.imageModel,
									text: modelLabel(snapshot.imageModel),
									disabled: disabled || !imagesOn,
									items: Object.keys(IMAGE_MODELS).map((id) => ({
										id,
										label: `${modelLabel(id)}${id.includes("2.5") ? ` · ${t("imageExperimental")}` : ""}`
									})),
									onSelect: (imageModel) => set({
										imageModel,
										imageQuality: "auto"
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageChoice, {
									t,
									label: t("imageQuality"),
									value: snapshot.imageQuality,
									text: t(`imageQuality_${snapshot.imageQuality}`),
									disabled: disabled || !imagesOn,
									items: IMAGE_MODELS[snapshot.imageModel].map((id) => ({
										id,
										label: t(`imageQuality_${id}`)
									})),
									onSelect: (imageQuality) => set({ imageQuality })
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
					"aria-label": t("creativeSketch"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						loaded: snapshot.status === "ready",
						t,
						title: t("featureSketchTitle"),
						beta: true,
						hint: !imagesOn ? t("featureSketchNeedsImages") : void 0,
						state: imagesOn ? "sketchBoard" : void 0,
						checked: snapshot.imageSketch,
						disabled,
						reason: !imagesOn && !snapshot.imageSketch ? t("featureSketchNeedsImages") : void 0,
						onChange: (next) => set({ imageSketch: next })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchRow, {
						loaded: snapshot.status === "ready",
						t,
						title: t("sketchAgentRow"),
						state: "sketchAgent",
						checked: snapshot.imageSketchAgent,
						disabled,
						reason: !snapshot.imageSketch ? t("sketchAgentNeedsBoard") : void 0,
						onChange: (next) => set({ imageSketchAgent: next })
					})]
				})]
			});
		}
		function MorePage({ preference, rpc, t, diagnostics, active = true }) {
			const snapshot = usePreferenceSnapshot(preference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionAdvancedPreferences",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteControlCard, {
						rpc,
						preference,
						snapshot,
						t,
						active
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(VoiceCallCard, {
						rpc,
						preference,
						snapshot,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StorageCard, {
						rpc,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsCard, {
						rpc,
						t,
						diagnostics
					})
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
		//#region src/client-account-quota.jsx
		const when = (seconds) => (/* @__PURE__ */ new Date(seconds * 1e3)).toLocaleString(uiLocale(), {
			month: "numeric",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		});
		/** Quota of every signed-in account (read-only; the active account does not change). */
		function useAccountQuotas(rpc, ids, active = true) {
			const [entries, setEntries] = (0, react.useState)({});
			const [busy, setBusy] = (0, react.useState)(false);
			const request = (0, react.useRef)(0);
			const flight = (0, react.useRef)();
			const activeRef = (0, react.useRef)(active);
			activeRef.current = active;
			const key = ids.join(",");
			const load = (force) => {
				if (ids.length < 2) {
					setEntries({});
					return;
				}
				if (!activeRef.current || document.visibilityState === "hidden") return;
				if (flight.current) {
					const current = flight.current;
					if (force && !current.force) return current.promise.catch(() => {}).then(() => request.current === current.id ? load(true) : void 0);
					return current.promise;
				}
				const id = ++request.current;
				setBusy(true);
				const current = {
					id,
					force
				};
				current.promise = recoveryCall(rpc, "usage/accounts", { force }).then((value) => {
					if (request.current === id) setEntries(Object.fromEntries((value?.accounts ?? []).map((entry) => [entry.id, entry])));
				}).catch(() => {
					if (request.current === id) setEntries(Object.fromEntries(ids.map((account) => [account, {
						id: account,
						error: "Could not read ChatGPT usage"
					}])));
				}).finally(() => {
					if (flight.current === current) flight.current = void 0;
					if (request.current === id) setBusy(false);
				});
				flight.current = current;
				return current.promise;
			};
			(0, react.useEffect)(() => {
				if (ids.length < 2) {
					setEntries({});
					setBusy(false);
				}
				return () => {
					request.current += 1;
					flight.current = void 0;
				};
			}, [key, rpc]);
			(0, react.useEffect)(() => {
				if (ids.length < 2 || !active) return void 0;
				let timer;
				const stop = () => {
					clearInterval(timer);
					timer = void 0;
				};
				const again = () => load(false);
				const wake = () => {
					stop();
					if (document.visibilityState === "hidden") return;
					again();
					timer = setInterval(again, 6e4);
				};
				wake();
				window.addEventListener("codex-subscription:usage-loaded", again);
				document.addEventListener("visibilitychange", wake);
				return () => {
					window.removeEventListener("codex-subscription:usage-loaded", again);
					document.removeEventListener("visibilitychange", wake);
					stop();
				};
			}, [
				key,
				active,
				rpc
			]);
			return {
				entries,
				busy,
				refresh: () => load(true)
			};
		}
		function AccountQuota({ entry, loading, t }) {
			if (entry === void 0) return loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
				className: "codexSubscriptionAccountQuota",
				children: t("accountQuotaLoading")
			}) : null;
			if (entry.error !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
				className: "codexSubscriptionAccountQuota",
				"data-state": "error",
				children: entry.error === "ChatGPT sign-in needs to be renewed" ? t("resetRenewLogin") : t("accountQuotaError")
			});
			const windows = entry.usage?.rateLimits?.find((limit) => limit.id === "codex")?.windows ?? [];
			if (windows.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
				className: "codexSubscriptionAccountQuota",
				children: t("accountQuotaNone")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
				className: "codexSubscriptionAccountQuota",
				children: windows.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [fill(t("accountQuotaLeft"), {
					label: windowLabel(window.windowSeconds, t),
					value: percent(window.remainingPercent)
				}), window.resetsAt === void 0 ? "" : ` · ${fill(t("accountQuotaResets"), { value: when(window.resetsAt) })}`] }, window.windowSeconds))
			});
		}
		//#endregion
		//#region src/client-account.jsx
		const LOGIN_FAILURES = [
			"account-claim",
			"network",
			"token-exchange",
			"callback"
		];
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
		const signedInIds = (account) => account?.authenticated === true ? (account.accounts ?? []).map((candidate) => candidate.id).filter((id) => typeof id === "string") : [];
		function AccountCard({ rpc, t, account, setAccount, onSignedOut, active = true }) {
			const [flow, setFlow] = (0, react.useState)();
			const flowGeneration = (0, react.useRef)(0);
			const [manualCode, setManualCode] = (0, react.useState)("");
			const [adding, setAdding] = (0, react.useState)(false);
			const [removeId, setRemoveId] = (0, react.useState)();
			const [confirmSignOut, setConfirmSignOut] = (0, react.useState)(false);
			const [emailVisible, setEmailVisible] = (0, react.useState)(false);
			const accounts = account?.accounts ?? [];
			const accountVisibilityKey = `${account?.authenticated === true ? "signed-in" : "signed-out"}:${accounts.map((candidate) => `${candidate.id ?? ""}:${candidate.active === true}:${candidate.email ?? ""}`).join("|")}`;
			const [emailVisibilityKey, setEmailVisibilityKey] = (0, react.useState)(accountVisibilityKey);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const quotas = useAccountQuotas(rpc, signedInIds(account), active);
			const call = (endpoint, payload = {}) => recoveryCall(rpc, endpoint, payload);
			(0, react.useEffect)(() => {
				if (emailVisibilityKey === accountVisibilityKey) return;
				setEmailVisible(false);
				setEmailVisibilityKey(accountVisibilityKey);
			}, [accountVisibilityKey, emailVisibilityKey]);
			(0, react.useEffect)(() => {
				if (busy || flow?.id === void 0 || [
					"authenticated",
					"failed",
					"cancelled"
				].includes(flow.phase)) return void 0;
				let live = true;
				let reading = false;
				const generation = flowGeneration.current;
				const timer = window.setInterval(() => {
					if (reading) return;
					reading = true;
					(adding ? call("login/status", { id: flow.id }).then(async (nextFlow) => ({
						flow: nextFlow,
						account: nextFlow.phase === "authenticated" ? await call("status") : void 0
					})) : readLoginProgress({
						flow,
						readFlow: () => call("login/status", { id: flow.id }),
						readAccount: () => call("status")
					})).then((next) => {
						if (!live || generation !== flowGeneration.current) return;
						setFlow(next.flow);
						setError(void 0);
						if (next.account !== void 0) {
							setAccount(next.account);
							onSignedOut();
							setAdding(false);
							setFlow(void 0);
							notifyQuickQuota();
						}
					}).catch(() => {
						if (live && generation === flowGeneration.current) setError(t("failed"));
					}).finally(() => {
						reading = false;
					});
				}, 800);
				return () => {
					live = false;
					window.clearInterval(timer);
				};
			}, [
				flow?.id,
				flow?.phase,
				adding,
				busy
			]);
			const begin = (method, label) => {
				flowGeneration.current += 1;
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
				flowGeneration.current += 1;
				setBusy(true);
				setError(void 0);
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
				setConfirmSignOut(false);
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
							children: signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy || loginVisible,
								onClick: () => {
									setFlow(void 0);
									setAdding(true);
								},
								children: t("addAccount")
							}), confirmSignOut ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: logout,
								children: t("signOutConfirm")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								onClick: () => setConfirmSignOut(false),
								children: t("removeCancel")
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy || loginVisible,
								onClick: () => setConfirmSignOut(true),
								children: t("signOutAll")
							})] }) : accountReady && (flow === void 0 || ["failed", "cancelled"].includes(flow.phase)) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "primary",
								disabled: busy,
								onClick: () => begin("browser"),
								children: t("browserLogin")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionAccountMain",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountEmail, {
									candidate,
									fallback: candidate.label,
									t,
									emailVisible: emailVisibleForAccount,
									onClick: toggleEmail
								}), accounts.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountQuota, {
									entry: quotas.entries[candidate.id],
									loading: quotas.busy,
									t
								}) : null]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionActions",
								children: [
									candidate.active ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "outline",
										disabled: busy || loginVisible,
										onClick: () => selectAccount(candidate.id),
										children: t("switchAccount")
									}),
									accounts.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
										type: "button",
										variant: "outline",
										disabled: busy || loginVisible,
										onClick: () => removeAccount(candidate.id),
										children: removeId === candidate.id ? t("removeConfirm") : t("removeAccount")
									}) : null,
									removeId === candidate.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "primary",
									disabled: busy,
									onClick: () => begin("browser"),
									children: t("browserLogin")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: () => begin("device_code"),
									children: t("deviceLogin")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("waiting") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: cancel,
								children: t("cancel")
							})
						]
					}) : null,
					flow?.phase === "waiting_input" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: "codexSubscriptionFlow",
						onSubmit: submit,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("manualCode") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Input, {
								className: "codexSubscriptionInput",
								value: manualCode,
								onChange: (event) => setManualCode(event.currentTarget.value),
								autoComplete: "off",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "submit",
									variant: "primary",
									disabled: busy || manualCode.trim() === "",
									children: t("submit")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
						children: error ?? (LOGIN_FAILURES.includes(flow?.failure) ? t(`failed_${flow.failure.replace("-", "_")}`) : t("failed"))
					}) : null
				]
			});
		}
		function AccountFailureCard({ accountStatus, snapshot, t, rpc, onRecovered }) {
			const retrying = snapshot.retrying === true;
			const [confirm, setConfirm] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const clear = async () => {
				if (!confirm) {
					setConfirm(true);
					return;
				}
				setBusy(true);
				setFailed(false);
				try {
					const next = await recoveryCall(rpc, "logout");
					accountStatus.acceptAccount(next);
					onRecovered();
					notifyQuickQuota();
				} catch {
					setFailed(true);
				} finally {
					setBusy(false);
					setConfirm(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionRecover",
				role: "alert",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						children: retrying ? t("accountRetrying") : accountStatusErrorText(snapshot.error, t)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionActions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: retrying || busy,
								"aria-busy": retrying,
								onClick: () => {
									accountStatus.retry();
								},
								children: retrying ? t("accountRetrying") : t("accountRetry")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy || retrying,
								onClick: () => void clear(),
								children: busy ? t("accountRetrying") : t(confirm ? "recoveryClearConfirm" : "recoveryClear")
							}),
							confirm ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => setConfirm(false),
								children: t("cancel")
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, {
						t,
						as: "p",
						children: t(confirm ? "recoveryClearHint" : "recoveryHint")
					}),
					failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						children: t("recoveryFailed")
					}) : null
				]
			});
		}
		Object.freeze({
			credits: 62500,
			expiresAt: Date.UTC(2026, 11, 31, 12)
		}).credits * 1.1;
		const DAY_MS = 864e5;
		/** Whole days left, and whether the expiry is close enough to call out. */
		function creditExpiryStatus(expiry, now = Date.now()) {
			if (expiry === void 0) return void 0;
			const daysLeft = Math.max(0, Math.ceil((expiry.expiresAt - now) / DAY_MS));
			return {
				daysLeft,
				soon: daysLeft <= 30
			};
		}
		/** Calendar date of the expiry. The estimated grant is a UTC calendar day, so it is formatted in UTC and never slips to 1/1 east of UTC+11. */
		function creditExpiryDateText(expiresAt, source, locale) {
			return new Date(expiresAt).toLocaleDateString(locale, source === "estimate" ? { timeZone: "UTC" } : void 0);
		}
		//#endregion
		//#region src/history-pending.js
		function reportedHistoryPeriods(periods = []) {
			return periods.filter((period) => Number.isFinite(period.usedPercent) || Object.values(period.breakdowns ?? {}).some((rows) => rows.length > 0)).sort((a, b) => b.startsAt - a.startsAt);
		}
		const historyPeriodKey = (period) => `${period.startsAt}:${period.endsAt}:${period.windowMinutes ?? ""}`;
		function selectHistoryPeriod(periods, selected, now = Date.now()) {
			return periods.find((period) => historyPeriodKey(period) === selected) ?? periods.find((period) => period.startsAt <= now && period.endsAt > now) ?? periods[0];
		}
		//#endregion
		//#region src/usage-heatmap.js
		const pad = (value) => String(value).padStart(2, "0");
		const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
		/** Monday-first for locales that start the week there; Intl knows, with Sunday as the fallback. */
		function firstWeekday(locale) {
			try {
				const info = new Intl.Locale(locale ?? "en-US");
				const day = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
				return Number.isInteger(day) ? day % 7 : 0;
			} catch {
				return 0;
			}
		}
		/**
		* Grid cells for the last `weeks` weeks. The report's day keys carry no time zone, so the grid never ends before the newest
		* day the report has: late in the evening or early morning the report can be a day ahead of the local calendar, and that
		* day would otherwise fall off the grid.
		*/
		function heatmapCells(days, { now = /* @__PURE__ */ new Date(), weeks = 26, firstDay = 0 } = {}) {
			const byDate = new Map(days.map((day) => [day.date, day.tokens]));
			const end = new Date(now);
			end.setHours(0, 0, 0, 0);
			for (const day of days) {
				const [year, month, date] = day.date.split("-").map(Number);
				const parsed = new Date(year, month - 1, date);
				if (parsed > end && parsed - end <= 2 * 864e5) end.setTime(parsed.getTime());
			}
			const start = new Date(end);
			start.setDate(start.getDate() - ((weeks - 1) * 7 + (end.getDay() - firstDay + 7) % 7));
			const cells = [];
			for (let index = 0; index < weeks * 7; index += 1) {
				const date = new Date(start);
				date.setDate(start.getDate() + index);
				if (date > end) break;
				cells.push({
					date: dayKey(date),
					tokens: byDate.get(dayKey(date)) ?? 0,
					column: Math.floor(index / 7),
					row: index % 7
				});
			}
			return cells;
		}
		/** "32.1 小时" / "5 分钟": the unit words come from the interface language. */
		function formatDuration(seconds, t) {
			return seconds >= 3600 ? t("overviewHours").replace("{value}", String(Math.round(seconds / 360) / 10)) : t("overviewMinutes").replace("{value}", String(Math.max(1, Math.round(seconds / 60))));
		}
		//#endregion
		//#region src/client-usage-overview.jsx
		const WEEKS = 26;
		const compact = (value) => new Intl.NumberFormat(uiLocale(), {
			notation: "compact",
			maximumFractionDigits: 1
		}).format(value);
		function UsageHeatmap({ days, t }) {
			const cells = heatmapCells(days, {
				weeks: WEEKS,
				firstDay: firstWeekday(uiLocale())
			});
			const busy = cells.map((cell) => cell.tokens).filter((tokens) => tokens > 0).sort((a, b) => a - b);
			const level = (tokens) => tokens === 0 ? 0 : 1 + [
				.25,
				.5,
				.75
			].filter((point) => tokens > busy[Math.floor((busy.length - 1) * point)]).length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: "codexSubscriptionHeatmap",
				viewBox: `0 0 ${WEEKS * 14} 98`,
				role: "img",
				"aria-label": t("overviewHeatmap"),
				children: cells.map((cell) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: cell.column * 14,
					y: cell.row * 14,
					width: "11",
					height: "11",
					rx: "2",
					"data-level": level(cell.tokens),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("title", { children: `${cell.date}: ${cell.tokens === 0 ? t("overviewNoUse") : fill(t("overviewTokens"), { value: compact(cell.tokens) })}` })
				}, cell.date))
			});
		}
		function UsageOverview({ rpc, t, signedIn, resetKey }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const request = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				request.current += 1;
				setState({ status: "idle" });
			}, [signedIn, resetKey]);
			(0, react.useEffect)(() => {
				if (!open || !signedIn || state.status !== "idle") return;
				const id = ++request.current;
				setState({ status: "loading" });
				recoveryCall(rpc, "usage/profile", {}).then((value) => {
					if (request.current === id) setState({
						status: "ready",
						value
					});
				}).catch((error) => {
					if (request.current === id) setState({
						status: "error",
						message: error.message
					});
				});
			}, [
				open,
				signedIn,
				state.status,
				rpc
			]);
			if (!signedIn) return null;
			const value = state.value;
			const stats = value === void 0 || value.available === false ? [] : [
				[t("overviewLifetime"), value.lifetimeTokens === void 0 ? void 0 : compact(value.lifetimeTokens)],
				[t("overviewPeak"), value.peakDailyTokens === void 0 ? void 0 : compact(value.peakDailyTokens)],
				[t("overviewStreak"), value.currentStreakDays === void 0 ? void 0 : fill(t("overviewDays"), { value: value.currentStreakDays })],
				[t("overviewLongestStreak"), value.longestStreakDays === void 0 ? void 0 : fill(t("overviewDays"), { value: value.longestStreakDays })],
				[t("overviewThreads"), value.totalThreads === void 0 ? void 0 : value.totalThreads.toLocaleString(uiLocale())],
				[t("overviewEffort"), value.mostUsedReasoningEffort === void 0 ? void 0 : `${value.mostUsedReasoningEffort}${value.mostUsedReasoningEffortPercent === void 0 ? "" : ` · ${value.mostUsedReasoningEffortPercent}%`}`],
				[t("overviewFast"), value.fastModePercent === void 0 ? void 0 : `${value.fastModePercent}%`],
				[t("overviewLongestTurn"), value.longestRunningTurnSeconds === void 0 ? void 0 : formatDuration(value.longestRunningTurnSeconds, t)]
			].filter(([, text]) => text !== void 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "codexSubscriptionHistory",
				onToggle: (event) => setOpen(event.currentTarget.open),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("overviewTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"aria-live": "polite",
						children: [
							state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								role: "status",
								children: t("overviewLoading")
							}) : null,
							state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionError",
								role: "alert",
								children: state.message
							}) : null,
							state.status === "ready" && stats.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								role: "status",
								children: t("overviewUnavailable")
							}) : null
						]
					}),
					stats.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
						className: "codexSubscriptionOverviewStats",
						children: stats.map(([label, text]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: text })] }, label))
					}), value.days.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageHeatmap, {
						days: value.days,
						t
					})] })
				]
			});
		}
		//#endregion
		//#region src/client-usage-history.jsx
		const DIMENSIONS = [
			"model",
			"surface",
			"thread_source",
			"turn_trigger"
		];
		const LABELS = /* @__PURE__ */ new Map([
			["desktop_app", "historyDesktopApp"],
			["cli", "historyCli"],
			["ide_extension", "historyIde"],
			["web", "historyWeb"],
			["mobile", "historyMobile"],
			["user", "historyUser"],
			["subagent", "historySubagent"],
			["memory_consolidation", "historyMemory"],
			["review", "historyReview"],
			["composer", "historyComposer"],
			["automation", "historyAutomation"]
		]);
		const day = (value) => new Date(value).toLocaleDateString(uiLocale(), {
			month: "numeric",
			day: "numeric"
		});
		const amount = (value) => value > 0 && value < .1 ? "<0.1" : (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10).toLocaleString(uiLocale());
		const labelOf = (dimension, key, t) => dimension === "model" ? key : LABELS.has(key) ? t(LABELS.get(key)) : key.replaceAll("_", " ");
		function Rows({ dimension, rows, total, t }) {
			const top = Math.max(total ?? 0, ...rows.map((row) => row.percent));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionHistoryGroup",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t(`historyBy_${dimension}`) }), rows.toSorted((a, b) => b.percent - a.percent).map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionHistoryRow",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionHistoryKey",
							children: labelOf(dimension, row.key, t)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							max: top,
							value: row.percent,
							"aria-label": `${labelOf(dimension, row.key, t)} ${amount(row.percent)}%`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [amount(row.percent), "%"] })
					]
				}, row.key))]
			});
		}
		function UsageHistory({ rpc, t, signedIn, resetKey, refreshKey, forceRefreshKey }) {
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const [selected, setSelected] = (0, react.useState)();
			const request = (0, react.useRef)(0);
			const lastForceRefresh = (0, react.useRef)(forceRefreshKey);
			(0, react.useEffect)(() => {
				setSelected(void 0);
			}, [signedIn, resetKey]);
			const load = (0, react.useCallback)((force) => {
				if (!signedIn) return;
				const id = ++request.current;
				setState((previous) => ({
					status: "loading",
					resetKey,
					value: previous.resetKey === resetKey ? previous.value : void 0
				}));
				recoveryCall(rpc, "usage/history", { force }, 2e4).then((value) => {
					if (request.current === id) setState({
						status: "ready",
						resetKey,
						value
					});
				}).catch((error) => {
					if (request.current === id) setState((previous) => ({
						status: "error",
						resetKey,
						value: previous.resetKey === resetKey ? previous.value : void 0,
						message: error.message
					}));
				});
			}, [
				signedIn,
				rpc,
				resetKey
			]);
			(0, react.useEffect)(() => {
				const force = lastForceRefresh.current !== forceRefreshKey;
				lastForceRefresh.current = forceRefreshKey;
				load(force);
				return () => {
					request.current += 1;
				};
			}, [
				signedIn,
				resetKey,
				refreshKey,
				forceRefreshKey,
				load
			]);
			if (!signedIn) return null;
			const value = state.resetKey === resetKey ? state.value : void 0;
			const periods = value?.available === false ? [] : reportedHistoryPeriods(value?.periods);
			const period = selectHistoryPeriod(periods, selected);
			if (period === void 0) return null;
			const present = DIMENSIONS.filter((dimension) => period?.breakdowns?.[dimension]?.length > 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "codexSubscriptionHistory",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("historyTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "codexSubscriptionHistoryRefresh",
						type: "button",
						disabled: state.status === "loading",
						onClick: () => load(true),
						children: t("historyRefresh")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"aria-live": "polite",
						children: [state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionEmpty",
							role: "status",
							children: t("historyLoading")
						}) : null, state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionError",
							role: "alert",
							children: state.message
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionHistoryPeriods",
						role: "group",
						"aria-label": t("historyPeriods"),
						children: periods.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": item === period,
							onClick: () => setSelected(historyPeriodKey(item)),
							children: `${day(item.startsAt)}–${day(item.endsAt)}`
						}, historyPeriodKey(item)))
					}),
					period.usedPercent !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "codexSubscriptionHistorySummary",
						children: [fill(t("historyUsed"), { value: amount(period.usedPercent) }), period.complete ? "" : ` ${t("historyPartial")}`]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionEmpty",
						role: "status",
						children: t("historyTotalUnavailable")
					}),
					present.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionEmpty",
						role: "status",
						children: t("historyNoBreakdown")
					}) : null,
					present.map((dimension) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Rows, {
						dimension,
						rows: period.breakdowns[dimension],
						total: period.usedPercent,
						t
					}, dimension)),
					value.asOf ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionCreditNote",
						children: fill(t("historyAsOf"), { date: new Date(value.asOf).toLocaleDateString(uiLocale(), {
							month: "numeric",
							day: "numeric"
						}) })
					}) : null,
					value.approximate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionCreditNote",
						children: t("historyApproximate")
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client-usage.jsx
		const count = (value) => Number(value).toLocaleString(uiLocale());
		function CreditExpiry({ credits, t }) {
			if (validDate(credits.expiresAt) === void 0 || credits.unlimited) return null;
			const status = creditExpiryStatus({ expiresAt: credits.expiresAt });
			const estimate = credits.expirySource === "estimate";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexSubscriptionCreditExpiry",
				"data-soon": status.soon,
				role: "status",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [fill(t(status.daysLeft === 0 ? "creditsExpiredToday" : "creditsExpires"), {
					date: creditExpiryDateText(credits.expiresAt, credits.expirySource, uiLocale()),
					days: status.daysLeft
				}), estimate ? ` ${t("creditsExpiryEstimate")}` : ""] })
			});
		}
		function ResetTime({ resetsAt, t }) {
			const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1e3) : void 0;
			if (date === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetUnknown") });
			const value = date.toLocaleString(uiLocale(), {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
				dateTime: date.toISOString(),
				title: date.toLocaleString(uiLocale()),
				children: fill(t("resets"), { value })
			});
		}
		function ResetCreditExpiry({ expiresAt, t }) {
			const date = validDate(expiresAt);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "codexSubscriptionResetExpiry",
				children: date === void 0 ? t("resetCreditExpiryUnknown") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
					dateTime: date.toISOString(),
					title: date.toLocaleString(uiLocale()),
					children: fill(t("resetCreditExpires"), { value: date.toLocaleDateString(uiLocale(), {
						month: "long",
						day: "numeric"
					}) })
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
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: credit.name === void 0 ? t("resetCreditDefaultName") : /^full reset$/iu.test(credit.name) ? t("resetFull") : credit.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCreditExpiry, {
							expiresAt: credit.expiresAt,
							t
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionActions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									disabled: resetBusy,
									onClick: cancelReset,
									children: t("cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
				["ChatGPT blocked this request before it reached your account (HTTP 403); your sign-in is fine, try again later or check your network, proxy or VPN", "resetBlocked"],
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
			const { usage, busy, error, now, refresh } = useQuotaUsage(rpc, signedIn);
			const [historyRefreshKey, setHistoryRefreshKey] = (0, react.useState)(0);
			const forecastMode = usePreferenceSnapshot(preference).quickQuotaMode === QUICK_QUOTA_MODE_FORECAST;
			const load = (force) => {
				if (!signedIn) return;
				if (force) setHistoryRefreshKey((value) => value + 1);
				refresh(force).catch(() => {});
			};
			const usageRefreshGeneration = usage?.fetchedAt ?? 0;
			const visibleUsage = signedIn ? usage : void 0;
			const limits = visibleUsage?.rateLimits ?? [];
			const exhausted = limits.some((limit) => limit.id !== "code_review" && limit.windows.some((window) => window.usedPercent >= 100));
			const hasUsageDetails = limits.length > 0 || visibleUsage?.chatPass !== void 0 || visibleUsage?.credits !== void 0 || visibleUsage?.individualLimit !== void 0 || visibleUsage?.resetCredits?.availableCount > 0;
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
								children: fill(t("usageUpdated"), { value: fetchedAt.toLocaleString(uiLocale()) })
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
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
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "codexSubscriptionLimitPeriod",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: windowLabel(window.windowSeconds, t) })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
										resetsAt: window.resetsAt,
										t
									})]
								}),
								forecastMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "codexSubscriptionForecast",
									role: "status",
									children: formatQuotaForecast(window.forecast, t, {
										...window,
										fetchedAt: visibleUsage.fetchedAt,
										now,
										refreshError: error !== void 0
									})
								}) : null
							]
						}, `${limit.id}-${window.windowSeconds}-${index}`)))
					}),
					limits.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageOverview, {
						rpc,
						t,
						signedIn,
						resetKey
					}),
					limits.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageHistory, {
						rpc,
						t,
						signedIn,
						resetKey,
						refreshKey: usageRefreshGeneration,
						forceRefreshKey: historyRefreshKey
					}),
					visibleUsage?.chatPass === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionLimits",
						children: visibleUsage.chatPass.windows.map((window, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionLimit",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimitTop",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "codexSubscriptionLimitLabel",
										children: t("chatPass")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [percent(window.remainingPercent), "%"] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
									max: "100",
									value: window.remainingPercent,
									"aria-label": `${t("chatPass")} ${fill(t("remaining"), { value: percent(window.remainingPercent) })}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimitMeta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "codexSubscriptionLimitPeriod",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: windowLabel(window.windowSeconds, t) })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
										resetsAt: window.resetsAt,
										t
									})]
								})
							]
						}, `chatpass-${window.windowSeconds}-${index}`))
					}),
					visibleUsage?.credits === void 0 && visibleUsage?.individualLimit === void 0 && !(visibleUsage?.resetCredits?.availableCount > 0) ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "codexSubscriptionCreditSection codexAdvancedFold codexAdvancedInline",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t("creditsFoldTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: visibleUsage?.credits ? visibleUsage.credits.unlimited ? t("unlimited") : visibleUsage.credits.balance == null ? t("unavailable") : `${creditAmount(visibleUsage.credits.balance)} ${t("creditsUnit")}` : "" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionCreditNote",
								children: t("creditsNote")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionCreditRows",
								children: [
									visibleUsage?.credits ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "codexSubscriptionCreditBalance",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("creditsBalance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: visibleUsage.credits.unlimited ? t("unlimited") : visibleUsage.credits.balance == null ? t("unavailable") : `${creditAmount(visibleUsage.credits.balance)} ${t("creditsUnit")}` })]
									}) : null,
									visibleUsage?.credits ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditExpiry, {
										credits: visibleUsage.credits,
										t
									}) : null,
									visibleUsage?.credits && !visibleUsage.credits.unlimited ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "codexSubscriptionCreditNote",
										children: t("creditsAfterAllowance")
									}) : null,
									visibleUsage?.credits?.approxLocalMessages ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "codexSubscriptionCreditNote",
										children: fill(t("creditsMessages"), {
											local: `${count(visibleUsage.credits.approxLocalMessages[0])}–${count(visibleUsage.credits.approxLocalMessages[1])}`,
											cloud: visibleUsage.credits.approxCloudMessages ? `${count(visibleUsage.credits.approxCloudMessages[0])}–${count(visibleUsage.credits.approxCloudMessages[1])}` : t("unavailable")
										})
									}) : null,
									visibleUsage?.resetCredits?.availableCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: "codexSubscriptionResetPanel",
										"aria-label": t("resetCredits"),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionResetHead",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("resetCredits") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetCreditsHint") })]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionResetBox",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "codexSubscriptionResetTabs",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [t("resetAvailableTab"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: visibleUsage.resetCredits.availableCount })] })
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCreditList, {
												rpc,
												t,
												count: visibleUsage.resetCredits.availableCount,
												nextExpiresAt: visibleUsage.resetCredits.nextExpiresAt,
												initialCredits: visibleUsage.resetCredits.credits,
												refreshKey: `${resetKey}:${usageRefreshGeneration}`,
												hasExhaustedQuota: exhausted,
												onConsumed: () => load(true)
											})]
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
													used: creditAmount(visibleUsage.individualLimit.used),
													limit: creditAmount(visibleUsage.individualLimit.limit)
												}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
													resetsAt: visibleUsage.individualLimit.resetsAt,
													t
												})]
											})
										]
									}) : null
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client-section.jsx
		/** The tab bar sticks to the top while the page scrolls under it, so it must paint the dialog's own background (which differs per theme). */
		function useBackdropOf(ref) {
			(0, react.useLayoutEffect)(() => {
				const node = ref.current;
				if (!node) return void 0;
				const paint = () => {
					let parent = node.parentElement;
					while (parent) {
						const parts = getComputedStyle(parent).backgroundColor.match(/[\d.]+/gu);
						if (parts && parts.length >= 3 && (parts.length < 4 || Number(parts[3]) > 0)) {
							node.style.background = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
							return;
						}
						parent = parent.parentElement;
					}
					node.style.background = "";
				};
				paint();
				const watcher = new MutationObserver(paint);
				watcher.observe(document.documentElement, { attributes: true });
				watcher.observe(document.body, { attributes: true });
				const media = window.matchMedia?.("(prefers-color-scheme: dark)");
				media?.addEventListener?.("change", paint);
				return () => {
					watcher.disconnect();
					media?.removeEventListener?.("change", paint);
				};
			}, [ref]);
		}
		/** One place for what is wrong right now, whichever page the user is on. */
		function Notices({ preference, t, tab, signedIn, go }) {
			const snapshot = usePreferenceSnapshot(preference);
			const items = [];
			if (snapshot.error) items.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "codexSubscriptionError",
				role: "alert",
				children: [
					t("preferenceFailed"),
					" ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							preference.retry();
						},
						children: t("preferenceRetry")
					})
				]
			}, "failed"));
			if (snapshot.restartRequired) items.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "codexSubscriptionNotice",
				role: "status",
				children: t("settingsRestartRequired")
			}, "restart"));
			if (snapshot.hostReadOnly) items.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "codexSubscriptionNotice",
				role: "status",
				children: t("settingsReadonly")
			}, "readonly"));
			if (signedIn === false && tab !== "start") items.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "codexSubscriptionNotice",
				role: "status",
				children: [
					t("needSignIn"),
					" ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => go("start"),
						children: t("needSignInGo")
					})
				]
			}, "signin"));
			return items.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexSubscriptionNotices",
				children: items
			});
		}
		function CodexSection({ preference, rpc, accountStatus, t, diagnostics, defaultModel }) {
			const [tab, setTab] = (0, react.useState)("start");
			const [visited, setVisited] = (0, react.useState)(() => /* @__PURE__ */ new Set(["start"]));
			const selectTab = (value) => {
				setVisited((current) => current.has(value) ? current : /* @__PURE__ */ new Set([...current, value]));
				setTab(value);
			};
			const tabsRef = (0, react.useRef)(null);
			useBackdropOf(tabsRef);
			const id = (0, react.useId)();
			const tabs = [
				"start",
				"models",
				"tools",
				"create",
				"more"
			];
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSettingsTabs",
						ref: tabsRef,
						role: "tablist",
						"aria-label": t("title"),
						children: tabs.map((value, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							id: `${id}-${value}-tab`,
							"aria-controls": `${id}-${value}`,
							"aria-selected": tab === value,
							tabIndex: tab === value ? 0 : -1,
							onClick: () => selectTab(value),
							onKeyDown: (event) => {
								const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
								if (next < 0) return;
								event.preventDefault();
								selectTab(tabs[next]);
								document.getElementById(`${id}-${tabs[next]}-tab`)?.focus();
							},
							children: t(`settingsTab_${value}`)
						}, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Notices, {
						preference,
						t,
						tab,
						signedIn: account === void 0 ? void 0 : account.authenticated === true,
						go: selectTab
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexFlat",
						role: "tabpanel",
						id: `${id}-start`,
						"aria-labelledby": `${id}-start-tab`,
						hidden: tab !== "start",
						children: [
							accountSnapshot.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFailureCard, {
								accountStatus,
								snapshot: accountSnapshot,
								t,
								rpc,
								onRecovered: accountChanged
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
								rpc,
								t,
								account,
								setAccount,
								onSignedOut: accountChanged,
								active: tab === "start"
							}),
							account === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageCard, {
								rpc,
								t,
								signedIn: account.authenticated === true,
								resetKey,
								preference
							}, resetKey),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaSettingsCard, {
								preference,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureOverview, {
								preference,
								t,
								go: selectTab
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexFlat",
						role: "tabpanel",
						id: `${id}-models`,
						"aria-labelledby": `${id}-models-tab`,
						hidden: tab !== "models",
						children: visited.has("models") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelsPage, {
							preference,
							t,
							defaultModel
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexFlat",
						role: "tabpanel",
						id: `${id}-tools`,
						"aria-labelledby": `${id}-tools-tab`,
						hidden: tab !== "tools",
						children: visited.has("tools") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolsPage, {
							preference,
							rpc,
							t,
							active: tab === "tools"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexFlat",
						role: "tabpanel",
						id: `${id}-create`,
						"aria-labelledby": `${id}-create-tab`,
						hidden: tab !== "create",
						children: visited.has("create") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreatePage, {
							preference,
							t
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexFlat",
						role: "tabpanel",
						id: `${id}-more`,
						"aria-labelledby": `${id}-more-tab`,
						hidden: tab !== "more",
						children: visited.has("more") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MorePage, {
							preference,
							rpc,
							t,
							diagnostics,
							active: tab === "more"
						})
					})
				]
			});
		}
		//#endregion
		//#region src/diagnostic-checks.js
		const states = /* @__PURE__ */ new Set([
			"pass",
			"fail",
			"warn",
			"unknown",
			"not-applicable"
		]);
		/** Adapters return bounded reason codes, never exceptions or raw service data. */
		async function collectChecks(definitions, { timeoutMs = 1500, now = Date.now, source = "server", scope = "plugin-process" } = {}) {
			return Promise.all(definitions.map(async ({ id, capability, run }) => {
				const startedAt = now();
				let timer;
				const controller = new AbortController();
				const base = {
					id,
					capability,
					source,
					scope
				};
				try {
					if (!run) return {
						...base,
						status: "unknown",
						reason: "not-instrumented",
						observedAt: now()
					};
					const result = await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise((resolve) => {
						timer = setTimeout(() => {
							controller.abort();
							resolve({
								status: "unknown",
								reason: "inspection-timeout"
							});
						}, timeoutMs);
					})]);
					const valid = states.has(result?.status) && /^[a-z][a-z0-9-]{0,63}$/u.test(result?.reason ?? "");
					return {
						...base,
						status: valid ? result.status : "unknown",
						reason: valid ? result.reason : "invalid-inspection-result",
						observedAt: now(),
						elapsedMs: Math.max(0, now() - startedAt)
					};
				} catch {
					return {
						...base,
						status: "unknown",
						reason: "inspection-failed",
						observedAt: now(),
						elapsedMs: Math.max(0, now() - startedAt)
					};
				} finally {
					clearTimeout(timer);
				}
			}));
		}
		Object.freeze([
			"account",
			"accounts",
			"settings",
			"models",
			"quota",
			"search",
			"images",
			"sketch",
			"subagents",
			"compaction",
			"transport",
			"storage",
			"host-ui"
		]);
		//#endregion
		//#region src/diagnostic-host.js
		const roots = [
			"settings.section",
			"conversation.input.right",
			"conversation.input.model",
			"conversation.input.attachments",
			"conversation.chat.message.images",
			"conversation.chat.user.images",
			"tool.call.images",
			"conversation.trajectory.images",
			"shell.overlay"
		];
		const packageName = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]{0,99}$/u;
		function projectHostSlots(slots) {
			if (typeof slots?.snapshot !== "function") return void 0;
			return roots.map((name) => {
				const nodes = slots.snapshot(name);
				const node = Array.isArray(nodes) ? nodes.find((item) => item.type === "slot" && item.name === name) : void 0;
				const occupants = Array.isArray(node?.occupants) ? node.occupants : [];
				return {
					name,
					declared: !!node,
					truncated: occupants.length > 16,
					occupants: occupants.slice(0, 16).map((value) => ({
						registrant: typeof value.registrant === "string" && packageName.test(value.registrant) ? value.registrant : "unknown",
						identity: "unverified-host-label",
						active: value.active === true
					}))
				};
			});
		}
		function createHostDiagnostics() {
			const scopes = /* @__PURE__ */ new Map();
			let sequence = 0;
			return {
				register(slots) {
					const item = scopes.get(slots) ?? {
						alias: `scope-${++sequence}`,
						count: 0
					};
					item.count++;
					scopes.set(slots, item);
					return () => {
						if (--item.count === 0) scopes.delete(slots);
					};
				},
				async collect() {
					const topology = [];
					const active = [...scopes.entries()].slice(0, 8);
					const checks = await collectChecks(active.map(([slots, item]) => ({
						id: `host-slots-${item.alias}`,
						capability: "host-ui",
						run: () => {
							const value = projectHostSlots(slots);
							if (!value) return {
								status: "unknown",
								reason: "host-inspection-unavailable"
							};
							topology.push({
								scope: item.alias,
								slots: value
							});
							return {
								status: "pass",
								reason: "inspection-completed"
							};
						}
					})), {
						source: "client",
						scope: "mounted-host-scopes"
					});
					return {
						version: PACKAGE_VERSION,
						generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
						checks,
						topology,
						truncated: scopes.size > active.length,
						interpretation: "host-selection-not-visual-or-execution-proof"
					};
				}
			};
		}
		//#endregion
		//#region src/composer-prediction-controller.js
		const EMPTY = Object.freeze({
			prediction: null,
			status: "idle"
		});
		const MODELS = /* @__PURE__ */ new Set([
			"gpt-6-astra",
			"gpt-6.1-sol",
			"gpt-6.1-terra"
		]);
		const textOf = (blocks, field) => (Array.isArray(blocks) ? blocks : []).filter((block) => block?.[field] === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
		/** Account identity is local admission state, never part of the prediction payload. */
		function composerPredictionAccountKey(snapshot) {
			if (snapshot?.status !== "ready" || snapshot.account?.authenticated !== true) return void 0;
			const accounts = snapshot.account.accounts;
			if (!Array.isArray(accounts) || accounts.length === 0) return "authenticated";
			const active = accounts.find((account) => account.active === true) ?? (accounts.length === 1 ? accounts[0] : void 0);
			return typeof active?.id === "string" && active.id ? active.id : void 0;
		}
		/** Read only the text that the public Chat view presents, never provider history. */
		function composerPredictionContext(chat) {
			if (!Array.isArray(chat?.order) || typeof chat.nodes?.get !== "function") return null;
			const messages = [];
			let latest;
			let remaining = 24e3;
			for (let index = chat.order.length - 1; index >= 0; index -= 1) {
				const node = chat.nodes.get(chat.order[index]);
				if (node?.visibility !== "visible") continue;
				if (node.kind !== "user" && node.kind !== "assistant-step") continue;
				const assistant = node.kind === "assistant-step";
				const data = node.data;
				const text = assistant ? textOf(data?.blocks, "kind") : textOf(data?.content, "type");
				if (!latest) {
					if (!assistant || data?.status !== "settled" || !data.finalNode || data.finalNode.interrupted || !text.trim()) return null;
					if ((chat.timeline?.turns?.get(data.turn))?.status !== "closed" || chat.timeline?.turnOrder?.at(-1) !== data.turn) return null;
					latest = { turnId: String(data.turn) };
				}
				if (assistant && data?.status !== "settled") continue;
				if (!text.trim()) continue;
				const bounded = text.slice(-remaining);
				messages.unshift({
					role: assistant ? "assistant" : "user",
					text: bounded
				});
				remaining -= bounded.length;
				if (messages.length >= 12 || remaining <= 0) break;
			}
			return latest && messages.length >= 2 && messages.some((message) => message.role === "user") && messages.at(-1).role === "assistant" ? {
				...latest,
				messages
			} : null;
		}
		const eligibleDraft = (state) => state?.enabled === true && state.provider === "openai-codex" && typeof state.accountKey === "string" && state.accountKey.length > 0 && MODELS.has(state.model) && state.sessionId && state.composing !== true && state.input?.phase === "plain" && typeof state.input.draft === "string" && !state.input.draft.trim() && !state.input.attachmentIds?.length && !state.input.occurrences?.length && state.span?.draftRev === state.input.draftRev && state.span.start === state.span.end && state.span.end === state.input.draft.length && state.context;
		const eligible = (state) => eligibleDraft(state) && state.visible === true && state.focused === true;
		const sameDraft = (a, b) => a?.sessionId === b?.sessionId && a?.model === b?.model && a?.accountKey === b?.accountKey && a?.context?.turnId === b?.context?.turnId && a?.input?.draftRev === b?.input?.draftRev && a?.input?.draft === b?.input?.draft && a?.span?.start === b?.span?.start && a?.span?.end === b?.span?.end;
		const contextKey = (value) => value?.enabled === true && value.accountKey && value.sessionId && value.context ? JSON.stringify([
			value.accountKey,
			value.sessionId,
			value.provider,
			value.model,
			value.context.turnId
		]) : void 0;
		/** One cancellable prediction per completed turn; late work cannot edit or revive a draft. */
		function createComposerPredictionController(rpc, { now = Date.now } = {}) {
			let snapshot = EMPTY;
			let state;
			let anchor;
			let pending;
			let cached;
			let generation = 0;
			let disposed = false;
			const attempted = /* @__PURE__ */ new Set();
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				if (disposed || snapshot.prediction === next.prediction && snapshot.status === next.status) return;
				snapshot = Object.freeze(next);
				for (const listener of [...listeners]) if (!disposed) listener();
			};
			const clear = () => {
				generation += 1;
				pending?.abort();
				pending = void 0;
				anchor = void 0;
				publish(EMPTY);
			};
			const update = (next) => {
				if (disposed) return;
				state = next;
				const key = contextKey(next);
				if (cached && (cached.key !== key || now() - cached.at >= 3e5)) {
					cached = void 0;
					clear();
				}
				if (!eligibleDraft(next)) {
					clear();
					return;
				}
				if (anchor && sameDraft(anchor, next)) return;
				clear();
				if (next.visible !== true) return;
				if (cached?.key === key) {
					anchor = next;
					publish({
						prediction: cached.prediction,
						status: "ready"
					});
					return;
				}
				if (attempted.has(key)) return;
				anchor = next;
				const request = ++generation;
				const abort = new AbortController();
				pending = abort;
				publish({
					prediction: null,
					status: "loading"
				});
				Promise.resolve().then(() => {
					if (disposed || generation !== request || abort.signal.aborted) return;
					attempted.add(key);
					if (attempted.size > 128) attempted.delete(attempted.values().next().value);
					return rpc.call(CHANNEL, "predictions/generate", {
						sessionId: next.sessionId,
						model: next.model,
						turnId: next.context.turnId,
						messages: next.context.messages
					}, abort.signal);
				}).then((response) => {
					if (disposed || generation !== request || abort.signal.aborted || !eligibleDraft(state) || !sameDraft(anchor, state)) return;
					const value = unwrap(response);
					const prediction = typeof value?.prediction === "string" ? value.prediction.trim() : "";
					if (prediction && prediction.length <= 4e3) {
						cached = {
							key,
							prediction,
							at: now()
						};
						publish({
							prediction,
							status: "ready"
						});
					} else publish(EMPTY);
				}).catch(() => {
					if (!disposed && generation === request) publish(EMPTY);
				}).finally(() => {
					if (generation === request) pending = void 0;
				});
			};
			return Object.freeze({
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					if (disposed) return () => {};
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				update,
				cancel: clear,
				accept(inputActions, current) {
					if (disposed || !snapshot.prediction || !eligible(current) || !sameDraft(anchor, current)) return false;
					const span = inputActions.captureInsertion();
					if (span.draftRev !== anchor.span.draftRev || span.start !== anchor.span.start || span.end !== anchor.span.end) {
						clear();
						return false;
					}
					const prediction = snapshot.prediction;
					clear();
					if (!inputActions.insertText(prediction, span)) return false;
					inputActions.persistDraft?.();
					return true;
				},
				dispose() {
					if (disposed) return;
					disposed = true;
					generation += 1;
					pending?.abort();
					pending = void 0;
					anchor = void 0;
					cached = void 0;
					listeners.clear();
					attempted.clear();
				}
			});
		}
		//#endregion
		//#region src/client-predictions.jsx
		const PREDICTION_CSS = `
.codex-composer-prediction{position:absolute;inset:16px 20px auto;z-index:1;display:flex;align-items:baseline;gap:10px;pointer-events:none;color:var(--dsw-alias-label-tertiary,#888);font:inherit;line-height:1.5;min-width:0}
.codex-composer-prediction>span{white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-width:0}
.codex-composer-prediction button{pointer-events:auto;flex:none;border:0;border-radius:4px;background:var(--dsw-alias-bg-l2,transparent);color:inherit;font:inherit;font-size:11px;padding:1px 5px;cursor:pointer}
`;
		/** The disabled path owns neither DOM nor composer event listeners. */
		function ComposerPrediction(props) {
			if ((0, react.useSyncExternalStore)(props.preference.subscribe, props.preference.getSnapshot).composerPredictions !== "on" || typeof props.useInput !== "function" || typeof props.useConversation !== "function" || typeof props.inputActions?.captureInsertion !== "function" || typeof props.inputActions?.insertText !== "function" || typeof props.directory?.subscribe !== "function" || typeof props.directory?.getSnapshot !== "function" || typeof props.accountStatus?.subscribe !== "function" || typeof props.accountStatus?.getSnapshot !== "function") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActiveComposerPrediction, { ...props });
		}
		function ActiveComposerPrediction({ sessionId, rpc, t, directory, accountStatus, useInput, inputActions, useConversation }) {
			const input = useInput((value) => value);
			const conversation = useConversation((value) => value);
			const selection = (0, react.useSyncExternalStore)(directory.subscribe, directory.getSnapshot);
			const accountKey = composerPredictionAccountKey((0, react.useSyncExternalStore)(accountStatus.subscribe, accountStatus.getSnapshot));
			const context = (0, react.useMemo)(() => composerPredictionContext(conversation?.views?.get("chat")), [conversation]);
			const controller = (0, react.useMemo)(() => createComposerPredictionController(rpc), [rpc]);
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
			const marker = (0, react.useRef)(null);
			const current = (0, react.useRef)(null);
			const [focused, setFocused] = (0, react.useState)(false);
			const composing = (0, react.useRef)(false);
			const compositionUntil = (0, react.useRef)(0);
			const dom = (0, react.useRef)(null);
			current.current = {
				enabled: true,
				sessionId,
				accountKey,
				provider: selection.current?.provider,
				model: selection.current?.model,
				context,
				input
			};
			const environment = () => ({
				...current.current,
				accountKey: composerPredictionAccountKey(accountStatus.getSnapshot()),
				visible: document.visibilityState !== "hidden",
				focused: dom.current?.editor === document.activeElement,
				composing: composing.current || Date.now() < compositionUntil.current || dom.current?.editor.hasAttribute("data-composer-composing"),
				span: inputActions.captureInsertion()
			});
			const refresh = () => controller.update(environment());
			const accept = () => controller.accept(inputActions, environment());
			(0, react.useEffect)(() => {
				const card = marker.current?.closest("[data-composer-card]");
				const editor = card?.querySelector("[data-composer-input][contenteditable=\"true\"]");
				if (!editor) return;
				dom.current = {
					card,
					editor
				};
				const focus = () => {
					setFocused(editor === document.activeElement);
					refresh();
				};
				const blur = () => {
					setFocused(false);
					refresh();
				};
				const start = () => {
					composing.current = true;
					controller.cancel();
				};
				const end = () => {
					composing.current = false;
					compositionUntil.current = Date.now() + 10;
					controller.cancel();
				};
				const edited = () => controller.cancel();
				const key = (event) => {
					if (event.target !== editor || event.defaultPrevented || event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing || event.keyCode === 229) return;
					if (accept()) event.preventDefault();
				};
				card.addEventListener("keydown", key);
				editor.addEventListener("focus", focus);
				editor.addEventListener("blur", blur);
				editor.addEventListener("compositionstart", start);
				editor.addEventListener("compositionend", end);
				editor.addEventListener("input", edited);
				document.addEventListener("selectionchange", focus);
				document.addEventListener("visibilitychange", focus);
				focus();
				return () => {
					card.removeEventListener("keydown", key);
					editor.removeEventListener("focus", focus);
					editor.removeEventListener("blur", blur);
					editor.removeEventListener("compositionstart", start);
					editor.removeEventListener("compositionend", end);
					editor.removeEventListener("input", edited);
					document.removeEventListener("selectionchange", focus);
					document.removeEventListener("visibilitychange", focus);
					dom.current = null;
					controller.cancel();
				};
			}, [
				controller,
				sessionId,
				inputActions
			]);
			(0, react.useLayoutEffect)(() => {
				refresh();
			}, [
				controller,
				sessionId,
				accountKey,
				input,
				selection,
				context,
				focused
			]);
			(0, react.useEffect)(() => () => controller.cancel(), [controller]);
			(0, react.useLayoutEffect)(() => {
				if (!snapshot.prediction || !focused) return;
				const placeholder = marker.current?.closest("[data-composer-card]")?.querySelector("[data-composer-placeholder]");
				if (!placeholder) return;
				const visibility = placeholder.style.getPropertyValue("visibility");
				const priority = placeholder.style.getPropertyPriority("visibility");
				placeholder.style.setProperty("visibility", "hidden");
				return () => {
					if (placeholder.style.getPropertyValue("visibility") !== "hidden") return;
					if (visibility) placeholder.style.setProperty("visibility", visibility, priority);
					else placeholder.style.removeProperty("visibility");
				};
			}, [
				snapshot.prediction,
				focused,
				sessionId
			]);
			if (!snapshot.prediction || !focused || !accountKey) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: marker,
				hidden: true
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: marker,
				className: "codex-composer-prediction",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					children: snapshot.prediction
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": t("composerPredictionAccept"),
					title: t("composerPredictionAccept"),
					onPointerDown: (event) => event.preventDefault(),
					onClick: accept,
					children: "Tab"
				})]
			});
		}
		//#endregion
		//#region src/client.jsx
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"modelDirectories",
			"conversation",
			"uiConversation",
			"sessions"
		];
		const ComposerRight = (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexComposerQuota, { ...props }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VoiceCallButton, { ...props })] });
		function apply(ctx) {
			if (new URL(window.location.href).searchParams.has("codexVoiceSession")) ctx.inject(["uiWorkspace", "sessions"], (scope) => scope.effect(() => {
				const sessions = scope.get("sessions"), controller = new AbortController();
				let attempted = false;
				const restore = () => {
					if (attempted || typeof sessions.list?.getSnapshot === "function" && sessions.list.getSnapshot().phase !== "ready") return;
					attempted = true;
					restoreVoiceConversation({
						href: window.location.href,
						workspace: scope.get("uiWorkspace"),
						history: window.history,
						sessions,
						signal: controller.signal
					}).catch(() => {});
				};
				const unsubscribe = sessions.list?.subscribe?.(restore) ?? (() => {});
				restore();
				return () => {
					controller.abort();
					unsubscribe();
				};
			}, "codex-subscription: browser voice conversation"));
			const diagnostics = createHostDiagnostics();
			ctx.effect(() => diagnostics.register(ctx.slots), "codex-subscription: host inspection");
			const imageViewer = new SubscriptionImageViewerService();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "codex-subscription: copy");
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-codex-subscription";
				tag.textContent = STYLE + IMAGE_PREVIEWS_CSS + PREDICTION_CSS;
				document.head.append(tag);
				return () => tag.remove();
			}, "codex-subscription: style");
			const rpc = createSubscriptionRpcClient(ctx.get("connection").rpc);
			const preference = createPreferenceController(rpc);
			const quotaUsage = quotaUsageController(rpc);
			ctx.effect(() => {
				let mode = preference.getSnapshot().quickQuotaMode;
				return preference.subscribe(() => {
					const next = preference.getSnapshot().quickQuotaMode;
					if (next !== mode) {
						mode = next;
						quotaUsage.invalidate({ preserveUsage: true });
					}
				});
			}, "codex-subscription: quota preference snapshot");
			const defaultModel = createDefaultModelController(rpc);
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
					quotaUsage.invalidate();
					preference.load();
					preference.refreshModels();
					accountStatus.reload();
				});
				return () => {
					disposeReset?.();
					preference.dispose();
					defaultModel.dispose();
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
			}, DeferredImageViewer));
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
					t,
					diagnostics,
					defaultModel
				})
			}, CodexSection));
			const sessions = ctx.get("sessions");
			const rootDirectories = ctx.get("modelDirectories");
			let scopedDirectories;
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "codex-subscription-quota",
				order: 15,
				locale: NS,
				inject: (sessionId) => ({
					sessionId,
					preference,
					rpc,
					t,
					directory: (scopedDirectories ?? rootDirectories).directoryFor(sessionId).store
				})
			}, ComposerRight));
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "codex-subscription-prediction",
				order: 20,
				inject: (sessionId) => ({
					sessionId,
					preference,
					rpc,
					t,
					accountStatus,
					directory: (scopedDirectories ?? rootDirectories).directoryFor(sessionId).store
				})
			}, ComposerPrediction));
			const installDirectorySlots = (scope) => {
				scope.effect(() => diagnostics.register(scope.slots), "codex-subscription: scoped host inspection");
				const modelDirectories = scope.get("modelDirectories");
				scopedDirectories = modelDirectories;
				scope.effect(() => () => {
					if (scopedDirectories === modelDirectories) scopedDirectories = void 0;
				}, "codex-subscription: scoped model directories");
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
			const sketchOpeners = createSessionOpeners();
			const sketchSessions = createSketchSessionRegistry();
			const lifetime = new AbortController();
			ctx.effect(() => () => {
				lifetime.abort();
				imageViewer.close();
				sketchOpeners.clear();
				sketchSessions.dispose();
			}, "codex-subscription: sketch sessions");
			ctx.inject(["inputTriggers"], (triggerContext) => triggerContext.effect(() => triggerContext.get("inputTriggers").registerSource(createSketchTrigger({
				name: () => t("triggerSketchName"),
				description: () => t("triggerSketchHint"),
				enabled: () => {
					const value = preference.getSnapshot();
					return value.imageSketchAgent && value.imageSketch && value.imageEditing;
				},
				consume: (sessionId, span) => {
					const actx = sessions.scope(sessionId);
					return sketchOpeners.has(sessionId) && actx?.bail(actx, "slash/input-insert-text", {
						text: "@sketch ",
						span
					}) === true;
				}
			})), "codex-subscription: Sketch trigger"));
			ctx.inject(["inputTriggers"], (triggerContext) => triggerContext.effect(() => triggerContext.get("inputTriggers").registerSource(createImageTrigger({
				name: () => t("triggerImageName"),
				description: () => t("triggerImageHint"),
				enabled: () => {
					const value = preference.getSnapshot();
					return value.imageShortcut && (value.imageGeneration || value.imageEditing);
				},
				open: () => {},
				consume: (sessionId, span) => {
					const actx = sessions.scope(sessionId);
					return sketchOpeners.has(sessionId) && actx?.bail(actx, "slash/input-insert-text", {
						text: t("imageInlinePrompt"),
						span
					}) === true;
				}
			})), "codex-subscription: Image trigger"));
			const sessionInput = (sessionId) => {
				const actx = sessions.scope(sessionId);
				if (!actx || !conversation.input?.for) throw new Error("Image composer is unavailable");
				return conversation.input.for(actx);
			};
			const openSketchImage = (sessionId) => async (src, name) => {
				const settings = preference.getSnapshot(), open = sketchOpeners.get(sessionId);
				if (!settings.imageSketch || !settings.imageEditing || !open) throw Error("Sketch unavailable");
				const response = await fetch(src, { signal: lifetime.signal });
				if (!response.ok) throw Error("Image unavailable");
				const blob = await response.blob();
				if (blob.size > 20 * 1024 * 1024) throw Error("Image too large");
				lifetime.signal.throwIfAborted();
				const liveOpen = sketchOpeners.get(sessionId);
				if (!liveOpen || !preference.getSnapshot().imageSketch || !preference.getSnapshot().imageEditing) throw Error("Sketch unavailable");
				imageViewer.close();
				liveOpen("sketch", document.activeElement, new File([blob], name || "image.png", { type: blob.type || "image/png" }));
			};
			const attachForEdit = (sessionId) => async (src, filename, draft, annotations = [], referenceName, sourceInDraft = false, extraFiles) => {
				const tool = Array.isArray(extraFiles);
				if (!preference.getSnapshot().imageEditing) throw new Error("Image editing is disabled");
				return withComposerSession(sessions, sessionId, async (actx) => {
					const response = await fetch(src, { signal: lifetime.signal });
					if (!response.ok) throw new Error("Could not read generated image");
					const blob = await response.blob();
					const files = sourceInDraft ? [] : [new File([blob], filename, { type: blob.type || "image/png" })];
					if (annotations.length > 0) {
						const reference = await createAnnotatedImageReference(blob, annotations);
						files.push(new File([reference], referenceName, { type: "image/png" }));
					}
					if (tool) files.push(...extraFiles);
					lifetime.signal.throwIfAborted();
					const input = conversation.input.for(actx);
					if (!preference.getSnapshot().imageEditing) throw new Error("Image editing is disabled");
					if (files.length) attachImageFiles(conversation, input, files, sessionId);
					openComposerSession(sessions, ctx.get("uiWorkspace"), sessionId);
					if (sourceInDraft && !annotations.length && !tool) return;
					if (!input.state.getSnapshot().draft.trim()) input.setDraft(draft);
					else if (annotations.length || tool) if (!input.state.getSnapshot().occurrences?.length) appendImagePrompt(input, draft);
					else input.notify("info", draft);
				});
			};
			const nativeAttachments = () => ctx.slots.entries("conversation.input.attachments").find((entry) => entry.component !== ComposerImagePreviews && entry.locale === "conversation" && !entry.inject && !entry.store && !entry.children);
			const watchNativeAttachments = (callback) => ctx.slots.subscribe("conversation.input.attachments", callback);
			const nativeTranslate = ctx.locale.bind("conversation");
			for (const [name, component] of [
				["conversation.input.attachments", ComposerImagePreviews],
				["conversation.chat.message.images", MessageImagePreviews],
				["conversation.chat.user.images", MessageImagePreviews],
				["tool.call.images", MessageImagePreviews],
				["conversation.trajectory.images", MessageImagePreviews]
			]) ctx.slots.inject(name, () => {
				let dispose;
				const sync = () => {
					if (preference.getSnapshot().imageViewer) dispose ??= ctx.slots.register({
						name,
						priority: -10,
						inject: (sessionId) => ({
							preference,
							t,
							nativeAttachments,
							watchNativeAttachments,
							nativeTranslate,
							service: imageViewer,
							openSketchImage: openSketchImage(sessionId),
							attachForEdit: attachForEdit(sessionId)
						})
					}, component);
					else {
						dispose?.();
						dispose = void 0;
					}
				};
				sync();
				const unwatch = preference.subscribe(sync);
				return () => {
					unwatch();
					dispose?.();
				};
			});
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "codex-image-workspace",
				order: 30,
				inject: (sessionId) => ({
					preference,
					t,
					sessionId,
					rpc,
					sessionState: sketchSessions.get(sessionId),
					registerOpen: (callback) => sketchOpeners.register(sessionId, callback),
					attachSketch: (blob) => {
						const current = preference.getSnapshot();
						if (!current.imageSketch || !current.imageEditing) throw new Error("Sketch editing is disabled");
						attachImageFiles(conversation, sessionInput(sessionId), [new File([blob], "sketch-reference.png", { type: "image/png" })], sessionId);
					}
				})
			}, ImageWorkspace));
			const imageProps = (sessionId) => ({
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
				openSketchImage: openSketchImage(sessionId),
				attachForEdit: attachForEdit(sessionId)
			});
			ctx.effect(() => uiConversation.events.register(imageConversationNode), "codex-subscription: image results in chat");
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "codex-image-output",
				inject: imageProps
			}, CodexImageOutput));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "codex_image_generate",
				locale: NS,
				inject: imageProps
			}, CodexImageToolRow));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
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
		let react_dom = require("react-dom");
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
		//#region src/client-image-previews.jsx
		function openPreview(props, item, opener, sourceInDraft = false) {
			const { service, preference, t, attachForEdit } = props;
			const settings = preference.getSnapshot();
			const referenceName = `annotated-${item.name}.png`;
			service.open({
				items: [{
					...item,
					actions: settings.imageEditing ? [{
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
					}, ...settings.imageSketch && props.openSketchImage ? [{
						id: "sketch",
						label: t("imageToSketch"),
						pendingLabel: t("imageEditPreparing"),
						errorLabel: t("imageEditFailed"),
						onInvoke: () => props.openSketchImage(item.src, item.name)
					}] : []] : []
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
			if (!entry) return null;
			const NativeAttachments = entry.component;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: { display: "contents" },
				onClickCapture: (event) => {
					const button = event.target.closest("button"), image = button?.querySelector("img");
					const item = image && attachments.find((item) => item.previewUrl === image.src);
					if (!item || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
					event.preventDefault();
					event.stopPropagation();
					openPreview(props, {
						id: item.id,
						src: item.previewUrl,
						name: item.file.name,
						width: item.width,
						height: item.height,
						bytes: item.file.size
					}, button, true);
				},
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
			const item = image.attachment ?? image.preview;
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
		function MessageImagePreviews({ images, align, ...props }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexMessageImages",
				"data-align": align,
				"data-single": images.length === 1,
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
`;
		//#endregion
		//#region src/image-conversation-node.js
		const KIND = "codex-image-output";
		const resultsOf = (event) => event?.type === "tool/result" && event.data.meta?.kind === "codex-subscription-image" ? (event.data.message?.content ?? []).filter((block) => block.type === "tool-result" && !block.isError && block.content?.some((part) => part.type === "image" && part.attachment)) : [];
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
					location: end.location,
					anchorSeq,
					visibility: "visible",
					data: { blocks }
				};
			}
		};
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
						}, ...features.imageSketch && openSketchImage ? [{
							id: "sketch",
							label: t("imageToSketch"),
							pendingLabel: t("imageEditPreparing"),
							errorLabel: t("imageEditFailed"),
							onInvoke: () => openSketchImage(src, downloadName)
						}] : []]
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
		function CodexImageToolRow({ block, sessionId, rpc, loadImage, openSketchImage, attachForEdit, getImageViewer, getInternalImageViewer, t, preference }) {
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
							openSketchImage,
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
		function CodexImageOutput({ node, ...props }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexImageOutput",
				children: node.data.blocks.map((block) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageToolRow, {
					block,
					...props
				}, block.toolCallId))
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
				context.globalCompositeOperation = stroke.shape === "eraser" ? "destination-out" : "source-over";
				context.globalAlpha = (stroke.opacity ?? 1) * (stroke.brush === "marker" ? .28 : stroke.brush === "pencil" ? .65 : 1);
				context.strokeStyle = stroke.color;
				context.fillStyle = stroke.color;
				context.lineWidth = stroke.width * (stroke.brush === "pencil" ? .55 : 1) * (stroke.pressure ?? 1);
				context.beginPath();
				const last = stroke.points.at(-1);
				if (stroke.shape === "line") {
					context.moveTo(first.x * size, first.y * height);
					context.lineTo(last.x * size, last.y * height);
					context.stroke();
				} else if (stroke.shape === "rectangle") {
					context.rect(first.x * size, first.y * height, (last.x - first.x) * size, (last.y - first.y) * height);
					context.stroke();
				} else if (stroke.shape === "circle") {
					context.ellipse((first.x + last.x) * size / 2, (first.y + last.y) * height / 2, Math.abs(last.x - first.x) * size / 2, Math.abs(last.y - first.y) * height / 2, 0, 0, Math.PI * 2);
					context.stroke();
				} else if (stroke.points.length === 1) {
					context.arc(first.x * size, first.y * height, context.lineWidth / 2, 0, Math.PI * 2);
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
				if (layers.length >= 8 || action === "duplicate" && strokeCount(doc) + layer.strokes.length > 200) return doc;
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
			else if (action === "clear") layers[index] = {
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
			let points = stroke.points;
			if (!points.length) return false;
			const a = points[0], b = points.at(-1);
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
				if (moving) {
					const ctx = entry.surface.getContext("2d");
					ctx.clearRect(0, 0, size, height);
					ctx.drawImage(entry.base, 0, 0);
					paintSketch(ctx, layer.strokes, size, true, height, layer.strokes.length - 1);
					context.drawImage(entry.surface, 0, 0);
				} else context.drawImage(entry.base, 0, 0);
			}
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
		//#region src/sketch-drafts.js
		const DATABASE = "dsh-codex-sketches-v1";
		async function sketchDrafts(action, value) {
			const db = await new Promise((resolve, reject) => {
				const request = indexedDB.open(DATABASE, 1);
				request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			try {
				return await new Promise((resolve, reject) => {
					const tx = db.transaction("drafts", action === "list" ? "readonly" : "readwrite"), store = tx.objectStore("drafts");
					let result;
					tx.oncomplete = () => resolve(result);
					tx.onerror = () => reject(tx.error);
					tx.onabort = () => reject(tx.error ?? Error("Draft limit reached"));
					const request = store.getAll();
					request.onsuccess = () => {
						const rows = request.result;
						if (action === "list") {
							result = rows.sort((a, b) => b.updated - a.updated);
							return;
						}
						if (action === "delete") {
							store.delete(value);
							return;
						}
						const others = rows.filter((row) => row.id !== value.id);
						if (others.length >= 20 || JSON.stringify([...others, value]).length > 32 * 1024 * 1024) {
							tx.abort();
							return;
						}
						store.put(value);
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
					if (event.key !== "Escape") return;
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
				const pressure = node.hasPointerCapture(pointer.pointerId) && pointer.pointerType === "pen" ? heldPressure.current : 1;
				const diameter = width * (brush === "pencil" ? .55 : 1) * pressure * rect.width / node.width;
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
					const key = e.key.toLowerCase();
					if (key === keys.pan && !e.ctrlKey && !e.metaKey) {
						e.preventDefault();
						setSpace(true);
						return true;
					}
					if (key === keys.zoomIn || key === "+" || key === keys.zoomOut || key === keys.fit) {
						e.preventDefault();
						if (key === keys.fit) reset();
						else zoom(key === keys.zoomOut ? 1 / 1.2 : 1.2);
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
			const [open, setOpen] = (0, react.useState)(false), host = (0, react.useRef)(null);
			useSketchDismiss(open, setOpen, host, [".codexSketchViewControls"]);
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
						type: "button",
						onClick: () => setOpen(!open),
						children: t("sketchKeys")
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "codexSketchKeyPanel",
						onKeyDown: (e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								e.stopPropagation();
								setOpen(false);
							}
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: navigation.shortcuts,
								onChange: navigation.toggle
							}), t("sketchKeysEnabled")] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sketchNavigationHint") }),
							Object.entries(navigation.keys).map(([action, key]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t(`sketchKey_${action}`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t(`sketchKey_${action}`),
								value: key === " " ? "Space" : key,
								readOnly: true,
								onKeyDown: (e) => {
									if (e.key === "Tab" || e.key === "Escape") return;
									e.preventDefault();
									e.stopPropagation();
									if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) navigation.setKey(action, e.key);
								}
							})] }, action)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchKeyHint") })
						]
					}) : null
				]
			});
		}
		//#endregion
		//#region src/sketch-files.jsx
		function SketchFiles({ save, load, fresh, importImage, disabled, t, report, onWorking }) {
			const [open, setOpen] = (0, react.useState)(false), [rows, setRows] = (0, react.useState)([]), [name, setName] = (0, react.useState)(""), [remove, setRemove] = (0, react.useState)(null), [working, setWorking] = (0, react.useState)(false);
			const input = (0, react.useRef)(null), host = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (open && !working) host.current?.querySelector("input:not([type=file])")?.focus({ preventScroll: true });
				else if (!open && document.activeElement === document.body) {
					const dialog = host.current?.closest("dialog");
					if (dialog?.open) dialog.querySelector("canvas")?.focus({ preventScroll: true });
				}
			}, [open, working]);
			useSketchDismiss(open, setOpen, host, [".codexSketchFiles"]);
			const run = async (operation) => {
				setWorking(true);
				onWorking(true);
				try {
					await operation();
				} catch {
					report(t("sketchStorageFailed"));
				} finally {
					setWorking(false);
					onWorking(false);
				}
			};
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: input,
						type: "file",
						accept: "image/png,image/jpeg,image/webp",
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
									disabled: working,
									onClick: () => void run(async () => {
										await fresh();
										setName("");
										setOpen(false);
									}),
									children: t("sketchNew")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: working,
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
								disabled: working,
								onClick: () => void run(async () => {
									await save(name);
									await refresh();
								}),
								children: t("sketchSave")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchLocalDrafts") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchDraftList",
								children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: working,
									onClick: () => void run(async () => {
										await load(row);
										setName(row.name);
										setOpen(false);
									}),
									children: row.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: working,
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
		//#region src/workspace-icons.jsx
		function WorkspaceIcon({ name, size = 24 }) {
			const paths = {
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
		//#region src/sketch-studio.jsx
		const PALETTE = [
			"#18181b",
			"#929398",
			"#ff3936",
			"#ff9500",
			"#ffcc00",
			"#34c759",
			"#0088ff"
		];
		function SketchStudio({ open, onClose, attachSketch, enabled, t, incoming }) {
			const dialog = (0, react.useRef)(null), canvas = (0, react.useRef)(null), doc = (0, react.useRef)(createSketchLayers()), cache = (0, react.useRef)(/* @__PURE__ */ new Map());
			const undo = (0, react.useRef)([]), redo = (0, react.useRef)([]), active = (0, react.useRef)(null), frame = (0, react.useRef)(null);
			const images = (0, react.useRef)(/* @__PURE__ */ new Map()), saved = (0, react.useRef)(null), dirty = (0, react.useRef)(false), updateUi = (0, react.useRef)(false);
			const [stability, setStability] = (0, react.useState)(0), [flow, setFlow] = (0, react.useState)(100), [picturesOpen, setPicturesOpen] = (0, react.useState)(false);
			const pictureInput = (0, react.useRef)(null), received = (0, react.useRef)(null);
			const navigation = useSketchView(canvas, open);
			const [revision, redraw] = (0, react.useState)(0), [tool, setTool] = (0, react.useState)("pen"), [brush, setBrush] = (0, react.useState)("pen");
			const [eraser, setEraser] = (0, react.useState)("pixel"), [color, setColor] = (0, react.useState)("#0088ff"), [width, setWidth] = (0, react.useState)(12);
			const [layersOpen, setLayersOpen] = (0, react.useState)(false), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)("");
			const cursorRing = (0, react.useRef)(null);
			const cursor = useSketchCursor(canvas, cursorRing, width, tool === "pen" ? brush : "pen", navigation.view.scale, !open || navigation.space || busy);
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
				dirty.current = true;
				undo.current.push(doc.current);
				if (undo.current.length > 30) undo.current.shift();
				redo.current = [];
			};
			const change = (action, id, value) => {
				if (busy || active.current) return;
				const next = changeSketchLayer(doc.current, action, id, value);
				if (next === doc.current) return;
				if (action !== "select") checkpoint();
				doc.current = next;
				setError("");
				schedule();
			};
			(0, react.useEffect)(() => {
				if (open) {
					dialog.current.showModal();
					paint();
				} else dialog.current?.close();
			}, [open]);
			(0, react.useEffect)(() => () => {
				cancelAnimationFrame(frame.current);
				cache.current.clear();
			}, []);
			const hasContent = () => doc.current.layers.some((layer) => layer.image || layer.strokes.length);
			const save = async (name) => {
				const row = {
					id: saved.current?.id ?? crypto.randomUUID(),
					name: name?.trim() || saved.current?.name || `${t("sketchTitle")} ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
					updated: Date.now(),
					doc: structuredClone(doc.current)
				};
				await sketchDrafts("save", row);
				saved.current = {
					id: row.id,
					name: row.name
				};
				dirty.current = false;
			};
			const saveChanges = async () => {
				if (dirty.current && (hasContent() || saved.current)) await save();
			};
			const replace = (next, decoded, identity) => {
				doc.current = structuredClone(next);
				images.current = decoded;
				cache.current.clear();
				undo.current = [];
				redo.current = [];
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
				await saveChanges();
				const decoded = /* @__PURE__ */ new Map();
				await decodeSketchImages(row.doc, decoded);
				replace(row.doc, decoded, {
					id: row.id,
					name: row.name
				});
			};
			const importImage = async (file) => {
				if (doc.current.layers.length >= 8) throw Error("Layer limit");
				const image = await importSketchImage(file), w = doc.current.width ?? 1024, h = doc.current.height ?? 1024;
				const scale = Math.min(w / image.width, h / image.height), width = image.width * scale / w, height = image.height * scale / h;
				const layer = {
					id: doc.current.nextId,
					name: file.name?.slice(0, 40) || t("sketchImport"),
					visible: true,
					strokes: [],
					image: {
						src: image.src,
						x: (1 - width) / 2,
						y: (1 - height) / 2,
						width,
						height
					}
				};
				await decodeSketchImages({ layers: [layer] }, images.current);
				checkpoint();
				doc.current = {
					...doc.current,
					nextId: layer.id + 1,
					active: layer.id,
					layers: [...doc.current.layers, layer]
				};
				schedule();
			};
			const close = async () => {
				if (busy || active.current) return;
				setBusy(true);
				try {
					await saveChanges();
					onClose();
				} catch {
					setError(t("sketchStorageFailed"));
				} finally {
					setBusy(false);
				}
			};
			const runFile = async (operation) => {
				if (busy || active.current) return;
				setBusy(true);
				setError("");
				try {
					await operation();
				} catch {
					setError(t("sketchStorageFailed"));
				} finally {
					setBusy(false);
				}
			};
			(0, react.useEffect)(() => {
				if (open && incoming && incoming !== received.current) {
					received.current = incoming;
					runFile(() => importImage(incoming.file));
				}
			}, [open, incoming]);
			const keyDown = (event) => {
				if (event.target.closest("input,textarea,select,[contenteditable=true]") || event.isComposing || busy || active.current) return;
				if (!navigation.shortcuts) return;
				if (navigation.keyDown(event)) return;
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
				const tools = Object.fromEntries([
					"pen",
					"eraser",
					"line",
					"rectangle",
					"circle"
				].map((action) => [navigation.keys[action], action]));
				if (tools[key]) {
					event.preventDefault();
					setTool(tools[key]);
					if (tools[key] === "pen") setBrush("pen");
				}
				if (key === "[" || key === "]") {
					event.preventDefault();
					setWidth((value) => Math.max(2, Math.min(64, value + (key === "]" ? 2 : -2))));
				}
			};
			const current = doc.current.layers.find((layer) => layer.id === doc.current.active);
			const move = (event, bounds) => {
				if (navigation.move(event)) return;
				const gesture = active.current;
				if (!gesture || gesture.id !== event.pointerId || busy) return;
				const rect = bounds ?? canvas.current.getBoundingClientRect();
				const native = event.nativeEvent ?? event;
				const events = native.getCoalescedEvents?.() ?? [];
				for (const sample of events.length ? [...events, native] : [native]) {
					let point = sketchPoint(sample.clientX, sample.clientY, rect);
					if (!point) continue;
					const layer = doc.current.layers.find((layer) => layer.id === gesture.layer);
					if (gesture.eraseStroke) {
						const previous = gesture.last ?? point;
						const steps = Math.min(256, Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) * SKETCH_SIZE / Math.max(2, width / 2))));
						layer.strokes = layer.strokes.filter((stroke) => {
							for (let i = 1; i <= steps; i++) if (strokeHit(stroke, {
								x: previous.x + (point.x - previous.x) * i / steps,
								y: previous.y + (point.y - previous.y) * i / steps
							}, width / 2, doc.current.width, doc.current.height)) return false;
							return true;
						});
					} else {
						const stroke = layer.strokes.at(-1);
						if ([
							"line",
							"rectangle",
							"circle"
						].includes(stroke.shape)) {
							if (stroke.shape === "line" && event.shiftKey) {
								const w = doc.current.width ?? 1024, h = doc.current.height ?? 1024, a = stroke.points[0];
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
				schedule(false);
			};
			const end = (event, cancel = false) => {
				if (navigation.end(event)) return;
				if (active.current?.id !== event.pointerId) return;
				if (!cancel) {
					move(event);
					const gesture = active.current, stroke = doc.current.layers.find((layer) => layer.id === gesture.layer)?.strokes.at(-1);
					if (gesture.smoothing && stroke) stroke.points = smoothStrokePoints(stroke.points, gesture.smoothing);
				}
				active.current = null;
				if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
				if (cancel) doc.current = undo.current.pop() ?? doc.current;
				schedule();
			};
			const history = (direction) => {
				if (busy || active.current) return;
				const source = direction === "undo" ? undo : redo, target = direction === "undo" ? redo : undo;
				if (!source.current.length) return;
				dirty.current = true;
				target.current.push(doc.current);
				doc.current = source.current.pop();
				schedule();
			};
			const attach = async () => {
				if (!enabled || busy) return;
				setBusy(true);
				setError("");
				try {
					paint();
					const blob = await new Promise((resolve, reject) => canvas.current.toBlob((blob) => blob ? resolve(blob) : reject(Error("PNG")), "image/png"));
					await saveChanges();
					await attachSketch(blob);
					onClose();
				} catch {
					setError(t("sketchFailed"));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				className: "codexSketchDialog codexSketchStudio codexLayerStudio",
				"aria-label": t("sketchTitle"),
				onKeyDown: keyDown,
				onKeyUp: navigation.keyUp,
				onPaste: (event) => {
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
								disabled: busy,
								onClick: close,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, { name: "close" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchFiles, {
								save,
								load,
								fresh,
								importImage,
								disabled: busy,
								t,
								report: setError,
								onWorking: setBusy
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
											disabled: busy || !(name === "undo" ? undo : redo).current.length,
											onClick: () => history(name),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
												name,
												size: 20
											})
										}, name))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										className: "codexSketchRatio",
										"aria-label": t("sketchRatio"),
										title: t("sketchRatioHint"),
										value: doc.current.ratio ?? "1:1",
										disabled: busy,
										onChange: (event) => {
											if (active.current) return;
											const next = resizeSketch(doc.current, event.target.value);
											if (next === doc.current) return;
											checkpoint();
											doc.current = next;
											schedule();
										},
										children: Object.keys(SKETCH_RATIOS).map((ratio) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: ratio,
											children: ratio
										}, ratio))
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
								disabled: busy || !enabled || !doc.current.layers.some((l) => l.visible && (l.strokes.length || l.image)),
								onClick: () => void attach(),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
									name: "check",
									size: 18
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sketchAttachShort") })]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `codexLayerBody ${layersOpen ? "withLayers" : ""}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
								tabIndex: 0,
								style: {
									transform: `translate(${navigation.view.x}px,${navigation.view.y}px) scale(${navigation.view.scale})`,
									cursor: navigation.space ? "grab" : "none",
									"--sketch-ratio": (doc.current.width ?? 1024) / (doc.current.height ?? 1024)
								},
								ref: canvas,
								width: SKETCH_SIZE,
								height: SKETCH_SIZE,
								"aria-label": t("sketchTitle"),
								onPointerDown: (event) => {
									if (busy || !enabled || active.current) return;
									if (navigation.down(event)) return;
									if (event.button !== 0) return;
									cursor.down(event);
									if (!current.visible) {
										setError(t("sketchHiddenLayer"));
										return;
									}
									if (!(tool === "eraser" && eraser === "stroke") && strokeCount(doc.current) >= 200) {
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
										color,
										opacity: flow / 100,
										shape: tool,
										width,
										brush: tool === "pen" ? brush : "pen",
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
							picturesOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
								className: "codexSketchPictures",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchPictures") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => pictureInput.current.click(),
										children: t("sketchPictureAdd")
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										ref: pictureInput,
										hidden: true,
										type: "file",
										accept: "image/png,image/jpeg,image/webp",
										onChange: (e) => {
											const file = e.target.files?.[0];
											e.target.value = "";
											if (file) runFile(() => importImage(file));
										}
									}),
									doc.current.layers.filter((layer) => layer.image).map((layer) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-active": layer.id === doc.current.active,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": `${t("sketchPictureSelect")} ${layer.name}`,
											onClick: () => change("select", layer.id),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
												src: layer.image.src,
												alt: layer.name
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": `${t("sketchDeleteDraft")} ${layer.name}`,
											onClick: () => change(doc.current.layers.length === 1 ? "clear" : "delete", layer.id),
											children: "×"
										})]
									}, layer.id)),
									!doc.current.layers.some((layer) => layer.image) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("sketchPicturesEmpty") }) : null
								]
							}) : null,
							layersOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
								className: "codexSketchLayers",
								"aria-label": t("sketchLayers"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sketchLayers") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										title: t("sketchLayerAdd"),
										"aria-label": t("sketchLayerAdd"),
										disabled: busy || doc.current.layers.length >= 8,
										onClick: () => change("add"),
										children: "＋"
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "codexLayerList",
										children: doc.current.layers.slice().reverse().map((layer) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexLayerRow",
											"data-active": layer.id === doc.current.active,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												"aria-label": `${t("sketchLayerVisible")} ${layer.id}`,
												"aria-pressed": layer.visible,
												onClick: () => change("visible", layer.id),
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
													name: layer.visible ? "eye" : "eyeOff",
													size: 18
												})
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												"aria-pressed": layer.id === doc.current.active,
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
											disabled: busy || action === "delete" && doc.current.layers.length === 1 || action === "duplicate" && (doc.current.layers.length >= 8 || strokeCount(doc.current) + current.strokes.length > 200) || action === "up" && current === doc.current.layers.at(-1) || action === "down" && current === doc.current.layers[0],
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
										disabled: busy || !current.strokes.length && !current.image,
										onClick: () => change("clear"),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
											name: "clear",
											size: 16
										}), t("sketchClearLayer")]
									})
								]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSketchControls",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "codexSketchPicturesToggle",
								"aria-expanded": picturesOpen,
								onClick: () => setPicturesOpen((v) => !v),
								children: t("sketchPictures")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchViewControls, {
								navigation,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSketchPill",
								role: "toolbar",
								"aria-label": t("sketchTitle"),
								title: t("sketchShortcuts"),
								children: [
									"pen",
									"pencil",
									"marker",
									"eraser",
									"line",
									"rectangle",
									"circle"
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
										title: label,
										"aria-pressed": drawing ? tool === "pen" && brush === name : tool === name,
										disabled: busy,
										onClick: () => {
											setTool(drawing ? "pen" : name);
											if (drawing) setBrush(name);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceIcon, {
											name,
											size: 23
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
									}, name);
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexLayerBrush",
								children: [
									tool === "pen" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "codexSketchStability",
										children: [t("sketchStability"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											"aria-label": t("sketchStability"),
											value: stability,
											disabled: busy,
											onChange: (e) => setStability(Number(e.target.value)),
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
											disabled: busy,
											onClick: () => setEraser(value),
											children: t(`sketchErase_${value}`)
										}, value))
									}) : null,
									tool !== "eraser" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "codexSketchWidth",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sketchFlow") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "range",
												min: 5,
												max: 100,
												step: 5,
												value: flow,
												"aria-label": t("sketchFlow"),
												onChange: (e) => setFlow(Number(e.target.value))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", { children: flow })
										]
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "codexSketchWidth",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sketchWidth") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "range",
												min: 2,
												max: 64,
												value: width,
												"aria-label": t("sketchWidth"),
												onChange: (e) => setWidth(Number(e.target.value)),
												disabled: busy
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", { children: width })
										]
									})
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
									"aria-pressed": color === value,
									disabled: busy,
									onClick: () => setColor(value)
								}, value)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "codexSketchCustom",
									title: t("sketchColor"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { background: color } }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "color",
										"aria-label": t("sketchColor"),
										value: color,
										disabled: busy,
										onChange: (e) => setColor(e.target.value)
									})]
								})]
							})
						]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSketchHint",
						role: "alert",
						children: error
					}) : null
				]
			});
		}
		//#endregion
		//#region src/sketch-styles.js
		const SKETCH_CSS = `
.codexSketchDialog{--sketch-bg:var(--dsw-alias-bg-layer-1,#f5f5f7);--sketch-fg:var(--dsw-alias-label-primary,#202124);--sketch-muted:var(--dsw-alias-label-secondary,#727279);--sketch-line:var(--dsw-alias-border-l2,#8883);--sketch-glass:color-mix(in srgb,var(--sketch-bg) 90%,transparent);box-sizing:border-box;width:min(1280px,calc(100vw - 24px));height:94dvh;max-height:94dvh;margin:auto;padding:10px;border:1px solid var(--sketch-line);border-radius:18px;background:var(--sketch-bg);color:var(--sketch-fg);box-shadow:0 24px 90px #0004;overflow:hidden;font:13px/1.4 system-ui}
.codexSketchDialog[open]{display:flex;flex-direction:column;gap:8px}
.codexSketchDialog::backdrop{background:#0005;backdrop-filter:blur(12px)}
.codexSketchDialog *{box-sizing:border-box}
.codexSketchDialog button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0}
.codexSketchDialog button:disabled{opacity:.35;cursor:default}
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
.codexSketchDraftList{max-height:220px;overflow:auto}.codexSketchDraftList>div{display:flex;gap:6px;margin-bottom:6px}.codexSketchDraftList button:first-child{flex:1;min-width:0;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.codexSketchStability{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--sketch-muted)}.codexSketchStability select{height:32px;border:1px solid var(--sketch-line);border-radius:8px;background:var(--sketch-bg);color:var(--sketch-fg);font:inherit}
@media(max-width:760px){.codexSketchTop{gap:2px}.codexSketchUtility{gap:2px}.codexSketchRound{width:32px}.codexSketchLayersToggle{padding:0 6px}.codexSketchFiles>button{padding:0 6px}.codexSketchRatio{max-width:65px}.codexSketchPill button{min-width:42px}.codexSketchDialog .codexSketchConfirm{padding:0 8px}.codexSketchTop{flex-shrink:0}}

.codexLayerBody{overflow:hidden}.codexLayerStudio canvas{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='white' stroke-width='3'/%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='%23333' stroke-width='1'/%3E%3C/svg%3E") 12 12,crosshair}
.codexSketchDialog .codexSketchSwatch{width:32px;height:32px;padding:0;border-radius:50%;corner-shape:round}.codexSketchSwatch::before{width:22px;height:22px;flex-shrink:0;border-radius:50%;corner-shape:round;clip-path:circle(50%)}.codexSketchSwatch[aria-pressed=true]::after{inset:1px;border:1.5px solid var(--sketch-fg);border-radius:50%;corner-shape:round}.codexSketchCustom{width:30px;height:30px;margin:1px 4px;corner-shape:round;clip-path:circle(50%)}.codexSketchCustom span{width:22px;height:22px;border-width:2px;corner-shape:round}
.codexSketchPictures{position:absolute;left:0;top:0;z-index:3;background:var(--sketch-bg);border:1px solid var(--sketch-line);border-radius:12px;padding:10px;width:160px;max-height:100%;overflow:auto}.codexSketchPictures header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.codexSketchPictures>div{display:flex;gap:5px;align-items:center;padding:4px;border:1px solid transparent;border-radius:8px}.codexSketchPictures>div[data-active=true]{border-color:#0a84ff}.codexSketchPictures img{width:90px;height:65px;object-fit:contain}.codexSketchPictures small{color:var(--sketch-muted)}
.codexSketchViewControls{display:flex;gap:2px;align-items:center}.codexSketchViewControls button{min-height:32px;padding:0 7px;border-radius:8px}.codexSketchKeyPanel{position:absolute;bottom:80px;left:12px;width:280px;max-height:65%;overflow:auto;padding:14px;border:1px solid var(--sketch-line);border-radius:12px;background:var(--sketch-bg);z-index:5;box-shadow:0 8px 30px #0003}.codexSketchKeyPanel label{display:flex;align-items:center;justify-content:space-between;min-height:32px;gap:12px}.codexSketchKeyPanel input:not([type=checkbox]){width:64px;border:1px solid var(--sketch-line);border-radius:6px;color:inherit;background:transparent;padding:4px;text-align:center}.codexSketchKeyPanel p,.codexSketchKeyPanel small{color:var(--sketch-muted);font-size:11px}.codexSketchControls{position:static}

.codexSketchCursor{position:fixed;left:0;top:0;z-index:100;pointer-events:none;border:1px solid #222;border-radius:50%;corner-shape:round;box-shadow:0 0 0 1px #fff;box-sizing:border-box}.codexSketchCursor[hidden]{display:none}
`;
		//#endregion
		//#region src/sketch-workspace.jsx
		function SketchWorkspace({ preference, attachSketch, registerOpen, t }) {
			const settings = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [incoming, setIncoming] = (0, react.useState)(null);
			const opener = (0, react.useRef)(null);
			(0, react.useEffect)(() => registerOpen((mode = "sketch", source = document.activeElement, file) => {
				opener.current = source;
				if (mode === "sketch") {
					if (file) setIncoming({ file });
					setOpen(true);
				}
			}), [registerOpen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SketchStudio, {
				incoming,
				open,
				onClose: () => {
					setOpen(false);
					opener.current?.focus();
				},
				attachSketch,
				enabled: settings.imageSketch && settings.imageEditing,
				t
			}) });
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [settings.imageSketch && settings.imageEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("sketch"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "toolbar",
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
			})] });
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
			name: "Sketch · Beta",
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
		//#region src/client-locales.js
		const zh = {
			imageToSketch: "进入草图",
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
			sketchFiles: "草稿",
			sketchNew: "新建草图",
			sketchImport: "导入图片",
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
			imageEntryPointsHint: "@生图与草图 Beta；隐藏后仍可用自然语言生图。",
			imageEntryPoints_on: "显示",
			imageEntryPoints_off: "隐藏",
			imageBrowsing: "图片浏览",
			imageBrowsingHint: "预览粘贴图片与会话图片，标注后回到输入框编辑。",
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
			catalogFallback: "当前使用内置模型目录；登录后可刷新账户可用模型",
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
			diagnosticsFailed: "服务端诊断不可用，已生成可复制的本地脱敏诊断。请检查 DSH 服务连接与插件版本。",
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
			quickQuotaForecastHint: "按最近两小时的消耗估算；消耗不足或速度突变时重新校准，详情显示估计范围。仅供参考，历史保存在本机。",
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
			settingsTab_account: "账号与偏好",
			settingsTab_display: "使用偏好",
			settingsTab_advanced: "高级与诊断",
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
			imageToSketch: "Open in sketch",
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
			sketchFiles: "Drafts",
			sketchNew: "New sketch",
			sketchImport: "Import image",
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
			imageEntryPointsHint: "@Image and Sketch Beta. Natural-language image requests still work when hidden.",
			imageEntryPoints_on: "Show",
			imageEntryPoints_off: "Hide",
			imageBrowsing: "Image browsing",
			imageBrowsingHint: "Preview pasted and conversation images, annotate and return to the composer.",
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
			catalogFallback: "Using the built-in catalog. Sign in to refresh account models.",
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
			diagnosticsFailed: "Server diagnostics unavailable. A local, redacted report is available to copy. Check the DSH service and plugin version.",
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
			quickQuotaForecastHint: "Estimates recent two-hour consumption; recalibrates with insufficient data or changing pace. Details show a range. Indicative only; history stays local.",
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
			settingsTab_account: "Account & preferences",
			settingsTab_display: "Preferences",
			settingsTab_advanced: "Advanced",
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
.codexSettingsTabs{display:flex;gap:4px;padding:3px;background:var(--dsw-alias-bg-module-platform);border-radius:10px}
.codexSettingsTabs button{flex:1;border:0;border-radius:8px;padding:7px 8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}
.codexSettingsTabs button[aria-selected=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px #0001}
.codexSubscription>[role=tabpanel]:not([hidden]){display:flex;flex-direction:column;gap:10px}
.codexComposerQuota:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:2px}
.codexComposerQuota{display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0 5px;border:0;border-radius:6px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.codexComposerQuota:hover,.codexComposerQuota[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}
.codexQuotaCompactWindow{display:inline-flex;align-items:center;gap:5px}
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
.dcsiv-stage{position:relative;display:grid;place-items:center;min-width:0;min-height:0;overflow:hidden;padding:0;touch-action:none;user-select:none}.dcsiv-stage[data-dragging=true]{cursor:grabbing}.dcsiv-stage[data-annotating=true]{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='8' fill='none' stroke='%23333'/%3E%3C/svg%3E") 12 12,pointer}
.dcsiv-surface{position:relative;display:inline-flex;max-width:100%;max-height:100%;transform-origin:center;will-change:transform}.dcsiv-image{display:block;max-width:calc(100vw - 72px);max-height:calc(100vh - 154px);border-radius:12px;object-fit:contain;box-shadow:0 22px 60px rgba(0,0,0,.46);user-select:none;-webkit-user-drag:none}
.dcsiv-annotation{position:absolute;z-index:5;width:24px;height:24px;transform-origin:center;pointer-events:none}.dcsiv-pin{position:absolute;inset:0;display:grid;place-items:center;width:24px;height:24px;padding:0;border:2px solid #fff;border-radius:50%;background:rgba(23,24,27,.94);box-shadow:0 4px 16px rgba(0,0,0,.35);color:#fff;font:inherit;font-size:11px;font-weight:700;cursor:pointer;pointer-events:auto}.dcsiv-pin[data-active=true]{background:var(--dsw-alias-state-business-primary,#3964fe)}
.dcsiv-inline-note{position:absolute;bottom:34px;box-sizing:border-box;display:grid;width:min(300px,calc(100vw - 40px));grid-template-columns:24px minmax(0,1fr) 24px;align-items:center;gap:7px;padding:7px 8px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(32,33,37,.94);box-shadow:0 14px 38px rgba(0,0,0,.38);color:#fff;pointer-events:auto;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.dcsiv-annotation[data-x=right] .dcsiv-inline-note{left:-8px}.dcsiv-annotation[data-x=left] .dcsiv-inline-note{right:-8px}.dcsiv-annotation[data-x=center] .dcsiv-inline-note{left:50%;transform:translateX(-50%)}.dcsiv-annotation[data-y=down] .dcsiv-inline-note{top:34px;bottom:auto}.dcsiv-inline-note::after{position:absolute;width:9px;height:9px;background:rgba(32,33,37,.94);content:'';transform:rotate(45deg)}.dcsiv-annotation[data-y=up] .dcsiv-inline-note::after{bottom:-5px}.dcsiv-annotation[data-y=down] .dcsiv-inline-note::after{top:-5px}.dcsiv-annotation[data-x=right] .dcsiv-inline-note::after{left:13px}.dcsiv-annotation[data-x=left] .dcsiv-inline-note::after{right:13px}.dcsiv-annotation[data-x=center] .dcsiv-inline-note::after{left:calc(50% - 4px)}.dcsiv-inline-index{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3964fe);color:#fff;font-size:10px;font-weight:700}.dcsiv-inline-note textarea{box-sizing:border-box;width:100%;min-height:24px;max-height:92px;resize:none;overflow:auto;border:0;outline:0;background:transparent;color:#fff;font:inherit;font-size:12px;line-height:18px}.dcsiv-inline-note textarea::placeholder{color:rgba(255,255,255,.44)}.dcsiv-note-remove{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:rgba(255,255,255,.68);cursor:pointer}.dcsiv-note-remove:hover{background:rgba(255,255,255,.1);color:#fff}
.dcsiv-nav{position:absolute;top:50%;z-index:4;width:42px;height:42px;padding:0;transform:translateY(-50%);background:rgba(48,49,53,.82);box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}.dcsiv-prev{left:6px}.dcsiv-next{right:6px}.dcsiv-counter{position:absolute;bottom:8px;left:50%;padding:5px 10px;border-radius:999px;background:rgba(38,39,43,.86);color:rgba(255,255,255,.72);font-size:11px;transform:translateX(-50%);backdrop-filter:blur(16px)}
.dcsiv-hint{display:none}
.dcsiv-copy-notes{position:absolute;right:20px;bottom:22px;z-index:6;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(38,39,43,.86);color:rgba(255,255,255,.82);font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(16px)}
.dcsiv-edit-short{display:none}
@media(max-width:760px){.dcsiv-actions{flex-wrap:wrap;justify-content:center}.dcsiv-edit-short{display:inline;white-space:normal;max-width:min(280px,calc(100vw - 80px))}.dcsiv-edit-action{height:auto;min-height:32px}.dcsiv-close-floating{top:12px;right:12px;width:40px;height:40px}.dcsiv-workspace{padding:60px 12px 68px}.dcsiv-image{max-width:calc(100vw - 24px);max-height:calc(100vh - 136px)}.dcsiv-topbar{bottom:12px;max-width:calc(100vw - 24px)}.dcsiv-button{padding:0 8px}.dcsiv-button span.dcsiv-label{display:none}.dcsiv-inline-note{width:min(260px,calc(100vw - 40px))}.dcsiv-copy-notes{display:none}}
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dcsiv-button dcsiv-edit-action",
				"aria-label": label ?? t("imageEdit"),
				disabled: state === "pending",
				onClick: () => {
					invoke();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {}),
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
			imageSketch: true
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
			if (forecast?.status === "ready" && forecast.provisional) return `≈${formatRunway(forecast.runwaySeconds, t)}`;
			if (forecast?.status === "calibrating") return t({
				resolution: "forecastResolution",
				"changing-pace": "forecastChanging",
				stale: "forecastStale"
			}[forecast.reason] ?? "quotaForecastCalibrating");
			if (forecast?.status === "idle") return t("quotaForecastIdle");
			if (forecast?.status !== "ready") return void 0;
			if (forecast.survivesReset) return t("quotaForecastUntilReset");
			if (Number.isFinite(forecast.runwayMinSeconds) && Number.isFinite(forecast.runwayMaxSeconds)) {
				const min = formatRunway(forecast.runwayMinSeconds, t), max = formatRunway(forecast.runwayMaxSeconds, t);
				if (min && max && min !== max) return fill(t("quotaForecast"), {
					symbol: "≈",
					duration: `${min}–${max}`
				});
			}
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
		//#region src/version.js
		const PACKAGE_VERSION = "2.0.0";
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
		//#region src/client-quota.jsx
		function useQuickQuota(rpc, enabled, model) {
			const [quota, setQuota] = (0, react.useState)();
			(0, react.useEffect)(() => {
				if (!enabled) {
					setQuota(void 0);
					return;
				}
				setQuota(void 0);
				let live = true;
				let loading = false;
				const load = async () => {
					if (loading) return;
					loading = true;
					try {
						const account = await recoveryCall(rpc, "status");
						if (!live) return;
						if (account?.authenticated !== true) {
							setQuota(void 0);
							return;
						}
						const usage = await recoveryCall(rpc, "usage", { force: false });
						if (live) setQuota(selectModelQuotaWindows(usage, model)?.map((window) => ({
							...window,
							fetchedAt: usage.fetchedAt
						})));
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
				if (!pinned.current) dismissTimer.current = setTimeout(() => setOpen(false), 150);
			};
			const dismiss = () => {
				pinned.current = false;
				setOpen(false);
			};
			(0, react.useEffect)(() => () => clearTimeout(dismissTimer.current), []);
			const id = (0, react.useId)();
			const visible = open && quotaEnabled && !!quotas?.length;
			const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open: visible,
				anchorRef: trigger,
				panelRef: panel,
				side: "top",
				gap: 8,
				margin: 12
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(trigger, visible, dismiss, panel);
			(0, react.useEffect)(() => {
				setOpen(false);
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
						preferenceSnapshot.quickQuotaMode === "bar" && quotas.length === 1 && Math.abs(quota.windowSeconds - 604800) < 60 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: shortWindow(quota.windowSeconds, t) }),
						preferenceSnapshot.quickQuotaMode === "bar" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							className: "codexComposerQuotaBar",
							max: 100,
							value: quota.remainingPercent,
							"aria-hidden": "true"
						}) : null,
						preferenceSnapshot.quickQuotaMode !== "bar" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [`${percent(quota.remainingPercent)}%`, forecastMode ? ` · ${forecastText(quota, t)}` : ""] }) : null
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
					] }), forecastMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: formatQuotaForecast(quota.forecast, t) }) : null]
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
			const value = (/* @__PURE__ */ new Date(quota.resetsAt * 1e3)).toLocaleString(void 0, {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
			return fill(t("resets"), { value });
		}
		function forecastText(quota, t) {
			const forecast = quota.forecast;
			if (forecast?.status === "ready" && forecast.provisional) return `≈${formatRunway(forecast.runwaySeconds, t)}`;
			if (forecast?.status === "calibrating") return t({
				"changing-pace": "forecastCompactChanging",
				stale: "forecastCompactStale"
			}[forecast.reason] ?? "forecastCompactPending");
			if (forecast?.status === "idle") return t("quickQuotaForecastIdle");
			if (forecast?.status === "ready" && forecast.survivesReset) return t("quickQuotaForecastUntilReset");
			if (forecast?.status === "ready") {
				const min = formatRunway(forecast.runwayMinSeconds, t), max = formatRunway(forecast.runwayMaxSeconds, t);
				return min && max && min !== max ? `≈${min}–${max}` : `≈${formatRunway(forecast.runwaySeconds, t)}`;
			}
			return t("forecastCompactPending");
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
		//#region src/image-setting-groups.js
		const IMAGE_SETTING_GROUPS = Object.freeze({
			imageCapability: ["imageGeneration", "imageEditing"],
			imageEntryPoints: ["imageShortcut", "imageSketch"],
			imageBrowsing: ["imageViewer", "imageAnnotations"]
		});
		function imageGroupValue(snapshot, group) {
			const fields = IMAGE_SETTING_GROUPS[group];
			if (fields.every((field) => snapshot[field] === true)) return "on";
			if (fields.every((field) => snapshot[field] === false)) return "off";
			return "mixed";
		}
		function imageGroupPatch(group, enabled) {
			return Object.fromEntries(IMAGE_SETTING_GROUPS[group].map((field) => [field, enabled]));
		}
		//#endregion
		//#region src/image-preferences.jsx
		function ImageChoice({ label, hint, value, text, items, disabled, onSelect }) {
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
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionPreferenceHint",
						children: hint
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
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
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: text }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})]
					})
				})]
			});
		}
		const modelLabel = (model) => model.replace("gpt-image-", "GPT Image ").replace("-flare", " Flare").replace("-sunburst", " Sunburst");
		function ImagePreferences({ preference, t }) {
			const snapshot = (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
			const disabled = snapshot.status !== "ready" || !snapshot.writable || snapshot.saving;
			const active = snapshot.imageGeneration || snapshot.imageEditing;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscriptionCard codexImageSettings",
				"aria-label": t("imageSettings"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("imageSettings") }),
					Object.keys(IMAGE_SETTING_GROUPS).map((group) => {
						const value = imageGroupValue(snapshot, group);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageChoice, {
							label: t(group),
							hint: t(`${group}Hint`),
							value,
							text: t(value === "mixed" ? "imageGroupMixed" : `${group}_${value}`),
							disabled,
							items: ["on", "off"].map((id) => ({
								id,
								label: t(`${group}_${id}`)
							})),
							onSelect: (id) => {
								preference.set(imageGroupPatch(group, id === "on"));
							}
						}, group);
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexImageDefaultsGroup",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageChoice, {
							label: t("imageModel"),
							value: snapshot.imageModel,
							text: modelLabel(snapshot.imageModel),
							disabled: disabled || !active,
							items: Object.keys(IMAGE_MODELS).map((id) => ({
								id,
								label: `${modelLabel(id)}${id.includes("2.5") ? ` · ${t("imageExperimental")}` : ""}`
							})),
							onSelect: (imageModel) => {
								preference.set({
									imageModel,
									imageQuality: "auto"
								});
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageChoice, {
							label: t("imageQuality"),
							value: snapshot.imageQuality,
							text: t(`imageQuality_${snapshot.imageQuality}`),
							disabled: disabled || !active,
							items: IMAGE_MODELS[snapshot.imageModel].map((id) => ({
								id,
								label: t(`imageQuality_${id}`)
							})),
							onSelect: (imageQuality) => {
								preference.set({ imageQuality });
							}
						})]
					}),
					snapshot.imageModel.includes("2.5") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionPreferenceHint",
						children: t("imageModelHint")
					}) : null
				]
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
			if (section === "quota") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
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
		function PreferencesCard({ preference, t, section = "display" }) {
			const snapshot = usePreferenceSnapshot(preference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
				children: [section === "advanced" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchProviderPreference, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextWindowPreference, {
						preference,
						t
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickQuotaPreference, {
					preference,
					t
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityPreferences, {
					preference,
					t,
					section: "quota"
				})] }), snapshot.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
				}) : null]
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
			const flowGeneration = (0, react.useRef)(0);
			const [manualCode, setManualCode] = (0, react.useState)("");
			const [adding, setAdding] = (0, react.useState)(false);
			const [removeId, setRemoveId] = (0, react.useState)();
			const [emailVisible, setEmailVisible] = (0, react.useState)(false);
			const accounts = account?.accounts ?? [];
			const accountVisibilityKey = `${account?.authenticated === true ? "signed-in" : "signed-out"}:${accounts.map((candidate) => `${candidate.id ?? ""}:${candidate.active === true}:${candidate.email ?? ""}`).join("|")}`;
			const [emailVisibilityKey, setEmailVisibilityKey] = (0, react.useState)(accountVisibilityKey);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("waiting") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: retrying || busy,
								"aria-busy": retrying,
								onClick: () => {
									accountStatus.retry();
								},
								children: retrying ? t("accountRetrying") : t("accountRetry")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy || retrying,
								onClick: () => void clear(),
								children: busy ? t("accountRetrying") : t(confirm ? "recoveryClearConfirm" : "recoveryClear")
							}),
							confirm ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => setConfirm(false),
								children: t("cancel")
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionPreferenceHint",
						children: t(confirm ? "recoveryClearHint" : "recoveryHint")
					}),
					failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						children: t("recoveryFailed")
					}) : null
				]
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
				recoveryCall(rpc, "diagnostics").then(setReport).catch((error) => {
					setReport(clientDiagnostic(error));
					setError(true);
				}).finally(() => setBusy(false));
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
				recoveryCall(rpc, "usage", { force }).then((next) => {
					if (request.current === id) {
						setUsage(next);
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
			const [tab, setTab] = (0, react.useState)("account");
			const id = (0, react.useId)();
			const tabs = ["account", "advanced"];
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
						role: "tablist",
						"aria-label": t("title"),
						children: tabs.map((value, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							id: `${id}-${value}-tab`,
							"aria-controls": `${id}-${value}`,
							"aria-selected": tab === value,
							tabIndex: tab === value ? 0 : -1,
							onClick: () => setTab(value),
							onKeyDown: (event) => {
								const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
								if (next < 0) return;
								event.preventDefault();
								setTab(tabs[next]);
								document.getElementById(`${id}-${tabs[next]}-tab`)?.focus();
							},
							children: t(`settingsTab_${value}`)
						}, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "tabpanel",
						id: `${id}-account`,
						"aria-labelledby": `${id}-account-tab`,
						hidden: tab !== "account",
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
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "tabpanel",
						id: `${id}-advanced`,
						"aria-labelledby": `${id}-advanced-tab`,
						hidden: tab !== "advanced",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferencesCard, {
								preference,
								t,
								section: "advanced"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImagePreferences, {
								preference,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsCard, {
								rpc,
								t
							})
						]
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
				tag.textContent = STYLE + SUBSCRIPTION_IMAGE_VIEWER_CSS + SKETCH_CSS + IMAGE_PREVIEWS_CSS;
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
				if (!actx || typeof conversation.createDraftImages !== "function" || !conversation.input?.for) throw new Error("Image composer is unavailable");
				return conversation.input.for(actx);
			};
			const openSketchImage = (sessionId) => async (src, name) => {
				const settings = preference.getSnapshot(), open = sketchOpeners.get(sessionId);
				if (!settings.imageSketch || !settings.imageEditing || !open) throw Error("Sketch unavailable");
				const response = await fetch(src);
				if (!response.ok) throw Error("Image unavailable");
				const blob = await response.blob();
				if (blob.size > 20 * 1024 * 1024) throw Error("Image too large");
				imageViewer.close();
				open("sketch", document.activeElement, new File([blob], name || "image.png", { type: blob.type || "image/png" }));
			};
			const attachForEdit = (sessionId) => async (src, filename, draft, annotations = [], referenceName, sourceInDraft = false) => {
				if (!preference.getSnapshot().imageEditing) throw new Error("Image editing is disabled");
				const actx = sessions.scope(sessionId);
				if (actx === void 0 || typeof conversation.createDraftImages !== "function" || conversation.input?.for === void 0) throw new Error("This DSH version does not provide the image composer bridge");
				const response = await fetch(src);
				if (!response.ok) throw new Error("Could not read generated image");
				const blob = await response.blob();
				const files = sourceInDraft ? [] : [new File([blob], filename, { type: blob.type || "image/png" })];
				if (annotations.length > 0) {
					const reference = await createAnnotatedImageReference(blob, annotations);
					files.push(new File([reference], referenceName, { type: "image/png" }));
				}
				const input = conversation.input.for(actx);
				if (!preference.getSnapshot().imageEditing) throw new Error("Image editing is disabled");
				if (files.length) attachImageFiles(conversation, input, files);
				sessions.open(sessionId);
				if (sourceInDraft && !annotations.length) return;
				if (!input.state.getSnapshot().draft.trim()) input.setDraft(draft);
				else if (annotations.length) if (!input.state.getSnapshot().occurrences?.length) appendImagePrompt(input, draft);
				else input.notify("info", draft);
			};
			const nativeAttachments = () => ctx.slots.entries("conversation.input.attachments").find((entry) => entry.component !== ComposerImagePreviews && entry.locale === "conversation" && !entry.inject && !entry.store && !entry.children);
			const watchNativeAttachments = (callback) => ctx.slots.subscribe("conversation.input.attachments", callback);
			const nativeTranslate = ctx.locale.bind("conversation");
			for (const [name, component] of [
				["conversation.input.attachments", ComposerImagePreviews],
				["conversation.message.images", MessageImagePreviews],
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
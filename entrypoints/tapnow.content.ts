import { browser } from "wxt/browser";
import { createElement, GripVertical, RotateCcw, X, ScanLine, Sparkles } from "lucide";
import acuTheme from "../viewer/acu-theme.css?inline";
import panelStyle from "../utils/companion-panel.css?inline";
import { parseCreativeMemory, creativeMemoryMarkup } from "../utils/creative-memory";
import { companionRoute } from "../utils/tapnow-route";
import { isVideoMaterial, videoDraftIdentity } from "../utils/video";
import { loadCompanionSettings } from "../utils/companion-settings";
import {
  canvasRoot,
  canvasNodeFor,
  canvasNodeId,
  selectedCanvasNode,
  CANVAS_NODE_SELECTOR,
  PROMPT_SELECTOR
} from "../utils/tapnow-dom";
import {
  DEFAULT_SETTINGS,
  reviewDraft,
  inferPromptFromNodeText,
  inferNodeTypeFromId,
  type LocalReview,
  type ReviewConnectionInfo,
  type ReviewDraft,
  type ReviewNodeInfo,
  type ReviewSettings
} from "../utils/reviewer";
import {
  buildReferenceBindings,
  relationsFromPayload,
  snapshotFromPayload,
  toReviewConnectionInfo,
  toReviewNodeInfo,
  type TapNowApiNode,
  type TapNowCanvasSnapshot
} from "../utils/tapnow";
import {
  LLM_REQUEST_TIMEOUT_MS,
  selectPreparedImages
} from "../utils/limits";
import {
  reviewPayloadStats,
  type LlmRequestDiagnostics
} from "../utils/llm";
import {
  MAX_REVIEW_IMAGE_MATERIALS,
  MAX_REVIEW_PROMPT_CHARS,
  MAX_REVIEW_TEXT_MATERIAL_ITEM_CHARS,
  MAX_REVIEW_TEXT_MATERIALS,
  MAX_REVIEW_UPSTREAM_CHARS,
  MAX_SINGLE_IMAGE_BYTES
} from "../utils/limits";

interface LlmResponse {
  creativeMemory?: ReviewDraft["creativeMemory"];
  videoEvidence?: Array<{ materialId: string; url: string; frameCount: number;
    sampledTimestamps: string[]; audio?: NonNullable<ReviewDraft["videoMaterials"]>[number]["audio"];
    error?: string; omittedFrames?: number }>;
  ok: boolean;
  error?: string;
  diagnostics?: LlmRequestDiagnostics;
  result?: {
    decision: "allow" | "warn" | "block";
    summary: string;
    issues: LocalReview["issues"];
    suggestions: string[];
    model: string;
    requestStats?: ReturnType<typeof reviewPayloadStats> & {
      requestBytes: number;
      endpoint: string;
      protocol: "responses" | "chat_completions";
      startedAt: string;
      finishedAt: string;
      durationMs: number;
      attempts: number;
      responseStatus: number | null;
      responseContentType: string | null;
      responseBytes: number;
      responseMode: "json" | "sse" | "unknown";
      terminalEvent: string | null;
      firstByteMs: number | null;
      terminalEventMs: number | null;
      connectionClosedMs: number | null;
      fallbackUsed: boolean;
      clientRequestId: string;
      responseRequestId: string | null;
    };
  };
}

type ActiveField = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

export default defineContentScript({
  matches: ["https://app.tapnow.ai/*"],
  runAt: "document_idle",
  main(ctx) {
    let updateRoute = (_url?: string) => {};
    let disposeMount = () => {};
    const mount = () => {
      updateRoute();
      if (
        !companionRoute(location.href).workspace ||
        document.getElementById("tapnow-companion-host")
      ) {
        return;
      }
      disposeMount();
      const lifecycle = new AbortController();
      disposeMount = () => {
        lifecycle.abort();
        closePanel();
        host.remove();
      };

      const state: {
        settings: ReviewSettings;
        activeField: ActiveField | null;
        activeNode: Element | null;
        dragging: boolean;
        movedDuringDrag: boolean;
        suppressNextClick: boolean;
        dragStartX: number;
        dragStartY: number;
        dragOriginLeft: number;
        dragOriginTop: number;
        reviewSequence: number;
        activeNodeId: string | null;
        lastDraft: ReviewDraft | null;
        pendingTimer: ReturnType<typeof setInterval> | null;
      } = {
        settings: DEFAULT_SETTINGS,
        activeField: null,
        activeNode: null,
        dragging: false,
        movedDuringDrag: false,
        suppressNextClick: false,
        dragStartX: 0,
        dragStartY: 0,
        dragOriginLeft: 0,
        dragOriginTop: 0,
        reviewSequence: 0,
        activeNodeId: null,
        lastDraft: null,
        pendingTimer: null
      };

      const host = document.createElement("div");
      host.id = "tapnow-companion-host";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <style>${acuTheme}\n${panelStyle}</style>
        <div class="dock" role="toolbar" aria-label="TapNow 插件">
          <button class="grip" title="拖动插件入口" aria-label="拖动插件入口"></button>
          <button class="launcher" type="button" title="审阅当前聚焦节点">副驾驶</button>
          <button class="reset-position" title="恢复入口位置" aria-label="恢复入口位置"></button>
        </div>
        <section class="panel hidden" aria-label="TapNow Companion 审核面板">
          <header class="header">
            <div class="acu-brand"><span class="acu-mark" aria-hidden="true">A</span><div><span class="acu-wordmark">ACU 副驾驶</span><span class="acu-edition">当前节点检测</span></div></div>
            <button class="close" type="button" aria-label="关闭" title="关闭"></button>
          </header>
          <div class="body"></div>
          <footer class="footer">
            <button class="action close-action" type="button">关闭</button>
            <button class="action primary detect" type="button">检测</button>
          </footer>
        </section>
      `;

      document.documentElement.append(host);
      // A manual popover keeps the entry out of TapNow's stacking contexts.
      host.popover = "manual";
      host.showPopover();
      document.addEventListener("fullscreenchange", () => {
        host.hidePopover();
        (document.fullscreenElement || document.documentElement).append(host);
        host.showPopover();
      }, { signal: lifecycle.signal });
      const launcher = shadow.querySelector<HTMLButtonElement>(".launcher")!;
      const dock = shadow.querySelector<HTMLDivElement>(".dock")!;
      const grip = shadow.querySelector<HTMLButtonElement>(".grip")!;
      const resetPosition = shadow.querySelector<HTMLButtonElement>(".reset-position")!;
      grip.append(createElement(GripVertical));
      resetPosition.append(createElement(RotateCcw));
      const panel = shadow.querySelector<HTMLElement>(".panel")!;
      const body = shadow.querySelector<HTMLElement>(".body")!;
      const close = shadow.querySelector<HTMLButtonElement>(".close")!;
      const closeAction = shadow.querySelector<HTMLButtonElement>(".close-action")!;
      const detectButton = shadow.querySelector<HTMLButtonElement>(".detect")!;
      close.append(createElement(X));
      detectButton.prepend(createElement(ScanLine));
      launcher.prepend(createElement(Sparkles));

      function textOf(element: Element | null | undefined): string {
        const candidate = element as (Element & { value?: string }) | null | undefined;
        return (candidate?.value || candidate?.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function nodeFor(target: Element | null): Element | null {
        if (!target || host.contains(target)) return null;
        return canvasNodeFor(target, currentCanvasRoot());
      }

      function currentCanvasRoot(): Element | Document {
        return canvasRoot(document, companionRoute(location.href).canvasId);
      }

      function rememberActive(target: Element | null) {
        if (!target || host.contains(target)) return;
        updateRoute();
        const root = currentCanvasRoot();
        if (!root.contains(target)) return;
        const node = nodeFor(target);
        const field = target.closest("textarea, input:not([type=hidden]), [contenteditable=true]") as ActiveField | null;
        // V2's floating prompt editor is portaled outside the node wrapper.
        // Keep the node identity while editing it or interacting with canvas chrome.
        if (!node) {
          if (field?.closest(PROMPT_SELECTOR) && root.querySelector(`${CANVAS_NODE_SELECTOR}.selected`)) {
            state.activeField = field;
          }
          return;
        }
        state.activeField = target.closest(
          "textarea, input:not([type=hidden]), [contenteditable=true]"
        ) as ActiveField | null;
        state.activeNode = node;
        state.activeNodeId = getNodeId(state.activeNode);
        console.info("[TapNow Companion] focus", {
          nodeId: state.activeNodeId,
          nodeType: inferNodeTypeFromId(state.activeNodeId),
          fieldTag: state.activeField?.tagName || null
        });
      }

      function nodeTextOf(element: Element | null): string {
        if (!element) return "";
        const output = element.querySelector(
          "[data-testid='canvas-node-text-content']"
        );
        const clone = (
          output ? output.cloneNode(true) : element.cloneNode(true)
        ) as Element;
        clone
          .querySelectorAll(
            "button, [role=button], script, style, " +
              "[data-testid='canvas-node-generation-input-bar'], " +
              "[data-testid='canvas-node-title'], input, textarea, " +
              "[contenteditable=true]"
          )
          .forEach((control) => control.remove());
        return inferPromptFromNodeText(textOf(clone));
      }

      function getNodeId(element: Element | null): string | null {
        return canvasNodeId(element);
      }

      function nodeTypeOf(element: Element | null): string | null {
        if (!element) return null;
        const nodeId = getNodeId(element);
        return (
          element.getAttribute("data-node-type") ||
          element.getAttribute("data-type") ||
          inferNodeTypeFromId(nodeId)
        )
          ?.toLowerCase() || null;
      }

      function domNodeInfo(element: Element): ReviewNodeInfo | null {
        const id = getNodeId(element);
        if (!id) return null;
        const nodeType = nodeTypeOf(element);
        const media = [...element.querySelectorAll("img")]
          .filter(
            (image) =>
              visible(image) &&
              image.naturalWidth >= 64 &&
              image.naturalHeight >= 64 &&
              !image.closest(
                "[data-testid='canvas-node-generation-input-bar']"
              )
          )
          .map((image) => ({
            url: sourceImageUrl(image.currentSrc || image.src),
            width: image.naturalWidth,
            height: image.naturalHeight
          }))
          .filter((item) => /^https?:\/\//i.test(item.url));
        return {
          id,
          canvasId: null,
          nodeType,
          dataType: null,
          title: null,
          shortId: null,
          data: {},
          prompt: "",
          text: nodeType === "text" ? nodeTextOf(element) : "",
          params: null,
          media,
          taskStatus: null,
          position: { x: null, y: null },
          measured: { width: null, height: null },
          dimensions: { width: null, height: null },
          parentId: null,
          extent: null,
          sourcePosition: null,
          targetPosition: null,
          sessionId: null,
          createdBy: null,
          createdByRole: null,
          createdAt: null,
          updatedAt: null
        };
      }

      function findNodeById(nodeId: string | null): Element | null {
        if (!nodeId) return null;
        return [...currentCanvasRoot().querySelectorAll(CANVAS_NODE_SELECTOR)].find(
          (node) => node.getAttribute("data-id") === nodeId
        ) || null;
      }

      function incomingNodeIds(nodeId: string | null): string[] {
        if (!nodeId) return [];
        const result: string[] = [];
        for (const edge of currentCanvasRoot().querySelectorAll("[aria-label^='Edge from ']")) {
          const label = edge.getAttribute("aria-label") || "";
          const match = label.match(/^Edge from (.+) to (.+)$/);
          if (match?.[2] === nodeId) result.push(match[1]);
        }
        return [...new Set(result)];
      }

      function outgoingNodeIds(nodeId: string | null): string[] {
        if (!nodeId) return [];
        const result: string[] = [];
        for (const edge of currentCanvasRoot().querySelectorAll("[aria-label^='Edge from ']")) {
          const label = edge.getAttribute("aria-label") || "";
          const match = label.match(/^Edge from (.+) to (.+)$/);
          if (match?.[1] === nodeId) result.push(match[2]);
        }
        return [...new Set(result)];
      }

      function domConnectionsFor(
        nodeId: string | null,
        direction: "incoming" | "outgoing"
      ): ReviewConnectionInfo[] {
        if (!nodeId) return [];
        const result: ReviewConnectionInfo[] = [];
        for (const edge of currentCanvasRoot().querySelectorAll("[aria-label^='Edge from ']")) {
          const label = edge.getAttribute("aria-label") || "";
          const match = label.match(/^Edge from (.+) to (.+)$/);
          if (!match) continue;
          const source = match[1];
          const target = match[2];
          if (
            (direction === "incoming" && target !== nodeId) ||
            (direction === "outgoing" && source !== nodeId)
          ) {
            continue;
          }
          const id =
            edge.getAttribute("data-id") ||
            `dom-edge-${source}-${target}`;
          result.push({
            id,
            source,
            target,
            sourceHandle: null,
            targetHandle: null,
            label: ""
          });
        }
        return result;
      }

      function normalizedImageUrl(value: string): string {
        try {
          const parsed = new URL(sourceImageUrl(value));
          parsed.searchParams.delete("tap_mx");
          return parsed.toString();
        } catch {
          return value;
        }
      }

      function sourceImageUrl(value: string): string {
        try {
          const parsed = new URL(value);
          parsed.searchParams.delete("variant_name");
          return parsed.toString();
        } catch {
          return value;
        }
      }

      function captureSourceUrl(value: string): string {
        const source = sourceImageUrl(value);
        try {
          const parsed = new URL(source);
          if (parsed.hostname === "files.tapnow.top") {
            parsed.hostname = "files.tapnow.media";
          }
          return parsed.toString();
        } catch {
          return source;
        }
      }

      function promptValue(value: unknown): string {
        const prompt = String(value ?? "").trim();
        return prompt === "/" || prompt === "-" ? "" : prompt;
      }

      function opaquePromptReason(value: string): string | null {
        if (/^[a-f0-9]{32}$/i.test(value)) {
          return "仅包含 32 位内部哈希，未作为用户提示词使用。";
        }
        if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) {
          return "仅包含内部 UUID，未作为用户提示词使用。";
        }
        return null;
      }

      function imageIdentity(value: string): string {
        try {
          const parsed = new URL(sourceImageUrl(value));
          parsed.searchParams.delete("tap_mx");
          if (/^files\.tapnow\.(?:media|top)$/i.test(parsed.hostname)) {
            return parsed.pathname;
          }
          return parsed.toString();
        } catch {
          return value;
        }
      }

      async function fetchCanvasSnapshot(
        canvasId: string
      ): Promise<{
        snapshot: TapNowCanvasSnapshot;
        endpoint: string;
        relationsEndpoint: string;
        relationsError: string;
      }> {
        const endpoint = new URL(
          `/api/canvas/v1/canvases/${encodeURIComponent(
            canvasId
          )}?with_nodes=true&with_connections=true`,
          location.origin
        ).toString();
        const accessToken = localStorage.getItem("access_token");
        if (!accessToken) {
          throw new Error("TapNow 页面没有可用的登录会话。");
        }
        const response = await fetch(endpoint, {
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          throw new Error(`TapNow 画布接口 HTTP ${response.status}`);
        }
        const snapshot = snapshotFromPayload(await response.json());
        if (!snapshot) {
          throw new Error("TapNow 画布接口没有返回节点和连线数据。");
        }

        const relationsEndpoint = new URL(
          `/api/canvas/v1/canvases/${encodeURIComponent(
            canvasId
          )}/nodes?limit=1000&include_relations=true`,
          location.origin
        ).toString();
        let relationsError = "";
        try {
          const relationsResponse = await fetch(relationsEndpoint, {
            credentials: "include",
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!relationsResponse.ok) {
            throw new Error(
              `TapNow 节点关系接口 HTTP ${relationsResponse.status}`
            );
          }
          snapshot.relations =
            relationsFromPayload(await relationsResponse.json()) || undefined;
          if (!snapshot.relations) {
            throw new Error("TapNow 节点关系接口没有返回 relations。");
          }
        } catch (error) {
          relationsError =
            error instanceof Error ? error.message : String(error);
        }
        return {
          snapshot,
          endpoint,
          relationsEndpoint,
          relationsError
        };
      }

      function focusedReferenceUrls(element: Element | null): string[] {
        if (!element) return [];
        return [...element.querySelectorAll(
          "[data-testid='canvas-node-generation-input-bar'] img"
        )]
          .filter(visible)
          .map((image) =>
            ({
              image,
              url: sourceImageUrl(
                image.currentSrc || image.getAttribute("src") || ""
              )
            })
          )
          .filter(
            ({ image, url }) =>
              image.naturalWidth >= 64 &&
              image.naturalHeight >= 64 &&
              /^https?:\/\//i.test(url)
          )
          .map(({ url }) => url)
          .filter(Boolean);
      }

      function visible(element: Element): boolean {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      }

      function blobToDataUrl(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }

      async function captureImage(
        image: HTMLImageElement | string
      ): Promise<{
        dataUrl?: string;
        sourceUrl?: string;
        error?: string;
        compression?: {
          applied: boolean;
          method: string;
          originalBytes?: number | null;
          preparedBytes?: number | null;
        };
      }> {
        async function encodeCanvas(
          canvas: HTMLCanvasElement
        ): Promise<{ dataUrl: string; bytes: number } | undefined> {
          for (const quality of [0.82, 0.68, 0.52]) {
            const output = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/jpeg", quality)
            );
            if (output && output.size <= MAX_SINGLE_IMAGE_BYTES) {
              return {
                dataUrl: await blobToDataUrl(output),
                bytes: output.size
              };
            }
          }
          return undefined;
        }

        async function compressBlob(
          blob: Blob
        ): Promise<{ dataUrl: string; bytes: number } | undefined> {
          try {
            const bitmap = await createImageBitmap(blob);
            const maxDimension = 2048;
            const scale = Math.min(
              1,
              maxDimension / Math.max(bitmap.width, bitmap.height)
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext("2d")?.drawImage(
              bitmap,
              0,
              0,
              canvas.width,
              canvas.height
            );
            bitmap.close();
            return await encodeCanvas(canvas);
          } catch {
            return undefined;
          }
        }

        const source =
          typeof image === "string"
            ? captureSourceUrl(image)
            : captureSourceUrl(image.currentSrc || image.src);
        try {
          const response = await fetch(source, { credentials: "include" });
          if (response.ok) {
            const blob = await response.blob();
            if (blob.size <= MAX_SINGLE_IMAGE_BYTES) {
              return {
                dataUrl: await blobToDataUrl(blob),
                sourceUrl: source,
                compression: {
                  applied: false,
                  method: "original",
                  originalBytes: blob.size,
                  preparedBytes: blob.size
                }
              };
            }
            const compressed = await compressBlob(blob);
            if (compressed) {
              return {
                dataUrl: compressed.dataUrl,
                sourceUrl: source,
                compression: {
                  applied: true,
                  method: "page-canvas-jpeg-2048",
                  originalBytes: blob.size,
                  preparedBytes: compressed.bytes
                }
              };
            }
            return {
              error: `原图超过 ${MAX_SINGLE_IMAGE_BYTES / 1_000_000} MB，压缩后仍无法控制在发送上限内。`
            };
          }
        } catch {
          // The extension fetch below handles media hosts that reject page CORS.
        }
        try {
          if (typeof image !== "string") {
            const canvas = document.createElement("canvas");
            const maxDimension = 2048;
            const scale = Math.min(
              1,
              maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
            );
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext("2d")?.drawImage(
              image,
              0,
              0,
              canvas.width,
              canvas.height
            );
            const encoded = await encodeCanvas(canvas);
            if (encoded) {
              return {
                dataUrl: encoded.dataUrl,
                sourceUrl: source,
                compression: {
                  applied: true,
                  method: "page-canvas-jpeg-2048",
                  originalBytes: null,
                  preparedBytes: encoded.bytes
                }
              };
            }
          }
        } catch {
          // Fall through to the background fetch.
        }
        try {
          const response = (await browser.runtime.sendMessage({
            type: "tapnow:capture-image",
            url: source
          })) as {
            ok?: boolean;
            dataUrl?: string;
            sourceUrl?: string;
            error?: string;
            compression?: {
              applied: boolean;
              method: string;
              originalBytes?: number | null;
              preparedBytes?: number | null;
            };
          };
          return response?.ok && response.dataUrl
            ? {
                dataUrl: response.dataUrl,
                sourceUrl: response.sourceUrl || source,
                compression: response.compression
              }
            : { error: response?.error || "无法读取图片。" };
        } catch {
          return { error: "无法读取图片。" };
        }
      }

      async function getDraft(includeImageData = false): Promise<ReviewDraft> {
        const root = currentCanvasRoot();
        const selectedNode = selectedCanvasNode(root, state.activeNodeId);
        const editor = selectedNode?.querySelector<ActiveField>(`${PROMPT_SELECTOR.split(", ").map(selector => `${selector} textarea, ${selector} [contenteditable=true]`).join(", ")}`) ||
          (root.querySelectorAll(`${CANVAS_NODE_SELECTOR}.selected`).length === 1
            ? root.querySelector<ActiveField>("[data-node-generation-workbench]:not([inert]) textarea, [data-node-generation-workbench]:not([inert]) [contenteditable=true]")
            : null);
        const field =
          state.activeField &&
          root.contains(state.activeField) &&
          (!selectedNode || selectedNode.contains(state.activeField) ||
            (!nodeFor(state.activeField) && state.activeField.closest(PROMPT_SELECTOR)))
            ? state.activeField
            : editor;
        // TapNow's selected node is the authoritative focus. The pointer event
        // can be swallowed by a scaled image child, leaving our remembered
        // node one interaction behind.
        const rememberedNode =
          selectedNode ||
          (state.activeNode && root.contains(state.activeNode)
            ? state.activeNode
            : findNodeById(state.activeNodeId));
        const nodeElement = rememberedNode || (field ? nodeFor(field) : null);
        const nodeId = getNodeId(nodeElement) || state.activeNodeId;
        const domNodeType = nodeTypeOf(nodeElement);
        const currentNodeText = nodeTextOf(nodeElement);
        const fieldIsPrompt = Boolean(
          field?.closest(PROMPT_SELECTOR)
        );
        const fieldPrompt = fieldIsPrompt && field
          ? promptValue("value" in field ? field.value : field.textContent)
          : "";
        const canvasId = companionRoute(location.href).canvasId;
        let apiSnapshot: TapNowCanvasSnapshot | null = null;
        let apiEndpoint = "";
        let apiSnapshotError = "";
        let apiRelationsEndpoint = "";
        let apiRelationsError = "";
        if (canvasId && nodeId) {
          try {
            const result = await fetchCanvasSnapshot(canvasId);
            apiSnapshot = result.snapshot;
            apiEndpoint = result.endpoint;
            apiRelationsEndpoint = result.relationsEndpoint;
            apiRelationsError = result.relationsError;
          } catch (error) {
            apiSnapshotError =
              error instanceof Error ? error.message : String(error);
            console.info("[TapNow Companion] canvas API unavailable", {
              error: apiSnapshotError
            });
          }
        }

        const apiNodeMap = new Map(
          (apiSnapshot?.nodes || [])
            .map((node) => [String(node.id || ""), node] as const)
            .filter(([id]) => Boolean(id))
        );
        const apiFocusRecord = nodeId
          ? apiNodeMap.get(nodeId) || null
          : null;
        const apiFocusInfo = apiFocusRecord
          ? toReviewNodeInfo(apiFocusRecord, sourceImageUrl)
          : null;
        const nodeType =
          apiFocusInfo?.nodeType ||
          domNodeType ||
          inferNodeTypeFromId(nodeId);
        const apiIncomingConnectionsUnordered = (apiSnapshot?.connections || [])
          .filter((connection) => String(connection.target || "") === nodeId)
          .map(toReviewConnectionInfo)
          .filter((connection): connection is ReviewConnectionInfo =>
            Boolean(connection)
          );
        const relationIncomingIds =
          (nodeId && apiSnapshot?.relations?.[nodeId]?.incoming) || [];
        const incomingRelationRank = new Map(
          relationIncomingIds.map((sourceId, index) => [sourceId, index] as const)
        );
        // The canvas endpoint keeps connection order stable. The relations
        // endpoint does not: its peer arrays can arrive in a different order
        // between identical requests, so it must not define Image N mapping.
        const apiIncomingConnections = apiIncomingConnectionsUnordered;
        const apiIncomingRecords = apiIncomingConnections
          .map((connection) => apiNodeMap.get(connection.source))
          .filter((node): node is TapNowApiNode => Boolean(node));
        const apiIncomingInfos = apiIncomingRecords
          .map((node) => toReviewNodeInfo(node, sourceImageUrl))
          .filter((node): node is ReviewNodeInfo => Boolean(node));
        const domConnectedNodes = incomingNodeIds(nodeId)
          .map((sourceId) => findNodeById(sourceId))
          .filter((node): node is Element => Boolean(node));
        const apiOutgoingConnectionsUnordered = (apiSnapshot?.connections || [])
          .filter((connection) => String(connection.source || "") === nodeId)
          .map(toReviewConnectionInfo)
          .filter((connection): connection is ReviewConnectionInfo =>
            Boolean(connection)
          );
        const apiOutgoingConnections = apiOutgoingConnectionsUnordered;
        const apiOutgoingRecords = apiOutgoingConnections
          .map((connection) => apiNodeMap.get(connection.target))
          .filter((node): node is TapNowApiNode => Boolean(node));
        const apiOutgoingInfos = apiOutgoingRecords
          .map((node) => toReviewNodeInfo(node, sourceImageUrl))
          .filter((node): node is ReviewNodeInfo => Boolean(node));
        const domOutgoingNodes = outgoingNodeIds(nodeId)
          .map((targetId) => findNodeById(targetId))
          .filter((node): node is Element => Boolean(node));
        const incomingCandidateInfos = [
          ...new Map(
            [
              ...domConnectedNodes
                .map(domNodeInfo)
                .filter((node): node is ReviewNodeInfo => Boolean(node)),
              ...apiIncomingInfos
            ].map((info) => [info.id, info] as const)
          ).values()
        ];
        const outgoingCandidateInfos = [
          ...new Map(
            [
              ...domOutgoingNodes
                .map(domNodeInfo)
                .filter((node): node is ReviewNodeInfo => Boolean(node)),
              ...apiOutgoingInfos
            ].map((info) => [info.id, info] as const)
          ).values()
        ];
        const domReferenceUrls = focusedReferenceUrls(nodeElement);
        const domReferenceOrder = domReferenceUrls.map(imageIdentity);
        const domReferenceRank = new Map(
          domReferenceOrder.map((key, index) => [key, index] as const)
        );
        const incomingInfos = [...incomingCandidateInfos].sort((left, right) => {
          const leftRank = Math.min(
            ...left.media.map((media) => domReferenceRank.get(
              imageIdentity(media.url)
            ) ?? Number.MAX_SAFE_INTEGER)
          );
          const rightRank = Math.min(
            ...right.media.map((media) => domReferenceRank.get(
              imageIdentity(media.url)
            ) ?? Number.MAX_SAFE_INTEGER)
          );
          const leftConnectionRank = apiIncomingConnections.findIndex(
            (connection) => connection.source === left.id
          );
          const rightConnectionRank = apiIncomingConnections.findIndex(
            (connection) => connection.source === right.id
          );
          const leftFallbackRank =
            leftConnectionRank >= 0
              ? leftConnectionRank
              : incomingRelationRank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
          const rightFallbackRank =
            rightConnectionRank >= 0
              ? rightConnectionRank
              : incomingRelationRank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
          return leftRank - rightRank || leftFallbackRank - rightFallbackRank;
        });
        const incomingNodeRank = new Map(
          incomingInfos.map((info, index) => [info.id, index] as const)
        );
        const incomingConnectionCandidates = [
          ...new Map(
            [
              ...apiIncomingConnections,
              ...domConnectionsFor(nodeId, "incoming")
            ].map((connection) => [connection.id, connection] as const)
          ).values()
        ];
        const incomingConnections = incomingConnectionCandidates.sort(
          (left, right) =>
            (incomingNodeRank.get(left.source) ?? Number.MAX_SAFE_INTEGER) -
            (incomingNodeRank.get(right.source) ?? Number.MAX_SAFE_INTEGER)
        );
        const outgoingNodes = [...outgoingCandidateInfos];
        const outgoingNodeRank = new Map(
          outgoingNodes.map((info, index) => [info.id, index] as const)
        );
        const outgoingConnectionCandidates = [
          ...new Map(
            [
              ...apiOutgoingConnections,
              ...domConnectionsFor(nodeId, "outgoing")
            ].map((connection) => [connection.id, connection] as const)
          ).values()
        ];
        const outgoingConnections = outgoingConnectionCandidates.sort(
          (left, right) =>
            (outgoingNodeRank.get(left.target) ?? Number.MAX_SAFE_INTEGER) -
            (outgoingNodeRank.get(right.target) ?? Number.MAX_SAFE_INTEGER)
        );
        const textMaterials: string[] = [];
        const textMaterialSources: NonNullable<
          ReviewDraft["textMaterialSources"]
        > = [];
        const addText = (
          value: string,
          source: { nodeId?: string | null; nodeType?: string | null; role?: string }
        ) => {
          const text = value.slice(0, MAX_REVIEW_TEXT_MATERIAL_ITEM_CHARS);
          if (!text || textMaterials.includes(text)) return;
          if (textMaterials.length >= MAX_REVIEW_TEXT_MATERIALS) return;
          textMaterials.push(text);
          textMaterialSources.push(source);
        };

        const apiPrompt = promptValue(apiFocusInfo?.prompt);
        const apiOutputText = apiFocusInfo?.text || "";
        const domCurrentPrompt =
          nodeType === "text" ? promptValue(currentNodeText) : "";
        const promptCandidates = [
          { source: "focused-node-input", value: fieldPrompt },
          { source: "tapnow-api.node.data.prompt", value: apiPrompt },
          {
            source: "tapnow-api.node.data.text",
            value: nodeType === "text" ? apiOutputText : ""
          },
          {
            source: "focused-node-dom",
            value: apiFocusInfo ? "" : domCurrentPrompt
          }
        ]
          .map((candidate) => ({
            ...candidate,
            selected: false,
            ignoredReason: candidate.value
              ? opaquePromptReason(candidate.value)
              : "该来源没有可用值。"
          }));
        const selectedPromptCandidate =
          promptCandidates.find(
            (candidate) => Boolean(candidate.value) && !candidate.ignoredReason
          ) || null;
        if (selectedPromptCandidate) selectedPromptCandidate.selected = true;
        const currentPrompt = selectedPromptCandidate?.value || "";
        for (const connectedInfo of incomingInfos) {
          if (connectedInfo.nodeType !== "text") continue;
          const connectedText = connectedInfo.text;
          if (!connectedText) continue;
          addText(connectedText, {
            nodeId: connectedInfo.id,
            nodeType: connectedInfo.nodeType,
            role: "upstream-node-output"
          });
        }
        if (!apiSnapshot) {
          for (const connectedNode of domConnectedNodes) {
            if (nodeTypeOf(connectedNode) !== "text") continue;
            const connectedText = nodeTextOf(connectedNode);
            if (!connectedText) continue;
            addText(connectedText, {
              nodeId: getNodeId(connectedNode),
              nodeType: nodeTypeOf(connectedNode),
              role: "upstream-node-output"
            });
          }
        }

        const prompt = (
          currentPrompt ||
          textMaterials[0] ||
          ""
        ).slice(0, MAX_REVIEW_PROMPT_CHARS);
        const promptSource = currentPrompt
          ? selectedPromptCandidate?.source || null
          : textMaterials[0]
            ? "direct-upstream-text-output"
            : null;
        const referenceSources: Array<{
          info: ReviewNodeInfo | null;
          url: string;
          alt?: string;
          width?: number | null;
          height?: number | null;
        }> = [];
        const addReferenceSource = (candidate: {
          info: ReviewNodeInfo | null;
          url: string;
          alt?: string;
          width?: number | null;
          height?: number | null;
        }) => {
          const url = sourceImageUrl(candidate.url).slice(0, 2_000);
          if (!/^https?:\/\//i.test(url)) return;
          const key = imageIdentity(url);
          if (referenceSources.some((source) => imageIdentity(source.url) === key)) {
            return;
          }
          referenceSources.push({ ...candidate, url });
        };
        if (domReferenceUrls.length) {
          for (const domUrl of domReferenceUrls) {
            const referenceKey = imageIdentity(domUrl);
            const matchingInfo =
              incomingInfos.find((info) =>
                info.media.some(
                  (media) => imageIdentity(media.url) === referenceKey
                )
              ) || null;
            const matchingMedia = matchingInfo?.media.find(
              (media) => imageIdentity(media.url) === referenceKey
            );
            addReferenceSource({
              info: matchingInfo,
              url: domUrl,
              alt: "referenceImage",
              width: matchingMedia?.width,
              height: matchingMedia?.height
            });
          }
        } else {
          for (const info of incomingInfos) {
            if (!info.media.length) continue;
            const media = info.media[0];
            addReferenceSource({
              info,
              url: media.url,
              alt: "referenceImage",
              width: media.width,
              height: media.height
            });
          }
        }
        if (!apiSnapshot) {
          for (const connectedNode of domConnectedNodes) {
            const image = [...connectedNode.querySelectorAll("img")]
              .filter(visible)
              .find(
                (candidate) =>
                  candidate.naturalWidth >= 64 && candidate.naturalHeight >= 64
              );
            if (!image) continue;
            addReferenceSource({
              info: domNodeInfo(connectedNode),
              url: image.currentSrc || image.src,
              alt: "referenceImage",
              width: image.naturalWidth,
              height: image.naturalHeight
            });
          }
        }

        const outputSources: Array<{
          url: string;
          alt?: string;
          width?: number | null;
          height?: number | null;
        }> = [];
        const addOutputSource = (candidate: {
          url: string;
          alt?: string;
          width?: number | null;
          height?: number | null;
        }) => {
          const url = sourceImageUrl(candidate.url).slice(0, 2_000);
          if (!/^https?:\/\//i.test(url)) return;
          if (outputSources.some((source) => imageIdentity(source.url) === imageIdentity(url))) {
            return;
          }
          outputSources.push({ ...candidate, url });
        };
        for (const media of apiFocusInfo?.media || []) {
          addOutputSource(media);
        }
        if (nodeElement) {
          for (const image of [...nodeElement.querySelectorAll("img")]) {
            // Video-node thumbnails and reference strips are not video outputs.
            if (nodeType === "video") continue;
            if (
              !visible(image) ||
              image.naturalWidth < 64 ||
              image.naturalHeight < 64 ||
              image.closest(
                "[data-testid='canvas-node-generation-input-bar']"
              )
            ) {
              continue;
            }
            addOutputSource({
              url: image.currentSrc || image.src,
              alt: image.alt,
              width: image.naturalWidth,
              height: image.naturalHeight
            });
          }
        }

        const imageMaterials: NonNullable<ReviewDraft["imageMaterials"]> = [];
        const videoMaterials: NonNullable<ReviewDraft["videoMaterials"]> = [];
        const seenImages = new Set<string>();
        const addImageMaterial = async (candidate: {
          url: string;
          alt?: string;
          width?: number | null;
          height?: number | null;
          sourceNodeId?: string | null;
          sourceNodeType?: string | null;
          sourceTitle?: string | null;
          role: string;
        }) => {
          const url = sourceImageUrl(candidate.url).slice(0, 2_000);
          if (isVideoMaterial(url, candidate.sourceNodeType)) {
            if (!videoMaterials.some(video => video.url === url) && videoMaterials.length < 8) {
              videoMaterials.push({ materialId: `video-${videoMaterials.length + 1}`, url,
                sourceNodeId: candidate.sourceNodeId,
                role: candidate.role === "focused-node-output" ? "focused-video-output-unbound" : "upstream-video-reference" });
            }
            return null;
          }
          if (imageMaterials.length >= MAX_REVIEW_IMAGE_MATERIALS) return null;
          const imageKey = imageIdentity(url);
          if (!/^https?:\/\//i.test(url) || seenImages.has(imageKey)) return null;
          seenImages.add(imageKey);
          const material: NonNullable<
            ReviewDraft["imageMaterials"]
          >[number] = {
            materialId: `image-${imageMaterials.length + 1}`,
            url,
            alt: (candidate.alt || "").slice(0, 300),
            width: candidate.width || null,
            height: candidate.height || null,
            sourceNodeId: candidate.sourceNodeId || null,
            sourceNodeType: candidate.sourceNodeType || null,
            sourceTitle: candidate.sourceTitle || null,
            role: candidate.role
          };
          if (includeImageData) {
            const captured = await captureImage(url);
            material.dataUrl = captured.dataUrl;
            material.captureSourceUrl = captured.sourceUrl;
            material.captureError = captured.error;
            material.compression = captured.compression;
          }
          imageMaterials.push(material);
          return material;
        };

        const referenceMaterialIds: Array<string | null> = [];
        for (const source of referenceSources) {
          const material = await addImageMaterial({
            url: source.url,
            alt: source.alt,
            width: source.width,
            height: source.height,
            sourceNodeId: source.info?.id,
            sourceNodeType: source.info?.nodeType,
            sourceTitle: source.info?.title,
            role: "upstream-reference"
          });
          referenceMaterialIds.push(material?.materialId || null);
        }
        for (const source of outputSources) {
          await addImageMaterial({
            ...source,
            sourceNodeId: nodeId,
            sourceNodeType: nodeType,
            sourceTitle: apiFocusInfo?.title,
            role: "focused-node-output"
          });
        }
        // A DOM image-reference strip can omit upstream video inputs entirely.
        for (const info of incomingInfos) {
          for (const media of info.media) {
            if (isVideoMaterial(media.url, info.nodeType)) await addImageMaterial({ ...media,
              sourceNodeId: info.id, sourceNodeType: info.nodeType, sourceTitle: info.title,
              role: "upstream-reference" });
          }
        }
        const referenceBindings = buildReferenceBindings(
          prompt,
          referenceSources
            .map((source) => source.info)
            .filter((info): info is ReviewNodeInfo => Boolean(info)),
          referenceMaterialIds
        );
        for (const binding of referenceBindings) {
          const material = imageMaterials.find(
            (candidate) => candidate.materialId === binding.materialId
          );
          if (material) {
            material.reference = binding.reference;
            material.referenceIndex = Number(
              binding.reference.match(/\d+/)?.[0] || 0
            );
          }
        }
        const referenceNumberByNodeId = new Map(
          referenceSources
            .map((source, index) => [source.info?.id, index + 1] as const)
            .filter(([id]) => Boolean(id))
        );
        const upstreamSummaryParts: string[] = [];
        for (const info of incomingInfos) {
          if (info.nodeType === "text" && info.text) {
            upstreamSummaryParts.push(
              `[上游文字 ${info.id}${info.title ? ` / ${info.title}` : ""}]\n${info.text}`
            );
            continue;
          }
          if (info.media.length) {
            if (info.media.some(media => isVideoMaterial(media.url, info.nodeType))) {
              upstreamSummaryParts.push(`[引用视频 ${info.id}${info.title ? ` / ${info.title}` : ""}]`);
              continue;
            }
            const referenceNumber = referenceNumberByNodeId.get(info.id);
            upstreamSummaryParts.push(
              `[引用图片${referenceNumber ? ` Image ${referenceNumber}` : ""} ${info.id}${info.title ? ` / ${info.title}` : ""}]`
            );
          }
        }

        return {
          canvasId,
          nodeId,
          nodeType,
          prompt,
          promptSource,
          promptCandidates,
          upstreamSummary: upstreamSummaryParts
            .join("\n\n")
            .slice(0, MAX_REVIEW_UPSTREAM_CHARS),
          textMaterials,
          textMaterialSources,
          imageMaterials,
          videoMaterials,
          nodeInfo: apiFocusInfo,
          incomingNodes: incomingInfos,
          incomingConnections,
          outgoingNodes,
          outgoingConnections,
          referenceBindings,
          snapshot: {
            source: apiFocusInfo ? "tapnow-api" : "focused-page-dom",
            endpoint: apiEndpoint || null,
            nodeCount: apiSnapshot?.nodes.length ?? null,
            connectionCount: apiSnapshot?.connections.length ?? null,
            referenceOrderSource: domReferenceOrder.length
              ? "focused-node-dom"
              : apiIncomingConnections.length
                ? "tapnow-api-connections"
                : relationIncomingIds.length
                  ? "tapnow-api-relations-fallback"
                  : apiSnapshot
                    ? "tapnow-api-connections"
                    : "dom-edge-order",
            relationsEndpoint: apiRelationsEndpoint || null,
            relationsError: apiRelationsError || null,
            error: apiSnapshotError || null
          },
          fieldCount: textMaterials.length,
          source: apiFocusInfo
            ? "focused-page-node+tapnow-api"
            : "focused-page-node"
        };
      }

      async function prepareDraftImages(
        draft: ReviewDraft
      ): Promise<ReviewDraft> {
        if (!draft.imageMaterials?.length) return draft;
        const imageMaterials = [];
        for (const image of draft.imageMaterials) {
          if (image.dataUrl) {
            imageMaterials.push(image);
            continue;
          }
          const captured = await captureImage(image.url);
          imageMaterials.push({
            ...image,
            dataUrl: captured.dataUrl,
            captureSourceUrl: captured.sourceUrl,
            captureError: captured.error,
            compression: captured.compression
          });
        }
        return { ...draft, imageMaterials };
      }

      function escapeHtml(value: unknown): string {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[character] as string);
      }

      function formatBytes(value: number): string {
        if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
        return `${(value / 1_000_000).toFixed(1)} MB`;
      }

      function render(
        draft: ReviewDraft,
        local: LocalReview,
        llm: LlmResponse["result"] | null = null,
        llmError = "",
        imagePreparationAttempted = false,
        llmCalled = false,
        requestDiagnostics: LlmRequestDiagnostics | null = null
      ) {
        const issues = [...local.issues, ...(llm?.issues || [])];
        const issueHtml = issues.length
          ? issues.map((issue) => `
              <div class="issue ${issue.severity}">
                <strong>${escapeHtml(issue.title)}</strong>
                <span>${escapeHtml(issue.detail)}</span>
              </div>`).join("")
          : `<div class="issue allow"><strong>未发现问题</strong><span>本地规则检查通过。</span></div>`;
        const suggestions = [...local.suggestions, ...(llm?.suggestions || [])];
        const suggestionsHtml = suggestions.length
          ? `<div class="label">建议</div>${[...new Set(suggestions)]
              .map((item) => `<div class="suggestion">• ${escapeHtml(item)}</div>`)
              .join("")}`
          : "";
        const llmHtml = llm
          ? `<div class="llm"><div class="label">LLM 审阅 · ${escapeHtml(llm.model)}</div><div class="context">${escapeHtml(llm.summary)}</div></div>`
          : llmError
            ? `<div class="llm"><div class="label">LLM 审阅</div><div class="issue"><strong>调用失败</strong><span>${escapeHtml(llmError)}</span></div></div>`
            : "";
        const imageCount = draft.imageMaterials?.length || 0;
        const referenceImageCount =
          draft.imageMaterials?.filter(
            (image) => image.role === "upstream-reference"
          ).length || 0;
        const outputImageCount =
          draft.imageMaterials?.filter(
            (image) => image.role === "focused-node-output"
          ).length || 0;
        const uploadable =
          draft.imageMaterials?.filter(
            (image) =>
              Boolean(image.dataUrl) && image.role !== "focused-node-output"
          ).length || 0;
        const selectedImageIds = new Set(
          selectPreparedImages(draft.imageMaterials || []).map(
            ({ image }) => image.materialId
          )
        );
        const payloadStats = reviewPayloadStats(
          draft,
          state.settings.llmIncludeImages
        );
        const captureErrors = [
          ...new Set(
            (draft.imageMaterials || [])
              .filter((image) => !image.dataUrl && image.captureError)
              .map((image) => image.captureError)
          )
        ];
        const materialSummary = state.settings.llmIncludeImages
          ? imagePreparationAttempted
            ? `文字 ${draft.textMaterials?.length || 0} 项 · 图片 ${imageCount} 项（引用 ${referenceImageCount}，产物 ${outputImageCount}） · 可发送图片 ${payloadStats.sentCount} 项 · ${formatBytes(payloadStats.sentImageBytes)}`
            : `文字 ${draft.textMaterials?.length || 0} 项 · 图片 ${imageCount} 项（引用 ${referenceImageCount}，产物 ${outputImageCount}） · 正在检查图片可发送性`
          : `文字 ${draft.textMaterials?.length || 0} 项 · 图片 ${imageCount} 项（引用 ${referenceImageCount}，产物 ${outputImageCount}） · 图片发送未开启`;
        const imageNotice = state.settings.llmIncludeImages
          ? requestDiagnostics?.phase === "started"
            ? `正在请求 LLM 审阅，已等待 ${Math.floor(
                (requestDiagnostics.durationMs || 0) / 1000
              )} 秒；请求仍在处理中。`
            : imagePreparationAttempted
            ? `${captureErrors.length ? captureErrors.join(" ") + " " : ""}图片仅在本地完成预检；点击“检测”才会按总请求预算发送。${payloadStats.omittedCount ? ` 有 ${payloadStats.omittedCount} 项因预算未发送。` : ""}`
            : "正在本地准备图片；此过程不会调用 LLM。"
          : "点击“检测”才会调用 LLM；当前未开启图片发送，只传图片元数据。";
        const videoNotice = draft.videoMaterials?.length ? `视频 ${draft.videoMaterials.length} 项 · ${state.settings.llmIncludeImages ? "采样画面与音轨" : "画面发送已关闭"}` : "";
        const debugInfo = {
          creativeMemory: draft.creativeMemory || { status: "not_requested", references: [] },
          canvasId: draft.canvasId || null,
          nodeId: draft.nodeId || null,
          nodeType: draft.nodeType || null,
          source: draft.source || null,
          prompt: draft.prompt || "",
          promptSource: draft.promptSource || null,
          promptCandidates: draft.promptCandidates || [],
          upstreamSummary: draft.upstreamSummary || "",
          textMaterials: draft.textMaterials || [],
          textMaterialSources: draft.textMaterialSources || [],
          nodeInfo: draft.nodeInfo || null,
          incomingNodes: draft.incomingNodes || [],
          incomingConnections: draft.incomingConnections || [],
          outgoingNodes: draft.outgoingNodes || [],
          outgoingConnections: draft.outgoingConnections || [],
          referenceBindings: draft.referenceBindings || [],
          snapshot: draft.snapshot || null,
          videos: (draft.videoMaterials || []).map(({frames, ...video}) => ({ ...video, frameCount: frames?.length || video.preparedFrameCount || 0 })),
          images: (draft.imageMaterials || []).map((image) => ({
            materialId: image.materialId || null,
            url: image.url,
            alt: image.alt || "",
            width: image.width || null,
            height: image.height || null,
            sourceNodeId: image.sourceNodeId || null,
            sourceNodeType: image.sourceNodeType || null,
            sourceTitle: image.sourceTitle || null,
            role: image.role || null,
            reference: image.reference || null,
            referenceIndex: image.referenceIndex || null,
            captureSourceUrl: image.captureSourceUrl || null,
            prepared: Boolean(image.dataUrl),
            selectedForRequest: selectedImageIds.has(image.materialId),
            preparedBytes: image.dataUrl
              ? Math.round((image.dataUrl.length * 3) / 4)
              : 0,
            compression: image.compression
              ? {
                  applied: image.compression.applied,
                  method: image.compression.method,
                  originalBytes: image.compression.originalBytes ?? null,
                  preparedBytes:
                    image.compression.preparedBytes ??
                    (image.dataUrl
                      ? Math.round((image.dataUrl.length * 3) / 4)
                      : null),
                  savedBytes:
                    image.compression.originalBytes != null &&
                    image.compression.preparedBytes != null
                      ? image.compression.originalBytes -
                        image.compression.preparedBytes
                      : null,
                  ratio:
                    image.compression.originalBytes &&
                    image.compression.preparedBytes
                      ? Number(
                          (
                            image.compression.preparedBytes /
                            image.compression.originalBytes
                          ).toFixed(4)
                        )
                      : null
                }
              : null,
            captureError: image.captureError || null
          })),
          settings: {
            llmEnabled: state.settings.llmEnabled,
            llmIncludeImages: state.settings.llmIncludeImages,
            llmProtocol: state.settings.llmProtocol,
            llmModel: state.settings.llmModel,
            llmPrompt: state.settings.llmPrompt
          },
          request: {
            called: llmCalled,
            endpoint:
              state.settings.llmProtocol === "responses"
                ? `${state.settings.llmBaseUrl}/responses`
                : `${state.settings.llmBaseUrl}/chat/completions`,
            preparedImagesAvailable: uploadable,
            preparedImagesSent: payloadStats.sentCount,
            omittedImages: payloadStats.omittedCount,
            imageBytesSent: payloadStats.sentImageBytes,
            textCharsSource: payloadStats.sourceTextChars,
            textCharsIncluded: payloadStats.includedTextChars,
            textCharsOmitted: payloadStats.omittedTextChars,
            requestBytes: llm?.requestStats?.requestBytes ||
              requestDiagnostics?.requestBytes ||
              null,
            clientRequestId: requestDiagnostics?.clientRequestId || null,
            responseRequestId: requestDiagnostics?.responseRequestId || null,
            ...(requestDiagnostics || {})
          },
          llm: llm
            ? {
              called: llmCalled,
                model: llm.model,
                decision: llm.decision,
                summary: llm.summary,
                issues: llm.issues,
                suggestions: llm.suggestions,
                requestStats: llm.requestStats || null
              }
            : {
                called: llmCalled,
                error: llmError || null,
                diagnostics: requestDiagnostics
              }
        };

        body.innerHTML = `
          <div class="meta">画布：${escapeHtml(draft.canvasId || "未识别")}<br>节点：${escapeHtml(draft.nodeId || "未识别")}<br>来源：${escapeHtml(draft.source || "页面")}</div>
          <div class="label">当前输入</div>
          <div class="prompt">${escapeHtml(draft.prompt || "未检测到当前节点文字输入")}</div>
          <div class="label">节点上下文</div>
          <div class="context">${escapeHtml(draft.upstreamSummary || "未检测到可见上下文")}</div>
          <div class="label">素材</div>
          <div class="materials">${materialSummary}</div>
          ${videoNotice ? `<div class="notice">${escapeHtml(videoNotice)}</div>` : ""}
          <div class="label">检查结果</div>
          ${issueHtml}
          ${llmHtml}
          ${creativeMemoryMarkup(draft.creativeMemory)}
          ${suggestionsHtml}
          <div class="notice">${imageNotice}</div>
          <details class="debug">
            <summary>开发者信息</summary>
            <pre>${escapeHtml(JSON.stringify(debugInfo, null, 2))}</pre>
          </details>
        `;
        console.info("[TapNow Companion] panel", debugInfo);
      }

      async function sendLlmReview(
        draft: ReviewDraft,
        clientRequestId: string
      ): Promise<LlmResponse> {
        const timeoutMs = LLM_REQUEST_TIMEOUT_MS + (draft.videoMaterials?.length ? 235_000 : 53_000);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            browser.runtime.sendMessage({
              type: "tapnow:llm-review",
              draft,
              clientRequestId
            }) as Promise<LlmResponse>,
            new Promise<LlmResponse>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`LLM 请求超过 ${(timeoutMs / 1000).toFixed(0)} 秒，已停止等待。`)),
                timeoutMs
              );
            })
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      function startedDiagnostics(): LlmRequestDiagnostics {
        return {
          phase: "started",
          endpoint:
            state.settings.llmProtocol === "responses"
              ? `${state.settings.llmBaseUrl}/responses`
              : `${state.settings.llmBaseUrl}/chat/completions`,
          protocol: state.settings.llmProtocol,
          model: state.settings.llmModel,
          startedAt: new Date().toISOString(),
          durationMs: 0,
          attempts: 0,
          responseStatus: null,
          responseContentType: null,
          responseBytes: 0,
          requestBytes: 0
        };
      }

      function clamp(value: number, minimum: number, maximum: number): number {
        return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
      }

      function applyLauncherPosition(left: number, top: number) {
        const rect = dock.getBoundingClientRect();
        dock.style.left = `${clamp(
          left,
          8,
          window.innerWidth - rect.width - 8
        )}px`;
        dock.style.top = `${clamp(
          top,
          8,
          window.innerHeight - rect.height - 8
        )}px`;
        dock.style.right = "auto";
        dock.style.bottom = "auto";
      }

      async function openPanel() {
        updateRoute();
        const sequence = ++state.reviewSequence;
        const canvas = companionRoute(location.href).canvasId;
        const draft = await getDraft(false);
        if (sequence !== state.reviewSequence || canvas !== companionRoute(location.href).canvasId) return;
        state.lastDraft = draft;
        console.info("[TapNow Companion] local draft", {
          ...draft,
          imageMaterials: (draft.imageMaterials || []).map((image) => ({
            ...image,
            dataUrl: image.dataUrl ? `[${image.dataUrl.length} chars]` : undefined
          }))
        });
        panel.classList.remove("hidden");
        render(draft, reviewDraft(draft, state.settings));
        if (
          state.settings.llmIncludeImages &&
          (draft.imageMaterials?.length || 0) > 0
        ) {
          const preparedDraft = await prepareDraftImages(draft);
          if (
            sequence === state.reviewSequence &&
            !panel.classList.contains("hidden")
          ) {
            state.lastDraft = preparedDraft;
            render(
              preparedDraft,
              reviewDraft(preparedDraft, state.settings),
              null,
              "",
              true
            );
          }
        }
      }

      async function detect() {
        detectButton.disabled = true;
        const sequence = ++state.reviewSequence;
        const canvas = companionRoute(location.href).canvasId;
        const prepareImages = state.settings.llmIncludeImages;
        const baseDraft = await getDraft(false);
        const draft = prepareImages
          ? await prepareDraftImages(baseDraft)
          : baseDraft;
        if (sequence !== state.reviewSequence || canvas !== companionRoute(location.href).canvasId) {
          detectButton.disabled = false;
          return;
        }
        state.lastDraft = draft;
        const local = reviewDraft(draft, state.settings);
        console.info("[TapNow Companion] detect request", {
          draft: {
            ...draft,
            imageMaterials: (draft.imageMaterials || []).map((image) => ({
              ...image,
              dataUrl: image.dataUrl ? `[${image.dataUrl.length} chars]` : undefined
            }))
          },
          local
        });
        panel.classList.remove("hidden");
        render(draft, local, null, "", prepareImages);
        if (!state.settings.llmEnabled) {
          render(
            draft,
            local,
            null,
            "LLM 审阅未启用，请在扩展 popup 中开启。",
            prepareImages
          );
          detectButton.disabled = false;
          return;
        }
        body.insertAdjacentHTML(
          "beforeend",
          `<div class="notice">正在请求 LLM 审阅...</div>`
        );
        const started = startedDiagnostics();
        render(draft, local, null, "", prepareImages, false, started);
        const clientRequestId = crypto.randomUUID();
        const refreshPendingState = () => {
          if (sequence !== state.reviewSequence) return;
          render(
            draft,
            local,
            null,
            "",
            prepareImages,
            false,
            {
              ...started,
              clientRequestId,
              durationMs:
                Date.now() - new Date(started.startedAt).getTime()
            }
          );
        };
        state.pendingTimer = setInterval(refreshPendingState, 1_000);
        try {
          const response = await sendLlmReview(draft, clientRequestId);
          if (response?.creativeMemory) draft.creativeMemory = parseCreativeMemory(response.creativeMemory);
          if (Array.isArray(response?.videoEvidence)) {
            for (const video of draft.videoMaterials || []) {
              const evidence = response.videoEvidence.find((item: any) => item.materialId === video.materialId && item.url === video.url);
              if (evidence) Object.assign(video, { audio: evidence.audio, error: evidence.error,
                omittedFrames: evidence.omittedFrames, preparedFrameCount: evidence.frameCount,
                sampledTimestamps: evidence.sampledTimestamps });
            }
          }
          const current = await getDraft(false);
          if (current.nodeId !== draft.nodeId || current.canvasId !== draft.canvasId ||
              current.prompt !== draft.prompt || JSON.stringify(current.referenceBindings) !== JSON.stringify(draft.referenceBindings) ||
              JSON.stringify(current.imageMaterials?.map(i => i.url)) !== JSON.stringify(draft.imageMaterials?.map(i => i.url)) ||
              videoDraftIdentity(current) !== videoDraftIdentity(draft)) {
            if (sequence === state.reviewSequence) render(current, reviewDraft(current, state.settings), null, "输入或素材已变化，请重新审阅。", false);
            return;
          }
          const responseDiagnostics =
            response?.diagnostics ||
            (response?.result?.requestStats
              ? {
                  ...response.result.requestStats,
                  phase: "completed" as const,
                  timedOut: false
                }
              : null);
          if (sequence === state.reviewSequence) {
            render(
              draft,
              local,
              response?.ok ? response.result || null : null,
              response?.error || "",
              prepareImages,
              true,
              responseDiagnostics
            );
            console.info("[TapNow Companion] LLM result", response);
          }
        } catch (error) {
          if (sequence === state.reviewSequence) {
            render(
              draft,
              local,
              null,
              error instanceof Error ? error.message : String(error),
              prepareImages,
              true,
              {
                ...started,
                phase: /超过 \d+ 秒|超时/i.test(
                  error instanceof Error ? error.message : String(error)
                )
                  ? "timeout"
                  : "failed",
                durationMs: Date.now() -
                  new Date(started.startedAt).getTime(),
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
                timedOut: /超时|超过/i.test(
                  error instanceof Error ? error.message : String(error)
                )
              }
            );
          }
        } finally {
          if (state.pendingTimer) {
            clearInterval(state.pendingTimer);
            state.pendingTimer = null;
          }
          detectButton.disabled = false;
        }
      }

      function closePanel() {
        panel.classList.add("hidden");
        state.reviewSequence++;
        if (state.pendingTimer) {
          clearInterval(state.pendingTimer);
          state.pendingTimer = null;
        }
      }

      function loadLauncherPosition() {
        void browser.storage.local.get({ companionDockPosition: null }).then((value) => {
          const position = value.companionDockPosition as {
            left?: number;
            top?: number;
          } | null;
          if (typeof position?.left === "number" && typeof position?.top === "number") {
            applyLauncherPosition(position.left, position.top);
          }
        });
      }

      grip.addEventListener("pointerdown", (event) => {
        state.dragging = true;
        state.movedDuringDrag = false;
        state.dragStartX = event.clientX;
        state.dragStartY = event.clientY;
        const rect = dock.getBoundingClientRect();
        state.dragOriginLeft = rect.left;
        state.dragOriginTop = rect.top;
        grip.classList.add("dragging");
        grip.setPointerCapture(event.pointerId);
      });
      grip.addEventListener("pointermove", (event) => {
        if (!state.dragging) return;
        const deltaX = event.clientX - state.dragStartX;
        const deltaY = event.clientY - state.dragStartY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 4) state.movedDuringDrag = true;
        applyLauncherPosition(
          state.dragOriginLeft + deltaX,
          state.dragOriginTop + deltaY
        );
      });
      grip.addEventListener("pointerup", (event) => {
        if (!state.dragging) return;
        state.dragging = false;
        grip.classList.remove("dragging");
        grip.releasePointerCapture(event.pointerId);
        if (state.movedDuringDrag) {
          const rect = dock.getBoundingClientRect();
          void browser.storage.local.set({
            companionDockPosition: { left: rect.left, top: rect.top }
          });
        }
      });
      launcher.addEventListener("click", () => {
        if (state.suppressNextClick) {
          state.suppressNextClick = false;
          return;
        }
        void openPanel();
      });
      close.addEventListener("click", closePanel);
      closeAction.addEventListener("click", closePanel);
      resetPosition.onclick = () => { dock.removeAttribute("style"); void browser.storage.local.remove("companionDockPosition"); };
      window.addEventListener("resize", () => {
        const rect = dock.getBoundingClientRect();
        applyLauncherPosition(rect.left, rect.top);
      }, { signal: lifecycle.signal });
      let lastRoute = "";
      updateRoute = (url = location.href) => {
        const { canvasId: canvas, workspace } = companionRoute(url);
        const route = `${new URL(url).pathname}:${canvas || ""}`;
        if (route !== lastRoute) {
          lastRoute = route;
          closePanel();
          state.activeField = null;
          state.activeNode = null;
          state.activeNodeId = null;
          state.lastDraft = null;
          state.reviewSequence++;
          launcher.disabled = !canvas;
          launcher.title = canvas ? "审阅当前聚焦节点" : "进入具体画布后可使用副驾驶";
          host.style.display = workspace ? "" : "none";
        }
      };
      updateRoute();
      detectButton.addEventListener("click", () => void detect());

      document.addEventListener("focusin", (event) => {
        rememberActive(event.target as Element | null);
      }, { capture: true, signal: lifecycle.signal });
      document.addEventListener("pointerdown", (event) => {
        rememberActive(event.target as Element | null);
      }, { capture: true, signal: lifecycle.signal });

      void loadCompanionSettings(browser.storage).then(({ settings }) => {
        state.settings = settings;
        launcher.hidden = !state.settings.enabled;
      });
      loadLauncherPosition();
    };

    mount();
    ctx.addEventListener(window, "wxt:locationchange", event => updateRoute(event.newUrl.href));
    ctx.onInvalidated(() => disposeMount());
    ctx.setInterval(mount, 1000);
  }
});

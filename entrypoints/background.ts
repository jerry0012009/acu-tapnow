import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { loadCompanionSettings } from "../utils/companion-settings";
import { LlmRequestError, reviewWithLlm } from "../utils/llm";
import { MAX_SINGLE_IMAGE_BYTES } from "../utils/limits";
import { messageListener } from "../utils/messages";
import { TAPNOW_INTERNATIONAL_ORIGIN, tapnowOrigin } from "../utils/tapnow-site";
import { prepareVideoMaterials } from "../utils/video";
import { normalizeAcuEndpoint } from "../utils/acu-endpoint";
import { parseCreativeMemory } from "../utils/creative-memory";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function compressImage(
  bytes: Uint8Array,
  contentType: string
): Promise<{ bytes: Uint8Array; method: string } | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([bytes.buffer], { type: contentType })
    );
    const maxDimension = 2048;
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height)
    );
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale))
    );
    canvas.getContext("2d")?.drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height
    );
    bitmap.close();
    for (const quality of [0.82, 0.68, 0.52]) {
      const output = await canvas.convertToBlob({
        type: "image/jpeg",
        quality
      });
      if (output.size <= MAX_SINGLE_IMAGE_BYTES) {
        return {
          bytes: new Uint8Array(await output.arrayBuffer()),
          method: `offscreen-canvas-jpeg-${maxDimension}`
        };
      }
    }
  } catch {
    // Some browsers cannot decode or re-encode a remote media format in a worker.
  }
  return null;
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") void browser.tabs.create({ url: browser.runtime.getURL("/connect.html") });
  });
  browser.runtime.onMessage.addListener(messageListener<Browser.runtime.MessageSender>([
    "tapnow:capture-image", "tapnow:llm-review"
  ], async (message, sender) => {
    if (message?.type === "tapnow:capture-image") {
      try {
        const source = new URL(String(message.url || ""));
        if (
          source.protocol !== "https:" || !(
            tapnowOrigin(source) ||
            source.hostname.endsWith(".tapnow.media") ||
            source.hostname.endsWith(".tapnow.top")
          )
        ) {
          return { ok: false, error: "图片来源域名不在允许范围内。" };
        }
        const candidates = [source];
        if (source.hostname === "files.tapnow.top") {
          const mediaSource = new URL(source.toString());
          mediaSource.hostname = "files.tapnow.media";
          candidates.push(mediaSource);
        }
        let response: Response | null = null;
        let sourceUrl = source.toString();
        let lastError = "";
        for (const candidate of candidates) {
          sourceUrl = candidate.toString();
          try {
            const candidateResponse = await fetch(candidate, {
              headers: { Referer: `${tapnowOrigin(sender.url) || TAPNOW_INTERNATIONAL_ORIGIN}/` }
            });
            if (candidateResponse.ok) {
              response = candidateResponse;
              break;
            }
            lastError = `图片请求失败 HTTP ${candidateResponse.status}`;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
        }
        if (!response) {
          return { ok: false, error: lastError || "图片请求失败。" };
        }
        const contentType = response.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          return { ok: false, error: "媒体响应不是图片。" };
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > MAX_SINGLE_IMAGE_BYTES) {
          const compressed = await compressImage(bytes, contentType);
          if (!compressed) {
            return {
            ok: false,
            error: `原图超过 ${MAX_SINGLE_IMAGE_BYTES / 1_000_000} MB，压缩后仍无法控制在发送上限内。`
            };
          }
          return {
            ok: true,
            sourceUrl,
            dataUrl: `data:image/jpeg;base64,${bytesToBase64(compressed.bytes)}`,
            compression: {
              applied: true,
              method: compressed.method,
              originalBytes: bytes.length,
              preparedBytes: compressed.bytes.length
            }
          };
        }
        return {
          ok: true,
          sourceUrl,
          dataUrl: `data:${contentType.split(";")[0]};base64,${bytesToBase64(bytes)}`,
          compression: {
            applied: false,
            method: "original",
            originalBytes: bytes.length,
            preparedBytes: bytes.length
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    if (message?.type !== "tapnow:llm-review") return undefined;

    const { settings, apiKey } = await loadCompanionSettings(browser.storage);
    if (!settings.llmEnabled) {
      return { ok: false, error: "LLM 审阅未启用。" };
    }

    let draft = message.draft;
    try {
      if (draft.videoMaterials?.length && settings.llmIncludeImages) {
        draft = await prepareVideoMaterials(draft, browser.runtime, {
          baseUrl: settings.llmBaseUrl, apiKey, model: "gemini-3.5-flash-lite"
        });
      }
      let memoryBase = "";
      try { memoryBase = normalizeAcuEndpoint(settings.llmBaseUrl); } catch { /* Non-ACU providers do not have ACU memory. */ }
      if (memoryBase) {
        try {
          const response = await fetch(`${memoryBase.replace(/\/$/, "")}/private-acu/creative-assist`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(48_000),
            body: JSON.stringify({ mode: "review", prompt: String(draft.prompt || ""),
              context: JSON.stringify({ canvasId: draft.canvasId, nodeId: draft.nodeId,
                upstream: draft.upstreamSummary, referenceBindings: draft.referenceBindings }).slice(0, 60_000) })
          });
          if (!response.ok) throw new Error("Creative memory unavailable");
          const memory = await response.json();
          draft = { ...draft, creativeMemory: parseCreativeMemory(memory) };
        } catch {
          draft = { ...draft, creativeMemory: { status: "unavailable", supplement: "", references: [] } };
        }
      }
      const result = await reviewWithLlm(draft, {
        apiKey,
        includeImages: settings.llmIncludeImages,
        prompt: settings.llmPrompt,
        protocol: settings.llmProtocol,
        model: settings.llmModel,
        baseUrl: settings.llmBaseUrl
      }, {
        clientRequestId: String(message.clientRequestId || "")
      });
      for (const video of draft.videoMaterials || []) {
        if (video.error) result.suggestions.push(`${video.materialId} 未读取：${video.error}`);
        if (video.omittedFrames) result.suggestions.push(`${video.materialId} 有 ${video.omittedFrames} 张采样帧因本地传输预算未发送。`);
        if (video.audio?.status === "no_audio") result.suggestions.push(`${video.materialId} 没有音轨。`);
        else if (!video.audio?.analyzed) result.suggestions.push(`${video.materialId} 音频未完整分析：${video.audio?.error || video.audio?.status || "未取得音频证据"}`);
      }
      if (draft.videoMaterials?.length) result.suggestions.push(settings.llmIncludeImages
        ? "视频视觉评价仅依据已发送的采样画面；声音评价以各视频返回的音频证据为准，不包含精确口型或音画同步检测。"
        : "视频画面发送已关闭，本次没有进行视频视觉评价。");
      return { ok: true, result, creativeMemory: draft.creativeMemory, videoEvidence: (draft.videoMaterials || []).map(({ frames, observations, ...video }) => ({
        ...video, frameCount: frames?.length || 0,
        sampledTimestamps: (frames || []).map(frame => frame.timestamp)
      })) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        creativeMemory: draft.creativeMemory,
        diagnostics:
          error instanceof LlmRequestError ? error.diagnostics : undefined
      };
    }
  }));
});

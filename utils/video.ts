import type { ReviewDraft } from "./reviewer";

export function isVideoMaterial(url: string, nodeType?: string | null): boolean {
  try {
    const path = new URL(url).pathname;
    if (/\.(png|jpg|jpeg|webp|gif|avif)$/i.test(path)) return false;
    return nodeType?.toLowerCase() === "video" || /\.(mov|mp4|m4v|webm|mkv|avi)$/i.test(path);
  }
  catch { return false; }
}

export function videoDraftIdentity(draft: ReviewDraft): string {
  return JSON.stringify((draft.videoMaterials || []).map(v => [v.url, v.sourceNodeId, v.role]));
}

interface NativeVideoAPI {
  getManifest(): { version: string };
  sendNativeMessage(host: string, message: unknown): Promise<any>;
}

export async function prepareVideoMaterials(draft: ReviewDraft, runtime: NativeVideoAPI,
  audio?: { baseUrl: string; apiKey: string; model: string }): Promise<ReviewDraft> {
  const videos: NonNullable<ReviewDraft["videoMaterials"]> = [];
  const deadline = Date.now() + (audio ? 180_000 : 90_000);
  for (const [index, video] of (draft.videoMaterials || []).entries()) {
    const current = { ...video, frames: [] as NonNullable<typeof video.frames> };
    videos.push(current);
    if (index >= 3) { current.error = "本次最多读取三个视频，其余视频未分析"; continue; }
    if (Date.now() >= deadline) { current.error = "视频读取时间预算已用尽，本项未分析"; continue; }
    try {
      const source = new URL(video.url);
      if (source.protocol !== "https:" || source.port || source.username || source.password ||
          !["files.tapnow.media", "files.tapnow.top"].includes(source.hostname)) throw new Error("视频来源不在 TapNow 素材域名内");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const reply = await Promise.race([
        runtime.sendNativeMessage("com.acucompute.video", {
          action: "video-frames", version: runtime.getManifest().version, url: source.toString(),
          ...(audio ? { audio } : {})
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("视频读取超时，请重试")), Math.max(1, deadline - Date.now())); })
      ]).finally(() => clearTimeout(timer));
      if (!reply?.ok || !Array.isArray(reply.content)) throw new Error(reply?.error || "视频读取失败");
      current.omittedFrames = Number(reply.omitted) || 0;
      current.audio = reply.audio && typeof reply.audio.status === "string"
        ? reply.audio : { status: "not_analyzed", analyzed: false };
      let timestamp = "unknown";
      const observations: string[] = [];
      let budget = 800_000;
      for (const part of reply.content) {
        if (part.type === "text" && typeof part.text === "string") {
          const match = part.text.match(/^### Frame at (\d{2}:\d{2}:\d{2})$/);
          if (match) timestamp = match[1];
          else observations.push(part.text.slice(0, 12_000));
        }
        if (part.type === "image" && part.mimeType === "image/jpeg" && typeof part.data === "string" &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(part.data) && part.data.length <= budget && current.frames.length < 12) {
          current.frames.push({ timestamp, dataUrl: `data:image/jpeg;base64,${part.data}` });
          budget -= part.data.length;
        }
      }
      current.observations = observations.join("\n").slice(0, 16_000);
      if (!current.frames.length) throw new Error("未取得视频画面，不能进行视觉评价");
    } catch (error) {
      current.error = error instanceof Error ? error.message : String(error);
    }
  }
  return { ...draft, videoMaterials: videos };
}

export function videoFrameImages(draft: ReviewDraft): NonNullable<ReviewDraft["imageMaterials"]> {
  return (draft.videoMaterials || []).flatMap(video => (video.frames || []).map((frame, i) => ({
    materialId: `${video.materialId}-frame-${i + 1}`,
    url: video.url,
    dataUrl: frame.dataUrl,
    sourceNodeId: video.sourceNodeId,
    role: "video-frame",
    alt: `${video.materialId} at ${frame.timestamp}; ${video.role}; sampled visual frame`,
    reference: `${video.materialId} @ ${frame.timestamp}`
  })));
}

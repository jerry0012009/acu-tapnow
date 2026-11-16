import { companionRoute } from "../tapnow-route";

export const TAPNOW_ORIGIN = "https://app.tapnow.ai";
export function canvasIdFromUrl(value?: string | null): string | null {
  return companionRoute(value || "").canvasId;
}
export function isTapNowWorkspace(value?: string | null): boolean {
  return companionRoute(value || "").workspace;
}
export function sourceMatches(tab: { id?: number; url?: string }, tabId: number, canvasId: string) {
  return tab.id === tabId && canvasIdFromUrl(tab.url) === canvasId;
}
export function backupPageQuery(tab?: { id?: number; url?: string }) {
  const query = new URLSearchParams();
  const id = canvasIdFromUrl(tab?.url);
  if (tab?.id && id) { query.set("sourceTab", String(tab.id)); query.set("canvasId", id); }
  else if (isTapNowWorkspace(tab?.url)) query.set("from", "projects");
  return query.toString();
}

import { companionRoute } from "../tapnow-route";
import { tapnowOrigin } from "../tapnow-site";

export type BackupSource = { tabId: number; canvasId: string; origin: string };

export function canvasIdFromUrl(value?: string | null): string | null {
  return companionRoute(value || "").canvasId;
}
export function isTapNowWorkspace(value?: string | null): boolean {
  return companionRoute(value || "").workspace;
}
export function backupSource(tab?: { id?: number; url?: string }): BackupSource | null {
  const origin = tapnowOrigin(tab?.url);
  const canvasId = canvasIdFromUrl(tab?.url);
  return tab?.id && origin && canvasId ? { tabId: tab.id, canvasId, origin } : null;
}
export function sourceMatches(tab: { id?: number; url?: string }, expected: BackupSource) {
  const source = backupSource(tab);
  return source !== null && source.tabId === expected.tabId && source.canvasId === expected.canvasId && source.origin === expected.origin;
}
export function backupPageQuery(tab?: { id?: number; url?: string }) {
  const source = backupSource(tab);
  if (source) return new URLSearchParams({ sourceTab: String(source.tabId), canvasId: source.canvasId, sourceOrigin: source.origin }).toString();
  return isTapNowWorkspace(tab?.url) ? "from=projects" : "";
}

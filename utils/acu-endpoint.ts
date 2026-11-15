export function normalizeAcuEndpoint(raw: string): string {
  const url = new URL(raw.trim());
  const host = url.hostname;
  const official = host === "acu.best" || host.endsWith(".acu.best") ||
    host === "acucompute.com" || host.endsWith(".acucompute.com");
  const path = url.pathname.replace(/\/+$/, "");
  if (!official || url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      !["", "/v1", "/acu", "/acu/v1"].includes(path)) {
    throw new Error("ACU 地址无效");
  }
  url.pathname = path.endsWith("/v1") ? path : path + "/v1";
  return url.toString();
}

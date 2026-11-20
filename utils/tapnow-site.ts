export const TAPNOW_INTERNATIONAL_ORIGIN = "https://app.tapnow.ai";
export const TAPNOW_DOMESTIC_ORIGIN = "https://app.tapnow.media";
const TAPNOW_ORIGINS = [TAPNOW_INTERNATIONAL_ORIGIN, TAPNOW_DOMESTIC_ORIGIN];
export const TAPNOW_MATCHES = TAPNOW_ORIGINS.map(origin => `${origin}/*`);

export function tapnowOrigin(value?: string | URL | null): string | null {
  try {
    const url = value instanceof URL ? value : new URL(value || "");
    return url.protocol === "https:" && !url.username && !url.password && TAPNOW_ORIGINS.includes(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

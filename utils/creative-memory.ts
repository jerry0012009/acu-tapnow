export interface CreativeMemory {
  status: string;
  supplement: string;
  references: Array<{ id: string; name: string; quote: string; application?: string; scope?: string }>;
}

export function parseCreativeMemory(value: unknown): CreativeMemory {
  if (!value || typeof value !== "object") return { status: "unavailable", supplement: "", references: [] };
  const row = value as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "unavailable";
  const references: CreativeMemory["references"] = [];
  if (status === "ready" && Array.isArray(row.references)) {
    for (const value of row.references) {
      if (!value || typeof value !== "object") continue;
      const ref = value as Record<string, unknown>;
      if (typeof ref.id !== "string" || typeof ref.name !== "string" || typeof ref.quote !== "string" || !ref.quote.trim()) continue;
      references.push({ id: ref.id.slice(0, 300), name: ref.name.slice(0, 300), quote: ref.quote.slice(0, 6000),
        ...(typeof ref.application === "string" ? { application: ref.application.slice(0, 1000) } : {}),
        ...(typeof ref.scope === "string" ? { scope: ref.scope.slice(0, 100) } : {}) });
      if (references.length === 6) break;
    }
  }
  return { status, supplement: typeof row.supplement === "string" ? row.supplement.slice(0, 2000) : "", references };
}

export function creativeMemoryMarkup(memory: CreativeMemory | undefined): string {
  if (memory?.status !== "ready" || !memory.references.length) return "";
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const scopes: Record<string, string> = { personal: "个人偏好", user: "个人偏好", team: "团队经验", project: "项目经验" };
  return `<details class="memory-evidence"><summary>偏好与经验依据 <span>${Math.min(memory.references.length, 5)} 条</span></summary><ol>${memory.references.slice(0, 5).map(ref => `<li><strong>${escape(ref.name || "历史经验")}</strong>${ref.scope ? `<small>${escape(scopes[ref.scope] || ref.scope)}</small>` : ""}<blockquote>${escape(ref.quote)}</blockquote>${ref.application ? `<p>${escape(ref.application)}</p>` : ""}</li>`).join("")}</ol></details>`;
}

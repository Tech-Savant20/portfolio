export interface ServiceStatus {
  name: string;
  server: string;
  up: boolean;
}

export interface StatusPayload {
  available: boolean;
  updatedAt?: string;
  ageSeconds?: number;
  summary?: { up: number; total: number };
  services?: ServiceStatus[];
  /** Each server that pushes, and how old its latest report is. */
  sources?: { source: string; ageSeconds: number }[];
}

/** The name the push script gives a server's own reachability check. */
export const HOST = "Host";

const SERVER_NAMES: Record<string, string> = { jarvis: "Jarvis", "vault-server": "vault-server", "oracle-1": "oracle-1" };
export const serverName = (id: string) => SERVER_NAMES[id] ?? id;
const label = (s: ServiceStatus) => (s.name === HOST ? serverName(s.server) : s.name);

/** After this long without a push, the numbers are shown as a past report. */
const STALE_AFTER_S = 10 * 60;

export async function fetchStatus(signal?: AbortSignal): Promise<StatusPayload> {
  try {
    const res = await fetch("/api/status", { signal, headers: { accept: "application/json" } });
    if (!res.ok) return { available: false };
    const data = (await res.json()) as StatusPayload;
    return data && typeof data === "object" ? data : { available: false };
  } catch {
    return { available: false };
  }
}

const ago = (seconds: number) => {
  if (seconds < 90) return "a minute ago";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
};

export type StatusState = "loading" | "live" | "degraded" | "stale" | "offline";

export function describe(p: StatusPayload): { state: StatusState; main: string; sub: string } {
  if (!p.available || !p.summary || p.summary.total === 0) {
    return {
      state: "offline",
      main: "Live status isn't reachable right now",
      sub: "The map shows the setup; the numbers come back when it does.",
    };
  }
  const { up, total } = p.summary;
  const age = p.ageSeconds ?? 0;
  if (age > STALE_AFTER_S) {
    return {
      state: "stale",
      main: `Last report ${ago(age)}`,
      sub: `${up} of ${total} monitored services were up then.`,
    };
  }
  const services = p.services ?? [];
  const hostsDown = services.filter((s) => s.name === HOST && !s.up).map(label);
  const down = services.filter((s) => !s.up && s.name !== HOST).map(label);
  if (hostsDown.length) {
    return {
      state: "degraded",
      main: `${hostsDown.join(" and ")} ${hostsDown.length === 1 ? "is" : "are"} offline`,
      sub: `${up} of ${total} checks up${down.length ? `; also down: ${down.slice(0, 3).join(", ")}` : ""}. Updated ${ago(age)}.`,
    };
  }
  if (up < total) {
    return {
      state: "degraded",
      main: `${up} of ${total} checks up`,
      sub: `Down: ${down.slice(0, 3).join(", ") || "unknown"}. Updated ${ago(age)}.`,
    };
  }
  const hosts = services.filter((s) => s.name === HOST).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return {
    state: "live",
    main: hosts ? `All ${plural(hosts, "server")} and ${plural(total - hosts, "service")} up` : `All ${total} monitored services up`,
    sub: `Live from Uptime Kuma, updated ${ago(age)}.`,
  };
}

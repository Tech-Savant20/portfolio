export type ServerId = "jarvis" | "oracle-1" | "vault-server" | "laptop";

export interface Service {
  name: string;
  purpose: string;
  /** Some services are several containers (the media tools run as seven). */
  containers?: number;
}

export interface Server {
  id: ServerId;
  name: string;
  role: string;
  host: string;
  specs: string[];
  services: Service[];
  /** Position in the 2D map, as percentages of the map box. */
  map: { x: number; y: number };
  /** Position in the 3D scene, in world units. */
  scene: { x: number; z: number };
  peer?: boolean;
}

export const servers: Server[] = [
  {
    id: "jarvis",
    name: "Jarvis",
    role: "Home server",
    host: "Repurposed laptop at home",
    specs: ["Intel Core i3-6006U, 2 cores", "8 GB RAM, 490 GB SSD", "Intel HD 520 for VAAPI transcoding"],
    services: [
      { name: "Cosmos", purpose: "Reverse proxy and TLS" },
      { name: "Pi-hole", purpose: "DNS filtering" },
      { name: "Unbound", purpose: "Recursive DNS resolver" },
      { name: "Nextcloud", purpose: "File sync" },
      { name: "Immich", purpose: "Photo backup" },
      { name: "Jellyfin", purpose: "Media server, hardware transcoding" },
      { name: "Media automation", purpose: "Library and request tools", containers: 7 },
      { name: "Homepage", purpose: "Dashboard for all three servers" },
      { name: "Uptime Kuma", purpose: "Watches oracle-1 and vault-server" },
      { name: "Glances", purpose: "System metrics" },
      { name: "n8n", purpose: "Workflow automation" },
      { name: "Code-Server", purpose: "VS Code in the browser" },
      { name: "DuckDNS", purpose: "Dynamic DNS" },
      { name: "iSponsorBlockTV", purpose: "Skips sponsor segments on the TV" },
    ],
    map: { x: 26, y: 40 },
    scene: { x: -5.2, z: 0.8 },
  },
  {
    id: "vault-server",
    name: "vault-server",
    role: "Password vault",
    host: "Oracle Cloud, AMD Micro",
    specs: ["1 OCPU, 1 GB RAM", "2 GB swap file", "Always Free tier"],
    services: [
      { name: "Vaultwarden", purpose: "Password manager, localhost only" },
      { name: "Caddy", purpose: "Reverse proxy, automatic TLS" },
      { name: "Uptime Kuma", purpose: "Watches Jarvis and oracle-1" },
      { name: "Glances", purpose: "Metrics for Jarvis" },
    ],
    map: { x: 76, y: 74 },
    scene: { x: 5.4, z: 4.2 },
  },
  {
    id: "oracle-1",
    name: "oracle-1",
    role: "Game server",
    host: "Oracle Cloud, Ampere A1",
    specs: ["2 OCPU (Arm), 12 GB RAM", "100 GB backup volume", "Always Free tier"],
    services: [
      { name: "Crafty Controller", purpose: "Runs a Fabric Minecraft server" },
      { name: "Glances", purpose: "Metrics for Jarvis" },
    ],
    map: { x: 76, y: 18 },
    scene: { x: 5, z: -4.6 },
  },
  {
    id: "laptop",
    name: "Laptop",
    role: "Tailscale peer",
    host: "My Windows laptop",
    specs: ["Receives new media from Jarvis"],
    services: [],
    map: { x: 22, y: 86 },
    scene: { x: -6.4, z: 6.8 },
    peer: true,
  },
];

export type FlowKind = "health" | "backup" | "metrics" | "sync";

export interface Flow {
  from: ServerId;
  to: ServerId;
  kind: FlowKind;
}

export const flowKinds: Record<FlowKind, { label: string; detail: string }> = {
  health: { label: "Health checks", detail: "Every minute, each server watched from another" },
  backup: { label: "Backups", detail: "Daily Vaultwarden copy to Jarvis, 7 kept" },
  metrics: { label: "Metrics", detail: "Glances on the VMs, readable only by Jarvis" },
  sync: { label: "Media sync", detail: "n8n webhook starts a copy over SSH" },
};

export const flows: Flow[] = [
  { from: "jarvis", to: "vault-server", kind: "health" },
  { from: "vault-server", to: "jarvis", kind: "health" },
  { from: "jarvis", to: "oracle-1", kind: "health" },
  { from: "vault-server", to: "oracle-1", kind: "health" },
  { from: "vault-server", to: "jarvis", kind: "backup" },
  { from: "oracle-1", to: "jarvis", kind: "metrics" },
  { from: "vault-server", to: "jarvis", kind: "metrics" },
  { from: "jarvis", to: "laptop", kind: "sync" },
];

/** Tailscale links drawn on the map: every pair that exchanges traffic. */
export const links: [ServerId, ServerId][] = [
  ["jarvis", "vault-server"],
  ["jarvis", "oracle-1"],
  ["vault-server", "oracle-1"],
  ["jarvis", "laptop"],
];

export const containerCount = servers.reduce(
  (sum, s) => sum + s.services.reduce((n, svc) => n + (svc.containers ?? 1), 0),
  0,
);

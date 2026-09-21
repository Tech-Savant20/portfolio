export type Side = "top" | "right" | "bottom" | "left";

export interface DiagramNode {
  id: string;
  label: string;
  /** One mono line under the label. */
  sub?: string;
  /** Rows listed inside the box. */
  items?: string[];
  /** Grid position. Fractional columns centre a node between two columns. */
  col: number;
  row: number;
  /** focus: accent outline, for the part I built. muted: dashed, for terminal or external states. */
  tone?: "default" | "focus" | "muted";
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  fromSide?: Side;
  toSide?: Side;
  /** Pixel offset along the side, to keep two edges off the same point. */
  fromOffset?: number;
  toOffset?: number;
  both?: boolean;
  dashed?: boolean;
}

export interface Diagram {
  id: string;
  title: string;
  nodeWidth: number;
  /** Mono labels such as state names read better in the mono face. */
  monoLabels?: boolean;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const lastmileArchitecture: Diagram = {
  id: "lastmile-architecture",
  title: "LastMile IQ request path",
  nodeWidth: 188,
  nodes: [
    { id: "clients", label: "Clients", items: ["Admin", "Customer", "Delivery agent"], col: 0, row: 0 },
    { id: "api", label: "API routes", sub: "16 route handlers", items: ["JWT cookie session", "Role check per route"], col: 1, row: 0 },
    {
      id: "services",
      label: "Services",
      items: ["Rate engine", "Assignment engine", "Order lifecycle", "Notification log"],
      col: 2,
      row: 0,
      tone: "focus",
    },
    { id: "prisma", label: "Prisma ORM", sub: "typed queries", col: 3, row: 0 },
    { id: "db", label: "PostgreSQL", sub: "9 models", col: 4, row: 0 },
  ],
  edges: [
    { from: "clients", to: "api", label: "HTTPS" },
    { from: "api", to: "services" },
    { from: "services", to: "prisma" },
    { from: "prisma", to: "db" },
  ],
};

export const lastmileLifecycle: Diagram = {
  id: "lastmile-lifecycle",
  title: "Order lifecycle",
  nodeWidth: 168,
  monoLabels: true,
  nodes: [
    { id: "created", label: "CREATED", col: 0, row: 0 },
    { id: "assigned", label: "ASSIGNED", col: 1, row: 0 },
    { id: "picked", label: "PICKED_UP", col: 2, row: 0 },
    { id: "transit", label: "IN_TRANSIT", col: 3, row: 0 },
    { id: "out", label: "OUT_FOR_DELIVERY", col: 4, row: 0 },
    { id: "delivered", label: "DELIVERED", col: 5, row: 0, tone: "focus" },
    { id: "cancelled", label: "CANCELLED", col: 0, row: 1, tone: "muted" },
    { id: "rescheduled", label: "RESCHEDULED", col: 2, row: 1 },
    { id: "failed", label: "FAILED", col: 4, row: 1 },
  ],
  edges: [
    { from: "created", to: "assigned" },
    { from: "assigned", to: "picked" },
    { from: "picked", to: "transit" },
    { from: "transit", to: "out" },
    { from: "out", to: "delivered" },
    { from: "out", to: "failed", fromSide: "bottom", toSide: "top", label: "attempt fails" },
    { from: "failed", to: "rescheduled", fromSide: "left", toSide: "right", label: "customer picks a date" },
    { from: "rescheduled", to: "assigned", fromSide: "top", toSide: "bottom", label: "re-assigned" },
    { from: "created", to: "cancelled", fromSide: "bottom", toSide: "top", dashed: true },
  ],
};

export const docpilotArchitecture: Diagram = {
  id: "docpilot-architecture",
  title: "DocPilot architecture",
  nodeWidth: 200,
  nodes: [
    { id: "web", label: "Web app", sub: "React 19, TypeScript", col: 0, row: 1 },
    { id: "auth", label: "Firebase Auth", sub: "doctor and patient roles", col: 1, row: 0, tone: "focus" },
    { id: "firestore", label: "Cloud Firestore", sub: "190 lines of rules", col: 1, row: 1, tone: "focus" },
    { id: "appwrite", label: "Appwrite Storage", sub: "DICOM, JPG, PDF", col: 1, row: 2, tone: "focus" },
    { id: "gemini", label: "Gemini API", sub: "transcript to SOAP note", col: 2, row: 0, tone: "muted" },
    { id: "voice", label: "Voice app", sub: "Flutter", col: 2, row: 2 },
  ],
  edges: [
    { from: "web", to: "auth", fromSide: "top", toSide: "left", label: "sign-in" },
    { from: "web", to: "firestore", label: "onSnapshot", both: true },
    { from: "web", to: "appwrite", fromSide: "bottom", toSide: "left", label: "files" },
    { from: "voice", to: "gemini", fromSide: "top", toSide: "bottom", fromOffset: 40, toOffset: 40, both: true, label: "transcript" },
    { from: "voice", to: "firestore", fromSide: "top", toSide: "right", fromOffset: -40, label: "note" },
    { from: "voice", to: "appwrite", label: "PDF" },
  ],
};

export const retinopathyPipeline: Diagram = {
  id: "retinopathy-pipeline",
  title: "Training pipeline",
  nodeWidth: 196,
  nodes: [
    { id: "data", label: "3,662 fundus images", sub: "224 × 224, filtered", col: 0, row: 0 },
    { id: "aug", label: "Augmentation", items: ["Rotate up to 15°", "Shift, shear, zoom 10%", "Horizontal flip"], col: 1, row: 0 },
    {
      id: "backbone",
      label: "EfficientNet-B0",
      sub: "ImageNet weights",
      items: ["First 100 layers frozen", "4.2M parameters"],
      col: 2,
      row: 0,
      tone: "focus",
    },
    { id: "head", label: "Classifier head", items: ["Global average pool", "Dropout 0.3", "Dense 128, ReLU", "Dropout 0.5"], col: 3, row: 0 },
    { id: "out", label: "Softmax", sub: "5 severity stages", col: 4, row: 0 },
  ],
  edges: [
    { from: "data", to: "aug", label: "80% train" },
    { from: "aug", to: "backbone" },
    { from: "backbone", to: "head" },
    { from: "head", to: "out" },
  ],
};

export const site = {
  name: "Abhyuday Tomar",
  url: "https://abhyudaytomar.com",
  email: "abhyudaytomar1@gmail.com",
  github: "https://github.com/Tech-Savant20",
  linkedin: "https://www.linkedin.com/in/abhyuday-tomar-28a169295/",
  sourceRepo: "https://github.com/Tech-Savant20/portfolio",
  location: "Pune, India",
  relocation: "open to remote work or relocating to Delhi NCR or Hyderabad",
  eyebrow: "B.Tech CSE at VIT Bhopal · Graduating 2027",
  /** Upload new versions to the same Drive file and this link keeps working. */
  resumeUrl: "https://drive.google.com/file/d/1pRn_HSHa3M7DMqFeYI8h26wXufjTNeal/view?usp=drive_link",
} as const;

export type RoleKey = "backend" | "cloud" | "ai";

export interface Role {
  key: RoleKey;
  /** Label in the role switcher. */
  label: string;
  path: string;
  title: string;
  description: string;
  heroTitle: string;
  heroBody: string;
  /** Slugs of the projects in the sticky stack, in order. */
  projectOrder: string[];
  /** Keys of the skill groups, in order. The first one is featured. */
  skillOrder: string[];
  /** Cloud visitors see the homelab straight after the hero. */
  homelabFirst: boolean;
  /** A role-specific resume link. Falls back to site.resumeUrl. */
  resumeUrl?: string;
}

export const roles: Record<RoleKey, Role> = {
  backend: {
    key: "backend",
    label: "Backend",
    path: "/",
    title: "Abhyuday Tomar | Backend engineer",
    description:
      "Final-year CS student who builds backend systems with TypeScript, Node.js and PostgreSQL. Case studies, a live homelab and contact details.",
    heroTitle: "Backend engineer.",
    heroBody: "I build APIs, data models and the business logic that sits between them.",
    projectOrder: ["lastmile-iq", "docpilot", "retinopathy"],
    skillOrder: ["backend", "cloud", "ml"],
    homelabFirst: false,
  },
  cloud: {
    key: "cloud",
    label: "Cloud",
    path: "/cloud",
    title: "Abhyuday Tomar | Cloud engineer",
    description:
      "Final-year CS student, AWS and Azure certified, running a three-server hybrid cloud homelab with 20+ containers. Case studies and live status.",
    heroTitle: "Cloud engineer.",
    heroBody: "I run a three-server homelab with 20+ containers, cross-server monitoring and daily backups.",
    projectOrder: ["lastmile-iq", "docpilot", "retinopathy"],
    skillOrder: ["cloud", "backend", "ml"],
    homelabFirst: true,
  },
  ai: {
    key: "ai",
    label: "AI/ML",
    path: "/ai",
    title: "Abhyuday Tomar | Applied ML engineer",
    description:
      "Final-year CS student who trains and evaluates deep learning models and builds LLM features into real apps. Case studies with honest metrics.",
    heroTitle: "Applied ML engineer.",
    heroBody: "I train models, evaluate them honestly and build LLM features into real apps.",
    projectOrder: ["retinopathy", "docpilot", "lastmile-iq"],
    skillOrder: ["ml", "backend", "cloud"],
    homelabFirst: false,
  },
};

export const roleList: Role[] = [roles.backend, roles.cloud, roles.ai];

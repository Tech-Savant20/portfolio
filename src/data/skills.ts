export interface Skill {
  name: string;
  /** simple-icons slug, when the tool has a logo. */
  icon?: string;
}

export interface SkillGroup {
  key: "backend" | "cloud" | "ml";
  title: string;
  blurb: string;
  skills: Skill[];
}

export const skillGroups: Record<SkillGroup["key"], SkillGroup> = {
  backend: {
    key: "backend",
    title: "Backend and data",
    blurb: "APIs, schemas, auth and the business rules in between.",
    skills: [
      { name: "TypeScript", icon: "typescript" },
      { name: "JavaScript", icon: "javascript" },
      { name: "Python", icon: "python" },
      { name: "Node.js", icon: "nodedotjs" },
      { name: "Next.js", icon: "nextdotjs" },
      { name: "Express", icon: "express" },
      { name: "Flask", icon: "flask" },
      { name: "React", icon: "react" },
      { name: "PostgreSQL", icon: "postgresql" },
      { name: "Prisma", icon: "prisma" },
      { name: "SQLAlchemy", icon: "sqlalchemy" },
      { name: "SQLite", icon: "sqlite" },
      { name: "Firebase", icon: "firebase" },
      { name: "JWT and RBAC", icon: "jsonwebtokens" },
      { name: "Git", icon: "git" },
    ],
  },
  cloud: {
    key: "cloud",
    title: "Cloud and infrastructure",
    blurb: "Linux servers, containers, networking and the scripts that run them.",
    skills: [
      { name: "Ubuntu", icon: "ubuntu" },
      { name: "Docker", icon: "docker" },
      { name: "Bash", icon: "gnubash" },
      { name: "Oracle Cloud", icon: "oracle" },
      { name: "AWS", icon: "amazonwebservices" },
      { name: "Azure", icon: "microsoftazure" },
      { name: "Google Cloud", icon: "googlecloud" },
      { name: "Cloudflare Workers", icon: "cloudflareworkers" },
      { name: "Vercel", icon: "vercel" },
      { name: "Tailscale", icon: "tailscale" },
      { name: "Caddy", icon: "caddy" },
      { name: "Let's Encrypt", icon: "letsencrypt" },
      { name: "Pi-hole", icon: "pihole" },
      { name: "Uptime Kuma", icon: "uptimekuma" },
      { name: "n8n", icon: "n8n" },
    ],
  },
  ml: {
    key: "ml",
    title: "Machine learning",
    blurb: "Transfer learning, careful evaluation and LLM APIs.",
    skills: [
      { name: "TensorFlow", icon: "tensorflow" },
      { name: "Keras", icon: "keras" },
      { name: "PyTorch", icon: "pytorch" },
      { name: "scikit-learn", icon: "scikitlearn" },
      { name: "OpenCV", icon: "opencv" },
      { name: "Hugging Face", icon: "huggingface" },
      { name: "Gemini API", icon: "googlegemini" },
      { name: "Tesseract OCR" },
    ],
  },
};

export const courseworkOnly = "Also from coursework: Java, MySQL and MongoDB.";

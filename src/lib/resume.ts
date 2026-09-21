import { roles, site, type RoleKey } from "../data/site";

/** The resume link for a role: its own link if it has one, else the general one. */
export function resumeHref(role: RoleKey): string {
  return roles[role].resumeUrl ?? site.resumeUrl;
}

export function resumeHrefs(): Record<RoleKey, string> {
  return { backend: resumeHref("backend"), cloud: resumeHref("cloud"), ai: resumeHref("ai") };
}

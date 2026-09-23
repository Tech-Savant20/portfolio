import type { APIRoute } from "astro";
import { site, roleList } from "../data/site";
import { projects, caseStudySlugs, smallBuilds } from "../data/projects";
import { skillGroups, courseworkOnly } from "../data/skills";
import { certifications, education, leadership } from "../data/credentials";
import { servers, containerCount } from "../data/homelab";

/**
 * /llms.txt (llmstxt.org): a plain summary of the site for AI tools, built
 * from the same data as the pages so it never drifts from them.
 */
export const GET: APIRoute = () => {
  const url = (path: string) => new URL(path, site.url).href;
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    `# ${site.name}`,
    "",
    `> ${site.eyebrow}. Backend, cloud and applied-ML engineer based in ${site.location}, ${site.relocation}. Looking for entry-level roles.`,
    "",
    `Contact: ${site.email} · GitHub: ${site.github} · LinkedIn: ${site.linkedin} · Resume: ${site.resumeUrl}`,
    "",
    "## Pages",
    "",
    ...roleList.map((r) => `- [${r.title}](${url(r.path)}): ${r.description}`),
    `- [Homelab status](${url("/status")}): live status and 30-day uptime of the homelab.`,
    "",
    "## Case studies",
    "",
  );
  for (const slug of caseStudySlugs) {
    const p = projects[slug];
    push(`- [${p.name}](${url(`/work/${p.slug}`)}): ${p.kind}, ${p.period}. ${p.summary}`);
  }

  push("", "## Projects in detail", "");
  for (const slug of caseStudySlugs) {
    const p = projects[slug];
    push(`### ${p.name}`, "", p.summary, "");
    if (p.team) push(`Team: ${p.team}.`, "");
    push(`Stack: ${p.stack.join(", ")}.`, "");
    if (p.metrics.length) push(`Key numbers: ${p.metrics.map((m) => `${m.value} ${m.label}`).join("; ")}.`, "");
    for (const l of p.links) push(`- ${l.label}: ${l.href}`);
    push(`- Case study: ${url(`/work/${p.slug}`)}`, "");
  }

  push("## Smaller builds", "");
  for (const slug of smallBuilds) {
    const p = projects[slug];
    push(`- ${p.name} (${p.kind}, ${p.period}): ${p.summary} Stack: ${p.stack.join(", ")}.${p.links[0] ? ` ${p.links[0].href}` : ""}`);
  }

  push(
    "",
    "## Homelab",
    "",
    `Jarvis is a three-server homelab (a laptop at home and two Oracle Cloud VMs on one Tailscale mesh) running ${containerCount} containers: ${servers
      .filter((s) => !s.peer)
      .map((s) => `${s.name} (${s.role})`)
      .join(", ")}.`,
    "",
    "## Skills",
    "",
  );
  for (const g of Object.values(skillGroups)) push(`- ${g.title}: ${g.skills.map((s) => s.name).join(", ")}`);
  push(`- ${courseworkOnly}`);

  push(
    "",
    "## Education and certifications",
    "",
    `- ${education.degree}, ${education.school}, ${education.period}`,
    `- ${leadership.title}, ${leadership.org}, ${leadership.period}`,
    ...certifications.map((c) => `- ${c.name}, ${c.issuer}${c.date ? `, ${c.date}` : ""}`),
    "",
  );

  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
};

import { SECRETS, findSecret, foundSecrets, type SecretId } from "./secrets";

/**
 * The drop-down terminal. Press ` anywhere (outside a text field), or
 * long-press the AT logo on a phone. It's a toy, but every answer is real:
 * `ping jarvis` asks the live homelab status API.
 */

interface Data {
  site: {
    name: string;
    email: string;
    github: string;
    linkedin: string;
    resume: string;
    location: string;
    relocation: string;
    eyebrow: string;
  };
  projects: { slug: string; name: string; kind: string; period: string; summary: string; stack: string[]; caseStudy: boolean }[];
  certs: string[];
}

const SECTIONS = ["work", "homelab", "skills", "credentials", "contact"];

export function initTerminal() {
  const box = document.querySelector<HTMLElement>("[data-terminal]");
  const out = box?.querySelector<HTMLElement>("[data-terminal-out]");
  const form = box?.querySelector<HTMLFormElement>("[data-terminal-form]");
  const input = box?.querySelector<HTMLInputElement>("[data-terminal-input]");
  const raw = document.querySelector("[data-terminal-data]")?.textContent;
  if (!box || !out || !form || !input || !raw) return;
  const data = JSON.parse(raw) as Data;

  const history: string[] = [];
  let at = 0;
  let returnFocus: HTMLElement | null = null;
  let greeted = false;

  // ---------------------------------------------------------------- output

  const line = (html: string, cls = "") => {
    const p = document.createElement("p");
    if (cls) p.className = cls;
    p.innerHTML = html;
    out.append(p);
    out.scrollTop = out.scrollHeight;
  };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const link = (href: string, text: string) => `<a href="${esc(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(text)}</a>`;

  // ------------------------------------------------------------ open/close

  const open = () => {
    if (!box.hidden) return;
    returnFocus = document.activeElement as HTMLElement | null;
    box.hidden = false;
    input.focus();
    findSecret("terminal");
    if (!greeted) {
      greeted = true;
      line(`Welcome to jarvis. ${data.site.name}'s portfolio, as a shell.`, "dim");
      line(`Type <span class="ok">help</span> to see what it can do. Esc closes it.`, "dim");
    }
  };

  const close = () => {
    if (box.hidden) return;
    box.hidden = true;
    returnFocus?.focus?.();
  };

  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  addEventListener("keydown", (e) => {
    if (e.key === "`" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!box.hidden && e.target === input && input.value) return;
      if (box.hidden && typing(e.target)) return;
      e.preventDefault();
      box.hidden ? open() : close();
    } else if (e.key === "Escape" && !box.hidden) {
      close();
    }
  });

  // Phones have no backtick: long-press the AT logo in the nav.
  const logo = document.querySelector<HTMLElement>("[data-home-link]");
  let press = 0;
  let pressed = false;
  logo?.addEventListener("pointerdown", () => {
    pressed = false;
    press = window.setTimeout(() => {
      pressed = true;
      open();
    }, 650);
  });
  const cancel = () => window.clearTimeout(press);
  logo?.addEventListener("pointerup", cancel);
  logo?.addEventListener("pointerleave", cancel);
  logo?.addEventListener("click", (e) => {
    if (pressed) {
      e.preventDefault();
      pressed = false;
    }
  });
  logo?.addEventListener("contextmenu", (e) => pressed && e.preventDefault());

  box.querySelector("[data-terminal-close]")?.addEventListener("click", close);

  // -------------------------------------------------------------- commands

  const onHome = () => !!document.querySelector("[data-deck-root], [data-hero]");
  const go = (id: string) => {
    if (onHome() && document.getElementById(id)) {
      close();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    } else {
      location.href = `/#${id}`;
    }
  };

  const puneTime = () =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  const commands: Record<string, (args: string[]) => void | Promise<void>> = {
    help() {
      [
        ["whoami", "who runs this machine"],
        ["ls", "projects and sections"],
        ["cat <name>", "about · resume · contact · certs · a project, e.g. cat lastmile-iq"],
        ["open <name>", "jump to a section or case study, e.g. open homelab"],
        ["ping jarvis", "ask the live homelab which services are up"],
        ["status", "30-day uptime page"],
        ["date", "the time in Pune"],
        ["theme dark|light", "switch the colour theme"],
        ["shuffle", "shuffle the certifications deck"],
        ["xray", "see how the page is built"],
        ["secrets", "what's hidden on this site"],
        ["clear · exit", ""],
      ].forEach(([c, d]) => line(`<span class="ok">${esc(c.padEnd(18))}</span>${d ? `<span class="dim">${esc(d)}</span>` : ""}`));
    },
    whoami() {
      line(`${esc(data.site.name)} · ${esc(data.site.eyebrow)}`);
      line(`${esc(data.site.location)}, ${esc(data.site.relocation)}.`, "dim");
    },
    ls() {
      line("projects/", "ok");
      data.projects.forEach((p) =>
        line(`  ${esc(p.slug.padEnd(18))}<span class="dim">${esc(p.kind)}, ${esc(p.period)}${p.caseStudy ? " · case study" : ""}</span>`),
      );
      line("sections/", "ok");
      line(`  ${SECTIONS.join("  ")}`);
    },
    cat([what]) {
      if (!what) return line("cat: which one? Try cat about.", "warn");
      if (what === "about") return commands.whoami([]);
      if (what === "resume") return line(`Resume: ${link(data.site.resume, "open the PDF")}`);
      if (what === "contact") {
        line(`email     ${link(`mailto:${data.site.email}`, data.site.email)}`);
        line(`github    ${link(data.site.github, data.site.github.replace("https://", ""))}`);
        line(`linkedin  ${link(data.site.linkedin, "linkedin.com/in/abhyuday-tomar")}`);
        return;
      }
      if (what === "certs") return data.certs.forEach((c) => line(`• ${esc(c)}`));
      const p = data.projects.find((x) => x.slug === what || x.slug.startsWith(what));
      if (!p) return line(`cat: ${esc(what)}: no such file. Try ls.`, "warn");
      line(`${esc(p.name)} · ${esc(p.kind)}, ${esc(p.period)}`, "ok");
      line(esc(p.summary));
      line(`stack: ${esc(p.stack.join(", "))}`, "dim");
      if (p.caseStudy) line(`case study: ${link(`/work/${p.slug}`, `/work/${p.slug}`)}`);
    },
    open([what]) {
      if (!what) return line("open: where to? Try open homelab.", "warn");
      if (SECTIONS.includes(what)) return go(what);
      if (what === "github" || what === "linkedin" || what === "resume") {
        const href = what === "resume" ? data.site.resume : data.site[what];
        line(`Opening ${link(href, what)} in a new tab.`);
        window.open(href, "_blank", "noopener");
        return;
      }
      const p = data.projects.find((x) => x.caseStudy && (x.slug === what || x.slug.startsWith(what)));
      if (p) {
        location.href = `/work/${p.slug}`;
        return;
      }
      line(`open: nothing called ${esc(what)}. Try ls.`, "warn");
    },
    async ping([host]) {
      if (host !== "jarvis") return line(`ping: ${esc(host ?? "")}: only jarvis answers here.`, "warn");
      line("PING jarvis over tailscale…", "dim");
      try {
        const r = await fetch("/api/status", { headers: { accept: "application/json" } });
        const s = (await r.json()) as {
          available?: boolean;
          ageSeconds?: number;
          summary?: { up: number; total: number };
          services?: { name: string; server: string; up: boolean }[];
        };
        if (!s.available || !s.summary) return line("jarvis is quiet: no status pushed recently.", "warn");
        const age = s.ageSeconds ?? 0;
        line(
          `${s.summary.up}/${s.summary.total} services up · last report ${age < 90 ? `${age}s` : `${Math.round(age / 60)} min`} ago`,
          s.summary.up === s.summary.total ? "ok" : "warn",
        );
        const down = (s.services ?? []).filter((x) => !x.up);
        down.forEach((x) => line(`  down: ${esc(x.name)} on ${esc(x.server)}`, "warn"));
      } catch {
        line("no reply: the status API only runs on the live site.", "warn");
      }
    },
    status() {
      location.href = "/status";
    },
    date() {
      line(`${puneTime()} in Pune (IST)`);
    },
    time() {
      commands.date([]);
    },
    theme([to]) {
      const root = document.documentElement;
      const now =
        root.dataset.theme === "dark" || root.dataset.theme === "light"
          ? root.dataset.theme
          : matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      if (to && to !== "dark" && to !== "light") return line("theme: dark or light.", "warn");
      if (to === now) return line(`Already ${now}.`, "dim");
      document.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();
      line(`Theme: ${to ?? (now === "dark" ? "light" : "dark")}.`);
    },
    shuffle() {
      if (!document.querySelector("[data-deck-root]")) return line("The deck lives on the home page: open credentials.", "warn");
      close();
      document.getElementById("credentials")?.scrollIntoView({ behavior: "smooth" });
      window.setTimeout(() => dispatchEvent(new CustomEvent("deck:shuffle")), 700);
    },
    xray() {
      dispatchEvent(new CustomEvent("xray:toggle"));
      findSecret("xray");
      line("X-ray toggled. Run xray again to turn it off.", "dim");
      close();
    },
    secrets() {
      const found = foundSecrets();
      (Object.keys(SECRETS) as SecretId[]).forEach((id) =>
        line(found.includes(id) ? `✓ ${esc(SECRETS[id])}` : "· ??? (not found yet)", found.includes(id) ? "ok" : "dim"),
      );
    },
    omnitrix() {
      line("It's on the dealer's wrist, down in Credentials. Try clicking it.", "dim");
    },
    sudo() {
      line("abhyuday is not in the sudoers file. This incident will be reported.", "warn");
    },
    rm() {
      line("rm: nice try.", "warn");
    },
    clear() {
      out.innerHTML = "";
    },
    exit() {
      close();
    },
  };

  const run = async (cmd: string) => {
    line(esc(cmd), "cmd");
    const [name, ...args] = cmd.trim().split(/\s+/);
    const fn = commands[name.toLowerCase()];
    if (!fn) return line(`command not found: ${esc(name)}. Try help.`, "warn");
    await fn(args.map((a) => a.toLowerCase()));
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const cmd = input.value.trim();
    input.value = "";
    if (!cmd) return;
    history.push(cmd);
    at = history.length;
    void run(cmd);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      at = Math.max(0, at - 1);
      input.value = history[at];
    } else if (e.key === "ArrowDown" && history.length) {
      e.preventDefault();
      at = Math.min(history.length, at + 1);
      input.value = history[at] ?? "";
    } else if (e.key === "Tab") {
      e.preventDefault();
      const v = input.value.trimStart();
      if (v.includes(" ")) return;
      const hit = Object.keys(commands).filter((c) => c.startsWith(v));
      if (hit.length === 1) input.value = `${hit[0]} `;
      else if (hit.length > 1) line(hit.join("  "), "dim");
    }
  });
}

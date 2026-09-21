type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  getResponse: (id: string) => string | undefined;
};
type TurnstileWindow = Window & { turnstile?: TurnstileApi };

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface ApiResult {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
}

export function initContact() {
  // Copy-to-clipboard for the email address.
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? "");
        btn.classList.add("is-done");
        btn.setAttribute("aria-label", "Email address copied");
        setTimeout(() => {
          btn.classList.remove("is-done");
          btn.setAttribute("aria-label", "Copy email address");
        }, 2000);
      } catch {
        // Clipboard blocked: the address is right there as a link.
      }
    });
  });

  const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
  if (!form) return;
  const sent = document.querySelector<HTMLElement>("[data-sent]");
  const again = document.querySelector<HTMLButtonElement>("[data-again]");
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const submitLabel = form.querySelector<HTMLElement>("[data-submit-label]")!;
  const formError = form.querySelector<HTMLElement>("[data-form-error]")!;
  const holder = form.querySelector<HTMLElement>("[data-turnstile]")!;
  const w = window as TurnstileWindow;
  let widgetId: string | undefined;
  let scriptRequested = false;

  // Load Turnstile only when someone gets near the form.
  const renderWidget = () => {
    if (!w.turnstile || widgetId !== undefined) return;
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    widgetId = w.turnstile.render(holder, {
      sitekey: holder.dataset.sitekey,
      action: "contact",
      theme: dark ? "dark" : "light",
      appearance: "interaction-only",
    });
  };
  const loadTurnstile = () => {
    if (scriptRequested) return;
    scriptRequested = true;
    if (w.turnstile) return renderWidget();
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", renderWidget, { once: true });
    s.addEventListener("error", () => {
      scriptRequested = false;
    });
    document.head.append(s);
  };
  new IntersectionObserver(
    (entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        obs.disconnect();
        loadTurnstile();
      }
    },
    { rootMargin: "400px 0px" },
  ).observe(form);
  form.addEventListener("focusin", loadTurnstile, { once: true });

  // ---- validation ------------------------------------------------------------------
  const setError = (name: string, message: string) => {
    const input = form.elements.namedItem(name) as HTMLInputElement | null;
    const slot = form.querySelector<HTMLElement>(`[data-err="${name}"]`);
    if (slot) slot.textContent = message;
    input?.setAttribute("aria-invalid", message ? "true" : "false");
  };

  const validate = (data: FormData): boolean => {
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    let ok = true;
    if (!name) (setError("name", "Please add your name."), (ok = false));
    else setError("name", "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) (setError("email", "That email address doesn't look right."), (ok = false));
    else setError("email", "");
    if (message.length < 10) (setError("message", "A little more detail, please: at least 10 characters."), (ok = false));
    else setError("message", "");
    return ok;
  };

  form.querySelectorAll("input, textarea").forEach((el) =>
    el.addEventListener("input", () => {
      if (el.getAttribute("aria-invalid") === "true") validate(new FormData(form));
    }),
  );

  const showFormError = (text: string) => {
    formError.textContent = "";
    const email = document.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    formError.append(text + " ");
    if (email) {
      const a = document.createElement("a");
      a.href = email.href;
      a.textContent = "Email me instead.";
      formError.append(a);
    }
    formError.hidden = false;
  };

  // ---- submit -----------------------------------------------------------------------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;
    const data = new FormData(form);
    if (!validate(data)) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    loadTurnstile();
    const token = widgetId !== undefined ? w.turnstile?.getResponse(widgetId) : undefined;
    if (!token) {
      showFormError("The spam check hasn't finished yet. Give it a second and try again.");
      return;
    }

    submit.disabled = true;
    submitLabel.textContent = "Sending...";
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          company: data.get("company"),
          token,
        }),
      });
      const result = (await res.json().catch(() => ({ ok: false }))) as ApiResult;
      if (res.ok && result.ok) {
        form.hidden = true;
        form.reset();
        if (sent) {
          sent.hidden = false;
          sent.focus();
        }
        return;
      }
      if (result.fields) {
        Object.entries(result.fields).forEach(([k, v]) => setError(k, v));
        return;
      }
      showFormError(
        res.status === 429
          ? "That's a lot of messages in a short time. Please try again in a minute."
          : "Something went wrong on my side and the message wasn't sent.",
      );
    } catch {
      showFormError("The message couldn't be sent. Check your connection and try again.");
    } finally {
      submit.disabled = false;
      submitLabel.textContent = "Send message";
      // Tokens are single-use: always get a fresh one for the next attempt.
      if (widgetId !== undefined) w.turnstile?.reset(widgetId);
    }
  });

  again?.addEventListener("click", () => {
    if (sent) sent.hidden = true;
    form.hidden = false;
    form.querySelector<HTMLInputElement>("input")?.focus();
  });
}

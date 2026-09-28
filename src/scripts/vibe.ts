/**
 * "Playing music? Let the circle vibe." The disc behind the hero photo pulses
 * to music playing near the visitor. A page can't hear other tabs or apps, so
 * it listens through the microphone, and only after the button is pressed.
 * The sound is analysed in the browser (Web Audio) and never recorded or sent.
 *
 * Each frame: the bass level sets --vibe on the disc (it swells and glows),
 * and a jump well above the recent average counts as a beat and sends a ring
 * out from its edge.
 */
export function initVibe() {
  const button = document.querySelector<HTMLButtonElement>("[data-hero-vibe]");
  const disc = document.querySelector<HTMLElement>("[data-hero-disc]");
  const photo = document.querySelector<HTMLElement>("[data-hero-photo]");
  const label = button?.querySelector<HTMLElement>("[data-vibe-label]");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!button || !disc || !photo || !label || !hero) return;
  if (!navigator.mediaDevices?.getUserMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  button.hidden = false;

  const IDLE = "Playing music? Let the circle vibe";
  let stream: MediaStream | null = null;
  let audio: AudioContext | null = null;
  let frame = 0;
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);

  const setOn = (on: boolean, text: string) => {
    button.setAttribute("aria-pressed", String(on));
    label.textContent = text;
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((t) => t.stop());
    void audio?.close();
    stream = null;
    audio = null;
    disc.style.setProperty("--vibe", "0");
    setOn(false, IDLE);
  };

  const ripple = () => {
    const ring = document.createElement("span");
    ring.className = "ripple";
    ring.setAttribute("aria-hidden", "true");
    ring.addEventListener("animationend", () => ring.remove());
    disc.after(ring);
  };

  const start = async () => {
    setOn(true, "Asking for the microphone…");
    try {
      // Music, not a voice call: no echo cancelling, noise removal or levelling.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      setOn(false, "No microphone, no vibe. Try again?");
      return;
    }
    audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    audio.createMediaStreamSource(stream).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    // Bass: roughly 40-250 Hz.
    const hz = audio.sampleRate / analyser.fftSize;
    const lo = Math.max(1, Math.round(40 / hz));
    const hi = Math.max(lo + 1, Math.round(250 / hz));
    setOn(true, "Listening · tap to stop");

    let level = 0;
    let average = 0;
    let peak = 0.2;
    let lastBeat = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible) return;
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += bins[i];
      const bass = sum / ((hi - lo + 1) * 255);
      // Loud rooms and quiet laptops: scale against the recent peak.
      peak = Math.max(peak * 0.997, bass, 0.08);
      const v = Math.min(1, bass / peak) ** 2;
      level += (v - level) * (v > level ? 0.55 : 0.12);
      average = average * 0.96 + bass * 0.04;
      if (bass > average * 1.35 && bass > 0.25 && now - lastBeat > 240) {
        lastBeat = now;
        ripple();
      }
      disc.style.setProperty("--vibe", level.toFixed(3));
    };
    frame = requestAnimationFrame(tick);
  };

  button.addEventListener("click", () => (stream ? stop() : void start()));
  addEventListener("pagehide", stop);
}

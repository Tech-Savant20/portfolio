import { gsap } from "gsap";

/**
 * Rig for the dealer's hands (DealerHands.astro). Each hand is two elements,
 * a back layer under the cards and a thumb layer over them, moved together.
 * A spot is where the palm's top centre goes, in the same stage coordinates
 * the cards use (x from the stage's centre line, y from its top).
 */

export type Side = "left" | "right";
export type Pose = "hold" | "grip" | "open" | "rest" | "push";
export interface Spot {
  x: number;
  y: number;
  rotation: number;
}

// Written for the left hand; the right is drawn mirrored, so the same numbers mirror with it.
const POSES: Record<Pose, { fingers: number[]; curl: number[]; thumb: number; thumbLen: number }> = {
  hold: { fingers: [-6, -2, 2, 6], curl: [1, 1, 1, 1], thumb: -28, thumbLen: 1 },
  grip: { fingers: [-3, -1, 1, 3], curl: [0.92, 0.92, 0.92, 0.92], thumb: -42, thumbLen: 0.84 },
  open: { fingers: [-24, -9, 7, 20], curl: [1, 1, 1, 1], thumb: 38, thumbLen: 1 },
  rest: { fingers: [-8, -3, 2, 7], curl: [0.8, 0.85, 0.85, 0.82], thumb: 16, thumbLen: 0.9 },
  push: { fingers: [-2, 0, 1, 3], curl: [1, 1, 1, 1], thumb: -12, thumbLen: 1 },
};
const FINGER_X = [72, 91, 110, 128];
const FINGER_Y = 66;
const THUMB_ORIGIN = "140 118";

export type Hands = ReturnType<typeof createHands>;

export function createHands(stage: HTMLElement) {
  const part = (side: Side, layer: "back" | "front") =>
    stage.querySelector<HTMLElement>(`[data-hand="${side}-${layer}"]`);
  const left = [part("left", "back"), part("left", "front")].filter(Boolean) as HTMLElement[];
  const right = [part("right", "back"), part("right", "front")].filter(Boolean) as HTMLElement[];
  if (left.length < 2 || right.length < 2) return null;

  const els: Record<Side, HTMLElement[]> = { left, right };
  const fingers: Record<Side, SVGGElement[]> = {
    left: [...left[0].querySelectorAll<SVGGElement>("[data-finger]")],
    right: [...right[0].querySelectorAll<SVGGElement>("[data-finger]")],
  };
  const thumbs: Record<Side, SVGGElement | null> = {
    left: left[1].querySelector<SVGGElement>("[data-thumb]"),
    right: right[1].querySelector<SVGGElement>("[data-thumb]"),
  };

  gsap.set([...left, ...right], { transformOrigin: "50% 14.2857%" });

  const poseTweens = (side: Side, name: Pose, duration: number) => {
    const p = POSES[name];
    const tl = gsap.timeline();
    fingers[side].forEach((f, i) =>
      tl.to(f, { rotation: p.fingers[i], scaleY: p.curl[i], svgOrigin: `${FINGER_X[i]} ${FINGER_Y}`, duration, ease: "power2.out" }, 0),
    );
    const t = thumbs[side];
    if (t) tl.to(t, { rotation: p.thumb, scaleY: p.thumbLen, svgOrigin: THUMB_ORIGIN, duration, ease: "power2.out" }, 0);
    return tl;
  };

  return {
    /** Width of one hand in px; the drawings scale with the cards. */
    width: () => left[0].offsetWidth,

    /** Places a hand at once. */
    set(side: Side, spot: Spot, pose?: Pose) {
      gsap.set(els[side], spot);
      if (pose) poseTweens(side, pose, 0).progress(1);
    },

    /** Adds a move (and optionally a pose change) to a timeline. */
    to(tl: gsap.core.Timeline, side: Side, spot: Spot, pose: Pose | null, at: number | string, duration = 0.3, ease = "power2.inOut") {
      tl.to(els[side], { ...spot, duration, ease }, at);
      if (pose) tl.add(poseTweens(side, pose, Math.min(0.22, duration)), at);
    },

    pose(tl: gsap.core.Timeline, side: Side, pose: Pose, at: number | string, duration = 0.2) {
      tl.add(poseTweens(side, pose, duration), at);
    },

    show(side: Side, on: boolean) {
      gsap.set(els[side], { autoAlpha: on ? 1 : 0 });
    },
  };
}

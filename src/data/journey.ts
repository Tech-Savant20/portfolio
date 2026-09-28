import { projects } from "./projects";
import { certifications, education, leadership } from "./credentials";

/**
 * "My journey": the places he grew up in, then the milestones since.
 *
 * Cities in order and nothing more: no years, schools, addresses or reasons
 * for the moves. `journeyReady` puts the section on the home page (a local
 * build can also show it with PUBLIC_JOURNEY_PREVIEW=1 while it's off).
 */
export const journeyReady = true;

export interface Place {
  city: string;
  state: string;
  lat: number;
  lon: number;
  /** The first pin: where the story starts and, if the last pin matches, ends. */
  born?: boolean;
  /** Shown instead of the state on the map, e.g. "Now". */
  label?: string;
}

export type MilestoneKind = "life" | "study" | "build" | "cert" | "role";

export interface Milestone {
  date: string;
  title: string;
  detail: string;
  kind: MilestoneKind;
  href?: string;
}

// The cities, in order: born in Pune, the places he grew up in, and Pune again now.
export const places: Place[] = [
  { city: "Pune", state: "Maharashtra", lat: 18.52, lon: 73.86, born: true, label: "Born here" },
  { city: "Bareilly", state: "Uttar Pradesh", lat: 28.37, lon: 79.43 },
  { city: "Tezpur", state: "Assam", lat: 26.63, lon: 92.8 },
  { city: "Jodhpur", state: "Rajasthan", lat: 26.24, lon: 73.02 },
  { city: "Chennai", state: "Tamil Nadu", lat: 13.08, lon: 80.27 },
  { city: "Pune", state: "Maharashtra", lat: 18.52, lon: 73.86, label: "Now" },
];

const project = (slug: string) => projects[slug];

export const milestones: Milestone[] = [
  { date: "2016", title: "First line of code", detail: "My first web page, written in HTML.", kind: "life" },
  { date: "2018", title: "Python", detail: "From markup to programming: my first language with logic in it.", kind: "life" },
  {
    date: "Class 12",
    title: "A calculator with a GUI",
    detail: "My class 12 project: a calculator in Python, with a Tkinter window and buttons.",
    kind: "build",
  },
  {
    date: education.period.split(" ")[0],
    title: education.school,
    detail: `${education.degree}.`,
    kind: "study",
  },
  { date: leadership.period.split(" - ")[0], title: leadership.title, detail: leadership.org, kind: "role" },
  {
    date: project("retinopathy").period,
    title: "First model that worked",
    detail: project("retinopathy").summary,
    kind: "build",
    href: "/work/retinopathy",
  },
  {
    date: project("finance-tracker").period,
    title: project("finance-tracker").name,
    detail: project("finance-tracker").summary,
    kind: "build",
  },
  // Dates from the GitHub history: DocPilot's commits start in March 2026,
  // the homelab's in May.
  {
    date: "Mar 2026",
    title: project("docpilot").name,
    detail: project("docpilot").summary,
    kind: "build",
    href: "/work/docpilot",
  },
  {
    date: "May 2026",
    title: "Jarvis goes live",
    detail: project("jarvis-homelab").summary,
    kind: "build",
    href: "/work/jarvis-homelab",
  },
  {
    date: project("lastmile-iq").period,
    title: project("lastmile-iq").name,
    detail: project("lastmile-iq").summary,
    kind: "build",
    href: "/work/lastmile-iq",
  },
  {
    date: "Aug 2026",
    title: "AWS and Azure certified",
    detail: certifications
      .filter((c) => c.date === "Aug 2026")
      .map((c) => c.name)
      .join(" · "),
    kind: "cert",
  },
  { date: "Sep 2026", title: "This site", detail: "Everything on this page, built and shipped.", kind: "build" },
];

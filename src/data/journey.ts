import { projects } from "./projects";
import { certifications, education, leadership } from "./credentials";

/**
 * "My journey": the places he grew up in, then the milestones since.
 *
 * Cities and years only: no schools, addresses or details of his father's
 * postings. `journeyReady` puts the section on the home page (a local build can
 * also show it with PUBLIC_JOURNEY_PREVIEW=1 while it's off).
 */
export const journeyReady = true;

export interface Place {
  city: string;
  state: string;
  lat: number;
  lon: number;
  from: number;
  /** Omitted while still there. */
  to?: number;
  /** Shown on the first pin. */
  born?: boolean;
  /** Replaces the years, e.g. "Now". */
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

// The cities, in order: born in Pune, his father's postings, and Pune again now.
export const places: Place[] = [
  { city: "Pune", state: "Maharashtra", lat: 18.52, lon: 73.86, from: 2003, to: 2008, born: true },
  { city: "Bareilly", state: "Uttar Pradesh", lat: 28.37, lon: 79.43, from: 2008, to: 2014 },
  { city: "Tezpur", state: "Assam", lat: 26.63, lon: 92.8, from: 2014, to: 2018 },
  { city: "Jodhpur", state: "Rajasthan", lat: 26.24, lon: 73.02, from: 2018, to: 2022 },
  { city: "Chennai", state: "Tamil Nadu", lat: 13.08, lon: 80.27, from: 2022, to: 2024 },
  { city: "Sirsa", state: "Haryana", lat: 29.53, lon: 75.03, from: 2024 },
  { city: "Pune", state: "Maharashtra", lat: 18.52, lon: 73.86, from: 2026, label: "Now" },
];

const project = (slug: string) => projects[slug];
const cert = (name: string) => certifications.find((c) => c.name.includes(name));

export const milestones: Milestone[] = [
  { date: "2016", title: "First line of code", detail: "My first web page, written in HTML.", kind: "life" },
  { date: "2018", title: "Python", detail: "From markup to programming: my first language with logic in it.", kind: "life" },
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
  {
    date: cert("Networking")?.date ?? "Nov 2025",
    title: "Computer Networking",
    detail: cert("Networking")?.issuer ?? "Coursera",
    kind: "cert",
  },
  {
    date: "May 2026",
    title: "Jarvis goes live",
    detail: project("jarvis-homelab").summary,
    kind: "build",
    href: "/work/jarvis-homelab",
  },
  {
    date: project("docpilot").period,
    title: project("docpilot").name,
    detail: project("docpilot").summary,
    kind: "build",
    href: "/work/docpilot",
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

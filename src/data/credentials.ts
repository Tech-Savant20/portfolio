export interface Certification {
  name: string;
  issuer: string;
  date?: string;
  href: string;
  icon: string;
}

export const certifications: Certification[] = [
  {
    name: "AWS Certified Cloud Practitioner",
    issuer: "Amazon Web Services",
    date: "Aug 2026",
    href: "https://www.credly.com/badges/97c5edf1-1f19-4e61-9932-391fc074a8ea",
    icon: "amazonwebservices",
  },
  {
    name: "AWS Certified AI Practitioner",
    issuer: "Amazon Web Services",
    date: "Aug 2026",
    href: "https://www.credly.com/badges/a517ec61-192b-4a10-b16f-c15243285158/public_url",
    icon: "amazonwebservices",
  },
  {
    name: "Azure AI Cloud Developer Associate",
    issuer: "Microsoft",
    date: "Aug 2026",
    href: "https://learn.microsoft.com/api/credentials/share/en-us/abhyudaytomar-2793/9FAAC3412A1FC8E3",
    icon: "microsoft",
  },
  {
    name: "Arcade Program, Legend tier",
    issuer: "Google Cloud",
    href: "https://www.credly.com/users/abhyuday-tomar.f9cf683c/badges",
    icon: "googlecloud",
  },
  {
    name: "Computer Networking Specialization",
    issuer: "Coursera",
    date: "Nov 2025",
    href: "https://drive.google.com/drive/folders/1g2GXCimM7wvfY15XmehLdr-lvgmnuU1_?usp=sharing",
    icon: "coursera",
  },
];

export const education = {
  school: "VIT Bhopal University",
  degree: "B.Tech, Computer Science and Engineering",
  period: "2023 - 2027",
  grade: "CGPA 8.41 / 10",
  schooling: ["Class XII: 92.4%", "Class X: 88.4%"],
};

export const leadership = {
  title: "Finance Lead",
  org: "Cyber Warriors Club, VIT Bhopal",
  period: "Feb 2025 - Sep 2026",
  points: [
    "Ran the club budget and allocated funds across its technical events.",
    "Secured corporate sponsorships for club-run hackathons and workshops.",
    "Set up expense tracking that held up with several events running at once.",
  ],
};

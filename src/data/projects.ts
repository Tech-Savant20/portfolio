import type { Diagram } from "./diagrams";
import { lastmileArchitecture, lastmileLifecycle, docpilotArchitecture, retinopathyPipeline } from "./diagrams";

export interface Metric {
  value: string;
  label: string;
}

export interface CodeSample {
  lang: string;
  source: string;
  caption: string;
}

export interface Decision {
  title: string;
  body: string[];
  code?: CodeSample;
  diagram?: Diagram;
}

export interface CaseStudy {
  /** Shown under the title, for team projects. */
  myRole?: string;
  problem: string[];
  architecture: {
    intro: string;
    /** Either a generic diagram or the homelab map. */
    diagram: Diagram | "homelab";
    caption: string;
  };
  decisions: Decision[];
  results: {
    metrics: Metric[];
    notes: string[];
    /** Rendered as a labelled callout. Used for team-level numbers. */
    attribution?: string;
    charts?: "retinopathy";
  };
  next: string[];
}

export type VisualKey = "lastmile" | "docpilot" | "retinopathy" | "finance" | "scrapeverse" | "jarvis";

export interface Project {
  slug: string;
  name: string;
  kind: string;
  period: string;
  summary: string;
  stack: string[];
  links: { label: string; href: string }[];
  metrics: Metric[];
  visual: VisualKey;
  team?: string;
  caseStudy?: CaseStudy;
}

export const projects: Record<string, Project> = {
  "lastmile-iq": {
    slug: "lastmile-iq",
    name: "LastMile IQ",
    kind: "Logistics backend",
    period: "Aug 2026",
    summary:
      "A delivery platform that quotes rates, assigns drivers automatically and keeps an append-only history of every order.",
    stack: ["Next.js 16", "TypeScript", "PostgreSQL", "Prisma", "JWT", "bcrypt", "Tailwind CSS", "Vercel"],
    links: [
      { label: "Live demo", href: "https://last-mile-delivery-tracker-mocha-three.vercel.app" },
      { label: "GitHub", href: "https://github.com/Tech-Savant20/last-mile-delivery-tracker" },
    ],
    metrics: [
      { value: "16", label: "API route handlers" },
      { value: "9", label: "Prisma models" },
      { value: "3", label: "roles with scoped access" },
    ],
    visual: "lastmile",
    caseStudy: {
      myRole: "Solo project: schema, API, business logic, UI and deployment.",
      problem: [
        "Last-mile pricing depends on how big a parcel is, not only how heavy. Assigning a driver means trading distance against how busy each driver already is. And every change to an order needs a record nobody can quietly edit later.",
        "I built the backend that handles all three, with an admin, customer and delivery-agent view on top so the rules can be seen working.",
      ],
      architecture: {
        intro:
          "Next.js App Router serves both the pages and the API. Route handlers check the JWT cookie and the caller's role, then hand off to plain TypeScript services that own the business rules. Prisma is the only thing that talks to PostgreSQL.",
        diagram: lastmileArchitecture,
        caption: "Request path from the three client roles down to the database.",
      },
      decisions: [
        {
          title: "Bill on whichever is heavier: the scale or the box",
          body: [
            "Couriers charge for the space a parcel takes up. The rate engine computes volumetric weight as length × width × height / 5000, bills the higher of that and the actual weight, rounds extra kilograms up and never goes below the card's minimum charge.",
            "Rates live in the database as cards keyed by customer type (B2B or B2C) and route (same zone or cross zone), so admins change prices without a deploy. Cash-on-delivery adds a surcharge that is either a fixed fee or a percentage of the declared value, with a floor.",
          ],
          code: {
            lang: "ts",
            caption: "Condensed from src/lib/services/rate-engine.ts",
            source: `const volumetricKg = (lengthCm * widthCm * heightCm) / 5000;
const chargeableKg = Math.max(actualWeightKg, volumetricKg);

const extraKg = Math.max(0, chargeableKg - rateCard.baseWeightKg);
const shippingCharge = Math.max(
  rateCard.minCharge,
  rateCard.baseRate + Math.ceil(extraKg) * rateCard.perExtraKgRate,
);`,
          },
        },
        {
          title: "Score drivers instead of picking the nearest one",
          body: [
            "The nearest driver is often the busiest. Assignment first drops anyone at capacity, then scores the rest: great-circle distance to the pickup (Haversine), plus 25 km if the driver is outside the pickup zone, plus 2 km for every delivery they already hold. The lowest score gets the order.",
            "Admins can override the choice by hand, and the override moves the load counters between drivers so capacity stays accurate.",
          ],
          code: {
            lang: "ts",
            caption: "Condensed from src/lib/services/assignment-engine.ts",
            source: `const eligible = agents.filter((a) => a.activeDeliveries < a.maxCapacity);

const scored = eligible.map((agent) => {
  const distanceKm = haversineKm(agent, pickup);
  const zonePenalty = agent.currentZoneId === order.pickupZoneId ? 0 : 25;
  const workloadPenalty = agent.activeDeliveries * 2;
  return { agent, score: distanceKm + zonePenalty + workloadPenalty };
});

scored.sort((a, b) => a.score - b.score); // lowest score wins`,
          },
        },
        {
          title: "Make order history append-only",
          body: [
            "Status changes go through one lifecycle service. It checks the move against a table of allowed transitions, stops agents from touching orders that aren't theirs, and writes a tracking event with the actor, their role, a note and coordinates. No route updates or deletes those events.",
            "A failed delivery lets the customer pick a new date, which creates a reschedule record and runs assignment again.",
          ],
          diagram: lastmileLifecycle,
        },
      ],
      results: {
        metrics: [
          { value: "16", label: "route handlers over a 9-model schema" },
          { value: "17", label: "test assertions on pricing and the order lifecycle" },
          { value: "6", label: "seeded demo accounts across 3 roles" },
        ],
        notes: [
          "Deployed on Vercel with a one-click role switcher, so anyone can try the admin, customer and agent views without signing up.",
          "Worked example from the README: a 25 × 20 × 15 cm parcel weighing 1.2 kg is billed at its 1.5 kg volumetric weight.",
        ],
      },
      next: [
        "Notifications are written to a log table, not sent. Wiring a provider such as Resend is the next step, and the README should say so until then.",
        "Assignment runs as separate writes. Two admins assigning at the same moment could double-book a driver, and a Prisma transaction would close that gap.",
        "The tests cover pricing and one lifecycle transition. Driver assignment has no tests yet.",
      ],
    },
  },

  "jarvis-homelab": {
    slug: "jarvis-homelab",
    name: "Jarvis homelab",
    kind: "Hybrid cloud homelab",
    period: "May 2026 - present",
    summary:
      "A repurposed laptop and two Oracle Cloud VMs on one Tailscale mesh, running 20+ self-hosted containers for ₹0 a month.",
    stack: [
      "Ubuntu 24.04",
      "Docker Compose",
      "Oracle Cloud",
      "Tailscale",
      "Caddy",
      "Cosmos",
      "Let's Encrypt",
      "Pi-hole",
      "Unbound",
      "Uptime Kuma",
      "Glances",
      "n8n",
      "Bash",
      "cron",
    ],
    links: [{ label: "GitHub", href: "https://github.com/Tech-Savant20/homelab-infra" }],
    metrics: [
      { value: "3", label: "servers on one mesh" },
      { value: "20+", label: "containers" },
      { value: "₹0", label: "per month" },
    ],
    visual: "jarvis",
    caseStudy: {
      myRole: "Solo project: hardware, networking, services, monitoring and backups.",
      problem: [
        "I wanted my own cloud: file sync, photo backup, a password manager and a media server, without paying a subscription for any of it.",
        "The harder goal was that no single failure should take everything down, or go unnoticed.",
      ],
      architecture: {
        intro:
          "Three servers sit on one Tailscale mesh. Jarvis, a laptop at home, runs most of the services. Two Oracle Cloud Always Free VMs handle the rest: a small AMD instance that holds only the password manager and a monitor, and an Arm instance that runs a Minecraft server for friends.",
        diagram: "homelab",
        caption: "Servers, the services on each, and what travels over the mesh.",
      },
      decisions: [
        {
          title: "Monitor every server from a different server",
          body: [
            "A monitor can't report its own outage. Jarvis and vault-server each run Uptime Kuma and watch each other every minute; both also watch oracle-1, which runs no monitor of its own. Alerts go out by email.",
          ],
        },
        {
          title: "Give the password manager a machine of its own",
          body: [
            "Vaultwarden started on Jarvis, next to a media server that gets restarted all the time. I moved it to its own 1 GB VM, bound it to localhost and put Caddy in front for automatic TLS, so nothing else on the box can reach it directly.",
            "That VM had about 227 MB free under normal load and the vault sometimes hung while loading. A 2 GB swap file fixed it. Every day a cron job copies the vault to Jarvis over Tailscale and keeps the last seven copies.",
          ],
          code: {
            lang: "bash",
            caption: "From vault-server/scripts/backup-vaultwarden.sh",
            source: `tar -czf "$TMP_PATH" -C "$DATA_DIR" .
scp -i "$SSH_KEY" "$TMP_PATH" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"
rm -f "$TMP_PATH"

# On Jarvis, keep only the last 7 backups
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \\
  "cd $REMOTE_DIR && ls -t vaultwarden-backup-*.tar.gz | tail -n +8 | xargs -r rm --"`,
          },
        },
        {
          title: "Resolve DNS without a third party",
          body: [
            "Devices ask Pi-hole, which blocks ads and trackers and forwards the rest to Unbound. Unbound walks the DNS tree from the root servers itself, so no public resolver sees every lookup the house makes.",
          ],
        },
      ],
      results: {
        metrics: [
          { value: "90% → 15%", label: "CPU per media stream after switching Jellyfin to VAAPI" },
          { value: "₹0", label: "monthly cost: Always Free VMs and a laptop I already had" },
          { value: "1 min", label: "health-check interval, each server watched from another" },
        ],
        notes: [
          "The i3 laptop could barely transcode one stream in software. Hardware transcoding on its Intel HD 520 made streaming usable while everything else keeps running.",
        ],
      },
      next: [
        "Backups are compressed tarballs, not encrypted. Encrypting them with age before they leave the box is next.",
        "Monitoring alerts me, but recovery is manual. Restarting failed containers automatically would close that loop.",
        "The Minecraft backups sit on a volume attached to the same VM. Copying them to another machine would survive losing the instance.",
      ],
    },
  },

  docpilot: {
    slug: "docpilot",
    name: "DocPilot",
    kind: "Clinic platform, team of six",
    period: "Jul 2026",
    team: "Backend developer on a six-person EPICS capstone team at VIT Bhopal",
    summary:
      "An outpatient clinic platform with a live queue, telehealth and an AI scribe that turns consultations into structured notes. I owned the data and security layer.",
    stack: ["React 19", "TypeScript", "Firebase Auth", "Cloud Firestore", "Appwrite Storage", "Gemini API", "Flutter"],
    links: [{ label: "GitHub", href: "https://github.com/Tech-Savant20/docpilot" }],
    metrics: [
      { value: "190", label: "lines of Firestore security rules" },
      { value: "5", label: "collections with schema checks" },
      { value: "2", label: "roles: doctor and patient" },
    ],
    visual: "docpilot",
    caseStudy: {
      myRole:
        "Backend developer. I designed the Firestore data model and real-time listeners, wrote the security rules, set up Firebase Auth and connected Appwrite storage.",
      problem: [
        "Outpatient clinics lose hours to paper queues and handwritten notes. Our team set out to digitize the whole visit: booking, the waiting-room queue, the consultation and the paperwork after it.",
        "My part was the layer everything else stands on: where data lives, who can read it, and how changes reach every screen at once.",
      ],
      architecture: {
        intro:
          "The React web app talks to Firebase directly and listens for changes instead of polling. A companion Flutter app records the consultation, has Gemini turn the transcript into a structured SOAP note, then saves the note to Firestore and a PDF to Appwrite.",
        diagram: docpilotArchitecture,
        caption: "Web and voice apps, and the services each one talks to.",
      },
      decisions: [
        {
          title: "Enforce access in the database, not the UI",
          body: [
            "With no server of our own, the database rules are the security boundary. Appointments, consultations and invoices can only be read by the doctor and patient named on them. A user's role is fixed at sign-up, and every write is checked against the expected fields, types and allowed values.",
          ],
          code: {
            lang: "js",
            caption: "From firestore.rules",
            source: `match /users/{userId} {
  allow create: if isOwner(userId) && isValidUser(request.resource.data);
  // the role can never change after sign-up
  allow update: if isOwner(userId) && isValidUser(request.resource.data) &&
                  request.resource.data.role == resource.data.role;
}

match /appointments/{appointmentId} {
  allow read: if isAuthenticated() &&
    (request.auth.uid == resource.data.doctorId ||
     request.auth.uid == resource.data.patientId);
}`,
          },
        },
        {
          title: "Keep large files out of Firestore",
          body: [
            "Scans and reports (DICOM, JPG, PDF) go to Appwrite storage buckets. Firestore keeps only the metadata and a link, so queries stay small and fast while files can be as large as they need to be.",
          ],
        },
        {
          title: "Push changes instead of polling",
          body: [
            "The queue, appointments, analytics and chat all use Firestore onSnapshot listeners. When a doctor calls the next patient, the waiting-room display and the patient's phone update from the same write.",
          ],
        },
      ],
      results: {
        metrics: [
          { value: "95.5%", label: "of 440 labelled data points extracted correctly by the scribe" },
          { value: "45 → 18 min", label: "average wait, traditional queue vs DocPilot" },
        ],
        attribution:
          "Team results from our EPICS Phase II report. Scribe accuracy comes from prototype testing and ranged from 94.6% on symptoms to 96.6% on dosage and frequency. The wait-time figures are the report's comparison of a traditional clinic queue with DocPilot's dynamic queue, about 60% lower.",
        notes: [
          "Notes from the scribe can't be finalized until the doctor reviews and confirms them.",
        ],
      },
      next: [
        "Medical records can be read by any doctor, not only the treating one, and chat documents are open to any signed-in user. Scoping both to the people involved is the first fix.",
        "The voice app calls Gemini directly with a key it carries. Moving that call behind a server function would keep the key off devices.",
      ],
    },
  },

  retinopathy: {
    slug: "retinopathy",
    name: "Retinopathy classifier",
    kind: "Computer vision",
    period: "Jul 2025",
    summary:
      "Transfer learning on retinal photos to grade diabetic retinopathy into five stages, with an honest look at where the model fails.",
    stack: ["Python", "TensorFlow", "Keras", "EfficientNet-B0", "scikit-learn", "OpenCV"],
    links: [
      {
        label: "GitHub",
        href: "https://github.com/Tech-Savant20/Diabetic-Retinopathy-Detection/tree/main/VITBHOPAL_2023",
      },
    ],
    metrics: [
      { value: "76.5%", label: "validation accuracy" },
      { value: "0.76", label: "quadratic weighted kappa" },
      { value: "0.97", label: "F1 on the No DR class" },
    ],
    visual: "retinopathy",
    caseStudy: {
      problem: [
        "Diabetic retinopathy is graded on a five-step scale from photos of the back of the eye. Catching it early prevents blindness, and graders are scarce.",
        "I wanted to see how far a small pretrained model gets on a public dataset of 3,662 images, and to find out exactly where it breaks.",
      ],
      architecture: {
        intro:
          "Images are 224 × 224 fundus photos with a Gaussian filter already applied. EfficientNet-B0 with ImageNet weights is the backbone, its first 100 layers frozen, with a small classification head on top.",
        diagram: retinopathyPipeline,
        caption: "Training pipeline. 80% of images train the model; 20% are held out for validation.",
      },
      decisions: [
        {
          title: "Fine-tune a small pretrained backbone",
          body: [
            "With under 3,000 training images, training from scratch would overfit. EfficientNet-B0 has 4.2M parameters and already knows edges and textures. Freezing the early layers and fine-tuning the rest, with augmentation, a stepped learning rate and early stopping, kept training stable.",
          ],
          code: {
            lang: "python",
            caption: "From the training notebook",
            source: `base_model = EfficientNetB0(input_shape=(224, 224, 3),
                            weights="imagenet", include_top=False)
for layer in base_model.layers[:100]:
    layer.trainable = False

model = Sequential([
    base_model,
    GlobalAveragePooling2D(),
    Dropout(0.3),
    Dense(128, activation="relu"),
    Dropout(0.5),
    Dense(num_classes, activation="softmax"),
])`,
          },
        },
        {
          title: "Report more than accuracy",
          body: [
            "Half the validation images show no retinopathy, so accuracy flatters a lazy model. For most of the first eight epochs validation accuracy sat at exactly 49.4%: the score you get by predicting No DR for every image. I tracked Cohen's kappa, per-class F1 and the full confusion matrix instead.",
          ],
        },
        {
          title: "Check the metric, not just the model",
          body: [
            "The notebook reported a quadratic weighted kappa of 0.25, far below the unweighted 0.63. Keras numbers classes alphabetically, so the metric was treating No DR as sitting between Moderate and Proliferative. Recomputed in severity order from the same confusion matrix, it is 0.76.",
          ],
          code: {
            lang: "python",
            caption: "Mapping Keras class indices to severity order before scoring",
            source: `severity = ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"]
rank = {train_data.class_indices[name]: i for i, name in enumerate(severity)}

qwk = cohen_kappa_score([rank[y] for y in y_true],
                        [rank[y] for y in y_pred],
                        weights="quadratic")  # 0.758`,
          },
        },
      ],
      results: {
        metrics: [
          { value: "76.5%", label: "accuracy on 731 held-out images" },
          { value: "0.63 / 0.76", label: "Cohen's kappa, unweighted / quadratic" },
          { value: "95.4%", label: "of eyes with any retinopathy flagged as diseased" },
        ],
        notes: [
          "As a yes-or-no screen for any retinopathy, the same predictions catch 95.4% of diseased eyes and clear 97.8% of healthy ones.",
          "Grading the severe end is where it fails: 2 of 38 Severe cases are found, and Proliferative is never predicted at all. 33 of the 38 Severe cases come back as Moderate.",
        ],
        charts: "retinopathy",
      },
      next: [
        "The rare classes need more weight: focal loss or class weights, oversampling, and more Severe and Proliferative images.",
        "Higher input resolution (380 px) should help, since the lesions that separate the top grades are small.",
        "Not suitable for clinical use. It's a baseline to learn from.",
      ],
    },
  },

  "finance-tracker": {
    slug: "finance-tracker",
    name: "Finance Tracker",
    kind: "OCR web app",
    period: "Sep 2025",
    summary:
      "Upload a receipt photo and get back the merchant, date and line items, sorted into a spending category. Tesseract OCR after grayscale and binarization.",
    stack: ["Python", "Flask", "SQLAlchemy", "SQLite", "Tesseract OCR", "Bootstrap"],
    links: [{ label: "GitHub", href: "https://github.com/Tech-Savant20/finance_tracker" }],
    metrics: [],
    visual: "finance",
  },

  scrapeverse: {
    slug: "scrapeverse",
    name: "Scrape-Verse bot",
    kind: "Hackathon build",
    period: "Aug 2026",
    summary:
      "Built for WeMakeDevs' Into the Scrape-Verse hackathon. Scrapes engineering blog posts with Bright Data and has Gemini draft LinkedIn posts from them.",
    stack: ["Node.js", "Bright Data Scraper Studio", "Gemini API"],
    links: [{ label: "GitHub", href: "https://github.com/Tech-Savant20/scrapeverse-linkedin-bot" }],
    metrics: [],
    visual: "scrapeverse",
  },
};

export const caseStudySlugs = ["lastmile-iq", "jarvis-homelab", "docpilot", "retinopathy"] as const;
export const smallBuilds = ["finance-tracker", "scrapeverse"] as const;

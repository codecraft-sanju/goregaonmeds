//frontend/app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LazyMotion, m } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Heart,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  ShoppingBag,
  Truck,
  UploadCloud,
  X,
  Loader2,
  AlertCircle,
  Banknote,
  Navigation,
  Pill,
} from "lucide-react";
import Image from "next/image";
import { fetchSavedProfile, forgetProfile, saveProfile } from "./customerProfile";
import { fetchDeliveryCharge, formatRupees } from "./storeSettings";

// Decorative / below-the-fold widgets are split into their own chunks.
const StrokeText = dynamic(() => import("./StrokeText"), { ssr: false });
const SlideCommit = dynamic(() => import("./SlideCommit"), {
  ssr: false,
  loading: () => <div className="h-[60px] w-[310px] max-w-full animate-pulse rounded-full bg-gm-ink/15" aria-hidden="true" />,
});
const SplitText = dynamic(() => import("./SplitText"));
const TextType = dynamic(() => import("./TextType"));

// Only the tiny `m` component ships up front; the animation engine loads after hydration.
const loadMotionFeatures = () => import("./motionFeatures").then((mod) => mod.default);

const PHONE = "918433818771";
const API = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "")
).replace(/\/+$/, "");
const MAX_SELECT_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // Must match the backend multer limit.

const BRANCHES = [
  {
    name: "Apple Pharmacy",
    shortName: "Apple Pharmacy",
    area: "Aarey Road",
    address:
      "Shop No. 9, Sheetal Krupa Building, Ground Floor, Aarey Road, Goregaon East, Mumbai",
    tone: "apple",
    open24x7: false,
  },
  {
    name: "Lotus Pharmacy",
    shortName: "Lotus Pharmacy",
    area: "Jay Prakash Nagar",
    address:
      "Shop No. 10, Shreyas Bhavan, Jay Prakash Nagar Road No. 1, opposite Domino’s Pizza, Goregaon East, Mumbai",
    tone: "lotus",
    open24x7: false,
  },
  {
    name: "Healthzone & Cosmetic",
    shortName: "Healthzone",
    area: "Aarey Road",
    address:
      "Pednekar Chawl, Shop No. 3, Ground Floor, S.V., Aarey Road, Goregaon East, Mumbai",
    tone: "health",
    open24x7: true,
  },
] as const;

const ALWAYS_OPEN_BRANCH = BRANCHES.find((item) => item.open24x7);
const ALWAYS_OPEN_NOTICE = ALWAYS_OPEN_BRANCH ? `${ALWAYS_OPEN_BRANCH.shortName} is open 24×7` : "";

const TONE_STYLES: Record<(typeof BRANCHES)[number]["tone"], { art: string; sign: string }> = {
  apple: { art: "bg-[#e8eede]", sign: "bg-[#315242]" },
  lotus: { art: "bg-[#ece8dc]", sign: "bg-[#78674d]" },
  health: { art: "bg-[#e1ebe7]", sign: "bg-[#4e7271]" },
};

const FAQ = [
  [
    "How does ordering work?",
    "Type your medicine names or upload a prescription, add your delivery details and continue to WhatsApp. Send the prepared message. Our team will confirm availability, the total and delivery details before processing your request.",
  ],
  [
    "When do I pay?",
    "Pay at delivery using cash or UPI. Selecting UPI here only records your preference; no money is collected on this website.",
  ],
  [
    "Where do you deliver?",
    "Our branches serve Goregaon East. Share your full address so the team can confirm coverage and delivery timing on WhatsApp. The current delivery charge is shown in the order summary before you send your request.",
  ],
  ...(ALWAYS_OPEN_BRANCH
    ? [
        [
          "Is any branch open at night?",
          `Yes. ${ALWAYS_OPEN_BRANCH.name} on ${ALWAYS_OPEN_BRANCH.area} is open 24×7. Choose it as your preferred branch for late-night or early-morning requests.`,
        ],
      ]
    : []),
  [
    "Can I send my prescription directly on WhatsApp?",
    "Yes. Use the WhatsApp contact button and attach your prescription in the chat. If you upload here, your image is stored on Cloudinary and a shareable link is included in your message. Anyone with that link can view it.",
  ],
];

type Customer = {
  name: string;
  phone: string;
  house: string;
  area: string;
  landmark: string;
};

const EMPTY_CUSTOMER: Customer = { name: "", phone: "", house: "", area: "", landmark: "" };

const CUSTOMER_FIELDS = [
  { key: "name", label: "Full name", placeholder: "Your name", auto: "name", max: 80 },
  { key: "phone", label: "Mobile number", placeholder: "10-digit mobile number", auto: "tel-national", max: 10 },
  { key: "house", label: "Flat / house & building", placeholder: "Flat no., floor, building name", auto: "address-line1", max: 180 },
  { key: "area", label: "Area / locality", placeholder: "e.g. Aarey Road", auto: "address-line2", max: 100 },
  { key: "landmark", label: "Landmark (optional)", placeholder: "A nearby landmark", auto: "off", max: 100 },
] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Shared utility-class groups (replace the old .gm-* classes).
const CONTAINER =
  "mx-auto w-[calc(100%-28px)] min-[361px]:w-[calc(100%-36px)] sm:w-[calc(100%-48px)] lg:w-[min(1180px,calc(100%-80px))]";
const SECTION = "py-[52px] sm:py-[65px] md:py-[95px]";
const EYEBROW =
  "inline-flex items-center gap-2 text-[8px] font-bold uppercase tracking-[1.4px] md:text-[10px] md:tracking-[1.9px]";
const SPLIT_H2 =
  "mt-4 font-serif text-[36px] font-medium italic leading-[1.12] tracking-[-1.5px] lg:text-[45px]";
const BTN =
  "inline-flex min-h-[54px] items-center justify-center gap-4 rounded-full border border-transparent px-[25px] py-[17px] text-[13px] font-semibold transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_7px_20px_#153f3414]";
const BTN_DARK = "bg-gm-ink text-white hover:bg-[#245744]";
const TEXT_LINK =
  "inline-flex min-h-[38px] items-center gap-2.5 border-0 bg-transparent p-0 text-[11px] font-[650] hover:text-[#567832] sm:text-xs";
const CIRCLE_ICON = "grid size-[43px] shrink-0 place-items-center rounded-full bg-[#edf2e7]";
const ICON_BTN = "grid size-10 place-items-center rounded-full border border-[#d8dfd7] bg-transparent";
const LABEL = "flex min-w-0 flex-col gap-[7px] text-[10px] font-semibold sm:text-[11px]";
const INPUT =
  "w-full min-w-0 rounded-[9px] border border-[#dce2d8] bg-[#fcfdfb] p-[11px] text-base font-normal text-gm-ink outline-none transition placeholder:text-xs placeholder:text-[#859080] focus:border-[#789966] focus:shadow-[0_0_0_3px_#e9f0df] sm:px-[13px] sm:py-3 sm:text-xs";
const HELPER = "mt-2 flex items-center gap-[5px] text-[10px] font-normal text-[#747f6f]";
const FORM_BLOCK = "border-b border-[#e8ede4] py-[22px] sm:py-6";
const BLOCK_TITLE = "mb-[18px] flex items-center gap-2.5 text-xs font-[650] sm:text-[13px]";
const BLOCK_NUMBER = "grid size-6 place-items-center rounded-full border border-[#d9e1d3] text-[9px] text-[#728268]";
const RADIO_CARD = "group relative block min-w-0 cursor-pointer";
const RADIO_INPUT = "peer absolute size-px opacity-0";
const RADIO_CONTENT =
  "flex items-center gap-[9px] rounded-[10px] border border-[#e1e6dd] px-[11px] py-3 transition-colors peer-checked:border-[#91ab71] peer-checked:bg-[#f2f7e9] peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-[#418768] sm:gap-3 sm:px-3.5";
const RADIO_DOT =
  "ml-auto size-[15px] shrink-0 rounded-full border border-[#b7c4af] group-has-[input:checked]:border-4 group-has-[input:checked]:border-[#e0eccf] group-has-[input:checked]:bg-gm-ink group-has-[input:checked]:shadow-[0_0_0_1px_#597d40]";
const FLOAT_CARD =
  "absolute z-[3] flex animate-float items-center gap-2 rounded-2xl border border-white bg-[#ffffffed] p-3 shadow-[0_12px_35px_#324c2a12] lg:gap-[11px] lg:px-[17px] lg:py-3.5";
const PILL =
  "absolute rounded-[40px] bg-[linear-gradient(90deg,#fff_50%,#93b27c_50%)] shadow-[3px_7px_10px_#34472920]";
const FOOTER_LINK = "mb-2.5 flex items-center gap-[7px] text-[11px] text-[#5d6b58]";
const SCROLL_OFFSET = "scroll-mt-[88px] sm:scroll-mt-[105px]";
const IN_VIEW = { once: false, amount: 0.2, margin: "0px 0px -50px 0px" } as const;

// Framer Motion Variants for Bi-directional Scroll Animations
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

function deliveryMessageLine(charge: number | null): string {
  if (charge === null) return "Delivery charge to be confirmed";
  return charge === 0 ? "FREE delivery" : `Delivery charge: ${formatRupees(charge)} (added to the medicine total)`;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`inline-flex items-center gap-2.5 font-[750] leading-[1.1] tracking-[-1.1px] ${compact ? "text-xl" : "text-[21px] sm:text-[23px]"}`}
      href="#home"
      aria-label="Goregaonmeds home"
    >
      <span className={`flex shrink-0 items-center justify-center overflow-hidden ${compact ? "size-[34px]" : "size-[35px] sm:size-11"}`}>
        <Image src="/logo.png" alt="" width={44} height={44} priority className="block size-full scale-125 object-contain" />
      </span>

      <span>
        goregaon<span className="font-[450]">meds</span>
        <small
          className={`mt-2 block font-semibold ${compact ? "text-[6px] tracking-[1.3px]" : "text-[6px] tracking-[1.35px] sm:text-[7px] sm:tracking-[1.65px]"}`}
        >
          YOUR NEIGHBOURHOOD PHARMACY
        </small>
      </span>
    </a>
  );
}

function OpenAllHoursBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gm-ink font-bold uppercase text-gm-lime ${compact ? "px-2 py-0.5 text-[8px] tracking-[0.8px]" : "px-2.5 py-1 text-[9px] tracking-[1px]"}`}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-gm-lime" aria-hidden="true" />
      Open 24×7
    </span>
  );
}

function DeliveryBadge({ charge }: { charge: number | null }) {
  if (charge === null) return <span className="text-[11px] text-gm-muted">Confirmed on WhatsApp</span>;
  if (charge === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gm-lime px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-gm-ink shadow-[0_0_0_1px_#b9d67a]">
        <Truck size={13} /> FREE Delivery
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gm-ink">
      <Truck size={13} /> Delivery: {formatRupees(charge)}
    </span>
  );
}

async function prepareImage(selected: File): Promise<File> {
  // --- NEW COMPRESSION LOGIC START ---
  try {
    // Loaded on demand: most visitors never upload, so they never download the compressor.
    const { default: imageCompression } = await import("browser-image-compression");
    return await imageCompression(selected, {
      maxSizeMB: 0.8, // Image size ko ~800KB tak limit karega
      maxWidthOrHeight: 1920, // Prescription padhne ke liye enough resolution
      useWebWorker: true,
    });
  } catch (error) {
    console.warn("Image compression failed, falling back to original", error);
    // Agar kisi wajah se fail hua, toh original file hi upload hone denge
    return selected;
  }
  // --- NEW COMPRESSION LOGIC END ---
}

export default function PharmacyLanding() {
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<"type" | "prescription">("type");
  const [medicines, setMedicines] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [branch, setBranch] = useState(0);
  const [payment, setPayment] = useState<"cod" | "upi">("cod");
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [rememberDetails, setRememberDetails] = useState(false);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [readyUrl, setReadyUrl] = useState("");
  const [drag, setDrag] = useState(false);
  // Paise, as set by the admin. Null until loaded (or if the backend is unreachable).
  const [deliveryCharge, setDeliveryCharge] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  const submitting = useRef(false);
  const cachedUpload = useRef<{ file: File; url: string } | null>(null);
  const userEdited = useRef(false);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  // Pre-fill delivery details for returning customers, unless they've already started typing.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // Render cold starts can be slow.
    fetchSavedProfile(API, BRANCHES.length, controller.signal)
      .then((profile) => {
        if (!profile || userEdited.current) return;
        const { branch: savedBranch, payment: savedPayment, ...address } = profile;
        setCustomer(address);
        setBranch(savedBranch);
        setPayment(savedPayment);
        setRememberDetails(true);
        setHasSavedProfile(true);
      })
      .catch(() => {
        // No saved details or offline: the empty form still works.
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetchDeliveryCharge(API, controller.signal)
      .then((charge) => {
        if (charge !== null) setDeliveryCharge(charge);
      })
      .catch(() => {
        // Shown as "confirmed on WhatsApp"; placeOrder retries before building the message.
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  function invalidate() {
    setReadyUrl("");
    setError("");
  }

  function chooseBranch(index: number) {
    userEdited.current = true;
    setBranch(index);
    invalidate();
  }

  async function forgetSavedDetails() {
    await forgetProfile(API);
    userEdited.current = true;
    setHasSavedProfile(false);
    setRememberDetails(false);
    setCustomer(EMPTY_CUSTOMER);
    invalidate();
  }

  function selectFile(next?: File) {
    if (!next || submitting.current) return;
    invalidate();

    // Limit increased to 15MB since compression will handle the rest
    if (next.size > MAX_SELECT_BYTES) {
      setError("Please choose an image smaller than 15 MB.");
      return;
    }

    if (
      !next.size ||
      !(
        /\.(jpe?g|png|webp|heic|heif)$/i.test(next.name) ||
        ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(next.type)
      )
    ) {
      setError("Choose a JPG, PNG, WEBP, HEIC or HEIF image.");
      return;
    }

    setFile(next);
    cachedUpload.current = null;
    setConsent(false);
  }

  async function uploadPrescription(selected: File): Promise<string> {
    if (cachedUpload.current?.file === selected) return cachedUpload.current.url;
    if (!API) {
      throw new Error("Prescription upload is not configured. Please send your image directly on WhatsApp.");
    }

    const fileToUpload = await prepareImage(selected);
    if (fileToUpload.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        "This image could not be reduced below 2 MB. Please send it directly on WhatsApp, or take a JPG photo instead.",
      );
    }

    const body = new FormData();
    // Use the compressed file (fileToUpload) instead of original (selected)
    const ext = fileToUpload.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = fileToUpload.type || MIME_BY_EXTENSION[ext] || "application/octet-stream";
    // fileToUpload ka use kiya hai buffer create karne ke liye
    body.append("image", new Blob([fileToUpload], { type: mime }), fileToUpload.name);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      request.current = xhr;
      xhr.open("POST", `${API}/api/admin/upload`); // FIXED TO ADMIN UPLOAD ROUTE
      xhr.timeout = 75000;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onerror = () =>
        reject(
          new Error(
            "Could not connect to the upload service. Check your connection or send the image directly on WhatsApp.",
          ),
        );
      xhr.ontimeout = () =>
        reject(new Error("Upload took too long. Please retry or send the image directly on WhatsApp."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));

      xhr.onload = () => {
        let data: { url?: string; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error("Unexpected server response. Please try again."));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(data.error || "Upload failed. Please try again."));
          return;
        }
        let url: string;
        try {
          if (!data.url) throw new Error();
          const parsed = new URL(data.url);
          if (parsed.protocol !== "https:") throw new Error();
          url = parsed.href;
        } catch {
          reject(new Error("Upload service returned an invalid image link."));
          return;
        }
        cachedUpload.current = { file: selected, url };
        resolve(url);
      };

      xhr.send(body);
    });
  }

  // Modified to work smoothly with <SlideCommit />
  async function placeOrder() {
    if (submitting.current) return Promise.reject(new Error("Already submitting"));
    invalidate();
    if (!customer.name.trim() || !customer.house.trim() || !customer.area.trim()) {
      setError("Please fill in your name and complete delivery address.");
      return Promise.reject(new Error("Validation failed"));
    }
    if (!/^[6-9]\d{9}$/.test(customer.phone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return Promise.reject(new Error("Validation failed"));
    }
    if (mode === "type" && !medicines.trim()) {
      setError("Please enter the medicines you need.");
      return Promise.reject(new Error("Validation failed"));
    }
    if (mode === "prescription" && (!file || !consent)) {
      setError("Choose a prescription image and agree to share it.");
      return Promise.reject(new Error("Validation failed"));
    }

    submitting.current = true;
    setBusy(true);
    setProgress(0);

    const trimmed = {
      name: customer.name.trim(),
      phone: customer.phone,
      house: customer.house.trim(),
      area: customer.area.trim(),
      landmark: customer.landmark.trim(),
    };
    // Runs in parallel with the upload; bounded by a short timeout and never throws.
    const profileTask = rememberDetails
      ? saveProfile(API, { ...trimmed, branch, payment })
      : hasSavedProfile
        ? forgetProfile(API)
        : Promise.resolve();
    // Re-read the charge so the message reflects any change the admin made while this page was open.
    const chargeTask = fetchDeliveryCharge(API, AbortSignal.timeout(4000)).catch(() => null);

    try {
      const imageUrl = mode === "prescription" ? await uploadPrescription(file!) : "";
      const latestCharge = (await chargeTask) ?? deliveryCharge;
      if (latestCharge !== null) setDeliveryCharge(latestCharge);
      const selectedBranch = BRANCHES[branch];
      const address = [trimmed.house, trimmed.area, trimmed.landmark ? `Near ${trimmed.landmark}` : "", "Goregaon East, Mumbai"]
        .filter(Boolean)
        .join(", ");
      const message = `*New medicine request | Goregaonmeds*\n\n*Customer*\nName: ${trimmed.name}\nPhone: ${trimmed.phone}\nAddress: ${address}\n\n*Preferred branch*\n${selectedBranch.name}${selectedBranch.open24x7 ? " (open 24×7)" : ""}\n\n*Medicines / prescription*\n${imageUrl || medicines.trim()}\n\n*Delivery*\n${deliveryMessageLine(latestCharge)}\n\n*Payment preference*\n${payment === "upi" ? "UPI at delivery" : "Cash on delivery"}\n\nPlease confirm availability, total price and delivery details.`;
      const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;

      await profileTask; // Navigating away would cancel the in-flight save.
      setHasSavedProfile(rememberDetails);
      setReadyUrl(url);
      window.location.assign(url);

      // Resolve for SlideCommit success animation
      return Promise.resolve(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return Promise.reject(err);
    } finally {
      request.current = null;
      submitting.current = false;
      setBusy(false);
    }
  }

  const estimatedTotal =
    deliveryCharge === null
      ? "Medicine total + delivery (confirmed in chat)"
      : deliveryCharge === 0
        ? "Medicine total · no delivery charge"
        : `Medicine total + ${formatRupees(deliveryCharge)}`;

  return (
    <LazyMotion features={loadMotionFeatures}>
      <div className="overflow-clip bg-gm-paper font-sans text-[15px] leading-[1.6] text-gm-ink [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-65" id="home">
        <a href="#order" className="fixed -top-[100px] left-4 z-[100] bg-white p-3 focus:top-3">
          Skip to order form
        </a>

        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between bg-gm-ink px-[18px] py-2 text-[9px] tracking-[0.03em] text-[#e8f2db] sm:px-6 sm:py-[9px] sm:text-[11px] md:px-10"
        >
          <span className="flex items-center gap-[7px]">
            <MapPin size={13} /> Made for Goregaon East
          </span>
          <span className="flex items-center gap-[7px] max-sm:text-[8px]">
            Local care. A little closer. <Heart size={13} />
          </span>
        </m.div>

        <header className="sticky top-0 z-30 border-b border-[#153f3412] bg-[#f7f8f2ed] backdrop-blur-[18px]">
          <div className={`${CONTAINER} flex h-[72px] items-center justify-between gap-3 sm:h-[86px] sm:gap-5`}>
            <Brand />
            <nav className="hidden gap-[17px] text-xs font-[550] md:flex lg:gap-7" aria-label="Main navigation">
              <a className="hover:text-[#567832]" href="#how">How it works</a>
              <a className="hover:text-[#567832]" href="#branches">Our branches</a>
              <a className="hover:text-[#567832]" href="#about">About us</a>
            </nav>
            <a
              className={`${BTN} ${BTN_DARK} min-h-11 px-[19px] py-3 text-xs max-sm:hidden max-md:ml-auto`}
              href="#order"
            >
              Order medicines <ArrowUpRight size={17} />
            </a>
            <button
              className={`${ICON_BTN} ml-auto sm:ml-0 md:hidden`}
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="mobile-navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
          {menu && (
            <m.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              id="mobile-navigation"
              className="border-t border-[#ddd] px-6 pb-[22px] pt-2.5 md:hidden"
              aria-label="Mobile navigation"
            >
              {[
                ["#how", "How it works"],
                ["#branches", "Our branches"],
                ["#about", "About us"],
                ["#order", "Order medicines"],
              ].map(([href, title]) => (
                <a key={href} href={href} className="flex justify-between py-[13px]" onClick={() => setMenu(false)}>
                  {title}
                  <ArrowUpRight size={18} />
                </a>
              ))}
            </m.nav>
          )}
        </header>

        <main>
          <section
            className={`${CONTAINER} relative grid grid-cols-1 items-center gap-8 pb-8 pt-[38px] sm:grid-cols-2 sm:gap-5 sm:py-[45px] md:gap-7 lg:grid-cols-[1.05fr_1fr] lg:gap-[60px] lg:pb-[72px] lg:pt-[65px] min-[1500px]:py-[85px]`}
          >
            {/* Stunning Background Watermark using StrokeText */}
            <div className="pointer-events-none absolute left-[5%] top-[15%] z-0 hidden w-[90%] opacity-50 lg:block">
              <StrokeText
                text="GOREGAON"
                strokeColor="#153f3414"
                fillColor="transparent"
                strokeWidth={1.5}
                drawDuration={2}
                trigger="mount"
                fontSize={180}
              />
            </div>

            <m.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative z-10 px-[5px] sm:px-0"
            >
              <span className={EYEBROW}>
                <span className="size-[7px] rounded-full bg-[#639145] shadow-[0_0_0_4px_#dce9cb]" /> YOUR LOCAL
                PHARMACY, REIMAGINED
              </span>

              <h1 className="relative my-[22px] text-[60px] font-[540] leading-[1.01] tracking-[-4px] min-[361px]:text-[68px] sm:my-[25px] sm:text-[57px] sm:tracking-[-3px] md:text-[69px] lg:text-[clamp(64px,6.4vw,87px)] lg:tracking-[-5px]">
                Care, closer
                <br />
                to <span className="font-serif font-normal italic tracking-[-0.05em]">home.</span>
                <m.span
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 1 }}
                  className="ml-5 inline-block align-middle text-[42px] text-[#8cad61] min-[361px]:text-[51px] sm:hidden md:ml-[18px] md:inline-block md:text-[45px] lg:ml-7 lg:text-[68px]"
                  aria-hidden="true"
                >
                  ✳
                </m.span>
              </h1>

              {/* Reserves space so height doesn't jump when typing */}
              <div className="min-h-12 max-w-full lg:min-h-[55px] lg:max-w-[395px]">
                <TextType
                  text={[
                    "Your everyday medicines.",
                    "Your neighbourhood people.",
                    "Request what you need, let's take care of the rest.",
                  ]}
                  typingSpeed={35}
                  pauseDuration={1800}
                  showCursor={true}
                  cursorCharacter="|"
                  className="text-sm leading-[1.8] text-gm-muted sm:text-[13px] lg:text-[15px]"
                />
              </div>

              <div className="my-5 flex items-center gap-[23px] sm:my-[25px] sm:flex-col sm:items-start sm:gap-3.5 md:mb-6 md:mt-[29px] md:flex-row md:items-center md:gap-[26px]">
                <a href="#order" className={`${BTN} ${BTN_DARK} max-sm:px-5 max-sm:py-[15px] max-sm:text-xs`}>
                  Get your medicines <ArrowUpRight size={20} />
                </a>
                <a href={`tel:+${PHONE}`} className={TEXT_LINK}>
                  <Phone size={17} /> Talk to us
                </a>
              </div>
              <div className="flex items-center gap-[9px] text-[10px] text-gm-muted sm:gap-[5px] sm:text-[9px] md:gap-[9px] md:text-[11px]">
                <span className="grid size-[22px] place-items-center rounded-full bg-[#e4ecd9] text-gm-ink">
                  <Check size={15} />
                </span>{" "}
                Pay at delivery <i className="mx-1.5 size-[3px] rounded-full bg-[#98a291] sm:mx-0.5 md:mx-[7px]" /> Order
                on WhatsApp
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                {ALWAYS_OPEN_NOTICE && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gm-ink md:text-[11px]">
                    <Clock size={13} /> {ALWAYS_OPEN_NOTICE}
                  </span>
                )}
                {deliveryCharge !== null && <DeliveryBadge charge={deliveryCharge} />}
              </div>
            </m.div>

            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="relative isolate z-[5] h-[370px] overflow-hidden rounded-[23px] bg-[#e6eddf] after:absolute after:inset-0 after:-z-10 after:bg-[radial-gradient(ellipse_at_60%_50%,#f9f8de99,transparent_65%)] after:content-[''] sm:h-[410px] sm:rounded-[25px] md:h-[440px] lg:h-[480px] lg:rounded-[38px] min-[1500px]:h-[510px]"
              aria-label="Illustration of a neighbourhood pharmacy delivery bag"
            >
              <div className="absolute left-[60px] top-[30px] size-[480px] rounded-full border border-[#acbda24d]" />
              <div className="absolute left-[130px] top-[100px] size-[340px] rounded-full border border-[#acbda24d]" />
              <span className="absolute bottom-[25px] left-[18px] rotate-180 text-[7px] tracking-[2px] [writing-mode:vertical-rl] sm:left-6 sm:text-[8px]">
                A LITTLE CARE, DELIVERED.
              </span>
              <div className={`${FLOAT_CARD} left-5 top-5 lg:left-[25px] lg:top-[34px]`}>
                <span className={`${CIRCLE_ICON} size-[30px] lg:size-[43px]`}>
                  <MapPin size={20} />
                </span>
                <div>
                  <strong className="block text-[9px] font-[650] lg:text-[10px]">Rooted in your neighbourhood</strong>
                  <small className="text-[8px] text-gm-muted lg:text-[9px]">3 branches · Goregaon East</small>
                </div>
              </div>
              <div className="absolute left-[calc(50%-93px)] top-[95px] h-[250px] w-[187px] -rotate-[9deg] drop-shadow-[12px_24px_15px_#243a2526] sm:top-[115px] sm:h-[255px] sm:w-[185px] lg:left-[calc(50%-110px)] lg:top-[130px] lg:h-[290px] lg:w-[220px]">
                <div className="absolute -top-[53px] left-[45px] h-[91px] w-[93px] rounded-t-[60px] border-[12px] border-b-0 border-[#bba77f] shadow-[inset_2px_0_2px_#826e4840] lg:left-16" />
                <div className="relative flex h-full flex-col items-start rounded-b-xl rounded-t-[5px] border-r-[15px] border-[#c7b38a] bg-[linear-gradient(105deg,#e5d4ad,#f0e2c4_65%,#ccba91)] p-[22px] lg:p-[30px]">
                  <span className="text-[#315240]">
                    <Plus strokeWidth={3} className="size-[51px] lg:size-16" />
                  </span>
                  <strong className="mb-[18px] mt-2.5 font-serif text-[26px] font-normal leading-[1.05] tracking-[-1px] lg:text-[30px]">
                    feel better.
                    <br />
                    live better.
                  </strong>
                  <span className="text-[11px] font-bold tracking-[-0.5px]">goregaonmeds</span>
                  <div className="mt-3.5 h-0.5 w-full bg-[#52644b55]" />
                </div>
              </div>
              <div
                className={`${PILL} right-[25px] top-[155px] h-[17px] w-10 rotate-[35deg] lg:right-8 lg:top-[165px] lg:h-6 lg:w-[60px]`}
              />
              <div className={`${PILL} bottom-[55px] left-[55px] h-5 w-12 -rotate-[40deg]`} />
              <div
                className={`${FLOAT_CARD} bottom-5 right-[18px] [animation-delay:-3s] lg:bottom-[30px] lg:right-5`}
              >
                <span className={`${CIRCLE_ICON} size-[30px] bg-gm-lime lg:size-[43px]`}>
                  <Truck size={21} />
                </span>
                <div>
                  <strong className="block text-[9px] font-[650] lg:text-[10px]">From our neighbourhood</strong>
                  <small className="text-[8px] text-gm-muted lg:text-[9px]">To your doorstep</small>
                </div>
                <ArrowUpRight size={20} />
              </div>
              <span
                className="absolute right-[25px] top-[57px] text-[44px] text-[#547346] lg:right-[42px] lg:top-[65px] lg:text-[61px]"
                aria-hidden="true"
              >
                ✳
              </span>
            </m.div>
          </section>

          {/* Bi-directional scroll setting: once: false */}
          <m.div
            initial="hidden"
            whileInView="visible"
            viewport={IN_VIEW}
            variants={staggerContainer}
            className="border-y border-[#dce2d6]"
          >
            <div
              className={`${CONTAINER} grid grid-cols-2 gap-x-3 gap-y-[17px] py-5 md:flex md:items-center md:justify-between md:gap-[18px] md:py-[23px]`}
            >
              {[
                [ShoppingBag, "Medicine requests, simplified"],
                [MapPin, "Three local branches"],
                [QrCode, "Cash or UPI at delivery"],
                [MessageCircle, "A real conversation"],
              ].map(([Icon, text]) => {
                const I = Icon as typeof ShoppingBag;
                return (
                  <m.span
                    variants={fadeInUp}
                    key={String(text)}
                    className="flex items-center gap-2 text-[9px] font-[550] max-[360px]:text-[8px] sm:gap-[11px] sm:text-[10px] md:text-[11px]"
                  >
                    <I className="size-4 sm:size-[19px]" />
                    {String(text)}
                  </m.span>
                );
              })}
            </div>
          </m.div>

          <section id="how" className={`${CONTAINER} ${SECTION} ${SCROLL_OFFSET}`}>
            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={IN_VIEW}
              variants={fadeInUp}
              className="mb-7 sm:flex sm:items-end sm:justify-between sm:gap-6 md:mb-9"
            >
              <div>
                <span className={EYEBROW}>LESS EFFORT. MORE CARE.</span>
                <h2 className={SPLIT_H2}>
                  <SplitText
                    text="One less thing on your to-do list."
                    delay={30}
                    duration={0.8}
                    splitType="words"
                    threshold={0.1}
                  />
                </h2>
              </div>
              <p className="mt-[18px] text-xs leading-[1.9] text-gm-muted sm:mt-0 sm:pb-1 sm:text-[11px] md:text-[13px]">
                No account to create. No complicated checkout.
                <br />
                Just your local pharmacy, a message away.
              </p>
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={IN_VIEW}
              variants={staggerContainer}
              className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-5 lg:gap-[23px]"
            >
              {[
                {
                  icon: FileText,
                  title: "Tell us what you need",
                  text: "Write your medicine list or share a clear prescription photo.",
                },
                {
                  icon: MessageCircle,
                  title: "Let’s talk on WhatsApp",
                  text: "Send your request. We’ll confirm stock, pricing and delivery details.",
                },
                {
                  icon: ShoppingBag,
                  title: "Care comes to your door",
                  text: "Once confirmed, receive your medicines and pay at delivery.",
                },
              ].map((item, index) => (
                <m.article
                  variants={fadeInUp}
                  key={item.title}
                  className="grid grid-cols-[48px_1fr] gap-x-[15px] border-t border-[#bdcbbc] pt-5 sm:block sm:px-[5px] sm:pt-[26px]"
                >
                  <div className="relative row-span-2 flex items-start justify-between sm:mb-[30px] sm:items-center">
                    <item.icon size={27} />
                    <span className="absolute left-[5px] top-[38px] font-serif text-sm italic text-[#a8b5a1] sm:static sm:text-[35px]">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold sm:text-sm md:mb-2.5 md:text-[17px]">{item.title}</h3>
                  <p className="text-xs text-gm-muted sm:text-[11px] md:max-w-[305px] md:text-[13px]">{item.text}</p>
                </m.article>
              ))}
            </m.div>
          </section>

          <section id="order" className={`bg-[#eaf0e3] py-[45px] sm:py-[55px] md:py-[76px] ${SCROLL_OFFSET}`}>
            <div
              className={`${CONTAINER} grid grid-cols-1 items-start gap-[30px] md:grid-cols-[0.7fr_1.3fr] md:gap-[35px] lg:grid-cols-[0.8fr_1.2fr] lg:gap-[75px]`}
            >
              <m.aside
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={IN_VIEW}
                transition={{ duration: 0.6 }}
                className="md:sticky md:top-[120px] md:pt-3"
              >
                <span className={EYEBROW}>LET’S GET YOU SORTED</span>
                <h2 className="mt-4 font-serif text-[38px] font-medium italic leading-[1.12] tracking-[-1.5px] sm:text-[40px] lg:text-[48px]">
                  <SplitText text="Your next refill, a few taps away." delay={30} duration={0.8} splitType="words" />
                </h2>
                <p className="mb-2.5 mt-[22px] text-[13px] text-gm-muted sm:text-sm md:mb-[22px] md:max-w-[320px]">
                  Choose a branch, tell us what you need, and we’ll take it from there on WhatsApp.
                </p>
                <div className="mb-5 mt-[34px] hidden max-w-[300px] border-y border-[#cbd7c2] py-[25px] md:block">
                  <MessageCircle size={25} />
                  <h3 className="mb-2 mt-3 text-base">People, not just a checkout.</h3>
                  <p className="text-xs text-gm-muted">
                    Your request goes to our team. Availability and final price are confirmed in chat before your order
                    is processed.
                  </p>
                </div>
                <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
                  Prefer to chat directly? <ArrowUpRight size={18} />
                </a>
              </m.aside>

              <m.form
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ ...IN_VIEW, amount: 0.1 }}
                transition={{ duration: 0.6 }}
                className="min-w-0 rounded-[19px] border border-[#dde5d5] bg-white px-[17px] py-[22px] shadow-[0_12px_50px_#1f392008] sm:rounded-3xl sm:p-[30px] md:p-[25px] lg:p-8"
                onSubmit={(e) => e.preventDefault()} // Let SlideCommit handle submission
                aria-busy={busy}
              >
                <div className="flex items-center gap-2.5 border-b border-[#e8ede4] pb-[26px] sm:gap-[13px]">
                  <span className={`${CIRCLE_ICON} size-9 sm:size-[43px]`}>
                    <Pill size={24} />
                  </span>
                  <div>
                    <h3 className="text-[17px] font-semibold tracking-[-0.6px] sm:text-[19px]">
                      Start your medicine request
                    </h3>
                    <p className="mt-1 text-[10px] text-gm-muted sm:text-[11px]">A little information. A lot less hassle.</p>
                  </div>
                </div>
                <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
                  <legend className="sr-only">Medicine request details</legend>
                  <div className={FORM_BLOCK}>
                    <h4 className={BLOCK_TITLE}>
                      <span className={BLOCK_NUMBER}>01</span> What do you need?
                    </h4>
                    <div className="mb-[18px] flex gap-1 rounded-xl bg-[#f1f4ed] p-1" aria-label="Order method">
                      {(["type", "prescription"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={mode === value}
                          className={`flex flex-1 items-center justify-center gap-[5px] rounded-[9px] border-0 px-[5px] py-3 text-[10px] sm:gap-2 sm:px-[7px] sm:py-[11px] sm:text-[11px] ${mode === value ? "bg-white font-[650] text-gm-ink shadow-[0_2px_5px_#0000000a]" : "bg-transparent text-[#586652]"}`}
                          onClick={() => {
                            setMode(value);
                            invalidate();
                          }}
                        >
                          {value === "type" ? <Pill className="size-[15px] sm:size-[17px]" /> : <FileText className="size-[15px] sm:size-[17px]" />}
                          {value === "type" ? "Type medicines" : "Upload prescription"}
                        </button>
                      ))}
                    </div>
                    {mode === "type" ? (
                      <m.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className={LABEL}>
                        Medicine names & quantities
                        <textarea
                          required
                          maxLength={1800}
                          rows={4}
                          value={medicines}
                          onChange={(e) => {
                            setMedicines(e.target.value);
                            invalidate();
                          }}
                          placeholder={"e.g. Medicine name + strength — 2 strips\nAdd the quantity you need for each item."}
                          className={`${INPUT} min-h-[120px] resize-y leading-[1.7]`}
                        />
                        <span className={HELPER}>Include the strength and quantity, if you know them.</span>
                      </m.label>
                    ) : (
                      <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                        <div
                          className={`rounded-[13px] border-[1.5px] border-dashed p-4 transition ${drag ? "scale-[1.02] border-gm-ink bg-[#e8f3d8]" : "border-[#bdcdb1] bg-[#f8faf4]"}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDrag(true);
                          }}
                          onDragLeave={() => setDrag(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDrag(false);
                            if (e.dataTransfer.files.length > 1) {
                              setError("Please select one prescription image.");
                              return;
                            }
                            selectFile(e.dataTransfer.files[0]);
                          }}
                        >
                          <input
                            ref={fileInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                            className="sr-only"
                            tabIndex={-1}
                            aria-label="Prescription image"
                            onChange={(e) => {
                              selectFile(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                          {file ? (
                            <div className="flex min-w-0 items-center gap-3">
                              {preview && !previewFailed ? (
                                // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image cannot optimise it
                                <img
                                  src={preview}
                                  alt="Your selected prescription"
                                  onError={() => setPreviewFailed(true)}
                                  className="h-[82px] w-[65px] rounded-[5px] bg-white object-contain"
                                />
                              ) : (
                                <FileText size={36} />
                              )}
                              <div className="min-w-0 flex-1">
                                <strong className="block text-[11px] [overflow-wrap:anywhere]">{file.name}</strong>
                                <small className="block text-[10px] text-gm-muted">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB · Selected
                                  {previewFailed ? " · Preview unavailable for this format" : ""}
                                </small>
                                <button
                                  type="button"
                                  className={`${TEXT_LINK} text-[10px] sm:text-[10px]`}
                                  onClick={() => fileInput.current?.click()}
                                >
                                  Choose another image
                                </button>
                              </div>
                              <button
                                type="button"
                                className={`${ICON_BTN} size-8 shrink-0`}
                                aria-label="Remove prescription"
                                onClick={() => {
                                  setFile(null);
                                  cachedUpload.current = null;
                                  setConsent(false);
                                  invalidate();
                                }}
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="flex w-full flex-col items-center gap-2.5 border-0 bg-transparent py-[18px] text-gm-ink"
                              onClick={() => fileInput.current?.click()}
                            >
                              <span className={CIRCLE_ICON}>
                                <UploadCloud size={26} />
                              </span>
                              <strong className="text-[11px] sm:text-xs">Click to upload or drop your image</strong>
                              <span className="text-[10px] text-gm-muted">JPG, PNG, WEBP, HEIC · Up to 15 MB</span>
                            </button>
                          )}
                        </div>
                        <label className="mt-3.5 flex items-start gap-2 text-[10px] text-gm-muted">
                          <input
                            type="checkbox"
                            required
                            checked={consent}
                            className="mt-[3px] shrink-0 accent-gm-ink"
                            onChange={(e) => {
                              setConsent(e.target.checked);
                              invalidate();
                            }}
                          />
                          <span>
                            I agree to upload my prescription to Cloudinary and share its link with the pharmacy on
                            WhatsApp. Anyone with the link can view it.{" "}
                            <a href="#privacy" className="underline">
                              Details
                            </a>
                          </span>
                        </label>
                      </m.div>
                    )}
                  </div>

                  <div className={FORM_BLOCK}>
                    <h4 className={BLOCK_TITLE}>
                      <span className={BLOCK_NUMBER}>02</span> Choose your preferred branch
                    </h4>
                    {ALWAYS_OPEN_NOTICE && (
                      <p className="mb-3.5 flex items-center gap-2.5 rounded-[11px] border border-[#cfe0b8] bg-[linear-gradient(90deg,#f2f7e9,#fbfcf8)] px-3 py-2.5 text-[11px] text-gm-ink">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gm-ink text-gm-lime">
                          <Clock size={14} />
                        </span>
                        <span>
                          <strong className="block font-[650]">{ALWAYS_OPEN_NOTICE}</strong>
                          <small className="text-[10px] text-gm-muted">Day or night, choose it for urgent requests.</small>
                        </span>
                      </p>
                    )}
                    <div className="grid gap-2">
                      {BRANCHES.map((item, index) => (
                        <label key={item.name} className={RADIO_CARD}>
                          <input
                            type="radio"
                            name="branch"
                            className={RADIO_INPUT}
                            checked={branch === index}
                            onChange={() => chooseBranch(index)}
                          />
                          <span className={RADIO_CONTENT}>
                            <span className="min-w-0">
                              <strong className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                                {item.name}
                                {item.open24x7 && <OpenAllHoursBadge compact />}
                              </strong>
                              <small className="mt-0.5 block text-[10px] text-gm-muted">{item.area}</small>
                            </span>
                            <span className={RADIO_DOT} />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className={FORM_BLOCK}>
                    <h4 className={BLOCK_TITLE}>
                      <span className={BLOCK_NUMBER}>03</span> Where are we delivering?
                    </h4>
                    {hasSavedProfile && (
                      <p
                        className="mb-4 flex items-center gap-2 rounded-[10px] bg-[#f2f7e9] px-3 py-2.5 text-[11px] text-[#3d632b]"
                        role="status"
                      >
                        <Check size={15} /> Welcome back. We filled in your saved details.
                        <button
                          type="button"
                          className="ml-auto font-semibold underline underline-offset-2"
                          onClick={() => void forgetSavedDetails()}
                        >
                          Forget them
                        </button>
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-x-2.5 gap-y-[15px] min-[361px]:grid-cols-2 sm:gap-x-3 sm:gap-y-4">
                      {CUSTOMER_FIELDS.map((field) => (
                        <label key={field.key} className={`${LABEL} ${field.key === "house" ? "col-span-full" : ""}`}>
                          {field.label}
                          <input
                            name={field.key}
                            type={field.key === "phone" ? "tel" : "text"}
                            inputMode={field.key === "phone" ? "numeric" : undefined}
                            pattern={field.key === "phone" ? "[6-9][0-9]{9}" : undefined}
                            title={
                              field.key === "phone"
                                ? "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9"
                                : undefined
                            }
                            autoComplete={field.auto}
                            required={field.key !== "landmark"}
                            maxLength={field.max}
                            value={customer[field.key]}
                            placeholder={field.placeholder}
                            className={INPUT}
                            onChange={(e) => {
                              userEdited.current = true;
                              setCustomer((prev) => ({
                                ...prev,
                                [field.key]:
                                  field.key === "phone" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value,
                              }));
                              invalidate();
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <p className={HELPER}>
                      <MapPin size={13} /> Goregaon East, Mumbai · Coverage confirmed in chat
                    </p>
                    <label className="mt-3.5 flex items-start gap-2 text-[10px] text-gm-muted">
                      <input
                        type="checkbox"
                        checked={rememberDetails}
                        className="mt-[3px] shrink-0 accent-gm-ink"
                        onChange={(e) => setRememberDetails(e.target.checked)}
                      />
                      <span>
                        Save my name, number and address on this device for faster checkout next time. Kept for 180 days
                        after my last order.
                      </span>
                    </label>
                  </div>

                  <div className="pb-[22px] pt-[22px] sm:pt-6">
                    <h4 className={BLOCK_TITLE}>
                      <span className={BLOCK_NUMBER}>04</span> Pay when it arrives
                    </h4>
                    <div className="grid grid-cols-2 gap-[7px] min-[361px]:gap-2.5">
                      {(["cod", "upi"] as const).map((value) => (
                        <label className={RADIO_CARD} key={value}>
                          <input
                            type="radio"
                            name="payment"
                            className={RADIO_INPUT}
                            checked={payment === value}
                            onChange={() => {
                              userEdited.current = true;
                              setPayment(value);
                              invalidate();
                            }}
                          />
                          <span className={RADIO_CONTENT}>
                            {value === "cod" ? (
                              <Banknote className="size-[19px] min-[361px]:size-6" />
                            ) : (
                              <QrCode className="size-[19px] min-[361px]:size-6" />
                            )}
                            <span>
                              <strong className="block text-[11px] font-semibold">
                                {value === "cod" ? "Cash" : "UPI / QR"}
                              </strong>
                              <small className="mt-0.5 block text-[10px] text-gm-muted">At delivery</small>
                            </span>
                            <span className={RADIO_DOT} />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </fieldset>

                <div className="mb-[18px] rounded-[14px] border border-[#e1e8d9] bg-[#f8faf4] p-4" aria-live="polite">
                  <h4 className="mb-3 text-[11px] font-[650] uppercase tracking-[1px] text-[#728268]">Order summary</h4>
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-gm-muted">Medicines</span>
                    <span className="text-right font-semibold">Priced by the pharmacy in chat</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-gm-muted">Delivery</span>
                    <DeliveryBadge charge={deliveryCharge} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-[#d5dfcb] pt-3 text-xs font-[650]">
                    <span>Estimated total</span>
                    <span className="text-right">{estimatedTotal}</span>
                  </div>
                </div>

                {error && (
                  <m.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    ref={errorRef}
                    tabIndex={-1}
                    role="alert"
                    className="mb-[15px] flex items-start gap-[9px] rounded-[10px] border border-[#f2d1c6] bg-[#fff0eb] p-3.5 text-xs text-[#9a3826]"
                  >
                    <AlertCircle size={20} />
                    <span>{error}</span>
                  </m.div>
                )}

                {busy && (
                  <div className="mb-4 text-[11px]" role="status">
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      {mode === "prescription"
                        ? progress < 100
                          ? `Uploading prescription… ${progress}%`
                          : "Image sent. Waiting for upload confirmation…"
                        : "Preparing your WhatsApp message…"}
                    </span>
                    {mode === "prescription" && (
                      <progress max={100} value={progress} aria-label="Upload progress" className="mt-2.5 h-[7px] w-full accent-gm-ink" />
                    )}
                  </div>
                )}

                {readyUrl ? (
                  <m.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 rounded-xl bg-[#eef6e3] p-[18px]"
                    role="status"
                  >
                    <Check size={22} />
                    <div>
                      <strong className="text-sm">Your message is ready.</strong>
                      <p className="mb-3 mt-2 text-xs">
                        Tap Send in WhatsApp to submit your request. Your order is confirmed only after our team replies.
                      </p>
                      <div className="mb-4">
                        <DeliveryBadge charge={deliveryCharge} />
                      </div>
                      <a href={readyUrl} className={`${BTN} ${BTN_DARK} min-h-10 px-4 py-3 text-[11px]`}>
                        Open WhatsApp again <ArrowUpRight size={18} />
                      </a>
                      <button type="button" className={`${TEXT_LINK} mt-2 flex`} onClick={() => setReadyUrl("")}>
                        Edit request
                      </button>
                    </div>
                  </m.div>
                ) : (
                  <div className="flex w-full justify-center pt-1 sm:pt-2.5">
                    <SlideCommit
                      label="Slide to WhatsApp"
                      doneLabel="Message Ready"
                      errorLabel="Check Details"
                      onConfirm={placeOrder}
                      trackColor="#153f34"
                      handleColor="#d8ef8d"
                      successColor="#418768"
                      dangerColor="#9a3826"
                      width={310}
                      disabled={busy}
                    />
                  </div>
                )}
                <p className="mt-[18px] px-[5px] text-center text-[9px] text-gm-muted sm:px-0">
                  No payment now. Send the message on WhatsApp to request your order.
                </p>
              </m.form>
            </div>
          </section>

          <section id="branches" className={`${CONTAINER} ${SECTION} ${SCROLL_OFFSET}`}>
            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={IN_VIEW}
              variants={fadeInUp}
              className="mb-7 sm:flex sm:items-end sm:justify-between sm:gap-6 md:mb-9"
            >
              <div>
                <span className={EYEBROW}>AROUND THE CORNER</span>
                <h2 className={SPLIT_H2}>
                  <SplitText text="Three branches. One neighbourhood." delay={30} duration={0.8} splitType="words" />
                </h2>
              </div>
              <p className="mt-[18px] text-xs leading-[1.9] text-gm-muted sm:mt-0 sm:pb-1 sm:text-[11px] md:text-[13px]">
                Familiar faces, local care.
                <br />
                Find the branch closest to you.
              </p>
            </m.div>

            <m.div
              initial="hidden"
              whileInView="visible"
              viewport={IN_VIEW}
              variants={staggerContainer}
              className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-3 lg:gap-[22px]"
            >
              {BRANCHES.map((item, index) => (
                <m.article
                  variants={fadeInUp}
                  className={`overflow-hidden rounded-[18px] border bg-white ${item.open24x7 ? "border-[#b8cf98] shadow-[0_10px_30px_#153f340d]" : "border-[#e0e5da]"}`}
                  key={item.name}
                >
                  <div
                    className={`relative h-[185px] overflow-hidden sm:h-[170px] lg:h-[196px] ${TONE_STYLES[item.tone].art}`}
                    aria-hidden="true"
                  >
                    <span className="absolute left-5 top-[18px] text-[8px] tracking-[1.4px] sm:left-3 sm:text-[6px] lg:left-5 lg:top-[17px] lg:text-[8px]">
                      0{index + 1} / GOREGAON EAST
                    </span>
                    <div className="absolute -bottom-[5px] left-[calc(50%-95px)] w-[190px] rounded-t-[5px] border border-[#95a689] bg-[#f8faf3] shadow-[10px_6px_0_#8c9e7528] sm:left-[calc(50%-72px)] sm:w-[145px] lg:left-[calc(50%-89px)] lg:w-[178px]">
                      <div
                        className={`flex h-[34px] items-center justify-center gap-[5px] rounded-t text-[10px] font-[650] text-white sm:text-[7px] lg:text-[9px] ${TONE_STYLES[item.tone].sign}`}
                      >
                        <Plus size={16} />
                        {item.name}
                      </div>
                      <div className="-ml-[5px] h-5 w-[calc(100%+10px)] -skew-x-6 border-b border-[#9eac8e] bg-[repeating-linear-gradient(90deg,#d2dfbc_0_17px,#f6f7ec_17px_34px)]" />
                      <div className="flex h-[88px] gap-[7px] p-3">
                        <span className="grid flex-1 place-items-center border border-[#aabd9c] bg-[#dce6d1] text-[#6a8559]">
                          <Plus size={31} />
                        </span>
                        <span className="flex-[0.7] border border-[#aabd9c] bg-[#b9caae]" />
                        <span className="flex-1 border border-[#aabd9c] bg-[#dce6d1]" />
                      </div>
                    </div>
                    <span className="absolute bottom-[25px] right-6 grid size-9 place-items-center rounded-full bg-white shadow-[0_5px_15px_#1e321b15] sm:right-3 sm:size-[30px] lg:bottom-6 lg:right-[22px] lg:size-[37px]">
                      <MapPin size={20} />
                    </span>
                  </div>
                  <div className="p-[23px] sm:p-[15px] md:p-5 lg:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`${EYEBROW} text-[8px] tracking-[1.2px] md:text-[8px] md:tracking-[1.2px]`}>
                        {item.area}
                      </span>
                      {item.open24x7 && <OpenAllHoursBadge compact />}
                    </div>
                    <h3 className="mt-2 text-[21px] font-[550] tracking-[-0.5px] sm:text-base lg:text-[19px]">{item.name}</h3>
                    <p className="mb-[21px] mt-3 text-xs leading-[1.85] text-gm-muted sm:mb-[18px] sm:min-h-[130px] sm:text-[10px] md:min-h-[105px] lg:min-h-[83px] lg:text-[11px]">
                      {item.address}
                    </p>
                    <div className="flex justify-between gap-2 border-t border-[#e4e9df] pt-4 sm:flex-col sm:gap-3 md:flex-row md:gap-2">
                      <a
                        className="flex min-h-[30px] items-center gap-1.5 text-[11px] font-semibold sm:min-h-0 sm:text-[10px]"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ", " + item.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Get directions <Navigation size={15} />
                      </a>
                      <a
                        className="flex min-h-[30px] items-center gap-1.5 text-[11px] font-semibold sm:min-h-0 sm:text-[10px]"
                        href="#order"
                        onClick={() => chooseBranch(index)}
                      >
                        Order here <ArrowUpRight size={17} />
                      </a>
                    </div>
                  </div>
                </m.article>
              ))}
            </m.div>
          </section>

          <section
            id="about"
            className={`${CONTAINER} ${SCROLL_OFFSET} grid grid-cols-1 items-center gap-8 sm:grid-cols-2 sm:gap-[30px] sm:pb-[25px] sm:pt-3 md:gap-10 lg:gap-[75px]`}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
              whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
              viewport={IN_VIEW}
              transition={{ duration: 0.6 }}
              className="relative min-h-[320px] overflow-hidden rounded-3xl bg-gm-ink p-[31px] text-gm-lime after:absolute after:-right-[120px] after:-top-[100px] after:size-[270px] after:rounded-full after:border after:border-[#ffffff15] after:content-[''] sm:min-h-[370px] sm:p-[25px] md:p-8 lg:min-h-[390px] lg:p-[45px]"
            >
              <Heart strokeWidth={1} className="size-[55px] sm:size-[70px]" />
              <span className="mb-[27px] mt-6 block font-serif text-[43px] leading-[1.1] tracking-[-2px] sm:text-[37px] md:text-[43px] lg:text-[48px]">
                Good health.
                <br />
                Great neighbours.
              </span>
              <small className="text-[8px] tracking-[2px] text-[#bbcdb5]">GOREGAON EAST · MUMBAI</small>
              <div className="absolute bottom-6 right-6 size-[84px] rotate-[15deg] rounded-full border border-[#d8ef8d55] pt-3 text-center text-[7px] leading-[1.5] sm:bottom-[17px] sm:right-[15px] sm:size-[73px] sm:text-[6px] md:bottom-[25px] md:right-[23px] md:size-[90px] md:text-[8px]">
                LOCAL
                <br />
                <Plus size={24} className="inline align-middle" />
                <br />
                AT HEART
              </div>
            </m.div>
            <m.div initial="hidden" whileInView="visible" viewport={IN_VIEW} variants={fadeInUp}>
              <span className={EYEBROW}>A NOTE FROM YOUR NEIGHBOURHOOD</span>
              <h2 className={SPLIT_H2}>
                <SplitText text="A familiar name. A little more care." delay={30} duration={0.8} splitType="words" />
              </h2>
              <p className="mt-5 text-[13px] leading-[1.9] text-gm-muted sm:text-xs md:text-[13px]">
                Goregaonmeds brings Apple Pharmacy, Lotus Pharmacy and Healthzone & Cosmetic together in one simple place.
              </p>
              <p className="mt-5 text-[13px] leading-[1.9] text-gm-muted sm:text-xs md:text-[13px]">
                Managed by Hiralal Choudhary, our aim is straightforward: make it easier for people in Goregaon East to
                connect with their local pharmacy, without adding another errand to the day.
              </p>
              <a className={`${TEXT_LINK} mt-[22px]`} href={`tel:+${PHONE}`}>
                Say hello to our team <ArrowUpRight size={18} />
              </a>
            </m.div>
          </section>

          <section
            className={`${CONTAINER} ${SECTION} ${SCROLL_OFFSET} grid grid-cols-1 gap-[15px] sm:grid-cols-[0.8fr_1.2fr] sm:gap-[30px] md:gap-10 lg:gap-[75px]`}
            id="faq"
          >
            <m.div initial="hidden" whileInView="visible" viewport={IN_VIEW} variants={fadeInUp}>
              <span className={EYEBROW}>GOOD TO KNOW</span>
              <h2 className={SPLIT_H2}>
                <SplitText text="A few helpful answers." delay={30} duration={0.8} splitType="words" />
              </h2>
              <p className="mb-1 mt-6 text-[13px] text-gm-muted">Something else on your mind?</p>
              <a className={TEXT_LINK} href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer">
                Ask us on WhatsApp <ArrowUpRight size={17} />
              </a>
            </m.div>
            <m.div initial="hidden" whileInView="visible" viewport={IN_VIEW} variants={staggerContainer}>
              {FAQ.map(([question, answer]) => (
                <m.details variants={fadeInUp} key={question} className="group border-b border-[#dce2d6]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[22px] text-xs font-semibold sm:py-[23px] sm:text-[13px]">
                    {question}
                    <ChevronDown size={19} className="transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="pb-[23px] pr-[25px] text-xs leading-[1.9] text-gm-muted">{answer}</p>
                </m.details>
              ))}
            </m.div>
          </section>

          <m.section
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={IN_VIEW}
            transition={{ duration: 0.6 }}
            className={`${CONTAINER} mb-[45px] flex flex-col items-start gap-[25px] rounded-[18px] bg-gm-ink p-[27px] text-white sm:mb-[55px] sm:flex-row sm:items-center sm:justify-between sm:rounded-[22px] sm:p-[30px] lg:mb-20 lg:px-[42px] lg:py-[38px]`}
          >
            <div>
              <span className={`${EYEBROW} text-[#bcccab] md:text-[8px]`}>YOUR NEXT ERRAND? ALREADY EASIER.</span>
              <h2 className="mt-2 text-[31px] font-medium leading-[1.12] tracking-[-2px] sm:text-[30px] lg:text-[37px]">
                Let’s take care of it.
              </h2>
            </div>
            <m.a
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              href="#order"
              className={`${BTN} min-h-12 bg-gm-lime text-xs text-gm-ink sm:text-[13px]`}
            >
              Start your request <ArrowUpRight size={21} />
            </m.a>
          </m.section>
        </main>

        <footer className="border-t border-[#dce2d6] bg-[#eef1e8] pb-[100px] pt-[38px] sm:pb-5 sm:pt-[55px]">
          <div className={CONTAINER}>
            <div className="grid grid-cols-2 gap-x-5 gap-y-[30px] pb-10 md:grid-cols-[1.3fr_0.7fr_1fr_1.2fr] md:gap-6 lg:gap-10">
              <div className="max-sm:col-span-full">
                <Brand compact />
                <p className="mt-[19px] text-xs leading-[1.9] text-[#6b7766]">
                  Your neighbourhood pharmacy.
                  <br />
                  Now, a message away.
                </p>
              </div>
              <div>
                <h3 className="mb-[18px] text-[11px] font-bold">Explore</h3>
                <a className={FOOTER_LINK} href="#order">Order medicines</a>
                <a className={FOOTER_LINK} href="#branches">Our branches</a>
                <a className={FOOTER_LINK} href="#about">Our story</a>
                <a className={FOOTER_LINK} href="#faq">FAQs</a>
              </div>
              <div>
                <h3 className="mb-[18px] text-[11px] font-bold">Let’s connect</h3>
                <a className={FOOTER_LINK} href={`tel:+${PHONE}`}>
                  +91 84338 18771 <ArrowUpRight size={14} />
                </a>
                <a className={FOOTER_LINK} href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp us <ArrowUpRight size={14} />
                </a>
                <span className={FOOTER_LINK}>Goregaon East, Mumbai</span>
                {ALWAYS_OPEN_NOTICE && (
                  <span className={FOOTER_LINK}>
                    <Clock size={13} /> {ALWAYS_OPEN_NOTICE}
                  </span>
                )}
              </div>
              <div id="privacy" className={`max-sm:col-span-full ${SCROLL_OFFSET}`}>
                <h3 className="mb-[18px] text-[11px] font-bold">Your information</h3>
                <p className="text-[11px] leading-[1.9] text-[#6b7766] sm:text-[10px]">
                  Details you enter are included in your WhatsApp message. Uploaded prescriptions are stored on
                  Cloudinary with a shareable link. If you choose to save your delivery details, they are stored on our
                  server for 180 days after your last order; use &ldquo;Forget them&rdquo; in the order form to delete
                  them. Contact our team to request deletion of an uploaded image.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-[18px] border-t border-[#d7e0cf] pt-5 text-[9px] text-gm-muted md:flex-nowrap">
              <span>© {new Date().getFullYear()} Goregaonmeds</span>
              <span className="order-3 w-full md:order-none md:w-auto">
                Availability, pricing and delivery are confirmed by the pharmacy.
              </span>
              <a href="/admin" className="no-underline opacity-30" title="Admin Portal">
                🔒
              </a>
              <a href="#home">Back to top ↑</a>
            </div>
          </div>
        </footer>
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-[#d7dfd0] bg-[#f7f8f2f5] px-[18px] pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-[14px] sm:hidden">
          <a
            href={`tel:+${PHONE}`}
            aria-label="Call the pharmacy"
            className="grid h-[46px] min-w-[46px] place-items-center rounded-full border border-[#d5dfcd]"
          >
            <Phone size={21} />
          </a>
          <a className={`${BTN} ${BTN_DARK} min-h-[46px] flex-1 py-[11px] text-xs`} href="#order">
            Order medicines <ArrowUpRight size={18} />
          </a>
        </div>
      </div>
    </LazyMotion>
  );
}
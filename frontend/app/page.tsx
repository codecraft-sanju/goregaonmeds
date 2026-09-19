"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import "./pharmacy.css"; // IMPORTANT: Replace with your actual path

// --- React Bits Components ---
// Make sure these files exist in your folder as you provided them
import SlideCommit from "./SlideCommit";
import SplitText from "./SplitText";
import StrokeText from "./StrokeText";
import TextType from "./TextType";
import imageCompression from "browser-image-compression";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
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

const PHONE = "919987732967";
const API = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:5000" : "")
).replace(/\/+$/, "");

const BRANCHES = [
  {
    name: "Apple Pharmacy",
    area: "Aarey Road",
    address:
      "Shop No. 9, Sheetal Krupa Building, Ground Floor, Aarey Road, Goregaon East, Mumbai",
    tone: "apple",
  },
  {
    name: "Lotus Pharmacy",
    area: "Jay Prakash Nagar",
    address:
      "Shop No. 10, Shreyas Bhavan, Jay Prakash Nagar Road No. 1, opposite Domino’s Pizza, Goregaon East, Mumbai",
    tone: "lotus",
  },
  {
    name: "Healthzone & Cosmetic",
    area: "Aarey Road",
    address:
      "Pednekar Chawl, Shop No. 3, Ground Floor, S.V., Aarey Road, Goregaon East, Mumbai",
    tone: "health",
  },
];

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
    "Our branches serve Goregaon East. Share your full address so the team can confirm coverage, delivery timing and any applicable delivery charge on WhatsApp.",
  ],
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

function Brand() {
  return (
    <a className="gm-brand" href="#home" aria-label="Goregaonmeds home">
      <span className="gm-mark gm-mark-logo">
        <Image
          src="/logo.png"
          alt=""
          width={44}
          height={44}
          priority
          className="gm-logo-img"
        />
      </span>

      <span>
        goregaon<span className="gm-brand-light">meds</span>
        <small>YOUR NEIGHBOURHOOD PHARMACY</small>
      </span>
    </a>
  );
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
  const [customer, setCustomer] = useState<Customer>({
    name: "",
    phone: "",
    house: "",
    area: "",
    landmark: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [readyUrl, setReadyUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  const submitting = useRef(false);
  const cachedUpload = useRef<{ file: File; url: string } | null>(null);

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

  function invalidate() {
    setReadyUrl("");
    setError("");
  }

 function selectFile(next?: File) {
    if (!next || submitting.current) return;
    invalidate();
    
    // Limit increased to 15MB since compression will handle the rest
    if (next.size > 15 * 1024 * 1024) {
      setError("Please choose an image smaller than 15 MB.");
      return;
    }
    
    if (
      !next.size ||
      !(
        /\.(jpe?g|png|webp|heic|heif)$/i.test(next.name) ||
        [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(next.type)
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
  if (cachedUpload.current?.file === selected)
    return Promise.resolve(cachedUpload.current.url);

  return new Promise(async (resolve, reject) => { // 'async' add kiya yaha
    if (!API) {
      reject(
        new Error(
          "Prescription upload is not configured. Please send your image directly on WhatsApp.",
        ),
      );
      return;
    }

    // --- NEW COMPRESSION LOGIC START ---
    let fileToUpload = selected;
    try {
      const options = {
        maxSizeMB: 0.8, // Image size ko ~800KB tak limit karega
        maxWidthOrHeight: 1920, // Prescription padhne ke liye enough resolution
        useWebWorker: true,
      };
      // Compress the image
      fileToUpload = await imageCompression(selected, options);
    } catch (error) {
      console.warn("Image compression failed, falling back to original", error);
      // Agar kisi wajah se fail hua, toh original file hi upload hone denge
    }
    // --- NEW COMPRESSION LOGIC END ---

    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open("POST", `${API}/api/upload`);
    xhr.timeout = 75000;
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    
    xhr.onerror = () =>
      reject(
        new Error(
          "Could not connect to the upload service. Check your connection or send the image directly on WhatsApp.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error(
          "Upload took too long. Please retry or send the image directly on WhatsApp.",
        ),
      );
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
      try {
        if (!data.url || new URL(data.url).protocol !== "https:")
          throw new Error();
      } catch {
        reject(new Error("Upload service returned an invalid image link."));
        return;
      }
      cachedUpload.current = { file: selected, url: data.url! };
      resolve(data.url!);
    };

    const body = new FormData();
    // Use the compressed file (fileToUpload) instead of original (selected)
    const ext = fileToUpload.name.split(".").pop()?.toLowerCase();
    const mime =
      fileToUpload.type ||
      (
        {
          heic: "image/heic",
          heif: "image/heif",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
        } as Record<string, string>
      )[ext || ""] ||
      "application/octet-stream";
      
    // fileToUpload ka use kiya hai buffer create karne ke liye
    body.append("image", new Blob([fileToUpload], { type: mime }), fileToUpload.name);
    xhr.send(body);
  });
}

  // Modified to work smoothly with <SlideCommit />
  async function placeOrder() {
    if (submitting.current) return Promise.reject(new Error("Already submitting"));
    invalidate();
    if (
      !customer.name.trim() ||
      !customer.house.trim() ||
      !customer.area.trim()
    ) {
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

    try {
      const imageUrl =
        mode === "prescription" ? await uploadPrescription(file!) : "";
      const address = [
        customer.house.trim(),
        customer.area.trim(),
        customer.landmark.trim() ? `Near ${customer.landmark.trim()}` : "",
        "Goregaon East, Mumbai",
      ]
        .filter(Boolean)
        .join(", ");
      const message = `*New medicine request | Goregaonmeds*\n\n*Customer*\nName: ${customer.name.trim()}\nPhone: ${customer.phone}\nAddress: ${address}\n\n*Preferred branch*\n${BRANCHES[branch].name}\n\n*Medicines / prescription*\n${imageUrl || medicines.trim()}\n\n*Payment preference*\n${payment === "upi" ? "UPI at delivery" : "Cash on delivery"}\n\nPlease confirm availability, total price and delivery details.`;
      const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;
      
      setReadyUrl(url);
      window.location.assign(url);
      
      // Resolve for SlideCommit success animation
      return Promise.resolve(url); 
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      return Promise.reject(err);
    } finally {
      request.current = null;
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="gm" id="home">
      <a href="#order" className="gm-skip">
        Skip to order form
      </a>
      
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="gm-announcement"
      >
        <span>
          <MapPin size={13} /> Made for Goregaon East
        </span>
        <span>
          Local care. A little closer. <Heart size={13} />
        </span>
      </motion.div>

      <header className="gm-header">
        <div className="gm-container gm-nav">
          <Brand />
          <nav className="gm-desktop-nav" aria-label="Main navigation">
            <a href="#how">How it works</a>
            <a href="#branches">Our branches</a>
            <a href="#about">About us</a>
          </nav>
          <a className="gm-btn gm-btn-small gm-dark gm-header-cta" href="#order">
            Order medicines <ArrowUpRight size={17} />
          </a>
          <button
            className="gm-icon-btn gm-menu-toggle"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="mobile-navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
        {menu && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            id="mobile-navigation"
            className="gm-mobile-nav"
            aria-label="Mobile navigation"
          >
            {[
              ["#how", "How it works"],
              ["#branches", "Our branches"],
              ["#about", "About us"],
              ["#order", "Order medicines"],
            ].map(([href, title]) => (
              <a key={href} href={href} onClick={() => setMenu(false)}>
                {title}
                <ArrowUpRight size={18} />
              </a>
            ))}
          </motion.nav>
        )}
      </header>

      <main>
        <section className="gm-container gm-hero relative">
          
          {/* Stunning Background Watermark using StrokeText */}
          <div className="gm-hero-stroke">
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

          <motion.div 
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="gm-hero-copy relative z-10"
          >
            <span className="gm-eyebrow">
              <span className="gm-dot" /> YOUR LOCAL PHARMACY, REIMAGINED
            </span>
            
            <h1>
              Care, closer
              <br />
              to <span className="gm-serif">home.</span>
              <motion.span 
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="gm-heading-star" 
                aria-hidden="true"
              >
                ✳
              </motion.span>
            </h1>
            
            <div className="gm-hero-desc">
              <TextType 
                text={[
                  "Your everyday medicines.",
                  "Your neighbourhood people.",
                  "Request what you need, let's take care of the rest."
                ]}
                typingSpeed={35}
                pauseDuration={1800}
                showCursor={true}
                cursorCharacter="|"
                className="gm-text-type"
              />
            </div>

            <div className="gm-actions">
              <a href="#order" className="gm-btn gm-dark">
                Get your medicines <ArrowUpRight size={20} />
              </a>
              <a href={`tel:+${PHONE}`} className="gm-text-link">
                <Phone size={17} /> Talk to us
              </a>
            </div>
            <div className="gm-hero-note">
              <span className="gm-mini-icon">
                <Check size={15} />
              </span>{" "}
              Pay at delivery <i /> Order on WhatsApp
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="gm-hero-art"
            aria-label="Illustration of a neighbourhood pharmacy delivery bag"
          >
            <div className="gm-orbit gm-orbit-one" />
            <div className="gm-orbit gm-orbit-two" />
            <span className="gm-art-label">A LITTLE CARE, DELIVERED.</span>
            <div className="gm-float gm-float-top">
              <span className="gm-circle-icon">
                <MapPin size={20} />
              </span>
              <div>
                <strong>Rooted in your neighbourhood</strong>
                <small>3 branches · Goregaon East</small>
              </div>
            </div>
            <div className="gm-bag">
              <div className="gm-bag-handle" />
              <div className="gm-bag-face">
                <span className="gm-bag-cross">
                  <Plus size={64} strokeWidth={3} />
                </span>
                <strong>
                  feel better.
                  <br />
                  live better.
                </strong>
                <span>goregaonmeds</span>
                <div className="gm-bag-line" />
              </div>
            </div>
            <div className="gm-pill gm-pill-one" />
            <div className="gm-pill gm-pill-two" />
            <div className="gm-float gm-float-bottom">
              <span className="gm-circle-icon gm-lime">
                <Truck size={21} />
              </span>
              <div>
                <strong>From our neighbourhood</strong>
                <small>To your doorstep</small>
              </div>
              <ArrowUpRight size={20} />
            </div>
            <span className="gm-art-star" aria-hidden="true">
              ✳
            </span>
          </motion.div>
        </section>

        {/* Bi-directional scroll setting: once: false */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
          variants={staggerContainer}
          className="gm-benefit-strip"
        >
          <div className="gm-container">
            {[
              [ShoppingBag, "Medicine requests, simplified"],
              [MapPin, "Three local branches"],
              [QrCode, "Cash or UPI at delivery"],
              [MessageCircle, "A real conversation"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof ShoppingBag;
              return (
                <motion.span variants={fadeInUp} key={String(text)}>
                  <I size={19} />
                  {String(text)}
                </motion.span>
              );
            })}
          </div>
        </motion.div>

        <section id="how" className="gm-container gm-section">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            variants={fadeInUp} 
            className="gm-section-heading"
          >
            <div>
              <span className="gm-eyebrow">LESS EFFORT. MORE CARE.</span>
              <h2 className="gm-split-wrap">
                <SplitText
                  text="One less thing on your to-do list."
                  delay={30}
                  duration={0.8}
                  splitType="words"
                  threshold={0.1}
                />
              </h2>
            </div>
            <p>
              No account to create. No complicated checkout.
              <br />
              Just your local pharmacy, a message away.
            </p>
          </motion.div>

          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            variants={staggerContainer}
            className="gm-steps"
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
              <motion.article variants={fadeInUp} key={item.title} className="gm-step">
                <div className="gm-step-top">
                  <item.icon size={27} />
                  <span>0{index + 1}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section id="order" className="gm-order-section">
          <div className="gm-container gm-order-grid">
            <motion.aside 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
              transition={{ duration: 0.6 }}
              className="gm-order-intro"
            >
              <span className="gm-eyebrow">LET’S GET YOU SORTED</span>
              <h2 className="gm-split-wrap">
                <SplitText
                  text="Your next refill, a few taps away."
                  delay={30}
                  duration={0.8}
                  splitType="words"
                />
              </h2>
              <p>
                Choose a branch, tell us what you need, and we’ll take it from
                there on WhatsApp.
              </p>
              <div className="gm-order-note">
                <MessageCircle size={25} />
                <h3>People, not just a checkout.</h3>
                <p>
                  Your request goes to our team. Availability and final price
                  are confirmed in chat before your order is processed.
                </p>
              </div>
              <a
                href={`https://wa.me/${PHONE}`}
                target="_blank"
                rel="noopener noreferrer"
                className="gm-text-link"
              >
                Prefer to chat directly? <ArrowUpRight size={18} />
              </a>
            </motion.aside>

            <motion.form
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.1, margin: "0px 0px -50px 0px" }}
              transition={{ duration: 0.6 }}
              className="gm-order-form"
              onSubmit={(e) => e.preventDefault()} // Let SlideCommit handle submission
              aria-busy={busy}
            >
              <div className="gm-form-heading">
                <span className="gm-circle-icon">
                  <Pill size={24} />
                </span>
                <div>
                  <h3>Start your medicine request</h3>
                  <p>A little information. A lot less hassle.</p>
                </div>
              </div>
              <fieldset disabled={busy} className="gm-fieldset">
                <legend className="gm-sr-only">Medicine request details</legend>
                <div className="gm-form-block">
                  <h4>
                    <span>01</span> What do you need?
                  </h4>
                  <div className="gm-segment" aria-label="Order method">
                    {(["type", "prescription"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={mode === value}
                        className={mode === value ? "active" : ""}
                        onClick={() => {
                          setMode(value);
                          invalidate();
                        }}
                      >
                        {value === "type" ? (
                          <Pill size={17} />
                        ) : (
                          <FileText size={17} />
                        )}
                        {value === "type"
                          ? "Type medicines"
                          : "Upload prescription"}
                      </button>
                    ))}
                  </div>
                  {mode === "type" ? (
                    <motion.label 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: "auto" }} 
                      className="gm-label"
                    >
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
                        placeholder={
                          "e.g. Medicine name + strength — 2 strips\nAdd the quantity you need for each item."
                        }
                      />
                      <span className="gm-helper">
                        Include the strength and quantity, if you know them.
                      </span>
                    </motion.label>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                    >
                      <div
                        className={`gm-dropzone ${drag ? "dragging" : ""}`}
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
                          className="gm-sr-only"
                          tabIndex={-1}
                          aria-label="Prescription image"
                          onChange={(e) => {
                            selectFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        {file ? (
                          <div className="gm-file-selected">
                            {preview && !previewFailed ? (
                              <img
                                src={preview}
                                alt="Your selected prescription"
                                onError={() => setPreviewFailed(true)}
                              />
                            ) : (
                              <FileText size={36} />
                            )}
                            <div>
                              <strong>{file.name}</strong>
                              <small>
                                {(file.size / 1024 / 1024).toFixed(2)} MB ·
                                Selected
                                {previewFailed
                                  ? " · Preview unavailable for this format"
                                  : ""}
                              </small>
                              <button
                                type="button"
                                className="gm-text-link"
                                onClick={() => fileInput.current?.click()}
                              >
                                Choose another image
                              </button>
                            </div>
                            <button
                              type="button"
                              className="gm-icon-btn"
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
                            className="gm-upload-prompt"
                            onClick={() => fileInput.current?.click()}
                          >
                            <span className="gm-circle-icon">
                              <UploadCloud size={26} />
                            </span>
                            <strong>Click to upload or drop your image</strong>
                            <span>JPG, PNG, WEBP, HEIC · Up to 5 MB</span>
                          </button>
                        )}
                      </div>
                      <label className="gm-consent">
                        <input
                          type="checkbox"
                          required
                          checked={consent}
                          onChange={(e) => {
                            setConsent(e.target.checked);
                            invalidate();
                          }}
                        />
                        <span>
                          I agree to upload my prescription to Cloudinary and
                          share its link with the pharmacy on WhatsApp. Anyone
                          with the link can view it.{" "}
                          <a href="#privacy">Details</a>
                        </span>
                      </label>
                    </motion.div>
                  )}
                </div>
                
                <div className="gm-form-block">
                  <h4>
                    <span>02</span> Choose your preferred branch
                  </h4>
                  <div className="gm-branch-options">
                    {BRANCHES.map((item, index) => (
                      <label key={item.name} className="gm-radio-card">
                        <input
                          type="radio"
                          name="branch"
                          checked={branch === index}
                          onChange={() => {
                            setBranch(index);
                            invalidate();
                          }}
                        />
                        <span className="gm-radio-content">
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.area}</small>
                          </span>
                          <span className="gm-radio-dot" />
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="gm-form-block">
                  <h4>
                    <span>03</span> Where are we delivering?
                  </h4>
                  <div className="gm-input-grid">
                    {(
                      [
                        {
                          key: "name",
                          label: "Full name",
                          placeholder: "Your name",
                          auto: "name",
                          max: 80,
                        },
                        {
                          key: "phone",
                          label: "Mobile number",
                          placeholder: "10-digit mobile number",
                          auto: "tel-national",
                          max: 10,
                        },
                        {
                          key: "house",
                          label: "Flat / house & building",
                          placeholder: "Flat no., floor, building name",
                          auto: "address-line1",
                          max: 180,
                        },
                        {
                          key: "area",
                          label: "Area / locality",
                          placeholder: "e.g. Aarey Road",
                          auto: "address-line2",
                          max: 100,
                        },
                        {
                          key: "landmark",
                          label: "Landmark (optional)",
                          placeholder: "A nearby landmark",
                          auto: "off",
                          max: 100,
                        },
                      ] as const
                    ).map((field) => (
                      <label
                        key={field.key}
                        className={`gm-label ${field.key === "house" ? "gm-full" : ""}`}
                      >
                        {field.label}
                        <input
                          name={field.key}
                          type={field.key === "phone" ? "tel" : "text"}
                          inputMode={
                            field.key === "phone" ? "numeric" : undefined
                          }
                          pattern={
                            field.key === "phone" ? "[6-9][0-9]{9}" : undefined
                          }
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
                          onChange={(e) => {
                            setCustomer((prev) => ({
                              ...prev,
                              [field.key]:
                                field.key === "phone"
                                  ? e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 10)
                                  : e.target.value,
                            }));
                            invalidate();
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="gm-helper">
                    <MapPin size={13} /> Goregaon East, Mumbai · Coverage
                    confirmed in chat
                  </p>
                </div>

                <div className="gm-form-block gm-last-block">
                  <h4>
                    <span>04</span> Pay when it arrives
                  </h4>
                  <div className="gm-payment-options">
                    {(["cod", "upi"] as const).map((value) => (
                      <label className="gm-radio-card" key={value}>
                        <input
                          type="radio"
                          name="payment"
                          checked={payment === value}
                          onChange={() => {
                            setPayment(value);
                            invalidate();
                          }}
                        />
                        <span className="gm-radio-content">
                          {value === "cod" ? (
                            <Banknote size={24} />
                          ) : (
                            <QrCode size={24} />
                          )}
                          <span>
                            <strong>
                              {value === "cod" ? "Cash" : "UPI / QR"}
                            </strong>
                            <small>At delivery</small>
                          </span>
                          <span className="gm-radio-dot" />
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="gm-error"
                >
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </motion.div>
              )}

              {busy && (
                <div className="gm-upload-status" role="status">
                  <span>
                    <Loader2 className="gm-spin" size={16} />
                    {mode === "prescription"
                      ? progress < 100
                        ? `Uploading prescription… ${progress}%`
                        : "Image sent. Waiting for upload confirmation…"
                      : "Preparing your WhatsApp message…"}
                  </span>
                  {mode === "prescription" && (
                    <progress
                      max={100}
                      value={progress}
                      aria-label="Upload progress"
                    />
                  )}
                </div>
              )}

              {readyUrl ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="gm-ready" 
                  role="status"
                >
                  <Check size={22} />
                  <div>
                    <strong>Your message is ready.</strong>
                    <p>
                      Tap Send in WhatsApp to submit your request. Your order is
                      confirmed only after our team replies.
                    </p>
                    <a href={readyUrl} className="gm-btn gm-dark">
                      Open WhatsApp again <ArrowUpRight size={18} />
                    </a>
                    <button
                      type="button"
                      className="gm-text-link"
                      onClick={() => setReadyUrl("")}
                    >
                      Edit request
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="gm-slide-commit-wrapper">
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
              <p className="gm-form-footnote">
                No payment now. Send the message on WhatsApp to request your
                order.
              </p>
            </motion.form>
          </div>
        </section>

        <section id="branches" className="gm-container gm-section">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            variants={fadeInUp} 
            className="gm-section-heading"
          >
            <div>
              <span className="gm-eyebrow">AROUND THE CORNER</span>
              <h2 className="gm-split-wrap">
                <SplitText
                  text="Three branches. One neighbourhood."
                  delay={30}
                  duration={0.8}
                  splitType="words"
                />
              </h2>
            </div>
            <p>
              Familiar faces, local care.
              <br />
              Find the branch closest to you.
            </p>
          </motion.div>

          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            variants={staggerContainer}
            className="gm-branches"
          >
            {BRANCHES.map((item, index) => (
              <motion.article variants={fadeInUp} className="gm-branch" key={item.name}>
                <div
                  className={`gm-branch-art ${item.tone}`}
                  aria-hidden="true"
                >
                  <span className="gm-branch-number">
                    0{index + 1} / GOREGAON EAST
                  </span>
                  <div className="gm-storefront">
                    <div className="gm-store-sign">
                      <Plus size={16} />
                      {item.name}
                    </div>
                    <div className="gm-awning" />
                    <div className="gm-store-windows">
                      <span>
                        <Plus size={31} />
                      </span>
                      <span />
                      <span />
                    </div>
                  </div>
                  <span className="gm-map-pin">
                    <MapPin size={20} />
                  </span>
                </div>
                <div className="gm-branch-body">
                  <span className="gm-eyebrow">{item.area}</span>
                  <h3>{item.name}</h3>
                  <p>{item.address}</p>
                  <div className="gm-branch-links">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ", " + item.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get directions <Navigation size={15} />
                    </a>
                    <a
                      href="#order"
                      onClick={() => {
                        setBranch(index);
                        invalidate();
                      }}
                    >
                      Order here <ArrowUpRight size={17} />
                    </a>
                  </div>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section id="about" className="gm-container gm-about">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            transition={{ duration: 0.6 }}
            className="gm-about-art"
          >
            <Heart size={70} strokeWidth={1} />
            <span>
              Good health.
              <br />
              Great neighbours.
            </span>
            <small>GOREGAON EAST · MUMBAI</small>
            <div className="gm-about-seal">
              LOCAL
              <br />
              <Plus size={24} />
              <br />
              AT HEART
            </div>
          </motion.div>
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            variants={fadeInUp} 
            className="gm-about-copy"
          >
            <span className="gm-eyebrow">A NOTE FROM YOUR NEIGHBOURHOOD</span>
            <h2 className="gm-split-wrap">
              <SplitText
                text="A familiar name. A little more care."
                delay={30}
                duration={0.8}
                splitType="words"
              />
            </h2>
            <p>
              Goregaonmeds brings Apple Pharmacy, Lotus Pharmacy and Healthzone
              & Cosmetic together in one simple place.
            </p>
            <p>
              Managed by Hiralal Choudhary, our aim is straightforward: make it
              easier for people in Goregaon East to connect with their local
              pharmacy, without adding another errand to the day.
            </p>
            <a className="gm-text-link" href={`tel:+${PHONE}`}>
              Say hello to our team <ArrowUpRight size={18} />
            </a>
          </motion.div>
        </section>

        <section className="gm-container gm-section gm-faq" id="faq">
          <motion.div
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
            variants={fadeInUp}
          >
            <span className="gm-eyebrow">GOOD TO KNOW</span>
            <h2 className="gm-split-wrap">
              <SplitText
                text="A few helpful answers."
                delay={30}
                duration={0.8}
                splitType="words"
              />
            </h2>
            <p>Something else on your mind?</p>
            <a
              className="gm-text-link"
              href={`https://wa.me/${PHONE}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ask us on WhatsApp <ArrowUpRight size={17} />
            </a>
          </motion.div>
          <motion.div
             initial="hidden" 
             whileInView="visible" 
             viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
             variants={staggerContainer}
          >
            {FAQ.map(([question, answer]) => (
              <motion.details variants={fadeInUp} key={question}>
                <summary>
                  {question}
                  <ChevronDown size={19} />
                </summary>
                <p>{answer}</p>
              </motion.details>
            ))}
          </motion.div>
        </section>

        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.2, margin: "0px 0px -50px 0px" }}
          transition={{ duration: 0.6 }}
          className="gm-container gm-contact-banner"
        >
          <div>
            <span className="gm-eyebrow">
              YOUR NEXT ERRAND? ALREADY EASIER.
            </span>
            <h2>Let’s take care of it.</h2>
          </div>
          <motion.a 
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            href="#order" 
            className="gm-btn gm-lime-btn"
          >
            Start your request <ArrowUpRight size={21} />
          </motion.a>
        </motion.section>
      </main>

      <footer className="gm-footer">
        <div className="gm-container">
          <div className="gm-footer-grid">
            <div>
              <Brand />
              <p>
                Your neighbourhood pharmacy.
                <br />
                Now, a message away.
              </p>
            </div>
            <div>
              <h3>Explore</h3>
              <a href="#order">Order medicines</a>
              <a href="#branches">Our branches</a>
              <a href="#about">Our story</a>
              <a href="#faq">FAQs</a>
            </div>
            <div>
              <h3>Let’s connect</h3>
              <a href={`tel:+${PHONE}`}>
                +91 99877 32967 <ArrowUpRight size={14} />
              </a>
              <a
                href={`https://wa.me/${PHONE}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp us <ArrowUpRight size={14} />
              </a>
              <span>Goregaon East, Mumbai</span>
            </div>
            <div id="privacy">
              <h3>Your information</h3>
              <p>
                Details you enter are included in your WhatsApp message.
                Uploaded prescriptions are stored on Cloudinary with a shareable
                link. Contact our team to request deletion of an uploaded image.
              </p>
            </div>
          </div>
          <div className="gm-footer-bottom">
            <span>© {new Date().getFullYear()} Goregaonmeds.</span>
            <span>
              Availability, pricing and delivery are confirmed by the pharmacy.
            </span>
            <a href="#home">Back to top ↑</a>
          </div>
        </div>
      </footer>
      <div className="gm-mobile-bar">
        <a href={`tel:+${PHONE}`} aria-label="Call the pharmacy">
          <Phone size={21} />
        </a>
        <a className="gm-btn gm-dark" href="#order">
          Order medicines <ArrowUpRight size={18} />
        </a>
      </div>
    </div>
  );
}
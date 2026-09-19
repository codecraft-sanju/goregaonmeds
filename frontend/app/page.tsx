"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
    name: "Latus Pharmacy",
    area: "Jay Prakash Nagar",
    address:
      "Shop No. 10, Shreyas Bhavan, Jay Prakash Nagar Road No. 1, opposite Domino’s Pizza, Goregaon East, Mumbai",
    tone: "latus",
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
function Brand() {
  return (
    <a className="gm-brand" href="#home" aria-label="Goregaonmeds home">
      <span className="gm-mark">
        <Plus strokeWidth={3} />
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
    if (next.size > 5 * 1024 * 1024) {
      setError("Please choose an image smaller than 5 MB.");
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
  function uploadPrescription(selected: File): Promise<string> {
    if (cachedUpload.current?.file === selected)
      return Promise.resolve(cachedUpload.current.url);
    return new Promise((resolve, reject) => {
      if (!API) {
        reject(
          new Error(
            "Prescription upload is not configured. Please send your image directly on WhatsApp.",
          ),
        );
        return;
      }
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
      // Some phones provide HEIC with an empty MIME type.
      const ext = selected.name.split(".").pop()?.toLowerCase();
      const mime =
        selected.type ||
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
      body.append("image", new Blob([selected], { type: mime }), selected.name);
      xhr.send(body);
    });
  }
  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    invalidate();
    if (
      !customer.name.trim() ||
      !customer.house.trim() ||
      !customer.area.trim()
    ) {
      setError("Please fill in your name and complete delivery address.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(customer.phone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (mode === "type" && !medicines.trim()) {
      setError("Please enter the medicines you need.");
      return;
    }
    if (mode === "prescription" && (!file || !consent)) {
      setError("Choose a prescription image and agree to share it.");
      return;
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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      request.current = null;
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="gm" id="home">
      <style>{styles}</style>
      <a href="#order" className="gm-skip">
        Skip to order form
      </a>
      <div className="gm-announcement">
        <span>
          <MapPin size={13} /> Made for Goregaon East
        </span>
        <span>
          Local care. A little closer. <Heart size={13} />
        </span>
      </div>
      <header className="gm-header">
        <div className="gm-container gm-nav">
          <Brand />
          <nav className="gm-desktop-nav" aria-label="Main navigation">
            <a href="#how">How it works</a>
            <a href="#branches">Our branches</a>
            <a href="#about">About us</a>
          </nav>
          <a
            className="gm-btn gm-btn-small gm-dark gm-header-cta"
            href="#order"
          >
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
          <nav
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
          </nav>
        )}
      </header>

      <main>
        <section className="gm-container gm-hero">
          <div className="gm-hero-copy">
            <span className="gm-eyebrow">
              <span className="gm-dot" /> YOUR LOCAL PHARMACY, REIMAGINED
            </span>
            <h1>
              Care, closer
              <br />
              to <span className="gm-serif">home.</span>
              <span className="gm-heading-star" aria-hidden="true">
                ✳
              </span>
            </h1>
            <p>
              Your everyday medicines. Your neighbourhood people. Request what
              you need, and let’s take care of the rest.
            </p>
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
          </div>
          <div
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
          </div>
        </section>
        <div className="gm-benefit-strip">
          <div className="gm-container">
            {[
              [ShoppingBag, "Medicine requests, simplified"],
              [MapPin, "Three local branches"],
              [QrCode, "Cash or UPI at delivery"],
              [MessageCircle, "A real conversation"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof ShoppingBag;
              return (
                <span key={String(text)}>
                  <I size={19} />
                  {String(text)}
                </span>
              );
            })}
          </div>
        </div>

        <section id="how" className="gm-container gm-section">
          <div className="gm-section-heading">
            <div>
              <span className="gm-eyebrow">LESS EFFORT. MORE CARE.</span>
              <h2>
                One less thing
                <br />
                on your <span className="gm-serif">to-do list.</span>
              </h2>
            </div>
            <p>
              No account to create. No complicated checkout.
              <br />
              Just your local pharmacy, a message away.
            </p>
          </div>
          <div className="gm-steps">
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
              <article key={item.title} className="gm-step">
                <div className="gm-step-top">
                  <item.icon size={27} />
                  <span>0{index + 1}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="order" className="gm-order-section">
          <div className="gm-container gm-order-grid">
            <aside className="gm-order-intro">
              <span className="gm-eyebrow">LET’S GET YOU SORTED</span>
              <h2>
                Your next refill,
                <br />a few taps <span className="gm-serif">away.</span>
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
            </aside>
            <form
              className="gm-order-form"
              onSubmit={placeOrder}
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
                    <label className="gm-label">
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
                    </label>
                  ) : (
                    <>
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
                    </>
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
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="gm-error"
                >
                  <AlertCircle size={20} />
                  <span>{error}</span>
                </div>
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
                <div className="gm-ready" role="status">
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
                </div>
              ) : (
                <button
                  type="submit"
                  className="gm-btn gm-dark gm-submit"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="gm-spin" size={20} />
                  ) : (
                    <MessageCircle size={21} />
                  )}
                  {busy ? "Preparing your request…" : "Continue to WhatsApp"}
                  {!busy && <ArrowUpRight size={21} />}
                </button>
              )}
              <p className="gm-form-footnote">
                No payment now. Send the message on WhatsApp to request your
                order.
              </p>
            </form>
          </div>
        </section>

        <section id="branches" className="gm-container gm-section">
          <div className="gm-section-heading">
            <div>
              <span className="gm-eyebrow">AROUND THE CORNER</span>
              <h2>
                Three branches.
                <br />
                One <span className="gm-serif">neighbourhood.</span>
              </h2>
            </div>
            <p>
              Familiar faces, local care.
              <br />
              Find the branch closest to you.
            </p>
          </div>
          <div className="gm-branches">
            {BRANCHES.map((item, index) => (
              <article className="gm-branch" key={item.name}>
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
              </article>
            ))}
          </div>
        </section>
        <section id="about" className="gm-container gm-about">
          <div className="gm-about-art">
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
          </div>
          <div className="gm-about-copy">
            <span className="gm-eyebrow">A NOTE FROM YOUR NEIGHBOURHOOD</span>
            <h2>
              A familiar name.
              <br />A little more <span className="gm-serif">care.</span>
            </h2>
            <p>
              Goregaonmeds brings Apple Pharmacy, Latus Pharmacy and Healthzone
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
          </div>
        </section>
        <section className="gm-container gm-section gm-faq" id="faq">
          <div>
            <span className="gm-eyebrow">GOOD TO KNOW</span>
            <h2>
              A few helpful
              <br />
              <span className="gm-serif">answers.</span>
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
          </div>
          <div>
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={19} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="gm-container gm-contact-banner">
          <div>
            <span className="gm-eyebrow">
              YOUR NEXT ERRAND? ALREADY EASIER.
            </span>
            <h2>Let’s take care of it.</h2>
          </div>
          <a href="#order" className="gm-btn gm-lime-btn">
            Start your request <ArrowUpRight size={21} />
          </a>
        </section>
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

const styles = `
.gm{--ink:#153f34;--muted:#66716a;--lime:#d8ef8d;--paper:#f7f8f2;color:var(--ink);background:var(--paper);font-family:var(--font-geist-sans),Arial,sans-serif;font-size:15px;line-height:1.6;overflow:clip}.gm *{box-sizing:border-box}.gm h1,.gm h2,.gm h3,.gm h4,.gm p{margin:0}.gm a{color:inherit;text-decoration:none}.gm button,.gm input,.gm textarea{font:inherit}.gm button,.gm a,.gm input,.gm textarea{ -webkit-tap-highlight-color:transparent}.gm button{cursor:pointer}.gm button:disabled{cursor:wait;opacity:.65}.gm svg{flex-shrink:0}.gm :focus-visible{outline:3px solid #418768;outline-offset:4px}.gm ::selection{background:var(--lime);color:var(--ink)}.gm section,.gm #privacy{scroll-margin-top:105px}.gm-container{width:min(1180px,calc(100% - 80px));margin:auto}.gm-announcement{background:var(--ink);color:#e8f2db;padding:9px 40px;display:flex;justify-content:space-between;font-size:11px;letter-spacing:.03em}.gm-announcement span{display:flex;align-items:center;gap:7px}.gm-header{position:sticky;top:0;z-index:30;background:#f7f8f2ed;backdrop-filter:blur(18px);border-bottom:1px solid #153f3412}.gm-nav{height:86px;display:flex;align-items:center;justify-content:space-between;gap:20px}.gm-brand{display:inline-flex;align-items:center;gap:10px;font-size:23px;font-weight:750;letter-spacing:-1.1px;line-height:1.1}.gm-brand-light{font-weight:450}.gm-brand small{display:block;font-size:7px;letter-spacing:1.65px;margin-top:8px;font-weight:600}.gm-mark{height:40px;width:40px;border-radius:13px;background:var(--ink);color:var(--lime);display:grid;place-items:center;transform:rotate(-7deg)}.gm-desktop-nav{display:flex;gap:28px;font-size:12px;font-weight:550}.gm-desktop-nav a:hover,.gm-text-link:hover{color:#567832}.gm-btn{display:inline-flex;align-items:center;justify-content:center;gap:16px;border-radius:100px;padding:17px 25px;min-height:54px;font-weight:600;font-size:13px;border:1px solid transparent;transition:transform .2s,background .2s,box-shadow .2s}.gm-btn:hover{transform:translateY(-2px);box-shadow:0 7px 20px #153f3414}.gm .gm-dark{background:var(--ink);color:white}.gm .gm-dark:hover{background:#245744}.gm-btn-small{padding:12px 19px;min-height:44px;font-size:12px}.gm-menu-toggle{display:none!important}.gm-icon-btn{display:grid;place-items:center;background:transparent;border:1px solid #d8dfd7;border-radius:50%;width:40px;height:40px}.gm-mobile-nav{padding:10px 24px 22px;border-top:1px solid #ddd}.gm-mobile-nav a{display:flex;justify-content:space-between;padding:13px 0}.gm-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:60px;padding-top:65px;padding-bottom:72px;align-items:center}.gm-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:10px;letter-spacing:1.9px;font-weight:700;text-transform:uppercase}.gm-dot{width:7px;height:7px;background:#639145;border-radius:50%;box-shadow:0 0 0 4px #dce9cb}.gm h1{font-size:clamp(64px,6.4vw,87px);line-height:1.01;font-weight:540;letter-spacing:-5px;margin:25px 0;position:relative}.gm-serif{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;letter-spacing:-.05em}.gm-heading-star{font-size:68px;color:#8cad61;margin-left:28px;display:inline-block;vertical-align:middle}.gm-hero-copy>p{color:var(--muted);max-width:395px;font-size:15px;line-height:1.8}.gm-actions{display:flex;align-items:center;gap:26px;margin:29px 0 24px}.gm-text-link{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:650;background:none;border:0;padding:0;min-height:38px}.gm-hero-note{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:11px}.gm-hero-note i{width:3px;height:3px;border-radius:50%;background:#98a291;margin:0 7px}.gm-mini-icon{display:grid;place-items:center;background:#e4ecd9;color:var(--ink);border-radius:50%;width:22px;height:22px}.gm-hero-art{height:480px;border-radius:38px;background:#e6eddf;position:relative;overflow:hidden;isolation:isolate}.gm-hero-art:after{content:'';position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 60% 50%,#f9f8de99,transparent 65%)}.gm-art-label{position:absolute;left:24px;bottom:25px;font-size:8px;letter-spacing:2px;writing-mode:vertical-rl;transform:rotate(180deg)}.gm-orbit{position:absolute;border:1px solid #acbda24d;width:480px;height:480px;border-radius:50%;left:60px;top:30px}.gm-orbit-two{width:340px;height:340px;left:130px;top:100px}.gm-bag{position:absolute;width:220px;height:290px;left:calc(50% - 110px);top:130px;transform:rotate(-9deg);filter:drop-shadow(12px 24px 15px #243a2526)}.gm-bag-handle{position:absolute;width:93px;height:91px;border:12px solid #bba77f;border-bottom:0;border-radius:60px 60px 0 0;left:64px;top:-53px;box-shadow:inset 2px 0 2px #826e4840}.gm-bag-face{position:relative;background:linear-gradient(105deg,#e5d4ad,#f0e2c4 65%,#ccba91);height:100%;padding:30px;border-radius:5px 5px 12px 12px;border-right:15px solid #c7b38a;display:flex;flex-direction:column;align-items:flex-start}.gm-bag-cross{color:#315240}.gm-bag-face strong{font-family:Georgia,serif;font-size:30px;line-height:1.05;font-weight:400;letter-spacing:-1px;margin:10px 0 18px}.gm-bag-face>span:last-of-type{font-size:11px;font-weight:700;letter-spacing:-.5px}.gm-bag-line{height:2px;width:100%;background:#52644b55;margin-top:14px}.gm-float{position:absolute;z-index:3;display:flex;align-items:center;gap:11px;padding:14px 17px;background:#ffffffed;border:1px solid white;box-shadow:0 12px 35px #324c2a12;border-radius:16px;animation:gm-float 6s ease-in-out infinite}.gm-float strong{display:block;font-size:10px;font-weight:650}.gm-float small{font-size:9px;color:var(--muted)}.gm-float-top{top:34px;left:25px}.gm-float-bottom{bottom:30px;right:20px;animation-delay:-3s}.gm-circle-icon{background:#edf2e7;width:43px;height:43px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}.gm-lime{background:var(--lime)}.gm-pill{position:absolute;width:60px;height:24px;border-radius:40px;background:linear-gradient(90deg,#fff 50%,#93b27c 50%);box-shadow:3px 7px 10px #34472920;transform:rotate(35deg);right:32px;top:165px}.gm-pill-two{width:48px;height:20px;top:auto;bottom:55px;left:55px;transform:rotate(-40deg)}.gm-art-star{position:absolute;right:42px;top:65px;font-size:61px;color:#547346}.gm-benefit-strip{border-block:1px solid #dce2d6}.gm-benefit-strip>.gm-container{display:flex;align-items:center;justify-content:space-between;padding-block:23px;gap:18px}.gm-benefit-strip span{display:flex;gap:11px;align-items:center;font-size:11px;font-weight:550}.gm-section{padding-top:95px;padding-bottom:95px}.gm-section-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:36px}.gm h2{font-size:45px;line-height:1.12;letter-spacing:-2px;font-weight:500;margin-top:16px}.gm-section-heading>p{font-size:13px;color:var(--muted);line-height:1.9;padding-bottom:4px}.gm-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:23px}.gm-step{border-top:1px solid #bdcbbc;padding:26px 5px 0}.gm-step-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}.gm-step-top>span{font-family:Georgia,serif;font-size:35px;font-style:italic;color:#a8b5a1}.gm-step h3{font-size:17px;font-weight:600;margin-bottom:10px}.gm-step p{color:var(--muted);font-size:13px;max-width:305px}.gm-order-section{background:#eaf0e3;padding:76px 0}.gm-order-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:75px;align-items:start}.gm-order-intro{position:sticky;top:120px;padding-top:12px}.gm-order-intro h2{font-size:48px}.gm-order-intro>p{color:var(--muted);margin:22px 0;max-width:320px;font-size:14px}.gm-order-note{border-top:1px solid #cbd7c2;border-bottom:1px solid #cbd7c2;padding:25px 0;margin:34px 0 20px;max-width:300px}.gm-order-note h3{font-size:16px;margin:12px 0 8px}.gm-order-note p{font-size:12px;color:var(--muted)}.gm-order-form{padding:32px;background:#fff;border:1px solid #dde5d5;border-radius:24px;box-shadow:0 12px 50px #1f392008;min-width:0}.gm-form-heading{display:flex;gap:13px;align-items:center;padding-bottom:26px;border-bottom:1px solid #e8ede4}.gm-form-heading h3{font-size:19px;font-weight:600;letter-spacing:-.6px}.gm-form-heading p{font-size:11px;color:var(--muted);margin-top:4px}.gm-fieldset{padding:0;border:0;margin:0;min-width:0}.gm-form-block{padding:24px 0;border-bottom:1px solid #e8ede4}.gm-form-block h4{font-size:13px;display:flex;gap:10px;align-items:center;margin-bottom:18px;font-weight:650}.gm-form-block h4>span{font-size:9px;border:1px solid #d9e1d3;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#728268}.gm-segment{display:flex;padding:4px;border-radius:12px;background:#f1f4ed;margin-bottom:18px;gap:4px}.gm-segment button{border:0;background:transparent;display:flex;align-items:center;justify-content:center;gap:8px;font-size:11px;color:#586652;border-radius:9px;padding:11px 7px;flex:1}.gm-segment button.active{background:white;color:var(--ink);box-shadow:0 2px 5px #0000000a;font-weight:650}.gm-label{display:flex;flex-direction:column;gap:7px;font-size:11px;font-weight:600;min-width:0}.gm-label input,.gm-label textarea{width:100%;padding:12px 13px;border:1px solid #dce2d8;background:#fcfdfb;border-radius:9px;outline:none;font-size:12px;color:var(--ink);font-weight:400;transition:border .2s,box-shadow .2s}.gm-label input:focus,.gm-label textarea:focus{border-color:#789966;box-shadow:0 0 0 3px #e9f0df}.gm-label textarea{resize:vertical;min-height:120px;line-height:1.7}.gm-label input::placeholder,.gm-label textarea::placeholder{color:#859080}.gm-helper{font-size:10px!important;font-weight:400;color:#747f6f;display:flex;align-items:center;gap:5px;margin-top:8px!important}.gm-branch-options{display:grid;gap:8px}.gm-radio-card{position:relative;cursor:pointer;display:block;min-width:0}.gm-radio-card>input{position:absolute;opacity:0;width:1px;height:1px}.gm-radio-content{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #e1e6dd;border-radius:10px;transition:background .15s,border .15s}.gm-radio-content strong{font-size:11px;font-weight:600;display:block}.gm-radio-content small{font-size:10px;color:var(--muted);display:block;margin-top:2px}.gm-radio-dot{width:15px;height:15px;border:1px solid #b7c4af;border-radius:50%;margin-left:auto;flex-shrink:0}.gm-radio-card>input:checked+.gm-radio-content{background:#f2f7e9;border-color:#91ab71}.gm-radio-card>input:checked+.gm-radio-content .gm-radio-dot{background:var(--ink);border:4px solid #e0eccf;box-shadow:0 0 0 1px #597d40}.gm-radio-card>input:focus-visible+.gm-radio-content{outline:3px solid #418768;outline-offset:3px}.gm-input-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 12px}.gm-full{grid-column:1/-1}.gm-payment-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gm-last-block{border-bottom:0;padding-bottom:22px}.gm-submit{width:100%;border-radius:12px;justify-content:center;min-height:56px}.gm-submit>svg:last-child{margin-left:auto}.gm-submit>svg:first-child{margin-right:auto}.gm-form-footnote{text-align:center;font-size:9px;color:var(--muted);margin-top:12px!important}.gm-dropzone{border:1.5px dashed #bdcdb1;background:#f8faf4;border-radius:13px;padding:16px}.gm-dropzone.dragging{background:#e8f3d8;border-color:var(--ink)}.gm-upload-prompt{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 0;border:0;background:none;width:100%;color:var(--ink)}.gm-upload-prompt strong{font-size:12px}.gm-upload-prompt>span:last-child{font-size:10px;color:var(--muted)}.gm-consent{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:10px;color:var(--muted)}.gm-consent input{accent-color:var(--ink);margin-top:3px;flex-shrink:0}.gm-consent a{text-decoration:underline}.gm-file-selected{display:flex;align-items:center;gap:12px;min-width:0}.gm-file-selected img{width:65px;height:82px;object-fit:contain;background:white;border-radius:5px}.gm-file-selected>div{min-width:0;flex:1}.gm-file-selected strong{font-size:11px;display:block;overflow-wrap:anywhere}.gm-file-selected small{font-size:10px;color:var(--muted);display:block}.gm-file-selected button{font-size:10px}.gm-file-selected .gm-icon-btn{width:32px;height:32px;flex-shrink:0}.gm-error{display:flex;align-items:flex-start;gap:9px;padding:14px;background:#fff0eb;color:#9a3826;font-size:12px;border:1px solid #f2d1c6;border-radius:10px;margin-bottom:15px}.gm-upload-status{font-size:11px;margin-bottom:16px}.gm-upload-status>span{display:flex;gap:8px;align-items:center}.gm-upload-status progress{width:100%;height:7px;accent-color:var(--ink);margin-top:10px}.gm-spin{animation:gm-spin 1s linear infinite}.gm-ready{display:flex;align-items:flex-start;gap:12px;background:#eef6e3;border-radius:12px;padding:18px}.gm-ready strong{font-size:14px}.gm-ready p{font-size:12px;margin:8px 0 16px}.gm-ready .gm-btn{font-size:11px;padding:12px 16px;min-height:40px}.gm-ready .gm-text-link{display:flex;margin-top:8px}.gm-branches{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.gm-branch{border:1px solid #e0e5da;border-radius:18px;overflow:hidden;background:#fff;transition:transform .25s}.gm-branch:hover{transform:translateY(-5px)}.gm-branch-art{height:196px;background:#e8eede;position:relative;overflow:hidden}.gm-branch-art.latus{background:#ece8dc}.gm-branch-art.health{background:#e1ebe7}.gm-branch-number{position:absolute;left:20px;top:17px;font-size:8px;letter-spacing:1.4px}.gm-storefront{position:absolute;width:178px;bottom:-5px;left:calc(50% - 89px);background:#f8faf3;box-shadow:10px 6px 0 #8c9e7528;border:1px solid #95a689;border-radius:5px 5px 0 0}.gm-store-sign{height:34px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:650;gap:5px;background:#315242;color:white;border-radius:4px 4px 0 0}.latus .gm-store-sign{background:#78674d}.health .gm-store-sign{background:#4e7271}.gm-awning{height:20px;background:repeating-linear-gradient(90deg,#d2dfbc 0 17px,#f6f7ec 17px 34px);border-bottom:1px solid #9eac8e;transform:skewX(-6deg);width:calc(100% + 10px);margin-left:-5px}.gm-store-windows{display:flex;gap:7px;padding:12px;height:88px}.gm-store-windows>span{display:grid;place-items:center;background:#dce6d1;flex:1;border:1px solid #aabd9c;color:#6a8559}.gm-store-windows>span:nth-child(2){flex:.7;background:#b9caae}.gm-map-pin{position:absolute;right:22px;bottom:24px;width:37px;height:37px;border-radius:50%;background:white;display:grid;place-items:center;box-shadow:0 5px 15px #1e321b15}.gm-branch-body{padding:24px}.gm-branch-body .gm-eyebrow{font-size:8px;letter-spacing:1.2px}.gm-branch-body h3{font-size:19px;font-weight:550;margin-top:8px;letter-spacing:-.5px}.gm-branch-body p{font-size:11px;line-height:1.85;color:var(--muted);min-height:83px;margin:12px 0 18px}.gm-branch-links{border-top:1px solid #e4e9df;padding-top:16px;display:flex;justify-content:space-between;gap:8px}.gm-branch-links a{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:600}.gm-about{display:grid;grid-template-columns:1fr 1fr;gap:75px;align-items:center;padding-top:12px;padding-bottom:25px}.gm-about-art{background:var(--ink);color:var(--lime);border-radius:24px;min-height:390px;padding:45px;position:relative;overflow:hidden}.gm-about-art:after{content:'';width:270px;height:270px;border:1px solid #ffffff15;border-radius:50%;position:absolute;right:-120px;top:-100px}.gm-about-art>span{display:block;font-family:Georgia,serif;font-size:48px;line-height:1.1;letter-spacing:-2px;margin:24px 0 27px}.gm-about-art>small{font-size:8px;letter-spacing:2px;color:#bbcdb5}.gm-about-seal{position:absolute;right:23px;bottom:25px;border:1px solid #d8ef8d55;border-radius:50%;width:90px;height:90px;text-align:center;font-size:8px;line-height:1.5;padding-top:12px;transform:rotate(15deg)}.gm-about-seal svg{display:inline;vertical-align:middle}.gm-about-copy>p{color:var(--muted);font-size:13px;line-height:1.9;margin-top:20px}.gm-about-copy>.gm-text-link{margin-top:22px}.gm-faq{display:grid;grid-template-columns:.8fr 1.2fr;gap:75px}.gm-faq>div>p{font-size:13px;color:var(--muted);margin-top:24px;margin-bottom:4px}.gm-faq details{border-bottom:1px solid #dce2d6}.gm-faq summary{padding:23px 0;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:13px;font-weight:600;cursor:pointer}.gm-faq summary::-webkit-details-marker{display:none}.gm-faq summary svg{transition:transform .2s}.gm-faq details[open] summary svg{transform:rotate(180deg)}.gm-faq details>p{color:var(--muted);font-size:12px;line-height:1.9;padding:0 25px 23px 0}.gm-contact-banner{background:var(--ink);color:#fff;border-radius:22px;padding:38px 42px;display:flex;align-items:center;justify-content:space-between;gap:25px;margin-bottom:80px}.gm-contact-banner .gm-eyebrow{color:#bcccab;font-size:8px}.gm-contact-banner h2{font-size:37px;margin-top:8px}.gm .gm-lime-btn{background:var(--lime);color:var(--ink)}.gm-footer{background:#eef1e8;border-top:1px solid #dce2d6;padding:55px 0 20px}.gm-footer-grid{display:grid;grid-template-columns:1.3fr .7fr 1fr 1.2fr;gap:40px;padding-bottom:40px}.gm-footer-grid h3{font-size:11px;font-weight:700;margin-bottom:18px}.gm-footer-grid>div>a:not(.gm-brand),.gm-footer-grid>div>span{font-size:11px;display:flex;align-items:center;gap:7px;margin-bottom:10px;color:#5d6b58}.gm-footer-grid p{font-size:10px;color:#6b7766;line-height:1.9}.gm-footer-grid>div:first-child>p{margin-top:19px;font-size:12px}.gm-footer .gm-brand{font-size:20px}.gm-footer .gm-brand small{font-size:6px;letter-spacing:1.3px}.gm-footer .gm-mark{width:34px;height:34px}.gm-footer-bottom{border-top:1px solid #d7e0cf;padding-top:20px;display:flex;justify-content:space-between;gap:18px;font-size:9px;color:var(--muted)}.gm-mobile-bar{display:none}.gm-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.gm-skip{position:fixed;top:-100px;left:16px;padding:12px;background:white;z-index:100}.gm-skip:focus{top:12px}.gm-hero-copy{animation:gm-entrance .7s ease both}.gm-hero-art{animation:gm-entrance .85s ease both}@keyframes gm-spin{to{transform:rotate(360deg)}}@keyframes gm-float{50%{transform:translateY(-7px)}}@keyframes gm-entrance{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
@media(min-width:1500px){.gm-hero{padding-block:85px}.gm-hero-art{height:510px}}
@media(max-width:1050px){.gm-container{width:calc(100% - 48px)}.gm-desktop-nav{gap:17px}.gm-hero{gap:28px}.gm h1{font-size:69px}.gm-hero-art{height:440px}.gm-heading-star{font-size:45px;margin-left:18px}.gm-float-top{left:15px;padding:12px}.gm-float-bottom{right:12px}.gm-order-grid{gap:35px;grid-template-columns:.7fr 1.3fr}.gm-order-intro h2{font-size:40px}.gm-order-form{padding:25px}.gm-about{gap:40px}.gm-about-art{padding:32px}.gm-about-art>span{font-size:43px}.gm-faq{gap:40px}.gm-footer-grid{gap:24px}.gm-branch-body{padding:20px}.gm-branch-body p{min-height:105px}}
@media(max-width:780px){.gm-announcement{padding-inline:24px}.gm-desktop-nav{display:none}.gm-menu-toggle{display:grid!important}.gm-header-cta{margin-left:auto}.gm-hero{grid-template-columns:1fr 1fr;gap:20px;padding-block:45px}.gm h1{font-size:57px;letter-spacing:-3px}.gm-heading-star{display:none}.gm-eyebrow{font-size:8px;letter-spacing:1.4px}.gm-hero-copy>p{font-size:13px}.gm-actions{gap:14px;align-items:flex-start;flex-direction:column}.gm-hero-note{font-size:9px;gap:5px}.gm-hero-note i{margin-inline:2px}.gm-hero-art{height:410px;border-radius:25px}.gm-bag{width:185px;height:255px;left:calc(50% - 92px);top:115px}.gm-bag-face{padding:23px}.gm-bag-face strong{font-size:26px}.gm-bag-handle{left:45px}.gm-float-top{top:20px;left:12px;gap:6px;padding:10px}.gm-float strong{font-size:8px}.gm-float small{font-size:8px}.gm-float .gm-circle-icon{width:30px;height:30px}.gm-float-bottom{padding:10px;bottom:20px}.gm-art-star{right:18px;top:76px;font-size:44px}.gm-pill-one{right:15px;top:155px;width:40px;height:17px}.gm-benefit-strip>.gm-container{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding-block:20px}.gm-benefit-strip span{font-size:10px}.gm-section{padding-block:65px}.gm h2{font-size:36px}.gm-section-heading>p{font-size:11px}.gm-steps{gap:20px}.gm-step h3{font-size:14px}.gm-step p{font-size:11px}.gm-order-grid{grid-template-columns:1fr;gap:30px}.gm-order-intro{position:static;padding:0}.gm-order-intro h2{font-size:40px}.gm-order-intro h2 br{display:none}.gm-order-intro>p{max-width:100%;margin-bottom:10px}.gm-order-note{display:none}.gm-order-section{padding-block:55px}.gm-order-form{padding:30px}.gm-branches{gap:12px}.gm-branch-body{padding:15px}.gm-branch-body h3{font-size:16px}.gm-branch-body p{font-size:10px;min-height:130px}.gm-branch-links{flex-direction:column;gap:12px}.gm-storefront{width:145px;left:calc(50% - 72px)}.gm-store-sign{font-size:7px}.gm-branch-art{height:170px}.gm-branch-number{font-size:6px;left:12px}.gm-map-pin{right:12px;width:30px;height:30px}.gm-about{gap:30px}.gm-about-art{padding:25px;min-height:370px}.gm-about-art>span{font-size:37px}.gm-about-seal{width:73px;height:73px;font-size:6px;right:15px;bottom:17px}.gm-about-copy>p{font-size:12px}.gm-faq{gap:30px}.gm-contact-banner{padding:30px;margin-bottom:55px}.gm-contact-banner h2{font-size:30px}.gm-footer-grid{grid-template-columns:1fr 1fr;gap:35px}.gm-footer-bottom{flex-wrap:wrap}.gm-footer-bottom>span:nth-child(2){order:3;width:100%}}
@media(max-width:560px){.gm-container{width:calc(100% - 36px)}.gm-announcement{padding:8px 18px;font-size:9px}.gm-announcement>span:last-child{font-size:8px}.gm-nav{height:72px;gap:12px}.gm-brand{font-size:21px}.gm-brand small{font-size:6px;letter-spacing:1.35px}.gm-mark{width:35px;height:35px}.gm-header-cta{display:none}.gm-menu-toggle{margin-left:auto}.gm-hero{grid-template-columns:1fr;padding-top:38px;padding-bottom:32px;gap:32px}.gm-hero-copy{padding:0 5px}.gm h1{font-size:68px;letter-spacing:-4px;margin:22px 0}.gm-heading-star{display:inline-block;font-size:51px;margin-left:20px}.gm-hero-copy>p{max-width:330px;font-size:14px}.gm-eyebrow{font-size:8px}.gm-actions{flex-direction:row;align-items:center;gap:23px;margin:25px 0 20px}.gm-actions .gm-btn{padding:15px 20px;font-size:12px}.gm-text-link{font-size:11px}.gm-hero-note{font-size:10px}.gm-hero-note i{margin-inline:6px}.gm-hero-art{height:370px;border-radius:23px}.gm-bag{width:187px;height:250px;top:95px}.gm-bag-face{padding:22px}.gm-bag-cross svg{width:51px;height:51px}.gm-float-top{top:20px;left:20px;padding:12px}.gm-float strong{font-size:9px}.gm-float small{font-size:8px}.gm-float-bottom{right:18px;bottom:20px;padding:12px}.gm-art-star{top:57px;right:25px}.gm-art-label{left:18px;font-size:7px}.gm-pill-one{right:25px}.gm-benefit-strip>.gm-container{gap:17px 12px}.gm-benefit-strip span{font-size:9px;gap:8px}.gm-benefit-strip svg{width:16px}.gm-section{padding-block:52px}.gm-section-heading{display:block;margin-bottom:28px}.gm h2{font-size:36px;letter-spacing:-1.7px}.gm-section-heading>p{margin-top:18px;font-size:12px}.gm-steps{grid-template-columns:1fr;gap:24px}.gm-step{padding:20px 0 0;display:grid;grid-template-columns:48px 1fr;gap:0 15px}.gm-step-top{grid-row:1/3;margin:0;align-items:flex-start;position:relative}.gm-step-top>span{font-size:14px;position:absolute;top:38px;left:5px}.gm-step h3{font-size:16px;margin-bottom:6px}.gm-step p{font-size:12px;max-width:none}.gm-order-section{padding-block:45px}.gm-order-intro h2{font-size:38px}.gm-order-intro>p{font-size:13px}.gm-order-form{padding:22px 17px;border-radius:19px}.gm-form-heading h3{font-size:17px}.gm-form-heading{gap:10px}.gm-form-heading p{font-size:10px}.gm-form-heading .gm-circle-icon{width:36px;height:36px}.gm-form-block{padding-block:22px}.gm-form-block h4{font-size:12px}.gm-input-grid{gap:15px 10px}.gm-label{font-size:10px}.gm-label input,.gm-label textarea{font-size:16px;padding:11px;min-width:0}.gm-label input::placeholder,.gm-label textarea::placeholder{font-size:12px}.gm-segment button{font-size:10px;padding:12px 5px;gap:5px}.gm-segment svg{width:15px}.gm-radio-content{padding:12px 11px;gap:9px}.gm-form-footnote{font-size:9px;padding-inline:5px}.gm-submit{font-size:12px;padding-inline:17px}.gm-upload-prompt strong{font-size:11px}.gm-branches{grid-template-columns:1fr;gap:20px}.gm-branch-art{height:185px}.gm-storefront{width:190px;left:calc(50% - 95px)}.gm-store-sign{font-size:10px}.gm-branch-number{font-size:8px;left:20px;top:18px}.gm-map-pin{right:24px;bottom:25px;width:36px;height:36px}.gm-branch-body{padding:23px}.gm-branch-body h3{font-size:21px}.gm-branch-body p{min-height:0;font-size:12px;margin:12px 0 21px}.gm-branch-links{flex-direction:row}.gm-branch-links a{font-size:11px;min-height:30px}.gm-about{grid-template-columns:1fr;gap:32px;padding-block:0}.gm-about-art{min-height:320px;padding:31px}.gm-about-art>span{font-size:43px}.gm-about-art>svg{width:55px;height:55px}.gm-about-seal{width:84px;height:84px;font-size:7px;bottom:24px;right:24px}.gm-about-copy>p{font-size:13px}.gm-faq{grid-template-columns:1fr;gap:15px}.gm-faq summary{font-size:12px;padding-block:22px}.gm-faq details>p{font-size:12px}.gm-contact-banner{flex-direction:column;align-items:flex-start;padding:27px;margin-bottom:45px;border-radius:18px}.gm-contact-banner h2{font-size:31px}.gm-contact-banner .gm-btn{font-size:12px;min-height:48px}.gm-footer{padding-top:38px;padding-bottom:100px}.gm-footer-grid{gap:30px 20px}.gm-footer-grid>div:first-child{grid-column:1/-1}.gm-footer-grid>div:last-child{grid-column:1/-1}.gm-footer-grid>div:last-child p{max-width:100%;font-size:11px}.gm-footer-grid>div>a:not(.gm-brand),.gm-footer-grid>div>span{font-size:11px}.gm-footer-bottom{font-size:9px}.gm-mobile-bar{position:fixed;bottom:0;left:0;right:0;z-index:40;display:flex;align-items:center;gap:12px;padding:10px 18px max(10px,env(safe-area-inset-bottom));background:#f7f8f2f5;backdrop-filter:blur(14px);border-top:1px solid #d7dfd0}.gm-mobile-bar>a:first-child{display:grid;place-items:center;min-width:46px;height:46px;border:1px solid #d5dfcd;border-radius:50%}.gm-mobile-bar .gm-btn{flex:1;min-height:46px;padding-block:11px;font-size:12px}.gm section{scroll-margin-top:88px}}
@media(max-width:360px){.gm-container{width:calc(100% - 28px)}.gm h1{font-size:60px}.gm-heading-star{font-size:42px}.gm-actions{gap:15px}.gm-actions .gm-btn{padding-inline:16px}.gm-input-grid{grid-template-columns:1fr}.gm-benefit-strip span{font-size:8px}.gm-payment-options{gap:7px}.gm-radio-content>svg{width:19px}.gm-hero-note{font-size:9px}}
@media(prefers-reduced-motion:reduce){.gm *,.gm *:before,.gm *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

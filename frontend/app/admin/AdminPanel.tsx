"use client";

import React, { useState, useRef, useEffect } from "react";
import * as htmlToImage from "html-to-image";
import {
  Plus,
  Trash2,
  Send,
  Lock,
  Receipt,
  Loader2,
  LogOut,
  Printer,
  Download,
  Eye,
  Edit3,
  CreditCard,
  Building2,
  RefreshCw,
  Phone,
  User,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

const API = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:5000" : "")
).replace(/\/+$/, "");

interface Branch {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  dlNo: string;
  gstin: string;
}

const BRANCHES: Branch[] = [
  {
    name: "Apple Pharmacy",
    tagline: "Chemists & Druggists",
    address: "Shop 9, Sheetal Krupa Bldg, Aarey Rd, Goregaon (E), Mumbai 400063",
    phone: "+91 84338 18771",
    dlNo: "20B/21B/MH-MZ4-382910",
    gstin: "27AABCU9603R1ZM",
  },
  {
    name: "Lotus Pharmacy",
    tagline: "Super Speciality Chemist",
    address: "Shop 10, Shreyas Bhavan, JP Nagar, Goregaon (E), Mumbai 400063",
    phone: "+91 84338 18771",
    dlNo: "20B/21B/MH-MZ4-491024",
    gstin: "27AABCU9603R1ZM",
  },
  {
    name: "Healthzone & Cosmetic",
    tagline: "Wellness & Surgical Store",
    address: "Shop 3, Pednekar Chawl, S.V. Road, Goregaon (W), Mumbai 400104",
    phone: "+91 84338 18771",
    dlNo: "20B/21B/MH-MZ4-118492",
    gstin: "27AABCU9603R1ZM",
  },
];

interface InvoiceItem {
  id: number;
  name: string;
  batch?: string;
  qty: number;
  price: number;
}

export default function AdminPanel() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // Bill State
  const [invoiceNo, setInvoiceNo] = useState("");
  const [branchIdx, setBranchIdx] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"UPI" | "Cash" | "Card">("UPI");
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: 1, name: "Paracetamol 650mg (Dolo)", batch: "DL248", qty: 2, price: 32 },
  ]);
  const [discount, setDiscount] = useState<number>(0);
  const [isTaxIncluded, setIsTaxIncluded] = useState(true);

  const billRef = useRef<HTMLDivElement>(null);

  // Auto-generate invoice id
  const generateNewInvoiceId = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `GM-${new Date().getFullYear().toString().slice(-2)}${random}`;
    setInvoiceNo(code);
  };

  useEffect(() => {
    generateNewInvoiceId();
  }, []);

  // Totals calculations
  const subTotal = items.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
  const discountAmount = Math.min(discount, subTotal);
  const taxableAmount = subTotal - discountAmount;
  const gstRate = 0.05; // 5% GST standard medical estimate
  const gstAmount = isTaxIncluded ? (taxableAmount * gstRate) / (1 + gstRate) : taxableAmount * gstRate;
  const grandTotal = isTaxIncluded ? taxableAmount : taxableAmount + gstAmount;

  // --- Auth Handler ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setIsLoggedIn(true);
      } else {
        setLoginError("Invalid administrator key");
      }
    } catch {
      setLoginError("Backend service unavailable");
    } finally {
      setLoading(false);
    }
  };

  // --- Item Operations ---
  const addItem = () => {
    setItems((prev) => [...prev, { id: Date.now(), name: "", batch: "", qty: 1, price: 0 }]);
  };

  const removeItem = (id: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: number, field: keyof InvoiceItem, val: string | number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  // Snapshot generation
  const createBillBlob = async (): Promise<Blob> => {
    if (!billRef.current) throw new Error("Preview reference missing");
    return await htmlToImage.toBlob(billRef.current, {
      quality: 0.98,
      pixelRatio: 2.5,
      backgroundColor: "#ffffff",
      cacheBust: true,
    }) as Blob;
  };

  // 1. Send via WhatsApp
  const generateAndSend = async () => {
    if (!customerPhone || items.length === 0 || !items[0].name.trim()) {
      alert("Please provide the customer's phone number and at least 1 medicine name.");
      return;
    }

    setLoading(true);
    try {
      const blob = await createBillBlob();
      const formData = new FormData();
      formData.append("image", blob, `${invoiceNo}.png`);

      const uploadRes = await fetch(`${API}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");

      const branch = BRANCHES[branchIdx];
      const message = `*INVOICE: ${branch.name.toUpperCase()}*\nInvoice No: *#${invoiceNo}*\nPatient: *${customerName || "Customer"}*\nDate: ${new Date().toLocaleDateString("en-IN")}\n\n*Total Payable:* ₹${grandTotal.toFixed(2)}\n*Payment Mode:* ${paymentMode}\n\n📄 *Download Digital Receipt:*\n${uploadData.url}\n\n_Thank you for choosing Goregaonmeds! Get well soon._`;

      const waUrl = `https://wa.me/91${customerPhone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank");
    } catch (err: any) {
      alert(err.message || "Failed to process receipt");
    } finally {
      setLoading(false);
    }
  };

  // 2. Download Image directly
  const downloadReceiptImage = async () => {
    if (!billRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(billRef.current, { pixelRatio: 2.5 });
      const link = document.createElement("a");
      link.download = `${invoiceNo}_Bill.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      alert("Could not render image for download");
    }
  };

  // 3. Native print
  const handlePrint = () => {
    window.print();
  };

  // Reset form
  const handleReset = () => {
    if (confirm("Clear all items and customer info?")) {
      setItems([{ id: Date.now(), name: "", batch: "", qty: 1, price: 0 }]);
      setDiscount(0);
      setCustomerName("");
      setCustomerPhone("");
      generateNewInvoiceId();
    }
  };

  // ---------------------------------------------------------------------------
  // AUTH VIEW
  // ---------------------------------------------------------------------------
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#081a15] flex items-center justify-center p-4 selection:bg-[#c9e265] selection:text-[#081a15]">
        <div className="w-full max-w-md bg-[#0d2720] border border-[#1d463a] rounded-3xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#c9e265]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-[#184236] border border-[#276453] rounded-2xl flex items-center justify-center text-[#c9e265] mb-4 shadow-inner">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Goregaonmeds Admin</h1>
            <p className="text-sm text-emerald-400/70 mt-1">Authorized billing & dispensation terminal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-200/80 mb-2">
                Security Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-[#113229] border border-[#204f42] rounded-xl px-4 py-3.5 text-white placeholder-emerald-800 text-sm focus:outline-none focus:border-[#c9e265] focus:ring-1 focus:ring-[#c9e265] transition"
                />
                <Lock className="absolute right-3.5 top-3.5 text-emerald-600" size={18} />
              </div>
              {loginError && <p className="text-rose-400 text-xs mt-2 font-medium">{loginError}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-[#c9e265] hover:bg-[#b8d453] active:scale-[0.99] text-[#081a15] font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-[#c9e265]/10 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : "Unlock Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentBranch = BRANCHES[branchIdx];

  // ---------------------------------------------------------------------------
  // MAIN DASHBOARD VIEW
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f3f5f4] text-slate-800 flex flex-col antialiased">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#0d2720] border-b border-[#1c4539] text-white px-4 md:px-8 py-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-[#c9e265] p-2 rounded-lg text-[#0d2720]">
            <Receipt size={20} />
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-base md:text-lg text-white leading-none">
              Goregaonmeds
            </h1>
            <span className="text-[11px] text-[#c9e265] font-mono font-medium tracking-wide">
              Smart Invoice POS v3.2
            </span>
          </div>
        </div>

        {/* Mobile View Toggle */}
        <div className="flex lg:hidden bg-[#153f33] p-1 rounded-xl border border-[#215747]">
          <button
            onClick={() => setActiveTab("edit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === "edit" ? "bg-[#c9e265] text-[#0d2720]" : "text-emerald-300"
            }`}
          >
            <Edit3 size={14} /> Form
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === "preview" ? "bg-[#c9e265] text-[#0d2720]" : "text-emerald-300"
            }`}
          >
            <Eye size={14} /> Bill
          </button>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            title="Reset Invoice"
            className="p-2 text-emerald-300 hover:text-white hover:bg-[#184236] rounded-lg transition"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setIsLoggedIn(false)}
            className="flex items-center gap-1.5 bg-[#173e33] hover:bg-[#205143] border border-[#255e4e] px-3 py-2 rounded-xl text-xs font-medium text-emerald-200 hover:text-white transition"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ============================================================ */}
          {/* LEFT FORM PANEL (Col 7) */}
          {/* ============================================================ */}
          <section
            className={`lg:col-span-7 space-y-6 ${
              activeTab === "preview" ? "hidden lg:block" : "block"
            }`}
          >
            {/* Quick Settings Card */}
            <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200/80 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="text-[#0d2720]" size={18} />
                  <h2 className="font-bold text-slate-900 text-sm tracking-wide uppercase">
                    Pharmacy & Invoice Config
                  </h2>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                  <span>INV:</span>
                  <span className="text-[#0d2720]">{invoiceNo}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Fulfillment Branch
                  </label>
                  <select
                    value={branchIdx}
                    onChange={(e) => setBranchIdx(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl p-2.5 focus:bg-white focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none transition"
                  >
                    {BRANCHES.map((b, idx) => (
                      <option key={idx} value={idx}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                    Payment Mode
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
                    {(["UPI", "Cash", "Card"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`text-xs py-2 font-bold rounded-lg transition ${
                          paymentMode === mode
                            ? "bg-white text-[#0d2720] shadow-sm"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <User size={13} /> Patient / Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Shah"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl p-2.5 focus:bg-white focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <Phone size={13} /> WhatsApp Mobile Number *
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 text-xs font-semibold text-slate-500 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl">
                      +91
                    </span>
                    <input
                      type="tel"
                      placeholder="9876543210"
                      value={customerPhone}
                      onChange={(e) =>
                        setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-r-xl p-2.5 focus:bg-white focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none transition font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Items Table Card */}
            <div className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm tracking-wide uppercase">
                  Medicine & Supply Items ({items.length})
                </h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="bg-[#0d2720] hover:bg-[#173e33] active:scale-95 text-[#c9e265] text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition"
                >
                  <Plus size={14} /> Add Medicine
                </button>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/70 transition flex flex-col sm:flex-row gap-2.5 items-center"
                  >
                    <span className="text-xs font-mono font-bold text-slate-400 w-5 text-center hidden sm:block">
                      {index + 1}
                    </span>

                    {/* Medicine Name & Batch */}
                    <div className="flex-1 w-full grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Item name (e.g. Augmentin 625)"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, "name", e.target.value)}
                        className="col-span-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs md:text-sm font-medium focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Batch"
                        value={item.batch || ""}
                        onChange={(e) => updateItem(item.id, "batch", e.target.value)}
                        className="col-span-1 bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-mono uppercase focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none"
                      />
                    </div>

                    {/* Numeric Controls */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400 sm:hidden">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.qty || ""}
                          onChange={(e) =>
                            updateItem(item.id, "qty", Math.max(1, Number(e.target.value)))
                          }
                          className="w-16 bg-white border border-slate-200 rounded-xl p-2 text-xs md:text-sm text-center font-bold focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400 sm:hidden">₹ Rate:</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="Price"
                          value={item.price || ""}
                          onChange={(e) =>
                            updateItem(item.id, "price", Math.max(0, Number(e.target.value)))
                          }
                          className="w-20 bg-white border border-slate-200 rounded-xl p-2 text-xs md:text-sm text-right font-mono font-bold focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none"
                        />
                      </div>

                      <div className="w-16 text-right font-mono text-xs font-bold text-slate-700 hidden sm:block">
                        ₹{(item.qty * item.price).toFixed(2)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition disabled:opacity-20"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Discounts & Adjustments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">
                    Discount Concession (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={discount || ""}
                    placeholder="0.00"
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl p-2.5 font-mono focus:bg-white focus:ring-2 focus:ring-[#0d2720]/20 focus:border-[#0d2720] outline-none"
                  />
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-5 sm:pt-4">
                  <label className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                    Taxes Included in MRP
                  </label>
                  <input
                    type="checkbox"
                    checked={isTaxIncluded}
                    onChange={(e) => setIsTaxIncluded(e.target.checked)}
                    className="w-5 h-5 accent-[#0d2720] rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Quick Dispatch Actions */}
            <div className="bg-gradient-to-br from-[#0d2720] to-[#143c32] rounded-3xl p-6 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs text-[#c9e265] uppercase tracking-wider font-semibold">
                  Grand Amount
                </span>
                <div className="text-3xl font-extrabold font-mono text-white tracking-tight">
                  ₹{grandTotal.toFixed(2)}
                </div>
              </div>

              <div className="flex w-full sm:w-auto items-center gap-2">
                <button
                  type="button"
                  onClick={generateAndSend}
                  disabled={loading}
                  className="flex-1 sm:flex-initial bg-[#c9e265] hover:bg-[#b8d453] text-[#0d2720] font-bold px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-[#c9e265]/20 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <>
                      <Send size={18} />
                      <span>Send WhatsApp Bill</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* RIGHT PREVIEW PANEL (Col 5) */}
          {/* ============================================================ */}
          <section
            className={`lg:col-span-5 flex flex-col items-center ${
              activeTab === "edit" ? "hidden lg:flex" : "flex"
            }`}
          >
            {/* Live Actions Bar */}
            <div className="w-full max-w-[400px] flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <CheckCircle2 size={14} className="text-emerald-600" /> Live Receipt
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadReceiptImage}
                  title="Download Image"
                  className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-sm text-xs font-semibold flex items-center gap-1"
                >
                  <Download size={14} /> PNG
                </button>
                <button
                  onClick={handlePrint}
                  title="Print Slip"
                  className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition shadow-sm text-xs font-semibold flex items-center gap-1"
                >
                  <Printer size={14} /> Print
                </button>
              </div>
            </div>

            {/* ============================================================ */}
            {/* INVOICE CANVAS (Rendered Target for html-to-image) */}
            {/* ============================================================ */}
            <div className="w-full flex justify-center overflow-x-auto pb-6">
              <div
                ref={billRef}
                className="w-[380px] bg-white border border-slate-300/80 shadow-2xl p-6 relative select-none"
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  color: "#111827",
                }}
              >
                {/* Pharmacy Header */}
                <div className="text-center border-b-2 border-black pb-3 mb-3">
                  <div className="inline-block px-2.5 py-0.5 mb-1 bg-black text-white text-[10px] uppercase font-bold tracking-widest">
                    {currentBranch.tagline}
                  </div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-black leading-tight">
                    {currentBranch.name}
                  </h1>
                  <p className="text-[10px] text-gray-700 leading-tight mt-1 px-4">
                    {currentBranch.address}
                  </p>
                  <div className="flex justify-center gap-3 text-[10px] font-semibold mt-1.5 text-gray-800">
                    <span>Ph: {currentBranch.phone}</span>
                    <span>•</span>
                    <span>DL: {currentBranch.dlNo.split("/")[0]}</span>
                  </div>
                  <p className="text-[9px] text-gray-500 font-mono">
                    GSTIN: {currentBranch.gstin}
                  </p>
                </div>

                {/* Metadata Row */}
                <div className="text-[11px] mb-3 pb-2 border-b border-dashed border-gray-400 space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>INVOICE: #{invoiceNo}</span>
                    <span className="bg-gray-100 px-1.5 rounded uppercase text-[10px]">
                      {paymentMode}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 text-[10px]">
                    <span>Date: {new Date().toLocaleDateString("en-IN")}</span>
                    <span>
                      {new Date().toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 text-black font-semibold">
                    <span>Patient: {customerName ? customerName : "Cash Patient"}</span>
                    <span>Mob: {customerPhone ? `+91-${customerPhone}` : "N/A"}</span>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-[11px] mb-3 border-collapse">
                  <thead>
                    <tr className="border-b-2 border-black text-black">
                      <th className="py-1 text-left font-extrabold uppercase">Item</th>
                      <th className="py-1 text-center font-extrabold uppercase w-10">Qty</th>
                      <th className="py-1 text-right font-extrabold uppercase w-12">Rate</th>
                      <th className="py-1 text-right font-extrabold uppercase w-16">Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .filter((i) => i.name.trim() !== "")
                      .map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-200 border-dotted">
                          <td className="py-1.5 pr-1 align-top">
                            <div className="font-bold text-black leading-tight">
                              {item.name}
                            </div>
                            {item.batch && (
                              <div className="text-[9px] text-gray-500 uppercase">
                                B:{item.batch}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 text-center align-top font-bold">
                            {item.qty}
                          </td>
                          <td className="py-1.5 text-right align-top text-gray-700">
                            {item.price.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right align-top font-bold text-black">
                            {(item.qty * item.price).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {/* Totals Summary */}
                <div className="border-t-2 border-black pt-2 mb-3 text-[11px] space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Gross Subtotal:</span>
                    <span>₹{subTotal.toFixed(2)}</span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>Discount / Subsidy:</span>
                      <span>- ₹{discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-gray-600 text-[10px]">
                    <span>
                      Est. GST (5% {isTaxIncluded ? "incl." : "added"}):
                    </span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between font-black text-sm border-t-2 border-black pt-1.5 mt-1 text-black">
                    <span>NET PAYABLE:</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* QR & Legal Footer */}
                <div className="border-t border-dashed border-gray-400 pt-3 text-center space-y-2">
                  <div className="flex justify-center items-center gap-2">
                    {/* Simulated Clean Thermal QR */}
                    <div className="w-12 h-12 border-2 border-black p-0.5 grid grid-cols-4 gap-0.5 bg-black">
                      <div className="bg-white"></div>
                      <div className="bg-black"></div>
                      <div className="bg-white"></div>
                      <div className="bg-white"></div>
                      <div className="bg-black"></div>
                      <div className="bg-white"></div>
                      <div className="bg-black"></div>
                      <div className="bg-white"></div>
                      <div className="bg-white"></div>
                      <div className="bg-black"></div>
                      <div className="bg-white"></div>
                      <div className="bg-black"></div>
                      <div className="bg-black"></div>
                      <div className="bg-white"></div>
                      <div className="bg-black"></div>
                      <div className="bg-white"></div>
                    </div>
                  </div>

                  <div className="text-[9px] text-gray-600 leading-tight">
                    <p className="font-bold text-black uppercase">
                      Thank you! Wish you a speedy recovery.
                    </p>
                    <p className="mt-0.5">
                      Prescription medicines once dispensed cannot be returned without batch
                      validation.
                    </p>
                    <p className="mt-1 font-mono text-[8px] text-gray-400">
                      Terminal Verified: Goregaonmeds Cloud System
                    </p>
                  </div>
                </div>

                {/* Zigzag Perforated Paper Edge Effect (CSS) */}
                <div
                  className="absolute left-0 right-0 -bottom-2 h-2"
                  style={{
                    background:
                      "linear-gradient(135deg, transparent 4px, white 0) top left, linear-gradient(-135deg, transparent 4px, white 0) top right",
                    backgroundSize: "8px 8px",
                    backgroundRepeat: "repeat-x",
                  }}
                />
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
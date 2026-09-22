'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { toBlob } from 'html-to-image';
import { ArrowUpRight, ArrowLeft, Check, ChevronRight, Download, Eye, FileText, Gift, History, IndianRupee, LayoutDashboard, Loader2, LockKeyhole, LogOut, Plus, Printer, ReceiptText, Search, Send, ShieldCheck, Store, Trash2, Truck, X, RefreshCw } from 'lucide-react';
import { BRANCHES, MAX_DELIVERY_PAISE, money, newBill, newItem, totals, validate, validMoney, paise, type Bill, type Fulfilment, type Item, type OfferStatus } from './billing';
import { firstOrderOfferText, formatRupees, freeGiftLabel, parseFirstOrderOffer, type FirstOrderOffer } from '../storeSettings';
import { toMobileInput } from '../phone';
import './admin.css';
import './admin-delivery.css';
import './admin-offer.css';

const API = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '')).replace(/\/+$/, '');
const date = (value: string) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
const deliveryText = (charge: number) => (charge === 0 ? 'FREE Delivery' : `Delivery: ${formatRupees(charge)}`);
const VIEW_LABELS = { billing: 'Billing studio', history: 'Server history', settings: 'Delivery settings' } as const;
type View = keyof typeof VIEW_LABELS;
const HEADINGS: Record<View, [string, string]> = {
  billing: ['Every bill, a little care.', 'Prepare, review and share. All from one thoughtful workspace.'],
  history: ['Your history, safely stored.', 'Bills securely saved on the database. Edit or manage records easily.'],
  settings: ['Delivery, your way.', 'Set the home delivery charge shown on the website and added to new delivery bills.'],
};
const OFFER_STATUSES: OfferStatus[] = ['available', 'returning_customer', 'already_redeemed', 'redeemed_here', 'no_phone', 'inactive'];

type OfferCheck = { phone: string; billId: string; status: OfferStatus; redeemedAt: string | null; reference: string | null };
type SaveResult = { bill: Bill; giftAdded: boolean };

class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function parseOfferCheck(data: unknown, phone: string, billId: string): OfferCheck | null {
  const d = data as { status?: unknown; redeemedAt?: unknown; reference?: unknown } | null;
  if (!d || typeof d.status !== 'string' || !OFFER_STATUSES.includes(d.status as OfferStatus)) return null;
  return { phone, billId, status: d.status as OfferStatus, redeemedAt: typeof d.redeemedAt === 'string' ? d.redeemedAt : null, reference: typeof d.reference === 'string' ? d.reference : null };
}

const giftNotice = (base: string, result: SaveResult) =>
  result.giftAdded && result.bill.freeGift ? `${base} Congratulations! Your FREE ${result.bill.freeGift.name} has been added.` : base;

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="ga-field"><span>{label}</span>{children}</label>; }

function Receipt({ bill }: { bill: Bill }) {
  const t = totals(bill), branch = BRANCHES[bill.branch];
  return <article className="ga-receipt">
    <div className="ga-receipt-brand"><span className="ga-receipt-cross">+</span><span>goregaon<b>meds</b><small>YOUR NEIGHBOURHOOD PHARMACY</small></span></div>
    <header><h2>{branch.name}</h2><p>{branch.address}</p><p>{branch.phone}</p>{branch.licence && <p>Drug licence: {branch.licence}</p>}{branch.gstin && <p>GSTIN: {branch.gstin}</p>}{branch.open24x7 && <p className="ga-receipt-hours">OPEN 24×7</p>}</header>
    <div className="ga-receipt-meta"><div><small>BILL SUMMARY</small><strong>{bill.reference || 'Reference pending'}</strong><span>{date(bill.createdAt)} IST</span></div><span className="ga-stamp">{t.total > 0 && t.due === 0 ? 'PAID' : t.received > 0 ? 'PART PAID' : 'UNPAID'}</span></div>
    <div className="ga-receipt-customer"><small>BILLED TO</small><strong>{bill.customer.trim() || 'Walk-in customer'}</strong>{bill.phone && <span>+91 {bill.phone}</span>}</div>
    <table><thead><tr><th>Medicine / item</th><th>Qty</th><th>Rate ₹</th><th>Total ₹</th></tr></thead><tbody>{bill.items.filter(i => i.name.trim()).map(i => <tr key={i.id}><td><strong>{i.name}</strong>{(i.batch || i.expiry) && <small>{i.batch && `Batch: ${i.batch}`}{i.expiry && ` · Exp: ${i.expiry}`}</small>}</td><td>{i.qty}</td><td>{(paise(i.rate)/100).toFixed(2)}</td><td>{(paise(i.rate)*Number(i.qty)/100).toFixed(2)}</td></tr>)}{bill.freeGift && <tr className="ga-receipt-gift"><td><strong>{freeGiftLabel(bill.freeGift.name)}</strong><small>First Order Offer · Complimentary</small></td><td>{bill.freeGift.qty}</td><td>0.00</td><td>FREE</td></tr>}</tbody></table>
    {!bill.items.some(i=>i.name.trim()) && <p className="ga-receipt-empty">Your medicines will appear here.</p>}
    <div className="ga-receipt-totals"><p><span>Subtotal</span><b>{money(t.gross)}</b></p>{t.discount > 0 && <p><span>Discount</span><b>− {money(t.discount)}</b></p>}{bill.fulfilment === 'delivery' && <p><span>Home delivery</span><b>{t.shipping === 0 ? 'FREE' : money(t.shipping)}</b></p>}<p className="ga-receipt-total"><span>Total amount</span><b>{money(t.total)}</b></p><p><span>Received · {bill.method}</span><b>{money(t.received)}</b></p><p><span>Balance due</span><b>{money(t.due)}</b></p></div>
    {bill.note.trim() && <p className="ga-receipt-note">{bill.note}</p>}
    <footer><strong>A little care, closer to home.</strong><p>Thank you for choosing your neighbourhood pharmacy.</p><small>Bill summary • Not a GST tax invoice.<br/>Request an official tax invoice from the pharmacy, if required.</small></footer>
  </article>;
}

function OfferBanner({ bill, offer, check }: { bill: Bill; offer: FirstOrderOffer | null; check: OfferCheck | null }) {
  const { merchandise } = totals(bill);
  const current = check && check.phone === bill.phone && check.billId === bill.id ? check : null;
  const giftName = bill.freeGift?.name ?? offer?.giftName;

  if (bill.freeGift || current?.status === 'redeemed_here') {
    const below = offer && merchandise < offer.minSubtotal;
    const redeemedAt = bill.freeGift?.redeemedAt ?? current?.redeemedAt;
    return <div className="ga-offer ga-offer-won" aria-live="polite"><span className="ga-offer-icon"><Gift size={19}/></span><div className="ga-offer-body"><strong>Congratulations! Your FREE {giftName} has been added.</strong><p>{freeGiftLabel(giftName ?? 'Free gift')}{redeemedAt ? ` · Redeemed ${date(redeemedAt)} IST` : ''}{below ? ` · Keep medicines at ${formatRupees(offer.minSubtotal)}+ to save changes to this bill.` : ''}</p></div></div>;
  }
  if (!offer || current?.status === 'inactive') return null;
  if (current?.status === 'already_redeemed') {
    return <div className="ga-offer ga-offer-muted" aria-live="polite"><span className="ga-offer-icon"><Gift size={19}/></span><div className="ga-offer-body"><strong>First Order Offer already used by +91 {bill.phone}</strong><p>{current.redeemedAt ? `Redeemed ${date(current.redeemedAt)} IST` : 'Redeemed earlier'}{current.reference ? ` on bill ${current.reference}` : ''}. One per customer across all branches.</p></div></div>;
  }
  if (current?.status === 'returning_customer') {
    return <div className="ga-offer ga-offer-muted" aria-live="polite"><span className="ga-offer-icon"><Gift size={19}/></span><div className="ga-offer-body"><strong>First Order Offer is for first orders only</strong><p>+91 {bill.phone} already has a previous bill, so this order does not qualify.</p></div></div>;
  }

  const remaining = Math.max(0, offer.minSubtotal - merchandise);
  const eligibleNow = current?.status === 'available' && remaining === 0;
  const progress = Math.min(100, Math.round((merchandise / offer.minSubtotal) * 100));
  const hint = !bill.phone ? "Add the customer's WhatsApp number to check eligibility."
    : !/^[6-9]\d{9}$/.test(bill.phone) ? 'Enter a valid 10-digit number to check eligibility.'
    : !current ? 'Checking eligibility…'
    : eligibleNow ? `First order for this number · Medicines ${money(merchandise)} before delivery.`
    : remaining > 0 ? `Add ${money(remaining)} more in medicines (delivery excluded) to unlock.`
    : 'Eligible once the bill meets the offer rules.';
  return <div className={`ga-offer ${eligibleNow ? 'ga-offer-ready' : 'ga-offer-promo'}`} aria-live="polite"><span className="ga-offer-icon"><Gift size={19}/></span><div className="ga-offer-body"><strong>{eligibleNow ? `Eligible! The FREE ${offer.giftName} will be added automatically when you save.` : firstOrderOfferText(offer)}</strong><p>{hint}</p>{!eligibleNow && <span className="ga-offer-meter" aria-hidden="true"><span style={{ width: `${progress}%` }}/></span>}</div></div>;
}

export default function AdminPanel() {
  const [token, setToken] = useState('');
  const tokenRef = useRef('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [bill, setBill] = useState<Bill | null>(null);
  const [saved, setSaved] = useState<Bill[]>([]);
  const savedRef = useRef<Bill[]>([]);
  const [view, setView] = useState<View>('billing');
  const [query, setQuery] = useState('');
  const [mobilePreview, setMobilePreview] = useState(false);
  const [busy, setBusy] = useState('');
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'new'|'logout'|'share'|null>(null);
  const [shareConsent, setShareConsent] = useState(false);
  const [ready, setReady] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState<number | null>(null);
  const [chargeInput, setChargeInput] = useState('');
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState('');
  const [firstOrderOffer, setFirstOrderOffer] = useState<FirstOrderOffer | null>(null);
  const [offerCheck, setOfferCheck] = useState<OfferCheck | null>(null);
  const [offerRefresh, setOfferRefresh] = useState(0);
  const exportRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const uploadCache = useRef<{key:string;url:string}|null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = !!bill && (bill.items.some(i=>i.name || i.rate) || !!bill.customer || !!bill.phone);
  const billPhone = bill?.phone ?? '';
  const billId = bill?.id ?? '';

  useEffect(() => { setBill(newBill()); mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); if(expiryTimer.current) clearTimeout(expiryTimer.current); }; }, []);
  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if(dialog) modalRef.current?.showModal(); else modalRef.current?.close(); }, [dialog]);
  useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if(dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload',handler); return ()=>window.removeEventListener('beforeunload',handler); }, [dirty]);

  // Debounced, admin-only eligibility preview. The server re-checks and claims atomically on save.
  useEffect(() => {
    if (!token || !/^[6-9]\d{9}$/.test(billPhone)) { setOfferCheck(null); return; }
    const offerController = new AbortController();
    const timer = setTimeout(() => {
      api(`/api/admin/offers/first-order?phone=${billPhone}&billId=${encodeURIComponent(billId)}`, { signal: offerController.signal })
        .then(data => { if (!offerController.signal.aborted) setOfferCheck(parseOfferCheck(data, billPhone, billId)); })
        .catch(() => { if (!offerController.signal.aborted) setOfferCheck(null); });
    }, 350);
    return () => { clearTimeout(timer); offerController.abort(); };
    // api only reads refs and stable setters, so it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, billPhone, billId, offerRefresh]);

  const update = (patch: Partial<Bill>) => { setBill(b=>b ? {...b,...patch} : b); setReady(''); setError(''); setNotice(''); uploadCache.current=null; };
  const itemUpdate = (id: string, patch: Partial<Item>) => { if(bill) update({ items: bill.items.map(i=> i.id === id ? {...i,...patch} : i) }); };
  
  function forgetSession(clearBill: boolean) {
    tokenRef.current=''; setToken(''); setPassword(''); setReady(''); uploadCache.current=null;
    if(expiryTimer.current) clearTimeout(expiryTimer.current);
    if(clearBill) { setBill(newBill()); setSaved([]); setView('billing'); setNotice(''); setError(''); }
  }

  async function api(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    if(tokenRef.current) headers.set('Authorization', `Bearer ${tokenRef.current}`);
    const response = await fetch(`${API}${path}`, {...options, headers, signal: options.signal ?? controller.current?.signal});
    const data = await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
    if(!response.ok) {
      if(response.status === 401 && path !== '/api/admin/login') forgetSession(false);
      throw new ApiError(data?.error || `Request failed (${response.status}).`, response.status, data && typeof data === 'object' ? data : {});
    }
    return data;
  }

  async function task(label: string, action: ()=>Promise<void>) {
    if(lock.current) return;
    lock.current=true; setBusy(label); setError(''); setNotice('');
    controller.current=new AbortController();
    const timeout=setTimeout(()=>controller.current?.abort(),90000);
    try { await action(); } catch(e) { if(mounted.current) setError(e instanceof Error ? (e.name==='AbortError'?'Request timed out. Please retry.':e.message) : 'Something went wrong. Please retry.'); }
    finally { clearTimeout(timeout); controller.current=null; lock.current=false; if(mounted.current) setBusy(''); }
  }

  // --- API INTEGRATIONS START ---

  async function loadHistory() {
    try {
      const data = await api('/api/admin/bills?limit=50');
      if (data.bills) setSaved(data.bills);
    } catch(e) { console.error("Failed to load history"); }
  }

  function applySettings(data: unknown, syncInput: boolean) {
    const settings = data as { deliveryCharge?: unknown; updatedAt?: unknown; firstOrderOffer?: unknown } | null;
    const charge = settings?.deliveryCharge;
    if (typeof charge !== 'number' || !Number.isInteger(charge) || charge < 0) throw new Error('The server returned an invalid delivery charge.');
    setDeliveryCharge(charge);
    setSettingsUpdatedAt(typeof settings?.updatedAt === 'string' ? settings.updatedAt : '');
    if (settings && 'firstOrderOffer' in settings) setFirstOrderOffer(parseFirstOrderOffer(settings.firstOrderOffer));
    if (syncInput) setChargeInput((charge / 100).toFixed(charge % 100 ? 2 : 0));
    // Unsaved delivery drafts follow the live setting; saved bills keep their snapshot.
    setBill(b => b && b.fulfilment === 'delivery' && b.shipping !== charge && !savedRef.current.some(s => s.id === b.id) ? { ...b, shipping: charge } : b);
  }

  async function loadSettings(syncInput = true) {
    applySettings(await api('/api/admin/settings'), syncInput);
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!validMoney(chargeInput) || paise(chargeInput) > MAX_DELIVERY_PAISE) {
      setError('Enter a delivery charge from ₹0 to ₹10,000 with at most 2 decimal places.');
      return;
    }
    await task('Saving delivery charge', async () => {
      const data = await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliveryCharge: chargeInput }) });
      applySettings(data, true);
      setNotice(data.deliveryCharge === 0 ? 'Delivery is now FREE on the website and new delivery bills.' : `Delivery charge set to ${formatRupees(data.deliveryCharge)} for the website and new delivery bills.`);
    });
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    await task('Signing in', async()=> {
      const data = await api('/api/admin/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) });
      if(typeof data.token!=='string' || !Number.isFinite(data.expiresAt)) throw new Error('Update the backend using the included admin-api.js integration.');
      tokenRef.current=data.token; setToken(data.token); setPassword('');
      expiryTimer.current=setTimeout(()=>{forgetSession(false); setError('Session expired. Sign in again to continue your draft.');},Math.max(0,data.expiresAt-Date.now()));
      await loadHistory();
      // Billing still works without it: the server resolves the charge and corrects the draft on save.
      await loadSettings().catch(() => {});
    });
  }

  // --- YAHAN CHANGE KIYA HAI ---
  async function saveToDatabase(snapshot: Bill): Promise<SaveResult> {
    const isExisting = saved.some(s => s.id === snapshot.id);
    const path = isExisting ? `/api/admin/bills/${snapshot.id}` : '/api/admin/bills';
    const method = isExisting ? 'PUT' : 'POST';

    let data: { bill: Bill; giftAdded?: boolean };
    try {
      data = await api(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot) // Direct snapshot bhejna hai, `billId` map mat karo yahan
      });
    } catch (e) {
      // 409: the delivery charge changed after this draft was prepared. Show the server's value before any retry.
      if (e instanceof ApiError && e.status === 409 && Number.isInteger(e.data.shipping)) {
        const shipping = e.data.shipping as number;
        setBill(b => b && b.id === snapshot.id ? { ...b, shipping } : b);
        uploadCache.current = null;
        void loadSettings(false).catch(() => {});
      }
      throw e;
    }
    
    // Update frontend state immediately. flushSync so a PNG render or print that follows includes the server's gift.
    flushSync(() => {
      setSaved(old => [data.bill, ...old.filter(b => b.id !== data.bill.id)]);
      setBill(b => b && b.id === data.bill.id ? { ...b, phone: data.bill.phone, freeGift: data.bill.freeGift ?? null } : b);
    });
    setOfferRefresh(n => n + 1);
    return { bill: data.bill, giftAdded: data.giftAdded === true };
  }

  async function deleteBill(id: string) {
    if (!window.confirm('Are you sure you want to delete this bill permanently?')) return;
    await task('Deleting bill', async () => {
      await api(`/api/admin/bills/${id}`, { method: 'DELETE' });
      setSaved(old => old.filter(b => b.id !== id));
      setNotice('Bill deleted successfully.');
      setOfferRefresh(n => n + 1);
      if (bill?.id === id) setBill(newBill()); // Agar wahi bill open tha, clear kardo
    });
  }

  // --- API INTEGRATIONS END ---

  function setFulfilment(fulfilment: Fulfilment) {
    if (!bill || bill.fulfilment === fulfilment) return;
    // Mirrors the server: a bill already saved as delivery keeps its original charge.
    const savedCopy = saved.find(s => s.id === bill.id);
    const shipping = fulfilment === 'pickup' ? 0 : savedCopy?.fulfilment === 'delivery' ? savedCopy.shipping : deliveryCharge ?? 0;
    update({ fulfilment, shipping });
    if (fulfilment === 'delivery' && deliveryCharge === null) void loadSettings(false).catch(() => {});
  }

  function check(requirePhone=false) { const message=bill ? validate(bill,requirePhone) : 'Please wait for the bill to load.'; if(message) {setError(message); return false;} return true; }

  async function blob() {
    if(!exportRef.current) throw new Error('Receipt is not ready. Please retry.');
    await document.fonts.ready;
    const result=await toBlob(exportRef.current,{pixelRatio:2,backgroundColor:'#fff',skipFonts:true, width:480});
    if(!result || result.size===0) throw new Error('Receipt could not be rendered. Try printing instead.');
    if(result.size>15*1024*1024) throw new Error('This receipt image exceeds 15 MB. Print to PDF instead.');
    return result;
  }
  
  function download(data: Blob, filename: string) { const url=URL.createObjectURL(data); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
  
  function downloadImage() { 
    if(!check() || !bill) return; 
    void task('Rendering receipt', async()=>{
      // Save first so a server-corrected delivery charge or gift never ends up only in the downloaded image.
      const result = await saveToDatabase(bill); 
      download(await blob(), `${bill.reference.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`); 
      setNotice(giftNotice('Receipt downloaded & bill saved.', result));
    }); 
  }
  
  function printBill() { 
    if(!check() || !bill) return; 
    void task('Saving before print', async () => {
      const result = await saveToDatabase(bill);
      if (result.giftAdded) setNotice(giftNotice('Bill saved.', result));
      window.print();
    });
  }
  
  function exportSession() { download(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),bills:saved},null,2)],{type:'application/json'}),'goregaonmeds-session.json'); setNotice('Database history exported to JSON.'); }
  
  function share() { if(check(true)) {setShareConsent(false); setDialog('share');} }
  
  async function prepareShare() {
    if(!bill || !shareConsent || !check(true)) return;
    const snapshot=structuredClone(bill);
    setDialog(null);
    await task('Preparing WhatsApp',async()=> {
      const result = await saveToDatabase(snapshot); // Save to DB before sharing
      const finalBill: Bill = { ...snapshot, phone: result.bill.phone, freeGift: result.bill.freeGift ?? null };
      const key=JSON.stringify(finalBill);
      let url=uploadCache.current?.key===key ? uploadCache.current.url : '';
      if(!url) {
        const form=new FormData(); form.append('image',await blob(),'receipt.png');
        const data=await api('/api/admin/upload',{method:'POST',body:form});
        const parsed=new URL(data.url);
        if(parsed.protocol!=='https:') throw new Error('The upload service returned an invalid receipt link.');
        url=parsed.href; uploadCache.current={key,url};
      }
      const t=totals(finalBill);
      const giftLine = finalBill.freeGift ? `🎁 Free gift: ${freeGiftLabel(finalBill.freeGift.name)}\n` : '';
      const deliveryLine = finalBill.fulfilment === 'delivery' ? `Home delivery: ${t.shipping === 0 ? 'FREE' : money(t.shipping)}\n` : '';
      const message=`*${BRANCHES[finalBill.branch].name} — Bill summary*\nReference: ${finalBill.reference}\nCustomer: ${finalBill.customer || 'Walk-in customer'}\nDate: ${date(finalBill.createdAt)} IST\n\n${giftLine}${deliveryLine}Total: ${money(t.total)}\nReceived (${finalBill.method}): ${money(t.received)}\nBalance due: ${money(t.due)}\n\nView your bill:\n${url}\n\nThank you for choosing Goregaonmeds.`;
      setReady(`https://wa.me/91${finalBill.phone}?text=${encodeURIComponent(message)}`); setNotice(giftNotice('Your WhatsApp message is ready. Open it below and tap Send in WhatsApp.', result));
    });
  }
  
  async function logout() { setDialog(null); await task('Signing out',async()=>{ await api('/api/admin/logout',{method:'POST'}); forgetSession(true); }); }
  function openSettings() { setView('settings'); void task('Loading delivery settings', () => loadSettings(true)); }
  const alert = error ? <div className="ga-alert ga-alert-error" role="alert" tabIndex={-1} ref={errorRef}>{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div> : null;

  if(!token) return <div className="ga ga-login"><div className="ga-login-story"><a href="/" className="ga-wordmark"><span className="ga-logo">+</span>goregaon<span>meds</span></a><div><span className="ga-kicker">THE NEIGHBOURHOOD DESK</span><h1>Good care.<br/><em>Beautifully<br/>organised.</em></h1><p>A calmer space for your pharmacy’s everyday billing.</p></div><span className="ga-login-foot">THREE BRANCHES. ONE NEIGHBOURHOOD. <span>✳</span></span></div><main className="ga-login-main"><div className="ga-login-card"><span className="ga-lock-icon"><LockKeyhole size={24}/></span><span className="ga-kicker">STAFF ACCESS</span><h2>Welcome to your desk.</h2><p>Sign in to prepare bills and share a little care.</p><form onSubmit={login}>{alert}<Field label="Administrator password"><span className="ga-password"><input autoFocus type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256} placeholder="Enter your password"/><button type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}><Eye size={18}/></button></span></Field><button className="ga-btn ga-primary" disabled={!!busy}>{busy?<Loader2 className="ga-spin" size={18}/>:<>Open billing studio <ArrowUpRight size={19}/></>}</button></form><small><ShieldCheck size={15}/> Access is verified by your pharmacy server.</small><a className="ga-back" href="/"><ArrowLeft size={15}/> Back to Goregaonmeds</a></div></main></div>;
  if(!bill) return <div className="ga">Loading billing studio…</div>;
  const t=totals(bill);
  const savedCopy=saved.find(s=>s.id===bill.id);
  const filtered=saved.filter(b=>`${b.reference} ${b.customer} ${b.phone} ${BRANCHES[b.branch].name}`.toLowerCase().includes(query.toLowerCase()));
  const [headingTitle, headingText] = HEADINGS[view];
  const chargeInputPaise = validMoney(chargeInput) ? paise(chargeInput) : null;
  
  return <div className="ga ga-app">
    <aside className="ga-sidebar ga-no-print"><a href="/" className="ga-wordmark"><span className="ga-logo">+</span>goregaon<span>meds</span></a><span className="ga-sidebar-label">PHARMACY WORKSPACE</span><nav aria-label="Admin navigation"><button className={view==='billing'?'active':''} onClick={()=>setView('billing')} disabled={!!busy}><LayoutDashboard size={19}/> Billing studio <ChevronRight size={15}/></button><button className={view==='history'?'active':''} onClick={()=>{setView('history'); void loadHistory();}} disabled={!!busy}><History size={19}/> Server history <span className="ga-count">{saved.length}</span></button><button className={view==='settings'?'active':''} onClick={openSettings} disabled={!!busy}><Truck size={19}/> Delivery settings <ChevronRight size={15}/></button></nav><div className="ga-sidebar-note"><span>✳</span><h3>Local care.<br/>A little closer.</h3><p>Thoughtful billing, from your neighbourhood pharmacy.</p><span className="ga-location-dot"/> GOREGAON EAST</div><button className="ga-signout" onClick={()=>setDialog('logout')} disabled={!!busy}><LogOut size={17}/> Sign out</button></aside>
    <div className="ga-workspace ga-no-print"><header className="ga-topbar"><span>Workspace <ChevronRight size={13}/> <b>{VIEW_LABELS[view]}</b></span><span className="ga-staff"><span>HC</span> Pharmacy desk <button aria-label="Sign out" onClick={()=>setDialog('logout')} disabled={!!busy}><LogOut size={16}/></button></span></header>
    <main className="ga-main"><div className="ga-page-heading"><div><span className="ga-kicker">{shortDate(bill.createdAt)} · GOREGAON EAST</span><h1>{headingTitle}</h1><p>{headingText}</p></div><button className="ga-btn ga-primary" onClick={()=>setDialog('new')} disabled={!!busy}><Plus size={18}/> New bill</button></div>
    <nav className="ga-mobile-nav" aria-label="Workspace sections"><button className={view==='billing'?'active':''} onClick={()=>setView('billing')} disabled={!!busy}><ReceiptText size={16}/> Billing</button><button className={view==='history'?'active':''} onClick={()=>{setView('history'); void loadHistory();}} disabled={!!busy}><History size={16}/> History ({saved.length})</button><button className={view==='settings'?'active':''} onClick={openSettings} disabled={!!busy}><Truck size={16}/> Delivery</button></nav>
    {alert}{notice && <div className="ga-alert" role="status"><Check size={17}/>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {view==='billing' ? <>
      <div className="ga-stats"><div><span className="ga-stat-icon"><ReceiptText size={20}/></span><span>Bill total<strong>{money(t.total)}</strong></span><small>Current bill</small></div><div><span className="ga-stat-icon"><IndianRupee size={20}/></span><span>Balance due<strong>{money(t.due)}</strong></span><small>{t.received>0?'Payment recorded':'Awaiting payment'}</small></div><div><span className="ga-stat-icon"><Store size={20}/></span><span>Serving from<strong className="ga-stat-branch">{BRANCHES[bill.branch].name}</strong></span><small>{BRANCHES[bill.branch].open24x7 ? `${BRANCHES[bill.branch].area} · Open 24×7` : BRANCHES[bill.branch].area}</small></div></div>
      <OfferBanner bill={bill} offer={firstOrderOffer} check={offerCheck}/>
      <div className="ga-mobile-tabs"><button className={!mobilePreview?'active':''} onClick={()=>setMobilePreview(false)}>Edit bill</button><button className={mobilePreview?'active':''} onClick={()=>setMobilePreview(true)}>Receipt preview</button></div>
      <div className={`ga-billing-grid ${mobilePreview?'ga-show-preview':''}`}>
      <fieldset className="ga-editor" disabled={!!busy}><legend className="ga-sr">Bill editor</legend>
        <section className="ga-card"><div className="ga-card-title"><span className="ga-step">01</span><div><h2>The essentials</h2><p>Branch, customer and bill details.</p></div><span className="ga-chip">{savedCopy ? 'Editing' : 'Draft'}</span></div><div className="ga-fields"><Field label="Pharmacy branch"><select value={bill.branch} onChange={e=>update({branch:Number(e.target.value)})}>{BRANCHES.map((b,i)=><option value={i} key={b.name}>{b.open24x7 ? `${b.name} · Open 24×7` : b.name}</option>)}</select></Field><Field label="Bill reference"><input value={bill.reference} onChange={e=>update({reference:e.target.value})} maxLength={50}/></Field><Field label="Customer name · optional"><input value={bill.customer} onChange={e=>update({customer:e.target.value})} maxLength={80} placeholder="Walk-in customer" autoComplete="off"/></Field><Field label="WhatsApp number"><div className="ga-phone"><span>+91</span><input type="tel" inputMode="numeric" value={bill.phone} onChange={e=>update({phone:toMobileInput(e.target.value)})} maxLength={16} placeholder="10-digit mobile" autoComplete="off" aria-label="Customer WhatsApp number"/></div></Field></div></section>
        <section className="ga-card"><div className="ga-card-title"><span className="ga-step">02</span><div><h2>Medicines & essentials</h2><p>Use the selling price for the quantity unit entered.</p></div><span className="ga-chip">{bill.items.length} items</span></div><div className="ga-items">{bill.items.map((item,index)=><div className="ga-item" key={item.id}><div className="ga-item-top"><span className="ga-item-index">{String(index+1).padStart(2,'0')}</span><Field label={`Medicine ${index+1}`}><input value={item.name} onChange={e=>itemUpdate(item.id,{name:e.target.value})} placeholder="Medicine name, strength & pack" maxLength={160}/></Field><button className="ga-icon-button ga-remove" type="button" aria-label={`Remove medicine ${index+1}`} disabled={bill.items.length===1} onClick={()=>update({items:bill.items.filter(i=>i.id!==item.id)})}><Trash2 size={16}/></button></div><div className="ga-item-details"><Field label="Batch"><input value={item.batch} onChange={e=>itemUpdate(item.id,{batch:e.target.value})} maxLength={30} placeholder="Optional"/></Field><Field label="Expiry"><input type="month" value={item.expiry} onChange={e=>itemUpdate(item.id,{expiry:e.target.value})}/></Field><Field label="Qty"><input type="number" min={1} max={9999} step={1} value={item.qty} onChange={e=>itemUpdate(item.id,{qty:e.target.value})}/></Field><Field label="Rate ₹"><input type="number" min={0} max={9999999.99} step="0.01" value={item.rate} onChange={e=>itemUpdate(item.id,{rate:e.target.value})} placeholder="0.00"/></Field><div className="ga-line-total"><span>Amount</span><strong>{money(paise(item.rate)*(Number(item.qty)||0))}</strong></div></div></div>)}</div><button className="ga-add-item" onClick={()=>update({items:[...bill.items,newItem()]})} disabled={bill.items.length>=50}><Plus size={17}/> Add another medicine <span>{bill.items.length}/50</span></button></section>
        <section className="ga-card"><div className="ga-card-title"><span className="ga-step">03</span><div><h2>A little finishing touch</h2><p>Order type, discount, payment and a note for your customer.</p></div></div>
          <div className="ga-payment-row ga-fulfilment-row"><div><span className="ga-label">Order type</span><div className="ga-segment">{(['pickup','delivery'] as const).map(value=><button type="button" key={value} aria-pressed={bill.fulfilment===value} className={bill.fulfilment===value?'active':''} onClick={()=>setFulfilment(value)}>{value==='pickup'?'Counter pickup':'Home delivery'}</button>)}</div></div>{bill.fulfilment==='delivery' && <span className={`ga-delivery-chip${t.shipping===0?' ga-free':''}`}><Truck size={14}/>{deliveryText(t.shipping)}</span>}</div>
          <div className="ga-fields"><Field label="Discount ₹"><input type="number" min={0} step="0.01" value={bill.discount} onChange={e=>update({discount:e.target.value})}/></Field><Field label="Amount received ₹"><input type="number" min={0} step="0.01" value={bill.received} onChange={e=>update({received:e.target.value})}/></Field></div><div className="ga-payment-row"><div><span className="ga-label">Payment method</span><div className="ga-segment">{(['UPI','Cash','Card'] as const).map(method=><button type="button" key={method} aria-pressed={bill.method===method} className={bill.method===method?'active':''} onClick={()=>update({method})}>{method}</button>)}</div></div><button type="button" className="ga-text-button" onClick={()=>update({received:(t.total/100).toFixed(2)})}><Check size={15}/> Mark fully paid</button></div><Field label="Customer note · optional"><textarea value={bill.note} onChange={e=>update({note:e.target.value})} rows={2} maxLength={300} placeholder="Add a short message for your customer…"/></Field><p className="ga-hint">Entered selling prices are used as-is. No estimated GST is added.{bill.fulfilment==='delivery' && (savedCopy?.fulfilment==='delivery' ? ' This saved bill keeps the delivery charge it was created with.' : ' The current delivery charge is applied by the server when you save.')}</p></section>
      <button type="button" className="ga-btn ga-primary ga-review-mobile" onClick={()=>{if(check()){setMobilePreview(true);window.scrollTo({top:0,behavior:'instant'});}}}>Review & share bill <ArrowUpRight size={18}/></button>
      </fieldset>
      <aside className="ga-preview-panel"><div className="ga-preview-heading"><span><span className="ga-live-dot"/> LIVE PREVIEW</span><div><button className="ga-icon-button" aria-label="Download receipt PNG" onClick={downloadImage} disabled={!!busy}><Download size={17}/></button><button className="ga-icon-button" aria-label="Print receipt" onClick={printBill} disabled={!!busy}><Printer size={17}/></button></div></div><div className="ga-paper-stage"><Receipt bill={bill}/></div><div className="ga-dispatch"><div><span>Ready for your customer</span><strong>{money(t.total)}</strong><small>{t.units} units · {bill.items.length} line items{bill.fulfilment==='delivery' ? (t.shipping===0 ? ' · FREE delivery' : ` · incl. ${formatRupees(t.shipping)} delivery`) : ''}{bill.freeGift ? ' · + FREE gift' : ''}</small></div><button className="ga-btn ga-lime" onClick={share} disabled={!!busy}>{busy?<><Loader2 size={17} className="ga-spin"/>{busy}…</>:<><Send size={17}/> Prepare WhatsApp bill <ArrowUpRight size={17}/></>}</button><div className="ga-secondary-actions"><button onClick={downloadImage} disabled={!!busy}><Download size={15}/> PNG</button><button onClick={printBill} disabled={!!busy}><Printer size={15}/> Print / PDF</button><button onClick={()=>{if(check()){ void task('Saving to database', async()=>{ const result = await saveToDatabase(bill!); setNotice(giftNotice('Bill saved successfully.', result)); }); }}} disabled={!!busy}><History size={15}/> Save to Database</button></div><p>Review the details before sharing.</p></div>{ready && <a className="ga-btn ga-whatsapp" href={ready} target="_blank" rel="noopener noreferrer">Open WhatsApp & send <ArrowUpRight size={18}/></a>}</aside>
      </div>
    </> : view==='history' ? <section className="ga-card ga-history"><div className="ga-history-head"><div><h2>Server history <span className="ga-chip">{saved.length}</span></h2><p>Bills saved in the database.</p></div><div style={{display: 'flex', gap: '8px'}}><button className="ga-btn ga-outline" onClick={()=>void task('Refreshing', loadHistory)} disabled={!!busy}><RefreshCw size={16}/> Refresh</button><button className="ga-btn ga-outline" onClick={exportSession} disabled={!saved.length}><Download size={16}/> Export JSON</button></div></div><label className="ga-search"><Search size={18}/><input aria-label="Search session bills" placeholder="Search customer, branch or reference…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{filtered.length ? <div className="ga-history-table"><table><thead><tr><th>Bill / customer</th><th>Branch</th><th>Total</th><th>Balance</th><th/></tr></thead><tbody>{filtered.map(b=><tr key={b.id}><td><strong>{b.customer || 'Walk-in customer'}</strong><small>{b.reference} · {shortDate(b.createdAt)}{b.fulfilment==='delivery' ? ` · ${b.shipping ? `Delivery ${formatRupees(b.shipping)}` : 'FREE delivery'}` : ''}{b.freeGift ? ' · 🎁 Free gift' : ''}</small></td><td>{BRANCHES[b.branch].name}</td><td>{money(totals(b).total)}</td><td>{money(totals(b).due)}</td><td><div style={{display:'flex',gap:'4px'}}><button className="ga-icon-button" aria-label={`Reopen bill ${b.reference}`} onClick={()=>{if(dirty && !window.confirm('Replace the current draft with this saved bill?'))return;setBill(structuredClone({ ...b, freeGift: b.freeGift ?? null }));setReady('');setError('');setNotice('');uploadCache.current=null;setView('billing');}}><ArrowUpRight size={17}/></button><button className="ga-icon-button ga-remove" aria-label={`Delete bill ${b.reference}`} onClick={()=>deleteBill(b.id)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>:<div className="ga-empty"><FileText size={34}/><h3>{query?'No matching bills.':'A fresh start.'}</h3><p>{query?'Try another name or reference.':'Saved bills from the database will appear here.'}</p></div>}</section>
    : <section className="ga-card ga-settings"><div className="ga-card-title"><span className="ga-step"><Truck size={15}/></span><div><h2>Home delivery charge</h2><p>Shown on the website and added to new home-delivery bills.</p></div><span className={`ga-chip${deliveryCharge===0?' ga-free':''}`}>{deliveryCharge===null ? 'Not loaded' : deliveryText(deliveryCharge)}</span></div>
        <form className="ga-settings-form" onSubmit={saveSettings}>
          <Field label="Delivery charge ₹"><input type="number" inputMode="decimal" min={0} max={MAX_DELIVERY_PAISE/100} step="0.01" value={chargeInput} onChange={e=>setChargeInput(e.target.value)} placeholder="0" required disabled={!!busy}/></Field>
          <div className="ga-presets" role="group" aria-label="Common delivery charges">{[0,20,40,50].map(value=><button type="button" key={value} aria-pressed={chargeInputPaise===value*100} onClick={()=>setChargeInput(String(value))} disabled={!!busy}>{value===0?'Free':`₹${value}`}</button>)}</div>
          <p className="ga-hint">Enter 0 to show FREE Delivery on the website and on new delivery bills. Bills already saved keep the charge they were created with.</p>
          <button className="ga-btn ga-primary" disabled={!!busy || chargeInput==='' || chargeInputPaise===deliveryCharge}>{busy==='Saving delivery charge' ? <><Loader2 size={17} className="ga-spin"/> Saving…</> : <><Check size={17}/> Save delivery charge</>}</button>
        </form>
        {settingsUpdatedAt && <p className="ga-settings-meta">Last changed {date(settingsUpdatedAt)} IST</p>}
      </section>}
    <footer className="ga-workspace-footer"><span>Goregaonmeds / {VIEW_LABELS[view]}</span><span>Made for your neighbourhood. <span>✳</span></span></footer></main></div>
    <div className="ga-export" aria-hidden="true"><div ref={exportRef}><Receipt bill={bill}/></div></div>
    <dialog className="ga-dialog" ref={modalRef} onCancel={e=>{e.preventDefault();if(!busy)setDialog(null);}}><div className="ga-dialog-body"><button className="ga-dialog-close ga-icon-button" aria-label="Close dialog" onClick={()=>setDialog(null)}><X size={18}/></button>{dialog==='share'?<><span className="ga-lock-icon"><Send size={23}/></span><h2>One final check.</h2><p>Prepare this bill for <strong>+91 {bill.phone}</strong>. Total: <strong>{money(t.total)}</strong>{bill.fulfilment==='delivery' && <> ({t.shipping===0?'FREE delivery':`incl. ${formatRupees(t.shipping)} delivery`})</>}.{bill.freeGift && <> Includes <strong>{freeGiftLabel(bill.freeGift.name)}</strong>.</>}</p><label className="ga-share-consent"><input type="checkbox" checked={shareConsent} onChange={e=>setShareConsent(e.target.checked)}/><span>I have checked the recipient and have permission to upload this bill. The Cloudinary link will be viewable by anyone who has it.</span></label><button className="ga-btn ga-primary" disabled={!shareConsent || !!busy} onClick={()=>void prepareShare()}>Prepare message <ArrowUpRight size={17}/></button><small>You will tap Send yourself in WhatsApp.</small></>:<><h2>{dialog==='new'?'Start a fresh bill?':'Close your desk?'}</h2><p>{dialog==='new'?'Your current draft will be replaced. Save it to the database first if you need it.':'Signing out clears your draft screen.'}</p><div className="ga-dialog-actions"><button className="ga-btn ga-outline" onClick={()=>setDialog(null)}>Keep working</button><button className="ga-btn ga-primary" onClick={()=>{if(dialog==='logout'){void logout();return;}setBill(newBill());setReady('');setNotice('');setError('');uploadCache.current=null;setMobilePreview(false);setView('billing');setDialog(null);}}> {dialog==='new'?'New bill':'Sign out'}</button></div></>}</div></dialog>
  </div>;
}
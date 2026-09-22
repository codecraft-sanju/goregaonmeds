'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Check, Clock, Gift, HelpCircle, Truck, X } from 'lucide-react';
import { formatRupees, type FirstOrderOffer } from '../storeSettings';
import './welcome-experience.css';

// Presentation metadata supplied by the pharmacy. Prices elsewhere stay server-owned.
export const GLUCOONE_MRP_PAISE = 65000;
const PRODUCT_IMAGE = '/glucoone-bg03.png';
export const isGlucoOne = (name: string) => /gluco\s*one|bg[\s-]*03/i.test(name);

function readFlag(key: string, session = false) {
  try { return (session ? sessionStorage : localStorage).getItem(key) === '1'; }
  catch { return false; }
}
function writeFlag(key: string, session = false) {
  try { (session ? sessionStorage : localStorage).setItem(key, '1'); }
  catch { /* Private browsing: experience still works without persistence. */ }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} className="gx gx-modal" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h2 id={titleId} className="gx-sr">{title}</h2>
      <button type="button" autoFocus className="gx-close" aria-label="Close welcome window" onClick={onClose}><X size={20}/></button>
      {children}
    </dialog>
  );
}

export function GiftImage({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  if (!isGlucoOne(name) || failed) return <div className="gx-image-fallback"><Gift size={42} strokeWidth={1.3}/><span>{name}</span></div>;
  return (
    // Local product asset; ordinary img also supports the receipt export workflow.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="gx-product-image" src={PRODUCT_IMAGE} width={360} height={300}
      alt="Dr. Morepen glucoOne BG-03 blood glucose monitoring system" onError={() => setFailed(true)}/>
  );
}

function DeliveryLine({ charge }: { charge: number | null }) {
  return <span className={`gx-delivery ${charge === 0 ? 'gx-delivery-free' : ''}`}><Truck size={16}/>
    {charge === null ? 'Delivery charge confirmed on WhatsApp' : charge === 0 ? 'FREE delivery in Goregaon East' : `Delivery ${formatRupees(charge)} · Goregaon East`}
  </span>;
}

function GiftPrice({ name }: { name: string }) {
  return <div className="gx-price">{isGlucoOne(name) && <span>MRP <s>{formatRupees(GLUCOONE_MRP_PAISE)}</s></span>}<strong>FREE</strong><span>on eligible first orders</span></div>;
}

/** Use beside the order form and in the admin workspace. Never adds a bill item. */
export function OfferProduct({ offer, compact = false }: { offer: FirstOrderOffer; compact?: boolean }) {
  return <aside className={`gx gx-product-card ${compact ? 'gx-compact' : ''}`} aria-label="First order gift details">
    <div className="gx-card-art"><GiftImage name={offer.giftName}/></div>
    <div className="gx-card-copy"><span className="gx-eyebrow">A welcome gift, on us</span>
      <h3>{isGlucoOne(offer.giftName) ? 'Dr. Morepen glucoOne BG-03' : offer.giftName}</h3>
      <GiftPrice name={offer.giftName}/>
      <p>First order of {formatRupees(offer.minSubtotal)}+ in medicines after discount, excluding delivery. Once per mobile number across all 3 branches. Pharmacy confirms eligibility when saving your bill.</p>
    </div>
  </aside>;
}

type Step = { title: string; text: string; points: string[] };
const customerSteps: Step[] = [
  { title: 'Tell us what you need.', text: 'Start with your medicine list or a clear prescription photo.', points: ['Include the medicine name, strength and quantity.', 'Prescription upload asks for permission before sharing a link.'] },
  { title: 'Choose your local pharmacy.', text: 'Apple, Lotus and Healthzone serve Goregaon East.', points: ['Only Healthzone & Cosmetic is open 24×7.', 'Add your full address and mobile number. Delivery timing is confirmed in chat.'] },
  { title: 'Send. Confirm. Pay on delivery.', text: 'Slide to WhatsApp, then tap Send in WhatsApp.', points: ['The pharmacy confirms stock, final price and gift eligibility.', 'Pay by cash or UPI at delivery. No payment is collected on the website.'] },
];
const adminSteps: Step[] = [
  { title: 'Start with the right customer.', text: 'Choose the branch, then enter the customer details.', points: ['Use the customer’s own 10-digit mobile number for gift eligibility.', 'Only Healthzone & Cosmetic should display Open 24×7.'] },
  { title: 'Build an accurate bill.', text: 'Add medicines, quantities and selling prices.', points: ['Choose counter pickup or home delivery.', 'Review discount, received amount and balance due before saving.'] },
  { title: 'Let the server decide the gift.', text: 'The offer banner shows eligibility for the current number and bill.', points: ['Minimum medicines value is measured after discount, before delivery.', 'Do not add the promotional gift as a paid medicine. The server attaches it at ₹0 when eligible.'] },
  { title: 'Set delivery. Review. Share.', text: 'Delivery settings control the website charge and new delivery bills.', points: ['Set delivery to ₹0 for FREE delivery; save settings after changing it.', 'Review the saved receipt, then share or download it. Tap Send inside WhatsApp.', 'Find previous bills in Server history.'] },
];

function Walkthrough({ audience, onDone, onSkip }: { audience: 'customer' | 'admin'; onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const steps = audience === 'admin' ? adminSteps : customerSteps;
  const current = steps[step];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step > 0) heading.current?.focus(); }, [step]);
  return <div className="gx-guide">
    <span className="gx-eyebrow">{audience === 'admin' ? 'YOUR PHARMACY WORKSPACE' : 'YOUR FIRST VISIT, MADE SIMPLE'}</span>
    <div className="gx-guide-icon"><BookOpen size={30}/></div>
    <p className="gx-step-count" aria-live="polite">Step {step + 1} of {steps.length}</p>
    <h3 ref={heading} tabIndex={-1}>{current.title}</h3><p className="gx-lead">{current.text}</p>
    <ul className="gx-checks">{current.points.map(point => <li key={point}><Check size={17}/><span>{point}</span></li>)}</ul>
    <div className="gx-progress" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i <= step ? 'is-active' : ''}/>)}</div>
    <div className="gx-guide-actions">
      <button type="button" className="gx-button gx-secondary" onClick={step === 0 ? onSkip : () => setStep(step - 1)}>{step === 0 ? 'Skip guide' : 'Back'}</button>
      <button type="button" className="gx-button gx-primary" onClick={step === steps.length - 1 ? onDone : () => setStep(step + 1)}>{step === steps.length - 1 ? (audience === 'admin' ? 'Start billing' : 'Start my request') : 'Next'}<ArrowRight size={17}/></button>
    </div>
  </div>;
}

function goToOrder() {
  // Wait until the modal has unmounted and restored its original focus.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const section = document.getElementById('order');
    if (!section) return;
    section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const target = section.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), button');
    target?.focus({ preventScroll: true });
  }));
}

/** Mount once outside the order form. Automatically opens once per tab session. */
export function CustomerWelcome({ offer, deliveryCharge }: { offer: FirstOrderOffer | null; deliveryCharge: number | null }) {
  const [screen, setScreen] = useState<'offer' | 'guide' | null>(null);
  const seenInMemory = useRef(false);
  const key = offer ? `gm:welcome:v1:${offer.giftName}:${offer.minSubtotal}` : '';
  useEffect(() => {
    if (!offer || !key || seenInMemory.current || readFlag(key, true)) return;
    // Do not interrupt someone who began filling the order while settings loaded.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('#order')) return;
    seenInMemory.current = true;
    writeFlag(key, true);
    setScreen('offer');
  }, [offer, key]);
  const close = () => setScreen(null);
  const claim = () => { close(); goToOrder(); };
  return <div className="gx gx-customer-tools">
    {offer && <button type="button" className="gx-text-button" onClick={() => setScreen('offer')}><Gift size={16}/> View first-order gift</button>}
    <button type="button" className="gx-text-button" onClick={() => setScreen('guide')}><HelpCircle size={16}/> New here? Quick guide</button>
    {screen && <Modal title={screen === 'guide' ? 'How to order medicines' : 'Your first order gift'} onClose={close}>
      {screen === 'guide' ? <Walkthrough audience="customer" onDone={claim} onSkip={close}/> : offer ? <>
        <div className="gx-offer-art"><span className="gx-art-label">A LITTLE CARE. A LITTLE EXTRA.</span><GiftImage name={offer.giftName}/><span className="gx-gift-stamp">YOUR FIRST<br/>ORDER GIFT <Gift size={17}/></span></div>
        <div className="gx-offer-copy"><span className="gx-eyebrow">WELCOME TO GOREGAONMEDS</span>
          <h3>Your first order.<br/><em>A gift to care for you.</em></h3>
          <p className="gx-product-name">{isGlucoOne(offer.giftName) ? 'Dr. Morepen glucoOne BG-03' : offer.giftName}</p>
          {isGlucoOne(offer.giftName) && <p className="gx-product-subtitle">Blood glucose monitoring system</p>}
          <GiftPrice name={offer.giftName}/>
          {isGlucoOne(offer.giftName) && <ul className="gx-specs"><li><strong>5 seconds</strong>Fast results</li><li><strong>0.5 µL</strong>Blood sample</li><li><strong>300 tests</strong>Result memory</li></ul>}
          {isGlucoOne(offer.giftName) && <p className="gx-small">Auto-code technology · Compact for regular glucose monitoring</p>}
          <div className="gx-perks"><DeliveryLine charge={deliveryCharge}/><span><Clock size={16}/> Healthzone & Cosmetic is open 24×7</span></div>
          <p className="gx-terms">First order of <strong>{formatRupees(offer.minSubtotal)}+ in medicines</strong> after discount, excluding delivery. Once per mobile number across Apple, Lotus and Healthzone. Pharmacy verifies eligibility when saving the bill. Tapping below starts your request; it does not reserve or redeem the gift.</p>
          <button type="button" className="gx-button gx-primary gx-full" onClick={claim}>Claim with my first order <ArrowRight size={18}/></button>
          <div className="gx-offer-actions"><button type="button" className="gx-text-button" onClick={close}>No thanks, continue browsing</button><button type="button" className="gx-text-button" onClick={() => setScreen('guide')}>How it works</button></div>
        </div>
      </> : <Walkthrough audience="customer" onDone={claim} onSkip={close}/>}
    </Modal>}
  </div>;
}

/** Mount only inside the authenticated workspace. Never changes the current bill. */
export function AdminWelcome({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const key = 'gm:admin-guide:v1';
  const attempted = useRef(false);
  useEffect(() => {
    if (disabled || attempted.current) return;
    attempted.current = true;
    if (readFlag(key)) return;
    // Avoid stacking above an existing native confirmation dialog.
    if (document.querySelector('dialog[open]')) return;
    writeFlag(key);
    setOpen(true);
  }, [disabled]);
  return <div className="gx gx-admin-tools ga-no-print"><span>Need a hand with billing?</span>
    <button type="button" className="gx-text-button" disabled={disabled} onClick={() => setOpen(true)}><HelpCircle size={16}/> Workspace guide</button>
    {open && <Modal title="Getting started with your pharmacy workspace" onClose={() => setOpen(false)}><Walkthrough audience="admin" onDone={() => setOpen(false)} onSkip={() => setOpen(false)}/></Modal>}
  </div>;
}

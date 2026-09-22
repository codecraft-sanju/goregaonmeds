//frontend/app/admin/AdminPanel.tsx
'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toBlob } from 'html-to-image';
import { ArrowUpRight, ArrowLeft, Check, ChevronRight, Download, Eye, FileText, History, IndianRupee, LayoutDashboard, Loader2, LockKeyhole, LogOut, Plus, Printer, ReceiptText, Search, Send, ShieldCheck, Store, Trash2, X, RefreshCw } from 'lucide-react';
import { BRANCHES, money, newBill, newItem, totals, validate, paise, type Bill, type Item } from './billing';
import './admin.css';

const API = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '')).replace(/\/+$/, '');
const date = (value: string) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="ga-field"><span>{label}</span>{children}</label>; }

function Receipt({ bill }: { bill: Bill }) {
  const t = totals(bill), branch = BRANCHES[bill.branch];
  return <article className="ga-receipt">
    <div className="ga-receipt-brand"><span className="ga-receipt-cross">+</span><span>goregaon<b>meds</b><small>YOUR NEIGHBOURHOOD PHARMACY</small></span></div>
    <header><h2>{branch.name}</h2><p>{branch.address}</p><p>{branch.phone}</p>{branch.licence && <p>Drug licence: {branch.licence}</p>}{branch.gstin && <p>GSTIN: {branch.gstin}</p>}</header>
    <div className="ga-receipt-meta"><div><small>BILL SUMMARY</small><strong>{bill.reference || 'Reference pending'}</strong><span>{date(bill.createdAt)} IST</span></div><span className="ga-stamp">{t.total > 0 && t.due === 0 ? 'PAID' : t.received > 0 ? 'PART PAID' : 'UNPAID'}</span></div>
    <div className="ga-receipt-customer"><small>BILLED TO</small><strong>{bill.customer.trim() || 'Walk-in customer'}</strong>{bill.phone && <span>+91 {bill.phone}</span>}</div>
    <table><thead><tr><th>Medicine / item</th><th>Qty</th><th>Rate ₹</th><th>Total ₹</th></tr></thead><tbody>{bill.items.filter(i => i.name.trim()).map(i => <tr key={i.id}><td><strong>{i.name}</strong>{(i.batch || i.expiry) && <small>{i.batch && `Batch: ${i.batch}`}{i.expiry && ` · Exp: ${i.expiry}`}</small>}</td><td>{i.qty}</td><td>{(paise(i.rate)/100).toFixed(2)}</td><td>{(paise(i.rate)*Number(i.qty)/100).toFixed(2)}</td></tr>)}</tbody></table>
    {!bill.items.some(i=>i.name.trim()) && <p className="ga-receipt-empty">Your medicines will appear here.</p>}
    <div className="ga-receipt-totals"><p><span>Subtotal</span><b>{money(t.gross)}</b></p>{t.discount > 0 && <p><span>Discount</span><b>− {money(t.discount)}</b></p>}<p className="ga-receipt-total"><span>Total amount</span><b>{money(t.total)}</b></p><p><span>Received · {bill.method}</span><b>{money(t.received)}</b></p><p><span>Balance due</span><b>{money(t.due)}</b></p></div>
    {bill.note.trim() && <p className="ga-receipt-note">{bill.note}</p>}
    <footer><strong>A little care, closer to home.</strong><p>Thank you for choosing your neighbourhood pharmacy.</p><small>Bill summary • Not a GST tax invoice.<br/>Request an official tax invoice from the pharmacy, if required.</small></footer>
  </article>;
}

export default function AdminPanel() {
  const [token, setToken] = useState('');
  const tokenRef = useRef('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [bill, setBill] = useState<Bill | null>(null);
  const [saved, setSaved] = useState<Bill[]>([]);
  const [view, setView] = useState<'billing'|'history'>('billing');
  const [query, setQuery] = useState('');
  const [mobilePreview, setMobilePreview] = useState(false);
  const [busy, setBusy] = useState('');
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'new'|'logout'|'share'|null>(null);
  const [shareConsent, setShareConsent] = useState(false);
  const [ready, setReady] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const uploadCache = useRef<{key:string;url:string}|null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = !!bill && (bill.items.some(i=>i.name || i.rate) || !!bill.customer || !!bill.phone);

  useEffect(() => { setBill(newBill()); mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); if(expiryTimer.current) clearTimeout(expiryTimer.current); }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if(dialog) modalRef.current?.showModal(); else modalRef.current?.close(); }, [dialog]);
  useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if(dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload',handler); return ()=>window.removeEventListener('beforeunload',handler); }, [dirty]);

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
    const response = await fetch(`${API}${path}`, {...options, headers, signal: controller.current?.signal});
    const data = await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
    if(!response.ok) {
      if(response.status === 401 && path !== '/api/admin/login') forgetSession(false);
      throw new Error(data.error || `Request failed (${response.status}).`);
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

  async function login(e: FormEvent) {
    e.preventDefault();
    await task('Signing in', async()=> {
      const data = await api('/api/admin/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) });
      if(typeof data.token!=='string' || !Number.isFinite(data.expiresAt)) throw new Error('Update the backend using the included admin-api.js integration.');
      tokenRef.current=data.token; setToken(data.token); setPassword('');
      expiryTimer.current=setTimeout(()=>{forgetSession(false); setError('Session expired. Sign in again to continue your draft.');},Math.max(0,data.expiresAt-Date.now()));
      await loadHistory();
    });
  }

  // --- YAHAN CHANGE KIYA HAI ---
  async function saveToDatabase(snapshot: Bill) {
    const isExisting = saved.some(s => s.id === snapshot.id);
    const path = isExisting ? `/api/admin/bills/${snapshot.id}` : '/api/admin/bills';
    const method = isExisting ? 'PUT' : 'POST';

    const data = await api(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot) // Direct snapshot bhejna hai, `billId` map mat karo yahan
    });
    
    // Update frontend state immediately
    setSaved(old => [data.bill, ...old.filter(b => b.id !== data.bill.id)]);
  }

  async function deleteBill(id: string) {
    if (!window.confirm('Are you sure you want to delete this bill permanently?')) return;
    await task('Deleting bill', async () => {
      await api(`/api/admin/bills/${id}`, { method: 'DELETE' });
      setSaved(old => old.filter(b => b.id !== id));
      setNotice('Bill deleted successfully.');
      if (bill?.id === id) setBill(newBill()); // Agar wahi bill open tha, clear kardo
    });
  }

  // --- API INTEGRATIONS END ---

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
      download(await blob(), `${bill.reference.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`); 
      await saveToDatabase(bill); 
      setNotice('Receipt downloaded & bill saved.');
    }); 
  }
  
  function printBill() { 
    if(!check() || !bill) return; 
    void task('Saving before print', async () => {
      await saveToDatabase(bill);
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
      await saveToDatabase(snapshot); // Save to DB before sharing
      const key=JSON.stringify(snapshot);
      let url=uploadCache.current?.key===key ? uploadCache.current.url : '';
      if(!url) {
        const form=new FormData(); form.append('image',await blob(),'receipt.png');
        const data=await api('/api/admin/upload',{method:'POST',body:form});
        const parsed=new URL(data.url);
        if(parsed.protocol!=='https:') throw new Error('The upload service returned an invalid receipt link.');
        url=parsed.href; uploadCache.current={key,url};
      }
      const t=totals(snapshot);
      const message=`*${BRANCHES[snapshot.branch].name} — Bill summary*\nReference: ${snapshot.reference}\nCustomer: ${snapshot.customer || 'Walk-in customer'}\nDate: ${date(snapshot.createdAt)} IST\n\nTotal: ${money(t.total)}\nReceived (${snapshot.method}): ${money(t.received)}\nBalance due: ${money(t.due)}\n\nView your bill:\n${url}\n\nThank you for choosing Goregaonmeds.`;
      setReady(`https://wa.me/91${snapshot.phone}?text=${encodeURIComponent(message)}`); setNotice('Your WhatsApp message is ready. Open it below and tap Send in WhatsApp.');
    });
  }
  
  async function logout() { setDialog(null); await task('Signing out',async()=>{ await api('/api/admin/logout',{method:'POST'}); forgetSession(true); }); }
  const alert = error ? <div className="ga-alert ga-alert-error" role="alert" tabIndex={-1} ref={errorRef}>{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div> : null;

  if(!token) return <div className="ga ga-login"><div className="ga-login-story"><a href="/" className="ga-wordmark"><span className="ga-logo">+</span>goregaon<span>meds</span></a><div><span className="ga-kicker">THE NEIGHBOURHOOD DESK</span><h1>Good care.<br/><em>Beautifully<br/>organised.</em></h1><p>A calmer space for your pharmacy’s everyday billing.</p></div><span className="ga-login-foot">THREE BRANCHES. ONE NEIGHBOURHOOD. <span>✳</span></span></div><main className="ga-login-main"><div className="ga-login-card"><span className="ga-lock-icon"><LockKeyhole size={24}/></span><span className="ga-kicker">STAFF ACCESS</span><h2>Welcome to your desk.</h2><p>Sign in to prepare bills and share a little care.</p><form onSubmit={login}>{alert}<Field label="Administrator password"><span className="ga-password"><input autoFocus type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256} placeholder="Enter your password"/><button type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}><Eye size={18}/></button></span></Field><button className="ga-btn ga-primary" disabled={!!busy}>{busy?<Loader2 className="ga-spin" size={18}/>:<>Open billing studio <ArrowUpRight size={19}/></>}</button></form><small><ShieldCheck size={15}/> Access is verified by your pharmacy server.</small><a className="ga-back" href="/"><ArrowLeft size={15}/> Back to Goregaonmeds</a></div></main></div>;
  if(!bill) return <div className="ga">Loading billing studio…</div>;
  const t=totals(bill);
  const filtered=saved.filter(b=>`${b.reference} ${b.customer} ${b.phone} ${BRANCHES[b.branch].name}`.toLowerCase().includes(query.toLowerCase()));
  
  return <div className="ga ga-app">
    <aside className="ga-sidebar ga-no-print"><a href="/" className="ga-wordmark"><span className="ga-logo">+</span>goregaon<span>meds</span></a><span className="ga-sidebar-label">PHARMACY WORKSPACE</span><nav aria-label="Admin navigation"><button className={view==='billing'?'active':''} onClick={()=>setView('billing')} disabled={!!busy}><LayoutDashboard size={19}/> Billing studio <ChevronRight size={15}/></button><button className={view==='history'?'active':''} onClick={()=>{setView('history'); void loadHistory();}} disabled={!!busy}><History size={19}/> Server history <span className="ga-count">{saved.length}</span></button></nav><div className="ga-sidebar-note"><span>✳</span><h3>Local care.<br/>A little closer.</h3><p>Thoughtful billing, from your neighbourhood pharmacy.</p><span className="ga-location-dot"/> GOREGAON EAST</div><button className="ga-signout" onClick={()=>setDialog('logout')} disabled={!!busy}><LogOut size={17}/> Sign out</button></aside>
    <div className="ga-workspace ga-no-print"><header className="ga-topbar"><span>Workspace <ChevronRight size={13}/> <b>{view==='billing'?'Billing studio':'Server history'}</b></span><span className="ga-staff"><span>HC</span> Pharmacy desk <button aria-label="Sign out" onClick={()=>setDialog('logout')} disabled={!!busy}><LogOut size={16}/></button></span></header>
    <main className="ga-main"><div className="ga-page-heading"><div><span className="ga-kicker">{shortDate(bill.createdAt)} · GOREGAON EAST</span><h1>{view==='billing'?'Every bill, a little care.':'Your history, safely stored.'}</h1><p>{view==='billing'?'Prepare, review and share. All from one thoughtful workspace.':'Bills securely saved on the database. Edit or manage records easily.'}</p></div><button className="ga-btn ga-primary" onClick={()=>setDialog('new')} disabled={!!busy}><Plus size={18}/> New bill</button></div>
    <nav className="ga-mobile-nav" aria-label="Workspace sections"><button className={view==='billing'?'active':''} onClick={()=>setView('billing')} disabled={!!busy}><ReceiptText size={16}/> Billing</button><button className={view==='history'?'active':''} onClick={()=>{setView('history'); void loadHistory();}} disabled={!!busy}><History size={16}/> History ({saved.length})</button></nav>
    {alert}{notice && <div className="ga-alert" role="status"><Check size={17}/>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {view==='billing' ? <>
      <div className="ga-stats"><div><span className="ga-stat-icon"><ReceiptText size={20}/></span><span>Bill total<strong>{money(t.total)}</strong></span><small>Current bill</small></div><div><span className="ga-stat-icon"><IndianRupee size={20}/></span><span>Balance due<strong>{money(t.due)}</strong></span><small>{t.received>0?'Payment recorded':'Awaiting payment'}</small></div><div><span className="ga-stat-icon"><Store size={20}/></span><span>Serving from<strong className="ga-stat-branch">{BRANCHES[bill.branch].name}</strong></span><small>{BRANCHES[bill.branch].area}</small></div></div>
      <div className="ga-mobile-tabs"><button className={!mobilePreview?'active':''} onClick={()=>setMobilePreview(false)}>Edit bill</button><button className={mobilePreview?'active':''} onClick={()=>setMobilePreview(true)}>Receipt preview</button></div>
      <div className={`ga-billing-grid ${mobilePreview?'ga-show-preview':''}`}>
      <fieldset className="ga-editor" disabled={!!busy}><legend className="ga-sr">Bill editor</legend>
        <section className="ga-card"><div className="ga-card-title"><span className="ga-step">01</span><div><h2>The essentials</h2><p>Branch, customer and bill details.</p></div><span className="ga-chip">{saved.some(s=>s.id===bill.id) ? 'Editing' : 'Draft'}</span></div><div className="ga-fields"><Field label="Pharmacy branch"><select value={bill.branch} onChange={e=>update({branch:Number(e.target.value)})}>{BRANCHES.map((b,i)=><option value={i} key={b.name}>{b.name}</option>)}</select></Field><Field label="Bill reference"><input value={bill.reference} onChange={e=>update({reference:e.target.value})} maxLength={50}/></Field><Field label="Customer name · optional"><input value={bill.customer} onChange={e=>update({customer:e.target.value})} maxLength={80} placeholder="Walk-in customer" autoComplete="off"/></Field><Field label="WhatsApp number"><div className="ga-phone"><span>+91</span><input type="tel" inputMode="numeric" value={bill.phone} onChange={e=>update({phone:e.target.value.replace(/\D/g,'').slice(0,10)})} maxLength={10} placeholder="10-digit mobile" autoComplete="off" aria-label="Customer WhatsApp number"/></div></Field></div></section>
        <section className="ga-card"><div className="ga-card-title"><span className="ga-step">02</span><div><h2>Medicines & essentials</h2><p>Use the selling price for the quantity unit entered.</p></div><span className="ga-chip">{bill.items.length} items</span></div><div className="ga-items">{bill.items.map((item,index)=><div className="ga-item" key={item.id}><div className="ga-item-top"><span className="ga-item-index">{String(index+1).padStart(2,'0')}</span><Field label={`Medicine ${index+1}`}><input value={item.name} onChange={e=>itemUpdate(item.id,{name:e.target.value})} placeholder="Medicine name, strength & pack" maxLength={160}/></Field><button className="ga-icon-button ga-remove" type="button" aria-label={`Remove medicine ${index+1}`} disabled={bill.items.length===1} onClick={()=>update({items:bill.items.filter(i=>i.id!==item.id)})}><Trash2 size={16}/></button></div><div className="ga-item-details"><Field label="Batch"><input value={item.batch} onChange={e=>itemUpdate(item.id,{batch:e.target.value})} maxLength={30} placeholder="Optional"/></Field><Field label="Expiry"><input type="month" value={item.expiry} onChange={e=>itemUpdate(item.id,{expiry:e.target.value})}/></Field><Field label="Qty"><input type="number" min={1} max={9999} step={1} value={item.qty} onChange={e=>itemUpdate(item.id,{qty:e.target.value})}/></Field><Field label="Rate ₹"><input type="number" min={0} max={9999999.99} step="0.01" value={item.rate} onChange={e=>itemUpdate(item.id,{rate:e.target.value})} placeholder="0.00"/></Field><div className="ga-line-total"><span>Amount</span><strong>{money(paise(item.rate)*(Number(item.qty)||0))}</strong></div></div></div>)}</div><button className="ga-add-item" onClick={()=>update({items:[...bill.items,newItem()]})} disabled={bill.items.length>=50}><Plus size={17}/> Add another medicine <span>{bill.items.length}/50</span></button></section>
        <section className="ga-card"><div className="ga-card-title"><span className="ga-step">03</span><div><h2>A little finishing touch</h2><p>Discount, payment and a note for your customer.</p></div></div><div className="ga-fields"><Field label="Discount ₹"><input type="number" min={0} step="0.01" value={bill.discount} onChange={e=>update({discount:e.target.value})}/></Field><Field label="Amount received ₹"><input type="number" min={0} step="0.01" value={bill.received} onChange={e=>update({received:e.target.value})}/></Field></div><div className="ga-payment-row"><div><span className="ga-label">Payment method</span><div className="ga-segment">{(['UPI','Cash','Card'] as const).map(method=><button type="button" key={method} aria-pressed={bill.method===method} className={bill.method===method?'active':''} onClick={()=>update({method})}>{method}</button>)}</div></div><button type="button" className="ga-text-button" onClick={()=>update({received:(t.total/100).toFixed(2)})}><Check size={15}/> Mark fully paid</button></div><Field label="Customer note · optional"><textarea value={bill.note} onChange={e=>update({note:e.target.value})} rows={2} maxLength={300} placeholder="Add a short message for your customer…"/></Field><p className="ga-hint">Entered selling prices are used as-is. No estimated GST is added.</p></section>
      <button type="button" className="ga-btn ga-primary ga-review-mobile" onClick={()=>{if(check()){setMobilePreview(true);window.scrollTo({top:0,behavior:'instant'});}}}>Review & share bill <ArrowUpRight size={18}/></button>
      </fieldset>
      <aside className="ga-preview-panel"><div className="ga-preview-heading"><span><span className="ga-live-dot"/> LIVE PREVIEW</span><div><button className="ga-icon-button" aria-label="Download receipt PNG" onClick={downloadImage} disabled={!!busy}><Download size={17}/></button><button className="ga-icon-button" aria-label="Print receipt" onClick={printBill} disabled={!!busy}><Printer size={17}/></button></div></div><div className="ga-paper-stage"><Receipt bill={bill}/></div><div className="ga-dispatch"><div><span>Ready for your customer</span><strong>{money(t.total)}</strong><small>{t.units} units · {bill.items.length} line items</small></div><button className="ga-btn ga-lime" onClick={share} disabled={!!busy}>{busy?<><Loader2 size={17} className="ga-spin"/>{busy}…</>:<><Send size={17}/> Prepare WhatsApp bill <ArrowUpRight size={17}/></>}</button><div className="ga-secondary-actions"><button onClick={downloadImage} disabled={!!busy}><Download size={15}/> PNG</button><button onClick={printBill} disabled={!!busy}><Printer size={15}/> Print / PDF</button><button onClick={()=>{if(check()){ void task('Saving to database', async()=>{ await saveToDatabase(bill!); setNotice('Bill saved successfully.'); }); }}} disabled={!!busy}><History size={15}/> Save to Database</button></div><p>Review the details before sharing.</p></div>{ready && <a className="ga-btn ga-whatsapp" href={ready} target="_blank" rel="noopener noreferrer">Open WhatsApp & send <ArrowUpRight size={18}/></a>}</aside>
      </div>
    </> : <section className="ga-card ga-history"><div className="ga-history-head"><div><h2>Server history <span className="ga-chip">{saved.length}</span></h2><p>Bills saved in the database.</p></div><div style={{display: 'flex', gap: '8px'}}><button className="ga-btn ga-outline" onClick={()=>void task('Refreshing', loadHistory)} disabled={!!busy}><RefreshCw size={16}/> Refresh</button><button className="ga-btn ga-outline" onClick={exportSession} disabled={!saved.length}><Download size={16}/> Export JSON</button></div></div><label className="ga-search"><Search size={18}/><input aria-label="Search session bills" placeholder="Search customer, branch or reference…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{filtered.length ? <div className="ga-history-table"><table><thead><tr><th>Bill / customer</th><th>Branch</th><th>Total</th><th>Balance</th><th/></tr></thead><tbody>{filtered.map(b=><tr key={b.id}><td><strong>{b.customer || 'Walk-in customer'}</strong><small>{b.reference} · {shortDate(b.createdAt)}</small></td><td>{BRANCHES[b.branch].name}</td><td>{money(totals(b).total)}</td><td>{money(totals(b).due)}</td><td><div style={{display:'flex',gap:'4px'}}><button className="ga-icon-button" aria-label={`Reopen bill ${b.reference}`} onClick={()=>{if(dirty && !window.confirm('Replace the current draft with this saved bill?'))return;setBill(structuredClone(b));setReady('');setError('');setNotice('');uploadCache.current=null;setView('billing');}}><ArrowUpRight size={17}/></button><button className="ga-icon-button ga-remove" aria-label={`Delete bill ${b.reference}`} onClick={()=>deleteBill(b.id)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>:<div className="ga-empty"><FileText size={34}/><h3>{query?'No matching bills.':'A fresh start.'}</h3><p>{query?'Try another name or reference.':'Saved bills from the database will appear here.'}</p></div>}</section>}
    <footer className="ga-workspace-footer"><span>Goregaonmeds / Billing studio</span><span>Made for your neighbourhood. <span>✳</span></span></footer></main></div>
    <div className="ga-export" aria-hidden="true"><div ref={exportRef}><Receipt bill={bill}/></div></div>
    <dialog className="ga-dialog" ref={modalRef} onCancel={e=>{e.preventDefault();if(!busy)setDialog(null);}}><div className="ga-dialog-body"><button className="ga-dialog-close ga-icon-button" aria-label="Close dialog" onClick={()=>setDialog(null)}><X size={18}/></button>{dialog==='share'?<><span className="ga-lock-icon"><Send size={23}/></span><h2>One final check.</h2><p>Prepare this bill for <strong>+91 {bill.phone}</strong>. Total: <strong>{money(t.total)}</strong>.</p><label className="ga-share-consent"><input type="checkbox" checked={shareConsent} onChange={e=>setShareConsent(e.target.checked)}/><span>I have checked the recipient and have permission to upload this bill. The Cloudinary link will be viewable by anyone who has it.</span></label><button className="ga-btn ga-primary" disabled={!shareConsent || !!busy} onClick={()=>void prepareShare()}>Prepare message <ArrowUpRight size={17}/></button><small>You will tap Send yourself in WhatsApp.</small></>:<><h2>{dialog==='new'?'Start a fresh bill?':'Close your desk?'}</h2><p>{dialog==='new'?'Your current draft will be replaced. Save it to the database first if you need it.':'Signing out clears your draft screen.'}</p><div className="ga-dialog-actions"><button className="ga-btn ga-outline" onClick={()=>setDialog(null)}>Keep working</button><button className="ga-btn ga-primary" onClick={()=>{if(dialog==='logout'){void logout();return;}setBill(newBill());setReady('');setNotice('');setError('');uploadCache.current=null;setMobilePreview(false);setView('billing');setDialog(null);}}> {dialog==='new'?'New bill':'Sign out'}</button></div></>}</div></dialog>
  </div>;
}
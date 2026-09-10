'use client';

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  memo,
  useDeferredValue,
} from 'react';
import {
  ShoppingCart, Search, FileText, Phone, MapPin, Clock, X, Plus, Minus, UploadCloud,
  CheckCircle2, Image as ImageIcon, Info, HeartHandshake, Award, Store, Shield, Navigation,
  AlertCircle, Trash2, Loader2, PhoneCall, User as UserIcon, LogOut, LayoutDashboard,
  Package, Pencil, EyeOff, RefreshCw, ChevronLeft, Receipt, TrendingUp, MessageSquareWarning, Map, ArrowRight
} from 'lucide-react';

type BuyType = 'full' | 'loose';
type LocateStatus = 'idle' | 'loading' | 'success' | 'error';
type Role = 'customer' | 'admin';
type OrderStatus = 'pending_whatsapp' | 'placed' | 'confirmed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
}

interface Medicine {
  _id: string;
  name: string;
  use: string;
  category: string;
  price: number;
  mrp: number;
  packSize: number;
  packType: string;
  unitType: string;
  isDivisible: boolean;
  requiresPrescription: boolean;
  emoji: string;
  imageUrl: string;
  imagePublicId: string;
  tag: string;
  isActive: boolean;
}

interface Branch {
  _id: string;
  slug: string;
  name: string;
  shortName: string;
  phone: string;
  address: string;
  fullAddress: string;
  lat: number;
  lng: number;
  isActive: boolean;
}

interface CartItem {
  cartItemId: string;
  medicineId: string;
  name: string;
  displayName: string;
  emoji: string;
  imageUrl: string;
  buyType: BuyType;
  qty: number;
  unitPrice: number;
  unitMrp: number;
}

interface AddressForm {
  name: string;
  phone: string;
  houseNo: string;
  area: string;
  landmark: string;
}

interface OrderRecord {
  _id: string;
  orderNumber: string;
  type: 'cart' | 'prescription';
  status: OrderStatus;
  estimatedTotal: number;
  prescriptionUrl?: string;
  createdAt: string;
  customer: AddressForm;
  items: Array<{ displayName: string; qty: number; lineTotal: number }>;
  branch?: Pick<Branch, '_id' | 'name' | 'shortName' | 'phone' | 'address'>;
  user?: { name: string; email: string } | null;
}

type FieldErrors = Record<string, string | undefined>;

/* ================================================================== */
/*  Constants and helpers                                             */
/* ================================================================== */

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const CART_STORAGE_KEY = 'lp_cart_v1';
const TOKEN_KEY = 'lp_token';
const MAX_QTY_PER_ITEM = 20;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_whatsapp: 'Pending Message',
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  pending_whatsapp: 'bg-orange-100/50 text-orange-700 border-orange-200/50',
  placed: 'bg-indigo-100/50 text-indigo-700 border-indigo-200/50',
  confirmed: 'bg-blue-100/50 text-blue-700 border-blue-200/50',
  packed: 'bg-violet-100/50 text-violet-700 border-violet-200/50',
  out_for_delivery: 'bg-fuchsia-100/50 text-fuchsia-700 border-fuchsia-200/50',
  delivered: 'bg-emerald-100/50 text-emerald-700 border-emerald-200/50',
  cancelled: 'bg-rose-100/50 text-rose-700 border-rose-200/50',
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

const formatMoney = (value: number) => currency.format(Number.isFinite(value) ? value : 0);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function distanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getRoutingDistance(originLat: number, originLng: number, destLat: number, destLng: number): Promise<number> {
  if (!GOOGLE_MAPS_API_KEY) {
    return distanceInKm(originLat, originLng, destLat, destLng);
  }
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${GOOGLE_MAPS_API_KEY}`);
    const data = await res.json();
    if (data.rows[0]?.elements[0]?.status === 'OK') {
      return data.rows[0].elements[0].distance.value / 1000;
    }
  } catch (err) {
    console.error('Google Maps Error:', err);
  }
  return distanceInKm(originLat, originLng, destLat, destLng);
}

function sanitizeForMessage(value: string, maxLength = 120): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validateAddress(address: AddressForm, requireArea: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (sanitizeForMessage(address.name).length < 2) errors.name = 'Enter the name for this delivery.';
  if (!INDIAN_MOBILE.test(digitsOnly(address.phone))) errors.phone = 'Enter a 10-digit mobile number.';
  if (sanitizeForMessage(address.houseNo).length < 3) errors.houseNo = 'Enter your house or flat number.';
  if (requireArea && sanitizeForMessage(address.area).length < 3) errors.area = 'Enter your area or locality.';
  return errors;
}

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location is blocked in your browser. Pick a branch manually.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location could not be read. Pick a branch manually.';
    case error.TIMEOUT:
      return 'Locating took too long. Try again or pick a branch manually.';
    default:
      return 'Something went wrong while locating you. Pick a branch manually.';
  }
}

/* ---------------- API client ---------------- */

class ApiError extends Error {
  status: number;
  details?: FieldErrors;

  constructor(status: number, message: string, details?: FieldErrors) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };
  
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: 'omit',
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload?.message || 'Request failed.', payload?.details);
  }
  return payload as T;
}

/* ================================================================== */
/*  Hooks                                                             */
/* ================================================================== */

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [locked]);
}

function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, onEscape]);
}

function useReturnFocus(active: boolean, panelRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => previouslyFocused?.focus?.({ preventScroll: true });
  }, [active, panelRef]);
}

/* ================================================================== */
/*  Shared UI pieces                                                  */
/* ================================================================== */

const Field = memo(function Field({
  name,
  label,
  value,
  error,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  placeholder,
  step,
  readOnly,
}: {
  name: string;
  label: string;
  value: string | number;
  error?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'decimal' | 'email';
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  step?: string;
  readOnly?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className="group/field relative w-full">
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold tracking-wide text-gray-500 transition-colors group-focus-within/field:text-indigo-600">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        step={step}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-all duration-300 ease-out placeholder:font-normal placeholder:text-gray-400 focus:-translate-y-[1px] focus:shadow-md focus:ring-4 ${
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-gray-200 hover:border-gray-300 focus:border-indigo-600 focus:ring-indigo-600/10'
        } ${readOnly ? 'bg-gray-50 opacity-70 cursor-not-allowed' : ''}`}
      />
      {error && (
        <p id={`${id}-error`} className="animate-wobble mt-1.5 flex items-center gap-1 text-[11px] font-bold tracking-wide text-rose-600">
          <AlertCircle size={12} strokeWidth={2.5} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
});

const QuantityStepper = memo(function QuantityStepper({
  qty,
  onDecrease,
  onIncrease,
  label,
}: {
  qty: number;
  onDecrease: () => void;
  onIncrease: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center rounded-xl border border-indigo-100 bg-indigo-50/50 shadow-sm transition-all hover:bg-indigo-50 hover:border-indigo-200">
      <button
        type="button"
        onClick={onDecrease}
        aria-label={qty === 1 ? `Remove ${label}` : `Decrease ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-l-xl text-indigo-700 transition-colors hover:bg-indigo-100/70"
      >
        {qty === 1 ? <Trash2 size={14} strokeWidth={2.5} /> : <Minus size={14} strokeWidth={2.5} />}
      </button>
      <div className="relative flex min-w-[2rem] items-center justify-center overflow-hidden">
        <span aria-live="polite" className="text-center text-sm font-extrabold tabular-nums text-indigo-900">
          {qty}
        </span>
      </div>
      <button
        type="button"
        onClick={onIncrease}
        disabled={qty >= MAX_QTY_PER_ITEM}
        aria-label={`Increase ${label}`}
        className="flex h-8 w-8 items-center justify-center rounded-r-xl text-indigo-700 transition-colors hover:bg-indigo-100/70 disabled:opacity-40"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
});

const SearchInput = memo(function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="group relative w-full">
      <label htmlFor="medicine-search" className="sr-only">
        Search medicines
      </label>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-600"
        size={17}
        strokeWidth={2.5}
        aria-hidden="true"
      />
      <input
        id="medicine-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by name, category, or symptom..."
        maxLength={60}
        className="w-full rounded-2xl border border-gray-200/80 bg-gray-50/50 py-3 pl-10 pr-10 text-sm font-medium text-gray-800 outline-none backdrop-blur-sm transition-all duration-300 ease-out placeholder:font-normal placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:shadow-md focus:ring-4 focus:ring-indigo-500/10"
      />
      <div className={`absolute right-2 top-1/2 -translate-y-1/2 transition-all duration-200 ${value ? 'scale-100 opacity-100' : 'scale-75 opacity-0 pointer-events-none'}`}>
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={15} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
});

const ProductThumb = memo(function ProductThumb({
  medicine,
  className = '',
}: {
  medicine: Pick<Medicine, 'emoji' | 'imageUrl' | 'name'>;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  
  if (medicine.imageUrl) {
    return (
      <img
        src={medicine.imageUrl}
        alt={medicine.name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-all duration-500 ${loaded ? 'opacity-100' : 'opacity-0 scale-95'} ${className}`}
      />
    );
  }
  return (
    <span className={`text-4xl transition-transform duration-300 ${className}`} role="img" aria-label={medicine.name}>
      {medicine.emoji || '💊'}
    </span>
  );
});

const BranchPicker = memo(function BranchPicker({
  branches,
  selected,
  distance,
  status,
  errorMessage,
  onDetect,
  onSelect,
}: {
  branches: Branch[];
  selected: Branch | null;
  distance: number | null;
  status: LocateStatus;
  errorMessage: string | null;
  onDetect: () => void;
  onSelect: (branchId: string) => void;
}) {
  if (!selected) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Store size={15} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-bold tracking-tight text-gray-900">Order Routing</h3>
      </header>

      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-4 border border-gray-100">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-gray-900">{selected.name}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-gray-500">{selected.address}</p>
        </div>
        {distance !== null && (
          <span className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white tabular-nums shadow-sm">
            {distance.toFixed(1)} km
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onDetect}
          disabled={status === 'loading'}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-200/60 bg-indigo-50/50 py-3 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100/50 disabled:opacity-60"
        >
          {status === 'loading' ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Locating...
            </>
          ) : (
            <>
              <Navigation size={15} strokeWidth={2.5} aria-hidden="true" /> Find Closest
            </>
          )}
        </button>

        <div className="flex-1 relative group">
          <label htmlFor="branch-select" className="sr-only">Choose a branch</label>
          <select
            id="branch-select"
            value={selected._id}
            onChange={(event) => onSelect(event.target.value)}
            className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-gray-700 outline-none transition-all duration-300 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 hover:border-gray-300 cursor-pointer"
          >
            {branches.map((branch) => (
              <option key={branch._id} value={branch._id}>
                {branch.name} — {branch.address}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 group-hover:text-gray-600 transition-colors">
            <ChevronLeft size={14} strokeWidth={2.5} className="-rotate-90" />
          </div>
        </div>
      </div>

      {status === 'error' && errorMessage && (
        <p className="animate-wobble mt-3 flex items-start gap-1.5 text-[11px] font-bold text-rose-600">
          <AlertCircle size={13} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      )}
    </section>
  );
});

const ProductCard = memo(function ProductCard({
  medicine,
  cartQuantities,
  onAdd,
  onUpdateQty,
}: {
  medicine: Medicine;
  index: number;
  cartQuantities: Record<string, number>;
  onAdd: (medicine: Medicine, buyType: BuyType) => void;
  onUpdateQty: (cartItemId: string, delta: number) => void;
}) {
  const [buyType, setBuyType] = useState<BuyType>('full');
  const isLoose = buyType === 'loose';

  const price = isLoose ? medicine.price / medicine.packSize : medicine.price;
  const mrp = isLoose ? medicine.mrp / medicine.packSize : medicine.mrp;
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

  const cartItemId = `${medicine._id}-${buyType}`;
  const qtyInCart = cartQuantities[cartItemId] ?? 0;

  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-gray-200/80 bg-white p-3.5 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-indigo-300/50 hover:shadow-xl hover:shadow-indigo-900/5">
      {medicine.tag && (
        <span className="absolute left-3.5 top-3.5 z-10 rounded-full bg-gray-900 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">
          {medicine.tag}
        </span>
      )}
      {discount > 0 && (
        <span className="absolute right-3.5 top-3.5 z-10 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-emerald-800 shadow-sm border border-emerald-200/50 backdrop-blur-md">
          {discount}% off
        </span>
      )}

      <div className="mb-4 flex h-36 w-full items-center justify-center overflow-hidden rounded-xl bg-gray-50/50 ring-1 ring-inset ring-gray-100 transition-colors group-hover:bg-gray-50">
        <ProductThumb
          medicine={medicine}
          className="transition-transform duration-500 ease-out group-hover:scale-110"
        />
      </div>

      <div className="flex-1">
        <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug tracking-tight text-gray-900 group-hover:text-indigo-700 transition-colors" title={medicine.name}>
          {medicine.name}
        </h3>
        <p className="mb-2.5 line-clamp-1 text-[11px] font-medium text-gray-500">{medicine.use}</p>
        
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="flex w-fit items-center gap-1 rounded border border-gray-200/80 bg-gray-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600">
            <Info size={10} aria-hidden="true" />
            {medicine.isDivisible
              ? `1 ${medicine.packType} = ${medicine.packSize} ${medicine.unitType}s`
              : `1 ${medicine.packType}`}
          </span>
          {medicine.requiresPrescription && (
            <span className="flex w-fit items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700">
              <FileText size={10} aria-hidden="true" /> Rx
            </span>
          )}
        </div>
      </div>

      {medicine.isDivisible && (
        <div role="group" aria-label="Choose pack size" className="mb-3 flex rounded-lg bg-gray-100/80 p-1 shadow-inner">
          {(['full', 'loose'] as const).map((option) => {
            const active = buyType === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setBuyType(option)}
                className={`flex-1 rounded-md py-1.5 text-[10px] font-extrabold transition-all duration-300 ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                {option === 'full' ? `Full ${medicine.packType}` : `1 ${medicine.unitType}`}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 border-t border-dashed border-gray-200 pt-3">
        <div className="flex flex-col">
          {discount > 0 && (
            <span className="text-[10px] font-semibold text-gray-400 line-through tabular-nums decoration-gray-300">{formatMoney(mrp)}</span>
          )}
          <span className="text-base font-black leading-none tracking-tight text-gray-900 tabular-nums">{formatMoney(price)}</span>
        </div>

        {qtyInCart > 0 ? (
          <div className="origin-bottom-right">
            <QuantityStepper
              qty={qtyInCart}
              label={medicine.name}
              onDecrease={() => onUpdateQty(cartItemId, -1)}
              onIncrease={() => onUpdateQty(cartItemId, 1)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(medicine, buyType)}
            className="flex items-center gap-1 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-indigo-600 hover:shadow-md hover:shadow-indigo-600/20 active:scale-95"
          >
            Add
          </button>
        )}
      </div>
    </article>
  );
});

/* ================================================================== */
/*  Auth modal                                                        */
/* ================================================================== */

function AuthModal({
  onClose,
  onAuthenticated,
}: {
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(true);
  useEscapeKey(true, onClose);
  useReturnFocus(true, panelRef);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: name === 'phone' ? digitsOnly(value).slice(0, 10) : value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email: form.email.trim(), password: form.password }
          : { name: form.name.trim(), email: form.email.trim(), phone: form.phone, password: form.password };

      const data = await api<{ user: AuthUser; token: string }>(path, { method: 'POST', body: JSON.stringify(body) });
      localStorage.setItem(TOKEN_KEY, data.token);
      onAuthenticated(data.user);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.details) setErrors(error.details);
      } else {
        setFormError('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Account">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-sm overflow-hidden rounded-t-[32px] bg-white p-6 shadow-2xl outline-none sm:rounded-[32px] border border-white/20"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <UserIcon size={24} strokeWidth={2} />
        </div>

        <h2 className="text-2xl font-black tracking-tight text-gray-900">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h2>
        <p className="mt-1.5 text-sm font-medium text-gray-500">
          {mode === 'login'
            ? 'Sign in to quickly reuse your saved delivery details.'
            : 'One secure account across all our branches.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && (
            <Field name="name" label="Full name" autoComplete="name" value={form.name} error={errors.name} onChange={handleChange} maxLength={60} />
          )}
          <Field
            name="email"
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            error={errors.email}
            onChange={handleChange}
            maxLength={120}
          />
          {mode === 'register' && (
            <Field
              name="phone"
              label="Mobile number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={form.phone}
              error={errors.phone}
              onChange={handleChange}
              maxLength={10}
            />
          )}
          <Field
            name="password"
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            error={errors.password}
            onChange={handleChange}
            maxLength={72}
          />

          {formError && (
            <p className="animate-wobble flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 border border-rose-100">
              <AlertCircle size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" /> {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-60 active:scale-[0.98]"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setErrors({});
            setFormError(null);
          }}
          className="mt-5 w-full rounded-xl py-2 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Admin: medicine form                                              */
/* ================================================================== */

const EMPTY_MEDICINE = {
  name: '',
  use: '',
  category: '',
  price: '',
  mrp: '',
  packSize: '1',
  packType: 'Strip',
  unitType: 'Tablet',
  isDivisible: false,
  requiresPrescription: false,
  emoji: '💊',
  imageUrl: '',
  imagePublicId: '',
  tag: '',
  isActive: true,
};

function MedicineForm({
  initial,
  categories,
  onCancel,
  onSaved,
  onError,
}: {
  initial: Medicine | null;
  categories: string[];
  onCancel: () => void;
  onSaved: (medicine: Medicine) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name,
          use: initial.use,
          category: initial.category,
          price: String(initial.price),
          mrp: String(initial.mrp),
          packSize: String(initial.packSize),
          packType: initial.packType,
          unitType: initial.unitType,
          isDivisible: initial.isDivisible,
          requiresPrescription: initial.requiresPrescription,
          emoji: initial.emoji,
          imageUrl: initial.imageUrl,
          imagePublicId: initial.imagePublicId,
          tag: initial.tag,
          isActive: initial.isActive,
        }
      : { ...EMPTY_MEDICINE },
  );
  
  const [newlyUploadedId, setNewlyUploadedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const setValue = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) =>
    setValue(event.target.name, event.target.value);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      onError('Upload a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      onError('That image is over 5 MB.');
      return;
    }

    const body = new FormData();
    body.append('image', file);

    setUploading(true);
    try {
      const data = await api<{ url: string; publicId: string }>('/api/uploads/product', { method: 'POST', body });
      setForm((prev) => ({ ...prev, imageUrl: data.url, imagePublicId: data.publicId }));
      setNewlyUploadedId(data.publicId);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async () => {
    if (newlyUploadedId && newlyUploadedId === form.imagePublicId) {
      try {
        await api('/api/uploads/revert', { method: 'DELETE', body: JSON.stringify({ publicId: newlyUploadedId }) });
      } catch (err) {}
    }
    onCancel();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        mrp: Number(form.mrp),
        packSize: Number(form.packSize) || 1,
      };
      const path = initial ? `/api/medicines/${initial._id}` : '/api/medicines';
      const data = await api<{ medicine: Medicine }>(path, {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      onSaved(data.medicine);
    } catch (error) {
      if (error instanceof ApiError) {
        onError(error.message);
        if (error.details) setErrors(error.details);
      } else {
        onError('Could not save the medicine.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 rounded-3xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
      <h3 className="text-xl font-black tracking-tight text-gray-900">{initial ? 'Edit Medicine' : 'Add Medicine'}</h3>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="shrink-0 group">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-5xl transition-colors group-hover:border-indigo-400 group-hover:bg-indigo-50/50">
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="transition-transform group-hover:scale-110">{form.emoji || '💊'}</span>
            )}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageUpload}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            className="mt-4 flex w-32 items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-600 disabled:opacity-60 active:scale-95"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {form.imageUrl ? 'Replace' : 'Upload'}
          </button>
          {form.imageUrl && (
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, imageUrl: '', imagePublicId: '' }))}
              className="mt-2 w-32 text-center text-[11px] font-bold text-rose-600 hover:underline"
            >
              Remove image
            </button>
          )}
        </div>

        <div className="grid flex-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="name" label="Name" value={form.name} error={errors.name} onChange={handleInput} maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <Field name="use" label="What it treats" value={form.use} error={errors.use} onChange={handleInput} maxLength={200} />
          </div>

          <div className="group/field relative">
            <label htmlFor="field-category" className="mb-1.5 block text-xs font-bold tracking-wide text-gray-500 transition-colors group-focus-within/field:text-indigo-600">
              Category
            </label>
            <input
              id="field-category"
              name="category"
              list="category-options"
              value={form.category}
              onChange={handleInput}
              maxLength={60}
              className={`w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium outline-none transition-all duration-300 focus:-translate-y-[1px] focus:shadow-md focus:ring-4 ${
                errors.category ? 'border-rose-300 focus:ring-rose-100' : 'border-gray-200 hover:border-gray-300 focus:border-indigo-600 focus:ring-indigo-600/10'
              }`}
            />
            <datalist id="category-options">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {errors.category && <p className="animate-wobble mt-1.5 text-[11px] font-bold tracking-wide text-rose-600">{errors.category}</p>}
          </div>

          <Field name="tag" label="Badge (optional)" value={form.tag} onChange={handleInput} maxLength={30} placeholder="Bestseller" />
          <Field name="price" label="Selling price" type="number" step="0.01" inputMode="decimal" value={form.price} error={errors.price} onChange={handleInput} />
          <Field name="mrp" label="MRP" type="number" step="0.01" inputMode="decimal" value={form.mrp} error={errors.mrp} onChange={handleInput} />
          <Field name="packType" label="Pack type" value={form.packType} onChange={handleInput} maxLength={30} />
          <Field name="unitType" label="Unit type" value={form.unitType} onChange={handleInput} maxLength={30} />
          <Field name="packSize" label="Units per pack" type="number" inputMode="numeric" value={form.packSize} onChange={handleInput} />
          <Field name="emoji" label="Fallback emoji" value={form.emoji} onChange={handleInput} maxLength={4} />
        </div>
      </div>

      <div className="flex flex-wrap gap-5 rounded-2xl bg-gray-50 p-5 border border-gray-100">
        {[
          { key: 'isDivisible', label: 'Can be sold loose' },
          { key: 'requiresPrescription', label: 'Prescription required' },
          { key: 'isActive', label: 'Visible in store' },
        ].map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center gap-3 text-sm font-bold text-gray-700 group">
            <div className="relative flex h-5 w-5 items-center justify-center">
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof typeof form])}
                onChange={(event) => setValue(key, event.target.checked)}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-gray-300 bg-white transition-all checked:border-indigo-600 checked:bg-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-600/20 hover:border-gray-400"
              />
              <CheckCircle2 size={14} strokeWidth={3} className="pointer-events-none absolute text-white opacity-0 transition-opacity peer-checked:opacity-100" />
            </div>
            <span className="group-hover:text-indigo-900 transition-colors">{label}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-60 active:scale-95"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {initial ? 'Save changes' : 'Add medicine'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-95"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ================================================================== */
/*  Admin: branch form                                                */
/* ================================================================== */

function BranchForm({
  branch,
  onCancel,
  onSaved,
  onError,
}: {
  branch: Branch | null;
  onCancel: () => void;
  onSaved: (branch: Branch) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    name: branch?.name || '',
    shortName: branch?.shortName || '',
    phone: branch?.phone || '',
    address: branch?.address || '',
    fullAddress: branch?.fullAddress || '',
    lat: branch?.lat !== undefined ? String(branch.lat) : '',
    lng: branch?.lng !== undefined ? String(branch.lng) : '',
    isActive: branch?.isActive ?? true,
  });
  
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const handleInput = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: name === 'phone' ? digitsOnly(value).slice(0, 15) : value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const handleAutoLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude)
        }));
        setErrors(prev => ({ ...prev, lat: undefined, lng: undefined }));
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        onError(geolocationMessage(error));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, lat: Number(form.lat), lng: Number(form.lng) };
      const url = branch ? `/api/branches/${branch._id}` : '/api/branches';
      const method = branch ? 'PUT' : 'POST';
      
      const data = await api<{ branch: Branch }>(url, {
        method,
        body: JSON.stringify(payload),
      });
      onSaved(data.branch);
    } catch (error) {
      if (error instanceof ApiError) {
        onError(error.message);
        if (error.details) setErrors(error.details);
      } else {
        onError('Could not save the branch.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full space-y-6 rounded-[24px] border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
      <h3 className="text-xl font-black tracking-tight text-gray-900 mb-2">
        {branch ? 'Edit Branch' : 'Add New Branch'}
      </h3>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Branch name" value={form.name} error={errors.name} onChange={handleInput} maxLength={80} placeholder="Lotus Pharmacy - Malad East" />
        <Field name="shortName" label="Short name" value={form.shortName} onChange={handleInput} maxLength={30} placeholder="Malad East" />
        <Field
          name="phone"
          label="WhatsApp number with country code"
          inputMode="numeric"
          value={form.phone}
          error={errors.phone}
          onChange={handleInput}
          maxLength={15}
          placeholder="919098768768"
        />
        <Field name="address" label="Area label" value={form.address} error={errors.address} onChange={handleInput} maxLength={120} placeholder="Malad East, Near Station" />
        <div className="sm:col-span-2 group/field relative">
          <label htmlFor="field-fullAddress" className="mb-1.5 block text-xs font-bold tracking-wide text-gray-500 transition-colors group-focus-within/field:text-indigo-600">
            Full address
          </label>
          <textarea
            id="field-fullAddress"
            name="fullAddress"
            rows={2}
            value={form.fullAddress}
            onChange={handleInput}
            maxLength={300}
            placeholder="Shop No 4, Ground Floor..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium outline-none transition-all duration-300 focus:-translate-y-[1px] focus:shadow-md focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 hover:border-gray-300"
          />
          {errors.fullAddress && <p className="animate-wobble mt-1.5 text-[11px] font-bold tracking-wide text-rose-600">{errors.fullAddress}</p>}
        </div>
        
        <div className="sm:col-span-2 flex flex-col gap-3 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Map size={16} strokeWidth={2.5} className="text-indigo-600" /> Location Coordinates
            </span>
            <button
              type="button"
              onClick={handleAutoLocation}
              disabled={locating}
              className="flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
              Auto-detect
            </button>
          </div>
          <div className="grid grid-cols-2 gap-5 mt-2">
            <Field name="lat" label="Latitude" type="number" step="any" inputMode="decimal" value={form.lat} error={errors.lat} onChange={handleInput} />
            <Field name="lng" label="Longitude" type="number" step="any" inputMode="decimal" value={form.lng} error={errors.lng} onChange={handleInput} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-50 p-5 border border-gray-100 mt-2">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-gray-700 group w-fit">
          <div className="relative flex h-5 w-5 items-center justify-center">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-gray-300 bg-white transition-all checked:border-indigo-600 checked:bg-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-600/20"
            />
            <CheckCircle2 size={14} strokeWidth={3} className="pointer-events-none absolute text-white opacity-0 transition-opacity peer-checked:opacity-100" />
          </div>
          <span className="group-hover:text-indigo-900 transition-colors">Accepting orders for this branch</span>
        </label>
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-60 active:scale-95"
        >
          {busy && <Loader2 size={16} className="animate-spin" />} Save Branch
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-95"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ================================================================== */
/*  Admin panel                                                       */
/* ================================================================== */

function AdminPanel({
  user,
  branches,
  onBranchesChange,
  onBackToStore,
  onLogout,
  notify,
}: {
  user: AuthUser;
  branches: Branch[];
  onBranchesChange: (branches: Branch[]) => void;
  onBackToStore: () => void;
  onLogout: () => void;
  notify: (text: string, tone?: 'success' | 'error') => void;
}) {
  const [tab, setTab] = useState<'orders' | 'catalogue' | 'branches'>('orders');
  const [stats, setStats] = useState<{ ordersToday: number; pending: number; revenueToday: number; medicineCount: number } | null>(null);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medicinesLoading, setMedicinesLoading] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMoreMedicines, setHasMoreMedicines] = useState(false);

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(medicines.map((medicine) => medicine.category))).sort(),
    [medicines],
  );

  const loadStats = useCallback(async () => {
    try {
      setStats(await api('/api/admin/stats'));
    } catch {}
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const query = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
      const data = await api<{ orders: OrderRecord[] }>(`/api/orders${query}`);
      setOrders(data.orders);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not load orders.', 'error');
    } finally {
      setOrdersLoading(false);
    }
  }, [notify, statusFilter]);

  const loadMedicines = useCallback(async (reset = false) => {
    setMedicinesLoading(true);
    try {
      const fetchPage = reset ? 1 : page;
      const data = await api<{ items: Medicine[], pages: number }>(`/api/medicines?all=true&limit=60&page=${fetchPage}`);
      setMedicines(prev => reset ? data.items : [...prev, ...data.items]);
      setTotalPages(data.pages);
      setPage(fetchPage + 1);
      setHasMoreMedicines(fetchPage < data.pages);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not load the catalogue.', 'error');
    } finally {
      setMedicinesLoading(false);
    }
  }, [notify, page]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab === 'orders') loadOrders();
    if (tab === 'catalogue' && medicines.length === 0) loadMedicines(true);
  }, [tab, loadOrders, loadMedicines, medicines.length]);

  const changeOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const data = await api<{ order: OrderRecord }>(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setOrders((prev) => prev.map((order) => (order._id === orderId ? { ...order, status: data.order.status } : order)));
      loadStats();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not update the order.', 'error');
    }
  };

  const hideMedicine = async (medicine: Medicine) => {
    if (!window.confirm(`Hide "${medicine.name}" from the store?`)) return;
    try {
      await api(`/api/medicines/${medicine._id}`, { method: 'DELETE' });
      setMedicines((prev) => prev.map((item) => (item._id === medicine._id ? { ...item, isActive: false } : item)));
      notify('Medicine hidden from the store.');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not hide the medicine.', 'error');
    }
  };

  const tabs = [
    { key: 'orders', label: 'Orders', icon: Receipt },
    { key: 'catalogue', label: 'Catalogue', icon: Package },
    { key: 'branches', label: 'Branches', icon: Store },
  ] as const;

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-gray-900 antialiased selection:bg-indigo-200 selection:text-indigo-900">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onBackToStore}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95"
          >
            <ChevronLeft size={18} strokeWidth={2.5} /> Store
          </button>

          <div className="flex items-center gap-2 text-indigo-700 pl-2 border-l border-gray-200 ml-2">
            <LayoutDashboard size={20} aria-hidden="true" />
            <h1 className="text-lg font-black tracking-tight">Admin Console</h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm font-bold text-gray-600 sm:inline bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200/60">{user.name}</span>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-gray-800 active:scale-95"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 pt-1 sm:px-6 no-scrollbar">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-bold transition-all duration-300 ease-out active:scale-95 ${
                tab === key ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {stats && (
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Orders today', value: String(stats.ordersToday), icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
              { label: 'Awaiting action', value: String(stats.pending), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Delivered today', value: formatMoney(stats.revenueToday), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Live medicines', value: String(stats.medicineCount), icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
            ].map(({ label, value, icon: Icon, color, bg, border }) => (
              <div key={label} className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${color} border ${border} transition-transform group-hover:scale-110`}>
                  <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <p className="text-2xl font-black text-gray-900 tabular-nums tracking-tight">{value}</p>
                <p className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Orders */}
        {tab === 'orders' && (
          <section>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative group/select">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as OrderStatus | 'all')}
                  className="appearance-none rounded-xl border border-gray-200 bg-white pl-4 pr-10 py-2.5 text-sm font-bold text-gray-700 outline-none transition-all duration-300 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 hover:border-gray-300 cursor-pointer"
                >
                  <option value="all">All orders</option>
                  {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {ORDER_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 group-hover/select:text-gray-600 transition-colors">
                  <ChevronLeft size={16} strokeWidth={2.5} className="-rotate-90" />
                </div>
              </div>
              
              <button
                type="button"
                onClick={loadOrders}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 active:scale-95"
              >
                <RefreshCw size={15} className={ordersLoading ? 'animate-spin text-indigo-600' : ''} /> Refresh
              </button>
            </div>

            {ordersLoading && orders.length === 0 ? (
              <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-3">
                 <Loader2 size={24} className="animate-spin text-indigo-600" />
                 <span className="text-sm font-bold">Loading orders...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-[24px] border-2 border-dashed border-gray-200 bg-white/50 py-24 text-center text-sm font-medium text-gray-500">
                No orders match this filter.
              </div>
            ) : (
              <ul className="space-y-4">
                {orders.map((order) => (
                  <li key={order._id} className="rounded-[24px] border border-gray-200 bg-white p-5 md:p-6 shadow-sm transition-shadow hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-lg font-black tracking-tight text-gray-900 tabular-nums">{order.orderNumber}</span>
                          <span className={`rounded border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${ORDER_STATUS_STYLE[order.status]}`}>
                            {ORDER_STATUS_LABEL[order.status]}
                          </span>
                          {order.type === 'prescription' && (
                            <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-gray-600">
                              Prescription
                            </span>
                          )}
                        </div>
                        <p className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-500">
                          <Clock size={12} strokeWidth={2.5} /> {formatDate(order.createdAt)}
                          <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                          <Store size={12} strokeWidth={2.5} /> {order.branch?.name}
                        </p>
                      </div>
                      <span className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2 text-xl font-black text-gray-900 tabular-nums">
                        {formatMoney(order.estimatedTotal)}
                      </span>
                    </div>

                    <div className="mt-6 grid gap-6 border-t border-gray-100 pt-6 sm:grid-cols-2">
                      <div className="rounded-2xl bg-gray-50/80 p-5 border border-gray-100">
                        <p className="font-bold text-gray-900 flex items-center gap-2">
                           <UserIcon size={16} strokeWidth={2.5} className="text-gray-400" /> {order.customer.name}
                        </p>
                        <a href={`tel:+91${order.customer.phone}`} className="mt-1.5 flex items-center gap-2 text-sm font-bold text-indigo-600 transition-colors hover:text-indigo-800 tabular-nums">
                          <Phone size={14} strokeWidth={2.5} /> +91 {order.customer.phone}
                        </a>
                        <p className="mt-3 flex items-start gap-2 text-xs font-medium leading-relaxed text-gray-600">
                          <MapPin size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-gray-400" />
                          <span>
                            {order.customer.houseNo}
                            {order.customer.area ? `, ${order.customer.area}` : ''}
                            {order.customer.landmark ? `, near ${order.customer.landmark}` : ''}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-col justify-center">
                        {order.items.length > 0 && (
                          <ul className="space-y-3 text-sm font-medium text-gray-700">
                            {order.items.map((item, index) => (
                              <li key={index} className="flex justify-between gap-3 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                                <span className="truncate">
                                  {item.displayName} <span className="font-black text-gray-400">×</span> {item.qty}
                                </span>
                                <span className="shrink-0 font-bold text-gray-900 tabular-nums">{formatMoney(item.lineTotal)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {order.prescriptionUrl && (
                          <a
                            href={order.prescriptionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-extrabold text-indigo-700 transition-colors hover:bg-indigo-100"
                          >
                            <FileText size={15} strokeWidth={2.5} /> View prescription
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-6">
                      <div className="flex items-center gap-3">
                        <label htmlFor={`status-${order._id}`} className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          Update Status
                        </label>
                        <div className="relative group/status">
                          <select
                            id={`status-${order._id}`}
                            value={order.status}
                            onChange={(event) => changeOrderStatus(order._id, event.target.value as OrderStatus)}
                            className="appearance-none rounded-xl border border-gray-200 bg-white pl-4 pr-10 py-2 text-xs font-bold text-gray-900 outline-none transition-all duration-300 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 hover:border-gray-300 cursor-pointer"
                          >
                            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((status) => (
                              <option key={status} value={status}>
                                {ORDER_STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                          <ChevronLeft size={14} strokeWidth={3} className="-rotate-90 pointer-events-none absolute inset-y-0 right-3 my-auto text-gray-400 transition-colors group-hover/status:text-gray-600" />
                        </div>
                        
                        {order.status === 'pending_whatsapp' && (
                          <div className="flex items-center gap-1.5 rounded bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-700 border border-orange-200">
                            <MessageSquareWarning size={14} /> Action Required
                          </div>
                        )}
                      </div>

                      <a
                        href={`https://wa.me/91${order.customer.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-xs font-extrabold text-white shadow-md shadow-[#25D366]/20 transition-all hover:bg-[#20b858] active:scale-95"
                      >
                         <Phone size={14} fill="currentColor" /> Chat with customer
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Catalogue */}
        {tab === 'catalogue' && (
          <section className="space-y-6">
            {showMedicineForm ? (
              <MedicineForm
                initial={editingMedicine}
                categories={categories}
                onCancel={() => {
                  setShowMedicineForm(false);
                  setEditingMedicine(null);
                }}
                onSaved={(medicine) => {
                  setMedicines((prev) => {
                    const exists = prev.some((item) => item._id === medicine._id);
                    return exists ? prev.map((item) => (item._id === medicine._id ? medicine : item)) : [medicine, ...prev];
                  });
                  setShowMedicineForm(false);
                  setEditingMedicine(null);
                  notify(editingMedicine ? 'Medicine updated.' : 'Medicine added.');
                  loadStats();
                }}
                onError={(message) => notify(message, 'error')}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMedicine(null);
                    setShowMedicineForm(true);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95"
                >
                  <Plus size={18} strokeWidth={2.5} /> Add Medicine
                </button>
                <button
                  type="button"
                  onClick={() => loadMedicines(true)}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 active:scale-95"
                >
                  <RefreshCw size={15} className={medicinesLoading ? 'animate-spin text-indigo-600' : ''} /> Refresh List
                </button>
              </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
              <ul className="divide-y divide-gray-100">
                {medicines.map((medicine) => (
                  <li key={medicine._id} className="flex items-center gap-4 p-4 md:p-5 transition-colors hover:bg-gray-50">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-50 text-2xl ring-1 ring-inset ring-gray-200/50">
                      <ProductThumb medicine={medicine} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-gray-900">{medicine.name}</p>
                      <p className="mt-1 flex items-center gap-2 truncate text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5">{medicine.category}</span>
                        <span className="text-indigo-600">{formatMoney(medicine.price)}</span>
                      </p>
                    </div>
                    {!medicine.isActive && (
                      <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Hidden</span>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMedicine(medicine);
                          setShowMedicineForm(true);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        aria-label={`Edit ${medicine.name}`}
                        className="rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
                      >
                        <Pencil size={18} strokeWidth={2.5} />
                      </button>
                      {medicine.isActive && (
                        <button
                          type="button"
                          onClick={() => hideMedicine(medicine)}
                          aria-label={`Hide ${medicine.name}`}
                          className="rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                        >
                          <EyeOff size={18} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {medicines.length === 0 && !medicinesLoading && (
                  <li className="py-24 text-center text-sm font-medium text-gray-500">Nothing in the catalogue yet.</li>
                )}
              </ul>
              
              {hasMoreMedicines && !showMedicineForm && (
                <div className="bg-gray-50/50 p-5 border-t border-gray-100 flex justify-center">
                   <button
                    onClick={() => loadMedicines(false)}
                    disabled={medicinesLoading}
                    className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 active:scale-95"
                  >
                    {medicinesLoading ? <Loader2 size={16} className="inline animate-spin mr-2" /> : null}
                    Load More
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Branches */}
        {tab === 'branches' && (
          <section className="space-y-6">
            {showBranchForm ? (
              <BranchForm
                branch={editingBranch}
                onCancel={() => {
                  setShowBranchForm(false);
                  setEditingBranch(null);
                }}
                onSaved={(updated) => {
                  if (editingBranch) {
                    onBranchesChange(branches.map((item) => (item._id === updated._id ? updated : item)));
                  } else {
                    onBranchesChange([...branches, updated]);
                  }
                  setShowBranchForm(false);
                  setEditingBranch(null);
                  notify(editingBranch ? 'Branch updated successfully.' : 'New branch created.');
                }}
                onError={(message) => notify(message, 'error')}
              />
            ) : (
              <>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranch(null);
                      setShowBranchForm(true);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95"
                  >
                    <Plus size={18} strokeWidth={2.5} /> Add Branch
                  </button>
                </div>
                {branches.length === 0 && (
                  <div className="rounded-[24px] border-2 border-dashed border-gray-200 bg-white/50 py-24 text-center text-sm font-medium text-gray-500">
                    No branches setup yet. Add your first branch.
                  </div>
                )}
                {branches.map((branch) => (
                  <div key={branch._id} className="rounded-3xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm transition-shadow hover:shadow-md">
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 text-indigo-600 ring-1 ring-gray-200">
                             <Store size={22} strokeWidth={2.5} aria-hidden="true" />
                          </span>
                          <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">{branch.name}</h3>
                            {!branch.isActive && (
                              <span className="mt-1 inline-block rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Paused</span>
                            )}
                          </div>
                        </div>
                        <div className="ml-14 space-y-2">
                          <p className="flex items-center gap-2.5 text-sm font-bold text-gray-600 tabular-nums">
                            <Phone size={15} strokeWidth={2.5} className="text-gray-400" aria-hidden="true" /> +{branch.phone}
                          </p>
                          <p className="flex items-start gap-2.5 text-sm font-medium leading-relaxed text-gray-600">
                            <MapPin size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" /> {branch.fullAddress}
                          </p>
                          <p className="flex items-center gap-2.5 text-xs font-bold text-gray-400 tabular-nums">
                            <Navigation size={13} strokeWidth={2.5} aria-hidden="true" /> {branch.lat}, {branch.lng}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBranch(branch);
                          setShowBranchForm(true);
                        }}
                        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-95"
                      >
                        <Pencil size={16} strokeWidth={2.5} /> Edit Branch
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/* ================================================================== */
/*  Root page                                                         */
/* ================================================================== */

export default function Page() {
  /* ---------------- Session and data ---------------- */
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [view, setView] = useState<'store' | 'admin'>('store');

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [storePage, setStorePage] = useState(1);
  const [hasMoreStoreMedicines, setHasMoreStoreMedicines] = useState(false);

  /* ---------------- Storefront state ---------------- */
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const [activeCategory, setActiveCategory] = useState('All');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<{ id: number; text: string; tone: 'success' | 'error' } | null>(null);

  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState<AddressForm>({ name: '', phone: '', houseNo: '', area: '', landmark: '' });
  const [addressErrors, setAddressErrors] = useState<FieldErrors>({});

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [locateStatus, setLocateStatus] = useState<LocateStatus>('idle');
  const [locateError, setLocateError] = useState<string | null>(null);
  const [detectedDistance, setDetectedDistance] = useState<number | null>(null);

  const cartPanelRef = useRef<HTMLDivElement>(null);
  const prescriptionPanelRef = useRef<HTMLDivElement>(null);

  /* ---------------- Toast ---------------- */

  const notify = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500); 
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---------------- Session ---------------- */

  useEffect(() => {
    let cancelled = false;
    api<{ user: AuthUser }>('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setAddress((prev) => ({
      ...prev,
      name: prev.name || user.name,
      phone: prev.phone || user.phone,
    }));
  }, [user]);

  /* ---------------- Catalogue ---------------- */

  const loadCatalogue = useCallback(async (reset = false) => {
    if (reset) setCatalogueLoading(true);
    setCatalogueError(null);
    try {
      const fetchPage = reset ? 1 : storePage;
      const searchParam = deferredQuery ? `&search=${encodeURIComponent(deferredQuery)}` : '';
      const categoryParam = activeCategory !== 'All' ? `&category=${encodeURIComponent(activeCategory)}` : '';
      
      const [medicineData, branchData] = await Promise.all([
        api<{ items: Medicine[], pages: number }>(`/api/medicines?limit=30&page=${fetchPage}${searchParam}${categoryParam}`),
        reset ? api<{ branches: Branch[] }>('/api/branches') : Promise.resolve({ branches: branches })
      ]);
      
      setMedicines(prev => reset ? medicineData.items : [...prev, ...medicineData.items]);
      if (reset) {
         setBranches(branchData.branches);
         setSelectedBranch((prev) => prev ?? branchData.branches[0] ?? null);
      }
      setStorePage(fetchPage + 1);
      setHasMoreStoreMedicines(fetchPage < medicineData.pages);
      
    } catch (error) {
      setCatalogueError(error instanceof ApiError ? error.message : 'Could not load the store.');
    } finally {
      setCatalogueLoading(false);
    }
  }, [storePage, deferredQuery, activeCategory, branches]);

  useEffect(() => {
     setStorePage(1);
     loadCatalogue(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery, activeCategory]);

  /* ---------------- Cart persistence ---------------- */

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
    setCartHydrated(true);
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart, cartHydrated]);

  /* ---------------- Object URL cleanup ---------------- */

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  /* ---------------- Overlays ---------------- */

  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const closePrescription = useCallback(() => setIsPrescriptionOpen(false), []);

  useBodyScrollLock(isCartOpen || isPrescriptionOpen);
  useEscapeKey(isCartOpen, closeCart);
  useEscapeKey(isPrescriptionOpen, closePrescription);
  useReturnFocus(isCartOpen, cartPanelRef);
  useReturnFocus(isPrescriptionOpen, prescriptionPanelRef);

  /* ---------------- Derived ---------------- */

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(medicines.map((medicine) => medicine.category))).sort()],
    [medicines],
  );

  const cartQuantities = useMemo(
    () => Object.fromEntries(cart.map((item) => [item.cartItemId, item.qty])),
    [cart],
  );

  const { itemCount, total, savings } = useMemo(
    () =>
      cart.reduce(
        (acc, item) => ({
          itemCount: acc.itemCount + item.qty,
          total: acc.total + item.unitPrice * item.qty,
          savings: acc.savings + Math.max(0, item.unitMrp - item.unitPrice) * item.qty,
        }),
        { itemCount: 0, total: 0, savings: 0 },
      ),
    [cart],
  );

  /* ---------------- Cart actions ---------------- */

  const addToCart = useCallback(
    (medicine: Medicine, buyType: BuyType) => {
      const cartItemId = `${medicine._id}-${buyType}`;
      const unitPrice =
        buyType === 'loose' ? Number((medicine.price / medicine.packSize).toFixed(2)) : medicine.price;
      const unitMrp = buyType === 'loose' ? Number((medicine.mrp / medicine.packSize).toFixed(2)) : medicine.mrp;

      setCart((prev) => {
        const existing = prev.find((item) => item.cartItemId === cartItemId);
        if (existing) {
          return prev.map((item) =>
            item.cartItemId === cartItemId ? { ...item, qty: Math.min(item.qty + 1, MAX_QTY_PER_ITEM) } : item,
          );
        }
        return [
          ...prev,
          {
            cartItemId,
            medicineId: medicine._id,
            name: medicine.name,
            displayName:
              buyType === 'loose'
                ? `${medicine.name} — 1 ${medicine.unitType}`
                : `${medicine.name} — ${medicine.packType} of ${medicine.packSize}`,
            emoji: medicine.emoji,
            imageUrl: medicine.imageUrl,
            buyType,
            qty: 1,
            unitPrice,
            unitMrp,
          },
        ];
      });

      notify(`${medicine.name} added`);
    },
    [notify],
  );

  const updateQty = useCallback((cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.cartItemId !== cartItemId) return item;
        const nextQty = Math.min(item.qty + delta, MAX_QTY_PER_ITEM);
        return nextQty > 0 ? { ...item, qty: nextQty } : [];
      }),
    );
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const handleAddressChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const nextValue = name === 'phone' ? digitsOnly(value).slice(0, 10) : value;
    setAddress((prev) => ({ ...prev, [name]: nextValue }));
    setAddressErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }, []);

  /* ---------------- Branch ---------------- */

  const detectNearestBranch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || branches.length === 0) {
      setLocateStatus('error');
      setLocateError('This browser cannot share location. Pick a branch manually.');
      return;
    }

    setLocateStatus('loading');
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let nearestBranch = branches[0];
        let minDistance = Number.POSITIVE_INFINITY;
        
        for (const branch of branches) {
           const d = distanceInKm(coords.latitude, coords.longitude, branch.lat, branch.lng);
           if (d < minDistance) {
              minDistance = d;
              nearestBranch = branch;
           }
        }
        
        const actualRoutingDistance = await getRoutingDistance(coords.latitude, coords.longitude, nearestBranch.lat, nearestBranch.lng);

        setSelectedBranch(nearestBranch);
        setDetectedDistance(actualRoutingDistance);
        setLocateStatus('success');
        notify(`Nearest branch: ${nearestBranch.name}`);
      },
      (error) => {
        setLocateStatus('error');
        setLocateError(geolocationMessage(error));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, [branches, notify]);

  const selectBranch = useCallback(
    (branchId: string) => {
      const branch = branches.find((item) => item._id === branchId);
      if (!branch) return;
      setSelectedBranch(branch);
      setDetectedDistance(null);
      setLocateStatus('idle');
      setLocateError(null);
    },
    [branches],
  );

  /* ---------------- Checkout ---------------- */

  const openWhatsApp = useCallback((phone: string, message: string) => {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = url;
  }, []);

  const handleCheckout = useCallback(async () => {
    if (!selectedBranch) return;

    const errors = validateAddress(address, true);
    setAddressErrors(errors);
    if (Object.keys(errors).length > 0) {
      notify('Please check the highlighted delivery details.', 'error');
      
      setTimeout(() => {
        document.getElementById('field-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }
    if (cart.length === 0) return;

    setSubmitting(true);
    try {
      const data = await api<{ order: { orderNumber: string; estimatedTotal: number } }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'cart',
          branchId: selectedBranch._id,
          customer: address,
          items: cart.map((item) => ({ medicineId: item.medicineId, buyType: item.buyType, qty: item.qty })),
        }),
      });

      const lines = [
        `Order ${data.order.orderNumber} — ${selectedBranch.name}`,
        '',
        `Name: ${sanitizeForMessage(address.name)}`,
        `Phone: ${digitsOnly(address.phone)}`,
        `Address: ${sanitizeForMessage(address.houseNo)}, ${sanitizeForMessage(address.area)}${
          address.landmark ? `, near ${sanitizeForMessage(address.landmark)}` : ''
        }`,
        '',
        'Items:',
        ...cart.map(
          (item, index) =>
            `${index + 1}. ${sanitizeForMessage(item.displayName, 80)} x ${item.qty} = ${formatMoney(
              item.unitPrice * item.qty,
            )}`,
        ),
        '',
        `Estimated total: ${formatMoney(data.order.estimatedTotal)}`,
        '',
        'Please confirm availability and the final bill.',
      ];

      openWhatsApp(selectedBranch.phone, lines.join('\n'));
      setCart([]);
      setIsCartOpen(false);
      notify(`Order ${data.order.orderNumber} placed securely!`);
    } catch (error) {
      if (error instanceof ApiError) {
        notify(error.message, 'error');
        if (error.details) setAddressErrors(error.details);
      } else {
        notify('Could not place the order.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }, [address, cart, notify, openWhatsApp, selectedBranch]);

  /* ---------------- Prescription ---------------- */

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Upload a JPG, PNG or WEBP photo of the prescription.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('That photo is over 5 MB. Upload a smaller one.');
      return;
    }

    setUploadError(null);
    setPrescriptionFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const clearPrescription = useCallback(() => {
    setPrescriptionFile(null);
    setPreviewUrl(null);
    setUploadError(null);
  }, []);

  const handlePrescriptionSubmit = useCallback(async () => {
    if (!selectedBranch) return;

    const errors = validateAddress(address, false);
    setAddressErrors(errors);
    if (Object.keys(errors).length > 0) {
      notify('Please check the highlighted delivery details.', 'error');
      return;
    }
    if (!prescriptionFile) {
      setUploadError('Please add a photo of the prescription first.');
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('image', prescriptionFile);
      const uploaded = await api<{ url: string; publicId: string }>('/api/uploads/prescription', {
        method: 'POST',
        body,
      });

      const data = await api<{ order: { orderNumber: string } }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prescription',
          branchId: selectedBranch._id,
          customer: address,
          prescriptionUrl: uploaded.url,
          prescriptionPublicId: uploaded.publicId,
        }),
      });

      const message = [
        `Prescription order ${data.order.orderNumber} — ${selectedBranch.name}`,
        '',
        `Name: ${sanitizeForMessage(address.name)}`,
        `Phone: ${digitsOnly(address.phone)}`,
        `Address: ${sanitizeForMessage(address.houseNo)}`,
        '',
        `Prescription: ${uploaded.url}`,
        '',
        'Please check the prescription and send the total bill.',
      ].join('\n');

      openWhatsApp(selectedBranch.phone, message);
      setIsPrescriptionOpen(false);
      clearPrescription();
      notify(`Prescription order ${data.order.orderNumber} placed securely!`);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not send the prescription.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [address, clearPrescription, notify, openWhatsApp, prescriptionFile, selectedBranch]);

  /* ---------------- Auth actions ---------------- */

  const handleLogout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setView('store');
    notify('Successfully signed out.');
  }, [notify]);

  /* ---------------- Render ---------------- */

  const toastNode = (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[90] flex justify-center px-4" aria-live="polite">
      {toast && (
        <div
          key={toast.id}
          className={`animate-pop flex items-center gap-3 rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg backdrop-blur-md ${
            toast.tone === 'error' ? 'bg-rose-600/95 ring-1 ring-rose-500/50' : 'bg-gray-900/95 ring-1 ring-gray-700'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertCircle size={18} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} strokeWidth={2.5} className="shrink-0 text-emerald-400" aria-hidden="true" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );

  const styleNode = (
    <style
      dangerouslySetInnerHTML={{
        __html: `
      .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      .no-scrollbar::-webkit-scrollbar { display: none; }

      @keyframes popSpring { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes wobbleError { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }

      .animate-pop { animation: popSpring 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
      .animate-wobble { animation: wobbleError 0.4s ease-in-out; }

      :focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; border-radius: 8px; }
      html { scroll-behavior: smooth; }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
    `,
      }}
    />
  );

  if (view === 'admin' && user?.role === 'admin') {
    return (
      <>
        {toastNode}
        <AdminPanel
          user={user}
          branches={branches}
          onBranchesChange={setBranches}
          onBackToStore={() => setView('store')}
          onLogout={handleLogout}
          notify={notify}
        />
        {styleNode}
      </>
    );
  }

  const branchPicker = (
    <BranchPicker
      branches={branches}
      selected={selectedBranch}
      distance={detectedDistance}
      status={locateStatus}
      errorMessage={locateError}
      onDetect={detectNearestBranch}
      onSelect={selectBranch}
    />
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-gray-900 antialiased selection:bg-indigo-200 selection:text-indigo-900">
      {toastNode}

      <div className="bg-gray-900 px-4 py-2 text-center text-xs font-bold tracking-wide text-white">
        <span className="inline-flex items-center gap-2">
          <Clock size={14} strokeWidth={2.5} aria-hidden="true" /> Open 24/7 · Fast delivery in the area
        </span>
      </div>

      <div className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <a href="#top" className="shrink-0 leading-none group">
              <span className="block text-2xl font-black tracking-tight text-gray-900 group-hover:text-indigo-600 transition-colors sm:text-3xl">Lotus Pharmacy</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Premium Healthcare</span>
            </a>

            <div className="ml-auto hidden flex-1 max-w-lg lg:block">
              <SearchInput value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="ml-auto flex items-center gap-2 md:ml-0">
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setView('admin')}
                  className="hidden items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:flex"
                >
                  <LayoutDashboard size={18} strokeWidth={2.5} /> Admin
                </button>
              )}

              {sessionChecked &&
                (user ? (
                  <div className="group relative">
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                    >
                      <UserIcon size={18} strokeWidth={2.5} aria-hidden="true" />
                      <span className="hidden max-w-[8rem] truncate sm:inline">{user.name.split(' ')[0]}</span>
                    </button>
                    <div className="invisible absolute right-0 top-full z-50 mt-1 w-48 rounded-2xl border border-gray-200 bg-white p-2 opacity-0 shadow-lg transition-all duration-300 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 origin-top">
                      {user.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => setView('admin')}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 sm:hidden"
                        >
                          <LayoutDashboard size={16} /> Admin panel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAuth(true)}
                    className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  >
                    Sign in
                  </button>
                ))}

              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                className="relative flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-white transition-all hover:bg-indigo-600 active:scale-95"
              >
                <ShoppingCart size={20} strokeWidth={2.5} aria-hidden="true" />
                {itemCount > 0 && (
                  <span
                    key={itemCount}
                    className="animate-pop absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white tabular-nums shadow-sm border-2 border-white"
                  >
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 lg:hidden">
            <SearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>
        </div>

        <div className="border-t border-gray-100/50">
          <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth">
              {categories.map((category) => {
                const active = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveCategory(category)}
                    className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                      active
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <section id="top" className="relative overflow-hidden bg-gray-900 pt-16 pb-24 sm:pt-20 sm:pb-32 lg:pb-36 border-b border-gray-800">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
           <div className="absolute -top-1/2 -right-1/4 w-[1000px] h-[1000px] rounded-full bg-indigo-500/10 blur-[100px] opacity-70"></div>
           <div className="absolute -bottom-1/2 -left-1/4 w-[800px] h-[800px] rounded-full bg-emerald-500/10 blur-[100px] opacity-70"></div>
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
          <h1 className="max-w-[20ch] text-4xl font-black leading-tight tracking-tighter text-white sm:text-5xl lg:text-7xl">
            Upload your prescription. <span className="text-indigo-400 block sm:inline">We handle the rest.</span>
          </h1>
          <p className="mt-6 max-w-[60ch] text-base font-medium leading-relaxed text-gray-400 sm:text-lg">
            Photograph your prescription, add your address, and our automated system routes it to the closest branch. A qualified pharmacist confirms your bill instantly.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => setIsPrescriptionOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 hover:-translate-y-0.5 active:scale-95"
            >
              <UploadCloud size={20} strokeWidth={2.5} aria-hidden="true" /> Upload Prescription
            </button>
            {selectedBranch && (
              <a
                href={`tel:+${selectedBranch.phone}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur-sm px-8 py-4 text-sm font-bold text-white transition-all hover:border-gray-500 hover:bg-gray-700 active:scale-95"
              >
                <PhoneCall size={18} strokeWidth={2.5} aria-hidden="true" /> Call {selectedBranch.shortName}
              </a>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-12 sm:px-6 lg:px-8 lg:pb-20">
        <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-gray-200/80 pb-5">
          <h2 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">
            {activeCategory === 'All' ? 'Everyday Medicines' : activeCategory}
          </h2>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 tabular-nums border border-gray-200">
            {medicines.length} item{medicines.length === 1 ? '' : 's'}
          </span>
        </div>

        {catalogueLoading && medicines.length === 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-[280px] animate-pulse rounded-2xl bg-gray-200/50" />
            ))}
          </div>
        ) : catalogueError ? (
          <div className="rounded-3xl border border-gray-200 bg-white py-20 text-center shadow-sm">
            <AlertCircle size={48} strokeWidth={2} className="mx-auto mb-4 text-rose-500" aria-hidden="true" />
            <p className="text-lg font-black text-gray-900">{catalogueError}</p>
            <button
              type="button"
              onClick={() => loadCatalogue(true)}
              className="mt-6 rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-gray-800 active:scale-95"
            >
              Try Again
            </button>
          </div>
        ) : medicines.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5">
              {medicines.map((medicine, index) => (
                <ProductCard
                  key={medicine._id}
                  index={index}
                  medicine={medicine}
                  cartQuantities={cartQuantities}
                  onAdd={addToCart}
                  onUpdateQty={updateQty}
                />
              ))}
            </div>
            {hasMoreStoreMedicines && (
              <div className="mt-12 flex justify-center">
                <button
                  onClick={() => loadCatalogue(false)}
                  disabled={catalogueLoading}
                  className="rounded-xl border border-gray-200 bg-white px-8 py-3.5 text-sm font-bold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 active:scale-95"
                >
                  {catalogueLoading ? <Loader2 size={18} className="inline animate-spin mr-2" /> : null}
                  {catalogueLoading ? 'Loading more...' : 'Load More Medicines'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-3xl border border-gray-200 bg-white py-24 text-center shadow-sm">
            <Search size={48} strokeWidth={1.5} className="mx-auto mb-5 text-gray-300" aria-hidden="true" />
            <p className="text-lg font-black text-gray-900">Nothing matches your search.</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-sm font-medium text-gray-500">
              Try a different keyword, or upload your prescription and we will look it up.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('All');
              }}
              className="mt-8 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-95"
            >
              Clear Filters
            </button>
          </div>
        )}
      </main>

      <section className="border-t border-gray-200/80 bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-black tracking-tight text-gray-900 sm:text-4xl text-center mb-16">
            The Industry Standard for Pharmacy Delivery.
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Shield,
                title: 'Authenticity Guaranteed',
                body: 'All stock is sourced directly from authorized distributors. Cold-chain items are monitored. Batch and expiry are clearly documented.',
              },
              {
                icon: Navigation,
                title: 'Smart Order Routing',
                body: 'Our system automatically detects your location and routes the order to the closest active branch, guaranteeing minimal delivery time.',
              },
              {
                icon: Award,
                title: 'Certified Pharmacists',
                body: 'Speak directly to qualified professionals regarding dosage, interactions, or substitutes before your order is dispatched.',
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <article key={title} className="group rounded-3xl border border-gray-200 bg-gray-50/50 p-8 transition-all hover:bg-white hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-900/5">
                <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition-transform group-hover:scale-110">
                  <Icon size={24} strokeWidth={2} aria-hidden="true" />
                </span>
                <h3 className="mb-3 text-lg font-black tracking-tight text-gray-900">{title}</h3>
                <p className="text-sm font-medium leading-relaxed text-gray-600">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-800 bg-gray-950 pb-28 pt-20 text-gray-400 lg:pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 border-b border-gray-800 pb-12 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-3xl font-black tracking-tight text-white">Lotus Pharmacy</p>
              <p className="mt-3 max-w-[46ch] text-sm font-medium leading-relaxed text-gray-400">
                Premium healthcare delivery platform serving the community round the clock.
              </p>
            </div>
            {branches[0] && (
              <a
                href={`tel:+${branches[0].phone}`}
                className="inline-flex items-center gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-indigo-500/50 hover:bg-gray-800"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                  <Phone size={22} strokeWidth={2.5} aria-hidden="true" />
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-gray-500">Call {branches[0].name}</span>
                  <span className="block text-lg font-black text-white tabular-nums tracking-wide">+{branches[0].phone}</span>
                </div>
              </a>
            )}
          </div>

          <div className="grid gap-10 py-12 md:grid-cols-3">
            {branches.map((branch) => (
              <div key={branch._id} className="group">
                <h3 className="mb-5 flex items-center gap-2.5 text-lg font-black text-white transition-colors group-hover:text-indigo-400">
                  <Store size={20} strokeWidth={2.5} aria-hidden="true" /> {branch.name}
                </h3>
                <ul className="space-y-4 text-sm font-medium text-gray-400">
                  <li className="flex items-start gap-3">
                    <MapPin className="mt-0.5 shrink-0 text-gray-500" size={18} strokeWidth={2.5} aria-hidden="true" />
                    <span className="leading-relaxed">{branch.fullAddress}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Clock className="shrink-0 text-gray-500" size={18} strokeWidth={2.5} aria-hidden="true" />
                    <span>Open 24/7</span>
                  </li>
                </ul>
              </div>
            ))}
          </div>

          <p className="border-t border-gray-800 pt-8 text-center text-xs font-bold uppercase tracking-widest text-gray-600">
            © {new Date().getFullYear()} Lotus Pharmacy Group. Prescription medicines require a valid prescription.
          </p>
        </div>
      </footer>

      {itemCount > 0 && !isCartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-gray-900 px-5 py-4 text-white shadow-lg transition-all hover:bg-gray-800 active:scale-[0.98]"
          >
            <span className="text-sm font-bold tracking-wide">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {formatMoney(total)}
            </span>
            <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
              Checkout <ArrowRight size={16} strokeWidth={3} />
            </span>
          </button>
        </div>
      )}

      {isCartOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Your cart">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={closeCart} />

          <div
            ref={cartPanelRef}
            tabIndex={-1}
            className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl outline-none"
          >
            <header className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5">
              <h2 className="flex items-center gap-2.5 text-lg font-black tracking-tight text-gray-900">
                <ShoppingCart size={22} strokeWidth={2.5} className="text-indigo-600" aria-hidden="true" /> Your Cart
                {itemCount > 0 && <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600 tabular-nums">{itemCount}</span>}
              </h2>
              <button
                type="button"
                onClick={closeCart}
                aria-label="Close cart"
                className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </header>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-5 pb-10 bg-gray-50/50">
              {cart.length === 0 ? (
                <div className="py-24 text-center">
                  <ShoppingCart size={48} strokeWidth={1.5} className="mx-auto mb-5 text-gray-300" aria-hidden="true" />
                  <p className="text-base font-black text-gray-900">Your cart is empty</p>
                  <p className="mx-auto mt-2 max-w-[32ch] text-sm font-medium text-gray-500">
                    Add medicines from the list, or send a prescription directly.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      closeCart();
                      setIsPrescriptionOpen(true);
                    }}
                    className="mt-8 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
                  >
                    Upload Prescription
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <ul className="space-y-4">
                    {cart.map((item) => (
                      <li key={item.cartItemId} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-50 text-2xl ring-1 ring-inset ring-gray-100">
                            <ProductThumb medicine={{ emoji: item.emoji, imageUrl: item.imageUrl, name: item.name }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold leading-snug tracking-tight text-gray-900">{item.name}</p>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.cartItemId)}
                                aria-label={`Remove ${item.name}`}
                                className="shrink-0 rounded-full bg-gray-50 p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                              >
                                <X size={15} strokeWidth={2.5} />
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                              {item.buyType === 'loose' ? 'Loose unit' : 'Full pack'} · {formatMoney(item.unitPrice)}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                              <QuantityStepper
                                qty={item.qty}
                                label={item.name}
                                onDecrease={() => updateQty(item.cartItemId, -1)}
                                onIncrease={() => updateQty(item.cartItemId, 1)}
                              />
                              <span className="text-base font-black text-gray-900 tabular-nums">
                                {formatMoney(item.unitPrice * item.qty)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-600">Estimated Total</span>
                      <span className="text-xl font-black text-gray-900 tabular-nums">{formatMoney(total)}</span>
                    </div>
                    {savings > 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600 tabular-nums">
                        <CheckCircle2 size={14} strokeWidth={2.5} /> You save {formatMoney(savings)}
                      </p>
                    )}
                    <p className="mt-4 text-[11px] font-medium leading-relaxed text-gray-500 border-t border-gray-100 pt-4 uppercase tracking-wider">
                      Pharmacist confirms final bill on WhatsApp.
                    </p>
                  </div>

                  {!user && (
                    <button
                      type="button"
                      onClick={() => {
                        closeCart();
                        setShowAuth(true);
                      }}
                      className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-white p-5 text-left text-sm font-medium text-gray-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50/50"
                    >
                      <span className="font-bold text-indigo-700">Sign in</span> to save delivery details permanently, or continue as a guest below.
                    </button>
                  )}

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-sm font-black tracking-tight text-gray-900">Delivery Information</h3>
                    <div className="space-y-4">
                      <Field name="name" label="Full name" autoComplete="name" value={address.name} error={addressErrors.name} onChange={handleAddressChange} maxLength={60} />
                      <Field
                        name="phone"
                        label="Mobile number"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={address.phone}
                        error={addressErrors.phone}
                        onChange={handleAddressChange}
                        maxLength={10}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field name="houseNo" label="House/Flat No" autoComplete="address-line1" value={address.houseNo} error={addressErrors.houseNo} onChange={handleAddressChange} maxLength={80} />
                        <Field name="area" label="Area/Locality" autoComplete="address-level3" value={address.area} error={addressErrors.area} onChange={handleAddressChange} maxLength={80} />
                      </div>
                      <Field name="landmark" label="Landmark (Optional)" value={address.landmark} onChange={handleAddressChange} maxLength={80} />
                    </div>
                  </section>

                  {branchPicker}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <footer className="border-t border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lg">
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={submitting || !selectedBranch}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-4 text-sm font-bold text-white shadow-md shadow-[#25D366]/20 transition-all hover:bg-[#20b858] disabled:opacity-60 disabled:shadow-none active:scale-[0.98]"
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} fill="currentColor" aria-hidden="true" />}
                  Order via WhatsApp
                </button>
              </footer>
            )}
          </div>
        </div>
      )}

      {isPrescriptionOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Upload prescription">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={closePrescription} />

          <div
            ref={prescriptionPanelRef}
            tabIndex={-1}
            className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-gray-50 shadow-2xl outline-none sm:rounded-[32px] border border-white/20"
          >
            <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-5">
              <h2 className="flex items-center gap-2.5 text-lg font-black tracking-tight text-gray-900">
                <FileText size={20} strokeWidth={2.5} className="text-indigo-600" aria-hidden="true" /> Upload Prescription
              </h2>
              <button
                type="button"
                onClick={closePrescription}
                aria-label="Close"
                className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </header>

            <div className="custom-scrollbar space-y-6 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed p-8 text-center transition-all ${
                    previewUrl ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {previewUrl ? (
                    <img src={previewUrl} alt="Prescription preview" className="max-h-48 rounded-xl object-contain shadow-sm border border-gray-200/50" />
                  ) : (
                    <>
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-gray-50 text-indigo-600 ring-1 ring-gray-200">
                        <ImageIcon size={32} strokeWidth={2} aria-hidden="true" />
                      </div>
                      <span className="text-sm font-bold text-gray-900">Take or choose a photo</span>
                      <span className="mt-2 max-w-[24ch] text-xs font-medium leading-relaxed text-gray-500">
                        JPG, PNG or WEBP up to 5 MB. Make sure details are visible.
                      </span>
                    </>
                  )}
                </button>

                {previewUrl && (
                  <div className="mt-3 flex items-center justify-between text-xs font-bold rounded-xl bg-white p-3 border border-gray-200 shadow-sm">
                    <span className="truncate text-gray-600">{prescriptionFile?.name}</span>
                    <button type="button" onClick={clearPrescription} className="shrink-0 text-rose-600 hover:text-rose-700">
                      Remove
                    </button>
                  </div>
                )}

                {uploadError && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 border border-rose-100">
                    <AlertCircle size={14} strokeWidth={2.5} aria-hidden="true" className="shrink-0" /> {uploadError}
                  </p>
                )}
              </div>

              <section className="space-y-4 rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-black tracking-tight text-gray-900">Delivery Information</h3>
                <Field name="name" label="Full name" autoComplete="name" value={address.name} error={addressErrors.name} onChange={handleAddressChange} maxLength={60} />
                <Field
                  name="phone"
                  label="Mobile number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={address.phone}
                  error={addressErrors.phone}
                  onChange={handleAddressChange}
                  maxLength={10}
                />
                <Field name="houseNo" label="Complete Address" autoComplete="street-address" value={address.houseNo} error={addressErrors.houseNo} onChange={handleAddressChange} maxLength={120} />
              </section>

              {branchPicker}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handlePrescriptionSubmit}
                  disabled={submitting || !selectedBranch}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-60 disabled:shadow-none active:scale-[0.98]"
                >
                  {submitting && <Loader2 size={18} className="animate-spin" />}
                  Send Securely
                </button>
                <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Image is encrypted & sent via WhatsApp
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthenticated={(authenticated) => {
            setUser(authenticated);
            setShowAuth(false);
            notify(`Welcome back, ${authenticated.name.split(' ')[0]}`);
          }}
        />
      )}

      {styleNode}
    </div>
  );
}
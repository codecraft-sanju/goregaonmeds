'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  IndianRupee,
  LayoutDashboard,
  LayoutList,
  Loader2,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  Package,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UploadCloud,
  UserRound,
  X,
  Settings
} from 'lucide-react';
import { BranchMarquee } from './BranchMarquee';
/* ================================================================== */
/*  Types                                                             */
/* ================================================================== */

type BuyType = 'full' | 'loose';
type LocateStatus = 'idle' | 'loading' | 'success' | 'error';
type Role = 'customer' | 'admin';
type ToastTone = 'success' | 'error';
type AdminTab = 'orders' | 'catalogue' | 'branches' | 'whatsapp' | 'settings';
type OrderRange = 'today' | 'week' | 'month' | 'all';

type OrderStatus =
  | 'pending_whatsapp'
  | 'placed'
  | 'confirmed'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

interface UserAddress {
  label?: string;
  houseNo: string;
  area: string;
  landmark: string;
}

interface GlobalSettings {
  fallbackImageUrl: string;
  fallbackImagePublicId: string;
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  addresses?: UserAddress[];
}

interface MedicineInventory {
  branch: string;
  stockUnits: number;
  lowStockAt: number;
  isAvailable: boolean;
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
  imageUrl: string;
  imagePublicId: string;
  tag: string;
  isActive: boolean;
  inventory: MedicineInventory[];
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
  serviceRadiusKm: number;
  open24h: boolean;
  isActive: boolean;
}

interface CartItem {
  cartItemId: string;
  medicineId: string;
  name: string;
  displayName: string;
  imageUrl: string;
  buyType: BuyType;
  qty: number;
  unitPrice: number;
  unitMrp: number;
  requiresPrescription: boolean;
}

interface AddressForm {
  name: string;
  phone: string;
  houseNo: string;
  area: string;
  landmark: string;
}

interface OrderItemRecord {
  medicine?: string;
  name: string;
  displayName: string;
  buyType: BuyType;
  qty: number;
  unitPrice: number;
  unitMrp: number;
  lineTotal: number;
  requiresPrescription?: boolean;
}

interface StatusHistoryRecord {
  status: OrderStatus;
  at: string;
  note?: string;
}

interface OrderRecord {
  _id: string;
  id?: string;
  orderNumber: string;
  type: 'cart' | 'prescription';
  status: OrderStatus;
  estimatedTotal: number;
  estimatedSavings?: number;
  hasPrescription?: boolean;
  note?: string;
  createdAt: string;
  customer: AddressForm;
  items: OrderItemRecord[];
  statusHistory?: StatusHistoryRecord[];
  branch?:
    | Pick<Branch, '_id' | 'name' | 'shortName' | 'phone' | 'address'>
    | {
        id: string;
        name: string;
        shortName?: string;
        phone: string;
      };
  user?: { name: string; email: string } | null;
}

interface BranchPerformance {
  id: string;
  name: string;
  orders: number;
  pct: number;
}

interface AdminStats {
  ordersToday: number;
  ordersDelta: number;
  waitingWhatsApp: number;
  openOrders: number;
  bookedToday: number;
  bookedDelta: number;
  medicineCount: number;
  ordersSeries: number[];
  revenueSeries: number[];
  branchPerformance: BranchPerformance[];
}

interface WhatsAppSession {
  configured: boolean;
  reachable: boolean;
  state: string;
  phone: string;
  name: string;
  qr: string | null;
  message: string;
  checkedAt: string;
}

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

type FieldErrors = Record<string, string | undefined>;

/* ================================================================== */
/*  Constants                                                         */
/* ================================================================== */

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const CART_STORAGE_KEY = 'lp_cart_v3';
const MAX_QTY_PER_ITEM = 20;
const MAX_CART_LINES = 60;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 24;
const ADMIN_ORDERS_PAGE_SIZE = 20;
const ADMIN_CATALOGUE_PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 350;
const REQUEST_TIMEOUT_MS = 20000;
const ALL_CATEGORIES = 'All';
const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_whatsapp: 'Waiting on WhatsApp',
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  pending_whatsapp: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70',
  placed: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70',
  confirmed: 'bg-[#E6F4F1] text-[#0B7A6B] ring-1 ring-[#0B7A6B]/20',
  packed: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70',
  out_for_delivery: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70',
  delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70',
  cancelled: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70',
};

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_whatsapp: ['placed', 'confirmed', 'cancelled'],
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const ORDER_RANGE_LABEL: Record<OrderRange, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
};

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const compactNumber = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const formatMoney = (value: number) =>
  currency.format(Number.isFinite(value) ? value : 0);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

const formatTimeOnly = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || '?';

function distanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  if (sanitizeForMessage(address.name).length < 2) {
    errors.name = 'Enter the name for this delivery.';
  }
  if (!INDIAN_MOBILE.test(digitsOnly(address.phone))) {
    errors.phone = 'Enter a 10-digit mobile number.';
  }
  if (sanitizeForMessage(address.houseNo).length < 3) {
    errors.houseNo = 'Enter your house or flat number.';
  }
  if (requireArea && sanitizeForMessage(address.area).length < 3) {
    errors.area = 'Enter your area or locality.';
  }

  return errors;
}

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location is blocked in your browser. Choose a branch below.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location could not be read. Choose a branch below.';
    case error.TIMEOUT:
      return 'Locating took too long. Try again or choose a branch below.';
    default:
      return 'Locating failed. Choose a branch below.';
  }
}

function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is CartItem => {
        if (!entry || typeof entry !== 'object') return false;
        const item = entry as Record<string, unknown>;
        return (
          typeof item.cartItemId === 'string' &&
          typeof item.medicineId === 'string' &&
          typeof item.name === 'string' &&
          (item.buyType === 'full' || item.buyType === 'loose') &&
          Number.isFinite(item.qty) &&
          Number.isFinite(item.unitPrice)
        );
      })
      .slice(0, MAX_CART_LINES)
      .map((item) => ({
        ...item,
        displayName:
          typeof item.displayName === 'string' ? item.displayName : item.name,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
        qty: Math.min(Math.max(Math.round(item.qty), 1), MAX_QTY_PER_ITEM),
        unitPrice: Math.max(0, item.unitPrice),
        unitMrp: Number.isFinite(item.unitMrp)
          ? Math.max(0, item.unitMrp)
          : item.unitPrice,
        requiresPrescription: Boolean(item.requiresPrescription),
      }));
  } catch {
    return [];
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getInventoryForBranch(medicine: Medicine, branchId?: string) {
  if (!branchId) return undefined;
  return medicine.inventory?.find(
    (entry) => String(entry.branch) === String(branchId),
  );
}

function availableFullPacks(medicine: Medicine, branchId?: string): number | null {
  const inventory = getInventoryForBranch(medicine, branchId);
  if (!inventory) return null;
  const divisor = medicine.isDivisible ? Math.max(1, medicine.packSize) : 1;
  return Math.floor(inventory.stockUnits / divisor);
}

/* ================================================================== */
/*  API                                                               */
/* ================================================================== */

class ApiError extends Error {
  status: number;
  details?: FieldErrors;
  requestId?: string;

  constructor(
    status: number,
    message: string,
    details?: FieldErrors,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : (error as Error)?.name === 'AbortError';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('lp_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const timeoutController = new AbortController();
  const timer = window.setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  );
  const callerSignal = options.signal;
  const onCallerAbort = () => timeoutController.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: timeoutController.signal,
    });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (isAbortError(error)) {
      throw new ApiError(0, 'The server took too long to respond.');
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  } finally {
    window.clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }

  const isJson = response.headers
    .get('content-type')
    ?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('lp_token');
    }
    throw new ApiError(
      response.status,
      payload?.message || 'Request failed.',
      payload?.details,
      payload?.requestId,
    );
  }

  return payload as T;
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

async function uploadPrescriptionFile(file: File): Promise<string> {
  const body = new FormData();
  body.append('image', file);

  const data = await api<{ uploadToken: string }>('/api/uploads/prescription', {
    method: 'POST',
    body,
  });

  return data.uploadToken;
}

async function revertPrescription(uploadToken: string) {
  try {
    await api('/api/uploads/prescription/revert', {
      method: 'POST',
      body: JSON.stringify({ uploadToken }),
    });
  } catch {
    // Server-side cleanup jobs should remain a second safety net in production.
  }
}

/* ================================================================== */
/*  Hooks                                                             */
/* ================================================================== */

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

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

function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  panelRef: React.RefObject<T | null>,
) {
  useEffect(() => {
    if (!active) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel?.focus({ preventScroll: true });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, panelRef]);
}

function useOutsideClick<T extends HTMLElement>(
  active: boolean,
  ref: React.RefObject<T | null>,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;

    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    };

    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [active, ref, onOutside]);
}

/* ================================================================== */
/*  Primitive components                                              */
/* ================================================================== */

const LotusMark = memo(function LotusMark({
  size = 22,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 21c-4.5 0-8-2.6-8-5.9 0-1 .4-1.9 1-2.7 1.2 1.4 2.7 2.3 4 2.7-1.4-1.7-2.3-3.9-2.3-6.1 0-1.4.4-2.7 1-3.9 1.4.8 2.6 2 3.4 3.4.8-1.5 2-2.7 3.4-3.4.6 1.2 1 2.5 1 3.9 0 2.2-.9 4.4-2.3 6.1 1.3-.4 2.8-1.3 4-2.7.6.8 1 1.7 1 2.7C20 18.4 16.5 21 12 21Z"
        fill="currentColor"
      />
    </svg>
  );
});

const Sparkline = memo(function Sparkline({
  values,
  tone = '#0B7A6B',
  width = 64,
  height = 22,
}: {
  values: number[];
  tone?: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
});

const Sheet = memo(function Sheet({
  open,
  onClose,
  title,
  icon,
  description,
  children,
  footer,
  variant = 'side',
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'side' | 'center';
  width?: 'sm' | 'md' | 'lg';
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, delta: 0, active: false });

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(timer);
  }, [open]);

  useBodyScrollLock(mounted);
  useEscapeKey(mounted, onClose);
  useFocusTrap(mounted, panelRef);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 640) return;

    drag.current = {
      startY: event.clientY,
      delta: 0,
      active: true,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !panelRef.current) return;

    drag.current.delta = Math.max(0, event.clientY - drag.current.startY);
    panelRef.current.style.transition = 'none';
    panelRef.current.style.transform = `translateY(${drag.current.delta}px)`;
  };

  const handlePointerUp = () => {
    if (!drag.current.active) return;

    drag.current.active = false;

    if (panelRef.current) {
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
    }

    if (drag.current.delta > 110) onClose();
  };

  if (!mounted) return null;

  const widthClass =
    width === 'lg'
      ? 'sm:max-w-[38rem]'
      : width === 'sm'
        ? 'sm:max-w-[24rem]'
        : 'sm:max-w-[29rem]';

  const panelPosition =
    variant === 'side'
      ? `w-full ${widthClass} h-[92vh] sm:h-full rounded-t-[30px] sm:rounded-none sm:rounded-l-[30px]`
      : `w-full ${widthClass} max-h-[92vh] sm:max-h-[88vh] rounded-t-[30px] sm:rounded-[30px]`;

  const hiddenTransform =
    variant === 'side'
      ? 'translate-y-full sm:translate-y-0 sm:translate-x-full'
      : 'translate-y-full sm:translate-y-2 sm:scale-[0.97] sm:opacity-0';

  const shownTransform =
    variant === 'side'
      ? 'translate-y-0 sm:translate-x-0'
      : 'translate-y-0 sm:scale-100 sm:opacity-100';

  return (
    <div
      className={cx(
        'fixed inset-0 z-[80] flex items-end',
        variant === 'side'
          ? 'sm:items-stretch sm:justify-end'
          : 'sm:items-center sm:justify-center sm:p-4',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cx(
          'absolute inset-0 bg-[#07110F]/45 backdrop-blur-[6px] transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          'lp-panel relative flex flex-col overflow-hidden bg-white shadow-[0_-20px_60px_-20px_rgba(7,17,15,0.35)] outline-none sm:shadow-[0_30px_90px_-30px_rgba(7,17,15,0.5)]',
          panelPosition,
          visible ? shownTransform : hiddenTransform,
        )}
      >
        <div
          className="shrink-0 cursor-grab touch-none pb-1 pt-2.5 active:cursor-grabbing sm:hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <span className="mx-auto block h-1.5 w-11 rounded-full bg-[#0B1220]/[0.15]" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-3 sm:pt-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.02em] text-[#0B1220]">
              {icon}
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13px] text-[#0B1220]/55">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="lp-press mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1220]/[0.06] text-[#0B1220]/60 hover:bg-[#0B1220]/10 hover:text-[#0B1220]"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </header>

        <div className="lp-scroll flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {children}
        </div>

        {footer && (
          <footer className="shrink-0 border-t border-[#0B1220]/[0.08] bg-white/90 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
});

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
  hint,
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
  hint?: string;
}) {
  const id = `field-${name}`;

  return (
    <div className="group/field relative w-full">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-[#0B1220]/55 transition-colors group-focus-within/field:text-[#0B7A6B]"
      >
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
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        className={cx(
          'w-full rounded-2xl border bg-[#0B1220]/[0.03] px-4 py-3 text-[15px] text-[#0B1220] outline-none transition-all duration-300 placeholder:text-[#0B1220]/30',
          'focus:bg-white focus:shadow-[0_10px_30px_-16px_rgba(11,122,107,0.55)]',
          error
            ? 'border-rose-300 focus:border-rose-400'
            : 'border-transparent hover:border-[#0B1220]/10 focus:border-[#0B7A6B]',
          readOnly && 'cursor-not-allowed opacity-60',
        )}
      />

      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] text-[#0B1220]/45">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={`${id}-error`}
          className="lp-wobble mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-rose-600"
        >
          <AlertCircle size={13} strokeWidth={2.5} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
});

const Toggle = memo(function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-[14px] text-[#0B1220]">
      <span>{label}</span>

      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="h-[30px] w-[51px] rounded-full bg-[#0B1220]/[0.15] transition-colors duration-300 peer-checked:bg-[#0B7A6B] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0B7A6B]/40 peer-focus-visible:ring-offset-2"
        />
        <span
          aria-hidden="true"
          className="lp-knob pointer-events-none absolute left-[2px] top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(11,18,32,0.3)] peer-checked:translate-x-[21px]"
        />
      </span>
    </label>
  );
});

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        'relative flex w-full rounded-full bg-[#0B1220]/[0.06] p-1',
        size === 'sm' ? 'text-[12px]' : 'text-[13px]',
      )}
    >
      <span
        aria-hidden="true"
        className="lp-seg absolute inset-y-1 left-1 rounded-full bg-white shadow-[0_2px_10px_rgba(11,18,32,0.12)]"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />

      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 font-medium transition-colors duration-200',
            option.value === value
              ? 'text-[#0B1220]'
              : 'text-[#0B1220]/50 hover:text-[#0B1220]/75',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

const SelectShell = memo(function SelectShell({
  id,
  label,
  value,
  onChange,
  children,
  className = '',
  compact,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cx('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          'w-full appearance-none rounded-full border border-[#0B1220]/10 bg-white pr-9 font-semibold text-[#0B1220] outline-none transition-colors hover:bg-[#0B1220]/[0.02] focus:ring-2 focus:ring-[#0B7A6B]/30',
          compact ? 'py-2 pl-3.5 text-[12.5px]' : 'py-2.5 pl-4 text-[13px]',
        )}
      >
        {children}
      </select>

      <ChevronDown
        size={15}
        strokeWidth={2.6}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#0B1220]/35"
        aria-hidden="true"
      />
    </div>
  );
});

const SearchInput = memo(function SearchInput({
  value,
  onChange,
  busy,
  placeholder = 'Search medicines, brands or symptoms',
  id = 'medicine-search',
  label = 'Search medicines',
}: {
  value: string;
  onChange: (value: string) => void;
  busy?: boolean;
  placeholder?: string;
  id?: string;
  label?: string;
}) {
  return (
    <div className="group relative w-full">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <Search
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#0B1220]/35 transition-colors group-focus-within:text-[#0B7A6B]"
        size={17}
        strokeWidth={2.4}
        aria-hidden="true"
      />

      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={60}
        className="w-full rounded-full border border-transparent bg-[#0B1220]/[0.05] py-3 pl-11 pr-11 text-[15px] text-[#0B1220] outline-none transition-all duration-300 placeholder:text-[#0B1220]/35 focus:border-[#0B7A6B]/30 focus:bg-white focus:shadow-[0_12px_36px_-20px_rgba(11,122,107,0.7)]"
      />

      <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
        {busy ? (
          <Loader2
            size={15}
            className="animate-spin text-[#0B7A6B]"
            aria-hidden="true"
          />
        ) : (
          value && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear search"
              className="lp-press flex h-6 w-6 items-center justify-center rounded-full bg-[#0B1220]/10 text-[#0B1220]/60 hover:bg-[#0B1220]/[0.15]"
            >
              <X size={13} strokeWidth={3} />
            </button>
          )
        )}
      </div>
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
    <div className="flex items-center rounded-full bg-[#0B1220]/[0.06] p-1">
      <button
        type="button"
        onClick={onDecrease}
        aria-label={qty === 1 ? `Remove ${label}` : `One less ${label}`}
        className="lp-press flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0B1220] shadow-sm"
      >
        {qty === 1 ? (
          <Trash2 size={13} strokeWidth={2.4} />
        ) : (
          <Minus size={14} strokeWidth={2.6} />
        )}
      </button>

      <span
        key={qty}
        aria-live="polite"
        className="lp-count min-w-[2rem] text-center text-[14px] font-semibold tabular-nums"
      >
        {qty}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={qty >= MAX_QTY_PER_ITEM}
        aria-label={`One more ${label}`}
        className="lp-press flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0B1220] shadow-sm disabled:opacity-40"
      >
        <Plus size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
});

const ProductThumb = memo(function ProductThumb({
  medicine,
  fallbackImageUrl,
  className = '',
}: {
  medicine: Pick<Medicine, 'imageUrl' | 'name'>;
  fallbackImageUrl?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [medicine.imageUrl, fallbackImageUrl]);

  const src = medicine.imageUrl || fallbackImageUrl;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={medicine.name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cx(
          'h-full w-full object-cover transition-all duration-700',
          loaded ? 'scale-100 opacity-100' : 'scale-[1.04] opacity-0',
          className,
        )}
      />
    );
  }

  return (
    <span className={cx('flex items-center justify-center text-[#0B1220]/20', className)}>
      <ImageIcon size={30} strokeWidth={1.5} />
    </span>
  );
});

const OrderStatusPill = memo(function OrderStatusPill({
  status,
}: {
  status: OrderStatus;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold',
        ORDER_STATUS_STYLE[status],
      )}
    >
      {status === 'delivered' && (
        <CheckCircle2 size={13} strokeWidth={2.6} aria-hidden="true" />
      )}
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
});

const BranchPicker = memo(function BranchPicker({
  branches,
  selected,
  distance,
  status,
  errorMessage,
  loading,
  branchError,
  onDetect,
  onSelect,
}: {
  branches: Branch[];
  selected: Branch | null;
  distance: number | null;
  status: LocateStatus;
  errorMessage: string | null;
  loading: boolean;
  branchError: string | null;
  onDetect: () => void;
  onSelect: (branchId: string) => void;
}) {
  if (loading) {
    return (
      <section className="rounded-[26px] bg-[#0B1220]/[0.035] p-5 text-center">
        <Loader2 className="mx-auto animate-spin text-[#0B7A6B]" size={20} />
        <p className="mt-2 text-[13px] text-[#0B1220]/55">
          Loading available branches
        </p>
      </section>
    );
  }

  if (branchError) {
    return (
      <section className="rounded-[26px] bg-rose-50 p-4 text-[13px] font-medium text-rose-700">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{branchError}</span>
        </div>
      </section>
    );
  }

  if (!selected) {
    return (
      <section className="rounded-[26px] bg-amber-50 p-4 text-[13px] font-medium text-amber-700">
        No active branch is accepting orders right now.
      </section>
    );
  }

  return (
    <section className="rounded-[26px] bg-[#0B1220]/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#0B1220]">
          <Store
            size={16}
            strokeWidth={2.4}
            className="text-[#0B7A6B]"
            aria-hidden="true"
          />
          Sending to
        </h3>

        {distance !== null && (
          <span className="rounded-full bg-[#0B7A6B] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white">
            {distance.toFixed(1)} km straight-line
          </span>
        )}
      </div>

      <div className="rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(11,18,32,0.05)]">
        <p className="truncate text-[15px] font-semibold text-[#0B1220]">
          {selected.name}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-[#0B1220]/55">
          {selected.address}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onDetect}
          disabled={status === 'loading'}
          className="lp-press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[13px] font-semibold text-[#0B7A6B] shadow-[0_1px_2px_rgba(11,18,32,0.06)] hover:bg-[#E6F4F1] disabled:opacity-60"
        >
          {status === 'loading' ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Finding you
            </>
          ) : (
            <>
              <Navigation size={15} strokeWidth={2.4} />
              Find nearest
            </>
          )}
        </button>

        <SelectShell
          id="branch-select"
          label="Choose a branch"
          value={selected._id}
          onChange={onSelect}
          className="flex-1"
        >
          {branches.map((branch) => (
            <option key={branch._id} value={branch._id}>
              {branch.name} — {branch.address}
            </option>
          ))}
        </SelectShell>
      </div>

      {status === 'error' && errorMessage && (
        <p className="lp-wobble mt-3 flex items-start gap-1.5 rounded-2xl bg-rose-50 p-3 text-[12px] font-medium text-rose-700">
          <AlertCircle
            size={14}
            strokeWidth={2.5}
            className="mt-px shrink-0"
          />
          {errorMessage}
        </p>
      )}
    </section>
  );
});

const ProductCard = memo(function ProductCard({
  medicine,
  index,
  selectedBranchId,
  cartQuantities,
  fallbackImageUrl,
  onAdd,
  onUpdateQty,
}: {
  medicine: Medicine;
  index: number;
  selectedBranchId?: string;
  cartQuantities: Record<string, number>;
  fallbackImageUrl?: string;
  onAdd: (medicine: Medicine, buyType: BuyType) => void;
  onUpdateQty: (cartItemId: string, delta: number) => void;
}) {
  const [buyType, setBuyType] = useState<BuyType>('full');
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimer.current) window.clearTimeout(addedTimer.current);
    };
  }, []);

  const divisor = Math.max(1, medicine.packSize);
  const isLoose = buyType === 'loose';
  const price = isLoose ? medicine.price / divisor : medicine.price;
  const mrp = isLoose ? medicine.mrp / divisor : medicine.mrp;
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

  const inventory = getInventoryForBranch(medicine, selectedBranchId);
  const inStock = Boolean(
    inventory &&
      inventory.isAvailable &&
      inventory.stockUnits >= (isLoose ? 1 : medicine.isDivisible ? medicine.packSize : 1)
  );

  const stockLabel =
    inventory && inventory.isAvailable
      ? medicine.isDivisible
        ? `${availableFullPacks(medicine, selectedBranchId) ?? 0} pack(s) equivalent`
        : `${inventory.stockUnits} in stock`
      : 'Out of stock';

  const cartItemId = `${medicine._id}-${buyType}`;
  const qtyInCart = cartQuantities[cartItemId] ?? 0;

  const handleAdd = () => {
    onAdd(medicine, buyType);
    setJustAdded(true);
    if (addedTimer.current) window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setJustAdded(false), 900);
  };

  return (
    <article
      className="lp-rise group relative flex h-full flex-col rounded-[26px] bg-white p-2.5 shadow-[0_1px_2px_rgba(11,18,32,0.05)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-30px_rgba(11,18,32,0.45)]"
      style={{ animationDelay: `${Math.min(index, 11) * 30}ms` }}
    >
      <div className="relative mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-[20px] bg-[#0B1220]/[0.035]">
        <ProductThumb
          medicine={medicine}
          fallbackImageUrl={fallbackImageUrl}
          className="transition-transform duration-500 group-hover:scale-105"
        />

        {medicine.tag && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#0B1220] shadow-sm backdrop-blur">
            {medicine.tag}
          </span>
        )}

        {discount > 0 && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#0B7A6B] px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
            −{discount}%
          </span>
        )}

        {medicine.requiresPrescription && (
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-rose-600 shadow-sm backdrop-blur">
            <FileText size={11} strokeWidth={2.5} />
            Prescription
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1.5 pb-1.5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]" title={medicine.name}>
          {medicine.name}
        </h3>
        <p className="mt-1 line-clamp-1 text-[12.5px] text-[#0B1220]/50">{medicine.use}</p>
        <p className={cx('mt-2 text-[11.5px] font-medium', inStock ? 'text-emerald-600' : 'text-rose-500')}>
          {stockLabel}
        </p>

        {medicine.isDivisible && (
          <div className="mt-3">
            <Segmented<BuyType>
              size="sm"
              ariaLabel={`How to buy ${medicine.name}`}
              value={buyType}
              onChange={setBuyType}
              options={[
                { value: 'full', label: `Full ${medicine.packType.toLowerCase()}` },
                { value: 'loose', label: `Single ${medicine.unitType.toLowerCase()}` },
              ]}
            />
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            {discount > 0 && <span className="block text-[12px] tabular-nums text-[#0B1220]/35 line-through">{formatMoney(mrp)}</span>}
            <span className="block text-[17px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{formatMoney(price)}</span>
          </div>

          {qtyInCart > 0 ? (
            <QuantityStepper qty={qtyInCart} label={medicine.name} onDecrease={() => onUpdateQty(cartItemId, -1)} onIncrease={() => onUpdateQty(cartItemId, 1)} />
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={!inStock}
              aria-label={inStock ? `Add ${medicine.name} to cart` : `${medicine.name} is out of stock`}
              className={cx('lp-press flex h-10 w-10 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:bg-[#0B1220]/20', justAdded ? 'bg-[#0B7A6B]' : 'bg-[#0B1220] hover:bg-[#0B7A6B]')}
            >
              {justAdded ? <Check size={18} strokeWidth={3} className="lp-pop" /> : <Plus size={18} strokeWidth={3} />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

const StoreMap = memo(function StoreMap({ branches }: { branches: Branch[] }) {
  const [activeTab, setActiveTab] = useState<string | null>(
    branches[0]?._id || null
  );

  if (!branches || branches.length === 0) return null;

  const activeBranch = branches.find((b) => b._id === activeTab) || branches[0];

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h2 className="text-[24px] font-semibold tracking-[-0.03em] sm:text-[28px]">
          Our Branches in Goregaon, Mumbai
        </h2>
        <p className="mt-2 text-[14px] text-[#0B1220]/60">
          Visit our offline stores for in-person consultation and immediate purchases.
        </p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[32px] border border-[#0B1220]/10 bg-white shadow-sm lg:flex-row">
        {/* Branch List */}
        <div className="flex flex-col border-b border-[#0B1220]/10 bg-[#F8F9FA] lg:w-1/3 lg:border-b-0 lg:border-r">
          {branches.map((branch) => (
            <button
              key={branch._id}
              type="button"
              onClick={() => setActiveTab(branch._id)}
              className={cx(
                'flex flex-col items-start border-b border-[#0B1220]/[0.05] p-5 text-left transition-colors last:border-0 hover:bg-[#E6F4F1]/50',
                activeTab === branch._id ? 'bg-[#E6F4F1]' : 'bg-transparent'
              )}
            >
              <h3 className={cx(
                "text-[16px] font-semibold",
                activeTab === branch._id ? "text-[#0B7A6B]" : "text-[#0B1220]"
              )}>
                {branch.name}
              </h3>
              <p className="mt-1 text-[13px] text-[#0B1220]/60">
                {branch.address}
              </p>
              <div className="mt-3 flex items-center gap-4 text-[12px] font-medium text-[#0B1220]/50">
                <span className="flex items-center gap-1">
                  <Phone size={13} /> {branch.phone}
                </span>
                <span className="flex items-center gap-1">
                  <Navigation size={13} /> {branch.serviceRadiusKm}km delivery
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Google Map Embed */}
        <div className="relative h-[300px] w-full bg-[#E5E7EB] lg:h-[450px] lg:w-2/3">
          {activeBranch && (
            <iframe
              title={`Map to ${activeBranch.name}`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${activeBranch.lat},${activeBranch.lng}&t=m&z=15&output=embed&iwloc=near`}
            />
          )}
        </div>
      </div>
    </section>
  );
});

const DeliveryFields = memo(function DeliveryFields({
  address,
  errors,
  onChange,
  requireArea,
}: {
  address: AddressForm;
  errors: FieldErrors;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  requireArea: boolean;
}) {
  return (
    <section className="space-y-3.5 rounded-[26px] bg-[#0B1220]/[0.035] p-4">
      <h3 className="text-[15px] font-semibold">Where should we deliver?</h3>

      <Field
        name="name"
        label="Full name"
        autoComplete="name"
        value={address.name}
        error={errors.name}
        onChange={onChange}
        maxLength={60}
      />

      <Field
        name="phone"
        label="Mobile number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={address.phone}
        error={errors.phone}
        onChange={onChange}
        maxLength={10}
        hint="Your order confirmation and status updates are sent to this number on WhatsApp."
      />

      {requireArea ? (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            name="houseNo"
            label="House or flat"
            autoComplete="address-line1"
            value={address.houseNo}
            error={errors.houseNo}
            onChange={onChange}
            maxLength={80}
          />
          <Field
            name="area"
            label="Area"
            autoComplete="address-level3"
            value={address.area}
            error={errors.area}
            onChange={onChange}
            maxLength={80}
          />
        </div>
      ) : (
        <Field
          name="houseNo"
          label="Full address"
          autoComplete="street-address"
          value={address.houseNo}
          error={errors.houseNo}
          onChange={onChange}
          maxLength={120}
        />
      )}

      <Field
        name="landmark"
        label="Landmark (optional)"
        value={address.landmark}
        onChange={onChange}
        maxLength={80}
      />
    </section>
  );
});

function PrescriptionFilePicker({
  file,
  previewUrl,
  error,
  onPick,
  onClear,
  inputRef,
}: {
  file: File | null;
  previewUrl: string | null;
  error: string | null;
  onPick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cx(
          'flex w-full flex-col items-center justify-center rounded-[26px] border-2 border-dashed p-7 text-center transition-colors',
          previewUrl
            ? 'border-[#0B7A6B]/40 bg-[#E6F4F1]'
            : 'border-[#0B1220]/[0.12] bg-[#0B1220]/[0.025] hover:border-[#0B7A6B]/50 hover:bg-[#E6F4F1]/60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={onPick}
        />

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Prescription preview"
            className="lp-pop max-h-48 rounded-2xl object-contain shadow-[0_10px_30px_-15px_rgba(11,18,32,0.5)]"
          />
        ) : (
          <>
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#0B7A6B] shadow-sm">
              <ImageIcon size={26} strokeWidth={2} />
            </span>
            <span className="text-[15px] font-semibold">
              Take or choose a prescription photo
            </span>
            <span className="mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-[#0B1220]/55">
              JPG, PNG, WEBP or HEIC up to 5 MB. Keep the prescription readable.
            </span>
          </>
        )}
      </button>

      {previewUrl && (
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl bg-[#0B1220]/[0.035] px-4 py-3 text-[13px]">
          <span className="truncate text-[#0B1220]/65">{file?.name}</span>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 font-semibold text-rose-600 hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      {error && (
        <p className="lp-wobble mt-2.5 flex items-center gap-2 rounded-2xl bg-rose-50 p-3.5 text-[13px] font-medium text-rose-700">
          <AlertCircle size={15} strokeWidth={2.5} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Onboarding & Quick Start Components                               */
/* ================================================================== */

function WelcomeGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="center"
      width="md"
      title="Welcome to Lotus Pharmacy! 👋"
      description="Your neighborhood chemist, now on your phone. Here is how it works:"
    >
      <div className="mt-2 space-y-4">
        <div className="flex gap-4 rounded-2xl bg-[#0B1220]/[0.03] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[18px] shadow-sm">📍</div>
          <div>
            <h4 className="text-[14px] font-semibold text-[#0B1220]">1. Select your branch</h4>
            <p className="mt-1 text-[13px] text-[#0B1220]/60">Pick the nearest store or let us detect your location for quick delivery.</p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl bg-[#0B1220]/[0.03] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[18px] shadow-sm">💊</div>
          <div>
            <h4 className="text-[14px] font-semibold text-[#0B1220]">2. Build your basket</h4>
            <p className="mt-1 text-[13px] text-[#0B1220]/60">Search for medicines, add them to your cart, or simply upload your doctor's prescription.</p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl bg-[#E6F4F1] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[18px] shadow-sm text-[#25D366]"><MessageCircle size={20} /></div>
          <div>
            <h4 className="text-[14px] font-semibold text-[#0A6A5D]">3. WhatsApp Checkout</h4>
            <p className="mt-1 text-[13px] text-[#0A6A5D]/80">Place the order and get instant confirmation, bill details, and tracking on your WhatsApp.</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lp-press mt-6 w-full rounded-2xl bg-[#0B7A6B] py-3.5 text-[15px] font-semibold text-white hover:bg-[#0A6A5D]"
        >
          Got it, let's start!
        </button>
      </div>
    </Sheet>
  );
}

function AdminQuickStart({ 
  branchesCount, 
  medicinesCount, 
  waConnected, 
  onNavigate 
}: { 
  branchesCount: number, 
  medicinesCount: number, 
  waConnected: boolean, 
  onNavigate: (tab: AdminTab) => void 
}) {
  if (branchesCount > 0 && medicinesCount > 0 && waConnected) return null;

  return (
    <div className="mb-6 rounded-3xl bg-gradient-to-br from-[#0B1220] to-[#1a2b4c] p-6 text-white shadow-lg">
      <h2 className="flex items-center gap-2 text-[18px] font-semibold">
        <Sparkles size={18} className="text-amber-400" /> Let's finish setting up your Pharmacy
      </h2>
      <p className="mt-1.5 text-[13.5px] text-white/70">Complete these steps to start accepting orders from customers.</p>
      
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button onClick={() => onNavigate('branches')} className={cx("flex flex-col items-start rounded-2xl p-4 text-left transition-colors", branchesCount > 0 ? "bg-white/10" : "bg-white text-[#0B1220]")}>
          <div className="flex w-full items-center justify-between">
            <Store size={18} className={branchesCount > 0 ? "text-white/50" : "text-[#0B7A6B]"} />
            {branchesCount > 0 && <CheckCircle2 size={16} className="text-emerald-400" />}
          </div>
          <h3 className="mt-3 text-[14px] font-semibold">1. Add a Branch</h3>
          <p className={cx("mt-1 text-[12px]", branchesCount > 0 ? "text-white/50" : "text-[#0B1220]/60")}>{branchesCount > 0 ? `${branchesCount} branch(es) active` : 'Set up your physical store.'}</p>
        </button>

        <button onClick={() => onNavigate('catalogue')} className={cx("flex flex-col items-start rounded-2xl p-4 text-left transition-colors", medicinesCount > 0 ? "bg-white/10" : branchesCount > 0 ? "bg-white text-[#0B1220]" : "bg-white/5 opacity-60")}>
          <div className="flex w-full items-center justify-between">
            <Package size={18} className={medicinesCount > 0 ? "text-white/50" : "text-[#0B7A6B]"} />
            {medicinesCount > 0 && <CheckCircle2 size={16} className="text-emerald-400" />}
          </div>
          <h3 className="mt-3 text-[14px] font-semibold">2. Add Medicines</h3>
          <p className={cx("mt-1 text-[12px]", medicinesCount > 0 ? "text-white/50" : "text-[#0B1220]/60")}>{medicinesCount > 0 ? `${medicinesCount} items in catalog` : 'Add products to inventory.'}</p>
        </button>

        <button onClick={() => onNavigate('whatsapp')} className={cx("flex flex-col items-start rounded-2xl p-4 text-left transition-colors", waConnected ? "bg-white/10" : medicinesCount > 0 ? "bg-white text-[#0B1220]" : "bg-white/5 opacity-60")}>
          <div className="flex w-full items-center justify-between">
            <MessageCircle size={18} className={waConnected ? "text-white/50" : "text-[#25D366]"} />
            {waConnected && <CheckCircle2 size={16} className="text-emerald-400" />}
          </div>
          <h3 className="mt-3 text-[14px] font-semibold">3. Link WhatsApp</h3>
          <p className={cx("mt-1 text-[12px]", waConnected ? "text-white/50" : "text-[#0B1220]/60")}>{waConnected ? 'Gateway connected' : 'Scan QR for order alerts.'}</p>
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Auth + account                                                   */
/* ================================================================== */

function AuthSheet({
  open,
  onClose,
  onAuthenticated,
  branchCount,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
  branchCount: number;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]:
        name === 'phone' ? digitsOnly(value).slice(0, 10) : value,
    }));
    setErrors((prev) =>
      prev[name] ? { ...prev, [name]: undefined } : prev,
    );
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setFormError(null);

    try {
      const path =
        mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? {
              email: form.email.trim(),
              password: form.password,
            }
          : {
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone,
              password: form.password,
            };

      const data = await api<{ user: AuthUser; token: string }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (typeof window !== 'undefined' && data.token) {
        window.localStorage.setItem('lp_token', data.token);
      }

      onAuthenticated(data.user);
    } catch (error) {
      setFormError(errorText(error, 'That did not work. Try again.'));
      if (error instanceof ApiError && error.details) {
        setErrors(error.details);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="center"
      width="sm"
      title={mode === 'login' ? 'Sign in' : 'Create account'}
      description={
        mode === 'login'
          ? 'Your saved delivery details and order history stay with your account.'
          : `One account works across all ${branchCount || 'available'} branch${branchCount === 1 ? '' : 'es'}.`
      }
    >
      <div className="pt-1">
        <Segmented<'login' | 'register'>
          ariaLabel="Sign in or create account"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setErrors({});
            setFormError(null);
          }}
          options={[
            { value: 'login', label: 'Sign in' },
            { value: 'register', label: 'Create account' },
          ]}
        />

        <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
          {mode === 'register' && (
            <Field
              name="name"
              label="Full name"
              autoComplete="name"
              value={form.name}
              error={errors.name}
              onChange={handleChange}
              maxLength={60}
            />
          )}

          <Field
            name="email"
            label="Email"
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
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            value={form.password}
            error={errors.password}
            onChange={handleChange}
            maxLength={72}
            hint={
              mode === 'register' ? 'Use at least 8 characters.' : undefined
            }
          />

          {formError && (
            <p className="lp-wobble flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
              <AlertCircle size={15} strokeWidth={2.5} className="shrink-0" />
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="lp-press mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B1220] py-3.5 text-[15px] font-semibold text-white hover:bg-[#0B7A6B] disabled:opacity-60"
          >
            {busy && <Loader2 size={17} className="animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </Sheet>
  );
}

function AccountSheet({
  open,
  onClose,
  user,
  onUserChange,
  onLogout,
  onAdmin,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
  onLogout: () => void;
  onAdmin: () => void;
  notify: (text: string, tone?: ToastTone) => void;
}) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const defaultAddress = user.addresses?.[0];

  const [profile, setProfile] = useState({
    name: user.name,
    phone: user.phone,
    houseNo: defaultAddress?.houseNo || '',
    area: defaultAddress?.area || '',
    landmark: defaultAddress?.landmark || '',
  });

  useEffect(() => {
    if (!open) return;

    setLoadingOrders(true);
    api<{ orders: OrderRecord[] }>('/api/orders/mine')
      .then((data) => setOrders(data.orders))
      .catch((error) =>
        notify(errorText(error, 'Order history could not be loaded.'), 'error'),
      )
      .finally(() => setLoadingOrders(false));
  }, [open, notify]);

  const updateField = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setProfile((prev) => ({
      ...prev,
      [name]:
        name === 'phone' ? digitsOnly(value).slice(0, 10) : value,
    }));
  };

  const saveProfile = async () => {
    const errors = validateAddress(
      {
        name: profile.name,
        phone: profile.phone,
        houseNo: profile.houseNo,
        area: profile.area,
        landmark: profile.landmark,
      },
      false,
    );

    if (errors.name || errors.phone) {
      notify(errors.name || errors.phone || 'Check your profile.', 'error');
      return;
    }

    setSavingProfile(true);

    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profile.name.trim(),
          phone: profile.phone,
          ...(profile.houseNo.trim().length >= 3
            ? {
                defaultAddress: {
                  houseNo: profile.houseNo.trim(),
                  area: profile.area.trim(),
                  landmark: profile.landmark.trim(),
                },
              }
            : {}),
        }),
      });

      onUserChange(data.user);
      notify('Profile saved.');
    } catch (error) {
      notify(errorText(error, 'Profile could not be saved.'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your account"
      description={user.email}
      icon={<UserRound size={20} className="text-[#0B7A6B]" />}
      width="lg"
    >
      <div className="space-y-6">
        <section className="rounded-[26px] bg-[#0B1220]/[0.035] p-4">
          <h3 className="mb-4 text-[15px] font-semibold">Profile & saved address</h3>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              name="name"
              label="Full name"
              value={profile.name}
              onChange={updateField}
              maxLength={60}
            />
            <Field
              name="phone"
              label="Mobile"
              inputMode="numeric"
              value={profile.phone}
              onChange={updateField}
              maxLength={10}
            />
            <Field
              name="houseNo"
              label="House / flat"
              value={profile.houseNo}
              onChange={updateField}
              maxLength={120}
            />
            <Field
              name="area"
              label="Area"
              value={profile.area}
              onChange={updateField}
              maxLength={120}
            />
            <div className="sm:col-span-2">
              <Field
                name="landmark"
                label="Landmark"
                value={profile.landmark}
                onChange={updateField}
                maxLength={120}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={savingProfile}
            onClick={saveProfile}
            className="lp-press mt-4 flex items-center gap-2 rounded-2xl bg-[#0B7A6B] px-5 py-3 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {savingProfile && <Loader2 size={15} className="animate-spin" />}
            Save details
          </button>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold">Recent orders</h3>
            {loadingOrders && (
              <Loader2 size={16} className="animate-spin text-[#0B7A6B]" />
            )}
          </div>

          {orders.length === 0 && !loadingOrders ? (
            <div className="rounded-[24px] bg-[#0B1220]/[0.035] p-8 text-center">
              <Receipt
                size={28}
                className="mx-auto mb-3 text-[#0B1220]/25"
              />
              <p className="text-[14px] font-semibold">No orders yet</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {orders.map((order) => (
                <li
                  key={order._id}
                  className="rounded-[22px] border border-[#0B1220]/[0.06] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13.5px] font-semibold tabular-nums">
                        {order.orderNumber}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#0B1220]/45">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusPill status={order.status} />
                  </div>

                  {order.items?.length > 0 && (
                    <p className="mt-3 line-clamp-2 text-[12.5px] text-[#0B1220]/60">
                      {order.items
                        .map((item) => `${item.displayName} × ${item.qty}`)
                        .join(' · ')}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[12px] text-[#0B1220]/45">
                      {order.type === 'prescription'
                        ? 'Prescription order'
                        : `${order.items?.length || 0} line item(s)`}
                    </span>
                    <span className="text-[14px] font-semibold tabular-nums">
                      {formatMoney(order.estimatedTotal)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-3 border-t border-[#0B1220]/[0.07] pt-5">
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={onAdmin}
              className="lp-press flex items-center gap-2 rounded-full bg-[#0B1220] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              <LayoutDashboard size={15} />
              Admin console
            </button>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="lp-press flex items-center gap-2 rounded-full bg-rose-50 px-5 py-2.5 text-[13px] font-semibold text-rose-600"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ================================================================== */
/*  Admin forms                                                       */
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
  imageUrl: '',
  imagePublicId: '',
  tag: '',
  isActive: true,
};

function MedicineForm({
  initial,
  categories,
  branches,
  globalSettings,
  onCancel,
  onSaved,
  onError,
}: {
  initial: Medicine | null;
  categories: string[];
  branches: Branch[];
  globalSettings?: GlobalSettings | null;
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
          imageUrl: initial.imageUrl,
          imagePublicId: initial.imagePublicId,
          tag: initial.tag,
          isActive: initial.isActive,
        }
      : { ...EMPTY_MEDICINE },
  );

  const [inventory, setInventory] = useState(() =>
    branches.map((branch) => {
      const current = initial?.inventory?.find(
        (row) => String(row.branch) === String(branch._id),
      );

      return {
        branchId: branch._id,
        stockUnits: String(current?.stockUnits ?? 0),
        lowStockAt: String(current?.lowStockAt ?? 5),
        isAvailable: current?.isAvailable ?? true,
      };
    }),
  );

  const [newUploads, setNewUploads] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const setValue = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) =>
      prev[key] ? { ...prev, [key]: undefined } : prev,
    );
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) =>
    setValue(event.target.name, event.target.value);

  const deleteProductUpload = async (publicId: string) => {
    try {
      await api('/api/uploads/product/revert', {
        method: 'DELETE',
        body: JSON.stringify({ publicId }),
      });
    } catch {
      // Best effort cleanup.
    }
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      onError('Images must be JPG, PNG, WEBP or HEIC.');
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
      const data = await api<{ url: string; publicId: string }>(
        '/api/uploads/product',
        {
          method: 'POST',
          body,
        },
      );

      const previousUnsaved = newUploads.find(
        (publicId) => publicId === form.imagePublicId,
      );

      if (previousUnsaved) {
        await deleteProductUpload(previousUnsaved);
        setNewUploads((prev) =>
          prev.filter((publicId) => publicId !== previousUnsaved),
        );
      }

      setForm((prev) => ({
        ...prev,
        imageUrl: data.url,
        imagePublicId: data.publicId,
      }));
      setNewUploads((prev) => [...prev, data.publicId]);
    } catch (error) {
      onError(errorText(error, 'The upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const removeCurrentImage = async () => {
    const unsaved = newUploads.includes(form.imagePublicId);

    if (unsaved && form.imagePublicId) {
      await deleteProductUpload(form.imagePublicId);
      setNewUploads((prev) =>
        prev.filter((publicId) => publicId !== form.imagePublicId),
      );
    }

    setForm((prev) => ({
      ...prev,
      imageUrl: '',
      imagePublicId: '',
    }));
  };

  const handleCancel = async () => {
    await Promise.all(newUploads.map((id) => deleteProductUpload(id)));
    onCancel();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const price = Number(form.price);
    const mrp = Number(form.mrp);
    const packSize = Number(form.packSize);
    const nextErrors: FieldErrors = {};

    if (!form.name.trim()) nextErrors.name = 'Give the medicine a name.';
    if (form.use.trim().length < 3) {
      nextErrors.use = 'Describe what it treats.';
    }
    if (!form.category.trim()) {
      nextErrors.category = 'Pick or type a category.';
    }
    if (!Number.isFinite(price) || price <= 0) {
      nextErrors.price = 'Enter a selling price.';
    }
    if (!Number.isFinite(mrp) || mrp < price) {
      nextErrors.mrp = 'MRP cannot be below the selling price.';
    }
    if (
      form.isDivisible &&
      (!Number.isFinite(packSize) || packSize < 2)
    ) {
      nextErrors.packSize = 'A loose-sale pack needs at least 2 units.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);

    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        use: form.use.trim(),
        category: form.category.trim(),
        price,
        mrp,
        packSize: form.isDivisible ? Math.round(packSize) : 1,
        inventory: inventory.map((row) => ({
          branchId: row.branchId,
          stockUnits: Math.max(0, Math.round(Number(row.stockUnits) || 0)),
          lowStockAt: Math.max(0, Math.round(Number(row.lowStockAt) || 0)),
          isAvailable: row.isAvailable,
        })),
      };

      const path = initial
        ? `/api/medicines/${initial._id}`
        : '/api/medicines';

      const data = await api<{ medicine: Medicine }>(path, {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      setNewUploads([]);
      onSaved(data.medicine);
    } catch (error) {
      onError(errorText(error, 'The medicine could not be saved.'));
      if (error instanceof ApiError && error.details) {
        setErrors(error.details);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-[28px] border border-[#0B1220]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.06)] md:p-8"
      noValidate
    >
      <h3 className="text-[20px] font-semibold tracking-[-0.02em]">
        {initial ? 'Edit medicine' : 'Add medicine'}
      </h3>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="shrink-0">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-[24px] bg-[#0B1220]/[0.04] border border-[#0B1220]/[0.08]">
            {form.imageUrl || globalSettings?.fallbackImageUrl ? (
              <img
                src={form.imageUrl || globalSettings?.fallbackImageUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="text-[#0B1220]/20" size={32} />
            )}
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={handleImageUpload}
          />

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            className="lp-press mt-3 flex w-32 items-center justify-center gap-2 rounded-2xl bg-[#0B1220] py-2.5 text-[13px] font-semibold text-white hover:bg-[#0B7A6B] disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UploadCloud size={14} />
            )}
            {form.imageUrl ? 'Replace' : 'Upload'}
          </button>

          {form.imageUrl && (
            <button
              type="button"
              onClick={removeCurrentImage}
              className="mt-2 w-32 text-center text-[12px] font-medium text-rose-600 hover:underline"
            >
              Remove image
            </button>
          )}
        </div>

        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              name="name"
              label="Medicine Name"
              value={form.name}
              error={errors.name}
              onChange={handleInput}
              maxLength={120}
              placeholder="e.g., Paracetamol 500mg, Crocin Advance"
            />
          </div>

          <div className="sm:col-span-2">
            <Field
              name="use"
              label="What does it treat? (Symptoms/Use)"
              value={form.use}
              error={errors.use}
              onChange={handleInput}
              maxLength={200}
              placeholder="e.g., Relieves fever, headache, and body pain"
              hint="Helps customers find medicines by searching symptoms."
            />
          </div>

          <div>
            <label
              htmlFor="field-category"
              className="mb-1.5 block text-[13px] font-medium text-[#0B1220]/55"
            >
              Category
            </label>
            <input
              id="field-category"
              name="category"
              list="category-options"
              value={form.category}
              onChange={handleInput}
              maxLength={60}
              className={cx(
                'w-full rounded-2xl border bg-[#0B1220]/[0.03] px-4 py-3 text-[15px] outline-none focus:bg-white',
                errors.category
                  ? 'border-rose-300'
                  : 'border-transparent focus:border-[#0B7A6B]',
              )}
            />
            <datalist id="category-options">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {errors.category && (
              <p className="mt-1.5 text-[12px] font-medium text-rose-600">
                {errors.category}
              </p>
            )}
          </div>

          <Field
            name="tag"
            label="Highlight Badge (optional)"
            value={form.tag}
            onChange={handleInput}
            maxLength={30}
            placeholder="e.g., Bestseller, 10% OFF"
            hint="Appears as a small badge on the product image."
          />

          <Field
            name="price"
            label="Your Selling Price (₹)"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={form.price}
            error={errors.price}
            onChange={handleInput}
          />

          <Field
            name="mrp"
            label="Maximum Retail Price - MRP (₹)"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={form.mrp}
            error={errors.mrp}
            onChange={handleInput}
            hint="Discount is auto-calculated if MRP is higher than Selling Price."
          />

          <Field
            name="packType"
            label="Packaging Type"
            value={form.packType}
            onChange={handleInput}
            maxLength={30}
            placeholder="e.g., Strip, Bottle, Box, Tube"
          />

          <Field
            name="unitType"
            label="Single Unit Type"
            value={form.unitType}
            onChange={handleInput}
            maxLength={30}
            placeholder="e.g., Tablet, Capsule, ml, gm"
          />

          <Field
            name="packSize"
            label="Total units in one pack"
            type="number"
            inputMode="numeric"
            value={form.packSize}
            error={errors.packSize}
            onChange={handleInput}
            hint="e.g., If a strip has 10 tablets, enter 10."
          />
        </div>
      </div>

      <div className="space-y-4 rounded-[24px] bg-[#0B1220]/[0.035] p-5">
        <Toggle
          label="Can be sold loose"
          checked={form.isDivisible}
          onChange={(next) => setValue('isDivisible', next)}
        />
        <Toggle
          label="Prescription required"
          checked={form.requiresPrescription}
          onChange={(next) => setValue('requiresPrescription', next)}
        />
        <Toggle
          label="Visible in the store"
          checked={form.isActive}
          onChange={(next) => setValue('isActive', next)}
        />
      </div>

      <section>
        <div className="mb-3">
          <h4 className="text-[15px] font-semibold">Branch inventory</h4>
          <p className="mt-1 text-[12.5px] text-[#0B1220]/50">
            Stock units mean smallest saleable units. For a divisible strip of
            10 tablets, one full strip consumes 10 stock units.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {inventory.map((row, index) => {
            const branch = branches.find(
              (entry) => entry._id === row.branchId,
            );

            return (
              <div
                key={row.branchId}
                className="rounded-[22px] border border-[#0B1220]/[0.07] p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13.5px] font-semibold">
                      {branch?.shortName || branch?.name || 'Branch'}
                    </p>
                    <p className="text-[11.5px] text-[#0B1220]/45">
                      {branch?.address}
                    </p>
                  </div>
                  <Toggle
                    label="Available"
                    checked={row.isAvailable}
                    onChange={(next) =>
                      setInventory((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, isAvailable: next }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field
                    name={`stock-${row.branchId}`}
                    label="Stock units"
                    type="number"
                    inputMode="numeric"
                    value={row.stockUnits}
                    onChange={(event) =>
                      setInventory((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, stockUnits: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Field
                    name={`low-${row.branchId}`}
                    label="Low-stock alert at"
                    type="number"
                    inputMode="numeric"
                    value={row.lowStockAt}
                    onChange={(event) =>
                      setInventory((prev) =>
                        prev.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, lowStockAt: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="lp-press flex items-center gap-2 rounded-2xl bg-[#0B7A6B] px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {initial ? 'Save changes' : 'Add medicine'}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          className="lp-press rounded-2xl bg-[#0B1220]/[0.06] px-6 py-3 text-[14px] font-semibold text-[#0B1220]/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

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
    serviceRadiusKm:
      branch?.serviceRadiusKm !== undefined
        ? String(branch.serviceRadiusKm)
        : '8',
    open24h: branch?.open24h ?? true,
    isActive: branch?.isActive ?? true,
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const handleInput = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]:
        name === 'phone'
          ? digitsOnly(value).slice(0, 15)
          : value,
    }));

    setErrors((prev) =>
      prev[name] ? { ...prev, [name]: undefined } : prev,
    );
  };

  const handleAutoLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onError('This browser cannot share a location.');
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }));
        setErrors((prev) => ({
          ...prev,
          lat: undefined,
          lng: undefined,
        }));
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        onError(geolocationMessage(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const serviceRadiusKm = Number(form.serviceRadiusKm);
    const nextErrors: FieldErrors = {};

    if (!form.name.trim()) nextErrors.name = 'Give the branch a name.';
    if (digitsOnly(form.phone).length < 10) {
      nextErrors.phone = 'Enter the WhatsApp number with country code.';
    }
    if (!form.address.trim()) {
      nextErrors.address = 'Enter a short area label.';
    }
    if (form.fullAddress.trim().length < 10) {
      nextErrors.fullAddress = 'Enter the full address.';
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      nextErrors.lat = 'Latitude must be between -90 and 90.';
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      nextErrors.lng = 'Longitude must be between -180 and 180.';
    }
    if (
      !Number.isFinite(serviceRadiusKm) ||
      serviceRadiusKm < 0.5 ||
      serviceRadiusKm > 50
    ) {
      nextErrors.serviceRadiusKm = 'Use a radius from 0.5 to 50 km.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);

    try {
      const payload = {
        ...form,
        lat,
        lng,
        serviceRadiusKm,
      };

      const data = await api<{ branch: Branch }>(
        branch ? `/api/branches/${branch._id}` : '/api/branches',
        {
          method: branch ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );

      onSaved(data.branch);
    } catch (error) {
      onError(errorText(error, 'The branch could not be saved.'));
      if (error instanceof ApiError && error.details) {
        setErrors(error.details);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-[28px] border border-[#0B1220]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.06)] md:p-8"
      noValidate
    >
      <h3 className="text-[20px] font-semibold tracking-[-0.02em]">
        {branch ? 'Edit branch' : 'Add branch'}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="name"
          label="Branch Official Name"
          value={form.name}
          error={errors.name}
          onChange={handleInput}
          maxLength={80}
          placeholder="e.g., Lotus Pharmacy, Malad East"
          hint="Customers will see this name on their bill."
        />

        <Field
          name="shortName"
          label="Short Name (For SMS/WA)"
          value={form.shortName}
          onChange={handleInput}
          maxLength={30}
          placeholder="e.g., Malad East"
          hint="Keeps WhatsApp messages clean and short."
        />

        <Field
          name="phone"
          label="WhatsApp Business Number"
          inputMode="numeric"
          value={form.phone}
          error={errors.phone}
          onChange={handleInput}
          maxLength={15}
          placeholder="e.g., 919876543210"
          hint="Include country code (91). Customers will reply to this number."
        />

        <Field
          name="address"
          label="Short Area Label"
          value={form.address}
          error={errors.address}
          onChange={handleInput}
          maxLength={120}
          placeholder="e.g., Near Station, Malad West"
          hint="Quick reference for customers selecting a store."
        />

        <div className="sm:col-span-2">
          <label
            htmlFor="field-fullAddress"
            className="mb-1.5 block text-[13px] font-medium text-[#0B1220]/55"
          >
            Complete Postal Address
          </label>
          <textarea
            id="field-fullAddress"
            name="fullAddress"
            rows={2}
            value={form.fullAddress}
            onChange={handleInput}
            maxLength={300}
            placeholder="e.g., Shop No 4, Ground Floor, XYZ Building, SV Road..."
            className={cx(
              'w-full rounded-2xl border bg-[#0B1220]/[0.03] px-4 py-3 text-[15px] outline-none focus:bg-white',
              errors.fullAddress
                ? 'border-rose-300'
                : 'border-transparent focus:border-[#0B7A6B]',
            )}
          />
          <p className="mt-1.5 text-[12px] text-[#0B1220]/45">Used for maps and detailed store info.</p>
        </div>

        <div className="rounded-[24px] bg-[#E6F4F1] p-5 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              <MapIcon size={16} className="text-[#0B7A6B]" />
              Delivery geography
            </span>

            <button
              type="button"
              onClick={handleAutoLocation}
              disabled={locating}
              className="lp-press flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0B7A6B] disabled:opacity-60"
            >
              {locating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Navigation size={14} />
              )}
              Use this device
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field
              name="lat"
              label="Latitude"
              type="number"
              step="any"
              inputMode="decimal"
              value={form.lat}
              error={errors.lat}
              onChange={handleInput}
            />
            <Field
              name="lng"
              label="Longitude"
              type="number"
              step="any"
              inputMode="decimal"
              value={form.lng}
              error={errors.lng}
              onChange={handleInput}
            />
            <Field
              name="serviceRadiusKm"
              label="Service radius (km)"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={form.serviceRadiusKm}
              error={errors.serviceRadiusKm}
              onChange={handleInput}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-[24px] bg-[#0B1220]/[0.035] p-5">
        <Toggle
          label="Open 24 hours"
          checked={form.open24h}
          onChange={(next) =>
            setForm((prev) => ({ ...prev, open24h: next }))
          }
        />
        <Toggle
          label="Accepting orders"
          checked={form.isActive}
          onChange={(next) =>
            setForm((prev) => ({ ...prev, isActive: next }))
          }
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="lp-press flex items-center gap-2 rounded-2xl bg-[#0B7A6B] px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Save branch
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="lp-press rounded-2xl bg-[#0B1220]/[0.06] px-6 py-3 text-[14px] font-semibold text-[#0B1220]/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ================================================================== */
/*  Admin                                                             */
/* ================================================================== */

const StatCard = memo(function StatCard({
  label,
  value,
  icon,
  iconClass,
  delta,
  series,
  seriesTone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClass: string;
  delta?: number;
  series?: number[];
  seriesTone?: string;
}) {
  const hasDelta = typeof delta === 'number';
  const positive = (delta ?? 0) >= 0;

  return (
    <div className="flex flex-col justify-between rounded-3xl border border-[#0B1220]/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(11,18,32,0.05)]">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={cx(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            iconClass,
          )}
        >
          {icon}
        </span>
        <span className="text-[13.5px] font-medium text-[#0B1220]/55">
          {label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {value}
          </p>

          {hasDelta && (
            <p className="mt-2 text-[12px] text-[#0B1220]/45">
              <span
                className={cx(
                  'font-semibold',
                  positive ? 'text-emerald-600' : 'text-rose-500',
                )}
              >
                {positive ? '↑' : '↓'} {Math.abs(delta as number)}%
              </span>{' '}
              vs yesterday
            </p>
          )}
        </div>

        {series && series.length > 1 && (
          <Sparkline values={series} tone={seriesTone} />
        )}
      </div>
    </div>
  );
});

function OrderDetailSheet({
  order,
  onClose,
  onStatusChange,
  onMessageCustomer,
  onResendNotification,
  notify,
}: {
  order: OrderRecord | null;
  onClose: () => void;
  onStatusChange: (order: OrderRecord, status: OrderStatus) => void;
  onMessageCustomer: (order: OrderRecord) => void;
  onResendNotification: (order: OrderRecord) => void;
  notify: (text: string, tone?: ToastTone) => void;
}) {
  const [openingPrescription, setOpeningPrescription] = useState(false);

  if (!order) return null;

  const nextStatuses = ORDER_TRANSITIONS[order.status];

  const openPrescription = async () => {
    setOpeningPrescription(true);

    try {
      const data = await api<{ url: string }>(
        `/api/orders/${order._id}/prescription`,
      );
      const opened = window.open(data.url, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.href = data.url;
    } catch (error) {
      notify(errorText(error, 'Prescription could not be opened.'), 'error');
    } finally {
      setOpeningPrescription(false);
    }
  };

  return (
    <Sheet
      open={Boolean(order)}
      onClose={onClose}
      title={order.orderNumber}
      description={formatDate(order.createdAt)}
      icon={<Receipt size={20} className="text-[#0B7A6B]" />}
      width="lg"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusPill status={order.status} />
          <span className="rounded-full bg-[#0B1220]/[0.05] px-3 py-1 text-[12px] font-medium text-[#0B1220]/55">
            {order.branch?.shortName || order.branch?.name || 'Branch'}
          </span>
        </div>

        <section className="rounded-[24px] bg-[#0B1220]/[0.035] p-4">
          <h3 className="text-[14px] font-semibold">{order.customer.name}</h3>
          <a
            href={`tel:+91${digitsOnly(order.customer.phone)}`}
            className="mt-1 inline-block text-[13px] font-semibold text-[#0B7A6B]"
          >
            +91 {order.customer.phone}
          </a>
          <p className="mt-2 text-[13px] leading-relaxed text-[#0B1220]/65">
            {order.customer.houseNo}
            {order.customer.area ? `, ${order.customer.area}` : ''}
            {order.customer.landmark
              ? `, near ${order.customer.landmark}`
              : ''}
          </p>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">
              {order.type === 'prescription'
                ? 'Prescription request'
                : 'Order items'}
            </h3>
            <span className="text-[16px] font-semibold tabular-nums">
              {formatMoney(order.estimatedTotal)}
            </span>
          </div>

          {order.items?.length ? (
            <ul className="space-y-2">
              {order.items.map((item, index) => (
                <li
                  key={`${item.name}-${index}`}
                  className="rounded-[20px] border border-[#0B1220]/[0.06] p-3.5"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-[13.5px] font-semibold">
                        {item.displayName}
                      </p>
                      <p className="mt-1 text-[12px] text-[#0B1220]/50">
                        {item.qty} × {formatMoney(item.unitPrice)}
                        {item.requiresPrescription ? ' · Rx' : ''}
                      </p>
                    </div>
                    <span className="text-[13.5px] font-semibold tabular-nums">
                      {formatMoney(item.lineTotal)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[20px] bg-[#0B1220]/[0.035] p-4 text-[13px] text-[#0B1220]/55">
              The pharmacist will price this order after reviewing the
              prescription.
            </p>
          )}
        </section>

        {order.hasPrescription && (
          <button
            type="button"
            onClick={openPrescription}
            disabled={openingPrescription}
            className="lp-press flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E6F4F1] py-3.5 text-[13.5px] font-semibold text-[#0B7A6B] disabled:opacity-60"
          >
            {openingPrescription ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            Open private prescription
          </button>
        )}

        {order.statusHistory?.length ? (
          <section>
            <h3 className="mb-3 text-[15px] font-semibold">Timeline</h3>
            <ol className="space-y-2.5">
              {order.statusHistory.map((entry, index) => (
                <li
                  key={`${entry.status}-${entry.at}-${index}`}
                  className="flex items-start gap-3"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0B7A6B]" />
                  <div>
                    <p className="text-[13px] font-semibold">
                      {ORDER_STATUS_LABEL[entry.status]}
                    </p>
                    <p className="text-[11.5px] text-[#0B1220]/45">
                      {formatDate(entry.at)}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onMessageCustomer(order)}
            className="lp-press flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3.5 text-[13.5px] font-semibold text-white"
          >
            <MessageCircle size={16} />
            WhatsApp customer
          </button>

          <button
            type="button"
            onClick={() => onResendNotification(order)}
            className="lp-press flex items-center justify-center gap-2 rounded-2xl bg-[#0B1220]/[0.06] py-3.5 text-[13.5px] font-semibold text-[#0B1220] hover:bg-[#0B1220]/10"
          >
            <RefreshCw size={16} />
            Resend Notification
          </button>

          {nextStatuses.length > 0 && (
            <div className="sm:col-span-2 mt-2">
              <SelectShell
                id={`detail-status-${order._id}`}
                label="Move order to"
                value={order.status}
                onChange={(value) =>
                  onStatusChange(order, value as OrderStatus)
                }
              >
                <option value={order.status}>
                  {ORDER_STATUS_LABEL[order.status]}
                </option>
                {nextStatuses.map((status) => (
                  <option key={status} value={status}>
                    Move to {ORDER_STATUS_LABEL[status]}
                  </option>
                ))}
              </SelectShell>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function AdminPanel({
  user,
  branches,
  globalSettings,
  onSettingsChange,
  onBranchesChange,
  onBackToStore,
  onLogout,
  notify,
}: {
  user: AuthUser;
  branches: Branch[];
  globalSettings: GlobalSettings | null;
  onSettingsChange: (settings: GlobalSettings) => void;
  onBranchesChange: (branches: Branch[]) => void;
  onBackToStore: () => void;
  onLogout: () => void;
  notify: (text: string, tone?: ToastTone) => void;
}) {
  const [tab, setTab] = useState<AdminTab>('orders');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPages, setOrdersPages] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [rangeFilter, setRangeFilter] = useState<OrderRange>('today');
  const [orderSearch, setOrderSearch] = useState('');
  const debouncedOrderSearch = useDebouncedValue(
    orderSearch.trim(),
    SEARCH_DEBOUNCE_MS,
  );

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medicinesLoading, setMedicinesLoading] = useState(false);
  const [hasMoreMedicines, setHasMoreMedicines] = useState(false);
  const [medicineSearch, setMedicineSearch] = useState('');
  const debouncedMedicineSearch = useDebouncedValue(
    medicineSearch.trim(),
    SEARCH_DEBOUNCE_MS,
  );
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(
    null,
  );
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const medicinePage = useRef(1);

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);

  // WhatsApp Gateway States
  const [waSession, setWaSession] = useState<WhatsAppSession | null>(null);
  const [waPendingCount, setWaPendingCount] = useState<number>(0);
  const [waLoading, setWaLoading] = useState(false);
  const [waTestPhone, setWaTestPhone] = useState('');
  const [waProcessing, setWaProcessing] = useState(false);

  // Settings States
  const [settingsLoading, setSettingsLoading] = useState(false);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const handleFallbackUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setSettingsLoading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      
      const uploadData = await api<{ url: string; publicId: string }>('/api/uploads/product', { method: 'POST', body });

      const settingsData = await api<{ setting: GlobalSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ fallbackImageUrl: uploadData.url, fallbackImagePublicId: uploadData.publicId })
      });
      
      onSettingsChange(settingsData.setting);
      notify('Fallback image updated successfully!');
    } catch (error) {
      notify(errorText(error, 'Failed to upload fallback image.'), 'error');
    } finally {
      setSettingsLoading(false);
      if (fallbackInputRef.current) fallbackInputRef.current.value = '';
    }
  };

  const removeFallbackImage = async () => {
    setSettingsLoading(true);
    try {
      const settingsData = await api<{ setting: GlobalSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ fallbackImageUrl: '', fallbackImagePublicId: '' })
      });
      onSettingsChange(settingsData.setting);
      notify('Fallback image removed.');
    } catch (error) {
      notify(errorText(error, 'Failed to remove image.'), 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  useOutsideClick(menuOpen, menuRef, () => setMenuOpen(false));
  useEscapeKey(menuOpen, () => setMenuOpen(false));

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          medicines
            .map((medicine) => medicine.category)
            .filter(Boolean),
        ),
      ).sort(),
    [medicines],
  );

  const loadStats = useCallback(async () => {
    try {
      setStats(await api<AdminStats>('/api/admin/stats'));
    } catch {
      // Console remains usable if summary fails.
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(ordersPage),
        limit: String(ADMIN_ORDERS_PAGE_SIZE),
        range: rangeFilter,
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      if (debouncedOrderSearch) {
        params.set('search', debouncedOrderSearch);
      }

      const data = await api<{
        orders: OrderRecord[];
        total: number;
        pages: number;
      }>(`/api/orders?${params.toString()}`);

      setOrders(data.orders);
      setOrdersTotal(data.total);
      setOrdersPages(data.pages);
    } catch (error) {
      notify(errorText(error, 'Orders could not be loaded.'), 'error');
    } finally {
      setOrdersLoading(false);
    }
  }, [
    debouncedOrderSearch,
    notify,
    ordersPage,
    rangeFilter,
    statusFilter,
  ]);

  const loadMedicines = useCallback(
    async (mode: 'reset' | 'more') => {
      setMedicinesLoading(true);
      const page =
        mode === 'reset' ? 1 : medicinePage.current + 1;

      try {
        const params = new URLSearchParams({
          all: 'true',
          page: String(page),
          limit: String(ADMIN_CATALOGUE_PAGE_SIZE),
        });

        if (debouncedMedicineSearch) {
          params.set('search', debouncedMedicineSearch);
        }

        const data = await api<{
          items: Medicine[];
          pages: number;
        }>(`/api/medicines?${params.toString()}`);

        medicinePage.current = page;
        setMedicines((prev) =>
          mode === 'reset' ? data.items : [...prev, ...data.items],
        );
        setHasMoreMedicines(page < (data.pages || 1));
      } catch (error) {
        notify(
          errorText(error, 'The catalogue could not be loaded.'),
          'error',
        );
      } finally {
        setMedicinesLoading(false);
      }
    },
    [debouncedMedicineSearch, notify],
  );

  const loadWaStatus = useCallback(async () => {
    setWaLoading(true);
    try {
      const data = await api<{ session: WhatsAppSession; pendingCount: number }>('/api/admin/whatsapp/status');
      setWaSession(data.session);
      setWaPendingCount(data.pendingCount);
    } catch (error) {
      notify(errorText(error, 'WhatsApp status could not be fetched.'), 'error');
    } finally {
      setWaLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab === 'orders') loadOrders();
  }, [tab, loadOrders]);

  useEffect(() => {
    if (tab === 'catalogue') loadMedicines('reset');
  }, [tab, loadMedicines]);

  useEffect(() => {
    if (tab === 'whatsapp') {
      loadWaStatus();
    }
  }, [tab, loadWaStatus]);

  // Polling WhatsApp status when connecting or waiting for QR code
  useEffect(() => {
    if (tab !== 'whatsapp' || !waSession) return;
    
    let interval: number;
    if (waSession.state === 'qr' || waSession.state === 'connecting') {
      interval = window.setInterval(() => {
        loadWaStatus();
      }, 5000);
    }
    return () => window.clearInterval(interval);
  }, [tab, waSession?.state, loadWaStatus]);

  useEffect(() => {
    setOrdersPage(1);
  }, [statusFilter, rangeFilter, debouncedOrderSearch]);

  const changeOrderStatus = async (
    order: OrderRecord,
    status: OrderStatus,
  ) => {
    if (status === order.status) return;

    const previous = orders;

    setOrders((prev) =>
      prev.map((entry) =>
        entry._id === order._id
          ? { ...entry, status }
          : entry,
      ),
    );

    if (selectedOrder?._id === order._id) {
      setSelectedOrder((prev) =>
        prev ? { ...prev, status } : prev,
      );
    }

    try {
      const data = await api<{ order: OrderRecord }>(
        `/api/orders/${order._id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      );

      setOrders((prev) =>
        prev.map((entry) =>
          entry._id === order._id ? data.order : entry,
        ),
      );

      if (selectedOrder?._id === order._id) {
        setSelectedOrder(data.order);
      }

      loadStats();
    } catch (error) {
      setOrders(previous);
      setSelectedOrder((prev) =>
        prev?._id === order._id ? order : prev,
      );
      notify(
        errorText(error, 'The order could not be updated.'),
        'error',
      );
    }
  };

  const setMedicineVisibility = async (
    medicine: Medicine,
    isActive: boolean,
  ) => {
    const previous = medicines;

    setMedicines((prev) =>
      prev.map((item) =>
        item._id === medicine._id
          ? { ...item, isActive }
          : item,
      ),
    );

    try {
      await api(`/api/medicines/${medicine._id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });

      notify(
        isActive
          ? `${medicine.name} is back in the store.`
          : `${medicine.name} is hidden.`,
      );
      loadStats();
    } catch (error) {
      setMedicines(previous);
      notify(
        errorText(error, 'The medicine could not be updated.'),
        'error',
      );
    }
  };

  const openWhatsApp = useCallback((phone: string, message: string) => {
    const url = `https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(
      message,
    )}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = url;
  }, []);

  const messageCustomer = useCallback(
    async (order: OrderRecord) => {
      const message = [
        `Hello ${sanitizeForMessage(order.customer.name, 40)}, this is ${
          order.branch?.shortName ||
          order.branch?.name ||
          'Lotus Pharmacy'
        }.`,
        `We are contacting you about order ${order.orderNumber}.`,
        order.estimatedTotal > 0
          ? `Current estimated value: ${formatMoney(order.estimatedTotal)}.`
          : 'We are reviewing your prescription and will confirm the bill.',
      ].join('\n');

      // Try marking as opened silently, don't break if it fails
      try {
        await api(`/api/orders/${order._id}/whatsapp-opened`, { method: 'POST' });
      } catch (err) {}

      openWhatsApp(`91${digitsOnly(order.customer.phone)}`, message);
    },
    [openWhatsApp],
  );

  const resendNotification = async (order: OrderRecord) => {
    try {
      await api(`/api/orders/${order._id}/notify`, { method: 'POST' });
      notify('WhatsApp notification resent successfully.');
    } catch (error) {
      notify(errorText(error, 'Failed to resend notification.'), 'error');
    }
  };

  // WhatsApp Gateway Actions
  const connectWa = async () => {
    setWaProcessing(true);
    try {
      const data = await api<{ session: WhatsAppSession; pendingCount: number }>('/api/admin/whatsapp/connect', { method: 'POST' });
      setWaSession(data.session);
      setWaPendingCount(data.pendingCount);
      notify('WhatsApp connection initiated.');
    } catch (error) {
      notify(errorText(error, 'Failed to initiate WhatsApp connection.'), 'error');
    } finally {
      setWaProcessing(false);
    }
  };

  const logoutWa = async () => {
    setWaProcessing(true);
    try {
      const data = await api<{ session: WhatsAppSession; pendingCount: number }>('/api/admin/whatsapp/logout', { method: 'POST' });
      setWaSession(data.session);
      setWaPendingCount(data.pendingCount);
      notify('WhatsApp disconnected.');
    } catch (error) {
      notify(errorText(error, 'Failed to disconnect WhatsApp.'), 'error');
    } finally {
      setWaProcessing(false);
    }
  };

  const testWa = async () => {
    if (!waTestPhone || digitsOnly(waTestPhone).length !== 10) {
      notify('Please enter a valid 10-digit Indian phone number.', 'error');
      return;
    }
    setWaProcessing(true);
    try {
      const data = await api<{ message: string }>('/api/admin/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({ phone: waTestPhone }),
      });
      notify(data.message);
      setWaTestPhone('');
    } catch (error) {
      notify(errorText(error, 'Failed to send test message.'), 'error');
    } finally {
      setWaProcessing(false);
    }
  };

  const retryPendingWa = async () => {
    setWaProcessing(true);
    try {
      const data = await api<{ attempted: number; sent: number; pendingCount: number }>('/api/admin/whatsapp/retry-pending', { method: 'POST' });
      setWaPendingCount(data.pendingCount);
      notify(`Retried ${data.attempted} messages. Sent ${data.sent}.`);
    } catch (error) {
      notify(errorText(error, 'Failed to retry messages.'), 'error');
    } finally {
      setWaProcessing(false);
    }
  };

  const tabs: Array<{
    value: AdminTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'orders',
      label: 'Orders',
      icon: <Package size={16} strokeWidth={2.3} />,
    },
    {
      value: 'catalogue',
      label: 'Catalogue',
      icon: <LayoutList size={16} strokeWidth={2.3} />,
    },
    {
      value: 'branches',
      label: 'Branches',
      icon: <Store size={16} strokeWidth={2.3} />,
    },
    {
      value: 'whatsapp',
      label: 'WhatsApp',
      icon: <MessageCircle size={16} strokeWidth={2.3} />,
    },
    {
      value: 'settings',
      label: 'Settings',
      icon: <Settings size={16} strokeWidth={2.3} />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-[#0B1220] antialiased">
      <header className="sticky top-0 z-30 border-b border-[#0B1220]/[0.07] bg-white/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B7A6B] text-white">
              <LotusMark size={22} />
            </span>

            <div className="min-w-0">
              <h1 className="truncate text-[16px] font-semibold tracking-[-0.02em]">
                Lotus Pharmacy console
              </h1>
              <p className="truncate text-[12px] text-[#0B1220]/50">
                {branches.length} branch{branches.length === 1 ? '' : 'es'} ·{' '}
                {stats?.openOrders ?? 0} open order
                {(stats?.openOrders ?? 0) === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-full bg-[#0B1220]/[0.05] p-1 md:flex">
            {tabs.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setTab(entry.value)}
                className={cx(
                  'flex items-center gap-2 rounded-full px-5 py-2 text-[13.5px] font-medium',
                  tab === entry.value
                    ? 'bg-[#0B7A6B] text-white shadow-sm'
                    : 'text-[#0B1220]/55 hover:bg-white hover:text-[#0B1220]',
                )}
              >
                {entry.icon}
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="lp-press flex items-center gap-2.5 rounded-full border border-[#0B1220]/10 bg-white py-1.5 pl-1.5 pr-3"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6F4F1] text-[12px] font-semibold text-[#0B7A6B]">
                {initialsOf(user.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold">
                  {user.name}
                </span>
                <span className="block text-[11.5px] text-[#0B1220]/50">
                  Admin
                </span>
              </span>
              <ChevronDown size={15} className="text-[#0B1220]/40" />
            </button>

            {menuOpen && (
              <div className="lp-pop absolute right-0 top-[calc(100%+0.6rem)] w-52 overflow-hidden rounded-2xl border border-[#0B1220]/[0.08] bg-white p-1.5 shadow-[0_24px_60px_-24px_rgba(11,18,32,0.45)]">
                <button
                  type="button"
                  onClick={onBackToStore}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium hover:bg-[#0B1220]/[0.05]"
                >
                  <ChevronLeft size={16} />
                  Back to store
                </button>

                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-rose-600 hover:bg-rose-50"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto mt-3 max-w-[1600px] md:hidden">
          <Segmented<AdminTab>
            ariaLabel="Console sections"
            value={tab}
            onChange={setTab}
            options={tabs.map((entry) => ({
              value: entry.value,
              label: entry.label,
            }))}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        
        <AdminQuickStart 
          branchesCount={branches.length} 
          medicinesCount={stats?.medicineCount || 0} 
          waConnected={waSession?.state === 'connected'} 
          onNavigate={(newTab) => setTab(newTab)} 
        />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Orders today"
            value={String(stats?.ordersToday ?? 0)}
            delta={stats?.ordersDelta}
            series={stats?.ordersSeries}
            icon={<ShoppingCart size={19} />}
            iconClass="bg-[#E6F4F1] text-[#0B7A6B]"
          />

          <StatCard
            label="Awaiting confirmation"
            value={String(stats?.waitingWhatsApp ?? 0)}
            icon={<Clock size={19} />}
            iconClass="bg-amber-50 text-amber-600"
          />

          <StatCard
            label="Confirmed value today"
            value={formatMoney(stats?.bookedToday ?? 0)}
            delta={stats?.bookedDelta}
            series={stats?.revenueSeries}
            seriesTone="#0B1220"
            icon={<IndianRupee size={19} />}
            iconClass="bg-emerald-50 text-emerald-600"
          />

          <StatCard
            label="Medicines live"
            value={compactNumber.format(stats?.medicineCount ?? 0)}
            icon={<Package size={19} />}
            iconClass="bg-sky-50 text-sky-600"
          />
        </div>

        {tab === 'orders' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="overflow-hidden rounded-3xl border border-[#0B1220]/[0.06] bg-white shadow-[0_1px_2px_rgba(11,18,32,0.05)]">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#0B1220]/[0.07] p-5">
                <div>
                  <h2 className="text-[19px] font-semibold">Orders</h2>
                  <p className="mt-0.5 text-[13px] text-[#0B1220]/55">
                    Click any order to see medicines, prescription and timeline.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-full sm:w-[240px]">
                    <SearchInput
                      id="admin-order-search"
                      label="Search orders"
                      placeholder="Order number, name or phone"
                      value={orderSearch}
                      onChange={setOrderSearch}
                      busy={
                        orderSearch.trim() !== debouncedOrderSearch
                      }
                    />
                  </div>

                  <SelectShell
                    id="order-status-filter"
                    label="Filter by status"
                    value={statusFilter}
                    onChange={(value) =>
                      setStatusFilter(value as OrderStatus | 'all')
                    }
                  >
                    <option value="all">All statuses</option>
                    {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map(
                      (status) => (
                        <option key={status} value={status}>
                          {ORDER_STATUS_LABEL[status]}
                        </option>
                      ),
                    )}
                  </SelectShell>

                  <SelectShell
                    id="order-range-filter"
                    label="Filter by date"
                    value={rangeFilter}
                    onChange={(value) =>
                      setRangeFilter(value as OrderRange)
                    }
                  >
                    {(Object.keys(ORDER_RANGE_LABEL) as OrderRange[]).map(
                      (range) => (
                        <option key={range} value={range}>
                          {ORDER_RANGE_LABEL[range]}
                        </option>
                      ),
                    )}
                  </SelectShell>

                  <button
                    type="button"
                    onClick={loadOrders}
                    className="lp-press flex h-10 w-10 items-center justify-center rounded-full border border-[#0B1220]/10"
                    aria-label="Refresh orders"
                  >
                    <RefreshCw
                      size={16}
                      className={
                        ordersLoading
                          ? 'animate-spin text-[#0B7A6B]'
                          : ''
                      }
                    />
                  </button>
                </div>
              </div>

              {ordersLoading && orders.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-24 text-[#0B1220]/45">
                  <Loader2
                    size={22}
                    className="animate-spin text-[#0B7A6B]"
                  />
                  <span className="text-[14px]">Loading orders</span>
                </div>
              ) : orders.length === 0 ? (
                <div className="px-6 py-24 text-center">
                  <Receipt
                    size={36}
                    className="mx-auto mb-4 text-[#0B1220]/25"
                  />
                  <p className="text-[16px] font-semibold">
                    No orders match these filters
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-[#0B1220]/[0.07]">
                          {[
                            'Order',
                            'Customer',
                            'Items',
                            'Amount',
                            'Status',
                            '',
                          ].map((heading, index) => (
                            <th
                              key={heading || index}
                              className="px-5 py-3.5 text-[12px] font-semibold text-[#0B1220]/45"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-[#0B1220]/[0.05]">
                        {orders.map((order) => (
                          <tr
                            key={order._id}
                            className="cursor-pointer hover:bg-[#0B1220]/[0.015]"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <td className="px-5 py-4 align-top">
                              <p className="text-[13.5px] font-semibold tabular-nums">
                                {order.orderNumber}
                              </p>
                              <p className="mt-0.5 text-[12px] text-[#0B1220]/45">
                                {formatTimeOnly(order.createdAt)} ·{' '}
                                {order.branch?.shortName ||
                                  order.branch?.name ||
                                  '—'}
                              </p>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <p className="text-[13.5px] font-semibold">
                                {order.customer.name}
                              </p>
                              <p className="mt-0.5 text-[12px] text-[#0B1220]/50">
                                +91 {order.customer.phone}
                              </p>
                            </td>

                            <td className="px-5 py-4 align-top text-[13px] text-[#0B1220]/65">
                              {order.type === 'prescription'
                                ? 'Prescription request'
                                : `${order.items.length} item${order.items.length === 1 ? '' : 's'}`}
                              {order.hasPrescription ? ' · Rx attached' : ''}
                            </td>

                            <td className="px-5 py-4 align-top text-[13.5px] font-semibold tabular-nums">
                              {formatMoney(order.estimatedTotal)}
                            </td>

                            <td className="px-5 py-4 align-top">
                              <OrderStatusPill status={order.status} />
                            </td>

                            <td
                              className="px-5 py-4 text-right"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => messageCustomer(order)}
                                className="lp-press inline-flex items-center gap-2 rounded-xl bg-[#0B7A6B] px-3.5 py-2 text-[12.5px] font-semibold text-white"
                              >
                                <MessageCircle size={15} />
                                WhatsApp
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="divide-y divide-[#0B1220]/[0.06] lg:hidden">
                    {orders.map((order) => (
                      <li
                        key={order._id}
                        className="p-4"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[14px] font-semibold tabular-nums">
                              {order.orderNumber}
                            </p>
                            <p className="mt-0.5 text-[12px] text-[#0B1220]/45">
                              {formatDate(order.createdAt)}
                            </p>
                          </div>
                          <span className="text-[15px] font-semibold tabular-nums">
                            {formatMoney(order.estimatedTotal)}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[13.5px] font-semibold">
                              {order.customer.name}
                            </p>
                            <p className="text-[12px] text-[#0B1220]/50">
                              {order.items.length} item(s)
                            </p>
                          </div>
                          <OrderStatusPill status={order.status} />
                        </div>
                      </li>
                    ))}
                  </ul>

                  {ordersPages > 1 && (
                    <div className="flex items-center justify-between border-t border-[#0B1220]/[0.07] px-5 py-4">
                      <span className="text-[12.5px] text-[#0B1220]/50">
                        Page {ordersPage} of {ordersPages} · {ordersTotal}{' '}
                        orders
                      </span>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setOrdersPage((page) =>
                              Math.max(1, page - 1),
                            )
                          }
                          disabled={ordersPage <= 1 || ordersLoading}
                          className="lp-press flex h-9 w-9 items-center justify-center rounded-full border border-[#0B1220]/10 disabled:opacity-40"
                        >
                          <ChevronLeft size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setOrdersPage((page) =>
                              Math.min(ordersPages, page + 1),
                            )
                          }
                          disabled={
                            ordersPage >= ordersPages || ordersLoading
                          }
                          className="lp-press flex h-9 w-9 items-center justify-center rounded-full border border-[#0B1220]/10 disabled:opacity-40"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-3xl border border-[#0B1220]/[0.06] bg-white p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">Branch load</h3>
                  <span className="text-[12px] text-[#0B1220]/45">
                    Last 30 days
                  </span>
                </div>

                {stats?.branchPerformance?.length ? (
                  <ul className="space-y-4">
                    {stats.branchPerformance.map((entry) => (
                      <li key={entry.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[13px] font-semibold">
                            {entry.name}
                          </p>
                          <p className="text-[12px] text-[#0B1220]/55">
                            {entry.orders} orders
                          </p>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#0B1220]/[0.06]">
                          <div
                            className="h-full rounded-full bg-[#0B7A6B]"
                            style={{
                              width: `${Math.max(4, entry.pct)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-[13px] text-[#0B1220]/50">
                    No recent orders yet.
                  </p>
                )}
              </section>

              <section className="rounded-3xl bg-gradient-to-b from-[#E6F4F1] to-white p-6">
                <Truck size={21} className="text-[#0B7A6B]" />
                <h3 className="mt-4 text-[15px] font-semibold text-[#0A6A5D]">
                  Automated WhatsApp
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#0A6A5D]/75">
                  Customers receive an order confirmation automatically, and a
                  new message every time you move an order to the next status.
                  Orders still sitting in the first column had no confirmation
                  delivered — check the gateway.
                </p>

                {(stats?.waitingWhatsApp ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('pending_whatsapp');
                      setRangeFilter('all');
                    }}
                    className="lp-press mt-4 inline-flex items-center gap-2 rounded-full bg-[#0B7A6B] px-4 py-2.5 text-[13px] font-semibold text-white"
                  >
                    Show {stats?.waitingWhatsApp} unconfirmed
                    <ArrowRight size={15} />
                  </button>
                )}
              </section>
            </aside>
          </div>
        )}

        {tab === 'catalogue' && (
          <section className="space-y-5">
            {showMedicineForm ? (
              <MedicineForm
                initial={editingMedicine}
                categories={categories}
                branches={branches}
                globalSettings={globalSettings}
                onCancel={() => {
                  setShowMedicineForm(false);
                  setEditingMedicine(null);
                }}
                onSaved={(medicine) => {
                  setMedicines((prev) => {
                    const exists = prev.some(
                      (item) => item._id === medicine._id,
                    );

                    return exists
                      ? prev.map((item) =>
                          item._id === medicine._id
                            ? medicine
                            : item,
                        )
                      : [medicine, ...prev];
                  });

                  setShowMedicineForm(false);
                  setEditingMedicine(null);
                  notify('Medicine saved.');
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
                  className="lp-press flex items-center gap-2 rounded-full bg-[#0B7A6B] px-5 py-2.5 text-[13px] font-semibold text-white"
                >
                  <Plus size={17} />
                  Add medicine
                </button>

                <div className="w-full sm:w-[280px]">
                  <SearchInput
                    id="admin-medicine-search"
                    label="Search catalogue"
                    placeholder="Search catalogue"
                    value={medicineSearch}
                    onChange={setMedicineSearch}
                    busy={
                      medicineSearch.trim() !==
                      debouncedMedicineSearch
                    }
                  />
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-[#0B1220]/[0.06] bg-white">
              <ul className="divide-y divide-[#0B1220]/[0.06]">
                {medicines.map((medicine) => {
                  const totalStock = medicine.inventory?.reduce(
                    (sum, row) =>
                      sum +
                      (row.isAvailable ? row.stockUnits : 0),
                    0,
                  );

                  return (
                    <li
                      key={medicine._id}
                      className="flex items-center gap-4 p-4 md:p-5"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#0B1220]/[0.04] text-2xl">
                        <ProductThumb medicine={medicine} fallbackImageUrl={globalSettings?.fallbackImageUrl} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">
                          {medicine.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-2 text-[12.5px] text-[#0B1220]/55">
                          <span>{medicine.category}</span>
                          <span className="font-semibold text-[#0B7A6B]">
                            {formatMoney(medicine.price)}
                          </span>
                          <span>{totalStock || 0} stock units</span>
                          {medicine.requiresPrescription && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                              Rx
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMedicine(medicine);
                            setShowMedicineForm(true);
                            window.scrollTo({
                              top: 0,
                              behavior: 'smooth',
                            });
                          }}
                          className="lp-press rounded-full p-2.5 text-[#0B1220]/40 hover:bg-[#E6F4F1] hover:text-[#0B7A6B]"
                        >
                          <Pencil size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setMedicineVisibility(
                              medicine,
                              !medicine.isActive,
                            )
                          }
                          className="lp-press rounded-full p-2.5 text-[#0B1220]/40"
                        >
                          {medicine.isActive ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}

                {medicinesLoading && medicines.length === 0 && (
                  <li className="flex items-center justify-center gap-2 py-24 text-[14px] text-[#0B1220]/45">
                    <Loader2
                      size={18}
                      className="animate-spin text-[#0B7A6B]"
                    />
                    Loading catalogue
                  </li>
                )}
              </ul>

              {hasMoreMedicines && !showMedicineForm && (
                <div className="flex justify-center border-t border-[#0B1220]/[0.06] p-5">
                  <button
                    type="button"
                    onClick={() => loadMedicines('more')}
                    disabled={medicinesLoading}
                    className="lp-press flex items-center gap-2 rounded-full bg-[#0B1220]/[0.05] px-6 py-2.5 text-[13px] font-semibold"
                  >
                    {medicinesLoading && (
                      <Loader2 size={15} className="animate-spin" />
                    )}
                    Load more
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'branches' && (
          <section className="space-y-5">
            {showBranchForm ? (
              <BranchForm
                branch={editingBranch}
                onCancel={() => {
                  setShowBranchForm(false);
                  setEditingBranch(null);
                }}
                onSaved={(updated) => {
                  onBranchesChange(
                    editingBranch
                      ? branches.map((item) =>
                          item._id === updated._id
                            ? updated
                            : item,
                        )
                      : [...branches, updated],
                  );
                  setShowBranchForm(false);
                  setEditingBranch(null);
                  notify('Branch saved.');
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
                    className="lp-press flex items-center gap-2 rounded-full bg-[#0B7A6B] px-5 py-2.5 text-[13px] font-semibold text-white"
                  >
                    <Plus size={17} />
                    Add branch
                  </button>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  {branches.map((branch) => (
                    <div
                      key={branch._id}
                      className="rounded-3xl border border-[#0B1220]/[0.06] bg-white p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E6F4F1] text-[#0B7A6B]">
                            <Store size={21} />
                          </span>

                          <div>
                            <h3 className="text-[17px] font-semibold">
                              {branch.name}
                            </h3>
                            <p className="text-[13px] text-[#0B1220]/55">
                              {branch.address}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingBranch(branch);
                            setShowBranchForm(true);
                          }}
                          className="lp-press flex items-center gap-2 rounded-full bg-[#0B1220]/[0.06] px-4 py-2 text-[12.5px] font-semibold"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                      </div>

                      <div className="mt-4 space-y-2 border-t border-[#0B1220]/[0.07] pt-4 text-[13px] text-[#0B1220]/65">
                        <p>+{branch.phone}</p>
                        <p>{branch.fullAddress}</p>
                        <p>
                          Service radius: {branch.serviceRadiusKm} km ·{' '}
                          {branch.open24h ? 'Open 24h' : 'Custom hours'}
                        </p>
                      </div>

                      {!branch.isActive && (
                        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-700">
                          Paused — customers cannot send orders here.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'whatsapp' && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-semibold">WhatsApp Gateway Configuration</h2>
                <p className="mt-1 text-[13px] text-[#0B1220]/55">
                  Manage the WhatsApp connection for automated order updates.
                </p>
              </div>
              <button
                type="button"
                onClick={loadWaStatus}
                disabled={waLoading}
                className="lp-press flex items-center gap-2 rounded-full border border-[#0B1220]/10 bg-white px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              >
                <RefreshCw size={15} className={waLoading ? "animate-spin" : ""} />
                Refresh Status
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#0B1220]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.06)] md:p-8">
                  <h3 className="mb-4 flex items-center gap-2 text-[16px] font-semibold">
                    <Smartphone size={18} className="text-[#0B7A6B]" />
                    Connection Status
                  </h3>
                  
                  {waLoading && !waSession ? (
                    <div className="flex justify-center py-10">
                      <Loader2 size={24} className="animate-spin text-[#0B7A6B]" />
                    </div>
                  ) : !waSession || !waSession.configured ? (
                     <div className="rounded-[20px] bg-rose-50 p-6 text-center text-rose-700">
                        <AlertCircle size={32} className="mx-auto mb-3" />
                        <p className="font-semibold">WhatsApp is not configured on the server.</p>
                        <p className="mt-1 text-[13px]">{waSession?.message || 'Set WA_GATEWAY_URL and WA_API_KEY in the environment variables.'}</p>
                     </div>
                  ) : waSession.state === 'qr' && waSession.qr ? (
                    <div className="text-center">
                      <div className="mx-auto mb-4 inline-block overflow-hidden rounded-[20px] border border-[#0B1220]/10 bg-white p-4 shadow-sm">
                        <img src={waSession.qr} alt="WhatsApp QR Code" className="h-64 w-64" />
                      </div>
                      <p className="text-[14px] font-semibold text-[#0B1220]">Scan this QR code in WhatsApp</p>
                      <p className="mt-1 text-[13px] text-[#0B1220]/55">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
                      <p className="mt-4 text-[12px] text-amber-600 font-medium bg-amber-50 py-2 rounded-xl">Status auto-refreshes every 5 seconds.</p>
                    </div>
                  ) : waSession.state === 'connected' ? (
                    <div className="rounded-[24px] bg-[#E6F4F1] p-6 text-center">
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#0B7A6B] shadow-sm">
                        <CheckCircle2 size={28} />
                      </div>
                      <p className="text-[17px] font-semibold text-[#0B7A6B]">Connected & Ready</p>
                      <p className="mt-1 text-[14px] text-[#0A6A5D]">Linked as {waSession.name} (+{waSession.phone})</p>
                      
                      <div className="mt-6 flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={logoutWa}
                          disabled={waProcessing}
                          className="lp-press flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-rose-600 shadow-sm disabled:opacity-60"
                        >
                          {waProcessing ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                          Logout Device
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[20px] bg-[#0B1220]/[0.04] p-6 text-center">
                      <Smartphone size={32} className="mx-auto mb-3 text-[#0B1220]/40" />
                      <p className="font-semibold">Current State: {waSession.state}</p>
                      {waSession.message && <p className="mt-1 text-[13px] text-[#0B1220]/55">{waSession.message}</p>}
                      
                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={connectWa}
                          disabled={waProcessing || waSession.state === 'connecting'}
                          className="lp-press inline-flex items-center gap-2 rounded-full bg-[#0B7A6B] px-6 py-3 text-[14px] font-semibold text-white shadow-sm disabled:opacity-60"
                        >
                          {waProcessing || waSession.state === 'connecting' ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                          Generate QR Code
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[28px] border border-[#0B1220]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.06)]">
                   <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
                     <Clock size={18} className="text-amber-600" />
                     Pending Outbound Messages
                   </h3>
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-amber-50/50 border border-amber-100 p-5">
                      <div>
                        <p className="text-[20px] font-semibold text-amber-700">{waPendingCount}</p>
                        <p className="text-[13px] text-amber-700/70">Unconfirmed initial order alerts in queue</p>
                      </div>
                      <button
                        type="button"
                        onClick={retryPendingWa}
                        disabled={waProcessing || waPendingCount === 0 || waSession?.state !== 'connected'}
                        className="lp-press flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        {waProcessing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        Retry All
                      </button>
                   </div>
                   <p className="mt-3 text-[12.5px] text-[#0B1220]/50">
                     If the gateway was disconnected, automated confirmation messages may be waiting. Click "Retry All" to flush the queue. (Max 20 per attempt to prevent spam limits).
                   </p>
                </div>
              </div>

              <div className="space-y-6">
                 <div className="rounded-[28px] border border-[#0B1220]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.06)]">
                    <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
                      <Send size={18} className="text-[#0B7A6B]" />
                      Send Test Message
                    </h3>
                    <p className="mb-4 text-[13px] text-[#0B1220]/60">
                      Verify that the WhatsApp connection is working correctly by sending a test message to your own number.
                    </p>
                    <div className="space-y-3">
                      <Field
                        name="testPhone"
                        label="Mobile number"
                        type="tel"
                        inputMode="numeric"
                        placeholder="10-digit number"
                        value={waTestPhone}
                        onChange={(e) => setWaTestPhone(digitsOnly(e.target.value).slice(0, 10))}
                        maxLength={10}
                      />
                      <button
                        type="button"
                        onClick={testWa}
                        disabled={waProcessing || waTestPhone.length < 10 || waSession?.state !== 'connected'}
                        className="lp-press w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B1220] py-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
                      >
                        {waProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Send Test Ping
                      </button>
                    </div>
                 </div>

                 <div className="rounded-[24px] bg-[#E6F4F1] p-5">
                    <h4 className="font-semibold text-[#0B7A6B] text-[14px]">Best Practices</h4>
                    <ul className="mt-3 space-y-2 text-[12.5px] text-[#0A6A5D]/80 list-disc pl-4">
                      <li>Keep your linked phone connected to the internet.</li>
                      <li>Avoid sending bulk manual messages too fast.</li>
                      <li>If QR code fails to generate, check if the session is stuck in "connecting" and refresh.</li>
                    </ul>
                 </div>
              </div>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="space-y-6">
            <div>
              <h2 className="text-[20px] font-semibold">Store Settings</h2>
              <p className="mt-1 text-[13px] text-[#0B1220]/55">Configure global store preferences.</p>
            </div>

            <div className="rounded-[28px] border border-[#0B1220]/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.06)] md:p-8">
              <h3 className="mb-4 text-[16px] font-semibold">Default Fallback Image</h3>
              <p className="mb-6 text-[13px] text-[#0B1220]/55">
                This image will automatically appear for all medicines that don't have a specific image uploaded.
              </p>

              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-[#0B1220]/[0.04] border border-[#0B1220]/[0.08]">
                  {globalSettings?.fallbackImageUrl ? (
                    <img src={globalSettings.fallbackImageUrl} alt="Fallback" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="text-[#0B1220]/20" size={40} />
                  )}
                </div>

                <div className="pt-2">
                  <input
                    ref={fallbackInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={handleFallbackUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fallbackInputRef.current?.click()}
                    disabled={settingsLoading}
                    className="lp-press flex items-center justify-center gap-2 rounded-2xl bg-[#0B1220] px-6 py-3.5 text-[13.5px] font-semibold text-white hover:bg-[#0B7A6B] disabled:opacity-60"
                  >
                    {settingsLoading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                    {globalSettings?.fallbackImageUrl ? 'Change Fallback Image' : 'Upload Image'}
                  </button>

                  {globalSettings?.fallbackImageUrl && (
                    <button
                      type="button"
                      onClick={removeFallbackImage}
                      disabled={settingsLoading}
                      className="mt-4 text-[13px] font-medium text-rose-600 hover:underline disabled:opacity-60"
                    >
                      Remove default image
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ================================================================== */
/*  Global CSS                                                       */
/* ================================================================== */

const GLOBAL_CSS = `
  .lp-shell {
    --lp-ios: cubic-bezier(0.32, 0.72, 0, 1);
    --lp-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
    letter-spacing: -0.011em;
  }
  .lp-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
  .lp-scroll::-webkit-scrollbar-track { background: transparent; }
  .lp-scroll::-webkit-scrollbar-thumb { background: rgba(11,18,32,0.18); border-radius: 999px; }
  .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .lp-panel { transition: transform 0.42s var(--lp-ios), opacity 0.3s var(--lp-ios); }
  .lp-seg { transition: transform 0.38s var(--lp-ios); }
  .lp-knob { transition: transform 0.28s var(--lp-ios); }
  .lp-press { transition: transform 0.18s var(--lp-spring), background-color 0.2s ease, color 0.2s ease; }
  .lp-press:active { transform: scale(0.94); }

  @keyframes lpPop { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes lpRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes lpToast { from { opacity: 0; transform: translateY(-14px) scale(0.96); } to { opacity: 1; transform: none; } }
  @keyframes lpShimmer { to { transform: translateX(100%); } }
  @keyframes lpDrift { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(28px,-34px,0) scale(1.12); } }

  .lp-pop { animation: lpPop 0.35s var(--lp-spring) both; }
  .lp-rise { animation: lpRise 0.5s var(--lp-ios) both; }
  .lp-toast { animation: lpToast 0.4s var(--lp-spring) both; }
  .lp-count { animation: lpPop 0.24s var(--lp-spring) both; }
  .lp-drift { animation: lpDrift 16s ease-in-out infinite; }

  .lp-skeleton { position: relative; overflow: hidden; background: rgba(11,18,32,0.06); }
  .lp-skeleton::after {
    content: ''; position: absolute; inset: 0; transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent);
    animation: lpShimmer 1.6s infinite;
  }

  .lp-grain {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .lp-fade-x {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 18px, #000 calc(100% - 18px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 18px, #000 calc(100% - 18px), transparent);
  }

  .lp-shell :focus-visible {
    outline: 2px solid #0B7A6B;
    outline-offset: 2px;
    border-radius: 12px;
  }

  html { scroll-behavior: smooth; }

  @media (prefers-reduced-motion: reduce) {
    .lp-shell *, .lp-shell *::before, .lp-shell *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

export default function Page() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [view, setView] = useState<'store' | 'admin'>('store');
  const [showWelcome, setShowWelcome] = useState(false);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categoryPool, setCategoryPool] = useState<string[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebouncedValue(
    searchQuery.trim(),
    SEARCH_DEBOUNCE_MS,
  );
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);

  const pageRef = useRef(1);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const prescriptionInputRef = useRef<HTMLInputElement>(null);

  const [cartRxFile, setCartRxFile] = useState<File | null>(null);
  const [cartRxPreview, setCartRxPreview] = useState<string | null>(null);
  const [cartRxError, setCartRxError] = useState<string | null>(null);
  const cartRxInputRef = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState<AddressForm>({
    name: '',
    phone: '',
    houseNo: '',
    area: '',
    landmark: '',
  });
  const [addressErrors, setAddressErrors] = useState<FieldErrors>({});

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [locateStatus, setLocateStatus] =
    useState<LocateStatus>('idle');
  const [locateError, setLocateError] = useState<string | null>(null);
  const [detectedDistance, setDetectedDistance] =
    useState<number | null>(null);

  const checkoutKeyRef = useRef<string | null>(null);
  const prescriptionKeyRef = useRef<string | null>(null);

  const notify = useCallback(
    (text: string, tone: ToastTone = 'success') => {
      const id = Date.now() + Math.random();

      setToasts((prev) => [
        ...prev.slice(-2),
        { id, text, tone },
      ]);

      const timer = window.setTimeout(() => {
        setToasts((prev) =>
          prev.filter((toast) => toast.id !== id),
        );
      }, 3600);

      toastTimers.current.push(timer);
    },
    [],
  );

  useEffect(
    () => () => {
      toastTimers.current.forEach(window.clearTimeout);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    api<{ user: AuthUser }>('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        // Guest mode is intentional.
      })
      .finally(() => {
        if (!cancelled) setSessionChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch Global Settings
  useEffect(() => {
    api<{ setting: GlobalSettings }>('/api/settings')
      .then((data) => setGlobalSettings(data.setting))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasVisited = window.localStorage.getItem('lp_has_visited');
      if (!hasVisited) {
        setShowWelcome(true);
      }
    }
  }, []);

  const closeWelcome = () => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lp_has_visited', 'true');
    }
  };

  useEffect(() => {
    if (!user) return;

    const saved = user.addresses?.[0];

    setAddress((prev) => ({
      name: prev.name || user.name,
      phone: prev.phone || user.phone,
      houseNo: prev.houseNo || saved?.houseNo || '',
      area: prev.area || saved?.area || '',
      landmark: prev.landmark || saved?.landmark || '',
    }));
  }, [user]);

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    setBranchesError(null);

    try {
      const data = await api<{ branches: Branch[] }>(
        '/api/branches',
      );
      const active = data.branches.filter(
        (branch) => branch.isActive,
      );

      setBranches(data.branches);
      setSelectedBranch((prev) => {
        if (prev && active.some((branch) => branch._id === prev._id)) {
          return prev;
        }
        return active[0] ?? null;
      });
    } catch (error) {
      setBranchesError(
        errorText(
          error,
          'Branches could not be loaded. Ordering is temporarily unavailable.',
        ),
      );
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const loadMedicines = useCallback(
    async (mode: 'reset' | 'more') => {
      if (mode === 'more' && busyRef.current) return;
      if (mode === 'reset') requestRef.current?.abort();

      const controller = new AbortController();
      requestRef.current = controller;
      busyRef.current = true;

      const page =
        mode === 'reset' ? 1 : pageRef.current + 1;

      if (mode === 'reset') {
        setCatalogueLoading(true);
      } else {
        setLoadingMore(true);
      }

      setCatalogueError(null);

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          page: String(page),
        });

        if (debouncedQuery) params.set('search', debouncedQuery);
        if (activeCategory !== ALL_CATEGORIES) {
          params.set('category', activeCategory);
        }
        if (selectedBranch?._id) {
          params.set('branchId', selectedBranch._id);
        }

        const data = await api<{
          items: Medicine[];
          pages: number;
        }>(`/api/medicines?${params.toString()}`, {
          signal: controller.signal,
        });

        pageRef.current = page;

        setMedicines((prev) =>
          mode === 'reset' ? data.items : [...prev, ...data.items],
        );
        setHasMore(page < (data.pages || 1));

        setCategoryPool((prev) => {
          const merged = new Set(prev);
          data.items.forEach((item) => {
            if (item.category) merged.add(item.category);
          });
          return Array.from(merged).sort();
        });
      } catch (error) {
        if (isAbortError(error)) return;
        setCatalogueError(
          errorText(error, 'The store could not be loaded.'),
        );
      } finally {
        if (!controller.signal.aborted) {
          busyRef.current = false;
          setCatalogueLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      activeCategory,
      debouncedQuery,
      selectedBranch?._id,
    ],
  );

  useEffect(() => {
    loadMedicines('reset');
  }, [loadMedicines]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || catalogueLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMedicines('more');
        }
      },
      { rootMargin: '500px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [catalogueLoading, hasMore, loadMedicines]);

  useEffect(() => {
    setCart(
      parseStoredCart(
        window.localStorage.getItem(CART_STORAGE_KEY),
      ),
    );
    setCartHydrated(true);
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;

    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart),
      );
    } catch {
      // Storage can fail in strict/private browsing modes.
    }
  }, [cart, cartHydrated]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!cartRxPreview) return;
    return () => URL.revokeObjectURL(cartRxPreview);
  }, [cartRxPreview]);

  const categories = useMemo(
    () => [ALL_CATEGORIES, ...categoryPool],
    [categoryPool],
  );

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.isActive),
    [branches],
  );

  const cartQuantities = useMemo(
    () =>
      Object.fromEntries(
        cart.map((item) => [item.cartItemId, item.qty]),
      ),
    [cart],
  );

  const cartNeedsPrescription = useMemo(
    () => cart.some((item) => item.requiresPrescription),
    [cart],
  );

  const { itemCount, total, savings } = useMemo(
    () =>
      cart.reduce(
        (acc, item) => ({
          itemCount: acc.itemCount + item.qty,
          total: acc.total + item.unitPrice * item.qty,
          savings:
            acc.savings +
            Math.max(0, item.unitMrp - item.unitPrice) *
              item.qty,
        }),
        {
          itemCount: 0,
          total: 0,
          savings: 0,
        },
      ),
    [cart],
  );

  const addToCart = useCallback(
    (medicine: Medicine, buyType: BuyType) => {
      if (!selectedBranch) {
        notify('Choose an available branch first.', 'error');
        return;
      }

      const stock = getInventoryForBranch(
        medicine,
        selectedBranch._id,
      );

      const unitsNeeded =
        buyType === 'loose'
          ? 1
          : medicine.isDivisible
            ? medicine.packSize
            : 1;

      if (
        !stock ||
        !stock.isAvailable ||
        stock.stockUnits < unitsNeeded
      ) {
        notify(
          `${medicine.name} is out of stock at ${selectedBranch.shortName || selectedBranch.name}.`,
          'error',
        );
        return;
      }

      const cartItemId = `${medicine._id}-${buyType}`;
      const divisor = Math.max(1, medicine.packSize);
      const unitPrice =
        buyType === 'loose'
          ? Number((medicine.price / divisor).toFixed(2))
          : medicine.price;
      const unitMrp =
        buyType === 'loose'
          ? Number((medicine.mrp / divisor).toFixed(2))
          : medicine.mrp;

      setCart((prev) => {
        const existing = prev.find(
          (item) => item.cartItemId === cartItemId,
        );

        if (existing) {
          return prev.map((item) =>
            item.cartItemId === cartItemId
              ? {
                  ...item,
                  qty: Math.min(
                    item.qty + 1,
                    MAX_QTY_PER_ITEM,
                  ),
                }
              : item,
          );
        }

        if (prev.length >= MAX_CART_LINES) return prev;

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
            imageUrl: medicine.imageUrl,
            buyType,
            qty: 1,
            unitPrice,
            unitMrp,
            requiresPrescription: medicine.requiresPrescription,
          },
        ];
      });

      checkoutKeyRef.current = null;
    },
    [notify, selectedBranch],
  );

  const updateQty = useCallback(
    (cartItemId: string, delta: number) => {
      setCart((prev) =>
        prev.flatMap((item) => {
          if (item.cartItemId !== cartItemId) return item;

          const nextQty = Math.min(
            item.qty + delta,
            MAX_QTY_PER_ITEM,
          );

          return nextQty > 0
            ? { ...item, qty: nextQty }
            : [];
        }),
      );
      checkoutKeyRef.current = null;
    },
    [],
  );

  const removeFromCart = useCallback(
    (cartItemId: string) => {
      setCart((prev) =>
        prev.filter((item) => item.cartItemId !== cartItemId),
      );
      checkoutKeyRef.current = null;
    },
    [],
  );

  const handleAddressChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = event.target;
      const nextValue =
        name === 'phone'
          ? digitsOnly(value).slice(0, 10)
          : value;

      setAddress((prev) => ({
        ...prev,
        [name]: nextValue,
      }));

      setAddressErrors((prev) =>
        prev[name] ? { ...prev, [name]: undefined } : prev,
      );
    },
    [],
  );

  const detectNearestBranch = useCallback(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation ||
      activeBranches.length === 0
    ) {
      setLocateStatus('error');
      setLocateError(
        'This browser cannot share a location. Choose a branch below.',
      );
      return;
    }

    setLocateStatus('loading');
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        let nearest = activeBranches[0];
        let shortest = Number.POSITIVE_INFINITY;

        for (const branch of activeBranches) {
          const kilometres = distanceInKm(
            coords.latitude,
            coords.longitude,
            branch.lat,
            branch.lng,
          );

          if (kilometres < shortest) {
            shortest = kilometres;
            nearest = branch;
          }
        }

        setSelectedBranch(nearest);
        setDetectedDistance(
          Number.isFinite(shortest) ? shortest : null,
        );
        setLocateStatus('success');

        if (shortest > nearest.serviceRadiusKm) {
          notify(
            `Nearest branch is ${shortest.toFixed(1)} km away, outside its ${nearest.serviceRadiusKm} km delivery radius. Call the branch before ordering.`,
            'error',
          );
        } else {
          notify(
            `Nearest branch: ${nearest.shortName || nearest.name}`,
          );
        }
      },
      (error) => {
        setLocateStatus('error');
        setLocateError(geolocationMessage(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  }, [activeBranches, notify]);

  const selectBranch = useCallback(
    (branchId: string) => {
      const branch = branches.find(
        (item) => item._id === branchId,
      );
      if (!branch) return;

      setSelectedBranch(branch);
      setDetectedDistance(null);
      setLocateStatus('idle');
      setLocateError(null);
      checkoutKeyRef.current = null;
    },
    [branches],
  );

  const focusFirstError = useCallback(
    (errors: FieldErrors) => {
      window.setTimeout(() => {
        const target = document.getElementById(
          `field-${Object.keys(errors)[0]}`,
        );

        target?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        (target as HTMLInputElement | null)?.focus({
          preventScroll: true,
        });
      }, 80);
    },
    [],
  );

  const pickPrescription = (
    event: React.ChangeEvent<HTMLInputElement>,
    target: 'standalone' | 'cart',
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      const message =
        'The photo must be a JPG, PNG, WEBP or HEIC image.';
      if (target === 'cart') {
        setCartRxError(message);
      } else {
        setUploadError(message);
      }
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      const message =
        'That photo is over 5 MB. Try a smaller one.';
      if (target === 'cart') {
        setCartRxError(message);
      } else {
        setUploadError(message);
      }
      return;
    }

    if (target === 'cart') {
      setCartRxError(null);
      setCartRxFile(file);
      setCartRxPreview(URL.createObjectURL(file));
    } else {
      setUploadError(null);
      setPrescriptionFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const clearStandalonePrescription = useCallback(() => {
    setPrescriptionFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    prescriptionKeyRef.current = null;
  }, []);

  const clearCartPrescription = useCallback(() => {
    setCartRxFile(null);
    setCartRxPreview(null);
    setCartRxError(null);
    checkoutKeyRef.current = null;
  }, []);

  const handleCheckout = useCallback(async () => {
    if (
      submitting ||
      !selectedBranch ||
      cart.length === 0
    ) {
      return;
    }

    const errors = validateAddress(address, true);
    setAddressErrors(errors);

    if (Object.keys(errors).length > 0) {
      notify('Some delivery details are missing.', 'error');
      focusFirstError(errors);
      return;
    }

    if (cartNeedsPrescription && !cartRxFile) {
      setCartRxError(
        'A prescription is required for one or more medicines in this basket.',
      );
      notify('Attach the required prescription first.', 'error');
      return;
    }

    setSubmitting(true);

    let prescriptionToken = '';

    try {
      if (cartNeedsPrescription && cartRxFile) {
        prescriptionToken =
          await uploadPrescriptionFile(cartRxFile);
      }

      if (!checkoutKeyRef.current) {
        checkoutKeyRef.current = uuid();
      }

      const data = await api<{
        order: {
          id: string;
          orderNumber: string;
          estimatedTotal: number;
          items: OrderItemRecord[];
          branch: {
            id: string;
            name: string;
            shortName?: string;
            phone: string;
          };
        };
      }>('/api/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': checkoutKeyRef.current,
        },
        body: JSON.stringify({
          type: 'cart',
          branchId: selectedBranch._id,
          customer: address,
          items: cart.map((item) => ({
            medicineId: item.medicineId,
            buyType: item.buyType,
            qty: item.qty,
          })),
          prescriptionToken,
        }),
      });

      setCart([]);
      setIsCartOpen(false);
      clearCartPrescription();
      checkoutKeyRef.current = null;

      notify(
        `Order ${data.order.orderNumber} created successfully. You will receive a WhatsApp confirmation shortly.`,
      );
    } catch (error) {
      if (prescriptionToken) {
        await revertPrescription(prescriptionToken);
      }

      notify(
        errorText(error, 'The order could not be placed.'),
        'error',
      );

      if (error instanceof ApiError && error.details) {
        setAddressErrors(error.details);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    address,
    cart,
    cartNeedsPrescription,
    cartRxFile,
    clearCartPrescription,
    focusFirstError,
    notify,
    selectedBranch,
    submitting,
  ]);

  const handlePrescriptionSubmit = useCallback(async () => {
    if (submitting || !selectedBranch) return;

    const errors = validateAddress(address, false);
    setAddressErrors(errors);

    if (Object.keys(errors).length > 0) {
      notify('Some delivery details are missing.', 'error');
      focusFirstError(errors);
      return;
    }

    if (!prescriptionFile) {
      setUploadError('Add a photo of the prescription first.');
      return;
    }

    setSubmitting(true);

    let prescriptionToken = '';

    try {
      prescriptionToken =
        await uploadPrescriptionFile(prescriptionFile);

      if (!prescriptionKeyRef.current) {
        prescriptionKeyRef.current = uuid();
      }

      const data = await api<{
        order: {
          id: string;
          orderNumber: string;
          branch: {
            id: string;
            name: string;
            shortName?: string;
            phone: string;
          };
        };
      }>('/api/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key':
            prescriptionKeyRef.current,
        },
        body: JSON.stringify({
          type: 'prescription',
          branchId: selectedBranch._id,
          customer: address,
          prescriptionToken,
        }),
      });

      setIsPrescriptionOpen(false);
      clearStandalonePrescription();
      prescriptionKeyRef.current = null;

      notify(
        `Prescription order ${data.order.orderNumber} created successfully. You will receive a WhatsApp confirmation shortly.`,
      );
    } catch (error) {
      if (prescriptionToken) {
        await revertPrescription(prescriptionToken);
      }

      notify(
        errorText(
          error,
          'The prescription order could not be created.',
        ),
        'error',
      );

      if (error instanceof ApiError && error.details) {
        setAddressErrors(error.details);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    address,
    clearStandalonePrescription,
    focusFirstError,
    notify,
    prescriptionFile,
    selectedBranch,
    submitting,
  ]);

  const handleLogout = useCallback(async () => {
    try {
      await api('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {
      // Local session state still resets.
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('lp_token');
    }

    setUser(null);
    setView('store');
    setShowAccount(false);
    notify('Signed out.');
  }, [notify]);

  const styleNode = (
    <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
  );

  const toastNode = (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            'lp-toast flex max-w-[92vw] items-center gap-2.5 rounded-full px-5 py-3 text-[14px] font-medium text-white shadow-[0_18px_40px_-18px_rgba(7,17,15,0.8)] backdrop-blur-xl',
            toast.tone === 'error'
              ? 'bg-rose-600/95'
              : 'bg-[#0B1220]/95',
          )}
        >
          {toast.tone === 'error' ? (
            <AlertCircle size={17} className="shrink-0" />
          ) : (
            <CheckCircle2
              size={17}
              className="shrink-0 text-[#5FE3C6]"
            />
          )}
          {toast.text}
        </div>
      ))}
    </div>
  );

  if (view === 'admin' && user?.role === 'admin') {
    return (
      <div className="lp-shell">
        {styleNode}
        {toastNode}

        <AdminPanel
          user={user}
          branches={branches}
          globalSettings={globalSettings}
          onSettingsChange={setGlobalSettings}
          onBranchesChange={(next) => {
            setBranches(next);
            setSelectedBranch((prev) => {
              if (
                prev &&
                next.some(
                  (branch) =>
                    branch._id === prev._id && branch.isActive,
                )
              ) {
                return next.find(
                  (branch) => branch._id === prev._id,
                )!;
              }

              return (
                next.find((branch) => branch.isActive) ?? null
              );
            });
          }}
          onBackToStore={() => setView('store')}
          onLogout={handleLogout}
          notify={notify}
        />
      </div>
    );
  }

  const branchPicker = (
    <BranchPicker
      branches={activeBranches}
      selected={selectedBranch}
      distance={detectedDistance}
      status={locateStatus}
      errorMessage={locateError}
      loading={branchesLoading}
      branchError={branchesError}
      onDetect={detectNearestBranch}
      onSelect={selectBranch}
    />
  );

  const branchCount = activeBranches.length;
  const selectedBranchLabel =
    selectedBranch?.shortName || selectedBranch?.name;

  return (
    <div className="lp-shell min-h-screen bg-[#F2F3F5] text-[#0B1220] antialiased selection:bg-[#0B7A6B]/20">
      {styleNode}
      {toastNode}

      <div className="bg-[#0B7A6B] px-4 py-2 text-center text-[12px] font-medium tracking-wide text-white sm:text-[13px]">
        <span className="inline-flex items-center justify-center gap-2">
          <Sparkles size={14} className="text-white/80" />
          {branchCount > 0
            ? `${branchCount} active branch${branchCount === 1 ? '' : 'es'} accepting orders`
            : 'Branch availability is being updated'}
        </span>
      </div>

      <header className="sticky top-0 z-40 border-b border-[#0B1220]/[0.08] bg-[#F2F3F5]/85 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-5">
            <a
              href="#top"
              className="flex shrink-0 items-center gap-2.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0B7A6B] text-white shadow-[0_8px_20px_-10px_rgba(11,122,107,0.9)]">
                <LotusMark />
              </span>
              <span className="hidden text-[19px] font-semibold tracking-[-0.03em] sm:block">
                Lotus Pharmacy
              </span>
            </a>

            <div className="hidden flex-1 lg:block">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                busy={
                  searchQuery.trim() !== debouncedQuery
                }
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {sessionChecked && (
                <button
                  type="button"
                  onClick={() =>
                    user
                      ? setShowAccount(true)
                      : setShowAuth(true)
                  }
                  className="lp-press flex h-11 items-center gap-2 rounded-full bg-[#0B1220]/[0.06] px-3 text-[13px] font-semibold sm:px-4"
                >
                  {user ? (
                    <>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E6F4F1] text-[11px] text-[#0B7A6B]">
                        {initialsOf(user.name)}
                      </span>
                      <span className="hidden sm:inline">
                        {user.name.split(' ')[0]}
                      </span>
                    </>
                  ) : (
                    <>
                      <LogIn size={16} />
                      <span className="hidden sm:inline">
                        Sign in
                      </span>
                    </>
                  )}
                </button>
              )}

              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setView('admin')}
                  className="lp-press hidden items-center gap-2 rounded-full bg-[#0B1220]/[0.06] px-4 py-2.5 text-[13px] font-semibold md:flex"
                >
                  <LayoutDashboard size={16} />
                  Console
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                aria-label={`Open cart, ${itemCount} items`}
                className="lp-press relative flex h-11 w-11 items-center justify-center rounded-full bg-[#0B1220] text-white hover:bg-[#0B7A6B]"
              >
                <ShoppingCart size={19} />
                {itemCount > 0 && (
                  <span className="lp-pop absolute -right-0.5 -top-0.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-[#F2F3F5] bg-[#0B7A6B] px-1 text-[11px] font-semibold tabular-nums">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="mt-3 lg:hidden">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              busy={searchQuery.trim() !== debouncedQuery}
            />
          </div>
        </div>

        {categories.length > 1 && (
          <div className="lp-fade-x mx-auto max-w-7xl overflow-hidden px-4 pb-2.5 sm:px-6 lg:px-8">
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={cx(
                    'lp-press whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium',
                    activeCategory === category
                      ? 'bg-[#0B1220] text-white'
                      : 'bg-[#0B1220]/[0.05] text-[#0B1220]/65',
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <section
        id="top"
        className="relative overflow-hidden bg-[#07110F] pb-24 pt-16 sm:pb-28 sm:pt-20"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="lp-drift absolute -right-32 -top-40 h-[620px] w-[620px] rounded-full bg-[#0B7A6B]/40 blur-[130px]" />
          <div className="lp-grain absolute inset-0 opacity-[0.045] mix-blend-overlay" />
        </div>

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div>
            <h1 className="max-w-[16ch] text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[52px] lg:text-[60px]">
              Your chemist, one photo away.
            </h1>

            <p className="mt-5 max-w-[54ch] text-[16px] leading-relaxed text-white/60 sm:text-[17px]">
              Build a basket or send a prescription. Choose a branch
              yourself or share your location to find the nearest active
              counter. Confirmation and delivery updates arrive on WhatsApp;
              stock and the final bill are confirmed before fulfilment.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsPrescriptionOpen(true)}
                className="lp-press inline-flex items-center justify-center gap-2.5 rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-[#07110F] hover:bg-[#E6F4F1]"
              >
                <Camera size={18} />
                Send a prescription
              </button>

              {selectedBranch && (
                <a
                  href={`tel:+${digitsOnly(
                    selectedBranch.phone,
                  )}`}
                  className="lp-press inline-flex items-center justify-center gap-2.5 rounded-full border border-white/[0.15] bg-white/5 px-7 py-4 text-[15px] font-semibold text-white backdrop-blur-md hover:bg-white/10"
                >
                  <PhoneCall size={17} />
                  Call {selectedBranchLabel}
                </a>
              )}
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.07] p-5 backdrop-blur-2xl">
              <p className="text-[13px] text-white/50">
                Selected fulfilment
              </p>

              <div className="mt-4 rounded-[24px] bg-white/[0.06] p-4">
                <p className="text-[15px] font-semibold text-white">
                  {selectedBranch
                    ? selectedBranchLabel
                    : 'Choose a branch to start'}
                </p>

                <p className="mt-1 text-[12.5px] leading-relaxed text-white/45">
                  {detectedDistance !== null && selectedBranch
                    ? `${detectedDistance.toFixed(1)} km straight-line · ${selectedBranch.serviceRadiusKm} km service radius`
                    : selectedBranch
                      ? selectedBranch.address
                      : 'Location is never required; manual branch selection always works.'}
                </p>
              </div>

              <button
                type="button"
                onClick={detectNearestBranch}
                disabled={
                  locateStatus === 'loading' ||
                  activeBranches.length === 0
                }
                className="lp-press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B7A6B] py-3 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {locateStatus === 'loading' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Navigation size={15} />
                )}
                Find nearest branch
              </button>
            </div>
          </div>
        </div>
      </section>
<BranchMarquee />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-[24px] font-semibold tracking-[-0.03em] sm:text-[28px]">
            {activeCategory === ALL_CATEGORIES
              ? debouncedQuery
                ? `Results for “${debouncedQuery}”`
                : selectedBranch
                  ? `Available at ${selectedBranchLabel}`
                  : 'Everyday medicines'
              : activeCategory}
          </h2>

          {medicines.length > 0 && (
            <span className="shrink-0 rounded-full border border-[#0B1220]/10 bg-white px-3 py-1.5 text-[12px] font-semibold tabular-nums text-[#0B1220]/60 shadow-sm">
              {medicines.length} shown
            </span>
          )}
        </div>

        {branchesError && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-[24px] bg-rose-50 p-4 text-[13px] font-medium text-rose-700">
            <span>{branchesError}</span>
            <button
              type="button"
              onClick={loadBranches}
              className="shrink-0 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {catalogueLoading && medicines.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="lp-skeleton h-[300px] rounded-[26px]"
              />
            ))}
          </div>
        ) : catalogueError ? (
          <div className="rounded-[32px] bg-white py-20 text-center">
            <AlertCircle
              size={40}
              className="mx-auto mb-4 text-rose-500"
            />
            <p className="text-[17px] font-semibold">
              {catalogueError}
            </p>
            <button
              type="button"
              onClick={() => loadMedicines('reset')}
              className="lp-press mt-6 rounded-full bg-[#0B1220] px-6 py-3 text-[14px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : medicines.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {medicines.map((medicine, index) => (
                <ProductCard
                  key={medicine._id}
                  medicine={medicine}
                  index={index}
                  selectedBranchId={selectedBranch?._id}
                  cartQuantities={cartQuantities}
                  fallbackImageUrl={globalSettings?.fallbackImageUrl}
                  onAdd={addToCart}
                  onUpdateQty={updateQty}
                />
              ))}
            </div>

            <div ref={sentinelRef} className="h-px" />

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => loadMedicines('more')}
                  disabled={loadingMore}
                  className="lp-press flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold"
                >
                  {loadingMore && (
                    <Loader2
                      size={16}
                      className="animate-spin text-[#0B7A6B]"
                    />
                  )}
                  {loadingMore ? 'Loading' : 'Show more'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-[32px] bg-white py-20 text-center">
            <Search
              size={40}
              className="mx-auto mb-4 text-[#0B1220]/25"
            />
            <p className="text-[17px] font-semibold">
              Nothing available for this selection
            </p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[14px] text-[#0B1220]/55">
              Try another branch, clear the filters, or send a prescription
              for pharmacist review.
            </p>
          </div>
        )}
      </main>
      {activeBranches.length > 0 && view === 'store' && (
        <StoreMap branches={activeBranches} />
      )}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            {
              icon: Shield,
              title: 'Prescription-aware checkout',
              body: 'Medicines marked as prescription-required cannot pass checkout without a prescription attachment.',
            },
            {
              icon: Navigation,
              title: 'Branch-aware stock',
              body: 'The catalogue is filtered to the selected active branch and stock is revalidated by the server at checkout.',
            },
            {
              icon: Award,
              title: 'Pharmacist confirmation',
              body: 'The basket is an estimate until staff confirms availability and the final bill.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title}>
              <Icon
                size={22}
                className="mb-4 text-[#0B7A6B]"
              />
              <h3 className="text-[17px] font-semibold">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#0B1220]/60">
                {body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer className="bg-[#07110F] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-16 text-white/60 lg:pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 border-b border-white/10 pb-10 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="flex items-center gap-2.5 text-[24px] font-semibold text-white">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0B7A6B]">
                  <LotusMark />
                </span>
                Lotus Pharmacy
              </p>
              <p className="mt-3 text-[14.5px]">
                Choose from the branches currently accepting orders.
              </p>
            </div>

            {selectedBranch && (
              <a
                href={`tel:+${digitsOnly(
                  selectedBranch.phone,
                )}`}
                className="lp-press inline-flex items-center gap-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4"
              >
                <Phone size={20} className="text-white" />
                <span>
                  <span className="block text-[12.5px]">
                    Call {selectedBranchLabel}
                  </span>
                  <span className="block text-[17px] font-semibold text-white">
                    +{selectedBranch.phone}
                  </span>
                </span>
              </a>
            )}
          </div>

          <div className="grid gap-10 py-12 md:grid-cols-3">
            {activeBranches.map((branch) => (
              <div key={branch._id}>
                <h3 className="mb-4 flex items-center gap-2.5 text-[16px] font-semibold text-white">
                  <Store size={18} />
                  {branch.name}
                </h3>

                <ul className="space-y-3 text-[14px]">
                  <li className="flex items-start gap-3">
                    <MapPin
                      size={17}
                      className="mt-0.5 shrink-0 text-white/35"
                    />
                    <span>{branch.fullAddress}</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Clock
                      size={17}
                      className="text-white/35"
                    />
                    <span>
                      {branch.open24h
                        ? 'Open 24 hours'
                        : 'Check branch hours before ordering'}
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Navigation
                      size={17}
                      className="text-white/35"
                    />
                    <span>
                      Service radius: {branch.serviceRadiusKm} km
                    </span>
                  </li>
                </ul>
              </div>
            ))}
          </div>

          <p className="border-t border-white/10 pt-8 text-[12.5px] text-white/40">
            © {new Date().getFullYear()} Lotus Pharmacy. Prescription
            medicines are dispensed only after pharmacist review of a valid
            prescription.
          </p>
        </div>
      </footer>

      {itemCount > 0 && !isCartOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="lp-press lp-rise pointer-events-auto flex w-full items-center justify-between rounded-full bg-[#0B1220]/95 px-6 py-4 text-white shadow-[0_20px_45px_-20px_rgba(7,17,15,0.9)] backdrop-blur-xl"
          >
            <span className="text-[14px] font-medium">
              {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
              {formatMoney(total)}
            </span>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[#5FE3C6]">
              Review order
              <ArrowRight size={16} />
            </span>
          </button>
        </div>
      )}

      <Sheet
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Your order"
        description={
          itemCount > 0
            ? `${itemCount} item${itemCount === 1 ? '' : 's'} ready to review`
            : undefined
        }
        icon={
          <ShoppingCart
            size={20}
            className="text-[#0B7A6B]"
          />
        }
        footer={
          cart.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  submitting ||
                  !selectedBranch ||
                  (cartNeedsPrescription && !cartRxFile)
                }
                className="lp-press flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#0B7A6B] py-4 text-[15px] font-semibold text-white disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Check size={18} strokeWidth={2.6} />
                )}
                Place order
              </button>
              <p className="mt-3.5 text-center text-[12px] text-[#0B1220]/45">
                A confirmation is sent to your WhatsApp number, and again each
                time the order status changes.
              </p>
            </>
          ) : undefined
        }
      >
        {cart.length === 0 ? (
          <div className="py-20 text-center">
            <ShoppingCart
              size={40}
              className="mx-auto mb-4 text-[#0B1220]/20"
            />
            <p className="text-[17px] font-semibold">
              Nothing in the basket yet
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2.5">
              {cart.map((item) => (
                <li
                  key={item.cartItemId}
                  className="flex gap-3.5 rounded-[24px] bg-[#0B1220]/[0.035] p-3.5"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-2xl shadow-sm border border-[#0B1220]/[0.05]">
                    <ProductThumb
                      fallbackImageUrl={globalSettings?.fallbackImageUrl}
                      medicine={{
                        imageUrl: item.imageUrl,
                        name: item.name,
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14.5px] font-semibold">
                          {item.name}
                        </p>
                        {item.requiresPrescription && (
                          <p className="mt-0.5 text-[11.5px] font-medium text-rose-600">
                            Prescription required
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(item.cartItemId)
                        }
                        className="lp-press shrink-0 rounded-full p-1.5 text-[#0B1220]/35 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <p className="mt-0.5 text-[12.5px] text-[#0B1220]/50">
                      {item.buyType === 'loose'
                        ? 'Single unit'
                        : 'Full pack'}{' '}
                      · {formatMoney(item.unitPrice)}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between">
                      <QuantityStepper
                        qty={item.qty}
                        label={item.name}
                        onDecrease={() =>
                          updateQty(item.cartItemId, -1)
                        }
                        onIncrease={() =>
                          updateQty(item.cartItemId, 1)
                        }
                      />
                      <span className="text-[15px] font-semibold tabular-nums">
                        {formatMoney(
                          item.unitPrice * item.qty,
                        )}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="rounded-[26px] bg-[#E6F4F1] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-[#0B1220]/65">
                  Basket estimate
                </span>
                <span className="text-[22px] font-semibold tabular-nums">
                  {formatMoney(total)}
                </span>
              </div>

              {savings > 0 && (
                <p className="mt-1.5 text-[13px] font-medium text-[#0B7A6B]">
                  You save {formatMoney(savings)} against MRP
                </p>
              )}

              <p className="mt-3 border-t border-[#0B7A6B]/[0.15] pt-3 text-[12.5px] leading-relaxed text-[#0B1220]/55">
                The server rechecks stock and current prices before creating
                the order. No payment is taken here.
              </p>
            </div>

            {cartNeedsPrescription && (
              <section className="rounded-[26px] border border-rose-200 bg-rose-50/50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-rose-700">
                  <FileText size={16} />
                  Prescription required for this basket
                </h3>

                <PrescriptionFilePicker
                  file={cartRxFile}
                  previewUrl={cartRxPreview}
                  error={cartRxError}
                  onPick={(event) =>
                    pickPrescription(event, 'cart')
                  }
                  onClear={clearCartPrescription}
                  inputRef={cartRxInputRef}
                />
              </section>
            )}

            {!user && sessionChecked && (
              <button
                type="button"
                onClick={() => {
                  setIsCartOpen(false);
                  setShowAuth(true);
                }}
                className="w-full rounded-[24px] border border-dashed border-[#0B1220]/[0.15] p-4 text-left text-[13.5px] text-[#0B1220]/60"
              >
                <span className="font-semibold text-[#0B7A6B]">
                  Sign in
                </span>{' '}
                to keep order history and saved delivery details, or continue
                as a guest.
              </button>
            )}

            <DeliveryFields
              address={address}
              errors={addressErrors}
              onChange={handleAddressChange}
              requireArea
            />

            {branchPicker}
          </div>
        )}
      </Sheet>

      <Sheet
        open={isPrescriptionOpen}
        onClose={() => setIsPrescriptionOpen(false)}
        title="Send a prescription"
        description="The image is stored privately and only opened through a short-lived signed link."
        icon={
          <FileText
            size={20}
            className="text-[#0B7A6B]"
          />
        }
        footer={
          <>
            <button
              type="button"
              onClick={handlePrescriptionSubmit}
              disabled={
                submitting ||
                !selectedBranch ||
                !prescriptionFile
              }
              className="lp-press flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#0B7A6B] py-4 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {submitting && (
                <Loader2 size={18} className="animate-spin" />
              )}
              Create prescription order
            </button>
            <p className="mt-3.5 text-center text-[12px] text-[#0B1220]/45">
              The pharmacist reviews the photo in the console and confirms the
              bill on WhatsApp. The prescription image is never shared in a
              message.
            </p>
          </>
        }
      >
        <div className="space-y-4">
          <PrescriptionFilePicker
            file={prescriptionFile}
            previewUrl={previewUrl}
            error={uploadError}
            onPick={(event) =>
              pickPrescription(event, 'standalone')
            }
            onClear={clearStandalonePrescription}
            inputRef={prescriptionInputRef}
          />

          <DeliveryFields
            address={address}
            errors={addressErrors}
            onChange={handleAddressChange}
            requireArea={false}
          />

          {branchPicker}
        </div>
      </Sheet>

      <WelcomeGuide open={showWelcome} onClose={closeWelcome} />

      <AuthSheet
        open={showAuth}
        onClose={() => setShowAuth(false)}
        branchCount={branchCount}
        onAuthenticated={(authenticated) => {
          setUser(authenticated);
          setShowAuth(false);
          notify(
            `Signed in as ${authenticated.name.split(' ')[0]}.`,
          );
        }}
      />

      {user && (
        <AccountSheet
          open={showAccount}
          onClose={() => setShowAccount(false)}
          user={user}
          onUserChange={setUser}
          onLogout={handleLogout}
          onAdmin={() => {
            setShowAccount(false);
            setView('admin');
          }}
          notify={notify}
        />
      )}
    </div>
  );
}
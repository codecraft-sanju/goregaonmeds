'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ShoppingCart, Search, FileText, Phone, MapPin, Clock, X, Plus, Minus, ShieldCheck, UploadCloud, CheckCircle2, ChevronRight, Image as ImageIcon, Info, HeartHandshake, Award, Store, Shield } from 'lucide-react';

// --- ADVANCED MOCK DATA ---
const MEDICINES = [
  { id: 1, name: 'Dolo 650 Tablet', use: 'Fever and Mild Pain Relief', price: 30.50, packSize: 15, packType: 'Strip', unitType: 'Tablet', isDivisible: true, image: '💊', tag: 'Bestseller', category: 'Fever & Pain', mrp: 35.00 },
  { id: 2, name: 'Vicks Action 500', use: 'Cold, Cough and Headache', price: 50.00, packSize: 10, packType: 'Strip', unitType: 'Tablet', isDivisible: true, image: '💊', tag: '', category: 'Cold & Cough', mrp: 55.00 },
  { id: 3, name: 'Digene Antacid Syrup', use: 'Acidity & Gas Relief (200ml)', price: 120.00, packSize: 1, packType: 'Bottle', unitType: 'Bottle', isDivisible: false, image: '🧴', tag: '', category: 'Stomach', mrp: 140.00 },
  { id: 4, name: 'Volini Pain Relief', use: 'Joint & Muscle Pain Spray (60g)', price: 150.00, packSize: 1, packType: 'Spray', unitType: 'Spray', isDivisible: false, image: '🧴', tag: 'Fast Relief', category: 'Fever & Pain', mrp: 170.00 },
  { id: 5, name: 'Honitus Cough Syrup', use: 'Ayurvedic Cough Remedy (100ml)', price: 95.00, packSize: 1, packType: 'Bottle', unitType: 'Bottle', isDivisible: false, image: '🍾', tag: 'Ayurvedic', category: 'Cold & Cough', mrp: 110.00 },
  { id: 6, name: 'Cetirizine 10mg', use: 'Allergy and Runny Nose', price: 20.00, packSize: 10, packType: 'Strip', unitType: 'Tablet', isDivisible: true, image: '💊', tag: '', category: 'Allergy', mrp: 25.00 },
  { id: 7, name: 'Band-Aid Washproof', use: 'First Aid for Cuts', price: 10.00, packSize: 1, packType: 'Pack', unitType: 'Pack', isDivisible: false, image: '🩹', tag: '', category: 'First Aid', mrp: 10.00 },
  { id: 8, name: 'Eno Regular', use: 'Fast Relief from Acidity (5g)', price: 9.00, packSize: 6, packType: 'Box', unitType: 'Sachet', isDivisible: true, image: '🧂', tag: '', category: 'Stomach', mrp: 10.00 },
];

const CATEGORIES = ['All', 'Fever & Pain', 'Cold & Cough', 'Stomach', 'Allergy', 'First Aid'];
const WHATSAPP_NUMBER = '917568045830'; 

export default function MedicalStore() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  
  const [cart, setCart] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [prescriptionImage, setPrescriptionImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState({ name: '', phone: '', houseNo: '', area: '', landmark: '' });

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const filteredMedicines = useMemo(() => {
    let filtered = MEDICINES;
    if (activeCategory !== 'All') filtered = filtered.filter(med => med.category === activeCategory);
    if (searchQuery) {
      filtered = filtered.filter(med => 
        med.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        med.use.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [searchQuery, activeCategory]);

  const addToCart = (medicine: any, type: 'full' | 'loose', quantity: number = 1) => {
    const cartItemId = `${medicine.id}-${type}`;
    const unitPrice = type === 'loose' ? (medicine.price / medicine.packSize) : medicine.price;
    const displayName = type === 'loose' ? `${medicine.name} (Loose ${medicine.unitType})` : `${medicine.name} (${medicine.packType} of ${medicine.packSize})`;

    setCart(prev => {
      const existing = prev.find(item => item.cartItemId === cartItemId);
      if (existing) {
        return prev.map(item => item.cartItemId === cartItemId ? { ...item, qty: item.qty + quantity } : item);
      }
      return [...prev, { 
        ...medicine, cartItemId, buyType: type, qty: quantity, 
        calcPrice: parseFloat(unitPrice.toFixed(2)), displayName
      }];
    });
    setToastMessage(`Added to cart successfully!`);
  };

  const updateQty = (cartItemId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemId === cartItemId) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const removeFromCart = (cartItemId: string) => setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  const cartTotal = cart.reduce((total, item) => total + (item.calcPrice * item.qty), 0).toFixed(2);
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => setAddress({ ...address, [e.target.name]: e.target.value });

  const handleCheckout = () => {
    if (!address.name || !address.houseNo || !address.phone) return alert("Please fill delivery details (Name, Phone, House No, Area).");
    
    let message = `*⚕️ NEW ORDER - LOTUS PHARMACY*\n\n`;
    message += `*👤 Customer:* ${address.name} (${address.phone})\n`;
    message += `*📍 Address:* ${address.houseNo}, ${address.area}${address.landmark ? `, ${address.landmark}` : ''}\n\n`;
    message += `*🛒 Items Ordered:*\n`;
    
    cart.forEach((item, index) => {
      message += `${index + 1}. ${item.displayName} ➔ Qty: ${item.qty} (₹${(item.calcPrice * item.qty).toFixed(2)})\n`;
    });
    
    message += `\n*🧾 Estimated Total: ₹${cartTotal}*`;
    message += `\n\n_Please confirm the availability._`;

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
    setIsCartOpen(false); setCart([]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPrescriptionImage(file); setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handlePrescriptionSubmit = async () => {
    if (!address.name || !address.houseNo || !address.phone) return alert("Please fill delivery details.");
    if (!prescriptionImage) return alert("Please upload prescription image.");

    let message = `*📝 PRESCRIPTION ORDER*\n\n*👤 Name:* ${address.name}\n*📱 Phone:* ${address.phone}\n*📍 Address:* ${address.houseNo}, ${address.area}\n\n_Hello, please check the attached prescription and send me the total bill._`;

    if (navigator.canShare && navigator.canShare({ files: [prescriptionImage] })) {
      try {
        await navigator.share({ files: [prescriptionImage], title: 'Prescription', text: message });
        setIsPrescriptionOpen(false); return;
      } catch (error) { console.log("Share failed", error); }
    } 
    alert("On the next screen, please attach the image manually in WhatsApp.");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
    setIsPrescriptionOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in zoom-in duration-200">
          <div className="bg-gray-800 text-white px-5 py-2.5 rounded-lg shadow-xl flex items-center gap-2 text-sm font-medium border border-gray-700">
            <CheckCircle2 size={16} className="text-green-400" />
            {toastMessage}
          </div>
        </div>
      )}

      {/* HEADER - SLEEK & COMPACT */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="bg-[#0f766e] text-white text-[11px] py-1 px-4 text-center flex justify-center items-center gap-1.5 font-medium tracking-wide uppercase">
          <Clock size={12} /> 24/7 Delivery in Goregaon, Mumbai
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center flex-wrap gap-4">
            
            <div className="flex flex-col cursor-pointer">
              <h1 className="text-2xl font-bold text-[#0f766e] tracking-tight leading-none flex items-center gap-1">
                Lotus<span className="text-gray-800 font-extrabold">Pharmacy</span>
              </h1>
              <span className="text-[9px] text-gray-500 font-bold tracking-widest mt-0.5">APPLE PHARMACY & HEALTH ZONE</span>
            </div>

            <div className="flex-1 max-w-xl min-w-[240px]">
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="Search for medicines..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border border-transparent rounded-lg focus:bg-white focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] transition-all outline-none text-sm font-medium text-gray-700"
                />
                <Search className="absolute left-3.5 top-2.5 text-gray-400 group-focus-within:text-[#0f766e]" size={18} />
              </div>
            </div>

            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-gray-600 hover:text-[#0f766e] hover:bg-teal-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <ShoppingCart size={24} />
              <span className="hidden sm:inline font-semibold text-sm">Cart</span>
              {cart.length > 0 && (
                <span className="absolute top-0 right-0 sm:right-8 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center transform translate-x-1 -translate-y-1">
                  {cart.reduce((acc, curr) => acc + curr.qty, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* COMPACT HERO SECTION */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-xl text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Order Medicines via <span className="text-[#0f766e]">Prescription</span>
            </h2>
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              Upload your doctor's prescription and get your medicines delivered fast & securely at your doorstep. 100% Genuine.
            </p>
            <button 
              onClick={() => setIsPrescriptionOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-[#0f766e] hover:bg-[#115e59] text-white px-6 py-2.5 rounded-lg font-semibold text-sm shadow-md transition-colors"
            >
              <UploadCloud size={18} /> Upload Prescription
            </button>
          </div>
          
          <div className="hidden md:flex items-center justify-center bg-teal-50 p-6 rounded-2xl border border-teal-100">
             <div className="flex items-start gap-4">
               <ShieldCheck size={32} className="text-[#0f766e]" />
               <div>
                 <h4 className="font-bold text-gray-800 text-sm">Verified Pharmacy</h4>
                 <p className="text-xs text-gray-500 mt-1 max-w-[200px]">All medicines are checked by registered pharmacists before dispatch.</p>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* CATEGORIES */}
      <div className="bg-white border-b border-gray-200 sticky top-[68px] sm:top-[74px] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="flex gap-2 overflow-x-auto custom-scrollbar">
            {CATEGORIES.map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${activeCategory === cat ? 'bg-[#0f766e] text-white border-[#0f766e]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PRODUCT GRID */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
          {filteredMedicines.map(med => (
            <ProductCard key={med.id} medicine={med} addToCart={addToCart} />
          ))}
        </div>
        
        {filteredMedicines.length === 0 && (
          <div className="text-center py-20">
            <Search size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-semibold text-gray-700">No medicines found</p>
          </div>
        )}
      </main>

      {/* --- NEW: TRUST & ETHICS SECTION --- */}
      <section className="bg-white py-12 border-t border-gray-200 mt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Our Patient-First Promise</h2>
            <p className="text-sm text-gray-500">We believe healthcare is about healing, not business. Here is why Goregaon trusts us with their health.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-teal-50/50 p-6 rounded-2xl border border-teal-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-teal-100 mb-4">
                <HeartHandshake className="text-[#0f766e]" size={24} />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Ethics Over Margins</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Many pharmacies push high-margin generics that may not be effective. We strictly dispense exactly what your doctor prescribed or the most effective formulation to ensure your rapid recovery.
              </p>
            </div>
            
            {/* Card 2 */}
            <div className="bg-teal-50/50 p-6 rounded-2xl border border-teal-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-teal-100 mb-4">
                <Shield className="text-[#0f766e]" size={24} />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">100% Genuine Medicines</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                We source our inventory directly from authorized distributors and manufacturers. Every single pill sold across our 3 branches is verifiable, authentic, and safely stored.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-teal-50/50 p-6 rounded-2xl border border-teal-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-teal-100 mb-4">
                <Award className="text-[#0f766e]" size={24} />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Expert Guidance</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                We don't just hand over medicines. Our experienced pharmacists guide you on dosages, side effects, and precautions to ensure you get the absolute best care possible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- NEW: MULTI-BRANCH FOOTER --- */}
      <footer className="bg-gray-900 text-gray-300 pt-16 pb-8 border-t-4 border-[#0f766e]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="mb-10 pb-10 border-b border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-1">
                Lotus<span className="text-[#14b8a6]">Pharmacy</span>
              </h1>
              <p className="text-sm text-gray-400 mt-2">Serving health across Goregaon, Mumbai 24x7.</p>
            </div>
            <div className="flex items-center gap-3 bg-gray-800 p-3 rounded-lg border border-gray-700">
              <Phone className="text-[#14b8a6]" size={20} />
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Order on WhatsApp</p>
                <p className="text-white font-bold">+91 7568045830</p>
              </div>
            </div>
          </div>

          {/* Branches Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            
            {/* Branch 1 */}
            <div>
              <h4 className="text-white font-bold flex items-center gap-2 mb-4 text-lg">
                <Store className="text-[#14b8a6]" size={20} /> Lotus Pharmacy
              </h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <MapPin className="shrink-0 mt-0.5 text-gray-500" size={16} />
                  <span>Shop No. 1 & 2, Ground Floor, XYZ Building, Near Station Road, Goregaon (West), Mumbai - 400104</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="shrink-0 text-gray-500" size={16} />
                  <span>Open 24 Hours</span>
                </li>
              </ul>
            </div>

            {/* Branch 2 */}
            <div>
              <h4 className="text-white font-bold flex items-center gap-2 mb-4 text-lg">
                <Store className="text-[#14b8a6]" size={20} /> Apple Pharmacy
              </h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <MapPin className="shrink-0 mt-0.5 text-gray-500" size={16} />
                  <span>Shop No. 5, ABC Complex, Opposite Local Market, S.V. Road, Goregaon (East), Mumbai - 400063</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="shrink-0 text-gray-500" size={16} />
                  <span>Open 24 Hours</span>
                </li>
              </ul>
            </div>

            {/* Branch 3 */}
            <div>
              <h4 className="text-white font-bold flex items-center gap-2 mb-4 text-lg">
                <Store className="text-[#14b8a6]" size={20} /> Health Zone
              </h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <MapPin className="shrink-0 mt-0.5 text-gray-500" size={16} />
                  <span>Shop No. 12, DEF Plaza, New Link Road, Near Goregaon Sports Club, Malad West / Goregaon Border, Mumbai</span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="shrink-0 text-gray-500" size={16} />
                  <span>Open 24 Hours</span>
                </li>
              </ul>
            </div>

          </div>

          <div className="text-center text-xs text-gray-600 pt-6">
            <p>&copy; {new Date().getFullYear()} Lotus Pharmacy & Group. All Rights Reserved.</p>
          </div>
        </div>
      </footer>

      {/* CART DRAWER (Sleek UI) */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={() => setIsCartOpen(false)}></div>
          
          <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <ShoppingCart size={20} className="text-[#0f766e]" /> Cart ({cart.length})
              </h2>
              <button onClick={() => setIsCartOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 bg-gray-50 custom-scrollbar">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" />
                  <h3 className="text-sm font-semibold text-gray-700">Cart is Empty</h3>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={item.cartItemId} className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="pr-2">
                            <h4 className="font-semibold text-gray-800 text-sm">{item.name}</h4>
                            <p className="text-[10px] text-gray-500 font-medium">
                              Type: {item.buyType === 'loose' ? `Loose ${item.unitType}` : `Full ${item.packType} (${item.packSize} ${item.unitType}s)`}
                            </p>
                          </div>
                          <button onClick={() => removeFromCart(item.cartItemId)} className="text-gray-400 hover:text-red-500"><X size={16}/></button>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center border border-gray-200 rounded-md">
                            <button onClick={() => updateQty(item.cartItemId, -1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-50"><Minus size={12}/></button>
                            <span className="w-7 text-center font-medium text-xs text-gray-800">{item.qty}</span>
                            <button onClick={() => updateQty(item.cartItemId, 1)} className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-50"><Plus size={12}/></button>
                          </div>
                          <span className="text-sm font-bold text-gray-900">₹{(item.calcPrice * item.qty).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-100 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Total Bill</span>
                    <span className="text-lg font-bold text-[#0f766e]">₹{cartTotal}</span>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <h3 className="font-bold text-gray-800 mb-3 text-xs uppercase tracking-wide">Delivery Address</h3>
                    <div className="space-y-2.5">
                      <input type="text" name="name" placeholder="Full Name" value={address.name} onChange={handleAddressChange} className="w-full p-2 bg-gray-50 rounded border border-gray-200 focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none text-sm" />
                      <input type="tel" name="phone" placeholder="Mobile Number" value={address.phone} onChange={handleAddressChange} className="w-full p-2 bg-gray-50 rounded border border-gray-200 focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none text-sm" />
                      <div className="flex gap-2">
                        <input type="text" name="houseNo" placeholder="House/Flat No" value={address.houseNo} onChange={handleAddressChange} className="w-1/2 p-2 bg-gray-50 rounded border border-gray-200 focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none text-sm" />
                        <input type="text" name="area" placeholder="Area / Locality" value={address.area} onChange={handleAddressChange} className="w-1/2 p-2 bg-gray-50 rounded border border-gray-200 focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e] outline-none text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <button 
                  onClick={handleCheckout}
                  className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 rounded-lg font-bold text-sm flex justify-center items-center gap-2 transition-colors"
                >
                  <Phone size={18} fill="currentColor" /> Send Order via WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRESCRIPTION MODAL */}
      {isPrescriptionOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/60" onClick={() => setIsPrescriptionOpen(false)}></div>
           <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <FileText size={18} className="text-[#0f766e]" /> Upload Prescription
              </h2>
              <button onClick={() => setIsPrescriptionOpen(false)} className="p-1 text-gray-500 hover:text-gray-800"><X size={20} /></button>
            </div>
            
            <div className="p-5 space-y-5 overflow-y-auto max-h-[80vh] custom-scrollbar">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${previewUrl ? 'border-[#0f766e] bg-teal-50/50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
              >
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="max-h-40 rounded shadow-sm object-contain" />
                ) : (
                  <>
                    <ImageIcon size={28} className="text-[#0f766e] mb-2" />
                    <p className="font-semibold text-sm text-gray-700">Tap to upload picture</p>
                    <p className="text-[10px] text-gray-400 mt-1">Ensure text is readable</p>
                  </>
                )}
              </div>

              <div className="space-y-2.5">
                <label className="font-bold text-gray-800 text-xs uppercase tracking-wide">Delivery Details</label>
                <input type="text" name="name" placeholder="Name *" value={address.name} onChange={handleAddressChange} className="w-full p-2.5 bg-gray-50 rounded border border-gray-200 outline-none text-sm" />
                <input type="tel" name="phone" placeholder="Phone Number *" value={address.phone} onChange={handleAddressChange} className="w-full p-2.5 bg-gray-50 rounded border border-gray-200 outline-none text-sm" />
                <input type="text" name="houseNo" placeholder="Full Address (House, Area) *" value={address.houseNo} onChange={handleAddressChange} className="w-full p-2.5 bg-gray-50 rounded border border-gray-200 outline-none text-sm" />
              </div>

              <button 
                onClick={handlePrescriptionSubmit}
                className="w-full bg-[#0f766e] hover:bg-[#115e59] text-white py-3 rounded-lg font-bold text-sm flex justify-center items-center gap-2"
              >
                Proceed Securely
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  );
}

// --- SUB-COMPONENT: PRODUCT CARD ---
function ProductCard({ medicine, addToCart }: { medicine: any, addToCart: Function }) {
  const [buyType, setBuyType] = useState<'full' | 'loose'>('full');
  
  const unitPrice = (medicine.price / medicine.packSize).toFixed(2);
  const isLoose = buyType === 'loose';

  return (
    <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col relative h-full">
      
      {medicine.tag && (
        <span className="absolute top-2 left-2 bg-[#0f766e] text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded z-10">
          {medicine.tag}
        </span>
      )}

      <div className="h-28 w-full bg-gray-50 rounded-lg mb-3 flex items-center justify-center text-4xl border border-gray-100">
        {medicine.image}
      </div>
      
      <div className="flex-1">
        <h4 className="font-bold text-sm text-gray-900 leading-snug line-clamp-2 mb-1" title={medicine.name}>{medicine.name}</h4>
        
        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium mb-1.5 bg-gray-100 w-fit px-1.5 py-0.5 rounded">
          <Info size={10} /> 
          {medicine.isDivisible ? `1 ${medicine.packType} = ${medicine.packSize} ${medicine.unitType}s` : `1 ${medicine.packType}`}
        </div>
        
        <p className="text-[11px] text-gray-400 line-clamp-1 mb-2">{medicine.use}</p>
      </div>
      
      {medicine.isDivisible && (
        <div className="grid grid-cols-2 gap-1 mb-3 bg-gray-100 p-0.5 rounded-md border border-gray-200">
          <button 
            onClick={() => setBuyType('full')}
            className={`py-1 text-[10px] font-bold rounded ${!isLoose ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Strip ({medicine.packSize})
          </button>
          <button 
            onClick={() => setBuyType('loose')}
            className={`py-1 text-[10px] font-bold rounded ${isLoose ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            1 Tablet
          </button>
        </div>
      )}

      <div className="mt-auto flex items-end justify-between border-t border-dashed border-gray-200 pt-2">
        <div className="flex flex-col">
          <span className="text-[9px] text-gray-400 font-medium line-through">MRP ₹{isLoose ? (medicine.mrp / medicine.packSize).toFixed(2) : medicine.mrp}</span>
          <span className="font-bold text-base text-gray-900 leading-none mt-0.5">
            ₹{isLoose ? unitPrice : medicine.price.toFixed(2)}
          </span>
        </div>
        
        <button 
          onClick={() => addToCart(medicine, buyType, 1)}
          className="bg-teal-50 hover:bg-[#0f766e] text-[#0f766e] hover:text-white px-3 py-1.5 rounded-md font-bold text-xs transition-colors border border-teal-200 hover:border-[#0f766e]"
        >
          ADD
        </button>
      </div>
    </div>
  );
}
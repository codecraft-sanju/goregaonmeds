// BranchMarquee.tsx
'use client';

import React from 'react';
import { ShieldPlus, Activity, HeartPulse, MapPin } from 'lucide-react';

export function BranchMarquee() {
  const items = [
    { name: 'Apple Pharmacy', icon: <ShieldPlus size={16} /> },
    { name: 'Latus Pharmacy', icon: <Activity size={16} /> },
    { name: 'Healthzone', icon: <HeartPulse size={16} /> },
    { name: 'Serving Goregaon, Mumbai', icon: <MapPin size={16} /> },
  ];

  // We duplicate the array a few times to ensure a seamless infinite scroll
  const marqueeItems = [...items, ...items, ...items, ...items, ...items];

  return (
    <div className="relative flex overflow-hidden bg-[#050C0A] border-b border-white/[0.04] py-3.5 sm:py-4 select-none">
      {/* Internal CSS for the infinite scroll animation */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes infinite-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-infinite-scroll {
            width: max-content;
            animation: infinite-scroll 25s linear infinite;
          }
          .animate-infinite-scroll:hover {
            animation-play-state: paused;
          }
        `
      }} />

      {/* Left and Right Fade Masks for a premium look */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-32 bg-gradient-to-r from-[#050C0A] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-32 bg-gradient-to-l from-[#050C0A] to-transparent" />

      {/* Scrolling Track */}
      <div className="animate-infinite-scroll flex items-center">
        {marqueeItems.map((item, index) => (
          <div 
            key={index} 
            className="flex items-center gap-2.5 px-6 sm:px-10 text-[12px] sm:text-[13.5px] font-medium tracking-wide uppercase text-white/60 transition-colors hover:text-white"
          >
            <span className="text-[#0B7A6B]">{item.icon}</span>
            {item.name}
            {/* The dot separator */}
            <span className="ml-6 sm:ml-10 text-white/10 text-lg leading-none">•</span>
          </div>
        ))}
      </div>
    </div>
  );
}
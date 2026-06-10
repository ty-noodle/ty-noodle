"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { reportOrderDebugClient } from "@/lib/order-debug";

export function PageLoader() {
  const pathname = usePathname();
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let current = 0;
    let timer: NodeJS.Timeout;

    const tick = () => {
      // Smart progressive loading algorithm (fast at start, creeps towards 98% to prevent freeze)
      if (current < 65) {
        current += Math.floor(Math.random() * 10) + 8; // Snap quickly to 65%
      } else if (current < 85) {
        current += Math.floor(Math.random() * 4) + 1;  // Slower climb to 85%
      } else if (current < 98) {
        current += 0.5;                                // Ultra-slow creep up to 98%
      }

      setPercent(Math.min(98, Math.floor(current)));

      // Dynamic pacing delay
      const delay = current < 65 ? 80 : current < 85 ? 180 : 350;
      timer = setTimeout(tick, delay);
    };

    tick();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pathname !== "/order") return;

    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      void reportOrderDebugClient("page_loader_slow", {
        durationMs: Date.now() - startedAt,
        pathname,
        percent: 98,
      });
    }, 2200);

    return () => {
      window.clearTimeout(timer);
      void reportOrderDebugClient("page_loader_complete", {
        durationMs: Date.now() - startedAt,
        pathname,
      });
    };
  }, [pathname]);

  // Safe CSS position calculation in JavaScript to prevent mobile parsing errors
  const slidingOffset = percent * 0.48;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] p-6 font-sans">
      {/* Modern, Minimalist Card Container */}
      <div className="flex flex-col items-center justify-center bg-white rounded-3xl p-10 border border-slate-100 shadow-[0_20px_50px_rgba(0,51,102,0.06)] w-[360px] mx-auto animate-fadeIn relative overflow-hidden h-[180px]">
        
        {/* Sliding Logo + Dots Container */}
        <div 
          className="absolute top-10 flex items-center gap-3 transition-all duration-75 ease-out"
          style={{ 
            left: `calc(20px + ${slidingOffset}%)` 
          }}
        >
          {/* 3 Trailing Dots (Pulsing) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {[2, 1, 0].map((i) => (
              <span
                key={i}
                className="block rounded-full bg-[#003366]"
                style={{
                  width: "7px",
                  height: "7px",
                  animation: `trail-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </div>

          {/* Large Logo */}
          <Image
            src="/ty-noodles-logo-cropped.png"
            alt="T&Y Noodles"
            width={180}
            height={64}
            priority
            className="h-11 w-auto object-contain filter drop-shadow-[0_4px_8px_rgba(0,51,102,0.04)]"
          />
        </div>

        {/* Minimalist Progress Bar Wrapper (Fixed at the bottom) */}
        <div className="absolute bottom-10 w-[320px] flex flex-col items-center">
          {/* Progress Bar Track */}
          <div className="w-full h-2 bg-slate-100 rounded-full border border-slate-200/50 overflow-hidden relative shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-[#003366] to-[#0055a5] rounded-full transition-all duration-75 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Clean Status & Percentage */}
          <div className="flex justify-between items-center w-full mt-3 px-0.5">
            <span className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">
              กำลังโหลด...
            </span>
            <span className="text-[12px] font-black text-[#003366] font-mono tracking-tight">
              {percent}%
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes trail-dot {
          0%, 100% { opacity: 0.15; transform: scale(0.7); }
          50%       { opacity: 1;    transform: scale(1.1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}

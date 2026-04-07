import Image from "next/image";

export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Trailing dots — left side (behind the truck) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {[2, 1, 0].map((i) => (
            <span
              key={i}
              className="block rounded-full bg-accent-600"
              style={{
                width: "clamp(10px, 1.8vw, 18px)",
                height: "clamp(10px, 1.8vw, 18px)",
                animation: `trail-dot 1.4s ease-in-out ${i * 0.22}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Logo */}
        <Image
          src="/ty-noodles-logo-cropped.png"
          alt="T&Y Noodles"
          width={400}
          height={146}
          priority
          className="h-auto w-[200px] sm:w-[280px] md:w-[340px] lg:w-[400px] object-contain drop-shadow-md"
        />
      </div>

      <style>{`
        @keyframes trail-dot {
          0%, 100% { opacity: 0.12; transform: scale(0.65); }
          50%       { opacity: 1;    transform: scale(1);    }
        }
      `}</style>
    </div>
  );
}

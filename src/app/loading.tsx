import Image from "next/image";

export default function Loading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f7fbff] px-6">
      <div className="flex flex-col items-center">
        <Image
          src="/ty-noodles-logo-cropped.png"
          alt="T&Y Noodles"
          width={200}
          height={120}
          fetchPriority="high"
          className="h-auto w-40"
        />
        <div className="mt-6 h-1 w-16 overflow-hidden rounded-full bg-[#003366]/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#003366]" />
        </div>
      </div>
    </main>
  );
}

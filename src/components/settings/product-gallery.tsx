"use client";

import Image from "next/image";
import { useState } from "react";

type ProductGalleryProps = {
  images: string[];
  name: string;
};

export function ProductGallery({ images, name }: ProductGalleryProps) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-[1.5rem] border border-dashed border-accent-200 bg-accent-50 text-sm text-stone-650">
        ยังไม่มีรูปสินค้า
      </div>
    );
  }

  const currentImage = images[index] ?? images[0];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-accent-50">
        <Image
          src={currentImage}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover"
        />
      </div>
      {images.length > 1 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {images.map((image, imageIndex) => (
            <button
              key={`${image}-${imageIndex}`}
              type="button"
              onClick={() => setIndex(imageIndex)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border ${
                imageIndex === index
                  ? "border-accent-500 shadow-[0_10px_20px_rgba(0,0,255,0.12)]"
                  : "border-accent-100"
              }`}
            >
              <Image
                src={image}
                alt={`${name} ${imageIndex + 1}`}
                fill
                sizes="56px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

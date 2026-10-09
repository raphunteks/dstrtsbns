import Image from "next/image";
import { cn } from "@/lib/cn";
import { productImageUrl } from "@/lib/media";

type ProductImageProps = {
  image: { objectKey: string; altText: string } | null;
  sizes: string;
  priority?: boolean;
  className?: string;
};

/** Foto produk rasio 4:5 (DESIGN.md §6.4). Tanpa foto → bidang netral, bukan gambar palsu. */
export function ProductImage({ image, sizes, priority = false, className }: ProductImageProps) {
  return (
    <div className={cn("relative aspect-[4/5] overflow-hidden rounded-card bg-paper-3", className)}>
      {image ? (
        <Image
          src={productImageUrl(image.objectKey)}
          alt={image.altText}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-small text-muted">Foto belum tersedia</span>
      )}
    </div>
  );
}

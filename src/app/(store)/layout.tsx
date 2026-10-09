import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { db } from "@/server/db/client";
import { listActiveCategories } from "@/server/modules/catalog/queries";
import { getCurrentCartCount } from "@/server/modules/cart/current";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [cartCount, categories, settings] = await Promise.all([
    getCurrentCartCount(),
    listActiveCategories(db),
    db.storeSettings.findUnique({ where: { id: 1 }, select: { supportEmail: true, supportWhatsapp: true } }),
  ]);
  const topCategories = categories.filter((c) => c.parentId === null);

  return (
    <>
      <Header cartCount={cartCount} categories={topCategories} />
      <main id="konten" className="pb-20 md:pb-0">
        {children}
      </main>
      <Footer supportEmail={settings?.supportEmail ?? null} supportWhatsapp={settings?.supportWhatsapp ?? null} />
      <MobileBottomNav cartCount={cartCount} />
    </>
  );
}

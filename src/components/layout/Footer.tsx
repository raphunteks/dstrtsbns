import Link from "next/link";
import { BrandLockup } from "@/components/brand/BrandLockup";

type FooterProps = { supportEmail: string | null; supportWhatsapp: string | null };

const help = [
  { href: "/bantuan/cara-belanja", label: "Cara belanja" },
  { href: "/bantuan/pengiriman", label: "Pengiriman" },
  { href: "/bantuan/retur", label: "Retur & refund" },
  { href: "/pesanan/lacak", label: "Lacak pesanan" },
];
const legal = [
  { href: "/kebijakan/privasi", label: "Kebijakan privasi" },
  { href: "/kebijakan/syarat", label: "Syarat & ketentuan" },
];

export function Footer({ supportEmail, supportWhatsapp }: FooterProps) {
  const wa = supportWhatsapp?.replace(/\D/g, "").replace(/^0/, "62");
  return (
    <footer className="mt-16 border-t border-rule bg-paper-2">
      <div className="mx-auto grid max-w-[var(--layout-max)] gap-8 px-4 py-10 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <BrandLockup />
          <p className="mt-3 max-w-[var(--layout-readable)] text-small text-muted">
            Daster dan pakaian rumah wanita. Stok, harga, dan ongkir ditampilkan apa adanya sebelum kamu bayar.
          </p>
        </div>
        <nav aria-label="Bantuan">
          <h2 className="text-small font-bold text-ink">Bantuan</h2>
          <ul className="mt-2">
            {help.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-[var(--touch-target)] items-center text-small text-muted hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-small font-bold text-ink">Hubungi kami</h2>
          <ul className="mt-2">
            {wa ? (
              <li>
                <a href={`https://wa.me/${wa}`} rel="noopener" className="inline-flex min-h-[var(--touch-target)] items-center text-small text-muted hover:text-ink">
                  WhatsApp {supportWhatsapp}
                </a>
              </li>
            ) : null}
            {supportEmail ? (
              <li>
                <a href={`mailto:${supportEmail}`} className="inline-flex min-h-[var(--touch-target)] items-center text-small break-all text-muted hover:text-ink">
                  {supportEmail}
                </a>
              </li>
            ) : null}
            {legal.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-[var(--touch-target)] items-center text-small text-muted hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-rule px-4 py-4 text-center text-caption text-muted">
        © {new Date().getFullYear()} Daster Tasbon Olshop
      </p>
    </footer>
  );
}

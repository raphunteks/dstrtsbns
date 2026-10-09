import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";

/**
 * Menyegarkan sesi Supabase dan menahan akses tanpa sesi ke /akun dan /admin.
 * Ini hanya lapisan kenyamanan — hak akses SEBENARNYA selalu diperiksa ulang di server (SEC-002).
 * Tidak memakai Prisma (middleware bisa berjalan di Edge runtime).
 * Halaman katalog publik sengaja tidak melewati middleware agar tetap cepat (NFR-002).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const needsCustomer = pathname.startsWith("/akun");
  const needsStaff = pathname.startsWith("/admin") && !pathname.startsWith("/admin/masuk");

  if (!user && (needsCustomer || needsStaff)) {
    const url = request.nextUrl.clone();
    url.pathname = needsStaff ? "/admin/masuk" : "/masuk";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/akun/:path*",
    "/admin/:path*",
    "/checkout/:path*",
    "/pesanan/:path*",
    "/masuk",
    "/daftar",
  ],
};

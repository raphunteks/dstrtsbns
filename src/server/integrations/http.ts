import "server-only";

/**
 * Pemanggil HTTP untuk provider eksternal (FR-090):
 * timeout per percobaan, retry terbatas dengan backoff eksponensial + jitter hanya untuk
 * kegagalan sementara (jaringan, 429, 5xx), dan log tanpa secret/payload.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: "auth" | "rate_limited" | "unavailable" | "bad_request" | "not_found" | "invalid_response",
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ProviderResponse = { status: number; body: unknown };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function providerRequest(opts: {
  provider: string;
  url: string;
  init: RequestInit;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retries?: number;
}): Promise<ProviderResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150));
    }
    let response: Response;
    try {
      response = await fetchImpl(opts.url, { ...opts.init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      lastError = new ProviderError(opts.provider, "unavailable", null, "Gagal menghubungi provider");
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new ProviderError(
        opts.provider,
        response.status === 429 ? "rate_limited" : "unavailable",
        response.status,
        `Provider merespons ${response.status}`,
      );
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      // Jangan retry: kunci salah tidak akan membaik. Log tanpa menyebut nilai kunci.
      console.error(`[${opts.provider}] autentikasi ditolak (${response.status}) — periksa API key`);
      throw new ProviderError(opts.provider, "auth", response.status, "Autentikasi provider ditolak");
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      throw new ProviderError(opts.provider, "invalid_response", response.status, "Respons bukan JSON");
    }
    return { status: response.status, body };
  }

  console.error(`[${opts.provider}] gagal setelah ${retries + 1} percobaan: ${lastError?.message}`);
  throw lastError ?? new ProviderError(opts.provider, "unavailable", null, "Provider tidak tersedia");
}

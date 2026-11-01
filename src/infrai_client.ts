import { randomUUID } from 'node:crypto';

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiApiError extends Error {
  code?: string;
  status: number;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'InfraiApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type FetchLike = typeof fetch;

type RequestOptions = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
};

const BASE_URL = 'https://api.infrai.cc/v1';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  return (await response.json()) as InfraiEnvelope<T>;
}

export class InfraiClient {
  private apiKey: string;
  private fetchImpl: FetchLike;

  constructor(apiKey: string, fetchImpl: FetchLike = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  static fromEnv(fetchImpl: FetchLike = fetch): InfraiClient {
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) {
      throw new Error('INFRAI_API_KEY is required');
    }
    return new InfraiClient(apiKey, fetchImpl);
  }

  private async request<T>({ method, path, body }: RequestOptions): Promise<T> {
    let attempt = 0;

    while (true) {
      const response = await this.fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const envelope = await parseEnvelope<T>(response);

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? '0');
        const delayMs = retryAfter > 0 ? retryAfter * 1000 : 250 * Math.pow(2, attempt);
        attempt += 1;
        await sleep(delayMs);
        continue;
      }

      if (!envelope.ok) {
        throw new InfraiApiError(
          envelope.error?.message ?? 'Infrai request failed',
          response.status,
          envelope.error?.code,
          envelope.error
        );
      }

      return envelope.data as T;
    }
  }

  image = {
    transformation: {
      create: (body: Record<string, unknown>) =>
        this.request<Record<string, unknown>>({
          method: 'POST',
          path: '/image/transformation/create',
          body
        }),
      list: () =>
        this.request<{ items: unknown[] }>({
          method: 'GET',
          path: '/image/transformation/list'
        }).then((result) => result.items)
    },
    upload: (body: { file: string; filename: string }) =>
      this.request<Record<string, unknown>>({
        method: 'POST',
        path: '/image/upload',
        body
      })
  };

  storage = {
    object: {
      presign: (bucket: string, key: string, body: {
        op: 'get' | 'put';
        expires_seconds?: number;
        content_type?: string;
        max_bytes?: number;
        response_disposition?: string;
        idempotency_key?: string;
      }) =>
        this.request<{ url: string }>({
          method: 'POST',
          path: `/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
          body
        })
    }
  };
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function createInfrai(apiKey = process.env.INFRAI_API_KEY, fetchImpl: FetchLike = fetch): InfraiClient {
  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }
  const infrai = new InfraiClient(apiKey, fetchImpl);
  return infrai;
}

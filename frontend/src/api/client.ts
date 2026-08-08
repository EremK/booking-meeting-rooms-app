export const API_URL = import.meta.env.VITE_API_URL as string;
const HTTP_NO_CONTENT = 204;

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new ApiError('Сервер недоступний. Спробуйте пізніше.', 0);
  }

  if (!response.ok) {
    const body = await safeParseJson(response);
    throw new ApiError(extractErrorMessage(body) ?? 'Сталася помилка. Спробуйте ще раз.', response.status, extractFieldErrors(body));
  }

  if (response.status === HTTP_NO_CONTENT) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function extractErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return undefined;
}

function extractFieldErrors(body: unknown): Record<string, string[]> | undefined {
  if (body && typeof body === 'object' && 'fieldErrors' in body) {
    return (body as { fieldErrors: Record<string, string[]> }).fieldErrors;
  }
  return undefined;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, data?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};

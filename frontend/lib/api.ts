export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    return JSON.stringify(body.detail ?? body);
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export async function apiGet<T>(path: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api/backend${path}`, { cache: "no-store", signal: options.signal });
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, form: FormData, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api/backend${path}`, { method: "POST", body: form, signal: options.signal });
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string, body: unknown): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`/api/backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "equitylens-export";
  return { blob: await response.blob(), filename };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

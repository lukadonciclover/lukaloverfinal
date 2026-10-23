import {
  formatFinancialLabel,
  formatFinancialMessage,
} from "./financial-formatting";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string")
      return formatFinancialMessage(body.detail);
    if (Array.isArray(body.detail))
      return body.detail
        .map((issue: { loc?: Array<string | number>; msg?: string }) => {
          const location = issue.loc
            ?.filter((part) => part !== "body")
            .map((part) =>
              typeof part === "number"
                ? "Year/Row " + (part + 1)
                : formatFinancialLabel(part),
            )
            .join(" / ");
          return [
            location,
            formatFinancialMessage(issue.msg ?? "Invalid input"),
          ]
            .filter(Boolean)
            .join(": ");
        })
        .join("; ");
    return JSON.stringify(body.detail ?? body);
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export async function apiGet<T>(
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    cache: "no-store",
    signal: options.signal,
  });
  if (!response.ok)
    throw new ApiError(await parseError(response), response.status);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok)
    throw new ApiError(await parseError(response), response.status);
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, form: FormData, options: { signal?: AbortSignal; onUploaded?: () => void } = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => { xhr.abort(); fail(new DOMException("Upload cancelled.", "AbortError")); };
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener("abort", abort, { once: true });
    xhr.open("POST", `/api/backend${path}`);
    xhr.timeout = 120_000;
    xhr.upload.onload = () => options.onUploaded?.();
    xhr.onerror = () => fail(new Error("Network interruption. Check your connection and retry this file."));
    xhr.ontimeout = () => fail(new Error("Document processing timed out. Upload fewer PDF pages or a structured table and retry."));
    xhr.onload = () => {
      cleanup();
      let body: unknown;
      try { body = JSON.parse(xhr.responseText); } catch { reject(new Error("The document service returned an unreadable response. Retry with a smaller document.")); return; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
        if (typeof detail === "string") reject(new ApiError(formatFinancialMessage(detail), xhr.status));
        else if (xhr.status === 413) reject(new ApiError("This file exceeds the current 4 MB upload limit. Save relevant pages as a smaller PDF and retry.", xhr.status));
        else void parseError(new Response(xhr.responseText, { status: xhr.status })).then((message) => reject(new ApiError(message, xhr.status)));
      }
    };
    xhr.send(form);
  });
}

export async function apiDownload(
  path: string,
  body: unknown,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`/api/backend${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new ApiError(await parseError(response), response.status);
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename =
    disposition.match(/filename="?([^";]+)"?/)?.[1] ?? "equitylens-export";
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

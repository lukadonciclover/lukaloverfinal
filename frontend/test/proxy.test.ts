import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/backend/[...path]/route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => {
  delete process.env.BACKEND_URL;
  vi.unstubAllGlobals();
});

describe("FastAPI proxy", () => {
  it("returns a readable error when BACKEND_URL is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/backend/health"), context(["health"]));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ detail: "BACKEND_URL is not configured for the frontend deployment." });
  });

  it("rejects routes outside health and v1", async () => {
    process.env.BACKEND_URL = "https://backend.example";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new NextRequest("http://localhost/api/backend/health-anything"), context(["health-anything"]));
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a 503 instead of throwing for a malformed backend URL", async () => {
    process.env.BACKEND_URL = "not a url";
    const response = await GET(new NextRequest("http://localhost/api/backend/health"), context(["health"]));
    expect(response.status).toBe(503);
  });

  it("forwards API requests, query strings, and download headers", async () => {
    process.env.BACKEND_URL = "https://backend.example/base/";
    const fetchMock = vi.fn().mockResolvedValue(new Response("pdf", {
      status: 200,
      headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=report.pdf" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://localhost/api/backend/v1/reports/pdf?download=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const response = await POST(request, context(["v1", "reports", "pdf"]));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("report.pdf");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.example/base/v1/reports/pdf?download=1");
  });
});

import type { NextRequest } from "next/server";

const allowedPrefixes = ["health", "v1/"];

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joined = path.join("/");
  if (!allowedPrefixes.some((prefix) => joined === prefix || joined.startsWith(prefix))) {
    return Response.json({ detail: "Backend route is not allowed." }, { status: 404 });
  }
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    return Response.json({ detail: "BACKEND_URL is not configured for the frontend deployment." }, { status: 503 });
  }
  const target = new URL(joined, `${backend.replace(/\/$/, "")}/`);
  target.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of ["accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  try {
    const response = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
    const outgoing = new Headers();
    for (const name of ["content-type", "content-disposition", "cache-control"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({ detail: "The Python backend is unavailable." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

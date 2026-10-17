"use client";

import { useEffect } from "react";
import { Button, Notice } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <div className="mx-auto mt-20 max-w-xl"><Notice kind="error"><strong>The page could not be rendered.</strong><p className="mt-2">{error.message}</p></Notice><Button className="mt-4" onClick={reset}>Try again</Button></div>;
}

"use client";

import { Button, Container } from "@/components/ui";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Container className="flex max-w-xl flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-ink-500">Please try again. If it keeps happening, contact support{error.digest ? " and quote this reference" : ""}.</p>
      {error.digest ? <code className="mt-3 rounded-lg bg-ink-100 px-2 py-1 text-xs text-ink-600">{error.digest}</code> : null}
      {/* retry() re-fetches from the server, so it recovers from transient failures. */}
      <Button onClick={() => retry()} className="mt-6">Try again</Button>
    </Container>
  );
}

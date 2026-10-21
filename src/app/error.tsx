"use client";

import { Button, Container } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="flex max-w-xl flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-ink-500">Please try again. If it keeps happening, contact support.</p>
      <Button onClick={reset} className="mt-6">Try again</Button>
    </Container>
  );
}

import { Container, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="flex max-w-xl flex-col items-center py-24 text-center">
      <div className="font-display text-6xl font-semibold text-volt-500">404</div>
      <h1 className="mt-4 text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-ink-500">It may have moved, or you may not have access to it.</p>
      <LinkButton href="/chargers" className="mt-6">Find a charger</LinkButton>
    </Container>
  );
}

import { Container, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="py-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-40" />
      <Skeleton className="mt-6 h-11 w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
              <Skeleton className="aspect-[16/9] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-[70vh] lg:block" />
      </div>
    </Container>
  );
}

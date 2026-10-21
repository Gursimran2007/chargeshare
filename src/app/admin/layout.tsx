import { Container } from "@/components/ui";
import { AdminNav } from "./admin-nav";
import { requireRolePage } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Server-side gate for every admin page. Admin server actions re-check the role independently.
  await requireRolePage("admin", "/admin");
  return (
    <Container className="py-8 sm:py-10">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-volt-600">Admin console</div>
      <AdminNav />
      {children}
    </Container>
  );
}

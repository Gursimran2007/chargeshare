import { redirect } from "next/navigation";
import { Container, PageHeader } from "@/components/ui";
import { ListingWizard } from "../listing-wizard";
import { getDb } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";

export const metadata = { title: "New listing" };

export default async function NewListingPage() {
  const viewer = await requireRolePage("host", "/host/listings/new");
  const db = await getDb();
  const { rows: hp } = await db.query("select 1 from public.host_profiles where user_id = $1", [viewer.userId]);
  if (!hp[0]) redirect("/host/onboarding");
  const { rows: connectors } = await db.query<{ code: string; label: string; listable: boolean; max_kw: number; description: string }>(
    "select code, label, listable, max_kw, description from public.connector_types order by sort_order",
  );
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader eyebrow="New listing" title="List your charger" subtitle="Your listing is saved as a draft. Add photos and verification documents next, then submit it for review." />
      <ListingWizard connectors={connectors} />
    </Container>
  );
}

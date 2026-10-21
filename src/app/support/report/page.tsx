import { ActionForm, FormField } from "@/components/action-form";
import { Card, Container, PageHeader, Select, Textarea } from "@/components/ui";
import { reportCreateAction } from "../actions";
import { requireViewer } from "@/lib/auth";

export const metadata = { title: "Report a problem" };

export default async function ReportPage({ searchParams }: PageProps<"/support/report">) {
  const sp = await searchParams;
  await requireViewer("/support/report");
  const type = sp.type === "listing" || sp.type === "user" || sp.type === "booking" ? sp.type : null;
  const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/.test(sp.id) ? sp.id : null;
  return (
    <Container className="max-w-2xl py-8 sm:py-12">
      <PageHeader title="Report a problem" subtitle="Safety hazards are escalated to our team immediately. If anyone is at risk, call 112 first." />
      <Card className="p-5 sm:p-6">
        {type && id ? (
          <ActionForm action={reportCreateAction} hidden={{ targetType: type, targetId: id }} submit="Submit report" resetOnSuccess>
            <>
                <p className="text-sm text-ink-500">Reporting a {type}.</p>
                <FormField name="reason" label="What kind of problem?" htmlFor="reason" >
                  <Select id="reason" name="reason" defaultValue="safety_hazard">
                    <option value="safety_hazard">Safety hazard (fire, smoke, exposed wiring)</option>
                    <option value="electrical_issue">Electrical fault / charger not working safely</option>
                    <option value="access_problem">Couldn&apos;t access the charger</option>
                    <option value="misleading_listing">Listing is misleading</option>
                    <option value="damage">Damage to vehicle or property</option>
                    <option value="harassment">Harassment or inappropriate behaviour</option>
                    <option value="fraud">Fraud or payment outside ChargeShare</option>
                    <option value="other">Something else</option>
                  </Select>
                </FormField>
                <FormField name="details" label="What happened?" htmlFor="details" ><Textarea id="details" name="details" className="min-h-32" /></FormField>
              </>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-600">Open the listing or booking you want to report and use its &ldquo;Report&rdquo; link, or create a <a href="/support?category=safety" className="font-medium text-volt-700 underline">safety support request</a>.</p>
        )}
      </Card>
    </Container>
  );
}

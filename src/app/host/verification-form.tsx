"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { verificationAction } from "./actions";

export function VerificationForm({
  checkType,
  listingId,
  detailFields,
  evidenceHint,
  resubmit,
}: {
  checkType: string;
  listingId?: string;
  detailFields: { name: string; label: string; placeholder?: string }[];
  evidenceHint: string;
  resubmit?: boolean;
}) {
  return (
    <ActionForm
      action={verificationAction}
      hidden={{ checkType, ...(listingId ? { listingId } : {}) }}
      submit={resubmit ? "Resubmit for review" : "Submit for review"}
      variant="primary"
      resetOnSuccess
      className="mt-3 rounded-xl bg-ink-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {detailFields.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`${checkType}-${f.name}`}>
            <Input id={`${checkType}-${f.name}`} name={`d_${f.name}`} placeholder={f.placeholder} maxLength={300} />
          </Field>
        ))}
        <Field label="Documents or photos" htmlFor={`${checkType}-evidence`} hint={`${evidenceHint} JPG, PNG, WebP or PDF, up to 5 MB each.`} className="sm:col-span-2">
          <input id={`${checkType}-evidence`} name="evidence" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
        </Field>
      </div>
    </ActionForm>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "../actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function SignUpForm({ intent }: { intent: "driver" | "host" }) {
  const [state, action] = useActionState(signUpAction, null);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-800">I want to</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["driver", "host"] as const).map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm has-[:checked]:border-volt-500 has-[:checked]:bg-volt-50">
              <input type="radio" name="intent" value={v} defaultChecked={intent === v} className="accent-volt-600" />
              {v === "driver" ? "Charge my EV" : "Host a charger"}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Full name" htmlFor="fullName" error={e.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required aria-invalid={!!e.fullName} />
      </Field>
      <Field label="Email" htmlFor="email" error={e.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!e.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={e.password} hint="At least 8 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!e.password} />
      </Field>
      <div>
        <label className="flex items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 accent-volt-600" />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="font-medium text-volt-700 underline" target="_blank">Terms</Link>,{" "}
            <Link href="/legal/privacy" className="font-medium text-volt-700 underline" target="_blank">Privacy policy</Link> and{" "}
            <Link href="/legal/cancellation" className="font-medium text-volt-700 underline" target="_blank">Cancellation policy</Link>.
          </span>
        </label>
        {e.acceptTerms ? <p role="alert" className="mt-1.5 text-xs font-medium text-stop-600">{e.acceptTerms}</p> : null}
      </div>
      <SubmitButton className="w-full" size="lg" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}

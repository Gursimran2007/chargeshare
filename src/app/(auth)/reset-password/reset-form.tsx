"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "../actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function ResetForm({ token }: { token: string | null }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="mt-8 space-y-4" noValidate>
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" error={state?.fieldErrors?.password} hint="At least 8 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={state?.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg">Update password</SubmitButton>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-500">We&apos;ll email you a link that works for 30 minutes.</p>
      {state?.ok ? (
        <div className="mt-8 rounded-2xl border border-go-600/20 bg-go-100 p-4 text-sm text-go-600">
          {state.message}
          <p className="mt-2 text-ink-600">
            In demo mode, emails are delivered to the <Link href="/dev/outbox" className="font-semibold underline">demo outbox</Link>.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-8 space-y-4" noValidate>
          <FormMessage state={state} />
          <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <SubmitButton className="w-full" size="lg">Send reset link</SubmitButton>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link href="/login" className="font-medium text-volt-700 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}

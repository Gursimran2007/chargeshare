"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { signInAction } from "../actions";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function LoginForm({ next, demoAccounts, demoPassword }: { next: string; demoAccounts?: readonly { role: string; email: string; note: string }[]; demoPassword?: string }) {
  const [state, action] = useActionState(signInAction, null);
  const form = useRef<HTMLFormElement>(null);
  const fill = (email: string) => {
    const f = form.current!;
    (f.elements.namedItem("email") as HTMLInputElement).value = email;
    (f.elements.namedItem("password") as HTMLInputElement).value = demoPassword ?? "";
    f.requestSubmit();
  };
  return (
    <>
      <form ref={form} action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />
        <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!state?.fieldErrors?.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!state?.fieldErrors?.password} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-volt-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
      {demoAccounts ? (
        <div className="mt-8 rounded-2xl border border-warn-600/20 bg-warn-100/50 p-4">
          <div className="text-sm font-semibold text-ink-900">Demo accounts</div>
          <p className="mt-0.5 text-xs text-ink-500">
            Fictional users for exploring the product. Password for all: <code className="font-mono font-semibold">{demoPassword}</code>
          </p>
          <ul className="mt-3 space-y-2">
            {demoAccounts.map((a) => (
              <li key={a.email}>
                <button type="button" onClick={() => fill(a.email)} className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-left hover:border-volt-400">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{a.role}</span>
                    <span className="font-mono text-xs text-ink-500">{a.email}</span>
                  </div>
                  <div className="text-xs text-ink-500">{a.note}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

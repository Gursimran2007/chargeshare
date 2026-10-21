"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui";
import type { ComponentProps } from "react";

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

type State = { ok: boolean; message?: string } | null;

/**
 * Wraps a server action so its message is toasted as soon as it returns. Toasting
 * here, rather than in an effect, still works when the server re-render removes
 * the form that submitted it (e.g. an "Accept" button that disappears once accepted).
 */
export function withToast<S extends State, A extends unknown[]>(action: (prev: S, ...args: A) => Promise<S>) {
  return async (prev: S, ...args: A): Promise<S> => {
    const result = await action(prev, ...args);
    if (result?.message) {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    }
    return result;
  };
}

export function FormMessage({ state }: { state: State }) {
  if (!state?.message || state.ok) return null;
  return (
    <div role="alert" className="rounded-xl border border-stop-600/20 bg-stop-100 px-3.5 py-2.5 text-sm text-stop-600">
      {state.message}
    </div>
  );
}

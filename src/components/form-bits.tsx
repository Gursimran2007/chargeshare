"use client";

import { useEffect } from "react";
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

/** Shows a toast whenever an action returns a message. */
export function useActionToast(state: State) {
  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function FormMessage({ state }: { state: State }) {
  if (!state?.message || state.ok) return null;
  return (
    <div role="alert" className="rounded-xl border border-stop-600/20 bg-stop-100 px-3.5 py-2.5 text-sm text-stop-600">
      {state.message}
    </div>
  );
}

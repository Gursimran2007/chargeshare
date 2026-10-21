"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { FormMessage, SubmitButton, withToast } from "./form-bits";
import type { ActionState } from "@/lib/actions";
import { Button, Field, cn } from "./ui";

const ErrorsContext = createContext<Record<string, string>>({});

/** A labelled field whose validation error comes from the enclosing ActionForm (usable from Server Components). */
export function FormField({ name, ...props }: Omit<ComponentProps<typeof Field>, "error"> & { name?: string }) {
  const errors = useContext(ErrorsContext);
  return <Field {...props} error={name ? errors[name] : undefined} />;
}

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;

/** A small form bound to a server action, with toast feedback and field errors. */
export function ActionForm({
  action,
  hidden,
  children,
  submit,
  variant = "primary",
  className,
  resetOnSuccess,
  confirm,
}: {
  action: Act;
  hidden?: Record<string, string>;
  children?: ReactNode | ((errors: Record<string, string>) => ReactNode);
  submit: ReactNode;
  variant?: "primary" | "outline" | "danger" | "volt" | "secondary" | "ghost";
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: { title: string; body: ReactNode; label: string };
}) {
  const [state, formAction] = useActionState(withToast(action), null);
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) dialog.current?.close();
  }, [state, resetOnSuccess]);
  const errors = state?.fieldErrors ?? {};
  const fields = (
    <ErrorsContext.Provider value={errors}>
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      {typeof children === "function" ? children(errors) : children}
    </ErrorsContext.Provider>
  );
  if (confirm) {
    return (
      <>
        <Button type="button" variant={variant} onClick={() => dialog.current?.showModal()} className={className}>
          {submit}
        </Button>
        <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] rounded-xl p-0 shadow-lift backdrop:bg-ink-950/50">
          <form ref={ref} action={formAction} className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">{confirm.title}</h2>
            <div className="text-sm text-ink-600">{confirm.body}</div>
            <FormMessage state={state} />
            {fields}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>Go back</Button>
              <SubmitButton variant={variant === "outline" ? "danger" : variant}>{confirm.label}</SubmitButton>
            </div>
          </form>
        </dialog>
      </>
    );
  }
  return (
    <form ref={ref} action={formAction} className={cn("space-y-3", className)}>
      <FormMessage state={state} />
      {fields}
      <SubmitButton variant={variant}>{submit}</SubmitButton>
    </form>
  );
}

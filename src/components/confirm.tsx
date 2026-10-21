"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "./ui";

/** Native <dialog> confirmation for destructive actions. Renders a form so it works with server actions. */
export function ConfirmAction({
  trigger,
  title,
  body,
  confirmLabel,
  action,
  hidden,
  children,
  variant = "danger",
  triggerVariant = "outline",
}: {
  trigger: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  action: (form: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  children?: ReactNode;
  variant?: "danger" | "primary";
  triggerVariant?: "outline" | "ghost" | "danger" | "secondary" | "primary";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" variant={triggerVariant} onClick={() => ref.current?.showModal()}>
        {trigger}
      </Button>
      <dialog ref={ref} className="m-auto w-[min(92vw,440px)] rounded-2xl p-0 shadow-lift backdrop:bg-ink-950/50">
        <form
          action={async (fd) => {
            await action(fd);
            ref.current?.close();
          }}
          className="p-6"
        >
          {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-ink-600">{body}</div>
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>
              Keep it
            </Button>
            <Button type="submit" variant={variant}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

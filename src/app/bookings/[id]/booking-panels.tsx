"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import {
  cancelAction,
  checkInAction,
  disputeAction,
  hostRespondAction,
  hostSessionAction,
  messageAction,
  reviewAction,
} from "../actions";

export function CancelButton({ bookingId, refundText }: { bookingId: string; refundText: string }) {
  return (
    <ActionForm
      action={cancelAction}
      hidden={{ bookingId }}
      submit="Cancel booking"
      variant="outline"
      confirm={{ title: "Cancel this booking?", body: refundText, label: "Yes, cancel" }}
    >
      <Field label="Reason (optional)" htmlFor="reason">
        <Input id="reason" name="reason" maxLength={300} />
      </Field>
    </ActionForm>
  );
}

export function CheckInButton({ bookingId }: { bookingId: string }) {
  return <ActionForm action={checkInAction} hidden={{ bookingId }} submit="I've arrived" variant="volt" />;
}

export function DisputeButton({ bookingId }: { bookingId: string }) {
  return (
    <ActionForm
      action={disputeAction}
      hidden={{ bookingId }}
      submit="Report a problem"
      variant="outline"
      confirm={{
        title: "Report a problem with this session",
        body: "This opens a dispute. Payouts for this session are held while our team reviews it with both parties.",
        label: "Open dispute",
      }}
    >
      {(e) => (
        <Field label="What happened?" htmlFor="description" error={e.description}>
          <Textarea id="description" name="description" required minLength={10} />
        </Field>
      )}
    </ActionForm>
  );
}

export function ReviewForm({ bookingId }: { bookingId: string }) {
  return (
    <ActionForm action={reviewAction} hidden={{ bookingId }} submit="Submit review">
      {(e) => (
        <>
          <Field label="Rating" htmlFor="rating" error={e.rating}>
            <Select id="rating" name="rating" defaultValue="5">
              {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} star{r > 1 ? "s" : ""}</option>)}
            </Select>
          </Field>
          <Field label="Comment (optional)" htmlFor="comment" error={e.comment}>
            <Textarea id="comment" name="comment" maxLength={1000} placeholder="Access, parking, charger condition…" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function MessageForm({ bookingId }: { bookingId: string }) {
  return (
    <ActionForm action={messageAction} hidden={{ bookingId }} submit="Send" resetOnSuccess className="flex flex-col">
      <label htmlFor="msg" className="sr-only">Message</label>
      <Textarea id="msg" name="body" required maxLength={1000} placeholder="Write a message…" className="min-h-20" />
    </ActionForm>
  );
}

export function HostRespond({ bookingId }: { bookingId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={hostRespondAction} hidden={{ bookingId, decision: "accept" }} submit="Accept request" variant="volt" />
      <ActionForm
        action={hostRespondAction}
        hidden={{ bookingId, decision: "decline" }}
        submit="Decline"
        variant="outline"
        confirm={{ title: "Decline this request?", body: "The driver has not been charged and will be notified.", label: "Decline" }}
      >
        <Field label="Message to driver (optional)" htmlFor="reason">
          <Input id="reason" name="reason" maxLength={300} />
        </Field>
      </ActionForm>
    </div>
  );
}

export function HostSession({ bookingId, step }: { bookingId: string; step: "start" | "complete" }) {
  return (
    <ActionForm
      action={hostSessionAction}
      hidden={{ bookingId, step }}
      submit={step === "start" ? "Mark session started" : "Mark session completed"}
      variant={step === "start" ? "volt" : "primary"}
      confirm={
        step === "complete"
          ? {
              title: "Confirm the session is complete",
              body: "Only confirm once the driver has finished charging and left the bay. This is a manual confirmation; ChargeShare does not meter energy.",
              label: "Confirm completion",
            }
          : undefined
      }
    />
  );
}

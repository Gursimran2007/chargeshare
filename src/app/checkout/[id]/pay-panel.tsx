"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FlaskConical, Loader2, Lock, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { demoPayAction, startCheckoutAction } from "@/app/bookings/actions";
import { Button } from "@/components/ui";
import { formatINR } from "@/lib/money";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: unknown) => void): void };
  }
}

function useCountdown(until: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

export function PayPanel({
  bookingId,
  amountPaise,
  holdUntil,
  provider,
  prefill,
  nonce,
}: {
  bookingId: string;
  amountPaise: number;
  holdUntil: string | null;
  provider: "demo" | "razorpay";
  prefill: { name: string; email: string };
  nonce?: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<{ orderId: string; keyId: string | null } | null>(null);
  const [pending, start] = useTransition();
  const left = useCountdown(holdUntil);
  const expired = left === 0;

  function begin() {
    start(async () => {
      const r = await startCheckoutAction(bookingId);
      if (!r.ok) return void toast.error(r.message);
      if (r.alreadyPaid) return router.push(`/bookings/${bookingId}`);
      setOrder({ orderId: r.orderId, keyId: r.keyId });
      if (r.provider === "razorpay") openRazorpay(r.orderId, r.keyId!, r.amountPaise);
    });
  }

  function openRazorpay(orderId: string, keyId: string, amount: number) {
    if (!window.Razorpay) return void toast.error("Payment window could not load. Check your connection and retry.");
    const rzp = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount,
      currency: "INR",
      name: "ChargeShare",
      description: "EV charging booking",
      prefill: { name: prefill.name, email: prefill.email },
      theme: { color: "#0a1730" },
      handler: async (resp: Record<string, string>) => {
        const res = await fetch("/api/payments/razorpay/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resp),
        });
        const json = await res.json();
        if (!res.ok) return void toast.error(json.error ?? "Payment verification failed.");
        router.push(`/bookings/${bookingId}?confirmed=1`);
      },
    });
    rzp.on("payment.failed", () => toast.error("Payment failed. You have not been charged; please try again."));
    rzp.open();
  }

  function simulate(outcome: "success" | "failure") {
    if (!order) return;
    start(async () => {
      const r = await demoPayAction(bookingId, order.orderId, outcome);
      if (r && !r.ok) {
        toast.error(r.message);
        setOrder(null); // a failed order is never reused; retrying creates a fresh one
      }
    });
  }

  return (
    <div className="space-y-4">
      {provider === "razorpay" ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" nonce={nonce} /> : null}
      {left !== null ? (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${expired ? "bg-stop-100 text-stop-600" : "bg-volt-50 text-volt-700"}`}>
          <TimerReset className="size-4" aria-hidden />
          {expired ? "The hold on this slot has ended. If the slot is still free you can still pay; otherwise please rebook." : (
            <>Slot held for <strong className="tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</strong></>
          )}
        </div>
      ) : null}
      {provider === "demo" && order ? (
        <div className="rounded-xl border-2 border-dashed border-warn-600/40 bg-warn-100/40 p-5">
          <div className="flex items-center gap-2 font-semibold text-warn-600">
            <FlaskConical className="size-5" aria-hidden /> DEMO PAYMENT · no money will move
          </div>
          <p className="mt-1 text-sm text-ink-600">
            Order <code className="font-mono text-xs">{order.orderId}</code> was created by the simulated provider. Choose an outcome; the server then verifies a signed response exactly as it would for a real gateway.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => simulate("success")} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Simulate successful payment
            </Button>
            <Button variant="outline" onClick={() => simulate("failure")} disabled={pending}>Simulate failure</Button>
          </div>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={begin} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" aria-hidden />}
          {provider === "demo" ? "Continue to demo payment" : "Pay"} {formatINR(amountPaise, { decimals: true })}
        </Button>
      )}
      <p className="text-center text-xs text-ink-500">
        {provider === "demo"
          ? "Demo mode: no card details are collected and no money moves."
          : "Payments are processed by Razorpay. ChargeShare never sees or stores your card details."}
      </p>
    </div>
  );
}

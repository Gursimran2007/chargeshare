import "server-only";
import { emailPolicy, emailTransport } from "./index";
import type { EmailDelivery } from "@/lib/services/maintenance";

/** Email delivery settings for the maintenance worker, from the environment. */
export function emailDelivery(): EmailDelivery {
  return { transport: emailTransport(), ...emailPolicy() };
}

import type { Db } from "@/lib/db/core";
import { createDemoProvider } from "@/lib/payments/demo";
import { localDateString } from "@/lib/domain/time";
import type { ListingInput } from "@/lib/validation";
import { registerUser } from "./services/auth-local";
import { loadActor, type Actor } from "./services/common";
import { createListing, upsertHostProfile, LISTING_CHECKS } from "./services/listings";
import { submitVerification } from "./services/verification";
import { addVehicle } from "./services/accounts";
import {
  cancelBooking,
  createBooking,
  createReview,
  hostSessionUpdate,
  openDispute,
  sendMessage,
} from "./services/bookings";
import { capturePayment, startPayment } from "./services/payments";
import { createPayout, updatePayoutStatus } from "./services/finance";
import { createReport, createTicket } from "./services/admin";

export const DEMO_PASSWORD = "Demo@1234";

export const DEMO_ACCOUNTS = [
  { role: "Driver", email: "driver@chargeshare.demo", note: "Has vehicles, an upcoming booking, past sessions and a dispute" },
  { role: "Host", email: "host@chargeshare.demo", note: "Two live chargers, a pending request, earnings and a payout" },
  { role: "Admin", email: "admin@chargeshare.demo", note: "Verification queue, disputes, analytics, audit log" },
  { role: "New host", email: "newhost@chargeshare.demo", note: "Listing waiting in the verification queue" },
] as const;

const TZ = "Asia/Kolkata";
const ALL_WEEK = (start: string, end: string) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start, end }));

type Seed = Omit<ListingInput, "availability" | "city" | "description" | "restrictions" | "amenities" | "supportedVehicleNotes" | "bookingFee"> &
  Partial<ListingInput> & { host: string };

const LISTINGS: Seed[] = [
  {
    host: "host", title: "Quiet driveway charger near Adyar bridge", propertyType: "homeowner", connectorType: "type2_ac",
    chargerMake: "Delta", chargerModel: "AC Mini Plus 7.4 kW", ratedPowerKw: 7.4, addressLine: "Demo address, 4th Cross Street, Gandhi Nagar",
    locality: "Adyar", pincode: "600020", lat: 13.0063, lng: 80.2551, accessType: "private_driveway",
    parkingDetails: "One covered car space in an independent house driveway. Fits SUVs up to 4.7 m.",
    accessInstructions: "Ring the bell at the black gate. The charger is on the left wall; the cable is in the grey box.",
    restrictions: "No overnight parking. Please keep the gate closed.", amenities: ["Covered", "CCTV", "Tethered cable"],
    pricePerHour: 120, minDurationMinutes: 60, maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60,
    cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("07:00", "22:00"),
    description: "A 7.4 kW Type 2 wallbox on a dedicated circuit, two minutes from Adyar signal. Good for a top-up while you visit Besant Nagar or IIT Madras.",
  },
  {
    host: "host", title: "Evening top-up spot in Kotturpuram", propertyType: "homeowner", connectorType: "type2_ac",
    chargerMake: "Exicom", chargerModel: "Spin Air 7.4 kW", ratedPowerKw: 7.4, addressLine: "Demo address, Chitra Nagar",
    locality: "Kotturpuram", pincode: "600085", lat: 13.0206, lng: 80.2401, accessType: "private_driveway",
    parkingDetails: "Open driveway, compact cars and sedans only.", accessInstructions: "Message on arrival; the host will open the gate.",
    pricePerHour: 100, minDurationMinutes: 60, maxDurationMinutes: 180, bufferMinutes: 30, advanceNoticeMinutes: 120,
    cancellationPolicy: "flexible", instantBook: false, availability: ALL_WEEK("17:00", "22:00"),
    description: "Request-to-book evening slots. The host confirms each request personally.",
  },
  {
    host: "rwa", title: "Visitor EV bay, Velachery apartment complex", propertyType: "apartment", connectorType: "bharat_ac001",
    chargerMake: "Bharat AC-001 unit", chargerModel: "3 x 3.3 kW", ratedPowerKw: 3.3, addressLine: "Demo address, Taramani Link Road",
    locality: "Velachery", pincode: "600042", lat: 12.9842, lng: 80.2219, accessType: "gated_community",
    parkingDetails: "Marked visitor bay V3 near Block C basement ramp.",
    accessInstructions: "Show your booking code to security at Gate 2. They will guide you to bay V3.",
    restrictions: "Visitor access approved by the RWA. Bring your own IEC 60309 compatible cable.", amenities: ["Security desk", "Basement"],
    pricePerHour: 70, minDurationMinutes: 60, maxDurationMinutes: 360, bufferMinutes: 15, advanceNoticeMinutes: 60,
    cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("08:00", "20:00"),
    description: "Slow AC charging for long stays near Phoenix Marketcity. Suits compact EVs.",
  },
  {
    host: "office", title: "Weekend office parking charger, Perungudi OMR", propertyType: "office", connectorType: "type2_ac",
    chargerMake: "ABB", chargerModel: "Terra AC W11", ratedPowerKw: 11, addressLine: "Demo address, OMR service road",
    locality: "Perungudi", pincode: "600096", lat: 12.9625, lng: 80.2448, accessType: "office_parking",
    parkingDetails: "Surface parking, bays E1–E2 next to the main lobby.",
    accessInstructions: "Tell the security desk you have a ChargeShare booking and show the code.",
    restrictions: "Weekdays after 7 pm and all day on weekends.", amenities: ["Restrooms", "24x7 security", "Cafe nearby"],
    pricePerHour: 150, bookingFee: 20, minDurationMinutes: 60, maxDurationMinutes: 300, bufferMinutes: 15, advanceNoticeMinutes: 30,
    cancellationPolicy: "flexible", instantBook: true,
    availability: [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "19:00", end: "23:00" })),
      { weekday: 0, start: "06:00", end: "23:00" }, { weekday: 6, start: "06:00", end: "23:00" },
    ],
    description: "Idle office chargers made available to the public outside working hours.",
  },
  {
    host: "hotel", title: "Hotel forecourt 22 kW charger, Nungambakkam", propertyType: "hotel", connectorType: "type2_ac",
    chargerMake: "Schneider Electric", chargerModel: "EVlink Pro AC 22 kW", ratedPowerKw: 22, addressLine: "Demo address, Khader Nawaz Khan Road",
    locality: "Nungambakkam", pincode: "600006", lat: 13.0592, lng: 80.2465, accessType: "hotel_parking",
    parkingDetails: "Valet-assisted forecourt bay.", accessInstructions: "Drive to the porch and tell the valet you have a ChargeShare booking.",
    restrictions: "Valet will move the car once charging ends.", amenities: ["Valet", "Lounge access", "Restrooms", "Wi-Fi"],
    pricePerHour: 220, minDurationMinutes: 60, maxDurationMinutes: 180, bufferMinutes: 15, advanceNoticeMinutes: 30,
    cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("06:00", "23:00"),
    description: "Up to 22 kW AC for cars that support it. Most Indian EVs will charge at 7.2–11 kW here.",
  },
  {
    host: "retail", title: "DC fast charging at a T. Nagar retail car park", propertyType: "retail", connectorType: "ccs2",
    chargerMake: "Delta", chargerModel: "DC Wallbox 30 kW", ratedPowerKw: 30, addressLine: "Demo address, Usman Road",
    locality: "T. Nagar", pincode: "600017", lat: 13.0402, lng: 80.2335, accessType: "retail_parking",
    parkingDetails: "Level B1, bay 14. Height limit 2.1 m.", accessInstructions: "Take a ticket at the boom barrier; parking is validated at the B1 kiosk.",
    restrictions: "Car park opening hours apply.", amenities: ["Shopping", "Restrooms", "Food court"],
    pricePerHour: 600, minDurationMinutes: 30, maxDurationMinutes: 90, bufferMinutes: 10, advanceNoticeMinutes: 30,
    cancellationPolicy: "strict", instantBook: true, availability: ALL_WEEK("10:00", "22:00"),
    description: "30 kW CCS2 DC charging while you shop. DC charging speed depends heavily on your car and battery state.",
  },
  {
    host: "host", title: "Anna Nagar family home charger (Bharat AC-001)", propertyType: "homeowner", connectorType: "bharat_ac001",
    chargerMake: "Bharat AC-001 unit", chargerModel: "Single outlet 3.3 kW", ratedPowerKw: 3.3, addressLine: "Demo address, 2nd Avenue",
    locality: "Anna Nagar", pincode: "600040", lat: 13.0866, lng: 80.2089, accessType: "private_driveway",
    parkingDetails: "Open front yard parking.", accessInstructions: "Park inside the gate; the outlet is beside the meter board.",
    pricePerHour: 60, minDurationMinutes: 120, maxDurationMinutes: 480, bufferMinutes: 30, advanceNoticeMinutes: 180,
    cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("09:00", "19:00"),
    description: "Slow, affordable daytime charging. Bring a compatible cable.",
  },
  {
    host: "rwa", title: "Sholinganallur community charger, visitor slot", propertyType: "apartment", connectorType: "type2_ac",
    chargerMake: "Tata Power", chargerModel: "7.2 kW AC wallbox", ratedPowerKw: 7.2, addressLine: "Demo address, Elcot Avenue",
    locality: "Sholinganallur", pincode: "600119", lat: 12.9032, lng: 80.2296, accessType: "gated_community",
    parkingDetails: "Visitor parking P2, bay 6.", accessInstructions: "Register at the visitor desk with your booking code.",
    pricePerHour: 110, minDurationMinutes: 60, maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60,
    cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("07:00", "21:00"),
    description: "Shared community charger with an RWA-approved visitor slot.",
  },
  {
    host: "office", title: "Guindy business park charger, evenings & weekends", propertyType: "office", connectorType: "type2_ac",
    chargerMake: "ABB", chargerModel: "Terra AC W7", ratedPowerKw: 7.4, addressLine: "Demo address, Industrial Estate",
    locality: "Guindy", pincode: "600032", lat: 13.0101, lng: 80.2125, accessType: "office_parking",
    parkingDetails: "Bay G-12 near the visitor entrance.", accessInstructions: "Visitor entrance on the service road; show your code.",
    pricePerHour: 130, minDurationMinutes: 60, maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60,
    cancellationPolicy: "flexible", instantBook: true,
    availability: [0, 6].map((weekday) => ({ weekday, start: "07:00", end: "21:00" })).concat(
      [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "18:30", end: "22:30" })),
    ),
    description: "Close to Guindy metro and Kathipara junction.",
  },
  {
    host: "hotel", title: "Besant Nagar boutique stay charger", propertyType: "hotel", connectorType: "type2_ac",
    chargerMake: "Delta", chargerModel: "AC Max 11 kW", ratedPowerKw: 11, addressLine: "Demo address, 6th Avenue",
    locality: "Besant Nagar", pincode: "600090", lat: 12.9993, lng: 80.2695, accessType: "hotel_parking",
    parkingDetails: "Two-car forecourt; one bay reserved for ChargeShare.", accessInstructions: "Check in with the front desk.",
    pricePerHour: 160, minDurationMinutes: 60, maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60,
    cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("08:00", "22:00"),
    description: "Walk to Elliot's Beach while you charge.",
  },
];

const PENDING_LISTING: Seed = {
  host: "newhost", title: "Porur townhouse wallbox (awaiting review)", propertyType: "homeowner", connectorType: "type2_ac",
  chargerMake: "Exicom", chargerModel: "Spin Air 7.4 kW", ratedPowerKw: 7.4, addressLine: "Demo address, Arcot Road",
  locality: "Porur", pincode: "600116", lat: 13.0359, lng: 80.1581, accessType: "private_driveway",
  parkingDetails: "Covered stilt parking.", accessInstructions: "Gate code shared after booking.",
  pricePerHour: 110, minDurationMinutes: 60, maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60,
  cancellationPolicy: "moderate", instantBook: true, availability: ALL_WEEK("08:00", "21:00"),
};

const USERS = {
  admin: { email: "admin@chargeshare.demo", name: "Asha (demo admin)" },
  driver: { email: "driver@chargeshare.demo", name: "Karthik (demo driver)" },
  driver2: { email: "driver2@chargeshare.demo", name: "Meera (demo driver)" },
  host: { email: "host@chargeshare.demo", name: "Ravi (demo host)", hostType: "homeowner", display: "Ravi" },
  rwa: { email: "rwa@chargeshare.demo", name: "Lotus Residency RWA (demo)", hostType: "apartment", display: "Lotus Residency RWA" },
  office: { email: "office@chargeshare.demo", name: "OMR Workspaces (demo)", hostType: "office", display: "OMR Workspaces" },
  hotel: { email: "hotel@chargeshare.demo", name: "Seabreeze Stays (demo)", hostType: "hotel", display: "Seabreeze Stays" },
  retail: { email: "retail@chargeshare.demo", name: "Usman Road Retail Park (demo)", hostType: "retail", display: "Usman Road Retail Park" },
  newhost: { email: "newhost@chargeshare.demo", name: "Divya (demo new host)", hostType: "homeowner", display: "Divya" },
} as const;

type UserKey = keyof typeof USERS;

const EVIDENCE = ["demo/sample-document.svg"];

function fill(s: Seed): ListingInput {
  return {
    description: "", city: "Chennai", restrictions: "", amenities: [], supportedVehicleNotes: "", bookingFee: 0, ...s,
    availability: s.availability!,
  } as ListingInput;
}

/** Seeds clearly-labelled demo data by driving the real services, so every ledger and state is consistent. */
export async function seedDemoData(db: Db, now = new Date()) {
  const provider = createDemoProvider("demo-payment-secret", "demo-webhook-secret");
  const ids = {} as Record<UserKey, string>;
  for (const [key, u] of Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][]) {
    ids[key] = await registerUser(db, { email: u.email, password: DEMO_PASSWORD, fullName: u.name });
  }
  await db.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [ids.admin]);
  const actor = async (k: UserKey) => (await loadActor(db, ids[k])) as Actor;

  for (const k of ["host", "rwa", "office", "hotel", "retail", "newhost"] as const) {
    const u = USERS[k];
    await upsertHostProfile(db, await actor(k), {
      hostType: u.hostType,
      displayName: u.display,
      bio: "Demo host profile. Not a real person or business.",
      contactPhone: "+91 90000 00000",
    });
  }

  // Listings with simulated (clearly flagged) verification so the demo can be explored end to end.
  const listingIds: string[] = [];
  for (const s of LISTINGS) {
    const id = await createListing(db, await actor(s.host as UserKey), fill(s));
    listingIds.push(id);
  }
  await db.query(
    `update public.charger_verifications set status = 'verified', is_simulated = true, reviewed_by = $1, reviewed_at = now(),
       submitted_at = now(), submission_count = 1, evidence_paths = $2,
       decision_reason = 'Simulated for demo data. This is not a real inspection or verification.'
     where host_id <> $3`,
    [ids.admin, EVIDENCE, ids.newhost],
  );
  await db.query(
    "update public.charger_listings set is_demo = true, status = 'active', approved_at = now(), approved_by = $1 where id = any($2)",
    [ids.admin, listingIds],
  );

  // A real-looking submission waiting in the admin queue (still demo data).
  const newHost = await actor("newhost");
  const pendingId = await createListing(db, newHost, fill(PENDING_LISTING));
  await db.query("update public.charger_listings set is_demo = true where id = $1", [pendingId]);
  await submitVerification(db, newHost, { checkType: "identity", details: { document_type: "Aadhaar (masked)", name_on_document: "Divya" }, evidencePaths: EVIDENCE });
  for (const check of LISTING_CHECKS) {
    await submitVerification(db, newHost, {
      checkType: check,
      listingId: pendingId,
      details: check === "electrical_safety" ? { electrician: "Demo Electricals (licence no. withheld)", inspected_on: localDateString(now, TZ) } : {},
      evidencePaths: EVIDENCE,
    });
  }
  await db.query("update public.charger_listings set status = 'pending_review' where id = $1", [pendingId]);

  // Vehicles
  const driver = await actor("driver");
  const driver2 = await actor("driver2");
  const nexon = await addVehicle(db, driver, {
    modelId: "tata-nexon-ev-45", nickname: "Daily car", make: "Tata", model: "Nexon EV 45", batteryKwh: 45, maxAcKw: 7.2,
    connectors: ["type2_ac", "ccs2"], isDefault: true,
  });
  await addVehicle(db, driver, {
    modelId: "mg-comet-ev", nickname: "City runabout", make: "MG", model: "Comet EV", batteryKwh: 17.3, maxAcKw: 3.3,
    connectors: ["type2_ac", "bharat_ac001"], isDefault: false,
  });
  const creta = await addVehicle(db, driver2, {
    modelId: "hyundai-creta-electric", nickname: "", make: "Hyundai", model: "Creta Electric", batteryKwh: 51.4, maxAcKw: 11,
    connectors: ["type2_ac", "ccs2"], isDefault: true,
  });

  const day = (offset: number) => localDateString(new Date(now.getTime() + offset * 86400_000), TZ);
  const at = (offset: number, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(`${day(offset)}T00:00:00+05:30`);
    return new Date(d.getTime() + (h * 60 + m) * 60000);
  };

  async function paidBooking(who: Actor, vehicleId: string, listing: string, offset: number, time: string, minutes: number) {
    const bookedAt = new Date(at(offset, time).getTime() - 2 * 86400_000);
    const b = await createBooking(db, who, { listingId: listing, date: day(offset), startTime: time, durationMinutes: minutes, vehicleId, note: "" }, bookedAt);
    const p = await startPayment(db, who, b.bookingId, provider, bookedAt);
    const sim = provider.simulateCheckout(p.provider_order_id);
    await capturePayment(db, provider, { orderId: p.provider_order_id, paymentId: sim.paymentId, signature: sim.signature, source: "checkout" });
    return b.bookingId;
  }
  async function complete(hostKey: UserKey, bookingId: string, offset: number, time: string, minutes: number) {
    const h = await actor(hostKey);
    await hostSessionUpdate(db, h, bookingId, "start", at(offset, time));
    await hostSessionUpdate(db, h, bookingId, "complete", new Date(at(offset, time).getTime() + minutes * 60000));
  }

  const [adyar, kotturpuram, velachery, perungudi, nungambakkam, tnagar, , sholinganallur, guindy, besant] = listingIds;
  const past: [Actor, string, string, UserKey, number, string, number, number, string][] = [
    [driver, nexon, adyar, "host", -18, "10:00", 120, 5, "Easy to find, the host had the gate open and the cable ready."],
    [driver2, creta, adyar, "host", -12, "15:00", 90, 4, "Good spot. Took a minute to find the gate."],
    [driver2, creta, nungambakkam, "hotel", -9, "11:00", 120, 5, "Valet handled everything. Pricier, but fast with my Creta."],
    [driver, nexon, perungudi, "office", -6, "19:00", 180, 4, "Quiet on a Sunday morning. Security desk was helpful."],
    [driver2, creta, besant, "hotel", -5, "09:00", 120, 5, ""],
    [driver, nexon, sholinganallur, "rwa", -4, "08:00", 120, 4, "Visitor desk knew about the booking."],
    [driver2, creta, guindy, "office", -3, "19:00", 120, 3, "Charger worked, but signage to the bay could be better."],
  ];
  for (const [who, v, listing, hostKey, offset, time, minutes, rating, comment] of past) {
    const id = await paidBooking(who, v, listing, offset, time, minutes);
    await complete(hostKey, id, offset, time, minutes);
    await createReview(db, who, { bookingId: id, rating, comment });
  }

  // A completed session the driver disputed yesterday (admin can resolve it).
  const disputed = await paidBooking(driver, nexon, tnagar, -1, "12:00", 60);
  await complete("retail", disputed, -1, "12:00", 60);
  await openDispute(db, driver, disputed, "The charger stopped after about 20 minutes and the car park staff could not restart it.", at(-1, "14:00"));

  // Upcoming confirmed booking with messages.
  const upcoming = await paidBooking(driver, nexon, adyar, 2, "10:00", 120);
  await sendMessage(db, driver, upcoming, "Hi, I'll arrive around 9:55. Is the cable already plugged in?");
  await sendMessage(db, await actor("host"), upcoming, "Yes, the cable is in the grey box on the left wall. Call me on 98400 12345 if needed.");

  // A request waiting for host@ to accept or decline.
  await createBooking(db, driver2, { listingId: kotturpuram, date: day(3), startTime: "18:00", durationMinutes: 120, vehicleId: creta, note: "Visiting family nearby." }, now);

  // A cancelled-and-refunded booking (moderate policy, >24h notice = full refund).
  const toCancel = await paidBooking(driver2, creta, sholinganallur, 6, "09:00", 60);
  await cancelBooking(db, driver2, provider, toCancel, "Plans changed", now);

  // Pay out part of host@'s completed earnings.
  const admin = await actor("admin");
  const payoutId = await createPayout(db, admin, ids.host, "Demo payout");
  await updatePayoutStatus(db, admin, payoutId, "paid", "DEMO-UTR-0001");

  await createTicket(db, driver2, {
    category: "payment",
    subject: "Invoice for my Nungambakkam session",
    description: "Can I get a GST invoice for my charging session? (demo ticket)",
  });
  await createReport(db, driver, {
    targetType: "listing",
    targetId: velachery,
    reason: "access_problem",
    details: "Security at Gate 2 was not aware of the visitor EV bay. (demo report)",
  });
  // Seeded bookings, payments and refunds are demo data.
  await db.query("update public.bookings set is_demo = true");
}

import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72)
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  email: emailSchema,
  password: passwordSchema,
  intent: z.enum(["driver", "host"]).default("driver"),
  acceptTerms: z.literal("on", { message: "You need to accept the terms to continue." }),
});

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9 ]{8,16})?$/, "Enter a valid phone number.")
    .optional()
    .transform((v) => v || null),
  city: z.string().trim().min(2).max(60),
});

export const vehicleSchema = z.object({
  modelId: z.string().trim().optional().transform((v) => v || null),
  nickname: z.string().trim().max(60).default(""),
  make: z.string().trim().min(1, "Enter the make.").max(60),
  model: z.string().trim().min(1, "Enter the model.").max(60),
  batteryKwh: z.coerce.number().positive().max(300).optional().or(z.literal("").transform(() => undefined)),
  maxAcKw: z.coerce.number().positive().max(50).optional().or(z.literal("").transform(() => undefined)),
  connectors: z.array(z.string()).min(1, "Choose at least one connector your vehicle supports."),
  isDefault: z.boolean().default(false),
});

export const hostProfileSchema = z.object({
  hostType: z.enum(["homeowner", "apartment", "office", "hotel", "retail", "other"]),
  displayName: z.string().trim().min(2, "Enter a display name.").max(80),
  bio: z.string().trim().max(1000).default(""),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,16}$/, "Enter a valid phone number."),
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const availabilityRuleSchema = z
  .object({ weekday: z.number().int().min(0).max(6), start: time, end: time.or(z.literal("24:00")) })
  .refine((r) => r.end > r.start, { message: "End must be after start." });

export const listingSchema = z
  .object({
    title: z.string().trim().min(6, "Use at least 6 characters.").max(90),
    description: z.string().trim().max(2000).default(""),
    propertyType: z.enum(["homeowner", "apartment", "office", "hotel", "retail", "other"]),
    connectorType: z.string().min(1, "Choose a connector."),
    chargerMake: z.string().trim().min(2, "Enter the charger make.").max(60),
    chargerModel: z.string().trim().min(1, "Enter the charger model.").max(60),
    ratedPowerKw: z.coerce.number().positive("Enter the rated power.").max(350),
    addressLine: z.string().trim().min(8, "Enter the full address.").max(300),
    locality: z.string().trim().min(2, "Choose a locality.").max(80),
    city: z.string().trim().min(2).max(60).default("Chennai"),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code."),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    accessType: z.enum(["private_driveway", "gated_community", "office_parking", "hotel_parking", "retail_parking", "public_lot"]),
    parkingDetails: z.string().trim().min(5, "Describe the parking spot.").max(500),
    accessInstructions: z.string().trim().min(10, "Tell drivers how to get in.").max(1500),
    restrictions: z.string().trim().max(800).default(""),
    amenities: z.array(z.string().max(40)).max(12).default([]),
    supportedVehicleNotes: z.string().trim().max(500).default(""),
    pricePerHour: z.coerce.number().min(10, "Minimum ₹10/hour.").max(5000),
    bookingFee: z.coerce.number().min(0).max(500).default(0),
    minDurationMinutes: z.coerce.number().int().min(30).max(720).multipleOf(30),
    maxDurationMinutes: z.coerce.number().int().min(30).max(1440).multipleOf(30),
    bufferMinutes: z.coerce.number().int().min(0).max(120),
    advanceNoticeMinutes: z.coerce.number().int().min(0).max(2880),
    cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
    instantBook: z.boolean(),
    availability: z.array(availabilityRuleSchema).min(1, "Add at least one charging window."),
  })
  .refine((l) => l.maxDurationMinutes >= l.minDurationMinutes, {
    path: ["maxDurationMinutes"],
    message: "Maximum must be at least the minimum duration.",
  });
export type ListingInput = z.infer<typeof listingSchema>;

export const bookingRequestSchema = z.object({
  listingId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: time,
  durationMinutes: z.coerce.number().int().min(30).max(1440),
  vehicleId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(500).default(""),
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});

export const ticketSchema = z.object({
  category: z.enum(["booking", "payment", "refund", "charger_issue", "account", "host", "safety", "other"]),
  subject: z.string().trim().min(4, "Add a short subject.").max(140),
  description: z.string().trim().min(10, "Tell us a little more (10+ characters).").max(4000),
  bookingId: z.string().uuid().optional().nullable(),
});

export const reportSchema = z.object({
  targetType: z.enum(["listing", "user", "booking"]),
  targetId: z.string().uuid(),
  reason: z.enum(["safety_hazard", "electrical_issue", "misleading_listing", "access_problem", "harassment", "fraud", "damage", "other"]),
  details: z.string().trim().min(10, "Describe what happened (10+ characters).").max(4000),
});

export function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

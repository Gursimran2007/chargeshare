"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { fieldErrors, profileSchema, vehicleSchema } from "@/lib/validation";
import { addVehicle, deleteVehicle, setDefaultVehicle, updateProfile } from "@/lib/services/accounts";

export async function profileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    await updateProfile(await getDb(), await getViewer(), parsed.data);
    revalidatePath("/account");
    return { ok: true, message: "Profile saved." };
  } catch (e) {
    return failure(e);
  }
}

export async function vehicleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = vehicleSchema.safeParse({
    ...Object.fromEntries(form),
    connectors: form.getAll("connectors"),
    isDefault: form.get("isDefault") === "on",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    await addVehicle(await getDb(), await getViewer(), parsed.data);
    revalidatePath("/account");
    return { ok: true, message: "Vehicle added." };
  } catch (e) {
    return failure(e);
  }
}

export async function deleteVehicleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await deleteVehicle(await getDb(), await getViewer(), String(form.get("id")));
    revalidatePath("/account");
    return { ok: true, message: "Vehicle removed." };
  } catch (e) {
    return failure(e);
  }
}

export async function defaultVehicleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await setDefaultVehicle(await getDb(), await getViewer(), String(form.get("id")));
    revalidatePath("/account");
    return { ok: true, message: "Default vehicle updated." };
  } catch (e) {
    return failure(e);
  }
}

import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-ink-500">This signs you out on all other devices.</p>
      <ResetForm token={typeof sp.token === "string" ? sp.token : null} />
    </div>
  );
}

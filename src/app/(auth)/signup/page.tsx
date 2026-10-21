import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { AuthAside } from "../aside";
import { SignUpForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle={
        <>
          Already have one?{" "}
          <Link href="/login" className="font-semibold text-volt-700 hover:underline">
            Sign in
          </Link>
        </>
      }
      aside={<AuthAside />}
    >
      <SignUpForm intent={sp.intent === "host" ? "host" : "driver"} />
    </AuthShell>
  );
}

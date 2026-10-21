import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";
import { AuthAside } from "../aside";
import { getViewer } from "@/lib/auth";
import { config } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/seed";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const raw = typeof sp.next === "string" ? sp.next : "/dashboard";
  // Same-site relative paths only ("//host" would be an open redirect).
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/dashboard";
  if (await getViewer()) redirect(next);
  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        <>
          New to ChargeShare?{" "}
          <Link href="/signup" className="font-semibold text-volt-700 hover:underline">
            Create an account
          </Link>
          {sp.reset ? <span className="mt-2 block font-medium text-go-600">Password updated. Sign in with your new password.</span> : null}
        </>
      }
      aside={<AuthAside />}
    >
      <LoginForm next={next} demoAccounts={config.demoMode ? DEMO_ACCOUNTS : undefined} demoPassword={config.demoMode ? DEMO_PASSWORD : undefined} />
    </AuthShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { VaultProvider } from "@/components/vault/vault-provider";
import { hasUsers, listUsers } from "@/lib/server/auth-store";
import { currentUser } from "@/lib/server/auth-session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [setupDone, user] = await Promise.all([hasUsers(), currentUser()]);

  if (!user) {
    return <AuthGate mode={setupDone ? "login" : "setup"} />;
  }

  const users = user.role === "admin" ? await listUsers() : [];

  return (
    <VaultProvider>
      <AppShell currentUser={user} initialUsers={users} />
    </VaultProvider>
  );
}

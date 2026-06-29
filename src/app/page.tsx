import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth/auth-gate";
import { VaultProvider } from "@/components/vault/vault-provider";
import { currentUser } from "@/lib/server/auth-session";
import { getPreferences } from "@/lib/server/vault-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();

  if (!user) {
    return <AuthGate />;
  }

  const preferences = await getPreferences();

  return (
    <VaultProvider>
      <AppShell
        currentUser={user}
        initialPrefs={preferences.devicePrefs}
        initialThemeMode={preferences.themeMode}
      />
    </VaultProvider>
  );
}

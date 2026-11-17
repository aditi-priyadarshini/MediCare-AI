"use client";

import { UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Menu } from "@/components/ui/Menu";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

/** Account menu: who is signed in, Settings, Sign out. */
export function UserMenu() {
  const { t } = useT();
  const router = useRouter();
  const { user, logout } = useAuth();
  const name = user?.display_name ?? user?.email ?? t("user.menu");
  return (
    <Menu
      label={
        <>
          <UserCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="hidden max-w-[10rem] truncate xl:inline">{name}</span>
          <span className="sr-only xl:hidden">{t("user.menu")}: {name}</span>
        </>
      }
      items={[
        { label: t("nav.settings"), onSelect: () => router.push("/settings") },
        { label: t("nav.signOut"), onSelect: () => void logout().then(() => router.replace("/login")) },
      ]}
    />
  );
}

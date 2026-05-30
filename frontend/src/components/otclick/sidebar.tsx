"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  IHome,
  IList,
  IBell,
  IMail,
  IDoc,
  IUser,
  ISettings,
  ILogo,
  ILogout,
  ITelegram,
} from "@/components/otclick/icons";

type Item = {
  href?: string;
  id: string;
  icon: React.ReactNode;
  label: string;
  action?: "signout";
  external?: boolean;
};

const NAV: Item[] = [
  { id: "dashboard", href: "/dashboard", icon: <IHome />, label: "Главная" },
  { id: "applications", href: "/applications", icon: <IList />, label: "Отклики" },
  { id: "chats", href: "/chats", icon: <IMail />, label: "Чаты" },
  { id: "todo", href: "/todo", icon: <IDoc />, label: "Todo" },
  { id: "notifications", href: "/notifications", icon: <IBell />, label: "Уведомления" },
  { id: "account", href: "/account", icon: <IUser />, label: "Аккаунт" },
];

function SidebarBtn({
  item,
  active,
  onClick,
}: {
  item: Item;
  active: boolean;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: "none",
    display: "grid",
    placeItems: "center",
    background: active ? "var(--ink)" : "transparent",
    color: active ? "#F5F1E6" : "var(--ink)",
    transition: "background .2s",
    cursor: "pointer",
  };
  const onMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!active) (e.currentTarget as HTMLElement).style.background = "var(--line-2)";
  };
  const onMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
  };
  if (item.href && item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        title={item.label}
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {item.icon}
      </a>
    );
  }
  if (item.href) {
    return (
      <Link
        href={item.href}
        title={item.label}
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {item.icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {item.icon}
    </button>
  );
}

export default function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  const initials = email
    ? email
        .split(/[@.]/)[0]
        .slice(0, 2)
        .toUpperCase()
    : "ME";

  return (
    <aside
      className="oc-sidebar"
      style={{
        width: 76,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0 24px",
        gap: 14,
        position: "sticky",
        top: 16,
        alignSelf: "flex-start",
        height: "calc(100vh - 32px)",
      }}
    >
      <div className="oc-sidebar-logo" style={{ marginBottom: 8 }}>
        <Link href="/dashboard" aria-label="otclick">
          <ILogo size={36} />
        </Link>
      </div>
      <div
        className="oc-sidebar-nav"
        style={{
          background: "var(--surface)",
          borderRadius: 22,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          boxShadow: "0 1px 0 var(--line-2)",
        }}
      >
        {NAV.map((it) => {
          const active = !it.action && it.href ? pathname.startsWith(it.href) : false;
          return <SidebarBtn key={it.id} item={it} active={active} />;
        })}
      </div>
      <div className="oc-sidebar-spacer" style={{ flex: 1 }} />
      <div
        className="oc-sidebar-secondary"
        style={{
          background: "var(--surface)",
          borderRadius: 22,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <SidebarBtn
          item={{
            id: "support",
            href: "https://t.me/UnixAuto",
            icon: <ITelegram />,
            label: "Поддержка",
            external: true,
          }}
          active={false}
        />
        <SidebarBtn
          item={{ id: "settings", href: "/account", icon: <ISettings />, label: "Настройки" }}
          active={false}
        />
        <SidebarBtn
          item={{ id: "logout", icon: <ILogout />, label: "Выйти" }}
          active={false}
          onClick={signOut}
        />
      </div>
      <div
        className="oc-sidebar-avatar"
        title={email ?? ""}
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          overflow: "hidden",
          background: "linear-gradient(135deg, var(--yellow) 0%, var(--coral) 100%)",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          color: "var(--ink)",
          fontSize: 13,
        }}
      >
        {initials}
      </div>
    </aside>
  );
}

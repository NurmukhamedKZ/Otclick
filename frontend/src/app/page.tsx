import Link from "next/link";
import { Btn, Card, StatusDot, Tag } from "@/components/otclick/ui";
import {
  IArrow,
  IBolt,
  IFilter,
  ILogo,
  IShield,
  ISpark,
} from "@/components/otclick/icons";

const FEATURES = [
  { icon: <IFilter />, title: "Фильтры", sub: "Точные параметры поиска: ключи, зарплата, регион, опыт", tone: "light" },
  { icon: <ISpark />, title: "AI", sub: "Сопроводительные пишет Claude — под каждую вакансию", tone: "yellow" },
  { icon: <IShield />, title: "Антибан", sub: "Случайные паузы, ротация User-Agent, обход капчи", tone: "dark" },
  { icon: <IBolt />, title: "Realtime", sub: "Уведомления о каждом отклике и ошибке", tone: "light" },
] as const;

const HOURS = [
  { h: "06", sent: 4, capt: 0 },
  { h: "07", sent: 12, capt: 0 },
  { h: "08", sent: 22, capt: 1 },
  { h: "09", sent: 18, capt: 1 },
  { h: "10", sent: 28, capt: 2 },
  { h: "11", sent: 24, capt: 1 },
  { h: "12", sent: 9, capt: 0 },
  { h: "13", sent: 32, capt: 3 },
  { h: "14", sent: 38, capt: 4, now: true },
];

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", padding: "20px 32px 60px", position: "relative", zIndex: 1 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "var(--surface)",
          borderRadius: 22,
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ILogo size={32} />
          <span style={{ fontSize: 17, fontWeight: 700 }}>otclick</span>
        </div>
        <nav style={{ display: "flex", gap: 24, fontSize: 14 }}>
          <a href="#features" style={{ color: "var(--ink)", textDecoration: "none" }}>возможности</a>
          <a href="#plans" style={{ color: "var(--ink)", textDecoration: "none" }}>тарифы</a>
          <a href="#faq" style={{ color: "var(--ink)", textDecoration: "none" }}>faq</a>
        </nav>
        <Link href="/auth"><Btn kind="primary">войти</Btn></Link>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 32,
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surface)",
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              marginBottom: 20,
            }}
          >
            <StatusDot tone="ok" />
            <span className="mono">бот работает 24/7</span>
          </div>
          <h1
            style={{
              fontSize: 72,
              lineHeight: 0.95,
              margin: 0,
              fontWeight: 700,
              letterSpacing: -2.5,
            }}
          >
            Пока ты спишь,<br />
            <span className="serif" style={{ fontWeight: 400 }}>бот откликается </span>
            <br />за тебя на hh
          </h1>
          <div
            style={{
              color: "var(--muted)",
              fontSize: 17,
              marginTop: 22,
              maxWidth: 480,
              lineHeight: 1.5,
            }}
          >
            Тонкие фильтры, AI-сопроводительные под каждую вакансию, обход капчи.
            До 150 откликов в день — пока ты пьёшь кофе.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
            <Link href="/auth">
              <Btn kind="primary" size="lg" icon={<IBolt size={16} />}>начать бесплатно</Btn>
            </Link>
            <Link href="/auth">
              <Btn kind="ghost" size="lg">уже есть аккаунт</Btn>
            </Link>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginTop: 22,
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <div style={{ display: "flex" }}>
              {["#F5CB3D", "#E96B58", "#C7D4B6", "#1A1B1F"].map((c, i) => (
                <div
                  key={i}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: c,
                    border: "2px solid var(--bg)",
                    marginLeft: i ? -8 : 0,
                  }}
                />
              ))}
            </div>
            <span>7 дней trial · без карты</span>
          </div>
        </div>
        <Card tone="cream" style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 18,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  fontWeight: 700,
                }}
              >
                пример · сегодня
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                <span
                  style={{
                    fontSize: 56,
                    fontWeight: 800,
                    letterSpacing: -2,
                    lineHeight: 0.9,
                  }}
                >
                  187
                </span>
                <span className="serif" style={{ fontSize: 22 }}>откликов</span>
              </div>
            </div>
            <Tag tone="dark" dot>live</Tag>
          </div>

          <div style={{ position: "relative", height: 140 }}>
            <div
              style={{
                position: "absolute",
                inset: "0 0 22px 0",
                display: "flex",
                alignItems: "flex-end",
                gap: 5,
              }}
            >
              {HOURS.map((b, i) => {
                const total = b.sent + b.capt;
                const hSent = Math.max(4, (b.sent / 40) * 110);
                const hCapt = (b.capt / 40) * 110;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      position: "relative",
                    }}
                  >
                    {b.capt > 0 && (
                      <div
                        style={{
                          width: "100%",
                          height: hCapt,
                          background: "var(--coral)",
                          borderRadius: "4px 4px 0 0",
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: "100%",
                        height: hSent,
                        background: b.now ? "var(--ink)" : "var(--yellow)",
                        borderRadius: b.capt > 0 ? "0" : "4px 4px 0 0",
                        position: "relative",
                      }}
                    >
                      {b.now && (
                        <div
                          style={{
                            position: "absolute",
                            top: -22,
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: "var(--ink)",
                            color: "#F5F1E6",
                            padding: "2px 7px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {total}
                        </div>
                      )}
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: b.now ? "var(--ink)" : "var(--muted)",
                        fontWeight: b.now ? 700 : 400,
                        position: "absolute",
                        bottom: 0,
                      }}
                    >
                      {b.h}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </section>

      <section
        id="features"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 18,
          marginBottom: 32,
        }}
      >
        {FEATURES.map((c, i) => {
          const palette =
            c.tone === "dark"
              ? { background: "var(--ink)", color: "#F5F1E6" }
              : c.tone === "yellow"
                ? { background: "var(--yellow)", color: "var(--ink)" }
                : { background: "var(--surface)", color: "var(--ink)" };
          return (
            <div
              key={i}
              style={{
                ...palette,
                borderRadius: 22,
                padding: 22,
                minHeight: 200,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  marginBottom: 18,
                  background:
                    c.tone === "dark"
                      ? "#ffffff15"
                      : c.tone === "yellow"
                        ? "var(--ink)"
                        : "var(--bg-deep)",
                  color:
                    c.tone === "dark"
                      ? "#F5F1E6"
                      : c.tone === "yellow"
                        ? "var(--yellow)"
                        : "var(--ink)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {c.icon}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{c.title}</div>
              <div style={{ fontSize: 13, marginTop: 6, opacity: 0.75 }}>{c.sub}</div>
            </div>
          );
        })}
      </section>

      <Card tone="dark" style={{ padding: 40, textAlign: "center" }}>
        <div className="serif" style={{ fontSize: 14, color: "var(--yellow)", marginBottom: 10 }}>
          готов начать?
        </div>
        <div
          style={{ fontSize: 38, fontWeight: 700, marginBottom: 14, letterSpacing: -1 }}
        >
          7 дней пробного — без карты
        </div>
        <div style={{ color: "#ffffff80", fontSize: 15, marginBottom: 24 }}>
          Подключи hh за 30 секунд.
        </div>
        <Link href="/auth">
          <Btn kind="yellow" size="lg" icon={<IArrow size={16} />}>попробовать</Btn>
        </Link>
      </Card>

      <footer
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          color: "var(--muted)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span>© {new Date().getFullYear()} otclick · hh.kz / hh.ru</span>
        <span>поддержка: hello@otclick.ru</span>
      </footer>
    </main>
  );
}

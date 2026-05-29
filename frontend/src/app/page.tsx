import Link from "next/link";
import { Btn, Card, StatusDot, Tag } from "@/components/otclick/ui";
import {
  IArrow,
  ICheck,
  IList,
  ILogo,
  IShield,
  ISpark,
} from "@/components/otclick/icons";

const VACANCIES = [
  { c: "var(--yellow)", t: "Senior Frontend", s: "от 250 000 ₽ · Удалёнка" },
  { c: "var(--coral)", t: "Backend Python", s: "Гибрид · Москва" },
  { c: "var(--sage)", t: "Product Manager", s: "от 280 000 ₽ · Удалёнка" },
  { c: "var(--ink)", t: "DevOps", s: "от 320 000 ₽ · Удалёнка" },
  { c: "var(--yellow)", t: "Маркетолог", s: "от 3 лет · Москва" },
];

const SECURITY = [
  {
    icon: <ISpark />,
    title: "Живое поведение",
    sub: "Отклики неотличимы от ручных — паузы, уникальные письма, ротация fingerprint.",
  },
  {
    icon: <IShield />,
    title: "Шифрование токенов",
    sub: "hh-токены и cookies шифруются Fernet. Доступ только у сервера, не из UI.",
  },
  {
    icon: <ICheck />,
    title: "После закрытия API",
    sub: "Headless-сессия с OTP вместо публичного API hh — устойчиво к декабрю 2025.",
  },
];

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", padding: "20px 32px 60px", position: "relative", zIndex: 1 }}>
      <Nav />

      {/* ============ HERO ============ */}
      <section
        style={{
          textAlign: "center",
          padding: "60px 0 40px",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--ink)",
            color: "#F5F1E6",
            padding: "8px 16px",
            borderRadius: 999,
            fontSize: 13,
            marginBottom: 28,
          }}
        >
          <StatusDot tone="ok" />
          Доводим до оффера на hh.ru и hh.kz
        </div>

        <h1
          style={{
            fontSize: 88,
            lineHeight: 0.98,
            margin: 0,
            fontWeight: 700,
            letterSpacing: -3.5,
          }}
        >
          Поиск работы<br />
          <span className="serif" style={{ fontWeight: 400, color: "var(--coral)" }}>
            без рутины и шаблонов
          </span>
        </h1>

        <p
          style={{
            fontSize: 19,
            color: "var(--muted)",
            margin: "26px auto 0",
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          Откликаемся, пишем сопроводительные нейросетью, отвечаем рекрутёрам
          и ведём задачи до собеседования.
        </p>

        <div style={{ marginTop: 32 }}>
          <Link href="/auth">
            <Btn kind="primary" size="lg" icon={<IArrow size={16} />}>
              Попробовать бесплатно
            </Btn>
          </Link>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            marginTop: 28,
          }}
        >
          <div style={{ display: "flex" }}>
            {["#F5CB3D", "#E96B58", "#C7D4B6", "#1A1B1F"].map((c, i) => (
              <div
                key={i}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: c,
                  border: "2px solid var(--bg)",
                  marginLeft: i ? -10 : 0,
                }}
              />
            ))}
          </div>
          <div style={{ textAlign: "left", fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>★★★★★ 4.9</div>
            <div style={{ color: "var(--muted)" }}>1000+ офферов получено</div>
          </div>
        </div>
      </section>

      {/* ============ VACANCY STRIP ============ */}
      <div
        style={{
          display: "flex",
          gap: 12,
          overflow: "hidden",
          marginBottom: 100,
          maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
        }}
      >
        {[...VACANCIES, ...VACANCIES].map((v, i) => (
          <div
            key={i}
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--surface)",
              borderRadius: 16,
              padding: "12px 18px",
              minWidth: 240,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: v.c,
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{v.t}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.s}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" style={{ marginBottom: 100, textAlign: "center" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--coral)",
            textTransform: "uppercase",
            letterSpacing: 1.5,
            marginBottom: 14,
          }}
        >
          ✦ Меньше усилий, больше офферов
        </div>
        <h2 style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2, margin: 0 }}>
          Как это <span className="serif" style={{ fontWeight: 400, color: "var(--coral)" }}>работает</span>
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 18, marginTop: 16 }}>
          Берём поиск работы на себя — экономим до 27 часов в неделю
        </p>

        <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 64 }}>
          <Step
            side="left"
            chip="В 4 раза больше приглашений"
            title="Сопроводительные нейросетью"
            sub="Под каждую вакансию — анализ требований и подбор релевантного опыта из резюме. Никаких шаблонов."
            visual={<VisualLetter />}
          />
          <Step
            side="right"
            chip="Только релевантные вакансии"
            title="Подберём подходящие"
            sub="ИИ читает резюме и фильтрует вакансии hh. Дополнительно — ручные фильтры по ключам, зарплате, региону."
            visual={<VisualBrands />}
          />
          <Step
            side="left"
            chip="Экономия до 27 часов в неделю"
            title="Откликнемся за тебя"
            sub="До 80 точных откликов в день с персональным письмом. Заполняем формы и тесты за тебя — каждый отклик ты видишь и подтверждаешь. Никаких сюрпризов, ты всегда в контроле."
            visual={<VisualApply />}
          />
          <Step
            side="right"
            chip="Killer feature"
            title="Ответим рекрутёрам и доведём до оффера"
            sub="AI читает сообщения HR, готовит ответ, ты подтверждаешь. Тесты, формы, созвоны — в едином todo."
            visual={<VisualChat />}
            killer
          />
        </div>

        <div style={{ marginTop: 56 }}>
          <Link href="/auth">
            <Btn kind="yellow" size="lg" icon={<IArrow size={16} />}>
              Начать бесплатно
            </Btn>
          </Link>
        </div>
      </section>

      {/* ============ BENTO: всё для результата ============ */}
      <section style={{ marginBottom: 100 }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--coral)",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginBottom: 14,
            }}
          >
            ⚡ Преимущества сервиса
          </div>
          <h2 style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2, margin: 0 }}>
            Всё для{" "}
            <span className="serif" style={{ fontWeight: 400, color: "var(--coral)" }}>
              результата
            </span>
          </h2>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 18,
              marginTop: 16,
              maxWidth: 580,
              margin: "16px auto 0",
            }}
          >
            Находим вакансии, пишем письма, отвечаем рекрутёрам — пока ты занят
            другими делами.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
          }}
        >
          <BentoCard
            title="AI-сопроводительные"
            sub="Под каждую вакансию hh, не шаблон. Анализ требований и подбор опыта."
            visual={<BentoLetter />}
          />
          <BentoCard
            title="Умная ИИ-фильтрация"
            sub="Подбираем вакансии под резюме, опыт и зарплатные ожидания."
            visual={<BentoFilter />}
          />
          <BentoCard
            title="Статистика откликов"
            sub="Каждый отклик, форма и тест — в реальном времени. Видно, где зависло."
            visual={<BentoStats />}
          />
          <BentoCard
            title="Чёрный список"
            sub="Авто-блок работодателей по «уже откликались» и ручной чёрный список."
            visual={<BentoBlacklist />}
          />
          <BentoCard
            title="Чаты с рекрутёрами"
            sub="AI читает сообщения HR и готовит ответы — ты подтверждаешь одним кликом."
            visual={<BentoChat />}
          />
          <BentoCTA />
        </div>
      </section>

      {/* ============ SECURITY ============ */}
      <section style={{ marginBottom: 100, textAlign: "center" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--coral)",
            textTransform: "uppercase",
            letterSpacing: 1.5,
            marginBottom: 14,
          }}
        >
          ◆ Никаких блокировок
        </div>
        <h2 style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2, margin: 0 }}>
          Полная <span className="serif" style={{ fontWeight: 400, color: "var(--coral)" }}>безопасность</span>
        </h2>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 18,
            marginTop: 16,
            maxWidth: 580,
            margin: "16px auto 0",
          }}
        >
          Работаем по правилам hh.ru — повторяем поведение обычного соискателя, только быстрее и умнее.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
            marginTop: 56,
            textAlign: "left",
          }}
        >
          {SECURITY.map((s, i) => (
            <Card key={i} tone="light" style={{ padding: 28, minHeight: 220 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: "var(--yellow)",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 20,
                }}
              >
                {s.icon}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{s.sub}</div>
            </Card>
          ))}
        </div>

        <div style={{ marginTop: 40 }}>
          <Link href="/auth">
            <Btn kind="yellow" size="lg" icon={<IArrow size={16} />}>
              Попробовать сейчас
            </Btn>
          </Link>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <Card tone="dark" style={{ padding: 64, textAlign: "center" }}>
        <h2
          style={{
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -2,
            margin: 0,
            lineHeight: 1.05,
          }}
        >
          Пусть Otclick{" "}
          <span className="serif" style={{ fontWeight: 400, color: "var(--yellow)" }}>
            доведёт до оффера
          </span>
        </h2>
        <p style={{ color: "#ffffff90", fontSize: 17, marginTop: 18 }}>
          7 дней триала · без карты · hh.ru и hh.kz
        </p>
        <div style={{ marginTop: 32 }}>
          <Link href="/auth">
            <Btn kind="yellow" size="lg" icon={<IArrow size={16} />}>
              Начать
            </Btn>
          </Link>
        </div>
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
        <span>© {new Date().getFullYear()} otclick · hh.ru / hh.kz</span>
        <span>hello@otclick.ru</span>
      </footer>
    </main>
  );
}

/* ============ NAV ============ */
function Nav() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 22px",
        background: "var(--surface)",
        borderRadius: 22,
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ILogo size={32} />
        <span style={{ fontSize: 17, fontWeight: 700 }}>otclick</span>
      </div>
      <nav style={{ display: "flex", gap: 28, fontSize: 14 }}>
        <a href="#how" style={{ color: "var(--ink)", textDecoration: "none" }}>Как это работает</a>
        <a href="#security" style={{ color: "var(--ink)", textDecoration: "none" }}>Безопасность</a>
      </nav>
      <Link href="/auth">
        <Btn kind="primary">Войти с hh.ru</Btn>
      </Link>
    </header>
  );
}

/* ============ STEP ROW ============ */
function Step({
  side,
  chip,
  title,
  sub,
  visual,
  killer,
}: {
  side: "left" | "right";
  chip: string;
  title: string;
  sub: string;
  visual: React.ReactNode;
  killer?: boolean;
}) {
  const text = (
    <div style={{ textAlign: "left" }}>
      {killer && (
        <Tag tone="coral" style={{ marginBottom: 16 }}>
          ★ наш дифференциатор
        </Tag>
      )}
      <h3 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.2, margin: 0, lineHeight: 1.1 }}>
        {title}
      </h3>
      <p
        style={{
          color: "var(--muted)",
          fontSize: 16,
          marginTop: 14,
          maxWidth: 440,
          lineHeight: 1.55,
        }}
      >
        {sub}
      </p>
      <div
        style={{
          display: "inline-block",
          marginTop: 22,
          background: "var(--yellow)",
          padding: "8px 16px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {chip}
      </div>
    </div>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 56,
        alignItems: "center",
      }}
    >
      {side === "left" ? (
        <>
          <div>{visual}</div>
          {text}
        </>
      ) : (
        <>
          {text}
          <div>{visual}</div>
        </>
      )}
    </div>
  );
}

/* ============ VISUALS ============ */

function VisualLetter() {
  return (
    <Card tone="light" style={{ padding: 24, minHeight: 280 }}>
      <div
        style={{
          background: "var(--bg-deep)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          height: 14,
        }}
      />
      <div
        style={{
          background: "var(--bg-deep)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 18,
          height: 14,
          width: "65%",
        }}
      />
      <div
        style={{
          background: "var(--ink)",
          color: "#F5F1E6",
          padding: 18,
          borderRadius: 14,
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <div style={{ color: "var(--yellow)", fontSize: 11, marginBottom: 8, fontWeight: 700 }}>
          ✨ otclick · сопроводительное
        </div>
        Добрый день! Прочитал описание — у вас стек на Python/FastAPI с переходом на Go.
        Это совпадает с моим опытом за последние 3 года…
      </div>
    </Card>
  );
}

function VisualBrands() {
  const brands = ["T", "WB", "OZ", "Я", "А", "VK"];
  const colors = ["var(--yellow)", "var(--coral)", "var(--ink)", "var(--coral)", "var(--ink)", "var(--yellow)"];
  return (
    <Card tone="light" style={{ padding: 24, minHeight: 280 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {brands.map((b, i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-deep)",
              borderRadius: 16,
              aspectRatio: "1",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                background: colors[i],
                color: colors[i] === "var(--ink)" ? "#F5F1E6" : "var(--ink)",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              {b}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VisualApply() {
  return (
    <Card tone="light" style={{ padding: 24, minHeight: 280, position: "relative" }}>
      {[
        { c: "var(--yellow)", t: "Senior Frontend · Тинькофф", s: "Удалёнка · от 280 000 ₽" },
        { c: "var(--coral)", t: "Backend Go · Авито", s: "Москва · от 320 000 ₽" },
        { c: "var(--ink)", t: "ML-инженер · Яндекс", s: "Удалёнка · от 350 000 ₽" },
      ].map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-deep)",
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: r.c,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.t}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.s}</div>
          </div>
          <Tag tone="ok" dot>sent</Tag>
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--ink)",
          color: "#F5F1E6",
          padding: "10px 18px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <StatusDot tone="ok" /> Отправляем отклики
      </div>
    </Card>
  );
}

function VisualChat() {
  return (
    <Card tone="light" style={{ padding: 24, minHeight: 280 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            background: "var(--bg-deep)",
            padding: "10px 14px",
            borderRadius: 14,
            fontSize: 13,
            alignSelf: "flex-start",
            maxWidth: "85%",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>
            Анна · Яндекс
          </div>
          Созвон в четверг 15:00?
        </div>
        <div
          style={{
            background: "var(--yellow)",
            padding: "10px 14px",
            borderRadius: 14,
            fontSize: 13,
            alignSelf: "flex-end",
            maxWidth: "85%",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
            ✨ otclick предлагает
          </div>
          Подходит. Скиньте ссылку — добавлю в календарь.
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Btn kind="primary" size="sm" icon={<ICheck size={12} />}>отправить</Btn>
          <Btn kind="ghost" size="sm">переписать</Btn>
        </div>
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: "var(--bg-deep)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <IList size={16} />
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>Созвон · Яндекс</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>чт, 15:00 · в todo</div>
          </div>
          <Tag tone="coral" dot>план</Tag>
        </div>
      </div>
    </Card>
  );
}

/* ============ BENTO ============ */

function BentoCard({
  title,
  sub,
  visual,
}: {
  title: string;
  sub: string;
  visual: React.ReactNode;
}) {
  return (
    <Card tone="light" style={{ padding: 0, overflow: "hidden", minHeight: 380 }}>
      <div
        style={{
          height: 220,
          background: "var(--bg-deep)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        {visual}
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{sub}</div>
      </div>
    </Card>
  );
}

function BentoLetter() {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        padding: 16,
        width: "100%",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Совет №1</div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 10 }}>
        Сильные достижения{" "}
        <span style={{ background: "var(--yellow-soft)", padding: "0 4px" }}>в опыте работы</span>{" "}
        стоят в конце — поднимем наверх
      </div>
      <div
        style={{
          display: "inline-block",
          background: "var(--sage-soft)",
          color: "var(--ok)",
          padding: "5px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Прирост приглашений +17%
      </div>
    </div>
  );
}

function BentoFilter() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 20,
          right: 30,
          background: "var(--surface)",
          borderRadius: 12,
          padding: 14,
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--coral)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 8, background: "var(--bg-deep)", borderRadius: 4, marginBottom: 5 }} />
            <div style={{ height: 6, background: "var(--bg-deep)", borderRadius: 4, width: "60%" }} />
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: 20,
          left: 30,
          background: "var(--surface)",
          borderRadius: 12,
          padding: 14,
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--yellow)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>T</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>ML-инженер · Тинькофф</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Удалёнка · от 350 000 ₽</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BentoStats() {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        padding: 18,
        width: "100%",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        position: "relative",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Отправлено сегодня</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>187</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>/ 200</span>
      </div>
      <div
        style={{
          marginTop: 10,
          display: "inline-block",
          background: "var(--sage-soft)",
          color: "var(--ok)",
          padding: "5px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        ✓ В лимите hh
      </div>
      <div
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          background: "var(--ink)",
          color: "#F5F1E6",
          padding: "10px 14px",
          borderRadius: 12,
          fontSize: 12,
          lineHeight: 1.3,
          maxWidth: 140,
        }}
      >
        <div style={{ color: "var(--muted-2)", fontSize: 10 }}>Скорость отклика</div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>34 сек.</div>
      </div>
    </div>
  );
}

function BentoBlacklist() {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 999,
        padding: "12px 18px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {["var(--coral)", "var(--yellow)", "var(--sage)", "var(--ink)", "var(--coral-soft)"].map((c, i) => (
        <div
          key={i}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: c,
            border: "2px solid var(--surface)",
            marginLeft: i ? -14 : 0,
          }}
        />
      ))}
      <div style={{ marginLeft: 12, fontSize: 12, fontWeight: 700 }}>
        +127
        <div style={{ fontSize: 10, fontWeight: 400, color: "var(--muted)" }}>в чс</div>
      </div>
    </div>
  );
}

function BentoChat() {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          padding: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--coral)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 12 }}>OZ</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Product · Озон</div>
          <Tag tone="ok" style={{ marginTop: 2 }}>Приглашение</Tag>
        </div>
        <div style={{ background: "var(--coral)", color: "#fff", width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>4</div>
      </div>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          padding: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--yellow)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12 }}>Т</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Senior dev · Тинькофф</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>Скиньте удобное время…</div>
        </div>
        <div style={{ background: "var(--ink)", color: "#fff", width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>1</div>
      </div>
    </div>
  );
}

function BentoCTA() {
  return (
    <Card
      tone="dark"
      style={{ padding: 28, minHeight: 380, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}
    >
      <div>
        <Tag tone="yellow" dot>Без карты</Tag>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: -1,
            lineHeight: 1.05,
            marginTop: 16,
            color: "#F5F1E6",
          }}
        >
          Бесплатный <span className="serif" style={{ fontWeight: 400, color: "var(--yellow)" }}>пробный период</span> на 7 дней
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: -30,
          bottom: 110,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        {["Приглашение", "Приглашение", "Приглашение"].map((t, i) => (
          <div
            key={i}
            style={{
              background: "var(--yellow)",
              color: "var(--ink)",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              transform: `rotate(${-4 + i * 2}deg)`,
              opacity: 0.5 + i * 0.2,
            }}
          >
            {t}
          </div>
        ))}
      </div>

      <Link href="/auth" style={{ position: "relative", zIndex: 1 }}>
        <Btn kind="yellow" size="lg" icon={<IArrow size={16} />} style={{ width: "100%", justifyContent: "center" }}>
          Начать сейчас
        </Btn>
      </Link>
    </Card>
  );
}

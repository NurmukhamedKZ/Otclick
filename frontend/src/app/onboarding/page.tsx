"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useHHConnect } from "@/hooks/useHHConnect";
import { Btn, Card } from "@/components/otclick/ui";
import { ICheck, ILogo, IShield } from "@/components/otclick/icons";

type HHStatus = {
  connected: boolean;
  expires_at: string | null;
};

export default function OnboardingPage() {
  const router = useRouter();
  const {
    phase,
    screenshotUrl,
    error,
    submitting,
    start,
    submitCaptcha,
    reset,
  } = useHHConnect();

  const [statusLoading, setStatusLoading] = useState(true);
  const [hhStatus, setHhStatus] = useState<HHStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [solution, setSolution] = useState("");

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusErr(null);
    try {
      const data = await apiFetch<HHStatus>("/api/hh/status");
      setHhStatus(data);
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : "status check failed");
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (phase === "success") {
      const t = setTimeout(() => router.push("/dashboard"), 1500);
      return () => clearTimeout(t);
    }
  }, [phase, router]);

  const disconnect = async () => {
    try {
      await apiFetch("/api/hh/disconnect", { method: "POST" });
      reset();
      await loadStatus();
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : "disconnect failed");
    }
  };

  const step =
    phase === "running" ? 1 : phase === "captcha_required" ? 2 : phase === "success" ? 3 : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        position: "relative",
        zIndex: 1,
      }}
    >
      <Card tone="light" style={{ width: "min(520px, 100%)", padding: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ILogo size={28} />
            <span style={{ fontWeight: 700 }}>otclick</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            пропустить
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 999,
                background: s <= step ? "var(--ink)" : "var(--bg-deep)",
                transition: "background .3s",
              }}
            />
          ))}
        </div>

        {statusLoading && (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Проверка статуса...</p>
        )}
        {statusErr && (
          <p style={{ color: "var(--err)", fontSize: 13, marginBottom: 12 }}>{statusErr}</p>
        )}

        {!statusLoading && hhStatus?.connected && phase !== "success" && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              hh уже подключён 🎉
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
              {hhStatus.expires_at &&
                `token expires: ${new Date(hhStatus.expires_at).toLocaleString()}`}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="primary" onClick={() => router.push("/dashboard")}>
                на дашборд
              </Btn>
              <Btn kind="ghost" onClick={disconnect}>
                отключить
              </Btn>
            </div>
          </>
        )}

        {!statusLoading && !hhStatus?.connected && phase === "idle" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(username, password);
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Подключи hh</div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
              Авторизуемся как ты, чтобы отправлять отклики. Пароль не сохраняется — используется один раз.
            </div>
            <OnbInput
              label="логин hh (email/телефон)"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
            <OnbInput
              label="пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <div
              style={{
                background: "var(--sage-soft)",
                padding: "12px 14px",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--ink)",
                marginBottom: 18,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <IShield size={16} stroke="var(--ok)" />
              <span>пароль шифруется AES-256 · отзываемый refresh token</span>
            </div>
            <Btn
              type="submit"
              kind="primary"
              size="lg"
              disabled={submitting}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {submitting ? "Запуск…" : "подключить →"}
            </Btn>
          </form>
        )}

        {phase === "running" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: "4px solid var(--bg-deep)",
                borderTopColor: "var(--ink)",
                margin: "0 auto 24px",
                animation: "oc-spin 1s linear infinite",
              }}
            />
            <div style={{ fontSize: 18, fontWeight: 700 }}>Заходим в hh от твоего имени…</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
              обычно 10–30 секунд
            </div>
          </div>
        )}

        {phase === "captcha_required" && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>hh просит капчу</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
              Введи код с картинки, и мы продолжим
            </div>
            {screenshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={screenshotUrl}
                alt="captcha"
                style={{
                  width: "100%",
                  borderRadius: 14,
                  border: "1px solid var(--line)",
                  marginBottom: 14,
                  background: "var(--bg-deep)",
                }}
              />
            ) : (
              <div
                style={{
                  height: 110,
                  borderRadius: 14,
                  background: "var(--bg-deep)",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 14,
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                скриншот грузится…
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCaptcha(solution);
                setSolution("");
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <input
                type="text"
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                required
                autoFocus
                placeholder="код"
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1.5px solid var(--line)",
                  background: "#fff",
                  outline: "none",
                  fontFamily: "JetBrains Mono",
                  fontSize: 15,
                  letterSpacing: 2,
                  color: "var(--ink)",
                }}
              />
              <Btn type="submit" kind="primary" disabled={submitting || !solution}>
                проверить
              </Btn>
            </form>
          </>
        )}

        {phase === "success" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--sage-soft)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 22px",
                color: "var(--ok)",
                animation: "oc-pop .4s ease",
              }}
            >
              <ICheck size={36} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>hh подключён 🎉</div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 8 }}>
              синхронизируем резюме и через секунду откроем дашборд
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: "var(--coral-soft)",
              color: "#7C2A1E",
            }}
          >
            <p style={{ fontWeight: 700, marginBottom: 6 }}>Ошибка</p>
            <p style={{ fontSize: 13, marginBottom: 12 }}>{error ?? "unknown"}</p>
            <Btn kind="primary" size="sm" onClick={reset}>
              попробовать снова
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

function OnbInput({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <input
        {...rest}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "#fff",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 14,
          color: "var(--ink)",
        }}
      />
    </label>
  );
}

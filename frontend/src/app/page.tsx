import Link from "next/link";
import { Bot, Filter, ShieldCheck, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: Filter,
    title: "Умные фильтры",
    body: "Регион, ЗП, опыт, график. Регекс-исключения для шума.",
  },
  {
    icon: Bot,
    title: "AI-сопроводительные",
    body: "GPT-4o-mini пишет письмо под каждую вакансию.",
  },
  {
    icon: ShieldCheck,
    title: "Антибан",
    body: "Лог-нормальные задержки, кластеры сессий, лимит 150/день.",
  },
  {
    icon: Zap,
    title: "Реалтайм",
    body: "Отклики и капчи приходят в браузер моментально.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="text-sm font-bold tracking-tight">AI Autoclicker</span>
        <Link
          href="/auth"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Войти
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Авто-отклики на hh.kz / hh.ru
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-gray-600 sm:text-lg">
          Подключи hh, выбери фильтры — бот сам подаёт 150 откликов в день
          с AI-сопроводительными.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/auth"
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Начать бесплатно
          </Link>
          <Link
            href="/auth"
            className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Уже есть аккаунт
          </Link>
        </div>
        <p className="mt-3 text-xs text-gray-500">7 дней trial · без карты</p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-gray-200 bg-white p-5"
            >
              <f.icon size={20} className="mb-3 text-gray-700" />
              <h3 className="mb-1 font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} AI Autoclicker · hh.kz / hh.ru
      </footer>
    </main>
  );
}

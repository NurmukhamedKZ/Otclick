import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-bold mb-4">AI Autoclicker hh</h1>
      <p className="mb-8 text-gray-700">
        Авто-отклики на вакансии hh.kz / hh.ru. AI-сопроводительные письма.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="px-4 py-2 border border-black rounded"
        >
          Вход
        </Link>
        <Link
          href="/signup"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Регистрация
        </Link>
      </div>
    </main>
  );
}

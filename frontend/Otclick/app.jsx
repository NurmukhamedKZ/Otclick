// Main app shell, routing, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "screen": "dashboard",
  "hhStatus": "ok",
  "workerState": "running",
  "showWorkerBar": true,
  "accent": "yellow-coral",
  "density": "comfy"
}/*EDITMODE-END*/;

const ACCENT_PALETTES = {
  'yellow-coral': { yellow: '#F5CB3D', coral: '#E96B58', sage: '#C7D4B6' },
  'mint-rose':    { yellow: '#C7E8B0', coral: '#F2A6B4', sage: '#D0E5DA' },
  'sky-amber':    { yellow: '#FFB854', coral: '#7AA9D8', sage: '#D2DDE6' },
  'mono':         { yellow: '#E0DBCE', coral: '#9C988D', sage: '#D9D4C5' },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const route = t.screen;
  const setRoute = (r) => setTweak('screen', r);

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [captchaOpen, setCaptchaOpen] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const setWorker = (v) => setTweak('workerState', v);
  const setHH = (v) => setTweak('hhStatus', v);

  // Apply accent palette
  React.useEffect(() => {
    const p = ACCENT_PALETTES[t.accent] || ACCENT_PALETTES['yellow-coral'];
    document.documentElement.style.setProperty('--yellow', p.yellow);
    document.documentElement.style.setProperty('--coral', p.coral);
    document.documentElement.style.setProperty('--sage', p.sage);
  }, [t.accent]);

  // Toast helper
  const pushToast = (text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 5000);
  };
  // expose globally so deep components can fire toasts
  React.useEffect(() => { window.__toast = pushToast; }, []);

  // Simulate a captcha event after 8s on dashboard for realism
  React.useEffect(() => {
    if (route !== 'dashboard') return;
    const tm = setTimeout(() => pushToast('новый отклик: Senior Backend @ Avito', 'success'), 4000);
    return () => clearTimeout(tm);
  }, [route]);

  // hotkey ⌘⇧R
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        pushToast('worker перезапущен', 'success');
      }
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Landing / Auth / Onboarding are full-bleed (no app chrome)
  if (route === 'landing') return <><Landing onAuth={() => setRoute('auth')} /><MyTweaks t={t} setTweak={setTweak} /></>;
  if (route === 'auth') return <><AuthScreen onAuth={() => setRoute('onboarding')} onBack={() => setRoute('landing')} /><MyTweaks t={t} setTweak={setTweak} /></>;
  if (route === 'onboarding') return <><OnboardingScreen onDone={() => setRoute('dashboard')} onSkip={() => setRoute('dashboard')} /><MyTweaks t={t} setTweak={setTweak} /></>;

  // App layout
  return (
    <div style={{ minHeight: '100vh', display: 'flex', padding: '16px 16px 16px 8px', gap: 0 }}>
      <Sidebar route={route} setRoute={setRoute} onFilters={() => setFiltersOpen(true)} />
      <main style={{ flex: 1, minWidth: 0, padding: '4px 12px 24px' }}>
        <Topbar onFilters={() => setFiltersOpen(true)} onUpgrade={() => setRoute('account')} />
        {t.showWorkerBar && (
          <WorkerBar
            state={t.workerState}
            setState={setWorker}
            todaySent={187}
            dailyLimit={200}
            queued={42}
            nextRun="через 38 с"
            lastError={t.workerState === 'error' ? 'rate_limit · hh.ru' : null}
          />
        )}
        {route === 'dashboard' && <Dashboard setRoute={setRoute} onFilters={() => setFiltersOpen(true)} hhStatus={t.hhStatus} />}
        {route === 'applications' && <ApplicationsScreen />}
        {route === 'account' && <AccountScreen hhStatus={t.hhStatus} setHHStatus={setHH} onReconnect={() => setRoute('onboarding')} />}
        {route === 'notifications' && <NotificationsFullScreen />}
        {route === 'filters' && <Dashboard setRoute={setRoute} onFilters={() => setFiltersOpen(true)} hhStatus={t.hhStatus} />}
      </main>

      <FiltersDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} />
      <CaptchaModal open={captchaOpen} onClose={() => setCaptchaOpen(false)} />
      <Toaster toasts={toasts} />
      <MyTweaks t={t} setTweak={setTweak} onCaptcha={() => setCaptchaOpen(true)} onFilters={() => setFiltersOpen(true)} onToast={pushToast} />
    </div>
  );
}

// === Notifications full screen ===
const NotificationsFullScreen = () => {
  const groups = [
    { title: 'сегодня', items: [
      { k: 'captcha', text: 'требуется решить капчу для отклика на «Tech Lead Platform» в Сбер', t: '14 мин' },
      { k: 'success', text: 'отправлено 5 откликов по фильтру «python remote»', t: '1 ч' },
      { k: 'limit', text: 'до дневного лимита осталось 13 откликов', t: '2 ч' },
      { k: 'token', text: 'токен hh обновлён автоматически', t: '7 ч' },
    ]},
    { title: 'вчера', items: [
      { k: 'success', text: 'отправлено 38 откликов за день', t: '23:59' },
      { k: 'success', text: 'получен новый ответ от работодателя Avito', t: '18:22' },
      { k: 'error', text: 'не удалось отправить отклик: vacancy_archived', t: '14:08' },
    ]},
    { title: 'на этой неделе', items: [
      { k: 'token', text: 'добавлено новое резюме «DevOps / SRE»', t: 'пн' },
      { k: 'success', text: 'pro тариф продлён на месяц', t: 'пн' },
    ]},
  ];
  const iconFor = (k) => k === 'captcha' ? <IShield size={14} /> : k === 'success' ? <ICheck size={14} /> : k === 'limit' ? <IBolt size={14} /> : k === 'error' ? <IClose size={14} /> : <ILink size={14} />;
  const colorFor = (k) => k === 'captcha' ? 'var(--coral)' : k === 'success' ? 'var(--ok)' : k === 'limit' ? 'var(--yellow)' : k === 'error' ? 'var(--err)' : 'var(--muted-2)';

  return (
    <Card tone="light">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Уведомления</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>последние 30 событий</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="ghost" size="sm" icon={<ICheck size={13} />}>прочитать все</Btn>
          <Btn kind="ghost" size="sm" icon={<ITrash size={13} />}>очистить</Btn>
        </div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>{g.title}</div>
          {g.items.map((n, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 14,
              background: i % 2 === 0 ? 'var(--bg-deep)' : 'transparent',
              marginBottom: 4,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 11,
                background: colorFor(n.k), color: ['limit', 'token'].includes(n.k) ? 'var(--ink)' : '#fff',
                display: 'grid', placeItems: 'center',
              }}>{iconFor(n.k)}</div>
              <div style={{ flex: 1, fontSize: 14 }}>{n.text}</div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{n.t}</span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
};

// === Tweaks panel ===
const MyTweaks = ({ t, setTweak, onCaptcha, onFilters, onToast }) => (
  <TweaksPanel title="Tweaks">
    <TweakSection label="Экран">
      <TweakSelect
        label="текущий экран"
        value={t.screen}
        onChange={v => setTweak('screen', v)}
        options={[
          { value: 'landing', label: 'Лендинг' },
          { value: 'auth', label: 'Логин / регистрация' },
          { value: 'onboarding', label: 'Подключение hh' },
          { value: 'dashboard', label: 'Дашборд' },
          { value: 'applications', label: 'Все отклики' },
          { value: 'notifications', label: 'Уведомления' },
          { value: 'account', label: 'Аккаунт' },
        ]}
      />
    </TweakSection>

    <TweakSection label="Состояние воркера">
      <TweakRadio
        label="статус"
        value={t.workerState}
        onChange={v => setTweak('workerState', v)}
        options={[
          { value: 'running', label: 'работает' },
          { value: 'stopped', label: 'стоп' },
          { value: 'error', label: 'ошибка' },
        ]}
      />
      <TweakRadio
        label="hh.ru"
        value={t.hhStatus}
        onChange={v => setTweak('hhStatus', v)}
        options={[
          { value: 'ok', label: 'ок' },
          { value: 'warn', label: 'истекает' },
          { value: 'err', label: 'нет связи' },
        ]}
      />
      <TweakToggle label="показать панель воркера" value={t.showWorkerBar} onChange={v => setTweak('showWorkerBar', v)} />
    </TweakSection>

    <TweakSection label="Цвет">
      <TweakSelect
        label="палитра"
        value={t.accent}
        onChange={v => setTweak('accent', v)}
        options={[
          { value: 'yellow-coral', label: 'жёлто-коралл (по умолчанию)' },
          { value: 'mint-rose', label: 'мята-роза' },
          { value: 'sky-amber', label: 'небо-янтарь' },
          { value: 'mono', label: 'монохром' },
        ]}
      />
    </TweakSection>

    <TweakSection label="Действия">
      <TweakButton label="показать модалку капчи" onClick={onCaptcha} />
      <TweakButton label="открыть фильтры" onClick={onFilters} secondary />
      <TweakButton label="тестовый toast" onClick={() => onToast && onToast('новый отклик: Backend @ Тинькофф', 'success')} secondary />
    </TweakSection>
  </TweaksPanel>
);

// Custom TweakColor with custom labels (the starter component supports it but let's keep our own)
// Actually use the starter's TweakColor which renders palette swatches; the `labels` prop isn't standard but
// the starter just iterates options. Let's just rely on the swatches.

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

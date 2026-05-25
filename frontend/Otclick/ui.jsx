// Shared UI primitives & shell

const cn = (...xs) => xs.filter(Boolean).join(' ');

// --- Card ---
const cardStyles = {
  base: {
    borderRadius: 22,
    padding: 22,
    position: 'relative',
  },
  light: { background: 'var(--surface)', color: 'var(--ink)' },
  dark:  { background: 'var(--ink)', color: '#F5F1E6' },
  cream: { background: 'var(--bg-deep)', color: 'var(--ink)' },
};
const Card = ({ tone = 'light', style, children, ...rest }) => (
  <div style={{ ...cardStyles.base, ...cardStyles[tone], ...style }} {...rest}>{children}</div>
);

// --- StatusDot ---
const StatusDot = ({ tone = 'ok', size = 8, glow = true }) => {
  const c = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--err)' : 'var(--muted-2)';
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: 999,
      background: c, boxShadow: glow ? `0 0 0 3px ${c}22` : 'none', flexShrink: 0,
    }} />
  );
};

// --- Pill button ---
const Btn = ({ kind = 'ghost', size = 'md', icon, children, style, ...rest }) => {
  const pad = size === 'sm' ? '7px 12px' : size === 'lg' ? '14px 22px' : '10px 16px';
  const fs = size === 'sm' ? 13 : size === 'lg' ? 15 : 14;
  const palettes = {
    primary: { background: 'var(--ink)', color: '#fff', border: '1px solid var(--ink)' },
    yellow:  { background: 'var(--yellow)', color: 'var(--ink)', border: '1px solid var(--yellow)' },
    coral:   { background: 'var(--coral)', color: '#fff', border: '1px solid var(--coral)' },
    ghost:   { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)' },
    ghostDark: { background: 'transparent', color: '#F5F1E6', border: '1px solid #ffffff22' },
    soft:    { background: 'var(--bg-deep)', color: 'var(--ink)', border: '1px solid transparent' },
    white:   { background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' },
  };
  return (
    <button
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: pad,
        borderRadius: 999, fontSize: fs, fontWeight: 600, lineHeight: 1,
        transition: 'transform .15s ease, opacity .15s ease',
        ...palettes[kind], ...style,
      }}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(.97)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      {...rest}
    >
      {icon}{children}
    </button>
  );
};

// --- Tag / chip ---
const Tag = ({ tone = 'neutral', children, dot = false, style }) => {
  const palettes = {
    neutral: { bg: '#F1ECE1', fg: 'var(--ink)', dot: 'var(--muted)' },
    ok:      { bg: '#E2EEDB', fg: '#2F5C36', dot: 'var(--ok)' },
    warn:    { bg: '#FBEACB', fg: '#7A5418', dot: 'var(--warn)' },
    err:     { bg: '#F8D9D2', fg: '#7C2A1E', dot: 'var(--err)' },
    yellow:  { bg: 'var(--yellow)', fg: 'var(--ink)', dot: 'var(--ink)' },
    coral:   { bg: 'var(--coral-soft)', fg: '#7C2A1E', dot: 'var(--coral)' },
    dark:    { bg: 'var(--ink)', fg: '#F5F1E6', dot: 'var(--yellow)' },
  };
  const p = palettes[tone] || palettes.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: p.bg, color: p.fg, ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: p.dot }} />}
      {children}
    </span>
  );
};

// --- Sidebar ---
const SidebarItem = ({ icon, active, onClick, label }) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      width: 44, height: 44, borderRadius: 14, border: 'none',
      display: 'grid', placeItems: 'center',
      background: active ? 'var(--ink)' : 'transparent',
      color: active ? '#F5F1E6' : 'var(--ink)',
      transition: 'background .2s',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--line-2)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    {icon}
  </button>
);

const Sidebar = ({ route, setRoute, onFilters }) => {
  const items = [
    { id: 'dashboard', icon: <IHome />, label: 'Главная' },
    { id: 'applications', icon: <IList />, label: 'Отклики' },
    { id: 'filters', icon: <IFilter />, label: 'Фильтры', action: onFilters },
    { id: 'notifications', icon: <IBell />, label: 'Уведомления' },
    { id: 'account', icon: <IUser />, label: 'Аккаунт' },
  ];
  return (
    <aside style={{
      width: 76, flexShrink: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 0 24px', gap: 14,
      borderRight: '1px solid transparent',
    }}>
      <div style={{ marginBottom: 8 }}><ILogo size={36} /></div>
      <div style={{
        background: 'var(--surface)', borderRadius: 22, padding: 8,
        display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: '0 1px 0 var(--line-2)',
      }}>
        {items.map(it => (
          <SidebarItem
            key={it.id}
            icon={it.icon}
            label={it.label}
            active={!it.action && route === it.id}
            onClick={() => it.action ? it.action() : setRoute(it.id)}
          />
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{
        background: 'var(--surface)', borderRadius: 22, padding: 8,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <SidebarItem icon={<ISettings />} label="Настройки" onClick={() => setRoute('account')} />
      </div>
      <div style={{
        width: 44, height: 44, borderRadius: 14, overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--yellow) 0%, var(--coral) 100%)',
        display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--ink)',
      }}>
        АК
      </div>
    </aside>
  );
};

// --- Topbar ---
const Topbar = ({ onFilters, onUpgrade }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0 18px' }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
        Привет, Артём
      </div>
      <div style={{ color: 'var(--muted)', marginTop: 2, fontSize: 14 }}>
        Посмотрим, что бот сделал за тебя сегодня
      </div>
    </div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--surface)', borderRadius: 999, padding: '8px 18px',
      minWidth: 320,
    }}>
      <ISearch size={18} stroke="var(--muted)" />
      <input
        placeholder="поиск по вакансиям, работодателям…"
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 14, color: 'var(--ink)', fontFamily: 'inherit',
        }}
      />
      <kbd className="mono" style={{
        fontSize: 11, color: 'var(--muted)',
        background: 'var(--bg-deep)', padding: '2px 6px', borderRadius: 6,
      }}>⌘K</kbd>
    </div>
    <Btn kind="ghost" icon={<IFilter size={16} />} onClick={onFilters}>Фильтры</Btn>
    <Btn kind="primary" icon={<IBolt size={16} />} onClick={onUpgrade}>Pro</Btn>
  </div>
);

// --- Worker status bar (sticky, the differentiator) ---
const WorkerBar = ({ state, setState, todaySent, dailyLimit, queued, nextRun, lastError }) => {
  const isRunning = state === 'running';
  const isErr = state === 'error';
  const dot = isErr ? 'err' : isRunning ? 'ok' : 'warn';
  const label = isErr ? 'ошибка' : isRunning ? 'работает' : 'остановлен';
  return (
    <div style={{
      background: 'var(--ink)', color: '#F5F1E6',
      borderRadius: 18, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 18,
      marginBottom: 18,
      boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <StatusDot tone={dot} size={9} />
          {isRunning && <span style={{
            position: 'absolute', inset: -4, borderRadius: 999,
            border: '1px solid var(--ok)', opacity: .5,
            animation: 'pulse 1.6s infinite',
          }} />}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>worker · {label}</span>
      </div>
      <div style={{ height: 18, width: 1, background: '#ffffff15' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13 }}>
        <span style={{ color: '#ffffff80' }}>сегодня</span>
        <span className="mono" style={{ fontWeight: 600 }}>{todaySent}<span style={{ color: '#ffffff50' }}>/{dailyLimit}</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13 }}>
        <span style={{ color: '#ffffff80' }}>в очереди</span>
        <span className="mono" style={{ fontWeight: 600 }}>{queued}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13 }}>
        <span style={{ color: '#ffffff80' }}>след. запуск</span>
        <span className="mono" style={{ fontWeight: 600 }}>{nextRun}</span>
      </div>
      {lastError && (
        <div style={{
          background: '#ffffff10', color: 'var(--coral-soft)',
          padding: '4px 10px', borderRadius: 999, fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>⚠</span> {lastError}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={() => setState(isRunning ? 'stopped' : 'running')}
        style={{
          border: 'none', background: isRunning ? '#ffffff15' : 'var(--yellow)',
          color: isRunning ? '#F5F1E6' : 'var(--ink)',
          borderRadius: 999, padding: '8px 14px', fontWeight: 600, fontSize: 13,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {isRunning ? <><IPause size={14} /> остановить</> : <><IPlay size={14} /> запустить</>}
      </button>
      <button onClick={() => window.__toast && window.__toast('worker перезапущен', 'success')} style={{
        border: 'none', background: '#ffffff15', color: '#F5F1E6',
        borderRadius: 999, width: 34, height: 34, display: 'grid', placeItems: 'center',
        cursor: 'pointer',
      }} title="обновить (⌘⇧R)">
        <IRefresh size={15} />
      </button>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(.8); opacity: .6; }
          70% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// --- HH connection banner ---
const HHBanner = ({ status, onReconnect }) => {
  const map = {
    ok:   { tone: 'sage', label: 'hh подключён', sub: 'токен действителен · обновится через 7 ч', dot: 'ok' },
    warn: { tone: 'yellow', label: 'токен скоро истечёт', sub: 'мы обновим его автоматически', dot: 'warn' },
    err:  { tone: 'coral', label: 'нет связи с hh', sub: 'переподключи аккаунт, чтобы продолжить', dot: 'err' },
  };
  const m = map[status];
  const bg = status === 'ok' ? 'var(--sage-soft)' : status === 'warn' ? 'var(--yellow-soft)' : 'var(--coral-soft)';
  return (
    <div style={{
      background: bg, borderRadius: 18, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18,
    }}>
      <StatusDot tone={m.dot} size={10} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', opacity: .8 }}>{m.sub}</div>
      </div>
      {status !== 'ok' && <Btn kind="primary" size="sm" onClick={onReconnect}>переподключить</Btn>}
    </div>
  );
};

Object.assign(window, { cn, Card, StatusDot, Btn, Tag, Sidebar, Topbar, WorkerBar, HHBanner, cardStyles });

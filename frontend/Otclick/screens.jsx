// Screens: Dashboard, Applications, Account

// =============== Dashboard ===============

const ActivityOrbs = () => {
  // mimics the workout-orb data viz: three overlapping blurred orbs
  const stats = [
    { color: '#1A1B1F', value: '2.3', label: 'ч активности', sub: 'time', sz: 92, x: 70, y: 95, fg: '#F5F1E6' },
    { color: '#F5CB3D', value: '187', label: 'откликов', sub: 'sent', sz: 195, x: 290, y: 70, fg: '#1A1B1F' },
    { color: '#E96B58', value: '12', label: 'на капчу', sub: 'captcha', sz: 130, x: 175, y: 165, fg: '#fff' },
  ];
  return (
    <div style={{ position: 'relative', height: 280, width: '100%' }}>
      {/* Blurred glow halos */}
      {stats.map((s, i) => (
        <div key={`g${i}`} style={{
          position: 'absolute', left: s.x - 10, top: s.y - 10,
          width: s.sz + 20, height: s.sz + 20, borderRadius: '50%',
          background: s.color, opacity: 0.45, filter: 'blur(28px)',
        }} />
      ))}
      {/* Solid orbs with labels */}
      {stats.map((s, i) => (
        <div key={`o${i}`} style={{
          position: 'absolute', left: s.x, top: s.y, width: s.sz, height: s.sz, borderRadius: '50%',
          background: s.color, color: s.fg,
          display: 'grid', placeItems: 'center', textAlign: 'center',
          zIndex: 2 - i,
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        }}>
          <div>
            <div style={{ fontSize: s.sz > 150 ? 32 : s.sz > 110 ? 22 : 16, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ActivityLegend = () => {
  const items = [
    { c: 'var(--yellow)', label: 'отправлено' },
    { c: 'var(--coral)', label: 'требует капчи' },
    { c: 'var(--ink)', label: 'время работы' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }}>
          <span style={{ width: 28, height: 8, borderRadius: 999, background: it.c }} />
          {it.label}
        </div>
      ))}
    </div>
  );
};

const TodayResultsCard = () => {
  // hourly applications data
  const hours = [
    { h: 6, sent: 4, capt: 0 },
    { h: 7, sent: 12, capt: 0 },
    { h: 8, sent: 22, capt: 1 },
    { h: 9, sent: 18, capt: 1 },
    { h: 10, sent: 28, capt: 2 },
    { h: 11, sent: 24, capt: 1 },
    { h: 12, sent: 9, capt: 0 },
    { h: 13, sent: 32, capt: 3 },
    { h: 14, sent: 38, capt: 4 },
  ];
  const W = 520, H = 180, PAD = 10;
  const maxY = 42;
  const xFor = (i) => PAD + (i / (hours.length - 1)) * (W - PAD * 2);
  const yFor = (v) => H - PAD - (v / maxY) * (H - PAD * 2);
  // Smooth area path
  const pts = hours.map((h, i) => [xFor(i), yFor(h.sent)]);
  const smooth = (pts) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  };
  const linePath = smooth(pts);
  const areaPath = linePath + ` L ${pts[pts.length - 1][0]} ${H - PAD} L ${pts[0][0]} ${H - PAD} Z`;

  return (
    <Card tone="cream" style={{ padding: 24, height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>что бот сделал за сегодня</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2.5, lineHeight: 0.85 }}>187</span>
            <span className="serif" style={{ fontSize: 26 }}>откликов</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--ink)', color: 'var(--yellow)', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>↑ 38 за час</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--coral-soft)', color: '#7C2A1E', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>· 12 на капчу</span>
          </div>
        </div>
        <button onClick={() => window.__toast && window.__toast('подробный отчёт за день', 'info')} style={{
          width: 38, height: 38, borderRadius: 12, border: 'none',
          background: 'var(--ink)', color: 'var(--yellow)', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
        }}><IBolt size={16} /></button>
      </div>

      {/* Area chart */}
      <div style={{ position: 'relative', marginTop: 22 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 180, display: 'block' }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--yellow)', stopOpacity: 0.75 }} />
              <stop offset="100%" style={{ stopColor: 'var(--yellow)', stopOpacity: 0.05 }} />
            </linearGradient>
            <pattern id="dotgrid" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="var(--muted-2)" opacity="0.5" />
            </pattern>
          </defs>
          {/* dot background */}
          <rect x="0" y="0" width={W} height={H} fill="url(#dotgrid)" opacity="0.5" />
          {/* area */}
          <path d={areaPath} fill="url(#areaGrad)" />
          {/* line */}
          <path d={linePath} stroke="var(--ink)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* hour ticks */}
          {hours.map((h, i) => (
            <g key={i}>
              {/* captcha event dots above the line */}
              {h.capt > 0 && (
                <circle cx={xFor(i)} cy={yFor(h.sent) - 12} r="3.5" fill="var(--coral)" />
              )}
            </g>
          ))}
          {/* now marker — pulsing yellow dot with vertical line */}
          <line x1={xFor(hours.length - 1)} y1="0" x2={xFor(hours.length - 1)} y2={H} stroke="var(--ink)" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
          <circle cx={xFor(hours.length - 1)} cy={yFor(hours[hours.length - 1].sent)} r="14" fill="var(--yellow)" opacity="0.25">
            <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={xFor(hours.length - 1)} cy={yFor(hours[hours.length - 1].sent)} r="6" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="2" />
        </svg>
        {/* x-axis labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 6px' }}>
          {hours.map((h, i) => (
            <span key={i} className="mono" style={{
              fontSize: 10,
              color: i === hours.length - 1 ? 'var(--ink)' : 'var(--muted)',
              fontWeight: i === hours.length - 1 ? 700 : 400,
            }}>{h.h.toString().padStart(2, '0')}</span>
          ))}
        </div>
      </div>

      {/* Footer stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
        marginTop: 22, padding: '14px 0 0', borderTop: '1px solid var(--line)',
      }}>
        {[
          { v: '2.3', u: 'ч', l: 'активности' },
          { v: '38', u: 'с', l: 'средняя пауза' },
          { v: '94', u: '%', l: 'успех' },
          { v: '42', u: '', l: 'в очереди' },
        ].map((s, i) => (
          <div key={i} style={{
            paddingLeft: i ? 16 : 0,
            borderLeft: i ? '1px solid var(--line)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{s.v}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.u}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const ActivityCalendar = () => {
  const days = ['П','В','С','Ч','П','С','В'];
  // Generate June grid
  const cells = [];
  // first row has empty leading cells
  for (let i = 0; i < 31; i++) cells.push(i + 1);
  const dayState = (d) => {
    if ([1, 5].includes(d)) return 'today';
    if ([6, 7, 13, 14, 20, 21, 27, 28].includes(d)) return 'rest';
    if ([2, 3, 8, 9, 10, 12, 17, 19, 23, 24].includes(d)) return 'done';
    return 'plain';
  };
  return (
    <Card tone="dark" style={{ height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Активность за месяц</div>
        <button style={{
          background: '#ffffff10', color: '#F5F1E6', border: 'none',
          padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>июнь <IChevDown size={12} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
        {days.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, color: '#ffffff60' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map(d => {
          const st = dayState(d);
          const palette = {
            plain: { bg: 'transparent', fg: '#ffffff70', border: '1px solid #ffffff15' },
            done:  { bg: '#ffffff10', fg: '#F5F1E6', border: 'none' },
            rest:  { bg: '#3A3A40', fg: '#ffffff90', border: 'none' },
            today: { bg: 'var(--yellow)', fg: 'var(--ink)', border: 'none', fontWeight: 700 },
          }[st];
          return (
            <div key={d} style={{
              aspectRatio: '1', borderRadius: 10, display: 'grid', placeItems: 'center',
              fontSize: 12, ...palette,
            }}>{d}</div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 16, fontSize: 11, color: '#ffffff80' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--yellow)' }} /> сегодня
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#ffffff50' }} /> отклики
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#5A5A60' }} /> пауза
        </span>
      </div>
    </Card>
  );
};

// --- Daily limit ring ---
const LimitRing = () => {
  const goal = 200, current = 187;
  const pct = current / goal;
  const C = 2 * Math.PI * 52;
  return (
    <Card tone="light" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Лимит на сегодня</div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, maxWidth: 160 }}>
          Бот сам остановится при достижении лимита
        </div>
        <button style={{
          marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', color: 'var(--ink)',
          fontSize: 13, fontWeight: 600, padding: 0,
        }}>
          Изменить лимит <span style={{
            width: 22, height: 22, borderRadius: 999, background: 'var(--ink)',
            color: '#F5F1E6', display: 'grid', placeItems: 'center',
          }}><IArrow size={11} /></span>
        </button>
      </div>
      <div style={{ position: 'relative', width: 130, height: 130 }}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r="52" stroke="var(--bg-deep)" strokeWidth="10" fill="none" />
          <circle cx="65" cy="65" r="52" stroke="var(--coral)" strokeWidth="10" fill="none"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} strokeLinecap="round"
            transform="rotate(-90 65 65)" />
          <circle cx="65" cy="65" r="52" stroke="var(--yellow)" strokeWidth="3" fill="none"
            strokeDasharray={C} strokeDashoffset={C * (1 - 0.83)} strokeLinecap="round"
            transform="rotate(-90 65 65)" opacity="0.7" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 0.5 }}>цель</div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>200</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{current} отправлено</div>
        </div>
      </div>
    </Card>
  );
};

// --- Weekly plan progress ---
const WeeklyPlan = () => (
  <Card tone="light">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>Недельный план</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>68<span style={{ fontSize: 14 }}>%</span></span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>выполнено</span>
      </div>
    </div>
    <div style={{ position: 'relative', marginTop: 22 }}>
      <div style={{
        position: 'absolute', left: 'calc(68% - 24px)', top: -22,
        background: 'var(--ink)', color: '#F5F1E6',
        padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      }}>
        816 / 1200
      </div>
      <div style={{ height: 10, background: 'var(--bg-deep)', borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '68%',
          background: 'var(--ink)', borderRadius: 999,
        }} />
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${68 + (i+1)*3}%`, top: 3, bottom: 3, width: 2,
            background: i < 3 ? 'var(--yellow)' : 'var(--muted-2)', opacity: .6, borderRadius: 999,
          }} />
        ))}
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
      <span className="mono">пн 17</span>
      <span className="mono">вс 23</span>
    </div>
  </Card>
);

// --- Resumes card ---
const ResumesCard = () => {
  const resumes = [
    { title: 'Senior Backend Engineer', sync: 'час назад', active: true, applied: 142 },
    { title: 'Python Developer', sync: '3 ч назад', active: true, applied: 45 },
    { title: 'DevOps / SRE', sync: 'вчера', active: false, applied: 0 },
  ];
  return (
    <Card tone="light">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Мои резюме</div>
        <Btn kind="soft" size="sm" icon={<IRefresh size={14} />} onClick={() => window.__toast && window.__toast('синхронизация резюме…', 'info')}>синхронизировать</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {resumes.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 14px', background: 'var(--bg-deep)', borderRadius: 14,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              background: r.active ? 'var(--ink)' : 'transparent',
              color: r.active ? '#F5F1E6' : 'var(--muted)',
              border: r.active ? 'none' : '1px dashed var(--muted-2)',
              display: 'grid', placeItems: 'center',
            }}><IDoc size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                синхронизировано {r.sync} · {r.applied} откликов
              </div>
            </div>
            {r.active
              ? <Tag tone="dark" dot>активно</Tag>
              : <Tag tone="neutral">выкл</Tag>}
          </div>
        ))}
      </div>
    </Card>
  );
};

// --- Recent applications list (like My Habits) ---
const RecentApplications = ({ onAll }) => {
  const apps = [
    { v: 'Senior Backend Engineer', e: 'Avito', when: '2 мин', status: 'sent', count: '9/12', filt: 'python remote' },
    { v: 'Python Developer (Django)', e: 'Wildberries', when: '8 мин', status: 'sent', count: '6/12', filt: 'python remote' },
    { v: 'Tech Lead Platform', e: 'Сбер', when: '14 мин', status: 'captcha', count: '—', filt: 'tech lead' },
    { v: 'Backend Developer', e: 'Тинькофф', when: '22 мин', status: 'sent', count: '4/8', filt: 'fullstack' },
    { v: 'SRE Engineer', e: 'Яндекс', when: '37 мин', status: 'error', count: '—', filt: 'devops' },
    { v: 'Platform Engineer', e: 'VK', when: '48 мин', status: 'sent', count: '8/10', filt: 'devops' },
  ];
  const statusMap = {
    sent: { tone: 'ok', label: 'отправлено' },
    captcha: { tone: 'coral', label: 'капча' },
    error: { tone: 'err', label: 'ошибка' },
  };
  return (
    <Card tone="light">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Последние отклики</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>обновляется в реальном времени</div>
        </div>
        <button onClick={onAll} style={{
          background: 'var(--ink)', color: '#F5F1E6', border: 'none',
          padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>все отклики <IPlus size={13} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {apps.map((a, i) => {
          const s = statusMap[a.status];
          const sentBars = a.count !== '—' ? parseInt(a.count) : 0;
          const totalBars = a.count !== '—' ? parseInt(a.count.split('/')[1]) : 0;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 14, background: 'var(--bg-deep)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: '#fff', color: 'var(--ink)',
                display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                border: '1px solid var(--line)',
              }}>{a.e[0]}{a.e[1]?.toLowerCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.v}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {a.e} · фильтр «{a.filt}»
                </div>
              </div>
              {/* Mini "sessions" progress like the reference */}
              {a.count !== '—' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[...Array(totalBars)].map((_, j) => (
                      <span key={j} style={{
                        width: 3, height: 14, borderRadius: 2,
                        background: j < sentBars ? 'var(--ink)' : 'var(--muted-2)',
                        opacity: j < sentBars ? 1 : .4,
                      }} />
                    ))}
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32 }}>{a.count}</span>
                </div>
              )}
              <Tag tone={s.tone} dot>{s.label}</Tag>
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 42, textAlign: 'right' }}>{a.when}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// --- Notifications card ---
const NotificationsCard = () => {
  const notifs = [
    { kind: 'captcha', text: 'требуется решить капчу', time: '14 мин', unread: true },
    { kind: 'success', text: 'отправлено 5 откликов по фильтру «python remote»', time: '1 ч', unread: true },
    { kind: 'limit', text: 'до дневного лимита осталось 13 откликов', time: '2 ч', unread: false },
    { kind: 'token', text: 'токен hh обновлён автоматически', time: '7 ч', unread: false },
  ];
  const iconFor = (k) => k === 'captcha' ? <IShield size={14} /> : k === 'success' ? <ICheck size={14} /> : k === 'limit' ? <IBolt size={14} /> : <ILink size={14} />;
  const colorFor = (k) => k === 'captcha' ? 'var(--coral)' : k === 'success' ? 'var(--ok)' : k === 'limit' ? 'var(--yellow)' : 'var(--muted-2)';
  return (
    <Card tone="light">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Уведомления</div>
        <button onClick={() => window.__toast && window.__toast('все уведомления отмечены прочитанными', 'success')} style={{
          background: 'transparent', border: 'none', color: 'var(--muted)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>прочитать все</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {notifs.map((n, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 4px', borderBottom: i < notifs.length - 1 ? '1px solid var(--line-2)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: colorFor(n.kind) + (n.unread ? '' : '40'),
              color: n.kind === 'limit' || n.kind === 'token' ? 'var(--ink)' : '#fff',
              display: 'grid', placeItems: 'center',
            }}>{iconFor(n.kind)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: n.unread ? 600 : 500 }}>{n.text}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{n.time} назад</div>
            </div>
            {n.unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--coral)' }} />}
          </div>
        ))}
      </div>
    </Card>
  );
};

const QuickActions = ({ onFilters, onApplications, onAccount }) => {
  const items = [
    { icon: <IFilter size={16} />, label: 'Фильтры', sub: '4 активных', click: onFilters, tone: 'yellow' },
    { icon: <IList size={16} />, label: 'Все отклики', sub: '1 247 всего', click: onApplications, tone: 'dark' },
    { icon: <IUser size={16} />, label: 'Аккаунт', sub: 'настройки', click: onAccount, tone: 'light' },
  ];
  return (
    <Card tone="cream" style={{ padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Быстрые действия</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const palette = it.tone === 'yellow'
            ? { bg: 'var(--yellow)', fg: 'var(--ink)' }
            : it.tone === 'dark'
              ? { bg: 'var(--ink)', fg: '#F5F1E6' }
              : { bg: '#fff', fg: 'var(--ink)' };
          return (
            <button key={i} onClick={it.click} style={{
              border: 'none', textAlign: 'left',
              background: palette.bg, color: palette.fg,
              padding: '14px 16px', borderRadius: 16,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: it.tone === 'light' ? 'var(--bg-deep)' : '#ffffff20',
                display: 'grid', placeItems: 'center',
              }}>{it.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{it.label}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>{it.sub}</div>
              </div>
              <IChevRight size={16} />
            </button>
          );
        })}
      </div>
    </Card>
  );
};

const Dashboard = ({ setRoute, onFilters, hhStatus }) => (
  <>
    {hhStatus !== 'ok' && <HHBanner status={hhStatus} onReconnect={() => setRoute('onboarding')} />}
    <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 18 }}>
      <TodayResultsCard />
      <ActivityCalendar />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginTop: 18 }}>
      <LimitRing />
      <WeeklyPlan />
      <QuickActions
        onFilters={onFilters}
        onApplications={() => setRoute('applications')}
        onAccount={() => setRoute('account')}
      />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 18, marginTop: 18 }}>
      <RecentApplications onAll={() => setRoute('applications')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ResumesCard />
        <NotificationsCard />
      </div>
    </div>
  </>
);

// =============== Applications screen ===============

const ALL_APPS = [
  ['sent', 'Senior Backend Engineer', 'Avito', '2 мин', null, 'python remote'],
  ['sent', 'Python Developer (Django)', 'Wildberries', '8 мин', null, 'python remote'],
  ['captcha', 'Tech Lead Platform', 'Сбер', '14 мин', 'требуется капча', 'tech lead'],
  ['sent', 'Backend Developer', 'Тинькофф', '22 мин', null, 'fullstack'],
  ['error', 'SRE Engineer', 'Яндекс', '37 мин', 'vacancy_archived', 'devops'],
  ['sent', 'Platform Engineer', 'VK', '48 мин', null, 'devops'],
  ['sent', 'Backend Engineer (Go)', 'Ozon', '1 ч', null, 'go remote'],
  ['sent', 'Senior Python Developer', 'Wildberries', '1 ч', null, 'python remote'],
  ['skipped', 'Junior Backend Developer', 'X5 Group', '1 ч', 'не подходит по фильтру', 'python remote'],
  ['sent', 'Backend Architect', 'Альфа-Банк', '2 ч', null, 'tech lead'],
  ['sent', 'Python Tech Lead', 'Магнит', '2 ч', null, 'tech lead'],
  ['error', 'DevOps Engineer', 'Mail.ru', '2 ч', 'rate_limited', 'devops'],
  ['sent', 'Senior Go Developer', 'Альфа-Банк', '3 ч', null, 'go remote'],
  ['sent', 'Backend Developer', 'Контур', '3 ч', null, 'fullstack'],
  ['sent', 'Platform Architect', 'Циан', '4 ч', null, 'tech lead'],
];

const ApplicationsScreen = () => {
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [spinning, setSpinning] = React.useState(false);
  const onRefresh = () => {
    setSpinning(true);
    setTimeout(() => { setSpinning(false); window.__toast && window.__toast('обновлено · 3 новых отклика', 'success'); }, 600);
  };
  const filters = [
    { id: 'all', label: 'все', count: 1247 },
    { id: 'sent', label: 'отправленные', count: 1186, tone: 'ok' },
    { id: 'captcha', label: 'капча', count: 12, tone: 'coral' },
    { id: 'error', label: 'ошибки', count: 31, tone: 'err' },
    { id: 'skipped', label: 'пропущенные', count: 18, tone: 'neutral' },
  ];
  const statusMap = {
    sent: { tone: 'ok', label: 'отправлено' },
    captcha: { tone: 'coral', label: 'капча' },
    error: { tone: 'err', label: 'ошибка' },
    skipped: { tone: 'neutral', label: 'пропуск' },
  };
  const rows = ALL_APPS.filter(r => (status === 'all' || r[0] === status))
    .filter(r => !search || (r[1] + r[2]).toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <Card tone="light" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>Все отклики</div>
          <Tag tone="dark" dot>realtime</Tag>
          <div style={{ flex: 1 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-deep)', borderRadius: 999, padding: '8px 14px', minWidth: 280,
          }}>
            <ISearch size={16} stroke="var(--muted)" />
            <input
              placeholder="vacancy_id, employer_id, название…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13 }}
            />
          </div>
          <Btn kind="ghost" size="sm" icon={<IRefresh size={14} style={spinning ? { animation: 'spin 0.6s linear infinite' } : {}} />} onClick={onRefresh}>обновить</Btn>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setStatus(f.id)} style={{
              border: 'none',
              background: status === f.id ? 'var(--ink)' : 'var(--bg-deep)',
              color: status === f.id ? '#F5F1E6' : 'var(--ink)',
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {f.label}
              <span className="mono" style={{
                background: status === f.id ? '#ffffff15' : '#ffffff',
                padding: '2px 7px', borderRadius: 999, fontSize: 11,
              }}>{f.count}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card tone="light" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '120px 1fr 180px 160px 110px 60px',
          gap: 14, padding: '14px 22px', fontSize: 11, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
          borderBottom: '1px solid var(--line-2)',
        }}>
          <div>статус</div><div>вакансия</div><div>работодатель</div><div>комментарий</div><div>время</div><div></div>
        </div>
        {rows.map((r, i) => {
          const s = statusMap[r[0]];
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 180px 160px 110px 60px',
              gap: 14, padding: '16px 22px', alignItems: 'center', fontSize: 13,
              borderBottom: i < rows.length - 1 ? '1px solid var(--line-2)' : 'none',
              transition: 'background .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-deep)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Tag tone={s.tone} dot>{s.label}</Tag>
              <div>
                <div style={{ fontWeight: 600 }}>{r[1]}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>фильтр «{r[5]}»</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: 'var(--bg-deep)', display: 'grid', placeItems: 'center',
                  fontSize: 10, fontWeight: 700,
                }}>{r[2][0]}</div>
                {r[2]}
              </div>
              <div style={{ fontSize: 12, color: r[4] ? 'var(--coral)' : 'var(--muted)' }}>{r[4] || '—'}</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r[3]} назад</div>
              <a href="#" style={{ color: 'var(--ink)', display: 'inline-flex' }}><IExternal size={15} /></a>
            </div>
          );
        })}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 22px', fontSize: 12, color: 'var(--muted)',
          borderTop: '1px solid var(--line-2)',
        }}>
          <span>показано {rows.length} из {filters.find(f => f.id === status).count}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>‹</button>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setPage(n)} style={{
                padding: '6px 12px', border: page === n ? 'none' : '1px solid var(--line)',
                background: page === n ? 'var(--ink)' : 'transparent',
                color: page === n ? '#F5F1E6' : 'var(--ink)',
                borderRadius: 8, fontWeight: 600, cursor: 'pointer',
              }}>{n}</button>
            ))}
            <span>…</span>
            <button onClick={() => setPage(50)} style={{ padding: '6px 12px', border: page === 50 ? 'none' : '1px solid var(--line)', background: page === 50 ? 'var(--ink)' : 'transparent', color: page === 50 ? '#F5F1E6' : 'var(--ink)', borderRadius: 8, cursor: 'pointer' }}>50</button>
            <button onClick={() => setPage(p => Math.min(50, p + 1))} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>›</button>
          </div>
        </div>
      </Card>
    </>
  );
};

// =============== Account screen ===============

const AccountScreen = ({ hhStatus, setHHStatus, onReconnect }) => {
  const [tab, setTab] = React.useState('profile');
  const tabs = [
    { id: 'profile', label: 'Профиль' },
    { id: 'plan', label: 'Тариф' },
    { id: 'integrations', label: 'Интеграции' },
    { id: 'danger', label: 'Опасная зона' },
  ];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
        <div style={{
          width: 80, height: 80, borderRadius: 22,
          background: 'linear-gradient(135deg, var(--yellow) 0%, var(--coral) 100%)',
          display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 800, color: 'var(--ink)',
        }}>АК</div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Артём Ковалёв</div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>artem@example.com · с марта 2025</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Tag tone="dark" dot>pro</Tag>
            <Tag tone="ok" dot>hh подключён</Tag>
          </div>
        </div>
      </div>

      <div style={{
        display: 'inline-flex', background: 'var(--surface)', padding: 6, borderRadius: 999, marginBottom: 18,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            border: 'none', padding: '8px 18px', borderRadius: 999,
            background: tab === t.id ? 'var(--ink)' : 'transparent',
            color: tab === t.id ? '#F5F1E6' : 'var(--ink)',
            fontSize: 13, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Card tone="light">
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Контакты</div>
            <Field label="email" value="artem@example.com" />
            <Field label="user_id" value="usr_8ba721f0c4e91" mono readonly />
            <Field label="часовой пояс" value="Europe/Moscow" />
            <Field label="язык" value="Русский" />
          </Card>
          <Card tone="cream">
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>Уведомления</div>
            {[
              ['Капча требует решения', true],
              ['Дневной лимит достигнут', true],
              ['Ошибки worker’а', true],
              ['Еженедельный отчёт', false],
              ['Маркетинговые письма', false],
            ].map(([label, on], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ fontSize: 14 }}>{label}</span>
                <Toggle on={on} />
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'plan' && <PlanTab />}

      {tab === 'integrations' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Card tone="dark">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>hh.ru</div>
              <Tag tone={hhStatus === 'ok' ? 'ok' : hhStatus === 'warn' ? 'warn' : 'err'} dot>
                {hhStatus === 'ok' ? 'подключён' : hhStatus === 'warn' ? 'истекает' : 'нет связи'}
              </Tag>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#ffffff80', marginBottom: 16 }}>
              <Row k="аккаунт" v="artem.kovalev@hh.ru" />
              <Row k="токен" v="истекает через 7 ч" />
              <Row k="последний обмен" v="32 мин назад" />
              <Row k="resumes" v="3 синхронизировано" />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn kind="yellow" size="sm" icon={<IRefresh size={14} />}>refresh token</Btn>
              <Btn kind="ghostDark" size="sm" icon={<ILink size={14} />} onClick={onReconnect}>переподключить</Btn>
              <Btn kind="ghostDark" size="sm" icon={<IPower size={14} />}>отключить</Btn>
            </div>
          </Card>
          <Card tone="light">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Telegram</div>
              <Tag tone="neutral">не подключён</Tag>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
              Получай уведомления о капче и ошибках прямо в Telegram. Бот ответит за 5 секунд.
            </div>
            <Btn kind="primary" icon={<ITelegram size={14} />}>подключить @otclick_bot</Btn>
          </Card>
        </div>
      )}

      {tab === 'danger' && (
        <Card tone="light">
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Опасная зона</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 22 }}>
            Эти действия нельзя отменить. Хорошо подумай.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DangerRow title="Выйти из аккаунта" sub="ты сможешь вернуться в любой момент" btn="Выйти" />
            <DangerRow title="Сбросить статистику" sub="график активности и история откликов будут стёрты" btn="Сбросить" tone="warn" />
            <DangerRow title="Удалить аккаунт" sub="навсегда удалит данные, отклики, токены hh" btn="Удалить" tone="err" disabled />
          </div>
        </Card>
      )}
    </>
  );
};

const Field = ({ label, value, mono, readonly }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    <div style={{
      padding: '10px 14px', borderRadius: 12,
      background: readonly ? 'var(--bg-deep)' : 'transparent',
      border: readonly ? 'none' : '1px solid var(--line)',
      fontFamily: mono ? 'JetBrains Mono' : 'inherit',
      fontSize: 14, color: readonly ? 'var(--muted)' : 'var(--ink)',
    }}>{value}</div>
  </div>
);

const Toggle = ({ on: initial }) => {
  const [on, setOn] = React.useState(initial);
  return (
    <button onClick={() => setOn(!on)} style={{
      width: 40, height: 22, borderRadius: 999, border: 'none', position: 'relative',
      background: on ? 'var(--ink)' : 'var(--muted-2)',
      transition: 'background .2s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: 999, background: '#fff',
        transition: 'left .2s',
      }} />
    </button>
  );
};

const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span>{k}</span>
    <span style={{ color: '#F5F1E6', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{v}</span>
  </div>
);

const DangerRow = ({ title, sub, btn, tone, disabled }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '14px 16px', borderRadius: 14, background: 'var(--bg-deep)',
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
    </div>
    <Btn
      kind={tone === 'err' ? 'coral' : tone === 'warn' ? 'yellow' : 'ghost'}
      size="sm"
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
    >{btn}</Btn>
  </div>
);

const PlanTab = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
    {[
      { name: 'Free', price: '0 ₽', sub: '/ навсегда', perks: ['50 откликов / день', '1 фильтр', 'без приоритета'], tone: 'cream' },
      { name: 'Pro', price: '590 ₽', sub: '/ месяц', perks: ['500 откликов / день', '∞ фильтров', 'AI-сопроводительные', 'антибан + капча', 'realtime'], tone: 'dark', active: true },
      { name: 'Team', price: '1 990 ₽', sub: '/ месяц', perks: ['5 аккаунтов', 'shared фильтры', 'аналитика', 'API доступ', 'выделенный воркер'], tone: 'light' },
    ].map((p, i) => (
      <Card key={i} tone={p.tone} style={{ position: 'relative' }}>
        {p.active && <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'var(--yellow)', color: 'var(--ink)',
          padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700,
        }}>текущий</div>}
        <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
        <div style={{ marginTop: 14, marginBottom: 18 }}>
          <span style={{ fontSize: 32, fontWeight: 800 }}>{p.price}</span>
          <span style={{ fontSize: 13, color: p.tone === 'dark' ? '#ffffff60' : 'var(--muted)', marginLeft: 4 }}>{p.sub}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.perks.map((perk, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <ICheck size={14} stroke={p.tone === 'dark' ? 'var(--yellow)' : 'var(--ok)'} />
              {perk}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22 }}>
          {p.active
            ? <div style={{ fontSize: 12, color: p.tone === 'dark' ? '#ffffff80' : 'var(--muted)' }}>списание 19 числа · 590 ₽</div>
            : <Btn kind={p.tone === 'dark' ? 'yellow' : 'primary'} size="sm">выбрать</Btn>}
        </div>
      </Card>
    ))}
  </div>
);

Object.assign(window, { Dashboard, ApplicationsScreen, AccountScreen, Field, Toggle, Row, DangerRow, PlanTab });

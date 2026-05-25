// Overlays: FiltersDrawer, CaptchaModal, Landing, Auth, Onboarding, Toaster

// =============== Filters Drawer ===============
const ExpPills = () => {
  const [sel, setSel] = React.useState(2);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {['нет', '1–3 года', '3–6 лет', 'более 6'].map((l, i) => (
        <button key={i} onClick={() => setSel(i)} style={{
          padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none',
          background: i === sel ? 'var(--ink)' : 'var(--bg-deep)',
          color: i === sel ? '#F5F1E6' : 'var(--ink)',
          cursor: 'pointer',
        }}>{l}</button>
      ))}
    </div>
  );
};

const FiltersDrawer = ({ open, onClose }) => {
  const [tab, setTab] = React.useState('filters');
  const [selected, setSelected] = React.useState(0);
  const filters = [
    { name: 'python remote', count: 187, active: true, kw: 'python, django, fastapi', salary: 'от 250 000 ₽', city: 'удалённо' },
    { name: 'tech lead', count: 24, active: true, kw: 'team lead, tech lead, head of', salary: 'от 350 000 ₽', city: 'Москва · удалённо' },
    { name: 'devops', count: 56, active: true, kw: 'devops, sre, kubernetes', salary: 'от 280 000 ₽', city: 'удалённо' },
    { name: 'go remote', count: 12, active: false, kw: 'golang, go', salary: 'от 300 000 ₽', city: 'удалённо' },
  ];
  const blacklist = ['Битрикс24', 'СБИС', 'Лаборатория Касперского', 'Газпром-Медиа'];

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity .25s', zIndex: 50,
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(640px, 96vw)', background: 'var(--bg)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
        zIndex: 51, padding: 24, overflow: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Фильтры и чёрный список</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Управляй, на какие вакансии бот откликается</div>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 12, border: 'none',
            background: 'var(--surface)', display: 'grid', placeItems: 'center',
          }}><IClose size={18} /></button>
        </div>

        <div style={{ display: 'inline-flex', background: 'var(--surface)', padding: 6, borderRadius: 999, marginBottom: 18 }}>
          {[['filters', 'Фильтры'], ['blacklist', 'Чёрный список'], ['ai', 'AI-настройки']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              border: 'none', padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              background: tab === id ? 'var(--ink)' : 'transparent',
              color: tab === id ? '#F5F1E6' : 'var(--ink)',
            }}>{label}</button>
          ))}
        </div>

        {tab === 'filters' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {filters.map((f, i) => (
                <div key={i} onClick={() => setSelected(i)} style={{
                  cursor: 'pointer', textAlign: 'left', padding: '14px 16px', borderRadius: 14,
                  background: selected === i ? 'var(--ink)' : 'var(--surface)',
                  color: selected === i ? '#F5F1E6' : 'var(--ink)',
                  display: 'flex', alignItems: 'center', gap: 14,
                  outline: selected === i ? '2px solid var(--yellow)' : 'none',
                  outlineOffset: -2,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                    background: f.active ? 'var(--yellow)' : 'var(--bg-deep)',
                    color: 'var(--ink)',
                    display: 'grid', placeItems: 'center',
                  }}><IFilter size={15} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>«{f.name}»</div>
                    <div style={{ fontSize: 12, color: selected === i ? '#ffffff70' : 'var(--muted)', marginTop: 2 }}>
                      {f.kw}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{f.count}</div>
                    <div style={{ fontSize: 11, color: selected === i ? '#ffffff60' : 'var(--muted)' }}>откликов</div>
                  </div>
                  <Toggle on={f.active} />
                </div>
              ))}
              <button onClick={() => window.__toast && window.__toast('создаём новый фильтр…', 'info')} style={{
                border: '1.5px dashed var(--muted-2)', background: 'transparent', borderRadius: 14,
                padding: '14px', color: 'var(--muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}><IPlus size={14} /> новый фильтр</button>
            </div>

            <Card tone="light" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>«{filters[selected].name}»</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>редактировать параметры поиска</div>
                </div>
                <Btn kind="ghost" size="sm" icon={<ITrash size={13} />}>удалить</Btn>
              </div>
              <Field label="ключевые слова" value={filters[selected].kw} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="зарплата" value={filters[selected].salary} />
                <Field label="регион" value={filters[selected].city} />
              </div>
              <div style={{ marginTop: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>опыт работы</div>
                <ExpPills />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--line-2)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>AI-сопроводительное письмо</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>генерируется под каждую вакансию</div>
                </div>
                <Toggle on={true} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>пропускать с пометкой «для своих»</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>не тратить на закрытые вакансии</div>
                </div>
                <Toggle on={true} />
              </div>
            </Card>
          </>
        )}

        {tab === 'blacklist' && (
          <Card tone="light">
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 14 }}>
              Бот не будет откликаться в эти компании, даже если вакансия подходит по фильтру.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {blacklist.map((b, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', background: 'var(--bg-deep)', borderRadius: 999, fontSize: 13,
                }}>
                  {b}
                  <button style={{ background: 'transparent', border: 'none', color: 'var(--muted)', display: 'inline-flex', padding: 0 }}><IClose size={12} /></button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="название компании" style={{
                flex: 1, padding: '10px 14px', borderRadius: 12,
                border: '1px solid var(--line)', background: '#fff', outline: 'none', fontFamily: 'inherit', fontSize: 14,
              }} />
              <Btn kind="primary" icon={<IPlus size={14} />}>добавить</Btn>
            </div>
          </Card>
        )}

        {tab === 'ai' && (
          <Card tone="light">
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>AI-сопроводительное</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
              Шаблон, на основе которого генерируются письма. Используй переменные: <code className="mono" style={{ background: 'var(--bg-deep)', padding: '1px 5px', borderRadius: 4 }}>{'{{vacancy}}'}</code>, <code className="mono" style={{ background: 'var(--bg-deep)', padding: '1px 5px', borderRadius: 4 }}>{'{{employer}}'}</code>, <code className="mono" style={{ background: 'var(--bg-deep)', padding: '1px 5px', borderRadius: 4 }}>{'{{key_skills}}'}</code>.
            </div>
            <textarea style={{
              width: '100%', minHeight: 160, padding: 16, borderRadius: 14,
              border: '1px solid var(--line)', background: 'var(--bg-deep)', outline: 'none',
              fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.6, resize: 'vertical',
            }} defaultValue={`Здравствуйте!

Меня заинтересовала вакансия {{vacancy}} в {{employer}}. У меня 5+ лет опыта в {{key_skills}}, последние 2 года — на роли тимлида в команде из 6 человек.

Готов обсудить детали в удобное время.`} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Использует модель Claude 3.5 Haiku · ~0.1 ₽ за письмо</div>
              <Btn kind="primary" size="sm" icon={<ISpark size={13} />}>сохранить</Btn>
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, padding: '16px 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>изменения сохраняются автоматически</span>
          <Btn kind="primary" onClick={onClose}>готово</Btn>
        </div>
      </div>
    </>
  );
};

// =============== Captcha Modal ===============
const CaptchaModal = ({ open, onClose }) => {
  const [solving, setSolving] = React.useState(false);
  const [solved, setSolved] = React.useState(false);
  React.useEffect(() => { if (open) { setSolving(false); setSolved(false); } }, [open]);
  if (!open) return null;

  const onSolve = () => {
    setSolving(true);
    setTimeout(() => { setSolved(true); setTimeout(onClose, 800); }, 1200);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,27,31,0.5)', backdropFilter: 'blur(4px)',
      zIndex: 60, display: 'grid', placeItems: 'center', padding: 20,
      animation: 'fadeIn .2s ease',
    }}>
      <Card tone="light" style={{ width: 'min(440px, 100%)', padding: 28, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: 'var(--coral-soft)', color: 'var(--coral)',
            display: 'grid', placeItems: 'center',
          }}><IShield size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>hh просит решить капчу</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              Бот поставлен на паузу. Введи код с картинки или открой страницу на hh.
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 10, border: 'none',
            background: 'var(--bg-deep)', display: 'grid', placeItems: 'center',
          }}><IClose size={16} /></button>
        </div>

        <div style={{
          height: 100, borderRadius: 14, background: 'var(--bg-deep)',
          position: 'relative', overflow: 'hidden', marginBottom: 14,
          display: 'grid', placeItems: 'center',
        }}>
          {/* Fake captcha image */}
          <div style={{
            fontFamily: 'Instrument Serif', fontStyle: 'italic',
            fontSize: 48, letterSpacing: 6, color: 'var(--ink)',
            textDecoration: 'line-through', textDecorationColor: 'var(--coral)',
            transform: 'skewX(-8deg)', filter: 'blur(0.4px)',
          }}>k7w92r</div>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d="M 10 70 Q 80 30 160 60 T 320 50" stroke="var(--muted)" strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M 20 30 Q 100 60 200 30 T 380 40" stroke="var(--coral)" strokeWidth="1" fill="none" opacity="0.4" />
          </svg>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="введи код"
            disabled={solving || solved}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12,
              border: '1.5px solid var(--line)', background: '#fff', outline: 'none',
              fontFamily: 'JetBrains Mono', fontSize: 15, letterSpacing: 2,
            }}
          />
          <Btn kind={solved ? 'ghost' : 'primary'} onClick={onSolve} disabled={solving}>
            {solved ? <><ICheck size={14} /> готово</> : solving ? 'отправляю…' : 'отправить'}
          </Btn>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            открыть на hh.ru <IExternal size={11} />
          </button>
          <span className="mono" style={{ color: 'var(--muted)' }}>таймаут 02:14</span>
        </div>

        <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      </Card>
    </div>
  );
};

// =============== Landing ===============
const Landing = ({ onAuth }) => (
  <div style={{ minHeight: '100vh', padding: '20px 32px 60px' }}>
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', background: 'var(--surface)', borderRadius: 22, marginBottom: 32,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ILogo size={32} />
        <span style={{ fontSize: 17, fontWeight: 700 }}>otclick</span>
      </div>
      <nav style={{ display: 'flex', gap: 24, fontSize: 14 }}>
        <a href="#" style={{ color: 'var(--ink)', textDecoration: 'none' }}>возможности</a>
        <a href="#" style={{ color: 'var(--ink)', textDecoration: 'none' }}>тарифы</a>
        <a href="#" style={{ color: 'var(--ink)', textDecoration: 'none' }}>отзывы</a>
        <a href="#" style={{ color: 'var(--ink)', textDecoration: 'none' }}>faq</a>
      </nav>
      <Btn kind="primary" onClick={onAuth}>войти</Btn>
    </header>

    <section style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 32, alignItems: 'center', marginBottom: 32 }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface)', padding: '6px 14px', borderRadius: 999, fontSize: 12, marginBottom: 20 }}>
          <StatusDot tone="ok" />
          <span className="mono">187 откликов за последний час</span>
        </div>
        <h1 style={{
          fontSize: 72, lineHeight: 0.95, margin: 0, fontWeight: 700,
          letterSpacing: -2.5,
        }}>
          Пока ты спишь,<br />
          <span className="serif" style={{ fontWeight: 400 }}>бот откликается </span>
          <br />за тебя на hh
        </h1>
        <div style={{ color: 'var(--muted)', fontSize: 17, marginTop: 22, maxWidth: 480, lineHeight: 1.5 }}>
          Тонкие фильтры, AI-сопроводительные под каждую вакансию, обход капчи. До 500 откликов в день — пока ты пьёшь кофе.
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <Btn kind="primary" size="lg" onClick={onAuth} icon={<IBolt size={16} />}>начать бесплатно</Btn>
          <Btn kind="ghost" size="lg">посмотреть демо</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, fontSize: 12, color: 'var(--muted)' }}>
          <div style={{ display: 'flex' }}>
            {['#F5CB3D', '#E96B58', '#C7D4B6', '#1A1B1F'].map((c, i) => (
              <div key={i} style={{
                width: 28, height: 28, borderRadius: 999, background: c,
                border: '2px solid var(--bg)', marginLeft: i ? -8 : 0,
              }} />
            ))}
          </div>
          <span>2 400+ соискателей уже используют otclick</span>
        </div>
      </div>
      <Card tone="cream" style={{ padding: 24 }} data-comment-anchor="cc-1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>сегодня · с 06:00</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2, lineHeight: 0.9 }}>187</span>
              <span className="serif" style={{ fontSize: 22 }}>откликов</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--ink)', color: 'var(--yellow)', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>↑ 38</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>за последний час</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <Tag tone="dark" dot>live</Tag>
            <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>14:32 MSK</span>
          </div>
        </div>

        {/* Bar chart: applications per hour */}
        <div style={{ position: 'relative', height: 140 }}>
          <div style={{ position: 'absolute', inset: '0 0 22px 0', display: 'flex', alignItems: 'flex-end', gap: 5 }}>
            {[
              { h: '06', sent: 4, capt: 0 },
              { h: '07', sent: 12, capt: 0 },
              { h: '08', sent: 22, capt: 1 },
              { h: '09', sent: 18, capt: 1 },
              { h: '10', sent: 28, capt: 2 },
              { h: '11', sent: 24, capt: 1 },
              { h: '12', sent: 9, capt: 0 },
              { h: '13', sent: 32, capt: 3 },
              { h: '14', sent: 38, capt: 4, now: true },
            ].map((b, i) => {
              const total = b.sent + b.capt;
              const hSent = Math.max(4, (b.sent / 40) * 110);
              const hCapt = (b.capt / 40) * 110;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  {b.capt > 0 && (
                    <div style={{
                      width: '100%', height: hCapt,
                      background: 'var(--coral)', borderRadius: '4px 4px 0 0',
                    }} />
                  )}
                  <div style={{
                    width: '100%', height: hSent,
                    background: b.now ? 'var(--ink)' : 'var(--yellow)',
                    borderRadius: b.capt > 0 ? '0' : '4px 4px 0 0',
                    position: 'relative',
                  }}>
                    {b.now && (
                      <div style={{
                        position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--ink)', color: '#F5F1E6',
                        padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}>{total}</div>
                    )}
                  </div>
                  <span className="mono" style={{
                    fontSize: 10, color: b.now ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: b.now ? 700 : 400, position: 'absolute', bottom: 0,
                  }}>{b.h}</span>
                </div>
              );
            })}
          </div>
          {/* Subtle dashed average line */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '52%',
            borderTop: '1px dashed var(--muted-2)', opacity: 0.7,
          }}>
            <span className="mono" style={{
              position: 'absolute', right: 0, top: -8, background: 'var(--bg-deep)',
              padding: '0 6px', fontSize: 9, color: 'var(--muted)',
            }}>avg 21</span>
          </div>
        </div>

        {/* Legend strip */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 14, marginTop: 14, borderTop: '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--yellow)' }} /> отправлено
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--coral)' }} /> капча
            </span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>след. отклик · 38с</span>
        </div>
      </Card>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginBottom: 32 }}>
      {[
        { icon: <IFilter />, title: 'Фильтры', sub: 'Точные параметры поиска: ключи, зарплата, регион, опыт', tone: 'light' },
        { icon: <ISpark />, title: 'AI', sub: 'Сопроводительные пишет Claude — под каждую вакансию', tone: 'yellow' },
        { icon: <IShield />, title: 'Антибан', sub: 'Случайные паузы, ротация User-Agent, обход капчи', tone: 'dark' },
        { icon: <IBolt />, title: 'Realtime', sub: 'Уведомления в Telegram о каждом отклике и ошибке', tone: 'light' },
      ].map((c, i) => {
        const pal = c.tone === 'dark' ? cardStyles.dark : c.tone === 'yellow' ? { background: 'var(--yellow)', color: 'var(--ink)' } : cardStyles.light;
        return (
          <div key={i} style={{ ...cardStyles.base, ...pal, minHeight: 200 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, marginBottom: 18,
              background: c.tone === 'dark' ? '#ffffff15' : c.tone === 'yellow' ? 'var(--ink)' : 'var(--bg-deep)',
              color: c.tone === 'dark' ? '#F5F1E6' : c.tone === 'yellow' ? 'var(--yellow)' : 'var(--ink)',
              display: 'grid', placeItems: 'center',
            }}>{c.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.title}</div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.75 }}>{c.sub}</div>
          </div>
        );
      })}
    </section>

    <Card tone="dark" style={{ padding: 40, textAlign: 'center' }}>
      <div className="serif" style={{ fontSize: 14, color: 'var(--yellow)', marginBottom: 10 }}>готов начать?</div>
      <div style={{ fontSize: 38, fontWeight: 700, marginBottom: 14, letterSpacing: -1 }}>
        Первые 50 откликов — бесплатно
      </div>
      <div style={{ color: '#ffffff80', fontSize: 15, marginBottom: 24 }}>
        Без карты, без обязательств. Подключи hh за 30 секунд.
      </div>
      <Btn kind="yellow" size="lg" onClick={onAuth} icon={<IArrow size={16} />}>попробовать</Btn>
    </Card>

    <footer style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
      <span>© 2026 otclick · сделано в России</span>
      <span>поддержка: hello@otclick.ru · @otclick_bot</span>
    </footer>
  </div>
);

// =============== Auth ===============
const AuthScreen = ({ onAuth, onBack }) => {
  const [mode, setMode] = React.useState('login');
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
      <div style={{
        background: 'var(--ink)', color: '#F5F1E6', padding: '32px 40px',
        display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      }}>
        <button onClick={onBack} style={{
          background: '#ffffff10', border: 'none', color: '#F5F1E6',
          padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        }}>← на главную</button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 460, marginLeft: 40 }}>
          <ILogo size={48} />
          <h1 className="serif" style={{ fontSize: 56, lineHeight: 1, margin: '24px 0 16px', fontWeight: 400 }}>
            Войди и забудь<br />про отклики
          </h1>
          <div style={{ color: '#ffffff80', fontSize: 16, lineHeight: 1.5 }}>
            Подключи hh, настрой фильтры один раз — дальше всё сам.
          </div>
          {/* Decorative orbs */}
          <div style={{ position: 'absolute', right: -80, top: 100, width: 200, height: 200, borderRadius: '50%', background: 'var(--yellow)', opacity: 0.15, filter: 'blur(40px)' }} />
          <div style={{ position: 'absolute', right: 40, bottom: 60, width: 140, height: 140, borderRadius: '50%', background: 'var(--coral)', opacity: 0.2, filter: 'blur(30px)' }} />
        </div>
      </div>

      <div style={{ background: 'var(--bg)', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', background: 'var(--surface)', padding: 6, borderRadius: 999, marginBottom: 24 }}>
            {[['login', 'войти'], ['signup', 'регистрация']].map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)} style={{
                border: 'none', padding: '8px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600,
                background: mode === id ? 'var(--ink)' : 'transparent',
                color: mode === id ? '#F5F1E6' : 'var(--ink)',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
            {mode === 'login' ? 'С возвращением' : 'Создай аккаунт'}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
            {mode === 'login' ? 'Бот соскучился' : 'Это займёт 20 секунд'}
          </div>

          <button style={{
            width: '100%', padding: '12px 16px', borderRadius: 14,
            background: '#fff', border: '1px solid var(--line)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 600, marginBottom: 16,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.46-.8 5.95-2.18l-2.9-2.26c-.81.54-1.83.86-3.05.86-2.34 0-4.33-1.59-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.17 6.66 3.58 9 3.58z"/></svg>
            продолжить с google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--muted)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            или email
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <IMail size={16} stroke="var(--muted)" />
            <input placeholder="email" style={{
              width: '100%', padding: '12px 16px 12px 44px', borderRadius: 14,
              border: '1px solid var(--line)', background: '#fff', outline: 'none',
              fontFamily: 'inherit', fontSize: 14,
            }} />
            <span style={{ position: 'absolute', left: 16, top: 14 }}><IMail size={16} stroke="var(--muted)" /></span>
          </div>
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <input type="password" placeholder="пароль" defaultValue="••••••••••" style={{
              width: '100%', padding: '12px 16px 12px 44px', borderRadius: 14,
              border: '1px solid var(--line)', background: '#fff', outline: 'none',
              fontFamily: 'inherit', fontSize: 14,
            }} />
            <span style={{ position: 'absolute', left: 16, top: 14 }}><ILock size={16} stroke="var(--muted)" /></span>
            <span style={{ position: 'absolute', right: 16, top: 14, color: 'var(--muted)' }}><IEye size={16} /></span>
          </div>
          <Btn kind="primary" size="lg" onClick={onAuth} style={{ width: '100%', justifyContent: 'center' }}>
            {mode === 'login' ? 'войти' : 'зарегистрироваться'} →
          </Btn>
          {mode === 'login' && (
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--muted)' }}>
              <a href="#" style={{ color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>забыл пароль?</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============== Onboarding (HH connect) ===============
const OnboardingScreen = ({ onDone, onSkip }) => {
  const [step, setStep] = React.useState(0); // 0 form, 1 polling, 2 captcha, 3 success
  const onSubmit = () => {
    setStep(1);
    setTimeout(() => setStep(2), 1600);
  };
  const onCaptcha = () => {
    setStep(3);
    setTimeout(onDone, 1500);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card tone="light" style={{ width: 'min(520px, 100%)', padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ILogo size={28} />
            <span style={{ fontWeight: 700 }}>otclick</span>
          </div>
          <button onClick={onSkip} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13 }}>пропустить</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          {[0, 1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 999,
              background: s <= step ? 'var(--ink)' : 'var(--bg-deep)',
              transition: 'background .3s',
            }} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Подключи hh</div>
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
              Авторизуемся как ты, чтобы отправлять отклики. Пароль шифруется и не покидает наш сервер.
            </div>
            <Field label="логин hh" value="" />
            <Field label="пароль" value="" />
            <div style={{ background: 'var(--sage-soft)', padding: '12px 14px', borderRadius: 12, fontSize: 12, color: 'var(--ink)', marginBottom: 18, display: 'flex', gap: 10 }}>
              <IShield size={16} stroke="var(--ok)" />
              <span>пароль шифруется AES-256 · отзываемый refresh token · читать <a href="#" style={{ color: 'var(--ink)' }}>политику</a></span>
            </div>
            <Btn kind="primary" size="lg" onClick={onSubmit} style={{ width: '100%', justifyContent: 'center' }}>подключить →</Btn>
          </>
        )}

        {step === 1 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              border: '4px solid var(--bg-deep)', borderTopColor: 'var(--ink)',
              margin: '0 auto 24px',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ fontSize: 18, fontWeight: 700 }}>Заходим в hh от твоего имени…</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>обычно 10–20 секунд</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 18, lineHeight: 1.8 }}>
              ✓ браузер запущен<br />
              ✓ форма заполнена<br />
              <span style={{ color: 'var(--ink)' }}>→ ожидание ответа hh</span>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>hh просит капчу</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
              Введи код, и мы продолжим
            </div>
            <div style={{
              height: 110, borderRadius: 14, background: 'var(--bg-deep)',
              display: 'grid', placeItems: 'center', marginBottom: 14, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                fontFamily: 'Instrument Serif', fontStyle: 'italic',
                fontSize: 52, letterSpacing: 8, color: 'var(--ink)', transform: 'skewX(-6deg)',
              }}>b3kp9</div>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <path d="M 10 60 Q 80 20 200 50 T 400 30" stroke="var(--coral)" strokeWidth="1.5" fill="none" opacity="0.5" />
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="код" style={{
                flex: 1, padding: '12px 16px', borderRadius: 12,
                border: '1.5px solid var(--line)', background: '#fff', outline: 'none',
                fontFamily: 'JetBrains Mono', fontSize: 15, letterSpacing: 2,
              }} />
              <Btn kind="primary" onClick={onCaptcha}>проверить</Btn>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--sage-soft)', display: 'grid', placeItems: 'center',
              margin: '0 auto 22px', color: 'var(--ok)',
              animation: 'pop .4s ease',
            }}><ICheck size={36} /></div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>hh подключён 🎉</div>
            <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
              синхронизируем 3 резюме и через секунду откроем дашборд
            </div>
            <style>{`@keyframes pop { 0% { transform: scale(.3) } 60% { transform: scale(1.1) } 100% { transform: scale(1) } }`}</style>
          </div>
        )}
      </Card>
    </div>
  );
};

// =============== Toaster ===============
const Toaster = ({ toasts }) => (
  <div style={{
    position: 'fixed', top: 20, right: 20, zIndex: 70,
    display: 'flex', flexDirection: 'column', gap: 8,
  }}>
    {toasts.map(t => (
      <div key={t.id} style={{
        background: 'var(--ink)', color: '#F5F1E6',
        padding: '12px 16px', borderRadius: 14,
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        animation: 'slideIn .3s cubic-bezier(.2,.8,.2,1)',
        minWidth: 280, maxWidth: 380,
      }}>
        <StatusDot tone={t.kind === 'error' ? 'err' : t.kind === 'warning' ? 'warn' : t.kind === 'success' ? 'ok' : 'ok'} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{t.text}</span>
      </div>
    ))}
    <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
  </div>
);

Object.assign(window, { FiltersDrawer, CaptchaModal, Landing, AuthScreen, OnboardingScreen, Toaster });

import { useEffect, useState } from 'react';
import Section from './Section';
import { api, type AddressCheck, type District, type WalkSpot } from '../lib/api';
import { statusCopyFor } from '../lib/air';
import { asKey } from '../lib/api';

interface WalkSpotsSectionProps {
  district: District | null;
}

const KIND_ICON: Record<WalkSpot['kind'], string> = {
  park: '🌳', square: '🍃', promenade: '🚶', mountain: '⛰️',
};

const VERDICT_COLOR: Record<WalkSpot['verdict'], string> = {
  'отлично': 'var(--good)',
  'хорошо': 'var(--good)',
  'приемлемо': 'var(--mid)',
  'не сегодня': 'var(--bad)',
};

export default function WalkSpotsSection({ district }: WalkSpotsSectionProps) {
  const [spots, setSpots] = useState<WalkSpot[]>([]);
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<AddressCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!district) return;
    void api.walkSpots(district, 6).then(setSpots).catch(() => setSpots([]));
  }, [district]);

  const check = async () => {
    const q = query.trim();
    if (q.length < 3 || checking) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.checkAddress(q));
    } catch {
      setError('Адрес не найден — уточните улицу и номер дома.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Section
      id="spots"
      eyebrow="Экран 3.7 · Куда пойти"
      title="Где сейчас лучше гулять"
      sub="Парки и зелёные зоны города, отсортированные по текущему воздуху: оценка PM2.5 в самой зоне, пробки и стройки рядом, расстояние от вас."
    >
      {/* проверка адреса */}
      <div className="liquid-glass rounded-2xl p-6 mb-6">
        <h3 className="text-[16px] font-medium mb-1.5">Проверить конкретный адрес</h3>
        <p className="text-[13px] text-[color:var(--muted)] mb-4">
          Например: «Абая 44» или «мкр Самал-2, 33» — ответим, можно ли сейчас выпустить ребёнка во двор.
        </p>
        <form
          className="flex flex-wrap gap-2.5"
          onSubmit={(e) => { e.preventDefault(); void check(); }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Улица и дом…"
            className="flex-1 min-w-[220px] bg-white/[0.05] border border-white/15 rounded-xl px-4 py-2.5 text-[14px] text-white placeholder:text-gray-500 outline-none focus:border-white/40"
          />
          <button
            type="submit"
            disabled={checking || query.trim().length < 3}
            className="bg-white text-black px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors"
          >
            {checking ? 'Проверяем…' : 'Проверить'}
          </button>
        </form>

        {error && <p className="text-[13.5px] mt-3" style={{ color: 'var(--bad)' }}>{error}</p>}

        {result && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-[13px] text-[color:var(--muted)] mb-1.5">{result.address}</p>
            <p className="text-[19px] font-medium" style={{ color: statusCopyFor(asKey(result.status)).cssVar }}>
              {statusCopyFor(asKey(result.status)).word}
              <span className="text-[13px] text-[color:var(--muted)] font-normal ml-2.5">
                до {result.max_safe_duration_min} мин · {result.status_reason}
              </span>
            </p>
            {result.recommendations.length > 0 && (
              <ul className="mt-2.5 grid gap-1.5">
                {result.recommendations.slice(0, 3).map((r) => (
                  <li key={r.title} className="text-[13.5px] text-gray-300">
                    {r.icon} {r.title} — <span className="text-gray-400">{r.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* топ мест */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {spots.map((s, i) => (
          <div
            key={s.id}
            className="liquid-glass rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1"
            style={i === 0 ? { outline: `1.5px solid ${VERDICT_COLOR[s.verdict]}` } : undefined}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-[16.5px] font-medium leading-snug">
                {KIND_ICON[s.kind]} {s.name}
              </h3>
              {i === 0 && (
                <span className="text-[10.5px] tracking-[0.1em] uppercase whitespace-nowrap mt-1" style={{ color: VERDICT_COLOR[s.verdict] }}>
                  лучший выбор
                </span>
              )}
            </div>
            <p className="text-[14px] font-medium mb-1.5" style={{ color: VERDICT_COLOR[s.verdict] }}>
              {s.verdict}
            </p>
            <p className="text-[13px] text-[color:var(--muted)] leading-relaxed">{s.reason}</p>
          </div>
        ))}
        {spots.length === 0 && (
          <p className="text-[14px] text-gray-400">Загружаем места…</p>
        )}
      </div>
    </Section>
  );
}

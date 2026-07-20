import { useEffect, useState } from 'react';
import Section from './Section';
import { api, type District, type FullStatus, type Profile } from '../lib/api';

interface BriefingSectionProps {
  district: District | null;
  status: FullStatus | null;
}

const PROFILES: Array<{ id: Profile; label: string }> = [
  { id: 'default', label: 'Взрослый' },
  { id: 'infant', label: 'Младенец' },
  { id: 'child', label: 'Ребёнок' },
  { id: 'asthma', label: 'Астма' },
  { id: 'allergy', label: 'Аллергик' },
  { id: 'elderly', label: 'Пожилой' },
  { id: 'athlete', label: 'Спортсмен' },
  { id: 'pregnant', label: 'Беременность' },
];

const PRIORITY_COLOR: Record<string, string> = {
  danger: 'var(--bad)',
  warn: 'var(--mid)',
  advice: 'rgba(255,255,255,0.5)',
  info: 'var(--good)',
};

const POLLEN_RU: Record<string, string> = {
  none: 'нет', low: 'низкий', moderate: 'умеренный', high: 'высокий', very_high: 'очень высокий',
};

const SPECIES_RU: Record<string, string> = {
  alder: 'ольха', birch: 'берёза', olive: 'олива',
  grass: 'злаковые', mugwort: 'полынь', ragweed: 'амброзия',
};

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="liquid-glass rounded-2xl px-5 py-4">
      <div className="font-light leading-none" style={{ fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '-0.03em', color: accent ?? '#fff' }}>
        {value}
        {unit && <span className="text-[15px] text-[color:var(--muted)] ml-1">{unit}</span>}
      </div>
      <div className="text-[12.5px] text-[color:var(--muted)] mt-1.5">{label}</div>
    </div>
  );
}

export default function BriefingSection({ district, status: baseStatus }: BriefingSectionProps) {
  const [profile, setProfile] = useState<Profile>('default');
  const [status, setStatus] = useState<FullStatus | null>(baseStatus);

  // Re-request with the chosen profile: thresholds and advice change server-side.
  useEffect(() => {
    if (!district) return;
    if (profile === 'default') { setStatus(baseStatus); return; }
    void api.status(district, profile).then(setStatus);
  }, [district, profile, baseStatus]);

  const w = status?.external.weather ?? null;
  const aq = status?.external.air_quality ?? null;
  const pollen = status?.external.pollen ?? null;
  const city = status?.city ?? null;

  const pollenLevel = pollen ? POLLEN_RU[pollen.max_level] ?? pollen.max_level : '—';
  const pollenAccent = pollen && (pollen.max_level === 'high' || pollen.max_level === 'very_high')
    ? 'var(--bad)' : pollen?.max_level === 'moderate' ? 'var(--mid)' : 'var(--good)';

  const bring = status?.recommendations.filter((r) => r.category === 'bring' || r.category === 'rain' || r.category === 'uv' || r.category === 'clothing') ?? [];
  const alerts = status?.recommendations.filter((r) => !bring.includes(r)) ?? [];

  return (
    <Section
      id="briefing"
      eyebrow="Экран 3.5 · Сводка"
      title="Персональная сводка"
      sub="Погода, пыль, пыльца, пробки и стройки — сведены в одну картину. Выберите, кто идёт гулять: пороги и советы пересчитаются."
    >
      {/* профиль */}
      <div className="flex flex-wrap gap-2 mb-6">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProfile(p.id)}
            className={`rounded-full px-4 py-1.5 text-[13px] border transition-colors ${
              profile === p.id
                ? 'bg-white text-black border-white'
                : 'text-gray-300 border-white/15 bg-white/[0.03] hover:border-white/35'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* метрики */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-6">
        <Metric label="температура" value={w ? `${Math.round(w.temperature_c)}°` : '—'} unit={w ? `ощущ. ${Math.round(w.apparent_c)}°` : undefined} />
        <Metric label="УФ-индекс" value={w ? w.uv_index.toFixed(1) : '—'} accent={w && w.uv_index >= 6 ? 'var(--mid)' : undefined} />
        <Metric label="PM10 · крупная пыль" value={aq?.pm10 != null ? String(Math.round(aq.pm10)) : '—'} unit="µg/m³" accent={aq?.pm10 != null && aq.pm10 > 50 ? 'var(--bad)' : undefined} />
        <Metric label={`пыльца${pollen?.dominant ? ` · ${SPECIES_RU[pollen.dominant] ?? pollen.dominant}` : ''}`} value={pollenLevel} accent={pollenAccent} />
        <Metric label="пробки рядом" value={city ? `${city.traffic.index}/10` : '—'} accent={city && city.traffic.index >= 4.5 ? 'var(--mid)' : undefined} />
        <Metric
          label={city?.construction.nearest ? `стройка · ${city.construction.nearest.distance_km} км` : 'стройки рядом'}
          value={city ? (city.construction.inside_zone ? 'в зоне' : 'вне зоны') : '—'}
          accent={city?.construction.inside_zone ? 'var(--bad)' : 'var(--good)'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* индивидуальные советы */}
        <div className="liquid-glass rounded-2xl p-7">
          <h3 className="text-[17px] font-medium mb-1">
            Что это значит для вас
            <span className="text-[color:var(--muted)] font-normal"> · {PROFILES.find((p) => p.id === profile)?.label.toLowerCase()}</span>
          </h3>
          <p className="text-[13px] text-[color:var(--muted)] mb-4">
            Безопасная длительность прогулки: <b className="text-white">{status?.max_safe_duration_min ?? '—'} мин</b>
            {status?.best_walk_window && (
              <> · лучшее окно: <b className="text-white">{status.best_walk_window.start.slice(11, 16)}–{status.best_walk_window.end.slice(11, 16)}</b></>
            )}
          </p>
          <ul className="grid gap-3">
            {alerts.slice(0, 6).map((r) => (
              <li key={r.title} className="flex gap-3 items-start">
                <span className="text-lg leading-none mt-0.5">{r.icon}</span>
                <div>
                  <div className="text-[14.5px] font-medium" style={{ color: PRIORITY_COLOR[r.priority] }}>{r.title}</div>
                  <div className="text-[13.5px] text-gray-400 leading-snug">{r.body}</div>
                </div>
              </li>
            ))}
            {alerts.length === 0 && (
              <li className="text-[14px] text-gray-400">Особых предупреждений нет — условия спокойные.</li>
            )}
          </ul>
        </div>

        {/* что взять с собой */}
        <div className="liquid-glass rounded-2xl p-7">
          <h3 className="text-[17px] font-medium mb-4">Взять с собой</h3>
          <ul className="grid gap-3">
            {bring.length > 0 ? bring.map((r) => (
              <li key={r.title} className="flex gap-3 items-start">
                <span className="text-lg leading-none mt-0.5">{r.icon}</span>
                <div>
                  <div className="text-[14.5px] text-white font-medium">{r.title}</div>
                  <div className="text-[13.5px] text-gray-400 leading-snug">{r.body}</div>
                </div>
              </li>
            )) : (
              <li className="text-[14px] text-gray-400">Ничего особенного не нужно — идите налегке.</li>
            )}
          </ul>
          {status?.fusion && (
            <p className="text-[12px] text-[color:var(--muted)] mt-5 pt-4 border-t border-white/10">
              PM2.5: фон {status.fusion.background_pm25} {status.fusion.local_correction !== 0 && (
                <>+ локальная поправка {status.fusion.local_correction > 0 ? '+' : ''}{status.fusion.local_correction}</>
              )} µg/m³ · уверенность {Math.round(status.fusion.confidence * 100)}%
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

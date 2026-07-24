import { useEffect, useMemo, useState } from 'react';
import Section from './Section';
import { api, aqiToPm, type AnomalyEvent, type Device, type Reading } from '../lib/api';

interface GapSectionProps { devices: Device[] }

// Downsample raw readings to 24 hourly buckets aligned to "now-24h..now".
function toHourly(readings: Reading[]): number[] {
  if (readings.length === 0) return [];
  const buckets: number[][] = Array.from({ length: 24 }, () => []);
  const end = Date.now();
  for (const r of readings) {
    const t = new Date(r.ts).getTime();
    const hoursAgo = Math.floor((end - t) / 3_600_000);
    const idx = 23 - hoursAgo;
    if (idx >= 0 && idx < 24) buckets[idx]!.push(aqiToPm(r.aqi_composite));
  }
  return buckets.map((b) => (b.length === 0 ? 0 : b.reduce((a, x) => a + x, 0) / b.length));
}

function fillGaps(series: number[]): number[] {
  const out = [...series];
  let last = out.find((v) => v > 0) ?? 15;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) out[i] = last;
    else last = out[i]!;
  }
  return out;
}

export default function GapSection({ devices }: GapSectionProps) {
  const [official, setOfficial] = useState<number[]>([]);
  const [local, setLocal] = useState<number[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [officialName, setOfficialName] = useState('пост');
  const [localName, setLocalName] = useState('датчик');

  // Pick two contrasting devices: current-lowest (reference "official post")
  // vs current-highest (local yard reading). Rank by latest aqi_composite.
  useEffect(() => {
    if (devices.length < 2) return;
    void Promise.all([api.latest(), api.anomalies(24)]).then(([latest, anom]) => {
      setAnomalies(anom);
      const byId = new Map(latest.map((r) => [r.device_id, r]));
      const withReadings = devices
        .map((d) => ({ d, r: byId.get(d.id) }))
        .filter((x): x is { d: Device; r: Reading } => !!x.r)
        .sort((a, b) => a.r.aqi_composite - b.r.aqi_composite);
      if (withReadings.length < 2) return;
      const cleanest = withReadings[0]!.d;
      const dirtiest = withReadings[withReadings.length - 1]!.d;
      setOfficialName(cleanest.name);
      setLocalName(dirtiest.name);
      void Promise.all([api.history(cleanest.id, 24), api.history(dirtiest.id, 24)]).then(([o, l]) => {
        setOfficial(fillGaps(toHourly(o)));
        setLocal(fillGaps(toHourly(l)));
      });
    });
  }, [devices]);

  const offNow = Math.round(official[23] ?? 0);
  const locNow = Math.round(local[23] ?? 0);
  const ratio = offNow > 0 ? (locNow / offNow).toFixed(1).replace('.', ',') : '—';

  const anomHours = useMemo(() => {
    const localDeviceIdSet = new Set(devices.filter((d) => d.name === localName).map((d) => d.id));
    return anomalies
      .filter((a) => localDeviceIdSet.has(a.device_id))
      .map((a) => new Date(a.ts_start).getHours())
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .sort((a, b) => a - b);
  }, [anomalies, devices, localName]);

  const W = 720;
  const H = 260;
  const P = 24;
  const all = [...official, ...local];
  const max = (all.length > 0 ? Math.max(...all) : 100) * 1.12;
  const x = (i: number) => P + (i / 23) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (d: number[]) => d.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <Section
      id="gap"
      eyebrow="Экран 3 · Главное"
      title={<>Разрыв: пост показывает одно.<br />Ваш двор дышит другим.</>}
      sub="Сравниваем район с самым чистым воздухом и район с самым грязным по данным нашей сети. Разница внутри одного города — это норма, о которой обычно не говорят."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="liquid-glass rounded-2xl p-5 sm:p-7 flex flex-col justify-between gap-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-3.5">
            <div>
              <div
                className="font-light leading-none"
                style={{ fontSize: 'clamp(44px, 5vw, 72px)', letterSpacing: '-0.04em', color: 'var(--good)' }}
              >
                {offNow}
              </div>
              <div className="text-[13px] text-[color:var(--muted)] mt-2">
                Чистый район<br />{officialName}, µg/m³
              </div>
            </div>
            <div className="text-[color:var(--muted)] text-sm pt-4">vs</div>
            <div>
              <div
                className="font-light leading-none"
                style={{ fontSize: 'clamp(44px, 5vw, 72px)', letterSpacing: '-0.04em', color: 'var(--bad)' }}
              >
                {locNow}
              </div>
              <div className="text-[13px] text-[color:var(--muted)] mt-2">
                Загруженный район<br />{localName}, µg/m³
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }} />

          <p className="text-[15px] text-gray-300 leading-relaxed">
            Пост: <b className="text-white font-semibold">{offNow}</b> · У нас:{' '}
            <b className="text-white font-semibold">{locNow}</b> — в{' '}
            <b className="text-white font-semibold">{ratio} раза выше</b>. Для здоровья это
            разница между «спокойно гуляем» и «ребёнку с астмой лучше остаться дома».
            Официальная цифра не ошибается — она просто измерена не там, где вы живёте.
          </p>
        </div>

        <div className="liquid-glass rounded-2xl pt-6 px-6 pb-4">
          <div className="flex flex-wrap gap-4 text-[13px] text-gray-300 mb-2">
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-[2.5px] rounded" style={{ background: 'var(--good)' }} />
              чистый район
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-[2.5px] rounded" style={{ background: 'var(--bad)' }} />
              загруженный район
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-2.5 rounded" style={{ background: 'rgba(248,113,113,.3)' }} />
              аномалия (z &gt; 2)
            </span>
          </div>

          <svg
            width="100%"
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-label="Чистый район против загруженного, 24 часа"
          >
            {[0, 6, 12, 18, 24].map((hh) => {
              const xx = P + (hh / 24) * (W - 2 * P);
              return (
                <g key={hh}>
                  <line x1={xx} y1={P} x2={xx} y2={H - P} stroke="rgba(255,255,255,0.07)" />
                  <text x={xx} y={H - 6} fill="#9aa4b0" fontSize={11} textAnchor="middle" fontFamily="Inter">
                    {hh % 24}:00
                  </text>
                </g>
              );
            })}

            {anomHours.map((h) => (
              <rect
                key={`a-${h}`}
                x={x(h) - 8}
                y={P}
                width={16}
                height={H - 2 * P}
                fill="rgba(248,113,113,0.10)"
                rx={4}
              />
            ))}

            {local.length > 0 && (
              <polygon
                points={`${x(0)},${H - P} ${line(local)} ${x(23)},${H - P}`}
                fill="rgba(248,113,113,0.07)"
              />
            )}
            {official.length > 0 && (
              <polyline points={line(official)} fill="none" stroke="var(--good)" strokeWidth={2.5} strokeLinejoin="round" />
            )}
            {local.length > 0 && (
              <polyline points={line(local)} fill="none" stroke="var(--bad)" strokeWidth={2.5} strokeLinejoin="round" />
            )}

            {anomHours.map((h) => (
              <circle
                key={`d-${h}`}
                cx={x(h)}
                cy={y(local[h] ?? 0)}
                r={4}
                fill="var(--bad)"
                stroke="#07090c"
                strokeWidth={1.5}
              />
            ))}
          </svg>

          <p className="text-[13px] text-[color:var(--muted)] mt-2">
            {anomHours.length > 0 ? (
              <>
                Детектор аномалий (z-score &gt; 2σ) подсветил резкое ухудшение в часы:{' '}
                <b className="text-[color:var(--bad)] font-medium">
                  {anomHours.map((h) => `${h}:00`).join(', ')}
                </b>.
              </>
            ) : (
              'Резких аномалий за последние 24 часа не зафиксировано.'
            )}
          </p>
        </div>
      </div>
    </Section>
  );
}

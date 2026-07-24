import { useEffect, useMemo, useRef, useState } from 'react';
import AnimatedStatus from './AnimatedStatus';
import { api, asKey, aqiToPm, type District, type FullStatus, type Reading } from '../lib/api';
import { distanceKm, statusCopyFor } from '../lib/air';
import { findDistrictId, type DistrictGeoJSON } from '../lib/geo';

interface HeroProps {
  districts: District[];
  district: District | null;
  status: FullStatus | null;
  districtGeo: DistrictGeoJSON | null;
  onDistrictChange: (d: District) => void;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 600;
  const h = 90;
  const max = Math.max(...data) * 1.15 || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-label="График PM2.5 за 24 часа"
      className="mt-3"
    >
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity={0.08} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
    </svg>
  );
}

export default function Hero({ districts, district, status, districtGeo, onDistrictChange }: HeroProps) {
  const [geoLabel, setGeoLabel] = useState('Определить район');
  const [spark, setSpark] = useState<number[]>([]);
  const deepRef = useRef<HTMLDetailsElement>(null);

  const st = statusCopyFor(status ? asKey(status.status) : 'good');
  const pm = useMemo(() => {
    if (!status) return 0;
    const ext = status.external.air_quality?.pm2_5;
    return Math.round(ext ?? aqiToPm(status.local.aqi_composite));
  }, [status]);

  // Load history for the nearest post to draw the sparkline.
  useEffect(() => {
    const id = status?.local.nearest_post?.device_id;
    if (!id) return;
    void api.history(id, 24).then((rows: Reading[]) => {
      setSpark(rows.map((r) => aqiToPm(r.aqi_composite)));
    });
  }, [status?.local.nearest_post?.device_id]);

  const locate = () => {
    if (!navigator.geolocation || districts.length === 0) return;
    setGeoLabel('Определяем…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        // Real district polygon containment first — accurate near borders,
        // unlike matching the closest of a handful of district center points.
        const matchedId = districtGeo ? findDistrictId(p.lat, p.lng, districtGeo) : null;
        const byPolygon = matchedId ? districts.find((d) => d.id === matchedId) : undefined;

        if (byPolygon) {
          setGeoLabel('Район определён');
          onDistrictChange(byPolygon);
          return;
        }

        // Fallback (point outside every polygon, or boundaries not loaded yet):
        // nearest district center, so the button still does something useful.
        let best = districts[0]!;
        let bd = Infinity;
        for (const d of districts) {
          const dd = distanceKm(p, d);
          if (dd < bd) { bd = dd; best = d; }
        }
        setGeoLabel('Район определён (приблизительно)');
        onDistrictChange(best);
      },
      () => setGeoLabel('Не удалось — выберите вручную'),
    );
  };

  const openData = () => {
    if (deepRef.current) {
      deepRef.current.open = true;
      deepRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const nearestKm = status?.local.nearest_post?.distance_km;
  const nearestName = status?.local.nearest_post?.name ?? '—';
  const districtName = district?.name ?? '…';

  return (
    <header
      id="top"
      className="relative z-[1] px-6 md:px-12 lg:px-16 max-w-7xl mx-auto flex flex-col justify-end pb-12"
      style={{ minHeight: 'calc(100vh - 90px)' }}
    >
      <div className="flex flex-wrap items-center gap-2.5 mb-6">
        <button
          type="button"
          onClick={locate}
          className="rounded-[10px] px-3.5 py-2 text-[13px] text-gray-300 hover:text-white border border-white/15 hover:border-white/35 bg-white/[0.03] transition-colors inline-flex items-center gap-2"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="8" />
          </svg>
          {geoLabel}
        </button>

        <select
          aria-label="Выбор района"
          className="rounded-[10px] px-3.5 py-2 pr-8 text-[13px] text-gray-300 border border-white/15 bg-white/[0.03] appearance-none cursor-pointer hover:border-white/35 transition-colors"
          value={district?.id ?? ''}
          onChange={(e) => {
            const d = districts.find((x) => x.id === e.target.value);
            if (d) onDistrictChange(d);
          }}
        >
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} район
            </option>
          ))}
        </select>
      </div>

      <p className="text-[13px] tracking-[0.14em] uppercase text-[color:var(--muted)] mb-3">
        Ваш воздух сейчас · {districtName} район
      </p>

      <AnimatedStatus text={st.word} color={st.cssVar} />

      <div className="grid gap-7 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <p className="text-base md:text-lg text-gray-300 max-w-xl mb-2">{st.sub}</p>

          <p className="text-[13.5px] text-[color:var(--muted)] mb-6 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none opacity-70" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {nearestKm != null ? (
              <>
                Ближайший пост — в {nearestKm.toFixed(1).replace('.', ',')} км ({nearestName}).
                Оценка по району — {status?.local.based_on === 'measurement' ? 'прямое измерение' : 'интерполяция'}.
              </>
            ) : (
              'Загружаем данные…'
            )}
          </p>

          <div className="flex flex-wrap gap-3.5">
            <a
              href="#advice"
              className="bg-white text-black px-8 py-3 rounded-xl font-medium hover:bg-gray-100 transition-colors"
            >
              Что делать
            </a>
            <button
              type="button"
              onClick={openData}
              className="border border-white/20 text-white px-8 py-3 rounded-xl font-medium hover:bg-white hover:text-black transition-colors"
            >
              Показать данные
            </button>
          </div>
        </div>

        <div className="liquid-glass rounded-2xl px-7 py-6 pr-[76px] sm:pr-7">
          <div
            className="font-light leading-none transition-colors duration-700 max-w-full"
            style={{ fontSize: 'clamp(56px, 6vw, 84px)', letterSpacing: '-0.04em', color: st.cssVar }}
          >
            {pm}
          </div>
          <div className="text-[13px] text-[color:var(--muted)] mt-1">
            оценка PM2.5 по району, µg/m³
          </div>

          <div className="text-sm text-gray-300 flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            <span>
              Основной загрязнитель: <b className="text-white font-medium">PM2.5</b>
            </span>
            <span>
              Индекс: <b className="text-white font-medium">{st.idx}</b>
            </span>
          </div>

          <div
            className="h-1.5 rounded-full mt-5 relative opacity-90"
            style={{
              background:
                'linear-gradient(90deg, var(--good) 0%, var(--good) 33%, var(--mid) 45%, var(--mid) 66%, var(--bad) 80%, var(--bad) 100%)',
            }}
          >
            <div
              className="absolute -top-[5px] w-[3px] h-4 bg-white rounded transition-all duration-1000"
              style={{ left: `${Math.min(97, (pm / 120) * 100)}%`, boxShadow: '0 0 8px rgba(255,255,255,.7)' }}
            />
          </div>

          <details ref={deepRef} className="mt-4 group">
            <summary className="cursor-pointer text-[13.5px] text-[color:var(--muted)] hover:text-white inline-flex items-center gap-1.5 transition-colors">
              <span className="inline-block transition-transform group-open:rotate-90">›</span>
              Научный слой: график за 24 часа и источник
            </summary>
            <Sparkline data={spark} color={st.cssVar} />
            <p className="text-xs text-[color:var(--muted)] mt-2">
              PM2.5 — прогноз Open-Meteo для координат района. Локальные MQ-сенсоры (MQ2/MQ4/MQ8)
              усиливают оценку при обнаружении дыма и горючих газов. Оценка по району — IDW-интерполяция
              по постам. Не медицинский прибор.
            </p>
          </details>
        </div>
      </div>
    </header>
  );
}

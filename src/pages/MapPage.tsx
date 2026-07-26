// "Карта" — every spatial layer the project has, in one view.
//
// Layers are toggles rather than separate maps because the questions people
// ask are comparisons: is my yard worse than the park; is there a station near
// me or am I looking at an interpolation; will there be one next year. Those
// only answer themselves when the layers overlap.
//
// Leaflet is driven imperatively through refs. Each layer gets its own effect
// keyed on its data and its toggle, so flipping one checkbox never redraws the
// others — with ~500 markers and grid cells that difference is visible.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trees } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  API_BASE_URL,
  api,
  type DistrictRank,
  type NetworkPlan,
  type Station,
  type TrafficCorridor,
  type WalkSpot,
} from '../lib/api';
import { isBlind } from '../lib/air';
import { useApp } from '../lib/appState';
import { navigate } from '../lib/router';
import PlacePicker from '../components/PlacePicker';
import { Chip, EmptyState, Panel, PageHeader, Skeleton } from '../components/ui/Panel';
import { BAND_COLOR, BAND_LABEL, aqiBand, pmBand, pmColorVar } from '../components/charts/primitives';
import { BandLegend, BandMark } from '../components/ui/Band';
import type { Band } from '../components/charts/primitives';

const CITY = { lat: 43.246, lng: 76.9 };

type LayerKey = 'stations' | 'planned' | 'districts' | 'spots' | 'traffic' | 'blind';

const LAYER_LABEL: Record<LayerKey, string> = {
  stations: 'Наши станции',
  planned: 'Будущие станции',
  districts: 'Качество по районам',
  spots: 'Где гулять',
  traffic: 'Пробки',
  blind: 'Слепые зоны',
};

function trafficColor(load: number): string {
  if (load >= 0.6) return '#ef4444';
  if (load >= 0.35) return '#f59e0b';
  if (load >= 0.15) return '#eab308';
  return '#22c55e';
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Marker geometry per band, so severity survives greyscale and colour-blind
// vision on the map too: the polygon outline and the centroid dot change shape
// as well as hue. Leaflet has no polygon shapes, so the outline encodes the
// band in its dash pattern and the centroid dot in its radius.
const BAND_STROKE: Record<Band, string | undefined> = {
  good: undefined,      // solid — nothing to flag
  mid: '7 4',           // long dash
  bad: '2 3',           // tight dots, reads as a hazard hatch
};
const BAND_RADIUS: Record<Band, number> = { good: 10, mid: 12, bad: 14 };

/** Band for a district row: PM2.5 when measured, AQI composite otherwise. */
function districtBand(r: { pm2_5?: number | null; score: number }): Band {
  return r.pm2_5 != null ? pmBand(r.pm2_5) : aqiBand(r.score);
}

export default function MapPage() {
  const { place, districtGeo, devices } = useApp();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [plan, setPlan] = useState<NetworkPlan | null>(null);
  const [ranking, setRanking] = useState<DistrictRank[] | null>(null);
  const [spots, setSpots] = useState<WalkSpot[]>([]);
  const [corridors, setCorridors] = useState<TrafficCorridor[]>([]);
  const [trafficTiles, setTrafficTiles] = useState(false);
  const [active, setActive] = useState<Record<LayerKey, boolean>>({
    stations: true,
    planned: true,
    districts: true,
    spots: true,
    traffic: false,
    blind: false,
  });

  const toggle = (k: LayerKey) => setActive((s) => ({ ...s, [k]: !s[k] }));

  useEffect(() => {
    void api.stations().then(setStations).catch(() => setStations([]));
    void api.networkPlan(9).then(setPlan).catch(() => setPlan(null));
    void api.compareDistricts().then(setRanking).catch(() => setRanking([]));
    void api
      .traffic()
      .then((t) => {
        setCorridors(t.corridors);
        setTrafficTiles(t.traffic_tiles_enabled);
      })
      .catch(() => setCorridors([]));
  }, []);

  useEffect(() => {
    if (!place) return;
    void api.walkSpots(place, 8).then(setSpots).catch(() => setSpots([]));
  }, [place]);

  // Map init
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      scrollWheelZoom: false,
      // One finger scrolls the page on touch; two fingers pan the map. A map
      // this tall would otherwise trap the scroll on a phone.
      dragging: !L.Browser.mobile,
    }).setView([CITY.lat, CITY.lng], 11);
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapEl.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recentre on the chosen place, and mark it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !place) return;
    map.setView([place.lat, place.lng], Math.max(map.getZoom(), 12), { animate: true });

    const marker = L.marker([place.lat, place.lng], {
      icon: L.divIcon({
        className: '',
        html:
          '<div style="width:18px;height:18px;border-radius:50%;background:#fff;' +
          'box-shadow:0 0 0 4px rgba(255,255,255,0.22),0 0 14px rgba(255,255,255,0.55)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
    marker.bindPopup(`<b>${escapeHtml(place.label)}</b><br>Ваша точка отсчёта`);

    return () => {
      map.removeLayer(marker);
    };
  }, [place]);

  // District polygons, shaded by the ranking's status.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !districtGeo || !ranking || !active.districts) return;

    const byName = new Map(ranking.map((r) => [r.district, r]));
    const layer = L.geoJSON(districtGeo as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const rank = byName.get(String(feature?.properties?.name ?? ''));
        if (!rank) {
          return { color: '#475569', weight: 1.4, fillColor: '#475569', fillOpacity: 0.05, dashArray: '4 4' };
        }
        const band = districtBand(rank);
        const color = BAND_COLOR[band];
        return {
          color,
          weight: band === 'good' ? 1.4 : 2,
          fillColor: color,
          fillOpacity: 0.16,
          dashArray: BAND_STROKE[band],
        };
      },
      onEachFeature: (feature, lyr) => {
        const name = String(feature?.properties?.name ?? '');
        const rank = byName.get(name);
        lyr.bindPopup(
          `<b>${escapeHtml(name)} район</b>` +
            (rank
              ? `<br>PM2.5: <b>${rank.pm2_5 ?? '—'} µg/m³</b>` +
                `<br>AQI-композит: <b>${rank.aqi_composite}</b>` +
                `<br>Уверенность: ${Math.round(rank.confidence * 100)}%` +
                (rank.is_blind_zone ? '<br><i>нет своей станции рядом</i>' : '')
              : '<br>нет данных'),
        );
      },
    }).addTo(map);
    layer.bringToBack();

    // Circle at each district centroid: the at-a-glance "status dot" that
    // reads even when the polygons are too small to distinguish on a phone.
    const dots = ranking.map((r) => {
      const band = districtBand(r);
      return L.circleMarker([r.lat, r.lng], {
        radius: BAND_RADIUS[band],
        color: BAND_COLOR[band],
        weight: 2,
        dashArray: BAND_STROKE[band],
        fillColor: BAND_COLOR[band],
        fillOpacity: 0.28,
      })
        .addTo(map)
        // The band word goes in the tooltip too: the dot alone should never be
        // the only place the verdict exists.
        .bindTooltip(
          `${r.district}: ${BAND_LABEL[band]} · PM2.5 ${r.pm2_5 ?? '—'}`,
          { direction: 'top' },
        );
    });

    return () => {
      map.removeLayer(layer);
      for (const d of dots) map.removeLayer(d);
    };
  }, [districtGeo, ranking, active.districts]);

  // Our stations.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active.stations) return;
    const layers = stations.map((s) => {
      const pm = s.reading?.pm25_equivalent ?? null;
      const color = s.online && pm != null ? pmColorVar(pm) : '#94a3b8';
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: s.is_demo ? 9 : 12,
        color,
        // A solid ring is a real box on a wall; a dashed one is generated data.
        // The difference has to be visible on the map itself, not only in a
        // popup someone may never open.
        weight: s.is_demo ? 2 : 4,
        dashArray: s.is_demo ? '4 3' : undefined,
        fillColor: color,
        fillOpacity: s.is_demo ? 0.3 : 0.55,
      }).addTo(map);

      marker.bindPopup(
        `<b>${escapeHtml(s.name)}</b>` +
          `<br><i>${s.is_demo ? 'демо-станция (данные генерирует модель)' : 'реальное железо'}</i>` +
          `<br>Сенсоры: ${s.sensor_kind === 'mq135' ? 'MQ-135' : 'MQ2 / MQ4 / MQ8'}${s.climate ? ' + DHT22' : ''}` +
          (pm != null
            ? `<br>PM2.5 (оценка): <b>${pm} µg/m³</b><br>AQI-композит: <b>${s.reading!.aqi_composite}</b>`
            : '<br>нет свежих измерений') +
          (s.climate
            ? `<br>DHT22: <b>${s.climate.temp_c} °C</b>, влажность <b>${s.climate.humidity}%</b>` +
              `<br>Точка росы: ${s.climate.dew_point_c} °C · ${escapeHtml(s.climate.comfort)}`
            : '') +
          (s.led !== 'off'
            ? `<br>Светодиод: <b>${s.led === 'green' ? 'зелёный' : 'красный'}</b>`
            : '') +
          (s.health ? `<br>Здоровье сенсора: ${s.health.score}/100` : '') +
          `<br>${s.online ? 'на связи' : 'нет связи'}${
            s.minutes_ago != null ? `, ${s.minutes_ago} мин назад` : ''
          }` +
          `<br><a href="#/stations/${encodeURIComponent(s.id)}">Подробно о станции →</a>`,
      );
      return marker;
    });
    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [stations, active.stations]);

  // Planned stations + their coverage radius.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan || !active.planned) return;
    const layers: L.Layer[] = [];
    for (const p of plan.planned) {
      const circle = L.circle([p.lat, p.lng], {
        radius: plan.effective_radius_km * 1000,
        color: '#818cf8',
        weight: 1,
        dashArray: '5 6',
        fillColor: '#818cf8',
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(map);
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: '',
          html:
            `<div style="width:22px;height:22px;border-radius:50%;border:1.5px dashed #818cf8;` +
            `background:rgba(129,140,248,0.18);color:#c7d2fe;font:600 11px/21px Inter,sans-serif;` +
            `text-align:center">${p.order}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map);
      marker.bindPopup(
        `<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.phase_label)}` +
          `<br>Покроет дополнительно <b>${Math.round(p.coverage_gain * 100)}%</b> населения` +
          `<br>Суммарное покрытие: <b>${Math.round(p.cumulative_coverage * 100)}%</b>` +
          `<br>Радиус станции ≈ ${plan.effective_radius_km} км`,
      );
      layers.push(circle, marker);
    }
    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [plan, active.planned]);

  // Recommended walk spots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active.spots) return;
    const layers = spots.map((s) =>
      L.marker([s.lat, s.lng], {
        // Inline SVG rather than a 🌳 glyph: the marker has to look the same
        // on every platform, and the stroke has to take the theme colour.
        icon: L.divIcon({
          className: '',
          html: (() => {
            const bad = s.verdict === 'не сегодня';
            const stroke = bad ? 'var(--bad)' : 'var(--good)';
            const fill = bad ? 'rgba(248,113,113,0.25)' : 'rgba(74,222,128,0.22)';
            return (
              `<div style="width:26px;height:26px;border-radius:10px;background:${fill};` +
              `border:1px solid ${stroke};display:flex;align-items:center;justify-content:center">` +
              `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${stroke}" ` +
              `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
              `<path d="M12 21v-6"/><path d="M9 15a4 4 0 0 1-2.4-7.2A4.5 4.5 0 0 1 12 3a4.5 4.5 0 0 1 5.4 4.8A4 4 0 0 1 15 15Z"/>` +
              `</svg></div>`
            );
          })(),
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      })
        .addTo(map)
        .bindPopup(
          `<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.verdict)} · ${s.distance_km} км` +
            `<br>PM2.5 ≈ <b>${Math.round(s.pm25_estimate)} µg/m³</b>` +
            `<br>${escapeHtml(s.reason)}`,
        ),
    );
    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [spots, active.spots]);

  // Traffic: live tiles when the key is configured, modelled corridors otherwise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active.traffic) return;
    const layers: L.Layer[] = [];

    if (trafficTiles) {
      layers.push(
        L.tileLayer(`${API_BASE_URL}/api/traffic/tile/{z}/{x}/{y}`, {
          attribution: '&copy; TomTom traffic',
          opacity: 0.82,
          maxZoom: 18,
        }).addTo(map),
      );
    } else {
      for (const c of corridors) {
        const load = c.live_load ?? c.load;
        layers.push(
          L.polyline(
            c.path.map((p) => [p.lat, p.lng] as [number, number]),
            { color: trafficColor(load), weight: 5, opacity: 0.8, lineCap: 'round' },
          )
            .addTo(map)
            .bindPopup(`<b>${escapeHtml(c.name)}</b><br>Загруженность: <b>${Math.round(load * 100)}%</b>`),
        );
      }
    }
    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [corridors, trafficTiles, active.traffic]);

  // Blind zones.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active.blind || devices.length === 0) return;
    const layers: L.Layer[] = [];
    for (let la = 43.16; la <= 43.36; la += 0.012) {
      for (let ln = 76.78; ln <= 77.02; ln += 0.016) {
        if (isBlind({ lat: la, lng: ln }, devices)) {
          layers.push(
            L.circle([la, ln], {
              radius: 700,
              color: 'transparent',
              fillColor: '#f87171',
              fillOpacity: 0.07,
              interactive: false,
            }).addTo(map),
          );
        }
      }
    }
    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [devices, active.blind]);

  // Where the chosen place stands against every district.
  const relative = useMemo(() => {
    if (!ranking || ranking.length === 0 || !place) return null;
    const sorted = [...ranking].sort((a, b) => a.score - b.score);
    let nearest = sorted[0]!;
    let bestD = Infinity;
    for (const r of sorted) {
      const d = (r.lat - place.lat) ** 2 + (r.lng - place.lng) ** 2;
      if (d < bestD) {
        bestD = d;
        nearest = r;
      }
    }
    const position = sorted.findIndex((r) => r.district === nearest.district) + 1;
    const cityAvg = sorted.reduce((s, r) => s + (r.pm2_5 ?? 0), 0) / sorted.length;
    return { nearest, position, total: sorted.length, cityAvg, best: sorted[0]!, sorted };
  }, [ranking, place]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Карта · все слои"
        title="Где чем дышат"
        sub="Наши станции, площадки под будущие, качество воздуха по районам, места для прогулки и пробки — на одной карте. Ваш адрес отмечен белой точкой."
      />

      <PlacePicker compact />

      <div className="flex flex-wrap gap-2">
        {(Object.keys(LAYER_LABEL) as LayerKey[]).map((k) => (
          <Chip key={k} active={active[k]} onClick={() => toggle(k)}>
            {LAYER_LABEL[k]}
          </Chip>
        ))}
      </div>

      <div className="liquid-glass rounded-2xl p-2.5">
        <div
          ref={mapEl}
          className="h-[420px] sm:h-[520px] lg:h-[620px] rounded-2xl z-[1]"
        />
      </div>

      {/* The band scale is generated from the thresholds themselves and names
          the metric, so the same three colours can never quietly mean PM2.5 on
          this screen and the AQI composite on the next one. The marker-style
          entries below it describe what a *pin* means, which is a different
          question from what a colour means — hence the two rows. */}
      <div className="flex flex-col gap-2.5">
        <BandLegend metric="pm" />
        <div className="flex flex-wrap gap-2.5">
          <Legend label="площадка под будущую станцию" color="#818cf8" dashed />
          <Legend label="демо-станция (данные модели)" color="var(--muted)" dashed />
          <Legend label="станция с реальным железом" color="var(--muted)" />
          <Legend label="ваша точка" color="#fff" />
          <Legend label="место для прогулки" icon="tree" />
        </div>
      </div>

      {relative && (
        <Panel
          title="Ваш район на фоне города"
          sub={`Сравнение отталкивается от «${place?.label ?? 'выбранной точки'}».`}
        >
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-fill border border-line p-3.5">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">Ваш район</p>
              <p className="text-xl leading-tight mt-1">{relative.nearest.district}</p>
              <p className="text-sm text-muted mt-1">
                {relative.position}-е место из {relative.total} по чистоте
              </p>
            </div>
            <div className="rounded-xl bg-fill border border-line p-3.5">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">
                Разница с городом
              </p>
              <p
                className="text-xl leading-tight mt-1 tabular-nums"
                style={{
                  color:
                    (relative.nearest.pm2_5 ?? 0) <= relative.cityAvg ? 'var(--good)' : 'var(--bad)',
                }}
              >
                {(relative.nearest.pm2_5 ?? 0) <= relative.cityAvg ? '−' : '+'}
                {Math.abs(Math.round(((relative.nearest.pm2_5 ?? 0) - relative.cityAvg) * 10) / 10)} µg/m³
              </p>
              <p className="text-sm text-muted mt-1">
                среднее по городу {Math.round(relative.cityAvg * 10) / 10}
              </p>
            </div>
            <div className="rounded-xl bg-fill border border-line p-3.5">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">
                Сейчас чище всего
              </p>
              <p className="text-xl leading-tight mt-1" style={{ color: 'var(--good)' }}>
                {relative.best.district}
              </p>
              <p className="text-sm text-muted mt-1">
                PM2.5 {relative.best.pm2_5 ?? '—'} µg/m³
              </p>
            </div>
          </div>

          {/* Was `min-w-[Npx]` inside `overflow-x-auto`: on a phone the table was
                  wider than the screen, scrolled sideways, and gave no sign
                  that it did. Secondary columns now drop out below their
                  breakpoint instead, so the table fits; `scroll-x` paints an
                  edge shadow for the cases where it still overflows, and
                  `scope`/`caption` give the remaining grid a structure a screen
                  reader can navigate. */}
          <div className="scroll-x -mx-1 px-1">
            <table className="w-full text-sm">
              <caption className="sr-only">Районы Алматы, отсортированные по чистоте воздуха</caption>
              <thead>
                <tr className="text-muted text-left">
                  <th scope="col" className="font-normal py-2">#</th>
                  <th scope="col" className="font-normal py-2">Район</th>
                  <th scope="col" className="font-normal py-2 text-right">Индекс</th>
                  <th scope="col" className="font-normal py-2 text-right hidden sm:table-cell">PM2.5</th>
                  <th scope="col" className="font-normal py-2 text-right hidden md:table-cell">AQI</th>
                  <th scope="col" className="font-normal py-2 text-right">Уверенность</th>
                </tr>
              </thead>
              <tbody>
                {relative.sorted.map((r, i) => {
                  const mine = r.district === relative.nearest.district;
                  return (
                    <tr
                      key={r.district}
                      className="border-t border-line-soft"
                      style={mine ? { background: 'rgba(255,255,255,0.05)' } : undefined}
                    >
                      <td className="py-2 tabular-nums text-muted">{i + 1}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <BandMark band={r.pm2_5 != null ? pmBand(r.pm2_5) : aqiBand(r.score)} />
                          {r.district}
                          {mine && <span className="text-2xs text-muted">— вы здесь</span>}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.score}</td>
                      <td className="py-2 text-right tabular-nums hidden sm:table-cell">{r.pm2_5 ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums hidden md:table-cell">{r.aqi_composite}</td>
                      <td className="py-2 text-right tabular-nums text-muted">
                        {Math.round(r.confidence * 100)}%
                        {r.is_blind_zone && (
                          <span className="block text-2xs" style={{ color: 'var(--bad)' }}>
                            слепая зона
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Куда пойти прямо сейчас"
        sub="Ранжировано по PM2.5 в точке, трафику рядом и близости к вам."
      >
        {spots.length === 0 ? (
          <Skeleton lines={3} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {spots.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-line bg-fill p-3.5"
                style={{ borderTop: `2px solid ${pmColorVar(s.pm25_estimate)}` }}
              >
                <p className="text-base mb-0.5">{s.name}</p>
                <p className="text-xs mb-1.5" style={{ color: pmColorVar(s.pm25_estimate) }}>
                  {s.verdict} · {s.distance_km} км
                </p>
                <p className="text-xs text-muted leading-relaxed">{s.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {plan && (
        <Panel
          title="План развития сети"
          sub={plan.note}
          action={
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="tap-target cursor-pointer text-sm text-gray-300 border border-line rounded-full px-3.5 py-1.5 bg-fill hover:bg-fill-hover transition-colors"
            >
              Статистика
            </button>
          }
        >
          <p className="text-sm text-gray-300 leading-relaxed mb-3">
            Сейчас {plan.current.length} станций покрывают{' '}
            <b>{Math.round(plan.current_coverage * 100)}%</b> населения города.
            {plan.stations_for_90pct != null && (
              <> Ещё {plan.stations_for_90pct} площадок доводят покрытие до 90 %.</>
            )}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {plan.planned.slice(0, 6).map((p) => (
              <div key={p.order} className="rounded-xl border border-indigo-400/25 bg-indigo-400/[0.06] p-3.5">
                <p className="text-base mb-0.5">
                  #{p.order} · {p.district ?? 'точка'}
                </p>
                <p className="text-xs text-indigo-200/80 mb-1.5">{p.phase_label}</p>
                <p className="text-xs text-muted">
                  +{Math.round(p.coverage_gain * 100)}% покрытия → всего{' '}
                  {Math.round(p.cumulative_coverage * 100)}%
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {ranking?.length === 0 && <EmptyState>Не удалось загрузить сравнение по районам.</EmptyState>}
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
  icon,
}: {
  color?: string;
  label: string;
  dashed?: boolean;
  icon?: 'tree';
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-300 border border-line rounded-full px-3.5 py-1.5 bg-fill">
      {icon === 'tree' ? (
        // Was a 🌳 in the label string. Emoji render differently on every
        // platform, cannot take a theme colour, and put a second icon family
        // into an interface that otherwise uses one.
        <Trees size={13} className="text-good shrink-0" aria-hidden="true" />
      ) : (
        <span
          className="w-[11px] h-[11px] rounded-full shrink-0"
          style={{
            background: dashed ? 'transparent' : color,
            border: dashed ? `1px dashed ${color}` : undefined,
          }}
        />
      )}
      {label}
    </span>
  );
}

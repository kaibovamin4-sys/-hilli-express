import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Section from './Section';
import { API_BASE_URL, api, aqiToPm, type Device, type Reading, type TrafficCorridor } from '../lib/api';
import { isBlind, pmColor } from '../lib/air';
import { findDistrictId, type DistrictGeoJSON } from '../lib/geo';

interface CoverageMapProps { devices: Device[]; districtGeo: DistrictGeoJSON | null }

// Traffic load 0..1 → colour. Green flowing, amber slowing, red jammed.
function trafficColor(load: number): string {
  if (load >= 0.6) return '#ef4444';
  if (load >= 0.35) return '#f59e0b';
  if (load >= 0.15) return '#eab308';
  return '#22c55e';
}

const LEGEND = [
  { c: 'var(--good)', label: 'чисто · до 35' },
  { c: 'var(--mid)', label: 'средне · 35–75' },
  { c: 'var(--bad)', label: 'плохо · 75+' },
  { c: 'rgba(248,113,113,.25)', label: 'слепая зона', dashed: true },
  { c: '#fff', label: 'наша станция' },
  { c: 'rgba(71,85,105,.3)', label: 'граница района без своей станции', dashed: true },
  { c: '#22c55e', label: 'дорога свободна' },
  { c: '#ef4444', label: 'пробка' },
];

const CITY = { lat: 43.246, lng: 76.9 };

export default function CoverageMap({ devices, districtGeo }: CoverageMapProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [readings, setReadings] = useState<Map<string, Reading>>(new Map());
  const [corridors, setCorridors] = useState<TrafficCorridor[]>([]);
  const [showTraffic, setShowTraffic] = useState(true);
  const [liveTraffic, setLiveTraffic] = useState(false);
  const [trafficTilesEnabled, setTrafficTilesEnabled] = useState(false);

  useEffect(() => {
    void api.latest().then((rows) => setReadings(new Map(rows.map((r) => [r.device_id, r]))));
  }, []);

  // Poll traffic every 2 min so the corridor colours stay current.
  useEffect(() => {
    let alive = true;
    const load = () =>
      void api.traffic().then((t) => {
        if (!alive) return;
        setCorridors(t.corridors);
        setLiveTraffic(t.corridors.some((c) => c.live_load != null));
        setTrafficTilesEnabled(t.traffic_tiles_enabled);
      });
    load();
    const id = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([CITY.lat, CITY.lng], 11);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Real district boundaries, shaded by the average PM2.5 of devices located
  // inside each polygon. Drawn once districts + readings are both available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !districtGeo) return;

    const deviceDistrict = new Map<string, string>();
    for (const d of devices) {
      const id = findDistrictId(d.lat, d.lng, districtGeo);
      if (id) deviceDistrict.set(d.id, id);
    }

    const pmByDistrict = new Map<string, number[]>();
    for (const d of devices) {
      const distId = deviceDistrict.get(d.id);
      const r = readings.get(d.id);
      if (!distId || !r) continue;
      const arr = pmByDistrict.get(distId) ?? [];
      arr.push(aqiToPm(r.aqi_composite));
      pmByDistrict.set(distId, arr);
    }
    const avgFor = (id: string): number | null => {
      const pms = pmByDistrict.get(id);
      return pms && pms.length ? pms.reduce((a, b) => a + b, 0) / pms.length : null;
    };

    const layer = L.geoJSON(districtGeo as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const id = feature?.properties?.id as string;
        const avg = avgFor(id);
        const color = avg != null ? pmColor(Math.round(avg)) : '#475569';
        return {
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: avg != null ? 0.14 : 0.05,
          dashArray: avg != null ? undefined : '4 4',
        };
      },
      onEachFeature: (feature, lyr) => {
        const id = feature?.properties?.id as string;
        const name = feature?.properties?.name as string;
        const avg = avgFor(id);
        lyr.bindPopup(
          `<b>${name} район</b>` +
            (avg != null
              ? `<br>Среднее PM2.5 по датчикам в районе: <b>${Math.round(avg)} µg/m³</b>`
              : '<br>в районе пока нет собственной станции'),
        );
      },
    }).addTo(map);
    layer.bringToBack();

    return () => {
      map.removeLayer(layer);
    };
  }, [districtGeo, devices, readings]);

  // Citywide TomTom traffic flow tiles. The key stays server-side: Leaflet only
  // receives proxied transparent PNG tiles from our backend.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showTraffic || !trafficTilesEnabled) return;

    const layer = L.tileLayer(`${API_BASE_URL}/api/traffic/tile/{z}/{x}/{y}`, {
      attribution: '&copy; TomTom traffic',
      opacity: 0.82,
      maxZoom: 18,
      pane: 'overlayPane',
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [showTraffic, trafficTilesEnabled]);

  // Fallback: modelled corridor lines when TomTom tile coverage is not enabled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showTraffic || trafficTilesEnabled || corridors.length === 0) return;

    const layers: L.Layer[] = [];
    for (const c of corridors) {
      const load = c.live_load ?? c.load;
      const latlngs = c.path.map((p) => [p.lat, p.lng] as [number, number]);
      const line = L.polyline(latlngs, {
        color: trafficColor(load),
        weight: 5,
        opacity: 0.8,
        lineCap: 'round',
      }).addTo(map);
      const pct = Math.round(load * 100);
      line.bindPopup(
        `<b>${c.name}</b><br>` +
          (c.live_load != null
            ? `Загруженность (live): <b>${pct}%</b>`
            : `Загруженность (модель): <b>${pct}%</b>`),
      );
      layers.push(line);
    }
    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [corridors, showTraffic, trafficTilesEnabled]);

  // Redraw markers + blind zones whenever devices/readings change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || devices.length === 0) return;

    const layers: L.Layer[] = [];

    for (const d of devices) {
      const r = readings.get(d.id);
      const pm = r ? Math.round(aqiToPm(r.aqi_composite)) : null;
      const color = pm != null ? pmColor(pm) : '#94a3b8';
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 9,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.45,
      }).addTo(map);
      const seen = d.last_seen_at ? new Date(d.last_seen_at) : null;
      const seenLabel = seen
        ? `${String(seen.getHours()).padStart(2, '0')}:${String(seen.getMinutes()).padStart(2, '0')}`
        : 'нет данных';
      marker.bindPopup(
        `<b>${d.name}</b>` +
          (pm != null ? `<br>PM2.5 (оценка): <b>${pm} µg/m³</b><br>AQI-композит: <b>${Math.round(r!.aqi_composite)}</b>` : '<br>нет свежих измерений') +
          `<br>Последний замер: ${seenLabel}`,
      );
      layers.push(marker);
    }

    // Blind-zone shading — grid points further than BLIND_KM from any device.
    for (let la = 43.16; la <= 43.36; la += 0.012) {
      for (let ln = 76.78; ln <= 77.02; ln += 0.016) {
        if (isBlind({ lat: la, lng: ln }, devices)) {
          const c = L.circle([la, ln], {
            radius: 700,
            color: 'transparent',
            fillColor: '#f87171',
            fillOpacity: 0.06,
            interactive: false,
          }).addTo(map);
          layers.push(c);
        }
      }
    }

    return () => {
      for (const l of layers) map.removeLayer(l);
    };
  }, [devices, readings]);

  return (
    <Section
      id="map-sec"
      eyebrow="Экран 2 · Покрытие"
      title="Карта постов и слепые зоны"
      sub="Точки — сеть наших датчиков (MQ2/MQ4/MQ8). Контуры — официальные границы районов Алматы, закрашены по среднему PM2.5 датчиков внутри. Заштрихованные области — районы, где до ближайшего поста дальше 3,5 км: там официальных измерений фактически нет."
    >
      <div className="liquid-glass rounded-2xl p-2.5">
        <div className="flex items-center justify-between px-1.5 pb-2.5">
          <span className="text-[13px] text-gray-400">
            {trafficTilesEnabled
              ? 'Пробки: весь город · TomTom'
              : liveTraffic ? 'Пробки: live · TomTom' : 'Пробки: модель Алматы'}
          </span>
          <button
            onClick={() => setShowTraffic((v) => !v)}
            className="text-[13px] text-gray-300 border border-white/15 rounded-full px-3.5 py-1.5 bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
          >
            {showTraffic ? 'Скрыть пробки' : 'Показать пробки'}
          </button>
        </div>
        <div ref={mapEl} className="h-[480px] rounded-[14px] z-[1]" />
      </div>

      <div className="flex flex-wrap gap-2.5 mt-4">
        {LEGEND.map((l) => (
          <span
            key={l.label}
            className="inline-flex items-center gap-2 text-[13px] text-gray-300 border border-white/15 rounded-full px-3.5 py-1.5 bg-white/[0.03]"
          >
            <span
              className="w-[11px] h-[11px] rounded-full"
              style={{
                background: l.c,
                border: l.dashed ? '1px dashed var(--bad)' : undefined,
              }}
            />
            {l.label}
          </span>
        ))}
      </div>
    </Section>
  );
}

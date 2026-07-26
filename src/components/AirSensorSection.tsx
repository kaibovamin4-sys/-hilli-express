import { useEffect, useMemo, useState } from 'react';
import Section from './Section';
import { api, type Mq135AirReading } from '../lib/api';

function qualityColor(percent: number): string {
  if (percent >= 70) return 'var(--good)';
  if (percent >= 35) return 'var(--mid)';
  return 'var(--bad)';
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return 'время неизвестно';
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return `${sec} сек назад`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hours = Math.round(min / 60);
  return `${hours} ч назад`;
}

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-fill px-4 py-3">
      <div className="text-3xl leading-none font-light" style={{ color: accent ?? '#fff' }}>
        {value}
        {unit && <span className="text-sm text-muted ml-1">{unit}</span>}
      </div>
      <div className="text-xs text-muted mt-1.5">{label}</div>
    </div>
  );
}

export default function AirSensorSection() {
  const [latest, setLatest] = useState<Mq135AirReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void api.air().then((r) => {
        if (!alive) return;
        setLatest(r.latest);
        setError(false);
      }).catch(() => {
        if (alive) setError(true);
      }).finally(() => {
        if (alive) setLoading(false);
      });
    };

    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const accent = latest ? qualityColor(latest.quality_percent) : 'var(--muted)';
  const seen = useMemo(() => latest ? relativeTime(latest.ts) : null, [latest]);

  return (
    <Section
      id="mq135"
      eyebrow="Живой датчик · MQ-135"
      title="Станция в 12 микрорайоне"
      sub="Свежий пакет с ESP8266 через MQTT-брокер HiveMQ. Данные сохраняются на сервере и обновляются здесь автоматически."
    >
      <div className="liquid-glass rounded-2xl p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: error ? 'var(--bad)' : latest ? 'var(--good)' : 'var(--muted)' }} />
              <span className="text-sm text-gray-300">
                {error ? 'API недоступен' : latest ? `обновлено ${seen}` : loading ? 'загружаем данные' : 'данных пока нет'}
              </span>
            </div>
            <h3 className="text-lg font-medium text-white">
              {latest?.location ?? 'Almaty, Auezov, 12 mkr'}
            </h3>
            <p className="text-sm text-muted mt-1">
              topic: almaty/auezov/mkr12/station1/air
            </p>
          </div>

          {latest && (
            <div className="rounded-lg border border-line px-4 py-2 text-sm" style={{ color: accent }}>
              {latest.status}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Metric
            label="качество воздуха"
            value={latest ? String(Math.round(latest.quality_percent)) : '—'}
            unit="%"
            accent={accent}
          />
          <Metric
            label="сырой ADC"
            value={latest ? String(latest.raw_adc) : '—'}
          />
          <Metric
            label="напряжение"
            value={latest ? latest.voltage.toFixed(2) : '—'}
            unit="V"
          />
        </div>
      </div>
    </Section>
  );
}

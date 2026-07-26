import { useEffect, useState } from 'react';
import Section from './Section';
import { api, type PlacementResult } from '../lib/api';

// «Стань станцией» — ответ на главный вопрос масштабирования: город нельзя
// покрыть дорогими официальными постами, но можно — недорогими датчиками
// на балконах жителей. Цифры покрытия — из /api/optimize-placement.

const STEPS = [
  { n: '1', title: 'Собираете датчик', body: 'ESP8266 + MQ2/MQ4/MQ8 — ~15 000 ₸ комплектующих. Схема и прошивка — открытые, паяльник не обязателен: модули соединяются проводами.' },
  { n: '2', title: 'Вешаете на балкон', body: 'Питание от USB, Wi-Fi ваш домашний. Прошивка сама подключится к серверу — вы получите персональный ключ станции.' },
  { n: '3', title: 'Город видит ваш двор', body: 'Ваша станция закрывает зону вокруг: соседи получают честную оценку воздуха, вы — приоритетные алерты по своему адресу.' },
];

// Fallback-значения = константы модели (LENGTH_SCALE_KM=3 → radius ≈ 4.8 км),
// на случай если бэкенд недоступен. total90 — суммарно станций на 90 % города
// (уже работающие + оптимально добавленные).
const FALLBACK = { radius: 4.8, total90: 9 };

export default function JoinSection() {
  const [coverage, setCoverage] = useState(FALLBACK);

  useEffect(() => {
    void api.optimizePlacement(20)
      .then((r: PlacementResult) => {
        const total90 = r.stations_for_90pct != null
          ? r.existing_considered + r.stations_for_90pct
          : FALLBACK.total90;
        setCoverage({ radius: Math.round(r.effective_radius_km * 10) / 10, total90 });
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  // Диаметр и площадь одной станции для наглядности.
  const diameter = Math.round(coverage.radius * 2);
  const area = Math.round(Math.PI * coverage.radius * coverage.radius);

  return (
    <Section
      id="join"
      eyebrow="Экран 4.7 · Сеть"
      title="Повесьте датчик — закройте полрайона"
      sub="Оптимизатор размещения показывает: всего несколько станций покрывают почти весь Алматы. Шесть уже работают. Остальные могут повесить жители — за вечер и без инженерных навыков."
    >
      {/* блок покрытия: сколько километров закрывает одна станция */}
      <div className="liquid-glass rounded-2xl p-7 mb-6">
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <div className="fs-metric font-light" style={{ color: 'var(--good)' }}>
                ~{coverage.radius}<span className="text-lg text-muted ml-1">км</span>
              </div>
              <div className="text-sm text-muted mt-1.5">радиус одной станции</div>
            </div>
            <div>
              <div className="fs-metric font-light">
                ~{diameter}<span className="text-lg text-muted ml-1">км</span>
              </div>
              <div className="text-sm text-muted mt-1.5">диаметр зоны · ≈ {area} км²</div>
            </div>
            <div>
              <div className="fs-metric font-light" style={{ color: 'var(--status-c, var(--mid))' }}>
                {coverage.total90}
              </div>
              <div className="text-sm text-muted mt-1.5">станций → 90 % города</div>
            </div>
          </div>
          <p className="text-base text-gray-400 leading-relaxed md:border-l md:border-line md:pl-6">
            Одна станция «видит» не только свою точку: гауссова fusion-модель распространяет её
            поправку к городскому фону PM2.5 с масштабом 3 км, сохраняя значимый вес до ~{coverage.radius} км.
            Так один датчик закрывает пятно ~{diameter} км в поперечнике — это половина жилого района.
            Вдали от станций оценка честно опирается на городскую модель, поэтому «дыр» на карте нет —
            есть лишь зоны с меньшей уверенностью, которые и закрывают новые станции.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {STEPS.map((s) => (
          <div key={s.n} className="liquid-glass rounded-2xl p-7">
            {/* Step number. On the shared page scale rather than a hardcoded
                44px, so it stays a step below the section heading above it. */}
            <div className="fs-page font-light mb-3 text-muted">{s.n}</div>
            <h3 className="text-lg font-medium mb-2">{s.title}</h3>
            <p className="text-base text-gray-400 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="liquid-glass rounded-2xl p-7 flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-xl">
          <h3 className="text-lg font-medium mb-1.5">Хотите стать станцией?</h3>
          <p className="text-base text-gray-400">
            Напишите нам — вышлем список комплектующих, прошивку и персональный ключ.
            Особенно ищем дворы в слепых зонах: Наурызбай, верхний Турксиб, окраины Алатауского района.
          </p>
        </div>
        <a
          href="mailto:join@aua.kz?subject=Хочу стать станцией AUA"
          className="bg-white text-black px-8 py-3 rounded-xl font-medium hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          Стать станцией
        </a>
      </div>
    </Section>
  );
}

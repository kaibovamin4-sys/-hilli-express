import Section from './Section';
import type { StatusKey } from '../lib/air';

interface AdviceSectionProps {
  current: StatusKey;
}

const CARDS: {
  key: StatusKey;
  title: string;
  ac: string;
  acDim: string;
  items: string[];
}[] = [
  {
    key: 'good',
    title: 'Можно гулять',
    ac: 'var(--good)',
    acDim: 'var(--good-dim)',
    items: [
      'Гуляйте сколько хотите — воздух чистый.',
      'Хорошее время проветрить квартиру.',
      'Спорт на улице — да.',
    ],
  },
  {
    key: 'mid',
    title: 'Недолго',
    ac: 'var(--mid)',
    acDim: 'var(--mid-dim)',
    items: [
      'Короткая прогулка — до 30–40 минут.',
      'Следите за самочувствием ребёнка.',
      'Интенсивный спорт лучше перенести в зал.',
    ],
  },
  {
    key: 'bad',
    title: 'Лучше дома',
    ac: 'var(--bad)',
    acDim: 'var(--bad-dim)',
    items: [
      'Останьтесь дома, закройте окна.',
      'На улице — маска (FFP2/KN95).',
      'Включите очиститель воздуха, если есть.',
    ],
  },
];

export default function AdviceSection({ current }: AdviceSectionProps) {
  return (
    <Section
      id="advice"
      eyebrow="Экран 4 · Для родителей"
      title="Что делать прямо сейчас"
      sub="Без жаргона. Карточка вашего текущего статуса подсвечена."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => {
          const active = c.key === current;
          return (
            <div
              key={c.key}
              className="liquid-glass rounded-2xl p-7 transition-transform duration-300 hover:-translate-y-1"
              style={{
                borderTop: `3px solid ${c.ac}`,
                outline: active ? `1.5px solid ${c.ac}` : undefined,
                background: active ? c.acDim : undefined,
              }}
            >
              {active && (
                <p
                  className="text-[11px] tracking-[0.12em] uppercase mb-2.5"
                  style={{ color: c.ac }}
                >
                  Сейчас у вас
                </p>
              )}
              <h3
                className="text-2xl font-medium mb-1.5"
                style={{ letterSpacing: '-0.02em', color: c.ac }}
              >
                {c.title}
              </h3>
              <ul className="mt-3.5 grid gap-2.5">
                {c.items.map((it) => (
                  <li key={it} className="text-[15px] text-gray-300 flex gap-2.5 leading-snug">
                    <span style={{ color: c.ac }} className="font-bold">
                      ·
                    </span>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

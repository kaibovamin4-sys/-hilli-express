import Section from './Section';

// Цифры — из открытых отчётов ВОЗ/ЮНИСЕФ и национальной статистики;
// формулировки намеренно осторожные («по оценкам», «около»), источник
// подписан под каждой карточкой.

const STATS = [
  {
    value: '93%',
    label: 'детей в мире дышат воздухом, превышающим нормы ВОЗ',
    source: 'ВОЗ, доклад «Air pollution and child health», 2018',
  },
  {
    value: '~50%',
    label: 'детской заболеваемости в Казахстане — болезни органов дыхания, лидирующий класс диагнозов',
    source: 'Бюро национальной статистики РК, ежегодники здравоохранения',
  },
  {
    value: '6–10×',
    label: 'настолько зимний PM2.5 в Алматы превышает годовую норму ВОЗ (5 µg/m³)',
    source: 'данные IQAir / Kazhydromet за зимние сезоны',
  },
  {
    value: '+44%',
    label: 'выше риск развития астмы у детей, растущих при повышенном PM2.5',
    source: 'мета-анализы в European Respiratory Journal',
  },
];

export default function ImpactSection() {
  return (
    <Section
      id="impact"
      eyebrow="Экран 4.5 · Почему это важно"
      title="Воздух — это не абстракция. Это лёгкие вашего ребёнка."
      sub="Ребёнок дышит чаще взрослого, ниже к земле — где концентрация выхлопа выше, и его лёгкие ещё растут. Одинаковый воздух — неодинаковая доза."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {STATS.map((s) => (
          <div key={s.value} className="liquid-glass rounded-2xl p-6 flex flex-col">
            <div className="fs-metric font-light mb-3 text-bad">{s.value}</div>
            <p className="text-base text-gray-300 leading-snug flex-1">{s.label}</p>
            <p className="text-xs text-muted mt-3 pt-3 border-t border-line">
              {s.source}
            </p>
          </div>
        ))}
      </div>

      <div className="liquid-glass rounded-2xl p-7" style={{ borderLeft: '2px solid var(--status-c, var(--mid))' }}>
        <p className="text-md text-gray-300 leading-relaxed max-w-3xl">
          Проблема не в том, что данных о воздухе нет — а в том, что они измерены{' '}
          <b className="text-white">не там, где гуляет ваш ребёнок</b>, и написаны языком,
          который не отвечает на единственный важный вопрос. AUA переводит датчики, модели
          и городские слои в один честный ответ: <b className="text-white">можно / недолго / дома</b> —
          для вашего двора, вашего ребёнка, прямо сейчас.
        </p>
      </div>
    </Section>
  );
}

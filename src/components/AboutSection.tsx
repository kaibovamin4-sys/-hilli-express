import Section from './Section';

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`liquid-glass rounded-2xl p-6 ${className}`}>
      <h3 className="text-[17px] font-medium mb-2.5" style={{ letterSpacing: '-0.01em' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const P_CLS = 'text-[14.5px] text-gray-400 leading-relaxed';
const LI_CLS = 'text-[14.5px] text-gray-400 leading-relaxed flex gap-2.5';

export default function AboutSection() {
  return (
    <Section
      id="about"
      eyebrow="Экран 5 · Метод"
      title="О проекте"
      sub={
        <span className="text-gray-300 font-light text-[15px]">
          Мы начинали с датчиков газов и сейсмики — и поняли, что самая близкая к каждому
          человеку «геофизика» — это воздух у его подъезда.
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Какую боль решаем">
          <p className={P_CLS}>
            Официальных постов в Алматы мало, и они стоят не там, где живут люди. Родитель не
            может ответить на простой вопрос: «Можно ли сейчас гулять с ребёнком в моём
            районе?» Мы переводим разрозненные данные в один честный ответ.
          </p>
        </Card>

        <Card title="Источники данных">
          <ul className="grid gap-2">
            {[
              'Kazhydromet — официальные посты наблюдений',
              'IQAir — общественные и частные датчики',
              'air.org.kz — независимая сеть мониторинга',
              'Наша станция — локальное измерение для сверки',
            ].map((s) => (
              <li key={s} className={LI_CLS}>
                <span className="text-[color:var(--muted)] flex-none">—</span>
                {s}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Как считаем оценку под район">
          <p className={P_CLS}>
            Значение в точке без поста — взвешенная интерполяция по ближайшим постам: чем
            ближе пост, тем больше его вес (IDW). Слепые зоны — области дальше 3,5 км от
            любого поста. Аномалии — отклонение от скользящего среднего больше 2σ (z-score).
          </p>
        </Card>

        <Card title="Что мы НЕ заявляем" className="border-l-2 border-l-[color:var(--mid)]">
          <ul className="grid gap-2">
            {[
              'Это не медицинский прибор — это индикатор.',
              'Мы не предсказываем воздух, а показываем текущую оценку.',
              'Оценка между постами — приближение, и мы честно это пишем.',
            ].map((s) => (
              <li key={s} className={LI_CLS}>
                <span className="text-[color:var(--muted)] flex-none">—</span>
                {s}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Устойчивость · B2G" className="md:col-span-2">
          <p className={P_CLS}>
            Следующий шаг — сеть недорогих датчиков для акимата: закрыть слепые зоны города,
            дать районным службам ту же простую картинку «гулять / дома», а планировщикам —
            данные, где воздух реально хуже официального.
          </p>
        </Card>
      </div>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="px-6 md:px-12 lg:px-16 max-w-7xl mx-auto pt-20 pb-10 text-[13px] text-[color:var(--muted)] flex flex-wrap gap-x-6 gap-y-3 justify-between">
      <span>AUA · гиперлокальный мониторинг воздуха · Алматы</span>
      <span>Индикатор, не медицинский прибор</span>
    </footer>
  );
}

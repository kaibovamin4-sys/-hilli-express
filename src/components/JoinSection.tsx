import Section from './Section';

// «Стань станцией» — ответ на главный вопрос масштабирования: город нельзя
// покрыть дорогими официальными постами, но можно — недорогими датчиками
// на балконах жителей. Цифры покрытия — из /api/optimize-placement.

const STEPS = [
  { n: '1', title: 'Собираете датчик', body: 'ESP8266 + MQ2/MQ4/MQ8 — ~15 000 ₸ комплектующих. Схема и прошивка — открытые, паяльник не обязателен: модули соединяются проводами.' },
  { n: '2', title: 'Вешаете на балкон', body: 'Питание от USB, Wi-Fi ваш домашний. Прошивка сама подключится к серверу — вы получите персональный ключ станции.' },
  { n: '3', title: 'Город видит ваш двор', body: 'Ваша станция закрывает пятно ~5 км: соседи получают честную оценку воздуха, вы — приоритетные алерты по своему адресу.' },
];

export default function JoinSection() {
  return (
    <Section
      id="join"
      eyebrow="Экран 4.7 · Сеть"
      title="Повесьте датчик — закройте полрайона"
      sub="Оптимизатор размещения показывает: всего 15 станций покрывают почти весь Алматы. Шесть уже работают. Остальные могут повесить жители — за вечер и без инженерных навыков."
    >
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {STEPS.map((s) => (
          <div key={s.n} className="liquid-glass rounded-2xl p-7">
            <div
              className="font-light leading-none mb-3 text-[color:var(--muted)]"
              style={{ fontSize: '44px', letterSpacing: '-0.03em' }}
            >
              {s.n}
            </div>
            <h3 className="text-[16.5px] font-medium mb-2">{s.title}</h3>
            <p className="text-[14px] text-gray-400 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="liquid-glass rounded-2xl p-7 flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-xl">
          <h3 className="text-[17px] font-medium mb-1.5">Хотите стать станцией?</h3>
          <p className="text-[14px] text-gray-400">
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

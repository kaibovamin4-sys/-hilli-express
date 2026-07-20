interface NavbarProps {
  statusColor: string;
}

const LINKS = [
  { href: '#top', label: 'Сейчас' },
  { href: '#map-sec', label: 'Карта' },
  { href: '#gap', label: 'Разрыв' },
  { href: '#advice', label: 'Что делать' },
  { href: '#about', label: 'О проекте' },
];

export default function Navbar({ statusColor }: NavbarProps) {
  return (
    <div className="sticky top-0 z-50 pt-5 pb-2 px-6 md:px-12 lg:px-16">
      <nav className="liquid-glass rounded-xl px-4 py-2.5 flex items-center justify-between max-w-7xl mx-auto">
        <a href="#top" className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
          <span
            className="w-2.5 h-2.5 rounded-full self-center transition-colors duration-700"
            style={{ background: statusColor, boxShadow: `0 0 12px ${statusColor}` }}
          />
          AUA
          <small className="text-[11px] font-normal text-[color:var(--muted)] tracking-normal">
            воздух Алматы
          </small>
        </a>

        <div className="hidden md:flex items-center gap-7 text-sm text-gray-300">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-white transition-colors py-1.5">
              {l.label}
            </a>
          ))}
        </div>

        <a
          href="#advice"
          className="bg-white text-black px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          Что делать
        </a>
      </nav>
    </div>
  );
}

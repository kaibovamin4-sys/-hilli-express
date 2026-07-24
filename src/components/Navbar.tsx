import { useEffect, useState } from 'react';

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
  const [open, setOpen] = useState(false);

  // Escape closes the menu; body scroll is locked while it's open so the page
  // behind doesn't slide around under the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-50 pt-4 md:pt-5 pb-2 px-4 md:px-12 lg:px-16">
      <nav className="liquid-glass liquid-glass--solid rounded-xl px-3.5 md:px-4 py-2.5 flex items-center justify-between gap-3 max-w-7xl mx-auto">
        <a
          href="#top"
          onClick={() => setOpen(false)}
          className="flex items-baseline gap-2 text-xl md:text-2xl font-semibold tracking-tight min-w-0"
        >
          <span
            className="w-2.5 h-2.5 rounded-full self-center flex-none transition-colors duration-700"
            style={{ background: statusColor, boxShadow: `0 0 12px ${statusColor}` }}
          />
          AUA
          <small className="text-[11px] font-normal text-[color:var(--muted)] tracking-normal truncate">
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

        {/* Desktop CTA only: on mobile the hero already shows this same button,
            so the header offers the menu instead of repeating the action. */}
        <a
          href="#advice"
          className="hidden md:inline-block flex-none bg-white text-black px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          Что делать
        </a>

        <button
          type="button"
          aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden flex-none w-10 h-10 -mr-1 rounded-lg border border-white/15 bg-white/[0.03] flex flex-col items-center justify-center gap-[5px] active:bg-white/[0.08] transition-colors"
        >
          <span
            className="block w-[18px] h-[1.5px] bg-gray-200 transition-transform duration-200"
            style={open ? { transform: 'translateY(6.5px) rotate(45deg)' } : undefined}
          />
          <span
            className="block w-[18px] h-[1.5px] bg-gray-200 transition-opacity duration-200"
            style={open ? { opacity: 0 } : undefined}
          />
          <span
            className="block w-[18px] h-[1.5px] bg-gray-200 transition-transform duration-200"
            style={open ? { transform: 'translateY(-6.5px) rotate(-45deg)' } : undefined}
          />
        </button>
      </nav>

      {open && (
        <div className="md:hidden mt-2 max-w-7xl mx-auto">
          <div className="liquid-glass liquid-glass--solid rounded-xl p-2">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-lg text-[15px] text-gray-200 active:bg-white/[0.06] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

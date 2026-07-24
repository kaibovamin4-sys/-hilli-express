import { useEffect, useRef, useState, type ReactNode } from 'react';

interface SectionProps {
  id: string;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}

export default function Section({ id, eyebrow, title, sub, children }: SectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className={`fade ${inView ? 'in' : ''} px-6 md:px-12 lg:px-16 max-w-7xl mx-auto pt-28 pr-[76px] md:pr-12 lg:pr-16`}
    >
      <p className="text-[12.5px] tracking-[0.16em] uppercase text-[color:var(--muted)] mb-3">
        {eyebrow}
      </p>
      <h2
        className="font-normal leading-[1.06] mb-4"
        style={{ letterSpacing: '-0.035em', fontSize: 'clamp(34px, 4.6vw, 60px)' }}
      >
        {title}
      </h2>
      {sub && <p className="text-gray-400 text-base max-w-2xl mb-8">{sub}</p>}
      {children}
    </section>
  );
}

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
    // Rhythm now matches the rest of the app instead of the old standalone
    // landing: no horizontal padding of its own (the shell already provides
    // it), section spacing on the same 4/8 grid the panels use, and the
    // heading on the shared display scale — one step below the page <h1>
    // rather than half again larger than it, which is what made /about read
    // like a different product.
    <section id={id} ref={ref} className={`fade ${inView ? 'in' : ''} pt-12 md:pt-14`}>
      <p className="text-2xs tracking-[0.16em] uppercase text-muted mb-2.5">{eyebrow}</p>
      <h2 className="fs-section font-normal mb-3">{title}</h2>
      {sub && <p className="text-gray-400 text-base max-w-2xl mb-6">{sub}</p>}
      {children}
    </section>
  );
}

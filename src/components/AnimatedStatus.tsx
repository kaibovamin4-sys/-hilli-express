import { useEffect, useState } from 'react';

interface AnimatedStatusProps {
  text: string;
  color: string;
  charDelay?: number;
  initialDelay?: number;
}

/** Посимвольная анимация статуса — тот же паттерн, что в VEX hero */
export default function AnimatedStatus({
  text,
  color,
  charDelay = 30,
  initialDelay = 200,
}: AnimatedStatusProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(false);
    const timer = setTimeout(() => setAnimate(true), initialDelay);
    return () => clearTimeout(timer);
  }, [text, initialDelay]);

  return (
    <h1
      className="font-normal leading-none mb-5"
      style={{
        letterSpacing: '-0.04em',
        fontSize: 'clamp(52px, 10vw, 128px)',
        color,
      }}
    >
      {text.split('').map((char, i) => (
        <span
          key={`${text}-${i}`}
          className="inline-block"
          style={{
            opacity: animate ? 1 : 0,
            transform: animate ? 'translateX(0)' : 'translateX(-18px)',
            transition: `opacity 500ms ease ${i * charDelay}ms, transform 500ms ease ${i * charDelay}ms`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </h1>
  );
}

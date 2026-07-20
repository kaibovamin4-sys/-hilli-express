import { useEffect, useState, type ReactNode } from 'react'

interface FadeInProps {
  delay?: number
  duration?: number
  className?: string
  children: ReactNode
}

export default function FadeIn({
  delay = 0,
  duration = 1000,
  className = '',
  children,
}: FadeInProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div
      className={`transition-opacity ${visible ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  )
}

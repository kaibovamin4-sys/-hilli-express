import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, type District } from '../lib/api';

interface ChatWidgetProps {
  district: District | null;
}

interface Msg {
  role: 'user' | 'bot';
  text: string;
}

const GREETING: Msg = {
  role: 'bot',
  text: 'Привет! Я эко-ассистент AUA. Спросите про воздух, пыльцу, погоду, пробки или прогулки с детьми.',
};

const START_SUGGESTIONS = [
  'Можно ли сейчас гулять?',
  'Что с пыльцой для аллергиков?',
  'Нужна ли маска?',
];

export default function ChatWidget({ district }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [suggestions, setSuggestions] = useState<string[]>(START_SUGGESTIONS);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy || !district) return;
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.chat(msg, district);
      setMessages((m) => [...m, { role: 'bot', text: r.reply }]);
      setSuggestions(r.suggestions);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'Не получилось связаться с сервером — попробуйте ещё раз.' }]);
    } finally {
      setBusy(false);
    }
  };

  // Позиция — инлайн-стилями: fixed-элементы не должны зависеть от порядка
  // CSS-слоёв или чужих stacking-контекстов.
  const anchor: CSSProperties = { position: 'fixed', right: 20, zIndex: 9000 };

  return (
    <>
      {/* плавающая кнопка */}
      <button
        type="button"
        aria-label="Открыть эко-ассистента"
        onClick={() => setOpen((o) => !o)}
        style={{ ...anchor, bottom: 20 }}
        className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white text-black text-xl md:text-2xl shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
      >
        {open ? '×' : '💬'}
      </button>

      {open && (
        <div
          className="liquid-glass rounded-2xl flex flex-col overflow-hidden"
          style={{
            ...anchor,
            bottom: 88,
            width: 'min(380px, calc(100vw - 40px))',
            height: 'min(520px, 70vh)',
          }}
        >
          <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-c, var(--good))' }} />
            <div>
              <div className="text-[14px] font-medium text-white leading-tight">Эко-ассистент</div>
              <div className="text-[11.5px] text-[color:var(--muted)]">отвечает по живым данным · {district?.name ?? '…'} район</div>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 grid gap-3 content-start">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${
                  m.role === 'user'
                    ? 'justify-self-end bg-white text-black rounded-br-md'
                    : 'justify-self-start bg-white/[0.07] text-gray-200 rounded-bl-md'
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="justify-self-start bg-white/[0.07] text-gray-400 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px]">
                думаю…
              </div>
            )}
          </div>

          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="text-[12px] text-gray-300 border border-white/15 rounded-full px-3 py-1 hover:border-white/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="p-3 border-t border-white/10 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Спросите про воздух…"
              className="flex-1 bg-white/[0.05] border border-white/15 rounded-xl px-3.5 py-2 text-[13.5px] text-white placeholder:text-gray-500 outline-none focus:border-white/40"
            />
            <button
              type="submit"
              disabled={busy || input.trim() === ''}
              className="bg-white text-black rounded-xl px-4 text-[13.5px] font-medium disabled:opacity-40"
            >
              →
            </button>
          </form>
        </div>
      )}
    </>
  );
}

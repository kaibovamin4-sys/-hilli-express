import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, type Point } from '../lib/api';

interface ChatWidgetProps {
  /** Where to answer about. Any labelled point — a district, or the user's own address. */
  place: (Point & { label: string }) | null;
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

export default function ChatWidget({ place }: ChatWidgetProps) {
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
    if (!msg || busy || !place) return;
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.chat(msg, place);
      setMessages((m) => [...m, { role: 'bot', text: r.reply }]);
      setSuggestions(r.suggestions);
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'Не получилось связаться с сервером — попробуйте ещё раз.' }]);
    } finally {
      setBusy(false);
    }
  };

  // position/right/zIndex are inline because fixed elements shouldn't depend
  // on CSS layer order or a foreign stacking context. `bottom` is the one
  // property that has to differ between mobile and desktop — the mobile tab
  // bar (AppNav) occupies the bottom ~60px there and nothing does on desktop —
  // and inline styles always beat a class regardless of breakpoint, so it has
  // to live in className instead or the responsive override could never win.
  const anchor: CSSProperties = { position: 'fixed', right: 20, zIndex: 9000 };
  // Match the tab bar's own content height (~61px) plus a gap, and add the same
  // safe-area inset the tab bar pads itself with — so the button clears it on
  // every device, notch or not, without the two having to coordinate.
  const BUTTON_BOTTOM_MOBILE = 'bottom-[calc(76px+env(safe-area-inset-bottom,0px))]';
  // Stacked above the button: its own mobile offset + button height + a gap.
  const PANEL_BOTTOM_MOBILE = 'bottom-[calc(140px+env(safe-area-inset-bottom,0px))]';

  return (
    <>
      {/* плавающая кнопка */}
      <button
        type="button"
        aria-label="Открыть эко-ассистента"
        onClick={() => setOpen((o) => !o)}
        style={anchor}
        className={`${BUTTON_BOTTOM_MOBILE} md:bottom-5 w-12 h-12 md:w-14 md:h-14 rounded-full bg-white text-black text-xl md:text-2xl shadow-lg hover:scale-105 transition-transform flex items-center justify-center`}
      >
        {open ? '×' : '💬'}
      </button>

      {open && (
        <div
          className={`${PANEL_BOTTOM_MOBILE} md:bottom-[88px] liquid-glass rounded-2xl flex flex-col overflow-hidden`}
          style={{
            ...anchor,
            width: 'min(380px, calc(100vw - 40px))',
            height: 'min(520px, 70vh)',
          }}
        >
          <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-c, var(--good))' }} />
            <div>
              <div className="text-[14px] font-medium text-white leading-tight">Эко-ассистент</div>
              <div className="text-[11.5px] text-[color:var(--muted)]">отвечает по живым данным · {place?.label ?? '…'}</div>
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

// "Where are you?" — the control every screen depends on.
//
// Three ways in, because they fail in different situations: the district list
// always works, geolocation is one tap but gets denied, and a typed address is
// the only option that answers "my yard", which is the question people actually
// have. Whichever is used, the result is one Place in app state and every
// screen follows it.

import { useState, type FormEvent } from 'react';
import { api, type AddressCheck } from '../lib/api';
import { PROFILE_LABELS, useApp } from '../lib/appState';
import type { Profile } from '../lib/api';

interface PlacePickerProps {
  /** Compact mode drops the profile row — used above the map, where space is tight. */
  compact?: boolean;
}

export default function PlacePicker({ compact = false }: PlacePickerProps) {
  const { districts, place, setPlace, profile, setProfile, locate, locating, locateError } = useApp();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddressCheck | null>(null);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setError('Введите улицу и номер дома');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      // Geocode and status come back together, so the answer is already on
      // screen by the time the map finishes re-centring.
      const hit = await api.checkAddress(q, profile);
      setResult(hit);
      setPlace({ kind: 'address', label: shortAddress(hit.address), lat: hit.lat, lng: hit.lng });
    } catch {
      setError('Адрес не найден. Попробуйте «улица, номер дома».');
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="liquid-glass rounded-2xl p-3.5 sm:p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2.5">
        <label className="flex-1 min-w-0">
          <span className="sr-only">Район</span>
          <select
            value={place?.kind === 'district' ? place.districtId ?? '' : ''}
            onChange={(e) => {
              const d = districts.find((x) => x.id === e.target.value);
              if (d) {
                setResult(null);
                setPlace({ kind: 'district', label: d.name, lat: d.lat, lng: d.lng, districtId: d.id });
              }
            }}
            className="w-full bg-fill border border-line rounded-xl px-3.5 py-2.5 text-base transition-colors"
          >
            <option value="">
              {place && place.kind !== 'district' ? place.label : 'Выберите район'}
            </option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void locate()}
          disabled={locating}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-line bg-fill text-base hover:bg-fill-hover disabled:opacity-50 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
          {locating ? 'Определяем…' : 'Где я'}
        </button>
      </div>

      <form onSubmit={onSearch} className="flex gap-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Свой адрес: Абая 150, Алматы"
          className="flex-1 min-w-0 bg-fill border border-line rounded-xl px-3.5 py-2.5 text-base transition-colors placeholder:text-muted"
          aria-label="Адрес"
        />
        <button
          type="submit"
          disabled={searching}
          className="shrink-0 bg-white text-black px-4 py-2.5 rounded-xl text-base font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          {searching ? '…' : 'Проверить'}
        </button>
      </form>

      {!compact && (
        <label className="flex items-center gap-2.5">
          <span className="text-sm text-muted shrink-0">Для кого:</span>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as Profile)}
            className="flex-1 bg-fill border border-line rounded-xl px-3 py-2 text-base transition-colors"
          >
            {(Object.keys(PROFILE_LABELS) as Profile[]).map((p) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      )}

      {(error || locateError) && (
        <p className="text-sm text-bad">{error ?? locateError}</p>
      )}

      {result && (
        <div className="text-sm text-muted leading-relaxed">
          <span className="text-gray-300">{shortAddress(result.address)}</span> — {result.status_reason}.
          Безопасно на улице примерно <b className="text-gray-200">{result.max_safe_duration_min} мин</b>.
          {result.alternatives.length > 0 && (
            <span className="block mt-1">
              Другие совпадения: {result.alternatives.map(shortAddress).join(' · ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Nominatim returns the full administrative chain ("…, Алматы, 050000,
// Казахстан"); the first three parts are all a resident needs to recognise
// their own address.
function shortAddress(full: string): string {
  return full.split(',').slice(0, 3).join(',').trim();
}

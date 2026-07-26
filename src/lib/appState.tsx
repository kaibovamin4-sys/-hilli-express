// App-wide state: where the user is and who they are.
//
// Every screen answers a question about one place — the map centres on it, the
// forecast anchors on it, the advice is scaled to the profile. Holding that in
// one context (and in localStorage) means switching screens never loses the
// address someone typed, and the whole app re-derives from a single change.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  type Device,
  type District,
  type FullStatus,
  type Profile,
  type Point,
} from './api';
import { loadDistrictBoundaries, findDistrictId, type DistrictGeoJSON } from './geo';

export type PlaceKind = 'district' | 'address' | 'geo';

export interface Place extends Point {
  kind: PlaceKind;
  label: string;
  /** District id when known — lets the map highlight the right polygon. */
  districtId?: string | null;
}

const STORAGE_KEY = 'aua.place.v1';
const PROFILE_KEY = 'aua.profile.v1';

export const PROFILE_LABELS: Record<Profile, string> = {
  default: 'Обычный взрослый',
  infant: 'Младенец',
  child: 'Ребёнок',
  asthma: 'Астма',
  allergy: 'Аллергия',
  elderly: 'Пожилой человек',
  athlete: 'Спорт на улице',
  pregnant: 'Беременность',
};

function loadStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Private mode or corrupted value — fall back to defaults rather than
    // taking the whole app down over a preference.
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

interface AppState {
  districts: District[];
  devices: Device[];
  districtGeo: DistrictGeoJSON | null;
  place: Place | null;
  setPlace: (p: Place) => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  status: FullStatus | null;
  statusLoading: boolean;
  /** Ask the browser for a fix and snap the place to the containing district. */
  locate: () => Promise<void>;
  locating: boolean;
  locateError: string | null;
  refreshStatus: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [districtGeo, setDistrictGeo] = useState<DistrictGeoJSON | null>(null);
  const [place, setPlaceState] = useState<Place | null>(() => loadStored<Place>(STORAGE_KEY));
  const [profile, setProfileState] = useState<Profile>(
    () => loadStored<Profile>(PROFILE_KEY) ?? 'default',
  );
  const [status, setStatus] = useState<FullStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    void Promise.all([api.districts(), api.devices()]).then(([d, dv]) => {
      setDistricts(d);
      setDevices(dv);
      // Only seed a default when nothing was restored, so a returning visitor
      // keeps the district (or address) they picked last time.
      setPlaceState((prev) => {
        if (prev) return prev;
        const first = d[0];
        return first
          ? { kind: 'district', label: first.name, lat: first.lat, lng: first.lng, districtId: first.id }
          : null;
      });
    });
    void loadDistrictBoundaries().then(setDistrictGeo);
  }, []);

  const setPlace = useCallback((p: Place) => {
    setPlaceState(p);
    store(STORAGE_KEY, p);
  }, []);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    store(PROFILE_KEY, p);
  }, []);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    setStatusLoading(true);
    void api
      .status(place, profile)
      .then((s) => {
        if (alive) setStatus(s);
      })
      .finally(() => {
        if (alive) setStatusLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [place, profile, reloadToken]);

  const locate = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setLocateError('Браузер не поддерживает геолокацию');
      return;
    }
    setLocating(true);
    setLocateError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
        });
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = districtGeo ?? (await loadDistrictBoundaries());
      const id = findDistrictId(lat, lng, geo);
      const name = geo.features.find((f) => f.properties.id === id)?.properties.name;
      setPlace({
        kind: 'geo',
        lat,
        lng,
        districtId: id,
        label: name ? `Моя точка · ${name}` : 'Моя точка',
      });
    } catch {
      setLocateError('Не удалось определить местоположение');
    } finally {
      setLocating(false);
    }
  }, [districtGeo, setPlace]);

  const value = useMemo<AppState>(
    () => ({
      districts,
      devices,
      districtGeo,
      place,
      setPlace,
      profile,
      setProfile,
      status,
      statusLoading,
      locate,
      locating,
      locateError,
      refreshStatus: () => setReloadToken((t) => t + 1),
    }),
    [
      districts, devices, districtGeo, place, setPlace, profile, setProfile,
      status, statusLoading, locate, locating, locateError,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}

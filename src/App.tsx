import { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import CoverageMap from './components/CoverageMap';
import GapSection from './components/GapSection';
import BriefingSection from './components/BriefingSection';
import AirSensorSection from './components/AirSensorSection';
import WalkSpotsSection from './components/WalkSpotsSection';
import ImpactSection from './components/ImpactSection';
import JoinSection from './components/JoinSection';
import ChatWidget from './components/ChatWidget';
import AdviceSection from './components/AdviceSection';
import AboutSection, { Footer } from './components/AboutSection';
import { api, asKey, type District, type Device, type FullStatus } from './lib/api';
import { statusCopyFor } from './lib/air';
import { loadDistrictBoundaries, type DistrictGeoJSON } from './lib/geo';

const HERO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4';

export default function App() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [district, setDistrict] = useState<District | null>(null);
  const [status, setStatus] = useState<FullStatus | null>(null);
  const [districtGeo, setDistrictGeo] = useState<DistrictGeoJSON | null>(null);

  useEffect(() => {
    void Promise.all([api.districts(), api.devices()]).then(([d, dv]) => {
      setDistricts(d);
      setDevices(dv);
      if (d[0]) setDistrict(d[0]);
    });
    void loadDistrictBoundaries().then(setDistrictGeo);
  }, []);

  useEffect(() => {
    if (!district) return;
    void api.status(district).then(setStatus);
  }, [district]);

  const copy = statusCopyFor(status ? asKey(status.status) : 'good');

  useEffect(() => {
    document.documentElement.style.setProperty('--status-c', copy.cssVar);
  }, [copy.cssVar]);

  return (
    <>
      <div className="haze" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="relative z-[1]">
        <div className="absolute top-0 inset-x-0 h-screen overflow-hidden" aria-hidden="true">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={HERO_VIDEO_URL}
            autoPlay
            loop
            muted
            playsInline
          />
          <div
            className="absolute inset-x-0 bottom-0 h-40"
            style={{ background: 'linear-gradient(180deg, transparent, var(--bg))' }}
          />
        </div>

        <Navbar statusColor={copy.cssVar} />
        <Hero
          districts={districts}
          district={district}
          status={status}
          districtGeo={districtGeo}
          onDistrictChange={setDistrict}
        />
        <CoverageMap devices={devices} districtGeo={districtGeo} />
        <GapSection devices={devices} />
        <BriefingSection district={district} status={status} />
        <AirSensorSection />
        <WalkSpotsSection district={district} />
        <AdviceSection current={copy.key} />
        <ImpactSection />
        <JoinSection />
        <AboutSection />
        <Footer />
      </div>

      <ChatWidget district={district} />
    </>
  );
}

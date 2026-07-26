// "О проекте" — the original landing narrative, kept intact.
//
// The app answers "can I go outside"; this page answers "why should I believe
// you". Same sections as before the app shell existed: the measurement gap,
// the live MQ-135 feed, why it matters, and how to join the network.

import { useApp } from '../lib/appState';
import { PageHeader } from '../components/ui/Panel';
import GapSection from '../components/GapSection';
import AirSensorSection from '../components/AirSensorSection';
import ImpactSection from '../components/ImpactSection';
import JoinSection from '../components/JoinSection';
import AboutSection, { Footer } from '../components/AboutSection';

export default function AboutPage() {
  const { devices } = useApp();

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow="О проекте"
        title="Как это устроено"
        sub="Собственная сеть станций на ESP8266 с сенсорами MQ2/MQ4/MQ8 и DHT22, поверх открытых моделей Open-Meteo. Всё, что вы видите в приложении, считается из этих двух источников — и подписывается, из какого именно."
      />

      {/* These sections carry their own <Section> wrapper with the landing's
          wide padding; the negative margin cancels the shell's page padding so
          they keep their original full-bleed rhythm. */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-10">
        <GapSection devices={devices} />
        <AirSensorSection />
        <ImpactSection />
        <JoinSection />
        <AboutSection />
        <Footer />
      </div>
    </div>
  );
}

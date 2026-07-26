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

      {/* No negative margin any more. <Section> used to carry the standalone
          landing's own horizontal padding, so this wrapper had to cancel the
          shell's padding to stop the two from stacking — which is also why the
          page read as a different product. <Section> now inherits the shell's
          gutters and the shared display scale, so /about lines up with every
          other screen and this is a plain stack. */}
      <GapSection devices={devices} />
      <AirSensorSection />
      <ImpactSection />
      <JoinSection />
      <AboutSection />
      <Footer />
    </div>
  );
}

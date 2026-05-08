import { CompatibilityBanner } from '@ui/CompatibilityBanner';
import { Hud } from '@ui/Hud';
import { ScaleBar } from '@ui/ScaleBar';
import { SimulationCanvas } from '@ui/SimulationCanvas';
import { TimeStrip } from '@ui/TimeStrip';

function App(): React.JSX.Element {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <SimulationCanvas />
      <TimeStrip />
      <ScaleBar />
      <Hud />
      <CompatibilityBanner />
    </main>
  );
}

export default App;

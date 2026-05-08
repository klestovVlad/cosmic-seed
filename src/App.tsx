import { CompatibilityBanner } from '@ui/CompatibilityBanner';
import { DeltaMaxChart } from '@ui/DeltaMaxChart';
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
      <DeltaMaxChart />
      <CompatibilityBanner />
    </main>
  );
}

export default App;

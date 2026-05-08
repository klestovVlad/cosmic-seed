import { CompatibilityBanner } from '@ui/CompatibilityBanner';
import { ControlsPanel } from '@ui/controls/ControlsPanel';
import { DeltaMaxChart } from '@ui/DeltaMaxChart';
import { ExpertToggle } from '@ui/ExpertToggle';
import { Hud } from '@ui/Hud';
import { ScaleBar } from '@ui/ScaleBar';
import { SimulationCanvas } from '@ui/SimulationCanvas';
import { TimeStrip } from '@ui/TimeStrip';

function App(): React.JSX.Element {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <SimulationCanvas />
      <ExpertToggle />
      <TimeStrip />
      <ScaleBar />
      <Hud />
      <DeltaMaxChart />
      <ControlsPanel />
      <CompatibilityBanner />
    </main>
  );
}

export default App;

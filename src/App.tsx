import { Hud } from '@ui/Hud';
import { SimulationCanvas } from '@ui/SimulationCanvas';

function App(): React.JSX.Element {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <SimulationCanvas />
      <Hud />
    </main>
  );
}

export default App;

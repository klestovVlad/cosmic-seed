// In-scene annotation pins (EXPERIENCE.md §3). Each pin is a screen-space
// label anchored to a 3D world position. The list of pins is derived from
// the simulation diagnostics; their on-screen positions are recomputed
// every render frame from the live camera by `updatePinScreenPositions`.
//
// Two pin kinds at this stage:
//   * `largest-halo`  — persistent while halos exist. Tracks the most
//                       massive halo's centre. Includes a mass-anchor
//                       string ("≈ dwarf-galaxy seed").
//   * `first-ignition`— transient (3-second window) at the moment the
//                       first Pop III star lights up. Includes z and
//                       M_halo with a mass-anchor.
//
// The component renders raw <div>s; the parent (`SimulationCanvas`) calls
// `updatePinScreenPositions(camera)` after each render to imperatively
// transform each pin's `style.transform`. React only re-renders when the
// pin set itself changes (label or visibility flips).

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useSimulationStore } from '@state/simulationStore';
import {
  buildPins,
  IGNITION_PIN_LIFETIME_MS,
  projectWorldToViewport,
  type PinAnchor,
} from './annotation-pin-builder';

export interface UnwrapTransform {
  /** Centre that the renderer's particle unwrap is currently anchored to.
   *  Pin anchors are min-image-translated by this same target so they
   *  follow the visible cosmic web instead of staying at the raw
   *  simulation coordinate (which would drift off-screen as the renderer
   *  re-centres on the dominant halo). */
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
  /** Box side length used by the periodic min-image. */
  readonly boxSize: number;
}

export interface AnnotationPinsHandle {
  /** Re-project all pins from world to screen using the current camera +
   *  canvas size. Call from the render loop after each frame. */
  updatePinScreenPositions(
    camera: THREE.Camera,
    width: number,
    height: number,
    unwrap: UnwrapTransform,
  ): void;
}

interface AnnotationPinsProps {
  /** Same conversion factor the simulation runner uses, so we can convert
   *  the largest halo's code-unit mass back into M☉. */
  readonly unitMassPerMsun: number;
  readonly ref?: React.Ref<AnnotationPinsHandle> | undefined;
}

interface IgnitionWindow {
  readonly anchor: PinAnchor;
  readonly redshift: number;
  readonly massMsun: number;
  readonly visible: boolean;
}

export function AnnotationPins({ ref, unitMassPerMsun }: AnnotationPinsProps): React.JSX.Element {
  const diagnostics = useSimulationStore((s) => s.diagnostics);
  // Per-pin DOM nodes, keyed by pin id, so we can imperatively transform
  // them on every frame without React reconciliation.
  const pinNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Ignition window is driven by an effect, not by Date.now during render —
  // keeps render pure and the lint rules happy. The 3-second lifetime is
  // wall-clock so it doesn't stretch when the user changes sim speed.
  const [ignitionWindow, setIgnitionWindow] = useState<IgnitionWindow | null>(null);

  // Synchronisation pattern: the *external system* (sim diagnostics) emits
  // `firstIgnition`; we mirror it into UI state with a 3-second visibility
  // window. State updates happen inside setTimeout callbacks (out-of-tree
  // event-loop ticks), keeping the effect body free of synchronous
  // `setState` so render stays the source of truth, not the effect.
  useEffect(() => {
    const ig = diagnostics.firstIgnition;
    if (ig === null) {
      const resetId = window.setTimeout(() => {
        setIgnitionWindow(null);
      }, 0);
      return () => {
        window.clearTimeout(resetId);
      };
    }
    const initId = window.setTimeout(() => {
      setIgnitionWindow(
        (w) =>
          w ?? {
            anchor: { x: ig.x, y: ig.y, z: ig.z },
            redshift: ig.redshift,
            massMsun: ig.haloMassMsun,
            visible: true,
          },
      );
    }, 0);
    const expireId = window.setTimeout(() => {
      setIgnitionWindow((w) => (w === null ? null : { ...w, visible: false }));
    }, IGNITION_PIN_LIFETIME_MS);
    return () => {
      window.clearTimeout(initId);
      window.clearTimeout(expireId);
    };
  }, [diagnostics.firstIgnition]);

  const pins = useMemo(
    () =>
      buildPins({
        haloCount: diagnostics.haloCount,
        largestHaloMass: diagnostics.largestHaloMass,
        largestHaloCentre: diagnostics.largestHaloCentre,
        firstIgnitionAnchor: ignitionWindow?.visible === true ? ignitionWindow.anchor : null,
        firstIgnitionRedshift: ignitionWindow?.visible === true ? ignitionWindow.redshift : null,
        firstIgnitionMassMsun: ignitionWindow?.visible === true ? ignitionWindow.massMsun : null,
        unitMassPerMsun,
      }),
    [
      diagnostics.haloCount,
      diagnostics.largestHaloMass,
      diagnostics.largestHaloCentre,
      ignitionWindow,
      unitMassPerMsun,
    ],
  );

  // Imperative tick: parent calls this after each composer.render() with
  // the current camera + canvas size. We translate each pin's DOM node so
  // it sits at the projected (u, v) screen position. No React state in the
  // hot path.
  useImperativeHandle(
    ref,
    () => ({
      updatePinScreenPositions(camera, width, height, unwrap): void {
        const map = pinNodesRef.current;
        const halfBox = unwrap.boxSize * 0.5;
        const minImage = (delta: number): number => {
          let d = delta;
          if (d > halfBox) d -= unwrap.boxSize;
          else if (d < -halfBox) d += unwrap.boxSize;
          return d;
        };
        for (const pin of pins) {
          const node = map.get(pin.id);
          if (node === undefined) continue;
          // Apply the same min-image unwrap the renderer applies to
          // particles, so the pin's leader points at the visible halo
          // (origin-centred in scene space) rather than the raw
          // simulation coordinate the snapshot recorded.
          const unwrapped = {
            x: minImage(pin.anchor.x - unwrap.target.x),
            y: minImage(pin.anchor.y - unwrap.target.y),
            z: minImage(pin.anchor.z - unwrap.target.z),
          };
          const proj = projectWorldToViewport(unwrapped, camera);
          if (proj === null || proj.behind) {
            node.style.opacity = '0';
            continue;
          }
          const x = proj.u * width;
          const y = proj.v * height;
          node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          node.style.opacity = '1';
        }
      },
    }),
    [pins],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {pins.map((pin) => (
        <div
          key={pin.id}
          ref={(el) => {
            if (el === null) pinNodesRef.current.delete(pin.id);
            else pinNodesRef.current.set(pin.id, el);
          }}
          data-pin-id={pin.id}
          aria-live="polite"
          className={
            pin.id === 'first-ignition'
              ? 'absolute top-0 left-0 origin-top-left rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-amber-100 shadow-[0_0_18px_rgba(252,211,77,0.25)] backdrop-blur-sm transition-opacity duration-300'
              : 'absolute top-0 left-0 origin-top-left rounded-md border border-white/15 bg-black/55 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-(--color-ink-1) backdrop-blur-sm transition-opacity duration-200'
          }
          style={{ transform: 'translate3d(-9999px, -9999px, 0)', opacity: 0 }}
        >
          {pin.label}
        </div>
      ))}
    </div>
  );
}

import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  twinklePhase: number;
}

const STAR_COUNT = 220;
const TWINKLE_SPEED = 0.0007;

function createStars(width: number, height: number, rng: () => number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({
      x: rng() * width,
      y: rng() * height,
      z: 0.3 + rng() * 0.7,
      size: 0.4 + rng() * 1.4,
      twinklePhase: rng() * Math.PI * 2,
    });
  }
  return stars;
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Starfield(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    let stars: Star[] = [];
    let raf = 0;
    let cancelled = false;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${String(w)}px`;
      canvas.style.height = `${String(h)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(w, h, mulberry32(0xc05_5eed));
    };

    const draw = (t: number): void => {
      if (cancelled) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * TWINKLE_SPEED + s.twinklePhase);
        const a = 0.25 + 0.55 * s.z * tw;
        ctx.fillStyle = `rgba(226,232,240,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * s.z, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  );
}

'use client';

import { useMemo } from 'react';
import Particles, { ParticlesProvider } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions } from '@tsparticles/engine';

const init = async (engine: Parameters<typeof loadSlim>[0]) => {
  await loadSlim(engine);
};

function ParticlesCanvas({ className, id = 'particles-canvas' }: { className?: string; id?: string }) {
  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      fpsLimit: 60,
      particles: {
        number: { value: 72, density: { enable: true } },
        color: { value: ['#F45100', '#F59E0B', '#FB923C', '#A8A29E'] },
        links: {
          color: '#F45100',
          distance: 140,
          enable: true,
          opacity: 0.25,
          width: 1,
        },
        move: {
          enable: true,
          speed: 0.8,
          direction: 'none',
          outModes: { default: 'bounce' },
        },
        opacity: { value: { min: 0.15, max: 0.55 } },
        size: { value: { min: 1, max: 3 } },
      },
      interactivity: {
        detectsOn: 'canvas',
        events: {
          onHover: { enable: true, mode: 'grab' },
          onClick: { enable: true, mode: 'push' },
          resize: { enable: true },
        },
        modes: {
          grab: { distance: 160, links: { opacity: 0.45 } },
          push: { quantity: 3 },
        },
      },
      detectRetina: true,
    }),
    []
  );

  return (
    <div className={className}>
      <Particles id={id} className="absolute inset-0" options={options} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgb(22_30_44_/6%),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background pointer-events-none" />
    </div>
  );
}

export function ParticlesBackground({ className, id }: { className?: string; id?: string }) {
  return (
    <ParticlesProvider init={init}>
      <ParticlesCanvas className={className} id={id} />
    </ParticlesProvider>
  );
}

import { Pane } from 'tweakpane';
import {
  DEFAULT_SETTINGS,
  RANGES,
  saveSettings,
  type Settings,
} from './lib/settings';
import type { Simulator } from './lib/simulator';

export function createPanel(settings: Settings, simulator: Simulator) {
  const container = document.getElementById('panel')!;
  const toggle = document.getElementById('panel-toggle')!;
  const pane = new Pane({ title: 'Controls', container });
  const stats = { fps: 0 };

  const simulation = pane.addFolder({ title: 'Simulation' });
  simulation.addBinding(settings, 'paused');
  simulation
    .addButton({ title: 'Randomize points' })
    .on('click', () => simulator.randomize());
  const fps = simulation.addBinding(stats, 'fps', {
    readonly: true,
    view: 'graph',
    min: 0,
    max: 150,
  });

  const particles = pane.addFolder({ title: 'Particles' });
  particles.addBinding(settings, 'density', RANGES.density);
  particles.addBinding(settings, 'maxSpeed', {
    ...RANGES.maxSpeed,
    label: 'speed',
  });
  particles.addBinding(settings, 'minRadius', {
    ...RANGES.minRadius,
    label: 'min radius',
  });
  particles.addBinding(settings, 'maxRadius', {
    ...RANGES.maxRadius,
    label: 'max radius',
  });
  particles.addBinding(settings, 'pointColor', { label: 'color' });

  const connections = pane.addFolder({ title: 'Connections' });
  connections.addBinding(settings, 'connectDistance', {
    ...RANGES.connectDistance,
    label: 'distance',
  });
  connections.addBinding(settings, 'fade', RANGES.fade);
  connections.addBinding(settings, 'lineWidth', {
    ...RANGES.lineWidth,
    label: 'width',
  });
  connections.addBinding(settings, 'lineColor', { label: 'color' });
  connections.addBinding(settings, 'additive', { label: 'glow' });

  const background = pane.addFolder({ title: 'Background' });
  background.addBinding(settings, 'backgroundInner', { label: 'center' });
  background.addBinding(settings, 'backgroundOuter', { label: 'edges' });

  pane.addButton({ title: 'Reset to defaults' }).on('click', () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    pane.refresh();
    saveSettings(settings);
  });

  pane.on('change', (event) => {
    // Monitors emit change on every poll, not only on user input
    if (event.target !== fps && event.last) {
      saveSettings(settings);
    }
  });

  const togglePanel = () => {
    container.hidden = !container.hidden;
    toggle.setAttribute('aria-expanded', String(!container.hidden));
  };
  toggle.addEventListener('click', togglePanel);
  window.addEventListener('keydown', (event) => {
    if (
      event.key.toLowerCase() !== 'h' ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.target instanceof HTMLInputElement
    ) {
      return;
    }
    togglePanel();
  });

  let frames = 0;
  let since = performance.now();
  const countFrames = (now: number) => {
    frames++;
    if (now - since >= 500) {
      stats.fps = Math.round((frames * 1000) / (now - since));
      frames = 0;
      since = now;
    }
    window.requestAnimationFrame(countFrames);
  };
  window.requestAnimationFrame(countFrames);
}

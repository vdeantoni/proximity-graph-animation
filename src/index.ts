import { loadSettings } from './lib/settings';
import { Simulator } from './lib/simulator';
import { createPanel } from './panel';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const settings = loadSettings();

const simulator = new Simulator(canvas, settings);
simulator.start();

canvas.addEventListener('pointermove', (event) => {
  simulator.setPointer(event.offsetX, event.offsetY);
});
canvas.addEventListener('pointerdown', (event) => {
  simulator.setPointer(event.offsetX, event.offsetY);
  simulator.shockwave(event.offsetX, event.offsetY);
});
canvas.addEventListener('pointerleave', () => simulator.clearPointer());
canvas.addEventListener('pointercancel', () => simulator.clearPointer());

createPanel(settings, simulator);

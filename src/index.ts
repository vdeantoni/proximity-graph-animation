import { loadSettings } from './lib/settings';
import { Simulator } from './lib/simulator';
import { createPanel } from './panel';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const settings = loadSettings();

const simulator = new Simulator(canvas, settings);
simulator.start();

createPanel(settings, simulator);

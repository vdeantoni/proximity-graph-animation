import { Simulator } from './lib/simulator';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const simulator = new Simulator(canvas);
simulator.start();

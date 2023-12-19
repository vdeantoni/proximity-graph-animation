import { Simulator } from './lib/simulator';
import './index.css';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const simulator = new Simulator(canvas);
simulator.start();

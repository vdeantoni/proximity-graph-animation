import { getRandomInRange } from "./lib/utils";
import { FPS } from "./lib/constants";
import { Simulator } from "./lib/simulator";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const simulator = new Simulator(canvas);
simulator.start();

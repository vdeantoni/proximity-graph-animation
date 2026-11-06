import { CONNECT_DISTANCE, DENSITY, FPS } from './constants';
import { Point } from './point';

const TIME_PER_FRAME = 1000 / FPS;

function wrap(value: number, size: number) {
  const span = size + 2 * CONNECT_DISTANCE;
  return (
    ((((value + CONNECT_DISTANCE) % span) + span) % span) - CONNECT_DISTANCE
  );
}

export class Simulator {
  private density: number;
  private points: Point[] = [];
  private last: number = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;

  constructor(private canvas: HTMLCanvasElement, { density = DENSITY } = {}) {
    this.density = density;
  }

  private getContext() {
    return this.canvas.getContext('2d')!;
  }

  public start = () => {
    window.requestAnimationFrame(this.loop);
  };

  private fit() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio;
    if (width === this.width && height === this.height && dpr === this.dpr) {
      return;
    }

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.getContext().setTransform(dpr, 0, 0, dpr, 0, 0);

    const margin = CONNECT_DISTANCE;
    const scaleX = (width + 2 * margin) / (this.width + 2 * margin);
    const scaleY = (height + 2 * margin) / (this.height + 2 * margin);
    this.points.forEach((point) => {
      point.x = (point.x + margin) * scaleX - margin;
      point.y = (point.y + margin) * scaleY - margin;
    });

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    const population = Math.round(
      ((width + 2 * margin) * (height + 2 * margin)) / (5000 / this.density),
    );
    this.points.length = Math.min(this.points.length, population);
    while (this.points.length < population) {
      this.points.push(
        Point.create(-margin, -margin, width + margin, height + margin),
      );
    }
  }

  private loop = (timestamp: number) => {
    const delta = !this.last ? 1 : (timestamp - this.last) / TIME_PER_FRAME;

    this.fit();

    const ctx = this.getContext();

    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackground();

    this.points.forEach((point) => {
      point.move(delta);
      point.x = wrap(point.x, this.width);
      point.y = wrap(point.y, this.height);
    });

    const connections = new Map<Point, Set<Point>>();
    this.points.forEach((point) => {
      this.processConnections(point, connections);
    });

    connections.forEach((others, point) => {
      others.forEach((other) => {
        this.drawConnection(point, other);
      });
    });

    this.points.forEach((point) => {
      this.drawPoint(point);
    });

    this.last = timestamp;

    window.requestAnimationFrame(this.loop);
  };

  private drawBackground() {
    const ctx = this.getContext();
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawPoint(point: Point) {
    const ctx = this.getContext();
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  private processConnections(
    point: Point,
    connections: Map<Point, Set<Point>>,
  ) {
    connections.set(point, new Set());

    for (let other of this.points) {
      if (point === other || connections.get(other)?.has(point)) {
        continue;
      }

      const cwr = point.x + CONNECT_DISTANCE;
      const cwl = point.x - CONNECT_DISTANCE;
      const cht = point.y - CONNECT_DISTANCE;
      const chb = point.y + CONNECT_DISTANCE;

      if (
        (cwr < this.width && other.x > cwr) ||
        (cwl >= 0 && other.x < cwl) ||
        (cht >= 0 && other.y < cht) ||
        (chb < this.height && other.y > chb)
      ) {
        continue;
      }

      const distance = point.distance(other);
      if (distance < CONNECT_DISTANCE) {
        connections.get(point)!.add(other);
      }
    }
  }

  private drawConnection(point: Point, other: Point) {
    const ctx = this.getContext();
    const distance = point.distance(other);

    ctx.beginPath();

    ctx.moveTo(point.x, point.y);
    ctx.lineTo(other.x, other.y);

    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.abs(
      distance / CONNECT_DISTANCE - 1,
    )})`;
    ctx.stroke();
  }
}

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
  private ctx: CanvasRenderingContext2D;
  private density: number;
  private points: Point[] = [];
  private last: number = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;

  constructor(private canvas: HTMLCanvasElement, { density = DENSITY } = {}) {
    this.ctx = canvas.getContext('2d')!;
    this.density = density;
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
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

    this.drawBackground();

    this.points.forEach((point) => {
      point.move(delta);
      point.x = wrap(point.x, this.width);
      point.y = wrap(point.y, this.height);
    });

    this.drawConnections();

    this.points.forEach((point) => {
      this.drawPoint(point);
    });

    this.last = timestamp;

    window.requestAnimationFrame(this.loop);
  };

  private drawBackground() {
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawPoint(point: Point) {
    const ctx = this.ctx;
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  private drawConnections() {
    const { ctx, points } = this;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      for (let j = i + 1; j < points.length; j++) {
        const other = points[j];

        if (
          Math.abs(other.x - point.x) >= CONNECT_DISTANCE ||
          Math.abs(other.y - point.y) >= CONNECT_DISTANCE
        ) {
          continue;
        }

        const distance = point.distance(other);
        if (distance >= CONNECT_DISTANCE) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(other.x, other.y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - distance / CONNECT_DISTANCE})`;
        ctx.stroke();
      }
    }
  }
}

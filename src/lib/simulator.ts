import { CONNECT_DISTANCE, DENSITY, FPS } from './constants';
import { Point } from './point';

const TIME_PER_FRAME = 1000 / FPS;

export class Simulator {
  private population: number;
  private points: Point[] = [];
  private last: number = 0;

  constructor(private canvas: HTMLCanvasElement, { density = DENSITY } = {}) {
    this.population =
      (this.canvas.width * this.canvas.height) / (5000 / density);
  }

  private getContext() {
    return this.canvas.getContext('2d')!;
  }

  public start = () => {
    window.requestAnimationFrame(this.loop);
  };

  private loop = (timestamp: number) => {
    const delta = !this.last ? 1 : (timestamp - this.last) / TIME_PER_FRAME;

    for (let i = this.points.length; i < this.population; i++) {
      this.points.push(Point.create(this.canvas.width, this.canvas.height));
    }

    const ctx = this.getContext();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawBackground();

    this.points.forEach((point) => {
      point.move(delta);

      if (point.x < -CONNECT_DISTANCE) {
        point.x = this.canvas.width + CONNECT_DISTANCE;
      } else if (point.x > this.canvas.width + CONNECT_DISTANCE) {
        point.x = -CONNECT_DISTANCE;
      }

      if (point.y < -CONNECT_DISTANCE) {
        point.y = this.canvas.height + CONNECT_DISTANCE;
      } else if (point.y > this.canvas.height + CONNECT_DISTANCE) {
        point.y = -CONNECT_DISTANCE;
      }
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
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
        (cwr < this.canvas.width && other.x > cwr) ||
        (cwl >= 0 && other.x < cwl) ||
        (cht >= 0 && other.y < cht) ||
        (chb < this.canvas.height && other.y > chb)
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

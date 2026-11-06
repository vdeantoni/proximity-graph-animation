import { CONNECT_DISTANCE, DENSITY, FPS, LINE_WIDTH } from './constants';
import { Point } from './point';

const TIME_PER_FRAME = 1000 / FPS;
const ALPHA_LEVELS = 32;
const STROKE_STYLES = Array.from(
  { length: ALPHA_LEVELS + 1 },
  (_, level) => `rgba(255, 255, 255, ${level / ALPHA_LEVELS})`,
);
// Cells are CONNECT_DISTANCE wide, so connected points share a cell or touch.
// Only half the neighbors are listed so each pair of cells is visited once.
const NEIGHBORS = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function wrap(value: number, size: number) {
  const span = size + 2 * CONNECT_DISTANCE;
  return (
    ((((value + CONNECT_DISTANCE) % span) + span) % span) - CONNECT_DISTANCE
  );
}

// Float rounding in wrap() can land a point just outside the grid
function cellIndex(value: number, count: number) {
  const index = Math.floor(value / CONNECT_DISTANCE) + 1;
  return Math.min(count - 1, Math.max(0, index));
}

function addConnection(paths: Path2D[], point: Point, other: Point) {
  const distance = point.distance(other);
  if (distance >= CONNECT_DISTANCE) {
    return;
  }

  const closeness = 1 - distance / CONNECT_DISTANCE;
  const level = Math.round(closeness * closeness * ALPHA_LEVELS);
  if (level > 0) {
    paths[level].moveTo(point.x, point.y);
    paths[level].lineTo(other.x, other.y);
  }
}

export class Simulator {
  private ctx: CanvasRenderingContext2D;
  private density: number;
  private points: Point[] = [];
  private cells: Point[][] = [];
  private cols = 0;
  private rows = 0;
  private last: number = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private background: CanvasGradient | string = 'black';

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
    this.ctx.lineWidth = Math.max(LINE_WIDTH, 1 / dpr);

    const cx = width / 2;
    const cy = height / 2;
    const background = this.ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.hypot(cx, cy),
    );
    background.addColorStop(0, '#0b1226');
    background.addColorStop(1, '#000');
    this.background = background;

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

    this.cols = Math.ceil((width + 2 * margin) / CONNECT_DISTANCE);
    this.rows = Math.ceil((height + 2 * margin) / CONNECT_DISTANCE);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);

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

    this.ctx.globalCompositeOperation = 'source-over';
    // drawPoint leaves globalAlpha at the last point's value
    this.ctx.globalAlpha = 1;
    this.drawBackground();

    this.points.forEach((point) => {
      point.move(delta);
      point.x = wrap(point.x, this.width);
      point.y = wrap(point.y, this.height);
    });

    this.ctx.globalCompositeOperation = 'lighter';
    this.drawConnections();

    this.points.forEach((point) => {
      this.drawPoint(point);
    });

    this.last = timestamp;

    window.requestAnimationFrame(this.loop);
  };

  private drawBackground() {
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawPoint(point: Point) {
    const ctx = this.ctx;
    ctx.fillStyle = point.color;
    ctx.globalAlpha = point.alpha;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  private drawConnections() {
    const { ctx, cells, cols, rows } = this;

    cells.forEach((cell) => {
      cell.length = 0;
    });
    this.points.forEach((point) => {
      cells[cellIndex(point.y, rows) * cols + cellIndex(point.x, cols)].push(
        point,
      );
    });

    const paths = STROKE_STYLES.map(() => new Path2D());

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];

        for (let i = 0; i < cell.length; i++) {
          for (let j = i + 1; j < cell.length; j++) {
            addConnection(paths, cell[i], cell[j]);
          }
        }

        for (const [dc, dr] of NEIGHBORS) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || c >= cols || r >= rows) {
            continue;
          }

          for (const point of cell) {
            for (const other of cells[r * cols + c]) {
              addConnection(paths, point, other);
            }
          }
        }
      }
    }

    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      ctx.strokeStyle = STROKE_STYLES[level];
      ctx.stroke(paths[level]);
    }
  }
}

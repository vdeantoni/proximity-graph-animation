import { FPS, type Settings } from './settings';
import { Point } from './point';

const TIME_PER_FRAME = 1000 / FPS;
const ALPHA_LEVELS = 32;
// Cells are as wide as the connect distance, so connected points share a cell
// or touch. Only half the neighbors are listed so each cell pair is visited once.
const NEIGHBORS = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function wrap(value: number, size: number, margin: number) {
  const span = size + 2 * margin;
  return ((((value + margin) % span) + span) % span) - margin;
}

// Float rounding in wrap() can land a point just outside the grid
function cellIndex(value: number, count: number, cellSize: number) {
  const index = Math.floor(value / cellSize) + 1;
  return Math.min(count - 1, Math.max(0, index));
}

function connectionLevel(
  point: Point,
  other: Point,
  maxDistance: number,
  fade: number,
) {
  const distance = point.distance(other);
  if (distance >= maxDistance) {
    return 0;
  }
  return Math.round((1 - distance / maxDistance) ** fade * ALPHA_LEVELS);
}

function createPaths() {
  return Array.from({ length: ALPHA_LEVELS + 1 }, () => new Path2D());
}

export class Simulator {
  private ctx: CanvasRenderingContext2D;
  private points: Point[] = [];
  private cells: number[][] = [];
  // links[a] holds [b, level, b, level, ...] for each connection to a later b
  private links: number[][] = [];
  private cols = 0;
  private rows = 0;
  private last: number = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private connectDistance = 0;
  private density = 0;
  private background: CanvasGradient | string = 'black';
  private backgroundKey = '';

  constructor(
    private canvas: HTMLCanvasElement,
    private settings: Settings,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  public start = () => {
    window.requestAnimationFrame(this.loop);
  };

  public randomize() {
    this.points.length = 0;
    this.populate();
  }

  private fit() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio;
    const { connectDistance, density } = this.settings;
    const resized =
      width !== this.width || height !== this.height || dpr !== this.dpr;
    if (
      !resized &&
      connectDistance === this.connectDistance &&
      density === this.density
    ) {
      return;
    }

    if (resized) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const oldMargin = this.connectDistance;
    const margin = connectDistance;
    const scaleX = (width + 2 * margin) / (this.width + 2 * oldMargin);
    const scaleY = (height + 2 * margin) / (this.height + 2 * oldMargin);
    this.points.forEach((point) => {
      point.x = (point.x + oldMargin) * scaleX - margin;
      point.y = (point.y + oldMargin) * scaleY - margin;
    });

    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.connectDistance = connectDistance;
    this.density = density;

    this.cols = Math.ceil((width + 2 * margin) / connectDistance);
    this.rows = Math.ceil((height + 2 * margin) / connectDistance);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);

    this.populate();
  }

  private populate() {
    const { width, height, connectDistance: margin, density } = this;
    const population = Math.round(
      ((width + 2 * margin) * (height + 2 * margin)) / (5000 / density),
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
    const { ctx, settings } = this;

    this.fit();

    ctx.globalCompositeOperation = 'source-over';
    // Connections and points leave globalAlpha below 1
    ctx.globalAlpha = 1;
    this.drawBackground();

    if (!settings.paused) {
      const step = delta * settings.maxSpeed;
      this.points.forEach((point) => {
        point.move(step);
        point.x = wrap(point.x, this.width, this.connectDistance);
        point.y = wrap(point.y, this.height, this.connectDistance);
      });
    }

    ctx.globalCompositeOperation = settings.additive
      ? 'lighter'
      : 'source-over';
    this.drawConnections();
    this.drawPoints();

    this.last = timestamp;

    window.requestAnimationFrame(this.loop);
  };

  private drawBackground() {
    const { ctx, width, height } = this;
    const { backgroundInner, backgroundOuter } = this.settings;

    const key = `${width}x${height} ${backgroundInner} ${backgroundOuter}`;
    if (key !== this.backgroundKey) {
      const cx = width / 2;
      const cy = height / 2;
      const background = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        Math.hypot(cx, cy),
      );
      background.addColorStop(0, backgroundInner);
      background.addColorStop(1, backgroundOuter);
      this.background = background;
      this.backgroundKey = key;
    }

    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, width, height);
  }

  private drawPoints() {
    const { ctx } = this;
    const { minRadius, maxRadius, pointColor } = this.settings;
    const largest = Math.max(minRadius, maxRadius);

    ctx.fillStyle = pointColor;
    this.points.forEach((point) => {
      const radius = minRadius + point.size * (maxRadius - minRadius);
      ctx.globalAlpha = radius / largest;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  private drawConnections() {
    const { ctx, cells, cols, rows, connectDistance, points, links } = this;
    const { fade, lineColor, lineWidth, triangles } = this.settings;

    cells.forEach((cell) => {
      cell.length = 0;
    });
    points.forEach((point, index) => {
      const row = cellIndex(point.y, rows, connectDistance);
      const col = cellIndex(point.x, cols, connectDistance);
      cells[row * cols + col].push(index);
    });

    if (triangles) {
      while (links.length < points.length) {
        links.push([]);
      }
      links.forEach((link) => {
        link.length = 0;
      });
    }

    const paths = createPaths();
    const connect = (a: number, b: number) => {
      const point = points[a];
      const other = points[b];
      const level = connectionLevel(point, other, connectDistance, fade);
      if (level > 0) {
        paths[level].moveTo(point.x, point.y);
        paths[level].lineTo(other.x, other.y);
        if (triangles) {
          links[Math.min(a, b)].push(Math.max(a, b), level);
        }
      }
    };

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];

        for (let i = 0; i < cell.length; i++) {
          for (let j = i + 1; j < cell.length; j++) {
            connect(cell[i], cell[j]);
          }
        }

        for (const [dc, dr] of NEIGHBORS) {
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || c >= cols || r >= rows) {
            continue;
          }

          for (const a of cell) {
            for (const b of cells[r * cols + c]) {
              connect(a, b);
            }
          }
        }
      }
    }

    if (triangles) {
      this.fillTriangles();
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(lineWidth, 1 / this.dpr);
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      ctx.globalAlpha = level / ALPHA_LEVELS;
      ctx.stroke(paths[level]);
    }
  }

  private fillTriangles() {
    const { ctx, points, links } = this;
    const { triangleColor, triangleOpacity, triangleShade } = this.settings;
    const paths = createPaths();

    // Each triangle is found once, from its lowest index a through b < c
    for (let a = 0; a < points.length; a++) {
      const linksA = links[a];
      for (let i = 0; i < linksA.length; i += 2) {
        const b = linksA[i];
        const linksB = links[b];
        for (let j = 0; j < linksB.length; j += 2) {
          const c = linksB[j];
          let k = 0;
          while (k < linksA.length && linksA[k] !== c) {
            k += 2;
          }
          if (k === linksA.length) {
            continue;
          }

          const ab = linksA[i + 1];
          const bc = linksB[j + 1];
          const ac = linksA[k + 1];
          const level =
            triangleShade === 'weakest'
              ? Math.min(ab, bc, ac)
              : Math.round((ab + bc + ac) / 3);

          const p = points[a];
          let q = points[b];
          let r = points[c];
          // Overlapping triangles cancel out under the nonzero fill rule unless
          // they all wind the same way
          if ((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) < 0) {
            [q, r] = [r, q];
          }
          paths[level].moveTo(p.x, p.y);
          paths[level].lineTo(q.x, q.y);
          paths[level].lineTo(r.x, r.y);
          paths[level].closePath();
        }
      }
    }

    ctx.fillStyle = triangleColor;
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      ctx.globalAlpha = (level / ALPHA_LEVELS) * triangleOpacity;
      ctx.fill(paths[level]);
    }
  }
}

import Delaunator from 'delaunator';
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

interface TriangleFade {
  a: number;
  b: number;
  c: number;
  opacity: number;
  frame: number;
}

type TriangleVisitor = (
  a: number,
  b: number,
  c: number,
  ab: number,
  bc: number,
  ac: number,
) => void;

// Point indices stay below 2^17, so a triangle's three pack exactly into a key
const INDEX_LIMIT = 2 ** 17;

export class Simulator {
  private ctx: CanvasRenderingContext2D;
  private points: Point[] = [];
  private cells: number[][] = [];
  // links[a] holds [b, level, b, level, ...] for each connection to a later b
  private links: number[][] = [];
  private fades = new Map<number, TriangleFade>();
  private coords = new Float64Array(0);
  private delaunay?: Delaunator<Float64Array>;
  private frame = 0;
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
    this.fades.clear();
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
    this.drawConnections(delta);
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

  private drawConnections(delta: number) {
    const { ctx, cells, cols, rows, connectDistance, points, links } = this;
    const { fade, lineColor, lineWidth, triangles, triangleStyle } =
      this.settings;
    const recordLinks = triangles && triangleStyle === 'overlapping';

    cells.forEach((cell) => {
      cell.length = 0;
    });
    points.forEach((point, index) => {
      const row = cellIndex(point.y, rows, connectDistance);
      const col = cellIndex(point.x, cols, connectDistance);
      cells[row * cols + col].push(index);
    });

    if (recordLinks) {
      while (links.length < points.length) {
        links.push([]);
      }
      links.forEach((link) => {
        link.length = 0;
      });
    }

    const paths = Array.from({ length: ALPHA_LEVELS + 1 }, () => new Path2D());
    const connect = (a: number, b: number) => {
      const point = points[a];
      const other = points[b];
      const level = connectionLevel(point, other, connectDistance, fade);
      if (level > 0) {
        paths[level].moveTo(point.x, point.y);
        paths[level].lineTo(other.x, other.y);
        if (recordLinks) {
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
      this.fillTriangles(delta);
    } else {
      this.fades.clear();
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(lineWidth, 1 / this.dpr);
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      ctx.globalAlpha = level / ALPHA_LEVELS;
      ctx.stroke(paths[level]);
    }
  }

  private fillTriangles(delta: number) {
    const { ctx, points, fades } = this;
    const {
      triangleColor,
      triangleOpacity,
      triangleShade,
      triangleStyle,
      triangleTransition,
    } = this.settings;
    const frame = ++this.frame;
    // Exponential easing that covers about 95% of the way in triangleTransition ms
    const ease =
      triangleTransition > 0
        ? 1 - Math.exp((-3 * delta * TIME_PER_FRAME) / triangleTransition)
        : 1;

    const show: TriangleVisitor = (a, b, c, ab, bc, ac) => {
      const level =
        triangleShade === 'weakest' ? Math.min(ab, bc, ac) : (ab + bc + ac) / 3;
      const key = (a * INDEX_LIMIT + b) * INDEX_LIMIT + c;
      let fade = fades.get(key);
      if (!fade) {
        fade = { a, b, c, opacity: 0, frame };
        fades.set(key, fade);
      }
      fade.frame = frame;
      fade.opacity += (level / ALPHA_LEVELS - fade.opacity) * ease;
    };
    if (triangleStyle === 'mosaic') {
      this.findMosaicTriangles(show);
    } else {
      this.findOverlappingTriangles(show);
    }

    const maxEdge = 2 * this.connectDistance;
    ctx.fillStyle = triangleColor;
    // One fill per triangle, so overlaps always add up the same way
    fades.forEach((fade, key) => {
      if (fade.frame !== frame && fade.c >= points.length) {
        fades.delete(key);
        return;
      }

      const p = points[fade.a];
      const q = points[fade.b];
      const r = points[fade.c];
      if (fade.frame !== frame) {
        fade.opacity -= fade.opacity * ease;
        // A vertex that wrapped to the far side would stretch it across the screen
        if (
          fade.opacity < 0.002 ||
          p.distance(q) > maxEdge ||
          q.distance(r) > maxEdge ||
          p.distance(r) > maxEdge
        ) {
          fades.delete(key);
          return;
        }
      }

      ctx.globalAlpha = fade.opacity * triangleOpacity;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(r.x, r.y);
      ctx.fill();
    });
  }

  // Every mutually connected triple, found once from its lowest index a via b < c
  private findOverlappingTriangles(show: TriangleVisitor) {
    const { points, links } = this;

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
          if (k < linksA.length) {
            show(a, b, c, linksA[i + 1], linksB[j + 1], linksA[k + 1]);
          }
        }
      }
    }
  }

  // Delaunay triangles whose edges are all connections. They never overlap and
  // number at most two per point, however dense the graph gets.
  private findMosaicTriangles(show: TriangleVisitor) {
    const { points, connectDistance } = this;
    const { fade } = this.settings;

    if (this.coords.length !== 2 * points.length) {
      this.coords = new Float64Array(2 * points.length);
      this.delaunay = undefined;
    }
    const coords = this.coords;
    points.forEach((point, i) => {
      coords[2 * i] = point.x;
      coords[2 * i + 1] = point.y;
    });
    if (this.delaunay) {
      this.delaunay.update();
    } else {
      this.delaunay = new Delaunator(coords);
    }

    const { triangles } = this.delaunay;
    for (let t = 0; t < triangles.length; t += 3) {
      let a = triangles[t];
      let b = triangles[t + 1];
      let c = triangles[t + 2];
      if (a > b) [a, b] = [b, a];
      if (b > c) [b, c] = [c, b];
      if (a > b) [a, b] = [b, a];

      const ab = connectionLevel(points[a], points[b], connectDistance, fade);
      const bc = connectionLevel(points[b], points[c], connectDistance, fade);
      const ac = connectionLevel(points[a], points[c], connectDistance, fade);
      if (ab > 0 && bc > 0 && ac > 0) {
        show(a, b, c, ab, bc, ac);
      }
    }
  }
}

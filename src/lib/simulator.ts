import Delaunator from 'delaunator';
import { FPS, type Settings } from './settings';
import { Point } from './point';

const TIME_PER_FRAME = 1000 / FPS;
const ALPHA_LEVELS = 32;
// Push velocity keeps this share per reference frame, settling in about a second
const PUSH_DECAY = 0.95;
// Inward pull mixed into the vortex swirl so points orbit instead of flying off
const VORTEX_PULL = 0.35;
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

function levelAt(distance: number, maxDistance: number, fade: number) {
  if (distance >= maxDistance) {
    return 0;
  }
  return Math.round((1 - distance / maxDistance) ** fade * ALPHA_LEVELS);
}

function connectionLevel(
  point: Point,
  other: Point,
  maxDistance: number,
  fade: number,
) {
  return levelAt(point.distance(other), maxDistance, fade);
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  hit: Set<Point>;
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
  private pointer: { x: number; y: number } | null = null;
  private waves: Shockwave[] = [];
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

  public setPointer(x: number, y: number) {
    this.pointer = { x, y };
  }

  public clearPointer() {
    this.pointer = null;
  }

  public shockwave(x: number, y: number) {
    if (this.settings.shockwave) {
      this.waves.push({ x, y, radius: 0, hit: new Set() });
    }
  }

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
      // After a long pause (hidden tab) forces would otherwise act for minutes
      const pushDelta = Math.min(delta, 4);
      this.applyPointerForce(pushDelta);
      this.updateShockwaves(delta);

      const step = delta * settings.maxSpeed;
      const pushDecay = PUSH_DECAY ** pushDelta;
      this.points.forEach((point) => {
        point.move(step, pushDelta, pushDecay);
        point.x = wrap(point.x, this.width, this.connectDistance);
        point.y = wrap(point.y, this.height, this.connectDistance);
      });
    }

    ctx.globalCompositeOperation = settings.additive
      ? 'lighter'
      : 'source-over';
    this.drawConnections(delta);
    this.drawPoints();
    this.drawShockwaves();

    this.last = timestamp;

    window.requestAnimationFrame(this.loop);
  };

  private applyPointerForce(delta: number) {
    const { pointer } = this;
    const { mouseMode, mouseRadius, mouseStrength } = this.settings;
    if (!pointer || mouseMode === 'off') {
      return;
    }

    this.points.forEach((point) => {
      const dx = pointer.x - point.x;
      const dy = pointer.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= mouseRadius || distance < 1) {
        return;
      }

      // Scaled by 1 / distance so dx and dy act as a unit direction
      const force =
        (mouseStrength * (1 - distance / mouseRadius) ** 2 * delta) / distance;
      if (mouseMode === 'attract') {
        point.pushX += dx * force;
        point.pushY += dy * force;
      } else if (mouseMode === 'repel') {
        point.pushX -= dx * force;
        point.pushY -= dy * force;
      } else {
        point.pushX += (-dy + dx * VORTEX_PULL) * force;
        point.pushY += (dx + dy * VORTEX_PULL) * force;
      }
    });
  }

  // Each wave kicks a point once, when its ring first covers it. Tracking hits
  // matters because a kicked point can move ahead of the ring into its next band.
  private updateShockwaves(delta: number) {
    const { shockwaveReach, shockwaveSpeed, shockwaveStrength } = this.settings;

    this.waves = this.waves.filter((wave) => {
      const to = Math.min(
        shockwaveReach,
        wave.radius + (shockwaveSpeed * delta * TIME_PER_FRAME) / 1000,
      );
      const kick = shockwaveStrength * (1 - to / shockwaveReach);

      this.points.forEach((point) => {
        const dx = point.x - wave.x;
        const dy = point.y - wave.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < to && distance > 0 && !wave.hit.has(point)) {
          wave.hit.add(point);
          point.pushX += (dx / distance) * kick;
          point.pushY += (dy / distance) * kick;
        }
      });

      wave.radius = to;
      return to < shockwaveReach;
    });
  }

  // Multiplier for line and triangle opacity around the cursor
  private flashlight(x: number, y: number) {
    const { pointer } = this;
    const { flashlight, flashlightRadius, flashlightBoost } = this.settings;
    if (!pointer || !flashlight) {
      return 1;
    }

    const distance = Math.sqrt((x - pointer.x) ** 2 + (y - pointer.y) ** 2);
    if (distance >= flashlightRadius) {
      return 1;
    }
    return 1 + flashlightBoost * (1 - distance / flashlightRadius) ** 2;
  }

  private drawShockwaves() {
    const { ctx, waves } = this;
    const { shockwaveReach, lineColor } = this.settings;

    ctx.strokeStyle = lineColor;
    waves.forEach((wave) => {
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - wave.radius / shockwaveReach));
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, 2 * Math.PI);
      ctx.stroke();
    });
  }

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
    const {
      fade,
      lineColor,
      lineWidth,
      triangles,
      triangleStyle,
      cursorLinks,
    } = this.settings;
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
    const addLine = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      level: number,
    ) => {
      const lit = Math.round(
        level * this.flashlight((ax + bx) / 2, (ay + by) / 2),
      );
      const path = paths[Math.min(ALPHA_LEVELS, lit)];
      path.moveTo(ax, ay);
      path.lineTo(bx, by);
    };
    const connect = (a: number, b: number) => {
      const point = points[a];
      const other = points[b];
      const level = connectionLevel(point, other, connectDistance, fade);
      if (level > 0) {
        addLine(point.x, point.y, other.x, other.y, level);
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

    const { pointer } = this;
    if (pointer && cursorLinks) {
      points.forEach((point) => {
        const distance = Math.sqrt(
          (point.x - pointer.x) ** 2 + (point.y - pointer.y) ** 2,
        );
        const level = levelAt(distance, connectDistance, fade);
        if (level > 0) {
          addLine(pointer.x, pointer.y, point.x, point.y, level);
        }
      });
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

      const lit = this.flashlight((p.x + q.x + r.x) / 3, (p.y + q.y + r.y) / 3);
      ctx.globalAlpha = Math.min(1, fade.opacity * triangleOpacity * lit);
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

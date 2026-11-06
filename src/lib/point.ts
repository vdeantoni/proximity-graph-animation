import { MAX_SPEED, MAX_RADIUS, MIN_RADIUS } from './constants';

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export class Point {
  constructor(
    public x: number,
    public y: number,
    private vx: number,
    private vy: number,
    public radius: number,
    public color: string,
  ) {}

  public move = (delta: number) => {
    this.x += this.vx * delta;
    this.y += this.vy * delta;
  };

  public distance = (other: Point) => {
    return Math.sqrt((other.x - this.x) ** 2 + (other.y - this.y) ** 2);
  };

  public static create(minX: number, minY: number, maxX: number, maxY: number) {
    const angle = random(0, 2 * Math.PI);
    // sqrt spreads velocities evenly over the disk instead of bunching slow ones
    const speed = MAX_SPEED * Math.sqrt(Math.random());
    return new Point(
      random(minX, maxX),
      random(minY, maxY),
      speed * Math.cos(angle),
      speed * Math.sin(angle),
      random(MIN_RADIUS, MAX_RADIUS),
      'white',
    );
  }
}

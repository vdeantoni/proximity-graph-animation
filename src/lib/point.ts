function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export class Point {
  constructor(
    public x: number,
    public y: number,
    private vx: number,
    private vy: number,
    public size: number,
  ) {}

  public move(step: number) {
    this.x += this.vx * step;
    this.y += this.vy * step;
  }

  public distance(other: Point) {
    return Math.sqrt((other.x - this.x) ** 2 + (other.y - this.y) ** 2);
  }

  // Velocity and size are normalized to 0..1 so speed and radius settings
  // apply to existing points without respawning them
  public static create(minX: number, minY: number, maxX: number, maxY: number) {
    const angle = random(0, 2 * Math.PI);
    // sqrt spreads velocities evenly over the disk instead of bunching slow ones
    const speed = Math.sqrt(Math.random());
    return new Point(
      random(minX, maxX),
      random(minY, maxY),
      speed * Math.cos(angle),
      speed * Math.sin(angle),
      Math.random(),
    );
  }
}

import { getRandomInRange } from "./utils";
import { MAX_SPEED, MAX_RADIUS, MIN_RADIUS } from "./constants";

export class Point {
  constructor(
    public x: number,
    public y: number,
    private vx: number,
    private vy: number,
    public radius: number,
    public color: string
  ) {}

  public move = (delta: number) => {
    this.x += this.vx * delta;
    this.y += this.vy * delta;
  };

  public distance = (other: Point) => {
    return Math.sqrt((other.x - this.x) ** 2 + (other.y - this.y) ** 2);
  };

  public static create(w: number, h: number) {
    return new Point(
      getRandomInRange(0, w),
      getRandomInRange(0, h),
      getRandomInRange(-MAX_SPEED, MAX_SPEED),
      getRandomInRange(-MAX_SPEED, MAX_SPEED),
      getRandomInRange(MIN_RADIUS, MAX_RADIUS),
      "white"
    );
  }
}

import { random } from "lodash";
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
      random(0, w),
      random(0, h),
      random(-MAX_SPEED, MAX_SPEED),
      random(-MAX_SPEED, MAX_SPEED),
      random(MIN_RADIUS, MAX_RADIUS),
      "white"
    );
  }
}

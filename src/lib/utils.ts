export const getRandomInRange = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
};

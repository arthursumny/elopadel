export type AttendancePenalty = {
  mmrLoss: number;
  pointsLoss: number;
  suspensionDays: number;
};

export function noShowPenalty(strike: number): AttendancePenalty {
  if (strike <= 1) return { mmrLoss: 100, pointsLoss: 25, suspensionDays: 1 };
  if (strike === 2) return { mmrLoss: 150, pointsLoss: 40, suspensionDays: 7 };
  return { mmrLoss: 200, pointsLoss: 60, suspensionDays: 30 };
}

export function applyRankPenalty(currentTierOrder: number, currentPoints: number, pointsLoss: number) {
  let tierOrder = currentTierOrder;
  let points = currentPoints - pointsLoss;
  while (points < 0 && tierOrder > 0) {
    tierOrder -= 1;
    points += 100;
  }
  return { tierOrder, points: Math.max(0, points) };
}

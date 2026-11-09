// One-level practice undo: snapshots are independent of the live simulation.
// Ball records are flat physics objects; copy the full record to retain cue spin.
export function savePracticeShot({ balls, shots, potted, aimX, aimZ, fineAimSteps, cueSpin, power }) {
  return {
    balls: balls.map((ball) => ({ ...ball })),
    shots, potted, aimX, aimZ, fineAimSteps, cueSpin, power,
  };
}

export function restorePracticeShot(snapshot) {
  return {
    ...snapshot,
    balls: snapshot.balls.map((ball) => ({ ...ball })),
  };
}

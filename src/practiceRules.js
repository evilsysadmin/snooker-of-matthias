import { TABLE, COLOUR_SPOTS, ballsMoving } from './physics.js';

// Free-practice progression, not an official turn or foul rules engine.
// Colours return while ANY red remains at the end of the shot. With no reds,
// all six colours can finally stay down, so a complete clearance is possible.
export function redsOnTable(balls) {
  return balls.some((b) => b.id >= 1 && b.id <= 15 && !b.pocketed);
}

export function remainingObjectBalls(balls) {
  return balls.filter((b) => b.id >= 1 && b.id <= 21 && !b.pocketed).length;
}

const REQUIRED_SEPARATION = TABLE.ballRadius * 2 + 0.004;

function legalRespot(balls, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) ||
      Math.abs(x) > TABLE.halfX - TABLE.ballRadius ||
      Math.abs(z) > TABLE.halfZ - TABLE.ballRadius) return false;
  return balls.every((b) => b.pocketed ||
    Math.hypot(b.x - x, b.z - z) >= REQUIRED_SEPARATION - 1e-9);
}

function findFreeRespot(balls, ownSpot) {
  // Own mark first, then the highest available coloured mark.
  const spots = [ownSpot, ...COLOUR_SPOTS
    .filter((spot) => spot.id !== ownSpot.id)
    .sort((a, b) => b.id - a.id)];
  for (const spot of spots) {
    if (legalRespot(balls, spot.x, spot.z)) {
      return { x: spot.x, z: spot.z, location: spot.id === ownSpot.id ? 'own' : 'other' };
    }
  }

  // All six marks obstructed: a deterministic near-spot search along
  // the same horizontal line, moving towards black then towards baulk.
  // No forced overlaps or teleports onto an occupied ball.
  for (let step = 1; step <= Math.ceil(2 * TABLE.halfX / 0.02); step++) {
    const offset = step * 0.02;
    for (const direction of [1, -1]) {
      const x = ownSpot.x + direction * offset;
      if (legalRespot(balls, x, ownSpot.z)) {
        return { x, z: ownSpot.z, location: 'line' };
      }
    }
  }
  return null;
}

export function respotPracticeColours(balls) {
  if (ballsMoving(balls) || !redsOnTable(balls)) return [];
  const restored = [];
  // Higher-value colours take priority when several colours need a mark.
  for (const spot of [...COLOUR_SPOTS].reverse()) {
    const ball = balls.find((b) => b.id === spot.id);
    if (!ball?.pocketed) continue;
    const position = findFreeRespot(balls, spot);
    if (!position) continue; // Keep pocketed, never overlap other balls.
    Object.assign(ball, { x: position.x, z: position.z,
      vx: 0, vz: 0, pocketed: false });
    restored.push({ type: 'respot', id: ball.id, ...position });
  }
  return restored;
}

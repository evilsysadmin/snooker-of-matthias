import { OBJECT_BALL_COUNT } from './physics.js';

// Pool 8-ball free practice: each of the 15 numbered balls stays pocketed.
// This is deliberately not a turn, foul or official game-winner rules engine.
export function remainingObjectBalls(balls) {
  return balls.filter((ball) =>
    ball.id >= 1 && ball.id <= OBJECT_BALL_COUNT && !ball.pocketed).length;
}

export function isTableCleared(balls) {
  return remainingObjectBalls(balls) === 0;
}

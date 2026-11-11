// Deterministic two-player local 8-ball referee. Pure and DOM-free: the
// physics reports actual contacts, rail hits and indexed pockets; no LLM
// guesses about what happened on the table.
//
// Explicit friendly house rules (not a WPA-certified ruleset):
// - Groups are assigned on the first clean post-break shot with pots from
//   just one group (mixed pots leave the table open).
// - A legal stroke must first touch its own group (or 8 after clearing),
//   then pot a ball or send at least one ball to a rail.
// - Opening break: pot a ball or drive four distinct objects to rails;
//   eight on the break reracks automatically rather than declaring a loss.
// - To win, enter a called pocket for the 8, with all own objects cleared
//   *before* the stroke. Early, wrong-pocket or scratched 8 loses.

export function groupForBall(id) {
  return Number.isInteger(id) && id >= 1 && id <= 7 ? 'solids' :
    Number.isInteger(id) && id >= 9 && id <= 15 ? 'stripes' : null;
}

export function newEightBallMatch() {
  return {
    player: 0,
    groups: [null, null],
    breakShot: true,
    ballInHand: false,
    winner: null,
    shots: 0,
    rerack: false,
    last: { kind: 'ready', reason: 'Saque inicial: jugador 1', potted: [] },
  };
}

function finished(match, player, groups, shots, winner, kind, reason, potted) {
  return {
    ...match,
    player,
    groups,
    breakShot: false,
    ballInHand: kind === 'foul',
    winner,
    shots,
    rerack: false,
    last: { kind, reason, potted },
  };
}

export function adjudicateEightBallShot(match, ballsBefore, events, { calledPocket = null } = {}) {
  if (!match || match.winner !== null || !Array.isArray(match.groups) ||
      !Array.isArray(ballsBefore) || !Array.isArray(events) ||
      ![0, 1].includes(match.player)) {
    throw new TypeError('Invalid or finished 8-ball match');
  }

  const actor = match.player;
  const other = 1 - actor;
  const shots = match.shots + 1;
  const firstContactIndex = events.findIndex((e) =>
    e.type === 'contact' && (e.a === 0 || e.b === 0) &&
    ((e.a === 0 ? e.b : e.a) > 0));
  const firstHit = firstContactIndex === -1 ? null :
    (events[firstContactIndex].a === 0 ? events[firstContactIndex].b : events[firstContactIndex].a);
  const pocketEvents = events.filter((e) => e.type === 'potted' &&
    Number.isInteger(e.id) && e.id >= 1 && e.id <= 15);
  const pots = [...new Set(pocketEvents.map((e) => e.id))];
  const scratch = events.some((e) => e.type === 'scratch');
  const eight = pocketEvents.find((e) => e.id === 8);
  const afterFirstContact = firstContactIndex === -1 ? [] : events.slice(firstContactIndex + 1);
  const railAfter = afterFirstContact.some((e) => e.type === 'rail');
  const somethingPotted = pots.length > 0;
  const groups = [...match.groups];

  if (match.breakShot) {
    if (eight) {
      return {
        ...newEightBallMatch(),
        player: scratch ? other : actor,
        shots,
        rerack: true,
        last: {
          kind: 'rerack', reason: scratch
            ? 'Negra y blanca en el saque: repite el rival'
            : 'Negra en el saque: nueva apertura',
          potted: pots,
        },
      };
    }
    const railedObjects = new Set(afterFirstContact
      .filter((e) => e.type === 'rail' && e.id >= 1 && e.id <= 15)
      .map((e) => e.id));
    let reason = null;
    if (scratch) reason = 'Blanca embocada en el saque';
    else if (firstHit === null) reason = 'Saque sin contacto';
    else if (!somethingPotted && railedObjects.size < 4)
      reason = 'Saque ilegal: menos de cuatro bolas a banda';
    if (reason) return finished(match, other, groups, shots, null, 'foul', reason, pots);
    if (somethingPotted)
      return finished(match, actor, groups, shots, null, 'keep', 'Saque válido: continúa', pots);
    return finished(match, other, groups, shots, null, 'pass', 'Saque válido: cambia el turno', pots);
  }

  const mine = groups[actor];
  const myBallsBefore = mine === null ? 0 : ballsBefore
    .filter((b) => !b.pocketed && groupForBall(b.id) === mine).length;
  let reason = null;
  if (scratch) reason = 'Blanca embocada';
  else if (firstHit === null) reason = 'Sin contacto con una bola objetivo';
  else if (mine === null && firstHit === 8)
    reason = 'La negra no puede tocarse primero con mesa abierta';
  else if (mine !== null && myBallsBefore > 0 && groupForBall(firstHit) !== mine)
    reason = 'Primera bola incorrecta';
  else if (mine !== null && myBallsBefore === 0 && firstHit !== 8)
    reason = 'Debes atacar la negra';
  else if (!somethingPotted && !railAfter)
    reason = 'Sin banda ni embocada tras el contacto';

  if (eight) {
    const correctlyCalled = Number.isInteger(calledPocket) &&
      calledPocket >= 0 && calledPocket <= 5 && calledPocket === eight.pocket;
    if (!reason && mine !== null && myBallsBefore === 0 && correctlyCalled) {
      return finished(match, actor, groups, shots, actor, 'win', 'Negra legal: victoria', pots);
    }
    return finished(match, other, groups, shots, other, 'loss',
      reason || (mine === null || myBallsBefore > 0
        ? 'Negra embocada antes de limpiar tu grupo'
        : 'Negra en tronera no anunciada'), pots);
  }

  if (reason) return finished(match, other, groups, shots, null, 'foul', reason, pots);

  // Do not assign groups on a mixed pot or on the opening break. This
  // avoids arbitrary assignment from physical integration event order.
  const pottedGroups = [...new Set(pots.map(groupForBall).filter(Boolean))];
  if (mine === null && pottedGroups.length === 1) {
    groups[actor] = pottedGroups[0];
    groups[other] = pottedGroups[0] === 'solids' ? 'stripes' : 'solids';
    return finished(match, actor, groups, shots, null, 'keep',
      groups[actor] === 'solids' ? 'Lisas asignadas: continúas' : 'Rayadas asignadas: continúas', pots);
  }
  const ownPot = mine !== null && pots.some((id) => groupForBall(id) === mine);
  if (ownPot)
    return finished(match, actor, groups, shots, null, 'keep', 'Emboque válido: continúas', pots);
  if (mine === null && pottedGroups.length > 1)
    return finished(match, other, groups, shots, null, 'pass',
      'Mesa abierta: lisas y rayadas embocadas juntas', pots);
  return finished(match, other, groups, shots, null, 'pass', 'Cambio de turno', pots);
}

// A compact, factual result for the shot that has just stopped. Keep this
// separate from Matthias's flavour text: the result must reflect only the
// physics events, including a scratch that happened alongside a pot.
export function describeShotSummary({ pottedIds = [], scratch = false } = {}) {
  if (!Array.isArray(pottedIds) || typeof scratch !== 'boolean')
    throw new TypeError('Invalid shot summary');
  const unique = new Set(pottedIds);
  if (unique.size !== pottedIds.length ||
      pottedIds.some((id) => !Number.isInteger(id) || id < 1 || id > 15))
    throw new TypeError('Shot summaries require unique pool-ball ids');

  const count = unique.size;
  if (scratch)
    return {
      kind: 'scratch',
      label: count ? 'FALTA · blanca dentro · +' + count : 'FALTA · blanca dentro',
      detail: count ? count + ' embocada' + (count === 1 ? '' : 's') : 'sin embocadas',
    };
  if (count > 1)
    return { kind: 'multi', label: 'DOBLETE · +' + count, detail: count + ' embocadas' };
  if (count === 1)
    return { kind: 'pot', label: 'EMBOCADA · +1', detail: 'una bola dentro' };
  return { kind: 'miss', label: 'SIN EMBOCAR', detail: 'ninguna bola dentro' };
}

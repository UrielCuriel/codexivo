const distance = (a: string, b: string): number => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length]!;
};

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El nombre más parecido a `name` entre `candidates`, si hay uno razonablemente cerca. */
export const suggestName = (name: string, candidates: Iterable<string>): string | undefined => {
  const target = fold(name);
  const limit = target.length <= 3 ? 1 : 2;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of new Set(candidates)) {
    if (candidate === name) continue;
    const current = distance(target, fold(candidate));
    if (current <= limit && current < bestDistance) {
      best = candidate;
      bestDistance = current;
    }
  }
  return best;
};

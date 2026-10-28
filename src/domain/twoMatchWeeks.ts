/** Deterministic display/preview checksum, never an authorization token. */
export function scheduleKey(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Split a graph into groups with at most two incident edges per player.
 * Add dummy edges to make degrees even and equal, orient Euler circuits, then
 * take perfect matchings in the resulting regular bipartite graph. Removing
 * dummy edges produces ordinary byes, not an artificial catch-up week.
 */
export function twoMatchFactors<T extends { homeId: string; awayId: string; id: string }>(
  matches: T[],
  participantIds: string[],
  salt: number,
): T[][] {
  if (!matches.length) return [];
  const ids = [...participantIds].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const edges = matches.map((match, original) => ({
    a: index.get(match.homeId)!,
    b: index.get(match.awayId)!,
    original,
  }));
  const degree = ids.map(() => 0);
  for (const edge of edges) {
    degree[edge.a]++;
    degree[edge.b]++;
  }
  const target = Math.ceil(Math.max(...degree) / 2) * 2;
  const deficit = degree.map((d) => target - d);
  const rank = ids.map((id) => scheduleKey(`${salt}/${id}`));
  while (deficit.some((d) => d > 0)) {
    const spare = ids
      .map((_, i) => i)
      .filter((i) => deficit[i] > 0)
      .sort((a, b) => deficit[b] - deficit[a] || rank[a].localeCompare(rank[b]));
    const a = spare[0],
      b = spare[1] ?? a;
    edges.push({ a, b, original: -1 });
    deficit[a]--;
    deficit[b]--;
  }
  const adjacent = ids.map(() => [] as number[]);
  edges.forEach((edge, i) => {
    adjacent[edge.a].push(i);
    adjacent[edge.b].push(i);
  });
  for (const list of adjacent)
    list.sort((a, b) => scheduleKey(`${salt}/${a}`).localeCompare(scheduleKey(`${salt}/${b}`)));
  const used = new Set<number>();
  const outgoing = ids.map(() => [] as { to: number; edge: number }[]);
  for (let root = 0; root < ids.length; root++) {
    const stack = [root];
    while (stack.length) {
      const a = stack.at(-1)!;
      while (adjacent[a].length && used.has(adjacent[a].at(-1)!)) adjacent[a].pop();
      const edge = adjacent[a].pop();
      if (edge === undefined) {
        stack.pop();
        continue;
      }
      used.add(edge);
      const b = edges[edge].a === a ? edges[edge].b : edges[edge].a;
      outgoing[a].push({ to: b, edge });
      stack.push(b);
    }
  }
  const factors: T[][] = [];
  for (let round = 0; round < target / 2; round++) {
    const right = ids.map(() => -1);
    const chosen = ids.map(() => -1);
    function augment(left: number, seen: Set<number>): boolean {
      for (const option of outgoing[left]) {
        if (seen.has(option.to)) continue;
        seen.add(option.to);
        if (right[option.to] === -1 || augment(right[option.to], seen)) {
          right[option.to] = left;
          chosen[left] = option.edge;
          return true;
        }
      }
      return false;
    }
    for (let left = 0; left < ids.length; left++) {
      if (!augment(left, new Set())) throw new Error('Could not construct a balanced schedule.');
    }
    const real: T[] = [];
    chosen.forEach((edge, left) => {
      outgoing[left] = outgoing[left].filter((option) => option.edge !== edge);
      if (edges[edge].original >= 0) real.push(matches[edges[edge].original]);
    });
    factors.push(real);
  }
  return factors;
}

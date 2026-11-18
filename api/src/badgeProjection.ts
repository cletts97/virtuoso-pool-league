/** Code-owned aliases only. Use the same public scope for the query and cache
 * fingerprint, so private claims/audit changes do not invalidate the TV cache.
 */
export function publicBadgeFilter(alias: 'a' | 't') {
  return `${alias}.status='confirmed' AND
    (${alias}.source<>'claim' OR EXISTS(SELECT 1 FROM public.fixtures f WHERE f.id=${alias}.fixture_id AND f.status='confirmed') OR EXISTS(SELECT 1 FROM public.casual_results r WHERE r.id=${alias}.casual_result_id AND r.status='confirmed'))
    AND (${alias}.season_id IS NULL OR EXISTS(SELECT 1 FROM public.seasons s WHERE s.id=${alias}.season_id AND s.status<>'draft'))`;
}

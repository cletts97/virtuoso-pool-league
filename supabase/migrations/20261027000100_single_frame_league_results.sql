BEGIN;
-- Keep the fixture's advertised best-of-three format. A completed single frame
-- is an alternative regular-season result; playoff score targets are unchanged.
ALTER TABLE public.fixtures DROP CONSTRAINT fixtures_valid_score;
ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_valid_score CHECK (
  home_score IS NULL OR
  (stage='regular' AND best_of=3 AND
    ((home_score=1 AND away_score=0) OR (home_score=0 AND away_score=1))) OR
  (home_score=(best_of+1)/2 AND away_score BETWEEN 0 AND (best_of-1)/2) OR
  (away_score=(best_of+1)/2 AND home_score BETWEEN 0 AND (best_of-1)/2)
);
COMMIT;

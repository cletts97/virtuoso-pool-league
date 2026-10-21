import { LocalLeagueRepository } from './localRepository';
import { ApiLeagueRepository } from './apiRepository';
import { liveMode } from '../auth/client';

export const browserRepository = liveMode
  ? new ApiLeagueRepository()
  : new LocalLeagueRepository({
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    });

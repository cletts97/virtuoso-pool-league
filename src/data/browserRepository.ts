import { LocalLeagueRepository } from './localRepository';

export const browserRepository = new LocalLeagueRepository({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});

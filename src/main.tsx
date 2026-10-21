import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ScrollToTop } from './app/ScrollToTop';
import { LeagueProvider } from './app/LeagueProvider';
import { Layout } from './app/Layout';
import { Dashboard } from './pages/Dashboard';
import { Standings } from './pages/Standings';
import { Fixtures } from './pages/Fixtures';
import { MatchDetails } from './pages/MatchDetails';
import { Players, PlayerProfile } from './pages/Players';
import { Playoffs } from './pages/Playoffs';
import { Admin } from './pages/Admin';
import { Notifications } from './pages/Notifications';
import { Bookings } from './pages/Bookings';
import { Display } from './pages/Display';
import { Rules } from './pages/Rules';
import { AuthGate } from './auth/AuthGate';
import { AuthLanding } from './auth/AuthLanding';
import { SignIn, AuthCallback } from './auth/AuthPages';
import { Empty } from './components/ui';
import './styles.css';
import './bookings.css';
import './rules.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AuthLanding>
          <Routes>
            <Route path="display" element={<Display />} />
            <Route path="rules" element={<Rules />} />
            <Route path="login" element={<SignIn />} />
            <Route path="auth/callback" element={<AuthCallback />} />
            <Route path="auth/accept-invite" element={<AuthCallback />} />
            <Route
              element={
                <AuthGate>
                  <LeagueProvider>
                    <Layout />
                  </LeagueProvider>
                </AuthGate>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="standings" element={<Standings />} />
              <Route path="fixtures" element={<Fixtures />} />
              <Route path="fixtures/:id" element={<MatchDetails />} />
              <Route path="players" element={<Players />} />
              <Route path="players/:id" element={<PlayerProfile />} />
              <Route path="playoffs" element={<Playoffs />} />
              <Route path="admin" element={<Admin />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="bookings" element={<Bookings />} />
              <Route
                path="*"
                element={
                  <Empty title="You’ve gone off the table">
                    <Link className="text-link" to="/">
                      Return to the clubhouse
                    </Link>
                  </Empty>
                }
              />
            </Route>
          </Routes>
        </AuthLanding>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from './data/hooks';
import { isFirebaseConfigured } from './firebase';
import { Home } from './screens/Home';
import { Loading, Page } from './ui/kit';

// Hash URLs (#/match/abc) survive a refresh on GitHub Pages, which has no
// server-side routing. Bigger screens load on demand to keep the first load small.
const Login = lazy(() => import('./screens/Login').then((m) => ({ default: m.Login })));
const NewMatch = lazy(() => import('./screens/NewMatch').then((m) => ({ default: m.NewMatch })));
const Scoring = lazy(() => import('./screens/scoring/Scoring').then((m) => ({ default: m.Scoring })));
const MatchView = lazy(() => import('./screens/MatchView').then((m) => ({ default: m.MatchView })));
const Scorecard = lazy(() => import('./screens/Scorecard').then((m) => ({ default: m.Scorecard })));
const Awards = lazy(() => import('./screens/Awards').then((m) => ({ default: m.Awards })));
const Matches = lazy(() => import('./screens/Matches').then((m) => ({ default: m.Matches })));
const Players = lazy(() => import('./screens/Players').then((m) => ({ default: m.Players })));
const PlayerProfile = lazy(() => import('./screens/Players').then((m) => ({ default: m.PlayerProfile })));
const Stats = lazy(() => import('./screens/Stats').then((m) => ({ default: m.Stats })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const SetupCheck = lazy(() => import('./SetupCheck').then((m) => ({ default: m.SetupCheck })));

function NotFound() {
  return (
    <Page>
      <p className="px-5 py-10 text-center">
        Page not found. <a href="#/" className="font-bold text-green-dark underline">Go home</a>
      </p>
    </Page>
  );
}

export function App() {
  if (!isFirebaseConfigured) {
    return (
      <Suspense fallback={<Loading />}>
        <SetupCheck />
      </Suspense>
    );
  }
  return (
    <AppDataProvider>
      <HashRouter>
        <Suspense fallback={<Page><Loading /></Page>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/new" element={<NewMatch />} />
            <Route path="/score/:id" element={<Scoring />} />
            <Route path="/match/:id" element={<MatchView />} />
            <Route path="/match/:id/scorecard" element={<Scorecard />} />
            <Route path="/match/:id/awards" element={<Awards />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/players" element={<Players />} />
            <Route path="/players/:id" element={<PlayerProfile />} />
            <Route path="/shame" element={<Awards />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/check" element={<SetupCheck />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </AppDataProvider>
  );
}

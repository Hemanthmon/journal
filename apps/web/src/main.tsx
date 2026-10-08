import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { Day } from './pages/Day';
import { HabitDetailPage } from './pages/HabitDetail';
import { Habits } from './pages/Habits';
import { Journal } from './pages/Journal';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Planner } from './pages/Planner';
import { Calendar } from './pages/Calendar';
import { Urges } from './pages/Urges';
import { SessionProvider, useSession } from './session';
import { applyTheme } from './theme';
import './styles.css';

applyTheme();

function App() {
  const { status, refresh } = useSession();
  if (status === 'loading') return <Loading />;
  if (status === 'unreachable') {
    return (
      <div className="empty">
        <p>Can't reach the server right now. You're still signed in.</p>
        <button className="btn primary" type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }
  // Access is enforced by the API on every request; this only chooses what to render.
  if (status === 'signedOut') return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="habits" element={<Habits />} />
        <Route path="habits/:id" element={<HabitDetailPage />} />
        <Route path="journal" element={<Journal />} />
        <Route path="day/:date" element={<Day />} />
        <Route path="planner" element={<Planner />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="urges" element={<Urges />} />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);

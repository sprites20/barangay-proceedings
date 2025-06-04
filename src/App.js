import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import CaseManager from './CaseManager';
import ScheduleTimeline from './ScheduleTimeline';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="nav-brand">
            Barangay Scheduler
          </div>
          <ul className="nav-links">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/cases">Cases</Link>
            </li>
            <li>
              <Link to="/schedule">Schedule</Link>
            </li>
          </ul>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={
              <div className="welcome-page">
                <h1>Welcome to Barangay Scheduler</h1>
                <p>Manage cases and schedules efficiently</p>
              </div>
            } />
            <Route path="/cases" element={<CaseManager />} />
            <Route path="/schedule" element={<ScheduleTimeline />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
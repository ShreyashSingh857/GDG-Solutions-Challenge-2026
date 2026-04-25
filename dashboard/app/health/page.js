'use client';

import NavBar from '../components/NavBar.jsx';
import AgentHealthPanel from '../components/AgentHealthPanel.jsx';

export default function HealthPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <NavBar />
      <main className="flex-1 p-6">
        <AgentHealthPanel />
      </main>
    </div>
  );
}

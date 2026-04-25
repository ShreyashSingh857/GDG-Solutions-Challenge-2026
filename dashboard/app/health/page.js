'use client';

import NavBar from '../components/NavBar.jsx';
import AgentHealthPanel from '../components/AgentHealthPanel.jsx';

export default function HealthPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <NavBar />
      <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--accent-cyan)] font-bold font-display">Service Monitor</p>
            <h1 className="text-3xl font-bold tracking-tight font-display">System Health</h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
              Live status of all AI agent microservices. Degraded or offline agents will halt real-time disruption detection and autonomous rerouting execution.
            </p>
          </header>

          <div className="w-full">
            <AgentHealthPanel floating={false} />
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import NavBar from '../components/NavBar.jsx';
import AgentHealthPanel from '../components/AgentHealthPanel.jsx';

export default function DevPage() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#020617]">
      <NavBar />
      <div className="relative flex-1 overflow-auto">
        <AgentHealthPanel />
      </div>
    </div>
  );
}

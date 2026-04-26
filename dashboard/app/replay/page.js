'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Info, Play, Pause, FastForward, Map as MapIcon, Activity, RotateCcw } from 'lucide-react';
import NavBar from '../components/NavBar.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { PAGE_ENTER, STAGGER_CHILDREN, CARD_ITEM, SLIDE_FROM_RIGHT } from '../lib/motion.js';

const WINDOW_PRESETS = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
];

const PLAYBACK_SPEEDS = [1, 2, 4, 8];

const ReplayMap = dynamic(() => import('./components/ReplayMap.jsx'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 text-sm text-[var(--text-muted)]">
      Initializing replay map...
    </div>
  ),
});

function formatTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function TimelineDot({ severity, active }) {
  const size = 6 + severity * 1.5;
  const color = severity >= 8 ? 'var(--accent-red)' : severity >= 5 ? 'var(--accent-amber)' : 'var(--accent-cyan)';
  
  return (
    <div className="relative flex items-center justify-center w-8 h-8">
      {severity >= 8 && active && (
        <span 
          className="absolute inset-0 rounded-full animate-ping opacity-40 bg-[var(--accent-red)]"
          style={{ width: size * 2, height: size * 2, margin: 'auto' }}
        />
      )}
      <div 
        className={`rounded-full transition-all duration-300 ${active ? 'ring-4 ring-white/10 scale-110 shadow-lg' : 'opacity-60'}`}
        style={{ 
          width: size, 
          height: size, 
          backgroundColor: color,
          boxShadow: active ? `0 0 15px ${color}66` : 'none'
        }}
      />
    </div>
  );
}

export default function ReplayPage() {
  const [daysBack, setDaysBack] = useState(14);
  const [events, setEvents] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setIsLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
      try {
        const response = await fetch(`/api/disruptions/history?from=${from.toISOString()}&to=${to.toISOString()}`);
        const json = await response.json();
        if (cancelled) return;
        setEvents(json.data || []);
      } catch (err) {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [daysBack]);

  useEffect(() => {
    if (!isPlaying || events.length <= 1) return;
    const interval = setInterval(() => {
      setSelectedIndex((prev) => (prev + 1) % events.length);
    }, 2000 / playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, events.length]);

  const selected = events[selectedIndex];

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden">
      <NavBar />
      
      <motion.main 
        variants={PAGE_ENTER}
        initial="hidden"
        animate="visible"
        className="flex-1 flex overflow-hidden lg:flex-row flex-col"
      >
        {/* Left: Timeline Panel */}
        <div className="w-full lg:w-[450px] border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-xl flex flex-col overflow-hidden">
          <div className="p-6 border-b border-[var(--border-subtle)] space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold font-display tracking-tight text-[var(--text-primary)]">Sequence Replay</h1>
              <div className="flex bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-subtle)]">
                {WINDOW_PRESETS.map((p) => (
                  <button
                    key={p.days}
                    onClick={() => setDaysBack(p.days)}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      daysBack === p.days 
                        ? 'bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30 text-[var(--text-primary)] shadow-sm' 
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause playback' : 'Start playback'}
                className={`w-12 h-12 flex items-center justify-center rounded-full glass-panel transition-all active:scale-90 ${
                  isPlaying 
                    ? '!border-[var(--accent-amber)]/50 !bg-[var(--accent-amber)]/20 text-[var(--accent-amber)] shadow-[0_0_20px_rgba(245,158,11,0.2)]' 
                    : '!border-[var(--accent-cyan)]/50 !bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                }`}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <div className="flex-1 flex items-center justify-between bg-[var(--bg-elevated)] p-1 rounded-2xl border border-[var(--border-subtle)]">
                {PLAYBACK_SPEEDS.map(s => (
                  <button 
                    key={s} 
                    onClick={() => setPlaybackSpeed(s)}
                    className={`flex-1 h-9 flex items-center justify-center rounded-xl text-[10px] font-bold transition-all ${
                      playbackSpeed === s 
                        ? 'bg-[var(--bg-surface)] text-[var(--accent-cyan)] shadow-sm border border-[var(--border-subtle)]' 
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline Legend */}
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--accent-red)] shadow-[0_0_8px_var(--accent-red)]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Critical</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--accent-amber)] shadow-[0_0_8px_var(--accent-amber)]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">High</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan)]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Moderate</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {isLoading ? (
              <div className="space-y-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="animate-pulse flex gap-4">
                    <div className="glass-panel w-8 h-8 rounded-full !bg-[var(--bg-elevated)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 bg-[var(--bg-elevated)] rounded-lg" />
                      <div className="h-4 w-full bg-[var(--bg-elevated)] rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 opacity-60">
                <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center border border-dashed border-[var(--border-subtle)]">
                  <RotateCcw className="w-8 h-8 text-[var(--text-muted)]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">No Sequences Found</h3>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    There are no recorded disruptions for the selected {daysBack}-day window.
                  </p>
                </div>
                <button 
                  onClick={() => setDaysBack(daysBack)}
                  className="px-6 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--bg-surface)] transition-all"
                >
                  Refresh Feed
                </button>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-[var(--border-subtle)] via-[var(--border-default)] to-[var(--border-subtle)]" />
                
                <motion.div variants={STAGGER_CHILDREN} className="space-y-2">
                  {events.map((event, idx) => (
                    <button
                      key={event.id}
                      onClick={() => { setSelectedIndex(idx); setIsPlaying(false); }}
                      className={`w-full flex gap-4 p-3 rounded-2xl transition-all group relative ${selectedIndex === idx ? 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)]' : 'hover:bg-[var(--bg-elevated)]/40 border border-transparent'}`}
                    >
                      <TimelineDot severity={event.severity} active={selectedIndex === idx} />
                      <div className="flex-1 text-left">
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          {formatTime(event.detectedAt)}
                        </div>
                        <div className={`text-sm font-semibold transition-colors ${selectedIndex === idx ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                          {event.type}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                          {event.location} · Sev {event.severity}
                        </div>
                      </div>
                      {selectedIndex === idx && (
                        <motion.div layoutId="active-indicator" className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Activity className="w-3.5 h-3.5 text-[var(--accent-cyan)] animate-pulse" />
                        </motion.div>
                      )}
                    </button>
                  ))}
                </motion.div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Details Panel */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[var(--bg-base)]">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div 
                key={selected.id}
                variants={SLIDE_FROM_RIGHT}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[var(--accent-cyan)] mb-2">
                      <MapIcon className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Incident Location</span>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight font-display">{selected.location}</h2>
                    <p className="text-[var(--text-secondary)] max-w-2xl leading-relaxed">
                      {selected.rawDescription || 'No detailed analysis provided for this historical disruption.'}
                    </p>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] p-4 rounded-2xl shadow-sm text-center min-w-[100px]">
                      <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Severity</div>
                      <div className="text-2xl font-mono font-light text-[var(--text-primary)]">{selected.severity}<span className="text-xs text-[var(--text-muted)]">/10</span></div>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] p-4 rounded-2xl shadow-sm text-center min-w-[100px]">
                      <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Confidence</div>
                      <div className="text-2xl font-mono font-light text-[var(--text-primary)]">{Math.round(selected.confidence * 100)}<span className="text-xs text-[var(--text-muted)]">%</span></div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[32px] border border-[var(--border-default)] overflow-hidden shadow-2xl bg-[var(--bg-surface)]">
                  <ReplayMap lat={selected.epicenterLat} lng={selected.epicenterLng} severity={selected.severity} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] p-5 rounded-[24px] space-y-3">
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <Info className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Classification</span>
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{selected.type}</div>
                  </div>
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] p-5 rounded-[24px] space-y-3">
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <Calendar className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Detection Time</span>
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{formatTime(selected.detectedAt)}</div>
                  </div>
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] p-5 rounded-[24px] space-y-3">
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <Activity className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Impacted Areas</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.affectedZones?.length ? (
                        selected.affectedZones.map(z => (
                          <span key={z} className="px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-secondary)]">
                            {z}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] italic">Global corridor impact</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6 opacity-60">
                <div className="relative">
                  <div className="absolute inset-0 bg-[var(--accent-cyan)]/5 blur-3xl rounded-full" />
                  <div className="w-24 h-24 rounded-[40px] bg-[var(--bg-elevated)]/40 flex items-center justify-center relative border border-dashed border-[var(--border-subtle)]">
                    <MapIcon className="w-10 h-10 text-[var(--text-muted)] opacity-30" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">No Target Selected</h3>
                  <p className="text-[11px] text-[var(--text-secondary)] max-w-[240px] mx-auto leading-relaxed font-medium">
                    Select a historical disruption from the timeline to initiate spatial analysis and impact replay.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.main>
    </div>
  );
}
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAlertStore } from '../../store/alertStore.js';

const RESOLUTION_AGENT_URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';

export default function AgentChatSidebar() {
  const activeResolution = useAlertStore((s) => s.activeResolution);
  const disruptions = useAlertStore((s) => s.disruptions);
  const activeDisruptionId = useAlertStore((s) => s.activeDisruptionId);
  const [chains, setChains] = useState([]);
  const esRef = useRef(null);
  const completedTraceIdsRef = useRef(new Set());
  const bottomRef = useRef(null);

  const traceId = activeResolution?.traceId || activeResolution?.id;
  const activeDisruption = disruptions.find((d) => (d.id || d.traceId) === activeDisruptionId);
  const current = chains[0];
  const isStreaming = Boolean(current && !current.complete);

  useEffect(() => {
    if (!traceId) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }
    if (completedTraceIdsRef.current.has(traceId)) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`${RESOLUTION_AGENT_URL}/options/stream/${traceId}`);
    esRef.current = es;
    es.onopen = () => {
      setChains((p) => [{ traceId, text: '', complete: false }, ...p.filter((c) => c.traceId !== traceId)].slice(0, 5));
    };
    es.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        if (type === 'chunk') setChains((p) => p.map((c) => c.traceId === traceId ? { ...c, text: c.text + data } : c));
        if (type === 'done') {
          setChains((p) => p.map((c) => c.traceId === traceId ? { ...c, complete: true } : c));
          completedTraceIdsRef.current.add(traceId);
          es.close();
          if (esRef.current === es) esRef.current = null;
        }
      } catch {}
    };
    es.onerror = () => {
      setChains((p) => p.map((c) => c.traceId === traceId ? { ...c, complete: true } : c));
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
    return () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
  }, [traceId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chains]);

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between glass-panel !rounded-none !border-t-0 !border-x-0 !border-b shadow-none">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--accent-cyan)] mb-1">AI Reasoning Engine</h2>
          {traceId && <p className="text-[11px] text-[var(--text-primary)] font-bold tracking-tight">Active Trace #{traceId.slice(-8).toUpperCase()}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isStreaming ? (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full animate-pulse shadow-[0_0_8px_var(--accent-cyan)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-cyan)]">Synthesizing</span>
            </div>
          ) : current?.complete ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Optimized</span>
            </div>
          ) : null}
        </div>
      </div>
      
      {activeDisruption && (
        <div className="px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--accent-red)]/5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--accent-red)] rounded-full" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-red)]">
              Impact: {activeDisruption.type} — {activeDisruption.location}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 text-xs text-[var(--text-secondary)]">
        {current ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={current.traceId}
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -8, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="prose prose-sm max-w-none 
                            prose-headings:text-[var(--text-primary)] prose-headings:font-bold prose-headings:tracking-tight
                            prose-p:text-[var(--text-secondary)] prose-p:leading-relaxed prose-p:font-medium
                            prose-code:bg-[var(--accent-blue)]/10 prose-code:text-[var(--accent-blue)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                            prose-strong:text-[var(--text-primary)] prose-strong:font-bold
                            custom-scrollbar">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{current?.text || ''}</ReactMarkdown>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-12 h-12 rounded-2xl border border-[var(--border-subtle)] mb-4 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest">Awaiting Disruption Scenario</p>
          </div>
        )}
        {isStreaming && <span className="inline-block w-2 h-4 bg-[var(--accent-cyan)] ml-1 animate-pulse rounded-sm align-middle" />}
        <div ref={bottomRef} />
      </div>

      {chains.length > 1 && (
        <div className="px-4 py-3 border-t border-[var(--border-subtle)] glass-panel !rounded-none !border-b-0 !border-x-0 shadow-none">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">Previous Explorations</p>
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {chains.slice(1).map((c) => (
              <button 
                key={c.traceId} 
                onClick={() => setChains((p) => [c, ...p.filter((x) => x.traceId !== c.traceId)])} 
                className="text-[10px] font-bold tracking-tight bg-[var(--bg-elevated)]/50 border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)]/40 transition-all flex-shrink-0 min-w-[120px] text-left"
              >
                <div className="text-[var(--text-muted)] text-[8px] uppercase tracking-widest mb-1">#{c.traceId.slice(-6)}</div>
                <div className="truncate">{String(c.text || '').split('\n')[0].replace(/[#*]/g, '') || 'Reasoning...'}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

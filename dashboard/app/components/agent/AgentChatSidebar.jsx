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
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)]">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div><h2 className="text-sm font-semibold text-[var(--text-primary)]">AI Reasoning</h2>{traceId && <p className="text-xs text-[var(--text-muted)] font-mono">#{traceId.slice(-8)}</p>}</div>
        {isStreaming ? <span className="text-xs text-purple-400">Thinking...</span> : current?.complete ? <span className="text-xs text-emerald-500">Complete ✓</span> : null}
      </div>
      {activeDisruption && <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--accent-red)]/10"><p className="text-xs text-[var(--accent-red)]">{activeDisruption.type} — {activeDisruption.location}</p></div>}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
        {current ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={current.traceId}
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -8, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="prose prose-sm max-w-none prose-headings:text-[var(--text-primary)] prose-p:text-[var(--text-secondary)] prose-code:bg-[var(--accent-blue)]/10 prose-code:text-[var(--accent-blue)] custom-scrollbar">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{current?.text || ''}</ReactMarkdown>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : 'Inject a disruption scenario to see AI reasoning'}
        {isStreaming && <span className="inline-block w-1.5 h-3 bg-purple-400 ml-1 animate-pulse" />}
        <div ref={bottomRef} />
      </div>
      {chains.length > 1 && <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex gap-2 overflow-x-auto">{chains.slice(1).map((c) => <button key={c.traceId} onClick={() => setChains((p) => [c, ...p.filter((x) => x.traceId !== c.traceId)])} className="text-xs bg-[var(--bg-surface)] border border-[var(--border-default)] rounded px-2 py-1 text-[var(--text-muted)] font-mono min-h-[36px]">#{c.traceId.slice(-6)} {String(c.text || '').slice(0, 20)}...{c.complete ? ' ✓' : ' ...'}</button>)}</div>}
    </div>
  );
}

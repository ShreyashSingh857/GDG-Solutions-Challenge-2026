'use client';

import { useEffect, useRef, useState } from 'react';
import { useAlertStore } from '../../store/alertStore.js';

const URL = process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL || 'http://localhost:3003';

function renderFormattedText(text) {
  const lines = String(text || '').split('\n');
  const keywordRegex = /(supplierName|distanceKm|routeId|costDelta|timeDelta|reliabilityScore|impactScore)/g;
  const moneyRegex = /(\$\d[\d,]*(?:\.\d+)?(?:M|K)?)/g;
  const unitRegex = /(\b\d+(?:\.\d+)?\s?(?:km|h|hrs)\b)/gi;

  const wrapByRegex = (nodes, regex, className, prefix) => nodes.flatMap((node, nodeIdx) => {
    if (typeof node !== 'string') return [node];
    const parts = node.split(regex);
    return parts.map((part, partIdx) => {
      if (!part) return null;
      const key = `${prefix}-${nodeIdx}-${partIdx}`;
      if (part.match(regex)) {
        return <span key={key} className={className}>{part}</span>;
      }
      return <span key={key}>{part}</span>;
    }).filter(Boolean);
  });

  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('##') || trimmed.startsWith('#')) {
      return <p key={`line-${idx}`} className="font-semibold text-white/90">{trimmed.replace(/^#+\s*/, '')}</p>;
    }

    let nodes = [line];
    nodes = wrapByRegex(nodes, keywordRegex, 'inline-block bg-blue-900/40 text-blue-300 text-xs px-1.5 py-0.5 rounded font-mono mx-0.5', 'kw');
    nodes = wrapByRegex(nodes, moneyRegex, 'text-green-400 font-mono', 'money');
    nodes = wrapByRegex(nodes, unitRegex, 'text-yellow-400 font-mono', 'unit');

    return <p key={`line-${idx}`} className="text-white/60">{nodes}</p>;
  });
}

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
    const es = new EventSource(`${URL}/options/stream/${traceId}`);
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
    <div className="flex flex-col h-full bg-gray-950 border-l border-white/5">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div><h2 className="text-sm font-semibold text-white">AI Reasoning</h2>{traceId && <p className="text-xs text-white/30 font-mono">#{traceId.slice(-8)}</p>}</div>
        {isStreaming ? <span className="text-xs text-purple-300">Thinking...</span> : current?.complete ? <span className="text-xs text-green-400">Complete ✓</span> : null}
      </div>
      {activeDisruption && <div className="px-4 py-2 border-b border-white/5 bg-red-950/20"><p className="text-xs text-red-300">{activeDisruption.type} — {activeDisruption.location}</p></div>}
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs text-white/70 whitespace-pre-wrap">
        {current ? (
          <div className="space-y-0.5">{renderFormattedText(current?.text || '')}</div>
        ) : 'Inject a disruption scenario to see AI reasoning'}
        {isStreaming && <span className="inline-block w-1.5 h-3 bg-purple-400 ml-1 animate-pulse" />}
        <div ref={bottomRef} />
      </div>
      {chains.length > 1 && <div className="px-4 py-2 border-t border-white/5 flex gap-2 overflow-x-auto">{chains.slice(1).map((c) => <button key={c.traceId} onClick={() => setChains((p) => [c, ...p.filter((x) => x.traceId !== c.traceId)])} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/40 font-mono min-h-[36px]">#{c.traceId.slice(-6)} {String(c.text || '').slice(0, 20)}...{c.complete ? ' ✓' : ' ...'}</button>)}</div>}
    </div>
  );
}

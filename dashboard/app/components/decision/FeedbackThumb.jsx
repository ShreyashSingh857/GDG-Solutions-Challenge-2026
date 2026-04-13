'use client';

import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase.js';

export default function FeedbackThumb({ traceId, rank }) {
  const [rating, setRating] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleFeedback(nextRating) {
    if (submitted || !traceId || !rank) return;
    setRating(nextRating);
    await setDoc(doc(db, 'resolutions', traceId, 'feedback', String(rank)), {
      rating: nextRating,
      timestamp: serverTimestamp(),
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <span className="inline-flex items-center text-green-400" aria-label="Feedback submitted">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }

  const base = 'p-1.5 rounded-lg border transition-colors';
  return (
    <div className="flex gap-2 items-center">
      <button
        type="button"
        onClick={() => handleFeedback('up')}
        disabled={submitted}
        className={`${base} ${rating === 'up' ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'border-white/10 text-white/30 hover:text-white/60'}`}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 10v10" />
          <path d="M12 10V5a3 3 0 0 1 3-3l1 8h4a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => handleFeedback('down')}
        disabled={submitted}
        className={`${base} ${rating === 'down' ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'border-white/10 text-white/30 hover:text-white/60'}`}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 14V4" />
          <path d="M12 14v5a3 3 0 0 0 3 3l1-8h4a2 2 0 0 0 2-2l-2-8a2 2 0 0 0-2-2H7" />
        </svg>
      </button>
    </div>
  );
}

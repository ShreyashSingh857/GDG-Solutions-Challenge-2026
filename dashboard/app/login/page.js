'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { motion } from 'framer-motion';
import { Globe, Shield, Zap, Search } from 'lucide-react';
import { app, auth } from '../lib/firebase.js';

// Login page is intentionally theme-independent (always dark, matching globe page).
export default function LoginPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');
  const starsRef = useRef(null);

  const isConfigured = useMemo(() => Boolean(app && auth), []);

  useEffect(() => {
    const canvas = starsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrame;

    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5,
      speed: 0.1 + Math.random() * 0.2,
      opacity: 0.2 + Math.random() * 0.5,
    }));

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        s.y -= s.speed;
        if (s.y < 0) s.y = canvas.height;
      });
      animationFrame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!auth) {
      setError('Firebase configuration missing.');
      return;
    }
    setIsSigningIn(true);
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  }, [router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] text-white flex items-center justify-center font-sans">
      {/* Background Layer */}
      <div className="absolute inset-0">
        <canvas ref={starsRef} className="absolute inset-0 w-full h-full opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#040615]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.05),transparent_70%)]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="glass-modal glass-edge p-10 relative overflow-hidden">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-2">
              <Globe className="w-8 h-8 text-[var(--accent-cyan)] shadow-[0_0_20px_var(--accent-cyan)]" />
            </div>
            
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[var(--accent-cyan)]">Anti-Fragile Protocol</p>
              <h1 className="text-3xl font-bold tracking-tight font-display">System Entry</h1>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed px-4">
                Global supply chain intelligence and multi-agent AI disruption resolution.
              </p>
            </div>

            <button
              onClick={handleSignIn}
              disabled={!isConfigured || isSigningIn}
              className="group relative w-full overflow-hidden rounded-2xl bg-white text-[#020617] px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                {isSigningIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#020617]/30 border-t-[#020617] rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>Sign in with Google</>
                )}
              </span>
            </button>

            {!isConfigured && (
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-200">
                Environment configuration incomplete. Use mock mode or set Firebase keys.
              </div>
            )}
            
            {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/5">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <Search className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Live feeds</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 text-center">
                <Zap className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">AI Agents</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 text-center">
                <Shield className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Certified</span>
              </div>
            </div>
          </div>
        </div>
        
        <p className="mt-8 text-center text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-[0.2em] opacity-40">
          SECURE ENCRYPTED CHANNEL 409-A
        </p>
      </motion.div>
    </main>
  );
}

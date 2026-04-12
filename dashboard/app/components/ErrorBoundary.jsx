'use client';

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="w-full h-full flex items-center justify-center bg-[#020617]">
          <div className="max-w-sm text-center space-y-4 p-8 bg-gray-900 rounded-2xl border border-white/10">
            <div className="mx-auto w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </div>
            <p className="text-sm text-white/80">{this.state.error?.message || 'Unexpected UI error'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-2 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/30 text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

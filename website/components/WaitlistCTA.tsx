"use client";

import { useState } from "react";

export default function WaitlistCTA() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    setEmail("");
  };

  return (
    <section id="waitlist" className="bg-[#0F172A] py-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 dot-grid opacity-40" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          Limited early access spots available
        </div>

        <h2 className="text-3xl sm:text-5xl font-bold text-white mb-5 leading-tight">
          Start finding your perfect leads today.
        </h2>

        <p className="text-slate-400 text-lg mb-10">
          No manual research. No bad data. Just results.
        </p>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your work email"
              className="flex-1 bg-white/5 border border-white/10 text-white placeholder-slate-500 px-4 py-3.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors whitespace-nowrap glow-blue"
            >
              Get Early Access — It&apos;s Free
            </button>
          </form>
        ) : (
          <div className="inline-flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-400 px-6 py-4 rounded-xl text-sm">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.28 4.72a.75.75 0 010 1.06l-9 9a.75.75 0 01-1.06 0l-4-4a.75.75 0 011.06-1.06L6.75 13.19l8.47-8.47a.75.75 0 011.06 0z"
                clipRule="evenodd"
              />
            </svg>
            You&apos;re on the list! We&apos;ll reach out within 24 hours.
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-6 text-slate-500 text-xs">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-green-400">
              <path fillRule="evenodd" d="M10.28 3.28a.75.75 0 010 1.06l-6 6a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 011.06-1.06L3.75 8.69l5.47-5.47a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
            No credit card required
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-green-400">
              <path fillRule="evenodd" d="M10.28 3.28a.75.75 0 010 1.06l-6 6a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 011.06-1.06L3.75 8.69l5.47-5.47a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
            Setup in 5 minutes
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-green-400">
              <path fillRule="evenodd" d="M10.28 3.28a.75.75 0 010 1.06l-6 6a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 011.06-1.06L3.75 8.69l5.47-5.47a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
            Cancel anytime
          </div>
        </div>
      </div>
    </section>
  );
}

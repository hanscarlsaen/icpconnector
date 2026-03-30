"use client";

import { useState } from "react";

const chatMessages = [
  { role: "user", text: "Find me B2B SaaS companies in the US, 50-200 employees, using Salesforce." },
  { role: "agent", text: "Got it. Searching Apify + enriching with Apollo..." },
  {
    role: "agent",
    text: "✅ Found 47 leads. Sending to your Google Sheet now.",
    isResult: true,
  },
  { role: "user", text: "Perfect. Add their LinkedIn URLs too." },
];

export default function Hero() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
    setEmail("");
  };

  return (
    <section className="relative bg-[#0F172A] min-h-screen flex items-center overflow-hidden">
      {/* Dot grid background */}
      <div className="absolute inset-0 dot-grid opacity-60" />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0F172A]/20 to-[#0F172A]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              AI-Powered Lead Generation
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-6">
              Your AI Sales Agent.{" "}
              <span className="text-blue-400">Define your ICP.</span> Get
              verified leads. Close deals.
            </h1>

            <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              Stop wasting hours on manual research. ICPConnector finds,
              enriches, and delivers your perfect-fit leads — straight to your
              CRM or spreadsheet — through a simple chat.
            </p>

            {/* CTA Form */}
            {!submitted ? (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0 mb-6"
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your work email"
                  className="flex-1 bg-white/5 border border-white/10 text-white placeholder-slate-500 px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-6 py-3 rounded-lg text-sm transition-colors whitespace-nowrap glow-blue"
                >
                  Get Early Access
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 max-w-md mx-auto lg:mx-0 mb-6 bg-green-500/10 border border-green-500/20 text-green-400 px-5 py-3 rounded-lg text-sm">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
                    clipRule="evenodd"
                  />
                </svg>
                You&apos;re on the list! We&apos;ll be in touch soon.
              </div>
            )}

            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Watch how it works
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 2L12 7L7 12M2 7H12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>

            {/* Social proof */}
            <div className="mt-10 flex items-center gap-6 justify-center lg:justify-start text-slate-500 text-xs">
              <div className="flex items-center gap-1.5">
                <svg
                  className="text-yellow-400"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="currentColor"
                >
                  <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.3 3.3 12.3l.7-4.1-3-2.9 4.2-.7L7 1z" />
                </svg>
                <span>4.9/5 from early users</span>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <span>Trusted by 200+ sales teams</span>
              <div className="w-px h-4 bg-slate-700" />
              <span>No credit card required</span>
            </div>
          </div>

          {/* Right: Chat mockup */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm bg-[#1E293B] rounded-2xl border border-white/10 glow-border overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0F172A]/50">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                  IC
                </div>
                <div>
                  <p className="text-white text-sm font-medium">
                    ICPConnector Agent
                  </p>
                  <p className="text-green-400 text-xs flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                    Online
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3 min-h-[260px]">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`chat-bubble flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-blue-500 text-white rounded-br-sm"
                          : msg.isResult
                            ? "bg-green-500/15 border border-green-500/25 text-green-300 rounded-bl-sm"
                            : "bg-[#0F172A] text-slate-300 rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input bar */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2">
                  <input
                    readOnly
                    placeholder="Message your agent..."
                    className="flex-1 bg-transparent text-slate-500 text-xs outline-none placeholder-slate-600"
                  />
                  <button className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="white"
                    >
                      <path d="M1 9L9 5L1 1V4.5L7 5L1 5.5V9Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}

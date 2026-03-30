const steps = [
  {
    number: "01",
    title: "Define your ICP",
    description:
      "Describe your ideal customer via chat — on Telegram, WhatsApp, or Slack. Industry, company size, location, tech stack. You name it, we find it.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 3C8 3 3 8 3 14s5 11 11 11 11-5 11-11S20 3 14 3z" />
        <path d="M9 14h10M14 9v10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "AI finds & enriches",
    description:
      "Our agent searches the web for matching companies, then enriches every lead with verified contact data — emails, phones, LinkedIn — via Apollo.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" />
        <path d="M17 17l6 6" strokeLinecap="round" />
        <path d="M11 8v6M8 11h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Leads delivered your way",
    description:
      "Get a clean, formatted list in Google Sheets, HubSpot, or Pipedrive — automatically. No copy-paste. No friction. Just pipeline.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 3v14M8 11l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 21h18" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#0F172A] py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
            Simple 3-step workflow
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            How ICPConnector works
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            From ICP definition to verified leads in your CRM — in minutes, not hours.
          </p>
        </div>

        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-16 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-gradient-to-r from-blue-500/0 via-blue-500/40 to-blue-500/0" />

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="relative text-center">
                {/* Number badge */}
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-6 relative z-10">
                  {step.icon}
                </div>

                {/* Step number */}
                <div className="text-blue-500/30 text-6xl font-black leading-none mb-4 select-none">
                  {step.number}
                </div>

                <h3 className="text-white font-semibold text-xl mb-3">
                  {step.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

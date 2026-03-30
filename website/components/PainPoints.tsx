const pains = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" strokeLinecap="round" />
      </svg>
    ),
    headline: "Hours lost to manual prospecting",
    body: "SDRs spend 30–40% of their day on research instead of selling. That's time they'll never get back.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    headline: "Stale, low-quality lead data",
    body: "Generic lists don't match your actual ICP. Half the contacts bounce, the other half aren't your buyer.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    ),
    headline: "Painful CRM data entry",
    body: "Copy-pasting leads into Sheets or HubSpot kills momentum, morale, and ultimately, pipeline.",
  },
];

export default function PainPoints() {
  return (
    <section className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Sound familiar?
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Every sales team deals with the same broken prospecting loop. There&apos;s a better way.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {pains.map((pain, i) => (
            <div
              key={i}
              className="bg-slate-50 border border-slate-100 rounded-2xl p-8 hover:border-slate-200 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-400 flex items-center justify-center mb-5">
                {pain.icon}
              </div>
              <h3 className="text-slate-900 font-semibold text-lg mb-2">
                {pain.headline}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">{pain.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

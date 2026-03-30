const testimonials = [
  {
    quote:
      "We went from 2 hours of prospecting per day to under 10 minutes — same quality, better fit. Our SDRs are closing more because they're researching less.",
    name: "Sarah K.",
    title: "VP Sales, Series B SaaS",
    stars: 5,
  },
  {
    quote:
      "I describe our ICP in Telegram and get a Google Sheet with 50 perfect-fit leads in 15 minutes. It&apos;s like having a research analyst on demand.",
    name: "Mike T.",
    title: "SDR Lead, Enterprise Tech",
    stars: 5,
  },
  {
    quote:
      "The Apollo enrichment is what sold me. Every lead comes with a verified email and LinkedIn. Our bounce rate dropped to basically zero.",
    name: "Priya M.",
    title: "Founder, B2B Services",
    stars: 5,
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} className="text-yellow-400" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.3 3.3 12.3l.7-4.1-3-2.9 4.2-.7L7 1z" />
        </svg>
      ))}
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="bg-slate-50 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            What early users are saying
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Teams that switched from manual prospecting to ICPConnector never look back.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-100 p-7 flex flex-col gap-4"
            >
              <Stars count={t.stars} />
              <blockquote className="text-slate-600 text-sm leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-slate-900 font-medium text-sm">{t.name}</p>
                  <p className="text-slate-400 text-xs">{t.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

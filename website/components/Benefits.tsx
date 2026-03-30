const benefits = [
  {
    icon: "⚡",
    title: "10x faster prospecting",
    body: "What used to take your SDRs hours now takes minutes. Same output, a fraction of the time.",
  },
  {
    icon: "🎯",
    title: "Precision ICP targeting",
    body: "Only leads that match your exact criteria — industry, size, tech stack, location — nothing else.",
  },
  {
    icon: "🔗",
    title: "Works with your CRM",
    body: "Push to Google Sheets, HubSpot, or Pipedrive automatically. More integrations coming soon.",
  },
  {
    icon: "💬",
    title: "Chat-native workflow",
    body: "Use Telegram, WhatsApp, or Slack — wherever your team already lives. No new tools to learn.",
  },
  {
    icon: "✅",
    title: "Verified contact data",
    body: "Emails, phone numbers, and LinkedIn profiles enriched via Apollo. No more bounced outreach.",
  },
  {
    icon: "📈",
    title: "Scales with your team",
    body: "Run multiple ICPs in parallel. Scale up outreach without scaling headcount.",
  },
];

export default function Benefits() {
  return (
    <section className="bg-slate-50 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Why sales teams choose ICPConnector
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Built specifically for SDRs, AEs, and founders who need qualified pipeline — fast.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-100 p-7 hover:border-blue-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="text-3xl mb-4">{b.icon}</div>
              <h3 className="text-slate-900 font-semibold text-base mb-2">
                {b.title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

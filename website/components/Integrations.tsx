const groups = [
  {
    label: "Deliver leads to",
    integrations: [
      { name: "Google Sheets", color: "#34A853", letter: "S" },
      { name: "HubSpot", color: "#FF7A59", letter: "H" },
      { name: "Pipedrive", color: "#1A1A2E", letter: "P" },
    ],
  },
  {
    label: "Chat via",
    integrations: [
      { name: "Telegram", color: "#26A5E4", letter: "T" },
      { name: "Slack", color: "#4A154B", letter: "S" },
      { name: "WhatsApp", color: "#25D366", letter: "W" },
    ],
  },
  {
    label: "Powered by",
    integrations: [
      { name: "Apollo", color: "#7C3AED", letter: "A" },
      { name: "Apify", color: "#FF6B35", letter: "A" },
    ],
  },
];

export default function Integrations() {
  return (
    <section id="integrations" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Works with the tools you already use
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            No ripping out your stack. ICPConnector plugs into your existing workflow in minutes.
          </p>
        </div>

        <div className="space-y-10">
          {groups.map((group, gi) => (
            <div key={gi}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-5 text-center">
                {group.label}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                {group.integrations.map((intg, ii) => (
                  <div
                    key={ii}
                    className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 hover:border-slate-200 hover:shadow-sm transition-all"
                  >
                    {/* Logo placeholder */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: intg.color }}
                    >
                      {intg.letter}
                    </div>
                    <span className="text-slate-700 font-medium text-sm whitespace-nowrap">
                      {intg.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-400 text-sm mt-10">
          More integrations shipping soon. Got a request?{" "}
          <a href="mailto:hello@icpconnector.io" className="text-blue-500 hover:text-blue-600">
            Let us know.
          </a>
        </p>
      </div>
    </section>
  );
}

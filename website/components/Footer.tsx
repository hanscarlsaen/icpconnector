import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#0F172A] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 2L15 5.5V12.5L9 16L3 12.5V5.5L9 2Z"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="9" cy="9" r="2" fill="white" />
                </svg>
              </div>
              <span className="text-white font-semibold text-lg">
                ICPConnector
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              AI-powered lead generation for sales teams. Define your ICP, get
              verified leads — automatically.
            </p>

            {/* Social links */}
            <div className="flex items-center gap-3 mt-5">
              <a
                href="https://twitter.com"
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/20 transition-all"
                aria-label="Twitter/X"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M10.7 1H13L8.6 6.2 13.6 13H9.7L6.7 8.9 3.3 13H1L5.7 7.5 1 1H5L7.7 4.8 10.7 1zm-.8 10.8h1.2L4.2 2.2H2.9l7 9.6z" />
                </svg>
              </a>
              <a
                href="https://linkedin.com"
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/20 transition-all"
                aria-label="LinkedIn"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M2 1.5A1.5 1.5 0 103.5 3 1.5 1.5 0 002 1.5zM1 5h2.5v8H1zm4 0h2.4v1.1a2.7 2.7 0 012.4-1.3c2.6 0 3 1.7 3 3.9V13h-2.5V9.2c0-.9 0-2.1-1.3-2.1S8.5 8.2 8.5 9.2V13H5.9V5z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white font-medium text-sm mb-4">Product</h4>
            <ul className="space-y-2.5">
              {["How It Works", "Integrations", "Pricing", "Changelog"].map(
                (link) => (
                  <li key={link}>
                    <Link
                      href="#"
                      className="text-slate-400 hover:text-white text-sm transition-colors"
                    >
                      {link}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-medium text-sm mb-4">Company</h4>
            <ul className="space-y-2.5">
              {["About", "Blog", "Privacy", "Terms"].map((link) => (
                <li key={link}>
                  <Link
                    href="#"
                    className="text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    {link}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-xs">
            © 2026 ICPConnector. All rights reserved.
          </p>
          <p className="text-slate-600 text-xs">
            Built for SDRs who&apos;d rather be closing.
          </p>
        </div>
      </div>
    </footer>
  );
}

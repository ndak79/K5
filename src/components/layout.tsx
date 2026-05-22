import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: ReactNode;
}

export function Layout({
  children,
  title = "Curriculum Repository",
  subtitle = "ndak79/Lesson_Norm • development",
  headerActions
}: LayoutProps) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isBloomOptimize = location.pathname === "/bloom-optimize";

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="w-full bg-sage-light border-b border-sage-border sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left side: Logo & Desktop Navi */}
            <div className="flex items-center space-x-10">
              <Link to="/" className="flex items-center space-x-3 flex-shrink-0 group">
                <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center text-white shadow-sm font-bold text-lg transition-transform group-hover:scale-105">
                  L
                </div>
                <div>
                  <h1 className="text-base font-black leading-none text-accent">LessonNorm</h1>
                  <p className="text-[9px] uppercase tracking-wider opacity-60 mt-0.5">Standardized Edu</p>
                </div>
              </Link>

              {/* Navigation Links (Desktop) */}
              <div className="hidden md:flex items-center space-x-2">
                <Link
                  to="/"
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isHome
                      ? "bg-sage-hover text-accent shadow-xs"
                      : "text-ink/80 hover:bg-sage-hover/50 hover:text-accent"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">dashboard</span>
                  <span>Trang chủ</span>
                </Link>

                <div className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm text-ink/40 cursor-not-allowed select-none">
                  <span className="material-symbols-outlined text-[18px]">menu_book</span>
                  <span>Khung CDR</span>
                </div>

                <Link
                  to="/bloom-optimize"
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isBloomOptimize
                      ? "bg-sage-hover text-accent shadow-xs"
                      : "text-ink/80 hover:bg-sage-hover/50 hover:text-accent"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">rule_folder</span>
                  <span>Tối ưu Bloom CDR</span>
                </Link>
              </div>
            </div>

            {/* Right side: Project status card */}
            <div className="hidden sm:flex items-center space-x-4">
              <div className="flex items-center gap-3 px-3.5 py-1.5 bg-white/50 rounded-xl border border-sage-border/40 text-xs">
                <div className="text-right">
                  <p className="font-semibold text-accent leading-none text-xs">Project: Lesson_Norm</p>
                  <p className="text-[9px] opacity-60 mt-0.5">67% hoàn thành</p>
                </div>
                <div className="w-16 bg-sage-border h-1.5 rounded-full overflow-hidden">
                  <div className="bg-accent w-2/3 h-full rounded-full"></div>
                </div>
              </div>
            </div>

            {/* Mobile Navigation controls */}
            <div className="md:hidden flex items-center space-x-2">
              <Link
                to="/"
                className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                  isHome ? "text-accent bg-accent/10" : "text-ink/75 hover:bg-sage-hover"
                }`}
                title="Trang chủ"
              >
                <span className="material-symbols-outlined text-lg leading-none">dashboard</span>
              </Link>
              <Link
                to="/bloom-optimize"
                className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                  isBloomOptimize ? "text-accent bg-accent/10" : "text-ink/75 hover:bg-sage-hover"
                }`}
                title="Tối ưu Bloom CDR"
              >
                <span className="material-symbols-outlined text-lg leading-none">rule_folder</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main nested content container */}
      <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

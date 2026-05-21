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

  return (
    <div className="flex min-h-screen bg-paper text-ink font-sans antialiased">
      {/* Sidebar - Hidden on mobile, beautiful on md and up */}
      <aside className="hidden md:flex w-64 bg-sage-light border-r border-sage-border flex-col p-6 space-y-8 flex-shrink-0">
        <div className="flex items-center space-x-3 px-2">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-sm font-bold text-xl">
            L
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none text-accent">LessonNorm</h1>
            <p className="text-[10px] uppercase tracking-widest opacity-60 mt-1">Standardized Edu</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <Link
            to="/"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              isHome
                ? "bg-sage-hover text-accent shadow-sm"
                : "text-ink/80 hover:bg-sage-hover/55 hover:text-accent"
            }`}
          >
            <span className="material-symbols-outlined text-lg leading-none">dashboard</span>
            <span>Trang chủ</span>
          </Link>

          <div className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-ink/80 opacity-75 cursor-default`}>
            <span className="material-symbols-outlined text-lg leading-none font-light">menu_book</span>
            <span>Khung CDR</span>
          </div>

          <Link
            to="/bloom-optimize"
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-colors ${
              location.pathname === "/bloom-optimize"
                ? "bg-sage-hover text-accent shadow-sm"
                : "text-ink/80 hover:bg-sage-hover/55 hover:text-accent"
            }`}
          >
            <span className="material-symbols-outlined text-lg leading-none">rule_folder</span>
            <span>Tối ưu Bloom CDR</span>
          </Link>


        </nav>

        {/* Dynamic Project Completion card */}
        <div className="p-4 bg-white/40 rounded-2xl border border-white/60">
          <p className="text-xs font-semibold mb-2">Project: Lesson_Norm</p>
          <div className="w-full bg-sage-border h-1.5 rounded-full overflow-hidden">
            <div className="bg-accent w-2/3 h-full rounded-full"></div>
          </div>
          <p className="text-[10px] mt-2 opacity-60">67% to completion</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="px-6 md:px-8 py-4 h-20 flex items-center justify-between bg-white/30 backdrop-blur-sm border-b border-sage-border">
          <div className="flex flex-col min-w-0">
            <h2 className="text-xl md:text-2xl font-serif font-bold text-accent truncate">
              {title}
            </h2>
            <p className="text-xs text-ink/60 truncate">
              {subtitle}
            </p>
          </div>

          <div className="flex items-center space-x-4">

            {headerActions}
          </div>
        </header>

        {/* Mobile Header / Nav Bar (only visible on mobile screens) */}
        <div className="md:hidden flex items-center justify-between px-6 py-3 border-b border-sage-border bg-sage-light">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-white shadow-sm font-bold">
              L
            </div>
            <span className="text-sm font-bold text-accent font-serif">LessonNorm</span>
          </Link>
          <div className="flex space-x-2">
            <Link to="/" className="text-xs font-medium bg-accent/10 text-accent px-3 py-1.5 rounded-full hover:bg-sage-hover transition-colors">
              Trang chủ
            </Link>
            <Link to="/bloom-optimize" className="text-xs font-medium bg-accent text-white px-3 py-1.5 rounded-full hover:bg-sage-dark transition-colors">
              Tối ưu CDR
            </Link>
          </div>
        </div>

        {/* Main nested screen content */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

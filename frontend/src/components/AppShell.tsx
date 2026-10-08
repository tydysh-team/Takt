import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/" aria-label="Takt home">
          Takt
        </Link>
        <span className="environment-badge">Foundation</span>
      </header>
      <main className="page-container">{children}</main>
    </div>
  );
}


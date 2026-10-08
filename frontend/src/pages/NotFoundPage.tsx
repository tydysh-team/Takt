import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";

export function NotFoundPage() {
  return (
    <AppShell>
      <section className="not-found">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The requested page does not exist in the current Takt application.</p>
        <Link className="primary-link" to="/">
          Return home
        </Link>
      </section>
    </AppShell>
  );
}


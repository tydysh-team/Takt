import { buildApiUrl } from "../api/client";
import { AppShell } from "../components/AppShell";

export function HomePage() {
  const docsUrl = buildApiUrl("/api/docs").toString();

  return (
    <AppShell>
      <section className="hero">
        <p className="eyebrow">Technical foundation</p>
        <h1>Takt is ready for product development.</h1>
        <p className="lead">
          The application shell, versioned API boundary, database migrations, and local
          environment are configured. Product features will be added in focused changes.
        </p>
        <a className="primary-link" href={docsUrl} target="_blank" rel="noreferrer">
          Open API documentation
        </a>
      </section>
      <section className="status-grid" aria-label="Foundation status">
        <article>
          <span>Backend</span>
          <strong>FastAPI</strong>
        </article>
        <article>
          <span>Frontend</span>
          <strong>React + TypeScript</strong>
        </article>
        <article>
          <span>Data</span>
          <strong>PostgreSQL</strong>
        </article>
      </section>
    </AppShell>
  );
}


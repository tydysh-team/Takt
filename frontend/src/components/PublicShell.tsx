import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";

export function PublicShell({ children }: PropsWithChildren) {
  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <Link className="auth-logo" to="/">Takt</Link>
        <div>
          <p className="eyebrow">Учёба в своём ритме</p>
          <h1>Всё важное между преподавателем и учеником — рядом.</h1>
          <p>Организуйте взаимодействие без лишнего шума и сложных инструментов.</p>
        </div>
        <span className="auth-brand-panel__note">Пространство для осознанного обучения</span>
      </section>
      <section className="auth-form-panel">{children}</section>
    </main>
  );
}

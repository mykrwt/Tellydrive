import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import type { databaseMode } from "@/lib/telegram-store";

type DatabaseMode = ReturnType<typeof databaseMode>;

export function AuthPage({ mode, database }: { mode: "signin" | "signup"; database: DatabaseMode }) {
  return (
    <main className="auth-page">
      <section className="story-panel">
        <div className="story-orb orb-one" />
        <div className="story-orb orb-two" />
        <header className="auth-header"><Logo /></header>
        <div className="story-content">
          <div className="secure-pill"><span>✦</span> Telegram-native persistence</div>
          <h2>Your private space,<br /><em>always within reach.</em></h2>
          <p>Simple credentials, securely hashed and persisted to a private Telegram chat you control.</p>
          <div className="feature-list">
            <div><span>01</span><p><strong>No traditional database</strong><small>Your Telegram chat holds the account store.</small></p></div>
            <div><span>02</span><p><strong>Server-side secrets</strong><small>Your bot token never reaches the browser.</small></p></div>
            <div><span>03</span><p><strong>Secure sessions</strong><small>Signed, HTTP-only cookies keep access private.</small></p></div>
          </div>
        </div>
        <footer className="story-footer"><span>© 2026 Tellybase</span><span>Private by design</span></footer>
      </section>
      <section className="form-panel">
        <div className="mobile-brand"><Logo /></div>
        <AuthForm mode={mode} database={database} />
      </section>
    </main>
  );
}

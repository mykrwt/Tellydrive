export function SetupNotice({ what }: { what: string }) {
  return (
    <main className="auth-shell">
      <div className="setup-card">
        <span className="empty-icon">⚙</span>
        <h2>Setup required</h2>
        <p>
          <strong>{what}</strong> isn&apos;t configured yet.
          Add the required keys to your <code>.env.local</code> (or Vercel environment
          variables) and restart the server. See <code>SETUP.md</code> at the
          project root for the full list of keys.
        </p>
      </div>
    </main>
  );
}

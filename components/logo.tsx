export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="TellyDrive">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" role="img">
          <path d="M25.7 7.2 21.9 25c-.3 1.3-1 1.6-2.1 1l-5.8-4.3-2.8 2.7c-.3.3-.6.6-1.2.6l.4-5.9L21.2 9.3c.5-.4-.1-.7-.7-.3L7.2 17.4l-5.7-1.8c-1.2-.4-1.3-1.2.3-1.8L24.1 5.2c1-.4 1.9.2 1.6 2Z" />
        </svg>
      </span>
      {!compact && <span className="brand-name">tellydrive</span>}
    </div>
  );
}

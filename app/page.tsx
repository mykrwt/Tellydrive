import { listPlans } from "@/lib/services/plans";
import Link from "next/link";

const files = [
  { name: "Alpine retreat", type: "JPG", tone: "lake" },
  { name: "Ceramics study", type: "JPG", tone: "clay" },
  { name: "City after rain", type: "MP4", tone: "night" },
  { name: "Field notes", type: "JPG", tone: "field" },
];

const GB = 1024 * 1024 * 1024;

export default function Home() {
  const plans = listPlans();
  const defaultPlan = plans.find((p) => p.is_default) ?? plans[0];

  return (
    <main>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <p className="eyebrow"><span /> PRIVATE CLOUD STORAGE</p>
          <h1>Your files,<br /><em>right where</em> you need them.</h1>
          <p className="hero-intro">A calm, secure home for the images and videos that matter. Upload, organize, and access your work without the usual clutter.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/sign-up">Create your space <span>→</span></Link>
            <a className="text-link" href="#features">See how it works <span>↓</span></a>
          </div>
          <div className="trust-row"><div className="avatars"><b>JM</b><b>RA</b><b>KL</b></div><span>Loved by <strong>2,400+</strong> creators and teams</span></div>
        </div>
        <div className="hero-art" aria-label="Example Tellybase library">
          <div className="orb orb-one" /><div className="orb orb-two" />
          <div className="library-card">
            <div className="library-title"><span className="mini-mark">✦</span><div><strong>My library</strong><small>32 files · 1.8 GB</small></div><button aria-label="More options">•••</button></div>
            <div className="media-grid">
              {files.map((file) => <div key={file.name} className={`media-tile ${file.tone}`}><span>{file.type}</span><p>{file.name}</p></div>)}
            </div>
            <div className="library-bottom"><span>↗ &nbsp; Synced just now</span><span>View library →</span></div>
          </div>
          <div className="floating-stat"><span className="stat-icon">↑</span><div><strong>1.8 GB</strong><small>of 10 GB used</small></div><div className="usage-bar"><i /></div></div>
        </div>
      </section>

      <section className="quiet-strip"><p>BUILT FOR YOUR CREATIVE LIFE</p><div><span>Private by default</span><i /> <span>Simple by design</span><i /> <span>Yours forever</span></div></section>

      <section id="features" className="section-wrap features">
        <div className="section-heading"><p className="eyebrow"><span /> MADE FOR THE EVERYDAY</p><h2>Everything you need.<br /><em>Nothing you don&apos;t.</em></h2></div>
        <div className="feature-grid">
          <article className="feature-card large-card"><div className="icon-box">⌁</div><h3>A place for every file</h3><p>Organize images and videos into folders that make sense to you. Find what you need, when you need it.</p><div className="folder-art"><div><span>⌄</span> <b>Photography</b><small>24 files</small></div><div><span>⌄</span> <b>Personal</b><small>12 files</small></div><div><span>⌄</span> <b>Client work</b><small>8 files</small></div></div></article>
          <article className="feature-card"><div className="icon-box">⌁</div><h3>Space to grow</h3><p>Start with {defaultPlan ? `${Math.round(defaultPlan.storage_bytes / GB)} GB` : "generous space"} on us. Upgrade only when your library needs more room.</p><div className="storage-art"><div><span>Storage used</span><strong>1.8 <small>GB</small></strong></div><div className="big-progress"><i /></div><p>{(defaultPlan ? Math.round(defaultPlan.storage_bytes / GB) : 10) - 1.8} GB available</p></div></article>
          <article className="feature-card"><div className="icon-box">✦</div><h3>Private, always</h3><p>Your files are your business. We keep them secure, encrypted, and never use them for anything else.</p><div className="privacy-art"><span>✓</span><div><b>Protected & private</b><small>Only you can access your files</small></div></div></article>
        </div>
      </section>

      <section id="pricing" className="pricing section-wrap">
        <div>
          <p className="eyebrow"><span /> START SIMPLE</p>
          <h2>Storage that<br /><em>fits your life.</em></h2>
          <p>Begin with what you need today. Change plans whenever your work takes you further.</p>
        </div>
        {plans.map((plan) => (
          <div key={plan.id} className="plan-card">
            <p>{plan.name.toUpperCase()}</p>
            <strong>₹{plan.price_monthly} <small>/ month</small></strong>
            <span>{Math.round(plan.storage_bytes / GB)} GB of private storage</span>
            <ul>
              {(JSON.parse(plan.features) as string[]).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link className="button button-primary plan-button" href="/sign-up">
              {plan.is_default ? "Get started free" : `Choose ${plan.name}`} <span>→</span>
            </Link>
          </div>
        ))}
      </section>

      <section className="closing section-wrap"><p className="eyebrow"><span /> YOUR SPACE AWAITS</p><h2>Make room for<br /><em>what matters.</em></h2><Link className="button button-light button-large" href="/sign-up">Start storing for free <span>→</span></Link><p>No credit card required · 10 GB free forever</p></section>
    </main>
  );
}

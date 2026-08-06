import { FolderLock, History, Infinity as InfinityIcon, MonitorSmartphone, Share2, Zap } from "lucide-react";

const features = [
  {
    icon: InfinityIcon,
    title: "Truly unlimited",
    body: "No caps, no throttling. Keep everything.",
  },
  {
    icon: Zap,
    title: "Blazing-fast uploads",
    body: "Big files upload in parallel. Done in minutes.",
  },
  {
    icon: FolderLock,
    title: "Private by default",
    body: "Your sealed vault. No scanning, no data mining.",
  },
  {
    icon: MonitorSmartphone,
    title: "Every device",
    body: "One sign-in and everything syncs, everywhere.",
  },
  {
    icon: History,
    title: "Version history",
    body: "Every change is saved. Restore in one click.",
  },
  {
    icon: Share2,
    title: "Instant share links",
    body: "Turn any file into a secure link in seconds.",
  },
];

export function Features() {
  return (
    <section className="landing-section" id="features">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">Features</p>
          <h2>Everything a drive should be.</h2>
          <p>High quality, always online, zero hassle — for people who keep a lot.</p>
        </div>
        <div className="features-grid">
          {features.map((feature) => (
            <article className="feature-card reveal" key={feature.title}>
              <span className="feature-icon">
                <feature.icon aria-hidden="true" />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

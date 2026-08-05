import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

const recentFiles = [
  ["Alpine retreat.jpg", "Photography", "2.4 MB", "lake"],
  ["City after rain.mp4", "Video drafts", "128 MB", "night"],
  ["Ceramics study.jpg", "Personal", "3.1 MB", "clay"],
  ["Field notes.jpg", "Photography", "1.9 MB", "field"],
];

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) redirect("/");

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-side">
        <p className="side-label">YOUR SPACE</p>
        <Link href="/dashboard" className="side-current">▦ <span>Overview</span></Link>
        <a href="#library">▱ <span>My library</span></a>
        <a href="#folders">⌁ <span>Folders</span></a>
        <a href="#activity">◷ <span>Activity</span></a>
        <div className="side-bottom"><a href="#settings">⚙ <span>Settings</span></a><div className="side-storage"><span>Free plan</span><strong>1.8 GB <small>of 10 GB</small></strong><div><i /></div><button>Upgrade plan →</button></div></div>
      </aside>
      <section className="dashboard-content">
        <div className="dash-top"><div><p className="eyebrow"><span /> YOUR STORAGE</p><h1>Good morning.</h1><p>Here&apos;s what&apos;s happening in your space.</p></div><button className="button button-primary">+ Upload files</button></div>
        <div className="dash-stats"><article><span>STORAGE USED</span><strong>1.8 <small>GB</small></strong><div className="big-progress"><i /></div><p>8.2 GB remaining</p></article><article><span>TOTAL FILES</span><strong>32</strong><p>Across 4 folders</p></article><article><span>THIS MONTH</span><strong>14</strong><p>New uploads</p></article></div>
        <div id="library" className="recent-head"><div><h2>Recent uploads</h2><p>Your latest files, all in one place.</p></div><a href="#all-files">View all files →</a></div>
        <div className="recent-grid">{recentFiles.map(([name, folder, size, tone]) => <article key={name} className="file-card"><div className={`file-thumb ${tone}`}><span>{name.endsWith("mp4") ? "▶" : "✦"}</span></div><div><b>{name}</b><small>{folder} · {size}</small></div><button aria-label={`More actions for ${name}`}>•••</button></article>)}</div>
        <section className="upload-cta"><div><span>↥</span><h2>Keep your work close.</h2><p>Drop images and videos here to add them to your library.</p></div><button className="button button-light">Choose files</button></section>
      </section>
    </main>
  );
}

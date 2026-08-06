import { FolderTree, Files, ImageIcon, Video, Clock3 } from "lucide-react";

export type DashboardSummaryData = {
  storageUsedLabel: string;
  storagePercent: number;
  storageRemainingLabel: string;
  fileCount: number;
  folderCount: number;
  photoCount: number;
  videoCount: number;
  recentUpload: {
    name: string;
    createdLabel: string;
  } | null;
  storageModeLabel: string;
};

function ProgressRing({ percent }: { percent: number }) {
  const size = 96;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.max(0, Math.min(percent, 100)) / 100) * circumference;

  return (
    <div className="tb-progress-ring" aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="tb-progress-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="tb-progress-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="tb-progress-center">
        <strong>{percent}%</strong>
        <span>active</span>
      </div>
    </div>
  );
}

export function DashboardSummaryStrip({ summary }: { summary: DashboardSummaryData }) {
  const statItems = [
    { label: "Files", value: summary.fileCount, icon: Files },
    { label: "Folders", value: summary.folderCount, icon: FolderTree },
    { label: "Photos", value: summary.photoCount, icon: ImageIcon },
    { label: "Videos", value: summary.videoCount, icon: Video },
  ];

  return (
    <section className="tb-overview-grid" aria-label="Storage overview">
      <article className="tb-panel tb-storage-overview-card primary">
        <div className="tb-panel-head">
          <div>
            <span className="tb-panel-label">Storage used</span>
            <h2>{summary.storageUsedLabel}</h2>
          </div>
          <span className="tb-inline-pill">{summary.storageModeLabel}</span>
        </div>
        <div className="tb-storage-overview-content">
          <ProgressRing percent={summary.storagePercent} />
          <div className="tb-storage-overview-copy">
            <div>
              <span className="tb-meta-label">Remaining</span>
              <strong>{summary.storageRemainingLabel}</strong>
            </div>
            <div>
              <span className="tb-meta-label">Recent upload</span>
              <strong>{summary.recentUpload?.name ?? "Nothing yet"}</strong>
              <span>{summary.recentUpload?.createdLabel ?? "Upload your first file to get started"}</span>
            </div>
          </div>
        </div>
      </article>

      <div className="tb-metric-grid">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="tb-panel tb-metric-card">
              <span className="tb-metric-icon"><Icon size={16} strokeWidth={1.9} /></span>
              <span className="tb-metric-label">{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          );
        })}

        <article className="tb-panel tb-metric-card wide">
          <span className="tb-metric-icon"><Clock3 size={16} strokeWidth={1.9} /></span>
          <span className="tb-metric-label">Recent upload</span>
          <strong>{summary.recentUpload?.name ?? "No recent uploads"}</strong>
          <p>{summary.recentUpload?.createdLabel ?? "Your newest item will appear here."}</p>
        </article>
      </div>
    </section>
  );
}

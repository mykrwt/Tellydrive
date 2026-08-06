"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, LayoutGrid, FolderKanban, Shield, Settings2, ChevronRight, HardDrive, Plus, ArrowUpRight, Clock3, LogOut, Command, UserCircle2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { Logo } from "@/components/logo";
import { formatBytes } from "@/lib/format";

type SearchFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

type SearchFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  itemCount?: number;
};

type DashboardChromeProps = {
  user: {
    name: string;
    email: string;
    isAdmin: boolean;
  };
  summary: {
    storageUsedBytes: number;
    storageUsedLabel: string;
    storageModeLabel: string;
    fileCount: number;
    folderCount: number;
    photoCount: number;
    videoCount: number;
    storageRemainingLabel: string;
  };
  children: React.ReactNode;
};

const RECENT_SEARCH_KEY = "tellybase:recent-searches";

function useInitials(name: string) {
  return useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "TB";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [name]);
}

function SectionIcon({ href }: { href: string }) {
  if (href === "/dashboard") return <LayoutGrid size={16} strokeWidth={1.9} />;
  if (href === "/dashboard/files") return <FolderKanban size={16} strokeWidth={1.9} />;
  return <Shield size={16} strokeWidth={1.9} />;
}

function storageTone(bytes: number) {
  if (bytes === 0) return "fresh";
  if (bytes < 1024 * 1024 * 512) return "steady";
  return "active";
}

export function DashboardChrome({ user, summary, children }: DashboardChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = useInitials(user.name);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchFile[]>([]);
  const [folders, setFolders] = useState<SearchFolder[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(RECENT_SEARCH_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const navItems = useMemo(
    () => [
      { href: "/dashboard", label: "Gallery" },
      { href: "/dashboard/files", label: "Files" },
      ...(user.isAdmin ? [{ href: "/dashboard/admin", label: "Admin" }] : []),
    ],
    [user.isAdmin]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setAccountOpen(false);
        setSettingsOpen(false);
        return;
      }

      if (!editable && event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
        setAccountOpen(false);
        setSettingsOpen(false);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setAccountOpen(false);
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    if (folders.length > 0) return;

    let alive = true;
    fetch("/api/folders?all=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ folders: [] })))
      .then((data) => {
        if (alive) setFolders((data.folders ?? []) as SearchFolder[]);
      })
      .catch(() => {
        if (alive) setFolders([]);
      });

    return () => {
      alive = false;
    };
  }, [searchOpen, folders.length]);

  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = query.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          search: trimmed,
          limit: "8",
          sortBy: pathname === "/dashboard" ? "date" : "name",
          sortOrder: pathname === "/dashboard" ? "desc" : "asc",
        });
        const res = await fetch(`/api/files?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as { files?: SearchFile[] };
        setResults(data.files ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, searchOpen, pathname]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        const clickedTrigger = (target as HTMLElement).closest?.("[data-settings-trigger='true']");
        if (!clickedTrigger) setSettingsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filteredFolders = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return folders.filter((folder) => folder.name.toLowerCase().includes(trimmed)).slice(0, 6);
  }, [folders, query]);

  const saveRecentSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecentSearches((current) => {
      const next = [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(0, 6);
      try {
        window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const navigateToSearch = useCallback(
    (value: string, scope: "gallery" | "files") => {
      const trimmed = value.trim();
      if (!trimmed) return;
      saveRecentSearch(trimmed);
      setSearchOpen(false);
      setQuery("");
      router.push(`${scope === "gallery" ? "/dashboard" : "/dashboard/files"}?search=${encodeURIComponent(trimmed)}`);
    },
    [router, saveRecentSearch]
  );

  const openFolder = useCallback(
    (folderId: string) => {
      setSearchOpen(false);
      setQuery("");
      router.push(`/dashboard/files?folder=${encodeURIComponent(folderId)}`);
    },
    [router]
  );

  const storageToneClass = storageTone(summary.storageUsedBytes);

  return (
    <div className="tb-app-shell">
      <header className="tb-header-shell">
        <div className="tb-header">
          <div className="tb-brand-row">
            <Link href="/dashboard" className="tb-brand-link" aria-label="TellyBase home">
              <Logo />
            </Link>
          </div>

          <nav className="tb-segmented-nav" aria-label="Dashboard sections">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`tb-segment ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                  {active && <motion.span layoutId="tb-active-pill" className="tb-segment-indicator" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="tb-segment-icon"><SectionIcon href={item.href} /></span>
                  <span className="tb-segment-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="tb-header-actions">
            <button type="button" className="tb-search-trigger" onClick={() => setSearchOpen(true)} aria-label="Open search">
              <Search size={16} strokeWidth={2} />
              <span className="tb-search-trigger-label">Search</span>
              <span className="tb-shortcut-pill"><Command size={12} />K</span>
            </button>

            <div className={`tb-storage-pill ${storageToneClass}`}>
              <HardDrive size={16} strokeWidth={1.9} />
              <div>
                <span>Storage used</span>
                <strong>{summary.storageUsedLabel}</strong>
              </div>
            </div>

            <button
              type="button"
              className="tb-icon-button"
              onClick={() => {
                setSettingsOpen((open) => !open);
                setAccountOpen(false);
              }}
              aria-label="Open settings"
              data-settings-trigger="true"
            >
              <Settings2 size={17} strokeWidth={1.9} />
            </button>

            <div className="tb-account" ref={accountRef}>
              <button
                type="button"
                className="tb-avatar-button"
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setSettingsOpen(false);
                }}
                aria-label="Open account menu"
                aria-expanded={accountOpen}
              >
                <span className="tb-avatar-badge">{initials}</span>
              </button>

              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    className="tb-popover tb-account-menu"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
                  >
                    <div className="tb-account-summary">
                      <div className="tb-avatar-badge large">{initials}</div>
                      <div>
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                    </div>
                    <div className="tb-divider" />
                    <div className="tb-menu-list">
                      <button type="button" className="tb-menu-item" onClick={() => { setSettingsOpen(true); setAccountOpen(false); }}>
                        <span className="tb-menu-item-left"><Settings2 size={15} /> Settings</span>
                        <ChevronRight size={14} />
                      </button>
                      <button type="button" className="tb-menu-item" onClick={() => setSearchOpen(true)}>
                        <span className="tb-menu-item-left"><Search size={15} /> Search your library</span>
                        <span className="tb-menu-kbd">⌘K</span>
                      </button>
                    </div>
                    <div className="tb-divider" />
                    <form action={signOut}>
                      <button type="submit" className="tb-menu-item danger tb-menu-submit">
                        <span className="tb-menu-item-left"><LogOut size={15} /> Sign out</span>
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <div className="tb-mobile-actions">
        <button type="button" className="tb-search-trigger mobile" onClick={() => setSearchOpen(true)} aria-label="Open search">
          <Search size={16} strokeWidth={2} />
          <span className="tb-search-trigger-label">Search your files</span>
        </button>
        <div className={`tb-storage-pill mobile ${storageToneClass}`}>
          <HardDrive size={15} strokeWidth={1.9} />
          <div>
            <span>Used</span>
            <strong>{summary.storageUsedLabel}</strong>
          </div>
        </div>
      </div>

      <main className="tb-content-shell">{children}</main>

      <nav className="tb-mobile-nav" aria-label="Mobile dashboard sections" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`tb-mobile-nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <SectionIcon href={item.href} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <AnimatePresence>
        {searchOpen && (
          <motion.div className="tb-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="tb-search-panel" initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
              <div className="tb-search-head">
                <div className="tb-search-input-wrap">
                  <Search size={18} strokeWidth={2} />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search files, photos, videos, and folders"
                    aria-label="Global search"
                  />
                </div>
                <button type="button" className="tb-icon-button subtle" onClick={() => setSearchOpen(false)} aria-label="Close search">
                  <span aria-hidden>×</span>
                </button>
              </div>

              <div className="tb-search-body">
                <div className="tb-search-section-head">
                  <span>Quick actions</span>
                  <span>Instant results</span>
                </div>
                <div className="tb-search-shortcuts">
                  <button type="button" className="tb-action-card" onClick={() => navigateToSearch(query || "recent", "gallery")} disabled={!query.trim()}>
                    <LayoutGrid size={16} />
                    <div>
                      <strong>Search gallery</strong>
                      <span>Photos and videos</span>
                    </div>
                    <ArrowUpRight size={15} />
                  </button>
                  <button type="button" className="tb-action-card" onClick={() => navigateToSearch(query || "recent", "files")} disabled={!query.trim()}>
                    <FolderKanban size={16} />
                    <div>
                      <strong>Search files</strong>
                      <span>Documents and folders</span>
                    </div>
                    <ArrowUpRight size={15} />
                  </button>
                </div>

                {!query.trim() ? (
                  <>
                    <div className="tb-search-section-head spaced">
                      <span>Recent searches</span>
                      <span>{recentSearches.length > 0 ? `${recentSearches.length} saved` : "No recent activity"}</span>
                    </div>
                    <div className="tb-recent-searches">
                      {recentSearches.length === 0 ? (
                        <div className="tb-empty-search-state">
                          <Clock3 size={18} />
                          <div>
                            <strong>Search your library faster</strong>
                            <span>Use ⌘K or / to jump to anything.</span>
                          </div>
                        </div>
                      ) : (
                        recentSearches.map((entry) => (
                          <button key={entry} type="button" className="tb-recent-chip" onClick={() => setQuery(entry)}>
                            <Clock3 size={14} />
                            <span>{entry}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="tb-search-results-grid">
                      <section className="tb-search-results-card">
                        <div className="tb-search-section-head">
                          <span>Files</span>
                          <span>{loading ? "Searching…" : `${results.length} matches`}</span>
                        </div>
                        <div className="tb-result-list">
                          {loading ? (
                            Array.from({ length: 4 }).map((_, index) => <div key={index} className="tb-result-skeleton" />)
                          ) : results.length === 0 ? (
                            <div className="tb-empty-inline">No files found</div>
                          ) : (
                            results.map((file) => {
                              const media = file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/");
                              return (
                                <button
                                  key={file.id}
                                  type="button"
                                  className="tb-result-row"
                                  onClick={() => navigateToSearch(file.name, media ? "gallery" : "files")}
                                >
                                  <span className={`tb-result-icon ${media ? "media" : "file"}`}>
                                    {media ? <LayoutGrid size={14} /> : <FolderKanban size={14} />}
                                  </span>
                                  <div>
                                    <strong>{file.name}</strong>
                                    <span>{file.mimeType} · {formatBytes(file.size)}</span>
                                  </div>
                                  <ArrowUpRight size={14} />
                                </button>
                              );
                            })
                          )}
                        </div>
                      </section>

                      <section className="tb-search-results-card">
                        <div className="tb-search-section-head">
                          <span>Folders</span>
                          <span>{filteredFolders.length} matches</span>
                        </div>
                        <div className="tb-result-list">
                          {filteredFolders.length === 0 ? (
                            <div className="tb-empty-inline">No folders found</div>
                          ) : (
                            filteredFolders.map((folder) => (
                              <button key={folder.id} type="button" className="tb-result-row" onClick={() => openFolder(folder.id)}>
                                <span className="tb-result-icon folder"><FolderKanban size={14} /></span>
                                <div>
                                  <strong>{folder.name}</strong>
                                  <span>{folder.itemCount ?? 0} items</span>
                                </div>
                                <ArrowUpRight size={14} />
                              </button>
                            ))
                          )}
                        </div>
                      </section>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div className="tb-settings-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.aside ref={settingsRef} className="tb-settings-panel" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ duration: 0.22 }}>
              <div className="tb-settings-head">
                <div>
                  <span className="tb-eyebrow">Workspace settings</span>
                  <h2>TellyBase</h2>
                </div>
                <button type="button" className="tb-icon-button subtle" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                  <span aria-hidden>×</span>
                </button>
              </div>

              <div className="tb-settings-body">
                <section className="tb-settings-card">
                  <div className="tb-settings-card-head">
                    <UserCircle2 size={16} />
                    <strong>Account</strong>
                  </div>
                  <dl className="tb-settings-list">
                    <div><dt>Name</dt><dd>{user.name}</dd></div>
                    <div><dt>Email</dt><dd>{user.email}</dd></div>
                    <div><dt>Role</dt><dd>{user.isAdmin ? "Administrator" : "Member"}</dd></div>
                  </dl>
                </section>

                <section className="tb-settings-card">
                  <div className="tb-settings-card-head">
                    <HardDrive size={16} />
                    <strong>Storage</strong>
                  </div>
                  <dl className="tb-settings-list compact">
                    <div><dt>Used</dt><dd>{summary.storageUsedLabel}</dd></div>
                    <div><dt>Files</dt><dd>{summary.fileCount}</dd></div>
                    <div><dt>Folders</dt><dd>{summary.folderCount}</dd></div>
                    <div><dt>Mode</dt><dd>{summary.storageModeLabel}</dd></div>
                    <div><dt>Remaining</dt><dd>{summary.storageRemainingLabel}</dd></div>
                  </dl>
                </section>

                <section className="tb-settings-card">
                  <div className="tb-settings-card-head">
                    <CheckCircle2 size={16} />
                    <strong>Shortcuts</strong>
                  </div>
                  <div className="tb-shortcuts-list">
                    <div><span>Global search</span><kbd>⌘K</kbd></div>
                    <div><span>Quick search</span><kbd>/</kbd></div>
                    <div><span>Close overlays</span><kbd>Esc</kbd></div>
                  </div>
                </section>

                <section className="tb-settings-card muted">
                  <div className="tb-settings-card-head">
                    <Plus size={16} />
                    <strong>Design notes</strong>
                  </div>
                  <p>This workspace is optimized for a dark, focused storage experience with one-handed mobile navigation and a single primary action per screen.</p>
                </section>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

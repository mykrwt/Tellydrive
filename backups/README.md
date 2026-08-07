# Original web project backup

`TellyBase`'s web source was archived **before migration work began**.

- Source commit: `e6053996c38dd22da15bcc8e209b406948f196fa`
- Archive: `tellybase-web-original-e6053996c38d.tar.gz`
- SHA-256: `977805799aba2abfae4d9d0d2b4418176717020615f968cf23f7e07170f50b8d`

Verify and restore without touching the working web project:

```bash
sha256sum -c backups/tellybase-web-original-e6053996c38d.tar.gz.sha256
mkdir -p /tmp/tellybase-web-restore
tar -xzf backups/tellybase-web-original-e6053996c38d.tar.gz \
  -C /tmp/tellybase-web-restore
```

The archive contains the complete tracked source tree at the migration baseline.
The original root-level Next.js application remains in place; the Android client
lives independently in `tellybase_mobile/`.

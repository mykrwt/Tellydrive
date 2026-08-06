// Shared upload constants — this module must stay client-importable
// (no "server-only", no Node APIs).

// Vercel caps function request bodies at 4.5 MB, so anything bigger than one
// part is uploaded as a sequence of small parts from the browser. 4 MiB keeps
// each request (file bytes + multipart overhead + fields) safely under the cap.
export const PART_UPLOAD_SIZE = 4 * 1024 * 1024; // 4 MiB per part

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export const MAX_UPLOAD_PARTS = Math.ceil(MAX_FILE_SIZE_BYTES / PART_UPLOAD_SIZE) + 1; // 513

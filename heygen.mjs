// HeyGen Avatar IV: talking video from one photo + one voice file.
// Key: HEYGEN_API_KEY env var (or a .env file next to this script). Never hardcode it.
//
//   node heygen.mjs submit <photo.png|jpg> <voice.mp3> [title]
//   node heygen.mjs status            (poll; downloads avatar.mp4 when done)
//
// Outputs go to OUT_DIR (default: ./heygen-out).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.env.OUT_DIR || "heygen-out");
fs.mkdirSync(outDir, { recursive: true });

function loadKey() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
  const envFile = path.join(here, ".env");
  if (fs.existsSync(envFile)) {
    const m = fs
      .readFileSync(envFile, "utf8")
      .match(/^HEYGEN_API_KEY\s*=\s*["']?([^\r\n"']+)/m);
    if (m) return m[1];
  }
  throw Error(
    "Missing HEYGEN_API_KEY. Set it as an env var or in .env next to this script.",
  );
}
const headers = { "X-Api-Key": loadKey() };

async function call(p, options = {}) {
  const r = await fetch("https://api.heygen.com" + p, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const d = await r.json();
  if (!r.ok) throw Error(JSON.stringify(d));
  return d;
}

async function upload(file, type) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([fs.readFileSync(file)], { type }),
    path.basename(file),
  );
  return (await call("/v3/assets", { method: "POST", body: form })).data
    .asset_id;
}

const mime = (f) =>
  ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  })[path.extname(f).toLowerCase()] || "application/octet-stream";

if (process.argv[2] === "submit") {
  const [, , , photo, voice, title = "Avatar video"] = process.argv;
  if (!photo || !voice)
    throw Error("Usage: node heygen.mjs submit <photo> <voice> [title]");
  const me = await call("/v3/users/me");
  fs.writeFileSync(
    path.join(outDir, "billing-before.json"),
    JSON.stringify(me, null, 2),
  );
  console.log("Wallet before", JSON.stringify(me.data?.wallet));
  const template = JSON.parse(
    fs.readFileSync(path.join(here, "request.template.json"), "utf8"),
  );
  const request = {
    ...template,
    image: { type: "asset_id", asset_id: await upload(photo, mime(photo)) },
    audio_asset_id: await upload(voice, mime(voice)),
    title,
  };
  fs.writeFileSync(
    path.join(outDir, "request.json"),
    JSON.stringify(request, null, 2),
  );
  const job = await call("/v3/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  fs.writeFileSync(path.join(outDir, "job.json"), JSON.stringify(job, null, 2));
  console.log("Submitted", JSON.stringify(job));
} else {
  const job = JSON.parse(
    fs.readFileSync(path.join(outDir, "job.json"), "utf8"),
  );
  const id = job.data.video_id || job.data.id;
  const state = await call("/v3/videos/" + id);
  fs.writeFileSync(
    path.join(outDir, "status.json"),
    JSON.stringify(state, null, 2),
  );
  console.log("Status", state.data?.status, "duration", state.data?.duration);
  const out = path.join(outDir, "avatar.mp4");
  if (state.data?.status === "completed" && !fs.existsSync(out)) {
    const r = await fetch(state.data.video_url);
    if (!r.ok) throw Error("Download " + r.status);
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    fs.writeFileSync(
      path.join(outDir, "billing-after.json"),
      JSON.stringify(await call("/v3/users/me"), null, 2),
    );
    console.log("Downloaded", out);
  }
}

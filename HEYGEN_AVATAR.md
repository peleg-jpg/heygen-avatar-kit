---
name: heygen-photo-avatar
description: "Default talking-head route for reels: HeyGen Avatar IV from one photo + your own voice file. Cheap, one API call, consistent."
metadata:
  type: reference
---

# HeyGen photo avatar (Avatar IV)

Default route for any talking-head reel: one still photo of you + one voice file -> a lip-synced 9:16 1080p video. About $2 for ~48 s, about 2 min to render.

## Setup (once per session / machine)

Claude: check these in order before the first render. Never print the key.

1. **API key.** Look for `HEYGEN_API_KEY` in the environment, then in a `.env` next to `heygen.mjs`. If neither exists, ask the user to create a key at app.heygen.com (Settings > API) and set it as an env var or in `.env`. Before writing `.env`, make sure `.gitignore` covers it.
2. **MCP (optional).** If a HeyGen MCP connector is connected in this session (`mcp__heygen__*` tools), renders can use plan credits instead of the API wallet. If not, use the API script. Both give the same result.
3. **Inputs from the user:**
   - `photo`: their own avatar photo (png/jpg). Straight-on, good light, sharp, head and shoulders with some air above the head. Waist-up with hands visible if they want gestures.
   - `voice`: the voiceover audio (mp3/wav), already at the final speed. Any TTS or a real recording works.
4. **Wallet.** Check balance with `GET /v3/users/me` before rendering. Tell the user if it looks too low for the clip length.

## Render (API route)

```bash
export HEYGEN_API_KEY=...            # or put it in .env
node heygen.mjs submit ./photo.png ./voice.mp3 "My reel v1"
node heygen.mjs status               # repeat every ~30 s until "completed"
```

Output lands in `./heygen-out/` (set `OUT_DIR` to change): `request.json`, `job.json`, `status.json`, `avatar.mp4`, billing before/after.

What the script does:

- `POST /v3/assets` for the photo -> image asset id.
- `POST /v3/assets` for the voice -> audio asset id.
- `POST /v3/videos` with `request.template.json` filled in.
- Poll `GET /v3/videos/{id}`, then download `video_url`.

Asset ids belong to the account that uploaded them. Never reuse ids from someone else's files; always upload your own.

## Render (MCP route)

- Upload photo and audio with the API (`POST /v3/assets`, free) or with `create_asset_upload` -> PUT to the presigned URL -> `complete_asset_upload` (use this for files over ~32 MB).
- Call `create_video_from_image` with `{image:{type:"asset_id", asset_id}, audioAssetId, resolution:"1080p", aspectRatio:"9:16", expressiveness:"low", motionPrompt, title}`.
- Poll `get_video` until completed. `get_current_user` shows credits.
- Measured on one account: about 3 credits per 5 s clip. Check against your own plan on the first full reel.

## Approved settings

- `resolution` 1080p, `aspect_ratio` 9:16, `expressiveness` low.
- `motion_prompt`: "Natural small head movements and blinks while speaking. Head upright and chin level, direct eye contact, calm conversational delivery. Keep facial proportions and appearance consistent. No exaggerated gestures."

## Lessons learned

- **Keep one avatar photo.** Pick one photo and reuse it for every reel so the face stays consistent. For more motion or hands, outpaint that same photo wider, do not switch photos.
- **More life:** `expressiveness: "high"` + a livelier motion prompt adds head tilts and eyebrows. Hands only show if the photo itself shows them (waist-up source).
- **Digital twin from real footage** (`create_digital_twin` + `create_avatar_consent`, render with `create_video_from_avatar`): it copies the source footage exactly, so a serious, tight, static selfie gives a serious, static twin. If you try it, record ~2 min with the phone on a stand ~1.5 arm lengths away, centered, both shoulders + headroom, smiling, natural blinks, hands in frame. `avatar_iv` engine beat `avatar_v` in our test (Avatar V: fewer blinks, more static). In our case the photo avatar still won.
- **No framing control.** HeyGen has no zoom/crop/position settings. Do punch-in zooms and a subtle handheld drift in the edit so the head never sits static.
- **Background change** = composite the source (matte the person onto a new background) before creating the avatar; there is no matting option in HeyGen.
- **Skin tone mismatch** between renders: build a color-transfer LUT and apply it with ffmpeg `lut3d`. ffmpeg filter paths break on `:` in folder names; copy the `.cube` to a plain path first.

## Why this is the default

Cheap, one call, consistent look. The alternative (Seedance video + separate lip sync) cost ~4x per reel and needed fragile retiming and frame checks.

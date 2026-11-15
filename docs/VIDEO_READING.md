# Video reading candidate

Companion reuses Runtime's pinned `claude-video-vision@1.4.0` MCP through the
existing native host. No second video parser, inference provider or video
generation integration is added. Backup remains independent and cannot read
video through the native host.

During an explicit node review, the existing image-send setting also controls
video-frame sending. References and existing video output are collected separately
from still images. Runtime returns bounded visual samples and timestamps; the
existing Responses/Chat review sends them as normal image content with stable
video/node/role labels. No video processing runs merely by opening a canvas.

Limits: three videos per review, 100 MiB and 30 minutes per video, approximately
12 samples at 640px, native result below 1 MiB. Audio is not analyzed. Failure,
omission and image-budget exclusion are not successful inspection. Existing
output is not assumed to correspond to the current edited generation prompt.
Changing video identity invalidates late advice. Suggestions remain read-only.

Requires the matching candidate Runtime plus Companion. Older Runtime reports
an explicit native-tool error, not a successful visual review. This branch does
not activate a public ZIP catalog or publish a release.

Validation: unit tests, both extension builds, and isolated Chromium/native
host roundtrip. No authorized live-canvas or paid model-quality acceptance was
performed. The repository's full strict TypeScript baseline is not clean;
existing diagnostics are not claimed fixed by this change.

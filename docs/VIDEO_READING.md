# External MCP video reading

Companion 0.1.28 calls the independently packaged `acu-video-mcp` 0.2.0 native
host `com.acucompute.video`. Runtime prepares this verified external tool during
one-click setup and assigns it through official Magpie's standard Library API.
There is no kernel patch, private video API, Runtime decoder or npm bootstrap.

The self-contained tool bundles upstream claude-video-vision and dependencies.
It owns media download, temporary files, decoding and process cleanup. Native
requests carry the URL/action/version and an optional ACU audio connection.
The ACU Key passes only through Chrome's local native channel and the ACU HTTPS
audio request; it is never sent to TapNow, page scripts or review diagnostics.
The video host admits Companion only; Backup remains separate.

Explicit detection reads at most three videos, 100 MiB/30 minutes each, with
approximately 12 visual samples. The existing image-send setting controls frame
sending. Source node/video/time labels go into normal image review; omitted and
failed evidence is disclosed. Audio uses the same ACU Key with Gemini 3.8 Flash,
reusing upstream WAV conversion and silence-aware segmentation. Timestamped
speech/music/sound events are returned as compact text, not raw audio through
Chrome native messaging. No track, failed and partial analysis are distinct;
audio failure preserves visual review. There is no precise lip-sync measurement.
Existing output is unbound
to edited prompts unless generation provenance is available. Advice is read-only.

Unchanged official Magpie can upgrade independently. Once the external native
host is registered, video reading does not require Runtime's window to remain
open. First Chrome unpacked-extension loading and update reload remain manual
browser confirmations. No generation or paid inference runs during connection.

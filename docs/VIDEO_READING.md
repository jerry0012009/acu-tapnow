# External MCP video reading

Companion 0.1.25 calls the independently packaged `acu-video-mcp` 0.1.0 native
host `com.acucompute.video`. Runtime prepares this verified external tool during
one-click setup and assigns it through official Magpie's standard Library API.
There is no kernel patch, private video API, Runtime decoder or npm bootstrap.

The self-contained tool bundles upstream claude-video-vision and dependencies.
It owns media download, temporary files, decoding and process cleanup. Native
requests carry only the URL/action/version, no ACU Key or TapNow credentials.
The video host admits Companion only; Backup remains separate.

Explicit detection reads at most three videos, 100 MiB/30 minutes each, with
approximately 12 visual samples. The existing image-send setting controls frame
sending. Source node/video/time labels go into normal image review; omitted and
failed evidence is disclosed. Audio is not analyzed. Existing output is unbound
to edited prompts unless generation provenance is available. Advice is read-only.

Unchanged official Magpie can upgrade independently. Once the external native
host is registered, video reading does not require Runtime's window to remain
open. First Chrome unpacked-extension loading and update reload remain manual
browser confirmations. No generation or paid inference runs during connection.

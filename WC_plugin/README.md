# White Christmas Viewer Plugin

Chrome extension for authorized White Christmas image decode using the current backend API.

## What it does

- Detects protected images by reading the White Christmas watermark marker + image ID.
- Calls backend endpoints:
  - `GET /api/images/{image_id}/key`
  - `GET /api/images/{image_id}/file`
- Reconstructs the image client-side using `seed` + block permutation.

## Configure

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked: `WC_plugin/`
4. Click the extension icon and set:
   - Backend URL (example: `http://localhost:8000`)
   - Access token (Bearer token of a permitted viewer)
   - Auto decode enabled

## Notes

- The token must belong to a user who is owner or granted viewer for that image.
- If the plugin cannot decode, check backend logs for `401/403` on key/file endpoints.

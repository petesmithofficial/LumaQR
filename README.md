# Luma QR

A zero-dependency, front-end-only QR code generator.

## Features

- Live QR updates as URL or free text changes, with no generate button.
- URL mode trims extra edge whitespace and percent-encodes URL spaces.
- Automatic QR version sizing based on UTF-8 byte length.
- Auto error-correction selection that keeps the QR compact while preserving scan reliability.
- One-click PNG export.
- Responsive app layout for phones, tablets, and desktop screens.
- Runs as plain static files with no framework, build step, CDN, or runtime dependency.
- Keeps QR payloads local to the browser; no text is sent to a server.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

## Verify

```sh
node scripts/verify.js
```

The verification script loads the QR engine, checks version scaling across representative payloads, and validates generated matrices/SVG output.

## Deploy on Cloudflare Workers

The repository includes `wrangler.jsonc` for Cloudflare Workers Static Assets.

In Cloudflare Workers Builds, use:

- Build command: `node scripts/verify.js && rm -rf dist && mkdir -p dist && cp index.html dist/ && cp -R assets dist/`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

## License

Luma QR is available under the MIT License. See `LICENSE`.

If this tool saves you time, support is welcome at <https://buymeacoffee.com/petesmith>.

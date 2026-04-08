# Tracing ButtonIcons to SVG

This folder contains button PNGs. Use the repository script to auto-trace them into SVGs.

Usage:

1. Install dependencies:

```bash
npm install
```

2. Run the tracer (will write `.svg` files next to `.png` files):

```bash
npm run trace-icons
```

Notes:
- The script uses `potrace` to trace monochrome silhouettes and `svgo` to optimize the output.
- If you want different tracing options (tolerance/threshold), edit `scripts/trace-icons.js`.

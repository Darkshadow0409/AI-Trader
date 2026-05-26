# Graphify Rebuild

Graphify is a generated orientation artifact for AI Trader. Use it to navigate the codebase and spot likely clusters, but verify implementation decisions against source, tests, and runtime evidence.

## Rebuild

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\graphify_rebuild.ps1 --mode fast --traceback-timeout-seconds 600
```

The wrapper finds a Python interpreter with the `graphify` package and writes the local interpreter path to `.graphify_python`. That file is local machine state and must not be committed.

## Outputs

The rebuild writes:

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`

Those files are generated and ignored by default. Keep durable findings in docs or evidence when needed.

## Modes

- `--mode fast` skips the expensive suggested-question pass and is the default for Windows maintenance.
- `--mode full` also runs Graphify's suggested-question pass.

## Trust

Graphify can still contain inferred edges, generic nodes, and weak community labels. Treat it as an orientation layer, not implementation truth.

# Changelog

## 0.1.0 (2026-11-20)

- First release, moved from open-paleo/media's tracing script: finds the animal in a skeletal
  reconstruction, fills its body and traces it with potrace's WebAssembly build. Runs in Node
  (`loadNodeTracer()` from `@open-paleo/outline-tracer/node`) and in browsers
  (`traceWithPotrace` from `@open-paleo/outline-tracer/potrace`)

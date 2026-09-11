# Complex Gauge fixture for studio-reporter

This is a ** denser** Gauge project than the in-repo `sampleSuite()` used by unit tests.
Use it to exercise static HTML, live viewer, screenshots, filters, search, history compare,
and `.uhilreport` regeneration.

## Layout

```
specs/auth/login.spec              # contexts / concept / CJK step text
specs/checkout/cart.spec           # spec-level data table (table-driven scenarios)
specs/checkout/payment.spec        # nested concepts (2 levels) + failure screenshot
specs/catalog/search.spec          # scenario data table + dynamic params
specs/admin/users.spec             # tags, retries, hook messages, multiline param
specs/edge/hooks-and-screenshots.spec
specs/edge/nested-concepts.spec
specs/edge/skipped.spec            # validation skip / missing step
concepts/*.cpt
```

## Without Gauge (CI / local Go)

Generate a matching synthetic suite result and HTML hub:

```bash
make demo-complex
# → .demo/complex-hub/index.html + *.uhilreport + images/
xdg-open .demo/complex-hub/index.html
xdg-open .demo/complex-hub/manage.html
```

`make smoke-complex` asserts structural coverage (nested concepts, screenshots, table-driven,
suite/spec hooks, skip, CJK, etc.).

## With Gauge (optional)

Requires Gauge + a language runner. Specs are valid Gauge markdown; step implementations are
stubs under `resources/` (documentation only unless you wire a runner). Preferred path for
reporter development is `make demo-complex`.

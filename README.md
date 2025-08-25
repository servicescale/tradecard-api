# Tradecard API

## Intent resolution trace

The `applyIntent` helper returns an array of trace objects describing how fields were populated.
These traces now include an `unresolved` stage which lists any allowed keys that remain
empty after deterministic, LLM, and derived resolutions:

```js
{
  stage: 'unresolved',
  remaining: ['field_a', 'field_b']
}
```

This makes it easier for API clients to debug missing data.

## Environment Variables

- `COVERAGE_THRESHOLD` – Minimum required field coverage (0–1); defaults to 0.5.

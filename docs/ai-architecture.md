# Fichr AI Architecture

Fichr prepares AI as a server-side suggestion layer only. It is not a chatbot and it must never update product data automatically.

## In-software only

AI actions are controlled Fichr actions, not free user instructions.

- No chat UI.
- No public `/ai` page.
- No free prompt field.
- No user-written AI instruction.
- No provider selector in the UI.
- Server templates are internal and selected only by predefined actions.

Allowed action names:

- `product_suggestion`
- `missing_fields_review`
- `description_rewrite`
- `pricing_consistency_review`

Each action receives strict product data prepared by Fichr. A user cannot bypass business rules by writing custom instructions.

## Current state

- AI is disabled by default with `AI_ENABLED="false"`.
- A controlled OpenAI provider can be enabled server-side with
  `AI_PROVIDER="openai"`.
- No client-side API key is used or expected.
- If no provider is configured, product suggestion creation must return `IA non configuree`.
- Suggestions are stored separately from `draft_data` and `validated_data`.
- Suggestions may stay only `proposed`, `dismissed`, or `failed` in this foundation.
- Applying a suggestion requires an explicit human action and is limited to safe
  editorial fields.

## First product suggestion flow

The first controlled flow is `product_suggestion` from `/products/[productId]`.
The server action receives only `productId`; it does not accept a prompt,
free-form instruction, provider choice, or client API key.

When the provider is disabled, the action logs minimal metadata and creates no
fake suggestion. When a suggestion is produced, it is inserted in
`ai_suggestions` with `status = proposed` and a structured `suggestion_data`
payload:

- `proposed_subtitle`
- `proposed_description`
- `missing_fields`
- `possible_inconsistencies`
- `questions_to_ask`
- `confidence_score`
- `factual_warnings`
- `editorial_notes`
- `non_invention_notice`

The product sheet is never updated automatically. The UI can display proposed
suggestions and allows explicit field-by-field application only for safe
editorial fields.

A proposed suggestion can be rejected by the user. Rejection changes only the
suggestion status to `dismissed`, keeps the row for history, and never updates
the product sheet.

The user can also apply safe editorial fields one by one. In this foundation,
only `subtitle` and `description` are applicable. The action updates
`draft_data` only, marks any current product audit as stale, and moves a
validated product back to `needs_review`. There is no "apply all" action and no
AI suggestion can update `validated_data`.

## Product rule

AI may propose editorial help, but the client decides. Technical facts must not be invented:

- materials
- dimensions
- origin
- current price
- desired price
- cost price
- target margin
- SKU
- image URL
- country of manufacture
- workshop
- supplier
- certification
- weight
- stock
- real market price
- manufacturing process
- legal or regulatory information

When a factual field is missing, it must remain missing or `a confirmer`.

## Server-only configuration

Local `.env.local` variables:

```env
AI_PROVIDER=openai
AI_ENABLED=false
OPENAI_API_KEY=""
OPENAI_MODEL=""
AI_MONTHLY_SUGGESTION_LIMIT=100
AI_DAILY_SUGGESTION_LIMIT=20
AI_MAX_OUTPUT_TOKENS=800
AI_REQUEST_TIMEOUT_MS=20000
```

Real secrets belong only in `.env.local` or deployment secrets. Never expose them as `NEXT_PUBLIC_*`.
`.env.local` is ignored by Git.

The OpenAI provider uses only the server-side Responses API. The personal
ChatGPT subscription does not include API usage; the API is billed separately
based on usage. Fichr does not require List models at runtime. The model is read
from `OPENAI_MODEL`.

Recommended OpenAI project permissions for this phase:

- List models: Read.
- Responses: Write.
- Files: None.
- Realtime: None.
- Images: None.
- Embeddings: None.
- Chat completions: None.

This phase does not use OpenAI Files, Realtime, Images, Embeddings, Assistants,
Vector Stores, or Chat Completions.

The ChatGPT personal subscription does not cover API usage. API billing is
separate, and a model visible in ChatGPT is not necessarily available to the
API project. `OPENAI_MODEL` must be a model available to the API key's project.

Only controlled text fields from the product sheet are sent to OpenAI:

- title
- subtitle
- description
- category
- sku
- materials
- origin
- dimensions
- current price
- desired price
- cost price
- target margin
- client notes

Fichr does not send raw CSV rows, complete `draft_data`, complete
`validated_data`, logs, other workspaces, local file paths, secrets, or user
files to OpenAI in this phase. User documents are not stored with OpenAI by
this integration, and this pass does not analyze files, images, or PDFs.

Automated tests may enable the isolated internal test provider with
`AI_PROVIDER="test"`, `FICHR_AI_TEST_PROVIDER_ENABLED="1"`, and
`NODE_ENV="test"`. This provider is server-test-only, never shown in the UI, and
does not represent a real AI integration.

Client data is not reused for training, inspiration, or improvement of models.

## Storage

The prepared tables are:

- `ai_suggestions`: proposed product suggestion drafts, separated from product data.
- `ai_usage_logs`: minimal operational metadata without full product content.

Usage logs must not contain full product sheets, descriptions, raw CSV rows, or validated catalog content.

## Diagnostics

When `/products/[productId]` redirects with `ai_suggestion=failed`, the URL may
also include an `ai_error_code`. The UI shows a safe human message from that
code and never shows the API key, full prompt, stacktrace, raw provider
response, or complete product data.

Error codes:

- `disabled`: AI is disabled.
- `config_error_missing_api_key`: server API key is missing.
- `config_error_missing_model`: server model is missing.
- `provider_error_auth`: provider rejected the API key.
- `provider_error_model_not_found`: configured model is unavailable.
- `provider_error_billing`: API billing or quota appears inactive/refused.
- `provider_error_permission`: API key lacks required permissions.
- `provider_error_rate_limit`: provider rate limited the request.
- `provider_error_network`: network/provider connection failed.
- `provider_error_timeout`: request exceeded `AI_REQUEST_TIMEOUT_MS`.
- `provider_error_invalid_json`: provider response was not valid JSON.
- `provider_error_schema`: JSON was valid but missing required fields.
- `provider_error_safety_rejected`: response invented protected facts.
- `limit_reached_daily`: daily workspace limit reached before provider call.
- `limit_reached_monthly`: monthly workspace limit reached before provider call.
- `failed_unknown`: fallback failure code.

Local diagnosis:

```sh
npm run ai:diagnose
```

This command reads `.env.local` if present, reports whether `OPENAI_API_KEY` is
present without printing it, shows the configured/default limits, checks that
`.env.local` is ignored, and skips network calls by default.

## Usage limits

Fichr checks usage limits before calling OpenAI:

- `AI_DAILY_SUGGESTION_LIMIT`, default `20`.
- `AI_MONTHLY_SUGGESTION_LIMIT`, default `100`.
- `AI_MAX_OUTPUT_TOKENS`, default `800`.
- `AI_REQUEST_TIMEOUT_MS`, default `20000`.

The limit counters are workspace-scoped and count real OpenAI attempts for
`product_suggestion` where usage logs are `complete` or `failed`. Disabled
states and limit-reached states do not consume a provider attempt and do not
create fake suggestions.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import {
  buildServerAiInstruction,
  createAiUsageLogMetadata,
  createProductSuggestionDraft as createProductSuggestionDraftCore,
  getAiStatus,
  getServerAiActionDefinitions,
  sanitizeProductForAi,
  validateAiSuggestion
} from "../src/server/ai/core.ts";
import {
  aiActionTypes,
  aiProtectedTechnicalFacts,
  aiSuggestionStatuses
} from "../src/types/ai.ts";

const workspaceId = "wks_local_development";
const otherWorkspaceId = "wks_ai_other";
const productId = "prd_ai_architecture";
const secretApiKey = "SECRET_AI_KEY_DO_NOT_EXPOSE";
const productContentSentinel = "FULL_PRODUCT_SECRET_DO_NOT_LOG";

function createSchema(db) {
  db.exec(`
    create table users (
      id text primary key,
      email text not null,
      name text,
      password_hash text,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    );

    create table workspaces (
      id text primary key,
      name text not null,
      owner_user_id text not null,
      support_access_enabled integer not null default 0,
      support_access_expires_at text,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    );

    create table workspace_members (
      id text primary key,
      workspace_id text not null,
      user_id text not null,
      role text not null,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    );

    create table products (
      id text primary key,
      workspace_id text not null,
      status text not null,
      title text not null,
      subtitle text,
      category text,
      description text,
      materials text,
      dimensions text,
      origin text,
      current_price real,
      desired_price real,
      cost_price real,
      target_margin real,
      sku text,
      image_url text,
      client_notes text,
      draft_data text,
      validated_data text
    );

    create table ai_suggestions (
      id text primary key,
      workspace_id text not null,
      product_id text,
      type text not null,
      status text not null,
      input_hash text,
      suggestion_data text not null default '{}',
      warnings text not null default '[]',
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    );

    create table ai_usage_logs (
      id text primary key,
      workspace_id text not null,
      provider text not null,
      action text not null,
      status text not null,
      metadata text not null default '{}',
      created_at text not null default CURRENT_TIMESTAMP
    );

    create table product_audits (
      id text primary key,
      workspace_id text not null,
      product_id text not null,
      status text not null,
      score integer not null,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    );
  `);
}

function insertProduct(db, input) {
  db.prepare(
    `insert into products (
      id,
      workspace_id,
      status,
      title,
      subtitle,
      category,
      description,
      materials,
      dimensions,
      origin,
      current_price,
      desired_price,
      cost_price,
      target_margin,
      sku,
      image_url,
      client_notes,
      draft_data,
      validated_data
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.workspaceId,
    input.status ?? "draft",
    input.title,
    input.subtitle ?? null,
    input.category ?? null,
    input.description ?? null,
    input.materials ?? null,
    input.dimensions ?? null,
    input.origin ?? null,
    input.currentPrice ?? null,
    input.desiredPrice ?? null,
    input.costPrice ?? null,
    input.targetMargin ?? null,
    input.sku ?? null,
    input.imageUrl ?? null,
    input.clientNotes ?? null,
    JSON.stringify(input.draftData ?? { title: input.title }),
    input.validatedData ? JSON.stringify(input.validatedData) : null
  );
}

function getWorkspaceProduct(db, targetProductId, targetWorkspaceId) {
  const product = db
    .prepare(
      `select
        id,
        title,
        subtitle,
        category,
        description,
        materials,
        dimensions,
        origin,
        current_price as currentPrice,
        desired_price as desiredPrice,
        cost_price as costPrice,
        target_margin as targetMargin,
        sku,
        image_url as imageUrl,
        client_notes as clientNotes,
        draft_data as draftData,
        validated_data as validatedData
       from products
       where id = ? and workspace_id = ?`
    )
    .get(targetProductId, targetWorkspaceId);

  return product ?? null;
}

function getNextProductStatus(currentStatus, draftData) {
  if (currentStatus === "validated") {
    return "needs_review";
  }

  return draftData.title && draftData.description ? "draft" : "needs_info";
}

function getSuggestionValue(suggestionData, fieldKey) {
  if (fieldKey === "subtitle") {
    return suggestionData.proposed_subtitle;
  }

  if (fieldKey === "description") {
    return suggestionData.proposed_description;
  }

  return null;
}

function applySuggestionFieldForWorkspace(db, input) {
  if (!["subtitle", "description"].includes(input.fieldKey)) {
    return { status: "field_not_allowed" };
  }

  const suggestion = db
    .prepare(
      `select id, product_id as productId, status, suggestion_data as suggestionData
       from ai_suggestions
       where id = ? and workspace_id = ?`
    )
    .get(input.suggestionId, input.workspaceId);

  if (!suggestion) {
    return { status: "not_found" };
  }

  if (suggestion.status !== "proposed") {
    return { status: "not_active" };
  }

  const product = db
    .prepare(
      `select
        id,
        status,
        title,
        subtitle,
        description,
        draft_data as draftData,
        validated_data as validatedData
       from products
       where id = ? and workspace_id = ?`
    )
    .get(suggestion.productId, input.workspaceId);

  if (!product) {
    return { status: "not_found" };
  }

  const suggestionData = JSON.parse(suggestion.suggestionData);
  const suggestedValue = getSuggestionValue(suggestionData, input.fieldKey)?.trim();

  if (!suggestedValue) {
    return { status: "empty_value" };
  }

  const draftData = JSON.parse(product.draftData);
  const nextDraftData = {
    ...draftData,
    [input.fieldKey]: suggestedValue
  };
  const nextStatus = getNextProductStatus(product.status, nextDraftData);

  db.prepare(
    `update products
     set
       subtitle = ?,
       description = ?,
       status = ?,
       draft_data = ?
     where id = ? and workspace_id = ?`
  ).run(
    input.fieldKey === "subtitle" ? suggestedValue : product.subtitle,
    input.fieldKey === "description" ? suggestedValue : product.description,
    nextStatus,
    JSON.stringify(nextDraftData),
    product.id,
    input.workspaceId
  );

  db.prepare(
    `update product_audits
     set status = 'stale', updated_at = CURRENT_TIMESTAMP
     where product_id = ? and workspace_id = ? and status = 'current'`
  ).run(product.id, input.workspaceId);

  const logCount = db
    .prepare(`select count(*) as count from ai_usage_logs`)
    .get().count;

  db.prepare(
    `insert into ai_usage_logs (
      id,
      workspace_id,
      provider,
      action,
      status,
      metadata
    ) values (?, ?, ?, ?, ?, ?)`
  ).run(
    `aiu_apply_${logCount + 1}`,
    input.workspaceId,
    "disabled",
    "apply_suggestion_field",
    "complete",
    JSON.stringify({
      suggestion_id: input.suggestionId,
      product_id: product.id,
      field_key: input.fieldKey,
      previous_product_status: product.status,
      new_product_status: nextStatus,
      status: "applied"
    })
  );

  return {
    nextStatus,
    productId: product.id,
    status: "applied"
  };
}

function dismissSuggestionForWorkspace(db, input) {
  const suggestion = db
    .prepare(
      `select id, product_id as productId, status
       from ai_suggestions
       where id = ? and workspace_id = ?`
    )
    .get(input.suggestionId, input.workspaceId);

  if (!suggestion) {
    return { status: "not_found" };
  }

  const product = db
    .prepare(`select id from products where id = ? and workspace_id = ?`)
    .get(suggestion.productId, input.workspaceId);

  if (!product) {
    return { status: "not_found" };
  }

  if (suggestion.status !== "proposed") {
    return {
      previousStatus: suggestion.status,
      productId: suggestion.productId,
      status: "not_active"
    };
  }

  db.prepare(
    `update ai_suggestions
     set status = 'dismissed', updated_at = CURRENT_TIMESTAMP
     where id = ? and workspace_id = ? and status = 'proposed'`
  ).run(input.suggestionId, input.workspaceId);

  const logCount = db
    .prepare(`select count(*) as count from ai_usage_logs`)
    .get().count;

  db.prepare(
    `insert into ai_usage_logs (
      id,
      workspace_id,
      provider,
      action,
      status,
      metadata
    ) values (?, ?, ?, ?, ?, ?)`
  ).run(
    `aiu_dismiss_${logCount + 1}`,
    input.workspaceId,
    "disabled",
    "dismiss_suggestion",
    "complete",
    JSON.stringify({
      suggestion_id: input.suggestionId,
      product_id: suggestion.productId,
      previous_status: "proposed",
      new_status: "dismissed"
    })
  );

  return {
    productId: suggestion.productId,
    status: "dismissed"
  };
}

async function main() {
  delete process.env.AI_ENABLED;
  delete process.env.AI_PROVIDER;
  delete process.env.FICHR_AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  const disabledStatus = getAiStatus();
  assert.equal(disabledStatus.status, "disabled");
  assert.equal(disabledStatus.provider, "disabled");

  const explicitDisabledStatus = getAiStatus({
    AI_ENABLED: "false",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: secretApiKey,
    OPENAI_MODEL: "gpt-test"
  });
  assert.equal(explicitDisabledStatus.status, "disabled");
  assert.equal(JSON.stringify(explicitDisabledStatus).includes(secretApiKey), false);

  const otherProviderStatus = getAiStatus({
    AI_ENABLED: "true",
    AI_PROVIDER: "future_provider",
    OPENAI_API_KEY: secretApiKey,
    OPENAI_MODEL: "gpt-test"
  });
  assert.equal(JSON.stringify(otherProviderStatus).includes(secretApiKey), false);
  assert.equal(otherProviderStatus.status, "disabled");

  const missingKeyStatus = getAiStatus({
    AI_ENABLED: "true",
    AI_PROVIDER: "openai",
    OPENAI_MODEL: "gpt-test"
  });
  assert.equal(missingKeyStatus.status, "config_error");

  const missingModelStatus = getAiStatus({
    AI_ENABLED: "true",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: secretApiKey
  });
  assert.equal(missingModelStatus.status, "config_error");

  const openAiStatus = getAiStatus({
    AI_ENABLED: "true",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: secretApiKey,
    OPENAI_MODEL: "gpt-test"
  });
  assert.equal(openAiStatus.status, "configured");
  assert.equal(openAiStatus.provider, "openai");

  const blockedTestProviderStatus = getAiStatus({
    AI_PROVIDER: "test",
    FICHR_AI_TEST_PROVIDER_ENABLED: "1",
    NODE_ENV: "development"
  });
  assert.equal(blockedTestProviderStatus.status, "disabled");

  const testProviderStatus = getAiStatus({
    AI_PROVIDER: "test",
    FICHR_AI_TEST_PROVIDER_ENABLED: "1",
    NODE_ENV: "test"
  });
  assert.equal(testProviderStatus.status, "configured");

  const envExample = await readFile(".env.example", "utf8");
  assert.equal(envExample.includes("NEXT_PUBLIC_AI"), false);
  assert.equal(envExample.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false);
  assert.equal(/^OPENAI_API_KEY=$/m.test(envExample), true);
  const gitignore = await readFile(".gitignore", "utf8");
  assert.equal(gitignore.includes(".env.*"), true);
  assert.equal(existsSync("src/app/ai"), false);
  assert.equal(existsSync("src/app/chat"), false);

  const productPageSource = await readFile("src/app/products/[productId]/page.tsx", "utf8");
  assert.equal(productPageSource.includes("Provider :"), false);
  assert.equal(productPageSource.includes("Demander a l IA"), false);
  assert.equal(productPageSource.includes("demander a l IA"), false);
  assert.equal(productPageSource.includes("Préparer une suggestion"), true);
  assert.equal(productPageSource.includes("Rejeter"), true);
  assert.equal(productPageSource.includes("Suggestions rejetées"), true);
  assert.equal(productPageSource.includes("Appliquer ce sous-titre"), true);
  assert.equal(productPageSource.includes("Appliquer cette description"), true);
  assert.equal(
    productPageSource.includes("Aucune suggestion n’a été créée"),
    true
  );
  assert.equal(productPageSource.includes("Suggestion préparée"), true);
  assert.equal(
    productPageSource.includes("La suggestion n’a pas pu être créée"),
    true
  );
  assert.equal(productPageSource.includes("limit_reached_daily"), true);
  assert.equal(productPageSource.includes("provider_error_auth"), true);
  assert.equal(productPageSource.includes("Tout appliquer"), false);
  assert.equal(productPageSource.includes("Appliquer toute"), false);

  const serverAiSources = [
    await readFile("src/server/ai/core.ts", "utf8"),
    await readFile("src/server/ai/product-suggestions.ts", "utf8"),
    await readFile("src/server/ai/actions.ts", "utf8")
  ].join("\n");
  assert.equal(/\bprompt\b/i.test(serverAiSources), false);
  assert.equal(/prompt\s*:/i.test(serverAiSources), false);
  assert.equal(serverAiSources.includes('formData.get("productId")'), true);
  assert.equal(serverAiSources.includes('formData.get("suggestionId")'), true);
  assert.equal(serverAiSources.includes('formData.get("fieldKey")'), true);
  assert.equal(serverAiSources.includes('formData.get("prompt")'), false);
  assert.equal(serverAiSources.includes("formData.get('prompt')"), false);
  assert.equal(serverAiSources.includes("NEXT_PUBLIC_OPENAI_API_KEY"), false);
  assert.equal(serverAiSources.includes("/v1/files"), false);
  assert.equal(serverAiSources.includes("/v1/realtime"), false);
  assert.equal(serverAiSources.includes("/v1/images"), false);
  assert.equal(serverAiSources.includes("/v1/embeddings"), false);
  assert.equal(serverAiSources.includes("/v1/responses"), true);
  assert.equal(serverAiSources.includes("validatedData"), false);

  assert.deepEqual(aiActionTypes, [
    "product_suggestion",
    "missing_fields_review",
    "description_rewrite",
    "pricing_consistency_review"
  ]);
  assert.deepEqual(aiSuggestionStatuses, ["proposed", "dismissed", "failed"]);
  assert.equal(aiSuggestionStatuses.includes("applied"), false);
  assert.equal(aiProtectedTechnicalFacts.includes("supplier"), true);
  assert.equal(aiProtectedTechnicalFacts.includes("legal_or_regulatory"), true);

  const definitions = getServerAiActionDefinitions();
  assert.equal(definitions.length, aiActionTypes.length);
  for (const definition of definitions) {
    assert.equal(definition.serverOnly, true);
    assert.equal(aiActionTypes.includes(definition.action), true);
    assert.equal(definition.instructionTemplate.length > 0, true);
  }
  const instruction = buildServerAiInstruction("product_suggestion");
  assert.equal(instruction.includes("The user cannot provide free-form instructions."), true);
  assert.equal(instruction.includes("Never invent:"), true);
  assert.equal(instruction.includes("draft_data"), true);

  const sanitized = sanitizeProductForAi({
    id: productId,
    title: "Lampe test",
    description: productContentSentinel,
    desiredPrice: 120
  });
  assert.equal(sanitized.productId, productId);
  assert.equal(sanitized.editorial.description?.status, "provided");
  assert.equal(sanitized.factual.materials?.status, "missing");
  assert.equal(sanitized.missingFields.includes("materials"), true);
  assert.equal(sanitized.doNotInvent.includes("origin"), true);

  const disabledDraft = await createProductSuggestionDraftCore({
    aiStatus: disabledStatus,
    product: {
      id: productId,
      title: "Lampe test"
    }
  });
  assert.equal(disabledDraft.status, "disabled");
  assert.equal(disabledDraft.message, "IA non configuree");
  assert.equal("suggestion" in disabledDraft, false);

  const missingKeyDraft = await createProductSuggestionDraftCore({
    aiStatus: missingKeyStatus,
    product: {
      id: productId,
      title: "Lampe test"
    }
  });
  assert.equal(missingKeyDraft.status, "failed");
  assert.equal("suggestion" in missingKeyDraft, false);

  let networkCallCount = 0;
  const noNetworkFetcher = async () => {
    networkCallCount += 1;
    throw new Error("Network must not be called.");
  };
  const disabledNoNetwork = await createProductSuggestionDraftCore({
    env: {
      AI_ENABLED: "false",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: secretApiKey,
      OPENAI_MODEL: "gpt-test"
    },
    fetcher: noNetworkFetcher,
    product: {
      id: productId,
      title: "Lampe test"
    }
  });
  assert.equal(disabledNoNetwork.status, "disabled");
  assert.equal(networkCallCount, 0);

  const inventedSuggestion = validateAiSuggestion(
    {
      confidence_score: 82,
      editorial_notes: [],
      factual_claims: {
        materials: "laiton massif"
      },
      factual_warnings: [],
      missing_fields: sanitized.missingFields,
      non_invention_notice: "Ne pas inventer.",
      possible_inconsistencies: [],
      proposed_description: "Description editoriale proposee",
      questions_to_ask: []
    },
    sanitized
  );
  assert.equal(inventedSuggestion.valid, false);
  assert.equal(
    inventedSuggestion.blockedReasons.some((reason) =>
      reason.includes("materials")
    ),
    true
  );

  const inventedSupplier = validateAiSuggestion(
    {
      confidence_score: 50,
      editorial_notes: [],
      factual_warnings: [],
      missing_fields: sanitized.missingFields,
      non_invention_notice: "Ne pas inventer.",
      possible_inconsistencies: [],
      questions_to_ask: [],
      technical_claims: {
        supplier: "Atelier exemple"
      }
    },
    sanitized
  );
  assert.equal(inventedSupplier.valid, false);
  assert.equal(
    inventedSupplier.blockedReasons.some((reason) =>
      reason.includes("supplier")
    ),
    true
  );

  const safeSuggestion = validateAiSuggestion(
    {
      confidence_score: 45,
      editorial_notes: [],
      factual_warnings: ["Verifier les informations techniques manquantes."],
      missing_fields: sanitized.missingFields,
      non_invention_notice: "Ne pas inventer.",
      possible_inconsistencies: [],
      proposed_subtitle: "A confirmer avec le client",
      questions_to_ask: sanitized.missingFields.map(
        (field) => `${field} a confirmer`
      )
    },
    sanitized
  );
  assert.equal(safeSuggestion.valid, true);

  const testProviderDraft = await createProductSuggestionDraftCore({
    aiStatus: testProviderStatus,
    product: {
      id: productId,
      title: "Lampe test",
      desiredPrice: 120
    }
  });
  assert.equal(testProviderDraft.status, "proposed");
  assert.equal(testProviderDraft.suggestion.missing_fields.includes("materials"), true);
  assert.equal(
    testProviderDraft.suggestion.questions_to_ask.some((question) =>
      question.toLowerCase().includes("matiere")
    ),
    true
  );
  assert.equal(
    testProviderDraft.suggestion.proposed_description?.includes("Matiere a confirmer."),
    true
  );
  assert.equal(
    testProviderDraft.suggestion.proposed_description?.includes("coton"),
    false
  );

  function createOpenAiMockFetch(responseText) {
    return async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, `Bearer ${secretApiKey}`);
      assert.equal(init.body.includes(secretApiKey), false);
      assert.equal(init.body.includes("raw_data"), false);
      assert.equal(init.body.includes("validated_data"), false);
      assert.equal(init.body.includes("draft_data"), false);
      assert.equal(init.body.includes("image_url"), false);

      const body = JSON.parse(init.body);
      assert.equal(body.model, "gpt-test");
      assert.equal(body.max_output_tokens, 800);
      assert.equal(body.text.format.type, "json_object");
      assert.equal(JSON.stringify(body).includes("/v1/files"), false);
      assert.equal(JSON.stringify(body).includes("/v1/realtime"), false);
      assert.equal(JSON.stringify(body).includes("/v1/images"), false);
      assert.equal(JSON.stringify(body).includes("/v1/embeddings"), false);

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: responseText,
            usage: {
              input_tokens: 120,
              output_tokens: 80,
              total_tokens: 200
            }
          };
        }
      };
    };
  }

  const openAiSuggestionJson = JSON.stringify({
    proposed_subtitle: "Piece lumineuse a confirmer",
    proposed_description:
      "Lampe test. Les informations techniques manquantes restent a confirmer.",
    missing_fields: sanitized.missingFields,
    possible_inconsistencies: [],
    questions_to_ask: ["Quelle est la matiere exacte du produit ?"],
    confidence_score: 62,
    factual_warnings: ["Matiere a confirmer."],
    editorial_notes: ["Formulation editoriale proposee sans ajout de fait."],
    non_invention_notice:
      "Les informations techniques absentes n ont pas ete inventees."
  });
  const openAiDraft = await createProductSuggestionDraftCore({
    env: {
      AI_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: secretApiKey,
      OPENAI_MODEL: "gpt-test"
    },
    fetcher: createOpenAiMockFetch(openAiSuggestionJson),
    product: {
      id: productId,
      title: "Lampe test",
      description: productContentSentinel,
      desiredPrice: 120
    }
  });
  assert.equal(openAiDraft.status, "proposed");
  assert.equal(openAiDraft.provider, "openai");
  assert.equal(openAiDraft.model, "gpt-test");
  assert.equal(openAiDraft.tokenUsage?.totalTokens, 200);
  assert.equal(
    openAiDraft.suggestion.proposed_description?.includes("Lampe test"),
    true
  );

  const nonJsonDraft = await createProductSuggestionDraftCore({
    env: {
      AI_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: secretApiKey,
      OPENAI_MODEL: "gpt-test"
    },
    fetcher: createOpenAiMockFetch("not json"),
    product: {
      id: productId,
      title: "Lampe test"
    }
  });
  assert.equal(nonJsonDraft.status, "failed");
  assert.equal("suggestion" in nonJsonDraft, false);

  const incompleteJsonDraft = await createProductSuggestionDraftCore({
    env: {
      AI_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: secretApiKey,
      OPENAI_MODEL: "gpt-test"
    },
    fetcher: createOpenAiMockFetch(
      JSON.stringify({
        proposed_description: "Incomplete"
      })
    ),
    product: {
      id: productId,
      title: "Lampe test"
    }
  });
  assert.equal(incompleteJsonDraft.status, "failed");
  assert.equal("suggestion" in incompleteJsonDraft, false);

  const inventedOpenAiDraft = await createProductSuggestionDraftCore({
    env: {
      AI_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: secretApiKey,
      OPENAI_MODEL: "gpt-test"
    },
    fetcher: createOpenAiMockFetch(
      JSON.stringify({
        proposed_subtitle: "",
        proposed_description: "Lampe en laiton massif.",
        missing_fields: sanitized.missingFields,
        possible_inconsistencies: [],
        questions_to_ask: [],
        confidence_score: 70,
        factual_warnings: [],
        editorial_notes: [],
        non_invention_notice: "Ne pas inventer.",
        factual_claims: {
          materials: "laiton massif"
        }
      })
    ),
    product: {
      id: productId,
      title: "Lampe test"
    }
  });
  assert.equal(inventedOpenAiDraft.status, "failed");
  assert.equal("suggestion" in inventedOpenAiDraft, false);

  const tempDir = await mkdtemp(path.join(tmpdir(), "fichr-ai-architecture-"));
  const databasePath = path.join(tempDir, "ai-architecture.sqlite");
  const db = new Database(databasePath);

  try {
    createSchema(db);
    insertProduct(db, {
      id: productId,
      workspaceId,
      status: "validated",
      title: "Produit IA",
      description: productContentSentinel,
      desiredPrice: 120,
      draftData: {
        title: "Produit IA",
        description: productContentSentinel
      },
      validatedData: {
        title: "Snapshot valide"
      }
    });
    db.prepare(
      `insert into product_audits (
        id,
        workspace_id,
        product_id,
        status,
        score
      ) values (?, ?, ?, ?, ?)`
    ).run("aud_ai_current", workspaceId, productId, "current", 80);
    insertProduct(db, {
      id: "prd_ai_other_workspace",
      workspaceId: otherWorkspaceId,
      title: "Produit autre workspace",
      description: "Hidden product"
    });

    const workspaceProduct = getWorkspaceProduct(db, productId, workspaceId);
    const outsideWorkspaceProduct = getWorkspaceProduct(
      db,
      "prd_ai_other_workspace",
      workspaceId
    );
    assert.notEqual(workspaceProduct, null);
    assert.equal(outsideWorkspaceProduct, null);

    const serviceLikeResult = await createProductSuggestionDraftCore({
      aiStatus: disabledStatus,
      product: workspaceProduct
    });
    assert.equal(serviceLikeResult.status, "disabled");
    assert.equal("suggestion" in serviceLikeResult, false);

    const productBeforeSuggestion = db
      .prepare(
        `select draft_data as draftData, validated_data as validatedData
         from products
         where id = ? and workspace_id = ?`
      )
      .get(productId, workspaceId);

    const suggestionCount = db
      .prepare(`select count(*) as count from ai_suggestions`)
      .get().count;
    assert.equal(suggestionCount, 0);

    const storedSuggestionData =
      testProviderDraft.status === "proposed"
        ? {
            ...testProviderDraft.suggestion,
            proposed_subtitle: "Sous-titre controle",
            proposed_description: "Description editoriale controlee."
          }
        : null;

    if (storedSuggestionData) {
      db.prepare(
        `insert into ai_suggestions (
          id,
          workspace_id,
          product_id,
          type,
          status,
          suggestion_data,
          warnings
        ) values (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "ais_test",
        workspaceId,
        productId,
        "product_suggestion",
        testProviderDraft.status,
        JSON.stringify(storedSuggestionData),
        JSON.stringify(testProviderDraft.warnings)
      );
    }

    const proposedSuggestion = db
      .prepare(
        `select status, suggestion_data as suggestionData
         from ai_suggestions
         where id = ? and workspace_id = ?`
      )
      .get("ais_test", workspaceId);
    assert.equal(proposedSuggestion.status, "proposed");
    const structuredSuggestion = JSON.parse(proposedSuggestion.suggestionData);
    assert.equal(typeof structuredSuggestion.proposed_description, "string");
    assert.equal(Array.isArray(structuredSuggestion.questions_to_ask), true);

    const outsideSuggestion = db
      .prepare(
        `select id from ai_suggestions
         where id = ? and workspace_id = ?`
      )
      .get("ais_test", otherWorkspaceId);
    assert.equal(outsideSuggestion, undefined);

    const rejectedFieldApply = applySuggestionFieldForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId,
      fieldKey: "materials"
    });
    assert.equal(rejectedFieldApply.status, "field_not_allowed");

    const outsideApply = applySuggestionFieldForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId: otherWorkspaceId,
      fieldKey: "subtitle"
    });
    assert.equal(outsideApply.status, "not_found");

    const emptySuggestionData = {
      ...structuredSuggestion,
      proposed_subtitle: ""
    };
    db.prepare(
      `insert into ai_suggestions (
        id,
        workspace_id,
        product_id,
        type,
        status,
        suggestion_data,
        warnings
      ) values (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "ais_empty",
      workspaceId,
      productId,
      "product_suggestion",
      "proposed",
      JSON.stringify(emptySuggestionData),
      "[]"
    );
    const emptyApply = applySuggestionFieldForWorkspace(db, {
      suggestionId: "ais_empty",
      workspaceId,
      fieldKey: "subtitle"
    });
    assert.equal(emptyApply.status, "empty_value");

    const subtitleApply = applySuggestionFieldForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId,
      fieldKey: "subtitle"
    });
    assert.equal(subtitleApply.status, "applied");
    assert.equal(subtitleApply.nextStatus, "needs_review");

    const productAfterSubtitle = db
      .prepare(
        `select
          status,
          draft_data as draftData,
          validated_data as validatedData
         from products
         where id = ? and workspace_id = ?`
      )
      .get(productId, workspaceId);
    const draftAfterSubtitle = JSON.parse(productAfterSubtitle.draftData);
    assert.equal(productAfterSubtitle.status, "needs_review");
    assert.equal(draftAfterSubtitle.subtitle, "Sous-titre controle");
    assert.equal(draftAfterSubtitle.description, productContentSentinel);
    assert.deepEqual(
      JSON.parse(productAfterSubtitle.validatedData),
      JSON.parse(productBeforeSuggestion.validatedData)
    );
    assert.equal(
      db.prepare(`select status from product_audits where id = ?`)
        .get("aud_ai_current").status,
      "stale"
    );

    const descriptionApply = applySuggestionFieldForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId,
      fieldKey: "description"
    });
    assert.equal(descriptionApply.status, "applied");
    const productAfterDescription = db
      .prepare(
        `select draft_data as draftData, validated_data as validatedData
         from products
         where id = ? and workspace_id = ?`
      )
      .get(productId, workspaceId);
    const draftAfterDescription = JSON.parse(productAfterDescription.draftData);
    assert.equal(
      draftAfterDescription.description,
      "Description editoriale controlee."
    );
    assert.equal(draftAfterDescription.subtitle, "Sous-titre controle");
    assert.deepEqual(
      JSON.parse(productAfterDescription.validatedData),
      JSON.parse(productBeforeSuggestion.validatedData)
    );

    const outsideDismiss = dismissSuggestionForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId: otherWorkspaceId
    });
    assert.equal(outsideDismiss.status, "not_found");
    assert.equal(
      db.prepare(`select status from ai_suggestions where id = ?`)
        .get("ais_test").status,
      "proposed"
    );

    const dismissResult = dismissSuggestionForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId
    });
    assert.equal(dismissResult.status, "dismissed");
    assert.equal(dismissResult.productId, productId);
    assert.equal(
      db.prepare(`select status from ai_suggestions where id = ?`)
        .get("ais_test").status,
      "dismissed"
    );

    const dismissLogCount = db
      .prepare(
        `select count(*) as count
         from ai_usage_logs
         where action = 'dismiss_suggestion'`
      )
      .get().count;
    const secondDismissResult = dismissSuggestionForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId
    });
    assert.equal(secondDismissResult.status, "not_active");
    assert.equal(secondDismissResult.previousStatus, "dismissed");
    assert.equal(
      db.prepare(
        `select count(*) as count
         from ai_usage_logs
         where action = 'dismiss_suggestion'`
      ).get().count,
      dismissLogCount
    );

    const dismissedApply = applySuggestionFieldForWorkspace(db, {
      suggestionId: "ais_test",
      workspaceId,
      fieldKey: "subtitle"
    });
    assert.equal(dismissedApply.status, "not_active");

    const serviceLikeSanitized = sanitizeProductForAi(workspaceProduct);
    const usageMetadata = createAiUsageLogMetadata({
      productId,
      missingFieldCount: serviceLikeSanitized.missingFields.length,
      suggestionId: null,
      status: serviceLikeResult.status
    });
    db.prepare(
      `insert into ai_usage_logs (
        id,
        workspace_id,
        provider,
        action,
        status,
        metadata
      ) values (?, ?, ?, ?, ?, ?)`
    ).run(
      "aiu_test",
      workspaceId,
      disabledStatus.provider,
      "product_suggestion",
      serviceLikeResult.status,
      JSON.stringify(usageMetadata)
    );

    const usageLogs = db.prepare(`select * from ai_usage_logs`).all();
    assert.equal(usageLogs.length, 4);
    const productSuggestionLog = usageLogs.find(
      (log) => log.action === "product_suggestion"
    );
    const dismissSuggestionLog = usageLogs.find(
      (log) => log.action === "dismiss_suggestion"
    );
    const applySuggestionLogs = usageLogs.filter(
      (log) => log.action === "apply_suggestion_field"
    );
    assert.notEqual(productSuggestionLog, undefined);
    assert.notEqual(dismissSuggestionLog, undefined);
    assert.equal(applySuggestionLogs.length, 2);
    assert.equal(productSuggestionLog.workspace_id, workspaceId);
    assert.equal(productSuggestionLog.status, "disabled");
    assert.equal(dismissSuggestionLog.workspace_id, workspaceId);
    assert.equal(dismissSuggestionLog.status, "complete");
    assert.equal(
      JSON.parse(dismissSuggestionLog.metadata).suggestion_id,
      "ais_test"
    );
    const serializedLogs = JSON.stringify(usageLogs);
    assert.equal(serializedLogs.includes(productContentSentinel), false);
    assert.equal(serializedLogs.includes(secretApiKey), false);
    assert.equal(serializedLogs.includes("proposed_description"), false);
    assert.equal(serializedLogs.includes("Description editoriale controlee."), false);
    assert.equal(serializedLogs.includes("Sous-titre controle"), false);
    assert.equal(
      serializedLogs.includes(structuredSuggestion.proposed_description),
      false
    );

    const productAfterSuggestion = db
      .prepare(
        `select draft_data as draftData, validated_data as validatedData
         from products
         where id = ? and workspace_id = ?`
      )
      .get(productId, workspaceId);
    assert.deepEqual(
      JSON.parse(productAfterSuggestion.validatedData),
      JSON.parse(productBeforeSuggestion.validatedData)
    );

    console.log("AI architecture coverage passed.");
  } finally {
    db.close();
    await rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const metabaseDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const automationEnv = fs.readFileSync(
  path.join(metabaseDirectory, ".automation.env"),
  "utf8",
);
const apiKey = automationEnv
  .split(/\r?\n/)
  .find((line) => line.startsWith("METABASE_API_KEY="))
  ?.slice("METABASE_API_KEY=".length)
  .trim()
  .replace(/^['"]|['"]$/g, "");

if (!apiKey) {
  throw new Error("Thiếu METABASE_API_KEY trong apps/metabase/.automation.env.");
}

const baseUrl = "http://localhost:3001";

async function metabaseRequest(endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Metabase ${options.method ?? "GET"} ${endpoint} trả về ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

function fieldReference(fieldId, baseType, extra = {}) {
  return [
    "field",
    {
      "base-type": baseType,
      "effective-type": baseType,
      "lib/uuid": randomUUID(),
      ...extra,
    },
    fieldId,
  ];
}

function mbqlQuery(databaseId, tableId, definition) {
  const stage = {
    "lib/type": "mbql.stage/mbql",
    "source-table": tableId,
    aggregation: definition.aggregation,
  };

  if (definition.breakout) stage.breakout = definition.breakout;
  if (definition.filters) stage.filters = definition.filters;

  return {
    database: databaseId,
    "lib/type": "mbql/query",
    stages: [stage],
  };
}

function equalsFilter(fieldId, baseType, value) {
  return [
    "=",
    { "lib/uuid": randomUUID() },
    fieldReference(fieldId, baseType),
    value,
  ];
}

function countAggregation() {
  return [["count", { "lib/uuid": randomUUID() }]];
}

async function findOrCreateCollection() {
  const name = "Admission CRM - Báo cáo thống kê";
  const collections = await metabaseRequest("/api/collection");
  const existing = collections.find(
    (collection) => collection.name === name && !collection.archived,
  );
  if (existing) return existing;

  return metabaseRequest("/api/collection", {
    method: "POST",
    body: {
      name,
      description:
        "Dashboard và câu hỏi báo cáo an toàn của Admission CRM. Chỉ sử dụng reporting schema.",
      parent_id: null,
    },
  });
}

async function findOrCreateDashboard(collectionId) {
  const name = "Dashboard Sale và pipeline";
  const dashboards = await metabaseRequest("/api/dashboard");
  const existing = dashboards.find(
    (dashboard) =>
      dashboard.name === name && dashboard.collection_id === collectionId,
  );
  const parameters = [
    {
      id: "scope_key",
      name: "Phạm vi dữ liệu",
      slug: "scope_key",
      type: "string/=",
      sectionId: "string",
      required: true,
    },
    {
      id: "institution_program_id",
      name: "Chương trình tuyển sinh",
      slug: "institution_program_id",
      type: "string/=",
      sectionId: "string",
      required: true,
    },
  ];

  if (!existing) {
    return metabaseRequest("/api/dashboard", {
      method: "POST",
      body: {
        name,
        description:
          "Theo dõi lead, hồ sơ, sinh viên, doanh thu và pipeline theo phạm vi CRM được cấp.",
        collection_id: collectionId,
        parameters,
      },
    });
  }

  return metabaseRequest(`/api/dashboard/${existing.id}`, {
    method: "PUT",
    body: { parameters },
  });
}

async function upsertCard({ collectionId, dashboardId, definition }) {
  const cards = await metabaseRequest("/api/card?f=all");
  const existing = cards.find(
    (card) =>
      card.name === definition.name &&
      card.collection_id === collectionId &&
      !card.archived,
  );
  const body = {
    name: definition.name,
    description: definition.description,
    collection_id: collectionId,
    dataset_query: definition.datasetQuery,
    display: definition.display,
    visualization_settings: definition.visualizationSettings ?? {},
  };

  if (existing) {
    const updated = await metabaseRequest(`/api/card/${existing.id}`, {
      method: "PUT",
      body,
    });
    const dashboards = await metabaseRequest(`/api/card/${existing.id}/dashboards`);
    if (dashboards.some((item) => item.id === dashboardId)) return updated;

    // This can happen if a previous setup run was interrupted between saving
    // the questions and publishing the dashboard. Archive only that script-owned
    // intermediate card, then recreate it directly on the dashboard.
    await metabaseRequest(`/api/card/${existing.id}`, {
      method: "PUT",
      body: { archived: true },
    });
  }

  return metabaseRequest("/api/card", {
    method: "POST",
    body: {
      ...body,
      dashboard_id: dashboardId,
      size: { size_x: definition.sizeX, size_y: definition.sizeY },
    },
  });
}

function parameterMappings(cardId, fields) {
  return [
    {
      card_id: cardId,
      parameter_id: "scope_key",
      target: [
        "dimension",
        ["field", fields.scopeKey.id, { "base-type": fields.scopeKey.baseType }],
        { "stage-number": 0 },
      ],
    },
    {
      card_id: cardId,
      parameter_id: "institution_program_id",
      target: [
        "dimension",
        [
          "field",
          fields.institutionProgramId.id,
          { "base-type": fields.institutionProgramId.baseType },
        ],
        { "stage-number": 0 },
      ],
    },
  ];
}

async function main() {
  const currentUser = await metabaseRequest("/api/user/current");
  if (!currentUser.is_superuser) {
    throw new Error("API key tạm thời phải thuộc nhóm Administrators.");
  }

  const databases = await metabaseRequest("/api/database");
  const database = databases.data.find(
    (item) => item.name === "Admission CRM Reporting",
  );
  if (!database) throw new Error("Không tìm thấy Admission CRM Reporting.");

  const metadata = await metabaseRequest(`/api/database/${database.id}/metadata`);
  const table = metadata.tables.find(
    (item) =>
      item.schema === "reporting" && item.name === "sale_pipeline_scope_fact",
  );
  if (!table) throw new Error("Không tìm thấy reporting.sale_pipeline_scope_fact.");

  const field = (name) => {
    const result = table.fields.find((item) => item.name === name);
    if (!result) throw new Error(`Thiếu reporting field ${name}.`);
    return { id: result.id, baseType: result.base_type };
  };
  const fields = {
    scopeKey: field("scope_key"),
    institutionProgramId: field("institution_program_id"),
    pipelineStageName: field("pipeline_stage_name"),
    sourceName: field("source_name"),
    leadDate: field("lead_date"),
    hasApplication: field("has_application"),
    hasStudent: field("has_student"),
    monthlyRevenue: field("monthly_revenue"),
  };

  const collection = await findOrCreateCollection();
  const dashboard = await findOrCreateDashboard(collection.id);
  const definitions = [
    {
      name: "Tổng số lead",
      description: "Số lead trong phạm vi được cấp.",
      display: "scalar",
      sizeX: 6,
      sizeY: 4,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: countAggregation(),
      }),
    },
    {
      name: "Lead ở tiến trình hồ sơ (L3)",
      description: "Số lead hiện đang ở tiến trình Đăng ký học (L3), được coi là đã có hồ sơ.",
      display: "scalar",
      sizeX: 6,
      sizeY: 4,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: countAggregation(),
        filters: [
          equalsFilter(fields.hasApplication.id, fields.hasApplication.baseType, true),
        ],
      }),
    },
    {
      name: "Sinh viên nhập học",
      description: "Số lead đã chuyển thành sinh viên.",
      display: "scalar",
      sizeX: 6,
      sizeY: 4,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: countAggregation(),
        filters: [equalsFilter(fields.hasStudent.id, fields.hasStudent.baseType, true)],
      }),
    },
    {
      name: "Doanh thu tháng",
      description: "Tổng doanh thu tháng, không chứa dữ liệu định danh người học.",
      display: "scalar",
      sizeX: 6,
      sizeY: 4,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: [
          [
            "sum",
            { "lib/uuid": randomUUID() },
            fieldReference(
              fields.monthlyRevenue.id,
              fields.monthlyRevenue.baseType,
            ),
          ],
        ],
      }),
    },
    {
      name: "Lead theo giai đoạn pipeline",
      description: "Phân bổ lead theo giai đoạn pipeline hiện tại.",
      display: "bar",
      sizeX: 12,
      sizeY: 7,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: countAggregation(),
        breakout: [
          fieldReference(
            fields.pipelineStageName.id,
            fields.pipelineStageName.baseType,
          ),
        ],
      }),
    },
    {
      name: "Lead theo nguồn",
      description: "Phân bổ lead theo nguồn tiếp cận.",
      display: "bar",
      sizeX: 12,
      sizeY: 7,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: countAggregation(),
        breakout: [fieldReference(fields.sourceName.id, fields.sourceName.baseType)],
      }),
    },
    {
      name: "Xu hướng lead theo tháng",
      description: "Số lead mới theo tháng.",
      display: "line",
      sizeX: 24,
      sizeY: 7,
      datasetQuery: mbqlQuery(database.id, table.id, {
        aggregation: countAggregation(),
        breakout: [
          fieldReference(fields.leadDate.id, fields.leadDate.baseType, {
            "temporal-unit": "month",
          }),
        ],
      }),
    },
  ];

  const cards = [];
  for (const definition of definitions) {
    cards.push(
      await upsertCard({
        collectionId: collection.id,
        dashboardId: dashboard.id,
        definition,
      }),
    );
  }

  const refreshedDashboard = await metabaseRequest(`/api/dashboard/${dashboard.id}`);
  const positions = [
    { row: 0, col: 0, size_x: 6, size_y: 4 },
    { row: 0, col: 6, size_x: 6, size_y: 4 },
    { row: 0, col: 12, size_x: 6, size_y: 4 },
    { row: 0, col: 18, size_x: 6, size_y: 4 },
    { row: 4, col: 0, size_x: 12, size_y: 7 },
    { row: 4, col: 12, size_x: 12, size_y: 7 },
    { row: 11, col: 0, size_x: 24, size_y: 7 },
  ];
  const dashcards = cards.map((card, index) => {
    const dashcard = refreshedDashboard.dashcards.find(
      (item) => item.card_id === card.id,
    );
    if (!dashcard) {
      throw new Error(`Card ${card.id} chưa được gắn vào dashboard ${dashboard.id}.`);
    }
    return {
      id: dashcard.id,
      card_id: card.id,
      ...positions[index],
      parameter_mappings: parameterMappings(card.id, fields),
      series: [],
    };
  });

  const embeddedDashboard = await metabaseRequest(`/api/dashboard/${dashboard.id}`, {
    method: "PUT",
    body: {
      parameters: refreshedDashboard.parameters,
      dashcards,
      enable_embedding: true,
      embedding_type: "static",
      embedding_params: {
        scope_key: "locked",
        institution_program_id: "locked",
      },
      width: "full",
    },
  });

  console.log(
    JSON.stringify({
      databaseId: database.id,
      collectionId: collection.id,
      dashboardId: embeddedDashboard.id,
      cards: cards.map((card) => ({ id: card.id, name: card.name })),
      embeddingEnabled: embeddedDashboard.enable_embedding,
      embeddingParams: embeddedDashboard.embedding_params,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { duplicateMarketingFormField } from "../src/modules/marketing/marketing-form-builder-model";
import {
  marketingFormDefaults,
  reconcileMarketingFormValues,
  validateMarketingFormValues,
} from "../src/modules/marketing/marketing-form-fill-model";
import type { MarketingFormField } from "../src/modules/marketing/marketing-reference.types";
import type { PublicMarketingFormConfig } from "../src/modules/marketing/marketing-reference.types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketingFormFill } from "../src/modules/marketing/marketing-form-fill";
import { test } from "node:test";
import {
  isMarketingFormValueAllowed,
  isMarketingFormValueEmpty,
} from "../src/modules/marketing/marketing-form-public-values";
import { stripHiddenMarketingFormAnswers } from "@admission-crm/shared/marketing-form-visibility";
test("Other stays structured, validates text and clears all content when hidden", () => {
  const field = {
    ...question,
    fieldKey: "choice",
    crmMappingField: null,
    leadField: null,
    validationRules: { allowOther: true },
  };
  const answer = { kind: "other" as const, text: "Nội dung riêng" };
  assert.deepEqual(
    validateMarketingFormValues([field], { choice: answer }),
    {},
  );
  assert.ok(
    validateMarketingFormValues([{ ...field, isRequired: false }], {
      choice: { kind: "other", text: "" },
    }).choice,
  );
  assert.ok(
    validateMarketingFormValues([{ ...field, validationRules: {} }], {
      choice: answer,
    }).choice,
  );
  const parent = {
    ...field,
    fieldKey: "kind",
    fieldType: "text" as const,
    validationRules: {},
  };
  const conditional = {
    ...field,
    validationRules: {
      allowOther: true,
      visibility: { parentFieldKey: "kind", operator: "equals", value: "yes" },
    },
  };
  const cleared = reconcileMarketingFormValues([parent, conditional], {
    kind: "no",
    choice: answer,
  });
  assert.equal(cleared.choice, "");
  assert.deepEqual(
    stripHiddenMarketingFormAnswers([parent, conditional], {
      kind: "no",
      choice: answer,
    }),
    { kind: "no" },
  );
});
test("Other renders as a dedicated option, not a fabricated regular option value", () => {
  const field = {
    ...question,
    fieldType: "radio" as const,
    crmMappingField: null,
    leadField: null,
    validationRules: { allowOther: true },
  };
  const form: PublicMarketingFormConfig = {
    id: "fixture",
    name: "Fixture",
    formType: "survey",
    title: "Khảo sát",
    description: null,
    submitButtonLabel: "Gửi thử",
    platform: null,
    campaign: null,
    fields: [field],
  };
  const html = renderToStaticMarkup(
    createElement(MarketingFormFill, { mode: "preview", form }),
  );
  assert.ok(html.includes("Khác"));
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.equal(
    html.includes("Nội dung Khác"),
    false,
    "Free text appears only after selecting Other.",
  );
});
test("rating shares bounded validation and exposes native keyboard-accessible stars", () => {
  const rating = {
    ...question,
    fieldKey: "score",
    fieldType: "rating" as const,
    label: "Mức hài lòng",
    options: [],
    crmMappingField: null,
    leadField: null,
    validationRules: { ratingMax: 10 },
    defaultValue: "3",
  };
  const form: PublicMarketingFormConfig = {
    id: "fixture",
    name: "Fixture",
    formType: "survey",
    title: "Khảo sát",
    description: null,
    submitButtonLabel: "Gửi thử",
    platform: null,
    campaign: null,
    fields: [rating],
  };
  assert.deepEqual(validateMarketingFormValues([rating], { score: "10" }), {});
  for (const score of ["", "11", "-1", "1.5", "1e0", ["3"]])
    assert.ok(validateMarketingFormValues([rating], { score }).score);
  assert.deepEqual(
    validateMarketingFormValues([{ ...rating, isRequired: false }], {
      score: "",
    }),
    {},
  );
  const html = renderToStaticMarkup(
    createElement(MarketingFormFill, { mode: "preview", form }),
  );
  assert.equal((html.match(/type="radio"/g) ?? []).length, 10);
  assert.ok(html.includes('aria-label="10 trên 10 sao"'));
  assert.ok(html.includes("Đã chọn 3 / 10 sao"));
  assert.equal(html.includes('type="rating"'), false);
});
test("multiple choice uses arrays, preserving comma-containing answers", () => {
  const answer = ["Quản trị, kinh doanh", "Kế toán"];
  assert.equal(isMarketingFormValueAllowed(answer, answer, true), true);
  assert.equal(isMarketingFormValueEmpty(answer), false);
  assert.deepEqual(structuredClone({ answer }).answer, answer);
  assert.equal(isMarketingFormValueAllowed("Kế toán", answer, true), false);
  assert.equal(isMarketingFormValueAllowed(["Sai"], answer, true), false);
});
test("empty optional values and scalar selections are checked separately", () => {
  assert.equal(isMarketingFormValueEmpty([]), true);
  assert.equal(isMarketingFormValueEmpty("  "), true);
  assert.equal(isMarketingFormValueAllowed([], ["a"], true), true);
  assert.equal(isMarketingFormValueAllowed("a", ["a"], false), true);
  assert.equal(isMarketingFormValueAllowed(["a"], ["a"], false), false);
});

const question: MarketingFormField = {
  id: "original",
  fieldKey: "question",
  label: "Ngành quan tâm",
  placeholder: "",
  fieldType: "select",
  isRequired: true,
  options: [{ value: "a", label: "Ngành A" }],
  sortOrder: 0,
  isActive: true,
  crmMappingField: "major_id",
  leadField: "major_id",
};
test("duplicating creates an independent question with unique key and no CRM target", () => {
  const copy = duplicateMarketingFormField(question, [
    question,
    { ...question, fieldKey: "question_copy_1" },
  ]);
  assert.equal(copy.fieldKey, "question_copy_2");
  assert.equal(copy.id, undefined);
  assert.equal(copy.crmMappingField, null);
  assert.equal(copy.leadField, null);
  (copy.options[0] as { label: string }).label = "Changed copy";
  assert.equal((question.options[0] as { label: string }).label, "Ngành A");
  assert.equal(question.id, "original");
});
test("preview/public share defaults and required/option validation", () => {
  const multiple = {
    ...question,
    fieldKey: "multiple",
    fieldType: "multi_select" as const,
    defaultValue: "a",
  };
  assert.deepEqual(marketingFormDefaults([multiple]), { multiple: ["a"] });
  assert.deepEqual(
    validateMarketingFormValues([question], { question: "a" }),
    {},
  );
  assert.ok(validateMarketingFormValues([question], { question: "" }).question);
  assert.ok(
    validateMarketingFormValues([question], { question: "forged" }).question,
  );
  assert.ok(
    validateMarketingFormValues([multiple], { multiple: "a" }).multiple,
  );
});
test("changing an ancestor clears dependent child and grandchild, regardless of field order", () => {
  const parent = { ...question, fieldKey: "parent" };
  const child = {
    ...question,
    fieldKey: "child",
    options: ["b"],
    validationRules: {
      dependency: { parentFieldKey: "parent", optionMap: { a: ["b"] } },
    },
  };
  const grandchild = {
    ...question,
    fieldKey: "grandchild",
    options: ["c"],
    validationRules: {
      dependency: { parentFieldKey: "child", optionMap: { b: ["c"] } },
    },
  };
  const original = { parent: "other", child: "b", grandchild: "c" };
  assert.deepEqual(
    reconcileMarketingFormValues([grandchild, child, parent], original),
    { parent: "other", child: "", grandchild: "" },
  );
  assert.deepEqual(original, { parent: "other", child: "b", grandchild: "c" });
});

test("shared renderer exposes Vietnamese labels and a preview-only contract", () => {
  const form: PublicMarketingFormConfig = {
    id: "fixture",
    name: "Fixture",
    formType: "survey",
    title: "Khảo sát thử",
    description: null,
    submitButtonLabel: "Gửi thử",
    platform: null,
    campaign: null,
    fields: [question],
  };
  const html = renderToStaticMarkup(
    createElement(MarketingFormFill, { mode: "preview", form }),
  );
  assert.ok(html.includes("không ghi dữ liệu CRM"));
  assert.ok(html.includes("Ngành quan tâm"));
  assert.equal(
    html.includes('class="sr-only"'),
    false,
    "Labels must be visible, not placeholder-only.",
  );
  assert.ok(
    html.includes('role="combobox"'),
    "Closed Radix select exposes its trigger; options mount on opening.",
  );
});

test("choice questions expose semantic legends and focusable validation groups", () => {
  for (const fieldType of ["radio", "checkbox"] as const) {
    const form: PublicMarketingFormConfig = {
      id: "fixture",
      name: "Fixture",
      formType: "survey",
      title: "Khảo sát thử",
      description: null,
      submitButtonLabel: "Gửi thử",
      platform: null,
      campaign: null,
      fields: [{ ...question, fieldType }],
    };
    const html = renderToStaticMarkup(
      createElement(MarketingFormFill, { mode: "preview", form }),
    );
    assert.match(
      html,
      /<fieldset[^>]*id="public-field-question"[^>]*tabindex="-1"[^>]*aria-invalid="false"[^>]*aria-describedby="public-field-question-error"/,
    );
    assert.match(html, /<legend[^>]*>Ngành quan tâm<\/legend>/);
    assert.ok(html.includes(`type="${fieldType}"`));
  }
});
test("question descriptions are escaped, linked to every control, and hidden with their question", () => {
  const description = 'Hướng dẫn\n<script>alert("x")</script>';
  for (const fieldType of [
    "text",
    "textarea",
    "select",
    "radio",
    "checkbox",
  ] as const) {
    const field = {
      ...question,
      fieldType,
      validationRules: { questionDescription: description },
    };
    const form: PublicMarketingFormConfig = {
      id: "fixture",
      name: "Fixture",
      formType: "survey",
      title: "Khảo sát",
      description: null,
      submitButtonLabel: "Gửi thử",
      platform: null,
      campaign: null,
      fields: [field],
    };
    for (const mode of ["preview", "public"] as const) {
      const props =
        mode === "preview"
          ? { mode, form }
          : { mode, form, onSubmit: () => undefined, isPending: false };
      const html = renderToStaticMarkup(
        createElement(MarketingFormFill, props),
      );
      assert.ok(html.includes('id="public-field-question-description"'));
      assert.ok(
        html.includes(
          'aria-describedby="public-field-question-description public-field-question-error"',
        ),
      );
      assert.ok(html.includes("&lt;script&gt;"));
      assert.equal(html.includes("<script>"), false);
    }
  }
  const parent = {
    ...question,
    fieldKey: "parent",
    fieldType: "text" as const,
    defaultValue: "no",
    validationRules: {},
  };
  const child = {
    ...question,
    validationRules: {
      questionDescription: description,
      visibility: {
        parentFieldKey: "parent",
        operator: "equals",
        value: "yes",
      },
    },
  };
  const form: PublicMarketingFormConfig = {
    id: "fixture",
    name: "Fixture",
    formType: "survey",
    title: "Khảo sát",
    description: null,
    submitButtonLabel: "Gửi thử",
    platform: null,
    campaign: null,
    fields: [parent, child],
  };
  assert.equal(
    renderToStaticMarkup(
      createElement(MarketingFormFill, { mode: "preview", form }),
    ).includes('id="public-field-question-description"'),
    false,
  );
});

test("multi-page renderer shows only first-page questions and semantic groups", () => {
  const form: PublicMarketingFormConfig = {
    id: "fixture",
    name: "Fixture",
    formType: "survey",
    title: "Khảo sát thử",
    description: null,
    submitButtonLabel: "Gửi thử",
    platform: null,
    campaign: null,
    displaySettings: {
      surveyLayout: {
        version: 1,
        pages: [
          { id: "first", title: "Liên hệ" },
          { id: "second", title: "Khảo sát" },
        ],
        groups: [{ id: "group", pageId: "first", title: "Nhóm thông tin" }],
      },
    },
    fields: [
      {
        ...question,
        fieldType: "text",
        validationRules: { formLayout: { pageId: "first", groupId: "group" } },
      },
      {
        ...question,
        fieldKey: "later",
        label: "Câu hỏi trang sau",
        validationRules: { formLayout: { pageId: "second" } },
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(MarketingFormFill, { mode: "preview", form }),
  );
  assert.ok(html.includes("Trang 1 / 2"));
  assert.match(html, /<legend[^>]*>Nhóm thông tin<\/legend>/);
  assert.ok(html.includes("Tiếp tục"));
  assert.equal(html.includes("Câu hỏi trang sau"), false);
  const invalid = renderToStaticMarkup(
    createElement(MarketingFormFill, {
      mode: "preview",
      form: { ...form, displaySettings: { surveyLayout: null } },
    }),
  );
  assert.ok(invalid.includes('role="alert"'));
  assert.equal(invalid.includes("<form"), false);
});

test("hidden required answers are cleared, never resurrect on showing, and omitted from payload/renderer", () => {
  const parent = {
    ...question,
    fieldKey: "kind",
    label: "Cần tư vấn",
    fieldType: "text" as const,
    defaultValue: "no",
    validationRules: {},
    crmMappingField: null,
    leadField: null,
  };
  const child = {
    ...parent,
    fieldKey: "details",
    label: "Nội dung ẩn",
    defaultValue: "old default",
    validationRules: {
      visibility: { parentFieldKey: "kind", operator: "equals", value: "yes" },
    },
  };
  const fields = [parent, child];
  const hidden = reconcileMarketingFormValues(fields, {
    kind: "no",
    details: "old answer",
  });
  assert.equal(hidden.details, "");
  assert.deepEqual(validateMarketingFormValues(fields, hidden), {});
  assert.deepEqual(stripHiddenMarketingFormAnswers(fields, hidden), {
    kind: "no",
  });
  const shown = reconcileMarketingFormValues(fields, {
    ...hidden,
    kind: "yes",
  });
  assert.equal(shown.details, "");
  assert.ok(
    validateMarketingFormValues([child], shown, fields).details,
    "Page validation sees the parent from another page.",
  );
  const form: PublicMarketingFormConfig = {
    id: "fixture",
    name: "Fixture",
    formType: "survey",
    title: "Khảo sát",
    description: null,
    submitButtonLabel: "Gửi thử",
    platform: null,
    campaign: null,
    fields,
  };
  const html = renderToStaticMarkup(
    createElement(MarketingFormFill, { mode: "preview", form }),
  );
  assert.equal(html.includes("Nội dung ẩn"), false);
  assert.equal(html.includes("old default"), false);
});

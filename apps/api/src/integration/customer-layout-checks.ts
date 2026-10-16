import assert from "node:assert/strict";
import type { DisplayLayout } from "@admission-crm/shared/display-layout";
import type { AuthUser } from "../modules/auth/auth.types";
import {
  createLayout,
  effectiveLayout,
  listLayouts,
  saveLayout,
} from "../modules/display-layouts/display-layout.service";
import {
  savePersonalLayout,
  resetPersonalLayout,
} from "../modules/display-layouts/personal-display-layout.service";

export async function checkCustomerLayouts(
  actor: AuthUser,
  sale: AuthUser,
  programId: string,
  publish: (item: DisplayLayout) => Promise<DisplayLayout>,
) {
  const leadBefore = await effectiveLayout(sale, programId);
  let customer = await publish(
    await createLayout(
      actor,
      programId,
      null,
      {
        name: "[TEST] Khách hàng riêng",
        targets: [{ type: "USER", id: sale.id }],
        visibleFields: ["fullName", "email", "source"],
        pinnedFields: ["fullName"],
        columnWidths: { fullName: 280 },
        personalization: {
          visibility: true,
          order: true,
          pinning: true,
          widths: true,
        },
      },
      undefined,
      "CUSTOMER_LIST",
    ),
  );
  const effective = await effectiveLayout(
    sale,
    programId,
    undefined,
    "CUSTOMER_LIST",
  );
  assert.equal(effective.baseTemplateId, customer.id);
  assert.deepEqual(effective.visibleFields, customer.draft.visibleFields);
  assert.deepEqual(effective.pinnedFields, ["fullName"]);
  assert.deepEqual(await effectiveLayout(sale, programId), leadBefore);
  const input = {
    revision: 0,
    baseTemplateId: customer.id,
    baseVersion: customer.publishedVersion,
    presentation: {
      visibleFields: ["source", "fullName"],
      pinnedFields: ["source"],
      columnWidths: { source: 190 },
    },
  };
  const personal = await savePersonalLayout(
    sale,
    programId,
    input,
    undefined,
    "CUSTOMER_LIST",
  );
  assert.ok(personal.personalized);
  assert.deepEqual(personal.visibleFields, ["source", "fullName"]);
  assert.deepEqual(await effectiveLayout(sale, programId), leadBefore);
  await assert.rejects(
    () => savePersonalLayout(sale, programId, input),
    /đã thay đổi/,
  );
  await assert.rejects(
    () =>
      resetPersonalLayout(
        sale,
        programId,
        leadBefore.personalRevision,
        undefined,
        "CUSTOMER_LIST",
      ),
    /đã thay đổi/,
  );
  const reset = await resetPersonalLayout(
    sale,
    programId,
    personal.personalRevision,
    undefined,
    "CUSTOMER_LIST",
  );
  assert.equal(reset.personalized, false);
  assert.deepEqual(await effectiveLayout(sale, programId), leadBefore);
  customer = await saveLayout(
    actor,
    programId,
    customer.id,
    customer.revision,
    {
      ...customer.draft,
      visibleFields: ["fullName", "source"],
      columnWidths: {},
      pinnedFields: [],
    },
  );
  await publish(customer);
  assert.deepEqual(await effectiveLayout(sale, programId), leadBefore);
  const customerList = await listLayouts(
    actor,
    programId,
    1,
    "",
    "CUSTOMER_LIST",
  );
  assert.ok(customerList.data.every((item) => item.screen === "CUSTOMER_LIST"));
  assert.ok(
    !(await listLayouts(actor, programId, 1, "", "LEAD_LIST")).data.some(
      (item) => item.id === customer.id,
    ),
  );
  console.log(
    "PASS independent customer/lead publication, personalization, reset, screen mismatch and list filtering",
  );
}

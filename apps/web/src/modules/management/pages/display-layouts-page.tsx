import { PageLoadingBoundary } from "@/components/shared/page-loading-state";
import {
  DisplayLayoutList,
  SelectedDisplayLayout,
} from "../display-layout/display-layout-list";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  layoutScreens,
  layoutScreenLabels,
  type LayoutScreen,
} from "@admission-crm/shared/display-layout";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import {
  getDisplayLayout,
  getDisplayLayouts,
} from "@/services/display-layout.service";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";

export function DisplayLayoutsPage() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  return (
    <DisplayLayoutsWorkspace key={`${selectedProgramId}-${auth.user?.id}`} />
  );
}
function DisplayLayoutsWorkspace() {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [params, setParams] = useSearchParams();
  const selected = params.get("template");
  const screen = layoutScreens.includes(params.get("screen") as LayoutScreen)
    ? (params.get("screen") as LayoutScreen)
    : "LEAD_LIST";
  const [state, setState] = useState({ page: 1, search: "" });
  const search = useDeferredValue(state.search);
  const list = useQuery({
    queryKey: [
      "display-layouts",
      selectedProgramId,
      auth.user?.id,
      state.page,
      search,
      screen,
    ],
    queryFn: () =>
      getDisplayLayouts(auth.accessToken!, state.page, search, screen),
  });
  const detail = useQuery({
    queryKey: ["display-layout-open", selectedProgramId, selected],
    queryFn: () => getDisplayLayout(auth.accessToken!, selected!),
    enabled: Boolean(selected && selected !== "new"),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <PageLoadingBoundary variant="settings" queries={[list]}>
      <div className="mx-auto flex w-full min-w-0 max-w-400 flex-col gap-6">
      <PageHeader
        eyebrow="Quản trị"
        title="Cấu hình hiển thị"
        description="Sắp xếp, ẩn hoặc hiện trường dữ liệu; áp dụng theo phòng ban hoặc từng Sale."
        actions={
          <Button
            type="button"
            onClick={() =>
              setParams({ screen, template: "new", draft: crypto.randomUUID() })
            }
          >
            Tạo mẫu
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Mẫu giao diện</CardTitle>
          <CardDescription>
            Các mẫu thuộc chương trình đang chọn và phạm vi bạn được quản lý.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details key={selected ?? "templates"} open={!selected}>
            <summary className="cursor-pointer rounded-sm py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              {selected
                ? "Đổi màn hình hoặc chọn mẫu khác"
                : "Chọn màn hình và mẫu giao diện"}
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="layout-screen">
                  Màn hình áp dụng
                </FieldLabel>
                <select
                  id="layout-screen"
                  aria-label="Màn hình áp dụng"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={screen}
                  onChange={(event) => {
                    setParams({ screen: event.target.value });
                    setState({ page: 1, search: "" });
                  }}
                >
                  {layoutScreens.map((value) => (
                    <option key={value} value={value}>
                      {layoutScreenLabels[value]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="layout-search">
                  Tìm theo tên mẫu
                </FieldLabel>
                <Input
                  id="layout-search"
                  value={state.search}
                  onChange={(event) =>
                    setState({ page: 1, search: event.target.value })
                  }
                />
              </Field>
              <DisplayLayoutList
                query={list}
                selected={selected}
                page={state.page}
                onSelect={(id) => setParams({ screen, template: id })}
                onPage={(page) => setState((current) => ({ ...current, page }))}
              />
            </div>
          </details>
        </CardContent>
      </Card>
      <SelectedDisplayLayout
        screen={screen}
        selected={selected}
        query={detail}
        draftKey={params.get("draft") ?? "new"}
      />
    </div>
    </PageLoadingBoundary>
  );
}

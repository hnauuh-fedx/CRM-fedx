import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LayoutTarget } from "@admission-crm/shared/display-layout";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getDisplayLayoutTargets } from "@/services/display-layout.service";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";

export function DisplayTargetPicker({
  targets,
  departmentId,
  disabled,
  onChange,
  labels = {},
}: {
  targets: LayoutTarget[];
  departmentId: string | null;
  disabled: boolean;
  onChange: (targets: LayoutTarget[]) => void;
  labels?: Record<string, string>;
}) {
  return (
    <FieldSet>
      <FieldLegend>Đối tượng áp dụng</FieldLegend>
      {!departmentId && (
        <Field orientation="horizontal">
          <Checkbox
            id="layout-default"
            checked={targets.some((t) => t.type === "DEFAULT")}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...targets, { type: "DEFAULT", id: "default" }]
                  : targets.filter((t) => t.type !== "DEFAULT"),
              )
            }
          />
          <FieldLabel htmlFor="layout-default">
            Mặc định chung của chương trình
          </FieldLabel>
        </Field>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(["DEPARTMENT", "USER"] as const).map((type) => (
          <TargetSearch
            key={`${type}-${departmentId}`}
            type={type}
            departmentId={departmentId}
            targets={targets}
            disabled={disabled}
            onChange={onChange}
            labels={labels}
          />
        ))}
      </div>
    </FieldSet>
  );
}

function TargetSearch({
  type,
  departmentId,
  targets,
  disabled,
  onChange,
  labels,
}: {
  type: "DEPARTMENT" | "USER";
  departmentId: string | null;
  targets: LayoutTarget[];
  disabled: boolean;
  onChange: (targets: LayoutTarget[]) => void;
  labels: Record<string, string>;
}) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [state, setState] = useState({
    search: "",
    page: 1,
    names: {} as Record<string, string>,
  });
  const search = useDeferredValue(state.search);
  const query = useQuery({
    queryKey: [
      "display-layout-targets",
      selectedProgramId,
      auth.user?.id,
      type,
      departmentId,
      search,
      state.page,
    ],
    queryFn: () =>
      getDisplayLayoutTargets(
        auth.accessToken!,
        type,
        search,
        state.page,
        departmentId ?? undefined,
      ),
  });
  const label = type === "USER" ? "Sale" : "Phòng ban";
  return (
    <FieldSet className="min-w-0 rounded-md border p-3">
      <FieldLegend variant="label">{label}</FieldLegend>
      <Field>
        <FieldLabel htmlFor={`target-search-${type}`}>
          Tìm {label.toLocaleLowerCase("vi")}
        </FieldLabel>
        <Input
          id={`target-search-${type}`}
          value={state.search}
          onChange={(e) =>
            setState((current) => ({
              ...current,
              search: e.target.value,
              page: 1,
            }))
          }
        />
      </Field>
      {query.isError ? (
        <p role="alert">
          Không tải được danh sách.{" "}
          <Button type="button" variant="link" onClick={() => query.refetch()}>
            Thử lại
          </Button>
        </p>
      ) : query.isLoading ? (
        <p role="status">Đang tải…</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {query.data?.data.map((option) => (
            <li key={option.id}>
              <Field orientation="horizontal">
                <Checkbox
                  id={`target-${type}-${option.id}`}
                  disabled={disabled}
                  checked={targets.some(
                    (t) => t.type === type && t.id === option.id,
                  )}
                  onCheckedChange={(checked) => {
                    setState((current) => ({
                      ...current,
                      names: { ...current.names, [option.id]: option.name },
                    }));
                    onChange(
                      checked
                        ? [...targets, { type, id: option.id }]
                        : targets.filter(
                            (t) => t.type !== type || t.id !== option.id,
                          ),
                    );
                  }}
                />
                <FieldLabel htmlFor={`target-${type}-${option.id}`}>
                  {option.name}
                </FieldLabel>
              </Field>
            </li>
          ))}
          {!query.data?.data.length && (
            <li className="text-sm text-muted-foreground">
              Không có kết quả phù hợp.
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={state.page <= 1 || query.isFetching}
          onClick={() =>
            setState((current) => ({ ...current, page: current.page - 1 }))
          }
        >
          Trước
        </Button>
        <span className="text-sm">
          {state.page}/{query.data?.totalPages ?? 1}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={
            !query.data ||
            state.page >= query.data.totalPages ||
            query.isFetching
          }
          onClick={() =>
            setState((current) => ({ ...current, page: current.page + 1 }))
          }
        >
          Sau
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Đã chọn {targets.filter((t) => t.type === type).length}{" "}
        {label.toLocaleLowerCase("vi")}.
      </p>
      <ul className="flex flex-col gap-1">
        {targets
          .filter((t) => t.type === type)
          .map((target) => (
            <li
              key={target.id}
              className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
            >
              <span className="min-w-0 break-words">
                {state.names[target.id] ??
                  labels[`${type}:${target.id}`] ??
                  query.data?.data.find((option) => option.id === target.id)
                    ?.name ??
                  `${label} đã chọn (không còn trong kết quả hiện tại)`}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    targets.filter(
                      (t) => t.type !== type || t.id !== target.id,
                    ),
                  )
                }
                aria-label={`Bỏ chọn ${label} ${state.names[target.id] ?? labels[`${type}:${target.id}`] ?? "đã chọn"}`}
              >
                {type === "USER" ? "Dùng lại mẫu phòng ban" : "Bỏ chọn"}
              </Button>
            </li>
          ))}
      </ul>
    </FieldSet>
  );
}

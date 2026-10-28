import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getDisplayLayoutTargets } from "@/services/display-layout.service";
import { GroupedFieldPicker } from "@/components/shared/grouped-field-picker";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";

export function DisplayLayoutOwnerPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  return (
    <OwnerDepartmentDropdown
      key={`${selectedProgramId}-${auth.user?.id}`}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
function OwnerDepartmentDropdown({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { query, state, setState, options, global, selectedLabel } =
    useOwnerDropdown(value);
  return (
    <Field>
      <FieldLabel htmlFor="display-layout-owner">
        Phòng ban sở hữu mẫu
      </FieldLabel>
      <GroupedFieldPicker
        id="display-layout-owner"
        aria-label="Phòng ban sở hữu mẫu"
        aria-describedby="layout-owner-help"
        value={value || (global ? "__program" : undefined)}
        options={options}
        selectedLabel={selectedLabel}
        placeholder="Chọn phòng ban"
        searchPlaceholder="Nhập tên phòng ban…"
        searchLabel="Tìm phòng ban sở hữu mẫu"
        loading={query.isFetching}
        disabled={disabled}
        emptyText={
          query.isError
            ? "Không tải được phòng ban. Vui lòng thử lại."
            : "Không có phòng ban phù hợp trong phạm vi quản lý."
        }
        onSearchChange={(next) =>
          setState((current) => ({ ...current, search: next, page: 1 }))
        }
        onChange={(id, option) => {
          const next = id === "__program" ? "" : id;
          setState((current) => ({
            ...current,
            selectedId: next,
            selectedName: option.label,
          }));
          onChange(next);
        }}
        footer={
          <OwnerDropdownFooter
            disabled={disabled}
            model={{ query, state, setState }}
          />
        }
      />
      <FieldDescription id="layout-owner-help">
        Chọn phòng ban trong phạm vi bạn quản lý. Có thể tạo mẫu trước khi phòng
        ban có Sale.
      </FieldDescription>
      {query.isError && (
        <FieldError>
          Không tải được phòng ban. Mở dropdown và bấm Thử lại.
        </FieldError>
      )}
    </Field>
  );
}

function useOwnerDropdown(value: string) {
  const auth = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [state, setState] = useState({
    search: "",
    page: 1,
    selectedId: "",
    selectedName: "",
  });
  const search = useDeferredValue(state.search);
  const query = useQuery({
    queryKey: [
      "display-layout-owner-options",
      selectedProgramId,
      auth.user?.id,
      search,
      state.page,
    ],
    queryFn: () =>
      getDisplayLayoutTargets(
        auth.accessToken!,
        "DEPARTMENT",
        search,
        state.page,
        undefined,
        "OWNER",
      ),
  });
  const options = (query.data?.data ?? []).map((option) => ({
    value: option.id,
    label: option.name,
    groupKey: "",
    groupLabel: "",
  }));
  const global = auth.user?.accessScope === "ALL";
  if (global && !search.trim())
    options.unshift({
      value: "__program",
      label: "Toàn bộ chương trình (mẫu chung)",
      groupKey: "",
      groupLabel: "",
    });
  const selectedLabel =
    !value && global
      ? "Toàn bộ chương trình (mẫu chung)"
      : value === state.selectedId
        ? state.selectedName || undefined
        : undefined;
  return { query, state, setState, options, global, selectedLabel };
}

function OwnerDropdownFooter({
  disabled,
  model,
}: {
  disabled: boolean;
  model: Pick<
    ReturnType<typeof useOwnerDropdown>,
    "query" | "state" | "setState"
  >;
}) {
  const { query, state, setState } = model;
  return query.isError ? (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => query.refetch()}
    >
      Thử lại
    </Button>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || query.isFetching || state.page <= 1}
        onClick={() =>
          setState((current) => ({
            ...current,
            page: current.page - 1,
          }))
        }
      >
        Trước
      </Button>
      <span className="text-xs text-muted-foreground">
        Trang {state.page}/{query.data?.totalPages ?? 1}
      </span>
      <Button
        type="button"
        variant="ghost"
        disabled={
          disabled ||
          query.isFetching ||
          state.page >= (query.data?.totalPages ?? 1)
        }
        onClick={() =>
          setState((current) => ({
            ...current,
            page: current.page + 1,
          }))
        }
      >
        Sau
      </Button>
    </div>
  );
}

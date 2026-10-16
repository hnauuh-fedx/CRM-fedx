import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getDisplayLayoutTargets } from "@/services/display-layout.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [state, setState] = useState({ search: "", page: 1, selectedName: "" });
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
      ),
  });
  return (
    <>
      <Field>
        <FieldLabel htmlFor="layout-owner-search">
          Tìm phòng ban sở hữu mẫu
        </FieldLabel>
        <Input
          id="layout-owner-search"
          disabled={disabled}
          value={state.search}
          onChange={(event) =>
            setState((current) => ({
              ...current,
              search: event.target.value,
              page: 1,
            }))
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="display-layout-owner">
          Phòng ban sở hữu mẫu
        </FieldLabel>
        <Select
          value={value}
          disabled={disabled || query.isLoading}
          onValueChange={(next) => {
            setState((current) => ({
              ...current,
              selectedName:
                query.data?.data.find((option) => option.id === next)?.name ??
                "",
            }));
            onChange(next);
          }}
        >
          <SelectTrigger id="display-layout-owner">
            <SelectValue placeholder="Chọn phòng ban">
              {state.selectedName || undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {query.data?.data.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {query.isError && (
          <FieldError>
            Không tải được phòng ban.{" "}
            <Button
              type="button"
              variant="link"
              onClick={() => query.refetch()}
            >
              Thử lại
            </Button>
          </FieldError>
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={state.page <= 1 || query.isFetching || disabled}
          onClick={() =>
            setState((current) => ({ ...current, page: current.page - 1 }))
          }
        >
          Phòng ban trước
        </Button>
        <span>
          {state.page}/{query.data?.totalPages ?? 1}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={
            !query.data ||
            state.page >= query.data.totalPages ||
            query.isFetching ||
            disabled
          }
          onClick={() =>
            setState((current) => ({ ...current, page: current.page + 1 }))
          }
        >
          Phòng ban sau
        </Button>
      </div>
    </>
  );
}

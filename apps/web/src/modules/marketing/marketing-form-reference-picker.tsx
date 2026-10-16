import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { getMarketingFormReferences } from "@/services/marketing-reference.service";
import type { MarketingFormOption } from "@admission-crm/shared/marketing-form-config";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { marketingFormQueryKey } from "./marketing-form-query-scope";

export function MarketingFormReferencePicker({
  target,
  selected,
  onAdd,
  fieldKey,
}: {
  target: "major_id" | "source_id";
  selected: string[];
  onAdd: (option: MarketingFormOption) => void;
  fieldKey: string;
}) {
  const { accessToken } = useAuth();
  const { selectedProgramId } = useInstitutionProgram();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: marketingFormQueryKey(
      selectedProgramId,
      "references",
      target,
      search,
      page,
    ),
    enabled: Boolean(accessToken && selectedProgramId),
    queryFn: ({ signal }) =>
      getMarketingFormReferences(
        target,
        { search, page },
        accessToken!,
        selectedProgramId!,
        signal,
      ),
  });
  const selectedValues = new Set(selected);
  const choices = (query.data?.data ?? []).filter(
    (option) => !selectedValues.has(option.value),
  );
  const label = target === "major_id" ? "ngành" : "nguồn Lead";
  function applySearch() {
    setSearch(draftSearch.trim());
    setPage(1);
  }
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`reference-search-${fieldKey}`}>
          Tìm {label} trong chương trình
        </FieldLabel>
        <Input
          id={`reference-search-${fieldKey}`}
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applySearch();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={applySearch}>
          Tìm kiếm
        </Button>
      </Field>
      <Field>
        <FieldLabel htmlFor={`reference-add-${fieldKey}`}>
          Thêm {label} vào lựa chọn
        </FieldLabel>
        <Select
          value=""
          disabled={
            query.isFetching || !selectedProgramId || choices.length === 0
          }
          onValueChange={(value) => {
            const option = choices.find((item) => item.value === value);
            if (option) onAdd(option);
          }}
        >
          <SelectTrigger id={`reference-add-${fieldKey}`}>
            <SelectValue
              placeholder={
                query.isFetching
                  ? "Đang tải danh mục…"
                  : choices.length
                    ? `Chọn ${label}`
                    : "Không còn lựa chọn trên trang này"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {query.isError && (
          <p role="alert">
            Không tải được danh mục.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => query.refetch()}
            >
              Thử lại
            </Button>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Chỉ danh mục thuộc chương trình đang chọn và danh mục dùng chung. Giá
          trị lưu là mã CRM, không phải tên hiển thị.
        </p>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || query.isFetching}
          onClick={() => setPage((value) => value - 1)}
        >
          Trang trước
        </Button>
        <span>
          Trang {page} / {query.data?.pagination.totalPages ?? 1}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={
            !query.data ||
            page >= query.data.pagination.totalPages ||
            query.isFetching
          }
          onClick={() => setPage((value) => value + 1)}
        >
          Trang sau
        </Button>
      </div>
    </FieldGroup>
  );
}

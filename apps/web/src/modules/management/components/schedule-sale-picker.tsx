import { useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { SaleWorkScheduleInput } from "@admission-crm/shared/sale-work-schedule";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { searchScheduleSales } from "@/services/sale-work-schedule.service";

type SaleOption = { id: string; fullName: string };
export function ScheduleSalePicker({
  form,
  initialSales,
  token,
  programId,
  readOnly,
}: {
  form: UseFormReturn<SaleWorkScheduleInput>;
  initialSales: SaleOption[];
  token: string;
  programId: string;
  readOnly?: boolean;
}) {
  const saleIds = useWatch({ control: form.control, name: "saleIds" });
  const selectedIds = new Set(saleIds);
  const replaceExisting = useWatch({
    control: form.control,
    name: "replaceExisting",
  });
  const [sales, setSales] = useState(initialSales);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["work-schedule-sales", programId, search, page],
    queryFn: () => searchScheduleSales(token, programId, search, page),
    enabled: !readOnly,
  });
  const selectSale = (sale: SaleOption, checked: boolean) => {
    form.setValue(
      "saleIds",
      checked
        ? [...new Set([...saleIds, sale.id])]
        : saleIds.filter((id) => id !== sale.id),
      { shouldDirty: true },
    );
    setSales((current) =>
      current.some((item) => item.id === sale.id)
        ? current
        : [...current, sale],
    );
  };
  return (
    <FieldSet>
      <FieldLegend>Sale áp dụng ({saleIds.length})</FieldLegend>
      <div className="flex flex-wrap gap-2" aria-label="Sale đã chọn">
        {sales
          .filter((sale) => selectedIds.has(sale.id))
          .map((sale) => (
            <Badge key={sale.id} variant="secondary">
              {sale.fullName}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Bỏ chọn ${sale.fullName}`}
                  onClick={() => selectSale(sale, false)}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </Badge>
          ))}
      </div>
      {!readOnly && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="schedule-sale-search">
              Tìm Sale theo tên
            </FieldLabel>
            <Input
              id="schedule-sale-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <div
            className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2"
            aria-live="polite"
          >
            {query.isLoading && <p>Đang tìm Sale…</p>}
            {query.isError && (
              <p role="alert">
                Không tải được Sale.{" "}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => void query.refetch()}
                >
                  Thử lại
                </Button>
              </p>
            )}
            {query.data?.data.length === 0 && (
              <p>Không tìm thấy Sale phù hợp.</p>
            )}
            {query.data?.data.map((sale) => (
              <label
                key={sale.id}
                htmlFor={`schedule-sale-${sale.id}`}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <Checkbox
                  id={`schedule-sale-${sale.id}`}
                  checked={selectedIds.has(sale.id)}
                  onCheckedChange={(checked) =>
                    selectSale(sale, checked === true)
                  }
                />
                {sale.fullName}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              Trước
            </Button>
            <span>Trang {page}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!query.data?.hasMore || query.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Sau
            </Button>
          </div>
          <Field orientation="horizontal">
            <Checkbox
              id="schedule-replace"
              checked={replaceExisting}
              onCheckedChange={(checked) =>
                form.setValue("replaceExisting", checked === true)
              }
            />
            <FieldLabel htmlFor="schedule-replace">
              Thay thế lịch hiện tại của các Sale được chọn
            </FieldLabel>
          </Field>
          <FieldDescription>
            Khi thay thế, Sale sẽ được gỡ khỏi lịch đang áp dụng trước đó trong
            chương trình này.
          </FieldDescription>
        </FieldGroup>
      )}
    </FieldSet>
  );
}

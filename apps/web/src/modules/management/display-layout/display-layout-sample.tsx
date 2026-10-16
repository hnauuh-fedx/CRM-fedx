import {
  defaultDisplayColumnWidth,
  isListLayoutScreen,
  leadDisplayFields,
  getDisplayFields,
  type LayoutScreen,
  normalizePresentation,
  type LayoutDraft,
} from "@admission-crm/shared/display-layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
const labels = new Map(
  leadDisplayFields.map((field) => [field.key, field.label]),
);
export function DisplayLayoutSample({
  draft,
  screen = "LEAD_LIST",
}: {
  draft: LayoutDraft;
  screen?: LayoutScreen;
}) {
  if (!isListLayoutScreen(screen))
    return <SurfaceLayoutSample draft={draft} screen={screen} />;
  return <ListLayoutSample draft={draft} />;
}
function ListLayoutSample({ draft }: { draft: LayoutDraft }) {
  const presentation = normalizePresentation(draft);
  const pinned = new Set(presentation.pinnedFields);
  const keys = [
    ...presentation.pinnedFields,
    ...presentation.visibleFields.filter((key) => !pinned.has(key)),
  ];
  let offset = 0;
  const columns = keys.map((key) => {
    const width = presentation.columnWidths[key] ?? defaultDisplayColumnWidth;
    const column = { key, width, left: offset, pinned: pinned.has(key) };
    offset += width;
    return column;
  });
  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed" style={{ width: offset }}>
        <caption className="sr-only">
          Xem trước thứ tự, cột ghim và độ rộng đã lưu
        </caption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                title={labels.get(column.key)}
                className={
                  column.pinned
                    ? "overflow-hidden bg-muted md:sticky"
                    : "overflow-hidden"
                }
                style={{
                  width: column.width,
                  left: column.pinned ? column.left : undefined,
                }}
              >
                <span className="truncate">{labels.get(column.key)}</span>
                {column.pinned && <Badge variant="secondary">Ghim</Badge>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                className={
                  column.pinned
                    ? "overflow-hidden bg-background md:sticky"
                    : "overflow-hidden"
                }
                style={{
                  width: column.width,
                  left: column.pinned ? column.left : undefined,
                }}
              >
                <span className="block truncate">
                  {exampleValue(column.key)}
                </span>
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
function exampleValue(key: string) {
  if (key === "fullName") return "Nguyễn Văn Minh";
  if (key === "phone") return "09•• ••• ••12";
  return "Dữ liệu minh họa";
}

function SurfaceLayoutSample({
  draft,
  screen,
}: {
  draft: LayoutDraft;
  screen: LayoutScreen;
}) {
  const fields = getDisplayFields(screen);
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  return (
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {normalizePresentation(draft, fields).visibleFields.map((key) => (
        <div key={key} className="min-w-0 rounded-md border p-3">
          <dt className="text-sm font-medium">{fieldMap.get(key)?.label}</dt>
          <dd className="mt-2 text-sm text-muted-foreground">
            Dữ liệu minh họa
          </dd>
        </div>
      ))}
    </dl>
  );
}

import { ArrowRight, Search, X, Layers3 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { DisplayFieldRow } from "./display-field-row";
import {
  useDisplayFieldEditor,
  displayFieldGroups,
  getDisplayFieldPanel,
  type DisplayFieldEditorProps,
  type DisplayFieldEditorModel,
} from "./display-field-model";

export function DisplayFieldEditor(props: DisplayFieldEditorProps) {
  const model = useDisplayFieldEditor(props);
  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      data-testid="display-field-editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/50 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold">Chọn trường và sắp xếp bố cục</h3>
          <p className="hidden text-sm text-muted-foreground lg:block">
            Kéo trường sang bên phải để hiển thị. Kéo lên hoặc xuống để đổi thứ
            tự.
          </p>
          <p className="text-sm text-muted-foreground lg:hidden">
            Chọn tab để thêm hoặc ẩn trường. Dùng mũi tên để đổi thứ tự.
          </p>
        </div>
        <Badge variant="secondary">
          {model.shown.length} đang hiển thị · {model.hidden.length} chưa hiển
          thị
        </Badge>
      </div>
      <DisplayFieldPanels model={model} />
      {model.filtering && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
          <span className="text-muted-foreground">
            Đang lọc trường. Xóa bộ lọc để kéo thả hoặc đổi thứ tự.
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              model.setState((current) => ({
                ...current,
                shownSearch: "",
                hiddenSearch: "",
                hiddenGroup: "all",
              }))
            }
          >
            <X data-icon="inline-start" aria-hidden="true" />
            Xóa bộ lọc trường
          </Button>
        </div>
      )}
      <p role="status" className="sr-only">
        {model.state.announcement}
      </p>
    </div>
  );
}

const desktopQuery = "(min-width: 1024px)";
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const subscribeDesktop = (listener: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
function DisplayFieldPanels({ model }: { model: DisplayFieldEditorModel }) {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    () => false,
  );
  if (desktop)
    return (
      <div className="grid min-w-0 items-start gap-4 grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <DisplayFieldPanel show={false} model={model} />
        <DisplayFieldPanel show model={model} />
      </div>
    );
  return (
    <Tabs defaultValue="shown" className="min-w-0">
      <TabsList
        aria-label="Trường trong bố cục"
        className="grid min-h-11 w-full grid-cols-2"
      >
        <TabsTrigger value="shown">
          Đang hiển thị ({model.shown.length})
        </TabsTrigger>
        <TabsTrigger value="hidden">
          Chưa hiển thị ({model.hidden.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="shown">
        <DisplayFieldPanel show model={model} />
      </TabsContent>
      <TabsContent value="hidden">
        <DisplayFieldPanel show={false} model={model} />
      </TabsContent>
    </Tabs>
  );
}

function DisplayFieldPanel({
  show,
  model,
}: {
  show: boolean;
  model: DisplayFieldEditorModel;
}) {
  const { keys, title, search, filtered, selected, emptyMessage } =
    getDisplayFieldPanel(show, model);
  return (
    <Card className="min-w-0 gap-4 py-4">
      <CardHeader className="gap-2 px-4">
        <CardTitle className="flex items-center justify-between gap-2">
          {title}
          <Badge variant={show ? "default" : "secondary"}>{keys.length}</Badge>
        </CardTitle>
        <CardDescription>
          {show
            ? "Thứ tự từ trên xuống là thứ tự hiển thị. Trường có khóa luôn được giữ."
            : "Tìm trường, lọc theo nhóm rồi bấm Hiện để thêm vào bố cục."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3 px-4">
        <Field>
          <FieldLabel htmlFor={`field-search-${show}`} className="sr-only">
            Tìm trường {show ? "đang hiển thị" : "chưa hiển thị"}
          </FieldLabel>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`field-search-${show}`}
              className="min-h-11 pl-9"
              placeholder="Tìm tên trường, có hoặc không dấu…"
              value={search}
              onChange={(event) =>
                model.setState((current) => ({
                  ...current,
                  [show ? "shownSearch" : "hiddenSearch"]: event.target.value,
                }))
              }
            />
          </div>
        </Field>
        {!show && <HiddenFieldGroups model={model} />}
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {filtered.length}/{keys.length} trường · chọn ô để thao tác nhiều
          </span>
          {selected.length > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={model.disabled || !model.allowVisibility}
              onClick={() => model.transfer(selected, !show)}
            >
              {show ? "Ẩn" : "Hiện"} {selected.length} trường đã chọn
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          )}
        </div>
        <section
          aria-label={`Vùng thả ${title.toLocaleLowerCase("vi")}`}
          onDragOver={(event) => model.dragOver(event, `panel-${show}`)}
          onDrop={(event) => model.drop(event, show)}
          className={cn(
            "min-h-44 rounded-lg border border-dashed bg-muted/20 p-2",
            model.state.dropTarget === `panel-${show}` &&
              "border-primary bg-primary/5",
          )}
        >
          <ul className="flex max-h-128 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
            {filtered.map((key) => (
              <DisplayFieldRow
                key={key}
                field={model.catalog.get(key)!}
                show={show}
                model={model}
              />
            ))}
          </ul>
          {!filtered.length && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          )}
          {show && filtered.length > 0 && (
            <p className="px-2 pb-1 pt-3 text-center text-xs text-muted-foreground">
              Thả vào khoảng trống để đặt trường ở cuối.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
function HiddenFieldGroups({ model }: { model: DisplayFieldEditorModel }) {
  return (
    <Field>
      <FieldLabel
        htmlFor="hidden-field-group"
        className="flex items-center gap-2"
      >
        <Layers3 className="size-4" aria-hidden="true" />
        Nhóm trường
      </FieldLabel>
      <select
        id="hidden-field-group"
        aria-label="Nhóm trường chưa hiển thị"
        className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
        value={model.state.hiddenGroup}
        onChange={(event) =>
          model.setState((current) => ({
            ...current,
            hiddenGroup: event.target.value,
          }))
        }
      >
        <option value="all">Tất cả nhóm</option>
        {displayFieldGroups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

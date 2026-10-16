import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LockKeyhole,
  Plus,
  EyeOff,
} from "lucide-react";
import type { DisplayField } from "@admission-crm/shared/display-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  displayFieldDragType,
  displayFieldGroup,
  displayFieldGroups,
  type DisplayFieldEditorModel,
} from "./display-field-model";

type Props = {
  field: DisplayField;
  show: boolean;
  model: DisplayFieldEditorModel;
};
export function DisplayFieldRow({ field, show, model }: Props) {
  const key = field.key;
  const index = model.visible.indexOf(key);
  const group = displayFieldGroups.find(
    (item) => item.id === displayFieldGroup(key),
  );
  const locked = Boolean(show && field.locked);
  return (
    <li
      data-field-key={key}
      onDragOver={(event) => model.dragOver(event, key)}
      onDrop={(event) => model.drop(event, show, key)}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 transition-colors motion-reduce:transition-none",
        model.state.dropTarget === key &&
          "border-primary ring-2 ring-primary/20",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 cursor-grab active:cursor-grabbing"
        disabled={model.dragDisabled}
        draggable={!model.dragDisabled}
        aria-label={`Kéo trường ${field.label}`}
        title="Kéo để di chuyển trường"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(displayFieldDragType, key);
        }}
        onDragEnd={() =>
          model.setState((current) => ({ ...current, dropTarget: "" }))
        }
      >
        <GripVertical aria-hidden="true" />
      </Button>
      <Checkbox
        id={`choose-field-${key}`}
        checked={model.state.selected.includes(key)}
        disabled={model.disabled || !model.allowVisibility || locked}
        onCheckedChange={(checked) => model.toggle(key, checked === true)}
      />
      <label
        htmlFor={`choose-field-${key}`}
        className="flex min-w-24 flex-1 cursor-pointer flex-col gap-0.5 py-1 text-sm"
      >
        <span className="break-words font-medium">{field.label}</span>
        <span className="text-xs text-muted-foreground">{group?.label}</span>
      </label>
      {!model.knownSet.has(key) && <Badge variant="secondary">Mới</Badge>}
      {show && (
        <Badge
          variant="outline"
          className="tabular-nums"
          aria-label={`Vị trí ${index + 1}`}
        >
          {index + 1}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-1">
        {show && <DisplayFieldOrder field={field} model={model} />}
        {locked ? (
          <span
            className="flex min-h-11 items-center gap-1 px-2 text-xs text-muted-foreground"
            title="Trường bắt buộc luôn được hiển thị"
          >
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Bắt buộc
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={model.disabled || !model.allowVisibility}
            onClick={() => model.transfer([key], !show)}
          >
            {show ? (
              <EyeOff data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Plus data-icon="inline-start" aria-hidden="true" />
            )}
            {show ? "Ẩn" : "Hiện"}
          </Button>
        )}
      </div>
    </li>
  );
}
function DisplayFieldOrder({ field, model }: Omit<Props, "show">) {
  const index = model.visible.indexOf(field.key);
  const disabled = model.disabled || !model.allowOrder || model.filtering;
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-11"
        aria-label={`Đưa ${field.label} lên`}
        title="Lên một vị trí"
        disabled={disabled || index === 0}
        onClick={() =>
          model.transfer([field.key], true, model.visible[index - 1])
        }
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-11"
        aria-label={`Đưa ${field.label} xuống`}
        title="Xuống một vị trí"
        disabled={disabled || index === model.visible.length - 1}
        onClick={() => model.moveDown(field.key)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
    </>
  );
}

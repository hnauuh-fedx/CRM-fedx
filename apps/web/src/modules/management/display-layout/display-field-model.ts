import { useState, type DragEvent } from "react";
import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import {
  leadDisplayFields,
  moveDisplayField,
  type DisplayField,
} from "@admission-crm/shared/display-layout";

export type DisplayFieldEditorProps = {
  visible: string[];
  disabled: boolean;
  onChange: (keys: string[]) => void;
  knownFields?: string[];
  fields?: DisplayField[];
  allowVisibility?: boolean;
  allowOrder?: boolean;
};
const fieldGroups = new Map(
  leadFormFieldCatalog.flatMap((group) =>
    group.fields.map((field) => [field.key, group.id] as const),
  ),
);
const groupAliases: Record<string, string> = {
  pipelineStage: "classification",
  origin: "classification",
  source: "basic",
  assignee: "classification",
  assigneeId: "classification",
  majorName: "admission",
  admissionStatusName: "admission",
};
export const displayFieldGroups = leadFormFieldCatalog.map(({ id, label }) => ({
  id,
  label,
}));
export const displayFieldGroup = (key: string) =>
  groupAliases[key] ?? fieldGroups.get(key) ?? "additional";
export const normalizeFieldSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .trim();
export const displayFieldDragType = "application/x-crm-display-field";

export function useDisplayFieldEditor({
  visible,
  disabled,
  onChange,
  knownFields,
  fields = leadDisplayFields,
  allowVisibility = true,
  allowOrder = true,
}: DisplayFieldEditorProps) {
  const [state, setState] = useState({
    shownSearch: "",
    hiddenSearch: "",
    hiddenGroup: "all",
    selected: [] as string[],
    announcement: "",
    dropTarget: "",
  });
  const catalog = new Map(fields.map((field) => [field.key, field]));
  const visibleSet = new Set(visible);
  const knownSet = new Set(knownFields ?? fields.map((field) => field.key));
  const shown = visible.filter((key) => catalog.has(key));
  const hidden = fields
    .filter((field) => !visibleSet.has(field.key))
    .map((field) => field.key);
  const filtering = Boolean(
    state.shownSearch || state.hiddenSearch || state.hiddenGroup !== "all",
  );
  const dragDisabled =
    disabled || filtering || (!allowVisibility && !allowOrder);
  function transfer(keys: string[], show: boolean, before?: string) {
    if (disabled) return;
    const movable = keys.filter(
      (key) =>
        catalog.has(key) &&
        (show
          ? visibleSet.has(key)
            ? allowOrder
            : allowVisibility
          : allowVisibility && !catalog.get(key)?.locked),
    );
    let next = visible;
    for (const key of movable)
      next = show
        ? moveDisplayField(next, key, before)
        : next.filter((item) => item !== key);
    if (!allowOrder) {
      const nextSet = new Set(next);
      next = fields.map((field) => field.key).filter((key) => nextSet.has(key));
    }
    onChange(next);
    setState((current) => ({
      ...current,
      selected: [],
      dropTarget: "",
      announcement: `Đã ${show ? "hiện hoặc sắp xếp" : "ẩn"} ${movable.length} trường.`,
    }));
  }
  function drop(event: DragEvent, show: boolean, before?: string) {
    event.preventDefault();
    event.stopPropagation();
    const key = event.dataTransfer.getData(displayFieldDragType);
    if (!dragDisabled && catalog.has(key)) transfer([key], show, before);
    setState((current) => ({ ...current, dropTarget: "" }));
  }
  function dragOver(event: DragEvent, target: string) {
    if (
      dragDisabled ||
      !event.dataTransfer.types.includes(displayFieldDragType)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setState((current) =>
      current.dropTarget === target
        ? current
        : { ...current, dropTarget: target },
    );
  }
  function toggle(key: string, checked: boolean) {
    setState((current) => ({
      ...current,
      selected: checked
        ? [...new Set([...current.selected, key])]
        : current.selected.filter((item) => item !== key),
    }));
  }
  function moveDown(key: string) {
    if (disabled || !allowOrder || filtering) return;
    const index = visible.indexOf(key);
    onChange(moveDisplayField(visible, key, visible[index + 2]));
    setState((current) => ({
      ...current,
      announcement: `Đã đưa ${catalog.get(key)?.label} xuống một vị trí.`,
    }));
  }
  return {
    state,
    setState,
    catalog,
    knownSet,
    shown,
    hidden,
    filtering,
    dragDisabled,
    transfer,
    drop,
    dragOver,
    toggle,
    moveDown,
    visible,
    disabled,
    allowVisibility,
    allowOrder,
  };
}
export type DisplayFieldEditorModel = ReturnType<typeof useDisplayFieldEditor>;

export function getDisplayFieldPanel(
  show: boolean,
  model: DisplayFieldEditorModel,
) {
  const keys = show ? model.shown : model.hidden;
  const keySet = new Set(keys);
  const title = show ? "Đang hiển thị" : "Chưa hiển thị";
  const search = show ? model.state.shownSearch : model.state.hiddenSearch;
  const normalizedSearch = normalizeFieldSearch(search);
  const filtered = keys.filter(
    (key) =>
      normalizeFieldSearch(model.catalog.get(key)!.label).includes(
        normalizedSearch,
      ) &&
      (show ||
        model.state.hiddenGroup === "all" ||
        displayFieldGroup(key) === model.state.hiddenGroup),
  );
  const selected = model.state.selected.filter(
    (key) => keySet.has(key) && !(show && model.catalog.get(key)?.locked),
  );
  const emptyMessage = keys.length
    ? "Không có trường phù hợp. Thử tên khác hoặc xóa bộ lọc."
    : show
      ? "Kéo trường vào đây để bắt đầu."
      : "Tất cả trường đã được hiển thị.";
  return { keys, title, search, filtered, selected, emptyMessage };
}

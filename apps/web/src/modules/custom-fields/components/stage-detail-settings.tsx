import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, GripVertical, ListPlus, Trash2 } from "lucide-react";
import { useState, type DragEvent, type KeyboardEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/modules/auth/auth-context";
import {
  FAIL_STAGE_VALUE,
  PIPELINE_STAGE_FIELD_LABEL,
  type StageDetailConfiguration,
  type StageDetailOption,
} from "@/modules/leads/stage-detail.types";
import { getStageDetailConfiguration, setStageDetailOptions } from "@/services/custom-field.service";
import { customFieldPermission } from "../custom-field-permissions";

const MAX_LABEL_LENGTH = 500;
const MAX_ITEMS_PER_LEVEL = 100;
const queryKey = ["stage-detail-configuration"];

type Drafts = Record<string, StageDetailOption[]>;
/** A sibling list: level-2 items of a target (parentId null) or level-3 items of one level-2 item. */
type ListRef = { target: string; parentId: string | null };
type DragState = ListRef & { index: number };

/**
 * "Cấu hình trường nhiều cấp" for "Quy trình Telesale/Trạng thái".
 * Level 1 = pipeline stages + Fail (managed elsewhere); levels 2 and 3 are edited here.
 */
export function StageDetailSettings({ management = false }: { management?: boolean }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const query = useQuery({
    queryKey: [...queryKey, management],
    queryFn: () => getStageDetailConfiguration(auth.accessToken!, management),
    enabled: open && Boolean(auth.accessToken),
    // The editor keeps local drafts; it loads fresh data on open and is never refetched underneath.
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const canEdit = management
    ? auth.can("system.manage")
    : auth.can(customFieldPermission("LEAD", "update")) && auth.can(customFieldPermission("LEAD", "manage_options"));

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (isSaving) return;
        setOpen(value);
        // Unsaved drafts are discarded on close; the next open starts from the latest saved revision.
        if (!value) queryClient.removeQueries({ queryKey });
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Cấu hình trường nhiều cấp
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-4xl" showCloseButton={!isSaving}>
        <DialogHeader className="pr-6">
          <DialogTitle>Cấu hình trường nhiều cấp</DialogTitle>
          <DialogDescription>
            {PIPELINE_STAGE_FIELD_LABEL}: Cấp 1 là tiến trình hoặc Fail. Thêm Cấp 2 và Cấp 3 để nhân viên chọn khi chuyển
            tiến trình hoặc chuyển sang Fail; nội dung được ghi vào hoạt động chuyển giai đoạn. Cấu hình dùng chung toàn hệ thống.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">Đang tải cấu hình…</p>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Không thể tải cấu hình</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>Thử lại</Button>
            </AlertDescription>
          </Alert>
        ) : query.isFetching ? (
          <p role="status" className="text-sm text-muted-foreground">Đang tải cấu hình…</p>
        ) : (
          <StageDetailEditor
            entries={query.data}
            accessToken={auth.accessToken!}
            canEdit={canEdit}
            management={management}
            onSavingChange={setIsSaving}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StageDetailEditor({
  entries: initialEntries,
  accessToken,
  canEdit,
  management,
  onSavingChange,
}: {
  entries: StageDetailConfiguration[];
  accessToken: string;
  canEdit: boolean;
  management: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(initialEntries));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirtyTargets = entries
    .filter((entry) => JSON.stringify(normalize(drafts[entry.target] ?? [])) !== JSON.stringify(entry.options))
    .map((entry) => entry.target);
  const invalidIds = new Set(
    Object.values(drafts).flatMap((options) =>
      options.flatMap((option) => [
        ...(option.label.trim() ? [] : [option.id]),
        ...option.children.filter((child) => !child.label.trim()).map((child) => child.id),
      ]),
    ),
  );
  const disabled = !canEdit;

  const mutation = useMutation({
    mutationFn: async (targets: string[]) => {
      for (const target of targets) {
        const entry = entries.find((item) => item.target === target)!;
        const result = await setStageDetailOptions(target, normalize(drafts[target] ?? []), accessToken, management, entry.revision);
        // Each saved target gets its new baseline right away, so a later failure keeps earlier saves consistent.
        setEntries((current) => current.map((item) => (item.target === target ? { ...item, options: result.options, revision: result.revision } : item)));
        setDrafts((current) => ({ ...current, [target]: result.options }));
      }
    },
    onMutate: () => {
      onSavingChange(true);
      setSaved(false);
    },
    onSuccess: () => setSaved(true),
    onSettled: () => onSavingChange(false),
  });
  const busy = disabled || mutation.isPending;

  function edit(target: string, update: (options: StageDetailOption[]) => StageDetailOption[]) {
    setDrafts((current) => ({ ...current, [target]: update(current[target] ?? []) }));
    setSaved(false);
    if (mutation.isError) mutation.reset();
  }
  function updateList(list: ListRef, update: <T extends { id: string }>(items: T[]) => T[]) {
    edit(list.target, (options) =>
      list.parentId === null
        ? update(options)
        : options.map((option) => (option.id === list.parentId ? { ...option, children: update(option.children) } : option)),
    );
  }
  function addOption(target: string) {
    const id = crypto.randomUUID();
    edit(target, (options) => [...options, { id, label: "", children: [] }]);
    setCollapsed((current) => withoutKey(current, target));
    setFocusId(id);
  }
  function addChild(target: string, optionId: string) {
    const id = crypto.randomUUID();
    edit(target, (options) =>
      options.map((option) => (option.id === optionId ? { ...option, children: [...option.children, { id, label: "" }] } : option)),
    );
    setFocusId(id);
  }
  function setLabel(list: ListRef, id: string, label: string) {
    updateList(list, (items) => items.map((item) => (item.id === id ? { ...item, label } : item)));
  }
  function remove(list: ListRef, id: string) {
    updateList(list, (items) => items.filter((item) => item.id !== id));
  }
  function move(list: ListRef, from: number, to: number) {
    if (from === to) return;
    updateList(list, (items) => {
      if (to < 0 || to >= items.length) return items;
      const next = [...items];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function save() {
    if (busy || dirtyTargets.length === 0) return;
    if (invalidIds.size > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    mutation.mutate(dirtyTargets);
  }

  const rowProps = { disabled: busy, drag, setDrag, move, showErrors, invalidIds, focusId };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Chưa lưu được toàn bộ cấu hình</AlertTitle>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      {showErrors && invalidIds.size > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Vui lòng nhập nội dung cho các mục đang để trống hoặc xóa chúng trước khi lưu.
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Đã lưu cấu hình trường nhiều cấp.
        </p>
      )}
      <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto p-1" aria-label="Cấu hình trường nhiều cấp">
        {entries.map((entry, entryIndex) => {
          const options = drafts[entry.target] ?? [];
          const isCollapsed = collapsed.has(entry.target);
          const levelTwo: ListRef = { target: entry.target, parentId: null };
          return (
            <li key={entry.target} className="flex flex-col gap-2">
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md border border-l-4 bg-card px-2 py-2",
                  entry.target === FAIL_STAGE_VALUE ? "border-l-destructive" : "border-l-primary",
                )}
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Mở" : "Thu gọn"} ${entry.label}`}
                  onClick={() => setCollapsed((current) => (current.has(entry.target) ? withoutKey(current, entry.target) : new Set(current).add(entry.target)))}
                >
                  <ChevronDown className={cn("transition-transform", isCollapsed && "-rotate-90")} />
                </Button>
                <LevelBadge level={1} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={entry.label}>
                  {entry.label}
                  {entry.pipelineName && <span className="ml-2 text-xs font-normal text-muted-foreground">· {entry.pipelineName}</span>}
                </span>
                <span className="w-12 text-center text-sm text-muted-foreground tabular-nums" aria-label={`Thứ tự ${entryIndex + 1}`}>
                  {entryIndex + 1}
                </span>
                <Badge variant="outline">{options.length} mục</Badge>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || options.length >= MAX_ITEMS_PER_LEVEL}
                    onClick={() => addOption(entry.target)}
                  >
                    <ListPlus data-icon="inline-start" />
                    Thêm mục con
                  </Button>
                )}
              </div>
              {!isCollapsed && options.length > 0 && (
                <ol className="ml-4 flex flex-col gap-2 border-l border-dashed pl-3 sm:ml-8" aria-label={`Cấp 2 của ${entry.label}`}>
                  {options.map((option, index) => {
                    const levelThree: ListRef = { target: entry.target, parentId: option.id };
                    return (
                      <li key={option.id} className="flex flex-col gap-2">
                        <OptionRow
                          {...rowProps}
                          level={2}
                          list={levelTwo}
                          index={index}
                          count={options.length}
                          id={option.id}
                          label={option.label}
                          onLabelChange={(label) => setLabel(levelTwo, option.id, label)}
                          onRemove={() => remove(levelTwo, option.id)}
                          onAddChild={
                            canEdit && option.children.length < MAX_ITEMS_PER_LEVEL ? () => addChild(entry.target, option.id) : undefined
                          }
                          canEdit={canEdit}
                        />
                        {option.children.length > 0 && (
                          <ol className="ml-4 flex flex-col gap-2 border-l border-dashed pl-3 sm:ml-8" aria-label={`Cấp 3 của ${option.label || "mục chưa đặt tên"}`}>
                            {option.children.map((child, childIndex) => (
                              <li key={child.id}>
                                <OptionRow
                                  {...rowProps}
                                  level={3}
                                  list={levelThree}
                                  index={childIndex}
                                  count={option.children.length}
                                  id={child.id}
                                  label={child.label}
                                  onLabelChange={(label) => setLabel(levelThree, child.id, label)}
                                  onRemove={() => remove(levelThree, child.id)}
                                  canEdit={canEdit}
                                />
                              </li>
                            ))}
                          </ol>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      <DialogFooter className="items-center">
        {canEdit ? (
          <>
            {dirtyTargets.length > 0 && (
              <span className="mr-auto text-sm text-muted-foreground" role="status">
                {dirtyTargets.length} nhóm có thay đổi chưa lưu
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || dirtyTargets.length === 0}
              onClick={() => {
                setDrafts(toDrafts(entries));
                setShowErrors(false);
                mutation.reset();
              }}
            >
              Hủy thay đổi
            </Button>
            <Button type="button" disabled={busy || dirtyTargets.length === 0} onClick={save}>
              {mutation.isPending ? "Đang lưu…" : "Lưu cấu hình"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Bạn cần quyền cập nhật trường và quản lý lựa chọn để sửa cấu hình này.</p>
        )}
      </DialogFooter>
    </div>
  );
}

type OptionRowProps = {
  level: 2 | 3;
  list: ListRef;
  index: number;
  count: number;
  id: string;
  label: string;
  canEdit: boolean;
  disabled: boolean;
  drag: DragState | null;
  setDrag: (drag: DragState | null) => void;
  move: (list: ListRef, from: number, to: number) => void;
  showErrors: boolean;
  invalidIds: Set<string>;
  focusId: string | null;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
  onAddChild?: () => void;
};

function OptionRow({
  level, list, index, count, id, label, canEdit, disabled, drag, setDrag, move,
  showErrors, invalidIds, focusId, onLabelChange, onRemove, onAddChild,
}: OptionRowProps) {
  const sameList = drag !== null && drag.target === list.target && drag.parentId === list.parentId;
  const invalid = showErrors && invalidIds.has(id);
  const inputId = `stage-detail-${id}`;
  const levelName = `Cấp ${level}`;
  const itemName = label.trim() || "mục chưa đặt tên";

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      move(list, index, index - 1);
    } else if (event.key === "ArrowDown" && index < count - 1) {
      event.preventDefault();
      move(list, index, index + 1);
    }
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!sameList) return;
    event.preventDefault();
    move(list, drag.index, index);
    setDrag(null);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-l-4 bg-card px-2 py-2 sm:flex-nowrap",
        level === 2 ? "border-l-emerald-500" : "border-l-amber-500",
        sameList && drag.index === index && "opacity-50",
      )}
      onDragOver={(event) => {
        if (sameList) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      {canEdit && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
          draggable={!disabled}
          disabled={disabled}
          aria-label={`Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp ${itemName}`}
          onKeyDown={onHandleKeyDown}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            setDrag({ ...list, index });
          }}
          onDragEnd={() => setDrag(null)}
        >
          <GripVertical />
        </Button>
      )}
      <LevelBadge level={level} />
      <label htmlFor={inputId} className="sr-only">
        Nội dung {levelName}
      </label>
      <Input
        id={inputId}
        value={label}
        maxLength={MAX_LABEL_LENGTH}
        disabled={disabled}
        autoFocus={focusId === id}
        aria-invalid={invalid}
        placeholder={level === 2 ? "VD: Hồ sơ không hợp lệ" : "VD: Sai tên"}
        className="min-w-40 flex-1"
        onChange={(event) => onLabelChange(event.target.value)}
      />
      <OrderInput
        value={index + 1}
        max={count}
        disabled={disabled || count < 2}
        label={`Thứ tự của ${itemName}`}
        onCommit={(position) => move(list, index, position - 1)}
      />
      {onAddChild && (
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onAddChild}>
          <ListPlus data-icon="inline-start" />
          Thêm mục con
        </Button>
      )}
      {canEdit && (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={disabled}
          aria-label={`Xóa ${levelName}: ${itemName}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

/** Position field: typing a number and leaving the field (or Enter) moves the item there. */
function OrderInput({
  value, max, disabled, label, onCommit,
}: {
  value: number;
  max: number;
  disabled: boolean;
  label: string;
  onCommit: (position: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  function commit() {
    if (text === null) return;
    const position = Math.round(Number(text));
    setText(null);
    if (Number.isFinite(position)) onCommit(Math.min(Math.max(position, 1), max));
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={text ?? String(value)}
      disabled={disabled}
      aria-label={label}
      className="w-16 shrink-0 text-center tabular-nums"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function LevelBadge({ level }: { level: 1 | 2 | 3 }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0",
        level === 1 && "bg-primary/10 text-primary",
        level === 2 && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        level === 3 && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      Cấp {level}
    </Badge>
  );
}

function toDrafts(entries: StageDetailConfiguration[]): Drafts {
  return Object.fromEntries(entries.map((entry) => [entry.target, entry.options]));
}

/** What the API stores: trimmed labels in the shown order. */
function normalize(options: StageDetailOption[]): StageDetailOption[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label.trim(),
    children: option.children.map((child) => ({ id: child.id, label: child.label.trim() })),
  }));
}

function withoutKey(set: Set<string>, key: string) {
  const next = new Set(set);
  next.delete(key);
  return next;
}

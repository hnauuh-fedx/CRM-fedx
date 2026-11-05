import { useAsyncTask } from "@/hooks/use-async-task";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import {
  changeLeadStage,
  changeLeadStatus,
  getStageDetailOptions,
} from "@/services/lead.service";
import type { LeadDetail } from "../lead.types";
import {
  composeStageDetailContent,
  FAIL_STAGE_VALUE,
  type StageDetailOptions,
  type StageDetailSelection,
} from "../stage-detail.types";

const SKIP = "__skip__";
const NO_CHILD = "__none__";
const MAX_CONTENT_LENGTH = 1800;

/**
 * Before moving a lead to a stage or to Fail, asks for the content configured for that target
 * ("Cấu hình trường nhiều cấp"). Targets without configuration move immediately.
 */
export function useStageDetailPrompt<Command>(
  onConfirm: (
    command: Command,
    selection: StageDetailSelection | undefined,
  ) => Promise<void> | void,
) {
  const auth = useAuth();
  const inFlight = useRef(false);
  const [prompt, setPrompt] = useState<{
    command: Command;
    options: StageDetailOptions;
  } | null>(null);
  const confirmation = useAsyncTask({
    task: async ({
      command,
      selection,
    }: {
      command: Command;
      selection: StageDetailSelection | undefined;
    }) => {
      await onConfirm(command, selection);
    },
    onSuccess: () => setPrompt(null),
  });
  const preparation = useAsyncTask({
    task: async ({
      leadId,
      target,
      command,
    }: {
      leadId: string;
      target: string;
      command: Command;
    }) => {
      const options = await getStageDetailOptions(
        leadId,
        target,
        auth.accessToken!,
      );
      if (options.options.length > 0) setPrompt({ command, options });
      else await confirmation.runAsync({ command, selection: undefined });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  return {
    request: (leadId: string, target: string, command: Command) => {
      if (inFlight.current || prompt || confirmation.isPending) return;
      inFlight.current = true;
      confirmation.reset();
      preparation.run({ leadId, target, command });
    },
    isPending: preparation.isPending || confirmation.isPending,
    error: preparation.error ?? confirmation.error,
    dialog: prompt && (
      <StageDetailDialog
        options={prompt.options}
        isPending={confirmation.isPending}
        error={confirmation.error}
        onCancel={() => {
          if (!confirmation.isPending) {
            setPrompt(null);
            confirmation.reset();
          }
        }}
        onConfirm={(selection) =>
          confirmation.run({ command: prompt.command, selection })
        }
      />
    ),
  };
}

type StageDetailDialogProps = {
  options: StageDetailOptions;
  isPending: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: (selection: StageDetailSelection | undefined) => void;
};

function StageDetailDialog({
  options,
  isPending,
  error,
  onCancel,
  onConfirm,
}: StageDetailDialogProps) {
  const [optionId, setOptionId] = useState(SKIP);
  const [childId, setChildId] = useState(NO_CHILD);
  const [content, setContent] = useState("");
  const option = options.options.find((item) => item.id === optionId);
  const child = option?.children.find((item) => item.id === childId);
  const composed = option ? composeStageDetailContent(option, child) : "";
  const trimmed = content.trim();

  function select(nextOption: string, nextChild: string) {
    setOptionId(nextOption);
    setChildId(nextChild);
    const picked = options.options.find((item) => item.id === nextOption);
    setContent(
      picked
        ? composeStageDetailContent(
            picked,
            picked.children.find((item) => item.id === nextChild),
          )
        : "",
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!isPending}
      >
        <DialogHeader>
          <DialogTitle>Chọn nội dung chuyển trạng thái</DialogTitle>
          <DialogDescription>
            Chuyển sang {options.label}. Chọn nội dung đã cấu hình hoặc bỏ qua.
            Nội dung được ghi vào hoạt động chuyển giai đoạn.
          </DialogDescription>
        </DialogHeader>
        <Field data-disabled={isPending}>
          <FieldLabel htmlFor="stage-detail-option">
            Nội dung (không bắt buộc)
          </FieldLabel>
          <Select
            value={optionId}
            onValueChange={(id) => select(id, NO_CHILD)}
            disabled={isPending}
          >
            <SelectTrigger
              id="stage-detail-option"
              className="h-auto min-h-11 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={SKIP}>Không chọn nội dung</SelectItem>
                {options.options.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    className="whitespace-normal break-words"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Chỉ các nội dung đã cấu hình cho {options.label} được hiển thị.
          </FieldDescription>
        </Field>
        {option && option.children.length > 0 && (
          <Field data-disabled={isPending}>
            <FieldLabel htmlFor="stage-detail-child">
              Chi tiết (không bắt buộc)
            </FieldLabel>
            <Select
              value={childId}
              onValueChange={(id) => select(optionId, id)}
              disabled={isPending}
            >
              <SelectTrigger
                id="stage-detail-child"
                className="h-auto min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_CHILD}>Không chọn chi tiết</SelectItem>
                  {option.children.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      className="whitespace-normal break-words"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
        {option && (
          <Field>
            <FieldLabel htmlFor="stage-detail-content">
              Nội dung sẽ lưu
            </FieldLabel>
            <Textarea
              id="stage-detail-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={3}
              maxLength={MAX_CONTENT_LENGTH}
              disabled={isPending}
              aria-describedby="stage-detail-content-help"
            />
            <FieldDescription id="stage-detail-content-help">
              Có thể chỉnh sửa hoặc bổ sung chi tiết. Cấu hình gốc không thay
              đổi.
            </FieldDescription>
            {!trimmed && (
              <p role="alert" className="text-sm text-destructive">
                Nhập nội dung hoặc chọn “Không chọn nội dung” để bỏ qua.
              </p>
            )}
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onCancel}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={isPending || Boolean(option && !trimmed)}
            onClick={() =>
              onConfirm(
                option
                  ? {
                      optionId: option.id,
                      childOptionId: child?.id,
                      // Only an edited text is sent; otherwise the server composes it from the configuration.
                      content: trimmed !== composed ? trimmed : undefined,
                    }
                  : undefined,
              )
            }
          >
            {isPending
              ? "Đang lưu…"
              : option
                ? "Xác nhận"
                : "Chuyển không chọn nội dung"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type WorkflowCommand =
  | { kind: "stage"; leadId: string; stageId: string }
  | {
      kind: "status";
      leadId: string;
      status: "ACTIVE" | "FAIL";
      targetStageId?: string;
    };

/**
 * Stage and Fail transitions of the "Quy trình Telesale/Trạng thái" field.
 * Choosing a stage while the lead is failed reactivates it at that stage.
 */
export function useLeadWorkflowTransition(lead?: LeadDetail) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const prompt = useStageDetailPrompt<WorkflowCommand>(
    async (command, selection) => {
      if (command.kind === "stage")
        await changeLeadStage(
          command.leadId,
          command.stageId,
          auth.accessToken!,
          selection,
        );
      else
        await changeLeadStatus(
          command.leadId,
          command.status,
          auth.accessToken!,
          selection,
          command.targetStageId,
        );
      await Promise.all(
        ["leads", "sale", "dashboard", "reports"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  );
  const changeStatus = (status: "ACTIVE" | "FAIL") => {
    if (!lead || status === lead.lifecycleStatus.value) return;
    const target =
      status === "FAIL" ? FAIL_STAGE_VALUE : lead.lifecycleStatus.failedStageId;
    if (target)
      prompt.request(lead.id, target, {
        kind: "status",
        leadId: lead.id,
        status,
      });
  };
  const changeStage = (stageId: string) => {
    if (!lead) return;
    if (stageId === FAIL_STAGE_VALUE) {
      changeStatus("FAIL");
      return;
    }
    if (lead.lifecycleStatus.value === "FAIL") {
      prompt.request(lead.id, stageId, {
        kind: "status",
        leadId: lead.id,
        status: "ACTIVE",
        targetStageId: stageId,
      });
      return;
    }
    if (stageId !== lead.pipelineStage?.id)
      prompt.request(lead.id, stageId, {
        kind: "stage",
        leadId: lead.id,
        stageId,
      });
  };
  return { ...prompt, changeStage, changeStatus };
}

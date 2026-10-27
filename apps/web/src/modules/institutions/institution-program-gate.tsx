import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, GraduationCap, LogOut, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/modules/auth/auth-context";
import { useInstitutionProgram } from "./institution-program-context";

export function InstitutionProgramGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const context = useInstitutionProgram();
  const [draftProgramId, setDraftProgramId] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isLoading = context.isLoading || (context.hasSelectedProgram && auth.isProfileLoading);
  const error = context.error ?? (context.hasSelectedProgram ? auth.profileError : null);

  if (!isLoading && !error && context.hasSelectedProgram) return children;

  const canChoose = !isLoading && !error && context.programs.length > 0;
  const isValidDraft = context.programs.some((program) => program.id === draftProgramId);
  const retry = context.error ? context.retry : auth.retryProfile;

  function startWorking(event: FormEvent) {
    event.preventDefault();
    if (isValidDraft) context.selectProgram(draftProgramId);
  }

  async function signOut() {
    setIsSigningOut(true);
    try { await auth.signOut(); } finally { setIsSigningOut(false); }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-8 sm:px-8" aria-labelledby="program-selection-title">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">Admission CRM</p>
          <p className="text-sm text-muted-foreground">Không gian làm việc tuyển sinh</p>
        </div>
      </div>
      <Card className="w-full max-w-2xl min-w-0 shadow-sm">
        <CardHeader className="gap-3">
          <p className="break-words text-sm text-muted-foreground">Xin chào, {auth.user?.fullName}</p>
          <CardTitle>
            <h1 id="program-selection-title" className="text-2xl font-semibold tracking-tight">Chọn chương trình làm việc</h1>
          </CardTitle>
          <CardDescription>Chọn chương trình để bắt đầu. Lần sau, hệ thống sẽ mở lại chương trình bạn đang sử dụng trên trình duyệt này.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgramEntryContent
            isLoading={isLoading}
            error={error}
            retry={retry}
            draftProgramId={draftProgramId}
            onDraftChange={setDraftProgramId}
            onSubmit={startWorking}
          />
        </CardContent>
        <CardFooter className="flex-col-reverse items-stretch gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" className="min-h-11" disabled={isSigningOut} onClick={() => void signOut()}>
            {isSigningOut ? <Spinner data-icon="inline-start" /> : <LogOut data-icon="inline-start" aria-hidden="true" />}
            {isSigningOut ? "Đang đăng xuất…" : "Đăng xuất"}
          </Button>
          {canChoose && (
            <Button type="submit" form="program-selection-form" className="min-h-11" disabled={!isValidDraft || isSigningOut}>
              Bắt đầu làm việc<ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}


type ProgramEntryContentProps = {
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  draftProgramId: string;
  onDraftChange: (programId: string) => void;
  onSubmit: (event: FormEvent) => void;
};

function ProgramEntryContent({ isLoading, error, retry, draftProgramId, onDraftChange, onSubmit }: ProgramEntryContentProps) {
  const context = useInstitutionProgram();
  return (
    isLoading ? (
            <div role="status" aria-busy="true" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Đang khôi phục không gian làm việc…</p>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Chưa thể mở không gian làm việc</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
                <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={retry}>
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />Thử lại
                </Button>
              </AlertDescription>
            </Alert>
          ) : context.programs.length > 0 ? (
            <form id="program-selection-form" onSubmit={onSubmit}>
              <FieldGroup>
                {context.needsReselection && (
                  <Alert>
                    <AlertTitle>Vui lòng chọn lại chương trình</AlertTitle>
                    <AlertDescription>Chương trình trước đó không còn khả dụng hoặc bạn không còn quyền truy cập.</AlertDescription>
                  </Alert>
                )}
                <FieldSet>
                  <FieldLegend>Chương trình được cấp quyền</FieldLegend>
                  <FieldGroup className="gap-3">
                    {context.programs.map((program) => (
                      <Field key={program.id} orientation="horizontal" className="rounded-xl border p-4 has-[:checked]:border-primary has-[:checked]:bg-accent/50 focus-within:ring-2 focus-within:ring-ring">
                        <input
                          id={`working-program-${program.id}`}
                          type="radio"
                          aria-label={`${program.name} ? ${program.institutionName} ? ${program.code}`}
                          name="workingProgram"
                          value={program.id}
                          checked={draftProgramId === program.id}
                          onChange={() => onDraftChange(program.id)}
                          required
                          className="size-5 shrink-0 accent-primary"
                        />
                        <FieldLabel htmlFor={`working-program-${program.id}`} className="min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-start justify-center gap-1 break-words">
                          <span>{program.name}</span>
                          <span className="text-sm font-normal text-muted-foreground">{program.institutionName} · {program.code}</span>
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                  <FieldDescription>Bạn có thể đổi chương trình trên thanh điều hướng sau khi vào CRM.</FieldDescription>
                </FieldSet>
              </FieldGroup>
            </form>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có chương trình làm việc</EmptyTitle>
                <EmptyDescription>Vui lòng liên hệ quản trị viên để được cấp quyền vào chương trình đang hoạt động.</EmptyDescription>
              </EmptyHeader>
              <Button type="button" variant="outline" className="min-h-11" onClick={context.retry}>Kiểm tra lại</Button>
            </Empty>
          )
  );
}

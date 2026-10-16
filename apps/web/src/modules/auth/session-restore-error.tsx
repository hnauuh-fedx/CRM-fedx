import { Button } from "@/components/ui/button";

export function SessionRestoreError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">Chưa thể kiểm tra phiên đăng nhập</h1>
        <p role="alert" className="text-sm text-muted-foreground">{message}</p>
        <Button onClick={onRetry}>Thử kết nối lại</Button>
      </div>
    </main>
  );
}

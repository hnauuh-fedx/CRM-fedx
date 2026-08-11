import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function ForbiddenPage() {
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
      <Card className="w-full max-w-lg border-border/70 shadow-xs">
        <Empty className="border-0 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockKeyhole aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Bạn không có quyền truy cập</EmptyTitle>
            <EmptyDescription>
              Tài khoản hiện tại không được phép mở chức năng này. Dữ liệu được bảo vệ theo phạm vi quyền được cấp.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
          <Button asChild>
            <Link to="/tong-quan">Về khu vực làm việc</Link>
          </Button>
          </EmptyContent>
        </Empty>
      </Card>
    </div>
  );
}

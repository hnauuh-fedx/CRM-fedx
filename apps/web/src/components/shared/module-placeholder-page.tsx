import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "./page-header";

type ModulePlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function ModulePlaceholderPage({
  eyebrow,
  title,
  description,
  icon: Icon,
}: ModulePlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <Card className="border-border/70 shadow-xs">
        <CardContent className="p-0">
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Chức năng đang được chuẩn bị</EmptyTitle>
              <EmptyDescription>
                Trang này đã được gắn vào điều hướng theo quyền truy cập. Phần dữ liệu và thao tác nghiệp vụ sẽ được triển khai ở bước tiếp theo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}

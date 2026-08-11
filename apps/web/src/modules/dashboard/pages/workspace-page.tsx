import { Link } from "react-router-dom";
import { ShieldCheck, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/modules/auth/auth-context";
import { DirectorDashboardPage } from "./director-dashboard-page";

export function WorkspacePage() {
  const auth = useAuth();
  const user = auth.user!;

  if (auth.can("dashboard.view_all")) {
    return <DirectorDashboardPage />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Không gian làm việc"
        title={`Xin chào, ${user.fullName}`}
        description="Các chức năng và dữ liệu bên dưới được hiển thị theo quyền truy cập của tài khoản."
      />
      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle>Quyền truy cập hiện tại</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {user.permissions.length === 0 ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Chưa được gán quyền chức năng</AlertTitle>
              <AlertDescription>
                Tài khoản chưa được gán quyền truy cập. Vui lòng liên hệ quản trị viên.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Tài khoản đã sẵn sàng</AlertTitle>
              <AlertDescription>
                Bạn được cấp {user.permissions.length} quyền chức năng trong hệ thống.
              </AlertDescription>
            </Alert>
          )}

          {auth.can("user.manage") && (
            <Button asChild className="w-fit">
              <Link to="/quan-ly/nguoi-dung">Đi đến quản lý người dùng</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

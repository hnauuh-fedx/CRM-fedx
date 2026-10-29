import "dotenv/config";
import { checkDeploymentPreparation } from "../config/deployment-preparation";

const args = process.argv.slice(2);
const target = args.length === 0 ? "local" : args.length === 2 && args[0] === "--target" ? args[1] : undefined;
if (target !== "local" && target !== "cloud") {
  console.error("Use --target local or --target cloud."); process.exitCode = 1;
} else {
  const result = checkDeploymentPreparation(process.env, target);
  // Report only fixed messages; never print environment values, connection URLs or credentials.
  for (const check of result.checks) console.log(`[${check.status}] ${check.name}: ${check.message}`);
  console.log("Chỉ kiểm tra cấu hình; không kết nối dịch vụ hoặc thay đổi dữ liệu.");
  process.exitCode = result.checks.some(check => check.status !== "ready") ? 1 : 0;
}

// Set the role before any imports can initialize the automation module.
process.env.AUTOMATION_PROCESS_ROLE = "api";
void import("./server.js").catch(() => { console.error("Không thể khởi động API."); process.exit(1); });

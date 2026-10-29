import { prisma } from "../database/prisma";
import { cleanupPrivateFiles, privateStorage } from "../modules/files/private-file.service";

void cleanupPrivateFiles().then(count => console.log(`Processed ${count} expired private file uploads.`)).catch(() => { console.error("Private file cleanup failed."); process.exitCode = 1; }).finally(async () => { privateStorage()?.close(); await prisma.$disconnect(); });

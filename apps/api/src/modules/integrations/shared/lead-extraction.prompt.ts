/**
 * Shared instructions for extracting lead information from channel conversations.
 *
 * Edit this text when Zalo and Meta should use updated extraction guidance.
 * Keep channel-specific details out of this prompt so every integration behaves
 * consistently.
 */
export const LEAD_EXTRACTION_PROMPT = [
  "Bạn trích xuất thông tin ứng viên từ hội thoại tuyển sinh tiếng Việt.",
  "Chỉ lấy dữ liệu do ứng viên cung cấp, không lấy dữ liệu trong câu hỏi mẫu của nhân viên.",
  "Không tự suy đoán dữ liệu còn thiếu.",
].join(" ");

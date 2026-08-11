import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max);
const optionalDecimal = z.string().trim().regex(/^$|^\d+(\.\d{1,2})?$/, "Vui lòng nhập số hợp lệ, tối đa 2 chữ số thập phân.");
const requiredPhone = z.string().trim().regex(/^\d{10}$/, "Số điện thoại phải gồm đúng 10 chữ số.");
const optionalPhone = z.string().trim().regex(/^$|^\d{10}$/, "Số điện thoại phải gồm đúng 10 chữ số.");

export const leadFormSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ và tên ứng viên.").max(255),
  phone: requiredPhone,
  sourceId: z.string().min(1, "Vui lòng chọn nguồn học viên."),
  pipelineStageId: z.string(),
  email: z.string().trim().email("Email không hợp lệ.").or(z.literal("")),
  gender: optionalText(20),
  dateOfBirth: z.string(),
  cccd: optionalText(30),
  note: optionalText(2000),
  status: optionalText(50),
  temperature: optionalText(50),
  birthPlace: optionalText(255),
  cccdIssueDate: z.string(),
  cccdIssuePlace: optionalText(255),
  nationality: optionalText(100),
  ethnicity: optionalText(100),
  religion: optionalText(100),
  graduationYear: z.string().regex(/^$|^\d{4}$/, "Năm tốt nghiệp phải gồm 4 chữ số."),
  graduationCertificate: optionalText(255),
  previousGraduationCertificate: optionalText(255),
  graduationMajor: optionalText(255),
  graduationRank: optionalText(100),
  diplomaIssuePlace: optionalText(255),
  academicRank12: optionalText(100),
  conductRank12: optionalText(100),
  highSchoolName: optionalText(255),
  highSchoolProvince: optionalText(150),
  highSchoolDistrict: optionalText(150),
  currentJob: optionalText(255),
  companyName: optionalText(255),
  specificAddress: optionalText(1000),
  permanentAddress: optionalText(1000),
  currentAddress: optionalText(1000),
  currentResidence: optionalText(1000),
  province: optionalText(150),
  district: optionalText(150),
  ward: optionalText(150),
  hamlet: optionalText(150),
  relative1FullName: optionalText(255),
  relative1Relationship: optionalText(100),
  relative1Phone: optionalPhone,
  relative1Job: optionalText(255),
  relative1Address: optionalText(1000),
  relative2FullName: optionalText(255),
  relative2Relationship: optionalText(100),
  relative2Phone: optionalPhone,
  relative2Job: optionalText(255),
  relative2Address: optionalText(1000),
  institutionProgramId: z.string(),
  majorId: z.string(),
  admissionStatusId: z.string(),
  trainingCode: optionalText(100),
  classCode: optionalText(100),
  subjectGroupCode: optionalText(100),
  subjectGroupName: optionalText(255),
  score1: optionalDecimal,
  score2: optionalDecimal,
  score3: optionalDecimal,
  admissionScore: optionalDecimal,
  enrollmentBatch: optionalText(150),
  registrationStation: optionalText(150),
  decisionNumber: optionalText(150),
  decisionSignedDate: z.string(),
  monthlyRevenue: optionalDecimal,
  gclid: optionalText(1000),
  tags: optionalText(1000),
}).superRefine((values, context) => {
  const admissionFields = [
    values.majorId, values.admissionStatusId, values.trainingCode, values.classCode, values.subjectGroupCode,
    values.subjectGroupName, values.score1, values.score2, values.score3, values.admissionScore,
    values.enrollmentBatch, values.registrationStation, values.decisionNumber, values.decisionSignedDate,
    values.monthlyRevenue,
  ];
  if (admissionFields.some(Boolean) && !values.institutionProgramId) {
    context.addIssue({ code: "custom", path: ["institutionProgramId"], message: "Vui lòng chọn chương trình tuyển sinh." });
  }
  if (admissionFields.some(Boolean) && !values.majorId) {
    context.addIssue({ code: "custom", path: ["majorId"], message: "Vui lòng chọn ngành đăng ký khi lập hồ sơ tuyển sinh." });
  }
  if (admissionFields.some(Boolean) && !values.admissionStatusId) {
    context.addIssue({ code: "custom", path: ["admissionStatusId"], message: "Vui lòng chọn trạng thái hồ sơ." });
  }
});

export const emptyLeadForm = {
  fullName: "", phone: "", sourceId: "", pipelineStageId: "", email: "", gender: "", dateOfBirth: "", cccd: "", note: "",
  status: "new", temperature: "", birthPlace: "", cccdIssueDate: "", cccdIssuePlace: "", nationality: "",
  ethnicity: "", religion: "", graduationYear: "", graduationCertificate: "", previousGraduationCertificate: "",
  graduationMajor: "", graduationRank: "", diplomaIssuePlace: "", academicRank12: "", conductRank12: "",
  highSchoolName: "", highSchoolProvince: "", highSchoolDistrict: "", currentJob: "", companyName: "",
  specificAddress: "", permanentAddress: "", currentAddress: "", currentResidence: "", province: "", district: "", ward: "", hamlet: "",
  relative1FullName: "", relative1Relationship: "", relative1Phone: "", relative1Job: "", relative1Address: "",
  relative2FullName: "", relative2Relationship: "", relative2Phone: "", relative2Job: "", relative2Address: "",
  institutionProgramId: "", majorId: "", admissionStatusId: "", trainingCode: "", classCode: "", subjectGroupCode: "", subjectGroupName: "",
  score1: "", score2: "", score3: "", admissionScore: "", enrollmentBatch: "", registrationStation: "",
  decisionNumber: "", decisionSignedDate: "", monthlyRevenue: "", gclid: "", tags: "",
  customFieldValues: {},
};

export interface PromptPackage {
  system: string;
  user: string;
  constraints_block: string;
  profile_name: string;
  version: string;
}

export const QUESTION_FEW_SHOT_EXAMPLES = `[FEW-SHOT EXAMPLES]
Vi du 1:
- Noi dung: "Tinh khoa hoc doi hoi viec ton trong tinh khach quan va nam chac quy luat."
- Cau hoi tot: "Vi sao can ton trong tinh khach quan va nam chac quy luat khi hoc noi dung nay?"
- Tra loi tot: "Vi dieu do giup hoc vien hieu dung ban chat van de va van dung kien thuc phu hop."

Vi du 2:
- Noi dung: "Hoc vien so sanh cac giai phap, thao luan nhom va rut ra cach van dung."
- Cau hoi tot: "Can rut ra cach van dung nao sau khi so sanh cac giai phap duoc neu?"
- Tra loi tot: "Can doi chieu cac giai phap, chon cach phu hop va giai thich duoc ly do lua chon."
`;

export const METHOD_FEW_SHOT_EXAMPLES = `[FEW-SHOT EXAMPLES]
Vi du 1:
- Noi dung: "Hoc vien doc tai lieu, doi chieu cac quan diem va tong hop ket qua de bao cao."
- Phuong phap tot: "Huong dan nghien cuu"
- Phuong phap toi: "Neu van de"

Vi du 2:
- Noi dung: "Hoc vien phan tich tinh huong, thao luan nhom va de xuat cach xu ly phu hop."
- Phuong phap tot: "Thao luan nhom"
- Phuong phap toi: "Neu van de"
`;

export const DEFAULT_PROMPT_PROFILE = {
  name: "khxh-nv-quan-su",
  version: "v2",
  domain_foundation: {
    role_name: "Domain Foundation Role",
    expertise: [
      "Khoa hoc Giao duc",
      "Ly luan Chinh tri",
      "Su pham Quan su"
    ],
    teaching_principles: [
      "Outcome-based",
      "Sat thuc te giang day va doi tuong hoc vien"
    ],
    target_audience: "Hoc vien quan su"
  },
  planner: {
    role_name: "Planner Role",
    responsibilities: [
      "Doc toan bai hoac toan bo khung bai",
      "Lap ke hoach phan bo cau hoi va phuong phap day"
    ],
    hard_constraints: [
      "Khong tron lan planning va local generation",
      "Khong dat cau hoi vao cac noi dung bi loai tru"
    ],
    output_contract: "planner-json"
  },
  generator: {
    role_name: "Local Generator Role",
    responsibilities: [
      "Ghi ra Q/A hoac de xuat phuong phap cho tung muc cu the"
    ],
    hard_constraints: [
      "Khong thay doi dinh muc so luong cau hoi",
      "Khong chen them text ben ngoai schema JSON"
    ],
    output_contract: "batch-enrichment-json"
  },
  reviewer: {
    role_name: "Quality Reviewer Role",
    rejection_rules: [
      "Loai bo cau hoi generic va sao rong",
      "Loai bo cau hoi lap lai tieu de",
      "Loai bo cau hoi chung chung ve vai tro nguoi day"
    ],
    normalization_rules: [
      "Giu dung output schema review-decision",
      "Chi accept hoac reject dua tren rubric"
    ],
    output_contract: "review-decision-json"
  }
};

function domainFoundationSystem(profile = DEFAULT_PROMPT_PROFILE): string {
  const expertise = profile.domain_foundation.expertise.join(", ");
  const principles = profile.domain_foundation.teaching_principles.join(", ");
  return (
    `Ban la ${profile.domain_foundation.role_name}. ` +
    `Ban co chuyen mon sau ve ${expertise}. ` +
    `Ban phuc vu ${profile.domain_foundation.target_audience}. ` +
    `Ban phai tuan thu nghiem ngat cac nguyen tac: ${principles}.`
  );
}

function constraintsBlock(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function section(title: string, body: string): string {
  return `[${title}]\n${body}`;
}

function buildPromptPackage(args: {
  system_role: string;
  task_lines: string[];
  constraints: string[];
  user_sections: string[];
  self_check_lines?: string[] | null;
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const profile = args.profile || DEFAULT_PROMPT_PROFILE;
  const taskBlock = args.task_lines.join("\n");
  const cBlock = constraintsBlock(args.constraints);

  const sections: string[] = [
    section("DOMAIN ROLE", domainFoundationSystem(profile)),
    section("TASK ROLE", `Vai tro cua ban trong tac vu nay: ${args.system_role}.`),
    section("TASK INSTRUCTION", taskBlock),
    section("HARD CONSTRAINTS", cBlock)
  ];

  if (args.self_check_lines) {
    sections.push(section("SELF-CHECK (TU KIEM TRA)", constraintsBlock(args.self_check_lines)));
  }

  sections.push(
    section(
      "OUTPUT RULES",
      "Chi tra ve DUNG dinh dang JSON duoc yeu cau. Tuyet doi khong viet them bat ky text nao nam ngoai JSON schema."
    )
  );

  const system = sections.filter((s) => s.trim().length > 0).join("\n\n");
  const user = args.user_sections.filter((s) => s.trim().length > 0).join("\n\n");

  return {
    system,
    user,
    constraints_block: cBlock,
    profile_name: profile.name,
    version: profile.version
  };
}

export function buildQuestionPlannerPrompt(args: {
  lesson_context: string;
  excluded_ranges: string[];
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const constraints = [
    "Only plan questions for leaf sections.",
    "Do not place questions inside excluded research ranges.",
    "Question quota must stay inside each section's local min/max bounds.",
    "Read body_block_count, body_char_count, question_quota_min, and question_quota_max for every section.",
    "Short sections should receive fewer questions than longer, denser sections."
  ];

  return buildPromptPackage({
    system_role: "Question Planner",
    task_lines: [
      `Tra ve JSON hop le theo schema sau:\n` +
        `{"lesson_id": "chuoi", "prompt_profile_name": "chuoi", "prompt_profile_version": "chuoi", ` +
        `"ignored_ranges": [{"label": "chuoi"}], ` +
        `"method_plan": [], ` +
        `"question_plan": [{"outline_id": "chuoi", "anchor_block_id": "chuoi", "question_count": so_nguyen, ` +
        `"question_types": ["chuoi"], "evidence_block_ids": ["chuoi"]}]}.`,
      "Doc toan bo LESSON CONTEXT truoc khi quyet dinh dat cau hoi o dau.",
      "Lap ke hoach phan bo cau hoi sat voi boi canh hoc vien quan su."
    ],
    constraints,
    user_sections: [
      section("EXCLUDED RANGES", args.excluded_ranges.length > 0 ? args.excluded_ranges.join("\n") : "Khong co"),
      section("LESSON CONTEXT", args.lesson_context)
    ],
    self_check_lines: [
      "Moi phan tu trong question_plan phai bam vao body_block_ids co that.",
      "Khong phan bo cau hoi vao muc bi loai tru hoac chi chua tieu de.",
      "Question_count phai nam trong khoang question_quota_min..question_quota_max cua section do."
    ],
    profile: args.profile
  });
}

export function buildMethodPlannerPrompt(args: {
  lesson_context: string;
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const constraints = [
    "Chi chon trong 4 phuong phap duoc phep: Thao luan nhom, Lop hoc dao nguoc, Neu van de, Huong dan nghien cuu.",
    "Phuong phap cap 1 phai phan anh tong hop co chon loc tu cac muc con."
  ];

  return buildPromptPackage({
    system_role: "Method Planner",
    task_lines: [
      "Doc ky phan LESSON CONTEXT va de xuat phuong phap day phu hop cho tung phan."
    ],
    constraints,
    user_sections: [section("LESSON CONTEXT", args.lesson_context)],
    self_check_lines: [
      "Moi phuong phap phai duoc ho tro ro rang boi noi dung thuc te cua muc do.",
      "O muc cap 1, phuong phap phai khai quat duoc cac hoat dong dien ra o muc con."
    ],
    profile: args.profile
  });
}

export function buildQuestionGeneratorPrompt(args: {
  prompt_items: string[];
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const constraints = [
    "Chi tao cau hoi va cau tra loi hoan toan bang tieng Viet co dau.",
    "Tuyet doi khong lap lai tieu de muc mot cach may moc lam cau hoi.",
    "Khong dung cum generic nhu 'Doan tren nhan manh' hay 'Noi dung trong tam la'.",
    "Phai tuan thu nghiem ngat so luong cau hoi question_quota duoc yeu cau.",
    "Cac cau hoi trong cung mot doan phai hoi ve cac khia quang khac nhau, tranh trung lap y tuong."
  ];

  return buildPromptPackage({
    system_role: "Local Generator",
    task_lines: [
      `Tra ve JSON hop le theo schema:\n` +
        `{"items": [{"anchor_id": "chuoi", "recommended_methods": [], ` +
        `"questions": [{"question": "cau hoi", "answer": "cau tra loi", "difficulty": "basic hoac applied"}]}]}.`,
      "Viet cap Q/A cho tung danh muc anchor_id duoc he thong cung cap.",
      "Doc ky full_leaf_excerpt de xac dinh y chinh va moi quan he trong muc.",
      "Noi dung cau hoi phai sat voi trinh do hoc vien quan su."
    ],
    constraints,
    user_sections: [
      section("ANCHOR INPUTS", args.prompt_items.join("\n")),
      QUESTION_FEW_SHOT_EXAMPLES
    ],
    self_check_lines: [
      "Cau hoi phai co chu the ro rang. Khong dat cau trong khong như 'Day là gì?'.",
      "Cau tra loi di thang vao van de, khong qua ngan va khong lap lai chu cua cau hoi.",
      "Dam bao difficulty phu hop voi do dai giang day."
    ],
    profile: args.profile
  });
}

export function buildMethodGeneratorPrompt(args: {
  prompt_items: string[];
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const constraints = [
    "Chi duoc phep chon trong 4 phuong phap: Thao luan nhom, Lop hoc dao nguoc, Neu van de, Huong dan nghien cuu.",
    "Khong giai thich bo sung nam ngoai schema JSON duoc yeu cau.",
    "Khong chon phuong phap chi vi nhin thay tieu de giong; hay can cu vao trich doan noi dung."
  ];

  return buildPromptPackage({
    system_role: "Local Generator (Method)",
    task_lines: [
      `Tra ve JSON hop le theo schema:\n` +
        `{"items": [{"anchor_id": "chuoi", "recommended_methods": ["ten phuong phap"], "questions": []}]}.`,
      "Can cu vao muc tieu hoc tap, loai noi dung va cac signal co trong van ban truoc khi dua ra quyet dinh.",
      "De xuat phuong phap phai co tinh logic cao voi thong tin noi dung thuc te."
    ],
    constraints,
    user_sections: [
      section("ANCHOR INPUTS", args.prompt_items.join("\n")),
      METHOD_FEW_SHOT_EXAMPLES
    ],
    self_check_lines: [
      "Moi phuong phap duoc de xuat bat buoc phai duoc ho tro truc tiep tu excerpt.",
      "Nghiem cam tra ve phuong phap ngoai danh sach 4 phuong phap cho phep."
    ],
    profile: args.profile
  });
}

export function buildQuestionReviewerPrompt(args: {
  generated_questions_context: string;
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const constraints = [
    "Manh dan reject cac cau hoi chung chung nhu 'Day la gi?' hoac 'Voi tu cach la gi?'.",
    "Tuyet doi reject cac cau hoi sao rong chi sao chep tieu de bai hoc.",
    "Tuyet doi khong sinh moi cau hoi. Chuc nang cua ban chi la accept hoac reject."
  ];

  return buildPromptPackage({
    system_role: "Quality Reviewer (Question)",
    task_lines: [
      `Xem xet cac cau hoi da sinh. Tra ve JSON hop le theo schema:\n` +
        `{"reviews": [{"anchor_id": "chuoi", "decisions": [{"question_index": so_nguyen, "verdict": "accept hoac reject", "reason": "ly do"}]}]}.`,
      "question_index bat dau tu 1 ung voi cau dau tien.",
      "Danh gia chat luong cua tung cau hoi dua tren tieu chuan sat voi noi dung KHXH&NV quan su."
    ],
    constraints,
    user_sections: [section("GENERATED QUESTIONS CONTEXT", args.generated_questions_context)],
    self_check_lines: [
      "Kiem tra xem cau hoi co chu de ro rang chua va neu ly do cho phan quyet.",
      "Doi hoi cau tra loi khong duoc lap lai mot cach ngo ngan cac tu ngu tren cau hoi.",
      "Khong tu y ve them thong tin ra ngoai schema."
    ],
    profile: args.profile
  });
}

export function buildMethodReviewerPrompt(args: {
  generated_methods_context: string;
  profile?: typeof DEFAULT_PROMPT_PROFILE;
}): PromptPackage {
  const constraints = [
    "Loai bo cac phuong phap neu chung khong duoc lien ket chat voi doan trich giang day.",
    "Loai bo bat cu thuat ngu phuong phap nao khong nam trong danh sach cho phep."
  ];

  return buildPromptPackage({
    system_role: "Quality Reviewer (Method)",
    task_lines: [
      `Danh gia phuong phap da sinh. Tra ve JSON:\n` +
        `{"items": [{"anchor_id": "chuoi", "recommended_methods": ["ten phuong phap da duoc duyet"], "questions": []}]}.`,
      "Chi giu lai phuong phap nao that su dap ung dieu kien va phu hop voi doi tuong hoc vien quan su."
    ],
    constraints,
    user_sections: [section("GENERATED METHODS CONTEXT", args.generated_methods_context)],
    self_check_lines: [
      "Khong de sot phuong phap ngau nhien khong co can cu tu excerpt.",
      "Neu toan bo de xuat deu kem, hay tra ve recommended_methods rong []."
    ],
    profile: args.profile
  });
}

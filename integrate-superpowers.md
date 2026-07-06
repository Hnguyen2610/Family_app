# PLAN - Tích hợp Kỹ năng nâng cao từ Superpowers vào Antigravity Kit (.agent)

---

## 📋 Overview
Tích hợp các quy trình và kỹ năng chất lượng cao từ `obra/superpowers` vào hệ thống `.agent` nội bộ của Family App.
Cụ thể gồm:
1. Cơ chế isolated coding workspace sử dụng **Git Worktrees** kết hợp tối ưu liên kết thư mục `node_modules` và dọn dẹp worktrees mồ côi (Windows-compatible).
2. Giao thức điều phối **Subagent-driven development** cho Orchestrator agent.
3. Quy trình tự động hóa **Code Review** thông qua slash command `/review` và liên kết với lệnh `/enhance`, `/deploy`.

---

## 🏗️ Project Info
* **Project Type:** BACKEND / INFRASTRUCTURE
* **OS Target:** Windows (PowerShell)
* **Worktree temp path:** `C:\Users\jvb\AppData\Local\Temp\worktrees`

---

## 🎯 Success Criteria
* [ ] Tạo thành công skill `using-git-worktrees` kèm script PowerShell `worktree_helper.ps1` hỗ trợ setup symlink/junction cho `node_modules` và auto-cleanup worktree cũ.
* [ ] Tạo thành công skill `subagent-driven-development` để định nghĩa giao thức giao tiếp subagent.
* [ ] Cập nhật `orchestrator.md` tự động load cấu hình subagent.
* [ ] Tạo thành công lệnh `/review` (`review.md` in `workflows/`) thực hiện quy trình đánh giá code hai chiều.
* [ ] Tích hợp `/review` vào cuối quy trình `/enhance` và `/deploy`.
* [ ] Toàn bộ checklist và lints vượt qua thành công.

---

## 🧩 Tech Stack
* **Scripting:** PowerShell Core / Windows PowerShell (do chạy trên OS Windows)
* **Agent Framework:** Antigravity `.agent` Structure (Markdown rules, Workflows, Skills)
* **Version Control:** Git worktrees

---

## 📁 File Structure
```plaintext
.agent/
├── agents/
│   └── orchestrator.md                 # (Modify) Tích hợp nạp skill subagent
├── skills/
│   ├── using-git-worktrees/
│   │   ├── SKILL.md                    # (New) Hướng dẫn AI cách dùng worktree
│   │   └── scripts/
│   │       └── worktree_helper.ps1     # (New) Script PowerShell quản lý worktrees, junction node_modules, cleanup
│   └── subagent-driven-development/
│       └── SKILL.md                    # (New) Định nghĩa giao thức Orchestrator - Subagent
└── workflows/
    ├── review.md                       # (New) Định nghĩa lệnh /review
    ├── enhance.md                      # (Modify) Thêm bước code review ở cuối
    └── deploy.md                       # (Modify) Thêm bước code review ở cuối
```

---

## 📋 Task Breakdown

### Phase 1: Git Worktrees Infrastructure Setup (P0)

#### Task 1.1: Tạo skill `using-git-worktrees` và tài liệu SKILL.md
* **Agent:** `devops-engineer`
* **Skills:** `powershell-windows`, `clean-code`
* **Inputs:** Yêu cầu về đường dẫn lưu tạm `C:\Users\jvb\AppData\Local\Temp\worktrees`
* **Outputs:** `c:\Users\jvb\Desktop\Family\.agent\skills\using-git-worktrees\SKILL.md`
* **Verify:** Kiểm tra file tồn tại và hướng dẫn đầy đủ cách chạy git worktree.

#### Task 1.2: Viết script PowerShell `worktree_helper.ps1`
* **Agent:** `devops-engineer`
* **Skills:** `powershell-windows`, `clean-code`
* **Inputs:** Các hàm: `Add-Worktree`, `Link-NodeModules` (Symlink/Junction), `Remove-Worktree`, `Cleanup-OrphanedWorktrees`.
* **Outputs:** `c:\Users\jvb\Desktop\Family\.agent\skills\using-git-worktrees\scripts\worktree_helper.ps1`
* **Verify:** Chạy thử script kiểm tra khả năng tạo junction link `node_modules` và cleanup trên môi trường PowerShell của Windows.

---

### Phase 2: Giao thức Subagent & Cập nhật Orchestrator (P1)

#### Task 2.1: Tạo skill `subagent-driven-development`
* **Agent:** `orchestrator`
* **Skills:** `parallel-agents`, `plan-writing`
* **Inputs:** Giao thức chia nhỏ tác vụ cho subagent bằng các file task độc lập.
* **Outputs:** `c:\Users\jvb\Desktop\Family\.agent\skills\subagent-driven-development\SKILL.md`
* **Verify:** Nội dung file chứa định nghĩa giao thức giao tiếp rõ ràng (định dạng Task File, Trạng thái, Báo cáo kết quả).

#### Task 2.2: Cập nhật Orchestrator Agent
* **Agent:** `orchestrator`
* **Skills:** `parallel-agents`, `clean-code`
* **Inputs:** Sửa đổi `c:\Users\jvb\Desktop\Family\.agent\agents\orchestrator.md`
* **Outputs:** Cập nhật file `orchestrator.md` để tự động load skill `subagent-driven-development` khi chia việc.
* **Verify:** Kiểm tra việc nạp skill thành công trong file `orchestrator.md`.

---

### Phase 3: Tự động hóa Code Review & Workflows Integration (P2)

#### Task 3.1: Tạo workflow `/review`
* **Agent:** `test-engineer`
* **Skills:** `code-review-checklist`, `clean-code`
* **Inputs:** Lệnh `/review` giúp AI review code một cách khách quan dựa trên checklist chung.
* **Outputs:** `c:\Users\jvb\Desktop\Family\.agent\workflows\review.md`
* **Verify:** Kiểm tra file `/review.md` có đầy đủ các bước hướng dẫn review và phản hồi.

#### Task 3.2: Tích hợp Code Review vào `/enhance` và `/deploy`
* **Agent:** `devops-engineer`
* **Skills:** `clean-code`
* **Inputs:** Tích hợp gọi `/review` vào `c:\Users\jvb\Desktop\Family\.agent\workflows\enhance.md` và `c:\Users\jvb\Desktop\Family\.agent\workflows\deploy.md`.
* **Outputs:** Các file update của `enhance.md` và `deploy.md`
* **Verify:** Check xem ở cuối mỗi file step có bước gọi `/review` hoặc kiểm tra checklist review hay không.

---

## 🏁 Phase X: Verification Checklist

### 1. Verification Scripts
```powershell
# Chạy kiểm tra lint tổng quát để đảm bảo cấu trúc các file markdown & config đúng chuẩn
python .agent/scripts/checklist.py .
```

### 2. Manual Verification
* [ ] Kiểm tra các file markdown mới tạo không chứa link bị hỏng.
* [ ] Đảm bảo các script PowerShell sử dụng đường dẫn tuyệt đối hoặc chính xác trên Windows.
* [ ] Xác thực không ghi đè bất kỳ rule quan trọng nào trong `GEMINI.md`.

### 3. completion marker
## ✅ PHASE X COMPLETE
- Lint: ✅ Pass
- Security: ✅ No critical issues
- Build: ✅ Success
- Date: 2026-07-06

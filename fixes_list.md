# Keyward (MAXAJIE/Air) 修复清单

核查基准：GitHub 仓库 `MAXAJIE/Air` main 分支 2026-07-26 快照（直接下载源码 + 逐个迁移文件核对，不是靠登录界面猜测）。
每一条都写明：**现状（怎么核实的）→ 需要改什么 → 后端是否已就绪 → 具体做法**。按优先级从高到低排列。

---

## P0 安全与仓库卫生

### P0-1 `.env` 已被提交进 Git，且没有被 `.gitignore` 排除

**现状**：`.env` 内容是 Supabase `PUBLISHABLE_KEY`（新版 anon key）+ `SUPABASE_URL`。这个 key 设计上允许出现在前端代码里，配合 RLS 使用是安全的（已核实全部 30 张表都开了 RLS，也没有发现 `USING (true)` 这种一刀切策略），所以不是"数据库被任何人直接读写"级别的灾难，但仍然是仓库卫生问题。

**要做的事**：
1. `.gitignore` 里新增一行：`.env`
2. `git rm --cached .env`，只保留 `.env.example`（内容换成占位符，比如 `SUPABASE_URL="https://your-project.supabase.co"`）
3. 用 `git filter-repo --path .env --invert-paths`（或 BFG Repo-Cleaner）把历史提交里所有版本的 `.env` 清掉，然后强制推送
4. 去 Supabase 后台重新生成一次 publishable key（历史已经泄露过，重置不吃亏）
5. **以后每加一张新表，RLS policy 必须在同一个迁移文件里一起写完再提交**，不要分开提交、不要"先上线再补策略"

---

## P1 住客免登录流程 — 目前最大的空白，需要前后端一起补

**现状核实**：`src/routes/g.$code.tsx` 全文只有 88 行，逻辑是：拿 URL 里的 code 调用 `guest_property_by_code(_code)` → 展示房源名字和地址的卡片 → **结束，没有任何"继续"按钮或跳转**。

但 `src/i18n/translations.ts` 里，`guest.*` 系列字符串（335–362 行）三种语言全部写好了，包括：入住代码输入框（`guest.code`）、继续按钮（`guest.enter`）、任务菜单（`guest.pick` / `guest.condition` / `guest.request` / `guest.buy`）、物品核对（`guest.actualQty`）、评分（`guest.rating`）、卫生问题拍照（`guest.hygienePhoto`）、购物车（`guest.cart`）、收款码提示（`guest.payTitle` / `guest.payHelp`）、付款凭证上传（`guest.uploadProof` / `guest.amountPaid`）、清洁工评分（`guest.rateCleaner`）、各种成功提示和过期提示（`guest.conditionThanks` / `guest.requestThanks` / `guest.orderThanks` / `guest.expired`）。说明这套体验原本设计完整，只是没接上前端逻辑。

**数据库现状核实（重要，决定工作量）**：`customer_sessions`、`amenity_checks`、`special_requests`、`shopping_orders`、`shopping_order_items`、`room_condition_submissions`、`room_condition_photos`、`cleaner_ratings` 这 8 张表，**没有任何一张对 `anon` 角色开放 GRANT 或 RLS policy**——现有权限全部只给了 `authenticated`。也就是说，**就算现在把前端页面画完，匿名住客一次写入都会被数据库拒绝**。所以必须先补后端，再接前端。

### P1-a（更正）后端其实已经写完了，不需要新的 RPC —— 之前这版判断错了

> **更正说明**：我最早给这份清单时，只查过数据库层的 GRANT/RLS（确认 anon 角色对这 8 张表都没有直接写权限），就得出"需要新写 Postgres RPC"的结论。后来完整过了一遍 `src/lib/` 才发现漏看了两个文件——这个结论是错的，实际情况更好，工作量小很多，纠正如下。

**现状核实**：`src/lib/guest.functions.ts` + `src/lib/guest-internal.ts` 这两个文件，已经用 TanStack Start 的 `createServerFn`（服务端函数，跑在服务器上、用 service-role 的 `supabaseAdmin` 客户端，不受 RLS 限制，也不需要给 anon 开权限）**完整实现了住客流程需要的每一个写入操作**，而且每个都用 `requireSession(sessionId, propertyId)` 做了校验（session 存在、没过期、属于这个房源才放行）：

| 已经写好的函数 | 作用 |
|---|---|
| `getGuestProperty({ propertyId })` | 拿房源名称（欢迎页用） |
| `startGuestSession({ propertyId, code })` | 校验 code 是否等于 `properties.access_code`，创建 `customer_sessions` 行，返回 `sessionId` |
| `getGuestContext({ propertyId, sessionId })` | 一次性拿到：物品清单（`amenity_definitions`）、购物目录（`shopping_items`）、收款二维码（已处理好签名 URL/解密）、上一次清洁的清洁工信息——对应 `guest.pick` 菜单页需要的全部数据 |
| `submitRoomCondition({ propertyId, sessionId, rating, notes, counts, photos })` | 一次调用完成：整体评分 + 物品核对（`amenity_checks`）+ 卫生问题拍照上传，全都包好了 |
| `rateCleaner({ propertyId, sessionId, cleanerUserId, jobId, rating, comment })` | 写入 `cleaner_ratings` |
| `createSpecialRequest({ propertyId, sessionId, description })` | 写入 `special_requests` |
| `createShoppingOrder({ propertyId, sessionId, lines, amountEntered, proof })` | 一次调用完成：按 `shopping_items` 当前价格算总价（不信任前端价格）→ 建 `shopping_orders` + `shopping_order_items` → 上传付款凭证照片 → 回填 `payment_proof_photo_url`/`payment_proof_amount_entered`/`status='proof_submitted'` |

**但已核实：这七个函数在整个代码库里，除了它们自己的定义文件，没有任何路由或组件调用它们**（`grep -rl` 搜索函数名，命中 0 处实际调用）。也就是说卡点纯粹是 `g.$code.tsx` 没有去 `import` 并调用这些现成的函数。

**结论：不要再新写 Postgres RPC（之前草稿里列的 `guest_start_session`、`guest_submit_amenity_check` 等 7 个 SQL 函数，请忽略/删掉那部分——如果两套并存，会变成两条平行的写入路径，之后谁改了一边忘了改另一边，等于埋雷）。P1 现在是纯前端任务**：`g.$code.tsx` 里把这些函数 `import` 进来，按下面 P1-b 的状态机去调用即可。

### P1-b 前端：把 `g.$code.tsx` 从死胡同接成完整流程

不需要拆成多个路由文件，建议用组件内状态机 `useState<"code" | "menu" | "condition" | "request" | "shop" | "rate">` 控制视图切换：

1. **保留现有步骤**：展示 property 卡片（已实现，继续用现有的 `guest_property_by_code` Postgres RPC 拿 `id/name/address` 即可，不用换）。
2. **新增**：卡片下方加输入框（label 用 `guest.code`）+ 按钮（`guest.enter`）。点击后 `import { startGuestSession } from "@/lib/guest.functions"`，调用 `startGuestSession({ propertyId: property.id, code: 输入值 })`，拿到返回的 `sessionId` 存进组件 state；建议同时写进 URL query（跳到 `/g/$code?session=<id>`），这样住客刷新页面不用重填代码。注意：这里的 code 校验逻辑是"必须和 URL 里解析出来的 `access_code` 完全一致"（大小写不敏感），相当于让住客把已经在网址里出现过的码再确认一遍——如果觉得这一步对用户没必要（毕竟码已经从 URL 自动识别出房源了），也可以选择跳过这个二次输入，direct 用 URL 里的 code 直接调 `startGuestSession`，把"步骤二"和"步骤一"合并成一步。这是产品设计上的取舍，不是技术限制，你们自己定就行。
3. **新增**：拿到 `sessionId` 后，先调 `getGuestContext({ propertyId, sessionId })` 拿到物品清单/购物目录/收款码/上次清洁工信息，再展示 `guest.pick` 三张卡片（文案：`guest.condition`/`guest.conditionDesc`、`guest.request`/`guest.requestDesc`、`guest.buy`/`guest.buyDesc`），点击切子视图。
4. **子视图 A｜Room condition**：
   - 用第 3 步已经拿到的 `amenities` 列表渲染每项的数字输入框（`guest.actualQty`）
   - 整体评分（`guest.rating`，1–5星）+ 备注 + 可选拍照（复用现成的 `src/components/photo-picker.tsx`，对应 `guest.hygienePhoto`），提交时把评分/备注/物品数量/照片一起打包，一次性调用 `submitRoomCondition({ propertyId, sessionId, rating, notes, counts, photos })`（这个函数本身就会同时写 `room_condition_submissions`、`room_condition_photos`、`amenity_checks` 三张表，不用自己拆），成功显示 `guest.conditionThanks`
   - 如果第 3 步 `getGuestContext` 返回的 `cleaner` 字段不为空（说明有已完成的清洁工可评价），额外展示打分区块（`guest.rateCleaner`），提交调 `rateCleaner({ propertyId, sessionId, cleanerUserId: cleaner.userId, jobId: cleaner.jobId, rating, comment })`
5. **子视图 B｜Special request**：一个文本框（placeholder 用 `guest.requestPlaceholder`），提交调 `createSpecialRequest({ propertyId, sessionId, description })`，成功显示 `guest.requestThanks`
6. **子视图 C｜Buy stuff**：
   - 用第 3 步 `getGuestContext` 返回的 `catalog` 渲染可加减数量的列表，购物车文案用 `guest.cart`
   - 用第 3 步返回的 `qrUrl`/`qrLabel` 展示收款码；`qrUrl` 为空则显示 `guest.noQr`；否则显示二维码图 + `guest.payTitle`/`guest.payHelp`
   - 结算时收集 `lines`（`[{itemId, quantity}]`）+ 付款金额（`guest.amountPaid`）+ 凭证照片（复用 `PhotoPicker`），一次性调用 `createShoppingOrder({ propertyId, sessionId, lines, amountEntered, proof })`（这个函数会自己算总价、建单、建明细、传照片、回填凭证字段，一步到位，不用像之前草稿那样拆成"建单"和"上传凭证"两步），成功显示 `guest.orderThanks`
7. **过期处理**：`requireSession` 校验失败时，这几个函数会抛出 `Error("expired")` 或 `Error("Invalid stay session")`，前端 catch 住后判断 message 是否为 `"expired"`，是的话显示 `guest.expired`，并提供"重新输入 stay code"按钮退回步骤 2；不是的话按普通错误处理即可。

---

## P2 HR 公司角色的三个空页面 — 后端已就绪，纯前端工作

**现状核实**：`roster.tsx`（27 行）、`agencies.tsx`（27 行）、`inbox.tsx`（27 行）三个文件，内容全部是同一个套路——`<PageHeader title={...} /><EmptyState />`，没有任何数据查询或表单。也就是说 HR 公司账号登录后，导航栏 6 个入口里有 3 个是空白页，只有 dashboard / tasks / profile 能用。

好消息是：**这三个页面对应的数据库表、RLS policy、RPC 函数全部已经写好且可直接调用**，不需要新写任何 SQL，纯粹是前端没接。

### P2-a `agencies.tsx`（"我加入了哪些房东的网络"）

直接复用 `src/routes/_authenticated/people.tsx` 里 `MemberPeople` 组件（第 354 行开始）的模式——它已经是"输入邀请码 → 调用 `redeem_invite_code` → 刷新列表"的完整实现。已核实这个 RPC（见 `supabase/migrations/20260728000000_air_v3_invites_and_kick.sql`）在 `role='hr_company'` 时会正确写入 `hr_affiliations` 表（而不是 `memberships`）。做法：
- 输入框 + Continue 按钮，调 `supabase.rpc("redeem_invite_code", { p_code: code })`
- 列表：查 `hr_affiliations`（`hr_company_user_id = 当前用户`、`status='active'`），按 `owner_group_id` 反查 `owner_groups.name` 和 owner 的 `profiles.display_name`（跟 `people.tsx` 105–133 行的 `hrQ` 查询几乎同一段逻辑，镜像过来改过滤条件即可）
- 页面标题用已有的 `agencies.title` 文案

### P2-b `roster.tsx`（"我的清洁员名册"）

- 生成/展示邀请码：直接对 `hr_invite_codes` 表做 insert/select（不需要 RPC，RLS policy 已允许 `authenticated` 用户对自己名下的行做 CRUD）。UI 参照 `people.tsx` 里 owner 生成邀请码那部分（135–160 行），比它简单——HR 邀请码不分角色。文案用已经写好的 `hr.rosterCode`（"Roster invite code"）和 `hr.rosterCodeHelp`（"Share this with cleaners so they join your roster."）
- 列表：查 `hr_company_roster`（`hr_company_user_id = 当前用户`、`status='active'`），按 `cleaner_user_id` 反查 `profiles`，标题用 `hr.roster`
- **配套要补的另一半**：清洁员那边加入 HR 名册，要走 `redeem_hr_invite_code` 这个 RPC——已核实它在后端完整存在且能用（见 `20260728000000_air_v3_invites_and_kick.sql` 第 56 行），但**目前没有任何前端界面调用它**。建议直接加进清洁员视角的 `MemberPeople` 组件（`people.tsx` 354 行）里，作为除了"加入房东团队"之外的第二个输入框："加入清洁公司名册"，逻辑跟现有的 `join` mutation 几乎一样，只是换一个 RPC 名字（`redeem_hr_invite_code`）和查询 key

### P2-c `inbox.tsx`（"收到的清洁请求，指派名册里的人"）

翻译文件里已经有专门为这个页面写好的字符串：`hr.inbox`（"Cleaning requests"）、`hr.assignCleaner`（"Assign a cleaner"）、`hr.assigned`（"Cleaner assigned."）、`hr.noRequests`（"No incoming requests."）。

已核实 `dashboard.tsx` 里的 `HrDashboard` 组件（约第 420 行）已经有一段现成的查询模式可以直接照抄：
```ts
supabase.from("cleaning_jobs")
  .select("id, status, scheduled_at, created_at, assigned_to_user_id")
  .eq("assigned_hr_company_id", user!.id)
  .order("created_at", { ascending: false })
```
做法：
- 用同样的查询拿到分给自己公司、且 `assigned_to_user_id` 还是空的任务列表
- 每条任务旁边一个"指派清洁员"下拉框（`hr.assignCleaner`），选项来自自己的 `hr_company_roster`（`status='active'`）
- 选定后 `update cleaning_jobs set assigned_to_user_id = 选中的人 where id = job.id`——这一步权限已经就绪，RLS policy "hr assigns requested jobs" 已经允许（见 `20260725035209_...sql` 第 258 行）
- 指派成功 toast 用 `hr.assigned`；列表为空显示 `hr.noRequests`

---

## P2-d `performance.tsx` — 房东和清洁工都会点进去，但也是空页面（新发现，之前的清单漏了）

**现状核实**：`performance.tsx`（27 行）同样是 `<PageHeader title={t("perf.title")} /><EmptyState />`。导航栏里房东和清洁工的 NAV 都有这一项（`app-shell.tsx` 里 owner 和 cleaner 的 `NAV` 数组都包含 `/performance`），worker 和 hr_company 没有。对应的是你文档 §10"清洁工表现与评分"——房东要能看到某个清洁工的评分历史、单次耗时趋势、库存差异记录，而不是只看一个汇总分。

**后端已就绪**，不需要新建表或函数，直接查询现有数据即可：
- 评分历史：`cleaner_ratings`（按 `cleaner_user_id` 过滤）
- 单次耗时：`cleaning_jobs` 的 `started_at`/`completed_at` 相减（按 `assigned_to_user_id` 过滤）
- 库存差异记录：`amenity_checks` 里 `role='cleaner'` 且 `actual_qty` 不等于对应 `amenity_definitions.expected_qty` 的行

**要做的事**：
- 房东视角：选一个清洁工（本组 `memberships` 里 role=cleaner 的人），展示上面三项数据的列表/图表
- 清洁工视角：只展示自己的这三项数据（不需要选人）
- 页面标题已有 `perf.title` 文案可以直接用

## 顺带确认一个"看起来像 bug 但其实不是"的地方：`requests.tsx`

**现状核实**：这个文件只有 8 行，内容是 `beforeLoad: () => { throw redirect({ to: "/shop" }) }`，注释写着"特别请求现在和购物合并到同一个页面里了"。这是刻意的设计决定，不是没写完，不用改。（提醒一下：`/shop` 页面里应该也要包含特别请求的入口——`shop.tsx` 有 725 行，看起来是建好的，但我只核对了它存在、没有逐行确认特别请求功能具体长什么样，如果之后发现那部分体验有问题，可以再单独深挖。）

## P3 首页"我有邀请码"按钮点进去是空的登录框

**现状核实**：`src/routes/auth.tsx` 全文搜索 "code"/"invite" 是 **0 匹配**。首页那个 "I have an invite code" 按钮点进去就是普通登录/注册表单，完全没有输码的地方。真正能填码的地方是登录、确认邮箱、选完角色之后，藏在 People 页面里（`MemberPeople` 组件，359 行 `code` state）。

**要做的事**（不改后端逻辑，只改引导路径——因为必须先注册、选完 `primary_role` 才知道该把码兑成 membership 还是 hr_affiliation，提前收码没有意义）：
1. landing page 的 "I have an invite code" 按钮，链接从现在的 `/auth`（登录模式）改成 `/auth?mode=signup&next=redeem`——一个手上拿着邀请码的新用户，该走的是注册，不是登录
2. `auth.tsx` 读取 `next=redeem` 参数，注册表单上方加一行提示（新增一条 i18n key，比如 `auth.inviteHint`："Sign up, then paste your invite code once your account is ready." / "先注册账号，激活后即可粘贴邀请码。"）
3. `onboarding/role.tsx` 里，`save` 这个 mutation 的 `onSuccess`（现在固定跳转 `/dashboard`）改成：如果 URL 上还带着 `next=redeem` 参数，跳转到 `/people` 而不是 `/dashboard`
4. 可选加分项：把邀请码本身也编码进 URL（比如首页的邀请链接直接做成 `/auth?mode=signup&next=redeem&code=ABC123`），`people.tsx` 检测到 `code` 参数时自动预填进输入框，省得用户翻短信再抄一遍

---

## P4 房东指派清洁任务时，缺"直接指派 vs 发给合作清洁公司"的选择

**现状核实**：`cleaning_jobs` 表已经有 `assigned_via`（`direct`/`hr_request`）和 `assigned_hr_company_id` 两个字段，RLS policy 里也已经有 "hr reads requested jobs" 和 "hr assigns requested jobs" 两条（第 256、258 行）——说明后端完全支持这个流程。但 `cleaning.tsx`（1441 行，创建/编辑任务的表单）里搜索 `assigned_via`/`hr_request` **完全没有出现**，说明前端表单从来没做出这个选择。

**要做的事**：
- 创建/编辑 cleaning job 的表单里加一个 Radio/Tabs："指派给我的清洁工" / "发给合作清洁公司"
- 选"指派给我的清洁工"：跟现在一样，从本组 `memberships`（`role=cleaner`）里选人；写入 `assigned_via='direct'`、`assigned_to_user_id=选中的人`
- 选"发给合作清洁公司"：从 `hr_affiliations`（当前 group、`status='active'`）里选一家；写入 `assigned_via='hr_request'`、`assigned_hr_company_id=选中的公司`，`assigned_to_user_id` 先留空——后续由 P2-c 里 HR 公司在 inbox 页面指派具体的人

---

## P5 收尾细节（优先级最低，建议最后处理）

1. `.env.example` 内容要跟真实 `.env` 结构一致但全部换成占位符——顺手检查一下现在是不是已经这样
2. 语言切换器本身没问题，但 `guest.*` 那一整批新接的文案（三种语言）建议人工过一遍界面，翻译文件核对容易漏掉实际渲染效果
3. `redeem_invite_code` 撞到"团队人数已达上限"时，报错信息是硬编码的英文字符串（`'This group has reached its pilot team limit for your role'`），没有走 i18n，体验上会突然冒出一句英文。建议：a) 把这句错误信息也做成 i18n key；b) 更好的做法是在 People 页面生成邀请码前，提前用当前人数对比上限（cleaner 3 / worker 2）做提示，而不是等用户点了才报错

---

## 建议实施顺序（更正版）

修正之后，P1 和 P2 其实是同一种性质的工作——**后端全部已经就绪，纯前端拼装/接线**，工作量比我最初判断的小很多，可以放在一起并行推进：

1. **P0**（安全）→ 立刻做，不影响功能开发
2. **P1（住客流程）+ P2（HR 三个空页 + 房东/清洁工的 performance 空页）** → 影响最大、性价比也最高的一批，四个页面全部是"数据/函数都写好了，就差前端接线"，建议一起排期
3. **P3、P4** → 小改动，顺手处理
4. **P5** → 有空再做

## 修订记录

- 本文档在对话中做过一次更正：最初以为住客流程（P1）需要新写 7 个 Postgres RPC 函数，后来发现 `src/lib/guest.functions.ts` 早就用 TanStack Start 服务端函数把这些逻辑全部实现好了，只是没有被前端调用。P1-a 已经改写为纠正后的版本，请以当前版本为准。
- 新增了 P2-d（`performance.tsx` 空页面）和一条关于 `requests.tsx`（确认是设计如此、非 bug）的说明，这两点是第一版清单里没有的。

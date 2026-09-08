# 浏览与生码技术设计

## 形态与设置结构

沿用父任务弹窗布局. files/apps/codegen 是 SettingsPreferences 的新组, SettingsSection 增加对应页签. 已有主题/布局/日志/性能组不迁移.

~~~ts
type SortDirection = "asc" | "desc";

files: {
  sortBy: "name" | "modifiedAt" | "size";
  sortDirection: SortDirection;
  directoriesFirst: boolean;
  showHidden: boolean;
  startDirectory: string | null;
}
apps: {
  sortBy: "name" | "packageName" | "firstInstallTime" | "lastUpdateTime" | "apkSize";
  sortDirection: SortDirection;
}
codegen: {
  codeType: "qr" | "code128";
  separatorMode: "newline" | "comma" | "semicolon" | "tab" | "custom";
  customSeparator: string;
}
~~~

默认 files=name/asc/true/true/null, apps=name/asc, codegen=qr/newline/空字符串. null 表示调用现有默认下载目录, 不存空字符串代替默认. 参数枚举复用现有 codeGenerator 类型和选项, 默认值定义不在组件重复.

## 文件视图投影

- 在 lib/deviceFiles.ts 新增唯一纯函数, 从完整 entries 和 files 偏好得到显示条目. 不把排序结果持久化或写回 reducer.
- 移除 Rust parse_directory_records 末尾的展示排序和独立 compare_entries, 后端只负责类型、NUL 协议和直接子路径校验. 对应排序测试迁到 TS, 解析测试保留.
- 原生模拟器验证发现 exec-out 合并远端错误且不能可靠反映远端退出码. 目录列举改用 shell -T, 显式无 PTY 保留 NUL 字节, 通过 shell v2 区分 stdout/stderr 与远端退出状态; 不增加协议解析 fallback. 已实测 NUL 字节不变、缺失目录返回非零.
- 顺序: 隐藏过滤 -> 可选目录优先 -> 选定字段及方向 -> 稳定名称/path 次序. 目录优先不受降序反转.
- 文件默认名称比较保留当前忽略大小写再按原名称比较的规则, 不悄然改为另一种自然排序. 符号链接仍是 symlink, 不探测目标或视为目录.
- 大小排序中目录不比较磁盘目录项大小, 目录之间按名称稳定排列; 当目录优先关闭时, 不适用大小的目录放最后. 文件的 0 字节是有效大小.
- 视图使用 path 作为虚拟列表和选择键. 纯排序保留所选路径及预览, 滚动移至列表顶部以展示新次序, 不重建传输会话.
- 关闭隐藏文件时若所选路径被过滤, 清除 selectedPath 和 preview 并使旧预览响应失效. 不修改完整 entries 或已提交传输的源/目标快照.
- 当过滤后无项但原目录非空时显示简短 "没有可显示的文件", 可通过设置恢复显示隐藏文件; 不报目录读取失败.

## 设备起始目录

- 预设选项由 files 设置 UI 映射为 null(下载目录), /sdcard(内部存储), /sdcard/DCIM/Camera(相机)或自定义字符串. 自定义为空是未完成编辑, 不能保存.
- 设置表单用局部草稿编辑路径, Enter/失焦在有效时提交, Escape 撤销草稿. 只检查绝对路径/无 NUL 的输入形状; 分段规范化、.. 边界和 shell quoting 复用 Rust 唯一 helper.
- 不使用本机目录对话框编辑手机路径, 不做 shell 变量/~ 展开, 不用 Windows 分隔符处理 Android 路径.
- 每次真正激活文件页、切设备或点击 Home 时从有效设置读取快照, 传给现有 listDeviceDirectory(serial, path). 不把设置对象加入加载 effect 依赖.
- 设置未成功加载时不请求一个假的默认路径, 展示已有配置错误入口. 编辑路径可离线完成, 可访问性由之后的设备请求确认.
- list-error 保留失败的目标地址草稿以便修正; 已有成功列表保留原 path, 不伪装成目标路径. 首次进入失败时也能编辑输入框.
- 失败状态提供重试/显式打开下载目录. 后者传 null, 仅本次导航, 不改写已保存的起始目录.
- Home 的 tooltip 改为 "返回起始目录", 不再固定写下载目录. 请求代次和 active 清理规则沿用原控制器.

## 应用排序

- 扩展 lib/appInfo.ts 的 sortAppInfo(apps, preferences), 保留不变排序入口, 使用新 apps 偏好和已有 collator.
- 从 PackageManager 的 readCache/readFresh/packages 回退三处移除提前排序, 保留原加载/显式降级协议.
- 只在最终 memo 投影执行 filterAppInfo -> sortAppInfo. useCallback loadApps 不依赖排序, 不重启设备请求和 icon 批次.
- 名称沿用 appDisplayName 和 zh-CN numeric collator; 包名按字符串比较. 名称平局最终按 packageName 唯一键排列.
- 时间/APK 大小 <= 0 视为元信息未知, 无论升降序都放最后. 已知值按方向排列, 同值仍按名称/包名升序打破平局.
- 图标请求继续按可见包名、现有缓存和批次规则执行. 排序可能让新的可见项补图标, 但不重新查询全部应用.
- 选择和危险操作绑定 packageName, 不使用重排行号. 纯排序不重置搜索/确认目标/数据缓存.

## 生码状态拆分

- useSettingsStore.codegen 是类型/分隔符唯一有效来源. 移除 codeGenerator store 对这些长期参数的所有权, 不把两个 store 用 effect 同步.
- codeGenerator store 保留正文、正文 revision、生成快照、错误. GeneratorDraft 类型仍可作为 parseBatchInput 的临时输入 DTO, 不代表持久存储.
- 生成 action 从 requireSettings() 读取一次参数, 和当前正文构成完整快照后调用现有 parseBatchInput; 继续由用户显式生成.
- GeneratedBatch 保存参数快照和正文版本, 过时状态比较当前正文版本及参数值. 修改设置只影响下一次生成, 旧 canvas 仍使用结果快照的 codeType/values.
- 页面和弹窗直接调用同一个设置 action. 普通参数变更保存成功才切换有效值, 保存失败保留旧值与错误.
- customSeparator 可以暂存空字符串, 包括 custom 模式, 作为未完成参数编辑. 生成时仍由现有解析器明确拒绝空值; UI 显示字段错误且不可生成, 不做隐藏默认值.
- 清空清正文/结果/输入错误/预览, 不写设置. canClear 只看可清内容, 不再因为非默认类型/分隔符而亮起.
- 分组恢复默认保留正文/结果, 只改 codegen 组. 清除旧参数相关错误或重新派生错误, 不显示与当前参数无关的旧校验提示.
- 生成结果的 sourceRevision 相关 tests/props 必须一起调整, 不保留失效的第二套过时判断.

## 控件与状态

| 控件 | 正常与成功 | 加载/禁用 | 失败/边界 |
| --- | --- | --- | --- |
| 文件/应用排序 | 菜单+方向图标, 成功保存后即时排序 | 数据加载不妨碍改偏好; 配置不可用时禁用 | 存储失败显示原值, 元信息未知排最后 |
| 起始路径 | 预设菜单, 自定义时整行输入 | 离线可改, 不请求设备 | 无效草稿就地报错, 导航失败保留可编辑地址 |
| 生码参数 | 类型分段/分隔符菜单/自定义输入, 双入口一致 | 配置不可用时阻止生成 | 自定义空值错误, 不修改已有结果 |
| 恢复本组默认 | 只写当前组, 无逐次成功 toast | 配置不可用禁用 | 沿用显式恢复新设置入口 |
| 页头设置图标 | 打开对应组, 关闭回触发按钮 | 无设备时至少侧栏入口可用 | 900px 工具栏必要时两行, 不隐藏重要动作 |

## 影响范围

- src/lib/settings.ts, src/store/settings.ts, src/components/settings/SettingsDialog.tsx, src/store/ui.ts 的分组类型消费.
- src/components/DeviceFileManager.tsx, src/lib/deviceFiles.ts, src-tauri/src/commands/device_files.rs.
- src/components/PackageManager.tsx, src/lib/appInfo.ts.
- src/components/CodeGeneratorPage.tsx, src/lib/codeGenerator.ts, src/store/codeGenerator.ts, 结果消费组件及相邻测试.
- 更新 frontend/settings-clipboard.md/state-management.md 和 backend 设备文件展示排序合约. 不修改 DEX 或剪贴板功能.

## 验证与回滚

纯函数/store 测试覆盖全部排序、迁移、清空和过时快照; Browser 覆盖七分组/两主题/最小窗口; 真机验证目录/应用异步数据和无多余查询. 按整体偏好所有权边界撤回, 不清除用户存储.

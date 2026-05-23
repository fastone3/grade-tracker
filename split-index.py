"""
split-index.py — 将 index.js 按 Q4 设计方案拆分为 4 个文件

依赖关系: core.js → achievements.js → modules.js → main.js
"""
import re

with open('index.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

total = len(lines)

# ========== 定义每个文件的精确行范围 ==========
# 行号从 1 开始 (1-indexed)

# core.js (无依赖)
core_ranges = [
    # 1. Config 段: 行1-47 (header + 3 var + 4 func)
    (1, 47),
    # 2. DataAccess 段: 行49-117 (section header + loadData + migrateData + inferPool + getDefaultData)
    (49, 117),
    # 3. saveData: 行479-484 (JSDoc + function)
    (479, 484),
    # 4. UiUtils - showAlert: 行552-565
    (552, 565),
    # 5. UiUtils - switchSubTab: 行567-586
    (567, 586),
    # 6. UiUtils - fmtLocalDate: 行588-599
    (588, 599),
    # 7. ModalUtils: 行2383-2407
    (2383, 2407),
]

# achievements.js (依赖 core.js)
ach_ranges = [
    # 完整成就系统: 行118-478
    (118, 478),
]

# modules.js (依赖 core.js + achievements.js)
modules_ranges = [
    # ChildSwitcher: 行501-550 (comment + switchChild + updateChildSwitcherLabels + saveChildNames)
    (501, 550),
    # Advanced: 行601-981
    (601, 981),
    # Practice: 行1106-1258
    (1106, 1258),
    # switchDailySubTab: 行1260-1277
    (1260, 1277),
    # Daily: 行1279-1780
    (1279, 1780),
    # Dashboard: 行1782-1863
    (1782, 1863),
    # History + Trend: 行1865-1948
    (1865, 1948),
    # renderPoints: 行1950-1984
    (1950, 1984),
    # Points add/spend: 行1986-2048
    (1986, 2048),
    # renderSettings + saveTotal/Quiz: 行2050-2099
    (2050, 2099),
    # Sync/Export/Import: 行2100-2381
    (2100, 2381),
]

# main.js (依赖所有)
main_ranges = [
    # Chart.js config: 行485-496
    (485, 496),
    # GlobalState: 行498-499 (chartScore, chartRank, data = loadData())
    (498, 499),
    # Navigation: 行983-1104 (switchTab, switchTabMobile, renderTab, openSettings, refreshCurrentPanel, switchDailySubTabUI, switchSubTabUI)
    (983, 1104),
    # Init: 行2409-2417
    (2409, 2417),
    # toggleAccordion: 行2419-2427
    (2419, 2427),
]


def extract_ranges(ranges, all_lines):
    """从行列表中提取指定范围，返回拼接后的文本"""
    parts = []
    for start, end in all_ranges:
        # 转换为 0-indexed
        for i in range(start - 1, end):
            parts.append(lines[i])
    result = ''.join(parts)
    # 确保末尾有换行
    if result and not result.endswith('\n'):
        result += '\n'
    return result


# 提取
core_code = extract_ranges(core_ranges, lines)
ach_code = extract_ranges(ach_ranges, lines)
modules_code = extract_ranges(modules_ranges, lines)
main_code = extract_ranges(main_ranges, lines)

# 写入
with open('core.js', 'w', encoding='utf-8') as f:
    f.write(core_code)
with open('achievements.js', 'w', encoding='utf-8') as f:
    f.write(ach_code)
with open('modules.js', 'w', encoding='utf-8') as f:
    f.write(modules_code)
with open('main.js', 'w', encoding='utf-8') as f:
    f.write(main_code)

print(f"=== 拆分完成 ===")
print(f"core.js:        {len(core_code.splitlines())} 行")
print(f"achievements.js: {len(ach_code.splitlines())} 行")
print(f"modules.js:     {len(modules_code.splitlines())} 行")
print(f"main.js:        {len(main_code.splitlines())} 行")
print(f"总计:           {len(core_code.splitlines()) + len(ach_code.splitlines()) + len(modules_code.splitlines()) + len(main_code.splitlines())} 行")
print(f"原始 index.js:  {total} 行")
print()

# 验证：检查所有全局声明是否被覆盖
all_var_func = set()
original_content = ''.join(lines)

# 查找所有 var 声明
for m in re.finditer(r'^var\s+(\w+)', original_content, re.MULTILINE):
    all_var_func.add(('var', m.group(1)))

# 查找所有 function 声明
for m in re.finditer(r'^(async\s+)?function\s+(\w+)', original_content, re.MULTILINE):
    all_var_func.add(('func', m.group(2)))

# 检查每个声明出现在哪个文件中
def find_in(text, name, kind):
    if kind == 'var':
        return re.search(r'^var\s+' + re.escape(name) + r'\b', text, re.MULTILINE) is not None
    else:
        return re.search(r'^(async\s+)?function\s+' + re.escape(name), text, re.MULTILINE) is not None

all_output = core_code + ach_code + modules_code + main_code
missing = []
for kind, name in all_var_func:
    if not find_in(all_output, name, kind):
        missing.append((kind, name))

if missing:
    print(f"⚠️ 缺失 {len(missing)} 个声明:")
    for kind, name in missing:
        print(f"   {kind}: {name}")
else:
    print("✅ 所有全局声明已完整覆盖")

# 验证 onclick 引用的函数名
onclick_funcs = set()
for m in re.finditer(r'onclick="([^("]+)\(', original_content, re.MULTILINE):
    onclick_funcs.add(m.group(1))

missing_onclick = []
for fname in onclick_funcs:
    # 检查在任何一个文件中作为函数声明存在
    found = False
    for code in [core_code, ach_code, modules_code, main_code]:
        for match in re.finditer(f'function\\s+{re.escape(fname)}', code):
            # 确保是声明不是字符串引用
            before = code[max(0, match.start()-20):match.start()]
            after = code[match.end():match.end()+5]
            if not before.endswith('=') and not before.endswith(':') and not before.endswith(','):
                found = True
                break
        if found:
            break
    if not found:
        missing_onclick.append(fname)

if missing_onclick:
    print(f"⚠️ onClick 引用了但未找到声明的函数: {missing_onclick}")
else:
    print("✅ 所有 onClick 引用的函数已确认存在")

print()
print("=== 文件大小 ===")
import os
for fn in ['core.js', 'achievements.js', 'modules.js', 'main.js']:
    sz = os.path.getsize(fn)
    print(f"{fn:20s} {sz:>6d} bytes")

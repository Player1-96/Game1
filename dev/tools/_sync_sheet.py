# -*- coding: utf-8 -*-
"""
_sync_sheet.py —— 把 _resources.json 同步到腾讯文档《九劫录·资源表》

用法（在仓库根目录执行）：
    node dev/tools/_export_resources.js    # 先从源码导出最新数值
    python dev/tools/_sync_sheet.py        # 再上传到云端表格（18 个子表整页重写）

只刷个别子表（改文案、补日志这类小事，避免一次性烧完调用配额）：
    python dev/tools/_sync_sheet.py --only 变更日志
    python dev/tools/_sync_sheet.py --only 变更日志,风格地图

表格：https://docs.qq.com/sheet/DTEtrQUFaQmtkamNM
每改动一次 src/ 里的数值，重跑上面两条命令即可，表格会整页重写。

⚠️ 配额：接口按服务端窗口限流，超了报 400007 "You have reached access limit"。
实测连跑 4 整轮后会撞上，且**等待 5 分钟 / 15 分钟 / 30 分钟均不恢复**
（2026-09-23 实测三次），说明不是「短暂限流」，得隔数小时或次日再跑。
所以：改动大才整跑，小改动用 --only。
"""
import json, os, re, subprocess, sys, io, math, time

sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
def _find_skill_dir():
    """自动发现腾讯文档插件目录下的最新版本。

    2026-09-17：插件从 1.0.0 升到 5.5.6 后，旧目录里的 tencentdocs.py
    拿不到登录票据（报 no_token，而同一时刻 MCP 工具通道完全正常）——
    硬编码版本号目录必踩这个坑。取版本号最大的那个可用目录。
    """
    root = os.path.join(os.path.expanduser("~"), ".workbuddy", "plugins", "cache",
                        "workbuddy-builtin", "tencent-docs-plugin")
    cands = []
    for name in os.listdir(root):
        d = os.path.join(root, name, "skills", "tencent-docs")
        if os.path.exists(os.path.join(d, "tencentdocs.py")):
            m = re.match(r"(\d+)\.(\d+)\.(\d+)", name)
            cands.append((tuple(int(x) for x in m.groups()) if m else (0, 0, 0), name, d))
    if not cands:
        raise RuntimeError("找不到腾讯文档插件的 tencentdocs.py：" + root)
    cands.sort()
    print("  插件目录: " + cands[-1][1])
    return cands[-1][2]


SKILL = _find_skill_dir()
FILE_ID = "DTEtrQUFaQmtkamNM"
SHEET_URL = "https://docs.qq.com/sheet/" + FILE_ID
# 固定用公有云域，挡住宿主 provider 下发的死域 apiBase（详见 _tdoc_once 注释）
SKILL_BASE = "https://docs.qq.com"

# 已有的 4 个子表（用户预建），其余按需新建
# ⚠️ 待建的页签不再单独维护一份列表 —— 直接用 TABS 推导（见 main 的第 3 步）。
#    曾经这里另有一份 NEW_TABS，加「Boss 挑战」时漏了它，同步直接报「缺少子表」。
EXISTING = {"法宝": "BB08J2", "功法": "1zmi6r", "敌人": "3ril5k", "道具": "rpajz0"}
RENAME = {"道具": "丹药"}

# 数据快照由 _export_resources.js 写在 dev/data/ 下（本脚本在 dev/tools/）
D = json.load(open(os.path.join(HERE, "..", "data", "_resources.json"), encoding="utf-8"))


def _tdoc_once(tool, args, service):
    """调一次 tencentdocs.py。

    2026-09-23：连接器重新授权后同步仍全挂（全站 503 Tunnel connection failed）。
    定位到两个叠加的环境问题，都在本函数里绕开：

      1) 宿主的 V2 凭据 provider 除了下发票据，还会下发一个 apiBase 覆盖域
         （实测为 https://www-docs.workbuddy.cn）。该域直连 DNS 不解析
         （getaddrinfo failed）、走本机代理则 503 —— 等于把请求从一个可用端点
         劫持到一个死端点。tencentdocs.py 里 `if not api_base` 用的是显式传入的
         环境变量优先，所以预先设 TDOC_API_BASE_URL 就能挡住 provider 的覆盖。
         docs.qq.com 实测直连与走代理都是 200，固定用它。

      2) tencentdocs.py 默认走系统代理（urllib 读注册表 ProxyServer=127.0.0.1:8889），
         本机代理目前对 CONNECT 一律 503。docs.qq.com 直连可达，所以按需清空
         HTTPS_PROXY：仅当代理路径确实 503 时才降级，代理正常时仍优先用代理，
         避免影响别的网络环境。
    """
    args = dict(args); args.setdefault("file_id", FILE_ID)
    env = dict(os.environ)
    env["TDOC_API_BASE_URL"] = SKILL_BASE
    env.pop("HTTP_PROXY", None); env.pop("HTTPS_PROXY", None)
    env.pop("http_proxy", None); env.pop("https_proxy", None)
    for attempt in range(3):
        r = subprocess.run(["python", "tencentdocs.py", "tdoc_call", service, tool,
                            json.dumps(args, ensure_ascii=False)],
                           cwd=SKILL, capture_output=True, text=True, encoding="utf-8",
                           env=env)
        out = (r.stdout or "").strip()
        err = (r.stderr or "")
        if out:
            return out
        if "Tunnel connection failed" not in err:
            raise _Transient(tool + " 无返回: " + err[:300])
        time.sleep(1 + attempt)
    raise _Transient(tool + " 无返回: 代理隧道持续 503（已重试 3 次）")


class _Transient(RuntimeError):
    pass


def tdoc_call(tool, args, service="sheet-mcp"):
    """偶发 504 / 空返回：重试几次再放弃。整同步一次要几百次调用，不能因为一次抖动全盘重来。
    注意：配额类错误（400007）不重试 —— 它是服务端窗口限制，重试只是白等。"""
    last = None
    for attempt in range(4):
        try:
            out = _tdoc_once(tool, args, service)
            j = json.loads(out)
            if "error" in j:
                raise RuntimeError(tool + " 报错: " + json.dumps(j["error"], ensure_ascii=False)[:300])
            return j
        except json.JSONDecodeError:
            last = RuntimeError(tool + " 返回非 JSON")
        except _Transient as e:
            last = RuntimeError(str(e))
        except RuntimeError:
            raise
        time.sleep(2 + attempt * 3)
    raise last


def _is_quota(j):
    """判断是不是「配额用尽」类错误（400007 access limit）。"""
    e = j.get("error")
    if not isinstance(e, dict):
        return False
    return str(e.get("code")) == "400007" or "access limit" in str(e.get("message", "")).lower()


def tdoc_payload(tool, args, service="sheet-mcp"):
    """取回工具返回的业务对象（structuredContent 缺失时回退解析 content[0].text）。"""
    j = tdoc_call(tool, args, service)
    if _is_quota(j):
        # 配额按「服务端窗口」计，等几分钟不会恢复。快速失败并指向 --only，
        # 这样单个子表（如「变更日志」）的小改动不用重跑整张表。
        raise RuntimeError(
            "腾讯文档配额已用尽（400007 access limit）。短时重试无效，"
            "建议隔几小时再跑；只想补个别子表可用：python _sync_sheet.py --only 变更日志")
    sc = j.get("structuredContent")
    if sc:
        return sc
    for c in (j.get("result") or {}).get("content") or []:
        if c.get("type") == "text":
            try:
                return json.loads(c["text"])
            except Exception:
                pass
    return {}


def to_csv(rows):
    """生成 CSV 文本；单元格内避免半角逗号，改用全角，防止被朴素解析器截断。
    云端解析器要求每行字段数一致，所以统一按最宽行补空单元格。"""
    width = max(len(r) for r in rows) if rows else 0
    buf = io.StringIO()
    for row in rows:
        cells = []
        for c in list(row) + [""] * (width - len(row)):
            s = "" if c is None else str(c)
            s = s.replace(",", "，").replace('"', "“")
            cells.append(s)
        buf.write(",".join(cells) + "\n")
    return buf.getvalue()


def write_tab(sheet_id, rows):
    csv = to_csv(rows)
    tdoc_call("clear_range_all", {"sheet_id": sheet_id, "start_row": 0, "start_col": 0,
                                  "end_row": max(60, len(rows) + 10), "end_col": 20})
    tdoc_call("set_range_value_by_csv", {"sheet_id": sheet_id, "start_row": 0, "start_col": 0, "csv_data": csv})
    return len(rows), max(len(r) for r in rows)


def _col_px(w):
    """widths 里写的是「大致放几个字」，换算成像素（下限 56，免得窄列把字挤成竖排）。"""
    return max(56, int(w) * 8)


def _disp_units(s):
    """粗略显示宽度：中日韩字符算 1 个字，其余算 0.55 个字。"""
    n = 0.0
    for ch in str(s):
        n += 1.0 if ord(ch) > 0x2E80 else 0.55
    return n


def row_height(rows, widths):
    """按最长单元格估算这页数据行要多高，否则 wrap 之后文字会被行高裁掉。"""
    lines = 1
    for row in rows:
        for c, cell in enumerate(row):
            if cell is None or cell == "":
                continue
            cap = max(2.0, (_col_px(widths[c] if c < len(widths) else 20) - 10) / 14.0)
            need = 0
            for seg in str(cell).split("\n"):
                need += max(1, int(math.ceil(_disp_units(seg) / cap)))
            lines = max(lines, need)
    return float(min(90, 20 + (lines - 1) * 15))


def style_tab(sheet_id, nrows, ncols, widths=None, rows=None):
    tdoc_call("set_cell_style", {"sheet_id": sheet_id, "start_row": 0, "start_col": 0,
                                 "end_row": 0, "end_col": max(0, ncols - 1),
                                 "bold": True, "font_color": "FFFFFFFF",
                                 "bg_color": "FF4A3F6B", "horizontal_align": "center",
                                 "vertical_align": "center", "wrap_text": True})
    if nrows > 1:
        tdoc_call("set_cell_style", {"sheet_id": sheet_id, "start_row": 1, "start_col": 0,
                                     "end_row": nrows - 1, "end_col": max(0, ncols - 1),
                                     "vertical_align": "top", "wrap_text": True})
    tdoc_call("set_freeze", {"sheet_id": sheet_id, "row_count": 1, "col_count": 1})
    if widths:
        n = len(widths)
        # 两个坑：
        # 1) set_dimension_size 的列宽单位是「像素」，不是字符数。早期这里直接传
        #    10/30 这种字数，列被压成十几像素，文字只能一个字一行地竖排，整张表没法看。
        # 2) 对「已经有自定义列宽」的列再设 size 会被静默忽略，必须先用 is_clear 清掉旧值。
        # 另外 size 要传浮点数，传整数同样不生效。
        tdoc_call("set_dimension_size", {"sheet_id": sheet_id, "dimensions": [
            {"dimension_type": "col", "start_index": i, "end_index": i, "is_clear": True}
            for i in range(n)]})
        tdoc_call("set_dimension_size", {"sheet_id": sheet_id, "dimensions": [
            {"dimension_type": "col", "start_index": i, "end_index": i,
             "size": float(_col_px(w))}
            for i, w in enumerate(widths)]})
        # 表头要留出两行的高度，长表头（如「坊市价·1号位(1/3/5层)」）换行才不会被裁掉
        tdoc_call("set_dimension_size", {"sheet_id": sheet_id, "dimensions": [
            {"dimension_type": "row", "start_index": 0, "end_index": 0, "is_clear": True}]})
        tdoc_call("set_dimension_size", {"sheet_id": sheet_id, "dimensions": [
            {"dimension_type": "row", "start_index": 0, "end_index": 0, "size": float(36)}]})
        # 数据行同理：默认 20px 放不下换行后的长文本（描述、概率、备注这些列），
        # 按最长的那一格估算统一行高。表末的「说明」行字数多但只是注解，
        # 单独估一遍，免得把上面几十行数据行一起撑得很高。
        if nrows > 1 and rows:
            note_at = nrows
            for i in range(1, nrows):
                if rows[i] and str(rows[i][0]).strip() in ("说明", "填写说明"):
                    note_at = i
                    break
            data_end = max(1, note_at - 1)
            segs = [(1, data_end, rows[1:data_end + 1])]
            if note_at < nrows:
                segs.append((note_at, nrows - 1, rows[note_at:]))
            for r0, r1, seg in segs:
                if r0 > r1 or not seg:
                    continue
                tdoc_call("set_dimension_size", {"sheet_id": sheet_id, "dimensions": [
                    {"dimension_type": "row", "start_index": r0, "end_index": r1,
                     "is_clear": True}]})
                tdoc_call("set_dimension_size", {"sheet_id": sheet_id, "dimensions": [
                    {"dimension_type": "row", "start_index": r0, "end_index": r1,
                     "size": row_height(seg, widths)}]})


# ---------------------------------------------------------------- 法宝
def tab_fabao():
    d = {s["depth"]: s for s in D["shopPrices"]}
    def price(slot_idx, depths=(1, 3, 5)):
        out = []
        for dp in depths:
            hit = [s for s in d[dp]["slots"] if s["idx"] == slot_idx]
            out.append(hit[0]["price"] if hit else "-")
        return " / ".join(str(x) for x in out)
    head = ["ID", "名称", "类型", "通用效果", "实际数值改动", "飞剑流", "巨剑流", "舞剑流",
            "可叠加", "珍稀", "满阶上限", "二阶效果", "三阶效果",
            "坊市价·1号位(1/3/5层)", "坊市价·3号位", "坊市价·4号位", "抽取概率",
            "叠 2 层合计", "叠 3 层合计", "备注"]
    rows = [head]
    for it in D["items"]:
        if it["type"] != "fabao":
            continue
        bs = it["byStyle"] or {}
        fj = bs.get("feijian", {}); jj = bs.get("jujian", {}); wj = bs.get("wujian", {})
        maxrank = (len(it["up"]) + 1) if it["func"] else "∞"
        rows.append([
            it["id"], it["name"], "功能型" if it["func"] else "数值型",
            it["desc"], it["apply"],
            (fj.get("name", "") + "：" + fj.get("desc", "")) if fj else "同通用",
            (jj.get("name", "") + "：" + jj.get("desc", "")) if jj else "同通用",
            (wj.get("name", "") + "：" + wj.get("desc", "")) if wj else "同通用",
            "否（重复即进阶）" if it["func"] else "是（数值再涨）",
            "★" if it.get("rare") else "",
            maxrank,
            it["up"][0] if len(it["up"]) > 0 else "",
            it["up"][1] if len(it["up"]) > 1 else "",
            price(1), price(3), price(4),
            "未持有 72%/Nf；已持有 28%/Na；满阶出池" if it["func"] else "未持有 72%/Nf；已持有 28%/Na",
            it.get("tally2", ""), it.get("tally3", ""),
            "重复得：+0.5 伤害（精炼）" if not it["func"] else "满阶后再抽不到"
        ])
    rows.append([])
    rows.append(["说明", "Nf = 未持有的法宝数；Na = 可抽池大小（功能型满阶后出池；数值型恒在池）",
                 "抽取入口 rollFabaoId()：72% 优先补没见过的、28% 允许重复",
                 "价格随层数递增：1号位 13+2×层；3号位 15+2×层；4号位 17+2.5×层（四舍五入）"])
    rows.append(["说明", "数值型重复：伤害 +0.5 并飘 REFINED；功能型重复：进阶并飘 UPGRADE",
                 "巨剑流下 spread（分剑数）折算成剑身宽度与威力，不分剑",
                 "舞剑流下 spread 折算成挥砍弧度、pierce 折算成「一刀多扫几只」，"
                 "射速法宝同时加快挥砍与蓄势"])
    rows.append(["说明", "★「玄元镜」是唯一一件在三个流派下用途完全不同的法宝：飞剑 / 巨剑流下是"
                 "「击落敌方术法」（范围随镜阶扩大）；舞剑流下化名「照影镜」—— 斩中的术法不再湮灭，"
                 "而是掉头打回去（伤害 = 玩家伤害 ×(0.8+0.5×镜阶)；一、二重是 180° 原路回敬，"
                 "只有满三重才自寻最近的妖物并可多穿透 2 个）。它的进阶效果也随流派变（见 upByStyle）"])
    rows.append(["说明", "★珍稀 = 金匣（花 1 把钥匙）专用池，只出这一批；常规抽取仍可能出到它们",
                 "数值型同种会堆叠：背包只占一格并标 LvN，说明里按份数给出合计数值"])
    return rows, [10, 16, 9, 30, 26, 34, 38, 38, 16, 7, 10, 34, 34, 20, 14, 14, 30, 26, 26, 24]


# ---------------------------------------------------------------- 小技能（原「功法」页签）
MEANING = {
    "tianlei": "基础伤害（实际 = 该值 + 伤害 × 2）",
    "suodi": "无敌帧数（60 帧 = 1 秒）",
    "wuxing": "无敌帧数（60 帧 = 1 秒）",
    "huti": "护盾层数（5 秒后整层散去；范围 140+20×级，伤害 6+3×级，冷却恒为 10 秒）",
    "qinlong": "摄拿半径（妖物被扯到身前 20px；伤害 5+3×级；尊者摄不动；冷却 5.0→3.4 秒）",
    "liekong": "剑气基础伤害（实际 = 该值 + 伤害 × 1.5；pierce 拉满，一条线上的妖物一起吃）"
}


def tab_gongfa():
    f1, f3, f5 = D["shopPrices"][0], D["shopPrices"][2], D["shopPrices"][4]
    def price(idx, sp):
        hit = [s for s in sp["slots"] if s["idx"] == idx]
        return hit[0]["price"] if hit else "-"
    c = D["skillConst"]
    head = ["ID", "名称", "英文", "灵力消耗", "满级", "数值含义",
            "Lv1", "Lv2", "Lv3", "Lv4", "Lv5",
            "冷却 Lv1", "冷却 Lv2", "冷却 Lv3", "冷却 Lv4", "冷却 Lv5",
            "Lv1 效果", "Lv5 效果", "获取途径", "备注"]
    rows = [head]
    for s in D["skills"]:
        cd = s.get("cd") or []
        cds = ["%.1f 秒" % (v / 60) for v in cd]
        rows.append([s["id"], s["name"], s["en"], s["cost"], s["maxLv"], MEANING.get(s["id"], "")] +
                    s["vals"] + cds +
                    [s["descs"][0].replace(s["name"], "").strip(), s["descs"][4],
                     "坊市 4 号位（60%）/ 金匣附赠（35%）/ 祭坛（30%）",
                     "重复拾得即升级，价格不随等级上涨"])
    rows.append([])
    rows.append(["说明", "释放键 Q（1/2/3 切换当前槽位）；同一时间最多携带 %d 个" % c["SLOT_COUNT"]])
    rows.append(["说明", "槽位已满再拾到新技能 → 二次确认替换，换上的技能从 1 级重新起算"])
    rows.append(["说明", "满级（Lv.%d）后重复拾得 → 灵力上限 +5，并立刻回 25 点灵力" % c["SKILL_MAX_LV"]])
    rows.append(["说明", "公共冷却 %d 帧（%.1f 秒）只防连点；真正限制节奏的是各技能自己的冷却，"
                 "每个槽位一份、互不影响，切槽位也绕不过去" % (c["SKILL_GCD"], c["SKILL_GCD"] / 60)])
    rows.append(["说明", "护盾分两种：常驻护盾（太虚护盾 / 羽衣 / 灵力丹 / 地上拾取）不设时限，"
                 "只被受击逐层扣掉，可以一直囤着；限时护盾只有护体金光会结，"
                 "维持 %d 帧（%.0f 秒），到点整层散去" % (c["SHIELD_DUR"], c["SHIELD_DUR"] / 60)])
    rows.append(["说明", "太虚护盾不再是一次性几格：到手（或升阶）即补满，此后每次受创都重新数无伤时长，"
                 "在**还有敌人的房间**里连续 N 帧不挨打就补回一格、到上限为止；"
                 "清房后计时停住、不再累计 —— 否则站着干等就能刷满，等于每间房白送几格。"
                 "被护盾挡下的那一下同样算受创（计时归零），但无敌帧内挨打不算。"
                 "三阶的上限与间隔见「法宝」页该行的说明与进阶文案"])
    rows.append(["说明", "擒龙手 / 裂空斩是配舞剑流的近战向功法：前者把场面拉到自己剑下"
                 "（扇形外的妖物摄不动、尊者也摄不动，顺手拍开身前术法），"
                 "后者把剑送得更远（朝指针劈出贯通剑气，一条线上的妖物一起吃）"])
    rows.append([])
    rows.append(["灵力系统", "数值", "说明"])
    rows.append(["灵力上限", c["MP_MAX"], "小技能的消耗资源；满级重复拾取可再 +5"])
    rows.append(["开局灵力", c["MP_START"], ""])
    rows.append(["自然回复", "开局 0 点/秒", "全靠法宝「回灵符」提供，每份 +1 点/秒、可叠加"
                 "（每份每 %d 帧回 1 点）。用整数计数而非浮点累加，否则会拖成每 16 帧 1 点"
                 % (c["mpTickFrames"] or 60)])
    rows.append(["灵力珠掉落", "斩普通妖物 %d%% 概率掉 1 颗（再 × 段衰减）" % round(c["MP_DROP_RATE"] * 100),
                 "数量 = clamp(round(妖物最大气血 / 6 × 段衰减), 1, 8)；掉率与数量都随【段】递减"])
    rows.append(["精英必掉", "每次 +%d 点（掉 1 颗大灵力珠，量 × 段衰减）" % c["MP_ELITE_DROP"], ""])
    rows.append(["Boss 转阶段", "散落 3 颗 × %d 点（单颗量 × 段衰减）" % c["MP_BOSS_PHASE"],
                 "逼玩家在 Boss 变强的当口跑位去捡"])
    rows.append(["产出衰减", "scale = %s^(段号)" % D.get("styleMap", {}).get("lootDecay", 0.82),
                 "⚠️ 单位是【段】不是层：15 层制下按层算会剩 6%（死局）。"
                 "后期 build 成型 + 怪变多 + 气运上升会把难度拉平，故心血与灵力珠的基础期望逐段下压；"
                 "详见「经济掉落」页的产出衰减块"])
    rows.append(["说明", "灵力不再自动到账，必须跑过去捡：这不是「站桩回蓝」，而是一份要主动去拿的资源"])
    rows.append(["说明", "灵力珠 = 靛蓝菱形宝珠（带脉动青晕）；灵石 = 碧绿方孔钱。形状、颜色、拾取音效都不同"])
    rows.append(["坊市价（4 号位）", "%s / %s / %s（1/3/5 层）" % (price(4, f1), price(4, f3), price(4, f5)),
                 "该位置 60% 出小技能，否则出法宝"])
    return rows, [12, 14, 10, 10, 8, 30, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 34, 34, 34, 32]


# ---------------------------------------------------------------- 专属技能
def tab_ult():
    st = {s["id"]: s["name"] for s in D["styles"]}
    head = ["ID", "流派", "名称", "英文", "释放键", "冷却帧", "冷却秒", "效果", "1 级基准数值", "获取方式", "升级方式"]
    rows = [head]
    for u in D["ults"]:
        base = "；".join("%s=%s" % (k, v) for k, v in u["base"].items())
        rows.append([u["id"], st.get(u["style"], u["style"]), u["name"], u["en"], "空格",
                     u["cd"], round(u["cd"] / 60, 1), u["desc"], base,
                     "开局即自带（近战没有突进贴不了身）" if u["style"] == "wujian"
                     else "首次斩杀精英自动获得",
                     "此后每次斩杀精英弹出三选一升级（每条路线最多 %d 级）" % D["skillConst"]["ULT_PATH_MAX"]])
    rows.append([])
    wj = next((u["base"] for u in D["ults"] if u["style"] == "wujian"), None)
    rows.append(["说明", "万剑归宗：三柄沿法线并列齐射（间距 11px，不再扇形发散），连绵十轮共 30 柄；"
                        "升级可加剑数 / 追踪 / 属性 / 移速 / 缩短冷却 / 穿透"])
    rows.append(["说明", "天崩剑狱：指针处先出现预警圈（30 帧 ≈ 0.5 秒），落地后对圈内造成 AOE；升级可清弹幕 / 加蓄力 / 加伤害 / 扩范围 / 留余震"])
    rows.append(["说明", "剑影三叠：按住空格蓄势（24 帧 ≈ 0.4 秒蓄满），松手朝指针突进斩击，"
                        "突进全程无敌；一段命中后 1.4 秒内可立即接二段"
                        "（靠连段窗口放行，不看冷却），二段伤害 ×1.2；二段命中后再接三段，落脚化作五连斩且必定暴击。"
                        "冷却自第一段释放起算，二/三段既不重置也不清零，连招全程的击杀返还一路累积。"
                        "该流派开局即自带专属技，基础冷却压到 15 秒（其余流派为 30 秒）"])
    if wj:
        rows.append(["说明", "剑影三叠 · 蓄势长短决定突进远近：距离在 %d~%d px 之间线性插值，"
                        "突进帧数在 %d~%d 帧之间同步伸缩（短突进的位移小、无敌时间也短）；"
                        "只有低于 %d 帧（≈ %.2f 秒）的点按算误触 —— 收势、不位移、不收冷却。"
                        "蓄势时 HUD 槽上有能放出的下限刻度，地上沿指针点出落点预览"
                        % (wj["dashMin"], wj["dash"], wj["durMin"], wj["dur"],
                           wj["chargeMin"], wj["chargeMin"] / 60)])
    rows.append(["说明", "专属冷却的名义下限为 8 秒（%d 帧）—— 它只约束「释放时固定扣减」型路线；"
                        "舞剑流的「剑意不绝」改成了击杀返还（mode=kill），不在释放那一刻扣，"
                        "名义冷却恒为 15 秒，靠击杀一笔笔往回退，因此不受这条下限管"
                        % D["skillConst"]["ULT_CD_MIN"]])
    rows.append(["说明", "三个流派的专属技能都朝鼠标指针释放：飞剑取指针角度，巨剑取指针落点，"
                        "舞剑取指针方向做突进；鼠标没动过才依次退回最近瞄准方向、人物朝向"])
    rows.append(["说明", "舞剑流的风险：起手蓄势期间被打断 → 剑势溃散、技能立刻进冷却；"
                        "命中后没在连段窗口内接招 → 连招归零、冷却同样回满。"
                        "但「已经连上的招」不会被打断 —— 一段命中后（连段窗口内）的蓄势自带无敌，"
                        "三段突进与落脚的五连斩全程无敌，收招再留 %d 帧余韵，"
                        "保证五连斩一定砍得出来" % D["skillConst"]["WJ"]["flurryGrace"]])
    return rows, [10, 12, 16, 14, 9, 9, 9, 44, 44, 26, 44]


# ---------------------------------------------------------------- 升级路线
def tab_ultpath():
    st = {s["id"]: s["name"] for s in D["styles"]}
    head = ["流派", "ID", "名称", "英文", "上限", "数值 Lv1", "数值 Lv2", "数值 Lv3",
            "Lv1 说明", "Lv2 说明", "Lv3 说明", "备注"]
    rows = [head]
    for p in D["ultPaths"]:
        note = ""
        if p["dur"]:
            note = "持续 %s 帧（%.1f / %.1f / %.1f 秒）" % (
                "/".join(str(x) for x in p["dur"]), p["dur"][0] / 60, p["dur"][1] / 60, p["dur"][2] / 60)
        if p.get("mode") == "kill":
            note = (note + "；" if note else "") + \
                "击杀返还型：每击杀一只妖物返还一档冷却，不在释放时扣减（只此一条）"
        rows.append([st.get(p["style"], p["style"]), p["id"], p["name"], p["en"], p["maxLv"]] +
                    list(p["vals"]) + p["descs"] + [note])
    rows.append([])
    rows.append(["说明", "每次斩精英，从未满级的路线里随机抽 3 条供选择；已满级的路线不再出现"])
    rows.append(["说明", "全部路线满级后，再斩精英改为灵力上限 +10"])
    rows.append(["说明", "专属技能显示等级 = 1 + 已学路线总级数（界面右上角 L 后的数字）"])
    rows.append(["说明", "舞剑流的 6 条路线：剑锋凌厉（伤害 +20/40/60%）、剑势绵长（突进距离 +17/33/50%，"
                        "只乘在蓄满的那一端 —— 蓄满 185 px → 216 / 246 / 277 px，蓄得越久收益越大）、"
                        "凝神聚气（蓄势速度 +40/70/100%）、心剑相随（连段窗口 +30/60/90 帧）、"
                        "剑罡护体（突进后无敌 30/60/90 帧）、剑意不绝（每击杀返还 2/3/4 秒冷却 —— "
                        "只有这一条是「条件触发」的 CDR：蓄势被打断、人没杀掉就一分不返）"])
    return rows, [12, 12, 16, 12, 7, 10, 10, 10, 34, 34, 34, 34]


# ---------------------------------------------------------------- 丹药
def tab_dan():
    d = {s["depth"]: s for s in D["shopPrices"]}
    def p(dp):
        hit = [s for s in D["shopPrices"] if s["depth"] == dp][0]["slots"]
        return [s for s in hit if s["idx"] == 2][0]["price"]
    head = ["ID", "名称", "说明", "实际数值", "坊市价(1/3/5层)", "备注"]
    rows = [head]
    for it in D["items"]:
        if it["type"] != "dan":
            continue
        rows.append([it["id"], it["name"], it["desc"], it["apply"],
                     "%s / %s / %s" % (p(1), p(3), p(5)),
                     "即时生效、不占背包；占坊市 2 号位"])
    rows.append([])
    rows.append(["说明", "气血单位为半心：maxHP 6 = 3 颗心。回春丹 heal(4) 即回复 2 颗心。"])
    return rows, [12, 14, 24, 22, 18, 30]


# ---------------------------------------------------------------- 敌人
def tab_enemy():
    pools = {p["depth"]: {x["id"]: x["p"] for x in p["pool"]} for p in D["pools"]}
    head = ["ID", "名称", "基础血", "移速", "碰撞半径", "接触伤害", "掉灵石", "AI", "AI 说明",
            "体型", "击杀分", "出现层", "抽取率·1层", "抽取率·2层", "抽取率·3层+", "特殊"]
    rows = [head]
    appear = {"xiesui": "1 层起", "chanchu": "1 层起", "yinsha": "1 层起", "xuefu": "1 层起",
              "guixiu": "2 层起", "shikui": "2 层起", "bengyao": "2 层起",
              "jianling": "3 层起", "yingmo": "3 层起", "xuanguang": "3 层起",
              "tiehun": "4 层起", "xuanjia": "4 层起"}
    for e in D["enemies"]:
        g = lambda dp: ("%s%%" % pools[dp][e["id"]]) if e["id"] in pools[dp] else "—"
        rows.append([e["id"], e["cn"], e["hp"], e["speed"], e["r"], e["touch"], e["coins"],
                     e["ai"], e["aiCn"], e["size"], e["score"], appear.get(e["id"], ""),
                     g(1), g(2), g(3), e.get("note", "")])
    rows.append([])
    rows.append(["说明", "血量为 1 层裸装基准；实际 = 基础血 × hpScale，hpScale = (1+0.18×(层-1)) × 动态难度系数（见「动态难度」页）"])
    rows.append(["说明", "抽取率 = 1 / 该层妖物池大小，池内等概率；精英窟随从也从同一池抽"])
    rows.append(["说明", "接触伤害 1 = 半颗心；掉灵石数受聚灵阵（greed）额外触发：概率 = greed × 12%"])
    rows.append(["说明", "妖物池按层解锁：池内等概率，所以「加一种」等于「稀释全部」—— 新妖物一次只放一两种进来，"
                        "既让后四层每层都有新面孔，又不至于把一层的池子冲淡到看不出性格"])
    return rows, [12, 12, 9, 8, 10, 10, 9, 10, 24, 8, 9, 11, 13, 13, 13, 60]


# ---------------------------------------------------------------- 精英
def tab_elite():
    head = ["ID", "名称", "英文标识", "基底妖物", "血量倍率", "移速倍率", "视觉放大", "碰撞倍率",
            "一层血量", "掉灵石", "击杀分", "专属神通", "神通说明", "冷却帧", "冷却秒",
            "选中概率", "死后余祸"]
    rows = [head]
    for e in D["elites"]:
        rows.append([e["id"], e["cn"], e["en"], "%s（%s）" % (e["baseCn"], e["base"]),
                     e["hpMul"], e["spdMul"], e["scale"], e["rMul"],
                     e["hpAtD1"], e["coins"], e["score"], e["perk"], e["perkCn"],
                     e["perkCd"], round(e["perkCd"] / 60, 2),
                     "20%（5 选 1）", e["desc"]])
    rows.append([])
    rows.append(["说明", "精英窟出现率 = min(85%， 38% + 11%×(层-1))；一层 38%、二层 49%、三层 60%、四层 71%、五层 82%"])
    rows.append(["说明", "一层血量 = 基底血 × 血量倍率 × hpScale（1 层裸装 hpScale=1）"])
    rows.append(["说明", "精英窟灵石配额 = 普通石室的 2~3 倍；精英死亡不再额外掉法器，回报移到墙内密室"])
    rows.append(["说明", "随从数 = 2 + floor(层/2) + (动态难度系数 > 1.2 ? 1 : 0)"])
    return rows, [10, 14, 10, 16, 10, 10, 10, 10, 10, 9, 9, 10, 22, 9, 9, 12, 40]


# ---------------------------------------------------------------- BOSS
def tab_boss():
    head = ["ID", "名称", "英文标识", "基础血", "出现层", "主弹幕", "副弹幕", "冲刺速度",
            "碰撞半径", "击杀分", "打法要点"]
    rows = [head]
    for b in D["bosses"]:
        rows.append([b["id"], b["cn"], b["en"], b["hp"], b["appear"],
                     b["boltCn"], b["altCn"] or "—",
                     b["dash"] if b["dash"] else "—（不冲刺）",
                     22, 200, b["gimmick"]])
    rows.append([])
    rows.append(["说明", "血量公式：基础血 × (1 + 0.45×(层-1)) × (1 + (动态难度系数-1) × 0.6)"])
    rows.append(["说明", "阶段阈值：血量 >66% 一阶段 / >33% 二阶段 / ≤33% 三阶段；"
                        "转阶段 40 帧（约 0.67 秒）无敌，期间不吃任何伤害（燃烧等 DoT 也不行）"])
    rows.append(["说明", "转阶段效果：清空全场敌方弹幕 + 震屏 + 咆哮；"
                        "通关奖励：法器二选一（取走其一另一件消散） + 传送阵 + 本层 18% 灵石"])
    rows.append(["说明", "冲刺（轮回法王不冲刺）：先站定蓄势 40 帧（0.67 秒）并在原地画出冲程带，"
                        "方向前 14 帧还跟着玩家转、最后 26 帧钉死 —— 这 26 帧（0.43 秒）就是闪身窗口，"
                        "玩家横移 61px 即可脱离（判定只需让垂距超过 22+6 = 28px）。"
                        "钉死那一声提示音与光带转红就是「该闪了」的读数"])
    rows.append(["说明", "一层一位、固定不轮换（取 BOSS_DEF 的键序），五层正好五位尊者。"
                        "由浅入深依次是「整圈弹幕 → 定点冰符+冲刺 → 弹幕裂变 → 缺口环 → 横扫+鳞罩」，"
                        "越深的那一位题面越新 —— 每一层都要重学一次怎么走位，而不是把前一层再打一遍"])
    rows.append(["说明", "一阶段软时限 %d 秒（%d 帧）：凝形结束后才开始计，到点若还没打掉三分之一血，"
                        "就强制转入二阶段。一阶段的爪牙是按 280 帧一批无限召唤的，没有这条线，"
                        "玩家可以干脆不打 Boss、赖在召唤阶段刷爪牙 —— 而爪牙既掉灵力珠，"
                        "又吃舞剑流「剑意不绝」的击杀返还冷却，会变成一个「我不想输就不会输」的龟缩洞"
                        % (D["skillConst"]["BOSS_P1_LIMIT"] // 60, D["skillConst"]["BOSS_P1_LIMIT"])])
    return rows, [10, 14, 11, 9, 10, 10, 10, 13, 10, 9, 70]


# ---------------------------------------------------------------- Boss 挑战
def tab_challenge():
    """Boss 挑战模式：三档难度的配装公式与头目血量倍率。

    这张表既是玩法说明、也是调参入口 —— 三档的每一格都在
    src/game.js 的 CHALLENGE_DIFF 里改，改完重跑导出即可。"""
    C = D.get("challenge") or {}
    head = ["难度", "英文", "标识", "随机法宝", "随机功法", "专属技等级", "头目血量倍率", "说明"]
    rows = [head]
    for t in C.get("tiers", []):
        rows.append([
            t["name"], t["en"], t["key"],
            "%d 件" % t["items"], "%d 个" % t["skills"], "Lv.%d" % t["ultLv"],
            "×%.1f" % t["bossMul"],
            "随机法宝 = 3 × 系数、功法 = 1 × 系数、专属技等级 = 系数"
        ])
    rows.append([])
    rows.append(["说明", "菜单三级：择流派 → 择魔头 → 择难度（Esc 逐级退回）；"
                        "配装与专属技都按选中的那一派给 —— 挑战模式原先固定用飞剑流"])
    rows.append(["说明", "专属技的进境（升级路线）每档都给 %d 次三选一，全部由玩家手选；"
                        "初始等级 = 1 + 各条路线等级之和，故开局先随机点亮「系数 - 1」条路线"
                        % C.get("upgrades", 3)])
    rows.append(["说明", "头目血量 = 基础血 × 层数系数 × 上表的难度倍率；层数系数按该头目原本镇守的层数取，"
                        "所以「绝」档打第五层的烛龙是最硬的一局"])
    rows.append(["说明", "配装全部走正常获取通道（give / addSkill），因此分流派文案与"
                        "「同件法宝重复获得即进阶」这些规则自动生效"])
    rows.append(["说明", "与真实进度完全隔离：挑战中不写存档、不动既有存档、阵亡也不销档；"
                        "斩杀头目不发战利品、不开传送阵 —— 胜负都直接回选择菜单"])
    rows.append([])
    rows.append(["头目", "菜单题面"])
    for b in C.get("bosses", []):
        rows.append([b["cn"], b["note"]])
    return rows, [12, 20, 10, 12, 12, 13, 15, 56]


# ---------------------------------------------------------------- 无尽试炼
def tab_endless():
    """无尽试炼（无限模式）：三条曲线的参数、实测形状、8 条词缀。

    这张表既是玩法说明、也是调参入口 —— 每一格都在
    src/game.js 的 ENDLESS / ENDLESS_MODS 里改，改完重跑导出即可。"""
    E = D.get("endless") or {}
    P = E.get("params") or {}

    rows = [["参数", "值", "单位", "说明"]]
    def p(k, unit, note):
        return [k, str(P.get(k, "")), unit, note]

    rows.append(p("waveGap0", "帧", "清场后到下一波的基础等待（150 帧 = 2.5 秒）"))
    rows.append(p("waveGapMin", "帧", "最短等待（1.4 秒）"))
    rows.append(p("waveGapDecay", "帧/波", "每波减多少，减到 waveGapMin 为止"))
    rows.append(p("clearCooldown", "帧", "清场后的固定地板 —— 防止「秒清秒刷」"))
    rows.append(p("countBase", "只", "数量曲线的基数"))
    rows.append(p("countGrow", "系数", "数量 = base + ⌊grow × √波次⌋"))
    rows.append(p("countMax", "只", "同屏上限，再多只是卡顿不代表更难"))
    rows.append(p("hpBase", "倍", "血量曲线基数"))
    rows.append(p("hpGrow", "倍/波", "血量 = base × grow^波次（1.075^n）"))
    rows.append(p("hpMax", "倍", "血量上限（×300 之后只是把「打不过」拖成「打不动」）"))
    rows.append(p("segWaves", "波", "每几波把妖物池换一档"))
    rows.append(p("modWaves", "波", "每几波给本波加一条词缀"))
    rows.append(p("modMax", "条", "单波词缀上限，再多会变成看不懂的一锅粥"))
    rows.append(p("baseItems", "件", "空手进场的兜底法宝数"))
    rows.append(p("baseSkills", "个", "空手进场的兜底功法数"))
    rows.append(p("baseUltLv", "级", "空手进场的兜底专属技等级"))
    rows.append(p("healPerWave", "点半心", "每 healWaveEvery 波回多少血"))
    rows.append(p("healWaveEvery", "波", "每几波回一次血"))
    rows.append(p("resultT", "帧", "结算演出停留帧数"))

    rows.append([])
    rows.append(["实测曲线", "数量", "血量倍率", "种类池", "词缀数"])
    for c in (E.get("curve") or []):
        rows.append(["第 %d 波" % c["wave"], "%d 只" % c["count"],
                     "×%.2f" % c["hp"], "%d 种" % c["pool"], "%d 条" % c["mods"]])

    rows.append([])
    rows.append(["词缀", "英文标识", "效果"])
    for m in (E.get("mods") or []):
        rows.append([m["desc"], m["name"], m["effect"]])

    rows.append([])
    rows.append(["说明", "三条曲线各走各的节奏：数量与血量每波都在涨，"
                        "种类每 %d 波换一档，词缀每 %d 波加一条 —— 只叠血量会变成「血包墙」"
                        % (P.get("segWaves", 4), P.get("modWaves", 5))])
    rows.append(["说明", "血量必须另起一条曲线：普通楼层的 difficultyOf() 有 DIFF_MAX = 3.0 封顶，"
                        "拿到无尽里几十波之后完全不动了 —— 那是地板，不是曲线"])
    rows.append(["说明", "下一波只在场面清空后才排 —— 若计时器一边打一边倒数，"
                        "第 60 秒场上会堆到 260+ 只，那不是难度是幻灯片"])
    rows.append(["说明", "词缀是纯逻辑（改速度 / 接触伤害 / 死亡遗毒…），零新美术；"
                        "施加对象是「一波」而不是单只，效果落在 Enemy.update 与 Enemy.die 两处出口"])
    rows.append(["说明", "与真实进度完全隔离：无尽中不写存档、被打死也不销档，"
                        "而是进结算屏；只有破纪录的那一局写进 xiuxian-isaac.endless.v1（与主存档分开的键）"])
    rows.append(["说明", "标题界面按 K 进入；也可带通关 build 进场（startEndless(style, build)）。"
                        "无尽是拿「已通关的档」去考试，考砸了不该把那份档一起烧掉"])
    return rows, [26, 12, 12, 20, 12, 60]


# ---------------------------------------------------------------- 风格地图
def tab_fusion():
    """法宝融合（第 3 期）：配方表、产物机制、出现规则、图鉴。

    ⚠️「机制」这一列是这一期的核心判据：一条配方如果只能用「伤害 +X%」写完，
       它就是伪融合（玩家体感只是「又一个数值法宝」，1+1>2 的爽感不会出现）。
       机制名由 _export_resources.js 跑一遍产物的 apply 读出来，**不是手抄的** ——
       「改了代码忘了改表」在这里不会发生。
    配方表在 src/fusion.js 的 FUSION_DEF；产物定义在那里的 FUSION_ITEMS。"""
    F = D.get("fusion") or {}
    defs = F.get("defs") or []

    rows = [["项", "值", "说明"]]
    rows.append(["配方条数", "%d 条" % F.get("recipes", len(defs)),
                 "src/fusion.js 的 FUSION_DEF —— 手写，不做组合爆炸（全组合必然大量注水）"])
    rows.append(["融合产物数", "%d 件" % F.get("productCount", 0),
                 "带 fusion:true，poolByType() 会排除它 → 掉落 / 坊市 / 金匣一律抽不到"])
    rows.append(["发现方式", "自动（共鸣光晕）",
                 "凑齐一对可融法宝，左下角两个图标浮起金框；悬停即见「可融 / 缺料」与产物名"])
    rows.append(["执行方式", "手动（融合阵按 E）",
                 "复用既有交互词法（祭坛 / 金匣 / 坊市同款），不做拖拽"])
    rows.append(["⚠️ 硬边界", "可融性可见 / 产物内容隐藏",
                 "25 件法宝 = 300 种组合；若连「能不能融」都不显示，玩家只能盲选 —— 功能等于不存在"])
    rows.append(["首次融合", "产物显示 ？？？",
                 "名字 / 数值 / 效果三者全藏；首度融成才揭示并记入图鉴，之后跨局永久完整显示"])
    rows.append(["不可逆", "是",
                 "无拆分；产物是新 id，不能再融进别的配方（一阶）"])
    rows.append(["取舍来源", "机会成本 + 稀缺性",
                 "① 一层至多一座阵 ② 那两件本可融进别的配方。产物 = 两件之和 + 一条新机制（1+1>2 是设计目标）"])
    rows.append(["图鉴存档键", "xiuxian-isaac.fusion.v1",
                 "与游戏存档分开；⚠️ 只有融合阵里的显式确认才写图鉴，挑战 / 无尽的随机配装不解锁"])
    rows.append(["⚠️ 属性重算", "Player.recomputeStats()",
                 "give() 拿到即永久改 stats、扣掉 items 条目不撤销数值 → 融合后必须按持有列表重算，"
                 "否则越融越强、材料白送"])
    rows.append([])

    # 一对多结构：这是「一个只能对应一个太可惜了」那个需求的验收口径
    deg = F.get("degree") or {}
    if deg:
        hubs = " / ".join("%s（%d 条）" % (h.get("name", ""), h.get("n", 0))
                          for h in (deg.get("hubs") or [])) or "（无）"
        rows.append(["项", "值", "说明"])
        rows.append(["枢纽法宝", hubs,
                     "通向 3 条不同产物的法宝。一条路 = 凑齐即唯一解 = 没有决策；"
                     "有 2~3 条，「我这对融还是留给下一对」才成立"])
        rows.append(["通向 2 条的法宝", " / ".join(deg.get("two") or []) or "（无）", ""])
        rows.append(["只有 1 条的法宝", "%d 件" % len(deg.get("one") or []),
                     "仍有改进余地：给它们补第二条路，玩家的选择会更多"])
        rows.append(["暂无配方的法宝", " / ".join(deg.get("none") or []) or "（无）",
                     "多为纯数值法宝（做配方容易变伪融合），或留给二阶当原料"])
        rows.append(["覆盖", "%d / %d 件" % (deg.get("covered", 0), deg.get("total", 0)),
                     "最高度数 %d" % deg.get("maxDeg", 0)])
        rows.append([])

    rows.append(["材料 A", "材料 B", "产物", "机制（新玩法）", "说明"])
    for d in defs:
        rows.append([d.get("aName", ""), d.get("bName", ""), d.get("outName", ""),
                     d.get("mech", ""), d.get("desc", "")])
    rows.append([])

    rows.append(["出现规则", "概率 / 层", "说明"])
    rows.append(["段末（Boss 层）", "100%",
                 "必出一座，落在普通石室里 —— 也就是 Boss 房之前，带着新法宝去打 Boss"])
    rows.append(["其余层", "%.0f%%" % (float(F.get("forgeChance", 0.33)) * 100),
                 "⚠️ 骰子按「层」掷一次，不是按「房」—— 按房掷一层 5 房会变成约 87%，稀缺性直接没了"])
    rows.append(["每层上限", "%d 座" % F.get("forgePerFloorMax", 1),
                 "用过即灭（写回房间数据，出门再回来不复活）"])
    rows.append([])

    rows.append(["说明", "这 6 件产物是本作唯一的「只能靠融合获得」的法宝，"
                        "图标走 icon:'fused'（两剑交会 + 正中金光），背包里一眼可辨"])
    rows.append(["说明", "扩展位（接口留着、内容未做）：二阶融合（把产物 id 写进另一条的 a/b，零改代码）；"
                        "催化剂（配方加 cat 字段）；开局送一条教学配方（缓解冷启动）"])
    return rows, [22, 22, 14, 26, 62]


def tab_stylemap():
    """风格地图（27 条路径）：三个世界、每个世界的三段、每段的代表色。

    ⚠️ 与「流派」（飞剑/巨剑/舞剑）不是一回事：这里是「一局要走过哪些天地」。
    这张表既是玩法说明、也是调参入口 —— 段数 / 每段层数在 src/dungeon.js 的
    SEG_FLOORS / SEG_COUNT 里改（层段系统的唯一真相），
    色板与风格表在 src/px.js 的 STYLE_PAL / STYLE_DEF 里改。"""
    S = D.get("styleMap") or {}
    segFloors = S.get("segFloors", 5)
    segCount = S.get("segCount", 3)
    total = S.get("totalFloors", 15)
    paths = S.get("paths", 27)
    bossBySeg = S.get("bossBySeg") or []
    maxBySeg = S.get("diagMaxBySeg") or []

    rows = [["项", "值", "说明"]]
    rows.append(["每段层数", "%d 层" % segFloors,
                 "src/dungeon.js 的 SEG_FLOORS —— 改这一个常量即可改一局时长（层段系统的唯一真相）"])
    rows.append(["段数", "%d 段" % segCount, "每段开头择一次风格"])
    rows.append(["一局总层数", "%d 层" % total, "= 每段层数 × 段数"])
    rows.append(["层段划分", "段首弹面板（第 %s 层），段末出 Boss（第 %s 层）"
                 % (" / ".join(str(i * segFloors + 1) for i in range(segCount)),
                    " / ".join(str((i + 1) * segFloors) for i in range(segCount))),
                 "「按段」是本期所有跨层节奏的统一单位（难度封顶 / 产出衰减 / 妖物解锁 / 精英率）"])
    rows.append(["每段 Boss", " / ".join(bossBySeg),
                 "按段取人 BOSS_KEYS[min(4, segOf(depth))]，只在段末登场 —— "
                 "一局 3 个 Boss，不再是「5 位尊者撑 15 层、后 10 层连打烛龙」"])
    rows.append(["每段血量封顶", " / ".join(str(v) for v in maxBySeg),
                 "DIFF_MAX_BY_SEG —— 每段各自封顶。若仍固定 3.0，战力到 12 就撞顶、后 5 层难度完全不动"])
    rows.append(["段末 Boss 倍数", " / ".join(str(v) for v in (S.get("bossSegMul") or [])),
                 "BOSS_SEG_MUL —— 段末是唯一硬门槛，故逐段加厚"])
    rows.append(["产出衰减", "×%s / 段（各段 %s）"
                 % (S.get("lootDecay", 0.82),
                    " / ".join(str(v) for v in (S.get("lootPerSeg") or []))),
                 "⚠️ 单位是段不是层：按层算到 15 层只剩 6%（死局）；按段 0.82²≈0.67，对齐原 5~6 层手感"])
    rows.append(["可选风格数", "%d 个（当前可用 %d 个）"
                 % (len(S.get("worlds") or []), len(S.get("pool") or [])),
                 "只有 ready:true 的进选择池；可用数为 1 时直接采用、不弹面板"])
    rows.append(["路径总数", "%d 条" % paths,
                 "每个节点都是完整 N 选 1 且允许重复 → N³；单一风格 3 条 / 两风格 18 条 / 三风格 6 条"])
    rows.append(["开局", "三选一", "只有中式可用时跳过面板直接开局（不给玩家制造空选择）"])
    rows.append(["段间", "每 %d 层再选一次" % segFloors,
                 "第 1 层开局算第一次，之后在第 %s 层弹面板"
                 % " / ".join(str(i * segFloors + 1) for i in range(1, segCount))])
    rows.append(["通关闭幕", "带出走过的路径",
                 "如「历尽 %d 重劫难　历遍『中式·中式·北欧』—— 道心通明，飞升成仙！」" % total])
    rows.append([])

    rows.append(["世界", "代号", "状态", "段", "段名", "意境", "代表色（墙 / 墙亮 / 苔 / 符）"])
    for w in (S.get("worlds") or []):
        segs = w.get("segs") or []
        if not segs:
            rows.append([w.get("name", ""), w.get("id", ""),
                         "未开放（ready:false）", "—", "—", "占位：北欧第四期 / 克苏鲁第五期", "—"])
            continue
        for i, s in enumerate(segs):
            rows.append([
                w.get("name", "") if i == 0 else "",
                w.get("id", "") if i == 0 else "",
                "已开放" if (w.get("ready") and i == 0) else "",
                "%d / %d" % (i + 1, len(segs)), s.get("cn", ""), s.get("desc", ""),
                "%s / %s / %s / %s" % (s.get("wall", ""), s.get("wallHi", ""),
                                       s.get("moss", ""), s.get("rune", ""))
            ])
    rows.append([])

    rows.append(["说明", "三段的差异是纯配色（零新美术）：同一批素材按风格重建烘焙。"])
    rows.append(["说明", "PAL 是 Proxy，指到 PAL_ACTIVE —— 全场 812 处 PAL.xxx 一个字没改，"
                        "风险从「改错一处就静默配色错乱」降到「代理的 5 个 trap 写对就行」"])
    rows.append(["说明", "素材是启动时烘焙的，换风格必须重建；实测整套烘焙约 122ms（7 帧多），"
                        "所以按 style_seg 缓存（单套 107 张 canvas / 0.23MB，三套仅 0.7MB）"])
    rows.append(["说明", "setStyle() 是唯一改 PAL_ACTIVE 的入口 —— buildSprites 的有参/无参两条分支都要走它，"
                        "否则会出现「缓存的键是 cn_2、实际画的是 cn_1」这种不报错的错位"])
    rows.append(["说明", "色板分层：环境色（地面/墙/门/宝箱/描边）收进色板；"
                        "妖物固有色（血蝠永远是红的，那是辨识特征）故意不收；"
                        "#fff / #000 / rgba(...,0.x) 遮罩不收。实测 182 处收敛到 30 处"])
    rows.append(["说明", "色板必须换在 newFloor 之前 —— 房间地砖是生成时按 PAL 画进位图的，"
                        "顺序反了会用旧配色开新层，且不报错（nextFloor 与 continueGame 两处都按此写）"])
    rows.append(["说明", "存档落盘 stylePath（走过哪些风格）与 seg（第几段）；"
                        "老存档缺字段时回落 stylePath=['cn']、seg=segOfFloor(depth)，按层数推导，观感正常"])
    return rows, [20, 26, 12, 8, 14, 30, 30]


# ---------------------------------------------------------------- 房间
def tab_room():
    f1 = D["floors"][0]; f3 = D["floors"][2]; f5 = D["floors"][4]
    head = ["类型", "名称", "每层数量", "出现规则", "灵石配额", "房间内容", "是否锁门", "小地图", "备注"]
    rows = [head,
        ["start", "静心阁", "1", "固定为网格中心", "—", "香炉 / 灯 / 传送法阵", "否", "已探明", "安全屋，无敌人"],
        ["normal", "石室", "%.1f ~ %.1f 间" % (f1["normalRooms"], f5["normalRooms"]),
         "随机扩展生成；总数 = min(20， 11 + 随机0~3 + min(3，层))",
         "约 预算×62% / 普通房数（一层约 3~4 枚）",
         "妖物 1~2 波；石柱 0~2 根；灯 30%", "进房锁门、清空开启", "未进不显示",
         "波次：2 波概率 = 35% + 25%×段内进度"],
        ["boss", "魔窟", "段末 1 间（第 %s 层）"
         % " / ".join(str((i + 1) * (D.get("styleMap", {}).get("segFloors") or 5))
                      for i in range(D.get("styleMap", {}).get("segCount") or 3)),
         "仅段末生成", "预算×18%（最少 3）", "Boss ×1", "进房锁门", "已探明", "通关后开传送阵"],
        ["treasure", "藏珍阁", "0~1", "死胡同中距离 ≥2 者", "—", "木箱（免费）+ 金匣（1 钥匙）", "入口封印门需钥匙/雷符", "未进不显示", "金匣给 1 件珍稀法宝"],
        ["shop", "坊市", "0~1", "死胡同优先", "—（此处是灵石去处）", "4 件货：法宝/丹药/法宝/功法或法宝", "否", "未进不显示", "价格见「经济掉落」页"],
        ["secret", "密室", "0~1", "有精英窟时 60%~80%；无精英窟时 20%", "预算×12%（最少 2）",
         "木箱 ×2 + 散落灵石 ×5", "入口符文裂缝墙（击 3 下或 1 雷符）", "未发现不显示", "唯一通路开在精英窟墙上；近战（舞剑流）剑锋同样劈得开"],
        ["sacrifice", "祭坛", "0~1", "剩余死胡同", "—", "献祭气血赌机缘", "否", "未进不显示", "需 hp > 2 才能献祭"],
    ]
    rows.append([])
    rows.append(["精英窟", "（石室的强化形态）", "0~1", "min(85%， 38% + 11%×(层-1))",
                 "普通石室的 2~3 倍（实测 %.2f~%.2f）" % (min(x["eliteMult"] for x in D["floors"]),
                                                          max(x["eliteMult"] for x in D["floors"])),
                 "精英 ×1 + 随从 2~5", "进房锁门", "未进不显示", "地面有血色符阵；不再额外掉法器"])
    rows.append([])
    rows.append(["说明", "特殊房（藏珍阁/坊市/祭坛/魔窟）一律放在死胡同；密室只接普通房或起始房，避免把特殊房顶成走廊"])
    rows.append(["说明", "精英窟优先挑「旁边还有空位」的石室，否则密室塞不进墙里会退化到别处"])
    return rows, [12, 16, 16, 46, 34, 34, 24, 16, 40]


# ---------------------------------------------------------------- 交互物
def tab_props():
    head = ["名称", "所在房间", "开启消耗", "产出", "概率", "备注"]
    rows = [head,
        ["木箱", "藏珍阁（左）", "免费", "法宝 ×1", "100%", "另有 50% 得 3 灵石、35% 得 1 心（走备用配额）"],
        ["金匣", "藏珍阁（右）", "钥匙 ×1", "珍稀法宝 ×1", "100%", "与封印门争夺同一批钥匙；珍稀池见「法宝」页 ★ 列"],
        ["木箱 ×2", "密室", "免费", "各 法宝 ×1", "100%", "另有 50% 得 3 灵石、35% 得 1 心"],
        ["散落灵石 ×5", "密室", "—", "合计 = 本层预算 ×12%（最少 2）", "—", "按配额均分，不做固定值以免冲垮预算"],
        ["祭坛", "祭坛", "气血 2 点（须 hp > 2）", "法宝 ×1", "65% + 气运 ×3%", "失手改为给 8 灵石（走备用配额）"],
        ["封印门", "藏珍阁入口", "钥匙 ×1 或 雷符 ×1", "放行", "—", "本层锁数 = 1（封印门）+ 金匣数"],
        ["符文裂缝墙", "密室入口（多在精英窟）", "御剑击 3 下 / 近战剑锋劈 3 刀 / 雷符 ×1", "放行", "—",
         "墙耐久 3；未发现时小地图不显示；近战按扇形判定，须朝墙才劈得到"],
        ["坊市货架 ×4", "坊市", "灵石（见经济页）", "对应货品", "—", "买下后原地生成摆件，需走过去拾取"],
        ["传送阵", "魔窟（通关后）", "免费", "进入下一层", "—", "Boss 死后开启"],
        ["法器摆件", "魔窟 / 宝箱 / 祭坛 / 坊市", "—", "取走即生效", "—", "Boss 的两件为一组，取其一另一件消散"],
    ]
    c = D["skillConst"]
    rows.append([])
    rows.append(["技能来源", "出处", "触发条件", "产出", "概率", "备注"])
    rows.append(["小技能", "坊市 4 号位", "花灵石购买", "随机一门小技能", "60%", "否则为法宝；已学满的不会重复推荐"])
    rows.append(["小技能", "藏珍阁 金匣", "钥匙 ×1", "附赠随机小技能", "35%", "与那件珍稀法宝一起掉落"])
    rows.append(["小技能", "祭坛", "气血 2 点", "随机小技能（替代法宝）", "三成机缘里 30%", "其余 70% 仍给法宝"])
    rows.append(["小技能", "拾得已持有的", "—", "该技能 +1 级", "100%", "满级（Lv.%d）后改为灵力上限 +5" % c["SKILL_MAX_LV"]])
    rows.append([])
    rows.append(["专属技能", "精英妖物", "首次斩杀", "本流派专属技能 Lv.1", "100%", "飞剑流 = 万剑归宗；巨剑流 = 天崩剑狱；舞剑流 = 剑影三叠"])
    rows.append(["专属技能", "精英妖物", "再次斩杀", "三选一升级路线", "100%", "每条路线最多 %d 级；全满后改给灵力上限 +10" % c["ULT_PATH_MAX"]])
    rows.append(["技能界面", "—", "槽位满 / 斩精英", "世界冻结并弹出选择面板", "—", "方向键或 1/2/3 选择，Enter 或点击卡片确认"])
    return rows, [16, 24, 22, 32, 16, 46]


# ---------------------------------------------------------------- 经济掉落
def tab_econ():
    sp = {s["depth"]: s for s in D["shopPrices"]}
    fl = {f["depth"]: f for f in D["floors"]}
    # 采样层不再写死 1..6：主玩法 15 层制，取【各段代表层】（段首 + 段末）最有信息量。
    # 段边界：5 层 → 1/5 | 6/10 | 11/15。
    segF = D.get("styleMap", {}).get("segFloors", 5)
    segN = D.get("styleMap", {}).get("segCount", 3)
    depths = []
    for s in range(segN):
        depths.append(s * segF + 1)          # 段首
        depths.append((s + 1) * segF)        # 段末
    head = ["项目", "公式"] + ["%d层" % d for d in depths] + ["说明"]
    rows = [head]
    def slot(idx, name, formula):
        row = [name, formula]
        for d in depths:
            hit = [s for s in sp[d]["slots"] if s["idx"] == idx]
            row.append(hit[0]["price"] if hit else "-")
        return row
    rows.append(slot(1, "坊市 1 号位（法宝）", "round(13 + 2×层)") + ["法宝抽取见「法宝」页"])
    rows.append(slot(2, "坊市 2 号位（丹药）", "round(6 + 1.5×层)") + ["5 种丹药等概率"])
    rows.append(slot(3, "坊市 3 号位（法宝）", "round(15 + 2×层)") + ["比 1 号位贵 2"])
    rows.append(slot(4, "坊市 4 号位（小技能/法宝）", "round(17 + 2.5×层)") + ["60% 出小技能，否则出法宝"])
    rows.append(["坊市总价（消耗端）", "4 件货之和"] + [sp[d]["sink"] for d in depths] + ["本层灵石唯一的去处"])
    rows.append(["本层灵石预算", "max(14， round(总价 × 0.85))"] + [fl[d]["budget"] for d in depths]
                + ["产出略低于消耗，逼取舍"])
    rows.append(["备用配额", "预算 − 普通房 − Boss − 密室"] + [fl[d]["reserve"] for d in depths]
                + ["宝箱灵石、祭坛失手从这里出"])
    rows.append(["钥匙产出", "= 本层锁数"] + [fl[d]["locks"] for d in depths] + ["藏珍阁封印门 1 + 金匣 1"])
    rows.append(["雷符产出", "1 + (随机 < 0.5 ? 1 : 0)"] + [fl[d]["bombs"] for d in depths] + ["可炸封印门或裂缝墙"])
    rows.append(["精英窟灵石倍率", "2 ~ 3 倍普通石室"] + [fl[d]["eliteMult"] for d in depths]
                + ["整层总量不变，只是向精英窟倾斜"])
    rows.append([])
    rows.append(["掉落来源", "数值", "", "", "", "", "", "", ""])
    rows.append(["普通妖物", "见「敌人」页 coins 列（1~3 枚）", "", "", "", "", "", "",
                 "聚灵阵额外触发：greed × 12% 概率再多掉 1 枚"])
    rows.append(["精英妖物", "9 ~ 12 枚（见「精英妖物」页）", "", "", "", "", "", "", "精英死亡不再额外掉法器"])
    rows.append(["魔窟爪牙", "0（整段不掉）", "", "", "", "", "", "",
                 "尊者按阶段无限召唤出来的爪牙不掉灵石，连「贪心」那条预算外掉落也一并封 —— "
                 "生成端无限、配额就形同虚设。该房配额不动，留在击杀尊者时一次性发放"])
    rows.append(["清房奖励", "本房剩余 coinPool", "", "", "", "", "", "", "敌人掉落与清房奖励都从配额里出"])
    rows.append(["精元散（丹药）", "+15 灵石", "", "", "", "", "", "", "一次性，走坊市或宝箱"])
    rows.append([])
    rows.append(["心血掉落", "平时 (2% + 气运×0.4%) × 衰减", "", "", "", "", "", "",
                 "只在「只剩一格血」时才放水：≤1 格 (24% + 气运×2.5%) × 衰减、≤2 格 (7% + 气运×1%) × 衰减"])
    rows.append(["心血（开箱）", "同上 × 2.2", "", "", "", "", "", "",
                 "开箱给不给心血也看当前血量，越危险越容易给"])
    rows.append(["心血目的", "让血量危机真的会咬人", "", "", "", "", "", "",
                 "濒死 600 只妖约掉 138 颗心，满血同样条件下只掉 12 颗（一层口径，见下表逐层衰减）"])
    rows.append([])
    rows.append(["产出衰减（心血 / 灵力）", "scale = LOOT_DECAY^(段号)", "", "", "", "", "", "", ""])
    # lootCurve 是「一串采样点」，不是按 depth 索引的字典 —— 用 depth 建索引再取。
    lc = {r["depth"]: r for r in D["lootCurve"]}
    dp = D["diffParams"]
    decay = dp.get("LOOT_DECAY", D.get("styleMap", {}).get("lootDecay", 0.82))
    rows.append(["衰减系数", "LOOT_DECAY = %s，每【段】降一档" % decay] + ["%.2f" % lc[d]["scale"] for d in depths]
                + ["⚠️ 单位是段不是层。15 层制下若按层算，0.82^14 ≈ 0.06 —— 掉率只剩 6%，是死局不是难度。"
                   "按段只降 2 次：0.82^2 ≈ 0.67，与原来 5~6 层的手感对齐"])
    rows.append(["心血掉率（满血）", "(2% + 气运×0.4%) × 衰减"]
                + ["%.1f%%" % (lc[d]["heartFull"] * 100) for d in depths]
                + ["气运在衰减后的基线上加成，不抵消衰减本身；同段内各层掉率相同"])
    rows.append(["心血掉率（濒死）", "(24% + 气运×2.5%) × 衰减"]
                + ["%.1f%%" % (lc[d]["heartCritical"] * 100) for d in depths] + [""])
    rows.append(["灵力珠掉率", "62% × 衰减"] + ["%.0f%%" % (lc[d]["mpRate"] * 100) for d in depths]
                + ["精英必掉，不受掉率影响"])
    rows.append(["灵力珠单颗量", "clamp(round(气血/6 × 衰减), 1, 8)"]
                + [lc[d]["mpAmt"] for d in depths]
                + ["样本取气血 40 的妖；深层怪更厚，若不乘衰减，珠子只会越掉越大"])
    rows.append(["精英必掉单颗量", "round(18 × 衰减)"] + [lc[d]["mpElite"] for d in depths] + [""])
    rows.append(["Boss 转阶段单颗量", "round(10 × 衰减) × 3 颗"] + [lc[d]["mpBoss"] for d in depths]
                + ["Boss 是唯一不随层数增多的敌人，同样走衰减，免得成为最肥的补给点"])
    rows.append(["说明", "灵石不在此列", "", "", "", "", "", "",
                 "灵石另有 planEconomy 的整层配额（见上方「本层灵石预算」），产出与层数无关"])
    return rows, [22, 34, 8, 8, 8, 8, 8, 8, 40]


# ---------------------------------------------------------------- 动态难度
def tab_diff():
    p = D["diffParams"]
    sm = D.get("styleMap", {})
    head = ["参数", "值", "说明"]
    # DIFF_MAX 已废（改成按段封顶 DIFF_MAX_BY_SEG）—— 回落链要考虑到它可能整个不存在。
    maxBySeg = p.get("DIFF_MAX_BY_SEG") or sm.get("diagMaxBySeg") or [p.get("DIFF_MAX", 3.0)]
    bossMul = sm.get("bossSegMul", [1.0])
    rows = [head,
        ["POWER_BASE", p["POWER_BASE"], "裸装实力分基准（powerScore 裸装 ≈ 1.0）"],
        ["DIFF_POW", p["DIFF_POW"], "血量校正指数：越大越硬。想更硬改这个"],
        ["DIFF_CNT_POW", p["DIFF_CNT_POW"], "数量校正指数：刻意远小于血量，免得糊屏"],
        ["DIFF_MAX_BY_SEG", " / ".join(str(v) for v in maxBySeg), "血量系数上限，**每段各自封顶**"],
        ["DIFF_MIN", p["DIFF_MIN"], "血量系数下限（弱于期望时放宽，不做惩罚性设计）"],
        ["数量系数区间", "%s ~ %s" % (p["countMin"], p["countMax"]), "count = clamp(threat^DIFF_CNT_POW， 0.85， 1.5)"],
        ["公式", p["formula"], "threat = 实力分 / POWER_BASE"],
        ["实力分公式", p["powerFormula"], "dps = damage × fireRate × (1+spread×0.8) × (1+暴击×0.8)"],
        ["劫数档位", p["tags"], "界面右下角显示"],
        ["妖物血量", "基础血 × (1 + 0.24×段内进度 + 0.35×段号) × 血量系数", "段内爬升 + 段间台阶；保证后期是「更凶」而不是「更肉」"],
        ["精英血量", "基底血 × 血量倍率 × (1 + 0.24×段内进度 + 0.35×段号) × 血量系数", ""],
        ["Boss 血量", "基础血 × (1 + (段内进度 + 段号×1) × 0.45 × 段层比) × (1 + (血量系数-1) × 0.6) × 段末倍数",
         "Boss 只吃 60% 的校正；段末倍数 = " + " / ".join(str(v) for v in bossMul)],
        ["妖物数量", "budget = (4 + min(9， floor(距离×0.9 + 段内进度×8 + 段号×1.6))) × 数量系数", ""],
        ["每房敌数", "max(3， floor(budget / 2.2) + 随机0~2)", ""],
        ["波次数", "2 波概率 = 35% + 25%×段内进度", ""],
        ["精英随从", "2 + floor(层/2) + (血量系数 > 1.2 ? 1 : 0)", ""],
        ["产出衰减 LOOT_DECAY", sm.get("lootDecay", 0.82),
         "心血 / 灵力珠的基础产出期望每深【一段】×%s（⚠️ 不是每层，详见「经济掉落」页）"
         % sm.get("lootDecay", 0.82)],
        ["产出衰减公式", p.get("lootFormula", "scale = LOOT_DECAY^(段号)"),
         "难度不只会被「敌人变强」拉平，也会被「补给变多」拉平"],
        ["段末 Boss 强度倍数", " / ".join(str(v) for v in bossMul),
         "「段末」是唯一硬门槛，故逐段加厚（血魔 → 白骨 → 裂煞）"],
    ]
    rows.append([])
    rows.append(["实力分 → 难度系数对照", "", "", "", ""])
    rows.append(["实力分", "threat", "血量系数（段一）", "数量系数", "劫数", "血量系数（段三）"])
    for c in D["curve"]:
        rows.append([c["power"], c["threat"], c["mult"], c["count"], c["tag"],
                     c.get("multSeg3", "")])
    rows.append([])
    rows.append(["说明", "实力分是「相对裸装的倍数」：裸装 = 1.0，拿满法宝常见 4~8",
                 "校正走凹曲线 threat^0.45：二层之后明显吃紧，后期又不会变成纯加血墙"])
    rows.append(["说明", "一层裸装 → 系数恰好 1.0，保持原难度；实测平均血量系数见「各层速览」页"])
    rows.append(["说明", "「段三」列是同一实力分在第三段的上限 —— 战力 12 之后段一已撞顶（3.0），"
                 "段三仍能涨到 4.6。15 层制下若不分段放宽，后 5 层难度会完全不动"])
    return rows, [26, 58, 20, 12, 10, 16]


# ---------------------------------------------------------------- 各层速览
def tab_floors():
    head = ["层", "房间总数", "普通石室", "精英窟%", "密室%", "藏珍阁%", "坊市%", "祭坛%",
            "灵石预算", "坊市总价", "备用配额", "钥匙", "雷符",
            "全层妖物", "每房敌数", "平均血量系数", "模拟实力分", "劫数"]
    rows = [head]
    for f in D["floors"]:
        rows.append([f["depth"], f["rooms"], f["normalRooms"], f["eliteRate"], f["secretRate"],
                     f["treasureRate"], f["shopRate"], f["sacrificeRate"],
                     f["budget"], f["sink"], f["reserve"], f["locks"], f["bombs"],
                     f["enemies"], f["enemiesPerRoom"], f["hpScale"], f["power"], f["tag"]])
    rows.append([])
    rows.append(["说明", "每张地图取 40 个随机种子实测平均；精英/密室为「该层出现该房间的种子占比」"])
    rows.append(["说明", "模拟实力分 = 假设玩家每层拿 3 件法宝（清房 + 藏珍阁 + Boss）后的 powerScore"])
    rows.append(["说明", "藏珍阁/坊市/祭坛出现率接近 100%，因为死胡同通常够用；缺死胡同的图才会缺席"])
    return rows, [6, 11, 11, 11, 10, 11, 10, 10, 11, 11, 11, 8, 8, 11, 11, 15, 13, 8]


# ---------------------------------------------------------------- 流派玩家
def tab_player():
    st = D["player"]["stats"]
    head = ["属性", "裸装基准", "说明"]
    rows = [head]
    desc = {
        "damage": "每发基础伤害（舞剑流按近战系数 1.10 折算）",
        "fireRate": "每秒出手次数（飞剑）/ 蓄力与后摇速度（巨剑）/ 挥砍与蓄势速度（舞剑）",
        "speed": "移动速度", "shotSpeed": "飞剑飞行速度", "range": "射程（像素；舞剑流折算剑锋触及）",
        "pierce": "可穿透的妖物数（舞剑流 = 一刀多扫几只，基础 3 只）",
        "spread": "额外分剑数（巨剑折算为剑身宽度，舞剑折算为挥砍弧度）",
        "homing": "追踪转向强度（rad/帧；舞剑流转为突进偏转）", "homingRange": "追敌索敌半径（像素）",
        "knockback": "命中击退", "luck": "气运：影响祭坛成功率与开箱",
        "burn": "灼烧层数", "frost": "冰封层数", "chain": "引雷连锁跳数",
        "iframe": "受击无敌帧数", "greed": "灵石掉落加成", "crit": "暴击率",
        "poison": "尸毒层数", "regen": "每清一室回复（半心）", "soul": "摄魂层数",
        "deflect": "击落敌方术法（舞剑流近战体质自带斩落、不靠这条属性，见下方 reflect）",
        "reflect": "照影：被斩中的术法掉头打回去（仅舞剑流，来自「玄元镜」；一二重 180° 原路回敬，"
                   "满三重才自寻最近的妖物）",
        "fly": "免疫地面秽气"
    }
    for k, v in st.items():
        rows.append([k, v, desc.get(k, "")])
    rows.append(["maxHP", D["player"]["maxHP"], "气血上限，单位半心（6 = 3 颗心）"])
    rows.append(["碰撞半径", D["player"]["r"], ""])
    rows.append([])
    rows.append(["流派", "名称 / 标签 / 状态", "", ""])
    for s in D["styles"]:
        rows.append([s["id"], "%s　%s" % (s["name"], s["tag"]), "已开放" if s["ready"] else "未开放", s["en"]])
    rows.append([])
    c = D["charge"]
    rows.append(["巨剑流蓄力阈值", "一段 %s 帧 / 二段 %s 帧 / 上限 %s 帧" % (c["t1"], c["t2"], c["max"]), "", ""])
    rows.append(["段位", "蓄力帧", "穿透", "碰撞半径", "飞行帧", "视觉缩放", "伤害倍率", "出剑后摇帧"])
    for t in c["tiers"]:
        rows.append([t["name"], "", t["pierce"], t["r"], t["life"], t["scale"], t["dmgMul"], t["cd"]])
    rows.append([])
    rows.append(["说明", "飞剑流：剑数 = 1 + spread，扇形角 0.16 rad，剑半径 6，后坐 0.35"])
    rows.append(["说明", "巨剑流：段位越高后摇越短（30 / 20 / 10 帧），点射后摇最重以杜绝连点刷特效"])
    rows.append(["说明", "蓄力速度 = max(0.35， fireRate / 2.6)；蓄力中被击中则进度清零"])
    # 舞剑流的平A 口径直接读导出值，免得改数值时文档漂移
    uwc = next((s.get("consts") or {} for s in D["styles"] if s.get("id") == "wujian"), {})
    rows.append(["说明", "舞剑流：平A 是朝准星的一记弧形挥砍（伤害 ×%.2f，一次基础最多扫到 %d 只，"
                        "按离剑锋由近及远取），剑锋触及约 %d px、挥砍时有一小段前冲；"
                        "三帧挥剑动作（起手 / 力劈 / 收势），刃光沿剑锋扫出；"
                        "挥砍顺手斩落周身约 %d px 内的敌方术法（近战体质自带，不需要法宝）；"
                        "拿到「玄元镜」后更进一步 —— 该法宝在舞剑流下化名「照影镜」，"
                        "斩中的术法不再湮灭、而是掉头打回去（reflect，伤害 = 玩家伤害 ×(0.8+0.5×镜阶)；"
                        "一、二重是 180° 原路回敬，只有满三重才自寻最近的妖物并可多穿透 2 个）；"
                        "剑锋同样劈得开密室的裂缝墙（近战没有投射物，否则只能干看着符文墙）"
                        % (uwc.get("dmgScale", 1.1), uwc.get("baseHits", 3),
                           uwc.get("reach", 46), uwc.get("reach", 46) + uwc.get("deflectR", 6))])
    uwj = next((u["base"] for u in D["ults"] if u["style"] == "wujian"), None)
    rows.append(["说明", "舞剑流专属「剑影三叠」：按住空格蓄势 → 松手朝指针突进（全程无敌）→ "
                        "命中后 1.4 秒内可接二段（连段窗口放行，不看冷却；伤害 ×1.2）→ 再命中后接三段"
                        "（落脚五连斩、必定暴击）；冷却自第一段释放起算、二/三段不重置，"
                        "所以连招全程斩获的击杀返还都累积得下来；"
                        "该流派**开局即自带**专属技（近战没有突进贴不了身），基础冷却 15 秒（其余流派 30 秒）"])
    if uwj:
        rows.append(["说明", "舞剑流「蓄势越长、突进越远」：距离 %d~%d px 线性插值、突进帧数 %d~%d 帧"
                            "同步伸缩 —— 短突进位移小、无敌时间也短（撞墙会当场收势）；"
                            "蓄势时 HUD 槽上有下限刻度，地上沿指针点出落点预览"
                            % (uwj["dashMin"], uwj["dash"], uwj["durMin"], uwj["dur"])])
        rows.append(["说明", "舞剑流风险：蓄势被打断 → 剑势溃散、立刻进冷却 —— 起手那一记与连段"
                            "接招的那一记同口径，连上之后照样要贴上去重新蓄，不存在「连上了就白拿"
                            "半秒无敌」；命中后未在窗口内接招 → 连招归零、冷却回满。"
                            "只有低于 %d 帧（≈ %.2f 秒）的点按算误触，收势、不位移、也不收冷却。"
                            "留给玩家的缓冲全在收招那一段：三段突进与落脚的五连斩全程无敌，"
                            "砍完再留 %d 帧余韵，保证五连斩一定砍得出来"
                            % (uwj["chargeMin"], uwj["chargeMin"] / 60,
                               D["skillConst"]["WJ"]["flurryGrace"])])
    rows.append(["说明", "舞剑流的蓄势速度与巨剑流同口径（fireRate / 2.6），故「灵犀玉佩」这类射速法宝两头都吃到"])
    return rows, [18, 46, 46, 12, 12, 12, 12, 14]


# ---------------------------------------------------------------- 变更日志
def tab_log():
    head = ["日期", "版本/改动", "涉及", "同步内容", "操作人"]
    rows = [head,
            ["2026-09-23", "层数定案 15 层 + 全部跨层节奏改「按段」（第二期收尾）",
             "用户拍板：主玩法改 **15 层**（理由「层数和后面融合玩法有联动，层数不够养法器的空间就小」）。"
             "数据核实：一局法宝期望 ≈ 层数 × 1.6 —— 9 层约 14 件、15 层约 24 件；"
             "融合要「先试一条路、再定型一条路」，14 件不够。**快速模式（9 层）本期不做**。"
             "⚠ 单纯把 5 层拉到 15 层会「名义改了、实际不好玩」，先探出三个硬卡点，统一用「按段」解决："
             "① Boss 原按 BOSS_KEYS[depth-1]（只有 5 位）→ 第 6~15 层**连着打 10 次烛龙**；"
             "改成只在段末（第 5/10/15 层）出现、按段取人，一局 3 个 Boss。"
             "② DIFF_MAX=3.0 在战力 12 就撞顶 → 后 5 层难度**完全不动**；"
             "改成 DIFF_MAX_BY_SEG=[3.0, 3.8, 4.6] 每段各自封顶。"
             "③ LOOT_DECAY 按层衰减 → 15 层 = 0.82^14 ≈ 0.060，掉率只剩 6%，是死局不是难度；"
             "改成**每段降一档** 0.82^2 ≈ 0.67，对齐原 5~6 层手感。"
             "另：妖物解锁（enemyPool）、精英窟率（[0.46,0.65,0.82]）、密室率、血量基数"
             "（段内爬升 + 段间台阶 1+0.24×段内进度+0.35×段号）、波次率，全部按段铺开。"
             "段末是唯一硬门槛，故 Boss 额外加厚 BOSS_SEG_MUL=[1.00,1.18,1.36]。"
             "⚠ 踩到的最隐蔽 bug：挑战模式选烛龙实际打血魔 —— startChallenge 用 "
             "BOSS_KEYS.indexOf(id)+1 推层数（索引 0 算出第 1 层，而第 1 层没有魔窟 → 白图且不报错）；"
             "改用 bossFloorOf(id)（该尊者所属段的段末）+ Floor.bossOverride 显式钉住。"
             "⚠ 段系统判定放在 dungeon.js（new Floor 生成房间时就要按段分 Boss，"
             "放 game.js 会形成「下层依赖上层」的倒挂），game.js 的 segOfFloor/isSegPickFloor 是**转发别名**。",
             "dungeon.js 新增 SEG_COUNT / SEG_FLOORS / SEG_TOTAL_FLOORS / segOf / isSegFirstFloor / "
             "isSegLastFloor / segProgress / runProgress / DIFF_MAX_BY_SEG / diffMaxOfSeg / "
             "BOSS_SEG_MUL / bossFloorOf / Floor.bossOverride，并把 lootScale / difficultyOf / "
             "planElite / planSecret / hpBase / enemyPool / RT.BOSS 全部改为按段；"
             "game.js 的 STYLE_SYS 改为转发段常量、newFloor 增 opts.boss、startChallenge 用 bossFloorOf、"
             "挑战菜单卡片标签改「段末层」；README / docs/ROADMAP.md / index.html 全量同步；"
             "15 套回归 773 条断言全绿",
             "「风格地图」页新增层段划分 / 每段 Boss / 每段血量封顶 / 段末倍数 / 产出衰减几行；"
             "「动态难度」页 DIFF_MAX → DIFF_MAX_BY_SEG 并补「段三」对照列；"
             "「经济掉落」页采样层改各段首末层、衰减口径改按段；「房间」页魔窟改「段末 1 间」；"
             "「变更日志」新增本条", "崔亮"],
            ["2026-09-23", "新增「风格地图」（27 条路径）—— 一局走过哪些天地由玩家自己选",
             "一局 15 层、每 5 层为一段、共 3 段（初版按 9 层落地，同日改 15 层，见上条）；"
             "开局三选一，之后每段开头再择一次，"
             "且允许重复选同一风格（所以「中式→中式→中式」是合法路径）→ 3³ = 27 条路径"
             "（单一风格 3 条 / 两风格 18 条 / 三风格 6 条）。"
             "本期为第二期：只做架构与中式 3 段（纯配色变体，零新美术），"
             "青玉 / 赤铜 / 玄墨分别对应夜色青玉、暮色丹火、玄墨劫雷三套色板；"
             "北欧与克苏鲁先占位（ready:false），第四/五期补内容后选择池自动扩到 2、3 个。"
             "① PAL 从全局单例改成 Proxy 指到 PAL_ACTIVE —— 全场 812 处 PAL.xxx 一个字没改，"
             "风险从「改错一处就静默配色错乱」降到「代理的 5 个 trap 写对就行」。"
             "② 硬编码色 182 处收敛到 30 处，并定下分层判据：环境色收进色板、"
             "妖物固有色（血蝠永远是红的，那是辨识特征）故意不收、中性色不收。"
             "③ 素材是启动时烘焙的，换风格必须重建；先探针实测整套烘焙约 122ms（7 帧多），"
             "故按 style_seg 缓存（单套 107 张 canvas / 0.23MB，三套仅 0.7MB）。"
             "⚠ 落地时撞出两条硬约束：(a) setStyle() 必须是唯一改 PAL_ACTIVE 的入口 —— "
             "buildSprites 的无参分支原先查缓存却没切色板，会出现「缓存的键是 cn_2、"
             "实际画的是 cn_1」这种不报错的错位（探针抓出来的真 bug）；"
             "(b) 池里只有 1 个风格时不弹面板 —— 第一期只有中式 ready，照弹「三选一」"
             "等于每次开局被一个没有任何选择的面板拦一下（出图才发现），"
             "「机制先立起来」的正确形态是机制在、但不给玩家制造空选择。",
             "新增 src/px.js 的 PAL_KEYS / STYLE_PAL / STYLE_DEF / palOf / curPal / setStyle / pal "
             "与 Proxy 化的 PAL；sprites.js 的 SPR_CACHE / buildSprites(style,seg) / switchStyle；"
             "game.js 的 STYLE_SYS / segOfFloor / isSegPickFloor / "
             "applySegmentPalette / openStyleMenu / styleMenuMove|Confirm|Back / renderStyleMenu "
             "与 nextFloor / saveGame / continueGame 的风格接点；index.html 的 #stylePick 面板与色块样式",
             "「变更日志」新增本条", "崔亮"],
            ["2026-09-23", "新增「无尽试炼」（无限模式）—— 通关之后的终局玩法",
             "把通关 build 带进场，在一间封闭擂台里无限刷怪，直到被打死；"
             "结算看杀了多少只、活了多久、撑到第几波。标题界面按 K 进入。"
             "① 四条曲线各走各的节奏（只叠血量会变成「血包墙」）：数量 3+⌊1.15√波⌋ 封顶 16、"
             "血量 1.075^波 封顶 ×300、种类每 4 波换一档、词缀每 5 波加一条（最多 3 条）。"
             "血量必须另起曲线 —— 普通楼层的 difficultyOf() 有 DIFF_MAX=3.0 封顶，"
             "拿到无尽里几十波之后完全不动。② 新增 8 条词缀（疾行/蛮触/遗毒/坚皮/成群/回春/"
             "霜附/爆散），纯逻辑零新美术，效果落在 Enemy.update 与 Enemy.die 两处出口。"
             "③ 下一波只在场面清空后才排：原先计时器一边打一边倒数，第 60 秒场上会堆到 "
             "260+ 只 —— 那不是难度是幻灯片；另加 30 帧地板防「秒清秒刷」。"
             "④ 与真实进度完全隔离：不写档、被打死也不销档（进 endlessEnd 结算屏），"
             "只有破纪录的那一局写进 xiuxian-isaac.endless.v1（与主存档分开的键）。"
             "⚠ 落地时发现原计划的一个隐患：收场时顺手写的 clearSave() 会删掉玩家的真实进度 ——"
             "挑战模式能那么写是因为它是调试场，无尽用的是玩家自己的档，已去掉。",
             "新增 src/game.js 的 ENDLESS / ENDLESS_MODS / startEndless / endlessTick / "
             "endlessCount / endlessHpScale / endlessPool / endlessModsFor / spawnEndlessWave / "
             "exitEndless / drawEndlessHUD / renderEndlessResult；entities.js 的词缀效果出口；"
             "index.html 的 #endless 结算面板与 K 键提示",
             "崔亮"],
            ["2026-09-23", "三条试玩反馈：烛龙「无限切换二阶段」/ 挑战模式不能选流派 / 小地图挡住右上角的妖物",
             "①烛龙：逐帧实测确认 phase 是单调的（1→2→3，全程只切两次），"
             "玩家看到的是鳞罩循环（每 9~13 秒结一次、罩内 210 帧完全免疫）——"
             "它原先复用 SFX.roar() + shake(5)，与转阶段（roar + shake(10)）几乎同款，"
             "于是被当成了反复转阶段。现拆成三处差异：结罩用自己的音效、震屏降到 2、"
             "飘 GUARD，转阶段飘可读的 PHASE N；血条另标 66%/33% 阶段刻度并在转阶段闪白。"
             "②挑战模式原先直接用 this.style，而构造器里它是 feijian，刷新后第一次进"
             "只能是飞剑流。菜单由两级扩为三级：择流派 → 择魔头 → 择难度。"
             "③小地图是不透明的 79×83 块，正好压在房间右上角（世界区 x>393 / y<89），"
             "妖物走到那儿会被整个盖掉。现缩到 7px 格子（面积 -57%）、平时半透明、"
             "换房后 2.5 秒提亮。",
             "src/game.js（挑战菜单三级 / 小地图 / 血条阶段刻度 / SFX.shieldUp）、"
             "entities.js（结罩演出 / PHASE 飘字）",
             "崔亮"],
            ["2026-09-23", "太虚护盾由「一次性 +2 格」改为「受创后稳住补回」",
             "原来的 addShield(2) 整局就那两格，吃完这件法宝等于白拿。"
             "改成：到手（或升阶）即补满，此后每次受创都重新开始数无伤时长，"
             "在还有敌人的房间里连续 N 帧不挨打就补回一格，直到上限。"
             "三阶依次为 上限 2/3/4 格、间隔 10/8/6 秒 —— 逐级同时提上限与缩时间，"
             "两头一起动所以每一重都摸得到。"
             "「房间里还有敌人」这个前置条件是有意的：否则清完房站一会儿就能把盾刷满，"
             "等于每间房白送几格；而且那会把玩家推向「站着干等」或「不敢收最后一刀」"
             "两个坏选择。计时另用 -1 表示未启动 —— 整场没受过伤就一格都不给，"
             "护盾的定位是「把挨打丢掉的那格补回来」，不是白送。"
             "判定边界：被护盾挡下的那一下同样算受创（计时归零），无敌帧内挨打不算。",
             "「法宝」页太虚护盾的说明与进阶文案同步更新（改由 TAIXU 常量推导，"
             "避免改了数值而文案忘了跟）；功法页的护盾说明行补一段机制；"
             "新增逐帧探针 _probe_taixu.js（十项实测）与 _t_audit.js 护盾节的 6 条断言；"
             "README 补一段",
             "AI"],
            ["2026-09-23", "背景音乐 + 设置菜单；收尾两条遗留（雷系图标撞车 / 疾影血蝠死后文案）",
             "①背景音乐：本项目零音频素材，音效与音乐都是 Web Audio 现场合成。"
             "三首曲子按场景切换 —— 标题 64bpm / 石室 100bpm / 魔窟 138bpm，"
             "共用五声音阶，所以探索与魔窟听感是「同一个世界的两种情绪」而非两首无关的曲子。"
             "记谱直接写在 BGM_TRACKS 里（bass 每小节一个根音、lead 每拍一个 token、"
             "perc 每小节 8 个八分位），调度走 look-ahead：每 60ms 把未来 0.35 秒的拍排进"
             "AudioContext 时间轴，不受 setInterval 抖动影响。暂停时压到 22%、"
             "阵亡与飞升静场、页面切走时挂起 AudioContext。"
             "②设置菜单（O 键，任何界面可开）：总音量 / 背景音乐 / 音效 三层独立可调 + "
             "全屏 + 清空存档（连按两次确认）。做成三层是有意的 —— master 是总闸、"
             "下面挂 sfxBus 与 bgmBus，「总 60% × 音效 90%」与「总 90% × 音效 60%」不是同一件事。"
             "偏好存 localStorage 且与游戏存档分开（清档不会连带重置音量）；"
             "打开面板时世界全停、但不改动原有的暂停状态。"
             "③引雷符改用新形状 chain（连锁雷：主雷 + 两道分叉）—— 原先与功法「天雷引」"
             "共用 thunder，而 thunder 只画 c1、不用 c2，两者生成的是同一个位图；"
             "精元散配色同时由 gold+goldL 改为 jade+goldL（与同为 pill 的洗髓丹也撞过）。"
             "④疾影血蝠的描述补上「殒命炸出十二枚血弹」—— 五位精英里此前只剩它没写死后余祸",
             "精英页「死后余祸」与「神通说明」两列更新（swarm 的召唤发生在死亡时、不在战斗中，"
             "故「神通说明」只留环形剑气）；新增回归断言「没有同形状 + 同配色的道具」"
             "（_t_audit.js ⑫）；新增探针 _probe_bgm.js（用 AnalyserNode 读 RMS 确认真的出声）"
             "与 _probe_settings.js、截图脚本 _shot_icons.js（全道具图标总览，加道具后自查撞车）"
             "与 _shot_settings.js；README 新增「设置与背景音乐」一节",
             "AI"],
            ["2026-09-22", "新增 Boss 挑战模式：跳过前几层，直接单挑某位尊者",
             "目的：单独调试某位头目的行动，不必先走完每层流程。标题界面按 B 进入，两级菜单 —— "
             "先择魔头（5 位，取自 BOSS_KEYS 的键序）、再择难度（险 / 危 / 绝）。"
             "难度系数 d（1~3）同时决定「玩家拿到什么」与「头目有多厚」："
             "随机法宝 3d 件 + 随机功法 d 个 + 专属技 Lv.d，头目血量再乘 1.0 / 1.6 / 2.4 倍 —— "
             "于是三档各自是「那个阶段的典型对局」，而不是单纯的血多血少。"
             "配装全部走正常获取通道（give / addSkill），所以分流派文案与"
             "「同件法宝重复获得即进阶」这些规则自动生效，不必另写一份。"
             "专属技的进境每档都给 3 次三选一，全部由玩家手选（初始等级 = 系数，"
             "故开局先随机点亮「系数 - 1」条路线）。"
             "与真实进度完全隔离：挑战中 saveGame 直接返回 false，不写档、不动既有档、阵亡不销档；"
             "斩杀头目也不发战利品、不开传送阵，胜负都在 110 帧演出后直接回选择菜单，"
             "并留下一条战果记录（胜负 / 头目 / 费时）。挑战中长按 R 是放弃并回菜单，"
             "不会掉进普通开局的流派选择",
             "新增「Boss 挑战」页签（三档配装公式与头目血量倍率）；导出脚本新增 challenge 段；"
             "新增回归测试 _t_chall.js（T1~T8 共 38 条）与逐帧探针 _probe_chall.js；README 同步",
             "AI"],
            ["2026-09-22", "三处「预警不足」：头目前摇 / 玄甲卫盾冲 / 横扫倒计时",
             "三个流派都通关之后暴露出的同一类问题：敌人在出手前不给读数。"
             "①头目冲刺原先在冷却归零那一帧直接以 8px/帧 冲出去，零预警、零反应窗口；"
             "现拆成「站定蓄势 40 帧 → 方向钉死 26 帧 → 冲撞 40 帧」，"
             "蓄势期在地面画出宽度等于本体的冲程带：钉死之前光带一路跟着玩家甩、整体压暗；"
             "钉死后转红并浮出朝外爬的推进光点，同时响一声。留出的 26 帧约 0.43 秒横移窗口。"
             "②玄甲卫原先只有接触伤害，而移速只有 0.55 —— 绕开走它就毫无威胁，"
             "「重甲卫兵」只做了一半；现新增 AI「shieldbash」：进 138px 起手，"
             "蓄力 40 帧（地面同样画冲程带）→ 冲撞 24 帧（约 109px）→ 硬直 30 帧。"
             "代价付在明处：起手到硬直结束，两片旋盾并成一片收拢到正面，"
             "正面伤害减免 75%，而绕到侧后是 4 倍收益 —— 于是「绕着打」既是正解、也需要真的动起来。"
             "③烛龙横扫原先蓄力 54 帧，扇面自始至终只有 alpha 0.10→0.26 的微弱填充，"
             "玩家读不出「还剩多久」，观感就是「突然就射出来了」；现蓄力延长到 78 帧（1.3 秒），"
             "并把倒计时做足：填充随进度变亮、脉动随进度加快（心跳感）、边界线与中轴随进度变粗、"
             "可见半径上压一段随进度推进的白色进度弧、最后两成时间整片闪白。"
             "三处共用同一套「地面危险带」语言：未锁定是暗色，锁定转红 + 金色亮边 + 推进光点",
             "「敌人」页补 shieldbash 的 AI 说明与玄甲卫的特殊列；「BOSS」页更新打法要点；"
             "新增回归断言 T11（9 条）与逐帧探针 _probe_warn.js",
             "AI"],
            ["2026-09-17", "新增暂停与存档；流派选择界面改为可滚动的等高卡片",
             "①暂停：局内 P / Esc 切换，update() 整条链路直接返回（连 tick 都不推进），"
             "敌人蓄力、弹幕飞行、技能冷却全部冻结，画面照常绘制；恢复时清空帧累加器，不会补跑。"
             "②存档：进新房间时自动写 localStorage（键 xiuxian-isaac.save.v1，约 5~6 KB）。"
             "设计上只存「种子 + 进度 + 玩家」，不存敌人实体 —— 楼层由 mulberry32(seed) 确定性重建，"
             "存档点又定在进房那一刻（敌人正是此时按 waves 排队的），两边天然对齐，"
             "不必序列化 Boss 状态机 / 玄光光束 / 裂变弹；顺带堵掉「打一半关页面重来刷掉落」。"
             "死亡或通关销档。标题界面有档时挂出「续前缘」，按 C 续、其他键开新局。"
             "③流派选择界面：原本 flex 居中且不可滚，而舞剑流说明有 300+ 字，"
             "卡片总高超过容器后上下一起被裁（标题与末尾说明都看不到）。"
             "改为三卡等高 + 描述区各自滚动 + 整页可滚，并修掉 JS 内联 display:block 覆盖卡片 flex 的问题。",
             "暂停 / 存档 / 界面均为表现层与流程改动，不涉及数值表；新增一套存档探针与暂停探针",
             "AI"],
            ["2026-09-17", "修两处舞剑流手感问题：突进被追踪法宝拽偏 / 蓄势中连段窗口仍在倒数",
             "①「混元珠」在舞剑流下化名「缠丝珠」，原本让突进每帧朝最近的妖物偏 0.14~0.34 弧度 —— "
             "满蓄 24 帧能拐出约 8 弧度，等于把落点整个交给妖物决定：玩家松手前瞄哪儿都不算数，"
             "而且十有八九贴着怪停下，无敌一结束就吃接触伤害。改为突进方向永远由指针决定，"
             "追踪只把剑锋的触及范围外扩（+12 / +17 / +21），剑自己缠上去、人照指针走。"
             "②蓄势期间连段窗口照常倒数：第三段蓄满后继续按住，1.4 秒的窗口到期就会把段位打回一段、"
             "冷却同时回满 —— 玩家什么都没做错却掉了段。改为按下空格开始蓄势即冻结窗口，"
             "举着满蓄势的第三段按多久都行；代价不变（蓄势期间不能出剑，挨一下照样溃散）。",
             "「法宝」页更新混元珠的舞剑流名与说明；两处机制各补一条回归断言",
             "AI"],
            ["2026-09-16", "新增 5 种小怪 + 3 位头目：七门改打法的机制，全部按层解锁",
             "一次补齐七种「必须换打法」的敌人。小怪五种："
             "①玄光瞳（蓄力激光，先亮范围提示、1.3 秒后射出一道贯穿光柱，"
             "方向钉死之后还能横移躲开，锁定之前挪窝没用）；"
             "②铁魄妖（发玄铁弹 —— 斩不落、反不了、镜也照不穿，只有走位一条路）；"
             "③蹦山魈（弹跳，落点先出预警圈再落地砸击，腾空期间不咬人可以贴身穿过）；"
             "④玄甲卫（两片旋盾慢速环绕，正面伤害减免 75%，但无来源位置的伤害 —— "
             "技能与 DoT —— 绕盾，所以「换技能破盾」是正解；进 138px 会起手盾冲，"
             "起手到硬直结束两片盾并成一片收拢到正面，此时绕后打是 4 倍收益）；"
             "⑤影魅（常驻隐身，逼近 110px 才现形并扑击，受创也会被打现形）。"
             "头目三位：裂煞魔尊（第三层，母弹裂成 2 枚中弹、每枚再裂成 3 枚小弹，一轮 9 枚，"
             "越躲越密，要提前找空当；三阶段母弹带追踪）；"
             "轮回法王（第四层，18~20 枚缓速环弹、环上固定留一道缺口，不冲刺，纯考站位）；"
             "烛龙（第五层，鳞罩期间免疫全部伤害并同步架起横扫激光，罩碎才能反击 —— "
             "打不动的两秒就是必须走位的两秒）。"
             "配套新增三套底层平台：Beam 光柱（先预告后结算的射线判定，含可躲的锁定窗口）、"
             "Bullet.hard（封掉剑罡斩落 / 照影反弹 / 玄元镜击落三条路，都有火星反馈免得被当成判定 bug）、"
             "三阶裂变弹（Bullet.splitN/splitTier + Game.splitBullet）。"
             "头目编排由「奇偶层轮换两位」升级为「五层各一位、由浅入深」，"
             "妖物池改为按层解锁（池内等概率，加一种等于稀释全部，所以一次只放一两种进来）",
             "「敌人」页新增 5 行并补 4 个新 AI 与「特殊」列机制说明；「BOSS」页改为五位并新增"
             "「主弹幕 / 副弹幕 / 冲刺速度 / 打法要点」列；README 妖物与魔窟段落同步；"
             "资源表导出新增 ENEMY_NOTE / BOLT_CN / BOSS_GIMMICK，bosses 改为直接读 BOSS_DEF；"
             "「变更日志」新增本条",
             "AI"],
            ["2026-09-16", "舞剑流的近战剑锋也能劈开密室裂缝墙",
             "裂缝墙此前只认「友方子弹」：飞剑 / 巨剑 / 御剑都有投射物，击三下就穿，"
             "唯独舞剑流是纯近战平A，站在符文墙前怎么砍都纹丝不动 —— 密室对它等于不存在。"
             "现在平A 的剑锋按同一套扇形判定（半径 = 剑锋触及、张角 = 挥砍弧度）多判一次墙，"
             "砍中照样扣 1 点耐久、照样记「发现密室」并同步开邻房那侧的门；"
             "背对墙砍、隔着一整间屋子砍都够不着（判定尊重朝向与距离）。"
             "扣血与开门抽成同一处（crackWallHurt），子弹与近战共用，不再各写一份",
             "「房间」页与「经济掉落」页更新裂缝墙的破坏方式；「专属技能」页补舞剑流近战口径；"
             "README 密室条目同步；「变更日志」新增本条",
             "AI"],
            ["2026-09-16", "舞剑流蓄势期一律不给无敌（起手 / 接招同口径）+ 五连斩收招余韵",
             "实机反馈：第三段的五刀「砍出来之前有可能会被打断」。逐帧探针（_probe_flurry.js）查明，"
             "五连斩本身没问题 —— 突进与五连斩全程都有无敌，五刀一刀不少；"
             "真正吞掉第三段的是它前面那半秒蓄势：连段接招时人已经贴在怪堆里，"
             "被杂兵随手摸一下就「剑势溃散 + 技能进完整冷却」，两段铺垫全白费。"
             "期间一度给接招期的蓄势加上无敌，实机权衡后撤掉：连段窗口自带半秒免伤的话，"
             "玩家就从「看准了再上」退化成「随时贴上去蓄」，和怪贴脸的博弈整个消失。"
             "现在蓄势期一律不无敌（起手那一记与接招那一记同一口径），"
             "唯一的缓冲留在五连斩收招的 %d 帧余韵 —— 五刀砍完时人正在怪堆正中，"
             "一点缓冲都不给会当场被围殴按死" % D["skillConst"]["WJ"]["flurryGrace"],
             "「专属技能」页与「流派玩家」页更新舞剑流风险口径；资源表导出新增 WJ 常量块；"
             "「变更日志」新增本条",
             "AI"],
            ["2026-09-16", "照影反弹的「自寻妖物」收归满阶专属",
             "此前一拿到「玄元镜」（照影镜一重）反弹出去的术法就会自动折向最近的妖物，相当于把"
             "「指哪打哪」白送给了最低阶 —— 既压过了三重的卖点，也让一重的强度失当。"
             "现在一、二重只做一记 180° 的原路回敬：术法从哪来就回哪去，敌人挪了位就打空；"
             "只有满三重「照影如潮」才补上自导并自寻最近的妖物（伤害与穿透不变："
             "×(0.8+0.5×镜阶)，满阶可多穿 2 个）。数值一行未动，只改了方向决策与 homing 的授予条件",
             "「法宝」页与「流派玩家」页更新照影口径；「变更日志」新增本条",
             "AI"],
            ["2026-09-15", "舞剑流「剑意不绝」改为击杀返还冷却（2/3/4 秒）+ 头目一阶段 45 秒软时限",
             "一、把「剑意不绝」从「释放时固定 −2/4/6 秒」改成击杀返还：每击杀一只妖物把专属冷却往回退 "
             "2 / 3 / 4 秒（一级 2 秒、二级 3 秒、三级 4 秒，每级落差一致）。这是全表唯一一条「条件触发」的 CDR —— "
             "蓄势被打断、人没杀掉就一分不返，这档比无条件的同名路线（飞剑流仍是释放时 −2/4/6 秒）"
             "强出的溢价，就是对价于条件本身的风险。名义冷却恒为 15 秒，不再因升级跌破 8 秒下限"
             "（下限只约束「释放时固定扣减」型路线）。钩子挂在 Enemy.die 出口，"
             "飞剑 / 平A / 突进连斩 / 照影反弹自动全覆盖；空放的伤害不返、冷却已为 0 时不返、也不会扣成负数。"
             "配套给 HUD 专属格加了返还反馈：冷却条缩掉一截的那一刻亮一道青线并标出「−N 秒」，"
             "否则秒级减免玩家无从归因到这条线上。二、头目一阶段加 45 秒软时限：凝形结束后才开始计时，"
             "到点还没打掉三分之一血就强制转入二阶段 —— 一阶段的爪牙是按 280 帧一批无限召唤的，"
             "没有这条线，玩家可以干脆不打 Boss、赖在召唤阶段刷爪牙（爪牙既掉灵力珠、"
             "又吃击杀返还冷却），形成一个「我不想输就不会输」的龟缩洞",
             "「专属技能」页改掉「冷却可被剑意不绝缩短、下限 8 秒」的旧口径；「升级路线」页更新剑意不绝数值"
             "（2/3/4 秒）并给该行标注「击杀返还型」；「BOSS」页新增一阶段软时限说明；"
             "资源表导出新增 mode 字段与 BOSS_P1_LIMIT；「变更日志」新增本条",
             "AI"],
            ["2026-09-15", "魔窟爪牙不再掉灵石 + 暴击朱红伤害数字",
             "一、头目按阶段无限召唤爪牙，而它们走的是普通妖物的掉落分支 —— 生成端无限，"
             "planEconomy 锁死的整层预算就形同虚设。现在魔窟（BOSS 房）的小怪整段跳过灵石掉落，"
             "连「贪心」那条本就不入预算的额外掉落也一并封（否则无限召唤会把贪心变成印钞机）。"
             "该房配额原封不动，留在击杀头目时一次性发放，玩家不会因此少拿。"
             "二、新增伤害数字，此前项目里根本没有：普通命中是清色小字；暴击是朱红大字"
             "（2 倍点阵 + 八向黑描边 + 命中环 + 出场白光 + 开头几帧抖动 +「!」后缀），并补一记轻微震屏。"
             "生成统一挂在 Enemy.hurt / Boss.hurt 出口，crit 可由参数或来源对象（弹丸）透传，"
             "所有伤害来源自动覆盖；尸毒 / 燃烧等持续伤害不报数（否则每几帧一次直接糊满屏）；"
             "全场数字上限 48 枚且优先保暴击，挨太近的两枚自动横向推开避免叠成一坨。"
             "缩放只在整数值上跳变 —— 非整数缩放的 fillRect 会出软边，480×320 放大到屏幕上一眼就糊",
             "「经济掉落」页新增「魔窟爪牙 = 0」一行；「变更日志」新增本条",
             "AI"],
            ["2026-09-15", "舞剑流：开局自带专属技（冷却 15 秒）+ 玄元镜改为「照影」反弹",
             "实机试玩反馈两点。一、舞剑流默认就能斩落弹幕，玄元镜再给「扩大斩落半径」是废牌 —— "
             "改为该流派下化名「照影镜」：被斩中的术法不再湮灭，而是掉头打回去，"
             "伤害 = 玩家伤害 ×(0.8+0.5×镜阶)（1 阶 ×1.3 / 2 阶 ×1.8 / 3 阶 ×2.3），"
             "自寻最近的妖物、并补一点自导与击退，二重起还多穿透 1~2 个；"
             "同一面镜子在飞剑 / 巨剑流下仍是「击落术法、范围随镜阶扩大」。"
             "为此新增 reflect 属性（写进三流派的属性契约，死属性检查覆盖），"
             "法宝的 apply 现在能读到当前流派，进阶文案支持 upByStyle 分流派。"
             "二、舞剑流开局即自带「剑影三叠」（近战没有突进就贴不了身），"
             "基础冷却 30 秒 → 15 秒（其余流派不变）；配套把「剑意不绝」由 −4/8/12 秒改为 −2/4/6 秒、"
             "冷却下限 600 → 480 帧，否则三级路线会被下限吃掉两级",
             "「法宝」页新增玄元镜三流派用途差异说明、「专属技能」页补开局自带与 15 秒冷却、"
             "「升级路线」页更新剑意不绝数值、「流派玩家」页更新 deflect 口径并新增 reflect 行；"
             "「变更日志」新增本条",
             "AI"],
            ["2026-09-15", "舞剑流手感补完：补上挥剑动作 + 平A 全面增强",
             "实机试玩反馈两点：平A 只有刃光、看不见挥剑动作；近战伤害低、够不着，面对弹幕毫无对策。"
             "一、新增三帧挥剑姿态（起手 / 力劈 / 收势，三种朝向 + 侧向镜像），"
             "并把刃光从「整条弧一起亮」改成「沿剑锋扫出」（Slash.sweep）——"
             "挥剑的像素动作与刃光终于对得上，这是原先「只有特效」的根因。"
             "二、平A 数值上调：近战系数 0.75 → 1.10（贴脸挨撞的风险溢价，单刀重于飞剑单发）、"
             "剑锋触及 34 → 46 px、一刀基础可命中 2 → 3 只、range 折算 0.05 → 0.07/点。"
             "三、新增近战体质自带的剑气斩落：挥砍顺手清掉约 52 px 内的敌方术法，"
             "不再依赖 deflect 法宝（原先无法宝时一刀都挡不下），"
             "deflect 改为每点再扩大斩落半径 —— 这是近战对弹幕的正面答案。"
             "四、专属技一段伤害倍率 1.7 → 2.0（一段 7.0 / 二段 8.4 / 三段五连斩合计 84）",
             "「流派玩家」页更新舞剑流平A 说明（近战系数 1.10、剑锋 46 px、最多 3 只、"
             "三帧挥剑动作、自带斩落术法）与 pierce / damage 两行口径；「变更日志」新增本条",
             "AI"],
            ["2026-09-14", "新增第三流派「舞剑流」（近战 · 连斩）",
             "舞剑流：平A 改为朝准星的弧形挥砍（伤害 ×0.75，一次基础最多扫到 2 只，按离剑锋由近及远取，"
             "挥砍时小幅前冲），spread 折算挥砍弧度、range 折算剑锋触及、pierce 折算「一刀多扫几只」，"
             "射速法宝同时加快挥砍与蓄势。专属技「剑影三叠」（空格）按住蓄势 24 帧、松手朝指针突进斩击，"
             "突进全程无敌；一段命中后退还冷却可立即接二段（伤害 ×1.2），二段命中后再接三段"
             "（落脚化作五连斩，严格五段、每段在二段基础上必定暴击）。蓄势期间被打断 → 剑势溃散、"
             "技能立刻进冷却；命中后未在 1.4 秒连段窗口内接招 → 连招归零、冷却回满；"
             "蓄势长短直接决定突进远近 —— 距离 74~185 px 线性插值、突进帧数 11~24 帧同步伸缩"
             "（蓄满 185 px 够横穿大半间石室、直接穿过尊者），"
             "短蓄势的位移小且无敌时间也短；突进中途撞墙会当场收势，不贴墙滑完无敌时长；"
             "只有低于 3 帧（≈ 0.05 秒）的点按算误触，"
             "收势、不位移、不收冷却（HUD 蓄势槽上加了「能放出的下限」刻度，"
             "地上沿指针点出落点预览）。6 条升级路线：剑锋凌厉 / 剑势绵长 / 凝神聚气 / "
             "心剑相随 / 剑罡护体 / 剑意不绝。新增蓄势姿态、突进残影、五连斩全向刃光与蓄势槽 HUD；"
             "9 件带 byStyle 的法宝补齐舞剑流分支（如「御剑术·三重」→「回风拂柳」，"
             "「灵犀玉佩」改为同时加快挥砍与蓄势），ITEM_TALLY 改为按流派换词；"
             "新增两门近战向小技能「擒龙手」（摄拿半径内的妖物到身前 20px、"
             "拍开身前术法，尊者摄不动）与「裂空斩」（朝指针劈出贯通剑气）；"
             "开局流派选择界面加入第三张卡片",
             "「法宝」页新增舞剑流列并补文案，「小技能」「专属技能」「升级路线」「交互物」「流派玩家」"
             "补舞剑流说明，「变更日志」新增本条", "AI"],
            ["2026-09-14", "心血 / 灵力产出逐层衰减（LOOT_DECAY）",
             "通关一轮后发现后期难度被补给拉平：build 成型清怪更快、妖物数量也上来了（数量系数最多 ×1.5）、"
             "气运又被乾坤袋 / 金丹抬高，三者叠加后「杀一只妖的补给期望」反而比一层更高。"
             "新增 LOOT_DECAY = 0.82，产出衰减 scale = 0.82^(层−1)：心血掉率、灵力珠掉率、灵力珠单颗量、"
             "精英必掉量、Boss 转阶段单颗量，全部乘这个 scale；气运在衰减后的基线上加成，不抵消衰减本身。"
             "一层 scale = 1.0（体感不变），五层 scale ≈ 0.45。灵石不在其列 —— 它另有 planEconomy 的整层配额",
             "「经济掉落」页新增产出衰减块（衰减系数 / 心血满血与濒死 / 灵力珠掉率与单颗量 / 精英 / Boss 六行）；"
             "「功法」页灵力系统块补充层数衰减说明；「动态难度」页新增 LOOT_DECAY 两行", "AI"],
            ["2026-09-14", "护盾分池 / 血量取整 / 回灵符",
             "护盾拆成两池：常驻护盾（太虚护盾 / 羽衣 / 灵力丹 / 地上拾取）不再限时，只被受击逐层扣掉；"
             "限时护盾只剩护体金光一家（5 秒后整层散去），受击时先消耗限时护盾再扣常驻护盾。"
             "气血伤害一律取整：精英余祸的小数伤害（1.1 / 1.2 / 1.3）此前会让 hp 变成 0.8 这类小数，"
             "心形血条只认整数，于是出现「血条整条空、人却还活着」的假死相。"
             "灵力自然回复由固定 1 点/秒改为随法宝成长：开局 0 点/秒，新增法宝「回灵符」每份 +1 点/秒（可叠加）",
             "「法宝」页新增「回灵符」，太虚护盾 / 羽衣描述改标「常驻」；"
             "「功法」页灵力系统块的自然回复改为「开局 0 + 回灵符」；护盾说明改为分池口径", "AI"],
            ["2026-09-11", "产出平衡：心血掉率 + 灵力改为拾取制",
             "心血掉率改为按血量分档：≤1 格 24%、≤2 格 7%、其余 2%（气运只做小幅修正），开箱同理 ×2.2，"
             "让血量危机真的会咬人；灵力自然回复由 4 点/秒砍到 1 点/秒（涓流），"
             "取消「斩妖自动回灵力」，改为击杀掉落灵力珠（普通妖 62% 概率，量按妖物体量 2~8；精英必掉 18；"
             "Boss 每次转阶段散落 3 颗 ×10），必须跑过去捡；新增靛蓝菱形「灵力珠」精灵与灵石区分",
             "「功法」页灵力系统块重写（新增灵力珠掉落 / 精英必掉 / Boss 转阶段三行）；"
             "「经济掉落」页新增心血掉率三行；美术新增 SPR.mana", "AI"],
            ["2026-09-11", "金匣产出 / 法宝堆叠 / 专属指向与弹道",
             "金匣由「2 件普通法宝」改为「1 件珍稀法宝」（新增 rare 标记与 rollRareFabaoId 珍稀池，共 9 件）；"
             "同种数值型法宝在背包里堆叠成一格并标 LvN，说明里按份数给出合计数值（新增 ITEM_TALLY）；"
             "飞剑流与巨剑流的专属技能改为一律朝鼠标指针释放（鼠标未动才退回最近瞄准方向 / 人物朝向）；"
             "万剑归宗由扇形发散改为三柄沿法线并列齐射（间距 11px）",
             "「法宝」页签新增 珍稀 / 叠2层合计 / 叠3层合计 三列；「交互物」金匣产出改为珍稀法宝 ×1；"
             "「专属技能」补充并列弹道与指针指向说明", "AI"],
            ["2026-09-11", "技能平衡与表现",
             "小技能各配独立冷却（天雷引 6→4 秒 / 缩地成寸 4→2.8 秒 / 五行遁术 9→6.6 秒 / "
             "护体金光恒 10 秒，挂在槽位上，切槽绕不过去）；护体金光改为 2 层护盾且只维持 5 秒，"
             "护盾统一改为有时限（拾取类默认 8 秒）；Boss 法器二选一改为按 E 认领并给出效果说明；"
             "天崩剑狱补上巨剑自天而降插地的特效（顺带修了预警倒计时从不递减、动画一直是静止的 bug）",
             "「功法」页签新增 冷却 Lv1~Lv5 五列；说明段补充冷却与护盾时限", "AI"],
            ["2026-09-11", "HUD 版面调整（仅界面，数值不变）",
             "灵力条与「灵石/钥匙/雷符」计数互换位置：灵力条下移到心血正下方（8,20，88×10，每 10 点一道刻度），"
             "消耗品计数上移到顶栏右侧（344,5），法器栏仍在左下角不动",
             "纯布局调整，本表数值不受影响；「功法」「专属技能」等页签数据无需改动", "AI"],
            ["2026-09-11", "重大版本：技能系统",
             "灵力系统（上限 100 / 每秒回 4 / 斩妖回 3）、小技能槽（3 格，1/2/3 切换 + Q 释放，1~5 级）、"
             "槽满替换界面、专属技能（飞剑流·万剑归宗 / 巨剑流·天崩剑狱，空格释放，30 秒冷却）、"
             "斩杀精英获得与三选一升级（每流派 6 条路线 × 3 级）",
             "新增「专属技能」「升级路线」页签；重写「功法」页签为小技能（原 cd 制改为灵力制）；"
             "「交互物」「经济掉落」「变更日志」同步更新", "AI"],
            ["2026-09-11", "难度梯度改造",
             "精英窟/密室概率化、Boss 法器二选一、动态难度、法宝进阶、追踪剑修复",
             "全表首次建立，数值取自 src/ 当前实现", "AI"],
            ["", "", "", "", ""],
            ["填写说明", "以后改完 src/ 下的数值后：",
             "1) node _export_resources.js　2) python _sync_sheet.py",
             "本表整页重写；新增资源类别时在 _sync_sheet.py 里加一个 tab 函数", ""],
    ]
    return rows, [14, 30, 46, 46, 10]


TABS = [
    ("法宝", tab_fabao), ("功法", tab_gongfa), ("专属技能", tab_ult), ("升级路线", tab_ultpath),
    ("丹药", tab_dan), ("敌人", tab_enemy),
    ("精英妖物", tab_elite), ("BOSS", tab_boss), ("Boss 挑战", tab_challenge),
    ("无尽试炼", tab_endless),
    ("风格地图", tab_stylemap),
    ("法宝融合", tab_fusion),
    ("房间", tab_room), ("交互物", tab_props),
    ("经济掉落", tab_econ), ("动态难度", tab_diff), ("各层速览", tab_floors),
    ("流派玩家", tab_player), ("变更日志", tab_log),
]


def main():
    # 0) --only 名字,名字 ：只重写指定子表。
    #    用途：整同步一次要几百次 API 调用，很容易撞上服务端配额（400007）。
    #    加了这个开关后，改一段文案这种小事只需几次调用。
    only = None
    argv = sys.argv[1:]
    if "--only" in argv:
        i = argv.index("--only")
        only = [s.strip() for s in (argv[i + 1] if i + 1 < len(argv) else "").split(",") if s.strip()]
        if not only:
            raise SystemExit("--only 后面要跟子表名，例如：--only 变更日志")

    # 1) 先拉真实子表清单，保证脚本可重复运行
    info = tdoc_payload("get_sheet_info", {})
    sheets = info.get("sheets") or []
    ids = {s["sheet_name"]: s["sheet_id"] for s in sheets}
    print("  现有子表：" + "、".join(ids.keys()))

    if only:
        unknown = [n for n in only if n not in ids]
        if unknown:
            raise SystemExit("云端没有这些子表：%s（现有：%s）" % ("、".join(unknown), "、".join(ids.keys())))
        ids = {n: ids[n] for n in only}
        print("  仅重写：" + "、".join(only))

    # 2) 按需改名
    for old, new in RENAME.items():
        if old in ids and new not in ids:
            tdoc_call("rename_sheet", {"sheet_id": ids[old], "name": new})
            ids[new] = ids.pop(old)
            print("  改名 %s → %s" % (old, new))

    # 3) 补齐缺失的子表（凡是 TABS 里要写、而云端还没有的，都自动建 —— 只认一处清单）
    for name, _fn in TABS:
        if name in ids:
            continue
        if only:
            continue
        res = tdoc_payload("add_sheet", {"name": name, "append_index": True})
        sid = res.get("sheet_id") or res.get("id")
        if not sid:
            import re
            m = re.search(r'"sheet_id"\s*:\s*"([^"]+)"', json.dumps(res, ensure_ascii=False))
            sid = m.group(1) if m else None
        if not sid:
            raise RuntimeError("新建子表 %s 未返回 sheet_id：%s" % (name, json.dumps(res, ensure_ascii=False)[:300]))
        ids[name] = sid
        print("  新建子表 %s（%s）" % (name, sid))

    # 3) 写入
    for name, fn in TABS:
        if name not in ids:
            # --only 模式下，没被点名的子表本来就不在 ids 里 —— 跳过而不是报错
            if only:
                continue
            raise RuntimeError("缺少子表 " + name)
        rows, widths = fn()
        n, w = write_tab(ids[name], rows)
        style_tab(ids[name], n, w, widths, rows)
        print("  %-8s %2d 行 × %2d 列" % (name, n, w))

    print("\n完成：" + SHEET_URL)
    if only:
        print("本次只重写：" + "、".join(only) + "（其余子表未动）")
    else:
        print("下次改动源码后：node _export_resources.js && python _sync_sheet.py")
        print("只想刷个别子表：python _sync_sheet.py --only 变更日志,风格地图")


if __name__ == "__main__":
    main()

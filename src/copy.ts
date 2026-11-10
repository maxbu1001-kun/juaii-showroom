// Visitor-facing copy. Strings are verbatim from V1.1 / control V1.0.
// Internal landed costs, ceilings, and evidence grades are intentionally absent.

export type Lang = 'zh' | 'en' | 'both'
export type Sku = 'J03-01' | 'J02-01'
export type Zone = 'overview' | 'j03' | 'j02' | 'wall' | 'guide' | 'screen' | 'closeup'
export type ClipId = 'welcome' | Sku | 'close'
export type FieldKey =
  | 'sku_id'
  | 'name'
  | 'material'
  | 'finish'
  | 'size_weight'
  | 'structure'
  | 'use_do'
  | 'use_dont'
  | 'planned_retail'
export type PartId =
  | 'j03-rim'
  | 'j03-size'
  | 'j03-brushed'
  | 'j03-use'
  | 'j02-poles'
  | 'j02-hinge'
  | 'j02-clamp'
  | 'j02-size'

export type Pair = { readonly zh: string; readonly en: string }
export type Field = { readonly label: Pair; readonly value: Pair }

export const BRAND_NAME = "具和安"
export const BRAND_LINE = "JUΛII—everyday objects, honestly chosen."
export const WELCOME = "Welcome. This is a small showroom for JUΛII—everyday objects, honestly chosen. You can look around the room, and tap either object to hear what it is, what it is made of, and what it is for. No hard sell. Just the facts you can check."
export const CLOSE = "That is the room for now—two objects, clear facts. Look closer if you like. Tap again anytime. We will not rush you."
export const DISCLAIMER: Pair = {
  zh: "简化示意模型。非扫描件，亦不宣称与实物完全一致。",
  en: "Simplified study model. Not a scan, and not a claim that it matches the physical object exactly.",
}

export const SUBTITLES: Record<ClipId, string> = {
  welcome: "Welcome. This is a small showroom for JUΛII—everyday objects, honestly chosen. You can look around the room, and tap either object to hear what it is, what it is made of, and what it is for. No hard sell. Just the facts you can check.",
  'J03-01': "This is J03-01, a small stainless desk tray. What you see is brushed stainless with a straight rim—simple outline, nothing decorative piled on. Its job is everyday catch-all: keys, small tools, the bits that usually scatter on a desk. The proportions are honest—a compact round tray. Exact thickness, weight feel, and edge finish still wait on samples, so we do not oversell the body yet. Use it for dry desk storage. We do not call it food-grade, and we do not claim oven or dishwasher use unless samples and supplier statements confirm that later. Planned retail sits around one hundred nine yuan; that price band still needs experiment. It is not pitched as luxury markup.",
  'J02-01': "This is J02-01, an all-metal adjustable reading stand. Look at the structure first: poles, hinge, and clamp—readable parts, not a sculpture. You can set the angle for a book or a tablet. That adjustability is the feature. The clamp is designed to hold a page edge or a device edge. We say “designed to hold,” not “never slips,” until samples prove clamp stability. Use it for reading or viewing at a desk—or a bed tray context. It is not a camera tripod, not a heavy monitor arm, and not décor sculpture. Planned retail sits around ninety-nine yuan; that price band still needs experiment. The value story is structure and adjustability you can check—not a designer lifestyle pitch.",
  close: "That is the room for now—two objects, clear facts. Look closer if you like. Tap again anytime. We will not rush you.",
}

export const FIELD_ORDER: readonly FieldKey[] = [
  'sku_id',
  'name',
  'material',
  'finish',
  'size_weight',
  'structure',
  'use_do',
  'use_dont',
  'planned_retail',
]

export const CATALOG: Record<Sku, Record<FieldKey, Field>> = {
  'J03-01': {
    sku_id: {
      label: { zh: "SKU", en: "SKU" },
      value: { zh: "J03-01", en: "J03-01" },
    },
    name: {
      label: { zh: "品名", en: "Name" },
      value: { zh: "小型不锈钢置物盘", en: "Stainless desk tray" },
    },
    material: {
      label: { zh: "材质", en: "Material" },
      value: { zh: "不锈钢（合金牌号待验，不宣称 304）", en: "Stainless steel (alloy grade pending sample; not claimed as 304)" },
    },
    finish: {
      label: { zh: "表面处理", en: "Finish" },
      value: { zh: "砂光；直边本色金属感", en: "Brushed; straight-rim metal look" },
    },
    size_weight: {
      label: { zh: "尺寸 / 重量线索", en: "Size / weight cues" },
      value: { zh: "候选约 Ø12.5 cm；高约 2.6 cm；约 153 g（供方挂牌线索，待样核验）", en: "Candidate approx. Ø12.5 cm; height ~2.6 cm; ~153 g (listing cue; sample-pending)" },
    },
    structure: {
      label: { zh: "结构", en: "Structure" },
      value: { zh: "小型直边圆盘；盘沿可读；无装饰堆叠", en: "Small straight-rim round tray; readable rim; no decorative add-ons" },
    },
    use_do: {
      label: { zh: "使用边界 · 做什么", en: "Use · what it is for" },
      value: { zh: "干置物、桌面收纳：钥匙、小工具、零碎小件", en: "Dry desk catch-all: keys, small tools, scattered bits" },
    },
    use_dont: {
      label: { zh: "使用边界 · 不做什么", en: "Use · what it is not" },
      value: { zh: "不宣称食品级；不宣称烤箱/洗碗机；不作电镀薄盘/派对盘叙事", en: "Not claimed food-grade; no oven/dishwasher claims; not a thin plated party-tray story" },
    },
    planned_retail: {
      label: { zh: "规划零售（CNY）", en: "Planned retail (CNY)" },
      value: { zh: "规划零售 · 价格带需实验：¥109", en: "Planned retail · price band needs experiment: ¥109" },
    },
  },
  'J02-01': {
    sku_id: {
      label: { zh: "SKU", en: "SKU" },
      value: { zh: "J02-01", en: "J02-01" },
    },
    name: {
      label: { zh: "品名", en: "Name" },
      value: { zh: "金属阅读支架", en: "Metal reading stand" },
    },
    material: {
      label: { zh: "材质", en: "Material" },
      value: { zh: "全金属结构（具体钢种/是否含塑料夹件待样核验）", en: "All-metal construction (exact steel grade / any plastic clamp parts sample-pending)" },
    },
    finish: {
      label: { zh: "表面处理", en: "Finish" },
      value: { zh: "金属本色/常见工业涂装向（精确涂层待样）", en: "Bare metal or common industrial coating (exact coating sample-pending)" },
    },
    size_weight: {
      label: { zh: "尺寸 / 重量线索", en: "Size / weight cues" },
      value: { zh: "精确外形尺寸与净重待样品核验；结构为桌面阅读架体量", en: "Exact outer dimensions and net weight sample-pending; desk reading-stand scale" },
    },
    structure: {
      label: { zh: "结构", en: "Structure" },
      value: { zh: "双杆升降向可调架：立杆、铰链/转角、夹持可读（首样含夹持对照样）", en: "Dual-pole height-adjustable stand: poles, hinge/pivot, and clamp readable (hero sample includes clamp control sample)" },
    },
    use_do: {
      label: { zh: "使用边界 · 做什么", en: "Use · what it is for" },
      value: { zh: "书本或平板阅读/观看；角度可调；夹持设计用于页边或设备边缘", en: "Reading or viewing a book or tablet; settable angle; clamp designed to hold a page or device edge" },
    },
    use_dont: {
      label: { zh: "使用边界 · 不做什么", en: "Use · what it is not" },
      value: { zh: "非相机脚架；非重型显示器支架；非装饰雕塑；不说「永不滑落」（样品前仅 designed to hold）", en: "Not a camera tripod; not a heavy monitor arm; not décor sculpture; do not say “never slips” (say “designed to hold” until samples)" },
    },
    planned_retail: {
      label: { zh: "规划零售（CNY）", en: "Planned retail (CNY)" },
      value: { zh: "规划零售 · 价格带需实验：¥99", en: "Planned retail · price band needs experiment: ¥99" },
    },
  },
}

export const CONTROLS = {
  open_closeup: { zh: "打开特写", en: "Open close-up" },
  exit_closeup: { zh: "退出特写", en: "Exit close-up" },
  orbit_rim: { zh: "绕盘沿观察", en: "View around the rim" },
  dim_show: { zh: "显示尺寸标注", en: "Show size marks" },
  dim_hide: { zh: "隐藏尺寸标注", en: "Hide size marks" },
  read_use_limits: { zh: "阅读使用边界", en: "Read use limits" },
  angle_indicative: { zh: "示意调节角度", en: "Indicative angle change" },
  clamp_notes: { zh: "查看夹持说明", en: "View clamp notes" },
  jump_overview: { zh: "总览", en: "Overview" },
  jump_j03_pedestal: { zh: "J03-01 展台", en: "J03-01 pedestal" },
  jump_j02_pedestal: { zh: "J02-01 展台", en: "J02-01 pedestal" },
  jump_wall: { zh: "展墙", en: "Wall" },
  jump_guide: { zh: "导购", en: "Guide" },
  jump_screen: { zh: "屏幕", en: "Screen" },
  jump_closeup_current: { zh: "该器特写", en: "Close-up of this object" },
  part_label_j03_rim: { zh: "盘沿", en: "Rim" },
  part_label_j03_size: { zh: "尺寸", en: "Size" },
  part_label_j03_brushed: { zh: "砂光", en: "Brushed" },
  part_label_j03_use: { zh: "使用边界", en: "Use limits" },
  part_label_j02_poles: { zh: "立杆", en: "Poles" },
  part_label_j02_hinge: { zh: "铰链 / 转角", en: "Hinge / pivot" },
  part_label_j02_clamp: { zh: "夹持", en: "Clamp" },
  part_label_j02_size: { zh: "尺寸", en: "Size" },
} as const

export const POSE_LABELS: readonly Pair[] = [
  { zh: "示意姿态 1", en: "Indicative pose 1" },
  { zh: "示意姿态 2", en: "Indicative pose 2" },
  { zh: "示意姿态 3", en: "Indicative pose 3" },
]

export const LANG_OPTIONS = [
  { id: 'zh', label: "仅中文" },
  { id: 'en', label: "仅英文" },
  { id: 'both', label: "中英并列" },
] as const

export const PARTS: Record<
  PartId,
  { readonly sku: Sku; readonly label: Pair; readonly fields: readonly FieldKey[] }
> = {
  'j03-rim': {
    sku: 'J03-01',
    label: { zh: "盘沿", en: "Rim" },
    fields: ['structure'],
  },
  'j03-size': {
    sku: 'J03-01',
    label: { zh: "尺寸", en: "Size" },
    fields: ['size_weight'],
  },
  'j03-brushed': {
    sku: 'J03-01',
    label: { zh: "砂光", en: "Brushed" },
    fields: ['finish', 'material'],
  },
  'j03-use': {
    sku: 'J03-01',
    label: { zh: "使用边界", en: "Use limits" },
    fields: ['use_do', 'use_dont'],
  },
  'j02-poles': {
    sku: 'J02-01',
    label: { zh: "立杆", en: "Poles" },
    fields: ['structure'],
  },
  'j02-hinge': {
    sku: 'J02-01',
    label: { zh: "铰链 / 转角", en: "Hinge / pivot" },
    fields: ['structure', 'use_do'],
  },
  'j02-clamp': {
    sku: 'J02-01',
    label: { zh: "夹持", en: "Clamp" },
    fields: ['use_do', 'use_dont'],
  },
  'j02-size': {
    sku: 'J02-01',
    label: { zh: "尺寸", en: "Size" },
    fields: ['size_weight', 'finish', 'material'],
  },
}

export const ZONE_BUTTONS: readonly {
  readonly id: Exclude<Zone, 'closeup'> | 'closeup'
  readonly label: Pair
  readonly narrow?: string
}[] = [
  { id: 'overview', label: { zh: "总览", en: "Overview" } },
  { id: 'j03', label: { zh: "J03-01 展台", en: "J03-01 pedestal" }, narrow: "J03-01" },
  { id: 'j02', label: { zh: "J02-01 展台", en: "J02-01 pedestal" }, narrow: "J02-01" },
  { id: 'wall', label: { zh: "展墙", en: "Wall" } },
  { id: 'guide', label: { zh: "导购", en: "Guide" } },
  { id: 'screen', label: { zh: "屏幕", en: "Screen" } },
  { id: 'closeup', label: { zh: "该器特写", en: "Close-up of this object" } },
]


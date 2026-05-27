# ComfyUI 2D 资源生成工作流

## 环境

| 项目 | 值 |
|------|-----|
| ComfyUI 路径 | `H:\AI\ComfyUI_windows_portable\ComfyUI\` |
| API 端点 | `http://localhost:8188/prompt` |
| 队列监控 | `http://localhost:8188/queue` |
| 输出目录 | `H:\AI\ComfyUI_windows_portable\ComfyUI\output\` |

## 核心流程：使用 z_image_turbo 子蓝图（Subgraph）

> **⚠️ 关键约定**：本项目的所有 2D 美术资源都通过 **z_image_turbo 子蓝图** 生成。  
> **不要从零搭建节点**，而是直接加载预先打包好的子蓝图（subgraph）模板。

### 什么是子蓝图？

子蓝图是 ComfyUI 中一种**预封装的节点组**，它将以下内部节点打包成一个可复用的模块：

```
z_image_turbo 子蓝图内部包含：
├── UNETLoader         → z_image_turbo_bf16.safetensors
├── CLIPLoader         → qwen_3_4b.safetensors (type: lumina2)
├── VAELoader          → ae.safetensors
├── ModelSamplingAuraFlow  → shift: 3
├── CLIPTextEncode     → 正提示词输入
├── ConditioningZeroOut   → 负条件置零
├── EmptySD3LatentImage   → 1024×1024
├── KSampler           → steps=4, cfg=1.0, sampler=euler, scheduler=simple
└── VAEDecode + SaveImage
```

子蓝图对外只暴露 **3 个输入接口**：
- `正提示词（字符串）`
- `负提示词（字符串）` — CFG=1.0 时实际无效，但节点必须连接
- `种子（整数）`

### 在 ComfyUI 中使用

1. **右键画布** → `Add Group` → `Load as Subgraph` → 选择 `z_image_turbo_subgraph.json`
2. 或在节点面板中搜索 "z_image_turbo" 加载已保存的子蓝图
3. 子蓝图显示为一个带输入口的大方框，双击可展开查看内部节点

### 通过 API 调用

通过 API 发送时，**仍然发送展开后的完整 JSON**（子蓝图本质上是一组预配置节点的模板），详见下方 Workflow JSON 模板。

### 为什么用子蓝图？

| 方式 | 问题 |
|------|------|
| 手动搭节点 | 容易漏配参数（CLIP type 设为 qwen_image 而非 lumina2、ModelSampling 缺失等） |
| **子蓝图** | 参数固定固化，只需填 prompt + seed，零失误 |

### 关键参数（固化在子蓝图中）

| 参数 | 值 | 说明 |
|------|-----|------|
| CLIPLoader type | `lumina2` | ❗必须为 lumina2，不是 qwen_image |
| steps | `4` | turbo 模型，极少步数即可 |
| CFG | `1.0` | AuraFlow 要求低 cfg |
| sampler | `euler` | |
| scheduler | `simple` | |
| shift | `3.0` | ModelSamplingAuraFlow |
| 尺寸 | `1024×1024` | EmptySD3LatentImage |

### Prompt 模板

```
正提示词: [资源具体描述]，俯视角，白色背景，游戏图标，写实风格，PBR渲染，游戏资产
负提示词: blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature
```

**注意**：
- z_image_turbo 基于 Qwen 视觉语言模型，prompt 支持中英文混合
- CFG=1.0 时负提示词在数学上不生效，但 ConditioningZeroOut 节点必须连接
- 当前风格为**写实（realistic / PBR）**，详见 `docs/美术风格指南.md`

## 武器图标方向规范

> **⚠️ 关键约定**：所有武器图标的**正方向（forward）必须朝上（upward）**，即武器的攻击方向在图片中指向画布上方。

### 为什么向上？

1. **轨道起始位置**：武器围绕玩家轨道排列，第一个槽位从上方（-π/2）开始，武器朝上符合直觉
2. **攻击旋转**：代码中使用 `ctx.rotate(drawAngle)` 旋转武器图标，`drawAngle` 基于 `Math.atan2(dy, dx)` 计算（0=右, -π/2=上），加上 `+ Math.PI/2` 偏移补偿向上图片的旋转
3. **一致性**：所有武器（近战/枪械/弓/魔法/医疗/喷射）统一向上方向，确保攻击动画中图标指向目标时的视觉一致性

### 生成时的提示词要求

武器图标生成时，必须在正提示词中明确指定武器指向向上：

```
正提示词: [武器名]，指向上方，正面朝上，俯视角，白色背景，游戏图标，写实风格，PBR渲染，游戏资产
```

关键短语：
- `指向上方 / pointing upward` — 明确武器方向
- `正面朝上 / facing up` — 强调正面朝向画布上方
- `俯视角 / top-down view` — 保持俯视一致

### 图层面与方向

```
       ↑ 武器尖端/发射口朝上
       |
    ───┼───  武器正方向（向上）
       |
    握把/底座
```

- 武器的**尖端/发射口/刃口**指向画布上方
- **握把/底座**在下方
- 生成后检查：武器长轴应与画布Y轴平行

### ⚠️ 生成后注意

生成向上的武器图片后，需同步更新 `src/renderer.js` 中的渲染角度：

```js
// 当前（武器朝右的图片）：
let drawAngle = orbitalAngle;   // 待机
let drawAngle = targetAngle;     // 攻击

// 改为（武器朝上的图片，+π/2 偏移）：
let drawAngle = orbitalAngle + Math.PI / 2;
let drawAngle = targetAngle + Math.PI / 2;
```

这是因为 `Math.atan2` 返回的角度以0=右为基准，而图片正方向为朝上，需要偏移 +90°。

**在重新生成并应用偏移之前**，当前代码仍对现有的"朝右"武器图片正常工作。

## Workflow JSON 模板（API 调用用）

发送 API 时展开子蓝图为完整节点列表：

```json
{
  "1": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "qwen_3_4b.safetensors",
      "type": "lumina2",
      "device": "default"
    }
  },
  "2": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "ae.safetensors"
    }
  },
  "3": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "z_image_turbo_bf16.safetensors",
      "weight_dtype": "default"
    }
  },
  "model_sampling": {
    "class_type": "ModelSamplingAuraFlow",
    "inputs": {
      "model": ["3", 0],
      "shift": "3"
    }
  },
  "pos_encode": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "{POSITIVE_PROMPT}",
      "clip": ["1", 0]
    }
  },
  "neg_encode": {
    "class_type": "ConditioningZeroOut",
    "inputs": {
      "conditioning": ["pos_encode", 0]
    }
  },
  "empty_latent": {
    "class_type": "EmptySD3LatentImage",
    "inputs": {
      "width": 1024,
      "height": 1024,
      "batch_size": 1
    }
  },
  "ksampler": {
    "class_type": "KSampler",
    "inputs": {
      "seed": {SEED},
      "steps": 4,
      "cfg": 1.0,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 1.0,
      "model": ["model_sampling", 0],
      "positive": ["pos_encode", 0],
      "negative": ["neg_encode", 0],
      "latent_image": ["empty_latent", 0]
    }
  },
  "vae_decode": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": ["ksampler", 0],
      "vae": ["2", 0]
    }
  },
  "save_image": {
    "class_type": "SaveImage",
    "inputs": {
      "filename_prefix": "{PREFIX}",
      "images": ["vae_decode", 0]
    }
  }
}
```

## 已生成资源

### 角色头像（CharacterPortraits）

10 种战车，存放于 `Assets/Arts/UI/CharacterPortraits/`。

| 文件名 | 种子 | 提示词关键词 |
|--------|------|-------------|
| HeavyTank.png | 1001 | heavy main battle tank, military green, massive armor, realistic, PBR |
| LightTank.png | 2002 | light reconnaissance tank, desert tan, fast, agile, realistic, PBR |
| Artillery.png | 3003 | self-propelled howitzer, olive drab, long barrel, realistic, PBR |
| APC.png | 4004 | armored personnel carrier, boxy hull, troop transport, realistic, PBR |
| AssaultGun.png | 5005 | assault gun, dark green, sloped armor, realistic, PBR |
| IFV.png | 6006 | infantry fighting vehicle, woodland camo, realistic, PBR |
| SPAAG.png | 7007 | anti-aircraft gun, radar dish, dual cannons, realistic, PBR |
| MissileCarrier.png | 8008 | missile carrier, dark gray, multiple launchers, realistic, PBR |
| ScoutJeep.png | 9009 | scout jeep, light blue-gray, open top, realistic, PBR |
| Engineer.png | 1010 | engineer vehicle, bright yellow, crane arm, realistic, PBR |

### 武器图标（WeaponIcons）

18 种武器，存放于 `Assets/Arts/UI/WeaponIcons/`。

#### 主炮类（Main Cannon）

| 文件名 | 种子 | 提示词关键词 |
|--------|------|-------------|
| LightCannon.png | 11001 | small light cannon, tank barrel, fast firing, realistic, PBR |
| StandardCannon.png | 12002 | standard tank cannon, balanced artillery, realistic, PBR |
| HeavyCannon.png | 13003 | heavy tank cannon, large caliber, thick armor, realistic, PBR |
| QuickFireCannon.png | 14004 | rapid fire cannon, multiple small barrels, realistic, PBR |
| BunkerBuster.png | 15005 | massive siege gun, demolition, realistic, PBR |

#### 机枪类（Machine Gun）

| 文件名 | 种子 | 提示词关键词 |
|--------|------|-------------|
| LightMG.png | 21001 | light machine gun, bipod, infantry |
| HeavyMG.png | 22002 | heavy machine gun, large caliber, tripod |
| Gatling.png | 23003 | gatling gun, rotary barrel, minigun |
| EMG.png | 24004 | electromagnetic gun, sci-fi energy weapon |

#### 导弹类（Missile）

| 文件名 | 种子 | 提示词关键词 |
|--------|------|-------------|
| ATGM.png | 31001 | anti-tank guided missile, rocket launcher |
| Rocket.png | 32002 | rocket launcher, multiple pods, bombardment |
| GuidedMissile.png | 33003 | guided missile, smart weapon, seeker head |

#### 喷射类（Sprayer）

| 文件名 | 种子 | 提示词关键词 |
|--------|------|-------------|
| FlameSprayer.png | 41001 | flamethrower, fire nozzle, fuel tank |
| CryoSprayer.png | 42002 | cryo sprayer, freeze gun, frost |
| WaterCannon.png | 43003 | water cannon, high pressure, fire hose |
| AcidSprayer.png | 44004 | acid sprayer, corrosive chemical nozzle |

#### 近战类（Melee）

| 文件名 | 种子 | 提示词关键词 |
|--------|------|-------------|
| Drill.png | 51001 | power drill, rotating bit, piercing |
| Chainsaw.png | 52002 | chainsaw, saw blade, cutting teeth |

## 种子分配规则

```
主炮类: 11001-15005
机枪类: 21001-24004
导弹类: 31001-33003
喷射类: 41001-44004
近战类: 51001-52002
角色头像: 1001-9009
道具图标: 61001+  (预留)
背景/特效: 71001+ (预留)
```

每个种子只使用一次，保证可复现。如需重新生成，保持相同种子。

## 命名规范

- **文件名**: PascalCase（与 C# 代码保持一致）
- **扩展名**: `.png`
- **路径**: `Assets/Arts/UI/{资源类别}/{文件名}.png`
- **资源类别**: CharacterPortraits / WeaponIcons / ItemIcons / Backgrounds / Effects
- **Icon 引用**: UXML 中使用 `background-image` 或 `<Image>` 元素

## API 调用步骤（Powershell）

### 单张生成

```powershell
# 1. 展开子蓝图为完整 JSON workflow（见上方模板）
# 2. 填入 prompt + seed + prefix
# 3. 发送到 ComfyUI
$body = @{ prompt = $workflow } | ConvertTo-Json -Depth 5
$result = Invoke-WebRequest -Uri "http://localhost:8188/prompt" `
    -Method POST -Body $body -ContentType "application/json" `
    -TimeoutSec 30 -UseBasicParsing

# 4. 监控队列等待完成
do {
    Start-Sleep -Seconds 3
    $queue = Invoke-RestMethod -Uri "http://localhost:8188/queue" -TimeoutSec 5
} while ($queue.queue_running.Count -gt 0 -or $queue.queue_pending.Count -gt 0)

# 5. 复制输出到项目目录
Copy-Item "ComfyUI\output\{prefix}_00001_.png" `
    "Assets\Arts\UI\{Category}\{Name}.png" -Force
```

### 批量生成（如 18 武器）

```powershell
$weapons = @(
    @{ name="LightCannon"; seed=11001; prompt="..." }
    # ... 定义全部资源
)

foreach ($w in $weapons) {
    # 展开子蓝图并填入参数
    $workflow_json = $workflow_template
        -replace "{POSITIVE_PROMPT}", $w.prompt
        -replace "{SEED}", $w.seed
        -replace "{PREFIX}", $w.name
    $body = @{ prompt = ($workflow_json | ConvertFrom-Json) } | ConvertTo-Json -Depth 5
    $res = Invoke-WebRequest -Uri "http://localhost:8188/prompt" -Method POST `
        -Body $body -ContentType "application/json" -TimeoutSec 30 -UseBasicParsing
    Start-Sleep -Milliseconds 200
}
# 监控队列完成后批量复制
```

## 文件位置

| 文件 | 路径 |
|------|------|
| 资源总览 | `Assets/Arts/UI/README.md` |
| 生成参数记录 | `Assets/Arts/UI/{类别}/meta.json` |
| Prompt 参考 | `Assets/Arts/UI/{类别}/prompt.txt` |
| 本工作流文档 | `docs/ComfyUI_2D生成工作流.md` |

## 待生成资源（future）

- `ItemIcons/` — 道具图标（弹药箱、能量包、血包、护盾、加速、强化等）
- `Backgrounds/` — 菜单背景图
- `Effects/` — UI 特效（选中高亮、切换过渡等）

扩展新资源类别的步骤：
1. 在 `Assets/Arts/UI/` 下新建子目录
2. 创建 `meta.json` 和 `prompt.txt`
3. 按上述 seed 规则分配种子
4. 使用 API/Powershell 批量生成
5. 将输出 PNG 复制到子目录
6. 更新 `Assets/Arts/UI/README.md` 资源总览

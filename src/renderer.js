// ============================================================
// renderer.js - Canvas2D渲染系统
// ============================================================
const Renderer = {
    canvas: null,
    ctx: null,
    cameraX: 0,
    cameraY: 0,

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this._resize();
        window.addEventListener('resize', () => this._resize());
    },

    _resize() {
        const dpr = window.devicePixelRatio;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        // 使用 setTransform 重置变换矩阵，避免累积缩放
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
    },

    beginFrame(player) {
        const ctx = this.ctx;
        this.cameraX = player ? player.x - this.width / 2 : 0;
        this.cameraY = player ? player.y - this.height / 2 : 0;

        // 清屏
        ctx.fillStyle = '#0d0d24';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.save();
        ctx.translate(-this.cameraX, -this.cameraY);
    },

    endFrame() {
        // 绘制浮动文本（在世界坐标中）
        this._drawFloatingTexts();
        this.ctx.restore();
    },

    // 背景网格
    drawBackground() {
        const ctx = this.ctx;
        const gridSize = 80;

        // 计算可视区域
        const startX = Math.floor(this.cameraX / gridSize) * gridSize;
        const startY = Math.floor(this.cameraY / gridSize) * gridSize;
        const endX = this.cameraX + this.width + gridSize;
        const endY = this.cameraY + this.height + gridSize;

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = startX; x <= endX; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }

        // 随机赛博装饰点
        ctx.fillStyle = 'rgba(0, 255, 255, 0.06)';
        const seed = Math.floor(startX / gridSize) + Math.floor(startY / gridSize);
        for (let i = 0; i < 5; i++) {
            const dx = ((seed * 9301 + i * 49297) % gridSize);
            const dy = ((seed * 5915587277 + i * 549755813) % gridSize);
            ctx.beginPath();
            ctx.arc(startX + dx, startY + dy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    // 绘制世界边界
    drawWorldBounds() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(255, 0, 68, 0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 15]);
        ctx.strokeRect(0, 0, GameWorld.width, GameWorld.height);
        ctx.setLineDash([]);
    },

    // 绘制玩家（使用角色PNG + 装备武器）
    drawPlayer(player) {
        if (!player || !player.alive) return;
        const ctx = this.ctx;
        const x = player.x, y = player.y, r = player.radius;

        // 闪烁（无敌时）
        if (player.invincibleTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0) return;

        // 光环
        const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
        glow.addColorStop(0, 'rgba(0, 255, 255, 0.15)');
        glow.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // 绘制装备武器（在角色背后）
        this._drawPlayerWeapons(player);

        const charId = CharacterSystem.selectedCharacterId || 'swordsman';

        // 检测是否正在攻击
        const isAttacking = player.spriteAttackEndTime && Date.now() < player.spriteAttackEndTime;

        // 面朝左时水平翻转角色PNG（默认图朝右）
        const flipX = player.facingAngle != null && this._getWalkDirection(player.facingAngle) === 'left';

        if (isAttacking) {
            // 攻击状态：静态角色PNG（无起伏）
            this._drawCharSprite(ctx, x, y, r, charId, false, flipX);
        } else if (player.isMoving) {
            // 移动状态：静态角色PNG
            this._drawCharSprite(ctx, x, y, r, charId, false, flipX);
        } else {
            // 待机状态：静态角色PNG + 起伏 + 呼吸
            const bobFreq = 600;
            const bobAmp = 1.8;
            const bobY = y + Math.sin(Date.now() / bobFreq) * bobAmp;
            this._drawCharSprite(ctx, x, bobY, r, charId, true, flipX); // 呼吸动画
        }

        // 外发光边框
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();

        // 武器攻击动画特效
        this._drawWeaponAttackEffects(player);
    },

    /**
     * 将 facingAngle 映射为 4 方向字符串
     */
    _getWalkDirection(angle) {
        // angle 范围: Math.atan2(dy,dx), 0=右, π/2=下, π=左, -π/2=上
        let a = angle;
        if (a < 0) a += Math.PI * 2; // 归一化到 0~2π
        if (a < Math.PI / 4 || a >= Math.PI * 7 / 4) return 'right';
        if (a < Math.PI * 3 / 4) return 'down';
        if (a < Math.PI * 5 / 4) return 'left';
        if (a < Math.PI * 7 / 4) return 'up';
        return 'down'; // 默认
    },

    /**
     * 绘制角色静态图 + 呼吸动画
     * @param {boolean} isBreathing - 是否启用呼吸缩放动画
     * @param {boolean} flipX - 是否水平翻转（玩家向左时）
     */
    _drawCharSprite(ctx, x, y, r, charId, isBreathing, flipX) {
        const charImg = AssetSystem.characterIcons[charId];
        if (charImg && (charImg instanceof HTMLCanvasElement || (charImg.complete && charImg.naturalWidth > 0))) {
            // 呼吸动画：轻微缩放 (1.0 ↔ 1.06) + 微幅上移
            let scale = 1.0;
            let breathOffsetY = 0;
            if (isBreathing) {
                const phase = Date.now() / 800;
                scale = 1.0 + Math.sin(phase) * 0.03;  // 0.97 ~ 1.03
                breathOffsetY = -Math.sin(phase) * 0.6; // ±0.6px 上移
            }
            const imgSize = r * 2.8 * scale;
            ctx.save();
            if (flipX) {
                ctx.translate(x, y);
                ctx.scale(-1, 1);
                ctx.translate(-x, -y);
            }
            ctx.beginPath();
            ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(charImg, x - imgSize / 2, y - imgSize / 2 + breathOffsetY, imgSize, imgSize);
            ctx.restore();
        } else {
            this._drawFallbackPlayer(ctx, x, y, r);
        }
    },

    /** 回退绘制玩家（渐变圆球） */
    _drawFallbackPlayer(ctx, x, y, r) {
        const bodyGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        bodyGrad.addColorStop(0, '#66ffff');
        bodyGrad.addColorStop(0.5, '#00aaff');
        bodyGrad.addColorStop(1, '#003366');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    },

    /** 绘制玩家装备的武器（围绕角色弧形排列） */
    _drawPlayerWeapons(player) {
        const ctx = this.ctx;
        const x = player.x, y = player.y, r = player.radius;
        const weapons = player.weapons || [];
        if (weapons.length === 0) return;

        // 攻击检测
        const isAttacking = player.spriteAttackEndTime && Date.now() < player.spriteAttackEndTime;

        // 攻击目标方向（仅攻击动画时使用）
        const targetAngle = (isAttacking && player._attackTargetAngle != null) ? player._attackTargetAngle : 0;

        const count = Math.min(weapons.length, 6);
        // 360° 均匀分布，从上方开始

        for (let i = 0; i < count; i++) {
            const w = weapons[i];
            const weaponDef = ShopSystem.allWeapons.find(d => d.id === w.id);

            // 360° 均匀分布
            const orbitalAngle = (i / count) * Math.PI * 2 - Math.PI / 2;

            // 距玩家中心的距离（大武器略远）
            const slotSize = weaponDef ? (weaponDef.slots || 1) : 1;
            // 武器图标约角色1/2大：角色渲染尺寸 ≈ r*2.8 → 目标 iconSize ≈ r*1.4
            const iconSize = Math.max(18, Math.round(r * 1.0 + slotSize * 5));
            const dist = r + 6 + iconSize * 0.55;

            const orbitX = x + Math.cos(orbitalAngle) * dist;
            const orbitY = y + Math.sin(orbitalAngle) * dist;

            // ---- 计算实际绘制位置和角度 ---- //
            let drawX = orbitX, drawY = orbitY;
            // 非攻击时武器朝外（面向轨道方向），攻击时指向目标
            let drawAngle = orbitalAngle;

            // 所有武器图标正方向朝上（向上），需要 +π/2 偏移补偿
            // Math.atan2 返回角度: 0=右, -π/2=上；图片正方向朝上，需要偏移 +90°
            const isUpwardIcon = true;
            const upOffset = isUpwardIcon ? Math.PI / 2 : 0;
            drawAngle += upOffset;

            if (isAttacking && weaponDef) {
                const anim = (player.weaponAnimations || []).find(a => a.weaponId === w.id);
                // 非近战：用武器→目标的精确夹角（匹配子弹飞行方向）
                // 近战：用玩家→目标的夹角（横扫/突刺以玩家为中心）
                const aimAngle = (anim && anim.fireAngle != null) ? anim.fireAngle : targetAngle;
                // 所有攻击中的武器图标指向目标方向
                drawAngle = aimAngle + upOffset;
                if (anim && (anim.behavior === 'melee_sweep' || anim.behavior === 'melee_thrust')) {
                    const elapsed = Date.now() - anim.startTime;
                    const progress = Math.min(1, elapsed / anim.duration);

                    if (anim.behavior === 'melee_thrust') {
                        // 突刺：武器图标沿攻击方向飞出约3个角色高度，再快速归位
                        const lungeDist = Math.round(r * 6);
                        let thrustT;
                        if (progress < 0.4) {
                            // 前40%：加速飞出
                            thrustT = progress / 0.4;
                            thrustT = 1 - Math.pow(1 - thrustT, 3);
                        } else {
                            // 后60%：减速归位
                            thrustT = 1 - (progress - 0.4) / 0.6;
                            thrustT = thrustT * thrustT;
                        }
                        drawX = orbitX + Math.cos(targetAngle) * lungeDist * thrustT;
                        drawY = orbitY + Math.sin(targetAngle) * lungeDist * thrustT;
                        drawAngle = targetAngle + upOffset;
                    } else {
                        // 横扫：武器图标沿180°弧线从目标方向左侧扫到右侧
                        const sweepArc = Math.PI;
                        const sweepAngle = targetAngle - sweepArc / 2 + sweepArc * progress;
                        drawX = x + Math.cos(sweepAngle) * dist;
                        drawY = y + Math.sin(sweepAngle) * dist;
                        drawAngle = sweepAngle + upOffset;
                    }
                }
            }

            // 武器图标
            const iconImg = AssetSystem.weaponIcons[w.id];
            if (iconImg && (iconImg instanceof HTMLCanvasElement || (iconImg.complete && iconImg.naturalWidth > 0))) {
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(drawAngle);
                ctx.drawImage(iconImg, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
                ctx.restore();
            } else {
                // 回退：小圆点
                ctx.fillStyle = '#ffffff88';
                ctx.beginPath();
                ctx.arc(drawX, drawY, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    // 绘制敌人（使用敌人PNG + 类型形状裁剪）
    drawEnemy(enemy) {
        if (!enemy.alive) return;
        const ctx = this.ctx;
        const x = enemy.x, y = enemy.y, r = enemy.radius;

        // 名称标签（精英/BOSS）
        if (enemy.isBoss || enemy.isElite) {
            ctx.font = '12px Orbitron, monospace';
            ctx.fillStyle = enemy.isBoss ? '#ff0044' : '#ffcc00';
            ctx.textAlign = 'center';
            ctx.fillText(enemy.isBoss ? '◆ BOSS ◆' : '★ ELITE', x, y - r - 15);
        }

        // 光环
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        glow.addColorStop(0, enemy.glowColor + '40');
        glow.addColorStop(1, enemy.glowColor + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Sprite 帧动画：移动时用方向行走帧，静止时用待机帧
        let spriteFrames;
        let frameSpeed = 300;

        if (enemy.isMovingEnemy) {
            // 移动方向 → 行走方向帧
            const walkDir = this._getWalkDirection(enemy.moveAngle);
            const walkFrames = AssetSystem.enemyWalkFrames[enemy.type];
            if (walkFrames && walkFrames[walkDir]) {
                spriteFrames = walkFrames[walkDir];
                frameSpeed = 150; // 行走动画快一倍
            } else {
                // 无方向帧，回退待机帧
                spriteFrames = AssetSystem.enemySpriteFrames[enemy.type];
            }
        } else {
            spriteFrames = AssetSystem.enemySpriteFrames[enemy.type];
        }

        const hasSprite = spriteFrames && spriteFrames.length === 4 &&
            spriteFrames.every(f => f && (f instanceof HTMLCanvasElement || (f.complete && f.naturalWidth > 0)));

        if (hasSprite) {
            const frameIndex = Math.floor(Date.now() / frameSpeed) % 4;
            const frameImg = spriteFrames[frameIndex];

            if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
                ctx.save();
                // 圆形裁剪
                ctx.beginPath();
                ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
                ctx.clip();

                const imgSize = r * 2.6;
                ctx.drawImage(frameImg, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);

                // 受击闪白
                if (enemy.flashTimer > 0) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.fill();
                }
                ctx.restore();

                // 边框
                ctx.strokeStyle = enemy.glowColor + '88';
                ctx.lineWidth = enemy.isBoss ? 3 : 1.5;
                ctx.beginPath();
                ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                this._drawFallbackEnemy(ctx, x, y, r, enemy);
            }
        } else {
            // 回退：单敌人PNG
            const enemyImg = AssetSystem.enemyIcons[enemy.type];
            if (enemyImg && (enemyImg instanceof HTMLCanvasElement || (enemyImg.complete && enemyImg.naturalWidth > 0))) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
                ctx.clip();
                const imgSize = r * 2.6;
                ctx.drawImage(enemyImg, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
                if (enemy.flashTimer > 0) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.fill();
                }
                ctx.restore();
                ctx.strokeStyle = enemy.glowColor + '88';
                ctx.lineWidth = enemy.isBoss ? 3 : 1.5;
                ctx.beginPath();
                ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                this._drawFallbackEnemy(ctx, x, y, r, enemy);
            }
        }

        // ====== 燃烧状态特效 ======
        if (enemy.burnStacks && enemy.burnStacks.length > 0) {
            const burnIntensity = Math.min(1, enemy.burnStacks.length / 3);
            // 红色燃烧光晕
            const burnGlow = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            burnGlow.addColorStop(0, `rgba(255, 68, 0, ${0.15 * burnIntensity})`);
            burnGlow.addColorStop(1, 'rgba(255, 68, 0, 0)');
            ctx.fillStyle = burnGlow;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();

            // 火焰粒子纹
            ctx.fillStyle = `rgba(255, 136, 0, ${0.3 * burnIntensity})`;
            const flicker = Math.sin(Date.now() / 100 + x) * 0.5 + 0.5;
            ctx.beginPath();
            ctx.arc(x + Math.sin(Date.now() / 80 + y) * r * 0.6,
                    y - r * 0.7 - flicker * r * 0.3,
                    r * 0.25 * burnIntensity, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + Math.cos(Date.now() / 120 + x + y) * r * 0.5,
                    y - r * 0.5 - Math.sin(Date.now() / 90) * r * 0.2,
                    r * 0.2 * burnIntensity, 0, Math.PI * 2);
            ctx.fill();
        }

        // ====== 冰冻状态特效 ======
        if (enemy.slowTimer > 0) {
            const iceIntensity = Math.min(1, enemy.slowTimer / 3);
            // 蓝色冰霜光晕
            const iceGlow = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
            iceGlow.addColorStop(0, `rgba(100, 200, 255, ${0.15 * iceIntensity})`);
            iceGlow.addColorStop(1, 'rgba(100, 200, 255, 0)');
            ctx.fillStyle = iceGlow;
            ctx.beginPath();
            ctx.arc(x, y, r * 2, 0, Math.PI * 2);
            ctx.fill();

            // 旋转冰晶
            ctx.fillStyle = `rgba(200, 240, 255, ${0.5 * iceIntensity})`;
            const spin = Date.now() / 600;
            for (let i = 0; i < 3; i++) {
                const a = spin + (i / 3) * Math.PI * 2;
                const ix = x + Math.cos(a) * r * 0.8;
                const iy = y + Math.sin(a) * r * 0.8;
                ctx.beginPath();
                ctx.arc(ix, iy, r * 0.12, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 血条
        if (enemy.hp < enemy.maxHp) {
            const barWidth = r * 2.5;
            const barHeight = 3;
            const barX = x - barWidth / 2;
            const barY = y - r - (enemy.isBoss ? 20 : 10);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            const hpPct = enemy.hp / enemy.maxHp;
            const hpColor = hpPct > 0.5 ? '#00ff88' : hpPct > 0.25 ? '#ffcc00' : '#ff0044';
            ctx.fillStyle = hpColor;
            ctx.fillRect(barX, barY, barWidth * hpPct, barHeight);
        }
    },

    // 绘制子弹（按武器类型区分视觉效果）
    drawBullet(bullet) {
        const ctx = this.ctx;
        const x = bullet.x, y = bullet.y;
        const wid = bullet.weaponId || 'pistol';

        if (!bullet.isPlayer) {
            // 敌人子弹 - 圆形
            ctx.fillStyle = '#ff4444';
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            return;
        }

        // 玩家子弹 - 按武器类型区分
        switch (wid) {
            case 'shotgun':
                ctx.fillStyle = '#ff8800';
                ctx.shadowColor = '#ff8800';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(x, y, 2 + Math.sin(Date.now() / 50 + x) * 1, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'sniper':
                ctx.fillStyle = '#00ff88';
                ctx.shadowColor = '#00ff88';
                ctx.shadowBlur = 12;
                const angleS = Math.atan2(bullet.vy, bullet.vx);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angleS);
                ctx.beginPath();
                ctx.ellipse(0, 0, 10, 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            case 'gatling':
                ctx.fillStyle = '#ffcc00';
                ctx.shadowColor = '#ffcc00';
                ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'laser':
                ctx.fillStyle = '#ff00ff';
                ctx.shadowColor = '#ff00ff';
                ctx.shadowBlur = 15;
                const angleL = Math.atan2(bullet.vy, bullet.vx);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angleL);
                ctx.beginPath();
                ctx.ellipse(0, 0, 8, 1.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            case 'shock':
                ctx.fillStyle = '#00ffff';
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(x, y, 3 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'rocket':
                ctx.fillStyle = '#ff4400';
                ctx.shadowColor = '#ff4400';
                ctx.shadowBlur = 15;
                const angleR = Math.atan2(bullet.vy, bullet.vx);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angleR);
                ctx.beginPath();
                ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                // 尾焰
                ctx.fillStyle = '#ff880088';
                ctx.beginPath();
                ctx.ellipse(-8, 0, 4, 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            case 'frost':
                ctx.fillStyle = '#88ddff';
                ctx.shadowColor = '#88ddff';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                // 冰晶
                ctx.fillStyle = '#ffffff88';
                for (let i = 0; i < 4; i++) {
                    const a = i / 4 * Math.PI * 2 + Date.now() / 500;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            case 'homing':
                ctx.fillStyle = '#ff88ff';
                ctx.shadowColor = '#ff88ff';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                // 跟踪光晕
                const grad = ctx.createRadialGradient(x, y, 2, x, y, 8);
                grad.addColorStop(0, 'rgba(255, 136, 255, 0.3)');
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.fill();
                break;
            // ====== 喷射类武器弹体效果 ======
            case 'flame_spray':
                // 火焰喷射 - 橙红色弹体 + 燃烧拖尾
                ctx.fillStyle = '#ff6600';
                ctx.shadowColor = '#ff4400';
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(x, y, 5 + Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
                // 内焰
                ctx.fillStyle = '#ffcc00';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(x + (Math.random()-0.5)*4, y + (Math.random()-0.5)*4, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'poison_spray':
                // 毒雾喷射 - 绿色雾状弹体
                ctx.fillStyle = '#66ff44';
                ctx.shadowColor = '#44cc22';
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(x, y, 6 + Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#88ff6688';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(x + (Math.random()-0.5)*5, y + (Math.random()-0.5)*5, 4, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'cold_spray':
                // 冷气喷射 - 冰蓝色雾状 + 冰晶
                ctx.fillStyle = '#88ddff';
                ctx.shadowColor = '#66bbff';
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(x, y, 5 + Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(x + (Math.random()-0.5)*6, y + (Math.random()-0.5)*6, 2.5, 0, Math.PI * 2);
                ctx.fill();
                break;
            default:
                // 默认（基础手枪）
                ctx.fillStyle = '#00ffff';
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 8;
                const angleD = Math.atan2(bullet.vy, bullet.vx);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angleD);
                ctx.beginPath();
                ctx.ellipse(0, 0, 6, 2.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
        }

        ctx.shadowBlur = 0;
    },

    // 绘制宝箱
    drawChest(chest) {
        if (!chest.alive) return;
        const ctx = this.ctx;
        const x = chest.x, y = chest.y, r = chest.radius;
        const bobPhase = chest.bobPhase || 0;
        const bob = Math.sin(Date.now() / 400 + bobPhase) * 3;
        const by = y + bob;

        // 宝箱光晕
        const glow = ctx.createRadialGradient(x, by, 0, x, by, r * 3);
        glow.addColorStop(0, 'rgba(255, 204, 0, 0.2)');
        glow.addColorStop(1, 'rgba(255, 204, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, by, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // 箱子主体
        ctx.fillStyle = '#5c3a1e';
        ctx.strokeStyle = 'rgba(255, 204, 0, 0.7)';
        ctx.lineWidth = 2;
        roundRect(ctx, x - r, by - r * 0.8, r * 2, r * 1.6, 4);
        ctx.fill();
        ctx.stroke();

        // 箱盖（上部分亮色）
        ctx.fillStyle = '#8b5e34';
        roundRect(ctx, x - r, by - r * 0.8, r * 2, r * 0.7, 3);
        ctx.fill();

        // 金色锁扣
        ctx.fillStyle = '#ffcc00';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, by + 1, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 闪烁光芒
        const sparkle = Math.sin(Date.now() / 300) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255, 255, 200, ${sparkle * 0.3})`;
        ctx.beginPath();
        ctx.arc(x - r * 0.4, by - r * 0.3, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + r * 0.5, by + r * 0.2, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
    },

    // 绘制医药箱
    drawCrate(crate) {
        if (!crate.alive) return;
        const ctx = this.ctx;
        const x = crate.x, y = crate.y, r = crate.radius;
        // 十字标志 + 绿色光晕
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        glow.addColorStop(0, 'rgba(0, 255, 136, 0.25)');
        glow.addColorStop(1, 'rgba(0, 255, 136, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 箱子主体（方形+圆角）
        ctx.fillStyle = 'rgba(0, 60, 40, 0.85)';
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
        ctx.lineWidth = 2;
        roundRect(ctx, x - r, y - r, r * 2, r * 2, 4);
        ctx.fill();
        ctx.stroke();

        // 医疗十字标志
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        const cs = r * 0.25;
        const ct = r * 0.1;
        ctx.fillRect(x - ct, y - cs, ct * 2, cs * 2);
        ctx.fillRect(x - cs, y - ct, cs * 2, ct * 2);

        // HP条
        const barW = r * 2.2;
        const barH = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - barW/2, y - r - 8, barW, barH);
        const hpPct = crate.hp / crate.maxHp;
        ctx.fillStyle = hpPct > 0.5 ? '#00ff88' : '#ffcc00';
        ctx.fillRect(x - barW/2, y - r - 8, barW * hpPct, barH);
    },

    // 绘制医疗包拾取物
    drawHealthPickup(pk) {
        const ctx = this.ctx;
        const x = pk.x, y = pk.y, r = pk.radius;
        const pulse = Math.sin(Date.now() / 200) * 0.2 + 1;
        const alpha = Math.min(1, pk.lifeTimer / 2.0);

        ctx.globalAlpha = alpha;
        // 光晕
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        glow.addColorStop(0, 'rgba(0, 255, 136, 0.2)');
        glow.addColorStop(1, 'rgba(0, 255, 136, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // 绿色十字
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 12 * pulse;
        const s = r * 0.6 * pulse;
        ctx.fillRect(x - r * 0.15, y - s, r * 0.3, s * 2);
        ctx.fillRect(x - s, y - r * 0.15, s * 2, r * 0.3);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    },

    // 绘制材料
    drawMaterial(mat) {
        const ctx = this.ctx;
        const bob = Math.sin(Date.now() / 300 + mat.x) * 3;
        ctx.fillStyle = '#ffcc00';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 10;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🪙', mat.x, mat.y + bob);
        ctx.shadowBlur = 0;
    },

    // 绘制粒子
    drawParticle(particle) {
        const ctx = this.ctx;
        const alpha = particle.alpha;

        ctx.globalAlpha = alpha;

        if (particle.type === 'circle') {
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (particle.type === 'spark') {
            ctx.strokeStyle = particle.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(
                particle.x - particle.vx * 0.05,
                particle.y - particle.vy * 0.05
            );
            ctx.stroke();
        } else if (particle.type === 'glow') {
            const grad = ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, particle.size * 2
            );
            grad.addColorStop(0, particle.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    },

    // 绘制波次信息动画
    drawWaveAnnouncement(waveNum) {
        if (waveNum === 0) return;
        const ctx = this.ctx;
        const centerX = this.cameraX + this.width / 2;
        const centerY = this.cameraY + this.height / 2;

        ctx.font = '48px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
        ctx.fillText(`WAVE ${waveNum}`, centerX, centerY);

        ctx.font = '18px Orbitron, monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        if (waveNum === 10) ctx.fillText('◆ BOSS APPROACHING ◆', centerX, centerY + 50);
        else if (waveNum === 20) ctx.fillText('◆ FINAL STAND ◆', centerX, centerY + 50);
    },

    // 绘制HUD层（在屏幕上叠加的一些效果）
    drawHUDEffects(player) {
        const ctx = this.ctx;
        const w = this.width, h = this.height;

        // 低血量警告
        if (player && player.hp < player.maxHp * 0.25) {
            ctx.fillStyle = `rgba(255, 0, 68, ${0.05 + Math.sin(Date.now() / 200) * 0.03})`;
            ctx.fillRect(0, 0, w, h);
        }
    },

    /** 绘制所有浮动文字（伤害数字、事件提示） */
    _drawFloatingTexts() {
        const ctx = this.ctx;
        const texts = CombatLogSystem.floatingTexts;
        if (!texts || texts.length === 0) return;

        for (const ft of texts) {
            const alpha = Math.max(0, ft.life / ft.maxLife);
            const fadeScale = 1 + (1 - alpha) * 0.15;
            // 弹跳缩放：合并命中时的「嘭」效果
            const bounce = ft._bounceScale || 0;
            const totalScale = fadeScale * (1 + bounce);

            ctx.save();
            ctx.globalAlpha = alpha;

            // 如果有聚合计数（×N），拆开「数字」和「×N」分别绘制
            const match = ft.text.match(/^(.*?)(\s×\d+)$/);
            if (match) {
                const mainText = match[1];
                const countText = match[2];
                const mainSize = Math.round(ft.size * totalScale);
                const countSize = Math.round(mainSize * 0.65);

                // 用 measureText 计算主数字实际宽度，在其右侧放置 ×N
                ctx.font = `bold ${mainSize}px Orbitron, monospace`;
                const mainMetrics = ctx.measureText(mainText);
                const mainWidth = mainMetrics.width;
                const centerX = ft.x;
                const mainLeft = centerX - mainWidth / 2;

                // 主数字（从中心对齐）
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.lineWidth = 3;
                ctx.strokeText(mainText, centerX, ft.y);

                ctx.fillStyle = ft.color;
                ctx.shadowColor = ft.color;
                ctx.shadowBlur = 8;
                ctx.fillText(mainText, centerX, ft.y);
                ctx.shadowBlur = 0;

                // ×N 计数（紧接主数字右侧，稍微偏下）
                ctx.font = `bold ${countSize}px Orbitron, monospace`;
                const gap = 4;
                const countX = mainLeft + mainWidth + gap;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 2;
                ctx.strokeText(countText, countX, ft.y + 2);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.fillText(countText, countX, ft.y + 2);
            } else {
                ctx.font = `bold ${Math.round(ft.size * totalScale)}px Orbitron, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.lineWidth = 3;
                ctx.strokeText(ft.text, ft.x, ft.y);

                ctx.fillStyle = ft.color;
                ctx.shadowColor = ft.color;
                ctx.shadowBlur = 8;
                ctx.fillText(ft.text, ft.x, ft.y);
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }
    },

    /** 绘制武器攻击动画特效 */
    _drawWeaponAttackEffects(player) {
        const ctx = this.ctx;
        const x = player.x, y = player.y, r = player.radius;
        const anims = player.weaponAnimations || [];
        if (anims.length === 0) return;

        const now = Date.now();
        for (const anim of anims) {
            const elapsed = now - anim.startTime;
            const progress = Math.min(1, elapsed / anim.duration);
            const alpha = 1 - progress;
            const angle = anim.angle;

            switch (anim.behavior) {
                // 近战武器的视觉效果由 _drawPlayerWeapons 中武器图标本身的突刺/横扫动画代替
                case 'melee_sweep':
                case 'melee_thrust':
                    break;
                case 'spray': {
                    const cone = 0.8;
                    const sprayRange = 80 * progress;

                    const color = anim.weaponId === 'flame_spray' ? '255, 100, 0' :
                                  anim.weaponId === 'poison_spray' ? '100, 255, 68' :
                                  anim.weaponId === 'cold_spray' ? '100, 200, 255' : '255, 136, 0';
                    ctx.fillStyle = `rgba(${color}, ${0.15 * alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20);
                    ctx.arc(x + Math.cos(angle) * sprayRange * 0.5, y + Math.sin(angle) * sprayRange * 0.5,
                            sprayRange * 0.4, angle - cone * 0.5, angle + cone * 0.5);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = `rgba(${color}, ${0.9 * alpha})`;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(angle) * 28, y + Math.sin(angle) * 28, 4 + 3 * (1 - progress), 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
                default: {
                    const flashSize = 5 * (1 - progress * 0.6);
                    const colors = [
                        'rgba(255, 255, 100, ' + (0.6 * alpha) + ')',
                        'rgba(255, 200, 50, ' + (0.4 * alpha) + ')',
                        'rgba(255, 255, 200, ' + (0.3 * alpha) + ')'
                    ];
                    for (let i = 0; i < 3; i++) {
                        const offset = (i - 1) * 3;
                        ctx.fillStyle = colors[i];
                        ctx.beginPath();
                        ctx.arc(x + Math.cos(angle) * (25 + offset), y + Math.sin(angle) * (25 + offset), flashSize - i, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.strokeStyle = `rgba(255, 255, 200, ${0.5 * alpha})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(angle) * 25, y + Math.sin(angle) * 25);
                    ctx.lineTo(x + Math.cos(angle) * (25 + 30 * progress), y + Math.sin(angle) * (25 + 30 * progress));
                    ctx.stroke();
                    break;
                }
            }
        }
    }
};

// Canvas roundRect 辅助
function roundRect(ctx, x, y, w, h, r) {

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}


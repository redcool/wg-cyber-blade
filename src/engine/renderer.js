// ============================================================
// engine/renderer.js - Canvas2D 渲染引擎（通用框架）
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

    /** 开始帧：相机跟随玩家 + 清屏 */
    beginFrame(player) {
        const ctx = this.ctx;
        this.cameraX = player ? player.x - this.width / 2 : 0;
        this.cameraY = player ? player.y - this.height / 2 : 0;

        ctx.fillStyle = '#0d0d24';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.save();
        ctx.translate(-this.cameraX, -this.cameraY);
    },

    /** 结束帧：恢复上下文 */
    endFrame() {
        this._drawFloatingTexts();
        this.ctx.restore();
    },

    /** 绘制 Boss 关门屏障（红色发光边框） */
    drawBossBarrier() {
        const ctx = this.ctx;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        const alpha = 0.3 + pulse * 0.4;
        const w = GameWorld.width || 3000;
        const h = GameWorld.height || 3000;
        const thickness = 8;

        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20 + pulse * 15;
        ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
        ctx.lineWidth = thickness;
        ctx.strokeRect(0, 0, w, h);

        // 内发光层
        ctx.shadowBlur = 5;
        ctx.strokeStyle = `rgba(255, 50, 0, ${alpha * 0.5})`;
        ctx.lineWidth = thickness + 4;
        ctx.strokeRect(-2, -2, w + 4, h + 4);

        ctx.restore();
    },

    // ============================================================
    // 背景网格
    // ============================================================
    drawBackground() {
        const ctx = this.ctx;
        const gridSize = 80;

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

    /** 绘制世界边界 */
    drawWorldBounds() {
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0044';
        ctx.strokeStyle = 'rgba(255, 30, 80, 0.85)';
        ctx.lineWidth = 5;
        ctx.setLineDash([14, 18]);
        ctx.strokeRect(0, 0, GameWorld.width, GameWorld.height);
        ctx.restore();
        ctx.setLineDash([]);
    },

    // ============================================================
    // 通用绘制方法（游戏层可复用）
    // ============================================================

    /** 绘制材料（金币） */
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

    /** 绘制粒子 */
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

    /** 绘制所有浮动文字（伤害数字、事件提示） */
    _drawFloatingTexts() {
        const ctx = this.ctx;
        const texts = CombatLogSystem.floatingTexts;
        if (!texts || texts.length === 0) return;

        for (const ft of texts) {
            const alpha = Math.max(0, ft.life / ft.maxLife);
            const fadeScale = 1 + (1 - alpha) * 0.15;
            const bounce = ft._bounceScale || 0;
            const totalScale = fadeScale * (1 + bounce);

            ctx.save();
            ctx.globalAlpha = alpha;

            const match = ft.text.match(/^(.*?)(\s×\d+)$/);
            if (match) {
                const mainText = match[1];
                const countText = match[2];
                const mainSize = Math.round(ft.size * totalScale);
                const countSize = Math.round(mainSize * 0.65);

                ctx.font = `bold ${mainSize}px Orbitron, monospace`;
                const mainMetrics = ctx.measureText(mainText);
                const mainWidth = mainMetrics.width;
                const centerX = ft.x;
                const mainLeft = centerX - mainWidth / 2;

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

    /** HUD层效果（低血量警告等） */
    drawHUDEffects(player) {
        const ctx = this.ctx;
        const w = this.width, h = this.height;

        if (player && player.hp < player.maxHp * 0.25) {
            ctx.fillStyle = `rgba(255, 0, 68, ${0.05 + Math.sin(Date.now() / 200) * 0.03})`;
            ctx.fillRect(0, 0, w, h);
        }
    },

    /** 绘制波次信息动画 */
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
    // ============================================================
    // 游戏对象绘制方法（与 cyberblade 游戏层交互，运行时引用）
    // ============================================================

    /** 绘制敌人 */
    drawEnemy(enemy) {
        const ctx = this.ctx;
        ctx.save();

        // 闪烁（受击）
        if (enemy.flashTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(enemy.flashTimer * 100) * 0.5;
        }

        // 动画 (通过 Animator 类统一管理: idle 呼吸 / attack 震动 / death 渐缩)
        const _Animator = (typeof globalThis !== 'undefined' && globalThis.Animator) || null;
        if (_Animator && enemy.animator) {
            const t = _Animator.getTransform(enemy.animator);
            breath = t.scale;
        } else {
            // 兜底: 错相位呼吸
            const breathPhase = (enemy._uid || (enemy.x * 0.1 + enemy.y * 0.13)) * 0.7;
            breath = 1 + 0.04 * Math.sin(Date.now() / 500 + breathPhase);
        }

        // 获取敌人图标
        const iconImg = typeof AssetSystem !== 'undefined' ? AssetSystem.enemyIcons[enemy.typeId] : null;
        if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
            let w = iconImg.naturalWidth;
            let h = iconImg.naturalHeight;
            // 最长边限制 64px
            const MAX_SIZE = 64;
            if (w > MAX_SIZE || h > MAX_SIZE) {
                const scale = MAX_SIZE / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
            ctx.save();
            ctx.translate(enemy.x, enemy.y);
            ctx.scale(breath, breath);
            ctx.drawImage(iconImg, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            // 回退：圆形绘制
            let color = enemy.color;
            if (enemy.isBoss) color = '#ff0044';
            else if (enemy.isElite) color = '#cc44ff';
            ctx.fillStyle = color;
            ctx.shadowColor = enemy.glowColor || color;
            ctx.shadowBlur = enemy.isBoss ? 25 : (enemy.isElite ? 18 : 12);
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius * breath, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // HP 条
        const barW = enemy.radius * 2.2;
        const barH = 4;
        const barX = enemy.x - barW / 2;
        const barY = enemy.y - enemy.radius - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : (hpRatio > 0.25 ? '#ffaa00' : '#ff4444');
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // 方向指示（移动方向箭头）
        if (enemy.isMovingEnemy) {
            const dirAngle = enemy.moveAngle;
            const tipX = enemy.x + Math.cos(dirAngle) * (enemy.radius + 6);
            const tipY = enemy.y + Math.sin(dirAngle) * (enemy.radius + 6);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - Math.cos(dirAngle - 0.5) * 6, tipY - Math.sin(dirAngle - 0.5) * 6);
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - Math.cos(dirAngle + 0.5) * 6, tipY - Math.sin(dirAngle + 0.5) * 6);
            ctx.stroke();
        }

        ctx.restore();
    },

    /** 绘制玩家 */
    drawPlayer(player) {
        if (!player) return;
        const ctx = this.ctx;

        // ======== 角色身体（随朝向翻转） ========
        ctx.save();
        ctx.translate(player.x, player.y);

        // 受伤闪烁
        if (player.damageFlashTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(player.damageFlashTimer * 200) * 0.5;
        }

        const facingLeft = player.facingAngle > Math.PI / 2 || player.facingAngle < -Math.PI / 2;
        if (facingLeft) {
            ctx.scale(-1, 1);
        }

        // 动画 (Animator 统一管理: idle 呼吸 / death 渐缩)
        const _Animator2 = (typeof globalThis !== 'undefined' && globalThis.Animator) || null;
        if (_Animator2 && player.animator) {
            const t = _Animator2.getTransform(player.animator);
            breath = t.scale;
            // 走路时减弱 (但 death 不减弱, 仍渐缩)
            if (player.animator.current === 'idle') {
                const movingSpeed = Math.hypot(player.vx || 0, player.vy || 0);
                const idleAmt = movingSpeed < 30 ? 1.0 : 0.4;
                // 用 Animator 缩放为基准, 走路时减弱振幅
                breath = 1 + (breath - 1) * idleAmt;
            }
        } else {
            // 兜底: 错相位呼吸
            const movingSpeed = Math.hypot(player.vx || 0, player.vy || 0);
            const idleAmt = movingSpeed < 30 ? 1.0 : 0.4;
            breath = 1 + 0.045 * idleAmt * Math.sin(Date.now() / 480);
        }

        // 核心身体 - 使用角色图标
        const charImg = player.characterId && typeof AssetSystem !== 'undefined'
            ? AssetSystem.characterIcons[player.characterId] : null;
        if (charImg && charImg.complete && charImg.naturalWidth > 0) {
            let w = charImg.naturalWidth;
            let h = charImg.naturalHeight;
            // 最长边限制 64px
            const MAX_SIZE = 64;
            if (w > MAX_SIZE || h > MAX_SIZE) {
                const scale = MAX_SIZE / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
            ctx.save();
            ctx.scale(breath, breath);
            ctx.drawImage(charImg, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(0, 0, player.radius * breath, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // 护盾光环
        if (player.energyShield && player.energyShield > 0) {
            ctx.strokeStyle = `rgba(0, 200, 255, ${0.3 + Math.sin(Date.now() / 500) * 0.15})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, player.radius + 6, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();

        // ======== 武器（不翻转，保持攻击方向正确） ========
        ctx.save();
        ctx.translate(player.x, player.y);

        if (player.weapons && player.weaponParams) {
            const count = player.weapons.length;
            for (let i = 0; i < count; i++) {
                const w = player.weapons[i];
                const wp = player.weaponParams[w.id];
                if (!wp) continue;

                const dist = SystemConfig.get('weaponOrbitDistance')
                          + Math.max(0, (wp.slots || 1) - 1)
                          * SystemConfig.get('weaponOrbitExtraPerSlot');
                const orbitAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
                let angle = orbitAngle, drawDist = dist, drawRotation = orbitAngle;

                if (wp._attackAnimTimer && wp._attackAnimTimer > 0 && wp._attackAnimDuration > 0) {
                    const progress = 1 - (wp._attackAnimTimer / wp._attackAnimDuration);
                    const aa = wp._attackAngle;
                    const weaponRange = (wp.attackRange || 60) + (player.attackRange || 0);
                    const AIM_END = 0.25; // 瞄准阶段占动画 25%

                    if (wp._attackBehavior === 'melee_thrust') {
                        // 瞄准阶段: 位置在轨道不动, 旋转朝向目标
                        // 刺出阶段: 从轨道沿攻击方向刺出到 weaponRange 再收回
                        if (progress < AIM_END) {
                            angle = orbitAngle;
                            drawDist = dist;
                        } else {
                            const strikeP = (progress - AIM_END) / (1 - AIM_END);
                            const maxDist = dist + (weaponRange - dist) * 0.7;
                            drawDist = dist + (maxDist - dist) * Math.sin(strikeP * Math.PI);
                            angle = aa;
                        }
                        drawRotation = aa;
                    } else if (wp._attackBehavior === 'melee_sweep') {
                        // 瞄准阶段: 位置在轨道不动, 旋转朝向目标
                        // 横扫阶段: 在轨道上做弧线扫掠
                        if (progress < AIM_END) {
                            angle = orbitAngle;
                            drawDist = dist;
                        } else {
                            const sweepP = (progress - AIM_END) / (1 - AIM_END);
                            drawDist = weaponRange;
                            angle = aa - Math.PI / 2 + sweepP * Math.PI;
                        }
                        drawRotation = aa;
                    } else {
                        // 远程（含射击/魔法等）: 轨道位置不动，只旋转朝向目标
                        angle = orbitAngle;
                        drawDist = dist;
                        drawRotation = aa;
                    }
                }

                // Idle 远程武器: 平滑跟踪最近敌人
                if (!(wp._attackAnimTimer && wp._attackAnimTimer > 0 && wp._attackAnimDuration > 0)
                    && wp._attackBehavior !== 'melee_thrust' && wp._attackBehavior !== 'melee_sweep'
                    && wp._trackTargetAngle !== undefined) {
                    if (wp._trackAngle === undefined) wp._trackAngle = drawRotation;
                    let d = wp._trackTargetAngle - wp._trackAngle;
                    while (d > Math.PI) d -= Math.PI * 2;
                    while (d < -Math.PI) d += Math.PI * 2;
                    wp._trackAngle += d * 0.12;
                    drawRotation = wp._trackAngle;
                }

                const wx = Math.cos(angle) * drawDist;
                const wy = Math.sin(angle) * drawDist;

                const wpnImg = typeof AssetSystem !== 'undefined' ? AssetSystem.weaponIcons[w.id] : null;
                if (wpnImg && wpnImg.complete && wpnImg.naturalWidth > 0) {
                    let ww = wpnImg.naturalWidth;
                    let wh = wpnImg.naturalHeight;
                    // 最长边限制 64px，保持原始宽高比
                    const MAX_SIZE = 64;
                    if (ww > MAX_SIZE || wh > MAX_SIZE) {
                        const scale = MAX_SIZE / Math.max(ww, wh);
                        ww = Math.round(ww * scale);
                        wh = Math.round(wh * scale);
                    }
                    ctx.save();
                    ctx.translate(wx, wy);
                    ctx.rotate(drawRotation + SystemConfig.get('weaponRotationOffset'));
                    ctx.drawImage(wpnImg, -ww / 2, -wh / 2, ww, wh);
                    ctx.restore();
                } else {
                    ctx.fillStyle = wp.tag === 'melee' ? '#ff8844' : '#44aaff';
                    ctx.shadowColor = wp.tag === 'melee' ? '#ff8844' : '#44aaff';
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(wx, wy, 5 + (wp.slots || 1) * 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (w.quality && w.quality !== 'T1') {
                    const qColor = RarityColorSystem && RarityColorSystem.getColor
                        ? RarityColorSystem.getColor(w.quality)
                        : null;
                    if (qColor) {
                        ctx.strokeStyle = qColor;
                        ctx.lineWidth = w.quality === 'T3' || w.quality === 'T4' ? 2 : 1.5;
                        ctx.stroke();
                    }
                }
                ctx.shadowBlur = 0;
            }
        }

        ctx.restore();

    },

        /** 子弹视觉配置缓存 { 'behavior|tag': { shape, color, size, glowColor, glowSize, trail, image } } */
    _bulletConfigMap: null,
    /** 子弹图片缓存 { imageName: HTMLImageElement } */
    _bulletImages: {},

    /** 懒加载子弹视觉配置 */
    _getBulletConfig(behavior, tag, class_2) {
        if (!this._bulletConfigMap) {
            this._bulletConfigMap = {};
            let data = typeof window !== 'undefined' && window.__DATA_BUNDLE__ && window.__DATA_BUNDLE__.bulletTypes;
            if (!data && typeof DataLoader !== 'undefined' && DataLoader._cache) {
                data = DataLoader._cache.bulletTypes;
            }
            if (!data && typeof DataLoader !== 'undefined') {
                try { data = DataLoader.loadSync?.('bulletTypes') || DataLoader._cache?.bulletTypes; } catch(e) {}
            }
            if (data) {
                for (const row of data) {
                    const c2 = row.class_2 || '*';
                    this._bulletConfigMap[`${row.behavior}|${row.tag}|${c2}`] = row;
                }
            }
        }
        // 5 级降级: exact{behavior,tag,class_2} → class_2通配* → tag通配* → 默认behavior→全局默认
        const c2 = class_2 || '*';
        const exact = this._bulletConfigMap?.[`${behavior}|${tag}|${c2}`];
        if (exact) return exact;
        const classWild = this._bulletConfigMap?.[`${behavior}|${tag}|*`];
        if (classWild) return classWild;
        const tagWild = this._bulletConfigMap?.[`${behavior}|*|*`];
        if (tagWild) return tagWild;
        const defaultForTag = this._bulletConfigMap?.[`bullet|${tag}|*`];
        if (defaultForTag) return defaultForTag;
        return this._bulletConfigMap?.['bullet|*|*'] || null;
    },

    /** 懒加载子弹图片 */
    _loadBulletImage(name) {
        if (!name) return null;
        if (this._bulletImages[name]) return this._bulletImages[name];
        const img = new Image();
        img.src = `assets/bulletTypes/${name}.png?${CACHE_VER}`;
        this._bulletImages[name] = img;
        return img;
    },

    /** 绘制子弹 */
    drawBullet(bullet) {
        const ctx = this.ctx;
        ctx.save();

        // 子弹颜色(优先级:外部传入 > 元素效果 > 武器类型)
        // 元素效果(冰/火/闪电/治疗)优先于武器类型默认色
        // 武器类型:远程(ranged)白;魔法(magic)淡黄;近战(melee)黄;其他默认青
        // 怪子弹(isPlayer=false): 大红色, 与玩家子弹明显区分
        let color = bullet.color || null;
        if (!color) {
            if (!bullet.isPlayer) {
                color = '#ff0000';
            } else if (bullet.isMortar) {
                color = '#aa44ff';
            } else if (bullet.burnDps > 0) {
                // 火:红
                color = '#ff4444';
            } else if (bullet.slowAmount > 0) {
                // 冰:冰蓝
                color = '#88ddff';
            } else if (bullet.chainCount > 0) {
                // 闪电:橙黄
                color = '#ffaa44';
            } else if (bullet.healOnHit > 0) {
                // 治疗:绿
                color = '#00ff88';
            } else if (bullet.weaponTag === 'ranged') {
                // 远程:白
                color = '#ffffff';
            } else if (bullet.weaponTag === 'magic') {
                // 魔法默认:淡黄
                color = '#ffffaa';
            } else if (bullet.weaponTag === 'melee') {
                // 近战:金黄
                color = '#ffdd44';
            } else {
                color = '#ffff44';
            }
        }

        // ====== 从 bulletTypes 配置驱动弹道形状 ======
        const bConfig = bullet.behavior && this._getBulletConfig(bullet.behavior, bullet.weaponTag, bullet.weaponClass2);

        // 从表读取视觉尺寸（size = 实际像素宽），程序路径使用 size/2 作为半径
        const cfgSize = bConfig ? (bConfig.size || 0) : 0;
        const visualR = cfgSize > 0 ? cfgSize / 2 : (bullet.radius || 4);

        // 优先使用图片（非空 image 字段），按武器规则：PNG 正方向=图的上方，旋转至飞行方向
        if (bConfig && bConfig.image) {
            const img = this._loadBulletImage(bConfig.image);
            if (img && img.complete && img.naturalWidth > 0) {
                const s = bConfig.size || 8;
                const angle = Math.atan2(bullet.vy, bullet.vx) + SystemConfig.get('bulletRotationOffset');
                ctx.translate(bullet.x, bullet.y);
                ctx.rotate(angle);
                ctx.drawImage(img, -s / 2, -s / 2, s, s);
                ctx.restore(); // 恢复 drawBullet 入口的 save
                return;
            }
        }

        const shape = bConfig ? bConfig.shape : (
            (bullet.chainCount > 0 && bullet.isPlayer) ? 'bolt' : 'circle'
        );

        if (shape === 'bolt' && bullet.isPlayer) {
            this._drawLightningBolt(ctx, bullet, color);
            ctx.restore();
            return;
        }

        if (shape === 'arrow') {
            this._drawBulletArrow(ctx, bullet, color, visualR);
            ctx.restore();
            return;
        }

        if (shape === 'beam') {
            this._drawBulletBeam(ctx, bullet, color, visualR);
            ctx.restore();
            return;
        }

        // ====== 默认: 圆形子弹 ======
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, visualR, 0, Math.PI * 2);
        ctx.fill();
        // 白色/浅色子弹加深色描边,让白在深背景上明显
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, visualR, 0, Math.PI * 2);
        ctx.stroke();

        // 拖尾
        if (bullet.vx || bullet.vy) {
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bullet.x, bullet.y);
            ctx.lineTo(bullet.x - bullet.vx * 0.05, bullet.y - bullet.vy * 0.05);
            ctx.stroke();
        }

        ctx.restore();
    },

    /** 绘制锯齿闪电线（shock 武器专用） */
    _drawLightningBolt(ctx, bullet, color) {
        const dx = bullet.x - bullet.startX;
        const dy = bullet.y - bullet.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) { // 太短退化为圆形
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        const segs = Math.max(4, Math.floor(dist / 12));
        const spread = Math.min(8, dist * 0.08);

        // 外发光层
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3.5;
        ctx.globalAlpha = 0.7;
        this._drawZigzag(ctx, bullet, dx, dy, segs, spread);

        // 核心亮线
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.85;
        this._drawZigzag(ctx, bullet, dx, dy, segs, spread * 0.5);

        // 分支小闪电（随机 1-2 条）
        ctx.shadowBlur = 10;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        const branchCount = 1 + (Math.abs(bullet.startX * 7 + bullet.startY * 13) % 2);
        for (let i = 0; i < branchCount; i++) {
            const t = 0.3 + (Math.abs(bullet.startX * 31 + bullet.startY * 47 + i * 19) % 50) / 100 * 0.5;
            this._drawBranch(ctx, bullet, dx, dy, dist, t, spread * 1.5);
        }
    },

    /** 画一条锯齿线 */
    _drawZigzag(ctx, bullet, dx, dy, segs, spread) {
        const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
        const seed = bullet.startX * 1000 + bullet.startY;
        ctx.beginPath();
        ctx.moveTo(bullet.startX, bullet.startY);
        for (let i = 1; i < segs; i++) {
            const t = i / segs;
            const bx = bullet.startX + dx * t;
            const by = bullet.startY + dy * t;
            const hash = Math.abs(Math.floor(seed * (i + 1) * 7.3)) % 1000 / 1000;
            const jitter = (hash - 0.5) * 2 * spread;
            ctx.lineTo(
                bx + Math.cos(perpAngle) * jitter,
                by + Math.sin(perpAngle) * jitter
            );
        }
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
    },

    /** 画一条分支闪电 */
    _drawBranch(ctx, bullet, dx, dy, dist, t, spread) {
        const bx = bullet.startX + dx * t;
        const by = bullet.startY + dy * t;
        const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
        const side = (Math.abs(bullet.startX * 53 + bullet.startY * 71 + Math.floor(t * 100)) % 2 === 0) ? 1 : -1;
        const branchLen = dist * 0.15 * (0.5 + Math.abs(bullet.startX * 97 + bullet.startY * 113) % 50 / 100);
        const endX = bx + Math.cos(perpAngle) * side * spread * 2;
        const endY = by + Math.sin(perpAngle) * side * spread * 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    },

    /** 绘制箭头弹道（枪械/弓 — 小椭圆+方向尾迹） */
    _drawBulletArrow(ctx, bullet, color, r) {
        r = r || bullet.radius || 4;
        const angle = Math.atan2(bullet.vy, bullet.vx);
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(angle);

        // 发光
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;

        // 弹头（椭圆）
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.6, r, 0, 0, Math.PI * 2);
        ctx.fill();

        // 尾部拖线
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, 0);
        ctx.lineTo(-r * 2.5, 0);
        ctx.stroke();

        ctx.restore();
    },

    /** 绘制光束弹道（魔法/冰/火 — 发光长条） */
    _drawBulletBeam(ctx, bullet, color, r) {
        r = r || bullet.radius || 5;
        const dx = bullet.x - bullet.startX;
        const dy = bullet.y - bullet.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10) {
            // 太短退化为圆
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(bullet.startX, bullet.startY);
        ctx.rotate(angle);

        // 外发光层
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(0, -r * 0.6, dist, r * 1.2);

        // 核心亮层
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6;
        ctx.fillRect(0, -r * 0.25, dist, r * 0.5);

        ctx.restore();
    },

    /** 绘制医药箱 */
    drawCrate(crate) {
        if (!crate.alive) return;
        const ctx = this.ctx;
        ctx.save();

        const size = crate.radius || 18;
        ctx.fillStyle = '#00bb66';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;
        roundRect(ctx, crate.x - size, crate.y - size, size * 2, size * 2, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 十字标记
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        const cx = crate.x, cy = crate.y;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy);
        ctx.lineTo(cx + 8, cy);
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx, cy + 8);
        ctx.stroke();

        // HP 条
        const barW = size * 1.5;
        const barH = 3;
        const barX = crate.x - barW / 2;
        const barY = crate.y - size - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX, barY, barW, barH);
        const hpRatio = Math.max(0, crate.hp / crate.maxHp);
        ctx.fillStyle = '#44ff88';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        ctx.restore();
    },

    /** 绘制医疗包掉落物 */
    drawHealthPickup(pickup) {
        const ctx = this.ctx;
        ctx.save();

        const alpha = Math.min(1, pickup.lifeTimer / 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#44ff88';
        ctx.shadowColor = '#44ff88';
        ctx.shadowBlur = 8;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❤️', pickup.x, pickup.y);
        ctx.shadowBlur = 0;

        ctx.restore();
    },

    /** 炮塔图片缓存 */
    _turretImages: {},

    /** 懒加载炮塔图片 */
    _getTurretImg(level) {
        if (this._turretImages[level]) return this._turretImages[level];
        const src = `assets/sceneItems/turret${level}.png?${CACHE_VER}`;
        const img = new Image();
        img.src = src;
        this._turretImages[level] = img;
        return img;
    },

    /** 绘制炮塔 — 不旋转,攻击时播放快速呼吸缩放 */
    drawTurret(turret) {
        if (!turret.alive) return;
        const ctx = this.ctx;
        ctx.save();

        const level = turret.level || 1;
        const img = this._getTurretImg(level);
        const r = turret.radius || 32;
        const size = r * 2;

        // 攻击呼吸脉冲 (attackPulse 0.3→0)
        const pulse = Math.max(0, turret.attackPulse || 0);
        const animScale = pulse > 0 ? 1 + Math.sin(pulse * 20) * 0.05 * pulse * 4 : 1;
        const drawSize = size * animScale;

        // 底座阴影
        ctx.shadowColor = level === 4 ? '#cc44ff' : level === 3 ? '#44ccff' : level === 2 ? '#ff6600' : '#ffaa44';
        ctx.shadowBlur = 14;

        if (img.complete && img.naturalWidth > 0) {
            // 有图片：居中绘制，不旋转
            ctx.drawImage(img, turret.x - drawSize / 2, turret.y - drawSize / 2, drawSize, drawSize);
        } else {
            // 降级：简单几何绘制（居中，带呼吸缩放）
            ctx.save();
            ctx.translate(turret.x, turret.y);
            ctx.scale(animScale, animScale);

            ctx.fillStyle = '#445566';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
            ctx.fill();

            const barrelColor = level === 4 ? '#cc44ff' : level === 3 ? '#44ccff' : level === 2 ? '#ff6600' : '#ffaa44';
            ctx.strokeStyle = barrelColor;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(r * 1.3, 0);
            ctx.stroke();

            ctx.fillStyle = barrelColor;
            ctx.beginPath();
            ctx.arc(r * 1.3, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    },

    /** 绘制炮塔子弹/弹道 — 按等级不同样式 */
    drawTurretBullet(bullet) {
        const ctx = this.ctx;
        ctx.save();

        const r = bullet.radius || 4;
        const lv = bullet.level || 0;

        if (lv === 1) {
            // L1 炮击：橙色大炮弹 + 尾焰
            ctx.shadowColor = '#ff6622';
            ctx.shadowBlur = 14;
            ctx.fillStyle = '#ff8844';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc88';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else if (lv === 2) {
            // L2 喷火：橙红火焰弹，小 + 拖尾
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ff6622';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc44';
            ctx.beginPath();
            ctx.arc(bullet.x - bullet.vx * 0.01, bullet.y - bullet.vy * 0.01, r * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (lv === 3) {
            // L3 冷冻：蓝白冰晶
            ctx.shadowColor = '#44ccff';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#88eeff';
            ctx.beginPath();
            // 菱形冰晶
            const s = r * 1.2;
            ctx.moveTo(bullet.x, bullet.y - s);
            ctx.lineTo(bullet.x + s * 0.7, bullet.y);
            ctx.lineTo(bullet.x, bullet.y + s);
            ctx.lineTo(bullet.x - s * 0.7, bullet.y);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r * 0.4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 通用：发光圆点（旧版样式）
            ctx.shadowColor = '#ffaa44';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#ffcc66';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#fff8e0';
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, r * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    },

    /** 绘制 L4 激光束 */
    drawTurretBeam(turret) {
        if (!turret.alive || turret.level !== 4) return;
        const ctx = this.ctx;
        ctx.save();

        const len = turret.range;
        const endX = turret.x + Math.cos(turret.angle) * len;
        const endY = turret.y + Math.sin(turret.angle) * len;

        // 外层光晕
        ctx.shadowColor = '#cc44ff';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(200, 80, 255, 0.25)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(turret.x, turret.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 激光主体
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(180, 60, 255, 0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(turret.x, turret.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 核心亮线
        ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(255, 200, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(turret.x, turret.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    },

    /** 绘制宝箱 */
    drawChest(chest) {
        if (!chest.alive) return;
        const ctx = this.ctx;
        ctx.save();

        const bob = Math.sin(chest.bobPhase) * 3;
        ctx.fillStyle = chest.tier === 2 ? '#ff6600' : '#cc8800';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 15;
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📦', chest.x, chest.y + bob);
        ctx.shadowBlur = 0;

        ctx.restore();
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

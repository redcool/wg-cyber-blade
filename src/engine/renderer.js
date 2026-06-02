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
        ctx.strokeStyle = 'rgba(255, 0, 68, 0.15)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 15]);
        ctx.strokeRect(0, 0, GameWorld.width, GameWorld.height);
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

        // 获取敌人图标
        const iconImg = typeof AssetSystem !== 'undefined' ? AssetSystem.enemyIcons[enemy.typeId] : null;
        if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
            const size = enemy.radius * 2.5;
            ctx.drawImage(iconImg, enemy.x - size / 2, enemy.y - size / 2, size, size);
        } else {
            // 回退：圆形绘制
            let color = enemy.color;
            if (enemy.isBoss) color = '#ff0044';
            else if (enemy.isElite) color = '#cc44ff';
            ctx.fillStyle = color;
            ctx.shadowColor = enemy.glowColor || color;
            ctx.shadowBlur = enemy.isBoss ? 25 : (enemy.isElite ? 18 : 12);
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
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

        const facingLeft = player.facingAngle > Math.PI / 2 || player.facingAngle < -Math.PI / 2;
        if (facingLeft) {
            ctx.scale(-1, 1);
        }

        // 核心身体 - 使用角色图标
        const charImg = player.characterId && typeof AssetSystem !== 'undefined'
            ? AssetSystem.characterIcons[player.characterId] : null;
        if (charImg && charImg.complete && charImg.naturalWidth > 0) {
            const size = player.radius * 2.5;
            ctx.drawImage(charImg, -size / 2, -size / 2, size, size);
        } else {
            ctx.fillStyle = '#00ffff';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
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

                const dist = player.radius + 8 + (wp.slots || 1) * 5;
                let angle, drawDist = dist, drawRotation;

                if (wp._attackAnimTimer && wp._attackAnimTimer > 0 && wp._attackAnimDuration > 0) {
                    const progress = 1 - (wp._attackAnimTimer / wp._attackAnimDuration);
                    const aa = wp._attackAngle;

                    if (wp._attackBehavior === 'melee_thrust') {
                        const maxDist = dist + (wp.meleeRange || 60) * 0.7;
                        drawDist = dist + (maxDist - dist) * Math.sin(progress * Math.PI);
                        angle = aa;
                        drawRotation = aa;
                    } else if (wp._attackBehavior === 'melee_sweep') {
                        angle = aa - Math.PI / 2 + progress * Math.PI;
                        drawRotation = aa;
                    } else {
                        angle = aa;
                        drawRotation = aa;
                    }
                } else {
                    angle = (i / count) * Math.PI * 2 - Math.PI / 2;
                    drawRotation = angle; // 待机时武器图标朝外（径向）
                }

                const wx = Math.cos(angle) * drawDist;
                const wy = Math.sin(angle) * drawDist;

                const wpnImg = typeof AssetSystem !== 'undefined' ? AssetSystem.weaponIcons[w.id] : null;
                if (wpnImg && wpnImg.complete && wpnImg.naturalWidth > 0) {
                    let iconSize = (10 + (wp.slots || 1) * 4) * 1.3;
                    ctx.save();
                    ctx.translate(wx, wy);
                    ctx.rotate(drawRotation + Math.PI / 2); // "向上"对准攻击/径向方向
                    ctx.drawImage(wpnImg, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
                    ctx.restore();
                } else {
                    ctx.fillStyle = wp.tag === 'melee' || wp.tag === 'lance' ? '#ff8844' : '#44aaff';
                    ctx.shadowColor = wp.tag === 'melee' || wp.tag === 'lance' ? '#ff8844' : '#44aaff';
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

    /** 绘制子弹 */
    drawBullet(bullet) {
        const ctx = this.ctx;
        ctx.save();

        // 子弹颜色
        let color = bullet.color || '#ffff44';
        if (bullet.isMortar) color = '#aa44ff';
        else if (bullet.chainCount > 0) color = '#4488ff';
        else if (bullet.slowAmount > 0) color = '#44ccff';
        else if (bullet.burnDps > 0) color = '#ff6600';
        else if (bullet.healOnHit > 0) color = '#00ff88';

        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius || 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

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

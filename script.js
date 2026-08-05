const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- TECLADO GLOBAL Y DETECTOR DE EASTER EGGS ---
const keys = {};
let keyBuffer = '';
let isGodMode = false; 

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (e.key.length === 1) {
        keyBuffer += key;
        if (keyBuffer.length > 20) keyBuffer = keyBuffer.substring(1);

        checkEasterEggWords();
    }
});

window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- ESTADOS DE LA SECUENCIA EASTER EGG Y MODO SIGMA ---
let secretStep = 0; 
let pendingSigmaUnlock = false;
let isSigmaUnlocked = false;

let gameState = 'MENU';
let currentDifficulty = 'normal';

// Variables Modo Sigma
let isSigmaTrueForm = false;
let isScreenFrozen = false;
let screenShakeTimer = 0;
let isUltimateActive = false;
let isBossImmune = false;
let minions = [];

// Temporizador del anillo periódico distintivo y BGM
let sigmaSlowRingTimer = 0;
let bgmTimeout = null;

// Temporizador de supervivencia
let survivalTimer = 0;
let survivalInterval = null;

// Control de FPS Global
let lastTime = 0;
const fpsInterval = 1000 / 60;

function showToast(text) {
    const toast = document.getElementById('toast-notification');
    if (toast) {
        toast.innerText = text;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }
}

function showBGMNotification(text) {
    const bgmUi = document.getElementById('bgm-ui');
    if (bgmUi) {
        if (text) bgmUi.innerText = text;
        bgmUi.classList.add('show');

        if (bgmTimeout) clearTimeout(bgmTimeout);

        bgmTimeout = setTimeout(() => {
            bgmUi.classList.remove('show');
        }, 3000);
    }
}

function checkEasterEggWords() {
    if (secretStep === 1 && keyBuffer.endsWith('papoi')) {
        showToast('papoi?');
        secretStep = 2;
    }
    else if (secretStep === 3 && keyBuffer.endsWith('sigma')) {
        showToast('los sigmas están esperando');
        pendingSigmaUnlock = true;
        secretStep = 0;
    }
}

function showDesc(text) {
    const descEl = document.getElementById('diff-desc');
    if (descEl) descEl.innerText = text;
}

function getHardDescription() {
    if (secretStep >= 2) {
        return "algo cambió?";
    }
    return "no sé porqué querrías jugar esto";
}

function selectDifficulty(diff) {
    currentDifficulty = diff;
    const diffScreen = document.getElementById('diff-screen');
    if (diffScreen) diffScreen.style.display = 'none';

    if (diff === 'easy') {
        secretStep = 1;
        endGame(true, true);
        return;
    }

    if (diff === 'hard' && secretStep === 2) {
        startSurvivalChallenge();
        return;
    }

    restartGame();
}

function startSurvivalChallenge() {
    restartGame();
    player.lives = 1;
    player.maxLives = 1;
    updateUI();

    survivalTimer = 15;
    const hpCont = document.getElementById('hp-container');
    if (hpCont) hpCont.style.display = 'none';
    const hpTxt = document.getElementById('hp-text');
    if (hpTxt) hpTxt.innerText = `⏱️ ${survivalTimer}s`;

    if (survivalInterval) clearInterval(survivalInterval);

    survivalInterval = setInterval(() => {
        if (gameState !== 'PLAYING') {
            clearInterval(survivalInterval);
            survivalInterval = null;
            return;
        }

        survivalTimer--;
        if (hpTxt) hpTxt.innerText = `⏱️ ${survivalTimer}s`;

        if (survivalTimer <= 0) {
            clearInterval(survivalInterval);
            survivalInterval = null;
            secretStep = 3;
            endGame(true, false, true);
        }
    }, 1000);
}

function openDifficultyMenu() {
    gameState = 'MENU';
    const overlay = document.getElementById('game-overlay');
    if (overlay) overlay.style.display = 'none';
    const diffScreen = document.getElementById('diff-screen');
    if (diffScreen) diffScreen.style.display = 'flex';
    const hpCont = document.getElementById('hp-container');
    if (hpCont) hpCont.style.display = 'block';
    
    const bgmUi = document.getElementById('bgm-ui');
    if (bgmUi) bgmUi.classList.remove('show');

    const bgm = document.getElementById('bgm-audio');
    if (bgm) { bgm.pause(); bgm.currentTime = 0; }

    const sigmaBtn = document.getElementById('btn-sigma-secret');
    if (sigmaBtn) {
        if (pendingSigmaUnlock || isSigmaUnlocked) {
            isSigmaUnlocked = true;
            pendingSigmaUnlock = false;
            sigmaBtn.style.display = 'block';
        } else if (!isSigmaUnlocked) {
            sigmaBtn.style.display = 'none';
        }
    }
}

function triggerScreenShake(duration = 20) {
    screenShakeTimer = duration;
}

function triggerSigmaTransformation() {
    isScreenFrozen = true;
    triggerScreenShake(30);

    setTimeout(() => {
        isSigmaTrueForm = true;
        boss.maxHp = 2600;
        boss.hp = 2600;
        boss.color = '#00ffff';
        
        // Conservar corazones según las reglas
        player.maxLives = 6;
        if (player.lives <= 3) {
            player.lives = 4;
        }

        showBGMNotification('🎵 BGM: TRUE SIGMA');
        const bgm = document.getElementById('bgm-audio');
        if (bgm) bgm.play().catch(() => console.log("Audio interact requirement"));

        bossBullets = [];
        playerBullets = [];
        isScreenFrozen = false;
        updateUI();
    }, 1200);
}

// --- ENTIDADES Y LOGICA PRINCIPAL ---
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 3;
        this.speed = 4.5;
        this.shootCooldown = 0;
        this.maxLives = (currentDifficulty === 'hard') ? 4 : 6;
        this.lives = this.maxLives;
        this.invulnerableTimer = 0;
    }

    update() {
        if (isScreenFrozen) return;

        if (keys['a'] && this.x - this.radius > 0) this.x -= this.speed;
        if (keys['d'] && this.x + this.radius < canvas.width) this.x += this.speed;
        if (keys['w'] && this.y - this.radius > 0) this.y -= this.speed;
        if (keys['s'] && this.y + this.radius < canvas.height) this.y += this.speed;

        if (this.shootCooldown <= 0) {
            const isHoming = boss.getPhase() >= 2 && currentDifficulty !== 'sigma';
            let fired = false;

            if (keys['arrowup']) { playerBullets.push(new PlayerBullet(this.x, this.y, 0, -9, isHoming)); fired = true; }
            if (keys['arrowdown']) { playerBullets.push(new PlayerBullet(this.x, this.y, 0, 9, isHoming)); fired = true; }
            if (keys['arrowleft']) { playerBullets.push(new PlayerBullet(this.x, this.y, -9, 0, isHoming)); fired = true; }
            if (keys['arrowright']) { playerBullets.push(new PlayerBullet(this.x, this.y, 9, 0, isHoming)); fired = true; }
            if (!fired && keys[' ']) { playerBullets.push(new PlayerBullet(this.x, this.y, 0, -9, isHoming)); fired = true; }

            if (fired) this.shootCooldown = 7;
        } else {
            this.shootCooldown--;
        }

        if (this.invulnerableTimer > 0) this.invulnerableTimer--;
    }

    hit() {
        if (this.invulnerableTimer > 0 || isScreenFrozen || isGodMode) return;
        this.lives--;
        this.invulnerableTimer = 60;
        updateUI();

        if (this.lives <= 0) {
            endGame(false);
        }
    }

    draw() {
        if (this.invulnerableTimer % 6 > 3) return;

        ctx.beginPath();
        ctx.arc(this.x, this.y, 11, 0, Math.PI * 2);
        ctx.strokeStyle = isGodMode ? '#ffcc00' : '#00ffff';
        ctx.lineWidth = isGodMode ? 2 : 1;
        ctx.stroke();
        ctx.closePath();

        ctx.beginPath();
        ctx.arc(this.x, this.y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = isGodMode ? '#ffcc00' : '#00ffff';
        ctx.shadowColor = isGodMode ? '#ffcc00' : '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.closePath();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.closePath();

        ctx.shadowBlur = 0;
    }
}

class PlayerBullet {
    constructor(x, y, vx, vy, isHoming = false) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = isHoming ? 4.0 : 3.5;
        this.color = isHoming ? '#00ffff' : '#ffffff';
        this.isHoming = isHoming;
        
        if (currentDifficulty === 'sigma') {
            this.damage = isSigmaTrueForm ? 8.0 : 10.0;
        } else {
            this.damage = currentDifficulty === 'hard' ? 5.0 : (isHoming ? 4.5 : 8.5);
        }

        this.speed = Math.hypot(vx, vy) || 9;
        this.markedForDeletion = false;
    }

    update() {
        if (isScreenFrozen) return;

        if (this.isHoming && boss.hp > 0) {
            const targetAngle = Math.atan2(boss.y - this.y, boss.x - this.x);
            const currentAngle = Math.atan2(this.vy, this.vx);
            let angleDiff = targetAngle - currentAngle;

            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

            const maxTurnRate = 0.045;
            const newAngle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurnRate);
            
            this.vx = Math.cos(newAngle) * this.speed;
            this.vy = Math.sin(newAngle) * this.speed;
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.x < -30 || this.x > canvas.width + 30 || this.y < -30 || this.y > canvas.height + 30) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        if (this.isHoming) {
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 8;
        }
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

class Boss {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 32;
        
        if (currentDifficulty === 'sigma') {
            this.maxHp = 300; // Fase 1 con 300 de HP
        } else {
            this.maxHp = currentDifficulty === 'hard' ? 2420 : 1800;
        }

        this.hp = this.maxHp;
        this.moveDir = 1;
        this.isAttacking = false;
        this.moveWhileAttacking = false;
        this.attackTimer = 180;
        this.sniperTimer = 200; 
        this.currentPatterns = [];
        this.patternStep = 0;
        this.angleOffset = 0;
        this.color = '#ff0055';
        this.isMovingFast = false;
        this.moveTargetX = x;
        this.orbitAngle = 0;
        this.movingToCenter = false;
        this.isDamageReduced = false;
    }

    getPhase() {
        if (currentDifficulty === 'sigma') return 1;
        const hpRatio = this.hp / this.maxHp;
        if (currentDifficulty === 'hard') {
            if (hpRatio <= 0.50) return 3;
            return 1;
        } else {
            if (hpRatio <= 0.35) return 3;
            if (hpRatio <= 0.50) return 2;
            return 1;
        }
    }

    update() {
        if (isScreenFrozen) return;

        if (currentDifficulty === 'sigma' && isSigmaTrueForm && (this.hp / this.maxHp) <= 0.20 && !isUltimateActive) {
            this.movingToCenter = true;
            this.isDamageReduced = true;
        }

        if (this.movingToCenter) {
            const centerX = canvas.width / 2;
            const centerY = 120;
            const dx = centerX - this.x;
            const dy = centerY - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 5) {
                this.x += (dx / dist) * 6;
                this.y += (dy / dist) * 6;
                return;
            } else {
                this.x = centerX;
                this.y = centerY;
                this.movingToCenter = false;
                this.isDamageReduced = false;
                isUltimateActive = true;
            }
        }

        this.attackTimer--;

        if (currentDifficulty === 'sigma' && isSigmaTrueForm) {
            if (this.isMovingFast) {
                const dx = this.moveTargetX - this.x;
                this.x += Math.sign(dx) * 8.5;
                if (Math.abs(dx) < 10) {
                    this.isMovingFast = false;
                }
                return;
            } else if (Math.random() < 0.008 && !this.isAttacking && !isUltimateActive) {
                this.isMovingFast = true;
                this.moveTargetX = 80 + Math.random() * (canvas.width - 160);
                return;
            }
        } else {
            const phase = this.getPhase();
            if (phase === 1 && currentDifficulty !== 'sigma') {
                this.sniperTimer--;
                if (this.sniperTimer <= 0) {
                    this.triggerSnipe();
                    this.sniperTimer = currentDifficulty === 'hard' ? 140 : 220;
                }
            }

            const canMove = phase >= 2 || !this.isAttacking || this.moveWhileAttacking;
            if (canMove) {
                const speedMultiplier = currentDifficulty === 'hard' ? 1.3 : 0.9;
                const currentSpeed = (phase === 3 ? 3.8 : (phase === 2 ? 3.2 : 2.5)) * speedMultiplier;
                this.x += currentSpeed * this.moveDir;
                if (this.x - this.radius < 60) this.moveDir = 1;
                if (this.x + this.radius > canvas.width - 60) this.moveDir = -1;
            }
        }

        if (this.attackTimer <= 0 && !this.isAttacking) {
            this.selectNextPatterns();
            if (currentDifficulty === 'sigma' && isSigmaTrueForm) {
                this.attackTimer = 480;
            } else {
                const cooldownMultiplier = currentDifficulty === 'hard' ? 0.7 : 1.0;
                const phase = this.getPhase();
                this.attackTimer = (phase === 3 ? 130 : (phase === 2 ? 220 : 280)) * cooldownMultiplier;
            }
        }

        if (this.currentPatterns.length > 0) {
            this.isAttacking = true;
            this.currentPatterns.forEach(pattern => this.executePattern(pattern));
        }
    }

    selectNextPatterns() {
        this.patternStep = 0;
        this.moveWhileAttacking = Math.random() < 0.25;
        
        if (currentDifficulty === 'sigma' && isSigmaTrueForm) {
            if (isUltimateActive) {
                this.currentPatterns = ['sigmaUltimate'];
                return;
            }

            let sigmaAttacks = ['sigmaDualSpiral', 'sigmaRandomBurst', 'sigma8FastRings', 'sigmaFastSpiralTriangle', 'sigmaMinionSpirals', 'sigmaFreezingRings'];
            let p1 = sigmaAttacks[Math.floor(Math.random() * sigmaAttacks.length)];
            this.currentPatterns = [p1];
        } else {
            let available = [
                'deliriumChaos', 'flowerSpiral', 'triOppositeSpiral', 
                'pausingRotatingRing', 'lineWavePattern', 'diagonalWallBurst', 
                'pendulumRing', 'doubleCrossRing'
            ];

            let p1 = available[Math.floor(Math.random() * available.length)];
            let p2 = available[Math.floor(Math.random() * available.length)];

            while (p1 === p2) p2 = available[Math.floor(Math.random() * available.length)];

            this.currentPatterns = [p1, p2];
        }
    }

    triggerSnipe() {
        const snipeSpeed = currentDifficulty === 'hard' ? 7.2 : 4.8;
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                if (boss && boss.hp > 0 && gameState === 'PLAYING') {
                    const currentAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
                    bossBullets.push(new Bullet(boss.x, boss.y, Math.cos(currentAngle) * snipeSpeed, Math.sin(currentAngle) * snipeSpeed, 7, '#ffffff'));
                }
            }, i * 100);
        }
    }

    spawnPeriodicSlowRing() {
        const count = 18;
        const baseAngle = Math.random() * Math.PI * 2;
        const ringSpeed = 3.6;
        const rotSpeed = 0.012;

        for (let i = 0; i < count; i++) {
            const angle = baseAngle + (Math.PI * 2 / count) * i;
            bossBullets.push(new RotatingBullet(this.x, this.y, angle, ringSpeed, 10, '#00ffaa', rotSpeed));
        }
    }

    executePattern(type) {
        this.patternStep++;
        
        const sizeMult = currentDifficulty === 'hard' ? 1.2 : 1.0;
        const mainBulletRadius = 6.5 * sizeMult; 
        const microBulletRadius = 4.5 * sizeMult; 
        const phase = this.getPhase();

        if (currentDifficulty === 'sigma' && isSigmaTrueForm) {
            sigmaSlowRingTimer++;
            if (sigmaSlowRingTimer >= 330) {
                this.spawnPeriodicSlowRing();
                sigmaSlowRingTimer = 0;
            }
        }

        // --- ATAQUES MODO SIGMA ---

        if (type === 'sigmaDualSpiral') {
            this.orbitAngle += 0.16;
            const orbitDist = 50;

            const orb1X = this.x + Math.cos(this.orbitAngle) * orbitDist;
            const orb1Y = this.y + Math.sin(this.orbitAngle) * orbitDist;
            const orb2X = this.x + Math.cos(-this.orbitAngle) * orbitDist;
            const orb2Y = this.y + Math.sin(-this.orbitAngle) * orbitDist;

            if (this.patternStep % 2 === 0 && this.patternStep < 320) {
                this.angleOffset += 0.22;
                bossBullets.push(new SlowingBullet(orb1X, orb1Y, Math.cos(this.angleOffset) * 7.5, Math.sin(this.angleOffset) * 7.5, 12, '#00ffff'));
                bossBullets.push(new SlowingBullet(orb2X, orb2Y, Math.cos(-this.angleOffset) * 7.5, Math.sin(-this.angleOffset) * 7.5, 12, '#00ffff'));
            }

            if (this.patternStep % 55 === 0 && this.patternStep < 320) {
                const randomOffsetAngle = Math.random() * Math.PI * 2;
                for (let i = 0; i < 10; i++) {
                    const angle = (Math.PI * 2 / 10) * i + randomOffsetAngle;
                    bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle) * 5.2, Math.sin(angle) * 5.2, 34, '#0088ff'));
                }
            }

            if (this.patternStep % 45 === 0 && this.patternStep < 320) {
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                const triSpeed = 7.5;
                
                bossBullets.push(new Bullet(this.x, this.y, Math.cos(targetAngle) * (triSpeed + 1.2), Math.sin(targetAngle) * (triSpeed + 1.2), 9, '#ffffff'));
                const sideSpread = 0.16;
                bossBullets.push(new Bullet(this.x, this.y, Math.cos(targetAngle + sideSpread) * triSpeed, Math.sin(targetAngle + sideSpread) * triSpeed, 8, '#ffffff'));
                bossBullets.push(new Bullet(this.x, this.y, Math.cos(targetAngle - sideSpread) * triSpeed, Math.sin(targetAngle - sideSpread) * triSpeed, 8, '#ffffff'));
            }

            if (this.patternStep >= 340) {
                this.isAttacking = false;
            }
        }

        if (type === 'sigmaRandomBurst') {
            if (this.patternStep % 15 === 0 && this.patternStep < 250) {
                const count = 8 + Math.floor(Math.random() * 4);
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.2;
                    const r = 16 + Math.random() * 10;
                    bossBullets.push(new SlowingBullet(this.x, this.y, Math.cos(angle) * 6.0, Math.sin(angle) * 6.0, r, '#ffffff'));
                }
            }
            if (this.patternStep >= 270) this.isAttacking = false;
        }

        if (type === 'sigma8FastRings' || type === 'sigma5FastRings') {
            if (this.patternStep % 26 === 0 && this.patternStep <= 250) {
                const count = 28;
                const isTargetWave = (this.patternStep % 78 === 0);

                for (let i = 0; i < count; i++) {
                    const randomAngle = Math.random() * Math.PI * 2;
                    if (isTargetWave) {
                        bossBullets.push(new FrozenHomingBullet(this.x, this.y, randomAngle, 9.5, 12, '#ffee00'));
                    } else {
                        bossBullets.push(new SlowingBullet(this.x, this.y, Math.cos(randomAngle) * 7.2, Math.sin(randomAngle) * 7.2, 16, '#00d8ff'));
                    }
                }
            }
            if (this.patternStep > 270) this.isAttacking = false;
        }

        if (type === 'sigmaFastSpiralTriangle') {
            const stepInCycle = this.patternStep % 60;
            
            if (stepInCycle <= 20 && stepInCycle % 2 === 0 && this.patternStep <= 180) {
                this.angleOffset += 0.35;
                bossBullets.push(new SlowingBullet(this.x, this.y, Math.cos(this.angleOffset) * 7.2, Math.sin(this.angleOffset) * 7.2, 14, '#00ffff'));
            } 
            else if (stepInCycle > 20 && stepInCycle <= 40 && stepInCycle % 2 === 0 && this.patternStep <= 180) {
                this.angleOffset -= 0.35;
                bossBullets.push(new SlowingBullet(this.x, this.y, Math.cos(this.angleOffset) * 7.2, Math.sin(this.angleOffset) * 7.2, 14, '#00ffff'));
            }

            if (this.patternStep > 210) this.isAttacking = false;
        }

        if (type === 'sigmaMinionSpirals') {
            if (this.patternStep === 1) {
                minions = [
                    { x: this.x - 120, y: this.y + 40, angle: 0, fastAngle: 0 },
                    { x: this.x + 120, y: this.y + 40, angle: 0, fastAngle: 0 }
                ];
            }

            if (this.patternStep % 5 === 0 && this.patternStep < 250) {
                minions.forEach(m => {
                    m.angle += 0.15;
                    m.fastAngle += 0.45;

                    bossBullets.push(new SlowingBullet(m.x, m.y, Math.cos(m.angle) * 4.8, Math.sin(m.angle) * 4.8, 15, '#00ffff'));
                    bossBullets.push(new Bullet(m.x, m.y, Math.cos(-m.fastAngle) * 5.2, Math.sin(-m.fastAngle) * 5.2, 6, '#ffffff'));
                });
            }

            if (this.patternStep % 40 === 0 && this.patternStep < 250) {
                const count = 16;
                const offset = Math.random() * Math.PI * 2;
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + offset;
                    bossBullets.push(new SimplePauseBullet(this.x, this.y, angle, 6.0, 14, '#ff0055'));
                }
            }

            if (this.patternStep >= 270) {
                minions = [];
                this.isAttacking = false;
            }
        }

        if (type === 'sigmaFreezingRings') {
            if (this.patternStep % 16 === 0 && this.patternStep <= 220) {
                const count = 18;
                const randomOffset = Math.random() * Math.PI * 2;
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + randomOffset;
                    bossBullets.push(new SideFloatingBullet(this.x, this.y, Math.cos(angle) * 9.5, Math.sin(angle) * 9.5, 16, '#00ffff'));
                }
            }
            if (this.patternStep === 245) {
                triggerScreenShake(20);
                bossBullets.forEach(b => {
                    if (b instanceof SideFloatingBullet) b.freezeAndFloatSide();
                });

                for (let r = 0; r < 2; r++) {
                    setTimeout(() => {
                        if (boss && gameState === 'PLAYING') {
                            const offset = Math.random() * Math.PI * 2;
                            for (let i = 0; i < 6; i++) {
                                const angle = (Math.PI * 2 / 6) * i + offset;
                                bossBullets.push(new Bullet(boss.x, boss.y, Math.cos(angle) * 4.5, Math.sin(angle) * 4.5, 36, '#ff0055'));
                            }
                        }
                    }, r * 280);
                }
            }
            if (this.patternStep > 310) this.isAttacking = false;
        }

        if (type === 'sigmaUltimate') {
            if (this.patternStep % 2 === 0 && this.patternStep < 150) {
                const angle = Math.random() * Math.PI * 2; 
                const speed = 4.0 + Math.random() * 6.5;
                const radius = 6 + Math.random() * 14;

                bossBullets.push(new SlowingBullet(
                    this.x + (Math.random() - 0.5) * 160, 
                    this.y + (Math.random() - 0.5) * 60, 
                    Math.cos(angle) * speed, 
                    Math.sin(angle) * speed, 
                    radius, 
                    '#00ffff'
                ));
            }

            if (this.patternStep === 155) {
                triggerScreenShake(30);
                bossBullets.forEach(b => {
                    b.vx = 0;
                    b.vy = 0;
                    if ('currentSpeed' in b) b.currentSpeed = 0;
                    b.color = '#555555';
                    b.isUltFrozen = true;
                });
            }

            if (this.patternStep >= 170 && (this.patternStep - 170) % 35 === 0 && this.patternStep <= 280) {
                const ringCount = 18;
                const isTargetRing = (this.patternStep === 205 || this.patternStep === 275);
                const targetAngle = isTargetRing ? Math.atan2(player.y - this.y, player.x - this.x) : Math.random() * Math.PI * 2;

                for (let i = 0; i < ringCount; i++) {
                    const angle = (Math.PI * 2 / ringCount) * i + targetAngle;
                    if (isTargetRing) {
                        bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle) * 8.0, Math.sin(angle) * 8.0, 18, '#ffffff'));
                    } else {
                        bossBullets.push(new SlowingBullet(this.x, this.y, Math.cos(angle) * 5.5, Math.sin(angle) * 5.5, 16, '#00d8ff'));
                    }
                }
            }

            if (this.patternStep === 290) {
                triggerScreenShake(20);
                bossBullets.forEach(b => {
                    if (b.isUltFrozen) {
                        b.isUltFrozen = false;
                        const floatAngle = (Math.PI * 0.25) + Math.random() * (Math.PI * 0.5);
                        b.vx = Math.cos(floatAngle) * (0.8 + Math.random() * 0.6);
                        b.vy = Math.sin(floatAngle) * (0.8 + Math.random() * 0.6);
                        b.color = '#00ffff';
                    }
                });
            }

            if (this.patternStep >= 290 && this.patternStep <= 350 && this.patternStep % 2 === 0) {
                this.angleOffset += 0.45; 
                const b = new Bullet(this.x, this.y, Math.cos(this.angleOffset) * 8.0, Math.sin(this.angleOffset) * 8.0, 15, '#ff00aa');
                b.isGlowing = true;
                bossBullets.push(b);
            }

            if (this.patternStep > 350 && this.patternStep <= 410 && this.patternStep % 2 === 0) {
                this.angleOffset -= 0.45;
                const b = new Bullet(this.x, this.y, Math.cos(this.angleOffset) * 8.0, Math.sin(this.angleOffset) * 8.0, 15, '#00ffaa');
                b.isGlowing = true;
                bossBullets.push(b);
            }

            if (this.patternStep > 430) {
                this.isAttacking = false;
            }
        }

        // --- ATAQUES MODO NORMAL / DIFÍCIL ---
        if (type === 'deliriumChaos') {
            if (this.patternStep % 25 === 0 && this.patternStep <= 380) {
                const count = currentDifficulty === 'hard' ? 24 : 16;
                this.angleOffset += 0.25;

                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + this.angleOffset;
                    const baseSpeed = 3.5;
                    const speedVar = 0.7 + Math.random() * 0.6;
                    const radiusVar = 0.8 + Math.random() * 0.5;
                    
                    bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle) * (baseSpeed * speedVar), Math.sin(angle) * (baseSpeed * speedVar), (mainBulletRadius + 1) * radiusVar, '#ffffff'));

                    if (Math.random() < 0.5) {
                        bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle + 0.15) * (baseSpeed * 0.5 / speedVar), Math.sin(angle + 0.15) * (baseSpeed * 0.5 / speedVar), microBulletRadius, '#aaaaaa'));
                    }
                }
            }
            if (this.patternStep > 390) this.isAttacking = false;
        }

        if (type === 'flowerSpiral') {
            if (this.patternStep % 4 === 0 && this.patternStep < 240) {
                this.angleOffset += 0.12;
                const arms = currentDifficulty === 'hard' ? 5 : 4;
                const slowSpeed = 2.5;
                for (let i = 0; i < arms; i++) {
                    const angle = (Math.PI * 2 / arms) * i + this.angleOffset;
                    bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle) * slowSpeed, Math.sin(angle) * slowSpeed, mainBulletRadius, '#ff00aa'));
                    
                    if ((this.patternStep / 4) % 2 === 0) {
                        const oppAngle = (Math.PI * 2 / arms) * i - this.angleOffset * 1.2;
                        bossBullets.push(new Bullet(this.x, this.y, Math.cos(oppAngle) * (slowSpeed * 0.8), Math.sin(oppAngle) * (slowSpeed * 0.8), microBulletRadius, '#ffff00'));
                    }
                }
            }
            if (this.patternStep >= 240) this.isAttacking = false;
        }

        if (type === 'triOppositeSpiral') {
            if (this.patternStep % 4 === 0 && this.patternStep < 250) {
                this.angleOffset += 0.14;
                const bulletSpeed = 2.7;

                for (let i = 0; i < 3; i++) {
                    const baseAngle = -Math.PI / 2 + (Math.PI * 2 / 3) * i;

                    bossBullets.push(new Bullet(this.x, this.y, Math.cos(baseAngle + this.angleOffset) * bulletSpeed, Math.sin(baseAngle + this.angleOffset) * bulletSpeed, mainBulletRadius, '#ff0055'));
                    bossBullets.push(new Bullet(this.x, this.y, Math.cos(baseAngle - this.angleOffset) * bulletSpeed, Math.sin(baseAngle - this.angleOffset) * bulletSpeed, mainBulletRadius, '#ffbb00'));
                }
            }
            if (this.patternStep >= 250) this.isAttacking = false;
        }

        if (type === 'pausingRotatingRing') {
            if (this.patternStep % 35 === 0 && this.patternStep <= 210) {
                const count = currentDifficulty === 'hard' ? 20 : 14;
                const offsetAngle = (this.patternStep / 35) * 0.15;

                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + offsetAngle;
                    bossBullets.push(new SimplePauseBullet(this.x, this.y, angle, 4.2, mainBulletRadius + 1.5, '#00ffaa'));

                    if (phase === 1 && i % 2 === 0) {
                        const midAngle = angle + (Math.PI / count);
                        const curveDirection = (i % 4 === 0) ? 0.012 : -0.012; 
                        bossBullets.push(new ReturnCurvedBullet(this.x, this.y, midAngle, 3.8, microBulletRadius + 1.5, '#00ffff', curveDirection));
                    }
                }
            }
            if (this.patternStep > 220) this.isAttacking = false;
        }

        if (type === 'lineWavePattern') {
            if (this.patternStep % 60 === 0 && this.patternStep <= 180) {
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                
                for (let dir = -1; dir <= 1; dir++) {
                    const angle = targetAngle + (0.22 * dir);
                    const bMax = currentDifficulty === 'hard' ? 5 : 3;
                    for (let b = 1; b <= bMax; b++) {
                        const speed = 2.5 + b * 0.6;
                        bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 8.5 * sizeMult, '#ff5500'));
                    }
                }
            }
            if (this.patternStep > 190) this.isAttacking = false;
        }

        if (type === 'diagonalWallBurst') {
            if (this.patternStep === 1 || this.patternStep === 80) {
                bossBullets.push(new WallBurstBullet(this.x, this.y, -3.8, 4.2, 12.0 * sizeMult, '#ff00ff', 1));
                bossBullets.push(new WallBurstBullet(this.x, this.y, 3.8, 4.2, 12.0 * sizeMult, '#ff00ff', -1));
            }
            if (this.patternStep > 120) this.isAttacking = false;
        }

        if (type === 'pendulumRing') {
            if (this.patternStep % 30 === 0 && this.patternStep <= 210) {
                const count = currentDifficulty === 'hard' ? 28 : 20;
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i;
                    bossBullets.push(new PendulumBullet(this.x, this.y, angle, 2.6, 6.0 * sizeMult, '#ff0266'));
                }
            }
            if (this.patternStep > 220) this.isAttacking = false;
        }

        if (type === 'doubleCrossRing') {
            if (this.patternStep % 30 === 0 && this.patternStep <= 210) {
                const count = currentDifficulty === 'hard' ? 16 : 12;
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i;
                    bossBullets.push(new RotatingBullet(this.x, this.y, angle, 2.4, 6.0 * sizeMult, '#00e5ff', 0.018));
                    bossBullets.push(new RotatingBullet(this.x, this.y, angle, 2.4, 6.0 * sizeMult, '#ffea00', -0.018));
                }
            }
            if (this.patternStep > 220) this.isAttacking = false;
        }
    }

    draw() {
        const phase = this.getPhase();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        const renderColor = isSigmaTrueForm ? '#00ffff' : (phase === 3 ? '#ff0000' : '#ff0055');
        ctx.fillStyle = renderColor;
        ctx.shadowColor = renderColor;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;

        minions.forEach(m => {
            ctx.beginPath();
            ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#0088ff';
            ctx.fill();
            ctx.closePath();
        });
    }
}

// --- CLASES DE BALAS ---
class Bullet {
    constructor(x, y, vx, vy, radius, color) {
        this.x = x;
        this.y = y;
        const speedMult = currentDifficulty === 'hard' ? 1.15 : (currentDifficulty === 'sigma' ? 1.0 : 0.8);
        this.vx = vx * speedMult;
        this.vy = vy * speedMult;
        this.radius = radius;
        this.color = color;
        this.markedForDeletion = false;
        this.isGlowing = false;
    }

    update() {
        if (isScreenFrozen) return;
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < -100 || this.x > canvas.width + 100 || this.y < -100 || this.y > canvas.height + 100) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        
        if (this.isGlowing) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
        }

        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

class SlowingBullet extends Bullet {
    constructor(x, y, vx, vy, radius, color) {
        super(x, y, vx, vy, radius, color);
        this.initialSpeed = Math.hypot(this.vx, this.vy);
        this.currentSpeed = this.initialSpeed;
        this.minSpeed = this.initialSpeed * 0.28;
        this.angle = Math.atan2(this.vy, this.vx);
    }

    update() {
        if (isScreenFrozen) return;

        if (this.currentSpeed > this.minSpeed) {
            this.currentSpeed -= 0.04;
            this.vx = Math.cos(this.angle) * this.currentSpeed;
            this.vy = Math.sin(this.angle) * this.currentSpeed;
        }

        super.update();
    }
}

class FrozenHomingBullet extends SlowingBullet {
    constructor(x, y, angle, speed, radius, color) {
        super(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, radius, color);
        this.timer = 0;
        this.isFrozen = false;
    }

    update() {
        if (isScreenFrozen) return;
        this.timer++;

        if (this.timer === 45) {
            this.isFrozen = true;
            this.vx = 0;
            this.vy = 0;
        } else if (this.timer === 75) {
            this.isFrozen = false;
            const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
            this.vx = Math.cos(targetAngle) * 8.5;
            this.vy = Math.sin(targetAngle) * 8.5;
            this.angle = targetAngle;
            this.currentSpeed = 8.5;
        }

        if (!this.isFrozen) super.update();
    }
}

class SideFloatingBullet extends SlowingBullet {
    constructor(x, y, vx, vy, radius, color) {
        super(x, y, vx, vy, radius, color);
        this.isSideFloating = false;
    }

    freezeAndFloatSide() {
        this.isSideFloating = true;
        this.color = '#888888';
        const targetSide = this.x < canvas.width / 2 ? 1.8 : -1.8;
        this.vx = targetSide;
        this.vy = (Math.random() - 0.5) * 0.3;
    }

    update() {
        if (isScreenFrozen) return;
        if (!this.isSideFloating) {
            super.update();
        } else {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < -50 || this.x > canvas.width + 50) this.markedForDeletion = true;
        }
    }
}

class SimplePauseBullet extends Bullet {
    constructor(x, y, angle, speed, radius, color) {
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        super(x, y, vx, vy, radius, color);
        this.storedVx = this.vx;
        this.storedVy = this.vy;
        this.pauseStart = 28;
        this.pauseEnd = 48;
        this.timer = 0;
    }

    update() {
        if (isScreenFrozen) return;
        this.timer++;

        if (this.timer >= this.pauseStart && this.timer <= this.pauseEnd) {
            this.vx = 0;
            this.vy = 0;
        } else if (this.timer > this.pauseEnd) {
            this.vx = this.storedVx;
            this.vy = this.storedVy;
        }

        super.update();
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

class PendulumBullet extends Bullet {
    constructor(startX, startY, angle, speed, radius, color) {
        super(startX, startY, 0, 0, radius, color);
        this.startX = startX;
        this.startY = startY;
        this.angle = angle;
        this.speed = speed * (currentDifficulty === 'hard' ? 1.15 : 0.8);
        this.dist = 0;
        this.waveTime = 0;
    }

    update() {
        if (isScreenFrozen) return;
        this.dist += this.speed;
        this.waveTime += 0.038;

        const pendulumOffsetX = Math.sin(this.waveTime) * 60;

        this.x = this.startX + pendulumOffsetX + Math.cos(this.angle) * this.dist;
        this.y = this.startY + Math.sin(this.angle) * this.dist;

        if (this.x < -40 || this.x > canvas.width + 40 || this.y < -40 || this.y > canvas.height + 40) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = '#ff0266';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

class RotatingBullet extends Bullet {
    constructor(startX, startY, angle, speed, radius, color, rotSpeed) {
        super(startX, startY, 0, 0, radius, color);
        this.startX = startX;
        this.startY = startY;
        this.angle = angle;
        this.speed = speed * (currentDifficulty === 'hard' ? 1.15 : 0.8);
        this.rotSpeed = rotSpeed;
        this.dist = 0;
    }

    update() {
        if (isScreenFrozen) return;
        this.dist += this.speed;
        this.angle += this.rotSpeed;

        this.x = this.startX + Math.cos(this.angle) * this.dist;
        this.y = this.startY + Math.sin(this.angle) * this.dist;

        if (this.x < -40 || this.x > canvas.width + 40 || this.y < -40 || this.y > canvas.height + 40) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

class ReturnCurvedBullet extends Bullet {
    constructor(x, y, angle, speed, radius, color, curveRate) {
        super(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, radius, color);
        this.angle = angle;
        this.speed = speed * (currentDifficulty === 'hard' ? 1.15 : 0.8);
        this.curveRate = curveRate;
        this.hasReentered = false;
        this.hasBounced = false;
    }

    update() {
        if (isScreenFrozen) return;
        this.angle += this.curveRate;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;

        this.x += this.vx;
        this.y += this.vy;

        const isOutside = (this.x < -10 || this.x > canvas.width + 10 || this.y < -10 || this.y > canvas.height + 10);

        if (isOutside && !this.hasBounced && !this.hasReentered) {
            this.angle += Math.PI; 
            this.curveRate = -this.curveRate; 
            this.hasBounced = true;
        }

        if (!isOutside && this.hasBounced) {
            this.hasReentered = true;
        }

        if (isOutside && this.hasReentered) {
            this.markedForDeletion = true;
        }
    }
}

class WallBurstBullet extends Bullet {
    constructor(x, y, vx, vy, radius, color, wallTargetDir) {
        super(x, y, vx, vy, radius, color);
        this.wallTargetDir = wallTargetDir;
        this.hasExploded = false;
    }

    update() {
        if (isScreenFrozen) return;
        this.x += this.vx;
        this.y += this.vy;

        if (!this.hasExploded && (this.x - this.radius <= 10 || this.x + this.radius >= canvas.width - 10)) {
            this.hasExploded = true;
            this.markedForDeletion = true;

            const burstBullets = currentDifficulty === 'hard' ? 8 : 6;
            const centerAngle = this.x <= canvas.width / 2 ? 0 : Math.PI; 

            for (let i = 0; i < burstBullets; i++) {
                const spreadAngle = centerAngle - (Math.PI / 2) + (Math.PI / (burstBullets - 1)) * i;
                const speed = 3.6;

                bossBullets.push(new Bullet(
                    this.x, this.y,
                    Math.cos(spreadAngle) * speed,
                    Math.sin(spreadAngle) * speed,
                    6.0 * (currentDifficulty === 'hard' ? 1.2 : 1.0),
                    '#ff9900'
                ));
            }
        }

        if (this.y > canvas.height + 30) this.markedForDeletion = true;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

// --- INICIALIZACIÓN Y UI ---
let player;
let boss;
let playerBullets = [];
let bossBullets = [];

function checkCollision(c1, c2) {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    return Math.hypot(dx, dy) < c1.radius + c2.radius;
}

function updateUI() {
    if (!boss || !player) return;

    if (survivalTimer <= 0) {
        const hpPercent = Math.max(0, (boss.hp / boss.maxHp) * 100);
        const hpBar = document.getElementById('hp-bar');
        if (hpBar) hpBar.style.width = `${hpPercent}%`;
        const hpTxt = document.getElementById('hp-text');
        if (hpTxt) hpTxt.innerText = `${Math.ceil(hpPercent)}%`;

        const phaseText = document.getElementById('phase-text');
        if (phaseText && hpBar) {
            if (isSigmaTrueForm) {
                phaseText.innerText = "⚡ MODO SIGMA ⚡";
                phaseText.style.color = "#00ffff";
                hpBar.style.backgroundColor = "#00ffff";
            } else {
                const phase = boss.getPhase();
                if (phase === 3) {
                    phaseText.innerText = "🔥 FASE 3: ¡FRENESÍ!";
                    phaseText.style.color = "#ff0000";
                    hpBar.style.backgroundColor = "#ff0000";
                } else if (phase === 2) {
                    phaseText.innerText = "⚡ FASE 2: TELEDIRIGIDAS";
                    phaseText.style.color = "#ffaa00";
                    hpBar.style.backgroundColor = "#ffaa00";
                } else {
                    phaseText.innerText = "";
                    hpBar.style.backgroundColor = "#00ffff";
                }
            }
        }
    }

    let hearts = '';
    for (let i = 0; i < player.lives; i++) hearts += '❤️';
    const livesUi = document.getElementById('lives-ui');
    if (livesUi) livesUi.innerText = hearts || '💀';
}

function endGame(win, isTroll = false, isSpecialWin = false) {
    gameState = win ? 'WIN' : 'LOSE';
    const screen = document.getElementById('game-overlay');
    const title = document.getElementById('over-title');
    const sub = document.getElementById('over-sub');

    if (survivalInterval) {
        clearInterval(survivalInterval);
        survivalInterval = null;
    }
    survivalTimer = 0;

    if (screen) screen.style.display = 'flex';

    if (!win) {
        secretStep = 0;
    }

    if (currentDifficulty === 'sigma') {
        if (win) {
            if (title) title.innerText = "";
            if (sub) sub.innerHTML = "<span style='font-size: 1.8rem; font-weight: bold; color: #00ffff;'>eres realmente un sigma</span>";
        } else {
            if (title) title.innerText = "";
            if (sub) sub.innerHTML = "<span style='font-size: 1.4rem; font-weight: bold; color: #ff0055;'>no eres lo suficientemente sigma.</span>";
            isSigmaUnlocked = false;
        }
    } else if (isSpecialWin) {
        if (title) title.innerHTML = '<span style="font-size: 1.2rem; font-style: italic; color: #aaaaaa;">oh si</span>';
        if (sub) sub.innerText = "";
    } else if (isTroll) {
        if (title) { title.innerText = "¡GANASTE!"; title.style.color = "#00ffff"; }
        if (sub) sub.innerText = "WOW! eso de verdad fue fácil, ¿qué te parece si subimos el nivel?";
    } else if (win) {
        if (title) { title.innerText = "¡VICTORIA!"; title.style.color = "#00ffff"; }
        
        if (sub) {
            if (currentDifficulty === 'normal') {
                sub.innerHTML = "¡Has derrotado al jefe!<br><br><span style='font-size: 0.9rem; color: #aaaaaa; font-style: italic;'>la dificultad fácil esconde algo detras del *papoi*</span>";
            } else if (currentDifficulty === 'hard') {
                sub.innerHTML = "¡Has derrotado al jefe!<br><br><span style='font-size: 0.9rem; color: #aaaaaa; font-style: italic;'>el contador *sigma*</span>";
            } else {
                sub.innerText = "¡Has derrotado al jefe!";
            }
        }
    } else {
        if (title) { title.innerText = "GAME OVER"; title.style.color = "#ff0055"; }
        if (sub) sub.innerText = "Te has quedado sin vidas.";
    }
}

function restartGame() {
    const overlay = document.getElementById('game-overlay');
    if (overlay) overlay.style.display = 'none';
    player = new Player(canvas.width / 2, canvas.height - 80);
    boss = new Boss(canvas.width / 2, 120);
    playerBullets = [];
    bossBullets = [];
    isSigmaTrueForm = false;
    isScreenFrozen = false;
    isUltimateActive = false;
    isBossImmune = false;
    isGodMode = false;
    minions = [];
    sigmaSlowRingTimer = 0;
    gameState = 'PLAYING';
    
    lastTime = performance.now();
    
    updateUI();
    showBGMNotification('🎵 BGM: Boss Battle');
    requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
    const btnHard = document.querySelectorAll('.btn-diff')[2];
    if (btnHard) {
        btnHard.onmouseenter = () => showDesc(getHardDescription());
    }
});

// --- GAME LOOP CON LIMITADOR A 60 FPS ---
function gameLoop(currentTime) {
    if (gameState !== 'PLAYING') return;

    requestAnimationFrame(gameLoop);

    const elapsed = currentTime - lastTime;
    if (elapsed < fpsInterval) return;

    lastTime = currentTime - (elapsed % fpsInterval);

    ctx.save();

    if (screenShakeTimer > 0) {
        screenShakeTimer--;
        const offsetX = (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 12;
        ctx.translate(offsetX, offsetY);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    player.update();
    player.draw();
    
    if (boss.hp > 0) {
        boss.update();
        boss.draw();
    }

    playerBullets.forEach((b) => {
        b.update();
        b.draw();

        if (boss.hp > 0 && checkCollision(b, boss)) {
            const appliedDamage = boss.isDamageReduced ? b.damage * 0.5 : b.damage;
            
            if (!isBossImmune) {
                boss.hp -= appliedDamage;
            }
            b.markedForDeletion = true;
            updateUI();

            if (boss.hp <= 0 && currentDifficulty === 'sigma' && !isSigmaTrueForm) {
                triggerSigmaTransformation();
            } else if (boss.hp <= 0 && survivalTimer <= 0) {
                endGame(true);
            }
        }
    });

    bossBullets.forEach((b) => {
        b.update();
        b.draw();

        if (checkCollision(b, player)) {
            player.hit();
        }
    });

    playerBullets = playerBullets.filter(b => !b.markedForDeletion);
    bossBullets = bossBullets.filter(b => !b.markedForDeletion);

    ctx.restore();
}
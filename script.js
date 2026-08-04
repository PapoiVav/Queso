const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- TECLADO ---
const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

let gameState = 'MENU';
let currentDifficulty = 'normal';

function showDesc(text) {
    document.getElementById('diff-desc').innerText = text;
}

function selectDifficulty(diff) {
    currentDifficulty = diff;
    document.getElementById('diff-screen').style.display = 'none';

    if (diff === 'easy') {
        endGame(true, true); // Victoria Troll Instantánea
        return;
    }

    restartGame();
}

function openDifficultyMenu() {
    gameState = 'MENU';
    document.getElementById('game-overlay').style.display = 'none';
    document.getElementById('diff-screen').style.display = 'flex';
}

// --- ENTIDADES ---
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 3;
        this.speed = 4.5;
        this.shootCooldown = 0;
        this.maxLives = currentDifficulty === 'hard' ? 4 : 6;
        this.lives = this.maxLives;
        this.invulnerableTimer = 0;
    }

    update() {
        if (keys['a'] && this.x - this.radius > 0) this.x -= this.speed;
        if (keys['d'] && this.x + this.radius < canvas.width) this.x += this.speed;
        if (keys['w'] && this.y - this.radius > 0) this.y -= this.speed;
        if (keys['s'] && this.y + this.radius < canvas.height) this.y += this.speed;

        if (this.shootCooldown <= 0) {
            const isHoming = boss.getPhase() >= 2;
            let fired = false;

            if (keys['arrowup']) {
                playerBullets.push(new PlayerBullet(this.x, this.y, 0, -9, isHoming));
                fired = true;
            }
            if (keys['arrowdown']) {
                playerBullets.push(new PlayerBullet(this.x, this.y, 0, 9, isHoming));
                fired = true;
            }
            if (keys['arrowleft']) {
                playerBullets.push(new PlayerBullet(this.x, this.y, -9, 0, isHoming));
                fired = true;
            }
            if (keys['arrowright']) {
                playerBullets.push(new PlayerBullet(this.x, this.y, 9, 0, isHoming));
                fired = true;
            }
            if (!fired && keys[' ']) {
                playerBullets.push(new PlayerBullet(this.x, this.y, 0, -9, isHoming));
                fired = true;
            }

            if (fired) this.shootCooldown = 7;
        } else {
            this.shootCooldown--;
        }

        if (this.invulnerableTimer > 0) this.invulnerableTimer--;
    }

    hit() {
        if (this.invulnerableTimer > 0) return;
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
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();

        ctx.beginPath();
        ctx.arc(this.x, this.y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
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
        // Daño reducido a 5 en Difícil
        this.damage = currentDifficulty === 'hard' ? 5.0 : (isHoming ? 4.5 : 8.5);
        this.speed = Math.hypot(vx, vy) || 9;
        this.markedForDeletion = false;
    }

    update() {
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
        // Normal 1800 HP (más fácil), Difícil +10% de 2200 (2420 HP)
        this.maxHp = currentDifficulty === 'hard' ? 2420 : 1800;
        this.hp = this.maxHp;

        this.moveDir = 1;
        this.isAttacking = false;
        this.moveWhileAttacking = false;

        this.attackTimer = 180;
        this.sniperTimer = currentDifficulty === 'hard' ? 140 : 250; 
        this.currentPatterns = [];
        this.patternStep = 0;
        this.angleOffset = 0;
    }

    getPhase() {
        const hpRatio = this.hp / this.maxHp;
        
        if (currentDifficulty === 'hard') {
            // En difícil al 50% salta DIRECTO a la Fase 3 (sin Fase 2 teledirigida)
            if (hpRatio <= 0.50) return 3;
            return 1;
        } else {
            // Normal (ligeramente más suave)
            if (hpRatio <= 0.35) return 3;
            if (hpRatio <= 0.50) return 2;
            return 1;
        }
    }

    update() {
        this.attackTimer--;

        const phase = this.getPhase();

        if (phase === 1) {
            this.sniperTimer--;
            if (this.sniperTimer <= 0) {
                this.triggerSnipe();
                this.sniperTimer = currentDifficulty === 'hard' ? 140 : 250;
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

        if (this.attackTimer <= 0) {
            this.selectNextPatterns();
            const cooldownMultiplier = currentDifficulty === 'hard' ? 0.7 : 1.15;
            this.attackTimer = (phase === 3 ? 130 : (phase === 2 ? 220 : 280)) * cooldownMultiplier; 
        }

        if (this.currentPatterns.length > 0) {
            this.isAttacking = true;
            this.currentPatterns.forEach(pattern => this.executePattern(pattern));
        }
    }

    selectNextPatterns() {
        this.patternStep = 0;
        this.moveWhileAttacking = Math.random() < 0.25;
        
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

    triggerSnipe() {
        const snipeSpeed = currentDifficulty === 'hard' ? 7.2 : 5.5;
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                if (boss.hp > 0 && gameState === 'PLAYING') {
                    const currentAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
                    bossBullets.push(new Bullet(boss.x, boss.y, Math.cos(currentAngle) * snipeSpeed, Math.sin(currentAngle) * snipeSpeed, 7, '#ffffff'));
                }
            }, i * 100);
        }
    }

    executePattern(type) {
        this.patternStep++;
        
        // Balas un 20% más grandes en difícil
        const sizeMult = currentDifficulty === 'hard' ? 1.2 : 1.0;
        const mainBulletRadius = 6.5 * sizeMult; 
        const microBulletRadius = 4.5 * sizeMult; 
        const phase = this.getPhase();

        // 1. Delirium
        if (type === 'deliriumChaos') {
            if (this.patternStep % 25 === 0 && this.patternStep <= 380) {
                const count = 24;
                this.angleOffset += 0.25;

                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + this.angleOffset;
                    const baseSpeed = 3.5;
                    const speedVar = 0.7 + Math.random() * 0.6;
                    const radiusVar = 0.8 + Math.random() * 0.5;
                    
                    bossBullets.push(new Bullet(
                        this.x, this.y,
                        Math.cos(angle) * (baseSpeed * speedVar),
                        Math.sin(angle) * (baseSpeed * speedVar),
                        (mainBulletRadius + 1) * radiusVar,
                        '#ffffff'
                    ));

                    if (Math.random() < 0.75) {
                        bossBullets.push(new Bullet(
                            this.x, this.y,
                            Math.cos(angle + 0.15) * (baseSpeed * 0.5 / speedVar),
                            Math.sin(angle + 0.15) * (baseSpeed * 0.5 / speedVar),
                            microBulletRadius,
                            '#aaaaaa'
                        ));
                    }
                }
            }
            if (this.patternStep > 390) this.isAttacking = false;
        }

        // 2. Flor de Espirales
        if (type === 'flowerSpiral') {
            if (this.patternStep % 4 === 0 && this.patternStep < 240) {
                this.angleOffset += 0.12;
                const arms = 5;
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

        // 3. 3 Espirales Opuestas
        if (type === 'triOppositeSpiral') {
            if (this.patternStep % 4 === 0 && this.patternStep < 250) {
                this.angleOffset += 0.14;
                const bulletSpeed = 2.7;

                for (let i = 0; i < 3; i++) {
                    const baseAngle = -Math.PI / 2 + (Math.PI * 2 / 3) * i;

                    bossBullets.push(new Bullet(
                        this.x, this.y,
                        Math.cos(baseAngle + this.angleOffset) * bulletSpeed,
                        Math.sin(baseAngle + this.angleOffset) * bulletSpeed,
                        mainBulletRadius, '#ff0055'
                    ));

                    bossBullets.push(new Bullet(
                        this.x, this.y,
                        Math.cos(baseAngle - this.angleOffset) * bulletSpeed,
                        Math.sin(baseAngle - this.angleOffset) * bulletSpeed,
                        mainBulletRadius, '#ffbb00'
                    ));

                    if ((this.patternStep / 4) % 2 === 0) {
                        bossBullets.push(new Bullet(
                            this.x, this.y,
                            Math.cos(baseAngle - this.angleOffset * 1.3) * (bulletSpeed * 0.8),
                            Math.sin(baseAngle - this.angleOffset * 1.3) * (bulletSpeed * 0.8),
                            microBulletRadius, '#00ffff'
                        ));
                    }
                }
            }
            if (this.patternStep >= 250) this.isAttacking = false;
        }

        // 4. Anillos que frenan
        if (type === 'pausingRotatingRing') {
            if (this.patternStep % 35 === 0 && this.patternStep <= 210) {
                const count = 20;
                const offsetAngle = (this.patternStep / 35) * 0.15;

                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i + offsetAngle;
                    bossBullets.push(new SimplePauseBullet(this.x, this.y, angle, 4.2, mainBulletRadius + 1.5, '#00ffaa'));

                    if (phase === 1 && i % 2 === 0) {
                        const midAngle = angle + (Math.PI / count);
                        const curveDirection = (i % 4 === 0) ? 0.012 : -0.012; 
                        bossBullets.push(new ReturnCurvedBullet(
                            this.x, this.y, midAngle, 3.8, microBulletRadius + 1.5, '#00ffff', curveDirection
                        ));
                    }
                }
            }
            if (this.patternStep > 220) this.isAttacking = false;
        }

        // 5. Ondas apuntadas
        if (type === 'lineWavePattern') {
            if (this.patternStep % 60 === 0 && this.patternStep <= 180) {
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                
                for (let dir = -1; dir <= 1; dir++) {
                    const angle = targetAngle + (0.22 * dir);
                    for (let b = 1; b <= 5; b++) {
                        const speed = 2.5 + b * 0.6;
                        bossBullets.push(new Bullet(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 8.5 * sizeMult, '#ff5500'));
                    }
                }
            }
            if (this.patternStep > 190) this.isAttacking = false;
        }

        // 6. Explotan en pared
        if (type === 'diagonalWallBurst') {
            if (this.patternStep === 1 || this.patternStep === 80) {
                bossBullets.push(new WallBurstBullet(this.x, this.y, -3.8, 4.2, 12.0 * sizeMult, '#ff00ff', 1));
                bossBullets.push(new WallBurstBullet(this.x, this.y, 3.8, 4.2, 12.0 * sizeMult, '#ff00ff', -1));
            }
            if (this.patternStep > 120) this.isAttacking = false;
        }

        // 7. Péndulo
        if (type === 'pendulumRing') {
            if (this.patternStep % 30 === 0 && this.patternStep <= 210) {
                const count = 28;
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 / count) * i;
                    bossBullets.push(new PendulumBullet(
                        this.x, this.y, angle, 2.6, 6.0 * sizeMult, '#ff0266'
                    ));
                }
            }
            if (this.patternStep > 220) this.isAttacking = false;
        }

        // 8. Cruce en X
        if (type === 'doubleCrossRing') {
            if (this.patternStep % 30 === 0 && this.patternStep <= 210) {
                const count = 16;
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
        
        ctx.fillStyle = phase === 3 ? '#ff0000' : (phase === 2 ? '#ffaa00' : '#ff0055');
        ctx.shadowColor = phase === 3 ? '#ff0000' : (phase === 2 ? '#ffaa00' : '#ff0055');
        ctx.shadowBlur = phase === 3 ? 22 : 15;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
}

class Bullet {
    constructor(x, y, vx, vy, radius, color) {
        this.x = x;
        this.y = y;
        // Velocidad un 15% más rápida en difícil
        const speedMult = currentDifficulty === 'hard' ? 1.15 : 0.95;
        this.vx = vx * speedMult;
        this.vy = vy * speedMult;
        this.radius = radius;
        this.color = color;
        this.markedForDeletion = false;
    }

    update() {
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
        ctx.fill();
        ctx.closePath();
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
        this.speed = speed * (currentDifficulty === 'hard' ? 1.15 : 0.95);
        this.dist = 0;
        this.waveTime = 0;
    }

    update() {
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
        this.speed = speed * (currentDifficulty === 'hard' ? 1.15 : 0.95);
        this.rotSpeed = rotSpeed;
        this.dist = 0;
    }

    update() {
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
        this.speed = speed * (currentDifficulty === 'hard' ? 1.15 : 0.95);
        this.curveRate = curveRate;
        this.hasReentered = false;
        this.hasBounced = false;
    }

    update() {
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
        this.x += this.vx;
        this.y += this.vy;

        if (!this.hasExploded && (this.x - this.radius <= 10 || this.x + this.radius >= canvas.width - 10)) {
            this.hasExploded = true;
            this.markedForDeletion = true;

            const burstBullets = 8;
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

// --- INICIALIZACIÓN ---
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
    const hpPercent = Math.max(0, (boss.hp / boss.maxHp) * 100);
    const hpBar = document.getElementById('hp-bar');
    hpBar.style.width = `${hpPercent}%`;
    document.getElementById('hp-text').innerText = `${Math.ceil(hpPercent)}%`;

    let hearts = '';
    for (let i = 0; i < player.lives; i++) hearts += '❤️';
    document.getElementById('lives-ui').innerText = hearts || '💀';
}

function endGame(win, isTroll = false) {
    gameState = win ? 'WIN' : 'LOSE';
    const screen = document.getElementById('game-overlay');
    const title = document.getElementById('over-title');
    const sub = document.getElementById('over-sub');

    screen.style.display = 'flex';

    if (isTroll) {
        title.innerText = "¡GANASTE!";
        title.style.color = "#00ffff";
        sub.innerText = "WOW! eso de verdad fue fácil, ¿qué te parece si subimos el nivel?";
    } else if (win) {
        title.innerText = "¡VICTORIA!";
        title.style.color = "#00ffff";
        sub.innerText = "¡Has derrotado al jefe!";
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "#ff0055";
        sub.innerText = "Te has quedado sin vidas.";
    }
}

function restartGame() {
    document.getElementById('game-overlay').style.display = 'none';
    player = new Player(canvas.width / 2, canvas.height - 80);
    boss = new Boss(canvas.width / 2, 120);
    playerBullets = [];
    bossBullets = [];
    gameState = 'PLAYING';
    updateUI();
    gameLoop();
}

// --- GAME LOOP ---
function gameLoop() {
    if (gameState !== 'PLAYING') return;

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
            boss.hp -= b.damage;
            b.markedForDeletion = true;
            updateUI();

            if (boss.hp <= 0) {
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

    requestAnimationFrame(gameLoop);
}